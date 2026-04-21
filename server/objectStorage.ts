import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import { createReadStream, statSync } from "fs";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// The object storage client is used to interact with the object storage service.
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  // Gets the public object search paths.
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  // Gets the private object directory.
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  // Upload a file to object storage
  async uploadFile(buffer: Buffer, filename: string, contentType: string): Promise<string> {
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      const objectId = randomUUID();
      
      // Sanitize filename: replace spaces with hyphens, preserve Unicode characters
      const sanitizedFilename = filename
        .replace(/\s+/g, '-')           // Replace spaces with hyphens
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-') // Only replace filesystem-unsafe chars
        .replace(/-+/g, '-');            // Collapse multiple hyphens
      
      const fullPath = `${privateObjectDir}/uploads/${objectId}-${sanitizedFilename}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      console.log(`[ObjectStorage] 📤 Starting upload:`);
      console.log(`  - Original filename: ${filename}`);
      console.log(`  - Sanitized filename: ${sanitizedFilename}`);
      console.log(`  - Object ID: ${objectId}`);
      console.log(`  - Full path: ${fullPath}`);
      console.log(`  - Bucket: ${bucketName}`);
      console.log(`  - Object name: ${objectName}`);
      console.log(`  - Buffer size: ${buffer.length} bytes`);
      console.log(`  - Content type: ${contentType}`);

      await file.save(buffer, {
        contentType,
        metadata: {
          cacheControl: "public, max-age=3600",
        },
      });

      // Verify the file was actually saved
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error("File was not saved successfully - exists() returned false");
      }

      const [metadata] = await file.getMetadata();
      console.log(`[ObjectStorage] ✅ Upload verified:`);
      console.log(`  - File exists: ${exists}`);
      console.log(`  - Saved size: ${metadata.size} bytes`);
      console.log(`  - Return path: /objects/${objectId}-${sanitizedFilename}`);

      // Return a public URL
      return `/objects/${objectId}-${sanitizedFilename}`;
    } catch (error) {
      console.error(`[ObjectStorage] ❌ Upload failed for ${filename}:`, error);
      throw error;
    }
  }

  async uploadFileFromPath(filePath: string, filename: string, contentType: string): Promise<string> {
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      const objectId = randomUUID();
      const sanitizedFilename = filename
        .replace(/\s+/g, '-')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
        .replace(/-+/g, '-');
      const fullPath = `${privateObjectDir}/uploads/${objectId}-${sanitizedFilename}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const fileSize = statSync(filePath).size;

      console.log(`[ObjectStorage] 📤 Streaming upload from disk:`);
      console.log(`  - Source: ${filePath}`);
      console.log(`  - Filename: ${sanitizedFilename}`);
      console.log(`  - File size: ${fileSize} bytes (${(fileSize / 1024 / 1024).toFixed(1)}MB)`);

      await new Promise<void>((resolve, reject) => {
        const readStream = createReadStream(filePath);
        const writeStream = file.createWriteStream({
          metadata: {
            contentType,
            cacheControl: "public, max-age=3600",
          },
          resumable: fileSize > 5 * 1024 * 1024,
        });
        readStream.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        readStream.on('error', reject);
      });

      const [exists] = await file.exists();
      if (!exists) {
        throw new Error("File was not saved successfully - exists() returned false");
      }
      const [metadata] = await file.getMetadata();
      console.log(`[ObjectStorage] ✅ Stream upload verified:`);
      console.log(`  - Saved size: ${metadata.size} bytes`);
      console.log(`  - Return path: /objects/${objectId}-${sanitizedFilename}`);

      return `/objects/${objectId}-${sanitizedFilename}`;
    } catch (error) {
      console.error(`[ObjectStorage] ❌ Stream upload failed for ${filename}:`, error);
      throw error;
    }
  }

  // Downloads an object to the response.
  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      // Get file metadata
      const [metadata] = await file.getMetadata();
      const filename = file.name.split('/').pop();
      
      console.log(`[ObjectStorage] 📥 Downloading: ${filename}, size: ${metadata.size} bytes, type: ${metadata.contentType}`);
      
      // Set appropriate headers
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `public, max-age=${cacheTtlSec}`,
      });

      // Stream the file to the response
      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("[ObjectStorage] Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.on("end", () => {
        console.log(`[ObjectStorage] ✓ Download complete: ${filename}`);
      });

      stream.pipe(res);
    } catch (error) {
      console.error("[ObjectStorage] Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // Gets the object entity file from the object path.
  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    // Decode URL-encoded characters (e.g., %E5%A4%AA%E9%99%BD -> 太陽)
    // This handles Japanese/Unicode characters in filenames
    const entityId = decodeURIComponent(parts.slice(1).join("/"));
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}uploads/${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    
    console.log(`[ObjectStorage] Looking for file: ${objectName} in bucket: ${bucketName}`);
    console.log(`[ObjectStorage] Original request path: ${objectPath}`);
    console.log(`[ObjectStorage] Constructed path: ${objectEntityPath}`);
    
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      console.log(`[ObjectStorage] ❌ File not found: ${entityId}`);
      throw new ObjectNotFoundError();
    }
    console.log(`[ObjectStorage] ✅ File found: ${entityId}`);
    return objectFile;
  }

  async listFiles(subfolder: string): Promise<Array<{ name: string; path: string; url: string; size: number; contentType: string }>> {
    try {
      let entityDir = this.getPrivateObjectDir();
      if (!entityDir.endsWith("/")) {
        entityDir = `${entityDir}/`;
      }
      const prefix = `${entityDir}uploads/${subfolder}/`;
      const { bucketName, objectName } = parseObjectPath(prefix);
      const bucket = objectStorageClient.bucket(bucketName);

      const [files] = await bucket.getFiles({ prefix: objectName });
      const results = [];
      for (const file of files) {
        const [metadata] = await file.getMetadata();
        const fileName = file.name.split('/').pop() || file.name;
        const displayName = fileName.replace(/\.[^.]+$/, '');
        results.push({
          name: displayName,
          path: file.name,
          url: `/objects/${subfolder}/${encodeURIComponent(fileName)}`,
          size: Number(metadata.size || 0),
          contentType: String(metadata.contentType || 'application/octet-stream'),
        });
      }
      return results;
    } catch (error) {
      console.error(`[ObjectStorage] Error listing files in ${subfolder}:`, error);
      return [];
    }
  }

  async uploadFileDirect(buffer: Buffer, storagePath: string, contentType: string): Promise<string> {
    try {
      let entityDir = this.getPrivateObjectDir();
      if (!entityDir.endsWith("/")) {
        entityDir = `${entityDir}/`;
      }
      const fullPath = `${entityDir}uploads/${storagePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      await file.save(buffer, {
        contentType,
        metadata: { cacheControl: "public, max-age=31536000" },
      });

      const pathParts = storagePath.split('/');
      const subfolder = pathParts.slice(0, -1).join('/');
      const fileName = pathParts[pathParts.length - 1];
      return `/objects/${storagePath}`;
    } catch (error) {
      console.error(`[ObjectStorage] Upload failed for ${storagePath}:`, error);
      throw error;
    }
  }

  async deleteFile(storagePath: string): Promise<void> {
    try {
      let entityDir = this.getPrivateObjectDir();
      if (!entityDir.endsWith("/")) {
        entityDir = `${entityDir}/`;
      }
      const fullPath = `${entityDir}uploads/${storagePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      await file.delete();
      console.log(`[ObjectStorage] Deleted: ${storagePath}`);
    } catch (error) {
      console.error(`[ObjectStorage] Delete failed for ${storagePath}:`, error);
      throw error;
    }
  }

  // Downloads a file as a buffer from object storage
  async downloadFileAsBuffer(objectPath: string): Promise<Buffer> {
    try {
      const file = await this.getObjectEntityFile(objectPath);
      const [buffer] = await file.download();
      console.log(`[ObjectStorage] ✓ Downloaded as buffer: ${objectPath}, size: ${buffer.length} bytes`);
      return buffer;
    } catch (error) {
      console.error(`[ObjectStorage] ❌ Failed to download as buffer: ${objectPath}`, error);
      throw error;
    }
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}
