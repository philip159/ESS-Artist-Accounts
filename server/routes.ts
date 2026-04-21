import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storagePromise } from "./storage";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { analyzeImage, createLowResVersion } from "./imageProcessor";
import { uploadToDropbox, syncMockupToDropbox } from "./dropboxService";
import { generateAndUploadCOAs, getDefaultLayout, generateSingleCOA } from "./coaGenerator";
import { IntegrationDisconnectedError } from "./errors";
import { checkDropboxHealth } from "./dropboxClient";
import { moveArtworkToCompleted } from "./dropboxService";
import { syncToGoogleSheet } from "./googleSheetsService";
import { generateArtworkMetadataFromFile, generateArtistLaunchPost, type MetadataOptions, type ArtistPostDetails } from "./openaiService";
import { createDraftPosts } from "./postponeService";
import { generateMatrixifyCSV as generateOldCSV } from "./csvExporter";
import { generateMatrixifyCSV } from "./matrixifyExporter";
import { sendArtistConfirmationEmail, sendAdminNotificationEmail, sendBatchSubmissionEmails, sendCollectionLiveEmail, getCollectionLiveEmailPreview, sendContractSignedCreatorEmail, sendContractSignedAdminEmail, type BatchArtworkSummary } from "./emailService";
import { testShopifyConnection, syncProductToShopify, syncBatchToShopify, queryTaxonomyCategory, getShopifyVendors, getARImageReport, testStorefrontAPI, getLocalizedVariantPrices, fetchProductsForMountReview, updateProductHasMount, fetchProductsForMultiRatio, setProductRatioImage, RATIO_METAFIELD_KEYS, fetchProductsListForMediaEditor, fetchProductMedia, batchUpdateMediaAltText, fetchProductsForScanVideos, uploadVideoToShopifyProduct, fetchProductsForProductMedia, fetchProductMediaDetails, uploadImageToShopifyProduct, reorderProductMedia, deleteProductMedia } from "./shopifyService";
import { parsePSD } from "./psdParser";
import { generateFrameGLB, parseSizeToMm, getUVDebugLog, clearUVDebugLog, FrameType, calculateMountBorderMm } from "./arFrameGenerator";
import { insertArtworkSchema, insertTemplateSchema, insertExportBatchSchema, insertVariantConfigSchema, insertFormSettingsSchema, insertArtistAccountSchema, insertCreatorSchema, insertCreatorContractSchema, insertArSizeMappingSchema, artworkMatchesRatio, detectZoneRatio, type FormCopy, type FormTypography, type FormBranding, type Artwork, type PendingMockup, type COALayout } from "@shared/schema";
import fs from "fs";
import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdirSync, createReadStream } from "fs";
import path from "path";
import sharp from "sharp";
import crypto from "crypto";
import { execSync } from "child_process";
import { requireAuth, checkAuth } from "./authMiddleware";
import { requireSupabaseArtistAuth } from "./middleware/artistAuth";
import { supabaseAdmin } from "./supabaseAdmin";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { artworkUploadQueue } from "./uploadQueue";
import { mockupQueue } from "./mockupQueue";
import { logError, getRecentErrors, getErrorStats, clearErrorLogs } from "./errorLogger";
import { generateAllOverlays, generateOverlays, generateQualityTest, generateCanvasSizeTest, getOverlaySizes, getRenderSettings, saveRenderSettings, calculateDims, A_RATIO_SIZES, generateProductMockup, generateAllProductMockups, generateCanvasProductMockups, getMockupReferenceSizes, type RenderSettings, type QualityTestResult, type CanvasSizeTestResult } from "./frameOverlayGenerator";
import { generateArtworkScanVideo, SCAN_VIDEO_VARIANT_DESCRIPTIONS, type ScanVideoVariant } from "./videoGenerator";
import { compositeWithPerspective, type Point } from "./perspectiveTransform";
import { startMonitoring, getCurrentMetrics, getRecentSnapshots, getPerformanceStats, clearSnapshots, trackToolMemory, getToolMemoryStats, clearToolMemoryHistory } from "./performanceMonitor";

// Track artworks currently being synced to prevent duplicates
const syncingArtworks = new Set<string>();

// Simple in-memory cache for AR models (with 30 min TTL and max 15 entries)
// Balance between memory usage and cache hits for iOS Quick Look
const arModelCache = new Map<string, { buffer: Buffer; timestamp: number }>();
const AR_CACHE_TTL = 30 * 60 * 1000; // 30 minutes 
const AR_CACHE_MAX_ENTRIES = 15; // Limit to 15 cached models to prevent memory bloat

// Increment this version to invalidate all cached AR models after fixes
const AR_CACHE_VERSION = 60;  // Added size mappings lookup

// Cache for size mappings (refresh every 5 minutes)
let sizeMappingsCache: { mappings: any[]; timestamp: number } | null = null;
const SIZE_MAPPINGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Resolve size using database mappings first, then fall back to parser
async function resolveSizeToMm(sizeStr: string): Promise<{ width: number; height: number; source: 'mapping' | 'parsed' } | null> {
  // Try to get cached mappings or fetch from database
  const now = Date.now();
  if (!sizeMappingsCache || now - sizeMappingsCache.timestamp > SIZE_MAPPINGS_CACHE_TTL) {
    try {
      const storage = await storagePromise;
      const mappings = await storage.getArSizeMappings();
      sizeMappingsCache = { mappings, timestamp: now };
    } catch (error) {
      console.warn('[AR Size] Failed to fetch size mappings:', error);
    }
  }
  
  // Check database mappings first
  if (sizeMappingsCache?.mappings) {
    const customMapping = sizeMappingsCache.mappings.find(m => {
      if (!m.isActive) return false;
      if (m.matchType === "contains") {
        return sizeStr.toLowerCase().includes(m.websiteSize.toLowerCase());
      }
      // Exact match - compare normalized strings
      return m.websiteSize.toLowerCase() === sizeStr.toLowerCase();
    });
    
    if (customMapping) {
      console.log(`[AR Size] Resolved via mapping: "${sizeStr}" → ${customMapping.widthMm}x${customMapping.heightMm}mm`);
      return { width: customMapping.widthMm, height: customMapping.heightMm, source: 'mapping' };
    }
  }
  
  // Fall back to parser
  const parsed = parseSizeToMm(sizeStr);
  if (parsed) {
    console.log(`[AR Size] Resolved via parser: "${sizeStr}" → ${parsed.width}x${parsed.height}mm`);
    return { ...parsed, source: 'parsed' };
  }
  
  console.warn(`[AR Size] Failed to resolve: "${sizeStr}"`);
  return null;
}

function getArCacheKey(artworkId: string, size: string, frame: string, frameWidth: number | undefined, mount: number, frameType: string = "standard"): string {
  return `v${AR_CACHE_VERSION}:${artworkId}:${size}:${frame}:${frameWidth ?? 'default'}:${mount}:${frameType}`;
}

function cleanupArCache() {
  const now = Date.now();
  // Remove expired entries
  for (const [key, value] of arModelCache.entries()) {
    if (now - value.timestamp > AR_CACHE_TTL) {
      arModelCache.delete(key);
    }
  }
  // Also enforce max entries limit (remove oldest if over limit)
  if (arModelCache.size > AR_CACHE_MAX_ENTRIES) {
    const entries = Array.from(arModelCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, entries.length - AR_CACHE_MAX_ENTRIES);
    for (const [key] of toRemove) {
      arModelCache.delete(key);
    }
  }
}

// Ensure temp upload directory exists
mkdirSync('/tmp/uploads', { recursive: true });

// Configure multer for file uploads - use disk storage to avoid holding large files in memory
const upload = multer({ 
  storage: multer.diskStorage({
    destination: '/tmp/uploads',
    filename: (_req, file, cb) => {
      const uniqueId = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      cb(null, uniqueId + '-' + file.originalname);
    }
  }),
  limits: {
    fileSize: 300 * 1024 * 1024, // 300MB max
  }
});

// Helper: lazily load buffer from disk for disk-stored multer files
function getFileBuffer(file: Express.Multer.File): Buffer {
  if (file.buffer) return file.buffer;
  return readFileSync(file.path);
}

// Helper: clean up disk-stored multer file
function cleanupTempFile(file: Express.Multer.File) {
  try {
    if (file.path && existsSync(file.path)) {
      unlinkSync(file.path);
    }
  } catch {}
}

// Dedicated upload handler for analysis (smaller files for quick preview)
const analyzeUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 300 * 1024 * 1024, // 300MB max
  },
  fileFilter: (req, file, cb) => {
    // Only accept JPG/JPEG files for artwork uploads
    if (file.mimetype === 'image/jpeg') {
      cb(null, true);
    } else {
      cb(new Error('Only JPG/JPEG files are allowed'));
    }
  }
});

async function resolveArtistExclusivity(
  storage: import("./storage").IStorage,
  vendorName: string,
  email: string
): Promise<boolean> {
  try {
    const settings = await storage.getFormSettings();
    if (settings?.nonExclusiveArtists) {
      const nonExclusiveList = settings.nonExclusiveArtists as string[];
      const lowerVendor = vendorName.toLowerCase();
      if (nonExclusiveList.some(name => name.toLowerCase() === lowerVendor)) {
        return false;
      }
    }

    const invitations = await storage.getAllOnboardingInvitations();
    const invitation = invitations.find(
      inv => inv.artistEmail?.toLowerCase() === email.toLowerCase()
    );
    if (invitation && invitation.contractType === "non_exclusive") {
      return false;
    }

    return true;
  } catch (err) {
    console.error("[Exclusivity] Error resolving artist exclusivity, defaulting to exclusive:", err);
    return true;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Wait for storage to initialize
  const storage = await storagePromise;
  const objectStorageService = new ObjectStorageService();

  // Setup Replit Auth for artist dashboard (before other routes)
  await setupAuth(app);
  registerAuthRoutes(app);

  // Run startup health checks
  console.log("[System] Running startup health checks...");
  const dropboxHealth = await checkDropboxHealth();
  if (!dropboxHealth.connected) {
    console.warn("[System] WARNING: Dropbox integration is not connected!");
    console.warn("[System]", dropboxHealth.error);
  } else {
    console.log("[System] All integrations healthy");
  }

  // ========== Static GLB Viewer ==========
  
  app.get("/glb-viewer.html", (req, res) => {
    const htmlPath = path.join(process.cwd(), "public", "glb-viewer.html");
    if (existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(404).send("GLB viewer not found");
    }
  });
  
  app.get("/hanger-position-tool.html", (req, res) => {
    const htmlPath = path.join(process.cwd(), "public", "hanger-position-tool.html");
    if (existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(404).send("Hanger position tool not found");
    }
  });
  
  app.get("/frame-hanger.glb", (req, res) => {
    const glbPath = path.join(process.cwd(), "public", "frame-hanger.glb");
    if (existsSync(glbPath)) {
      res.setHeader("Content-Type", "model/gltf-binary");
      res.sendFile(glbPath);
    } else {
      res.status(404).send("GLB file not found");
    }
  });

  // ========== Authentication API ==========
  
  // Serve server assets (for hanger positioning tool)
  app.get("/server-assets/:filename", (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(process.cwd(), "server/assets", filename);
    if (existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: "Asset not found" });
    }
  });

  app.get("/api/auth/check", checkAuth);
  
  app.post("/api/auth/login", (req, res) => {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }
    
    if (password === process.env.ADMIN_PASSWORD) {
      req.session.isAuthenticated = true;
      // Ensure session is saved before responding
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ error: "Failed to save session" });
        }
        return res.json({ success: true });
      });
    } else {
      res.status(401).json({ error: "Invalid password" });
    }
  });
  
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err: Error | null) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.json({ success: true });
    });
  });

  // ========== Integration Health Checks ==========
  
  // Dropbox connection health check (public - no sensitive data exposed)
  app.get("/api/integrations/dropbox/health", async (req, res) => {
    try {
      const healthStatus = await checkDropboxHealth();
      res.json(healthStatus);
    } catch (error) {
      console.error("Health check endpoint error:", error);
      res.status(500).json({
        connected: false,
        error: "Failed to check Dropbox connection status"
      });
    }
  });

  // Serve uploaded objects
  app.get("/objects/:objectPath(*)", async (req, res) => {
    // Enable CORS for Shopify widget image loading
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    // Aggressive caching for addon images - 1 week
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    
    console.log("[Objects] Request for:", req.path);
    
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res, 604800);
    } catch (error) {
      console.error("[Objects] Error accessing object:", req.path, error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // General file upload endpoint (admin only)
  // Uses key-based folder mapping for security - no client-supplied paths
  const FOLDER_KEY_MAP: Record<string, string> = {
    "creatorHeroImage": ".private/creator-assets",
    "branding": ".private/branding",
    "adminUploads": ".private/admin-uploads"
  };
  const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

  // Create a dedicated multer instance with image type filtering
  const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max for general uploads
    fileFilter: (req, file, cb) => {
      if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only image files (JPEG, PNG, GIF, WebP) are allowed"));
      }
    },
  });

  app.post("/api/upload", requireAuth, (req, res, next) => {
    imageUpload.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  }, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Use key-based folder mapping - only accept predefined keys
      const folderKey = (req.body.folderKey || "adminUploads").toString();
      const targetFolder = FOLDER_KEY_MAP[folderKey];
      
      if (!targetFolder) {
        return res.status(400).json({ error: "Invalid folder key" });
      }

      const timestamp = Date.now();
      const safeFilename = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${targetFolder}/${timestamp}_${safeFilename}`;

      const url = await objectStorageService.uploadFile(
        req.file.buffer,
        storagePath,
        req.file.mimetype
      );

      res.json({ url });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  // ========== Frame Textures API ==========

  app.get("/api/frame-textures", async (_req, res) => {
    try {
      const files = await objectStorageService.listFiles("frame-textures");
      res.json(files);
    } catch (error) {
      console.error("Error listing frame textures:", error);
      res.status(500).json({ error: "Failed to list frame textures" });
    }
  });

  const textureUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only image files (JPEG, PNG, GIF, WebP) are allowed"));
      }
    },
  });

  app.post("/api/frame-textures", requireAuth, (req, res, next) => {
    textureUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  }, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const safeFilename = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `frame-textures/${Date.now()}_${safeFilename}`;
      const url = await objectStorageService.uploadFileDirect(
        req.file.buffer,
        storagePath,
        req.file.mimetype
      );
      res.json({
        name: safeFilename.replace(/\.[^.]+$/, ''),
        url,
        contentType: req.file.mimetype,
        size: req.file.buffer.length,
      });
    } catch (error) {
      console.error("Error uploading frame texture:", error);
      res.status(500).json({ error: "Failed to upload frame texture" });
    }
  });

  app.delete("/api/frame-textures", requireAuth, async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "Missing url" });
      }
      const storagePath = url.replace(/^\/objects\//, '');
      await objectStorageService.deleteFile(storagePath);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting frame texture:", error);
      res.status(500).json({ error: "Failed to delete frame texture" });
    }
  });

  const AR_TEXTURE_SLOTS = [
    { id: "oak_wood", label: "Oak / Natural Wood", filename: "Oak_Veneered_MDF_Final_Texture.jpg", category: "Standard Frame", removable: false },
    { id: "oak_normal", label: "Oak / Natural Normal Map", filename: "oak_normal.png", category: "Standard Frame", removable: true },
    { id: "box_black_texture", label: "Box Frame Black", filename: "box_frame_black_texture.jpg", category: "Box Frame", removable: false },
    { id: "box_black_normal", label: "Box Frame Black Normal", filename: "box_frame_black_normal.png", category: "Box Frame", removable: true },
    { id: "box_black_roughness", label: "Box Frame Black Roughness", filename: "box_frame_black_roughness.jpg", category: "Box Frame", removable: true },
    { id: "box_white_texture", label: "Box Frame White", filename: "box_frame_white_texture.jpg", category: "Box Frame", removable: false },
    { id: "box_white_normal", label: "Box Frame White Normal", filename: "box_frame_white_normal.png", category: "Box Frame", removable: true },
    { id: "box_white_roughness", label: "Box Frame White Roughness", filename: "box_frame_white_roughness.jpg", category: "Box Frame", removable: true },
    { id: "box_ash_texture", label: "Box Frame Ash", filename: "box_frame_ash_texture.jpg", category: "Box Frame", removable: false },
    { id: "box_ash_normal", label: "Box Frame Ash Normal", filename: "box_frame_ash_normal.png", category: "Box Frame", removable: true },
    { id: "box_ash_roughness", label: "Box Frame Ash Roughness", filename: "box_frame_ash_roughness.jpg", category: "Box Frame", removable: true },
    { id: "mdf_texture", label: "MDF Backing", filename: "mdf-texture.jpg", category: "Backing", removable: false },
    { id: "mdf_normal", label: "MDF Normal Map", filename: "mdf-normal.png", category: "Backing", removable: true },
    { id: "mdf_roughness", label: "MDF Roughness", filename: "mdf-roughness.jpg", category: "Backing", removable: true },
    { id: "sticker", label: "Studio Sticker", filename: "east_side_studio_sticker.jpg", category: "Branding", removable: false },
    { id: "kraft_tape", label: "Kraft Tape", filename: "kraft_tape_texture.jpg", category: "Branding", removable: false },
  ];

  app.get("/api/admin/ar-textures", requireAuth, async (_req, res) => {
    try {
      const assetsDir = path.join(process.cwd(), "server/assets");
      const slots = AR_TEXTURE_SLOTS.map((slot) => {
        const filePath = path.join(assetsDir, slot.filename);
        const exists = fs.existsSync(filePath);
        let sizeBytes = 0;
        if (exists) {
          const stat = fs.statSync(filePath);
          sizeBytes = stat.size;
        }
        return { ...slot, exists, sizeBytes };
      });
      res.json(slots);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/ar-textures/:id/preview", requireAuth, async (req, res) => {
    try {
      const slot = AR_TEXTURE_SLOTS.find((s) => s.id === req.params.id);
      if (!slot) return res.status(404).json({ error: "Unknown texture slot" });
      const filePath = path.join(process.cwd(), "server/assets", slot.filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
      const ext = path.extname(slot.filename).toLowerCase();
      const mime = ext === ".png" ? "image/png" : "image/jpeg";
      const buf = fs.readFileSync(filePath);
      const thumbnail = await sharp(buf).resize(300, 300, { fit: "inside" }).toBuffer();
      res.set("Content-Type", mime);
      res.set("Cache-Control", "no-cache");
      res.send(thumbnail);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/ar-textures/:id", requireAuth, upload.single("file"), async (req, res) => {
    try {
      const slot = AR_TEXTURE_SLOTS.find((s) => s.id === req.params.id);
      if (!slot) return res.status(404).json({ error: "Unknown texture slot" });
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const filePath = path.join(process.cwd(), "server/assets", slot.filename);
      fs.writeFileSync(filePath, getFileBuffer(req.file));
      cleanupTempFile(req.file);
      const { textureCache } = await import("./arFrameGenerator.js");
      textureCache.clear();
      const stat = fs.statSync(filePath);
      res.json({ success: true, sizeBytes: stat.size });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/ar-textures/:id", requireAuth, async (req, res) => {
    try {
      const slot = AR_TEXTURE_SLOTS.find((s) => s.id === req.params.id);
      if (!slot) return res.status(404).json({ error: "Unknown texture slot" });
      if (!slot.removable) return res.status(400).json({ error: "This texture cannot be removed" });
      const filePath = path.join(process.cwd(), "server/assets", slot.filename);
      if (fs.existsSync(filePath)) {
        unlinkSync(filePath);
      }
      const { textureCache } = await import("./arFrameGenerator.js");
      textureCache.clear();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/frame-texture-assignments", async (_req, res) => {
    try {
      const { getTextureAssignments } = await import("./frameOverlayGenerator.js");
      const assignments = await getTextureAssignments();
      res.json(assignments);
    } catch (error) {
      console.error("Error getting texture assignments:", error);
      res.status(500).json({ error: "Failed to get texture assignments" });
    }
  });

  app.post("/api/admin/frame-texture-assignments", requireAuth, async (req, res) => {
    try {
      const { finish, textureUrl } = req.body;
      if (!finish || typeof finish !== "string") {
        return res.status(400).json({ error: "Missing finish" });
      }
      const { setTextureAssignment } = await import("./frameOverlayGenerator.js");
      await setTextureAssignment(finish, textureUrl || null);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting texture assignment:", error);
      res.status(500).json({ error: "Failed to set texture assignment" });
    }
  });

  // ========== Artworks API ==========

  // Analyze image without saving (for pre-upload preview)
  app.post("/api/artworks/analyze", analyzeUpload.single("file"), async (req, res) => {
    try {
      const startTime = Date.now();
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileSizeMB = (req.file.size / 1024 / 1024).toFixed(1);
      const isLargeFile = req.file.size > 100 * 1024 * 1024;
      console.log(`[Analyze] Started — file: ${req.file.originalname}, size: ${fileSizeMB}MB${isLargeFile ? ' (large file mode)' : ''}`);

      const analyzeStart = Date.now();
      const analysis = await analyzeImage(req.file.buffer);
      console.log(`[Analyze] Image analysis complete — ${Date.now() - analyzeStart}ms`);
      
      const includeThumbnail = req.query.includeThumbnail === 'true' && !isLargeFile;
      let thumbnailBase64: string | undefined;
      
      if (isLargeFile && req.query.includeThumbnail === 'true') {
        console.log(`[Analyze] Skipping thumbnail for large file (${fileSizeMB}MB) to conserve memory`);
      }
      
      if (includeThumbnail) {
        try {
          const thumbStart = Date.now();
          const { createLowResVersion } = await import("./imageProcessor");
          const thumbnailBuffer = await createLowResVersion(req.file.buffer, 800);
          thumbnailBase64 = `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;
          console.log(`[Analyze] Thumbnail generated — ${Date.now() - thumbStart}ms`);
        } catch (thumbError) {
          console.warn('[Analyze] Failed to generate thumbnail:', thumbError);
        }
      }
      
      console.log(`[Analyze] Complete — total: ${Date.now() - startTime}ms, file: ${fileSizeMB}MB`);
      res.json({
        ...analysis,
        ...(thumbnailBase64 && { thumbnailBase64 })
      });
    } catch (error) {
      console.error("Error analyzing image:", error);
      if (error instanceof Error && error.message === 'Only image files are allowed') {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to analyze image" });
    }
  });

  // Get all artworks (admin only)
  app.get("/api/artworks", requireAuth, async (req, res) => {
    try {
      const artworks = await storage.getAllArtworks();
      res.json(artworks);
    } catch (error) {
      console.error("Error getting artworks:", error);
      res.status(500).json({ error: "Failed to get artworks" });
    }
  });

  // Get single artwork (admin only)
  app.get("/api/artworks/:id", requireAuth, async (req, res) => {
    try {
      const artwork = await storage.getArtwork(req.params.id);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }
      res.json(artwork);
    } catch (error) {
      console.error("Error getting artwork:", error);
      res.status(500).json({ error: "Failed to get artwork" });
    }
  });

  // Download artwork file (admin only)
  app.get("/api/artworks/:id/download", requireAuth, async (req, res) => {
    try {
      const artwork = await storage.getArtwork(req.params.id);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }

      const fileUrl = artwork.originalFileUrl;
      if (!fileUrl) {
        return res.status(404).json({ error: "Artwork file not found" });
      }

      // Fetch the file from object storage
      const response = await fetch(fileUrl);
      if (!response.ok) {
        return res.status(404).json({ error: "Failed to fetch artwork file" });
      }

      // Set headers for download
      const filename = artwork.originalFilename || `${artwork.title}.jpg`;
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");

      // Stream the response to the client
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Error downloading artwork:", error);
      res.status(500).json({ error: "Failed to download artwork" });
    }
  });

  // Secure list of artworks for AR testing (requires token)
  app.get("/api/artworks/public-list", async (req, res) => {
    try {
      // Require access token for security
      const token = req.query.token as string;
      const validToken = process.env.AR_TEST_TOKEN;
      
      if (!validToken) {
        return res.status(503).json({ error: "AR testing not configured" });
      }
      
      if (!token || token !== validToken) {
        return res.status(401).json({ error: "Invalid or missing access token" });
      }
      
      const artworks = await storage.getAllArtworks();
      // Return only essential fields for AR testing - no sensitive data
      const publicList = artworks
        .filter(a => a.lowResFileUrl) // Only artworks with images
        .slice(0, 20) // Limit to 20 for performance
        .map(a => ({
          id: a.id,
          title: a.title,
          artistName: a.artistName,
          lowResFileUrl: a.lowResFileUrl,
          availableSizes: a.availableSizes,
          calculatedSizes: a.calculatedSizes,
        }));
      res.json(publicList);
    } catch (error) {
      console.error("Error getting public artwork list:", error);
      res.status(500).json({ error: "Failed to get artworks" });
    }
  });

  // Public artwork info for AR viewer (limited data exposure)
  app.get("/api/artworks/:id/ar-info", async (req, res) => {
    try {
      const artwork = await storage.getArtwork(req.params.id);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }

      res.json({
        id: artwork.id,
        title: artwork.title,
        artistName: artwork.artistName,
        availableSizes: artwork.availableSizes || artwork.calculatedSizes || [],
        lowResFileUrl: artwork.lowResFileUrl,
      });
    } catch (error) {
      console.error("Error fetching AR info:", error);
      res.status(500).json({ error: "Failed to fetch artwork info" });
    }
  });

  // Generate 3D frame model for AR preview (GLB format)
  app.get("/api/artworks/:id/ar-model", async (req, res) => {
    try {
      cleanupArCache();
      
      const artwork = await storage.getArtwork(req.params.id);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }

      const size = req.query.size as string || (artwork.availableSizes?.[0] || artwork.calculatedSizes?.[0] || "30x40cm");
      const frameStyle = (req.query.frame as "black" | "white" | "oak" | "natural" | "ash") || "black";
      const frameType = (req.query.frameType as FrameType) || "standard";
      const frameWidthMm = req.query.frameWidth ? parseInt(req.query.frameWidth as string) : undefined;

      // Parse size to get frame dimensions for mount calculation
      const parsedForMount = parseSizeToMm(size);
      
      // Mount calculation: if mount=true or mount=1, calculate based on frame size rules
      // If mount=0, no mount. If mount is a specific number, use that.
      // Canvas frames never have mounts
      let mountBorderMm = 0;
      if (frameType !== "canvas") {
        const mountParam = req.query.mount;
        if (mountParam === 'true' || mountParam === '1') {
          mountBorderMm = parsedForMount ? calculateMountBorderMm(parsedForMount.width, parsedForMount.height) : 50;
        } else if (mountParam !== undefined && mountParam !== '0' && mountParam !== 'false') {
          mountBorderMm = parseInt(mountParam as string) || 0;
        }
      }

      const buildLevelParam = req.query.buildLevel ? parseFloat(req.query.buildLevel as string) : 8;
      const cacheKey = getArCacheKey(req.params.id, size, frameStyle, frameWidthMm, mountBorderMm, frameType);
      
      // Skip cache for incremental build testing
      const cached = arModelCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < AR_CACHE_TTL && buildLevelParam === 8) {
        res.setHeader("Content-Type", "model/gltf-binary");
        res.setHeader("Content-Disposition", `inline; filename="${artwork.title}-frame.glb"`);
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.setHeader("X-Cache", "HIT");
        return res.send(cached.buffer);
      }

      const parsed = parseSizeToMm(size);
      if (!parsed) {
        return res.status(400).json({ error: "Invalid size format" });
      }

      // Use low-res file for AR (faster loading, still looks good at wall distance)
      // Fall back to original if low-res not available
      // Convert relative URLs to absolute URLs for server-side fetching
      let textureUrl = artwork.lowResFileUrl || artwork.originalFileUrl || undefined;
      if (textureUrl && textureUrl.startsWith('/')) {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5000';
        textureUrl = `${protocol}://${host}${textureUrl}`;
      }
      
      const skipHanger = req.query.skipHanger === 'true';
      
      const glbBuffer = await trackToolMemory('ARFrameGenerator', 'generateGLB', async () => {
        return await generateFrameGLB({
          artworkWidthMm: parsed.width,
          artworkHeightMm: parsed.height,
          frameWidthMm,
          mountBorderMm,
          frameStyle,
          frameType,
          artworkImageUrl: textureUrl,
          skipHanger,
          buildLevel: buildLevelParam,
        });
      });

      // Clean up old cache entries before adding new one
      cleanupArCache();
      arModelCache.set(cacheKey, { buffer: glbBuffer, timestamp: Date.now() });

      res.setHeader("Content-Type", "model/gltf-binary");
      // Sanitize filename to remove invalid characters for HTTP headers
      const safeTitle = artwork.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      res.setHeader("Content-Disposition", `inline; filename="${safeTitle}-frame.glb"`);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("X-Cache", "MISS");
      res.send(glbBuffer);
    } catch (error) {
      console.error("Error generating AR model:", error);
      res.status(500).json({ error: "Failed to generate AR model" });
    }
  });

  // Debug endpoint for UV mapping
  app.get("/api/debug/uv-log", async (req, res) => {
    const log = getUVDebugLog();
    res.setHeader("Content-Type", "text/plain");
    res.send(log.join("\n"));
  });

  app.post("/api/debug/uv-log/clear", async (req, res) => {
    clearUVDebugLog();
    res.json({ success: true });
  });

  // Serve Shopify AR widget JavaScript
  app.get("/shopify-ar-widget.js", (req, res) => {
    const widgetPath = path.join(process.cwd(), "public/shopify-ar-widget.js");
    if (existsSync(widgetPath)) {
      res.setHeader("Content-Type", "application/javascript");
      // No cache during development for easier testing
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.sendFile(widgetPath);
    } else {
      res.status(404).send("Widget not found");
    }
  });

  // Serve AR cube icon
  app.get("/ar-cube-icon.png", (req, res) => {
    const iconPath = path.join(process.cwd(), "public/ar-cube-icon.png");
    if (existsSync(iconPath)) {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.sendFile(iconPath);
    } else {
      res.status(404).send("Icon not found");
    }
  });

  // Frame demo page
  app.get("/frame-demo.html", (req, res) => {
    const demoPath = path.join(process.cwd(), "public/frame-demo.html");
    if (existsSync(demoPath)) {
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(demoPath);
    } else {
      res.status(404).send("Demo not found");
    }
  });

  // Frame preview test page
  app.get("/frame-preview-test.html", (req, res) => {
    const testPath = path.join(process.cwd(), "public/frame-preview-test.html");
    if (existsSync(testPath)) {
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(testPath);
    } else {
      res.status(404).send("Test page not found");
    }
  });

  // Frame preview widget JS
  app.get("/shopify-frame-preview.js", (req, res) => {
    const widgetPath = path.join(process.cwd(), "public/shopify-frame-preview.js");
    if (existsSync(widgetPath)) {
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.sendFile(widgetPath);
    } else {
      res.status(404).send("Widget not found");
    }
  });

  // Shopify addons widget
  app.get("/shopify-addons-widget.js", (req, res) => {
    const widgetPath = path.join(process.cwd(), "public/shopify-addons-widget.js");
    if (existsSync(widgetPath)) {
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.sendFile(widgetPath);
    } else {
      res.status(404).send("Widget not found");
    }
  });

  // Addons test page
  app.get("/addons-test.html", (req, res) => {
    const testPath = path.join(process.cwd(), "public/addons-test.html");
    if (existsSync(testPath)) {
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(testPath);
    } else {
      res.status(404).send("Test page not found");
    }
  });

  // Shopify addons installation guide
  app.get("/shopify-addons-install.html", (req, res) => {
    const guidePath = path.join(process.cwd(), "public/shopify-addons-install.html");
    if (existsSync(guidePath)) {
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(guidePath);
    } else {
      res.status(404).send("Installation guide not found");
    }
  });

  // iOS USDZ endpoint for direct Quick Look - converts GLB to USDZ format
  // Apple Quick Look requires USDZ files for direct AR viewing
  
  // Handle CORS preflight for USDZ endpoint
  app.options("/api/ar/model.usdz", (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send();
  });
  
  app.get("/api/ar/model.usdz", async (req, res) => {
    try {
      const imageUrl = req.query.imageUrl as string;
      const size = req.query.size as string || "30x40cm";
      const frame = (req.query.frame as "black" | "white" | "oak" | "natural" | "ash") || "black";
      const mount = req.query.mount as string || "0";
      const frameType = (req.query.frameType as "standard" | "box") || "standard";
      const scaleByWidth = req.query.scaleByWidth === '1' || req.query.scaleByWidth === 'true';

      if (!imageUrl) {
        return res.status(400).json({ error: "Missing imageUrl parameter" });
      }

      // Resolve size using mappings first, then parser
      let resolved = await resolveSizeToMm(size);
      if (!resolved) {
        return res.status(400).json({ error: "Invalid size format" });
      }
      let parsed = { width: resolved.width, height: resolved.height };

      // Validate and fetch image
      let parsedImageUrl: URL;
      try {
        let normalizedUrl = imageUrl;
        if (normalizedUrl.startsWith('//')) {
          normalizedUrl = 'https:' + normalizedUrl;
        }
        parsedImageUrl = new URL(normalizedUrl);
      } catch {
        return res.status(400).json({ error: "Invalid image URL format" });
      }

      // Security check for trusted domains (same as generate endpoint)
      const hostname = parsedImageUrl.hostname.toLowerCase();
      const trustedDomains = [
        /\.shopify\.com$/i,
        /\.shopifycdn\.com$/i,
        /cdn\.shopify\.com$/i,
        /\.cloudinary\.com$/i,
        /\.imgix\.net$/i,
        /\.amazonaws\.com$/i,
        /\.storage\.googleapis\.com$/i,
        /\.googleusercontent\.com$/i,
        /picsum\.photos$/i,
        /unsplash\.com$/i,
        /images\.unsplash\.com$/i,
        /\.replit\.dev$/i,
        /\.repl\.co$/i,
        /object\.storage\.replit\.com$/i,
        /eastsidestudiolondon\.co\.uk$/i,
      ];

      if (!trustedDomains.some(pattern => pattern.test(hostname))) {
        return res.status(400).json({ error: "Image URL must be from a trusted CDN" });
      }

      // Fetch image (needed for both scale-by-width calculation and GLB generation)
      const imageResponse = await fetch(parsedImageUrl.toString());
      if (!imageResponse.ok) {
        return res.status(400).json({ error: "Failed to fetch image" });
      }
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

      // Calculate mount BEFORE scale-by-width (mount determines if we scale the frame)
      let mountMm = 0;
      if (mount === 'true' || mount === '1') {
        mountMm = calculateMountBorderMm(parsed.width, parsed.height);
      } else if (mount !== '0' && mount !== 'false') {
        mountMm = parseInt(mount) || 0;
      }

      // Scale-by-width mode: use image's aspect ratio with specified width
      // NOTE: When mountMm > 0, we do NOT scale the frame - the mount means the frame stays at paper size
      // and only the visible artwork aperture inside the mount adapts to the image aspect ratio
      if (scaleByWidth && mountMm === 0) {
        try {
          const sharp = (await import('sharp')).default;
          const metadata = await sharp(imageBuffer).metadata();
          
          if (metadata.width && metadata.height) {
            const imageAspect = metadata.width / metadata.height;
            const adjustedHeight = Math.round(parsed.width / imageAspect);
            console.log(`[AR USDZ] Scale-by-width: image ${metadata.width}x${metadata.height}, frame ${parsed.width}x${adjustedHeight}mm`);
            parsed = { width: parsed.width, height: adjustedHeight };
          }
        } catch (err) {
          console.warn('[AR USDZ] Scale-by-width failed:', err);
        }
      }

      console.log(`[AR USDZ] Generating USDZ: size=${parsed.width}x${parsed.height}mm, frame=${frame}, mount=${mountMm}mm, frameType=${frameType}`);

      // Create cache key from parameters (include actual dimensions for scale-by-width)
      const cacheDir = '/tmp/usdz-cache';
      try {
        mkdirSync(cacheDir, { recursive: true });
      } catch (e) {}
      
      const sizeKey = scaleByWidth ? `${parsed.width}x${parsed.height}mm` : size;
      const cacheKey = crypto.createHash('md5')
        .update(`${imageUrl}|${sizeKey}|${frame}|${mount}|${frameType}|sbw${scaleByWidth ? '1' : '0'}`)
        .digest('hex');
      const cachedUsdzPath = path.join(cacheDir, `${cacheKey}.usdz`);
      
      // Set CORS headers for cross-origin access from Shopify
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      // Check cache first
      if (existsSync(cachedUsdzPath)) {
        console.log(`[AR USDZ] Serving cached USDZ: ${cacheKey}`);
        const cachedBuffer = readFileSync(cachedUsdzPath);
        res.setHeader('Content-Type', 'model/vnd.usdz+zip');
        res.setHeader('Content-Disposition', 'inline; filename="artwork.usdz"');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Cache', 'HIT');
        return res.send(cachedBuffer);
      }
      
      console.log(`[AR USDZ] Generating new USDZ: ${cacheKey}`);

      // Generate GLB first - pass the URL so arFrameGenerator can load the image
      const glbBuffer = await trackToolMemory('ARFrameGenerator', 'generateUSDZ', async () => {
        return await generateFrameGLB({
          artworkWidthMm: parsed.width,
          artworkHeightMm: parsed.height,
          mountBorderMm: mountMm,
          frameStyle: frame,
          frameType: frameType,
          artworkImageUrl: parsedImageUrl.toString(),
        });
      });

      // Convert GLB to USDZ using Blender
      const tempDir = '/tmp/usdz-conversion';
      try {
        mkdirSync(tempDir, { recursive: true });
      } catch (e) {}
      
      const tempId = crypto.randomBytes(8).toString('hex');
      const glbPath = path.join(tempDir, `${tempId}.glb`);
      const usdzPath = path.join(tempDir, `${tempId}.usdz`);
      
      try {
        // Write GLB to temp file
        writeFileSync(glbPath, glbBuffer);
        
        // Convert using Blender
        const scriptPath = path.join(process.cwd(), 'server', 'glbToUsdz.py');
        const blenderCmd = `blender --background --python "${scriptPath}" -- "${glbPath}" "${usdzPath}" 2>&1`;
        
        console.log(`[AR USDZ] Running Blender conversion...`);
        execSync(blenderCmd, { timeout: 60000 });
        
        // Check if USDZ was created
        if (!existsSync(usdzPath)) {
          throw new Error('USDZ file was not created');
        }
        
        // Read and serve the USDZ file
        const usdzBuffer = readFileSync(usdzPath);
        
        // Save to cache for future requests
        try {
          writeFileSync(cachedUsdzPath, usdzBuffer);
          console.log(`[AR USDZ] Cached USDZ: ${cacheKey}`);
        } catch (cacheError) {
          console.error('[AR USDZ] Failed to cache:', cacheError);
        }
        
        // Cleanup temp files
        try { unlinkSync(glbPath); } catch (e) {}
        try { unlinkSync(usdzPath); } catch (e) {}
        
        // Serve the USDZ file with correct headers for iOS Quick Look
        res.setHeader('Content-Type', 'model/vnd.usdz+zip');
        res.setHeader('Content-Disposition', 'inline; filename="artwork.usdz"');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Cache', 'MISS');
        res.send(usdzBuffer);
        
      } catch (conversionError) {
        console.error('[AR USDZ] Blender conversion failed:', conversionError);
        // Cleanup on error
        try { unlinkSync(glbPath); } catch (e) {}
        try { unlinkSync(usdzPath); } catch (e) {}
        
        // Fallback to redirect
        const launchUrl = `/api/ar/launch?imageUrl=${encodeURIComponent(imageUrl)}&size=${encodeURIComponent(size)}&frame=${frame}&mount=${mount}&frameType=${frameType}`;
        res.redirect(302, launchUrl);
      }
    } catch (error) {
      console.error("[AR USDZ] Error:", error);
      res.status(500).json({ error: "Failed to generate USDZ model" });
    }
  });

  // Public AR model endpoint for Shopify integration
  // Accepts image URL directly instead of requiring internal artwork ID
  app.get("/api/ar/generate", async (req, res) => {
    console.log(`[AR Generate] Request received - imageUrl: ${req.query.imageUrl}`);
    try {
      // Enable CORS for Shopify domains
      const origin = req.headers.origin || '';
      const allowedOrigins = [
        /\.myshopify\.com$/,
        /\.shopify\.com$/,
        /eastsidestudiolondon\.co\.uk$/,
        /localhost/,
        /127\.0\.0\.1/,
        /\.replit\.dev$/,
        /\.repl\.co$/,
      ];
      
      if (allowedOrigins.some(pattern => pattern.test(origin))) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
      } else {
        res.setHeader("Access-Control-Allow-Origin", "*");
      }
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        return res.status(200).end();
      }

      let imageUrl = req.query.imageUrl as string;
      const size = req.query.size as string || "30x40cm";
      const frame = (req.query.frame as "black" | "white" | "oak" | "natural" | "ash") || "natural";
      // Only use frameWidth if explicitly provided, otherwise let generator use defaults for frame type
      const frameWidthParam = req.query.frameWidth as string;
      const frameWidth = frameWidthParam ? parseInt(frameWidthParam) : undefined;
      const frameType = (req.query.frameType as "standard" | "box") || "standard";
      const buildLevel = req.query.buildLevel ? parseFloat(req.query.buildLevel as string) : 8;
      // Scale-by-width mode: use image's aspect ratio with specified width
      const scaleByWidth = req.query.scaleByWidth === '1' || req.query.scaleByWidth === 'true';
      
      // Resolve size using mappings first, then parser (for mount calculation)
      let parsedSize = await resolveSizeToMm(size);
      
      // Mount calculation: if mount=true or mount=1, calculate based on frame size rules
      // If mount=0 or not specified, no mount. If mount is a specific number, use that.
      let mount = 0;
      const mountParam = req.query.mount;
      if (mountParam === 'true' || mountParam === '1') {
        mount = parsedSize ? calculateMountBorderMm(parsedSize.width, parsedSize.height) : 50;
      } else if (mountParam !== undefined && mountParam !== '0' && mountParam !== 'false') {
        mount = parseInt(mountParam as string) || 0;
      }

      if (!imageUrl) {
        return res.status(400).json({ error: "imageUrl parameter is required" });
      }
      
      // Handle protocol-relative URLs (//cdn.shopify.com/...)
      if (imageUrl.startsWith('//')) {
        imageUrl = 'https:' + imageUrl;
      }

      // Security: Validate imageUrl to prevent SSRF attacks
      let parsedImageUrl: URL;
      try {
        parsedImageUrl = new URL(imageUrl);
      } catch {
        return res.status(400).json({ error: "Invalid image URL format" });
      }

      // Only allow HTTPS (and HTTP for development/localhost)
      if (!['https:', 'http:'].includes(parsedImageUrl.protocol)) {
        return res.status(400).json({ error: "Only HTTPS URLs are allowed" });
      }

      // Block private IP ranges to prevent SSRF
      const hostname = parsedImageUrl.hostname.toLowerCase();
      const privatePatterns = [
        /^localhost$/i,
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^0\./,
        /^::1$/,
        /^fc00:/i,
        /^fe80:/i,
        /\.local$/i,
        /\.internal$/i,
      ];

      // Allow localhost in development only
      const isDev = process.env.NODE_ENV === 'development';
      if (!isDev && privatePatterns.some(pattern => pattern.test(hostname))) {
        return res.status(400).json({ error: "Private/internal URLs are not allowed" });
      }

      // Allowlist of trusted image CDN domains
      const trustedDomains = [
        /\.shopify\.com$/i,
        /\.shopifycdn\.com$/i,
        /cdn\.shopify\.com$/i,
        /\.cloudinary\.com$/i,
        /\.imgix\.net$/i,
        /\.amazonaws\.com$/i,
        /\.storage\.googleapis\.com$/i,
        /\.googleusercontent\.com$/i,
        /picsum\.photos$/i,
        /unsplash\.com$/i,
        /images\.unsplash\.com$/i,
        /\.replit\.dev$/i,
        /\.repl\.co$/i,
        /object\.storage\.replit\.com$/i,
        /eastsidestudiolondon\.co\.uk$/i,
      ];

      if (!trustedDomains.some(pattern => pattern.test(hostname))) {
        console.warn(`[AR Public] Blocked untrusted domain: ${hostname}`);
        return res.status(400).json({ 
          error: "Image URL must be from a trusted CDN (Shopify, Cloudinary, AWS, GCS, Unsplash, or Replit)" 
        });
      }

      // Resolve size using mappings first, then parser
      let resolved = await resolveSizeToMm(size);
      if (!resolved) {
        return res.status(400).json({ error: "Invalid size format. Use format like '30x40cm' or '12x16in'" });
      }
      let parsed = { width: resolved.width, height: resolved.height };

      // Scale-by-width mode: fetch image to get its aspect ratio, then adjust height
      // NOTE: When mount > 0, we do NOT scale the frame - the mount means the frame stays at paper size
      // and only the visible artwork aperture inside the mount adapts to the image aspect ratio
      if (scaleByWidth && imageUrl && mount === 0) {
        try {
          const response = await fetch(imageUrl);
          if (response.ok) {
            const imageBuffer = Buffer.from(await response.arrayBuffer());
            const sharp = (await import('sharp')).default;
            const metadata = await sharp(imageBuffer).metadata();
            
            if (metadata.width && metadata.height) {
              const imageAspect = metadata.width / metadata.height;
              // Use the width from parsed size, calculate height from image aspect ratio
              const adjustedHeight = Math.round(parsed.width / imageAspect);
              console.log(`[AR] Scale-by-width: image ${metadata.width}x${metadata.height} (aspect ${imageAspect.toFixed(3)}), frame ${parsed.width}x${adjustedHeight}mm (was ${parsed.width}x${parsed.height}mm)`);
              parsed = { width: parsed.width, height: adjustedHeight };
              
              // Recalculate mount for new dimensions (all mount modes)
              if (mountParam === 'true' || mountParam === '1') {
                mount = calculateMountBorderMm(parsed.width, parsed.height);
              } else if (mountParam !== undefined && mountParam !== '0' && mountParam !== 'false') {
                // Keep explicit numeric mount, but log if dimensions changed significantly
                const originalMountCalc = parsedSize ? calculateMountBorderMm(parsedSize.width, parsedSize.height) : 0;
                const newMountCalc = calculateMountBorderMm(parsed.width, parsed.height);
                if (Math.abs(originalMountCalc - newMountCalc) > 5) {
                  console.log(`[AR] Scale-by-width: mount recommendation changed from ${originalMountCalc}mm to ${newMountCalc}mm`);
                }
              }
            }
          }
        } catch (err) {
          console.warn('[AR] Scale-by-width: Failed to fetch image dimensions, using original size:', err);
        }
      }

      // Generate cache key based on parameters (use 'auto' for frameWidth if not specified)
      // Include actual parsed dimensions in cache key when scaleByWidth is used
      const urlHash = Buffer.from(imageUrl).toString('base64').slice(0, 32);
      const sizeKey = scaleByWidth ? `${parsed.width}x${parsed.height}mm` : size;
      const cacheKey = `public-v${AR_CACHE_VERSION}:${urlHash}:${sizeKey}:${frame}:${frameWidth || 'auto'}:${mount}:${frameType}:sbw${scaleByWidth ? '1' : '0'}`;
      
      // Check cache (skip for incremental build testing when buildLevel < 6)
      const cached = arModelCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < AR_CACHE_TTL && buildLevel >= 6) {
        console.log(`[AR Public] CACHE HIT: ${cacheKey.substring(0, 50)}...`);
        res.setHeader("Content-Type", "model/gltf-binary");
        res.setHeader("Content-Disposition", `inline; filename="artwork-frame.glb"`);
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.setHeader("X-Cache", "HIT");
        return res.send(cached.buffer);
      }
      console.log(`[AR Public] CACHE MISS: ${cacheKey.substring(0, 50)}...`);

      const startTime = Date.now();
      console.log(`[AR Public] Generating model: size=${size}, frame=${frame}, frameType=${frameType}, mount=${mount}mm, frameWidth=${frameWidth ?? 'auto'}, buildLevel=${buildLevel}, imageUrl=${imageUrl.substring(0, 50)}...`);

      const glbBuffer = await generateFrameGLB({
        artworkWidthMm: parsed.width,
        artworkHeightMm: parsed.height,
        ...(frameWidth !== undefined && { frameWidthMm: frameWidth }),
        mountBorderMm: mount,
        frameStyle: frame,
        frameType: frameType,
        artworkImageUrl: imageUrl,
        buildLevel,
      });

      const genTime = Date.now() - startTime;
      console.log(`[AR Public] Model generated in ${genTime}ms, size: ${(glbBuffer.length / 1024).toFixed(1)}KB`);

      // Clean up old cache entries before adding new one
      cleanupArCache();
      arModelCache.set(cacheKey, { buffer: glbBuffer, timestamp: Date.now() });

      res.setHeader("Content-Type", "model/gltf-binary");
      res.setHeader("Content-Disposition", `inline; filename="artwork-frame.glb"`);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("X-Cache", "MISS");
      res.setHeader("X-Generation-Time", genTime.toString());
      res.send(glbBuffer);
    } catch (error) {
      console.error("Error generating public AR model:", error);
      res.status(500).json({ error: "Failed to generate AR model" });
    }
  });

  // Simple AR test page - works without artwork data
  app.get("/ar-build-test", (req, res) => {
    const buildLevel = req.query.buildLevel || "8";
    const size = req.query.size || "30x40cm";
    const frame = req.query.frame || "black";
    const frameType = req.query.frameType || "standard";
    const mount = req.query.mount || "50";
    
    const timestamp = Date.now();
    const glbUrl = `/api/ar/generate?imageUrl=${encodeURIComponent('https://picsum.photos/800/1000')}&size=${size}&frame=${frame}&frameType=${frameType}&mount=${mount}&buildLevel=${buildLevel}&_t=${timestamp}`;
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AR Build Test - Level ${buildLevel}</title>
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.3.0/model-viewer.min.js"></script>
  <style>
    body { margin: 0; padding: 20px; font-family: system-ui, sans-serif; background: #1a1a1a; color: white; }
    h1 { font-size: 1.5rem; margin-bottom: 10px; }
    .info { background: #333; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    .info p { margin: 5px 0; }
    model-viewer { width: 100%; height: 60vh; background: #2a2a2a; border-radius: 8px; }
    .controls { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 20px; }
    .controls a { 
      padding: 12px 20px; 
      background: #4a4a4a; 
      color: white; 
      text-decoration: none; 
      border-radius: 6px; 
      font-weight: 500;
    }
    .controls a.active { background: #0066cc; }
    .ar-button {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 15px 30px;
      background: #0066cc;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <h1>AR Build Test - Level ${buildLevel}</h1>
  <div class="info">
    <p><strong>Size:</strong> ${size} | <strong>Frame:</strong> ${frame} | <strong>Type:</strong> ${frameType} | <strong>Mount:</strong> ${mount}mm</p>
    <p><strong>Build Levels:</strong></p>
    <p>1 = Frame shell | 2 = +Artwork | 3 = +Mount | 5 = +Backing | 6 = +Tape | 7 = +Hangers | 8 = +Logo</p>
  </div>
  
  <model-viewer
    src="${glbUrl}"
    ar
    ar-modes="webxr scene-viewer quick-look"
    ar-scale="fixed"
    camera-controls
    shadow-intensity="1"
    exposure="0.8"
    alt="Frame test model"
  >
    <button slot="ar-button" class="ar-button">View in AR</button>
  </model-viewer>
  
  <div class="controls">
    <a href="?buildLevel=1&size=${size}&frame=${frame}&frameType=${frameType}&mount=${mount}" class="${buildLevel == '1' ? 'active' : ''}">Level 1</a>
    <a href="?buildLevel=2&size=${size}&frame=${frame}&frameType=${frameType}&mount=${mount}" class="${buildLevel == '2' ? 'active' : ''}">Level 2</a>
    <a href="?buildLevel=3&size=${size}&frame=${frame}&frameType=${frameType}&mount=${mount}" class="${buildLevel == '3' ? 'active' : ''}">Level 3</a>
    <a href="?buildLevel=4&size=${size}&frame=${frame}&frameType=${frameType}&mount=${mount}" class="${buildLevel == '4' ? 'active' : ''}">Level 4</a>
    <a href="?buildLevel=5&size=${size}&frame=${frame}&frameType=${frameType}&mount=${mount}" class="${buildLevel == '5' ? 'active' : ''}">Level 5</a>
    <a href="?buildLevel=6&size=${size}&frame=${frame}&frameType=${frameType}&mount=${mount}" class="${buildLevel == '6' ? 'active' : ''}">Level 6</a>
    <a href="?buildLevel=7&size=${size}&frame=${frame}&frameType=${frameType}&mount=${mount}" class="${buildLevel == '7' ? 'active' : ''}">Level 7</a>
    <a href="?buildLevel=8&size=${size}&frame=${frame}&frameType=${frameType}&mount=${mount}" class="${buildLevel == '8' ? 'active' : ''}">Level 8</a>
  </div>
  
  <div class="controls" style="margin-top: 10px;">
    <a href="?buildLevel=${buildLevel}&size=${size}&frame=${frame}&frameType=${frameType}&mount=50" class="${mount == '50' ? 'active' : ''}">With Mount (50mm)</a>
    <a href="?buildLevel=${buildLevel}&size=${size}&frame=${frame}&frameType=${frameType}&mount=0" class="${mount == '0' ? 'active' : ''}">No Mount</a>
  </div>
</body>
</html>`;
    
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  });

  // Test hanger positioning endpoint - allows real-time adjustment of hanger rotation/position
  app.get("/api/ar/test-hanger", async (req, res) => {
    try {
      const size = req.query.size as string || "A3";
      const frame = (req.query.frame as "black" | "white" | "oak" | "natural" | "ash") || "black";
      const frameType = (req.query.frameType as "standard" | "box") || "standard";
      
      // Hanger positioning parameters (in degrees and mm)
      const hangerRotX = parseFloat(req.query.hangerRotX as string) || 0;
      const hangerRotY = parseFloat(req.query.hangerRotY as string) || -100;
      const hangerRotZ = parseFloat(req.query.hangerRotZ as string) || 180;
      const hangerPosX = parseFloat(req.query.hangerPosX as string) || 0;
      const hangerPosY = parseFloat(req.query.hangerPosY as string) || 50;
      const hangerPosZ = parseFloat(req.query.hangerPosZ as string) || -14;

      const parsed = parseSizeToMm(size);
      
      // Mount calculation: if mount=true or mount=1, calculate based on frame size rules
      let mount = 0;
      const mountParam = req.query.mount;
      if (mountParam === 'true' || mountParam === '1') {
        mount = parsed ? calculateMountBorderMm(parsed.width, parsed.height) : 50;
      } else if (mountParam !== undefined && mountParam !== '0' && mountParam !== 'false') {
        mount = parseInt(mountParam as string) || 0;
      }
      if (!parsed) {
        return res.status(400).json({ error: "Invalid size format" });
      }

      console.log(`[AR Test Hanger] rotX=${hangerRotX}, rotY=${hangerRotY}, rotZ=${hangerRotZ}, posX=${hangerPosX}, posY=${hangerPosY}, posZ=${hangerPosZ}`);

      const glbBuffer = await generateFrameGLB({
        artworkWidthMm: parsed.width,
        artworkHeightMm: parsed.height,
        mountBorderMm: mount,
        frameStyle: frame,
        frameType: frameType,
        hangerRotX,
        hangerRotY,
        hangerRotZ,
        hangerPosX,
        hangerPosY,
        hangerPosZ,
      });

      res.setHeader("Content-Type", "model/gltf-binary");
      res.setHeader("Content-Disposition", `inline; filename="test-hanger.glb"`);
      res.setHeader("Cache-Control", "no-cache");
      res.send(glbBuffer);
    } catch (error) {
      console.error("Error generating test hanger model:", error);
      res.status(500).json({ error: "Failed to generate test model" });
    }
  });

  // Lightweight AR launch page - serves minimal HTML for instant AR on mobile
  // This bypasses the React app for faster loading
  app.get("/api/ar/launch", async (req, res) => {
    const imageUrl = req.query.imageUrl as string;
    const size = req.query.size as string || "30x40cm";
    const frame = req.query.frame as string || "black";
    const title = req.query.title as string || "Artwork";
    const mount = req.query.mount as string || "0";
    const frameType = req.query.frameType as string || "standard";

    if (!imageUrl) {
      return res.status(400).send("Missing imageUrl parameter");
    }

    // Build the model URL
    const modelUrl = `/api/ar/generate?imageUrl=${encodeURIComponent(imageUrl)}&size=${encodeURIComponent(size)}&frame=${encodeURIComponent(frame)}&mount=${mount}&frameType=${frameType}`;

    // Minimal HTML page with model-viewer that auto-triggers AR
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - AR View</title>
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.3.0/model-viewer.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      background: white;
      padding: 12px 16px;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .title { font-size: 16px; font-weight: 500; }
    .ar-btn {
      background: #000;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }
    .viewer-container {
      flex: 1;
      position: relative;
      background: #e8e8e8;
    }
    model-viewer {
      width: 100%;
      height: 100%;
      position: absolute;
      inset: 0;
    }
    .loading {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f5f5f5;
      z-index: 10;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #ddd;
      border-top-color: #333;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="header">
    <span class="title">${title}</span>
    <button class="ar-btn" id="arBtn">View in AR</button>
  </div>
  <div class="viewer-container">
    <div class="loading" id="loading">
      <div class="spinner"></div>
    </div>
    <model-viewer
      id="viewer"
      src="${modelUrl}"
      ar
      ar-modes="webxr scene-viewer quick-look"
      ar-scale="fixed"
      ar-placement="wall"
      camera-controls
      auto-rotate
      shadow-intensity="1"
      camera-orbit="0deg 75deg 2m"
    ></model-viewer>
  </div>
  <script>
    const viewer = document.getElementById('viewer');
    const loading = document.getElementById('loading');
    const arBtn = document.getElementById('arBtn');
    let arTriggered = false;
    
    // Try to trigger AR early - even before model loads
    // This should show the "Google Play Services for AR required" prompt on Android
    function tryActivateAR() {
      if (arTriggered) return;
      arTriggered = true;
      try {
        viewer.activateAR();
      } catch (e) {
        console.log('AR activation deferred until model loads');
        arTriggered = false; // Allow retry after load
      }
    }
    
    // On Android, try AR immediately when model-viewer is ready
    const isMobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent);
    const isAndroid = /android/i.test(navigator.userAgent);
    
    if (isAndroid) {
      // Try AR as soon as possible on Android
      viewer.addEventListener('ar-status', (e) => {
        console.log('AR status:', e.detail.status);
      });
      // Trigger on first progress event
      viewer.addEventListener('progress', (e) => {
        if (!arTriggered && e.detail.totalProgress > 0) {
          setTimeout(tryActivateAR, 100);
        }
      });
    }
    
    viewer.addEventListener('load', () => {
      loading.classList.add('hidden');
      // Auto-trigger AR on mobile after load
      if (isMobile && !arTriggered) {
        setTimeout(tryActivateAR, 300);
      }
    });
    
    arBtn.addEventListener('click', () => {
      arTriggered = false; // Reset so button always works
      viewer.activateAR();
    });
    
    // Fallback: hide loading after 15 seconds
    setTimeout(() => loading.classList.add('hidden'), 15000);
  </script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  });

  // Helper to set CORS for Shopify domains
  const setShopifyCors = (req: any, res: any) => {
    const origin = req.headers.origin || '';
    const allowedOrigins = [
      /\.myshopify\.com$/,
      /\.shopify\.com$/,
      /eastsidestudiolondon\.co\.uk$/,
      /localhost/,
      /127\.0\.0\.1/,
      /\.replit\.dev$/,
      /\.repl\.co$/,
    ];
    
    if (allowedOrigins.some(pattern => pattern.test(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  };

  // AR Analytics - record events from the widget (public endpoint)
  // Handle CORS preflight for analytics
  app.options("/api/ar/analytics", (req, res) => {
    setShopifyCors(req, res);
    res.status(200).end();
  });
  
  // AR debug logging endpoint - receives logs from widget for server-side viewing
  app.options("/api/ar-log", (req, res) => {
    setShopifyCors(req, res);
    res.status(200).end();
  });
  
  app.post("/api/ar-log", async (req, res) => {
    try {
      setShopifyCors(req, res);
      
      const logData = req.body;
      
      // Log to server console with clear formatting
      console.log("\n========================================");
      console.log("📱 AR DEBUG LOG:", logData.event?.toUpperCase() || "UNKNOWN");
      console.log("========================================");
      console.log("⏰ Timestamp:", logData.timestamp);
      console.log("🌐 Page URL:", logData.pageUrl);
      console.log("📲 User Agent:", logData.userAgent);
      console.log("🎨 GLB URL:", logData.glbUrl);
      console.log("🔗 Intent URL:", logData.intentUrl?.substring(0, 100) + "...");
      console.log("↩️  Fallback URL:", logData.fallbackUrl);
      console.log("⚙️  Product Config:", JSON.stringify(logData.productConfig, null, 2));
      console.log("========================================\n");
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("AR log error:", error);
      res.status(200).json({ success: false }); // Don't fail - this is just logging
    }
  });
  
  // IP geolocation lookup (non-blocking, uses free ip-api.com service)
  async function lookupCountryFromIP(ip: string): Promise<{ country: string | null; countryCode: string | null }> {
    if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return { country: null, countryCode: null };
    }
    try {
      const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode`, {
        signal: AbortSignal.timeout(2000), // 2 second timeout
      });
      if (response.ok) {
        const data = await response.json() as { status: string; country?: string; countryCode?: string };
        if (data.status === 'success') {
          return { country: data.country || null, countryCode: data.countryCode || null };
        }
      }
    } catch (err) {
      // Silently fail - geolocation is non-critical
    }
    return { country: null, countryCode: null };
  }

  app.post("/api/ar/analytics", async (req, res) => {
    try {
      setShopifyCors(req, res);

      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }

      const {
        eventType,
        platform,
        productTitle,
        productHandle,
        imageUrl,
        size,
        frame,
        frameType,
        shopDomain,
        sessionId,
        generationTimeMs,
        isQrScan,
      } = req.body;

      if (!eventType) {
        return res.status(400).json({ error: "eventType is required" });
      }

      // Get IP address for geo lookup
      const ipAddress = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || '';
      const userAgent = req.headers['user-agent'] || '';
      
      // Look up country from IP (non-blocking)
      const geoData = await lookupCountryFromIP(ipAddress);

      await storage.createArAnalyticsEvent({
        eventType,
        platform: platform || null,
        productTitle: productTitle || null,
        productHandle: productHandle || null,
        imageUrl: imageUrl || null,
        size: size || null,
        frame: frame || null,
        frameType: frameType || null,
        shopDomain: shopDomain || null,
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
        sessionId: sessionId || null,
        country: geoData.country,
        countryCode: geoData.countryCode,
        generationTimeMs: generationTimeMs ? parseInt(generationTimeMs) : null,
        isQrScan: isQrScan === true || isQrScan === 'true',
      });

      res.json({ success: true });
    } catch (error) {
      console.error("[AR Analytics] Error recording event:", error);
      res.status(500).json({ error: "Failed to record analytics event" });
    }
  });

  // AR Analytics - get analytics data (admin only)
  app.get("/api/admin/ar-analytics", requireAuth, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const analytics = await storage.getArAnalytics(days);
      res.json(analytics);
    } catch (error) {
      console.error("[AR Analytics] Error fetching analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // AR Analytics - get summary stats (admin only)
  app.get("/api/admin/ar-analytics/summary", requireAuth, async (req, res) => {
    try {
      const daysParam = req.query.days as string;
      let dateFilter: { start: Date; end: Date } | null = null;
      let days = 30;
      
      // Handle special date filters
      if (daysParam === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateFilter = { start: today, end: tomorrow };
      } else if (daysParam === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dateFilter = { start: yesterday, end: today };
      } else {
        days = parseInt(daysParam) || 30;
      }
      
      const summary = await storage.getArAnalyticsSummary(days, dateFilter);
      res.json(summary);
    } catch (error) {
      console.error("[AR Analytics] Error fetching summary:", error);
      res.status(500).json({ error: "Failed to fetch analytics summary" });
    }
  });

  // AR Conversions - get conversion stats (admin only)
  app.get("/api/admin/ar-analytics/conversions", requireAuth, async (req, res) => {
    try {
      const daysParam = req.query.days as string;
      let dateFilter: { start: Date; end: Date } | null = null;
      let days = 30;
      
      // Handle special date filters
      if (daysParam === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateFilter = { start: today, end: tomorrow };
      } else if (daysParam === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dateFilter = { start: yesterday, end: today };
      } else {
        days = parseInt(daysParam) || 30;
      }
      
      const stats = await storage.getArConversionStats(days, dateFilter);
      res.json(stats);
    } catch (error) {
      console.error("[AR Conversions] Error fetching conversion stats:", error);
      res.status(500).json({ error: "Failed to fetch conversion stats" });
    }
  });

  // Shopify Order Webhook - track AR conversions
  // This endpoint receives order data from Shopify when an order is created
  // Note: Raw body parsing is needed for HMAC verification - configured in index.ts
  app.post("/api/webhooks/shopify/order-created", async (req, res) => {
    try {
      // Verify Shopify HMAC signature
      const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
      const shopifySecret = process.env.SHOPIFY_WEBHOOK_SECRET;
      
      if (shopifySecret && hmacHeader) {
        const crypto = await import('crypto');
        const rawBody = (req as any).rawBody || JSON.stringify(req.body);
        const calculatedHmac = crypto
          .createHmac('sha256', shopifySecret)
          .update(rawBody, 'utf8')
          .digest('base64');
        
        if (hmacHeader !== calculatedHmac) {
          console.error('[AR Conversions] Invalid HMAC signature');
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }
      
      const order = req.body;
      
      // Basic validation
      if (!order || !order.id) {
        return res.status(400).json({ error: "Invalid order data" });
      }
      
      console.log(`[AR Conversions] Processing order ${order.name || order.id}`);
      
      // Check for AR session info in cart attributes (set by widget)
      const cartAttributes = order.note_attributes || [];
      const arSessionFromCart = cartAttributes.find((attr: any) => attr.name === '_ar_session_id')?.value;
      const arProductFromCart = cartAttributes.find((attr: any) => attr.name === '_ar_product')?.value;
      
      if (arSessionFromCart) {
        console.log(`[AR Conversions] Found AR session in cart: ${arSessionFromCart} for product: ${arProductFromCart}`);
      }
      
      // Process each line item to check if it had AR views
      const lineItems = order.line_items || [];
      let conversionsCreated = 0;
      
      // Track processed order+line combinations for idempotency
      const processedSet = new Set<string>();
      
      for (const item of lineItems) {
        // Idempotency check - create unique key for order+line item
        const idempotencyKey = `${order.id}-${item.variant_id || item.product_id}-${item.id}`;
        if (processedSet.has(idempotencyKey)) continue;
        processedSet.add(idempotencyKey);
        
        // Get product handle - prefer from line item to avoid API call
        let productHandle = item.handle;
        
        if (!productHandle && item.product_id) {
          try {
            const { getProductById } = await import("./shopifyService");
            const product = await getProductById(item.product_id.toString());
            productHandle = product?.handle;
          } catch (e) {
            console.error(`[AR Conversions] Failed to get product handle for ${item.product_id}`);
          }
        }
        
        if (!productHandle) continue;
        
        // Priority 1: Match by session ID from cart attributes (most accurate)
        // Priority 2: Match by product handle within time window (fallback)
        let arSession = null;
        
        if (arSessionFromCart && arProductFromCart === productHandle) {
          // Exact match - same session that viewed AR is buying this product
          arSession = await storage.findArSessionBySessionId(arSessionFromCart, productHandle);
          if (arSession) {
            console.log(`[AR Conversions] Exact session match for ${productHandle}`);
          }
        }
        
        if (!arSession) {
          // Fallback: Look for AR session within last 24 hours (1440 minutes)
          arSession = await storage.findArSessionForProduct(productHandle, 1440);
          if (arSession) {
            console.log(`[AR Conversions] Time-window match for ${productHandle}`);
          }
        }
        
        if (arSession) {
          // Calculate time between AR view and purchase
          const arTime = arSession.createdAt.getTime();
          const orderTime = new Date(order.created_at || Date.now()).getTime();
          const timeBetween = Math.floor((orderTime - arTime) / 1000); // seconds
          
          // Check for existing conversion to prevent duplicates from webhook retries
          const existingConversions = await storage.getArConversions(1);
          const isDuplicate = existingConversions.some(
            c => c.orderId === order.id.toString() && c.productHandle === productHandle
          );
          
          if (!isDuplicate) {
            await storage.createArConversion({
              orderId: order.id.toString(),
              orderNumber: order.name || order.order_number?.toString(),
              orderTotal: order.total_price?.toString(),
              currency: order.currency || 'GBP',
              productHandle: productHandle,
              productTitle: item.title || item.name,
              productId: item.product_id?.toString(),
              variantId: item.variant_id?.toString(),
              quantity: item.quantity || 1,
              lineItemPrice: item.price?.toString(),
              sessionId: arSession.sessionId,
              arEventId: arSession.id,
              platform: arSession.platform,
              timeBetweenArAndPurchase: timeBetween,
              customerEmail: order.email,
              shopDomain: order.source_name || process.env.SHOPIFY_SHOP_DOMAIN,
            });
            
            conversionsCreated++;
            console.log(`[AR Conversions] Recorded conversion for ${productHandle} (session: ${arSession.sessionId})`);
          } else {
            console.log(`[AR Conversions] Skipping duplicate conversion for ${productHandle} in order ${order.id}`);
          }
        }
      }
      
      console.log(`[AR Conversions] Order ${order.name} processed: ${conversionsCreated} conversions`);
      res.status(200).json({ success: true, conversionsCreated });
    } catch (error) {
      console.error("[AR Conversions] Webhook error:", error);
      res.status(500).json({ error: "Failed to process order" });
    }
  });

  // ==================== Storefront API Test ====================
  
  // Test Storefront API connection with localization
  app.get("/api/test-storefront", async (req, res) => {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      const country = (req.query.country as string)?.toUpperCase() || 'AU';
      const result = await testStorefrontAPI(country);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get localized prices for addon product variants
  app.get("/api/localized-prices/:productId", async (req, res) => {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      const productId = req.params.productId;
      const country = (req.query.country as string)?.toUpperCase() || 'GB';
      const prices = await getLocalizedVariantPrices(productId, country);
      res.json({ success: true, country, prices });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== Product Add-ons API ====================
  
  // Public endpoint for Shopify widget - get available addons for a product
  app.options("/api/addons", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(200).end();
  });

  app.get("/api/addons", async (req, res) => {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      
      const country = (req.query.country as string)?.toUpperCase() || 'GB';
      const variantTitle = req.query.variant as string || '';
      const size = req.query.size as string || '';
      const productId = req.query.productId as string || '';
      const frame = (req.query.frame as string)?.toLowerCase() || '';
      
      console.log('[Addons API] Request - country:', country, 'size:', size, 'frame:', frame, 'variant:', variantTitle);
      
      // NEW: Use hierarchical structure (Option Sets -> Groups -> Variants)
      const optionSets = await storage.getAddonOptionSetsByCountry(country);
      console.log('[Addons API] Found', optionSets.length, 'option sets for country:', country);
      
      const result: any[] = [];
      const groupsToProcess: { group: any; displayType: string; optionSetDisplayOrder: number; optionSetId: string }[] = [];
      const shopifyProductIds = new Set<string>();
      
      // First pass: collect all groups and their Shopify product IDs
      for (const optionSet of optionSets) {
        const groups = await storage.getAddonGroupsByOptionSet(optionSet.id);
        
        for (const group of groups) {
          // Check display conditions for the group
          if (group.displayConditions && group.displayConditions.length > 0) {
            const matchAll = group.conditionLogic === 'all';
            const serverConditions = group.displayConditions.filter((cond: any) => !cond.field?.startsWith('metafield:'));
            if (serverConditions.length > 0) {
              const results = serverConditions.map((cond: any) => {
                const checkValue = cond.field === 'shopify_variant' ? variantTitle : 
                                  cond.field === 'size' ? size :
                                  cond.field === 'frame' ? (frame || variantTitle) : variantTitle;
                
                if (cond.operator === 'contains') {
                  return checkValue.toLowerCase().includes(cond.value.toLowerCase());
                } else if (cond.operator === 'not_contains') {
                  return !checkValue.toLowerCase().includes(cond.value.toLowerCase());
                } else if (cond.operator === 'equals') {
                  return checkValue.toLowerCase() === cond.value.toLowerCase();
                }
                return false;
              });
              
              if (matchAll) {
                if (!results.every((r: boolean) => r)) continue;
              } else {
                if (!results.some((r: boolean) => r)) continue;
              }
            }
          }
          
          groupsToProcess.push({ group, displayType: optionSet.displayType || 'checkbox', optionSetDisplayOrder: optionSet.displayOrder, optionSetId: optionSet.id });
          if (group.shopifyProductId) {
            shopifyProductIds.add(group.shopifyProductId.toString());
          }
        }
      }
      
      // Fetch localized prices from Storefront API for all products in parallel
      const priceMap = new Map<number, { price: string; currency: string }>();
      if (shopifyProductIds.size > 0) {
        console.log('[Addons API] Fetching Storefront API prices for', shopifyProductIds.size, 'products, country:', country);
        const pricePromises = Array.from(shopifyProductIds).map(pid => 
          getLocalizedVariantPrices(pid, country)
        );
        const priceResults = await Promise.all(pricePromises);
        
        // Build lookup map: shopifyVariantId -> { price, currency }
        for (const variants of priceResults) {
          for (const v of variants) {
            priceMap.set(v.numericId, { price: v.price, currency: v.currencyCode });
          }
        }
        console.log('[Addons API] Built price map with', priceMap.size, 'variant prices');
      }
      
      // Second pass: process groups and apply Storefront API prices
      for (const { group, displayType, optionSetDisplayOrder, optionSetId } of groupsToProcess) {
        // Get variants for this group
        const groupVariants = await storage.getAddonVariantsByGroup(group.id);
        
        // Extract size from variant title if size param not provided
        const effectiveSize = size || (() => {
          const sizeMatch = variantTitle.match(/^(\d+["″]?\s*[xX×]\s*\d+["″]?)/);
          return sizeMatch ? sizeMatch[1] : '';
        })();
        
        // Filter variants by size
        let matchingVariants = groupVariants.filter(v => {
          if (!v.sizePatterns || v.sizePatterns.length === 0) return false;
          return v.sizePatterns.some(pattern => {
            const normalizedPattern = pattern.toLowerCase().replace(/["'″""]/g, '').trim();
            const normalizedSize = effectiveSize.toLowerCase().replace(/["'″""]/g, '').trim();
            const normalizedVariant = variantTitle.toLowerCase().replace(/["'″""]/g, '').trim();
            if (!normalizedSize && !normalizedVariant) return false;
            return (normalizedVariant && normalizedVariant.includes(normalizedPattern)) || 
                   (normalizedSize && normalizedSize.includes(normalizedPattern)) ||
                   (normalizedSize && normalizedPattern.includes(normalizedSize));
          });
        });
        
        // Only fall back to empty-pattern variants if NO variant in the group has specific size patterns
        // (i.e., the entire group is "one size fits all"). If some variants have patterns but none matched,
        // the addon is not available for this size.
        if (matchingVariants.length === 0) {
          const hasAnyPatterns = groupVariants.some(v => v.sizePatterns && v.sizePatterns.length > 0);
          if (!hasAnyPatterns) {
            matchingVariants = groupVariants;
          }
        }
        
        if (matchingVariants.length === 0) continue;
        
        // Get variant images based on current frame selection
        const variantsWithImages = await Promise.all(matchingVariants.map(async v => {
          const images = await storage.getAddonVariantImages(v.id);
          const normalizedFrame = frame.toLowerCase().replace(/\s+frame$/i, '').trim();
          const matchingImage = images.find(img => 
            img.frameType?.toLowerCase() === normalizedFrame
          ) || images.find(img => !img.frameType) || images[0];
          
          // Use Storefront API price if available, otherwise fall back to database price
          const storefrontPrice = v.shopifyVariantId ? priceMap.get(Number(v.shopifyVariantId)) : null;
          
          return {
            id: v.id,
            name: v.name,
            shopifyVariantId: v.shopifyVariantId,
            price: storefrontPrice ? storefrontPrice.price : v.price,
            currency: storefrontPrice ? storefrontPrice.currency : v.currency,
            imageUrl: matchingImage?.imageUrl || null,
          };
        }));
        
        result.push({
          id: group.id,
          name: group.name,
          slug: group.slug,
          description: group.description,
          specs: group.specs || null,
          imageUrl: group.imageUrl,
          shopifyProductId: group.shopifyProductId,
          shopifyProductHandle: group.shopifyProductHandle,
          displayType,
          optionSetId,
          optionSetDisplayOrder,
          variants: variantsWithImages,
        });
      }
      
      // FALLBACK: If no new-style groups found, try legacy productAddons
      if (result.length === 0) {
        console.log('[Addons API] No groups found, trying legacy productAddons');
        const allAddons = await storage.getAllProductAddons();
        const allVariants = await storage.getAllAddonVariants();
        
        const filteredAddons = allAddons.filter(addon => {
          if (addon.slug?.includes('box-frame') && frame === 'unframed') return false;
          if (addon.allowedProductIds && addon.allowedProductIds.length > 0) {
            if (!productId || !addon.allowedProductIds.includes(productId)) return false;
          }
          if (addon.allowedCountries && addon.allowedCountries.length > 0) {
            if (!addon.allowedCountries.includes(country)) return false;
          }
          if (addon.displayConditions && addon.displayConditions.length > 0) {
            const matchAll = addon.conditionLogic === 'all';
            const serverConditions = addon.displayConditions.filter((cond: any) => !cond.field?.startsWith('metafield:'));
            if (serverConditions.length > 0) {
              const results = serverConditions.map((cond: any) => {
                const checkValue = cond.field === 'shopify_variant' ? variantTitle : 
                                  cond.field === 'size' ? size :
                                  cond.field === 'frame' ? (frame || variantTitle) : variantTitle;
                if (cond.operator === 'contains') return checkValue.toLowerCase().includes(cond.value.toLowerCase());
                if (cond.operator === 'not_contains') return !checkValue.toLowerCase().includes(cond.value.toLowerCase());
                if (cond.operator === 'equals') return checkValue.toLowerCase() === cond.value.toLowerCase();
                return false;
              });
              if (matchAll && !results.every((r: boolean) => r)) return false;
              if (!matchAll && !results.some((r: boolean) => r)) return false;
            }
          }
          return true;
        });
        
        // Extract size from variant title if size param not provided (legacy path)
        const legacyEffectiveSize = size || (() => {
          const sizeMatch = variantTitle.match(/^(\d+["″]?\s*[xX×]\s*\d+["″]?)/);
          return sizeMatch ? sizeMatch[1] : '';
        })();

        for (const addon of filteredAddons) {
          let variants = allVariants.filter(v => v.addonId === addon.id).filter(v => {
            if (!v.sizePatterns || v.sizePatterns.length === 0) return false;
            return v.sizePatterns.some(pattern => {
              const normalizedPattern = pattern.toLowerCase().replace(/["'″""]/g, '').trim();
              const normalizedSize = legacyEffectiveSize.toLowerCase().replace(/["'″""]/g, '').trim();
              const normalizedVariant = variantTitle.toLowerCase().replace(/["'″""]/g, '').trim();
              if (!normalizedSize && !normalizedVariant) return false;
              return (normalizedVariant && normalizedVariant.includes(normalizedPattern)) || 
                     (normalizedSize && normalizedSize.includes(normalizedPattern)) ||
                     (normalizedSize && normalizedPattern.includes(normalizedSize));
            });
          }).sort((a, b) => a.displayOrder - b.displayOrder);
          
          // Only fall back to empty-pattern variants if NO variant for this addon has specific patterns
          if (variants.length === 0) {
            const addonVariants = allVariants.filter(v => v.addonId === addon.id);
            const hasAnyPatterns = addonVariants.some(v => v.sizePatterns && v.sizePatterns.length > 0);
            if (!hasAnyPatterns) {
              variants = addonVariants.sort((a, b) => a.displayOrder - b.displayOrder);
            }
          }
          
          if (variants.length === 0) continue;
          
          const variantsWithImages = await Promise.all(variants.map(async v => {
            const images = await storage.getAddonVariantImages(v.id);
            const normalizedFrame = frame.toLowerCase().replace(/\s+frame$/i, '').trim();
            const matchingImage = images.find(img => img.frameType?.toLowerCase() === normalizedFrame) || images.find(img => !img.frameType) || images[0];
            return { id: v.id, name: v.name, shopifyVariantId: v.shopifyVariantId, price: v.price, currency: v.currency, imageUrl: matchingImage?.imageUrl || null };
          }));
          
          result.push({ ...addon, variants: variantsWithImages });
        }
      }
      
      console.log('[Addons API] Returning', result.length, 'addons');
      res.json(result);
    } catch (error) {
      console.error("[Addons] Error fetching addons:", error);
      res.status(500).json({ error: "Failed to fetch addons" });
    }
  });

  // Preload endpoint - returns ALL addons for a country without filtering
  // Used by widget to cache all possibilities on page load
  app.options("/api/addons/preload", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(200).end();
  });

  app.get("/api/addons/preload", async (req, res) => {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=300"); // Cache for 5 minutes
      
      const country = (req.query.country as string)?.toUpperCase() || 'GB';
      
      console.log('[Addons Preload] Request - country:', country);
      
      const optionSets = await storage.getAddonOptionSetsByCountry(country);
      console.log('[Addons Preload] Found', optionSets.length, 'option sets for country:', country);
      
      const result: any[] = [];
      const allGroups: { group: any; displayType: string; optionSetDisplayOrder: number; optionSetId: string }[] = [];
      const shopifyProductIds = new Set<string>();
      
      // First pass: collect all groups and Shopify product IDs
      for (const optionSet of optionSets) {
        const groups = await storage.getAddonGroupsByOptionSet(optionSet.id);
        for (const group of groups) {
          allGroups.push({ group, displayType: optionSet.displayType || 'checkbox', optionSetDisplayOrder: optionSet.displayOrder, optionSetId: optionSet.id });
          if (group.shopifyProductId) {
            shopifyProductIds.add(group.shopifyProductId.toString());
          }
        }
      }
      
      // Fetch localized prices from Storefront API for all products in parallel
      const priceMap = new Map<number, { price: string; currency: string }>();
      if (shopifyProductIds.size > 0) {
        console.log('[Addons Preload] Fetching Storefront API prices for', shopifyProductIds.size, 'products, country:', country);
        const pricePromises = Array.from(shopifyProductIds).map(pid => 
          getLocalizedVariantPrices(pid, country)
        );
        const priceResults = await Promise.all(pricePromises);
        
        for (const variants of priceResults) {
          for (const v of variants) {
            priceMap.set(v.numericId, { price: v.price, currency: v.currencyCode });
          }
        }
        console.log('[Addons Preload] Built price map with', priceMap.size, 'variant prices');
      }
      
      // Second pass: build result with Storefront API prices
      for (const { group, displayType, optionSetDisplayOrder, optionSetId } of allGroups) {
        // Get ALL variants for this group (no filtering)
        const groupVariants = await storage.getAddonVariantsByGroup(group.id);
        
        const variantsWithImages = await Promise.all(groupVariants.map(async v => {
          const images = await storage.getAddonVariantImages(v.id);
          
          // Use Storefront API price if available
          const storefrontPrice = v.shopifyVariantId ? priceMap.get(Number(v.shopifyVariantId)) : null;
          
          return {
            id: v.id,
            name: v.name,
            shopifyVariantId: v.shopifyVariantId,
            price: storefrontPrice ? storefrontPrice.price : v.price,
            currency: storefrontPrice ? storefrontPrice.currency : v.currency,
            sizePatterns: v.sizePatterns,
            images: images.map(img => ({
              imageUrl: img.imageUrl,
              frameType: img.frameType
            }))
          };
        }));
        
        result.push({
          id: group.id,
          name: group.name,
          slug: group.slug,
          description: group.description,
          specs: group.specs || null,
          imageUrl: group.imageUrl,
          shopifyProductId: group.shopifyProductId,
          shopifyProductHandle: group.shopifyProductHandle,
          displayConditions: group.displayConditions,
          conditionLogic: group.conditionLogic,
          displayType,
          optionSetId,
          optionSetDisplayOrder,
          variants: variantsWithImages,
        });
      }
      
      console.log('[Addons Preload] Returning', result.length, 'groups with all variants');
      res.json(result);
    } catch (error) {
      console.error("[Addons Preload] Error:", error);
      res.status(500).json({ error: "Failed to preload addons" });
    }
  });

  // Admin: Get upload queue status for monitoring
  app.get("/api/admin/upload-queue", requireAuth, async (req, res) => {
    try {
      res.json(artworkUploadQueue.getStatus());
    } catch (error) {
      res.status(500).json({ error: "Failed to get queue status" });
    }
  });

  app.get("/api/admin/mockup-queue", requireAuth, async (req, res) => {
    try {
      res.json(mockupQueue.getStatus());
    } catch (error) {
      res.status(500).json({ error: "Failed to get mockup queue status" });
    }
  });

  // Admin: Get all addons
  app.get("/api/admin/addons", requireAuth, async (req, res) => {
    try {
      const addons = await storage.getAllProductAddons();
      const variants = await storage.getAllAddonVariants();
      
      const addonsWithVariants = addons.map(addon => ({
        ...addon,
        variants: variants.filter(v => v.addonId === addon.id),
      }));
      
      res.json(addonsWithVariants);
    } catch (error) {
      console.error("[Addons] Error fetching addons:", error);
      res.status(500).json({ error: "Failed to fetch addons" });
    }
  });

  // Admin: Create addon
  app.post("/api/admin/addons", requireAuth, async (req, res) => {
    try {
      const addon = await storage.createProductAddon(req.body);
      res.json(addon);
    } catch (error) {
      console.error("[Addons] Error creating addon:", error);
      res.status(500).json({ error: "Failed to create addon" });
    }
  });

  // Admin: Update addon (partial)
  app.patch("/api/admin/addons/:id", requireAuth, async (req, res) => {
    try {
      const addon = await storage.updateProductAddon(req.params.id, req.body);
      if (!addon) {
        return res.status(404).json({ error: "Addon not found" });
      }
      res.json(addon);
    } catch (error) {
      console.error("[Addons] Error updating addon:", error);
      res.status(500).json({ error: "Failed to update addon" });
    }
  });

  // Admin: Update addon with variants (full replacement)
  app.put("/api/admin/addons/:id", requireAuth, async (req, res) => {
    try {
      const { variants, ...addonData } = req.body;
      
      // Update addon
      const addon = await storage.updateProductAddon(req.params.id, addonData);
      if (!addon) {
        return res.status(404).json({ error: "Addon not found" });
      }
      
      // Delete existing variants and create new ones
      if (variants && Array.isArray(variants)) {
        const existingVariants = await storage.getAllAddonVariants();
        const addonVariants = existingVariants.filter(v => v.addonId === req.params.id);
        
        for (const v of addonVariants) {
          await storage.deleteAddonVariant(v.id);
        }
        
        for (const v of variants) {
          await storage.createAddonVariant({
            ...v,
            addonId: req.params.id,
          });
        }
      }
      
      // Return updated addon with variants
      const allVariants = await storage.getAllAddonVariants();
      res.json({
        ...addon,
        variants: allVariants.filter(v => v.addonId === addon.id),
      });
    } catch (error) {
      console.error("[Addons] Error updating addon:", error);
      res.status(500).json({ error: "Failed to update addon" });
    }
  });

  // Admin: Delete addon
  app.delete("/api/admin/addons/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteProductAddon(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Addon not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[Addons] Error deleting addon:", error);
      res.status(500).json({ error: "Failed to delete addon" });
    }
  });

  // Admin: Create addon variant
  app.post("/api/admin/addons/:addonId/variants", requireAuth, async (req, res) => {
    try {
      const variant = await storage.createAddonVariant({
        ...req.body,
        addonId: req.params.addonId,
      });
      res.json(variant);
    } catch (error) {
      console.error("[Addons] Error creating variant:", error);
      res.status(500).json({ error: "Failed to create variant" });
    }
  });

  // Admin: Update addon variant
  app.patch("/api/admin/addon-variants/:id", requireAuth, async (req, res) => {
    try {
      const variant = await storage.updateAddonVariant(req.params.id, req.body);
      if (!variant) {
        return res.status(404).json({ error: "Variant not found" });
      }
      res.json(variant);
    } catch (error) {
      console.error("[Addons] Error updating variant:", error);
      res.status(500).json({ error: "Failed to update variant" });
    }
  });

  // Admin: Delete addon variant
  app.delete("/api/admin/addon-variants/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteAddonVariant(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Variant not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[Addons] Error deleting variant:", error);
      res.status(500).json({ error: "Failed to delete variant" });
    }
  });

  // Admin: Get variant images
  app.get("/api/admin/addon-variants/:variantId/images", requireAuth, async (req, res) => {
    try {
      const images = await storage.getAddonVariantImages(req.params.variantId);
      res.json(images);
    } catch (error) {
      console.error("[Addons] Error getting variant images:", error);
      res.status(500).json({ error: "Failed to get variant images" });
    }
  });

  // Admin: Upload variant image
  app.post("/api/admin/addon-variants/:variantId/images", requireAuth, upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image uploaded" });
      }

      const { frameType, altText } = req.body;
      const variantId = req.params.variantId;

      // Upload to object storage using the pattern that generates permanent public URLs
      const objectStorage = new ObjectStorageService();

      // Generate a unique filename with timestamp
      const ext = req.file.originalname.split('.').pop() || 'jpg';
      const filename = `addon-${variantId}-${frameType || 'default'}-${Date.now()}.${ext}`;
      
      // Upload to object storage - returns the full path with UUID prefix
      const imageUrl = await objectStorage.uploadFile(getFileBuffer(req.file), filename, req.file.mimetype);
      cleanupTempFile(req.file);

      // Upsert the image record
      const image = await storage.upsertAddonVariantImage({
        variantId,
        frameType: frameType || null,
        imageUrl,
        altText: altText || null,
      });

      res.json(image);
    } catch (error) {
      console.error("[Addons] Error uploading variant image:", error);
      res.status(500).json({ error: "Failed to upload variant image" });
    }
  });

  // Admin: Delete variant image
  app.delete("/api/admin/addon-variant-images/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteAddonVariantImage(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Image not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[Addons] Error deleting variant image:", error);
      res.status(500).json({ error: "Failed to delete variant image" });
    }
  });

  // Admin: Copy image to all variants of an addon for a specific frame type
  app.post("/api/admin/addons/:addonId/copy-image-to-variants", requireAuth, async (req, res) => {
    try {
      const { imageUrl, frameType } = req.body;
      const addonId = req.params.addonId;
      
      if (!imageUrl) {
        return res.status(400).json({ error: "Image URL required" });
      }

      // Get all variants for this addon
      const addon = await storage.getProductAddonWithVariants(addonId);
      if (!addon) {
        return res.status(404).json({ error: "Addon not found" });
      }

      // Copy image to all variants
      const results = [];
      for (const variant of addon.variants) {
        const image = await storage.upsertAddonVariantImage({
          variantId: variant.id,
          frameType: frameType || null,
          imageUrl,
          altText: null,
        });
        results.push(image);
      }

      res.json({ success: true, count: results.length });
    } catch (error) {
      console.error("[Addons] Error copying image to variants:", error);
      res.status(500).json({ error: "Failed to copy image to variants" });
    }
  });

  // ===== NEW: Addon Option Sets (Level 1 - Hierarchical Structure) =====
  app.get("/api/admin/addon-option-sets", requireAuth, async (req, res) => {
    try {
      const optionSets = await storage.getAllAddonOptionSets();
      res.json(optionSets);
    } catch (error) {
      console.error("[Addons] Error fetching option sets:", error);
      res.status(500).json({ error: "Failed to fetch option sets" });
    }
  });

  app.get("/api/admin/addon-option-sets/:id", requireAuth, async (req, res) => {
    try {
      const optionSet = await storage.getAddonOptionSet(req.params.id);
      if (!optionSet) return res.status(404).json({ error: "Option set not found" });
      const groups = await storage.getAddonGroupsByOptionSet(req.params.id);
      const groupsWithVariants = await Promise.all(
        groups.map(async (group) => {
          const variants = await storage.getAddonVariantsByGroup(group.id);
          return { ...group, variants };
        })
      );
      res.json({ ...optionSet, groups: groupsWithVariants });
    } catch (error) {
      console.error("[Addons] Error fetching option set:", error);
      res.status(500).json({ error: "Failed to fetch option set" });
    }
  });

  app.post("/api/admin/addon-option-sets", requireAuth, async (req, res) => {
    try {
      const { insertAddonOptionSetSchema } = await import("@shared/schema");
      const parsed = insertAddonOptionSetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
      }
      const optionSet = await storage.createAddonOptionSet(parsed.data);
      res.json(optionSet);
    } catch (error) {
      console.error("[Addons] Error creating option set:", error);
      res.status(500).json({ error: "Failed to create option set" });
    }
  });

  app.patch("/api/admin/addon-option-sets/:id", requireAuth, async (req, res) => {
    try {
      const { insertAddonOptionSetSchema } = await import("@shared/schema");
      const parsed = insertAddonOptionSetSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
      }
      const optionSet = await storage.updateAddonOptionSet(req.params.id, parsed.data);
      if (!optionSet) return res.status(404).json({ error: "Option set not found" });
      res.json(optionSet);
    } catch (error) {
      console.error("[Addons] Error updating option set:", error);
      res.status(500).json({ error: "Failed to update option set" });
    }
  });

  app.delete("/api/admin/addon-option-sets/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteAddonOptionSet(req.params.id);
      if (!success) return res.status(404).json({ error: "Option set not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("[Addons] Error deleting option set:", error);
      res.status(500).json({ error: "Failed to delete option set" });
    }
  });

  // ===== NEW: Addon Groups (Level 2 - Hierarchical Structure) =====
  app.get("/api/admin/addon-groups", requireAuth, async (req, res) => {
    try {
      const groups = await storage.getAllAddonGroups();
      res.json(groups);
    } catch (error) {
      console.error("[Addons] Error fetching groups:", error);
      res.status(500).json({ error: "Failed to fetch groups" });
    }
  });

  app.get("/api/admin/addon-groups/:id", requireAuth, async (req, res) => {
    try {
      const group = await storage.getAddonGroup(req.params.id);
      if (!group) return res.status(404).json({ error: "Group not found" });
      const variants = await storage.getAddonVariantsByGroup(req.params.id);
      res.json({ ...group, variants });
    } catch (error) {
      console.error("[Addons] Error fetching group:", error);
      res.status(500).json({ error: "Failed to fetch group" });
    }
  });

  app.post("/api/admin/addon-groups", requireAuth, async (req, res) => {
    try {
      const { insertAddonGroupSchema } = await import("@shared/schema");
      const parsed = insertAddonGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
      }
      const group = await storage.createAddonGroup(parsed.data);
      res.json(group);
    } catch (error) {
      console.error("[Addons] Error creating group:", error);
      res.status(500).json({ error: "Failed to create group" });
    }
  });

  app.patch("/api/admin/addon-groups/:id", requireAuth, async (req, res) => {
    try {
      const { insertAddonGroupSchema } = await import("@shared/schema");
      const parsed = insertAddonGroupSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
      }
      const group = await storage.updateAddonGroup(req.params.id, parsed.data);
      if (!group) return res.status(404).json({ error: "Group not found" });
      res.json(group);
    } catch (error) {
      console.error("[Addons] Error updating group:", error);
      res.status(500).json({ error: "Failed to update group" });
    }
  });

  app.delete("/api/admin/addon-groups/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteAddonGroup(req.params.id);
      if (!success) return res.status(404).json({ error: "Group not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("[Addons] Error deleting group:", error);
      res.status(500).json({ error: "Failed to delete group" });
    }
  });

  // Get variants by group
  app.get("/api/admin/addon-groups/:id/variants", requireAuth, async (req, res) => {
    try {
      const variants = await storage.getAddonVariantsByGroup(req.params.id);
      res.json(variants);
    } catch (error) {
      console.error("[Addons] Error fetching group variants:", error);
      res.status(500).json({ error: "Failed to fetch group variants" });
    }
  });

  // Upload image for addon group
  app.post("/api/admin/addon-groups/:id/upload-image", requireAuth, upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image uploaded" });
      }

      const groupId = req.params.id;
      
      // Verify group exists
      const group = await storage.getAddonGroup(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      // Upload to object storage
      const objectStorage = new ObjectStorageService();
      const ext = req.file.originalname.split('.').pop() || 'jpg';
      const filename = `addon-group-${groupId}-${Date.now()}.${ext}`;
      const imageUrl = await objectStorage.uploadFile(getFileBuffer(req.file), filename, req.file.mimetype);
      cleanupTempFile(req.file);

      // Update group with new image URL
      const updated = await storage.updateAddonGroup(groupId, { imageUrl });
      
      res.json({ imageUrl, group: updated });
    } catch (error) {
      console.error("[Addons] Error uploading group image:", error);
      res.status(500).json({ error: "Failed to upload group image" });
    }
  });

  // ===== Addon Variants (Level 3) =====
  app.post("/api/admin/addon-variants", requireAuth, async (req, res) => {
    try {
      const { insertAddonVariantSchema } = await import("@shared/schema");
      const parsed = insertAddonVariantSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
      }
      const variant = await storage.createAddonVariant(parsed.data);
      res.json(variant);
    } catch (error) {
      console.error("[Addons] Error creating variant:", error);
      res.status(500).json({ error: "Failed to create variant" });
    }
  });

  app.patch("/api/admin/addon-variants/:id", requireAuth, async (req, res) => {
    try {
      const { insertAddonVariantSchema } = await import("@shared/schema");
      const parsed = insertAddonVariantSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
      }
      const variant = await storage.updateAddonVariant(req.params.id, parsed.data);
      if (!variant) return res.status(404).json({ error: "Variant not found" });
      res.json(variant);
    } catch (error) {
      console.error("[Addons] Error updating variant:", error);
      res.status(500).json({ error: "Failed to update variant" });
    }
  });

  app.delete("/api/admin/addon-variants/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteAddonVariant(req.params.id);
      if (!success) return res.status(404).json({ error: "Variant not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("[Addons] Error deleting variant:", error);
      res.status(500).json({ error: "Failed to delete variant" });
    }
  });

  // Get all variants for a Shopify product
  app.get("/api/admin/shopify/products/:productId/variants", requireAuth, async (req, res) => {
    try {
      const { getProductVariants } = await import("./shopifyService");
      const variants = await getProductVariants(req.params.productId);
      res.json(variants);
    } catch (error: any) {
      console.error("[Shopify] Error fetching product variants:", error);
      res.status(500).json({ error: error.message || "Failed to fetch variants" });
    }
  });

  // Look up Shopify variant by ID to get live price
  app.get("/api/admin/shopify/variants/:variantId", requireAuth, async (req, res) => {
    try {
      const { getVariantById } = await import("./shopifyService");
      const variant = await getVariantById(req.params.variantId);
      if (!variant) {
        return res.status(404).json({ error: "Variant not found in Shopify" });
      }
      res.json(variant);
    } catch (error: any) {
      console.error("[Shopify] Error looking up variant:", error);
      res.status(500).json({ error: error.message || "Failed to lookup variant" });
    }
  });

  // Sync all addon variant IDs and prices from Shopify
  app.post("/api/admin/addon-variants/sync-prices", requireAuth, async (req, res) => {
    try {
      const { getProductVariants } = await import("./shopifyService");
      
      const optionSets = await storage.getAllAddonOptionSets();
      let updated = 0;
      let failed = 0;
      const results: { id: string; name: string; change: string; error?: string }[] = [];
      
      // Cache Shopify variants by product ID to avoid duplicate API calls
      const shopifyVariantsCache: Map<string, { id: string; title: string; price: string }[]> = new Map();
      
      for (const optionSet of optionSets) {
        const groups = await storage.getAddonGroupsByOptionSet(optionSet.id);
        
        for (const group of groups) {
          // Skip if no Shopify product ID
          if (!group.shopifyProductId) {
            console.log(`[Addons Sync] Skipping group ${group.name} - no Shopify product ID`);
            continue;
          }
          
          // Get Shopify variants (use cache if available)
          let shopifyVariants = shopifyVariantsCache.get(group.shopifyProductId);
          if (!shopifyVariants) {
            shopifyVariants = await getProductVariants(group.shopifyProductId);
            shopifyVariantsCache.set(group.shopifyProductId, shopifyVariants);
            console.log(`[Addons Sync] Fetched ${shopifyVariants.length} variants from Shopify product ${group.shopifyProductId}`);
          }
          
          if (shopifyVariants.length === 0) {
            console.log(`[Addons Sync] No variants found for Shopify product ${group.shopifyProductId}`);
            continue;
          }
          
          const variants = await storage.getAddonVariantsByGroup(group.id);
          
          for (const variant of variants) {
            try {
              // Match our variant to a Shopify variant by comparing size patterns
              // Our variant.name: "A1, 20" x 30", 24" x 32"" or "Paper Upgrade - Small"
              // Shopify variant.title: "Box Frame A1" or "Paper Upgrade - Small"
              
              let matchedShopifyVariant = null;
              
              // Extract size codes from our variant name (A0, A1, A2, A3, A4, Small, Medium, Large, or dimension patterns)
              const ourSizes = variant.name.split(',').map(s => s.trim().toLowerCase());
              const ourSizeCodes: string[] = [];
              
              for (const size of ourSizes) {
                // Extract A-series codes
                const aMatch = size.match(/\b(a[0-4])\b/i);
                if (aMatch) ourSizeCodes.push(aMatch[1].toLowerCase());
                
                // Extract size words like Small, Medium, Large
                const wordMatch = size.match(/\b(small|medium|large)\b/i);
                if (wordMatch) ourSizeCodes.push(wordMatch[1].toLowerCase());
                
                // Extract dimension patterns like 20" x 30"
                const dimMatch = size.match(/(\d+)\s*[""'x×]\s*(\d+)/);
                if (dimMatch) ourSizeCodes.push(`${dimMatch[1]}x${dimMatch[2]}`);
              }
              
              console.log(`[Addons Sync] Variant "${variant.name}" extracted codes:`, ourSizeCodes);
              
              // Try to find a matching Shopify variant
              for (const sv of shopifyVariants) {
                const svTitle = sv.title.toLowerCase();
                
                // Extract size code from Shopify title
                const svAMatch = svTitle.match(/\b(a[0-4])\b/i);
                const svWordMatch = svTitle.match(/\b(small|medium|large)\b/i);
                const svDimMatch = svTitle.match(/(\d+)\s*[""'x×]\s*(\d+)/);
                
                const svSizeCode = svAMatch ? svAMatch[1].toLowerCase() :
                                   svWordMatch ? svWordMatch[1].toLowerCase() :
                                   svDimMatch ? `${svDimMatch[1]}x${svDimMatch[2]}` : null;
                
                if (svSizeCode && ourSizeCodes.includes(svSizeCode)) {
                  console.log(`[Addons Sync] Matched! Our "${variant.name}" → Shopify "${sv.title}" (code: ${svSizeCode})`);
                  matchedShopifyVariant = sv;
                  break;
                }
              }
              
              if (matchedShopifyVariant) {
                const changes: string[] = [];
                const updateData: any = {};
                
                // Check if variant ID changed
                if (variant.shopifyVariantId !== matchedShopifyVariant.id) {
                  changes.push(`ID: ${variant.shopifyVariantId} → ${matchedShopifyVariant.id}`);
                  updateData.shopifyVariantId = matchedShopifyVariant.id;
                }
                
                // Check if price changed
                if (variant.price !== matchedShopifyVariant.price) {
                  changes.push(`Price: £${variant.price} → £${matchedShopifyVariant.price}`);
                  updateData.price = matchedShopifyVariant.price;
                }
                
                if (Object.keys(updateData).length > 0) {
                  await storage.updateAddonVariant(variant.id, updateData);
                  results.push({
                    id: variant.id,
                    name: variant.name,
                    change: changes.join(', '),
                  });
                  updated++;
                }
              } else {
                console.log(`[Addons Sync] No match found for variant: ${variant.name}`);
                results.push({
                  id: variant.id,
                  name: variant.name,
                  change: 'No match found',
                  error: 'Could not match to Shopify variant',
                });
                failed++;
              }
            } catch (err: any) {
              console.error(`[Addons Sync] Error processing variant ${variant.name}:`, err);
              results.push({
                id: variant.id,
                name: variant.name,
                change: 'Error',
                error: err.message,
              });
              failed++;
            }
          }
        }
      }
      
      console.log(`[Addons] Synced: ${updated} updated, ${failed} failed`);
      res.json({ updated, failed, results });
    } catch (error: any) {
      console.error("[Addons] Error syncing:", error);
      res.status(500).json({ error: error.message || "Failed to sync" });
    }
  });

  // Create artwork with file upload
  // Uses upload queue to process one at a time and prevent memory exhaustion
  app.post("/api/artworks", upload.fields([
    { name: "file", maxCount: 1 },
    { name: "signatureFile", maxCount: 1 }
  ]), async (req, res) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (!files || !files.file || !files.file[0]) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    const artworkFile = files.file[0];
    const taskId = `artwork-${Date.now()}-${artworkFile.originalname.slice(0, 20)}`;
    
    // Fix UTF-8 encoding for Japanese/Unicode filenames (Multer reads as latin1)
    artworkFile.originalname = Buffer.from(artworkFile.originalname, 'latin1').toString('utf8');
    
    // Also fix signature file encoding if present
    if (files.signatureFile && files.signatureFile[0]) {
      files.signatureFile[0].originalname = Buffer.from(files.signatureFile[0].originalname, 'latin1').toString('utf8');
    }

    // Queue the heavy processing to prevent memory exhaustion with multiple uploads
    try {
      const result = await artworkUploadQueue.enqueue(async () => {
        const fileSizeMB = artworkFile.size / 1024 / 1024;
        const diskPath = artworkFile.path;
        console.log(`[Upload] Processing file from disk: ${artworkFile.originalname} (${fileSizeMB.toFixed(1)}MB) at ${diskPath}`);

        // Read file buffer for analysis and low-res generation
        const fileBuffer = readFileSync(diskPath);
        
        // Analyze image with memory tracking
      const analysis = await trackToolMemory('ArtworkUpload', 'analyzeImage', async () => {
        return await analyzeImage(fileBuffer);
      });
      
      // Validate minimum size requirements
      if (analysis.availableSizes.length < 2) {
        return res.status(400).json({ 
          error: "Image resolution too low",
          message: `This image can only be printed at ${analysis.availableSizes.length} size${analysis.availableSizes.length === 1 ? '' : 's'} (${analysis.availableSizes.join(', ')}). Artworks must support at least 2 print sizes. Please upload a higher resolution image.`
        });
      }
      
      // Upload original to object storage via streaming from disk (no buffer in memory)
      const originalUrl = await trackToolMemory('ArtworkUpload', 'uploadOriginal', async () => {
        return await objectStorageService.uploadFileFromPath(
          diskPath,
          artworkFile.originalname,
          artworkFile.mimetype
        );
      });

      // Generate and upload low-res version only for main artworks (not additional files)
      // Pass pre-extracted metadata to avoid duplicate image decoding (performance optimization)
      let lowResBuffer: Buffer | null = null;
      let lowResUrl: string | null = null;
      if (!req.body.isAdditionalFile) {
        lowResBuffer = await trackToolMemory('ArtworkUpload', 'createLowRes', async () => {
          return await createLowResVersion(fileBuffer, 800, { isCMYK: analysis.isCMYK });
        });
        lowResUrl = await objectStorageService.uploadFile(
          lowResBuffer,
          `low-res-${artworkFile.originalname}`,
          "image/jpeg"
        );
      }

      // Extract fields from request body first
      const artistName = req.body.artistName || "Unknown Artist";
      const uploadBatchId = req.body.uploadBatchId || undefined;
      const artistEmail = req.body.artistEmail;
      const title = req.body.title || artworkFile.originalname.replace(/\.[^/.]+$/, "");
      const editionType = req.body.editionType || "open";
      const editionSize = req.body.editionSize ? parseInt(req.body.editionSize, 10) : undefined;
      const artworkStory = req.body.artworkStory || undefined;
      const isAdditionalFile = req.body.isAdditionalFile === "true";
      
      // Helper function to sanitize names for filenames (preserve Unicode, remove filesystem-unsafe chars)
      const sanitizeForFilename = (str: string) => {
        return str
          .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // Only remove filesystem-unsafe chars
          .replace(/\s+/g, '-') // Replace spaces with hyphens
          .replace(/-+/g, '-') // Replace multiple hyphens with single
          .trim();
      };
      
      // Handle signature file upload for Limited Edition
      let artistSignatureFileUrl: string | undefined;
      if (files.signatureFile && files.signatureFile[0]) {
        const signatureFile = files.signatureFile[0];
        const sigBuffer = readFileSync(signatureFile.path);
        artistSignatureFileUrl = await objectStorageService.uploadFile(
          sigBuffer,
          `signature-${artistName}-${Date.now()}.${signatureFile.originalname.split('.').pop()}`,
          signatureFile.mimetype
        );
      }
      
      // Validate Limited Edition requirements
      if (editionType === "limited") {
        if (!artistSignatureFileUrl) {
          return res.status(400).json({ 
            error: "Signature file required",
            message: "Limited Edition submissions require an artist signature file upload"
          });
        }
        if (!artworkStory || artworkStory.length < 200) {
          return res.status(400).json({ 
            error: "Artwork story required",
            message: "Limited Edition submissions require an artwork story of at least 200 characters"
          });
        }
        if (!editionSize || editionSize < 20 || editionSize > 150) {
          return res.status(400).json({ 
            error: "Edition size required",
            message: "Limited Edition submissions require an edition size between 20 and 150"
          });
        }
      }
      
      // Get file extension
      const fileExt = artworkFile.originalname.split('.').pop() || 'jpg';
      
      // Create standardized filenames
      const sanitizedArtist = sanitizeForFilename(artistName);
      const sanitizedTitle = sanitizeForFilename(title);
      const sanitizedRatio = sanitizeForFilename(analysis.aspectRatio.replace(/[()]/g, '')); // Remove parentheses
      
      // Add unique suffix for additional files to prevent overwriting parent file
      const additionalFileSuffix = isAdditionalFile ? `_alt-${Date.now()}` : '';
      
      const highResFilename = `${sanitizedArtist}_${sanitizedTitle}_${sanitizedRatio}${additionalFileSuffix}.${fileExt}`;
      const lowResFilename = `LowRes_${sanitizedArtist}_${sanitizedTitle}_${sanitizedRatio}.jpg`;
      
      // Upload to organized Dropbox folder structure
      let dropboxPath = "";
      let dropboxUploadFailed = false;
      let coasDropboxPath = ""; // Store COAs path for limited edition artworks
      try {
        console.log(`[Dropbox] Starting upload for: ${title} by ${artistName}`);
        const { uploadToDropbox, createFolderStructure, createSubmissionFolderStructure, getRatioFolderName } = await import("./dropboxService");
        
        // Get dropbox base path from settings
        const formSettings = await storage.getFormSettings();
        const dropboxBasePath = formSettings?.dropboxBasePath || "/Artist Uploads 2026";
        
        // Create organized folder structure for this submission
        const submissionDate = new Date();
        const folderStructure = createSubmissionFolderStructure(artistName, submissionDate, uploadBatchId, dropboxBasePath);
        console.log(`[Dropbox] Folder structure created: ${folderStructure.basePath}`);
        
        // Save COAs path for limited edition artworks
        coasDropboxPath = folderStructure.coasPath;
        
        // Create base folders (HighRes, Low Res, Mockups)
        // Ratio subfolders (3-4, 2-3, A-Ratio, etc.) are created on-demand during upload
        console.log(`[Dropbox] Creating base folders...`);
        await createFolderStructure(folderStructure.basePath, folderStructure.baseSubfolders);
        
        // Get ratio folder name for organizing files
        const ratioFolder = getRatioFolderName(analysis.aspectRatio);
        
        // Upload high-res to ratio-based subfolder within HighRes
        const highResPath = folderStructure.getHighResPath(analysis.aspectRatio);
        console.log(`[Dropbox] Uploading high-res to: ${highResPath}/${highResFilename}`);
        const highResResult = await uploadToDropbox(
          fileBuffer,
          highResPath,
          highResFilename
        );
        dropboxPath = highResResult.path;
        console.log(`[Dropbox] High-res uploaded successfully to ${ratioFolder} folder`);
        
        // Upload low-res to ratio-based subfolder within Low Res (only for main artworks, not additional files)
        if (lowResBuffer && !isAdditionalFile) {
          const lowResPath = folderStructure.getLowResPath(analysis.aspectRatio);
          console.log(`[Dropbox] Uploading low-res to: ${lowResPath}/${lowResFilename}`);
          await uploadToDropbox(
            lowResBuffer,
            lowResPath,
            lowResFilename
          );
          console.log(`[Dropbox] Low-res uploaded successfully to ${ratioFolder} folder`);
        } else if (isAdditionalFile) {
          console.log(`[Dropbox] Skipping low-res for additional file`);
        }
        
        console.log(`[Dropbox] SUCCESS - Uploaded to organized structure: ${folderStructure.basePath}`);
      } catch (dropboxError) {
        console.error("[Dropbox] UPLOAD FAILED - Error details:", dropboxError);
        console.error("[Dropbox] Error stack:", (dropboxError as Error)?.stack);
        
        // If Dropbox is disconnected, return error to user instead of silently continuing
        if (dropboxError instanceof IntegrationDisconnectedError) {
          return res.status(503).json({
            error: "Dropbox integration disconnected",
            message: "The Dropbox integration needs to be reconnected. Please contact the administrator to reconnect Dropbox in the Replit integrations panel before submitting artworks.",
            details: "Artwork uploads require Dropbox backup for archival purposes."
          });
        }
        
        // For other errors, set flag and continue (network issues, etc.)
        console.warn("[Dropbox] Continuing upload without Dropbox backup due to error");
        dropboxUploadFailed = true;
      }
      const comments = req.body.comments || undefined;
      const signature = req.body.signature || undefined;
      
      // Get selected sizes from artist or default to all calculated sizes
      let selectedSizes = analysis.availableSizes;
      if (req.body.selectedSizes) {
        try {
          const parsed = JSON.parse(req.body.selectedSizes);
          // Validate that all selected sizes are in calculated sizes
          const validSizes = parsed.filter((size: string) => analysis.availableSizes.includes(size));
          if (validSizes.length >= 2) {
            selectedSizes = validSizes;
          }
        } catch (e) {
          console.error("Failed to parse selectedSizes:", e);
        }
      }

      // Create artwork record
      const artworkData = insertArtworkSchema.parse({
        artistName,
        artistEmail,
        title,
        comments,
        signature,
        editionType,
        editionSize: editionType === "limited" ? editionSize : undefined,
        artworkStory,
        artistSignatureFileUrl,
        originalFilename: artworkFile.originalname,
        originalFileUrl: originalUrl,
        lowResFileUrl: lowResUrl,
        dropboxPath,
        dropboxUploadFailed,
        uploadBatchId,
        widthPx: analysis.widthPx,
        heightPx: analysis.heightPx,
        dpi: analysis.effectiveDpi, // Use effective DPI at max print size
        aspectRatio: analysis.aspectRatio,
        maxPrintSize: analysis.maxPrintSize,
        calculatedSizes: analysis.availableSizes, // All sizes calculated from DPI
        availableSizes: selectedSizes, // Artist's selection or all calculated
        description: req.body.description,
        vendor: req.body.vendor,
        tags: req.body.tags ? JSON.parse(req.body.tags) : [],
        styleTags: (() => { try { return req.body.styleTags ? JSON.parse(req.body.styleTags) : []; } catch { return []; } })(),
        colourTags: (() => { try { return req.body.colourTags ? JSON.parse(req.body.colourTags) : []; } catch { return []; } })(),
        moodTags: (() => { try { return req.body.moodTags ? JSON.parse(req.body.moodTags) : []; } catch { return []; } })(),
        themeTags: (() => { try { return req.body.themeTags ? JSON.parse(req.body.themeTags) : []; } catch { return []; } })(),
        hasMount: analysis.aspectRatio === "Square (1:1)" ? true : undefined,
        status: "analyzed",
      });

      const artwork = await storage.createArtwork(artworkData);
      
      // AI fallback for empty tag categories (fire-and-forget)
      const hasStyleTags = artworkData.styleTags && artworkData.styleTags.length > 0;
      const hasColourTags = artworkData.colourTags && artworkData.colourTags.length > 0;
      const hasMoodTags = artworkData.moodTags && artworkData.moodTags.length > 0;
      const hasThemeTags = artworkData.themeTags && artworkData.themeTags.length > 0;
      
      if ((!hasStyleTags || !hasColourTags || !hasMoodTags || !hasThemeTags) && artwork.lowResFileUrl) {
        (async () => {
          try {
            const { ARTWORK_TAG_OPTIONS } = await import("@shared/schema");
            console.log(`[AI Tags] Generating fallback tags for "${artwork.title}" - missing: ${[!hasStyleTags && 'style', !hasColourTags && 'colour', !hasMoodTags && 'mood', !hasThemeTags && 'themes'].filter(Boolean).join(', ')}`);
            
            const objectStorageService = new ObjectStorageService();
            const imageBuffer = await objectStorageService.downloadFileAsBuffer(artwork.lowResFileUrl);
            
            const aiOptions: MetadataOptions = {
              styleOptions: ARTWORK_TAG_OPTIONS.style as unknown as string[],
              colourOptions: ARTWORK_TAG_OPTIONS.colour as unknown as string[],
              moodOptions: ARTWORK_TAG_OPTIONS.mood as unknown as string[],
              themeOptions: ARTWORK_TAG_OPTIONS.themes as unknown as string[],
            };
            
            const metadata = await generateArtworkMetadataFromFile(
              imageBuffer,
              artwork.title,
              artwork.artistName,
              aiOptions
            );
            
            const updates: Record<string, string[]> = {};
            if (!hasStyleTags && metadata.styles?.length > 0) updates.styleTags = metadata.styles;
            if (!hasColourTags && metadata.colours?.length > 0) updates.colourTags = metadata.colours;
            if (!hasMoodTags && metadata.moods?.length > 0) updates.moodTags = metadata.moods;
            if (!hasThemeTags && metadata.themes?.length > 0) updates.themeTags = metadata.themes;
            
            if (Object.keys(updates).length > 0) {
              await storage.updateArtwork(artwork.id, updates);
              console.log(`[AI Tags] Updated "${artwork.title}" with AI-generated tags: ${Object.entries(updates).map(([k, v]) => `${k}(${v.length})`).join(', ')}`);
            }
          } catch (aiError) {
            console.error(`[AI Tags] Failed to generate fallback tags for "${artwork.title}":`, aiError);
          }
        })();
      }

      // Generate COAs for limited edition artworks in the background (fire-and-forget)
      if (editionType === "limited" && artwork.editionSize) {
        // Don't await - let this run in the background after response is sent
        (async () => {
          try {
            console.log(`[COA] Starting background COA generation for limited edition: ${artwork.title}`);
            
            // Get default COA layout if available
            const defaultLayout = await storage.getDefaultCOALayout();
            
            // Sanitize artwork title for folder name
            const sanitizedTitle = artwork.title
              .replace(/[^a-zA-Z0-9\s]/g, '')
              .replace(/\s+/g, '_')
              .trim() || `Artwork_${artwork.id}`;
            
            // Create artwork-specific subfolder within COAs: /COAs/Artwork_Title/
            const baseCoasPath = coasDropboxPath || `/Artist Uploads 2026/COAs_Fallback`;
            const effectiveCoasPath = `${baseCoasPath}/${sanitizedTitle}`;
            
            const coaResult = await generateAndUploadCOAs(artwork, effectiveCoasPath, defaultLayout);
            
            // Update artwork with COA URLs (only store Dropbox path if it succeeded)
            await storage.updateArtwork(artwork.id, {
              coaUrls: coaResult.coaUrls,
              coaDropboxPath: coaResult.coaDropboxPath || undefined,
            });
            
            console.log(`[COA] Background COA generation complete: ${coaResult.coaUrls.length} COAs created`);
          } catch (coaError) {
            console.error("[COA] Background COA generation failed:", coaError);
            // COA generation failed but artwork is still valid - it was already saved
          }
        })();
      }

      // Auto-generate product mockups + scan video via queue (prevents memory exhaustion)
      {
        const _artworkId = artwork.id;
        const _artworkTitle = artwork.title;
        const _aspectRatio = artwork.aspectRatio;
        const _widthPx = artwork.widthPx;
        const _heightPx = artwork.heightPx;
        const _artistName = artwork.artistName;
        const _imgUrl = artwork.originalFileUrl || artwork.lowResFileUrl;
        const _artworkDropboxPath = artwork.dropboxPath;

        mockupQueue.enqueue(_artworkId, _artworkTitle, async () => {
          if (!_imgUrl) {
            console.log(`[AutoMockup] Skipping "${_artworkTitle}" - no image available`);
            return;
          }

          const objStore = new ObjectStorageService();
          let artBuffer: Buffer;
          if (_imgUrl.startsWith("/objects/")) {
            artBuffer = await objStore.downloadFileAsBuffer(_imgUrl);
          } else {
            const imgResp = await fetch(_imgUrl);
            if (!imgResp.ok) {
              console.error(`[AutoMockup] Failed to fetch image for "${_artworkTitle}"`);
              return;
            }
            artBuffer = Buffer.from(await imgResp.arrayBuffer());
          }

          const srcMeta = await sharp(artBuffer).metadata();
          const maxMockupDim = 3000;
          if (srcMeta.width && srcMeta.height && Math.max(srcMeta.width, srcMeta.height) > maxMockupDim) {
            const scale = maxMockupDim / Math.max(srcMeta.width, srcMeta.height);
            artBuffer = await sharp(artBuffer)
              .resize(Math.round(srcMeta.width * scale), Math.round(srcMeta.height * scale), { fit: "fill" })
              .jpeg({ quality: 90 })
              .toBuffer();
            console.log(`[AutoMockup] Resized source from ${srcMeta.width}x${srcMeta.height} to ${Math.round(srcMeta.width * scale)}x${Math.round(srcMeta.height * scale)} (${(artBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
          }

          const sanitize = (s: string) => s.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
          const artSlug = sanitize(_artistName);
          const titSlug = sanitize(_artworkTitle);

          const ratioCategory = aspectRatioToCategory(_aspectRatio);
          if (ratioCategory !== "custom") {
            const orientation: "portrait" | "landscape" = (_widthPx > _heightPx) ? "landscape" : "portrait";
            const validFrames = ["black", "white", "natural", "unframed"] as const;

            for (const frame of validFrames) {
              const buf = await generateProductMockup(artBuffer, ratioCategory, frame, orientation);
              const frameLabel = frame === "unframed" ? "Unframed" : `${frame.charAt(0).toUpperCase() + frame.slice(1)}-Frame`;
              const fname = `mockups/${artSlug}/${titSlug}_${frameLabel}.jpg`;
              const url = await objStore.uploadFile(buf, fname, "image/jpeg");
              const frameType = frame === "unframed" ? "Unframed" : `${frame.charAt(0).toUpperCase() + frame.slice(1)} Frame`;
              const mockup = await storage.createMockup({
                artworkId: _artworkId,
                frameType,
                mockupImageUrl: url,
                isLifestyle: false,
              });
              const dbxPath = await syncMockupToDropbox(buf, _artworkDropboxPath, `${titSlug}_${frameLabel}.jpg`);
              if (dbxPath) await storage.updateMockup(mockup.id, { dropboxPath: dbxPath });
            }
            console.log(`[AutoMockup] Generated 4 product mockups for "${_artworkTitle}"`);
          } else {
            console.log(`[AutoMockup] Skipping product mockups for "${_artworkTitle}" - unsupported ratio: ${_aspectRatio}`);
          }

          const videoBuffer = await generateArtworkScanVideo(artBuffer, {
            outputWidth: 1080, outputHeight: 1350, fps: 30, variant: 5,
          });
          const videoFilename = `mockups/${artSlug}/${titSlug}_Scan-Video.mp4`;
          const videoUrl = await objStore.uploadFile(videoBuffer, videoFilename, "video/mp4");
          const videoMockup = await storage.createMockup({
            artworkId: _artworkId,
            frameType: "Scan Video",
            mockupImageUrl: videoUrl,
            isLifestyle: false,
          });
          const videoDbxPath = await syncMockupToDropbox(videoBuffer, _artworkDropboxPath, `${titSlug}_Scan-Video.mp4`);
          if (videoDbxPath) await storage.updateMockup(videoMockup.id, { dropboxPath: videoDbxPath });
          console.log(`[AutoMockup] Generated scan video for "${_artworkTitle}" (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB)`);

          // Auto-generate lifestyle mockups for matching templates
          try {
            const allTemplates = await storage.getAllTemplates();
            let lifestyleCount = 0;
            for (const template of allTemplates) {
              if (!template.frameZones || template.frameZones.length === 0) continue;
              if (template.artistVendorName && template.artistVendorName !== _artistName) continue;

              for (let zi = 0; zi < template.frameZones.length; zi++) {
                const zone = template.frameZones[zi];
                const zoneRatio = detectZoneRatio(zone);
                if (!artworkMatchesRatio(_aspectRatio, zoneRatio)) continue;

                try {
                  const templateImageUrl = template.templateImageUrl;
                  let templateBuffer: Buffer;
                  if (templateImageUrl.startsWith("/objects/")) {
                    templateBuffer = await objStore.downloadFileAsBuffer(templateImageUrl);
                  } else {
                    const tResp = await fetch(templateImageUrl);
                    if (!tResp.ok) continue;
                    templateBuffer = Buffer.from(await tResp.arrayBuffer());
                  }

                  const templateMeta = await sharp(templateBuffer).metadata();
                  const tW = templateMeta.width!;
                  const tH = templateMeta.height!;

                  const dstCorners: Point[] = [
                    { x: (zone.topLeft.x / 100) * tW, y: (zone.topLeft.y / 100) * tH },
                    { x: (zone.topRight.x / 100) * tW, y: (zone.topRight.y / 100) * tH },
                    { x: (zone.bottomRight.x / 100) * tW, y: (zone.bottomRight.y / 100) * tH },
                    { x: (zone.bottomLeft.x / 100) * tW, y: (zone.bottomLeft.y / 100) * tH },
                  ];

                  const { result: lifestyleResult } = await compositeWithPerspective(
                    templateBuffer,
                    artBuffer,
                    dstCorners,
                    {
                      blendMode: zone.blendMode || "multiply",
                      blendOpacity: zone.blendOpacity !== undefined ? zone.blendOpacity : 0.8,
                    },
                  );

                  const templateSlug = sanitize(template.name);
                  const lifestyleFilename = `mockups/${artSlug}/${titSlug}_${templateSlug}_lifestyle.jpg`;
                  const lifestyleUrl = await objStore.uploadFile(lifestyleResult, lifestyleFilename, "image/jpeg");

                  const existingMockups = await storage.getMockupsByArtwork(_artworkId);
                  const existingLifestyle = existingMockups.find(
                    m => m.isLifestyle && m.templateId === template.id
                  );
                  if (existingLifestyle) {
                    await storage.deleteMockup(existingLifestyle.id);
                  }

                  const lifestyleMockup = await storage.createMockup({
                    artworkId: _artworkId,
                    templateId: template.id,
                    frameType: "Lifestyle",
                    mockupImageUrl: lifestyleUrl,
                    isLifestyle: true,
                  });
                  const lifestyleDbxPath = await syncMockupToDropbox(lifestyleResult, _artworkDropboxPath, `${titSlug}_${templateSlug}_lifestyle.jpg`);
                  if (lifestyleDbxPath) await storage.updateMockup(lifestyleMockup.id, { dropboxPath: lifestyleDbxPath });
                  lifestyleCount++;
                  console.log(`[AutoMockup] Generated lifestyle mockup for "${_artworkTitle}" using template "${template.name}" zone ${zi}`);
                } catch (lifestyleErr) {
                  console.error(`[AutoMockup] Lifestyle failed for template "${template.name}" zone ${zi}:`, lifestyleErr);
                }
                break;
              }
            }
            if (lifestyleCount > 0) {
              console.log(`[AutoMockup] Generated ${lifestyleCount} lifestyle mockup(s) for "${_artworkTitle}"`);
            }
          } catch (lifestyleErr) {
            console.error(`[AutoMockup] Lifestyle generation error for "${_artworkTitle}":`, lifestyleErr);
          }
        });
      }
      
      return artwork;
      }, taskId);
      
      // Return the artwork from the queue
      res.json(result);
    } catch (error) {
      logError("/api/artworks", "POST", error, {
        requestBody: { 
          artistName: req.body.artistName, 
          title: req.body.title,
          editionType: req.body.editionType,
          uploadBatchId: req.body.uploadBatchId,
        },
        userAgent: req.get('user-agent'),
        ip: req.ip,
      });
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ 
        error: "Failed to create artwork",
        message: err.message,
        type: err.name,
      });
    } finally {
      // Clean up temp files from disk storage
      try {
        if (artworkFile.path && existsSync(artworkFile.path)) {
          unlinkSync(artworkFile.path);
          console.log(`[Upload] Cleaned up temp file: ${artworkFile.path}`);
        }
        if (files.signatureFile?.[0]?.path && existsSync(files.signatureFile[0].path)) {
          unlinkSync(files.signatureFile[0].path);
        }
      } catch (cleanupErr) {
        console.warn('[Upload] Failed to clean up temp file:', cleanupErr);
      }
    }
  });

  // Complete batch upload - send consolidated batch emails and auto-group artworks
  app.post("/api/artworks/batch-complete", async (req, res) => {
    try {
      const { uploadBatchId, skipEmails } = req.body;
      
      if (!uploadBatchId) {
        return res.status(400).json({ error: "uploadBatchId is required" });
      }

      // Get all artworks in this batch
      const allArtworks = await storage.getAllArtworks();
      const batchArtworks = allArtworks.filter(a => a.uploadBatchId === uploadBatchId);

      if (batchArtworks.length === 0) {
        return res.status(404).json({ error: "No artworks found for this batch" });
      }

      // Auto-group artworks with the same title (case-insensitive)
      // Group by normalized title to find artworks that should be merged
      const titleGroups: Map<string, typeof batchArtworks> = new Map();
      for (const artwork of batchArtworks) {
        const normalizedTitle = artwork.title.toLowerCase().trim();
        if (!titleGroups.has(normalizedTitle)) {
          titleGroups.set(normalizedTitle, []);
        }
        titleGroups.get(normalizedTitle)!.push(artwork);
      }

      // For each group with 2+ artworks, create a group
      let groupsCreated = 0;
      for (const [normalizedTitle, groupArtworks] of Array.from(titleGroups.entries())) {
        if (groupArtworks.length >= 2) {
          // Check if artworks have different aspect ratios (indicating they should be merged)
          const uniqueRatios = new Set(groupArtworks.map((a: typeof batchArtworks[0]) => a.aspectRatio));
          
          if (uniqueRatios.size > 1) {
            const artworkIds = groupArtworks.map((a: typeof batchArtworks[0]) => a.id);

            let bestArtwork = groupArtworks[0];
            let bestCount = -1;
            try {
              const allTemplates = await storage.getAllTemplates();
              for (const artwork of groupArtworks) {
                let matchCount = 0;
                for (const template of allTemplates) {
                  if (!template.frameZones || template.frameZones.length === 0) continue;
                  for (const zone of template.frameZones) {
                    const zoneRatio = detectZoneRatio(zone);
                    if (artworkMatchesRatio(artwork.aspectRatio, zoneRatio)) {
                      matchCount++;
                    }
                  }
                }
                const ratioCategory = aspectRatioToCategory(artwork.aspectRatio);
                const productMockups = ratioCategory !== "custom" ? 4 : 0;
                const totalMockups = productMockups + matchCount;
                console.log(`[Batch] Ratio ${artwork.aspectRatio} has ${totalMockups} potential mockups (${productMockups} product + ${matchCount} lifestyle)`);
                if (totalMockups > bestCount) {
                  bestCount = totalMockups;
                  bestArtwork = artwork;
                }
              }
            } catch (err) {
              console.error(`[Batch] Error counting template matches, using first artwork as primary:`, err);
            }

            const primaryId = bestArtwork.id;
            
            try {
              await storage.groupArtworks(artworkIds, primaryId);
              groupsCreated++;
              console.log(`[Batch] Auto-grouped ${groupArtworks.length} artworks with title "${groupArtworks[0].title}" — primary ratio: ${bestArtwork.aspectRatio} (${bestCount} mockups)`);
            } catch (groupError) {
              console.error(`[Batch] Failed to auto-group artworks with title "${groupArtworks[0].title}":`, groupError);
            }
          }
        }
      }

      // Get artist info from first artwork
      const firstArtwork = batchArtworks[0];
      const artistEmail = firstArtwork.artistEmail;
      const artistName = firstArtwork.artistName;

      // Prepare batch email data
      const submissionDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const artworksSummary: BatchArtworkSummary[] = batchArtworks.map(artwork => ({
        title: artwork.title,
        dimensions: `${artwork.widthPx} × ${artwork.heightPx}px`,
        dpi: artwork.dpi,
        aspectRatio: artwork.aspectRatio,
        availableSizes: artwork.availableSizes || [],
      }));

      // Send batch emails (unless skipEmails is true, e.g., for onboarding which sends its own emails)
      let emailResults = { artistEmailSent: false, adminEmailSent: false };
      if (!skipEmails) {
        const adminDashboardUrl = `${req.protocol}://${req.get('host')}/admin/artworks`;
        emailResults = await sendBatchSubmissionEmails(
          artistEmail || '',
          {
            artistName,
            artworks: artworksSummary,
            submissionDate,
          },
          adminDashboardUrl
        );
      }

      // Fire-and-forget: if 5+ artworks, generate social media drafts for new collection
      if (batchArtworks.length >= 5 && artistName) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        (async () => {
          try {
            const batchArtistEmail = firstArtwork.artistEmail || "";
            const vendor = firstArtwork.vendor || artistName;
            const isExclusive = await resolveArtistExclusivity(storage, vendor, batchArtistEmail);

            const artistAccount = await storage.getArtistAccountByVendor(vendor);
            const bio = artistAccount?.bio || `Artist at East Side Studio London`;

            const artistDetails: ArtistPostDetails = {
              name: artistName,
              alias: artistAccount?.artistAlias || undefined,
              bio,
              isExclusive,
            };
            console.log(`[Postpone] Generating new-collection social media drafts for ${artistName} (${batchArtworks.length} artworks, exclusive: ${isExclusive})`);
            const captions = await generateArtistLaunchPost(artistDetails, "new_collection");
            const imagePath = firstArtwork.lowResFileUrl || firstArtwork.originalFileUrl || undefined;
            const mediaUrl = imagePath && imagePath.startsWith("/") ? `${baseUrl}${imagePath}` : imagePath;
            await createDraftPosts(captions, mediaUrl);
          } catch (err) {
            console.error(`[Postpone] Error creating new-collection social media drafts for ${artistName}:`, err);
          }
        })();
      }

      res.json({
        success: true,
        artworksProcessed: batchArtworks.length,
        groupsCreated,
        emailsSent: emailResults,
        emailsSkipped: !!skipEmails,
      });
    } catch (error) {
      console.error("Error completing batch:", error);
      res.status(500).json({ error: "Failed to complete batch processing" });
    }
  });

  // Update artwork
  app.patch("/api/artworks/:id", requireAuth, async (req, res) => {
    try {
      const artwork = await storage.updateArtwork(req.params.id, req.body);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }
      res.json(artwork);
    } catch (error) {
      console.error("Error updating artwork:", error);
      res.status(500).json({ error: "Failed to update artwork" });
    }
  });

  // Update artwork selected sizes
  app.patch("/api/artworks/:id/sizes", requireAuth, async (req, res) => {
    try {
      const { selectedSizes } = req.body;
      
      if (!Array.isArray(selectedSizes)) {
        return res.status(400).json({ error: "selectedSizes must be an array" });
      }
      
      if (selectedSizes.length < 2) {
        return res.status(400).json({ 
          error: "Artworks must have at least 2 print sizes selected" 
        });
      }
      
      // Get artwork to validate sizes
      const artwork = await storage.getArtwork(req.params.id);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }
      
      // Validate that all selected sizes are in calculatedSizes
      const invalidSizes = selectedSizes.filter(
        size => !artwork.calculatedSizes.includes(size)
      );
      
      if (invalidSizes.length > 0) {
        return res.status(400).json({ 
          error: `Invalid sizes: ${invalidSizes.join(', ')}. These sizes were not calculated for this artwork.` 
        });
      }
      
      // Update availableSizes
      const updated = await storage.updateArtwork(req.params.id, {
        availableSizes: selectedSizes,
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating artwork sizes:", error);
      res.status(500).json({ error: "Failed to update artwork sizes" });
    }
  });

  app.post("/api/admin/high-res-review/push-sizes", requireAuth, async (req, res) => {
    try {
      const { productId, artworkId, sizeCodes } = req.body;
      if (!productId || !artworkId || !Array.isArray(sizeCodes) || sizeCodes.length === 0) {
        return res.status(400).json({ error: "productId, artworkId, and sizeCodes are required" });
      }

      const ALLOWED_SIZES = ["5x7", "8x10", "11x14", "16x20", "18x24", "24x30", "32x40"];
      const validSizeCodes = sizeCodes.filter((s: string) => typeof s === "string" && ALLOWED_SIZES.includes(s));
      if (validSizeCodes.length === 0) {
        return res.status(400).json({ error: `No valid size codes provided. Allowed: ${ALLOWED_SIZES.join(", ")}` });
      }

      const artwork = await storage.getArtwork(artworkId);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }

      const allVariantConfigs = await storage.getAllVariantConfigs();
      const { addSizeVariantsToProduct } = await import("./shopifyService");
      const result = await addSizeVariantsToProduct(productId, validSizeCodes, allVariantConfigs);

      if (!result.success) {
        return res.status(500).json({ error: result.error, addedCount: result.addedCount });
      }

      const newAvailable = [...new Set([...artwork.availableSizes, ...validSizeCodes])];
      const newCalculated = [...new Set([...artwork.calculatedSizes, ...validSizeCodes])];
      await storage.updateArtwork(artworkId, { availableSizes: newAvailable, calculatedSizes: newCalculated });

      res.json({ success: true, addedCount: result.addedCount, newAvailableSizes: newAvailable });
    } catch (error: any) {
      console.error("[HighResReview] Error pushing sizes:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Retry Dropbox upload for artwork
  app.post("/api/artworks/:id/retry-dropbox", requireAuth, async (req, res) => {
    try {
      const artwork = await storage.getArtwork(req.params.id);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }
      
      // Check if already uploaded to Dropbox
      if (artwork.dropboxPath && !artwork.dropboxUploadFailed) {
        return res.status(400).json({ 
          error: "Artwork already uploaded to Dropbox",
          dropboxPath: artwork.dropboxPath
        });
      }
      
      // Fetch the original file from object storage
      const originalUrl = artwork.originalFileUrl;
      const lowResUrl = artwork.lowResFileUrl;
      
      if (!originalUrl) {
        return res.status(400).json({ error: "Original file URL not found" });
      }
      
      console.log(`[Dropbox Retry] Starting retry for: ${artwork.title} by ${artwork.artistName}`);
      
      // Download files from object storage
      const objectStorageService = new ObjectStorageService();
      
      let originalBuffer: Buffer;
      let lowResBuffer: Buffer | null = null;
      
      try {
        originalBuffer = await objectStorageService.downloadFileAsBuffer(originalUrl);
        if (lowResUrl) {
          lowResBuffer = await objectStorageService.downloadFileAsBuffer(lowResUrl);
        }
      } catch (downloadError) {
        console.error("[Dropbox Retry] Failed to download from object storage:", downloadError);
        return res.status(500).json({ error: "Failed to download original file from storage" });
      }
      
      // Prepare filenames (preserve Unicode, remove filesystem-unsafe chars)
      const sanitizeForFilename = (str: string) =>
        str
          .replace(/[<>:"/\\|?*\x00-\x1f]/g, "") // Only remove filesystem-unsafe chars
          .replace(/\s+/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_|_$/g, "")
          .trim();
      
      const fileExt = artwork.originalFilename.split('.').pop() || 'jpg';
      const sanitizedArtist = sanitizeForFilename(artwork.artistName);
      const sanitizedTitle = sanitizeForFilename(artwork.title);
      const sanitizedRatio = sanitizeForFilename(artwork.aspectRatio.replace(/[()]/g, ''));
      
      const highResFilename = `${sanitizedArtist}_${sanitizedTitle}_${sanitizedRatio}.${fileExt}`;
      const lowResFilename = `LowRes_${sanitizedArtist}_${sanitizedTitle}_${sanitizedRatio}.jpg`;
      
      try {
        const { uploadToDropbox, createFolderStructure, createSubmissionFolderStructure, getRatioFolderName } = await import("./dropboxService");
        
        // Get dropbox base path from settings
        const formSettings = await storage.getFormSettings();
        const dropboxBasePath = formSettings?.dropboxBasePath || "/Artist Uploads 2026";
        
        // Use existing uploadBatchId or create one based on artwork creation
        const submissionDate = new Date(artwork.uploadedAt || artwork.createdAt);
        const uploadBatchId = artwork.uploadBatchId || artwork.id;
        const folderStructure = createSubmissionFolderStructure(artwork.artistName, submissionDate, uploadBatchId, dropboxBasePath);
        
        console.log(`[Dropbox Retry] Folder structure: ${folderStructure.basePath}`);
        await createFolderStructure(folderStructure.basePath, folderStructure.baseSubfolders);
        
        // Get ratio folder name for organizing files
        const ratioFolder = getRatioFolderName(artwork.aspectRatio);
        
        // Upload high-res to ratio-based subfolder
        const highResPath = folderStructure.getHighResPath(artwork.aspectRatio);
        console.log(`[Dropbox Retry] Uploading high-res to: ${highResPath}/${highResFilename}`);
        const highResResult = await uploadToDropbox(
          originalBuffer,
          highResPath,
          highResFilename
        );
        const dropboxPath = highResResult.path;
        console.log(`[Dropbox Retry] High-res uploaded successfully to ${ratioFolder} folder`);
        
        // Upload low-res to ratio-based subfolder if available
        if (lowResBuffer) {
          const lowResPath = folderStructure.getLowResPath(artwork.aspectRatio);
          console.log(`[Dropbox Retry] Uploading low-res to: ${lowResPath}/${lowResFilename}`);
          await uploadToDropbox(
            lowResBuffer,
            lowResPath,
            lowResFilename
          );
          console.log(`[Dropbox Retry] Low-res uploaded successfully to ${ratioFolder} folder`);
        }
        
        // Update artwork with dropbox path and clear failed flag
        const updated = await storage.updateArtwork(req.params.id, {
          dropboxPath,
          dropboxUploadFailed: false,
        });
        
        console.log(`[Dropbox Retry] SUCCESS - Uploaded to: ${dropboxPath}`);
        res.json({ 
          success: true, 
          dropboxPath,
          artwork: updated 
        });
      } catch (dropboxError) {
        console.error("[Dropbox Retry] FAILED:", dropboxError);
        
        if (dropboxError instanceof IntegrationDisconnectedError) {
          return res.status(503).json({
            error: "Dropbox integration disconnected",
            message: "Please reconnect Dropbox in the Replit integrations panel"
          });
        }
        
        return res.status(500).json({ 
          error: "Failed to upload to Dropbox",
          message: (dropboxError as Error).message 
        });
      }
    } catch (error) {
      console.error("Error retrying Dropbox upload:", error);
      // Mark as failed if there was an error
      try {
        await storage.updateArtwork(req.params.id, { dropboxUploadFailed: true });
      } catch (updateError) {
        console.error("Failed to update artwork failure status:", updateError);
      }
      res.status(500).json({ error: "Failed to retry Dropbox upload" });
    }
  });

  // Delete artwork
  app.delete("/api/artworks/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteArtwork(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Artwork not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting artwork:", error);
      res.status(500).json({ error: "Failed to delete artwork" });
    }
  });

  // Group artworks into single product
  app.post("/api/artworks/group", requireAuth, async (req, res) => {
    try {
      const { artworkIds, primaryId } = req.body;
      
      if (!Array.isArray(artworkIds) || artworkIds.length < 2) {
        return res.status(400).json({ error: "Must provide at least 2 artwork IDs to group" });
      }
      
      if (!primaryId || !artworkIds.includes(primaryId)) {
        return res.status(400).json({ error: "Primary ID must be one of the artwork IDs" });
      }
      
      // Validate that all artworks exist
      const artworks = await Promise.all(
        artworkIds.map(id => storage.getArtwork(id))
      );
      
      if (artworks.some(artwork => !artwork)) {
        return res.status(404).json({ error: "One or more artworks not found" });
      }
      
      // Check if any artwork is already in a group
      // All artworks must either be ungrouped or already in the same group being regrouped
      const existingGroupIds = new Set(
        artworks.filter(a => a && a.groupId).map(a => a!.groupId)
      );
      
      if (existingGroupIds.size > 1) {
        return res.status(400).json({ 
          error: "Artworks belong to different groups. Ungroup them first." 
        });
      }
      
      // If artworks are already grouped, ensure we're regrouping the ENTIRE existing group
      if (existingGroupIds.size === 1) {
        const existingGroupId = Array.from(existingGroupIds)[0];
        
        // Fetch all artworks that share this groupId
        const allArtworks = await storage.getAllArtworks();
        const allInExistingGroup = allArtworks.filter(a => a.groupId === existingGroupId);
        
        // Verify that the request includes all members of the existing group
        const allGroupMemberIds = new Set(allInExistingGroup.map(a => a.id));
        const requestedIds = new Set(artworkIds);
        
        const missingMembers = allInExistingGroup.filter(a => !requestedIds.has(a.id));
        
        if (missingMembers.length > 0) {
          return res.status(400).json({ 
            error: `Cannot regroup a subset of an existing group. Include all ${allInExistingGroup.length} artworks or ungroup first.` 
          });
        }
      }
      
      await storage.groupArtworks(artworkIds, primaryId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error grouping artworks:", error);
      res.status(500).json({ error: "Failed to group artworks" });
    }
  });

  // Ungroup artworks
  app.post("/api/artworks/ungroup", requireAuth, async (req, res) => {
    try {
      const { artworkIds } = req.body;
      
      if (!Array.isArray(artworkIds) || artworkIds.length === 0) {
        return res.status(400).json({ error: "Must provide at least 1 artwork ID to ungroup" });
      }
      
      await storage.ungroupArtworks(artworkIds);
      res.json({ success: true });
    } catch (error) {
      console.error("Error ungrouping artworks:", error);
      res.status(500).json({ error: "Failed to ungroup artworks" });
    }
  });

  // ========== Templates API ==========

  // Get all templates (admin only)
  app.get("/api/templates", requireAuth, async (req, res) => {
    try {
      const templates = await storage.getAllTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error getting templates:", error);
      res.status(500).json({ error: "Failed to get templates" });
    }
  });

  // Get single template (admin only)
  app.get("/api/templates/:id", requireAuth, async (req, res) => {
    try {
      const template = await storage.getTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error getting template:", error);
      res.status(500).json({ error: "Failed to get template" });
    }
  });

  // Create template (admin only)
  app.post("/api/templates", requireAuth, upload.single("templateImage"), async (req, res) => {
    try {
      let templateImageUrl = "";
      
      if (req.file) {
        // Fix UTF-8 encoding for Unicode filenames
        req.file.originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        templateImageUrl = await objectStorageService.uploadFile(
          getFileBuffer(req.file),
          req.file.originalname,
          req.file.mimetype
        );
        cleanupTempFile(req.file);
      }

      const templateData = insertTemplateSchema.parse({
        name: req.body.name,
        description: req.body.description,
        templateImageUrl,
        frameZones: JSON.parse(req.body.frameZones || "[]"),
        supportedSizes: JSON.parse(req.body.supportedSizes || "[]"),
        artistVendorName: req.body.artistVendorName || null,
      });

      const template = await storage.createTemplate(templateData);
      res.json(template);
    } catch (error) {
      console.error("Error creating template:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  // Parse PSD file to extract frame zones
  app.post("/api/templates/parse-psd", requireAuth, upload.single("psdFile"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No PSD file uploaded" });
      }

      // Fix UTF-8 encoding for Unicode filenames
      req.file.originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      
      if (!req.file.originalname.toLowerCase().endsWith('.psd')) {
        return res.status(400).json({ error: "File must be a .psd (Photoshop) file" });
      }

      const psdData = await parsePSD(getFileBuffer(req.file));
      cleanupTempFile(req.file);
      res.json(psdData);
    } catch (error) {
      console.error("Error parsing PSD:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to parse PSD file" 
      });
    }
  });

  // Update template (admin only)
  app.patch("/api/templates/:id", requireAuth, async (req, res) => {
    try {
      const template = await storage.updateTemplate(req.params.id, req.body);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error updating template:", error);
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  // Delete template (admin only)
  app.delete("/api/templates/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteTemplate(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting template:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // ========== Mockups API ==========

  // Get all mockups (admin only)
  app.get("/api/mockups", requireAuth, async (req, res) => {
    try {
      const mockups = await storage.getAllMockups();
      res.json(mockups);
    } catch (error) {
      console.error("Error getting mockups:", error);
      res.status(500).json({ error: "Failed to get mockups" });
    }
  });

  // Generate mockups for artworks (creates background job)
  // Preview mockups from Dropbox (without importing)
  app.get("/api/mockups/preview-from-dropbox", requireAuth, async (req, res) => {
    try {
      const { previewMockupsFromDropbox } = await import("./mockupImporter.js");
      
      // Parse artworkIds from query params (comma-separated or array)
      let artworkIds: string[] | undefined;
      if (req.query.artworkIds) {
        if (typeof req.query.artworkIds === 'string') {
          const ids = req.query.artworkIds.split(',').filter(Boolean);
          artworkIds = ids.length > 0 ? ids : undefined;
        } else if (Array.isArray(req.query.artworkIds)) {
          const ids = req.query.artworkIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
          artworkIds = ids.length > 0 ? ids : undefined;
        }
      }
      
      console.log(`[API] Previewing Dropbox mockups${artworkIds && artworkIds.length > 0 ? ` for ${artworkIds.length} artworks` : ' (all)'}...`);
      const result = await previewMockupsFromDropbox(storage, "/Artist Uploads 2026", artworkIds);
      
      console.log(`[API] Preview complete: ${result.items.length} items found, ${result.errors.length} errors`);
      res.json(result);
    } catch (error) {
      console.error("Error previewing mockups from Dropbox:", error);
      res.status(500).json({ error: "Failed to preview mockups from Dropbox" });
    }
  });

  // Import selected mockups from Dropbox by path
  app.post("/api/mockups/import-selected", requireAuth, async (req, res) => {
    try {
      const { importSelectedMockups } = await import("./mockupImporter.js");
      const { selectedPaths, artworkAssignments } = req.body;
      
      if (!selectedPaths || !Array.isArray(selectedPaths)) {
        return res.status(400).json({ error: "selectedPaths array is required" });
      }
      
      console.log(`[API] Importing ${selectedPaths.length} selected mockups...`);
      if (artworkAssignments && Object.keys(artworkAssignments).length > 0) {
        console.log(`[API] With ${Object.keys(artworkAssignments).length} manual artwork assignments`);
      }
      const result = await importSelectedMockups(storage, selectedPaths, artworkAssignments);
      
      console.log(`[API] Import complete: ${result.success} succeeded, ${result.failed} failed, ${result.skipped} skipped`);
      res.json(result);
    } catch (error) {
      console.error("Error importing selected mockups:", error);
      res.status(500).json({ error: "Failed to import selected mockups" });
    }
  });

  // Delete a mockup
  app.delete("/api/mockups/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteMockup(id);
      
      if (deleted) {
        res.json({ success: true, message: "Mockup deleted" });
      } else {
        res.status(404).json({ error: "Mockup not found" });
      }
    } catch (error) {
      console.error("Error deleting mockup:", error);
      res.status(500).json({ error: "Failed to delete mockup" });
    }
  });

  // Mockup Settings - positioning/customization routes
  app.get("/api/artworks/:artworkId/mockup-settings", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getMockupSettingsForArtwork(req.params.artworkId);
      res.json(settings);
    } catch (error) {
      console.error("Error getting mockup settings:", error);
      res.status(500).json({ error: "Failed to get mockup settings" });
    }
  });

  app.get("/api/templates/:templateId/mockup-settings", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getMockupSettingsForTemplate(req.params.templateId);
      res.json(settings);
    } catch (error) {
      console.error("Error getting mockup settings:", error);
      res.status(500).json({ error: "Failed to get mockup settings" });
    }
  });

  app.post("/api/mockup-settings", requireAuth, async (req, res) => {
    try {
      const { artworkId, templateId, zoneId, positioning, enabled, previewUrl } = req.body;
      
      if (!artworkId || !templateId || !zoneId) {
        return res.status(400).json({ error: "artworkId, templateId, and zoneId are required" });
      }

      const settings = await storage.upsertMockupSettings({
        artworkId,
        templateId,
        zoneId,
        positioning: positioning ?? { scale: 1.0, offsetX: 0, offsetY: 0, rotation: 0 },
        enabled: enabled ?? true,
        previewUrl: previewUrl ?? null,
      });

      res.json(settings);
    } catch (error) {
      console.error("Error saving mockup settings:", error);
      res.status(500).json({ error: "Failed to save mockup settings" });
    }
  });

  app.delete("/api/mockup-settings/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteMockupSettings(req.params.id);
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Mockup settings not found" });
      }
    } catch (error) {
      console.error("Error deleting mockup settings:", error);
      res.status(500).json({ error: "Failed to delete mockup settings" });
    }
  });

  // Legacy: Import all mockups from Dropbox (kept for backwards compatibility)
  app.post("/api/mockups/import-from-dropbox", requireAuth, async (req, res) => {
    try {
      const { importMockupsFromDropbox } = await import("./mockupImporter.js");
      
      console.log("[API] Starting Dropbox mockup import...");
      const result = await importMockupsFromDropbox(storage);
      
      console.log(`[API] Import complete: ${result.success} succeeded, ${result.failed} failed`);
      res.json(result);
    } catch (error) {
      console.error("Error importing mockups from Dropbox:", error);
      res.status(500).json({ error: "Failed to import mockups from Dropbox" });
    }
  });

  app.post("/api/mockups/generate", requireAuth, async (req, res) => {
    try {
      const { artworkIds } = req.body;

      if (!artworkIds || !Array.isArray(artworkIds) || artworkIds.length === 0) {
        return res.status(400).json({ error: "Missing or invalid artworkIds array" });
      }

      // Verify artworks exist
      const artworks = await Promise.all(
        artworkIds.map(id => storage.getArtwork(id))
      );
      
      if (artworks.some(a => !a)) {
        return res.status(404).json({ error: "One or more artworks not found" });
      }

      // Get all templates for job
      const templates = await storage.getAllTemplates();
      const templateIds = templates.map(t => t.id);

      // Create job for background processing
      const job = await storage.createJob({
        type: "mockup_generation",
        status: "pending",
        progress: 0,
        artworkIds,
        templateIds,
      });

      res.json({ jobId: job.id, status: job.status });
    } catch (error) {
      console.error("Error creating mockup generation job:", error);
      res.status(500).json({ 
        error: "Failed to create job",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get mockups for an artwork
  app.get("/api/artworks/:id/mockups", requireAuth, async (req, res) => {
    try {
      const mockups = await storage.getMockupsByArtwork(req.params.id);
      res.json(mockups);
    } catch (error) {
      console.error("Error getting mockups:", error);
      res.status(500).json({ error: "Failed to get mockups" });
    }
  });

  // ========== Pending Mockups API ==========

  // Get all pending mockups (unassigned by default)
  app.get("/api/pending-mockups", requireAuth, async (req, res) => {
    try {
      const { status } = req.query;
      let pendingMockups;
      
      if (status === 'all') {
        pendingMockups = await storage.getAllPendingMockups();
      } else {
        pendingMockups = await storage.getUnassignedPendingMockups();
      }
      
      res.json(pendingMockups);
    } catch (error) {
      console.error("Error getting pending mockups:", error);
      res.status(500).json({ error: "Failed to get pending mockups" });
    }
  });

  // Get single pending mockup
  app.get("/api/pending-mockups/:id", requireAuth, async (req, res) => {
    try {
      const pending = await storage.getPendingMockup(req.params.id);
      if (!pending) {
        return res.status(404).json({ error: "Pending mockup not found" });
      }
      res.json(pending);
    } catch (error) {
      console.error("Error getting pending mockup:", error);
      res.status(500).json({ error: "Failed to get pending mockup" });
    }
  });

  // Assign pending mockup to an artwork
  app.post("/api/pending-mockups/:id/assign", requireAuth, async (req, res) => {
    try {
      const { artworkId, frameType } = req.body;
      
      if (!artworkId) {
        return res.status(400).json({ error: "artworkId is required" });
      }
      
      const pending = await storage.getPendingMockup(req.params.id);
      if (!pending) {
        return res.status(404).json({ error: "Pending mockup not found" });
      }
      
      const artwork = await storage.getArtwork(artworkId);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }
      
      // Use the preview URL as the mockup URL (it's already a Dropbox shared link)
      const mockupUrl = pending.previewUrl;
      if (!mockupUrl) {
        return res.status(400).json({ error: "Pending mockup has no preview URL" });
      }
      
      // Create the mockup record
      const mockup = await storage.createMockup({
        artworkId,
        templateId: null,
        frameType: frameType || pending.frameType,
        isLifestyle: pending.isLifestyle,
        mockupImageUrl: mockupUrl,
        dropboxPath: pending.dropboxPath,
      });
      
      // Update the pending mockup status
      await storage.updatePendingMockup(pending.id, {
        status: 'assigned',
        assignedArtworkId: artworkId,
        assignedMockupId: mockup.id,
      });
      
      res.json({ 
        success: true, 
        mockup,
        message: `Assigned to "${artwork.title}"` 
      });
    } catch (error: any) {
      console.error("Error assigning pending mockup:", error);
      
      // Check for duplicate key error
      if (error.code === '23505' || error.message?.includes('duplicate key')) {
        return res.status(409).json({ 
          error: "A mockup with this frame type already exists for this artwork" 
        });
      }
      
      res.status(500).json({ error: "Failed to assign pending mockup" });
    }
  });

  // Ignore/dismiss a pending mockup
  app.post("/api/pending-mockups/:id/ignore", requireAuth, async (req, res) => {
    try {
      const pending = await storage.getPendingMockup(req.params.id);
      if (!pending) {
        return res.status(404).json({ error: "Pending mockup not found" });
      }
      
      await storage.updatePendingMockup(pending.id, {
        status: 'ignored',
      });
      
      res.json({ success: true, message: "Mockup ignored" });
    } catch (error) {
      console.error("Error ignoring pending mockup:", error);
      res.status(500).json({ error: "Failed to ignore pending mockup" });
    }
  });

  // Delete a pending mockup
  app.delete("/api/pending-mockups/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deletePendingMockup(req.params.id);
      if (deleted) {
        res.json({ success: true, message: "Pending mockup deleted" });
      } else {
        res.status(404).json({ error: "Pending mockup not found" });
      }
    } catch (error) {
      console.error("Error deleting pending mockup:", error);
      res.status(500).json({ error: "Failed to delete pending mockup" });
    }
  });

  // Get mockups from Dropbox grouped by selected artworks (for artwork-first import flow)
  // Scans Dropbox directly to find available mockups
  app.post("/api/pending-mockups/for-artworks", requireAuth, async (req, res) => {
    try {
      const { artworkIds } = req.body;
      
      if (!artworkIds || !Array.isArray(artworkIds) || artworkIds.length === 0) {
        return res.status(400).json({ error: "artworkIds array is required" });
      }
      
      // Get artworks
      const artworks: Artwork[] = [];
      for (const id of artworkIds) {
        const artwork = await storage.getArtwork(id);
        if (artwork) {
          artworks.push(artwork);
        }
      }
      
      if (artworks.length === 0) {
        return res.status(404).json({ error: "No valid artworks found" });
      }
      
      // Import Dropbox scanning functions
      const { listFilesInFolder, createSharedLink, convertToRawDropboxUrl } = await import("./dropboxService.js");
      const { parseMockupFilename } = await import("./mockupImporter.js");
      
      // Scan Dropbox for mockup files - only from Pending folder
      const basePath = "/Artist Uploads 2026";
      const subfolders = ['Pending'];
      
      interface DropboxMockupFile {
        id: string;
        filename: string;
        path: string;
        parsedArtworkName: string;
        frameType: string;
        isLifestyle: boolean;
      }
      
      const allDropboxMockups: DropboxMockupFile[] = [];
      
      for (const subfolder of subfolders) {
        const subfolderPath = `${basePath}/${subfolder}`;
        console.log(`[API] Scanning subfolder: ${subfolderPath}`);
        try {
          const artistFolders = await listFilesInFolder(subfolderPath);
          console.log(`[API] Found ${artistFolders.length} items in ${subfolderPath}`);
          
          for (const artistFolder of artistFolders) {
            if (!artistFolder.isFolder) continue;
            console.log(`[API] Found artist folder: ${artistFolder.path}`);
            
            const mockupsPath = `${artistFolder.path}/Mockups`;
            console.log(`[API] Looking for Mockups at: ${mockupsPath}`);
            
            try {
              const mockupItems = await listFilesInFolder(mockupsPath);
              console.log(`[API] Found ${mockupItems.length} items in ${mockupsPath}`);
              
              for (const item of mockupItems) {
                if (item.isFolder) {
                  try {
                    const subfolderFiles = await listFilesInFolder(item.path);
                    for (const subfile of subfolderFiles) {
                      if (!subfile.isFolder && subfile.name.match(/\.(jpg|jpeg|png)$/i)) {
                        const parsed = parseMockupFilename(subfile.name, subfile.path);
                        if (parsed) {
                          console.log(`[API] Parsed subfile: ${subfile.name} -> artwork: "${parsed.artworkName}"`);
                          allDropboxMockups.push({
                            id: Buffer.from(subfile.path).toString('base64'),
                            filename: subfile.name,
                            path: subfile.path,
                            parsedArtworkName: parsed.artworkName,
                            frameType: parsed.frameType,
                            isLifestyle: parsed.isLifestyle,
                          });
                        }
                      }
                    }
                  } catch (e) {
                    // Ignore subfolder scan errors
                  }
                } else if (item.name.match(/\.(jpg|jpeg|png)$/i)) {
                  const parsed = parseMockupFilename(item.name, item.path);
                  if (parsed) {
                    console.log(`[API] Parsed direct file: ${item.name} -> artwork: "${parsed.artworkName}"`);
                    allDropboxMockups.push({
                      id: Buffer.from(item.path).toString('base64'),
                      filename: item.name,
                      path: item.path,
                      parsedArtworkName: parsed.artworkName,
                      frameType: parsed.frameType,
                      isLifestyle: parsed.isLifestyle,
                    });
                  }
                }
              }
            } catch (e) {
              // No Mockups folder or inaccessible
            }
          }
        } catch (e) {
          console.log(`[API] Could not access ${subfolderPath}, skipping...`);
        }
      }
      
      console.log(`[API] Found ${allDropboxMockups.length} available mockups from Dropbox`);
      
      // Helper to normalize text for matching
      const normalize = (text: string | null | undefined): string => {
        if (!text) return '';
        return text.toLowerCase().replace(/[^a-z0-9]/g, '');
      };
      
      // Group mockups by artwork
      const result: {
        artworkId: string;
        artworkTitle: string;
        artistName: string;
        pendingMockups: DropboxMockupFile[];
      }[] = [];
      
      const assignedMockupIds = new Set<string>();
      
      for (const artwork of artworks) {
        const normalizedTitle = normalize(artwork.title);
        const normalizedArtist = normalize(artwork.artistName);
        
        // Find mockups that match this artwork
        const matchingMockups = allDropboxMockups.filter(mockup => {
          if (assignedMockupIds.has(mockup.id)) return false;
          
          const normalizedParsedName = normalize(mockup.parsedArtworkName);
          
          // Match by artwork name (partial match OK)
          const titleMatch = normalizedParsedName && normalizedTitle && 
            (normalizedParsedName.includes(normalizedTitle) || normalizedTitle.includes(normalizedParsedName));
          
          return titleMatch;
        });
        
        // Track which mockups are already matched
        matchingMockups.forEach(m => assignedMockupIds.add(m.id));
        
        result.push({
          artworkId: artwork.id,
          artworkTitle: artwork.title,
          artistName: artwork.artistName,
          pendingMockups: matchingMockups,
        });
      }
      
      // Get unmatched mockups (those not matched to any selected artwork)
      const unmatchedMockups = allDropboxMockups.filter(m => !assignedMockupIds.has(m.id));
      
      res.json({
        artworkGroups: result,
        unmatchedPendingMockups: unmatchedMockups,
        totalPending: allDropboxMockups.length,
      });
    } catch (error) {
      console.error("Error getting pending mockups for artworks:", error);
      res.status(500).json({ error: "Failed to get pending mockups" });
    }
  });

  // Bulk assign mockups from Dropbox to artworks
  // pendingMockupIds are base64-encoded Dropbox paths
  app.post("/api/pending-mockups/bulk-assign", requireAuth, async (req, res) => {
    try {
      const { assignments } = req.body;
      
      if (!assignments || !Array.isArray(assignments)) {
        return res.status(400).json({ error: "assignments array is required" });
      }
      
      // Import Dropbox functions
      const { createSharedLink, convertToRawDropboxUrl } = await import("./dropboxService.js");
      const { parseMockupFilename } = await import("./mockupImporter.js");
      
      // assignments format: [{ artworkId: string, pendingMockupIds: string[] }]
      // pendingMockupIds are base64-encoded Dropbox paths
      const results: { success: number; errors: string[] } = { success: 0, errors: [] };
      
      for (const assignment of assignments) {
        const { artworkId, pendingMockupIds } = assignment;
        
        if (!artworkId || !pendingMockupIds || !Array.isArray(pendingMockupIds)) {
          results.errors.push(`Invalid assignment format`);
          continue;
        }
        
        const artwork = await storage.getArtwork(artworkId);
        if (!artwork) {
          results.errors.push(`Artwork ${artworkId} not found`);
          continue;
        }
        
        for (const encodedId of pendingMockupIds) {
          try {
            // Decode the base64-encoded path
            const dropboxPath = Buffer.from(encodedId, 'base64').toString('utf-8');
            const filename = dropboxPath.split('/').pop() || '';
            
            // Parse the filename to get frame type and lifestyle flag
            const parsed = parseMockupFilename(filename, dropboxPath);
            if (!parsed) {
              results.errors.push(`${filename}: Invalid filename format`);
              continue;
            }
            
            // Check if mockup already exists
            const existingMockups = await storage.getAllMockups();
            const existsByPath = existingMockups.some(m => m.dropboxPath === dropboxPath);
            if (existsByPath) {
              results.errors.push(`${filename}: Already imported`);
              continue;
            }
            
            // Create shared link for the mockup image
            let mockupUrl: string;
            try {
              mockupUrl = await createSharedLink(dropboxPath);
              mockupUrl = convertToRawDropboxUrl(mockupUrl);
            } catch (error: any) {
              results.errors.push(`${filename}: Failed to create Dropbox link`);
              continue;
            }
            
            // Create the mockup record
            const mockup = await storage.createMockup({
              artworkId,
              templateId: null,
              frameType: parsed.frameType,
              isLifestyle: parsed.isLifestyle,
              mockupImageUrl: mockupUrl,
              dropboxPath: dropboxPath,
            });
            
            results.success++;
            console.log(`[API] Imported mockup: ${filename} -> artwork ${artwork.title}`);
          } catch (error: any) {
            const filename = Buffer.from(encodedId, 'base64').toString('utf-8').split('/').pop() || encodedId;
            if (error.code === '23505' || error.message?.includes('duplicate key')) {
              results.errors.push(`${filename}: duplicate frame type for this artwork`);
            } else {
              results.errors.push(`${filename}: ${error.message}`);
            }
          }
        }
      }
      
      res.json({
        success: true,
        imported: results.success,
        errors: results.errors,
      });
    } catch (error) {
      console.error("Error bulk assigning pending mockups:", error);
      res.status(500).json({ error: "Failed to assign pending mockups" });
    }
  });

  // ========== Jobs API ==========

  // Get all jobs
  app.get("/api/jobs", async (req, res) => {
    try {
      const jobs = await storage.getAllJobs();
      res.json(jobs);
    } catch (error) {
      console.error("Error getting jobs:", error);
      res.status(500).json({ error: "Failed to get jobs" });
    }
  });

  // Get job by ID (for polling status)
  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      console.error("Error getting job:", error);
      res.status(500).json({ error: "Failed to get job" });
    }
  });

  // ========== Variant Configurations API ==========

  // Get all variant configs (admin only)
  app.get("/api/variant-configs", requireAuth, async (req, res) => {
    try {
      const configs = await storage.getAllVariantConfigs();
      res.json(configs);
    } catch (error) {
      console.error("Error getting variant configs:", error);
      res.status(500).json({ error: "Failed to get variant configs" });
    }
  });

  // Get single variant config
  app.get("/api/variant-configs/:id", requireAuth, async (req, res) => {
    try {
      const config = await storage.getVariantConfig(req.params.id);
      if (!config) {
        return res.status(404).json({ error: "Variant config not found" });
      }
      res.json(config);
    } catch (error) {
      console.error("Error getting variant config:", error);
      res.status(500).json({ error: "Failed to get variant config" });
    }
  });

  // Create variant config
  app.post("/api/variant-configs", requireAuth, async (req, res) => {
    try {
      const configData = insertVariantConfigSchema.parse(req.body);
      const config = await storage.createVariantConfig(configData);
      res.json(config);
    } catch (error) {
      console.error("Error creating variant config:", error);
      if (error instanceof Error && error.name === "ZodError") {
        return res.status(400).json({ error: "Validation error", details: error });
      }
      res.status(500).json({ error: "Failed to create variant config" });
    }
  });

  // Update variant config
  app.patch("/api/variant-configs/:id", requireAuth, async (req, res) => {
    try {
      const updateData = insertVariantConfigSchema.partial().parse(req.body);
      const config = await storage.updateVariantConfig(req.params.id, updateData);
      if (!config) {
        return res.status(404).json({ error: "Variant config not found" });
      }
      res.json(config);
    } catch (error) {
      console.error("Error updating variant config:", error);
      if (error instanceof Error && error.name === "ZodError") {
        return res.status(400).json({ error: "Validation error", details: error });
      }
      res.status(500).json({ error: "Failed to update variant config" });
    }
  });

  // Delete variant config
  app.delete("/api/variant-configs/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteVariantConfig(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Variant config not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting variant config:", error);
      res.status(500).json({ error: "Failed to delete variant config" });
    }
  });

  // Bulk import variant configs from pricing data
  app.post("/api/variant-configs/bulk-import", requireAuth, async (req, res) => {
    try {
      const pricingData = req.body.pricingData as Array<{
        size: string;
        framedPrice?: number;
        unframedPrice?: number;
        framedWeight?: number;
        unframedWeight?: number;
      }>;

      if (!Array.isArray(pricingData)) {
        return res.status(400).json({ error: "pricingData must be an array" });
      }

      const created: any[] = [];
      const errors: any[] = [];

      for (const row of pricingData) {
        const { size, framedPrice, unframedPrice, framedWeight, unframedWeight } = row;

        // Create unframed config if price exists (check for > 0, not just truthy)
        if (unframedPrice != null && unframedPrice > 0 && unframedWeight != null) {
          try {
            // Check if config already exists
            const existing = await storage.getVariantConfigByOptions(size, "Unframed");
            if (!existing) {
              const config = await storage.createVariantConfig({
                printSize: size,
                frameOption: "Unframed",
                priceGBP: Math.round(unframedPrice * 100), // Convert pounds to pence
                weightGrams: unframedWeight,
                inventory: 10,
              });
              created.push(config);
            }
          } catch (error) {
            errors.push({ size, frame: "Unframed", error: error instanceof Error ? error.message : "Unknown error" });
          }
        }

        // Create framed config if price exists
        if (framedPrice != null && framedPrice > 0 && framedWeight != null) {
          try {
            // Check if config already exists
            const existing = await storage.getVariantConfigByOptions(size, "Framed");
            if (!existing) {
              const config = await storage.createVariantConfig({
                printSize: size,
                frameOption: "Framed",
                priceGBP: Math.round(framedPrice * 100), // Convert pounds to pence
                weightGrams: framedWeight,
                inventory: 10,
              });
              created.push(config);
            }
          } catch (error) {
            errors.push({ size, frame: "Framed", error: error instanceof Error ? error.message : "Unknown error" });
          }
        }
      }

      res.json({
        success: true,
        created: created.length,
        errors: errors.length,
        details: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      console.error("Error bulk importing variant configs:", error);
      res.status(500).json({ error: "Failed to bulk import variant configs" });
    }
  });

  // Seed variant configs for 24x30 and 32x40 print sizes
  app.post("/api/variant-configs/seed", requireAuth, async (req, res) => {
    try {
      const defaultConfigs = [
        { printSize: "24x30", frameOption: "Unframed", priceGBP: 9500, weightGrams: 10, inventory: 10 },
        { printSize: "24x30", frameOption: "Framed", priceGBP: 22000, weightGrams: 3000, inventory: 10 },
        { printSize: "32x40", frameOption: "Unframed", priceGBP: 12500, weightGrams: 10, inventory: 10 },
        { printSize: "32x40", frameOption: "Framed", priceGBP: 31000, weightGrams: 3000, inventory: 10 },
      ];

      const created: any[] = [];
      const skipped: string[] = [];

      for (const config of defaultConfigs) {
        const existing = await storage.getVariantConfigByOptions(config.printSize, config.frameOption);
        if (existing) {
          skipped.push(`${config.printSize} ${config.frameOption}`);
        } else {
          const newConfig = await storage.createVariantConfig(config);
          created.push(newConfig);
        }
      }

      res.json({
        success: true,
        created: created.length,
        skipped: skipped.length,
        skippedDetails: skipped.length > 0 ? skipped : undefined,
      });
    } catch (error) {
      console.error("Error seeding variant configs:", error);
      res.status(500).json({ error: "Failed to seed variant configs" });
    }
  });

  // ========== Export Batches API ==========

  // Get all export batches
  app.get("/api/export-batches", requireAuth, async (req, res) => {
    try {
      const batches = await storage.getAllExportBatches();
      res.json(batches);
    } catch (error) {
      console.error("Error getting export batches:", error);
      res.status(500).json({ error: "Failed to get export batches" });
    }
  });

  // Create export batch
  app.post("/api/export-batches", requireAuth, async (req, res) => {
    try {
      const { artworkIds, generateAI = false } = req.body;
      const batchName = `Export ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
      const batchData = insertExportBatchSchema.parse({ 
        name: batchName,
        artworkIds 
      });
      const batch = await storage.createExportBatch(batchData);

      // Capture the base URL for converting relative paths to full URLs
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      // Process export in background
      (async () => {
        try {
          await storage.updateExportBatch(batch.id, { status: "processing" });

          // Get all variant configs first
          const allVariantConfigs = await storage.getAllVariantConfigs();

          // Get all artworks and their mockups for this batch
          const allArtworks = [];
          for (const artworkId of batch.artworkIds) {
            const artwork = await storage.getArtwork(artworkId);
            if (artwork) {
              allArtworks.push(artwork);
            }
          }

          // Group artworks by groupId
          const groupedProducts = new Map<string, { artwork: typeof allArtworks[0], mockups: any[], groupedArtworks: typeof allArtworks }>();
          const ungroupedProducts = [];

          for (const artwork of allArtworks) {
            if (artwork.groupId) {
              // This artwork is part of a group
              if (!groupedProducts.has(artwork.groupId)) {
                // Create new group entry with the primary artwork
                const groupArtworks = allArtworks.filter(a => a.groupId === artwork.groupId);
                const primaryArtwork = groupArtworks.find(a => a.isGroupPrimary) || groupArtworks[0];
                groupedProducts.set(artwork.groupId, {
                  artwork: primaryArtwork,
                  mockups: [],
                  groupedArtworks: groupArtworks,
                });
              }
            } else {
              // This artwork is standalone
              const mockups = await storage.getMockupsByArtwork(artwork.id);
              ungroupedProducts.push({
                artwork,
                mockups,
                variantConfigs: allVariantConfigs,
              });
            }
          }

          // Process grouped products: combine mockups and sizes
          const groupedProductsArray = [];
          for (const [groupId, groupData] of Array.from(groupedProducts.entries())) {
            const combinedSizes = new Set<string>();
            const mockupsByFrameType = new Map<string, any>();

            // Sort group artworks so primary is processed first (its product mockups take priority)
            const sortedGroupArtworks = [...groupData.groupedArtworks].sort((a, b) => {
              if (a.isGroupPrimary && !b.isGroupPrimary) return -1;
              if (!a.isGroupPrimary && b.isGroupPrimary) return 1;
              return 0;
            });

            // Collect mockups and sizes from all artworks in the group
            for (const artwork of sortedGroupArtworks) {
              const mockups = await storage.getMockupsByArtwork(artwork.id);
              
              // Deduplicate mockups by frame type (keep first occurrence)
              // Process non-lifestyle mockups first to ensure frame mockups take priority
              const sortedMockups = [...mockups].sort((a, b) => {
                // Non-lifestyle mockups come first
                if (a.isLifestyle !== b.isLifestyle) {
                  return a.isLifestyle ? 1 : -1;
                }
                return 0;
              });
              
              for (const mockup of sortedMockups) {
                // For non-lifestyle mockups, use frameType as key
                // For lifestyle mockups, include isLifestyle in key to keep them separate
                const key = mockup.isLifestyle 
                  ? `${mockup.templateId}-${mockup.frameType || 'default'}-lifestyle`
                  : `${mockup.templateId}-${mockup.frameType || 'default'}`;
                if (!mockupsByFrameType.has(key)) {
                  mockupsByFrameType.set(key, mockup);
                }
              }
              
              // Combine sizes from all artworks
              artwork.availableSizes.forEach((size: string) => combinedSizes.add(size));
            }

            // Create a merged artwork with combined sizes (sorted for consistency)
            const mergedArtwork = {
              ...groupData.artwork,
              availableSizes: Array.from(combinedSizes).sort((a, b) => {
                // Sort by size code for consistent ordering
                return a.localeCompare(b);
              }),
            };

            groupedProductsArray.push({
              artwork: mergedArtwork,
              mockups: Array.from(mockupsByFrameType.values()),
              variantConfigs: allVariantConfigs,
              groupedArtworks: groupData.groupedArtworks,
            });
          }

          // Combine grouped and ungrouped products
          const products = [...groupedProductsArray, ...ungroupedProducts];

          // Sync to Google Sheets (using just artworks for backward compatibility)
          let googleSheetUrl = "";
          try {
            googleSheetUrl = await syncToGoogleSheet(products.map(p => p.artwork));
          } catch (error) {
            console.error("Google Sheets sync failed:", error);
          }

          // Get settings for AI metadata options
          const settings = await storage.getFormSettings();
          
          // Generate Matrixify CSV (required - failure aborts export)
          const csvPath = `/tmp/export-${batch.id}.csv`;
          console.log(`[Export] Generating CSV with AI: ${generateAI}`);
          await generateMatrixifyCSV(products, csvPath, generateAI, settings || undefined, baseUrl);
          const csvBuffer = readFileSync(csvPath);
          const csvFileUrl = await objectStorageService.uploadFile(
            csvBuffer,
            `export-${batch.id}.csv`,
            "text/csv"
          );
          
          // Ensure upload succeeded
          if (!csvFileUrl) {
            throw new Error("CSV upload failed - empty URL returned from object storage");
          }

          await storage.updateExportBatch(batch.id, {
            status: "completed",
            googleSheetUrl,
            csvFileUrl,
          });
        } catch (error) {
          console.error("Export batch processing failed:", error);
          await storage.updateExportBatch(batch.id, { status: "failed" });
        }
      })();

      res.json(batch);
    } catch (error) {
      console.error("Error creating export batch:", error);
      res.status(500).json({ error: "Failed to create export batch" });
    }
  });

  // Delete export batch
  app.delete("/api/export-batches/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteExportBatch(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting export batch:", error);
      res.status(500).json({ error: "Failed to delete export batch" });
    }
  });

  // ========== Shopify API ==========

  // Test Shopify connection
  app.get("/api/shopify/test", requireAuth, async (req, res) => {
    try {
      const result = await testShopifyConnection();
      res.json(result);
    } catch (error) {
      console.error("Error testing Shopify connection:", error);
      res.status(500).json({ error: "Failed to test Shopify connection" });
    }
  });

  // Query taxonomy categories (one-time use to find artwork category ID)
  app.get("/api/shopify/taxonomy", requireAuth, async (req, res) => {
    try {
      const categories = await queryTaxonomyCategory();
      res.json(categories);
    } catch (error) {
      console.error("Error querying taxonomy:", error);
      res.status(500).json({ error: "Failed to query taxonomy" });
    }
  });

  // AR Image report - shows which products have/don't have AR_Image metafield
  app.get("/api/shopify/ar-image-report", requireAuth, async (req, res) => {
    try {
      const report = await getARImageReport();
      res.json(report);
    } catch (error) {
      console.error("Error generating AR Image report:", error);
      res.status(500).json({ error: "Failed to generate AR Image report" });
    }
  });

  // Search Dropbox for low-res artwork files matching a product title
  app.get("/api/dropbox/search-artwork", requireAuth, async (req, res) => {
    try {
      const { title } = req.query;
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: "Title query parameter required" });
      }
      
      const { searchForLowResArtwork } = await import('./dropboxService');
      const matches = await searchForLowResArtwork(title, "/Artists/Artist Onboarding");
      res.json({ matches });
    } catch (error) {
      console.error("Error searching Dropbox:", error);
      res.status(500).json({ error: "Failed to search Dropbox" });
    }
  });

  app.get("/api/dropbox/search-artwork-all", requireAuth, async (req, res) => {
    try {
      const { title } = req.query;
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: "Title query parameter required" });
      }

      const { searchForAnyArtwork } = await import('./dropboxService');
      const matches = await searchForAnyArtwork(title);
      res.json({ matches });
    } catch (error) {
      console.error("Error searching Dropbox (all):", error);
      res.status(500).json({ error: "Failed to search Dropbox" });
    }
  });

  // Get image dimensions from Dropbox file
  app.get("/api/dropbox/thumbnail", requireAuth, async (req, res) => {
    try {
      const { path } = req.query;
      if (!path || typeof path !== 'string') {
        return res.status(400).json({ error: "Path query parameter required" });
      }
      const { getDropboxThumbnail } = await import('./dropboxService');
      const thumbBuffer = await getDropboxThumbnail(path);
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(thumbBuffer);
    } catch (error: any) {
      console.error("[Dropbox] Thumbnail error:", error.message);
      res.status(500).json({ error: "Failed to fetch thumbnail" });
    }
  });

  app.get("/api/dropbox/image-dimensions", requireAuth, async (req, res) => {
    try {
      const { path } = req.query;
      if (!path || typeof path !== 'string') {
        return res.status(400).json({ error: "Path query parameter required" });
      }
      
      // All Dropbox paths are allowed for image dimension checking
      const { downloadFromDropbox } = await import('./dropboxService');
      const sharp = (await import('sharp')).default;
      
      const imageBuffer = await downloadFromDropbox(path);
      const metadata = await sharp(imageBuffer).metadata();
      
      res.json({ 
        width: metadata.width || 0, 
        height: metadata.height || 0,
        format: metadata.format
      });
    } catch (error: any) {
      console.error("Error getting image dimensions:", error);
      res.status(500).json({ error: error.message || "Failed to get image dimensions" });
    }
  });

  // Convert high-res Dropbox image to low-res and push to Shopify
  app.post("/api/dropbox/convert-and-push", requireAuth, async (req, res) => {
    try {
      const { productId, dropboxPath, targetMaxDimension = 4000 } = req.body;
      
      if (!productId || !dropboxPath) {
        return res.status(400).json({ error: "productId and dropboxPath are required" });
      }
      
      // Validate file extension is an image
      const filename = dropboxPath.split('/').pop() || '';
      const ext = filename.toLowerCase().split('.').pop();
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'tif', 'tiff'];
      if (!ext || !allowedExtensions.includes(ext)) {
        return res.status(400).json({ error: "File must be an image (jpg, jpeg, png, tif, tiff)" });
      }
      
      // Download file from Dropbox
      const { downloadFromDropbox } = await import('./dropboxService');
      const imageBuffer = await downloadFromDropbox(dropboxPath);
      
      // Get original dimensions
      const sharp = (await import('sharp')).default;
      const metadata = await sharp(imageBuffer).metadata();
      const origWidth = metadata.width || 0;
      const origHeight = metadata.height || 0;
      
      console.log(`[Convert] Original size: ${origWidth}x${origHeight}`);
      
      // Calculate resize dimensions to fit within targetMaxDimension while maintaining aspect ratio
      let newWidth = origWidth;
      let newHeight = origHeight;
      const maxDim = Math.max(origWidth, origHeight);
      
      if (maxDim > targetMaxDimension) {
        const scale = targetMaxDimension / maxDim;
        newWidth = Math.round(origWidth * scale);
        newHeight = Math.round(origHeight * scale);
        console.log(`[Convert] Resizing to: ${newWidth}x${newHeight} (scale: ${scale.toFixed(3)})`);
      }
      
      // Detect if original is PNG to preserve lossless quality for graphic art
      const isPng = ext === 'png' || metadata.format === 'png';
      
      // Resize while preserving format for best quality
      // Shopify has a ~20MB file size limit for staged uploads
      const MAX_FILE_SIZE = 18 * 1024 * 1024; // 18MB to be safe
      let resizedBuffer: Buffer;
      let outputExt: string;
      
      if (isPng) {
        // First try PNG for lossless quality (ideal for graphic art with solid colors)
        resizedBuffer = await sharp(imageBuffer)
          .resize(newWidth, newHeight, { fit: 'inside', withoutEnlargement: true })
          .png({ compressionLevel: 9 }) // Maximum compression
          .toBuffer();
        outputExt = 'png';
        
        console.log(`[Convert] PNG size: ${(resizedBuffer.length / 1024 / 1024).toFixed(2)}MB`);
        
        // If PNG is too large, fall back to high-quality JPEG
        if (resizedBuffer.length > MAX_FILE_SIZE) {
          console.log(`[Convert] PNG too large for Shopify (>${(MAX_FILE_SIZE / 1024 / 1024)}MB), converting to JPEG...`);
          resizedBuffer = await sharp(imageBuffer)
            .resize(newWidth, newHeight, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 92, mozjpeg: true })
            .toBuffer();
          outputExt = 'jpg';
          
          // If still too large, reduce quality
          if (resizedBuffer.length > MAX_FILE_SIZE) {
            console.log(`[Convert] JPEG still too large, reducing quality...`);
            resizedBuffer = await sharp(imageBuffer)
              .resize(newWidth, newHeight, { fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: 85, mozjpeg: true })
              .toBuffer();
          }
        }
      } else {
        // Use high-quality JPEG for photos
        resizedBuffer = await sharp(imageBuffer)
          .resize(newWidth, newHeight, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 92, mozjpeg: true })
          .toBuffer();
        outputExt = 'jpg';
        
        // If still too large, reduce quality
        if (resizedBuffer.length > MAX_FILE_SIZE) {
          console.log(`[Convert] JPEG too large, reducing quality...`);
          resizedBuffer = await sharp(imageBuffer)
            .resize(newWidth, newHeight, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85, mozjpeg: true })
            .toBuffer();
        }
      }
      
      console.log(`[Convert] Resized buffer size: ${(resizedBuffer.length / 1024 / 1024).toFixed(2)}MB (${outputExt})`);
      
      // Verify the resized image is within AR limits
      const resizedMetadata = await sharp(resizedBuffer).metadata();
      const finalWidth = resizedMetadata.width || 0;
      const finalHeight = resizedMetadata.height || 0;
      
      const minDimension = Math.min(finalWidth, finalHeight);
      const maxDimension = Math.max(finalWidth, finalHeight);
      
      if (minDimension < 500) {
        return res.status(400).json({ 
          error: `Converted image too small (${finalWidth}x${finalHeight}). Minimum dimension must be at least 500px.`,
          width: finalWidth,
          height: finalHeight
        });
      }
      
      if (maxDimension > 4096) {
        return res.status(400).json({ 
          error: `Converted image still too large (${finalWidth}x${finalHeight}). Maximum dimension must be 4096px or less.`,
          width: finalWidth,
          height: finalHeight
        });
      }
      
      // Upload to Shopify and set metafield
      // Use a new filename with "_ar" suffix to indicate it's the AR version
      const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;
      const newFilename = `${baseName}_ar.${outputExt}`;
      
      const { setProductWavImage } = await import('./shopifyService');
      const result = await setProductWavImage(productId, resizedBuffer, newFilename);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }
      
      res.json({ 
        success: true, 
        fileId: result.fileId, 
        originalWidth: origWidth,
        originalHeight: origHeight,
        width: finalWidth, 
        height: finalHeight,
        converted: true
      });
    } catch (error: any) {
      console.error("Error converting and pushing image:", error);
      res.status(500).json({ error: error.message || "Failed to convert and push image" });
    }
  });

  // Push Dropbox file to Shopify as wav_image metafield
  app.post("/api/shopify/set-wav-image", requireAuth, async (req, res) => {
    try {
      const { productId, dropboxPath } = req.body;
      
      if (!productId || !dropboxPath) {
        return res.status(400).json({ error: "productId and dropboxPath are required" });
      }
      
      // All Dropbox paths are allowed for pushing to Shopify
      
      // Validate file extension is an image
      const filename = dropboxPath.split('/').pop() || '';
      const ext = filename.toLowerCase().split('.').pop();
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'tif', 'tiff'];
      if (!ext || !allowedExtensions.includes(ext)) {
        return res.status(400).json({ error: "File must be an image (jpg, jpeg, png, tif, tiff)" });
      }
      
      // Download file from Dropbox
      const { downloadFromDropbox } = await import('./dropboxService');
      const imageBuffer = await downloadFromDropbox(dropboxPath);
      
      // Check image dimensions
      const sharp = (await import('sharp')).default;
      const metadata = await sharp(imageBuffer).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;
      
      // AR tool requires images between 500px and 4096px on shortest side
      const minDimension = Math.min(width, height);
      const maxDimension = Math.max(width, height);
      
      if (minDimension < 500) {
        return res.status(400).json({ 
          error: `Image too small (${width}x${height}). Minimum dimension must be at least 500px.`,
          width,
          height
        });
      }
      
      if (maxDimension > 4096) {
        return res.status(400).json({ 
          error: `Image too large (${width}x${height}). Maximum dimension must be 4096px or less.`,
          width,
          height
        });
      }
      
      // Upload to Shopify and set metafield
      const { setProductWavImage } = await import('./shopifyService');
      const result = await setProductWavImage(productId, imageBuffer, filename);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }
      
      res.json({ success: true, fileId: result.fileId, width, height });
    } catch (error: any) {
      console.error("Error setting wav_image:", error);
      res.status(500).json({ error: error.message || "Failed to set wav_image" });
    }
  });

  // Sync single product to Shopify
  app.post("/api/shopify/sync/:artworkId", requireAuth, async (req, res) => {
    try {
      const { artworkId } = req.params;
      const { generateAI = false } = req.body;

      const artwork = await storage.getArtwork(artworkId);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }

      const mockups = await storage.getMockupsByArtwork(artworkId);
      const variantConfigs = await storage.getAllVariantConfigs();
      const settings = await storage.getFormSettings();

      const result = await syncProductToShopify(
        artwork,
        mockups,
        variantConfigs,
        null,
        generateAI,
        settings
      );

      // Move Dropbox folder from Pending to Completed on successful sync
      if (result.success && !result.skipped && artwork.dropboxPath) {
        try {
          const formSettings = await storage.getFormSettings();
          const basePath = formSettings?.dropboxBasePath || "/Artist Uploads 2026";
          const moveResult = await moveArtworkToCompleted(artwork.dropboxPath, basePath);
          if (moveResult.success) {
            // Update the artwork's dropbox path to reflect the new Completed location
            const updatedPath = artwork.dropboxPath.replace('/Pending/', '/Completed/');
            await storage.updateArtwork(artworkId, { dropboxPath: updatedPath });
            console.log(`[Shopify Sync] Moved Dropbox folder to Completed, updated path: ${updatedPath}`);
          }
        } catch (moveError) {
          console.error("[Shopify Sync] Error moving Dropbox folder:", moveError);
          // Don't fail the sync if move fails
        }
      }

      res.json(result);
    } catch (error) {
      console.error("Error syncing to Shopify:", error);
      res.status(500).json({ error: "Failed to sync to Shopify" });
    }
  });

  // Sync batch to Shopify
  app.post("/api/shopify/sync-batch", requireAuth, async (req, res) => {
    // Set a longer timeout for this endpoint (10 minutes)
    req.setTimeout(600000);
    res.setTimeout(600000);
    
    try {
      const { artworkIds, generateAI = false } = req.body;

      if (!artworkIds || !Array.isArray(artworkIds) || artworkIds.length === 0) {
        return res.status(400).json({ error: "artworkIds array is required" });
      }

      // Check if any artworks are already being synced (prevent concurrent syncs)
      const alreadySyncing = artworkIds.filter((id: string) => syncingArtworks.has(id));
      if (alreadySyncing.length > 0) {
        console.log(`[Shopify] Rejecting sync - ${alreadySyncing.length} artworks already being synced`);
        return res.status(409).json({ 
          error: "Some artworks are already being synced. Please wait for the current sync to complete.",
          alreadySyncing: alreadySyncing.length
        });
      }

      // Lock all artworks being synced
      for (const id of artworkIds) {
        syncingArtworks.add(id);
      }
      console.log(`[Shopify] Locked ${artworkIds.length} artworks for sync`);

      const allVariantConfigs = await storage.getAllVariantConfigs();
      const products = [];

      // Group artworks similar to CSV export
      const allArtworks = [];
      for (const artworkId of artworkIds) {
        const artwork = await storage.getArtwork(artworkId);
        if (artwork) {
          allArtworks.push(artwork);
        }
      }

      // Group by groupId
      const groupedProducts = new Map<string, { artwork: typeof allArtworks[0], mockups: any[], groupedArtworks: typeof allArtworks }>();
      const ungroupedProducts = [];

      for (const artwork of allArtworks) {
        if (artwork.groupId) {
          if (!groupedProducts.has(artwork.groupId)) {
            const groupArtworks = allArtworks.filter(a => a.groupId === artwork.groupId);
            const primaryArtwork = groupArtworks.find(a => a.isGroupPrimary) || groupArtworks[0];
            groupedProducts.set(artwork.groupId, {
              artwork: primaryArtwork,
              mockups: [],
              groupedArtworks: groupArtworks,
            });
          }
        } else {
          const mockups = await storage.getMockupsByArtwork(artwork.id);
          ungroupedProducts.push({
            artwork,
            mockups,
            variantConfigs: allVariantConfigs,
          });
        }
      }

      // Process grouped products
      for (const [groupId, groupData] of Array.from(groupedProducts.entries())) {
        const combinedSizes = new Set<string>();
        const mockupsByFrameType = new Map<string, any>();

        // Sort group artworks so primary is processed first (its product mockups take priority)
        const sortedGroupArtworks = [...groupData.groupedArtworks].sort((a, b) => {
          if (a.isGroupPrimary && !b.isGroupPrimary) return -1;
          if (!a.isGroupPrimary && b.isGroupPrimary) return 1;
          return 0;
        });

        for (const artwork of sortedGroupArtworks) {
          const mockups = await storage.getMockupsByArtwork(artwork.id);
          for (const mockup of mockups) {
            const key = `${mockup.templateId}-${mockup.frameType || 'default'}`;
            if (!mockupsByFrameType.has(key)) {
              mockupsByFrameType.set(key, mockup);
            }
          }
          artwork.availableSizes.forEach((size: string) => combinedSizes.add(size));
        }

        const mergedArtwork = {
          ...groupData.artwork,
          availableSizes: Array.from(combinedSizes),
        };

        products.push({
          artwork: mergedArtwork,
          mockups: Array.from(mockupsByFrameType.values()),
          variantConfigs: allVariantConfigs,
          groupedArtworks: groupData.groupedArtworks,
        });
      }

      // Combine all products
      products.push(...ungroupedProducts);

      // Debug: Log what we're about to sync
      console.log(`[Shopify] Products to sync (${products.length} total):`);
      for (const p of products) {
        console.log(`  - ${p.artwork.title} (${p.artwork.id})`);
      }

      // Get settings for exclusivity check
      const settings = await storage.getFormSettings();

      // Sync to Shopify
      const result = await syncBatchToShopify(products, generateAI, settings);

      // Move Dropbox folders from Pending to Completed for successful syncs
      const basePath = settings?.dropboxBasePath || "/Artist Uploads 2026";
      const movedFolders = new Set<string>(); // Track already moved folders to avoid duplicates
      
      for (let i = 0; i < products.length; i++) {
        const syncResult = result.results[i];
        const artwork = products[i].artwork;
        
        // Only move if sync was successful (not skipped, not failed)
        if (syncResult?.success && !syncResult?.skipped && artwork.dropboxPath) {
          // Extract submission folder to avoid moving same folder multiple times
          const folderMatch = artwork.dropboxPath.match(/\/Pending\/([^\/]+)/);
          const folderName = folderMatch ? folderMatch[1] : null;
          
          if (folderName && !movedFolders.has(folderName)) {
            try {
              const moveResult = await moveArtworkToCompleted(artwork.dropboxPath, basePath);
              if (moveResult.success) {
                movedFolders.add(folderName);
                // Update the artwork's dropbox path to reflect the new Completed location
                const updatedPath = artwork.dropboxPath.replace('/Pending/', '/Completed/');
                await storage.updateArtwork(artwork.id, { dropboxPath: updatedPath });
                console.log(`[Shopify Sync] Moved Dropbox folder to Completed, updated path: ${updatedPath}`);
              }
            } catch (moveError) {
              console.error(`[Shopify Sync] Error moving Dropbox folder for ${artwork.title}:`, moveError);
              // Don't fail the sync if move fails
            }
          } else if (folderName && movedFolders.has(folderName)) {
            // Folder already moved, just update the path
            const updatedPath = artwork.dropboxPath.replace('/Pending/', '/Completed/');
            await storage.updateArtwork(artwork.id, { dropboxPath: updatedPath });
          }
        }
      }

      // Release locks
      for (const id of artworkIds) {
        syncingArtworks.delete(id);
      }
      console.log(`[Shopify] Released locks for ${artworkIds.length} artworks`);

      res.json(result);
    } catch (error) {
      // Release locks on error
      const { artworkIds } = req.body;
      if (artworkIds && Array.isArray(artworkIds)) {
        for (const id of artworkIds) {
          syncingArtworks.delete(id);
        }
        console.log(`[Shopify] Released locks for ${artworkIds.length} artworks (on error)`);
      }
      console.error("Error syncing batch to Shopify:", error);
      res.status(500).json({ error: "Failed to sync batch to Shopify" });
    }
  });

  // ========== Artist Notification API ==========

  // Notify artists that their collection is live
  app.post("/api/admin/notify-artists", requireAuth, async (req, res) => {
    try {
      const { artworkIds } = req.body;

      if (!artworkIds || !Array.isArray(artworkIds) || artworkIds.length === 0) {
        return res.status(400).json({ error: "artworkIds array is required" });
      }

      // Fetch all artworks
      const artworks: Artwork[] = [];
      const artworksMissingEmail: string[] = [];
      for (const id of artworkIds) {
        const artwork = await storage.getArtwork(id);
        if (artwork) {
          if (!artwork.artistEmail || !artwork.artistEmail.trim()) {
            artworksMissingEmail.push(artwork.title);
          } else {
            artworks.push(artwork);
          }
        }
      }

      if (artworks.length === 0 && artworksMissingEmail.length > 0) {
        return res.status(400).json({ 
          error: "All selected artworks are missing artist email addresses",
          missingEmails: artworksMissingEmail 
        });
      }

      if (artworks.length === 0) {
        return res.status(404).json({ error: "No artworks found" });
      }

      // Group artworks by artist email, separating live and rejected
      const artworksByArtist = new Map<string, { artistName: string; liveArtworks: Artwork[]; rejectedArtworks: Artwork[] }>();
      for (const artwork of artworks) {
        const email = artwork.artistEmail!.toLowerCase().trim();
        if (!artworksByArtist.has(email)) {
          artworksByArtist.set(email, {
            artistName: artwork.artistName,
            liveArtworks: [],
            rejectedArtworks: [],
          });
        }
        const artistData = artworksByArtist.get(email)!;
        if (artwork.status === "rejected") {
          artistData.rejectedArtworks.push(artwork);
        } else {
          artistData.liveArtworks.push(artwork);
        }
      }

      // Send emails to each artist
      const results: { email: string; artistName: string; success: boolean; error?: string; artworkCount: number }[] = [];

      for (const [email, data] of artworksByArtist) {
        const result = await sendCollectionLiveEmail(email, {
          artistName: data.artistName,
          artworkTitles: data.liveArtworks.map(a => a.title),
          rejectedTitles: data.rejectedArtworks.map(a => a.title),
        });

        // Mark all artworks (live + rejected) as notified if email was sent successfully
        const allArtworks = [...data.liveArtworks, ...data.rejectedArtworks];
        if (result.success) {
          for (const artwork of allArtworks) {
            await storage.updateArtwork(artwork.id, { artistNotifiedAt: new Date() });
          }
        }

        results.push({
          email,
          artistName: data.artistName,
          success: result.success,
          error: result.error,
          artworkCount: allArtworks.length,
        });
      }

      const successCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;

      res.json({
        success: failedCount === 0,
        sent: successCount,
        failed: failedCount,
        results,
        skippedMissingEmail: artworksMissingEmail,
      });
    } catch (error) {
      console.error("Error sending artist notifications:", error);
      res.status(500).json({ error: "Failed to send artist notifications" });
    }
  });

  // Preview artist emails for selected artworks (returns grouped data without sending)
  app.post("/api/admin/preview-artist-emails", requireAuth, async (req, res) => {
    try {
      const { artworkIds } = req.body;

      if (!artworkIds || !Array.isArray(artworkIds) || artworkIds.length === 0) {
        return res.status(400).json({ error: "artworkIds array is required" });
      }

      // Fetch all artworks
      const artworks: Artwork[] = [];
      const artworksMissingEmail: { id: string; title: string; artistName: string }[] = [];
      for (const id of artworkIds) {
        const artwork = await storage.getArtwork(id);
        if (artwork) {
          if (!artwork.artistEmail || !artwork.artistEmail.trim()) {
            artworksMissingEmail.push({ id: artwork.id, title: artwork.title, artistName: artwork.artistName });
          } else {
            artworks.push(artwork);
          }
        }
      }

      if (artworks.length === 0 && artworksMissingEmail.length > 0) {
        return res.status(400).json({ 
          error: "All selected artworks are missing artist email addresses",
          missingEmails: artworksMissingEmail 
        });
      }

      if (artworks.length === 0) {
        return res.status(404).json({ error: "No artworks found" });
      }

      // Group artworks by artist email, separating live and rejected
      const artworksByArtist = new Map<string, { artistName: string; email: string; artworks: { id: string; title: string; status: string }[]; liveArtworks: { id: string; title: string }[]; rejectedArtworks: { id: string; title: string }[] }>();
      for (const artwork of artworks) {
        const email = artwork.artistEmail!.toLowerCase().trim();
        if (!artworksByArtist.has(email)) {
          artworksByArtist.set(email, {
            artistName: artwork.artistName,
            email,
            artworks: [],
            liveArtworks: [],
            rejectedArtworks: [],
          });
        }
        const artistData = artworksByArtist.get(email)!;
        const artworkInfo = { id: artwork.id, title: artwork.title, status: artwork.status };
        artistData.artworks.push(artworkInfo);
        if (artwork.status === "rejected") {
          artistData.rejectedArtworks.push({ id: artwork.id, title: artwork.title });
        } else {
          artistData.liveArtworks.push({ id: artwork.id, title: artwork.title });
        }
      }

      const groups = Array.from(artworksByArtist.values());

      // Generate a sample email preview using the first artist's data
      let emailPreview: { subject: string; html: string } | null = null;
      if (groups.length > 0) {
        const firstGroup = groups[0];
        emailPreview = await getCollectionLiveEmailPreview({
          artistName: firstGroup.artistName,
          artworkTitles: firstGroup.liveArtworks.map(a => a.title),
          rejectedTitles: firstGroup.rejectedArtworks.map(a => a.title),
        });
      }

      res.json({
        totalArtists: groups.length,
        totalArtworks: artworks.length,
        groups,
        skippedMissingEmail: artworksMissingEmail,
        emailPreview,
      });
    } catch (error) {
      console.error("Error previewing artist emails:", error);
      res.status(500).json({ error: "Failed to preview artist emails" });
    }
  });

  // ========== Form Settings API ==========

  // Get form settings (singleton)
  app.get("/api/form-settings", async (req, res) => {
    try {
      let settings = await storage.getFormSettings();
      
      // Create default settings if none exist
      if (!settings) {
        const defaultSettings = {
          copy: {
            step1Title: "Let's start with your details",
            step1Subtitle: "",
            nameLabel: "Your Name",
            emailLabel: "Email",
            nameHelpText: "Please enter your name as used on our website.",
            emailHelpText: "We'll use this to follow up with any questions.",
            step2Title: "Upload Artwork",
            step2Subtitle: "Select one or more images to upload. You can upload various formats and we will figure out the best sizing options for you.",
            uploadLabel: "Upload Files",
            uploadHelpText: "For optimum print quality, we recommend formatting your work to 300 DPI.  The maximum print size offered will be based on maintaining a minimum of 200 DPI.",
            titleLabel: "Artwork Title",
            titleHelpText: "Give your artwork a title",
            commentsLabel: "Additional comments",
            commentsHelpText: "Anything else we might need to know?",
            requirementsLabel: "Do you have any specific requirements for your artwork listings?",
            requirementsHelpText: "E.g. Please only list sizes A3 and upwards. My design works best at a larger scale.",
            step3Title: "Confirmation",
            signatureStatement: "I confirm these artworks are exclusive to East Side Studio London for sale as fine art prints. I accept these artworks will be bound to my contractual agreements with East Side Studio London.",
            signatureButtonText: "Add signature",
            thankYouTitle: "Thank you! We have received your artwork submission.",
            thankYouSubtitle: "We will be in touch with any questions/issues.",
          } as FormCopy,
          typography: {
            headingFont: "Montserrat",
            bodyFont: "Montserrat",
            h1Size: "36px",
            h2Size: "30px",
            h3Size: "24px",
            h4Size: "20px",
            bodySize: "16px",
          } as FormTypography,
          branding: {
            primaryColor: "#1319C1",
            logoUrl: "/assets/East Side Studio2_1line_Black_24_1763330142482.png",
            fieldSpacing: "1rem",
          } as FormBranding,
          nonExclusiveArtists: [],
          colourOptions: [],
          moodOptions: [],
          styleOptions: [],
          themeOptions: [],
          aiPrompts: {
            bodyHTMLPrompt: "Create an engaging, SEO-optimized product description for this artwork. Include details about the visual elements, mood, and what makes it special. Format as HTML with paragraph tags.",
            titleTagPrompt: "Generate a concise, SEO-friendly title tag (60 characters max) that includes the artwork title and artist name.",
            descriptionTagPrompt: "Write a compelling meta description (155 characters max) that entices users to click and includes key details about the artwork.",
          },
        };
        settings = await storage.createFormSettings(defaultSettings);
      }
      
      // Normalize typography to include default sizes for legacy data
      let needsUpdate = false;
      if (settings && settings.typography) {
        const originalTypography = { ...settings.typography };
        settings.typography = {
          ...settings.typography,
          h1Size: settings.typography.h1Size || "36px",
          h2Size: settings.typography.h2Size || "30px",
          h3Size: settings.typography.h3Size || "24px",
          h4Size: settings.typography.h4Size || "20px",
          bodySize: settings.typography.bodySize || "16px",
        };
        
        // Check if we added any defaults (legacy data)
        needsUpdate = !originalTypography.h1Size || !originalTypography.h2Size || 
                     !originalTypography.h3Size || !originalTypography.h4Size || 
                     !originalTypography.bodySize;
      }
      
      // Normalize AI prompts to include defaults for legacy/empty data
      if (settings) {
        const originalAIPrompts = settings.aiPrompts ? { ...settings.aiPrompts } : null;
        settings.aiPrompts = {
          bodyHTMLPrompt: settings.aiPrompts?.bodyHTMLPrompt || "Create an engaging, SEO-optimized product description for this artwork. Include details about the visual elements, mood, and what makes it special. Format as HTML with paragraph tags.",
          titleTagPrompt: settings.aiPrompts?.titleTagPrompt || "Generate a concise, SEO-friendly title tag (60 characters max) that includes the artwork title and artist name.",
          descriptionTagPrompt: settings.aiPrompts?.descriptionTagPrompt || "Write a compelling meta description (155 characters max) that entices users to click and includes key details about the artwork.",
        };
        
        // Check if we added any defaults
        if (!originalAIPrompts || !originalAIPrompts.bodyHTMLPrompt || !originalAIPrompts.titleTagPrompt || !originalAIPrompts.descriptionTagPrompt) {
          needsUpdate = true;
        }
      }
      
      // Persist the normalized data to database for legacy settings
      if (needsUpdate && settings) {
        await storage.updateFormSettings(settings.id, {
          copy: settings.copy,
          typography: settings.typography,
          branding: settings.branding,
          nonExclusiveArtists: settings.nonExclusiveArtists,
          colourOptions: settings.colourOptions,
          moodOptions: settings.moodOptions,
          styleOptions: settings.styleOptions,
          themeOptions: settings.themeOptions,
          aiPrompts: settings.aiPrompts,
        });
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Error getting form settings:", error);
      res.status(500).json({ error: "Failed to get form settings" });
    }
  });

  // Update form settings
  app.put("/api/form-settings/:id", requireAuth, async (req, res) => {
    try {
      // Normalize typography to include default sizes for legacy data
      if (req.body.typography) {
        req.body.typography = {
          ...req.body.typography,
          h1Size: req.body.typography.h1Size || "36px",
          h2Size: req.body.typography.h2Size || "30px",
          h3Size: req.body.typography.h3Size || "24px",
          h4Size: req.body.typography.h4Size || "20px",
          bodySize: req.body.typography.bodySize || "16px",
        };
      }
      
      const validation = insertFormSettingsSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      // Check if FAQs are being updated - if so, update the faqsLastUpdated timestamp
      const updateData: any = { ...validation.data };
      if (validation.data.printSizeFAQs) {
        const currentSettings = await storage.getFormSettings();
        const currentFAQs = JSON.stringify(currentSettings?.printSizeFAQs || {});
        const newFAQs = JSON.stringify(validation.data.printSizeFAQs);
        if (currentFAQs !== newFAQs) {
          updateData.faqsLastUpdated = new Date();
        }
      }

      const settings = await storage.updateFormSettings(req.params.id, updateData);
      if (!settings) {
        return res.status(404).json({ error: "Settings not found" });
      }

      res.json(settings);
    } catch (error) {
      console.error("Error updating form settings:", error);
      res.status(500).json({ error: "Failed to update form settings" });
    }
  });

  // ========== Product Mockup Generation API ==========

  function aspectRatioToCategory(aspectRatio: string): string {
    const lower = aspectRatio.toLowerCase();
    if (lower.includes("square") || lower.includes("1:1")) return "square";
    if (lower.includes("a ratio") || lower.includes("5:7") || lower.includes("a-ratio")) return "a-ratio";
    if (lower.includes("3:4") || lower.includes("4:3")) return "3:4";
    if (lower.includes("2:3") || lower.includes("3:2")) return "2:3";
    if (lower.includes("4:5") || lower.includes("5:4")) return "4:5";
    if (lower.includes("5:8") || lower.includes("8:5")) return "custom";
    return "custom";
  }

  app.post("/api/admin/artworks/:id/generate-mockups", requireAuth, async (req, res) => {
    try {
      const artwork = await storage.getArtwork(req.params.id);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }

      const imageUrl = artwork.originalFileUrl || artwork.lowResFileUrl;
      if (!imageUrl) {
        return res.status(400).json({ error: "No artwork image available" });
      }

      const ratioCategory = aspectRatioToCategory(artwork.aspectRatio);
      if (ratioCategory === "custom") {
        return res.status(400).json({ error: `Unsupported aspect ratio for mockup generation: ${artwork.aspectRatio}` });
      }

      const orientation: "portrait" | "landscape" = (artwork.widthPx > artwork.heightPx) ? "landscape" : "portrait";

      console.log(`[Mockup] Generating previews for "${artwork.title}" (${artwork.aspectRatio} → ${ratioCategory}, ${orientation})`);

      let artworkBuffer: Buffer;
      if (imageUrl.startsWith("/objects/")) {
        const objectStorage = new ObjectStorageService();
        artworkBuffer = await objectStorage.downloadFileAsBuffer(imageUrl);
      } else {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          return res.status(500).json({ error: "Failed to fetch artwork image" });
        }
        artworkBuffer = Buffer.from(await response.arrayBuffer());
      }

      const mockups = await generateAllProductMockups(artworkBuffer, ratioCategory, orientation);

      const previews = mockups.map(m => ({
        frame: m.frame,
        dataUrl: `data:image/jpeg;base64,${m.buffer.toString("base64")}`,
        sizeBytes: m.buffer.length,
      }));

      console.log(`[Mockup] Generated ${previews.length} previews for "${artwork.title}"`);

      res.json({
        artworkId: artwork.id,
        title: artwork.title,
        artistName: artwork.artistName,
        aspectRatio: artwork.aspectRatio,
        ratioCategory,
        orientation,
        previews,
      });
    } catch (error) {
      console.error("[Mockup] Error generating mockup previews:", error);
      res.status(500).json({ error: "Failed to generate mockup previews" });
    }
  });

  app.post("/api/admin/artworks/:id/save-mockups", requireAuth, async (req, res) => {
    try {
      const artwork = await storage.getArtwork(req.params.id);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }

      const imageUrl = artwork.originalFileUrl || artwork.lowResFileUrl;
      if (!imageUrl) {
        return res.status(400).json({ error: "No artwork image available" });
      }

      const ratioCategory = aspectRatioToCategory(artwork.aspectRatio);
      if (ratioCategory === "custom") {
        return res.status(400).json({ error: `Unsupported aspect ratio: ${artwork.aspectRatio}` });
      }

      const orientation: "portrait" | "landscape" = (artwork.widthPx > artwork.heightPx) ? "landscape" : "portrait";
      const validFrames = ["black", "white", "natural", "unframed"];
      const { frames: requestedFrames } = req.body;
      const framesToGenerate = requestedFrames
        ? (requestedFrames as string[]).filter((f: string) => validFrames.includes(f))
        : validFrames;
      if (framesToGenerate.length === 0) {
        return res.status(400).json({ error: "No valid frame colors specified. Valid options: black, white, natural, unframed" });
      }

      console.log(`[Mockup] Saving mockups for "${artwork.title}" - frames: ${framesToGenerate.join(", ")}`);

      let artworkBuffer: Buffer;
      if (imageUrl.startsWith("/objects/")) {
        const objectStorageReader = new ObjectStorageService();
        artworkBuffer = await objectStorageReader.downloadFileAsBuffer(imageUrl);
      } else {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          return res.status(500).json({ error: "Failed to fetch artwork image" });
        }
        artworkBuffer = Buffer.from(await response.arrayBuffer());
      }

      const objectStorage = new ObjectStorageService();
      const savedMockups: { frame: string; url: string; sizeBytes: number }[] = [];

      for (const frame of framesToGenerate) {
        const buffer = await generateProductMockup(artworkBuffer, ratioCategory, frame, orientation);

        const artistSlug = artwork.artistName.replace(/\s+/g, "-");
        const titleSlug = artwork.title.replace(/\s+/g, "-");
        const frameLabel = frame === "unframed" ? "Unframed" : `${frame.charAt(0).toUpperCase() + frame.slice(1)}-Frame`;
        const filename = `mockups/${artistSlug}/${titleSlug}_${frameLabel}.jpg`;

        const uploadUrl = await objectStorage.uploadFile(buffer, filename, "image/jpeg");

        const frameType = frame === "unframed" ? "Unframed" : `${frame.charAt(0).toUpperCase() + frame.slice(1)} Frame`;
        const existingMockups = await storage.getMockupsByArtwork(artwork.id);
        const existingMockup = existingMockups.find(m => m.frameType === frameType);
        if (existingMockup) {
          await storage.deleteMockup(existingMockup.id);
        }
        const mockup = await storage.createMockup({
          artworkId: artwork.id,
          frameType,
          mockupImageUrl: uploadUrl,
          isLifestyle: false,
        });

        const dbxPath = await syncMockupToDropbox(buffer, artwork.dropboxPath, `${titleSlug}_${frameLabel}.jpg`);
        if (dbxPath) await storage.updateMockup(mockup.id, { dropboxPath: dbxPath });

        savedMockups.push({ frame: frameType, url: uploadUrl, sizeBytes: buffer.length });
      }

      console.log(`[Mockup] Saved ${savedMockups.length} mockups for "${artwork.title}"`);
      res.json({ success: true, mockups: savedMockups });
    } catch (error) {
      console.error("[Mockup] Error saving mockups:", error);
      res.status(500).json({ error: "Failed to save mockups" });
    }
  });

  app.get("/api/admin/mockup-reference-sizes", requireAuth, async (_req, res) => {
    res.json(getMockupReferenceSizes());
  });

  app.post("/api/admin/generate-canvas-mockups", requireAuth, async (req, res) => {
    req.setTimeout(300000);
    res.setTimeout(300000);
    try {
      const { artworkId } = req.body;
      if (!artworkId) {
        return res.status(400).json({ error: "artworkId is required" });
      }

      const artwork = await storage.getArtwork(artworkId);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }

      const imageUrl = artwork.lowResFileUrl || artwork.originalFileUrl;
      if (!imageUrl) {
        return res.status(400).json({ error: "No image available for this artwork" });
      }

      const objectStorage = new ObjectStorageService();
      const artworkBuffer = await objectStorage.downloadFileAsBuffer(imageUrl);

      const ratioCategory = aspectRatioToCategory(artwork.aspectRatio);
      const isLandscape = (artwork.widthPx || 0) > (artwork.heightPx || 0);
      const orientation = isLandscape ? "landscape" : "portrait";

      console.log(`[CanvasMockup] Generating canvas mockups for "${artwork.title}" (${ratioCategory}, ${orientation})`);

      const mockups = await generateCanvasProductMockups(artworkBuffer, ratioCategory, orientation);

      const results: { frame: string; url: string }[] = [];
      for (const mockup of mockups) {
        const filename = `mockups/canvas_${artworkId}_${mockup.frame}.jpg`;
        await objectStorage.uploadFileDirect(mockup.buffer, filename, "image/jpeg");
        const publicUrl = objectStorage.getPublicUrl(filename);
        results.push({ frame: mockup.frame, url: publicUrl });
      }

      console.log(`[CanvasMockup] Generated ${results.length} canvas mockups for "${artwork.title}"`);
      res.json({ success: true, artworkId, artworkTitle: artwork.title, mockups: results });
    } catch (error: any) {
      console.error("[CanvasMockup] Error generating canvas mockups:", error);
      res.status(500).json({ error: error.message || "Failed to generate canvas mockups" });
    }
  });

  app.get("/api/admin/preview-canvas-mockup/:artworkId/:frame", requireAuth, async (req, res) => {
    req.setTimeout(120000);
    res.setTimeout(120000);
    try {
      const { artworkId, frame } = req.params;
      const validFrames = ["black", "white", "natural"];
      if (!validFrames.includes(frame)) {
        return res.status(400).json({ error: `Invalid frame: ${frame}. Must be one of: ${validFrames.join(", ")}` });
      }

      const artwork = await storage.getArtwork(artworkId);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }

      const imageUrl = artwork.lowResFileUrl || artwork.originalFileUrl;
      if (!imageUrl) {
        return res.status(400).json({ error: "No image available" });
      }

      const objectStorage = new ObjectStorageService();
      const artworkBuffer = await objectStorage.downloadFileAsBuffer(imageUrl);

      const ratioCategory = aspectRatioToCategory(artwork.aspectRatio);
      const isLandscape = (artwork.widthPx || 0) > (artwork.heightPx || 0);
      const orientation = isLandscape ? "landscape" : "portrait";

      const buffer = await generateProductMockup(artworkBuffer, ratioCategory, frame as any, orientation, undefined, "canvas");

      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "no-cache");
      res.send(buffer);
    } catch (error: any) {
      console.error("[CanvasMockup] Error previewing canvas mockup:", error);
      res.status(500).json({ error: error.message || "Failed to generate preview" });
    }
  });

  app.get("/api/admin/mockup-summary", requireAuth, async (_req, res) => {
    try {
      const allMockups = await storage.getAllMockups();
      const summary: Record<string, { product: number; lifestyle: number; video: number }> = {};
      for (const m of allMockups) {
        if (!summary[m.artworkId]) {
          summary[m.artworkId] = { product: 0, lifestyle: 0, video: 0 };
        }
        if (m.frameType === "Scan Video") {
          summary[m.artworkId].video++;
        } else if (m.isLifestyle) {
          summary[m.artworkId].lifestyle++;
        } else {
          summary[m.artworkId].product++;
        }
      }
      res.json(summary);
    } catch (error) {
      console.error("[Mockup] Error getting mockup summary:", error);
      res.status(500).json({ error: "Failed to get mockup summary" });
    }
  });

  app.post("/api/admin/artworks/bulk-generate-mockups", requireAuth, async (req, res) => {
    req.setTimeout(600000);
    res.setTimeout(600000);
    try {
      const { artworkIds } = req.body;
      if (!artworkIds || !Array.isArray(artworkIds) || artworkIds.length === 0) {
        return res.status(400).json({ error: "artworkIds array is required" });
      }

      const results: { artworkId: string; title: string; success: boolean; error?: string; mockupCount?: number }[] = [];

      for (const artworkId of artworkIds) {
        const artwork = await storage.getArtwork(artworkId);
        if (!artwork) {
          results.push({ artworkId, title: "Unknown", success: false, error: "Not found" });
          continue;
        }

        const imageUrl = artwork.lowResFileUrl || artwork.originalFileUrl;
        if (!imageUrl) {
          results.push({ artworkId, title: artwork.title, success: false, error: "No image" });
          continue;
        }

        const ratioCategory = aspectRatioToCategory(artwork.aspectRatio);
        if (ratioCategory === "custom") {
          results.push({ artworkId, title: artwork.title, success: false, error: `Unsupported ratio: ${artwork.aspectRatio}` });
          continue;
        }

        try {
          await mockupQueue.enqueueAsync(artworkId, artwork.title, async () => {
            const objectStorage = new ObjectStorageService();
            const orientation: "portrait" | "landscape" = (artwork.widthPx > artwork.heightPx) ? "landscape" : "portrait";

            let artworkBuffer: Buffer;
            if (imageUrl.startsWith("/objects/")) {
              artworkBuffer = await objectStorage.downloadFileAsBuffer(imageUrl);
            } else {
              const response = await fetch(imageUrl);
              if (!response.ok) throw new Error("Failed to fetch image");
              artworkBuffer = Buffer.from(await response.arrayBuffer());
            }

            const srcMeta = await sharp(artworkBuffer).metadata();
            const maxMockupDim = 3000;
            if (srcMeta.width && srcMeta.height && Math.max(srcMeta.width, srcMeta.height) > maxMockupDim) {
              const scale = maxMockupDim / Math.max(srcMeta.width, srcMeta.height);
              artworkBuffer = await sharp(artworkBuffer)
                .resize(Math.round(srcMeta.width * scale), Math.round(srcMeta.height * scale), { fit: "fill" })
                .jpeg({ quality: 90 })
                .toBuffer();
            }

            const validFrames = ["black", "white", "natural", "unframed"];
            for (const frame of validFrames) {
              const buffer = await generateProductMockup(artworkBuffer, ratioCategory, frame, orientation);
              const artistSlug = artwork.artistName.replace(/\s+/g, "-");
              const titleSlug = artwork.title.replace(/\s+/g, "-");
              const frameLabel = frame === "unframed" ? "Unframed" : `${frame.charAt(0).toUpperCase() + frame.slice(1)}-Frame`;
              const filename = `mockups/${artistSlug}/${titleSlug}_${frameLabel}.jpg`;
              const uploadUrl = await objectStorage.uploadFile(buffer, filename, "image/jpeg");

              const frameType = frame === "unframed" ? "Unframed" : `${frame.charAt(0).toUpperCase() + frame.slice(1)} Frame`;
              const existingMockups = await storage.getMockupsByArtwork(artwork.id);
              const existingMockup = existingMockups.find(m => m.frameType === frameType && !m.isLifestyle);
              if (existingMockup) {
                await storage.deleteMockup(existingMockup.id);
              }
              const mockup = await storage.createMockup({
                artworkId: artwork.id,
                frameType,
                mockupImageUrl: uploadUrl,
                isLifestyle: false,
              });
              const dbxPath = await syncMockupToDropbox(buffer, artwork.dropboxPath, `${titleSlug}_${frameLabel}.jpg`);
              if (dbxPath) await storage.updateMockup(mockup.id, { dropboxPath: dbxPath });
            }
          }, `bulk-mockup-${artworkId}`);
          results.push({ artworkId, title: artwork.title, success: true, mockupCount: 4 });
        } catch (err: any) {
          console.error(`[Bulk Mockup] Error for artwork ${artworkId}:`, err);
          results.push({ artworkId, title: artwork.title, success: false, error: err.message || "Unknown error" });
        }
      }

      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      console.log(`[Bulk Mockup] Complete: ${succeeded} succeeded, ${failed} failed out of ${artworkIds.length}`);
      res.json({ success: true, results, succeeded, failed, total: artworkIds.length });
    } catch (error) {
      console.error("[Bulk Mockup] Error:", error);
      res.status(500).json({ error: "Failed to bulk generate mockups" });
    }
  });

  // ========== Scan Video Generation API ==========

  app.post("/api/admin/artworks/:id/generate-scan-video", requireAuth, async (req, res) => {
    req.setTimeout(300000);
    res.setTimeout(300000);
    try {
      const artwork = await storage.getArtwork(req.params.id);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }

      const imageUrl = artwork.originalFileUrl || artwork.lowResFileUrl;
      if (!imageUrl) {
        return res.status(400).json({ error: "No artwork image available" });
      }

      console.log(`[ScanVideo] Generating scan video for "${artwork.title}"`);

      let artworkBuffer: Buffer;
      if (imageUrl.startsWith("/objects/")) {
        const objectStorageReader = new ObjectStorageService();
        artworkBuffer = await objectStorageReader.downloadFileAsBuffer(imageUrl);
      } else {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          return res.status(500).json({ error: "Failed to fetch artwork image" });
        }
        artworkBuffer = Buffer.from(await response.arrayBuffer());
      }

      const videoBuffer = await generateArtworkScanVideo(artworkBuffer, {
        outputWidth: 1080,
        outputHeight: 1350,
        fps: 30,
        variant: 5,
      });

      const objectStorage = new ObjectStorageService();
      const sanitize = (s: string) => s.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
      const artistSlug = sanitize(artwork.artistName);
      const titleSlug = sanitize(artwork.title);
      const filename = `mockups/${artistSlug}/${titleSlug}_Scan-Video.mp4`;
      const uploadUrl = await objectStorage.uploadFile(videoBuffer, filename, "video/mp4");

      const existingMockups = await storage.getMockupsByArtwork(artwork.id);
      const existingVideo = existingMockups.find(m => m.frameType === "Scan Video");
      if (existingVideo) {
        await storage.deleteMockup(existingVideo.id);
      }
      const videoMockup = await storage.createMockup({
        artworkId: artwork.id,
        frameType: "Scan Video",
        mockupImageUrl: uploadUrl,
        isLifestyle: false,
      });

      const dbxPath = await syncMockupToDropbox(videoBuffer, artwork.dropboxPath, `${titleSlug}_Scan-Video.mp4`);
      if (dbxPath) await storage.updateMockup(videoMockup.id, { dropboxPath: dbxPath });

      console.log(`[ScanVideo] Saved scan video for "${artwork.title}" (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
      res.json({
        success: true,
        url: uploadUrl,
        sizeBytes: videoBuffer.length,
        artworkId: artwork.id,
      });
    } catch (error) {
      console.error("[ScanVideo] Error generating scan video:", error);
      res.status(500).json({ error: "Failed to generate scan video" });
    }
  });

  app.post("/api/admin/artworks/:id/generate-scan-video-variant", requireAuth, async (req, res) => {
    req.setTimeout(300000);
    res.setTimeout(300000);
    try {
      const { variant } = req.body;
      if (!variant || ![1, 2, 3, 4, 5].includes(variant)) {
        return res.status(400).json({ error: "variant must be 1-5" });
      }

      const artwork = await storage.getArtwork(req.params.id);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }

      const imageUrl = artwork.originalFileUrl || artwork.lowResFileUrl;
      if (!imageUrl) {
        return res.status(400).json({ error: "No artwork image available" });
      }

      console.log(`[ScanVideo] Generating variant ${variant} for "${artwork.title}"`);

      let artworkBuffer: Buffer;
      if (imageUrl.startsWith("/objects/")) {
        const objectStorageReader = new ObjectStorageService();
        artworkBuffer = await objectStorageReader.downloadFileAsBuffer(imageUrl);
      } else {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          return res.status(500).json({ error: "Failed to fetch artwork image" });
        }
        artworkBuffer = Buffer.from(await response.arrayBuffer());
      }

      const videoBuffer = await generateArtworkScanVideo(artworkBuffer, {
        outputWidth: 1080,
        outputHeight: 1350,
        fps: 30,
        variant: variant as ScanVideoVariant,
      });

      const base64 = videoBuffer.toString("base64");
      console.log(`[ScanVideo] Variant ${variant} generated for "${artwork.title}" (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB)`);

      res.json({
        success: true,
        variant,
        sizeBytes: videoBuffer.length,
        base64,
        description: SCAN_VIDEO_VARIANT_DESCRIPTIONS[variant as ScanVideoVariant],
      });
    } catch (error) {
      console.error("[ScanVideo] Error generating variant:", error);
      res.status(500).json({ error: "Failed to generate scan video variant" });
    }
  });

  app.get("/api/admin/scan-video-variants", requireAuth, (_req, res) => {
    res.json(SCAN_VIDEO_VARIANT_DESCRIPTIONS);
  });

  app.post("/api/admin/artworks/bulk-generate-videos", requireAuth, async (req, res) => {
    req.setTimeout(600000);
    res.setTimeout(600000);
    try {
      const { artworkIds } = req.body;
      if (!artworkIds || !Array.isArray(artworkIds) || artworkIds.length === 0) {
        return res.status(400).json({ error: "artworkIds array is required" });
      }

      const results: { artworkId: string; title: string; success: boolean; error?: string; sizeBytes?: number }[] = [];

      for (const artworkId of artworkIds) {
        const artwork = await storage.getArtwork(artworkId);
        if (!artwork) {
          results.push({ artworkId, title: "Unknown", success: false, error: "Not found" });
          continue;
        }

        const imageUrl = artwork.lowResFileUrl || artwork.originalFileUrl;
        if (!imageUrl) {
          results.push({ artworkId, title: artwork.title, success: false, error: "No image" });
          continue;
        }

        let videoSizeBytes = 0;
        try {
          await mockupQueue.enqueueAsync(artworkId, artwork.title, async () => {
            const objectStorage = new ObjectStorageService();

            let artworkBuffer: Buffer;
            if (imageUrl.startsWith("/objects/")) {
              artworkBuffer = await objectStorage.downloadFileAsBuffer(imageUrl);
            } else {
              const response = await fetch(imageUrl);
              if (!response.ok) throw new Error("Failed to fetch image");
              artworkBuffer = Buffer.from(await response.arrayBuffer());
            }

            const srcMeta = await sharp(artworkBuffer).metadata();
            const maxVideoDim = 3000;
            if (srcMeta.width && srcMeta.height && Math.max(srcMeta.width, srcMeta.height) > maxVideoDim) {
              const scale = maxVideoDim / Math.max(srcMeta.width, srcMeta.height);
              artworkBuffer = await sharp(artworkBuffer)
                .resize(Math.round(srcMeta.width * scale), Math.round(srcMeta.height * scale), { fit: "fill" })
                .jpeg({ quality: 90 })
                .toBuffer();
            }

            const videoBuffer = await generateArtworkScanVideo(artworkBuffer, {
              outputWidth: 1080,
              outputHeight: 1350,
              fps: 30,
              variant: 5,
            });

            const sanitize = (s: string) => s.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
            const artistSlug = sanitize(artwork.artistName);
            const titleSlug = sanitize(artwork.title);
            const filename = `mockups/${artistSlug}/${titleSlug}_Scan-Video.mp4`;
            const uploadUrl = await objectStorage.uploadFile(videoBuffer, filename, "video/mp4");

            const existingMockups = await storage.getMockupsByArtwork(artwork.id);
            const existingVideo = existingMockups.find(m => m.frameType === "Scan Video");
            if (existingVideo) {
              await storage.deleteMockup(existingVideo.id);
            }
            const bulkVideoMockup = await storage.createMockup({
              artworkId: artwork.id,
              frameType: "Scan Video",
              mockupImageUrl: uploadUrl,
              isLifestyle: false,
            });

            const dbxPath = await syncMockupToDropbox(videoBuffer, artwork.dropboxPath, `${titleSlug}_Scan-Video.mp4`);
            if (dbxPath) await storage.updateMockup(bulkVideoMockup.id, { dropboxPath: dbxPath });

            videoSizeBytes = videoBuffer.length;
            console.log(`[BulkVideo] Generated scan video for "${artwork.title}" (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
          }, `bulk-video-${artworkId}`);
          results.push({ artworkId, title: artwork.title, success: true, sizeBytes: videoSizeBytes });
        } catch (err: any) {
          console.error(`[BulkVideo] Error for artwork ${artworkId}:`, err);
          results.push({ artworkId, title: artwork.title, success: false, error: err.message || "Unknown error" });
        }
      }

      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      console.log(`[BulkVideo] Complete: ${succeeded} succeeded, ${failed} failed out of ${artworkIds.length}`);
      res.json({ success: true, results, succeeded, failed, total: artworkIds.length });
    } catch (error) {
      console.error("[BulkVideo] Error:", error);
      res.status(500).json({ error: "Failed to bulk generate videos" });
    }
  });

  app.post("/api/admin/templates/:id/generate-lifestyle-mockup", requireAuth, async (req, res) => {
    try {
      const template = await storage.getTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      const { artworkId, zoneIndex } = req.body;
      if (!artworkId) {
        return res.status(400).json({ error: "artworkId is required" });
      }

      const artwork = await storage.getArtwork(artworkId);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }

      const imageUrl = artwork.lowResFileUrl || artwork.originalFileUrl;
      if (!imageUrl) {
        return res.status(400).json({ error: "No artwork image available" });
      }

      const zi = typeof zoneIndex === "number" && Number.isInteger(zoneIndex) ? zoneIndex : 0;
      if (zi < 0 || zi >= template.frameZones.length) {
        return res.status(400).json({ error: `Zone index ${zi} out of range (0-${template.frameZones.length - 1})` });
      }

      const zone = template.frameZones[zi];
      const templateImageUrl = template.templateImageUrl;

      let templateBuffer: Buffer;
      if (templateImageUrl.startsWith("/objects/")) {
        const objStorage = new ObjectStorageService();
        templateBuffer = await objStorage.downloadFileAsBuffer(templateImageUrl);
      } else {
        const resp = await fetch(templateImageUrl);
        if (!resp.ok) throw new Error("Failed to fetch template image");
        templateBuffer = Buffer.from(await resp.arrayBuffer());
      }

      let artworkBuffer: Buffer;
      if (imageUrl.startsWith("/objects/")) {
        const objStorage = new ObjectStorageService();
        artworkBuffer = await objStorage.downloadFileAsBuffer(imageUrl);
      } else {
        const resp = await fetch(imageUrl);
        if (!resp.ok) throw new Error("Failed to fetch artwork image");
        artworkBuffer = Buffer.from(await resp.arrayBuffer());
      }

      const templateMeta = await sharp(templateBuffer).metadata();
      const tW = templateMeta.width!;
      const tH = templateMeta.height!;

      const dstCorners: Point[] = [
        { x: (zone.topLeft.x / 100) * tW, y: (zone.topLeft.y / 100) * tH },
        { x: (zone.topRight.x / 100) * tW, y: (zone.topRight.y / 100) * tH },
        { x: (zone.bottomRight.x / 100) * tW, y: (zone.bottomRight.y / 100) * tH },
        { x: (zone.bottomLeft.x / 100) * tW, y: (zone.bottomLeft.y / 100) * tH },
      ];

      console.log(`[Lifestyle] Generating mockup for "${artwork.title}" in template "${template.name}" zone ${zi}`);
      console.log(`[Lifestyle] Template: ${tW}x${tH}, Zone corners:`, dstCorners);

      const { result } = await compositeWithPerspective(
        templateBuffer,
        artworkBuffer,
        dstCorners,
        {
          blendMode: zone.blendMode || "multiply",
          blendOpacity: zone.blendOpacity !== undefined ? zone.blendOpacity : 0.8,
        },
      );

      const base64 = result.toString("base64");
      res.json({
        preview: `data:image/jpeg;base64,${base64}`,
        sizeBytes: result.length,
        width: tW,
        height: tH,
      });
    } catch (error: any) {
      console.error("[Lifestyle] Error generating mockup:", error);
      const message = error?.message?.includes("Invalid zone") || error?.message?.includes("degenerate")
        ? error.message
        : "Failed to generate lifestyle mockup";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/admin/templates/:id/save-lifestyle-mockup", requireAuth, async (req, res) => {
    try {
      const template = await storage.getTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      const { artworkId, zoneIndex } = req.body;
      if (!artworkId) {
        return res.status(400).json({ error: "artworkId is required" });
      }

      const artwork = await storage.getArtwork(artworkId);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }

      const imageUrl = artwork.lowResFileUrl || artwork.originalFileUrl;
      if (!imageUrl) {
        return res.status(400).json({ error: "No artwork image available" });
      }

      const zi = typeof zoneIndex === "number" && Number.isInteger(zoneIndex) ? zoneIndex : 0;
      if (zi < 0 || zi >= template.frameZones.length) {
        return res.status(400).json({ error: `Zone index ${zi} out of range (0-${template.frameZones.length - 1})` });
      }

      const zone = template.frameZones[zi];
      const templateImageUrl = template.templateImageUrl;

      let templateBuffer: Buffer;
      if (templateImageUrl.startsWith("/objects/")) {
        const objStorage = new ObjectStorageService();
        templateBuffer = await objStorage.downloadFileAsBuffer(templateImageUrl);
      } else {
        const resp = await fetch(templateImageUrl);
        if (!resp.ok) throw new Error("Failed to fetch template image");
        templateBuffer = Buffer.from(await resp.arrayBuffer());
      }

      let artworkBuffer: Buffer;
      if (imageUrl.startsWith("/objects/")) {
        const objStorage = new ObjectStorageService();
        artworkBuffer = await objStorage.downloadFileAsBuffer(imageUrl);
      } else {
        const resp = await fetch(imageUrl);
        if (!resp.ok) throw new Error("Failed to fetch artwork image");
        artworkBuffer = Buffer.from(await resp.arrayBuffer());
      }

      const templateMeta = await sharp(templateBuffer).metadata();
      const tW = templateMeta.width!;
      const tH = templateMeta.height!;

      const dstCorners: Point[] = [
        { x: (zone.topLeft.x / 100) * tW, y: (zone.topLeft.y / 100) * tH },
        { x: (zone.topRight.x / 100) * tW, y: (zone.topRight.y / 100) * tH },
        { x: (zone.bottomRight.x / 100) * tW, y: (zone.bottomRight.y / 100) * tH },
        { x: (zone.bottomLeft.x / 100) * tW, y: (zone.bottomLeft.y / 100) * tH },
      ];

      const { result } = await compositeWithPerspective(
        templateBuffer,
        artworkBuffer,
        dstCorners,
        {
          blendMode: zone.blendMode || "multiply",
          blendOpacity: zone.blendOpacity !== undefined ? zone.blendOpacity : 0.8,
        },
      );

      const objectStorage = new ObjectStorageService();
      const artistSlug = artwork.artistName.replace(/\s+/g, "-");
      const titleSlug = artwork.title.replace(/\s+/g, "-");
      const templateSlug = template.name.replace(/\s+/g, "-");
      const filename = `mockups/${artistSlug}/${titleSlug}_${templateSlug}_lifestyle.jpg`;

      const uploadUrl = await objectStorage.uploadFile(result, filename, "image/jpeg");

      const existingMockups = await storage.getMockupsByArtwork(artwork.id);
      const existingLifestyle = existingMockups.find(
        m => m.isLifestyle && m.templateId === template.id
      );
      if (existingLifestyle) {
        await storage.deleteMockup(existingLifestyle.id);
      }

      const mockup = await storage.createMockup({
        artworkId: artwork.id,
        templateId: template.id,
        frameType: "Lifestyle",
        mockupImageUrl: uploadUrl,
        isLifestyle: true,
      });

      const dbxPath = await syncMockupToDropbox(result, artwork.dropboxPath, `${titleSlug}_${templateSlug}_lifestyle.jpg`);
      if (dbxPath) await storage.updateMockup(mockup.id, { dropboxPath: dbxPath });

      console.log(`[Lifestyle] Saved mockup for "${artwork.title}" in "${template.name}"`);
      res.json({ success: true, mockup, sizeBytes: result.length });
    } catch (error: any) {
      console.error("[Lifestyle] Error saving mockup:", error?.message || error);
      const message = error?.message?.includes("Invalid zone") || error?.message?.includes("degenerate")
        ? error.message
        : `Failed to save lifestyle mockup: ${error?.message || "Unknown error"}`;
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/admin/artworks/:id/generate-template-mockups", requireAuth, async (req, res) => {
    try {
      const artwork = await storage.getArtwork(req.params.id);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }

      const imageUrl = artwork.lowResFileUrl || artwork.originalFileUrl;
      if (!imageUrl) {
        return res.status(400).json({ error: "No artwork image available" });
      }

      let artworkBuffer: Buffer;
      const objStorage = new ObjectStorageService();
      if (imageUrl.startsWith("/objects/")) {
        artworkBuffer = await objStorage.downloadFileAsBuffer(imageUrl);
      } else {
        const resp = await fetch(imageUrl);
        if (!resp.ok) throw new Error("Failed to fetch artwork image");
        artworkBuffer = Buffer.from(await resp.arrayBuffer());
      }

      const artMeta = await sharp(artworkBuffer).metadata();
      if (artMeta.width && artMeta.height && Math.max(artMeta.width, artMeta.height) > 3000) {
        artworkBuffer = await sharp(artworkBuffer)
          .resize(3000, 3000, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 90 })
          .toBuffer();
      }

      const allTemplates = await storage.getAllTemplates();
      const results: { templateName: string; success: boolean; error?: string }[] = [];

      for (const template of allTemplates) {
        if (!template.frameZones || template.frameZones.length === 0) continue;
        if (template.artistVendorName && template.artistVendorName !== artwork.artistName) continue;

        for (let zi = 0; zi < template.frameZones.length; zi++) {
          const zone = template.frameZones[zi];
          const zoneRatio = detectZoneRatio(zone);
          if (!artworkMatchesRatio(artwork.aspectRatio, zoneRatio)) continue;

          try {
            const templateImageUrl = template.templateImageUrl;
            let templateBuffer: Buffer;
            if (templateImageUrl.startsWith("/objects/")) {
              templateBuffer = await objStorage.downloadFileAsBuffer(templateImageUrl);
            } else {
              const tResp = await fetch(templateImageUrl);
              if (!tResp.ok) throw new Error("Failed to fetch template image");
              templateBuffer = Buffer.from(await tResp.arrayBuffer());
            }

            const templateMeta = await sharp(templateBuffer).metadata();
            const tW = templateMeta.width!;
            const tH = templateMeta.height!;

            const dstCorners: Point[] = [
              { x: (zone.topLeft.x / 100) * tW, y: (zone.topLeft.y / 100) * tH },
              { x: (zone.topRight.x / 100) * tW, y: (zone.topRight.y / 100) * tH },
              { x: (zone.bottomRight.x / 100) * tW, y: (zone.bottomRight.y / 100) * tH },
              { x: (zone.bottomLeft.x / 100) * tW, y: (zone.bottomLeft.y / 100) * tH },
            ];

            const { result } = await compositeWithPerspective(
              templateBuffer,
              artworkBuffer,
              dstCorners,
              {
                blendMode: zone.blendMode || "multiply",
                blendOpacity: zone.blendOpacity !== undefined ? zone.blendOpacity : 0.8,
              },
            );

            const artistSlug = artwork.artistName.replace(/[^a-zA-Z0-9]+/g, "-");
            const titleSlug = artwork.title.replace(/[^a-zA-Z0-9]+/g, "-");
            const templateSlug = template.name.replace(/[^a-zA-Z0-9]+/g, "-");
            const filename = `mockups/${artistSlug}/${titleSlug}_${templateSlug}_lifestyle.jpg`;
            const uploadUrl = await objStorage.uploadFile(result, filename, "image/jpeg");

            const existingMockups = await storage.getMockupsByArtwork(artwork.id);
            const existingLifestyle = existingMockups.find(
              m => m.isLifestyle && m.templateId === template.id
            );
            if (existingLifestyle) {
              await storage.deleteMockup(existingLifestyle.id);
            }

            const tmMockup = await storage.createMockup({
              artworkId: artwork.id,
              templateId: template.id,
              frameType: "Lifestyle",
              mockupImageUrl: uploadUrl,
              isLifestyle: true,
            });

            const tmDbxPath = await syncMockupToDropbox(result, artwork.dropboxPath, `${titleSlug}_${templateSlug}_lifestyle.jpg`);
            if (tmDbxPath) await storage.updateMockup(tmMockup.id, { dropboxPath: tmDbxPath });

            results.push({ templateName: template.name, success: true });
            console.log(`[TemplateMockup] Generated lifestyle for "${artwork.title}" using "${template.name}" zone ${zi}`);
          } catch (err: any) {
            results.push({ templateName: template.name, success: false, error: err?.message });
            console.error(`[TemplateMockup] Failed for "${template.name}" zone ${zi}:`, err?.message);
          }
          break;
        }
      }

      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      console.log(`[TemplateMockup] Completed for "${artwork.title}": ${succeeded} succeeded, ${failed} failed`);
      res.json({ success: true, results, succeeded, failed });
    } catch (error: any) {
      console.error("[TemplateMockup] Error:", error?.message || error);
      res.status(500).json({ error: error?.message || "Failed to generate template mockups" });
    }
  });

  // ========== User Feedback API ==========

  // Submit user feedback (public endpoint)
  app.post("/api/feedback", async (req, res) => {
    try {
      const { rating, feedback, artistName, artistEmail } = req.body;
      
      if (!rating || !["positive", "negative"].includes(rating)) {
        return res.status(400).json({ error: "Valid rating (positive/negative) is required" });
      }
      
      const newFeedback = await storage.createUserFeedback({
        rating,
        feedback: feedback || null,
        artistName: artistName || null,
        artistEmail: artistEmail || null,
      });
      
      res.json(newFeedback);
    } catch (error) {
      console.error("Error submitting feedback:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  // Get all feedback (admin only)
  app.get("/api/feedback", requireAuth, async (req, res) => {
    try {
      const feedback = await storage.getAllUserFeedback();
      res.json(feedback);
    } catch (error) {
      console.error("Error getting feedback:", error);
      res.status(500).json({ error: "Failed to get feedback" });
    }
  });

  // ========== COA Layouts API ==========

  // Get default COA layout (public - for artist preview)
  app.get("/api/coa-layout/default", async (req, res) => {
    try {
      const layout = await storage.getDefaultCOALayout();
      // Return stored layout or fallback to built-in default
      res.json(layout || getDefaultLayout());
    } catch (error) {
      console.error("Error getting default COA layout:", error);
      res.status(500).json({ error: "Failed to get default COA layout" });
    }
  });

  // Get all COA layouts (admin only)
  app.get("/api/coa-layouts", requireAuth, async (req, res) => {
    try {
      const layouts = await storage.getAllCOALayouts();
      res.json(layouts);
    } catch (error) {
      console.error("Error getting COA layouts:", error);
      res.status(500).json({ error: "Failed to get COA layouts" });
    }
  });

  // Get specific COA layout (admin only)
  app.get("/api/coa-layouts/:id", requireAuth, async (req, res) => {
    try {
      const layout = await storage.getCOALayout(req.params.id);
      if (!layout) {
        return res.status(404).json({ error: "Layout not found" });
      }
      res.json(layout);
    } catch (error) {
      console.error("Error getting COA layout:", error);
      res.status(500).json({ error: "Failed to get COA layout" });
    }
  });

  // Create COA layout (admin only)
  app.post("/api/coa-layouts", requireAuth, async (req, res) => {
    try {
      const layout = await storage.createCOALayout(req.body);
      res.status(201).json(layout);
    } catch (error) {
      console.error("Error creating COA layout:", error);
      res.status(500).json({ error: "Failed to create COA layout" });
    }
  });

  // Update COA layout (admin only)
  app.put("/api/coa-layouts/:id", requireAuth, async (req, res) => {
    try {
      const layout = await storage.updateCOALayout(req.params.id, req.body);
      if (!layout) {
        return res.status(404).json({ error: "Layout not found" });
      }
      res.json(layout);
    } catch (error) {
      console.error("Error updating COA layout:", error);
      res.status(500).json({ error: "Failed to update COA layout" });
    }
  });

  // Delete COA layout (admin only)
  app.delete("/api/coa-layouts/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteCOALayout(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Layout not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting COA layout:", error);
      res.status(500).json({ error: "Failed to delete COA layout" });
    }
  });

  // Set COA layout as default (admin only)
  app.post("/api/coa-layouts/:id/set-default", requireAuth, async (req, res) => {
    try {
      const layout = await storage.setDefaultCOALayout(req.params.id);
      if (!layout) {
        return res.status(404).json({ error: "Layout not found" });
      }
      res.json(layout);
    } catch (error) {
      console.error("Error setting default COA layout:", error);
      res.status(500).json({ error: "Failed to set default COA layout" });
    }
  });

  // ============ Email Templates ============

  // Get all email templates (admin only)
  app.get("/api/email-templates", requireAuth, async (req, res) => {
    try {
      const templates = await storage.getAllEmailTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching email templates:", error);
      res.status(500).json({ error: "Failed to fetch email templates" });
    }
  });

  // Get single email template (admin only)
  app.get("/api/email-templates/:id", requireAuth, async (req, res) => {
    try {
      const template = await storage.getEmailTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error fetching email template:", error);
      res.status(500).json({ error: "Failed to fetch email template" });
    }
  });

  // Create email template (admin only)
  app.post("/api/email-templates", requireAuth, async (req, res) => {
    try {
      const template = await storage.createEmailTemplate(req.body);
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating email template:", error);
      res.status(500).json({ error: "Failed to create email template" });
    }
  });

  // Update email template (admin only)
  app.put("/api/email-templates/:id", requireAuth, async (req, res) => {
    try {
      const template = await storage.updateEmailTemplate(req.params.id, req.body);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error updating email template:", error);
      res.status(500).json({ error: "Failed to update email template" });
    }
  });

  // Delete email template (admin only)
  app.delete("/api/email-templates/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteEmailTemplate(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting email template:", error);
      res.status(500).json({ error: "Failed to delete email template" });
    }
  });

  // Upload COA template image (admin only)
  app.post("/api/coa-template/upload", requireAuth, upload.single("template"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const filename = `coa-template-${Date.now()}.jpg`;
      const url = await objectStorageService.uploadFile(
        getFileBuffer(req.file),
        filename,
        req.file.mimetype
      );
      cleanupTempFile(req.file);

      res.json({ templateUrl: url });
    } catch (error) {
      console.error("Error uploading COA template:", error);
      res.status(500).json({ error: "Failed to upload template" });
    }
  });

  // Generate COA preview for an artwork (admin only)
  // GET for quick preview with saved layout
  app.get("/api/coa-preview/:artworkId", requireAuth, async (req, res) => {
    try {
      const artwork = await storage.getArtwork(req.params.artworkId);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }

      const layout = await storage.getDefaultCOALayout() || getDefaultLayout();
      const editionNumber = 1; // Preview shows edition 1
      
      const coa = await trackToolMemory('COAGenerator', 'generateSingle', async () => {
        return await generateSingleCOA(artwork, editionNumber, layout);
      });
      
      res.set('Content-Type', 'image/jpeg');
      res.set('Content-Disposition', `inline; filename="${coa.filename}"`);
      res.send(coa.buffer);
    } catch (error) {
      console.error("Error generating COA preview:", error);
      res.status(500).json({ error: "Failed to generate COA preview" });
    }
  });

  // POST for preview with custom layout from editor
  app.post("/api/coa-preview/:artworkId", requireAuth, async (req, res) => {
    try {
      const artwork = await storage.getArtwork(req.params.artworkId);
      if (!artwork) {
        return res.status(404).json({ error: "Artwork not found" });
      }

      // Use the layout sent from the editor
      const customLayout = req.body as COALayout;
      const editionNumber = 1; // Preview shows edition 1
      
      const coa = await generateSingleCOA(artwork, editionNumber, customLayout);
      
      res.set('Content-Type', 'image/jpeg');
      res.set('Content-Disposition', `inline; filename="${coa.filename}"`);
      res.send(coa.buffer);
    } catch (error) {
      console.error("Error generating COA preview:", error);
      res.status(500).json({ error: "Failed to generate COA preview" });
    }
  });

  // POST for form preview (no saved artwork required)
  // This renders the COA based on form input data for submission form preview
  app.post("/api/coa-form-preview", async (req, res) => {
    try {
      const { artworkTitle, artistName, editionSize, signatureDataUrl, artworkPreviewDataUrl } = req.body;
      
      // Create a mock artwork object for the generator
      const mockArtwork: Artwork = {
        id: "preview",
        title: artworkTitle || "Untitled",
        artistName: artistName || "Artist",
        artistEmail: "",
        comments: null,
        signature: null,
        originalFilename: "",
        originalFileUrl: "",
        lowResFileUrl: artworkPreviewDataUrl || null,
        dropboxPath: null,
        dropboxUploadFailed: false,
        uploadBatchId: null,
        uploadedAt: new Date(),
        groupId: null,
        isGroupPrimary: false,
        editionType: "limited",
        editionSize: editionSize || 50,
        artworkStory: null,
        artistSignatureFileUrl: signatureDataUrl || null,
        coaUrls: null,
        coaDropboxPath: null,
        widthPx: 0,
        heightPx: 0,
        dpi: 0,
        aspectRatio: "",
        maxPrintSize: "",
        calculatedSizes: [],
        availableSizes: [],
        description: null,
        vendor: null,
        tags: null,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Get the default layout
      const layout = await storage.getDefaultCOALayout() || getDefaultLayout();
      
      const coa = await generateSingleCOA(mockArtwork, 1, layout);
      
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'no-cache');
      res.send(coa.buffer);
    } catch (error) {
      console.error("Error generating COA form preview:", error);
      res.status(500).json({ error: "Failed to generate COA form preview" });
    }
  });

  // ========== Artist Dashboard API ==========

  // Import Shopify vendors as artist accounts (admin only)
  app.post("/api/admin/import-vendors", requireAuth, async (req, res) => {
    try {
      console.log("[Artist] Starting Shopify vendor import...");
      const vendors = await getShopifyVendors();
      
      const results = {
        total: vendors.length,
        created: 0,
        existing: 0,
        errors: 0,
      };

      for (const vendorName of vendors) {
        try {
          const existing = await storage.getArtistAccountByVendor(vendorName);
          if (existing) {
            results.existing++;
          } else {
            await storage.createArtistAccount({ vendorName, onboardingStatus: "pending", useCustomCommission: false });
            results.created++;
          }
        } catch (error) {
          console.error(`[Artist] Error creating account for vendor "${vendorName}":`, error);
          results.errors++;
        }
      }

      console.log(`[Artist] Vendor import complete:`, results);
      res.json(results);
    } catch (error) {
      console.error("[Artist] Error importing vendors:", error);
      res.status(500).json({ error: "Failed to import vendors from Shopify" });
    }
  });

  // Get all artist accounts (admin only)
  app.get("/api/admin/artwork-artist-names", requireAuth, async (_req, res) => {
    try {
      const allArtworks = await storage.getAllArtworks();
      const uniqueNames = [...new Set(allArtworks.map(a => a.artistName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      res.json(uniqueNames);
    } catch (error) {
      console.error("[Artists] Error fetching artwork artist names:", error);
      res.status(500).json({ error: "Failed to fetch artist names" });
    }
  });

  app.get("/api/admin/artist-accounts", requireAuth, async (req, res) => {
    try {
      const accounts = await storage.getAllArtistAccounts();
      res.json(accounts);
    } catch (error) {
      console.error("[Artist] Error fetching artist accounts:", error);
      res.status(500).json({ error: "Failed to fetch artist accounts" });
    }
  });

  // Get single artist account (admin only)
  app.get("/api/admin/artist-accounts/:id", requireAuth, async (req, res) => {
    try {
      const account = await storage.getArtistAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ error: "Artist account not found" });
      }
      res.json(account);
    } catch (error) {
      console.error("[Artist] Error fetching artist account:", error);
      res.status(500).json({ error: "Failed to fetch artist account" });
    }
  });

  // Download artist photo (admin only)
  app.get("/api/admin/artist-accounts/:id/photos/:photoIndex/download", requireAuth, async (req, res) => {
    try {
      const account = await storage.getArtistAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ error: "Artist account not found" });
      }

      const photoIndex = parseInt(req.params.photoIndex);
      const photoUrls = account.photoUrls || [];
      
      if (photoIndex < 0 || photoIndex >= photoUrls.length) {
        return res.status(404).json({ error: "Photo not found" });
      }

      const photoUrl = photoUrls[photoIndex];
      
      // Generate filename
      const artistName = account.artistAlias || account.vendorName || "artist";
      const filename = `${artistName.replace(/[^a-zA-Z0-9]/g, "_")}_photo_${photoIndex + 1}.jpg`;
      
      // Set Content-Disposition header for download before streaming
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
      
      // Get file from object storage and stream it
      const objectFile = await objectStorageService.getObjectEntityFile(photoUrl);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("[Artist] Error downloading photo:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to download photo" });
      }
    }
  });

  // Get artist dashboard data for admin view
  app.get("/api/admin/artist-accounts/:id/dashboard", requireAuth, async (req, res) => {
    try {
      const account = await storage.getArtistAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ error: "Artist account not found" });
      }

      // Get artist's artworks
      const allArtworks = await storage.getAllArtworks();
      const artworks = allArtworks.filter((a) => a.artistName === account.vendorName);

      // Get artist's sales data
      const sales = await storage.getArtistSales(req.params.id);

      // Get live products from Shopify
      let liveProducts: any[] = [];
      try {
        const { getProductsByVendor } = await import("./shopifyService");
        liveProducts = await getProductsByVendor(account.vendorName);
      } catch (e) {
        console.log("[Admin] Could not fetch Shopify products:", e);
      }

      res.json({
        profile: account,
        artworks,
        sales,
        liveProducts,
      });
    } catch (error) {
      console.error("[Admin] Error fetching artist dashboard:", error);
      res.status(500).json({ error: "Failed to fetch artist dashboard" });
    }
  });

  // ========== Admin Artist View Endpoints (Impersonation) ==========
  // These mirror /api/artist/* endpoints but allow admin to view any artist's data

  // Get artist profile for admin viewing
  app.get("/api/admin/view-artist/:id/profile", requireAuth, async (req, res) => {
    try {
      const account = await storage.getArtistAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ error: "Artist account not found" });
      }
      res.json(account);
    } catch (error) {
      console.error("[Admin] Error fetching artist profile:", error);
      res.status(500).json({ error: "Failed to fetch artist profile" });
    }
  });

  // Get artist artworks for admin viewing
  app.get("/api/admin/view-artist/:id/artworks", requireAuth, async (req, res) => {
    try {
      const account = await storage.getArtistAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ error: "Artist account not found" });
      }

      const allArtworks = await storage.getAllArtworks();
      const artistArtworks = allArtworks.filter(
        (a) => a.vendor === account.vendorName || a.artistName === account.vendorName
      );
      res.json(artistArtworks);
    } catch (error) {
      console.error("[Admin] Error fetching artist artworks:", error);
      res.status(500).json({ error: "Failed to fetch artist artworks" });
    }
  });

  // Get artist collection (Shopify products) for admin viewing
  app.get("/api/admin/view-artist/:id/collection", requireAuth, async (req, res) => {
    try {
      const account = await storage.getArtistAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ error: "Artist account not found" });
      }

      const { getProductsByVendor } = await import("./shopifyService");
      const products = await getProductsByVendor(account.vendorName);
      res.json(products);
    } catch (error) {
      console.error("[Admin] Error fetching artist collection:", error);
      res.status(500).json({ error: "Failed to fetch artist collection" });
    }
  });

  // Get artist sales for admin viewing
  app.get("/api/admin/view-artist/:id/sales", requireAuth, async (req, res) => {
    try {
      const account = await storage.getArtistAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ error: "Artist account not found" });
      }

      const sales = await storage.getArtistSales(String(account.id));
      res.json(sales);
    } catch (error) {
      console.error("[Admin] Error fetching artist sales:", error);
      res.status(500).json({ error: "Failed to fetch artist sales" });
    }
  });

  // Get artist commissions for admin viewing
  app.get("/api/admin/view-artist/:id/commissions", requireAuth, async (req, res) => {
    try {
      const account = await storage.getArtistAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ error: "Artist account not found" });
      }
      const sales = await storage.getArtistSales(String(account.id));
      res.json(sales);
    } catch (error) {
      console.error("[Admin] Error fetching artist commissions:", error);
      res.status(500).json({ error: "Failed to fetch artist commissions" });
    }
  });

  // Get artist invoices (payout items) for admin viewing
  app.get("/api/admin/view-artist/:id/invoices", requireAuth, async (req, res) => {
    try {
      const account = await storage.getArtistAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ error: "Artist account not found" });
      }
      const payouts = await storage.getPayoutItemsByArtist(String(account.id));
      res.json(payouts);
    } catch (error) {
      console.error("[Admin] Error fetching artist invoices:", error);
      res.status(500).json({ error: "Failed to fetch artist invoices" });
    }
  });

  // Get artist payouts (alias for invoices) for admin viewing
  app.get("/api/admin/view-artist/:id/payouts", requireAuth, async (req, res) => {
    try {
      const account = await storage.getArtistAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ error: "Artist account not found" });
      }
      const payouts = await storage.getPayoutItemsByArtist(String(account.id));
      res.json(payouts);
    } catch (error) {
      console.error("[Admin] Error fetching artist payouts:", error);
      res.status(500).json({ error: "Failed to fetch artist payouts" });
    }
  });

  // Update artist account (admin only)
  app.patch("/api/admin/artist-accounts/:id", requireAuth, async (req, res) => {
    try {
      const { firstName, lastName, artistAlias, useCustomCommission, commissionRate, primaryEmail, paypalEmail, paypalRecipientName } = req.body;
      
      // Build update object with only allowed fields
      const updates: Record<string, any> = {};
      
      if (firstName !== undefined) updates.firstName = firstName?.trim() || null;
      if (lastName !== undefined) updates.lastName = lastName?.trim() || null;
      if (artistAlias !== undefined) updates.artistAlias = artistAlias?.trim() || null;
      if (primaryEmail !== undefined) updates.primaryEmail = primaryEmail?.trim() || null;
      if (paypalEmail !== undefined) updates.paypalEmail = paypalEmail?.trim() || null;
      if (paypalRecipientName !== undefined) updates.paypalRecipientName = paypalRecipientName?.trim() || null;
      
      if (useCustomCommission !== undefined) {
        updates.useCustomCommission = Boolean(useCustomCommission);
      }
      
      if (commissionRate !== undefined) {
        if (commissionRate === null) {
          updates.commissionRate = null;
        } else {
          const rate = typeof commissionRate === 'number' ? commissionRate : parseFloat(commissionRate);
          if (!isNaN(rate) && rate >= 0 && rate <= 100) {
            updates.commissionRate = rate;
          } else {
            return res.status(400).json({ error: "Invalid commission rate - must be between 0 and 100" });
          }
        }
      }
      
      const updated = await storage.updateArtistAccount(req.params.id, updates);
      if (!updated) {
        return res.status(404).json({ error: "Artist account not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("[Artist] Error updating artist account:", error);
      res.status(500).json({ error: "Failed to update artist account" });
    }
  });

  // Delete artist account (admin only)
  app.delete("/api/admin/artist-accounts/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteArtistAccount(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Artist account not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[Artist] Error deleting artist account:", error);
      res.status(500).json({ error: "Failed to delete artist account" });
    }
  });

  // Send invitation to artist (admin only)
  app.post("/api/admin/artist-accounts/:id/invite", requireAuth, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const account = await storage.getArtistAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ error: "Artist account not found" });
      }

      // Generate invitation token (valid for 7 days)
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await storage.updateArtistAccount(req.params.id, {
        primaryEmail: email,
        invitationToken: token,
        invitationExpiresAt: expiresAt,
        onboardingStatus: "invited",
      });

      // Build invitation URL
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const inviteUrl = `${baseUrl}/artist/setup?token=${token}`;

      // Send invitation email using existing email service
      const emailService = await import("./emailService");
      await emailService.sendArtistInvitation(email, account.vendorName, inviteUrl);

      console.log(`[Artist] Invitation sent to ${email} for artist "${account.vendorName}"`);
      res.json({ success: true, message: "Invitation sent successfully" });
    } catch (error) {
      console.error("[Artist] Error sending invitation:", error);
      res.status(500).json({ error: "Failed to send invitation" });
    }
  });

  // Invite artist via Supabase Auth (admin only)
  // Sends a Supabase invitation email — artist sets their password via the link
  app.post("/api/admin/artists/invite", requireAuth, async (req, res) => {
    try {
      const { email, artistAccountId } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      let firstName: string | null = null;
      if (artistAccountId) {
        try {
          const artist = await storage.getArtistAccount(artistAccountId);
          firstName = artist?.firstName || null;
        } catch (_) {}
      }

      const siteUrl = process.env.SITE_URL ||
        (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null) ||
        `${req.protocol}://${req.get("host")}`;
      const redirectTo = `${siteUrl}/artist/setup`;

      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: {
          artist_account_id: artistAccountId || null,
          first_name: firstName || "",
        },
      });

      if (error) {
        console.error("[Supabase Invite] Error:", error);
        return res.status(500).json({ error: error.message });
      }

      if (artistAccountId) {
        try {
          await storage.updateArtistAccount(artistAccountId, {
            primaryEmail: email,
            onboardingStatus: "invited",
          });
        } catch (updateErr) {
          console.warn("[Supabase Invite] Failed to update artist account status:", updateErr);
        }
      }

      console.log(`[Supabase Invite] Invitation sent to ${email}`);
      res.json({ success: true, userId: data.user?.id });
    } catch (err) {
      console.error("[Supabase Invite] Unexpected error:", err);
      res.status(500).json({ error: "Failed to send invitation" });
    }
  });

  // Create a new artist account record and immediately send a Supabase portal invitation
  app.post("/api/admin/artists/create-and-invite", requireAuth, async (req, res) => {
    try {
      const { firstName, lastName, email, commissionRate } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });
      if (!firstName && !lastName) return res.status(400).json({ error: "Artist name is required" });

      const vendorName = [firstName, lastName].filter(Boolean).join(" ");

      const account = await storage.createArtistAccount({
        vendorName,
        firstName: firstName || null,
        lastName: lastName || null,
        primaryEmail: email,
        onboardingStatus: "invited",
        useCustomCommission: !!commissionRate,
        commissionRate: commissionRate ? Number(commissionRate) : null,
      });

      const siteUrl = process.env.SITE_URL ||
        (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null) ||
        `${req.protocol}://${req.get("host")}`;
      const redirectTo = `${siteUrl}/artist/setup`;
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { artist_account_id: account.id, first_name: firstName || "" },
      });

      if (error) {
        console.error("[Create+Invite] Supabase invite failed:", error);
        // Artist account was created — return partial success so admin knows
        return res.status(207).json({
          warning: "Artist account created but invitation email failed",
          artistAccountId: account.id,
          supabaseError: error.message,
        });
      }

      console.log(`[Create+Invite] Account created (${account.id}) and invite sent to ${email}`);
      res.json({ success: true, artistAccountId: account.id, userId: data.user?.id });
    } catch (err) {
      console.error("[Create+Invite] Unexpected error:", err);
      res.status(500).json({ error: "Failed to create artist and send invitation" });
    }
  });

  // Setup artist in Shopify (create metaobject, collection, add to menus)
  app.post("/api/admin/artist-accounts/:id/setup-shopify", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const account = await storage.getArtistAccount(id);
      
      if (!account) {
        return res.status(404).json({ error: "Artist account not found" });
      }
      
      if (account.shopifySetupComplete) {
        return res.status(400).json({ error: "Artist already set up in Shopify" });
      }
      
      const shopifySetup = await import("./shopifyArtistSetup");
      const result = await shopifySetup.setupArtistInShopify(account);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error || "Failed to setup artist in Shopify" });
      }
      
      // Update the artist account with Shopify IDs and mark as complete
      await storage.updateArtistAccount(id, {
        shopifySetupComplete: true,
        shopifyMetaobjectId: result.metaobjectId || null,
        shopifyCollectionId: result.collectionId || null,
      });
      
      console.log(`[Artist] Shopify setup complete for "${account.vendorName}"`);
      res.json({
        success: true,
        metaobjectId: result.metaobjectId,
        collectionId: result.collectionId,
      });
    } catch (error) {
      console.error("[Artist] Error setting up in Shopify:", error);
      res.status(500).json({ error: "Failed to setup artist in Shopify" });
    }
  });

  // ── Sales Sync ────────────────────────────────────────────────────────────
  // POST /api/admin/sync-artist-sales
  // Fetches Shopify orders for the past N months and rebuilds artist_sales
  // records per artist per month, applying current commission settings.
  app.post("/api/admin/sync-artist-sales", requireAuth, async (req, res) => {
    try {
      const months: number = Math.min(Math.max(parseInt(req.body?.months ?? "12", 10), 1), 24);

      const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
      const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
      if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
        return res.status(503).json({ error: "Shopify credentials not configured" });
      }

      // Fetch global commission settings
      const globalSettings = await storage.getCommissionSettings();

      // Build month buckets for the past N months
      const now = new Date();
      const monthBuckets: { start: Date; end: Date; label: string }[] = [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
        const label = `${d.toLocaleString("default", { month: "long" })} ${d.getFullYear()}`;
        monthBuckets.push({ start, end, label });
      }

      // Fetch all artist accounts to look up commission rates
      const allArtists = await storage.getArtistAccounts();
      const artistByVendor = new Map<string, typeof allArtists[0]>();
      for (const a of allArtists) {
        if (a.vendorName) artistByVendor.set(a.vendorName.toLowerCase().trim(), a);
      }

      // Helper: paginate all Shopify orders in a date range
      async function fetchOrdersInRange(start: Date, end: Date) {
        const orders: any[] = [];
        let url = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/orders.json?` +
          `status=any&limit=250` +
          `&created_at_min=${start.toISOString()}` +
          `&created_at_max=${end.toISOString()}` +
          `&fields=id,created_at,line_items,shipping_lines,tax_lines,financial_status`;

        while (url) {
          const response = await fetch(url, {
            headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN! },
          });
          if (!response.ok) throw new Error(`Shopify orders fetch failed: ${response.status}`);
          const data = await response.json();
          orders.push(...(data.orders ?? []));

          // Follow cursor pagination via Link header
          const link = response.headers.get("link") ?? "";
          const next = link.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
          url = next ?? "";
        }
        return orders;
      }

      // Process each month
      const summary: { month: string; orders: number; artistsUpdated: string[] }[] = [];

      for (const bucket of monthBuckets) {
        console.log(`[SalesSync] Processing ${bucket.label}…`);
        const orders = await fetchOrdersInRange(bucket.start, bucket.end);
        console.log(`[SalesSync] ${bucket.label}: ${orders.length} orders`);

        // Aggregate sales per vendor for this month
        const vendorSales: Record<string, {
          units: number;
          grossRevenue: number;
          orderIds: Set<string>;
          products: Record<string, { title: string; units: number; revenue: number }>;
        }> = {};

        for (const order of orders) {
          // Compute shipping and tax totals (same logic as webhook)
          let totalShipping = 0;
          let totalShippingTax = 0;
          for (const sl of order.shipping_lines ?? []) {
            totalShipping += parseFloat(sl.price ?? "0") * 100;
            if (globalSettings.applyAfterTax) {
              for (const tl of sl.tax_lines ?? []) {
                totalShippingTax += parseFloat(tl.price ?? "0") * 100;
              }
            }
          }
          totalShipping += totalShippingTax;

          let orderLevelTax = 0;
          if (globalSettings.applyAfterTax) {
            for (const tl of order.tax_lines ?? []) {
              orderLevelTax += parseFloat(tl.price ?? "0") * 100;
            }
            let lineItemTaxTotal = 0;
            for (const item of order.line_items ?? []) {
              for (const tl of item.tax_lines ?? []) {
                lineItemTaxTotal += parseFloat(tl.price ?? "0") * 100;
              }
            }
            orderLevelTax = Math.max(0, orderLevelTax - lineItemTaxTotal - totalShippingTax);
          }

          // First pass for proportional allocation
          let totalAdjustedValue = 0;
          const lineValues: { vendor: string; baseValue: number; adjustedValue: number; item: any }[] = [];
          for (const item of order.line_items ?? []) {
            if (!item.vendor) continue;
            const qty = item.quantity ?? 1;
            const price = parseFloat(item.price ?? "0") * 100;
            const baseValue = price * qty;
            let adjustedValue = baseValue;
            if (globalSettings.applyAfterDiscounts) {
              adjustedValue = Math.max(0, baseValue - parseFloat(item.total_discount ?? "0") * 100);
            }
            lineValues.push({ vendor: item.vendor, baseValue, adjustedValue, item });
            totalAdjustedValue += adjustedValue;
          }

          // Second pass: compute commission base per line item
          for (const { vendor, baseValue, adjustedValue, item } of lineValues) {
            const qty = item.quantity ?? 1;
            let commissionBase = baseValue;

            if (globalSettings.applyAfterDiscounts) {
              commissionBase -= parseFloat(item.total_discount ?? "0") * 100;
            }
            if (globalSettings.applyAfterTax) {
              const lineTax = (item.tax_lines ?? []).reduce((s: number, tl: any) => s + parseFloat(tl.price ?? "0") * 100, 0);
              commissionBase += lineTax;
              if (orderLevelTax > 0 && totalAdjustedValue > 0) {
                commissionBase += Math.round(orderLevelTax * (adjustedValue / totalAdjustedValue));
              }
            }
            if (globalSettings.applyAfterShipping && totalAdjustedValue > 0 && totalShipping > 0) {
              commissionBase += Math.round(totalShipping * (adjustedValue / totalAdjustedValue));
            }
            commissionBase = Math.max(0, commissionBase);

            if (!vendorSales[vendor]) {
              vendorSales[vendor] = { units: 0, grossRevenue: 0, orderIds: new Set(), products: {} };
            }
            vendorSales[vendor].units += qty;
            vendorSales[vendor].grossRevenue += commissionBase;
            vendorSales[vendor].orderIds.add(String(order.id));

            const productId = item.product_id?.toString() ?? item.title;
            if (!vendorSales[vendor].products[productId]) {
              vendorSales[vendor].products[productId] = { title: item.title, units: 0, revenue: 0 };
            }
            vendorSales[vendor].products[productId].units += qty;
            vendorSales[vendor].products[productId].revenue += commissionBase;
          }
        }

        // Upsert artist_sales for each artist vendor found this month
        const artistsUpdated: string[] = [];
        for (const [vendorName, sales] of Object.entries(vendorSales)) {
          const artist = artistByVendor.get(vendorName.toLowerCase().trim());
          if (!artist) continue; // Skip non-artist vendors (e.g. "East Side Studio")

          const commissionRate = artist.useCustomCommission && artist.commissionRate !== null
            ? artist.commissionRate
            : globalSettings.defaultCommissionRate;
          const netRevenue = Math.round(sales.grossRevenue * (commissionRate / 100));

          const productBreakdown = Object.entries(sales.products).map(([productId, d]) => ({
            productId,
            productTitle: d.title,
            units: d.units,
            revenue: Math.round(d.revenue * (commissionRate / 100)),
          }));

          // Find and replace existing sales record for this month/artist
          const existingSales = await storage.getArtistSales(artist.id);
          const existing = existingSales.find(s => {
            const sStart = new Date(s.periodStart);
            return sStart.getFullYear() === bucket.start.getFullYear() &&
              sStart.getMonth() === bucket.start.getMonth();
          });

          if (existing) {
            await storage.updateArtistSales(existing.id, {
              totalOrders: sales.orderIds.size,
              totalUnits: sales.units,
              grossRevenue: sales.grossRevenue,
              netRevenue,
              productBreakdown,
              lastSyncedAt: new Date(),
            });
          } else {
            await storage.createArtistSales({
              artistAccountId: artist.id,
              periodStart: bucket.start,
              periodEnd: bucket.end,
              totalOrders: sales.orderIds.size,
              totalUnits: sales.units,
              grossRevenue: sales.grossRevenue,
              netRevenue,
              productBreakdown,
            });
          }

          artistsUpdated.push(vendorName);
          console.log(`[SalesSync] ${bucket.label} — ${vendorName}: ${sales.units} units, net £${(netRevenue / 100).toFixed(2)}`);
        }

        summary.push({ month: bucket.label, orders: orders.length, artistsUpdated });
      }

      console.log(`[SalesSync] Complete. Processed ${months} months.`);
      res.json({ success: true, months, summary });
    } catch (error: any) {
      console.error("[SalesSync] Error:", error);
      res.status(500).json({ error: error?.message ?? "Sales sync failed" });
    }
  });

  // Step 1: Create metaobject only
  app.post("/api/admin/artist-accounts/:id/shopify/metaobject", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { photoUrl } = req.body || {};
      
      // Validate photoUrl if provided
      const validPhotoUrl = typeof photoUrl === 'string' && photoUrl.length > 0 ? photoUrl : undefined;
      
      const account = await storage.getArtistAccount(id);
      
      if (!account) {
        return res.status(404).json({ error: "Artist account not found" });
      }
      
      // Mark as processing
      await storage.updateArtistAccount(id, {
        shopifyMetaobjectStatus: "processing",
        shopifyMetaobjectError: null,
      });
      
      const shopifySetup = await import("./shopifyArtistSetup");
      const result = await shopifySetup.setupMetaobjectStep(account, validPhotoUrl);
      
      if (!result.success) {
        await storage.updateArtistAccount(id, {
          shopifyMetaobjectStatus: "failed",
          shopifyMetaobjectError: result.error || "Unknown error",
        });
        return res.status(500).json({ error: result.error || "Failed to create metaobject" });
      }
      
      await storage.updateArtistAccount(id, {
        shopifyMetaobjectStatus: "succeeded",
        shopifyMetaobjectId: result.id || null,
        shopifyPhotoFileId: result.fileId || null,
        shopifyMetaobjectError: null,
      });
      
      // Check if all steps are complete
      const updatedAccount = await storage.getArtistAccount(id);
      if (updatedAccount?.shopifyMetaobjectStatus === "succeeded" &&
          updatedAccount?.shopifyCollectionStatus === "succeeded" &&
          updatedAccount?.shopifyMenusStatus === "succeeded") {
        await storage.updateArtistAccount(id, { shopifySetupComplete: true });
      }
      
      console.log(`[Artist] Metaobject created for "${account.vendorName}"`);
      res.json({ success: true, metaobjectId: result.id });
    } catch (error) {
      console.error("[Artist] Error creating metaobject:", error);
      res.status(500).json({ error: "Failed to create metaobject" });
    }
  });

  // Step 2: Create collection only
  app.post("/api/admin/artist-accounts/:id/shopify/collection", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const account = await storage.getArtistAccount(id);
      
      if (!account) {
        return res.status(404).json({ error: "Artist account not found" });
      }
      
      // Mark as processing
      await storage.updateArtistAccount(id, {
        shopifyCollectionStatus: "processing",
        shopifyCollectionError: null,
      });
      
      const shopifySetup = await import("./shopifyArtistSetup");
      // Pass the photo file ID from the metaobject step for use in collection metafields
      const result = await shopifySetup.setupCollectionStep(account, account.shopifyPhotoFileId || undefined);
      
      if (!result.success) {
        await storage.updateArtistAccount(id, {
          shopifyCollectionStatus: "failed",
          shopifyCollectionError: result.error || "Unknown error",
        });
        return res.status(500).json({ error: result.error || "Failed to create collection" });
      }
      
      await storage.updateArtistAccount(id, {
        shopifyCollectionStatus: "succeeded",
        shopifyCollectionId: result.id || null,
        shopifyCollectionError: null,
      });
      
      // Check if all steps are complete
      const updatedAccount = await storage.getArtistAccount(id);
      if (updatedAccount?.shopifyMetaobjectStatus === "succeeded" &&
          updatedAccount?.shopifyCollectionStatus === "succeeded" &&
          updatedAccount?.shopifyMenusStatus === "succeeded") {
        await storage.updateArtistAccount(id, { shopifySetupComplete: true });
      }
      
      console.log(`[Artist] Collection created for "${account.vendorName}"`);
      res.json({ success: true, collectionId: result.id });
    } catch (error) {
      console.error("[Artist] Error creating collection:", error);
      res.status(500).json({ error: "Failed to create collection" });
    }
  });

  // Step 3: Add to menus only (requires collection to exist)
  app.post("/api/admin/artist-accounts/:id/shopify/menus", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const account = await storage.getArtistAccount(id);
      
      if (!account) {
        return res.status(404).json({ error: "Artist account not found" });
      }
      
      if (!account.shopifyCollectionId) {
        return res.status(400).json({ error: "Collection must be created first" });
      }
      
      // Mark as processing
      await storage.updateArtistAccount(id, {
        shopifyMenusStatus: "processing",
        shopifyMenusError: null,
      });
      
      const shopifySetup = await import("./shopifyArtistSetup");
      const result = await shopifySetup.setupMenusStep(account, account.shopifyCollectionId);
      
      if (!result.success) {
        await storage.updateArtistAccount(id, {
          shopifyMenusStatus: "failed",
          shopifyMenusError: result.error || "Unknown error",
        });
        return res.status(500).json({ error: result.error || "Failed to add to menus" });
      }
      
      await storage.updateArtistAccount(id, {
        shopifyMenusStatus: "succeeded",
        shopifyMenusError: null,
      });
      
      // Check if all steps are complete
      const updatedAccount = await storage.getArtistAccount(id);
      if (updatedAccount?.shopifyMetaobjectStatus === "succeeded" &&
          updatedAccount?.shopifyCollectionStatus === "succeeded" &&
          updatedAccount?.shopifyMenusStatus === "succeeded") {
        await storage.updateArtistAccount(id, { shopifySetupComplete: true });
      }
      
      console.log(`[Artist] Menu items added for "${account.vendorName}"`);
      res.json({ success: true });
    } catch (error) {
      console.error("[Artist] Error adding to menus:", error);
      res.status(500).json({ error: "Failed to add to menus" });
    }
  });

  // Reset Shopify status for an artist (for re-running setup)
  app.post("/api/admin/artist-accounts/:id/shopify/reset", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const account = await storage.getArtistAccount(id);
      
      if (!account) {
        return res.status(404).json({ error: "Artist account not found" });
      }
      
      // Reset all Shopify-related fields
      await storage.updateArtistAccount(id, {
        shopifySetupComplete: false,
        shopifyMetaobjectId: null,
        shopifyCollectionId: null,
        shopifyPhotoFileId: null,
        shopifyMetaobjectStatus: "pending",
        shopifyMetaobjectError: null,
        shopifyCollectionStatus: "pending",
        shopifyCollectionError: null,
        shopifyMenusStatus: "pending",
        shopifyMenusError: null,
      });
      
      console.log(`[Artist] Shopify status reset for "${account.vendorName}"`);
      res.json({ success: true, message: "Shopify status reset successfully" });
    } catch (error) {
      console.error("[Artist] Error resetting Shopify status:", error);
      res.status(500).json({ error: "Failed to reset Shopify status" });
    }
  });

  // ========== Artist Magic Link Authentication ==========

  // Validate invitation token
  app.get("/api/artist-auth/validate-token", async (req, res) => {
    try {
      const { token } = req.query;
      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "Token is required" });
      }

      const account = await storage.getArtistAccountByToken(token);
      if (!account) {
        return res.status(404).json({ error: "Invalid or expired invitation link" });
      }

      if (account.invitationExpiresAt && new Date(account.invitationExpiresAt) < new Date()) {
        return res.status(400).json({ error: "Invitation has expired. Please request a new one." });
      }

      res.json({
        valid: true,
        vendorName: account.vendorName,
        email: account.primaryEmail,
      });
    } catch (error) {
      console.error("[Artist] Error validating token:", error);
      res.status(500).json({ error: "Failed to validate token" });
    }
  });

  // Set password (complete invitation)
  app.post("/api/artist-auth/set-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ error: "Token and password are required" });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      const account = await storage.getArtistAccountByToken(token);
      if (!account) {
        return res.status(404).json({ error: "Invalid or expired invitation link" });
      }

      if (account.invitationExpiresAt && new Date(account.invitationExpiresAt) < new Date()) {
        return res.status(400).json({ error: "Invitation has expired. Please request a new one." });
      }

      // Hash password and activate account
      const bcrypt = await import("bcryptjs");
      const passwordHash = await bcrypt.hash(password, 10);

      await storage.updateArtistAccount(account.id, {
        passwordHash,
        invitationToken: null,
        invitationExpiresAt: null,
        onboardingStatus: "active",
      });

      // Create session for the artist
      (req.session as any).artistId = account.id;
      (req.session as any).artistEmail = account.primaryEmail;

      // Explicitly save session before responding
      req.session.save((err) => {
        if (err) {
          console.error("[Artist] Session save error:", err);
          return res.status(500).json({ error: "Failed to set password" });
        }
        console.log(`[Artist] Password set for "${account.vendorName}", account activated`);
        res.json({ success: true, message: "Password set successfully" });
      });
    } catch (error) {
      console.error("[Artist] Error setting password:", error);
      res.status(500).json({ error: "Failed to set password" });
    }
  });

  // DEPRECATED: Legacy session-based artist auth endpoints.
  // These remain for backward compatibility with existing token-based invitations only.
  // New artist authentication uses Supabase (see /artist/login and requireSupabaseArtistAuth).
  // DO NOT add new functionality here; use Supabase flows instead.

  // Artist login (email/password) — DEPRECATED (replaced by Supabase)
  app.post("/api/artist-auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const account = await storage.getArtistAccountByEmail(email);
      if (!account || !account.passwordHash) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const bcrypt = await import("bcryptjs");
      const isValid = await bcrypt.compare(password, account.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Create session
      (req.session as any).artistId = account.id;
      (req.session as any).artistEmail = account.primaryEmail;

      // Explicitly save session before responding
      req.session.save((err) => {
        if (err) {
          console.error("[Artist] Session save error:", err);
          return res.status(500).json({ error: "Login failed" });
        }
        console.log(`[Artist] Login successful for "${account.vendorName}"`);
        res.json({ 
          success: true,
          artist: {
            id: account.id,
            vendorName: account.vendorName,
            email: account.primaryEmail,
            displayName: account.displayName,
          }
        });
      });
    } catch (error) {
      console.error("[Artist] Error during login:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Artist logout
  app.post("/api/artist-auth/logout", (req, res) => {
    (req.session as any).artistId = undefined;
    (req.session as any).artistEmail = undefined;
    res.json({ success: true });
  });

  // Get current artist session
  app.get("/api/artist-auth/me", async (req, res) => {
    try {
      const artistId = (req.session as any).artistId;
      if (!artistId) {
        return res.json({ authenticated: false });
      }

      const account = await storage.getArtistAccount(artistId);
      if (!account) {
        (req.session as any).artistId = undefined;
        return res.json({ authenticated: false });
      }

      res.json({
        authenticated: true,
        artist: {
          id: account.id,
          vendorName: account.vendorName,
          email: account.primaryEmail,
          displayName: account.displayName,
          paypalEmail: account.paypalEmail,
          paypalRecipientName: account.paypalRecipientName,
        }
      });
    } catch (error) {
      console.error("[Artist] Error getting session:", error);
      res.status(500).json({ error: "Failed to get session" });
    }
  });

  const requireArtistAuth = requireSupabaseArtistAuth;

  // ========== Artist Dashboard Routes (Artist Auth) ==========

  // Get current artist's profile
  app.get("/api/artist/profile", requireArtistAuth, async (req: any, res) => {
    try {
      const artistAccount = await storage.getArtistAccount(req.artistId);
      if (!artistAccount) {
        return res.status(404).json({ error: "Artist account not found" });
      }
      res.json(artistAccount);
    } catch (error) {
      console.error("[Artist] Error fetching profile:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // Update artist's PayPal info and/or display name
  app.patch("/api/artist/profile", requireArtistAuth, async (req: any, res) => {
    try {
      const artistAccount = await storage.getArtistAccount(req.artistId);
      if (!artistAccount) {
        return res.status(404).json({ error: "Artist account not found" });
      }

      // Only allow updating permitted fields
      const { paypalEmail, paypalRecipientName, displayName } = req.body;
      const updates: Record<string, any> = {};
      if (paypalEmail !== undefined) updates.paypalEmail = paypalEmail;
      if (paypalRecipientName !== undefined) updates.paypalRecipientName = paypalRecipientName;
      if (displayName !== undefined) updates.displayName = displayName;

      const updated = await storage.updateArtistAccount(artistAccount.id, updates);
      res.json(updated);
    } catch (error) {
      console.error("[Artist] Error updating profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Get artist's pending artworks (submissions not yet live)
  app.get("/api/artist/artworks", requireArtistAuth, async (req: any, res) => {
    try {
      const artistAccount = await storage.getArtistAccount(req.artistId);
      if (!artistAccount) {
        return res.status(404).json({ error: "Artist account not found" });
      }

      // Get artworks by vendor name using DB-level filter (scoped to this artist)
      const artistArtworks = await storage.getArtworksByArtistName(artistAccount.vendorName);

      res.json(artistArtworks);
    } catch (error) {
      console.error("[Artist] Error fetching artworks:", error);
      res.status(500).json({ error: "Failed to fetch artworks" });
    }
  });

  // Get artist's live products from Shopify
  app.get("/api/artist/collection", requireArtistAuth, async (req: any, res) => {
    try {
      const artistAccount = await storage.getArtistAccount(req.artistId);
      if (!artistAccount) {
        return res.status(404).json({ error: "Artist account not found" });
      }

      const { getProductsByVendor } = await import("./shopifyService");
      const products = await getProductsByVendor(artistAccount.vendorName);
      
      res.json(products);
    } catch (error) {
      console.error("[Artist] Error fetching collection:", error);
      res.status(500).json({ error: "Failed to fetch collection from Shopify" });
    }
  });

  // Get artist's sales data
  app.get("/api/artist/sales", requireArtistAuth, async (req: any, res) => {
    try {
      const artistAccount = await storage.getArtistAccount(req.artistId);
      if (!artistAccount) {
        return res.status(404).json({ error: "Artist account not found" });
      }

      const sales = await storage.getArtistSales(artistAccount.id);
      res.json(sales);
    } catch (error) {
      console.error("[Artist] Error fetching sales:", error);
      res.status(500).json({ error: "Failed to fetch sales" });
    }
  });

  // Get artist's commissions (sales data by period)
  app.get("/api/artist/commissions", requireArtistAuth, async (req: any, res) => {
    try {
      const artistAccount = await storage.getArtistAccount(req.artistId);
      if (!artistAccount) {
        return res.status(404).json({ error: "Artist account not found" });
      }
      const sales = await storage.getArtistSales(artistAccount.id);
      res.json(sales);
    } catch (error) {
      console.error("[Artist] Error fetching commissions:", error);
      res.status(500).json({ error: "Failed to fetch commissions" });
    }
  });

  // Get artist's invoices (payout items)
  app.get("/api/artist/invoices", requireArtistAuth, async (req: any, res) => {
    try {
      const artistAccount = await storage.getArtistAccount(req.artistId);
      if (!artistAccount) {
        return res.status(404).json({ error: "Artist account not found" });
      }
      const payouts = await storage.getPayoutItemsByArtist(artistAccount.id);
      res.json(payouts);
    } catch (error) {
      console.error("[Artist] Error fetching invoices:", error);
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  });

  // Get artist's payouts (alias for invoices — payout items)
  app.get("/api/artist/payouts", requireArtistAuth, async (req: any, res) => {
    try {
      const artistAccount = await storage.getArtistAccount(req.artistId);
      if (!artistAccount) {
        return res.status(404).json({ error: "Artist account not found" });
      }
      const payouts = await storage.getPayoutItemsByArtist(artistAccount.id);
      res.json(payouts);
    } catch (error) {
      console.error("[Artist] Error fetching payouts:", error);
      res.status(500).json({ error: "Failed to fetch payouts" });
    }
  });

  // Artist artwork upload endpoint
  app.post("/api/artist/upload", requireArtistAuth, (req: any, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || "Upload failed" });
      }
      next();
    });
  }, async (req: any, res) => {
    try {
      const artistAccount = await storage.getArtistAccount(req.artistId);
      if (!artistAccount) {
        return res.status(404).json({ error: "Artist account not found" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { title, widthPx, heightPx, dpi, aspectRatio, maxPrintSize, availableSizes, calculatedSizes } = req.body;
      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      let fileBuffer: Buffer;
      try {
        fileBuffer = getFileBuffer(req.file);
      } catch (err) {
        return res.status(500).json({ error: "Failed to read uploaded file" });
      }

      // Generate low-res preview
      let lowResBuffer: Buffer | undefined;
      try {
        lowResBuffer = await createLowResVersion(fileBuffer);
      } catch (err) {
        console.warn("[Artist Upload] Failed to create low-res version:", err);
      }

      // Upload to object storage
      const originalFilename = req.file.originalname;
      const safeFilename = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const timestamp = Date.now();
      const storagePath = `.private/artist-uploads/${artistAccount.vendorName}/${timestamp}_${safeFilename}`;

      let originalFileUrl: string;
      try {
        originalFileUrl = await objectStorageService.uploadFile(fileBuffer, storagePath, req.file.mimetype);
      } catch (err) {
        console.error("[Artist Upload] Object storage upload failed:", err);
        return res.status(500).json({ error: "Failed to store file" });
      }

      let lowResFileUrl: string | undefined;
      if (lowResBuffer) {
        try {
          const lowResPath = `.private/artist-uploads/${artistAccount.vendorName}/${timestamp}_lowres_${safeFilename}`;
          lowResFileUrl = await objectStorageService.uploadFile(lowResBuffer, lowResPath, "image/jpeg");
        } catch (err) {
          console.warn("[Artist Upload] Failed to upload low-res:", err);
        }
      }

      // Parse sizes safely
      let parsedAvailableSizes: string[] = [];
      let parsedCalculatedSizes: string[] = [];
      try {
        parsedAvailableSizes = availableSizes ? JSON.parse(availableSizes) : [];
        parsedCalculatedSizes = calculatedSizes ? JSON.parse(calculatedSizes) : parsedAvailableSizes;
      } catch (_) {}

      // Create artwork record
      const artwork = await storage.createArtwork({
        artistName: artistAccount.vendorName,
        artistEmail: artistAccount.primaryEmail || "",
        title: title.trim(),
        originalFilename: originalFilename,
        originalFileUrl,
        lowResFileUrl: lowResFileUrl || null,
        widthPx: parseInt(widthPx) || 0,
        heightPx: parseInt(heightPx) || 0,
        dpi: parseInt(dpi) || 0,
        aspectRatio: aspectRatio || "unknown",
        maxPrintSize: maxPrintSize || "",
        availableSizes: parsedAvailableSizes,
        calculatedSizes: parsedCalculatedSizes,
        vendor: artistAccount.vendorName,
        editionType: "open",
        status: "pending",
      });

      cleanupTempFile(req.file);
      console.log(`[Artist Upload] Artwork ${artwork.id} created for ${artistAccount.vendorName}`);
      res.json({ success: true, artworkId: artwork.id });
    } catch (error) {
      console.error("[Artist Upload] Error:", error);
      if (req.file) cleanupTempFile(req.file);
      res.status(500).json({ error: "Failed to process artwork upload" });
    }
  });

  // ========== Shopify Webhooks ==========
  
  // Verify Shopify webhook HMAC signature
  function verifyShopifyWebhook(rawBody: string, hmacHeader: string | undefined): boolean {
    if (!hmacHeader) return false;
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (!secret) {
      console.warn("[Webhook] SHOPIFY_WEBHOOK_SECRET not configured - skipping verification in dev");
      return true; // Allow in development if secret not configured
    }
    const crypto = require('crypto');
    const hash = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
    // Constant-time comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
    } catch {
      return false;
    }
  }

  // Webhook: Order Created - track artist commissions
  app.post("/api/webhooks/shopify/order-created", async (req, res) => {
    try {
      // Verify webhook signature (raw body needed for verification)
      const rawBody = JSON.stringify(req.body);
      const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string | undefined;
      
      if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
        console.warn("[Webhook] Invalid HMAC signature - rejecting request");
        return res.status(401).json({ error: "Unauthorized" });
      }

      const order = req.body;
      const orderId = order.id?.toString();
      console.log(`[Webhook] Received order created: ${orderId || order.name || 'unknown'}`);
      
      // Idempotency check - prevent duplicate processing (using database)
      if (orderId && await storage.isOrderProcessed(orderId)) {
        console.log(`[Webhook] Order ${orderId} already processed - skipping`);
        return res.status(200).json({ received: true, skipped: true, reason: "Already processed" });
      }
      
      if (!order.line_items || !Array.isArray(order.line_items)) {
        console.log("[Webhook] No line items in order");
        return res.status(200).json({ received: true });
      }

      // Get global commission settings first (needed for calculating commission base)
      let globalSettings = await storage.getCommissionSettings();
      if (!globalSettings) {
        globalSettings = await storage.createCommissionSettings({
          defaultCommissionRate: 50,
          applyAfterTax: true,
          applyAfterShipping: true,
          applyAfterDiscounts: true,
        });
      }
      console.log(`[Webhook] Commission settings: rate=${globalSettings.defaultCommissionRate}%, afterTax=${globalSettings.applyAfterTax}, afterShipping=${globalSettings.applyAfterShipping}, afterDiscounts=${globalSettings.applyAfterDiscounts}`);

      // Calculate total shipping cost including shipping taxes if applyAfterTax is enabled
      let totalShippingCost = 0;
      let totalShippingTax = 0;
      for (const sl of order.shipping_lines || []) {
        totalShippingCost += parseFloat(sl.price || '0') * 100;
        // Include shipping taxes if applyAfterTax is enabled
        if (globalSettings.applyAfterTax) {
          for (const tl of sl.tax_lines || []) {
            totalShippingTax += parseFloat(tl.price || '0') * 100;
          }
        }
      }
      const totalShipping = totalShippingCost + totalShippingTax;
      
      // Calculate order-level taxes (for stores that report tax at order level instead of line-item level)
      // This will be allocated proportionally to vendors when applyAfterTax is true
      let orderLevelTax = 0;
      if (globalSettings.applyAfterTax) {
        // Sum order-level tax_lines
        for (const tl of order.tax_lines || []) {
          orderLevelTax += parseFloat(tl.price || '0') * 100;
        }
        // Subtract line-item taxes to avoid double-counting (order.tax_lines is often a summary)
        let lineItemTaxTotal = 0;
        for (const item of order.line_items || []) {
          for (const tl of item.tax_lines || []) {
            lineItemTaxTotal += parseFloat(tl.price || '0') * 100;
          }
        }
        // Only allocate the difference (order-level only taxes)
        orderLevelTax = Math.max(0, orderLevelTax - lineItemTaxTotal - totalShippingTax);
        if (orderLevelTax > 0) {
          console.log(`[Webhook] Order-level tax to allocate: £${(orderLevelTax / 100).toFixed(2)}`);
        }
      }
      
      // First pass: calculate post-discount values for proportional allocation
      // When applyAfterDiscounts is true, use post-discount values for shipping allocation
      const lineItemValues: { vendor: string; baseValue: number; adjustedValue: number; item: any }[] = [];
      let totalAdjustedValue = 0;
      
      for (const item of order.line_items || []) {
        if (!item.vendor) continue;
        
        const qty = item.quantity || 1;
        const price = parseFloat(item.price || '0') * 100;
        const baseValue = price * qty;
        
        // For shipping allocation, use post-discount value when applyAfterDiscounts is true
        let adjustedValue = baseValue;
        if (globalSettings.applyAfterDiscounts) {
          const discount = parseFloat(item.total_discount || '0') * 100;
          adjustedValue = Math.max(0, baseValue - discount);
        }
        
        lineItemValues.push({ vendor: item.vendor, baseValue, adjustedValue, item });
        totalAdjustedValue += adjustedValue;
      }

      // Group line items by vendor with commission-adjusted revenue
      const vendorSales: Record<string, {
        units: number;
        revenue: number; // This is the commission base (adjusted for tax/discounts/shipping per settings)
        products: Record<string, { title: string; units: number; revenue: number }>;
      }> = {};

      for (const { vendor, baseValue, adjustedValue, item } of lineItemValues) {
        const quantity = item.quantity || 1;
        
        // Calculate commission base based on settings
        let commissionBase = baseValue;
        
        // Handle discounts: if applyAfterDiscounts=true, subtract discounts from commission base
        if (globalSettings.applyAfterDiscounts) {
          const lineDiscount = parseFloat(item.total_discount || '0') * 100;
          commissionBase -= lineDiscount;
        }
        
        // Handle tax: if applyAfterTax=true, add line item taxes plus proportional order-level taxes
        if (globalSettings.applyAfterTax) {
          // Add line-item taxes
          const lineTax = (item.tax_lines || []).reduce((sum: number, tl: any) => {
            return sum + parseFloat(tl.price || '0') * 100;
          }, 0);
          commissionBase += lineTax;
          
          // Add proportional share of order-level taxes (if any)
          if (orderLevelTax > 0 && totalAdjustedValue > 0) {
            const taxProportion = adjustedValue / totalAdjustedValue;
            const allocatedTax = Math.round(orderLevelTax * taxProportion);
            commissionBase += allocatedTax;
          }
        }
        
        // Handle shipping: if applyAfterShipping=true, add proportional shipping to commission base
        // Use adjusted (post-discount) values for proportional allocation when discounts are applied
        if (globalSettings.applyAfterShipping && totalAdjustedValue > 0 && totalShipping > 0) {
          const proportion = adjustedValue / totalAdjustedValue;
          const allocatedShipping = Math.round(totalShipping * proportion);
          commissionBase += allocatedShipping;
        }
        
        // Ensure commission base is not negative
        commissionBase = Math.max(0, commissionBase);

        if (!vendorSales[vendor]) {
          vendorSales[vendor] = { units: 0, revenue: 0, products: {} };
        }

        vendorSales[vendor].units += quantity;
        vendorSales[vendor].revenue += commissionBase;

        // Track product breakdown (using adjusted commission base)
        const productId = item.product_id?.toString() || item.title;
        if (!vendorSales[vendor].products[productId]) {
          vendorSales[vendor].products[productId] = {
            title: item.title,
            units: 0,
            revenue: 0,
          };
        }
        vendorSales[vendor].products[productId].units += quantity;
        vendorSales[vendor].products[productId].revenue += commissionBase;
      }

      // Process each vendor's sales
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1); // Start of month
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59); // End of month

      for (const [vendorName, sales] of Object.entries(vendorSales)) {
        console.log(`[Webhook] Processing vendor "${vendorName}": ${sales.units} units, £${(sales.revenue / 100).toFixed(2)}`);

        // Find or create artist account - only set pending for NEW accounts
        let artistAccount = await storage.getArtistAccountByVendor(vendorName);
        if (!artistAccount) {
          // Create new account for new vendor
          artistAccount = await storage.createArtistAccount({
            vendorName,
            onboardingStatus: "pending",
            useCustomCommission: false,
          });
          console.log(`[Webhook] Created new artist account for "${vendorName}": ${artistAccount.id}`);
        } else {
          console.log(`[Webhook] Found existing artist account: ${artistAccount.id} (${artistAccount.onboardingStatus})`);
        }
        
        // Determine commission rate: use per-artist override or global default
        const commissionRate = artistAccount.useCustomCommission && artistAccount.commissionRate !== null
          ? artistAccount.commissionRate
          : globalSettings.defaultCommissionRate;
        const commissionMultiplier = commissionRate / 100;
        console.log(`[Webhook] Using commission rate: ${commissionRate}% for "${vendorName}"`);

        // Find existing sales record for this period or create new one
        const existingSales = await storage.getArtistSales(artistAccount.id);
        const currentPeriodSales = existingSales.find(s => 
          s.periodStart.getTime() === periodStart.getTime() &&
          s.periodEnd.getTime() === periodEnd.getTime()
        );

        const productBreakdown = Object.entries(sales.products).map(([productId, data]) => ({
          productId,
          productTitle: data.title,
          units: data.units,
          revenue: data.revenue,
        }));

        if (currentPeriodSales) {
          // Update existing record - merge product breakdowns
          const existingBreakdown = (currentPeriodSales.productBreakdown as any[]) || [];
          const mergedBreakdown = [...existingBreakdown];
          
          for (const newProduct of productBreakdown) {
            const existing = mergedBreakdown.find(p => p.productId === newProduct.productId);
            if (existing) {
              existing.units += newProduct.units;
              existing.revenue += newProduct.revenue;
            } else {
              mergedBreakdown.push(newProduct);
            }
          }

          await storage.updateArtistSales(currentPeriodSales.id, {
            totalOrders: (currentPeriodSales.totalOrders || 0) + 1,
            totalUnits: (currentPeriodSales.totalUnits || 0) + sales.units,
            grossRevenue: (currentPeriodSales.grossRevenue || 0) + sales.revenue,
            netRevenue: (currentPeriodSales.netRevenue || 0) + Math.round(sales.revenue * commissionMultiplier),
            productBreakdown: mergedBreakdown,
          });
          console.log(`[Webhook] Updated sales record for "${vendorName}" (commission: ${commissionRate}%)`);
        } else {
          // Create new sales record
          await storage.createArtistSales({
            artistAccountId: artistAccount.id,
            periodStart,
            periodEnd,
            totalOrders: 1,
            totalUnits: sales.units,
            grossRevenue: sales.revenue,
            netRevenue: Math.round(sales.revenue * commissionMultiplier),
            productBreakdown,
          });
          console.log(`[Webhook] Created new sales record for "${vendorName}" (commission: ${commissionRate}%)`);
        }
      }

      // Mark order as processed in database (after successful processing)
      if (orderId) {
        await storage.markOrderProcessed(orderId);
      }

      res.status(200).json({ received: true, vendors: Object.keys(vendorSales) });
    } catch (error) {
      console.error("[Webhook] Error processing order:", error);
      // Return 200 to prevent Shopify from retrying
      res.status(200).json({ received: true, error: "Processing error" });
    }
  });

  // Link artist account to Replit user (admin endpoint for now)
  app.post("/api/admin/artist-accounts/:id/link", requireAuth, async (req, res) => {
    try {
      const { replitUserId, primaryEmail } = req.body;
      
      const updated = await storage.updateArtistAccount(req.params.id, {
        replitUserId,
        primaryEmail,
        onboardingStatus: "linked",
      });

      if (!updated) {
        return res.status(404).json({ error: "Artist account not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("[Artist] Error linking account:", error);
      res.status(500).json({ error: "Failed to link account" });
    }
  });

  // ========== Commission Settings ==========

  // Get global commission settings
  app.get("/api/admin/commission-settings", requireAuth, async (req, res) => {
    try {
      let settings = await storage.getCommissionSettings();
      if (!settings) {
        settings = await storage.createCommissionSettings({
          defaultCommissionRate: 50,
          applyAfterTax: true,
          applyAfterShipping: true,
          applyAfterDiscounts: true,
        });
      }
      res.json(settings);
    } catch (error) {
      console.error("[Commission] Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch commission settings" });
    }
  });

  // Update global commission settings
  app.patch("/api/admin/commission-settings/:id", requireAuth, async (req, res) => {
    try {
      const { defaultCommissionRate, applyAfterTax, applyAfterShipping, applyAfterDiscounts } = req.body;
      
      // Validate commission rate
      const rate = typeof defaultCommissionRate === 'number' ? defaultCommissionRate : parseFloat(defaultCommissionRate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        return res.status(400).json({ error: "Invalid commission rate - must be between 0 and 100" });
      }
      
      const updated = await storage.updateCommissionSettings(req.params.id, {
        defaultCommissionRate: rate,
        applyAfterTax: Boolean(applyAfterTax),
        applyAfterShipping: Boolean(applyAfterShipping),
        applyAfterDiscounts: Boolean(applyAfterDiscounts),
      });

      if (!updated) {
        return res.status(404).json({ error: "Commission settings not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("[Commission] Error updating settings:", error);
      res.status(500).json({ error: "Failed to update commission settings" });
    }
  });

  // ========== Contract Settings ==========

  // Default contract template with variable placeholders
  const DEFAULT_CONTRACT_TEMPLATE = `THIS AGREEMENT is made on {{DATE}}

BETWEEN {{FULL_NAME}} of
{{ADDRESS}}
(hereinafter called "the Artist") of the one part

AND East Side Studio London of 6 Patent House, 48 Morris Road, E14 6NU, London, UK.
(hereinafter called "the Licensee") of the other part
Together, the Parties.

1. Background
1.1 The Licensee operates a business selling high-quality reproductions of original works of art under the "East Side Studio London" brand.
1.2 The Artist is the creator of original works of visual art and is willing to grant the Licensee rights to reproduce and sell certain artworks as prints on the terms below.

2. Definitions
2.1 Artwork(s): the digital image(s) supplied by the Artist.
2.2 Product(s): any reproduction of the Artwork in print or related decorative formats, in any size, substrate or method now known or later developed.
2.3 Core Product: the fine-art print sold unframed or in a standard frame option offered by the Licensee.
2.4 Upgrade(s): optional add-ons beyond the Core Product (e.g., box/deep frames, anti-reflective glazing, premium papers, mounts, special finishes, bespoke packaging).
2.5 Net Core Product Price: the price actually paid by the customer for the Core Product only, after discounts/promo codes and excluding VAT/sales taxes, shipping/insurance, gift-wrap and all Upgrade amounts. Marketplace/platform fees do not reduce the Net Core Product Price.
2.6 Channels: the Licensee's websites, physical pop-ups, wholesale/trade accounts, galleries, marketplaces and retail partners now known or later developed.
2.7 Territory: worldwide.
2.8 Order: any sale of Products by the Licensee, whether processed through the e-commerce platform (a "Tracked Order") or sold off-platform by quotation/invoice and paid directly to the Licensee (an "Invoiced Order").
2.9 Contract Start Date: the date stated in clause 4.1 as the start date of this Agreement.
2.10 Term: the duration of this Agreement as described in clause 13.

3. Grant of Licence; Exclusivity
3.1 The Artist grants the Licensee an exclusive licence to reproduce, market and sell the Artwork as Products in the Territory across all Channels during the Term.
3.2 Artist Direct carve-out. The Artist may sell prints only via the Artist's own website or in-person sales run by the Artist; the Artist will not list with third-party print stores/marketplaces (e.g., Society6, InPrnt, Etsy print-on-demand, other print-store competitors). Any existing third-party listings must be removed within 7 days of the Contract Start Date.
3.3 Fulfilment sublicensing. The Licensee may share the Artwork under a limited, non-transferable sublicence solely with printers, framers, logistics, marketing and e-commerce service providers engaged to produce or market the Products.

4. Delivery; Permitted Use
4.1 The Artist will provide high-resolution digital files of the Artwork on {{DATE}} (the 'Contract Start Date').
4.2 The Licensee may use the Artwork to produce and sell Products and for associated marketing, PR and editorial, including computer-generated mock-ups, room renders, 3D/AR previews, video/animated assets, product photography and press materials.
4.3 The Artwork will not be made available for unrestricted download.

5. Restrictions on Use
Except as expressly permitted, the Licensee shall not resell, sub-licence or redistribute the Artwork; shall not use it in an obscene, defamatory or unlawful manner; and shall not make material alterations without the Artist's written consent.

6. Pricing; Materials; Upgrades
6.1 The Licensee controls retail pricing, discounting, bundles and promotions across all Channels. The Licensee's customer Returns Policy may be updated from time to time; such updates do not affect the payout timing set out in clause 7.5.
6.2 The Licensee may change suppliers, materials, frame profiles, glazing types and packaging, and may offer region-specific variants, provided the overall customer experience is substantially equivalent or better.
6.3 The Licensee may introduce, withdraw or reclassify options as Upgrades or as part of the Core Product from time to time; changes apply prospectively and will be reflected in Schedule 1 – Commission.

7. Commission & Payment
7.1 Commission rate & base. The Artist is paid {{COMMISSION}}% of the Net Core Product Price for each Order. Commission is calculated after discounts/promo codes and excludes all Upgrades, shipping/insurance and taxes. Marketplace/platform fees do not reduce the commissionable base.
7.2 Order sources. Tracked Orders and Invoiced Orders are commissionable on the same basis as clause 7.1.
7.3 Visibility & reconciliation. The Licensee maintains an Artist Portal showing Tracked Orders and commission calculations. Invoiced Orders (typically B2B/trade) are added manually to the Artist's account. If an Invoiced Order is missed in a given month, it will be added by correction in a subsequent cycle.
7.4 No-revenue cases. No commission is due on free gifts, giveaways, press loans, samples, replacements for damages/defects, QC rejects, seconds/outlet stock, or any transaction where no revenue is received.
7.5 Payout timing & method. The Licensee will pay amounts due by the 7th calendar day of the month following the month in which the Order was placed. The Licensee may defer payment of any Order that is (i) the subject of a pending return/cancellation request, (ii) under fraud/chargeback review, or (iii) not fully cleared/paid; deferred amounts are paid in the next cycle once resolved. Amounts later refunded or charged back may be set-off against future payouts. Payments are in GBP.
7.6 Disputes & corrections. The Artist must notify the Licensee of any discrepancy within 14 days of portal posting; the Licensee will investigate and, if required, correct in the next cycle. The Licensee may set-off overpayments and corrections against future payouts.

8. Warranties
8.1 Artist warranties. The Artist warrants that they: (i) created and own the Artwork; (ii) have full right to grant this licence; (iii) the Artwork does not infringe any third-party rights; and (iv) have obtained necessary model/property releases (if applicable).

9. Liability & Indemnity
9.1 Each party indemnifies the other for breaches of this Agreement and for the warranties it gives.
9.2 Neither party is liable for indirect or consequential losses.
9.3 Except for wilful misconduct or amounts payable under an indemnity, each party's total aggregate liability is capped at the commissions/fees actually paid or payable under this Agreement in the 12 months preceding the claim. Nothing limits liability that cannot be limited by law.

10. Data Protection; No-Circumvention
10.1 Each party will comply with applicable data-protection laws. The Licensee may share buyer data with its processors for fulfilment, support and anti-fraud.
10.2 The Artist will not use buyer data received from the Licensee to market directly to those buyers or otherwise circumvent the Licensee.

11. Confidentiality
The commercial terms of this Agreement (including commission rates, price lists and sales data) are confidential. Neither party will disclose them except to professional advisers or as required by law.

12. Public Statements & Non-Disparagement
12.1 The Parties will act in good faith to protect the reputation and goodwill of the other. Neither Party will make, publish or authorise any public statement (including on social media) that it knows or reasonably ought to know is false or misleading, or that is intended to disparage or damage the reputation of the other Party, its brand or personnel.
12.2 Nothing in this clause prevents a Party from making truthful statements required by law, by a regulator, in connection with legal proceedings, or from seeking advice from professional advisers on a confidential basis.
12.3 If the Artist has a concern regarding sales performance or conduct, the Artist will first raise it privately with the Licensee and allow a reasonable opportunity to respond before making any public comment.
12.4 Name & Likeness. The Artist permits the Licensee to use the Artist's name, biography and supplied portrait in marketing and PR for the Products.

13. Term; Termination; Sell-Through
13.1 Term. This Agreement starts on the Contract Start Date and auto-renews monthly unless either Party gives 30 days' written notice.
13.2 Termination for breach. Either Party may terminate for material breach not cured within 14 days of notice. The Artist may terminate immediately for non-payment after a 7-day grace period. The Licensee may also terminate for convenience on 30 days' notice.
13.3 Sell-through & takedown. After termination/expiry, the Licensee may (i) fulfil existing orders, (ii) sell finished or in-production inventory for 30 days, and (iii) retain archive copies for legal/accounting purposes. The Licensee may remove any Product from sale at any time.

14. Compliance with Laws
Each Party will comply with applicable laws and regulations in connection with this Agreement and the sale of Products.

15. Notices
15.1 Notices must be in writing and delivered by email or recorded post.
15.2 Notices to the Licensee (including any notice to remove artworks or end the Agreement) must be sent to: support@eastsidestudiolondon.co.uk.
15.3 Notices to the Artist must be sent to the email and/or postal address set out above (or as updated in writing).
15.4 Email notices take effect on transmission if no bounce-back is received. Postal notices take effect on delivery.

16. Assignment
The Licensee may assign this Agreement to an affiliate or in connection with a sale or reorganisation of its business; otherwise, neither Party may assign without the other Party's written consent (not to be unreasonably withheld). This Agreement binds and benefits successors and permitted assigns.

17. Governing Law; Disputes
This Agreement is governed by the laws of England and Wales. The courts of England shall have exclusive jurisdiction. Before issuing proceedings, the Parties will discuss in good faith for 14 days and may attempt voluntary mediation.

18. General
18.1 Headings are for convenience only. Words in the singular include the plural and vice versa.
18.2 This Agreement may be executed in counterparts. Electronic signatures are binding.
18.3 All monetary amounts refer to pounds sterling (GBP), unless agreed otherwise in writing.
18.4 Entire agreement. This Agreement constitutes the whole agreement and supersedes prior discussions. Amendments must be in a signed written document (subject to clause 19 for the Commission Schedule).
18.5 Severability. If a provision is invalid, the remainder remains in force.
18.6 Force Majeure. Neither Party is liable for delay or failure caused by events beyond its reasonable control (including fire, flood, strike, pandemic, supplier failure, or acts of government). The affected Party will notify the other and resume performance as soon as practicable.

19. Commission Schedule & Variations
19.1 Schedule. The commission rules are set out in Schedule 1 – Commission.
19.2 Variations. The Licensee may update Schedule 1 by giving 30 days' written notice. Changes apply to Orders placed after the effective date. If the Artist does not agree, the Artist may terminate on written notice before the change takes effect (no penalty).
19.3 All other terms of this Agreement may be amended only by a signed written agreement of both Parties.

Schedule 1 – Commission

A. Commissionable base
• Net Core Product Price only (post-discount), as defined in clause 2.5.
• Marketplace/platform fees do not reduce the commissionable base.

B. Non-commissionable amounts
• Upgrades (e.g., box/deep frames, anti-reflective glazing, premium papers).
• Mounts, bespoke finishes, shipping/insurance, taxes, gift-wrap.
• Discounts applied to any of the foregoing.
• Free gifts, giveaways, press loans, samples, replacements for damages/defects, QC rejects, seconds/outlet stock.
• Any transaction where no revenue is received.

C. Rate
{{COMMISSION}}% of the Net Core Product Price (applies to all Orders, regardless of buyer type or Channel).

D. Order sources & reconciliation
• Tracked Orders (through the e-commerce platform) are visible in the Artist Portal.
• Invoiced Orders (off-platform) are commissionable on the same basis and are added manually. Missed Invoiced Orders are corrected in a subsequent cycle.

E. Timing & returns
• Payout by the 7th calendar day of the following month (based on Order date).
• Orders with a pending return/cancellation or fraud/chargeback review may be deferred to the next cycle after resolution.`;

  // Non-exclusive contract template with variable placeholders
  const NON_EXCLUSIVE_CONTRACT_TEMPLATE = `THIS AGREEMENT is made on {{DATE}}

BETWEEN {{FULL_NAME}} of
{{ADDRESS}}
(hereinafter called "the Artist") of the one part

AND East Side Studio London of 6 Patent House, 48 Morris Road, E14 6NU, London, UK.
(hereinafter called "the Licensee") of the other part
Together, the Parties.

1. Background
1.1 The Licensee operates a business selling high-quality reproductions of original works of art under the "East Side Studio London" brand.
1.2 The Artist is the creator of original works of visual art and is willing to grant the Licensee rights to reproduce and sell certain artworks as prints on the terms below.

2. Definitions
2.1 Artwork(s): the digital image(s) supplied by the Artist.
2.2 Product(s): any reproduction of the Artwork in print or related decorative formats, in any size, substrate or method now known or later developed.
2.3 Core Product: the fine-art print sold unframed or in a standard frame option offered by the Licensee.
2.4 Upgrade(s): optional add-ons beyond the Core Product (e.g., box/deep frames, anti-reflective glazing, premium papers, mounts, special finishes, bespoke packaging).
2.5 Net Core Product Price: the price actually paid by the customer for the Core Product only, after discounts/promo codes and excluding VAT/sales taxes, shipping/insurance, gift-wrap and all Upgrade amounts. Marketplace/platform fees do not reduce the Net Core Product Price.
2.6 Channels: the Licensee's websites, physical pop-ups, wholesale/trade accounts, galleries, marketplaces and retail partners now known or later developed.
2.7 Territory: worldwide.
2.8 Order: any sale of Products by the Licensee, whether processed through the e-commerce platform (a "Tracked Order") or sold off-platform by quotation/invoice and paid directly to the Licensee (an "Invoiced Order").
2.9 Contract Start Date: the date stated in clause 4.1 as the start date of this Agreement.
2.10 Term: the duration of this Agreement as described in clause 13.

3. Grant of Licence; Non-Exclusive
3.1 The Artist grants the Licensee a non-exclusive licence to reproduce, market and sell the Artwork as Products in the Territory across all Channels during the Term.
3.2 The Artist retains the right to sell, licence or otherwise use the Artwork through any other channels, platforms or third parties at any time.
3.3 Fulfilment sublicensing. The Licensee may share the Artwork under a limited, non-transferable sublicence solely with printers, framers, logistics, marketing and e-commerce service providers engaged to produce or market the Products.

4. Delivery; Permitted Use
4.1 The Artist will provide high-resolution digital files of the Artwork on {{DATE}} (the 'Contract Start Date').
4.2 The Licensee may use the Artwork to produce and sell Products and for associated marketing, PR and editorial, including computer-generated mock-ups, room renders, 3D/AR previews, video/animated assets, product photography and press materials.
4.3 The Artwork will not be made available for unrestricted download.

5. Restrictions on Use
Except as expressly permitted, the Licensee shall not resell, sub-licence or redistribute the Artwork; shall not use it in an obscene, defamatory or unlawful manner; and shall not make material alterations without the Artist's written consent.

6. Pricing; Materials; Upgrades
6.1 The Licensee controls retail pricing, discounting, bundles and promotions across all Channels. The Licensee's customer Returns Policy may be updated from time to time; such updates do not affect the payout timing set out in clause 7.5.
6.2 The Licensee may change suppliers, materials, frame profiles, glazing types and packaging, and may offer region-specific variants, provided the overall customer experience is substantially equivalent or better.
6.3 The Licensee may introduce, withdraw or reclassify options as Upgrades or as part of the Core Product from time to time; changes apply prospectively and will be reflected in Schedule 1 – Commission.

7. Commission & Payment
7.1 Commission rate & base. The Artist is paid {{COMMISSION}}% of the Net Core Product Price for each Order. Commission is calculated after discounts/promo codes and excludes all Upgrades, shipping/insurance and taxes. Marketplace/platform fees do not reduce the commissionable base.
7.2 Order sources. Tracked Orders and Invoiced Orders are commissionable on the same basis as clause 7.1.
7.3 Visibility & reconciliation. The Licensee maintains an Artist Portal showing Tracked Orders and commission calculations. Invoiced Orders (typically B2B/trade) are added manually to the Artist's account. If an Invoiced Order is missed in a given month, it will be added by correction in a subsequent cycle.
7.4 No-revenue cases. No commission is due on free gifts, giveaways, press loans, samples, replacements for damages/defects, QC rejects, seconds/outlet stock, or any transaction where no revenue is received.
7.5 Payout timing & method. The Licensee will pay amounts due by the 7th calendar day of the month following the month in which the Order was placed. The Licensee may defer payment of any Order that is (i) the subject of a pending return/cancellation request, (ii) under fraud/chargeback review, or (iii) not fully cleared/paid; deferred amounts are paid in the next cycle once resolved. Amounts later refunded or charged back may be set-off against future payouts. Payments are in GBP.
7.6 Disputes & corrections. The Artist must notify the Licensee of any discrepancy within 14 days of portal posting; the Licensee will investigate and, if required, correct in the next cycle. The Licensee may set-off overpayments and corrections against future payouts.

8. Warranties
8.1 Artist warranties. The Artist warrants that they: (i) created and own the Artwork; (ii) have full right to grant this licence; (iii) the Artwork does not infringe any third-party rights; and (iv) have obtained necessary model/property releases (if applicable).

9. Liability & Indemnity
9.1 Each party indemnifies the other for breaches of this Agreement and for the warranties it gives.
9.2 Neither party is liable for indirect or consequential losses.
9.3 Except for wilful misconduct or amounts payable under an indemnity, each party's total aggregate liability is capped at the commissions/fees actually paid or payable under this Agreement in the 12 months preceding the claim. Nothing limits liability that cannot be limited by law.

10. Data Protection; No-Circumvention
10.1 Each party will comply with applicable data-protection laws. The Licensee may share buyer data with its processors for fulfilment, support and anti-fraud.
10.2 The Artist will not use buyer data received from the Licensee to market directly to those buyers or otherwise circumvent the Licensee.

11. Confidentiality
The commercial terms of this Agreement (including commission rates, price lists and sales data) are confidential. Neither party will disclose them except to professional advisers or as required by law.

12. Public Statements & Non-Disparagement
12.1 The Parties will act in good faith to protect the reputation and goodwill of the other. Neither Party will make, publish or authorise any public statement (including on social media) that it knows or reasonably ought to know is false or misleading, or that is intended to disparage or damage the reputation of the other Party, its brand or personnel.
12.2 Nothing in this clause prevents a Party from making truthful statements required by law, by a regulator, in connection with legal proceedings, or from seeking advice from professional advisers on a confidential basis.
12.3 If the Artist has a concern regarding sales performance or conduct, the Artist will first raise it privately with the Licensee and allow a reasonable opportunity to respond before making any public comment.
12.4 Name & Likeness. The Artist permits the Licensee to use the Artist's name, biography and supplied portrait in marketing and PR for the Products.

13. Term; Termination; Sell-Through
13.1 Term. This Agreement starts on the Contract Start Date and auto-renews monthly unless either Party gives 30 days' written notice.
13.2 Termination for breach. Either Party may terminate for material breach not cured within 14 days of notice. The Artist may terminate immediately for non-payment after a 7-day grace period. The Licensee may also terminate for convenience on 30 days' notice.
13.3 Sell-through & takedown. After termination/expiry, the Licensee may (i) fulfil existing orders, (ii) sell finished or in-production inventory for 30 days, and (iii) retain archive copies for legal/accounting purposes. The Licensee may remove any Product from sale at any time.

14. Compliance with Laws
Each Party will comply with applicable laws and regulations in connection with this Agreement and the sale of Products.

15. Notices
15.1 Notices must be in writing and delivered by email or recorded post.
15.2 Notices to the Licensee (including any notice to remove artworks or end the Agreement) must be sent to: support@eastsidestudiolondon.co.uk.
15.3 Notices to the Artist must be sent to the email and/or postal address set out above (or as updated in writing).
15.4 Email notices take effect on transmission if no bounce-back is received. Postal notices take effect on delivery.

16. Assignment
The Licensee may assign this Agreement to an affiliate or in connection with a sale or reorganisation of its business; otherwise, neither Party may assign without the other Party's written consent (not to be unreasonably withheld). This Agreement binds and benefits successors and permitted assigns.

17. Governing Law; Disputes
This Agreement is governed by the laws of England and Wales. The courts of England shall have exclusive jurisdiction. Before issuing proceedings, the Parties will discuss in good faith for 14 days and may attempt voluntary mediation.

18. General
18.1 Headings are for convenience only. Words in the singular include the plural and vice versa.
18.2 This Agreement may be executed in counterparts. Electronic signatures are binding.
18.3 All monetary amounts refer to pounds sterling (GBP), unless agreed otherwise in writing.
18.4 Entire agreement. This Agreement constitutes the whole agreement and supersedes prior discussions. Amendments must be in a signed written document (subject to clause 19 for the Commission Schedule).
18.5 Severability. If a provision is invalid, the remainder remains in force.
18.6 Force Majeure. Neither Party is liable for delay or failure caused by events beyond its reasonable control (including fire, flood, strike, pandemic, supplier failure, or acts of government). The affected Party will notify the other and resume performance as soon as practicable.

19. Commission Schedule & Variations
19.1 Schedule. The commission rules are set out in Schedule 1 – Commission.
19.2 Variations. The Licensee may update Schedule 1 by giving 30 days' written notice. Changes apply to Orders placed after the effective date. If the Artist does not agree, the Artist may terminate on written notice before the change takes effect (no penalty).
19.3 All other terms of this Agreement may be amended only by a signed written agreement of both Parties.

Schedule 1 – Commission

A. Commissionable base
• Net Core Product Price only (post-discount), as defined in clause 2.5.
• Marketplace/platform fees do not reduce the commissionable base.

B. Non-commissionable amounts
• Upgrades (e.g., box/deep frames, anti-reflective glazing, premium papers).
• Mounts, bespoke finishes, shipping/insurance, taxes, gift-wrap.
• Discounts applied to any of the foregoing.
• Free gifts, giveaways, press loans, samples, replacements for damages/defects, QC rejects, seconds/outlet stock.
• Any transaction where no revenue is received.

C. Rate
{{COMMISSION}}% of the Net Core Product Price (applies to all Orders, regardless of buyer type or Channel).

D. Order sources & reconciliation
• Tracked Orders (through the e-commerce platform) are visible in the Artist Portal.
• Invoiced Orders (off-platform) are commissionable on the same basis and are added manually. Missed Invoiced Orders are corrected in a subsequent cycle.

E. Timing & returns
• Payout by the 7th calendar day of the following month (based on Order date).
• Orders with a pending return/cancellation or fraud/chargeback review may be deferred to the next cycle after resolution.`;

  // Helper function to get the right contract template
  function getContractTemplate(contractType: string): string {
    return contractType === "non_exclusive" ? NON_EXCLUSIVE_CONTRACT_TEMPLATE : DEFAULT_CONTRACT_TEMPLATE;
  }

  // Get all signed contracts
  app.get("/api/admin/signed-contracts", requireAuth, async (req, res) => {
    try {
      const contracts = await storage.getAllSignedContracts();
      res.json(contracts);
    } catch (error) {
      console.error("[Contract] Error fetching signed contracts:", error);
      res.status(500).json({ error: "Failed to fetch signed contracts" });
    }
  });

  // ====== FORMS API ======

  // Get all form definitions
  app.get("/api/admin/forms", requireAuth, async (req, res) => {
    try {
      const forms = await storage.getAllFormDefinitions();
      res.json(forms);
    } catch (error) {
      console.error("[Forms] Error fetching form definitions:", error);
      res.status(500).json({ error: "Failed to fetch form definitions" });
    }
  });

  // Get form by key
  app.get("/api/admin/forms/:key", requireAuth, async (req, res) => {
    try {
      const form = await storage.getFormDefinitionByKey(req.params.key);
      if (!form) {
        return res.status(404).json({ error: "Form not found" });
      }
      res.json(form);
    } catch (error) {
      console.error("[Forms] Error fetching form:", error);
      res.status(500).json({ error: "Failed to fetch form" });
    }
  });

  // Update form definition (email associations)
  app.patch("/api/admin/forms/:key", requireAuth, async (req, res) => {
    try {
      const form = await storage.getFormDefinitionByKey(req.params.key);
      if (!form) {
        return res.status(404).json({ error: "Form not found" });
      }
      
      const { emailAssociations } = req.body;
      if (emailAssociations !== undefined) {
        const updated = await storage.updateFormDefinition(form.id, { emailAssociations });
        if (!updated) {
          return res.status(500).json({ error: "Failed to update form" });
        }
        console.log(`[Forms] Updated email associations for form ${form.key}:`, emailAssociations);
        return res.json(updated);
      }
      
      res.json(form);
    } catch (error) {
      console.error("[Forms] Error updating form:", error);
      res.status(500).json({ error: "Failed to update form" });
    }
  });

  // Send test email for a form automation
  app.post("/api/admin/forms/:key/test-email", requireAuth, async (req, res) => {
    try {
      const { templateKey, recipient } = req.body;
      
      if (!templateKey) {
        return res.status(400).json({ error: "Template key is required" });
      }
      
      const template = await storage.getEmailTemplateByKey(templateKey);
      if (!template) {
        return res.status(404).json({ error: `Template "${templateKey}" not found` });
      }
      
      const adminEmail = process.env.ADMIN_EMAIL;
      if (!adminEmail) {
        return res.status(500).json({ error: "Admin email not configured" });
      }
      
      const sampleVariables: Record<string, string> = {
        artistName: "Test Artist",
        artistEmail: "testartist@example.com",
        artworkTitle: "Sample Artwork Title",
        artworkCount: "3",
        artworkDimensions: "4000 x 3000 px",
        artworkDpi: "300",
        availableSizes: "A4, A3, A2, A1",
        submissionDate: new Date().toLocaleDateString('en-GB', { 
          day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' 
        }),
        adminDashboardUrl: `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:5000'}/admin`,
        artworksList: `<div style="padding: 10px 0; border-bottom: 1px solid #eee;">
          <strong>Sample Artwork 1</strong><br/>4000 x 3000 px • 300 DPI<br/>Sizes: A4, A3, A2
        </div>
        <div style="padding: 10px 0; border-bottom: 1px solid #eee;">
          <strong>Sample Artwork 2</strong><br/>5000 x 4000 px • 300 DPI<br/>Sizes: A3, A2, A1
        </div>`,
      };
      
      const substituteVars = (str: string): string => {
        let result = str;
        for (const [key, value] of Object.entries(sampleVariables)) {
          result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        }
        return result;
      };
      
      const subject = `[TEST] ${substituteVars(template.subject)}`;
      const html = substituteVars(template.htmlBody);
      
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      
      const { data: emailData, error } = await resend.emails.send({
        from: `East Side Studio <${process.env.FROM_EMAIL || 'notifications@yourdomain.com'}>`,
        to: adminEmail,
        subject,
        html,
        headers: {
          'X-Entity-Ref-ID': `test-email-${Date.now()}`,
        },
      });
      
      if (error) {
        console.error(`[Forms] Test email failed for ${templateKey}:`, error);
        return res.status(500).json({ error: error.message });
      }
      
      console.log(`[Forms] ✅ Test email sent for template "${templateKey}" to ${adminEmail}`);
      res.json({ 
        success: true, 
        messageId: emailData?.id,
        sentTo: adminEmail,
        templateKey,
      });
    } catch (error) {
      console.error("[Forms] Error sending test email:", error);
      res.status(500).json({ error: "Failed to send test email" });
    }
  });

  // Get form fields
  app.get("/api/admin/forms/:key/fields", requireAuth, async (req, res) => {
    try {
      const form = await storage.getFormDefinitionByKey(req.params.key);
      if (!form) {
        return res.status(404).json({ error: "Form not found" });
      }
      const fields = await storage.getFormFields(form.id);
      res.json(fields);
    } catch (error) {
      console.error("[Forms] Error fetching form fields:", error);
      res.status(500).json({ error: "Failed to fetch form fields" });
    }
  });

  // Get form submissions
  app.get("/api/admin/forms/:key/submissions", requireAuth, async (req, res) => {
    try {
      const form = await storage.getFormDefinitionByKey(req.params.key);
      if (!form) {
        return res.status(404).json({ error: "Form not found" });
      }
      const status = req.query.status as string | undefined;
      const submissions = await storage.getFormSubmissions(form.id, status);
      res.json(submissions);
    } catch (error) {
      console.error("[Forms] Error fetching form submissions:", error);
      res.status(500).json({ error: "Failed to fetch form submissions" });
    }
  });

  // Create form submission (for autosave)
  app.post("/api/forms/:key/submissions", async (req, res) => {
    try {
      const form = await storage.getFormDefinitionByKey(req.params.key);
      if (!form) {
        return res.status(404).json({ error: "Form not found" });
      }
      const submission = await storage.createFormSubmission({
        formId: form.id,
        status: "in_progress",
        currentStep: req.body.currentStep || 1,
        totalSteps: req.body.totalSteps || 1,
        actorEmail: req.body.actorEmail,
        actorName: req.body.actorName,
        data: req.body.data || {},
      });
      res.json(submission);
    } catch (error) {
      console.error("[Forms] Error creating submission:", error);
      res.status(500).json({ error: "Failed to create submission" });
    }
  });

  // Update form submission (for autosave)
  app.patch("/api/forms/submissions/:id", async (req, res) => {
    try {
      const existingSubmission = await storage.getFormSubmission(req.params.id);
      if (!existingSubmission) {
        return res.status(404).json({ error: "Submission not found" });
      }
      
      const oldStatus = existingSubmission.status;
      const newStatus = req.body.status;
      
      const submission = await storage.updateFormSubmission(req.params.id, {
        currentStep: req.body.currentStep,
        totalSteps: req.body.totalSteps,
        data: req.body.data,
        actorEmail: req.body.actorEmail,
        actorName: req.body.actorName,
        status: newStatus,
        completedAt: newStatus === "completed" ? new Date() : undefined,
        linkedArtistAccountId: req.body.linkedArtistAccountId,
        linkedArtworkIds: req.body.linkedArtworkIds,
      });
      
      if (!submission) {
        return res.status(404).json({ error: "Failed to update submission" });
      }
      
      if (newStatus && newStatus !== oldStatus) {
        const form = await storage.getFormDefinition(existingSubmission.formId);
        if (form) {
          const { scheduleFormEmails } = await import('./emailScheduler');
          scheduleFormEmails(submission, form, newStatus, oldStatus).catch(err => {
            console.error('[Forms] Error scheduling emails:', err);
          });
        }
      }
      
      res.json(submission);
    } catch (error) {
      console.error("[Forms] Error updating submission:", error);
      res.status(500).json({ error: "Failed to update submission" });
    }
  });

  // Seed form definitions (internal endpoint)
  app.post("/api/admin/forms/seed", requireAuth, async (req, res) => {
    try {
      // Check if forms already exist
      const existingForms = await storage.getAllFormDefinitions();
      if (existingForms.length > 0) {
        return res.json({ message: "Forms already seeded", forms: existingForms });
      }

      // Seed Artist Upload form
      const artistUploadForm = await storage.createFormDefinition({
        key: "artist-upload",
        name: "Artist Upload",
        description: "Form for artists to submit artworks",
        route: "/submit",
        emailAssociations: [
          { triggerStatus: "completed", templateKey: "artist_confirmation", recipient: "artist", description: "Confirmation email sent to artist" },
          { triggerStatus: "completed", templateKey: "admin_notification", recipient: "admin", description: "Notification sent to admin" },
        ],
      });

      // Add fields for Artist Upload form
      const artistUploadFields = [
        { key: "artistName", label: "Artist Name", type: "text", stepIndex: 1, displayOrder: 1 },
        { key: "artistEmail", label: "Artist Email", type: "email", stepIndex: 1, displayOrder: 2 },
        { key: "editionType", label: "Edition Type", type: "select", stepIndex: 2, displayOrder: 3 },
        { key: "artworkTitle", label: "Artwork Title", type: "text", stepIndex: 2, displayOrder: 4 },
        { key: "artworkStory", label: "Artwork Story", type: "textarea", stepIndex: 2, displayOrder: 5 },
        { key: "files", label: "Uploaded Files", type: "file", stepIndex: 2, displayOrder: 6, isArray: true },
        { key: "selectedSizes", label: "Selected Sizes", type: "array", stepIndex: 3, displayOrder: 7, isArray: true },
      ];
      for (const field of artistUploadFields) {
        await storage.createFormField({ ...field, formId: artistUploadForm.id });
      }

      // Seed Onboarding form
      const onboardingForm = await storage.createFormDefinition({
        key: "onboarding",
        name: "Artist Onboarding",
        description: "6-step artist onboarding process",
        route: "/onboarding/x7k9m2p4q8",
        emailAssociations: [
          { triggerStatus: "completed", templateKey: "onboarding_application_submitted", recipient: "artist", description: "Application submitted confirmation" },
          { triggerStatus: "completed", templateKey: "onboarding_admin_notification", recipient: "admin", description: "New artist onboarded notification" },
        ],
      });

      // Add fields for Onboarding form
      const onboardingFields = [
        { key: "firstName", label: "First Name", type: "text", stepIndex: 1, displayOrder: 1 },
        { key: "lastName", label: "Last Name", type: "text", stepIndex: 1, displayOrder: 2 },
        { key: "artistAlias", label: "Artist Alias", type: "text", stepIndex: 1, displayOrder: 3 },
        { key: "email", label: "Email", type: "email", stepIndex: 1, displayOrder: 4 },
        { key: "address", label: "Address", type: "text", stepIndex: 1, displayOrder: 5 },
        { key: "bio", label: "Bio", type: "textarea", stepIndex: 1, displayOrder: 6 },
        { key: "contractSigned", label: "Contract Signed", type: "boolean", stepIndex: 2, displayOrder: 7 },
        { key: "commissionRate", label: "Commission Rate", type: "number", stepIndex: 2, displayOrder: 8 },
        { key: "artworkCount", label: "Artwork Count", type: "number", stepIndex: 3, displayOrder: 9 },
        { key: "photos", label: "Marketing Photos", type: "file", stepIndex: 4, displayOrder: 10, isArray: true },
        { key: "instagram", label: "Instagram", type: "text", stepIndex: 4, displayOrder: 11 },
        { key: "website", label: "Website", type: "text", stepIndex: 4, displayOrder: 12 },
        { key: "marketingPreference", label: "Partnership Preference", type: "text", stepIndex: 4, displayOrder: 13 },
        { key: "paypalEmail", label: "PayPal Email", type: "email", stepIndex: 5, displayOrder: 14 },
      ];
      for (const field of onboardingFields) {
        await storage.createFormField({ ...field, formId: onboardingForm.id });
      }

      const forms = await storage.getAllFormDefinitions();
      res.json({ message: "Forms seeded successfully", forms });
    } catch (error) {
      console.error("[Forms] Error seeding forms:", error);
      res.status(500).json({ error: "Failed to seed forms" });
    }
  });

  // Get contract settings
  app.get("/api/admin/contract-settings", requireAuth, async (req, res) => {
    try {
      let settings = await storage.getContractSettings();
      if (!settings) {
        settings = await storage.createContractSettings({
          templateContent: DEFAULT_CONTRACT_TEMPLATE,
          companySignerName: "Philip Jobling",
          companyName: "East Side Studio London",
          defaultCommissionRate: 18,
        });
      }
      res.json(settings);
    } catch (error) {
      console.error("[Contract] Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch contract settings" });
    }
  });

  // Update contract settings
  app.patch("/api/admin/contract-settings/:id", requireAuth, async (req, res) => {
    try {
      const updates = req.body;
      const updated = await storage.updateContractSettings(req.params.id, updates);
      if (!updated) {
        return res.status(404).json({ error: "Contract settings not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("[Contract] Error updating settings:", error);
      res.status(500).json({ error: "Failed to update contract settings" });
    }
  });

  // Public endpoint - get contract template (for onboarding form)
  app.get("/api/contract-template", async (req, res) => {
    try {
      const contractType = req.query.contractType as string || "exclusive";
      
      let settings = await storage.getContractSettings();
      if (!settings) {
        settings = await storage.createContractSettings({
          templateContent: DEFAULT_CONTRACT_TEMPLATE,
          companySignerName: "Philip Jobling",
          companyName: "East Side Studio London",
          defaultCommissionRate: 18,
        });
      }
      
      // Get the appropriate template based on contract type
      const templateContent = getContractTemplate(contractType);
      
      res.json({
        templateContent,
        companySignerName: settings.companySignerName,
        companyName: settings.companyName,
        companySignatureUrl: settings.companySignatureUrl,
        defaultCommissionRate: settings.defaultCommissionRate,
      });
    } catch (error) {
      console.error("[Contract] Error fetching template:", error);
      res.status(500).json({ error: "Failed to fetch contract template" });
    }
  });

  // Get signed contract (for PDF download)
  app.get("/api/signed-contracts/:id", async (req, res) => {
    try {
      const contract = await storage.getSignedContract(req.params.id);
      if (!contract) {
        return res.status(404).json({ error: "Contract not found" });
      }
      res.json(contract);
    } catch (error) {
      console.error("[Contract] Error fetching signed contract:", error);
      res.status(500).json({ error: "Failed to fetch signed contract" });
    }
  });

  // ========== PayPal Bulk Payouts ==========

  // Get all payout batches
  app.get("/api/admin/payouts", requireAuth, async (req, res) => {
    try {
      const batches = await storage.getAllPayoutBatches();
      res.json(batches);
    } catch (error) {
      console.error("[Payouts] Error fetching batches:", error);
      res.status(500).json({ error: "Failed to fetch payout batches" });
    }
  });

  // Get single payout batch with items
  app.get("/api/admin/payouts/:id", requireAuth, async (req, res) => {
    try {
      const batch = await storage.getPayoutBatch(req.params.id);
      if (!batch) {
        return res.status(404).json({ error: "Payout batch not found" });
      }

      const items = await storage.getPayoutItemsByBatch(batch.id);
      
      // Enrich items with artist info
      const enrichedItems = await Promise.all(items.map(async (item) => {
        const artist = await storage.getArtistAccount(item.artistAccountId);
        return {
          ...item,
          artistName: artist?.vendorName || "Unknown",
          artistDisplayName: artist?.displayName,
        };
      }));

      res.json({ batch, items: enrichedItems });
    } catch (error) {
      console.error("[Payouts] Error fetching batch:", error);
      res.status(500).json({ error: "Failed to fetch payout batch" });
    }
  });

  // Create a new payout batch from pending sales
  app.post("/api/admin/payouts/create", requireAuth, async (req: any, res) => {
    try {
      const { periodStart, periodEnd } = req.body;

      if (!periodStart || !periodEnd) {
        return res.status(400).json({ error: "Period start and end dates required" });
      }

      const startDate = new Date(periodStart);
      const endDate = new Date(periodEnd);

      // Get all artist accounts with PayPal info
      const allArtists = await storage.getAllArtistAccounts();
      const artistsWithPaypal = allArtists.filter(a => a.paypalEmail);

      if (artistsWithPaypal.length === 0) {
        return res.status(400).json({ error: "No artists with PayPal info configured" });
      }

      // Create the batch
      const batch = await storage.createPayoutBatch({
        periodStart: startDate,
        periodEnd: endDate,
        status: "draft",
        initiatedBy: req.session?.adminEmail || "admin",
        currency: "GBP",
        totalGross: 0,
        totalFees: 0,
        totalNet: 0,
      });

      // Get sales for each artist and create payout items
      let totalGross = 0;
      let itemCount = 0;

      for (const artist of artistsWithPaypal) {
        const sales = await storage.getArtistSales(artist.id);
        
        // Filter sales within the period
        const periodSales = sales.filter(s => {
          const salesStart = new Date(s.periodStart);
          return salesStart >= startDate && salesStart <= endDate;
        });

        if (periodSales.length === 0) continue;

        // Sum up the net revenue (commission already calculated at order time using per-artist or global rate)
        const totalNet = periodSales.reduce((sum, s) => sum + s.netRevenue, 0);
        const totalOrders = periodSales.reduce((sum, s) => sum + s.totalOrders, 0);
        const totalUnits = periodSales.reduce((sum, s) => sum + s.totalUnits, 0);

        if (totalNet <= 0) continue;

        await storage.createPayoutItem({
          batchId: batch.id,
          artistAccountId: artist.id,
          paypalEmailSnapshot: artist.paypalEmail!,
          paypalRecipientNameSnapshot: artist.paypalRecipientName || null,
          grossAmount: totalNet, // Net from sales is their gross payout
          feeAmount: 0,
          netAmount: totalNet,
          currency: "GBP",
          status: "pending",
          metadata: {
            orderCount: totalOrders,
            unitCount: totalUnits,
            salesPeriod: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
          },
        });

        totalGross += totalNet;
        itemCount++;
      }

      // Update batch totals
      await storage.updatePayoutBatch(batch.id, {
        totalGross,
        totalNet: totalGross,
      });

      const updatedBatch = await storage.getPayoutBatch(batch.id);
      const items = await storage.getPayoutItemsByBatch(batch.id);

      res.json({ 
        batch: updatedBatch, 
        items,
        message: `Created payout batch with ${itemCount} artist payments totaling £${(totalGross / 100).toFixed(2)}` 
      });
    } catch (error) {
      console.error("[Payouts] Error creating batch:", error);
      res.status(500).json({ error: "Failed to create payout batch" });
    }
  });

  // Approve a payout batch
  app.post("/api/admin/payouts/:id/approve", requireAuth, async (req: any, res) => {
    try {
      const batch = await storage.getPayoutBatch(req.params.id);
      if (!batch) {
        return res.status(404).json({ error: "Payout batch not found" });
      }

      if (batch.status !== "draft" && batch.status !== "pending_approval") {
        return res.status(400).json({ error: `Cannot approve batch with status: ${batch.status}` });
      }

      const updated = await storage.updatePayoutBatch(batch.id, {
        status: "approved",
        approvedBy: req.session?.adminEmail || "admin",
        approvedAt: new Date(),
      });

      res.json(updated);
    } catch (error) {
      console.error("[Payouts] Error approving batch:", error);
      res.status(500).json({ error: "Failed to approve payout batch" });
    }
  });

  // Process/execute a payout batch via PayPal
  app.post("/api/admin/payouts/:id/process", requireAuth, async (req, res) => {
    try {
      const { paypalService } = await import("./paypalService");

      if (!paypalService.isConfigured()) {
        return res.status(400).json({ 
          error: "PayPal not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET environment variables." 
        });
      }

      const batch = await storage.getPayoutBatch(req.params.id);
      if (!batch) {
        return res.status(404).json({ error: "Payout batch not found" });
      }

      if (batch.status !== "approved") {
        return res.status(400).json({ error: `Batch must be approved before processing. Current status: ${batch.status}` });
      }

      const items = await storage.getPayoutItemsByBatch(batch.id);
      if (items.length === 0) {
        return res.status(400).json({ error: "No payout items in this batch" });
      }

      // Update status to processing
      await storage.updatePayoutBatch(batch.id, { status: "processing" });

      // Update all items to queued
      for (const item of items) {
        await storage.updatePayoutItem(item.id, { status: "queued" });
      }

      // Call PayPal API
      const result = await paypalService.createBatchPayout(batch, items);

      // Update batch with PayPal reference
      await storage.updatePayoutBatch(batch.id, {
        externalBatchId: result.batchId,
        status: paypalService.mapBatchStatus(result.status) as any,
      });

      // Update items to processing
      for (const item of items) {
        await storage.updatePayoutItem(item.id, { status: "processing" });
      }

      const updatedBatch = await storage.getPayoutBatch(batch.id);
      res.json({ 
        batch: updatedBatch, 
        paypalBatchId: result.batchId,
        message: `Payout batch submitted to PayPal successfully` 
      });
    } catch (error: any) {
      console.error("[Payouts] Error processing batch:", error);
      
      // Update batch status to failed
      await storage.updatePayoutBatch(req.params.id, {
        status: "failed",
        errorMessage: error.message,
      });

      res.status(500).json({ error: error.message || "Failed to process payout batch" });
    }
  });

  // Refresh/sync payout batch status from PayPal
  app.post("/api/admin/payouts/:id/refresh", requireAuth, async (req, res) => {
    try {
      const { paypalService } = await import("./paypalService");

      const batch = await storage.getPayoutBatch(req.params.id);
      if (!batch) {
        return res.status(404).json({ error: "Payout batch not found" });
      }

      if (!batch.externalBatchId) {
        return res.status(400).json({ error: "Batch has not been submitted to PayPal yet" });
      }

      // Get status from PayPal
      const paypalBatch = await paypalService.getBatchStatus(batch.externalBatchId);

      // Update batch status
      await storage.updatePayoutBatch(batch.id, {
        status: paypalService.mapBatchStatus(paypalBatch.batch_header.batch_status) as any,
      });

      // Update individual items if available
      if (paypalBatch.items) {
        const items = await storage.getPayoutItemsByBatch(batch.id);
        
        for (const paypalItem of paypalBatch.items) {
          const localItem = items.find(i => i.id === paypalItem.payout_item.sender_item_id);
          if (localItem) {
            await storage.updatePayoutItem(localItem.id, {
              status: paypalService.mapItemStatus(paypalItem.transaction_status) as any,
              externalItemId: paypalItem.payout_item_id,
              errorCode: paypalItem.errors?.name || null,
              errorMessage: paypalItem.errors?.message || null,
            });
          }
        }
      }

      const updatedBatch = await storage.getPayoutBatch(batch.id);
      const updatedItems = await storage.getPayoutItemsByBatch(batch.id);

      res.json({ batch: updatedBatch, items: updatedItems });
    } catch (error: any) {
      console.error("[Payouts] Error refreshing batch:", error);
      res.status(500).json({ error: error.message || "Failed to refresh payout status" });
    }
  });

  // Cancel a payout batch (only if not yet processed)
  app.post("/api/admin/payouts/:id/cancel", requireAuth, async (req, res) => {
    try {
      const batch = await storage.getPayoutBatch(req.params.id);
      if (!batch) {
        return res.status(404).json({ error: "Payout batch not found" });
      }

      if (batch.status === "completed" || batch.status === "processing") {
        return res.status(400).json({ error: `Cannot cancel batch with status: ${batch.status}` });
      }

      await storage.updatePayoutBatch(batch.id, { status: "cancelled" });

      // Cancel all items
      const items = await storage.getPayoutItemsByBatch(batch.id);
      for (const item of items) {
        await storage.updatePayoutItem(item.id, { status: "cancelled" });
      }

      const updatedBatch = await storage.getPayoutBatch(batch.id);
      res.json(updatedBatch);
    } catch (error) {
      console.error("[Payouts] Error cancelling batch:", error);
      res.status(500).json({ error: "Failed to cancel payout batch" });
    }
  });

  // Delete a payout batch (only drafts)
  app.delete("/api/admin/payouts/:id", requireAuth, async (req, res) => {
    try {
      const batch = await storage.getPayoutBatch(req.params.id);
      if (!batch) {
        return res.status(404).json({ error: "Payout batch not found" });
      }

      if (batch.status !== "draft" && batch.status !== "cancelled") {
        return res.status(400).json({ error: `Cannot delete batch with status: ${batch.status}` });
      }

      await storage.deletePayoutBatch(batch.id);
      res.json({ success: true });
    } catch (error) {
      console.error("[Payouts] Error deleting batch:", error);
      res.status(500).json({ error: "Failed to delete payout batch" });
    }
  });

  // Check PayPal configuration status
  app.get("/api/admin/payouts/config/status", requireAuth, async (req, res) => {
    try {
      const { paypalService } = await import("./paypalService");
      res.json({ 
        configured: paypalService.isConfigured(),
        sandbox: process.env.PAYPAL_SANDBOX !== "false",
      });
    } catch (error) {
      res.json({ configured: false, error: "Failed to check configuration" });
    }
  });

  // ========== Artist Onboarding ==========
  
  // Process and optimize artist photo for web (target < 1MB)
  async function processArtistPhoto(buffer: Buffer, filename: string): Promise<{ buffer: Buffer; filename: string }> {
    const sharp = (await import("sharp")).default;
    
    // Get original dimensions
    const metadata = await sharp(buffer).metadata();
    const originalWidth = metadata.width || 1920;
    const originalHeight = metadata.height || 1080;
    
    // Target max dimension of 1920px for web-quality photos
    const maxDimension = 1920;
    
    // Calculate if we need to resize
    const needsResize = originalWidth > maxDimension || originalHeight > maxDimension;
    
    // Start with quality 85, reduce if needed to stay under 1MB
    let quality = 85;
    let processedBuffer: Buffer;
    
    do {
      let pipeline = sharp(buffer).rotate(); // Auto-rotate based on EXIF
      
      if (needsResize) {
        pipeline = pipeline.resize(maxDimension, maxDimension, {
          fit: "inside",
          withoutEnlargement: true,
        });
      }
      
      processedBuffer = await pipeline
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      
      // If still over 1MB, reduce quality and try again
      if (processedBuffer.length > 1024 * 1024 && quality > 50) {
        quality -= 10;
      } else {
        break;
      }
    } while (quality >= 50);
    
    // Generate output filename with .jpg extension
    const baseName = filename.replace(/\.[^.]+$/, '');
    const outputFilename = `${baseName}_optimized.jpg`;
    
    console.log(`[Onboarding] Processed photo: ${filename} -> ${outputFilename} (${(processedBuffer.length / 1024).toFixed(0)}KB, quality=${quality})`);
    
    return { buffer: processedBuffer, filename: outputFilename };
  }
  
  // Artist onboarding form submission
  app.post("/api/artist-onboarding", upload.any(), async (req, res) => {
    try {
      const { 
        firstName, lastName, artistAlias, address, email, bio,
        contractSignedDate, commissionRate, signatureDataUrl, 
        companySignerName, companySignatureUrl 
      } = req.body;
      
      // Validate required fields
      if (!firstName || !lastName || !address || !email || !bio) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Validate bio length
      if (bio.length < 200 || bio.length > 2000) {
        return res.status(400).json({ error: "Bio must be between 200 and 2000 characters" });
      }
      
      // Get uploaded photos
      const files = req.files as Express.Multer.File[];
      const photoFiles = files?.filter(f => f.fieldname.startsWith('photo_')) || [];
      
      if (photoFiles.length === 0) {
        return res.status(400).json({ error: "At least one photo is required" });
      }
      
      // Process and upload each photo
      const processedPhotoUrls: string[] = [];
      
      for (const photoFile of photoFiles) {
        // Process photo to be under 1MB
        const { buffer: processedBuffer, filename: processedFilename } = await processArtistPhoto(
          photoFile.buffer,
          photoFile.originalname
        );
        
        // Upload to object storage
        const objectStorage = new ObjectStorageService();
        const timestamp = Date.now();
        const safeFilename = processedFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `artist-onboarding_${email.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}_${safeFilename}`;
        
        const photoUrl = await objectStorage.uploadFile(
          processedBuffer,
          storagePath,
          'image/jpeg'
        );
        
        processedPhotoUrls.push(photoUrl);
      }
      
      // Store signed contract if signature is provided
      let signedContractId: string | undefined;
      if (signatureDataUrl) {
        try {
          // Get the contract template
          let contractSettings = await storage.getContractSettings();
          const templateContent = contractSettings?.templateContent || "";
          const rate = parseInt(commissionRate) || contractSettings?.defaultCommissionRate || 18;
          const fullName = `${firstName} ${lastName}`;
          
          // Replace variables in contract
          const contractContent = templateContent
            .replace(/\{\{DATE\}\}/g, contractSignedDate || (() => { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; })())
            .replace(/\{\{FULL_NAME\}\}/g, fullName)
            .replace(/\{\{ADDRESS\}\}/g, address)
            .replace(/\{\{COMMISSION\}\}/g, String(rate));
          
          const signedContract = await storage.createSignedContract({
            artistFirstName: firstName,
            artistLastName: lastName,
            artistAddress: address,
            artistEmail: email,
            contractContent,
            commissionRate: rate,
            artistSignatureUrl: signatureDataUrl,
            companySignatureUrl: companySignatureUrl || contractSettings?.companySignatureUrl || "",
            companySignerName: companySignerName || contractSettings?.companySignerName || "Philip Jobling",
            signedAt: new Date(),
          });
          signedContractId = signedContract.id;
          console.log(`[Onboarding] Signed contract stored with ID: ${signedContractId}`);
        } catch (contractError) {
          console.error("[Onboarding] Error storing signed contract:", contractError);
          // Continue without contract storage - don't fail the whole submission
        }
      }
      
      // Create artist account for the portal
      // Use artistAlias as vendorName if provided, otherwise use full name
      const vendorName = artistAlias?.trim() || `${firstName} ${lastName}`;
      let artistAccountId: string | undefined;
      
      try {
        // Check if artist account already exists with this vendor name
        const existingAccount = await storage.getArtistAccountByVendor(vendorName);
        
        if (existingAccount) {
          // Update existing account with new info
          const updated = await storage.updateArtistAccount(existingAccount.id, {
            firstName,
            lastName,
            artistAlias: artistAlias || null,
            primaryEmail: email,
            onboardingStatus: "active",
            bio,
            photoUrls: processedPhotoUrls,
            shopifySetupComplete: false,
          });
          artistAccountId = updated?.id;
          console.log(`[Onboarding] Updated existing artist account: ${artistAccountId}`);
        } else {
          // Create new artist account
          const newAccount = await storage.createArtistAccount({
            vendorName,
            firstName,
            lastName,
            artistAlias: artistAlias || null,
            primaryEmail: email,
            onboardingStatus: "active",
            useCustomCommission: false,
            bio,
            photoUrls: processedPhotoUrls,
            shopifySetupComplete: false,
          });
          artistAccountId = newAccount.id;
          console.log(`[Onboarding] Created new artist account: ${artistAccountId}`);
        }
      } catch (accountError) {
        console.error("[Onboarding] Error creating artist account:", accountError);
        // Continue without account creation - don't fail the whole submission
      }
      
      // Log the submission
      console.log(`[Onboarding] New submission from ${firstName} ${lastName} (${email})`);
      console.log(`[Onboarding] - Artist Alias: ${artistAlias || 'None'}`);
      console.log(`[Onboarding] - Vendor Name: ${vendorName}`);
      console.log(`[Onboarding] - Address: ${address}`);
      console.log(`[Onboarding] - Bio: ${bio.substring(0, 100)}...`);
      console.log(`[Onboarding] - Photos: ${processedPhotoUrls.length} uploaded`);
      console.log(`[Onboarding] - Contract signed: ${signatureDataUrl ? 'Yes' : 'No'}`);
      console.log(`[Onboarding] - Artist Account ID: ${artistAccountId || 'Not created'}`);

      // Fire-and-forget: generate social media draft posts via Postpone (only if account was created)
      if (artistAccountId) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        (async () => {
          try {
            const isExclusive = await resolveArtistExclusivity(storage, vendorName, email);
            const artistDetails: ArtistPostDetails = {
              name: `${firstName} ${lastName}`,
              alias: artistAlias || undefined,
              bio,
              isExclusive,
            };
            console.log(`[Postpone] Generating social media drafts for new artist: ${vendorName} (exclusive: ${isExclusive})`);
            const captions = await generateArtistLaunchPost(artistDetails, "new_artist");
            const photoPath = processedPhotoUrls.length > 0 ? processedPhotoUrls[0] : undefined;
            const mediaUrl = photoPath && photoPath.startsWith("/") ? `${baseUrl}${photoPath}` : photoPath;
            await createDraftPosts(captions, mediaUrl);
          } catch (err) {
            console.error(`[Postpone] Error creating social media drafts for artist ${vendorName}:`, err);
          }
        })();
      }
      
      res.json({ 
        success: true, 
        message: "Artist profile submitted successfully",
        photoUrls: processedPhotoUrls,
        signedContractId,
        artistAccountId,
      });
    } catch (error) {
      logError("/api/artist-onboarding", "POST", error, {
        requestBody: { 
          firstName: req.body.firstName, 
          lastName: req.body.lastName,
          email: req.body.email,
        },
        userAgent: req.get('user-agent'),
        ip: req.ip,
      });
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ 
        error: "Failed to process submission",
        message: err.message,
        type: err.name,
      });
    }
  });

  // Public endpoint to update PayPal email during onboarding
  app.patch("/api/onboarding/artist-account/:id/paypal", async (req, res) => {
    try {
      const { id } = req.params;
      const { paypalEmail } = req.body;
      
      if (!paypalEmail || !paypalEmail.includes("@")) {
        return res.status(400).json({ error: "Valid PayPal email is required" });
      }
      
      const updated = await storage.updateArtistAccount(id, {
        paypalEmail: paypalEmail.trim(),
      });
      
      if (!updated) {
        return res.status(404).json({ error: "Artist account not found" });
      }
      
      console.log(`[Onboarding] Updated PayPal email for artist ${id}: ${paypalEmail}`);
      res.json({ success: true });
    } catch (error) {
      console.error("[Onboarding] Error updating PayPal email:", error);
      res.status(500).json({ error: "Failed to update PayPal email" });
    }
  });

  // Public endpoint to mark onboarding complete and send emails
  app.post("/api/onboarding/complete", async (req, res) => {
    try {
      const { artistAccountId, artistName, artistEmail, artworkCount, firstName, lastName, country } = req.body;
      
      if (!artistAccountId || !artistName || !artistEmail) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Import email service
      const emailService = await import("./emailService");
      
      // Get submission date
      const submissionDate = new Date().toLocaleDateString("en-GB", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      
      // Get base URL for admin dashboard link
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const adminDashboardUrl = `${baseUrl}/admin/artists`;
      
      // Generate invitation token for artist dashboard access (valid for 7 days)
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      // Update artist account with invitation token
      await storage.updateArtistAccount(artistAccountId, {
        invitationToken: token,
        invitationExpiresAt: expiresAt,
        onboardingStatus: "invited",
      });
      
      // Build magic link URL for artist dashboard setup
      const magicLink = `${baseUrl}/artist/setup?token=${token}`;
      
      // Send webhook to Zapier
      try {
        const zapierWebhookUrl = "https://hooks.zapier.com/hooks/catch/16593569/2wl4thy/";
        const webhookPayload = {
          magicLink,
          emailAddress: artistEmail,
          firstName: firstName || artistName.split(" ")[0],
          lastName: lastName || "",
          country: country || "",
        };
        
        const webhookResponse = await fetch(zapierWebhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(webhookPayload),
        });
        
        if (webhookResponse.ok) {
          console.log(`[Onboarding] Zapier webhook sent successfully for ${artistEmail}`);
        } else {
          console.error(`[Onboarding] Zapier webhook failed: ${webhookResponse.status} ${webhookResponse.statusText}`);
        }
      } catch (webhookError) {
        console.error("[Onboarding] Error sending Zapier webhook:", webhookError);
        // Don't fail the entire request if webhook fails
      }
      
      // Send Application Submitted email to artist
      const artistEmailResult = await emailService.sendOnboardingApplicationSubmittedEmail(
        artistEmail,
        {
          artistName,
          artworkCount: artworkCount || 0,
          submissionDate,
        }
      );
      
      // Send New Artist Onboarded email to admin
      const adminEmailResult = await emailService.sendOnboardingAdminNotificationEmail({
        artistName,
        artistEmail,
        artworkCount: artworkCount || 0,
        submissionDate,
        adminDashboardUrl,
      });
      
      console.log(`[Onboarding] Completion emails sent - Artist: ${artistEmailResult.success}, Admin: ${adminEmailResult.success}`);
      
      res.json({ 
        success: true, 
        artistEmailSent: artistEmailResult.success,
        adminEmailSent: adminEmailResult.success,
      });
    } catch (error) {
      console.error("[Onboarding] Error sending completion emails:", error);
      res.status(500).json({ error: "Failed to send completion emails" });
    }
  });

  // ========== Onboarding Invitations API ==========

  // List all onboarding invitations (admin only)
  app.get("/api/admin/onboarding-invitations", requireAuth, async (req, res) => {
    try {
      const invitations = await storage.getAllOnboardingInvitations();
      res.json(invitations);
    } catch (error) {
      console.error("[Onboarding Invitations] Error listing invitations:", error);
      res.status(500).json({ error: "Failed to list onboarding invitations" });
    }
  });

  // Create a new onboarding invitation (admin only)
  app.post("/api/admin/onboarding-invitations", requireAuth, async (req, res) => {
    try {
      const { artistEmail, artistName, commissionRate, contractType } = req.body;
      
      // Generate a random 32-character hex token
      const token = crypto.randomBytes(16).toString('hex');
      
      // Set expiration to 14 days from now
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14);
      
      // Validate commission rate (default to 18 if not provided)
      const rate = commissionRate !== undefined ? parseInt(commissionRate, 10) : 18;
      if (isNaN(rate) || rate < 0 || rate > 100) {
        return res.status(400).json({ error: "Commission rate must be between 0 and 100" });
      }
      
      // Validate contract type (default to exclusive)
      const validContractTypes = ["exclusive", "non_exclusive"];
      const type = contractType && validContractTypes.includes(contractType) ? contractType : "exclusive";
      
      const invitation = await storage.createOnboardingInvitation({
        token,
        artistEmail: artistEmail || null,
        artistName: artistName || null,
        expiresAt,
        status: "pending",
        commissionRate: rate,
        contractType: type,
      });
      
      // Build the full invitation URL
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const invitationUrl = `${baseUrl}/onboarding/${token}`;
      
      res.json({
        ...invitation,
        invitationUrl,
      });
    } catch (error) {
      console.error("[Onboarding Invitations] Error creating invitation:", error);
      res.status(500).json({ error: "Failed to create onboarding invitation" });
    }
  });

  // Delete an onboarding invitation (admin only)
  app.delete("/api/admin/onboarding-invitations/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid invitation ID" });
      }
      
      const deleted = await storage.deleteOnboardingInvitation(id);
      if (!deleted) {
        return res.status(404).json({ error: "Invitation not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("[Onboarding Invitations] Error deleting invitation:", error);
      res.status(500).json({ error: "Failed to delete onboarding invitation" });
    }
  });

  // Validate an onboarding token (public route)
  app.get("/api/onboarding/validate/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      const invitation = await storage.getOnboardingInvitationByToken(token);
      
      if (!invitation) {
        return res.json({ valid: false, reason: "Invitation not found" });
      }
      
      if (invitation.status === "used") {
        return res.json({ valid: false, reason: "This invitation has already been used" });
      }
      
      if (invitation.status === "expired" || new Date(invitation.expiresAt) < new Date()) {
        return res.json({ valid: false, reason: "This invitation has expired" });
      }
      
      res.json({ valid: true, invitation });
    } catch (error) {
      console.error("[Onboarding Invitations] Error validating token:", error);
      res.status(500).json({ error: "Failed to validate invitation token" });
    }
  });

  // Mark an invitation as used (when form is submitted)
  app.patch("/api/onboarding-invitations/:id/use", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid invitation ID" });
      }
      
      const { formSubmissionId } = req.body;
      
      const updated = await storage.updateOnboardingInvitation(id, {
        status: "used",
        usedAt: new Date(),
        formSubmissionId: formSubmissionId || null,
      });
      
      if (!updated) {
        return res.status(404).json({ error: "Invitation not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("[Onboarding Invitations] Error marking invitation as used:", error);
      res.status(500).json({ error: "Failed to update onboarding invitation" });
    }
  });

  // ========== Creator/Influencer Management API ==========

  // List all creators
  app.get("/api/admin/creators", requireAuth, async (req, res) => {
    try {
      const allCreators = await storage.getAllCreators();
      res.json(allCreators);
    } catch (error) {
      console.error("[Creators] Error fetching creators:", error);
      res.status(500).json({ error: "Failed to fetch creators" });
    }
  });

  // Get a single creator with their contracts, contents, and invoices
  app.get("/api/admin/creators/:id", requireAuth, async (req, res) => {
    try {
      const creator = await storage.getCreator(req.params.id);
      if (!creator) {
        return res.status(404).json({ error: "Creator not found" });
      }
      
      const [contracts, contents, invoices] = await Promise.all([
        storage.getCreatorContracts(req.params.id),
        storage.getCreatorContents(req.params.id),
        storage.getCreatorInvoices(req.params.id),
      ]);
      
      res.json({ ...creator, contracts, contents, invoices });
    } catch (error) {
      console.error("[Creators] Error fetching creator:", error);
      res.status(500).json({ error: "Failed to fetch creator" });
    }
  });

  // Create a new creator
  app.post("/api/admin/creators", requireAuth, async (req, res) => {
    try {
      const parsed = insertCreatorSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
      }
      
      const creator = await storage.createCreator(parsed.data);
      
      res.json(creator);
    } catch (error) {
      console.error("[Creators] Error creating creator:", error);
      res.status(500).json({ error: "Failed to create creator" });
    }
  });

  // Update a creator
  app.patch("/api/admin/creators/:id", requireAuth, async (req, res) => {
    try {
      const parsed = insertCreatorSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
      }
      
      const updated = await storage.updateCreator(req.params.id, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: "Creator not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("[Creators] Error updating creator:", error);
      res.status(500).json({ error: "Failed to update creator" });
    }
  });

  // Delete a creator
  app.delete("/api/admin/creators/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteCreator(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Creator not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[Creators] Error deleting creator:", error);
      res.status(500).json({ error: "Failed to delete creator" });
    }
  });

  // Get all creator contracts (for admin overview)
  app.get("/api/admin/creator-contracts", requireAuth, async (req, res) => {
    try {
      const contracts = await storage.getAllCreatorContracts();
      res.json(contracts);
    } catch (error) {
      console.error("[Creators] Error fetching contracts:", error);
      res.status(500).json({ error: "Failed to fetch contracts" });
    }
  });

  // Get signed contracts with shipping info (for Quick Order / Prodigi integration)
  app.get("/api/admin/creator-contracts/with-shipping", requireAuth, async (req, res) => {
    try {
      const contracts = await storage.getAllCreatorContracts();
      // Filter to only signed contracts that have shipping info (Prodigi format)
      const signedWithShipping = contracts
        .filter(c => c.status === "signed" && c.shippingAddressLine1)
        .map(c => ({
          id: c.id,
          creatorId: c.creatorId,
          title: c.title,
          signerName: c.signerName,
          signedAt: c.signedAt,
          shipping: {
            name: `${c.shippingFirstName || ''} ${c.shippingLastName || ''}`.trim(),
            firstName: c.shippingFirstName,
            lastName: c.shippingLastName,
            addressLine1: c.shippingAddressLine1,
            addressLine2: c.shippingAddressLine2,
            townCity: c.shippingTownCity,
            countyState: c.shippingCountyState,
            postcode: c.shippingPostcode,
            countryCode: c.shippingCountryCode,
            phone: c.shippingPhone,
            email: c.shippingEmail,
          }
        }));
      res.json(signedWithShipping);
    } catch (error) {
      console.error("[Creators] Error fetching contracts with shipping:", error);
      res.status(500).json({ error: "Failed to fetch contracts" });
    }
  });

  // Create a creator contract (generates unique URL)
  app.post("/api/admin/creators/:id/contracts", requireAuth, async (req, res) => {
    try {
      const creator = await storage.getCreator(req.params.id);
      if (!creator) {
        return res.status(404).json({ error: "Creator not found" });
      }
      
      const { 
        title, 
        contractContent,
        // Dual content fields
        introductionFormContent,
        introductionContractContent,
        deliverablesFormContent,
        deliverablesContractContent,
        contentUsageFormContent,
        contentUsageContractContent,
        exclusivityEnabled,
        exclusivityFormContent,
        exclusivityContractContent,
        scheduleFormContent,
        scheduleContractContent,
        paymentFormContent,
        paymentContractContent,
        // Legacy fields (for backward compatibility)
        introductionContent,
        contentUsageContent,
        exclusivityContent,
        scheduleContent,
        paymentContent
      } = req.body;
      
      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }
      
      // Generate unique token (similar to onboarding invitations)
      const token = crypto.randomBytes(16).toString("hex");
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
      
      const contract = await storage.createCreatorContract({
        creatorId: req.params.id,
        token,
        title,
        contractContent: contractContent || "See sections below",
        status: "pending",
        expiresAt,
        createdBy: (req.session as any)?.user?.name || "Admin",
        // Dual content fields
        introductionFormContent: introductionFormContent || null,
        introductionContractContent: introductionContractContent || null,
        deliverablesFormContent: deliverablesFormContent || null,
        deliverablesContractContent: deliverablesContractContent || null,
        contentUsageFormContent: contentUsageFormContent || null,
        contentUsageContractContent: contentUsageContractContent || null,
        exclusivityEnabled: exclusivityEnabled !== false,
        exclusivityFormContent: exclusivityFormContent || null,
        exclusivityContractContent: exclusivityContractContent || null,
        scheduleFormContent: scheduleFormContent || null,
        scheduleContractContent: scheduleContractContent || null,
        paymentFormContent: paymentFormContent || null,
        paymentContractContent: paymentContractContent || null,
        // Legacy fields (for backward compatibility)
        introductionContent: introductionContent || null,
        contentUsageContent: contentUsageContent || null,
        exclusivityContent: exclusivityContent || null,
        scheduleContent: scheduleContent || null,
        paymentContent: paymentContent || null,
      });
      
      res.json(contract);
    } catch (error) {
      console.error("[Creators] Error creating contract:", error);
      res.status(500).json({ error: "Failed to create contract" });
    }
  });

  // Delete a creator contract
  // Update a pending creator contract (admin only)
  app.patch("/api/admin/creator-contracts/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid contract ID" });
      }
      
      // Get existing contract to verify it's pending
      const contracts = await storage.getCreatorContracts();
      const contract = contracts.find(c => c.id === id);
      
      if (!contract) {
        return res.status(404).json({ error: "Contract not found" });
      }
      
      if (contract.status !== "pending") {
        return res.status(400).json({ error: "Only pending contracts can be edited" });
      }
      
      // Update allowed fields
      const {
        title,
        introductionFormContent,
        introductionContractContent,
        deliverablesFormContent,
        deliverablesContractContent,
        contentUsageFormContent,
        contentUsageContractContent,
        exclusivityEnabled,
        exclusivityFormContent,
        exclusivityContractContent,
        scheduleFormContent,
        scheduleContractContent,
        paymentFormContent,
        paymentContractContent,
      } = req.body;
      
      const updated = await storage.updateCreatorContract(id, {
        ...(title !== undefined && { title }),
        ...(introductionFormContent !== undefined && { introductionFormContent }),
        ...(introductionContractContent !== undefined && { introductionContractContent }),
        ...(deliverablesFormContent !== undefined && { deliverablesFormContent }),
        ...(deliverablesContractContent !== undefined && { deliverablesContractContent }),
        ...(contentUsageFormContent !== undefined && { contentUsageFormContent }),
        ...(contentUsageContractContent !== undefined && { contentUsageContractContent }),
        ...(exclusivityEnabled !== undefined && { exclusivityEnabled }),
        ...(exclusivityFormContent !== undefined && { exclusivityFormContent }),
        ...(exclusivityContractContent !== undefined && { exclusivityContractContent }),
        ...(scheduleFormContent !== undefined && { scheduleFormContent }),
        ...(scheduleContractContent !== undefined && { scheduleContractContent }),
        ...(paymentFormContent !== undefined && { paymentFormContent }),
        ...(paymentContractContent !== undefined && { paymentContractContent }),
      });
      
      res.json(updated);
    } catch (error) {
      console.error("[Creators] Error updating contract:", error);
      res.status(500).json({ error: "Failed to update contract" });
    }
  });

  app.delete("/api/admin/creator-contracts/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid contract ID" });
      }
      
      const success = await storage.deleteCreatorContract(id);
      if (!success) {
        return res.status(404).json({ error: "Contract not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[Creators] Error deleting contract:", error);
      res.status(500).json({ error: "Failed to delete contract" });
    }
  });

  // Validate a creator contract token (public route)
  app.get("/api/creator-contract/validate/:token", async (req, res) => {
    try {
      const contract = await storage.getCreatorContractByToken(req.params.token);
      
      if (!contract) {
        return res.json({ valid: false, reason: "Contract not found" });
      }
      
      if (contract.status === "signed") {
        return res.json({ valid: false, reason: "This contract has already been signed" });
      }
      
      if (contract.status === "expired" || contract.status === "cancelled" || new Date(contract.expiresAt) < new Date()) {
        return res.json({ valid: false, reason: "This contract link has expired" });
      }
      
      // Get creator info
      const creator = await storage.getCreator(contract.creatorId);
      
      // Get contract settings for company signature
      const contractSettings = await storage.getContractSettings();
      
      res.json({ 
        valid: true, 
        contract, 
        creatorName: creator?.name,
        companySignerName: contractSettings?.companySignerName || "Philip Jobling",
        companySignatureUrl: contractSettings?.companySignatureUrl || ""
      });
    } catch (error) {
      console.error("[Creators] Error validating contract token:", error);
      res.status(500).json({ error: "Failed to validate contract" });
    }
  });

  // Sign a creator contract (public route)
  app.post("/api/creator-contract/sign/:token", async (req, res) => {
    try {
      const contract = await storage.getCreatorContractByToken(req.params.token);
      
      if (!contract) {
        return res.status(404).json({ error: "Contract not found" });
      }
      
      if (contract.status === "signed") {
        return res.status(400).json({ error: "This contract has already been signed" });
      }
      
      if (contract.status === "expired" || contract.status === "cancelled" || new Date(contract.expiresAt) < new Date()) {
        return res.status(400).json({ error: "This contract link has expired" });
      }
      
      const { 
        signerName, 
        signatureDataUrl,
        firstName,
        lastName,
        email,
        addressLine1,
        addressLine2,
        townCity,
        countyState,
        postcode,
        countryCode,
        phone,
        contentUsageAgreed,
        exclusivityAgreed,
        scheduleAgreed,
        paypalEmail
      } = req.body;
      
      if (!signerName || !signatureDataUrl) {
        return res.status(400).json({ error: "Signer name and signature are required" });
      }
      
      // Validate agreement responses
      if (contentUsageAgreed === undefined || contentUsageAgreed === null) {
        return res.status(400).json({ error: "Content usage agreement response is required" });
      }
      if (contract.exclusivityEnabled && (exclusivityAgreed === undefined || exclusivityAgreed === null)) {
        return res.status(400).json({ error: "Exclusivity agreement response is required" });
      }
      if (scheduleAgreed === undefined || scheduleAgreed === null) {
        return res.status(400).json({ error: "Schedule agreement response is required" });
      }
      if (!paypalEmail || !paypalEmail.trim()) {
        return res.status(400).json({ error: "PayPal email is required" });
      }
      
      // Get creator for PDF
      const creator = await storage.getCreator(contract.creatorId);
      
      // Get contract settings for company signature
      const contractSettings = await storage.getContractSettings();
      const companySignerName = contractSettings?.companySignerName || "Philip Jobling";
      const companySignatureUrl = contractSettings?.companySignatureUrl || "";
      
      // Get contract template defaults for legal terms
      const templateDefaults = await storage.getContractTemplateDefaults();
      
      // Generate PDF with all contract sections
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let yPos = margin;
      
      const addText = (text: string, isBold = false, fontSize = 10) => {
        pdf.setFont("helvetica", isBold ? "bold" : "normal");
        pdf.setFontSize(fontSize);
        const lines = pdf.splitTextToSize(text, contentWidth);
        for (const line of lines) {
          if (yPos > pageHeight - 30) {
            pdf.addPage();
            yPos = margin;
          }
          pdf.text(line, margin, yPos);
          yPos += fontSize * 0.4;
        }
        yPos += 3;
      };
      
      const todayDate = new Date().toLocaleDateString("en-GB");
      
      // Title header
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.text("Contractual Agreement", pageWidth / 2, yPos, { align: "center" });
      yPos += 8;
      
      pdf.setFontSize(11);
      pdf.text("CREATIVE PARTNER COLLABORATION AGREEMENT", pageWidth / 2, yPos, { align: "center" });
      yPos += 6;
      
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text('("Agreement")', pageWidth / 2, yPos, { align: "center" });
      yPos += 10;

      // Parties section
      addText(`This Agreement is made on ${todayDate} between:`, false, 10);
      yPos += 2;
      addText("1. East Side Studio London, a company incorporated in England & Wales, registered office 6 Patent House, 48 Morris Road, E14 6NU London, UK; and", false, 10);
      yPos += 2;
      const creatorAddress = contract.shippingAddressLine1 
        ? `${contract.shippingAddressLine1}, ${contract.shippingTownCity || ""}, ${contract.shippingPostcode || ""}` 
        : "[Address]";
      addText(`2. ${signerName || creator?.name || "[Creative Partner Name]"}, of ${creatorAddress} ("Creative Partner").`, false, 10);
      yPos += 2;
      addText('Brand and Creative Partner together are the "Parties".', false, 10);
      yPos += 8;

      // Separator line
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 8;

      // Section 1: Scope of Work (Deliverables)
      const deliverablesContent = contract.deliverablesContractContent || contract.deliverablesFormContent;
      if (deliverablesContent) {
        addText("1. SCOPE OF WORK", true, 11);
        addText(deliverablesContent, false, 10);
        yPos += 5;
      }

      // Section 2: Compensation (Payment)
      const payContent = contract.paymentContractContent || contract.paymentFormContent || contract.paymentContent;
      if (payContent) {
        addText("2. COMPENSATION", true, 11);
        addText(payContent, false, 10);
        addText(`PayPal Email: ${paypalEmail || "Not provided"}`, false, 10);
        yPos += 5;
      }

      // Section 3: Content Usage & Licence
      const usageContent = contract.contentUsageContractContent || contract.contentUsageFormContent || contract.contentUsageContent;
      if (usageContent) {
        addText("3. CONTENT USAGE & LICENCE", true, 11);
        addText(usageContent, false, 10);
        yPos += 5;
      }

      // Section 4: Exclusivity
      const exclusivityContent = contract.exclusivityContractContent || contract.exclusivityFormContent || contract.exclusivityContent;
      if (contract.exclusivityEnabled && exclusivityContent) {
        addText("4. EXCLUSIVITY", true, 11);
        addText(exclusivityContent, false, 10);
        yPos += 5;
      }

      // Section 5: Schedule & Deadlines
      const schedContent = contract.scheduleContractContent || contract.scheduleFormContent || contract.scheduleContent;
      if (schedContent) {
        addText("5. SCHEDULE & DEADLINES", true, 11);
        addText(schedContent, false, 10);
        yPos += 5;
      }

      // Helper function to replace variables in legal terms
      const replaceVariables = (text: string) => {
        return text
          .replace(/\{\{CREATOR_EMAIL\}\}/gi, creator?.email || "[Email not provided]")
          .replace(/\{\{CREATOR_NAME\}\}/gi, creator?.name || signerName || "[Creative Partner Name]")
          .replace(/\{\{DATE\}\}/gi, todayDate);
      };

      // Standard Legal Terms (Sections 6-18) - use saved defaults or fallback
      const legalCompliance = replaceVariables(templateDefaults?.legalComplianceDefault || "Creative Partner shall comply with all applicable advertising and consumer-protection laws, regulations and codes, including but not limited to the ASA/CAP Code (UK), CMA guidelines, FTC Guides (US), EU UCPD and any equivalent local rules. Disclosures must be clear and prominent.");
      const morality = replaceVariables(templateDefaults?.moralityDefault || "Creative Partner shall not post or engage in offensive, discriminatory, hateful, illegal, or NSFW conduct, nor publicly disparage the Brand or its products.");
      const independentContractor = replaceVariables(templateDefaults?.independentContractorDefault || "Creative Partner acts solely as an independent contractor. Nothing herein creates an employment, agency, partnership or joint-venture relationship. Creative Partner is responsible for all income, social-security and other taxes.");
      const forceMajeure = replaceVariables(templateDefaults?.forceMajeureDefault || "Neither Party is liable for delay or non-performance caused by events beyond reasonable control (e.g. natural disaster, war, pandemic, or prolonged platform outage).");
      const disputeResolution = replaceVariables(templateDefaults?.disputeResolutionDefault || "The Parties will attempt in good faith to resolve disputes by mediation. Failing settlement within 30 days, the courts of England & Wales have exclusive jurisdiction and English law governs.");
      const takedown = replaceVariables(templateDefaults?.takedownDefault || "Brand may require Creative Partner to edit or remove sponsored content if it becomes misleading, infringes IP, breaches disclosure rules, or poses brand-safety concerns. Creative Partner must comply within 48 hours.");
      const termination = replaceVariables(templateDefaults?.terminationDefault || "Before shipment: Brand may cancel for any reason without liability. After shipment: If Creative Partner misses the posting deadline by more than 7 days or materially breaches this Agreement, Brand may terminate, reclaim the product (or its cost) and withhold payment.");
      const indemnity = replaceVariables(templateDefaults?.indemnityDefault || "Creative Partner indemnifies Brand against third-party claims, fines or damages arising from Creative Partner's breach of law, disclosure rules, IP infringement or negligent/wilful acts. Brand indemnifies Creative Partner against claims that the Brand's artwork or materials infringe third-party IP.");
      const confidentiality = replaceVariables(templateDefaults?.confidentialityDefault || "All non-public information relating to this collaboration, including compensation, campaign strategy or business operations, is confidential for three (3) years, unless required by law or mutual written consent.");
      const dataProtection = replaceVariables(templateDefaults?.dataProtectionDefault || "If either Party processes personal data in connection with this Agreement, it shall comply with all applicable data-protection laws (e.g. UK GDPR, EU GDPR, CCPA). No personal data will be shared beyond what is necessary for fulfilment of this Agreement.");
      const insurance = replaceVariables(templateDefaults?.insuranceDefault || "If requested in writing by Brand, Creative Partner shall maintain adequate professional-liability and general-commercial-liability insurance covering the services provided hereunder.");
      const languageTerm = replaceVariables(templateDefaults?.languageDefault || "This Agreement is executed in English. Any translation is for convenience only; the English version prevails in the event of conflict.");
      const boilerplate = replaceVariables(templateDefaults?.boilerplateDefault || "Entire Agreement: This document supersedes all prior discussions. Amendments: Changes valid only if in a signed writing (email signature acceptable). Severability: If any clause is invalid, the remainder remains in force. Assignment: Neither Party may assign this Agreement without written consent (except Brand within its corporate group). No Partnership: Nothing herein creates a partnership, joint venture or agency relationship between the Parties.");

      addText("6. LEGAL COMPLIANCE & DISCLOSURES", true, 11);
      addText(legalCompliance, false, 10);
      yPos += 5;
      
      addText("7. MORALITY & BRAND SAFETY", true, 11);
      addText(morality, false, 10);
      yPos += 5;
      
      addText("8. INDEPENDENT CONTRACTOR & TAXES", true, 11);
      addText(independentContractor, false, 10);
      yPos += 5;
      
      addText("9. FORCE MAJEURE & PLATFORM OUTAGE", true, 11);
      addText(forceMajeure, false, 10);
      yPos += 5;
      
      addText("10. DISPUTE RESOLUTION", true, 11);
      addText(disputeResolution, false, 10);
      yPos += 5;
      
      addText("11. TAKEDOWN & CONTENT REMOVAL", true, 11);
      addText(takedown, false, 10);
      yPos += 5;
      
      addText("12. TERMINATION & NON-DELIVERY", true, 11);
      addText(termination, false, 10);
      yPos += 5;
      
      addText("13. MUTUAL INDEMNITY", true, 11);
      addText(indemnity, false, 10);
      yPos += 5;
      
      addText("14. CONFIDENTIALITY", true, 11);
      addText(confidentiality, false, 10);
      yPos += 5;
      
      addText("15. DATA PROTECTION & PRIVACY", true, 11);
      addText(dataProtection, false, 10);
      yPos += 5;
      
      addText("16. INSURANCE", true, 11);
      addText(insurance, false, 10);
      yPos += 5;
      
      addText("17. LANGUAGE & INTERPRETATION", true, 11);
      addText(languageTerm, false, 10);
      yPos += 5;
      
      addText("18. BOILERPLATE", true, 11);
      addText(boilerplate, false, 10);
      yPos += 5;
      
      // Signature section
      yPos += 10;
      if (yPos > pageHeight - 100) {
        pdf.addPage();
        yPos = margin;
      }
      
      // Company signature section
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("(The Company)", margin, yPos);
      yPos += 10;
      
      // Company signature box
      const boxStartY = yPos;
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.5);
      pdf.rect(margin, yPos, 80, 35);
      
      // Add company signature image if available
      if (companySignatureUrl) {
        try {
          pdf.addImage(companySignatureUrl, "PNG", margin + 10, yPos + 5, 60, 20);
        } catch (e) {
          pdf.setFont("helvetica", "italic");
          pdf.setFontSize(9);
          pdf.text("[Company Signature]", margin + 20, yPos + 18);
        }
      }
      
      // Signed for and on behalf text
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text("Signed for and on behalf of East Side Studio", margin + 5, boxStartY + 28);
      pdf.text("London", margin + 5, boxStartY + 32);
      yPos = boxStartY + 40;
      
      // Company signer name and date
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text(companySignerName, margin, yPos);
      yPos += 5;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text("Printed Name", margin, yPos);
      yPos += 8;
      
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text(todayDate, margin, yPos);
      yPos += 5;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text("Date", margin, yPos);
      yPos += 15;

      // Creator signature section
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("(The Creative Partner) - Signature", margin, yPos);
      yPos += 10;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text(signerName, margin, yPos);
      yPos += 5;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text("Printed Name", margin, yPos);
      yPos += 8;
      
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text(todayDate, margin, yPos);
      yPos += 5;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text("Date", margin, yPos);
      yPos += 10;

      // Add creator signature image
      try {
        if (signatureDataUrl.startsWith("data:")) {
          pdf.addImage(signatureDataUrl, "PNG", margin, yPos, 60, 25);
        }
      } catch (e) {
        pdf.text("[Signature]", margin, yPos + 10);
      }
      
      // Save PDF to object storage
      const pdfBuffer = Buffer.from(pdf.output("arraybuffer"));
      const creatorNameForFilename = signerName ? signerName.replace(/\s+/g, '') : 'Creator';
      const pdfFilename = `${creatorNameForFilename}_CreatorPartnership_Agreement_signed.pdf`;
      
      const pdfUrl = await objectStorageService.uploadFile(pdfBuffer, pdfFilename, "application/pdf");
      
      // Update contract as signed with all responses and shipping info (Prodigi format)
      const updated = await storage.updateCreatorContract(contract.id, {
        status: "signed",
        signedAt: new Date(),
        signerName,
        signatureUrl: signatureDataUrl,
        pdfUrl,
        contentUsageAgreed: contentUsageAgreed === true,
        exclusivityAgreed: exclusivityAgreed === true,
        scheduleAgreed: scheduleAgreed === true,
        paypalEmail: paypalEmail || null,
        shippingFirstName: firstName || null,
        shippingLastName: lastName || null,
        shippingAddressLine1: addressLine1 || null,
        shippingAddressLine2: addressLine2 || null,
        shippingTownCity: townCity || null,
        shippingCountyState: countyState || null,
        shippingPostcode: postcode || null,
        shippingCountryCode: countryCode || null,
        shippingPhone: phone || null,
        shippingEmail: email || null,
      });
      
      // Send contract signed emails
      const emailData = {
        creatorName: signerName || creator?.name || "Creative Partner",
        creatorEmail: email || creator?.email || "",
        contractId: contract.id,
        signedDate: todayDate,
      };
      
      // Send to creator (if email is available)
      if (emailData.creatorEmail) {
        sendContractSignedCreatorEmail(emailData).catch(err => {
          console.error("[Email] Failed to send contract signed email to creator:", err);
        });
      }
      
      // Send to admin
      sendContractSignedAdminEmail(emailData).catch(err => {
        console.error("[Email] Failed to send contract signed email to admin:", err);
      });
      
      res.json({ success: true, contract: updated });
    } catch (error) {
      console.error("[Creators] Error signing contract:", error);
      res.status(500).json({ error: "Failed to sign contract" });
    }
  });

  // Create creator content
  app.post("/api/admin/creators/:id/contents", requireAuth, async (req, res) => {
    try {
      const creator = await storage.getCreator(req.params.id);
      if (!creator) {
        return res.status(404).json({ error: "Creator not found" });
      }
      
      const content = await storage.createCreatorContent({
        creatorId: req.params.id,
        ...req.body,
      });
      
      res.json(content);
    } catch (error) {
      console.error("[Creators] Error creating content:", error);
      res.status(500).json({ error: "Failed to create content" });
    }
  });

  // Delete creator content
  app.delete("/api/admin/creator-contents/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const success = await storage.deleteCreatorContent(id);
      if (!success) {
        return res.status(404).json({ error: "Content not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[Creators] Error deleting content:", error);
      res.status(500).json({ error: "Failed to delete content" });
    }
  });

  // Create creator invoice
  app.post("/api/admin/creators/:id/invoices", requireAuth, async (req, res) => {
    try {
      const creator = await storage.getCreator(req.params.id);
      if (!creator) {
        return res.status(404).json({ error: "Creator not found" });
      }
      
      const invoice = await storage.createCreatorInvoice({
        creatorId: req.params.id,
        ...req.body,
      });
      
      res.json(invoice);
    } catch (error) {
      console.error("[Creators] Error creating invoice:", error);
      res.status(500).json({ error: "Failed to create invoice" });
    }
  });

  // Update creator invoice
  app.patch("/api/admin/creator-invoices/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const updated = await storage.updateCreatorInvoice(id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("[Creators] Error updating invoice:", error);
      res.status(500).json({ error: "Failed to update invoice" });
    }
  });

  // Delete creator invoice
  app.delete("/api/admin/creator-invoices/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const success = await storage.deleteCreatorInvoice(id);
      if (!success) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[Creators] Error deleting invoice:", error);
      res.status(500).json({ error: "Failed to delete invoice" });
    }
  });

  // ===== CONTRACT TEMPLATE DEFAULTS =====
  
  // Get contract template defaults
  app.get("/api/admin/contract-template-defaults", requireAuth, async (req, res) => {
    try {
      const defaults = await storage.getContractTemplateDefaults();
      res.json(defaults || null);
    } catch (error) {
      console.error("[ContractTemplates] Error fetching defaults:", error);
      res.status(500).json({ error: "Failed to fetch contract template defaults" });
    }
  });

  // Update/create contract template defaults
  app.post("/api/admin/contract-template-defaults", requireAuth, async (req, res) => {
    try {
      const defaults = await storage.upsertContractTemplateDefaults(req.body);
      res.json(defaults);
    } catch (error) {
      console.error("[ContractTemplates] Error saving defaults:", error);
      res.status(500).json({ error: "Failed to save contract template defaults" });
    }
  });

  // ===== CONTRACT SECTION PRESETS =====
  
  // Get all presets (optionally filtered by section type)
  app.get("/api/admin/contract-section-presets", requireAuth, async (req, res) => {
    try {
      const sectionType = req.query.sectionType as string | undefined;
      const presets = await storage.getContractSectionPresets(sectionType);
      res.json(presets);
    } catch (error) {
      console.error("[ContractPresets] Error fetching presets:", error);
      res.status(500).json({ error: "Failed to fetch contract section presets" });
    }
  });

  // Get a single preset
  app.get("/api/admin/contract-section-presets/:id", requireAuth, async (req, res) => {
    try {
      const preset = await storage.getContractSectionPreset(req.params.id);
      if (!preset) {
        return res.status(404).json({ error: "Preset not found" });
      }
      res.json(preset);
    } catch (error) {
      console.error("[ContractPresets] Error fetching preset:", error);
      res.status(500).json({ error: "Failed to fetch contract section preset" });
    }
  });

  // Create a new preset
  app.post("/api/admin/contract-section-presets", requireAuth, async (req, res) => {
    try {
      const preset = await storage.createContractSectionPreset(req.body);
      res.json(preset);
    } catch (error) {
      console.error("[ContractPresets] Error creating preset:", error);
      res.status(500).json({ error: "Failed to create contract section preset" });
    }
  });

  // Update a preset
  app.patch("/api/admin/contract-section-presets/:id", requireAuth, async (req, res) => {
    try {
      const preset = await storage.updateContractSectionPreset(req.params.id, req.body);
      if (!preset) {
        return res.status(404).json({ error: "Preset not found" });
      }
      res.json(preset);
    } catch (error) {
      console.error("[ContractPresets] Error updating preset:", error);
      res.status(500).json({ error: "Failed to update contract section preset" });
    }
  });

  // Delete a preset
  app.delete("/api/admin/contract-section-presets/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteContractSectionPreset(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Preset not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[ContractPresets] Error deleting preset:", error);
      res.status(500).json({ error: "Failed to delete contract section preset" });
    }
  });

  // Set a preset as default for its section type
  app.post("/api/admin/contract-section-presets/:id/set-default", requireAuth, async (req, res) => {
    try {
      const { sectionType } = req.body;
      if (!sectionType) {
        return res.status(400).json({ error: "sectionType is required" });
      }
      const preset = await storage.setDefaultContractSectionPreset(req.params.id, sectionType);
      if (!preset) {
        return res.status(404).json({ error: "Preset not found" });
      }
      res.json(preset);
    } catch (error) {
      console.error("[ContractPresets] Error setting default preset:", error);
      res.status(500).json({ error: "Failed to set default contract section preset" });
    }
  });

  // AR Size Mappings CRUD
  app.get("/api/admin/ar-size-mappings", requireAuth, async (req, res) => {
    try {
      const mappings = await storage.getArSizeMappings();
      res.json(mappings);
    } catch (error) {
      console.error("[ARSizeMappings] Error fetching mappings:", error);
      res.status(500).json({ error: "Failed to fetch size mappings" });
    }
  });

  app.post("/api/admin/ar-size-mappings", requireAuth, async (req, res) => {
    try {
      const parsed = insertArSizeMappingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.errors });
      }
      const mapping = await storage.createArSizeMapping(parsed.data);
      res.json(mapping);
    } catch (error: any) {
      console.error("[ARSizeMappings] Error creating mapping:", error);
      if (error.code === "23505") {
        return res.status(409).json({ error: "A mapping for this size already exists" });
      }
      res.status(500).json({ error: "Failed to create size mapping" });
    }
  });

  app.patch("/api/admin/ar-size-mappings/:id", requireAuth, async (req, res) => {
    try {
      // Validate allowed update fields
      const { websiteSize, widthMm, heightMm, description, isActive } = req.body;
      const updates: any = {};
      if (websiteSize !== undefined) updates.websiteSize = String(websiteSize);
      if (widthMm !== undefined) updates.widthMm = parseInt(widthMm);
      if (heightMm !== undefined) updates.heightMm = parseInt(heightMm);
      if (description !== undefined) updates.description = description;
      if (isActive !== undefined) updates.isActive = Boolean(isActive);
      
      const mapping = await storage.updateArSizeMapping(req.params.id, updates);
      if (!mapping) {
        return res.status(404).json({ error: "Mapping not found" });
      }
      res.json(mapping);
    } catch (error) {
      console.error("[ARSizeMappings] Error updating mapping:", error);
      res.status(500).json({ error: "Failed to update size mapping" });
    }
  });

  app.delete("/api/admin/ar-size-mappings/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteArSizeMapping(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Mapping not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[ARSizeMappings] Error deleting mapping:", error);
      res.status(500).json({ error: "Failed to delete size mapping" });
    }
  });

  app.get("/api/admin/ar-size-mappings/test", requireAuth, async (req, res) => {
    try {
      const size = req.query.size as string;
      if (!size) {
        return res.status(400).json({ error: "Size parameter required" });
      }
      
      // First check if there's a custom mapping using storage abstraction
      const allMappings = await storage.getArSizeMappings();
      const customMapping = allMappings.find(m => {
        if (!m.isActive) return false;
        if (m.matchType === "contains") {
          return size.toLowerCase().includes(m.websiteSize.toLowerCase());
        }
        return m.websiteSize.toLowerCase() === size.toLowerCase();
      });
      
      if (customMapping) {
        return res.json({
          websiteSize: size,
          parsedWidth: null,
          parsedHeight: null,
          mappedWidth: customMapping.widthMm,
          mappedHeight: customMapping.heightMm,
          source: "mapping"
        });
      }
      
      // Try to parse the size string
      const parsed = parseSizeToMm(size);
      if (parsed) {
        return res.json({
          websiteSize: size,
          parsedWidth: Math.round(parsed.width),
          parsedHeight: Math.round(parsed.height),
          mappedWidth: null,
          mappedHeight: null,
          source: "parsed"
        });
      }
      
      // Failed to parse
      return res.json({
        websiteSize: size,
        parsedWidth: null,
        parsedHeight: null,
        mappedWidth: null,
        mappedHeight: null,
        source: "failed"
      });
    } catch (error) {
      console.error("[ARSizeMappings] Error testing size:", error);
      res.status(500).json({ error: "Failed to test size" });
    }
  });

  // Error logs admin endpoints
  app.get("/api/admin/error-logs", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const errors = getRecentErrors(limit);
      res.json({ errors });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch error logs" });
    }
  });

  app.get("/api/admin/error-stats", requireAuth, async (req, res) => {
    try {
      const stats = getErrorStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch error stats" });
    }
  });

  app.delete("/api/admin/error-logs", requireAuth, async (req, res) => {
    try {
      clearErrorLogs();
      res.json({ success: true, message: "Error logs cleared" });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear error logs" });
    }
  });

  // Performance monitoring endpoints
  app.get("/api/admin/performance", requireAuth, async (req, res) => {
    try {
      const stats = getPerformanceStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch performance stats" });
    }
  });

  app.get("/api/admin/performance/current", requireAuth, async (req, res) => {
    try {
      const current = getCurrentMetrics();
      res.json(current);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch current metrics" });
    }
  });

  app.get("/api/admin/performance/history", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 60;
      const snapshots = getRecentSnapshots(limit);
      res.json({ snapshots });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch performance history" });
    }
  });

  app.delete("/api/admin/performance", requireAuth, async (req, res) => {
    try {
      clearSnapshots();
      res.json({ success: true, message: "Performance history cleared" });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear performance history" });
    }
  });

  // Tool memory usage tracking
  app.get("/api/admin/performance/tools", requireAuth, async (req, res) => {
    try {
      const stats = getToolMemoryStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tool memory stats" });
    }
  });

  app.delete("/api/admin/performance/tools", requireAuth, async (req, res) => {
    try {
      clearToolMemoryHistory();
      res.json({ success: true, message: "Tool memory history cleared" });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear tool memory history" });
    }
  });

  // ============================================
  // Frame Overlay Generator (Adaptive Product Images)
  // ============================================

  app.get("/api/admin/frame-overlays/render-settings", async (req, res) => {
    try {
      const settings = await getRenderSettings();
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/frame-overlays/render-settings", requireAuth, async (req, res) => {
    try {
      const settings: RenderSettings = req.body;
      await saveRenderSettings(settings);
      res.json({ success: true, settings });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/frame-overlays/sizes", requireAuth, async (req, res) => {
    try {
      const sizes = getOverlaySizes();
      res.json(sizes);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/frame-overlays/generate", requireAuth, async (req, res) => {
    try {
      console.log("[FrameOverlay] Starting overlay generation...");
      const { sizes, frames, depths, mounts } = req.body || {};
      const overlays = await generateOverlays({ sizes, frames, depths, mounts });
      const objectStorage = new ObjectStorageService();

      const results = [];

      let existingBounds: Record<string, { x: number; y: number; w: number; h: number }> = {};
      try {
        const existingBuf = await objectStorage.downloadFileAsBuffer("/objects/frame-overlays/artwork-windows.json");
        if (existingBuf) {
          existingBounds = JSON.parse(existingBuf.toString("utf-8"));
        }
      } catch {
      }

      const allBounds: Record<string, { x: number; y: number; w: number; h: number }> = { ...existingBounds };

      for (const overlay of overlays) {
        const storagePath = `frame-overlays/${overlay.filename}`;
        const url = await objectStorage.uploadFileDirect(
          overlay.buffer,
          storagePath,
          "image/webp"
        );
        results.push({
          filename: overlay.filename,
          config: overlay.config,
          sizeLabel: overlay.sizeLabel,
          url,
          widthPx: overlay.widthPx,
          heightPx: overlay.heightPx,
          sizeBytes: overlay.buffer.length,
          artworkWindow: overlay.artworkWindow,
        });

        const key = overlay.filename.replace(/\.(webp|png)$/, "");
        allBounds[key] = overlay.artworkWindow;
      }

      await objectStorage.uploadFileDirect(
        Buffer.from(JSON.stringify(allBounds, null, 2)),
        "frame-overlays/artwork-windows.json",
        "application/json"
      );

      console.log(`[FrameOverlay] Generated ${results.length} overlays + artwork-windows.json`);
      res.json({ overlays: results });
    } catch (error: any) {
      console.error("[FrameOverlay] Generation failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  let qualityTestCache: QualityTestResult[] = [];

  app.post("/api/admin/frame-overlays/quality-test", requireAuth, async (req, res) => {
    try {
      const { sizeKey, frame, depth, mount } = req.body;
      console.log(`[QualityTest] Generating quality comparison for ${sizeKey} ${frame} ${depth} ${mount}...`);
      const results = await generateQualityTest(
        sizeKey || "a4",
        frame || "black",
        depth || "std",
        mount || "m0"
      );
      qualityTestCache = results;
      const summary = results.map((r, i) => ({
        index: i,
        label: r.label,
        quality: r.quality,
        lossless: r.lossless,
        effort: r.effort,
        alphaQuality: r.alphaQuality,
        sizeBytes: r.sizeBytes,
        sizeKB: parseFloat((r.sizeBytes / 1024).toFixed(1)),
      }));
      console.log(`[QualityTest] Generated ${results.length} quality variants`);
      res.json({ results: summary });
    } catch (error: any) {
      console.error("[QualityTest] Failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/frame-overlays/quality-test/:index", requireAuth, async (req, res) => {
    try {
      const idx = parseInt(req.params.index, 10);
      if (isNaN(idx) || idx < 0 || idx >= qualityTestCache.length) {
        return res.status(404).json({ error: "Quality test result not found. Run the test first." });
      }
      res.set("Content-Type", "image/webp");
      res.set("Cache-Control", "no-cache");
      res.send(qualityTestCache[idx].buffer);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  let canvasSizeTestCache: CanvasSizeTestResult[] = [];

  app.post("/api/admin/frame-overlays/canvas-size-test", requireAuth, async (req, res) => {
    try {
      const { sizeKey, frame, depth, mount } = req.body;
      console.log(`[CanvasSizeTest] Generating canvas size comparison for ${sizeKey} ${frame} ${depth} ${mount}...`);
      const results = await generateCanvasSizeTest(
        sizeKey || "16x20",
        frame || "black",
        depth || "box",
        mount || "m1"
      );
      canvasSizeTestCache = results;
      const summary = results.map((r, i) => ({
        index: i,
        label: r.label,
        canvasWidth: r.canvasWidth,
        canvasHeight: r.canvasHeight,
        frameWidthPx: r.frameWidthPx,
        sizeBytes: r.sizeBytes,
        sizeKB: parseFloat((r.sizeBytes / 1024).toFixed(1)),
      }));
      console.log(`[CanvasSizeTest] Generated ${results.length} canvas size variants`);
      res.json({ results: summary });
    } catch (error: any) {
      console.error("[CanvasSizeTest] Failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/frame-overlays/canvas-size-test/:index", requireAuth, async (req, res) => {
    try {
      const idx = parseInt(req.params.index, 10);
      if (isNaN(idx) || idx < 0 || idx >= canvasSizeTestCache.length) {
        return res.status(404).json({ error: "Canvas size test result not found. Run the test first." });
      }
      res.set("Content-Type", "image/webp");
      res.set("Cache-Control", "no-cache");
      res.send(canvasSizeTestCache[idx].buffer);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/frame-overlays/download-all", requireAuth, async (req, res) => {
    try {
      const { sizes, frames, depths, mounts } = req.body || {};
      console.log("[FrameOverlay] Generating overlays for ZIP download...");
      const overlays = await generateOverlays({ sizes, frames, depths, mounts });

      const files = overlays.map(o => ({ name: o.filename, data: o.buffer }));

      function createZip(entries: Array<{name: string; data: Buffer}>): Buffer {
        const centralDirEntries: Buffer[] = [];
        const localEntries: Buffer[] = [];
        let offset = 0;

        for (const entry of entries) {
          const nameBytes = Buffer.from(entry.name, "utf8");
          const crc = crc32(entry.data);
          const size = entry.data.length;

          const localHeader = Buffer.alloc(30 + nameBytes.length);
          localHeader.writeUInt32LE(0x04034b50, 0);
          localHeader.writeUInt16LE(20, 4);
          localHeader.writeUInt16LE(0, 6);
          localHeader.writeUInt16LE(0, 8);
          localHeader.writeUInt16LE(0, 10);
          localHeader.writeUInt16LE(0, 12);
          localHeader.writeUInt32LE(crc, 14);
          localHeader.writeUInt32LE(size, 18);
          localHeader.writeUInt32LE(size, 22);
          localHeader.writeUInt16LE(nameBytes.length, 26);
          localHeader.writeUInt16LE(0, 28);
          nameBytes.copy(localHeader, 30);

          localEntries.push(localHeader, entry.data);

          const centralEntry = Buffer.alloc(46 + nameBytes.length);
          centralEntry.writeUInt32LE(0x02014b50, 0);
          centralEntry.writeUInt16LE(20, 4);
          centralEntry.writeUInt16LE(20, 6);
          centralEntry.writeUInt16LE(0, 8);
          centralEntry.writeUInt16LE(0, 10);
          centralEntry.writeUInt16LE(0, 12);
          centralEntry.writeUInt16LE(0, 14);
          centralEntry.writeUInt32LE(crc, 16);
          centralEntry.writeUInt32LE(size, 20);
          centralEntry.writeUInt32LE(size, 24);
          centralEntry.writeUInt16LE(nameBytes.length, 28);
          centralEntry.writeUInt16LE(0, 30);
          centralEntry.writeUInt16LE(0, 32);
          centralEntry.writeUInt16LE(0, 34);
          centralEntry.writeUInt16LE(0, 36);
          centralEntry.writeUInt32LE(0, 38);
          centralEntry.writeUInt32LE(offset, 42);
          nameBytes.copy(centralEntry, 46);

          centralDirEntries.push(centralEntry);
          offset += localHeader.length + entry.data.length;
        }

        const centralDir = Buffer.concat(centralDirEntries);
        const centralDirOffset = offset;
        const endRecord = Buffer.alloc(22);
        endRecord.writeUInt32LE(0x06054b50, 0);
        endRecord.writeUInt16LE(0, 4);
        endRecord.writeUInt16LE(0, 6);
        endRecord.writeUInt16LE(entries.length, 8);
        endRecord.writeUInt16LE(entries.length, 10);
        endRecord.writeUInt32LE(centralDir.length, 12);
        endRecord.writeUInt32LE(centralDirOffset, 16);
        endRecord.writeUInt16LE(0, 20);

        return Buffer.concat([...localEntries, centralDir, endRecord]);
      }

      function crc32(data: Buffer): number {
        let crc = 0xffffffff;
        for (let i = 0; i < data.length; i++) {
          crc = (crc >>> 8) ^ crc32Table[(crc ^ data[i]) & 0xff];
        }
        return (crc ^ 0xffffffff) >>> 0;
      }

      const crc32Table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
          c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        crc32Table[i] = c;
      }

      const zipBuffer = createZip(files);

      res.set({
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="frame-overlays.zip"`,
        "Content-Length": zipBuffer.length.toString(),
      });
      res.send(zipBuffer);

      console.log(`[FrameOverlay] ZIP download: ${files.length} files, ${(zipBuffer.length / 1024).toFixed(0)}KB`);
    } catch (error: any) {
      console.error("[FrameOverlay] ZIP generation failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/frame-overlays/push-to-shopify", requireAuth, async (req, res) => {
    try {
      const { filenames } = req.body || {};
      const objectStorage = new ObjectStorageService();

      let overlayFiles: Array<{ name: string; path: string }> = [];

      if (filenames && Array.isArray(filenames) && filenames.length > 0) {
        overlayFiles = filenames.map((f: string) => ({ name: f, path: f }));
      } else {
        const stored = await objectStorage.listFiles("frame-overlays");
        overlayFiles = stored
          .filter(f => f.name.endsWith(".webp") || f.url.endsWith(".webp"))
          .map(f => {
            const fname = f.url.split("/").pop() || f.name;
            return { name: fname, path: fname };
          });
      }

      if (overlayFiles.length === 0) {
        return res.status(400).json({ error: "No overlays found. Generate overlays first before pushing to Shopify." });
      }

      console.log(`[FrameOverlay] Pushing ${overlayFiles.length} overlays to Shopify Files...`);

      const { uploadOverlayToShopifyFiles } = await import("./shopifyService");

      const results: Array<{ filename: string; success: boolean; shopifyFileId?: string; shopifyUrl?: string; error?: string }> = [];

      for (let i = 0; i < overlayFiles.length; i++) {
        const file = overlayFiles[i];
        const filename = decodeURIComponent(file.name);
        console.log(`[FrameOverlay] Shopify push ${i + 1}/${overlayFiles.length}: ${filename}`);
        try {
          const storagePath = `/objects/frame-overlays/${filename}`;
          const buffer = await objectStorage.downloadFileAsBuffer(storagePath);
          const result = await uploadOverlayToShopifyFiles(buffer, filename, "image/webp");
          results.push(result);
          if (result.success) {
            console.log(`[FrameOverlay] ✓ ${filename} -> ${result.shopifyFileId}`);
          } else {
            console.log(`[FrameOverlay] ✗ ${filename}: ${result.error}`);
          }
        } catch (err: any) {
          console.error(`[FrameOverlay] ✗ ${filename}: ${err.message}`);
          results.push({ filename, success: false, error: err.message });
        }
      }

      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      console.log(`[FrameOverlay] Shopify push complete: ${succeeded} succeeded, ${failed} failed out of ${results.length}`);
      res.json({ results, succeeded, failed, total: results.length });
    } catch (error: any) {
      console.error("[FrameOverlay] Shopify push failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/frame-overlays/window-mappings", requireAuth, async (req, res) => {
    try {
      const renderSettings = await getRenderSettings();
      const result: Record<string, any> = {};

      for (const size of A_RATIO_SIZES) {
        const isSquare = size.widthMm === size.heightMm;
        const orientations: ("p" | "l" | "s")[] = isSquare ? ["s"] : ["p", "l"];

        for (const ori of orientations) {
          const groupKey = `${size.sizeKey}_${ori}`;
          const oriWidthMm = ori === "l" ? size.heightMm : size.widthMm;
          const oriHeightMm = ori === "l" ? size.widthMm : size.heightMm;

          const dimsM0 = calculateDims(size, ori, "std", false, true, renderSettings);

          const entry: Record<string, any> = {
            sizeKey: size.sizeKey,
            orientation: ori,
            sizeMm: { w: oriWidthMm, h: oriHeightMm },
            canvas: { w: dimsM0.canvasWidth, h: dimsM0.canvasHeight },
          };
          const frameWidthPx = dimsM0.frameWidthPxH;
          const frameX = dimsM0.artworkX - frameWidthPx;
          const frameY = dimsM0.artworkY - frameWidthPx;
          const frameW = dimsM0.artworkW + frameWidthPx * 2;
          const frameH = dimsM0.artworkH + frameWidthPx * 2;

          entry["framed_m0"] = {
            window: { x: dimsM0.artworkX, y: dimsM0.artworkY, w: dimsM0.artworkW, h: dimsM0.artworkH },
            artwork: { x: dimsM0.artworkX, y: dimsM0.artworkY, w: dimsM0.artworkW, h: dimsM0.artworkH },
            frame: { x: frameX, y: frameY, w: frameW, h: frameH },
            frameWidthPx,
            mountBorderPx: 0,
          };

          const dimsM1 = calculateDims(size, ori, "std", true, true, renderSettings);
          const mountBorderPx = dimsM1.mountBorderPxH;
          const windowX = dimsM1.artworkX + mountBorderPx;
          const windowY = dimsM1.artworkY + dimsM1.mountBorderPxV;
          const windowW = dimsM1.artworkW - mountBorderPx * 2;
          const windowH = dimsM1.artworkH - dimsM1.mountBorderPxV * 2;

          entry["framed_m1"] = {
            window: { x: windowX, y: windowY, w: windowW, h: windowH },
            artwork: { x: dimsM1.artworkX, y: dimsM1.artworkY, w: dimsM1.artworkW, h: dimsM1.artworkH },
            frame: { x: frameX, y: frameY, w: frameW, h: frameH },
            frameWidthPx,
            mountBorderPx,
          };

          const unframedDims = calculateDims(size, ori, "std", false, false, renderSettings);
          entry["unframed"] = {
            window: { x: unframedDims.artworkX, y: unframedDims.artworkY, w: unframedDims.artworkW, h: unframedDims.artworkH },
            artwork: { x: unframedDims.artworkX, y: unframedDims.artworkY, w: unframedDims.artworkW, h: unframedDims.artworkH },
            frameWidthPx: 0,
            mountBorderPx: 0,
          };

          result[groupKey] = entry;
        }
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/frame-overlays/artwork-windows", requireAuth, async (req, res) => {
    try {
      const objectStorage = new ObjectStorageService();
      const storagePath = `/objects/frame-overlays/artwork-windows.json`;
      try {
        const buf = await objectStorage.downloadFileAsBuffer(storagePath);
        const data = JSON.parse(buf.toString("utf-8"));
        res.json(data);
      } catch {
        return res.json({});
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/frame-overlays/preview/:filename", requireAuth, async (req, res) => {
    try {
      const { filename } = req.params;
      const objectStorage = new ObjectStorageService();
      const storagePath = `/objects/frame-overlays/${filename}`;
      
      try {
        const buf = await objectStorage.downloadFileAsBuffer(storagePath);
        res.set({
          "Content-Type": "image/webp",
          "Content-Length": buf.length.toString(),
          "Cache-Control": "public, max-age=86400",
        });
        res.send(buf);
      } catch {
        return res.status(404).json({ error: "Overlay not found in storage" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/mount-review/products", requireAuth, async (req, res) => {
    try {
      const products = await fetchProductsForMountReview();
      res.json(products);
    } catch (error: any) {
      console.error("[Mount Review] Failed to fetch products:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/mount-review/update", requireAuth, async (req, res) => {
    try {
      const { updates } = req.body;
      if (!Array.isArray(updates)) {
        return res.status(400).json({ error: "updates must be an array of { gid, hasMount }" });
      }

      const results = [];
      for (const update of updates) {
        const result = await updateProductHasMount(update.gid, update.hasMount);
        results.push({ gid: update.gid, ...result });
      }

      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      res.json({ results, succeeded, failed, total: results.length });
    } catch (error: any) {
      console.error("[Mount Review] Failed to update has_mount:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/multi-ratio/products", requireAuth, async (req, res) => {
    try {
      const products = await fetchProductsForMultiRatio();
      res.json(products);
    } catch (error: any) {
      console.error("[Multi-Ratio] Failed to fetch products:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/multi-ratio/convert-and-push", requireAuth, async (req, res) => {
    try {
      const { productId, dropboxPath, ratio } = req.body;
      const AR_MAX_DIMENSION = 1000;

      if (!productId || !dropboxPath || !ratio) {
        return res.status(400).json({ error: "productId, dropboxPath, and ratio are required" });
      }

      const metafieldKey = RATIO_METAFIELD_KEYS[ratio];
      if (!metafieldKey) {
        return res.status(400).json({ error: `Unknown ratio: ${ratio}` });
      }

      const filename = dropboxPath.split('/').pop() || '';
      const ext = filename.toLowerCase().split('.').pop();
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'tif', 'tiff'];
      if (!ext || !allowedExtensions.includes(ext)) {
        return res.status(400).json({ error: "File must be an image (jpg, jpeg, png, tif, tiff)" });
      }

      const { downloadFromDropbox } = await import('./dropboxService');
      const imageBuffer = await downloadFromDropbox(dropboxPath);

      const sharp = (await import('sharp')).default;
      const metadata = await sharp(imageBuffer).metadata();
      const origWidth = metadata.width || 0;
      const origHeight = metadata.height || 0;

      let newWidth = origWidth;
      let newHeight = origHeight;
      const maxDim = Math.max(origWidth, origHeight);

      if (maxDim > AR_MAX_DIMENSION) {
        const scale = AR_MAX_DIMENSION / maxDim;
        newWidth = Math.round(origWidth * scale);
        newHeight = Math.round(origHeight * scale);
      }

      const isPng = ext === 'png' || metadata.format === 'png';
      const MAX_FILE_SIZE = 18 * 1024 * 1024;
      let resizedBuffer: Buffer;
      let outputExt: string;

      if (isPng) {
        resizedBuffer = await sharp(imageBuffer)
          .resize(newWidth, newHeight, { fit: 'inside', withoutEnlargement: true })
          .png({ compressionLevel: 9 })
          .toBuffer();
        outputExt = 'png';
        if (resizedBuffer.length > MAX_FILE_SIZE) {
          resizedBuffer = await sharp(imageBuffer)
            .resize(newWidth, newHeight, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 92, mozjpeg: true })
            .toBuffer();
          outputExt = 'jpg';
          if (resizedBuffer.length > MAX_FILE_SIZE) {
            resizedBuffer = await sharp(imageBuffer)
              .resize(newWidth, newHeight, { fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: 85, mozjpeg: true })
              .toBuffer();
          }
        }
      } else {
        resizedBuffer = await sharp(imageBuffer)
          .resize(newWidth, newHeight, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 92, mozjpeg: true })
          .toBuffer();
        outputExt = 'jpg';
        if (resizedBuffer.length > MAX_FILE_SIZE) {
          resizedBuffer = await sharp(imageBuffer)
            .resize(newWidth, newHeight, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85, mozjpeg: true })
            .toBuffer();
        }
      }

      const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;
      const ratioSuffix = ratio.replace(/[^a-zA-Z0-9]/g, '_');
      const newFilename = `${baseName}_${ratioSuffix}.${outputExt}`;

      const result = await setProductRatioImage(productId, metafieldKey, resizedBuffer, newFilename);

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      const resizedMetadata = await sharp(resizedBuffer).metadata();
      res.json({
        success: true,
        fileId: result.fileId,
        originalWidth: origWidth,
        originalHeight: origHeight,
        width: resizedMetadata.width,
        height: resizedMetadata.height,
        metafieldKey,
      });
    } catch (error: any) {
      console.error("[Multi-Ratio] Convert and push error:", error);
      res.status(500).json({ error: error.message || "Failed to convert and push image" });
    }
  });

  app.post("/api/admin/multi-ratio/push-image", requireAuth, async (req, res) => {
    try {
      const { productId, dropboxPath, ratio } = req.body;
      const AR_MAX_DIMENSION = 1000;

      if (!productId || !dropboxPath || !ratio) {
        return res.status(400).json({ error: "productId, dropboxPath, and ratio are required" });
      }

      const metafieldKey = RATIO_METAFIELD_KEYS[ratio];
      if (!metafieldKey) {
        return res.status(400).json({ error: `Unknown ratio: ${ratio}` });
      }

      const { downloadFromDropbox } = await import('./dropboxService');
      const imageBuffer = await downloadFromDropbox(dropboxPath);

      const sharp = (await import('sharp')).default;
      const metadata = await sharp(imageBuffer).metadata();
      const origWidth = metadata.width || 0;
      const origHeight = metadata.height || 0;

      const minDim = Math.min(origWidth, origHeight);
      if (minDim < 500) {
        return res.status(400).json({ error: `Image too small (${origWidth}x${origHeight}). Minimum 500px on shortest side.` });
      }

      const maxDim = Math.max(origWidth, origHeight);
      let finalBuffer = imageBuffer;
      let finalWidth = origWidth;
      let finalHeight = origHeight;

      if (maxDim > AR_MAX_DIMENSION) {
        const scale = AR_MAX_DIMENSION / maxDim;
        finalWidth = Math.round(origWidth * scale);
        finalHeight = Math.round(origHeight * scale);
        finalBuffer = await sharp(imageBuffer)
          .resize(finalWidth, finalHeight, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 90, mozjpeg: true })
          .toBuffer();
      }

      const filename = dropboxPath.split('/').pop() || '';
      const result = await setProductRatioImage(productId, metafieldKey, finalBuffer, filename);

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.json({
        success: true,
        fileId: result.fileId,
        width: finalWidth,
        height: finalHeight,
        originalWidth: origWidth,
        originalHeight: origHeight,
        metafieldKey,
      });
    } catch (error: any) {
      console.error("[Multi-Ratio] Push image error:", error);
      res.status(500).json({ error: error.message || "Failed to push image" });
    }
  });

  // Start performance monitoring (every 60 seconds)
  startMonitoring(60000);

  app.get("/api/admin/media-editor/products", requireAuth, async (req, res) => {
    try {
      const products = await fetchProductsListForMediaEditor();
      res.json(products);
    } catch (error: any) {
      console.error('[MediaEditor] Failed to fetch products:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/media-editor/product/:gid/media", requireAuth, async (req, res) => {
    try {
      const productGid = `gid://shopify/Product/${req.params.gid}`;
      const result = await fetchProductMedia(productGid);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/media-editor/update-alt-text", requireAuth, async (req, res) => {
    try {
      const { productGid, updates } = req.body;
      if (!productGid || !updates || !Array.isArray(updates)) {
        return res.status(400).json({ error: "Missing productGid or updates array" });
      }
      const result = await batchUpdateMediaAltText(productGid, updates);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Scan Video Manager Routes =====

  app.get("/api/admin/scan-videos/products", requireAuth, async (_req, res) => {
    try {
      const products = await fetchProductsForScanVideos();
      res.json(products);
    } catch (error: any) {
      console.error("[ScanVideoManager] Failed to fetch products:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/scan-videos/generate", requireAuth, async (req, res) => {
    req.setTimeout(600000);
    res.setTimeout(600000);
    try {
      const { productGid, productTitle, imageUrl, imageSource, maxSourceDim } = req.body;

      if (!productGid || !imageSource) {
        return res.status(400).json({ error: "productGid and imageSource are required" });
      }

      const selectedVariant: ScanVideoVariant = 2;

      console.log(`[ScanVideoManager] Generating scan video for "${productTitle}" (source: ${imageSource})`);

      let artworkBuffer: Buffer;
      if (imageSource === "local") {
        const allArtworks = await storage.getAllArtworks();
        const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const pNorm = normalizeForMatch(productTitle || "");
        const candidates = allArtworks
          .filter(a =>
            (a.originalFileUrl || a.lowResFileUrl) &&
            pNorm.includes(normalizeForMatch(a.title)) &&
            pNorm.includes(normalizeForMatch(a.artistName))
          )
          .sort((a, b) => b.title.length - a.title.length);

        let found = false;
        artworkBuffer = Buffer.alloc(0);
        for (const artwork of candidates) {
          const fileUrl = artwork.originalFileUrl || artwork.lowResFileUrl;
          if (!fileUrl) continue;
          try {
            if (fileUrl.startsWith("/objects/")) {
              const objStorage = new ObjectStorageService();
              artworkBuffer = await objStorage.downloadFileAsBuffer(fileUrl);
            } else {
              const resp = await fetch(fileUrl);
              if (resp.ok) artworkBuffer = Buffer.from(await resp.arrayBuffer());
            }
            if (artworkBuffer.length > 0) {
              const meta = await sharp(artworkBuffer).metadata();
              console.log(`[ScanVideoManager] Using local artwork "${artwork.title}" (${meta.width}x${meta.height}) for scan video`);
              found = true;
              break;
            }
          } catch (err: any) {
            console.warn(`[ScanVideoManager] Failed to fetch artwork "${artwork.title}": ${err.message}`);
          }
        }
        if (!found) {
          console.log(`[ScanVideoManager] No local artwork found, falling back to Dropbox search for "${productTitle}"`);
          try {
            const { searchForAnyArtwork, downloadFromDropbox } = await import('./dropboxService');
            const dropboxResults = await searchForAnyArtwork(productTitle);
            const imageFiles = dropboxResults.filter(f => /\.(jpg|jpeg|png|tif|tiff|bmp)$/i.test(f.name));
            if (imageFiles.length > 0) {
              const largest = imageFiles.sort((a, b) => (b.size || 0) - (a.size || 0))[0];
              console.log(`[ScanVideoManager] Found Dropbox file: "${largest.name}" (${((largest.size || 0) / 1024 / 1024).toFixed(1)}MB)`);
              artworkBuffer = await downloadFromDropbox(largest.path);
              if (artworkBuffer.length > 0) {
                const meta = await sharp(artworkBuffer).metadata();
                console.log(`[ScanVideoManager] Using Dropbox artwork "${largest.name}" (${meta.width}x${meta.height}) for scan video`);
                found = true;
              }
            }
          } catch (dbxErr: any) {
            console.warn(`[ScanVideoManager] Dropbox fallback failed: ${dbxErr.message}`);
          }
        }
        if (!found) {
          return res.status(400).json({ error: "No artwork found in Object Storage or Dropbox for this product" });
        }
      } else if (imageSource === "dropbox") {
        const { downloadFromDropbox } = await import('./dropboxService');
        artworkBuffer = await downloadFromDropbox(imageUrl);
      } else if (imageSource === "url") {
        const allowedHosts = ["cdn.shopify.com", "cdn.shopifycdn.net"];
        try {
          const parsedUrl = new URL(imageUrl);
          if (!allowedHosts.some(h => parsedUrl.hostname.endsWith(h))) {
            return res.status(400).json({ error: "Only Shopify CDN URLs are supported for URL source" });
          }
        } catch {
          return res.status(400).json({ error: "Invalid URL" });
        }
        const response = await fetch(imageUrl);
        if (!response.ok) {
          return res.status(500).json({ error: "Failed to fetch artwork image from URL" });
        }
        artworkBuffer = Buffer.from(await response.arrayBuffer());
      } else {
        return res.status(400).json({ error: "imageSource must be 'local', 'dropbox', or 'url'" });
      }

      const metadata = await sharp(artworkBuffer).metadata();
      console.log(`[ScanVideoManager] Source image dimensions: ${metadata.width}x${metadata.height}`);
      const maxDim = maxSourceDim ? Math.max(1000, Math.min(5000, parseInt(maxSourceDim))) : 2500;
      console.log(`[ScanVideoManager] Using max source dimension: ${maxDim}px`);
      if (metadata.width && metadata.height && (metadata.width > maxDim || metadata.height > maxDim)) {
        const scale = maxDim / Math.max(metadata.width, metadata.height);
        artworkBuffer = await sharp(artworkBuffer)
          .resize(Math.round(metadata.width * scale), Math.round(metadata.height * scale), { fit: "fill" })
          .jpeg({ quality: 95 })
          .toBuffer();
        console.log(`[ScanVideoManager] Resized artwork from ${metadata.width}x${metadata.height} to ${Math.round(metadata.width * scale)}x${Math.round(metadata.height * scale)}`);
      }

      const videoBuffer = await generateArtworkScanVideo(artworkBuffer, {
        outputWidth: 1080,
        outputHeight: 1350,
        fps: 30,
        variant: selectedVariant,
      });

      console.log(`[ScanVideoManager] Video generated (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB), uploading to Shopify...`);

      const details = await fetchProductMediaDetails(productGid);
      const existingVideos = details.media.filter(m =>
        m.mediaContentType === "VIDEO" || m.mediaContentType === "EXTERNAL_VIDEO"
      );
      if (existingVideos.length > 0) {
        console.log(`[ScanVideoManager] Deleting ${existingVideos.length} existing video(s) for "${productTitle}"`);
        const deleteResult = await deleteProductMedia(productGid, existingVideos.map(v => v.id));
        if (!deleteResult.success) {
          console.error(`[ScanVideoManager] Failed to delete old videos: ${deleteResult.error}`);
          return res.status(500).json({ error: `Failed to remove old video: ${deleteResult.error}` });
        }
      }

      const sanitize = (s: string) => s.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
      const titleSlug = sanitize(productTitle || "artwork");
      const filename = `${titleSlug}_Scan-Video.mp4`;

      const success = await uploadVideoToShopifyProduct(
        videoBuffer,
        filename,
        productGid,
        "Artwork detail scan video",
      );

      if (!success) {
        return res.status(500).json({ error: "Failed to upload video to Shopify" });
      }

      console.log(`[ScanVideoManager] Successfully pushed scan video for "${productTitle}" (source: ${maxDim}px, file: ${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
      res.json({ success: true, fileSizeMB: parseFloat((videoBuffer.length / 1024 / 1024).toFixed(1)), deletedVideos: existingVideos.length, sourceDim: maxDim });
    } catch (error: any) {
      console.error("[ScanVideoManager] Error generating scan video:", error);
      res.status(500).json({ error: error.message || "Failed to generate scan video" });
    }
  });

  // ===== Product Media (unified) Routes =====

  app.get("/api/admin/product-media/products", requireAuth, async (_req, res) => {
    try {
      const products = await fetchProductsForProductMedia();
      res.json(products);
    } catch (error: any) {
      console.error("[ProductMedia] Failed to fetch products:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/product-media/product/:gid/details", requireAuth, async (req, res) => {
    try {
      const productGid = `gid://shopify/Product/${req.params.gid}`;
      const result = await fetchProductMediaDetails(productGid);
      res.json(result);
    } catch (error: any) {
      console.error("[ProductMedia] Failed to fetch product details:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const ALLOWED_IMAGE_HOSTS = ["cdn.shopify.com", "cdn.shopifycdn.net"];

  app.post("/api/admin/product-media/upload-image", requireAuth, async (req, res) => {
    req.setTimeout(120000);
    res.setTimeout(120000);
    try {
      const { productGid, imageUrl, filename, altText } = req.body;
      if (!productGid || !imageUrl) {
        return res.status(400).json({ error: "productGid and imageUrl are required" });
      }

      try {
        const parsedUrl = new URL(imageUrl);
        if (!ALLOWED_IMAGE_HOSTS.some(h => parsedUrl.hostname.endsWith(h))) {
          return res.status(400).json({ error: "Only Shopify CDN URLs are allowed" });
        }
      } catch {
        return res.status(400).json({ error: "Invalid URL" });
      }

      const response = await fetch(imageUrl);
      if (!response.ok) {
        return res.status(500).json({ error: "Failed to fetch image from URL" });
      }
      const imageBuffer = Buffer.from(await response.arrayBuffer());

      const result = await uploadImageToShopifyProduct(
        imageBuffer,
        filename || "product-image.jpg",
        productGid,
        altText || "",
      );
      res.json(result);
    } catch (error: any) {
      console.error("[ProductMedia] Image upload error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const mockupUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
  app.post("/api/admin/product-media/upload-mockup-buffer", requireAuth, mockupUpload.single("image"), async (req, res) => {
    req.setTimeout(120000);
    res.setTimeout(120000);
    try {
      const { productGid, filename, altText } = req.body;
      if (!productGid || !req.file) {
        return res.status(400).json({ error: "productGid and image file are required" });
      }

      const result = await uploadImageToShopifyProduct(
        req.file.buffer,
        filename || req.file.originalname || "mockup.jpg",
        productGid,
        altText || "",
      );
      res.json(result);
    } catch (error: any) {
      console.error("[ProductMedia] Mockup upload error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/product-media/reorder", requireAuth, async (req, res) => {
    try {
      const { productGid, mediaIds } = req.body;
      if (!productGid || !Array.isArray(mediaIds)) {
        return res.status(400).json({ error: "productGid and mediaIds array are required" });
      }
      const result = await reorderProductMedia(productGid, mediaIds);
      res.json(result);
    } catch (error: any) {
      console.error("[ProductMedia] Reorder error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/product-media/generate-mockups", requireAuth, async (req, res) => {
    req.setTimeout(300000);
    res.setTimeout(300000);
    try {
      const { imageUrl, imageSource, frames, ratioCategory, orientation, productTitle } = req.body;
      if (!frames) {
        return res.status(400).json({ error: "frames are required" });
      }

      let artworkBuffer: Buffer | null = null;
      let detectedRatio = ratioCategory;
      let detectedOrientation = orientation;

      if (imageSource === "local" && productTitle) {
        const allArtworks = await storage.getAllArtworks();
        const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const pNorm = normalizeForMatch(productTitle);
        const candidates = allArtworks
          .filter(a =>
            (a.originalFileUrl || a.lowResFileUrl) &&
            pNorm.includes(normalizeForMatch(a.title)) &&
            pNorm.includes(normalizeForMatch(a.artistName))
          )
          .sort((a, b) => b.title.length - a.title.length);

        for (const artwork of candidates) {
          const fileUrl = artwork.originalFileUrl || artwork.lowResFileUrl;
          if (!fileUrl) continue;
          try {
            if (fileUrl.startsWith("/objects/")) {
              const objStorage = new ObjectStorageService();
              artworkBuffer = await objStorage.downloadFileAsBuffer(fileUrl);
            } else {
              const resp = await fetch(fileUrl);
              if (resp.ok) artworkBuffer = Buffer.from(await resp.arrayBuffer());
            }
            if (artworkBuffer) {
              detectedRatio = aspectRatioToCategory(artwork.aspectRatio);
              detectedOrientation = (artwork.widthPx > artwork.heightPx) ? "landscape" : "portrait";
              console.log(`[ProductMedia] Using local artwork "${artwork.title}" (${artwork.aspectRatio} → ${detectedRatio}, ${detectedOrientation}) for mockup generation`);
              break;
            }
          } catch (err: any) {
            console.warn(`[ProductMedia] Failed to fetch local artwork "${artwork.title}": ${err.message}`);
          }
        }
      } else if (imageSource === "dropbox" && imageUrl) {
        const { downloadFromDropbox } = await import('./dropboxService');
        artworkBuffer = await downloadFromDropbox(imageUrl);
      } else if (imageSource === "url" && imageUrl) {
        try {
          const parsedUrl = new URL(imageUrl);
          if (!ALLOWED_IMAGE_HOSTS.some(h => parsedUrl.hostname.endsWith(h))) {
            return res.status(400).json({ error: "Only Shopify CDN URLs are allowed for URL source" });
          }
        } catch {
          return res.status(400).json({ error: "Invalid URL" });
        }
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error("Failed to fetch image");
        artworkBuffer = Buffer.from(await response.arrayBuffer());
      }

      if (!artworkBuffer) {
        return res.status(400).json({ error: "No source artwork image found. Upload artwork or check local storage." });
      }

      if (!detectedRatio || detectedRatio === "custom") {
        return res.status(400).json({ error: "Could not determine ratio category for this artwork" });
      }
      if (!detectedOrientation) {
        return res.status(400).json({ error: "Could not determine orientation for this artwork" });
      }

      const metadata = await sharp(artworkBuffer).metadata();
      const maxDim = 3000;
      if (metadata.width && metadata.height && (metadata.width > maxDim || metadata.height > maxDim)) {
        const scale = maxDim / Math.max(metadata.width, metadata.height);
        artworkBuffer = await sharp(artworkBuffer)
          .resize(Math.round(metadata.width * scale), Math.round(metadata.height * scale), { fit: "fill" })
          .jpeg({ quality: 95 })
          .toBuffer();
      }

      const results: Array<{ frame: string; base64: string }> = [];
      for (const frame of frames) {
        const buf = await generateProductMockup(artworkBuffer, detectedRatio, frame, detectedOrientation);
        results.push({ frame, base64: buf.toString("base64") });
      }

      res.json({ success: true, mockups: results, ratioCategory: detectedRatio, orientation: detectedOrientation });
    } catch (error: any) {
      console.error("[ProductMedia] Mockup generation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/product-media/scale-settings", requireAuth, async (_req, res) => {
    try {
      const settings = await getRenderSettings();
      res.json({ mockupScaleMultiplier: settings.mockupScaleMultiplier ?? 1.0 });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/product-media/scale-settings", requireAuth, async (req, res) => {
    try {
      const { mockupScaleMultiplier } = req.body;
      if (typeof mockupScaleMultiplier !== "number" || mockupScaleMultiplier < 0.5 || mockupScaleMultiplier > 2.0) {
        return res.status(400).json({ error: "mockupScaleMultiplier must be a number between 0.5 and 2.0" });
      }
      const settings = await getRenderSettings();
      settings.mockupScaleMultiplier = mockupScaleMultiplier;
      await saveRenderSettings(settings);
      res.json({ success: true, mockupScaleMultiplier });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/product-media/calibration-preview", requireAuth, async (req, res) => {
    req.setTimeout(120000);
    res.setTimeout(120000);
    try {
      const { imageUrl, imageSource, frame, ratioCategory, orientation, scaleMultiplier } = req.body;
      if (!imageUrl || !frame || !ratioCategory || !orientation || typeof scaleMultiplier !== "number") {
        return res.status(400).json({ error: "imageUrl, frame, ratioCategory, orientation, and scaleMultiplier are required" });
      }

      let artworkBuffer: Buffer;
      if (imageSource === "dropbox") {
        const { downloadFromDropbox } = await import('./dropboxService');
        artworkBuffer = await downloadFromDropbox(imageUrl);
      } else if (imageSource === "url") {
        try {
          const parsedUrl = new URL(imageUrl);
          if (!ALLOWED_IMAGE_HOSTS.some(h => parsedUrl.hostname.endsWith(h))) {
            return res.status(400).json({ error: "Only Shopify CDN URLs are allowed" });
          }
        } catch {
          return res.status(400).json({ error: "Invalid URL" });
        }
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error("Failed to fetch image");
        artworkBuffer = Buffer.from(await response.arrayBuffer());
      } else {
        return res.status(400).json({ error: "imageSource must be 'dropbox' or 'url'" });
      }

      const metadata = await sharp(artworkBuffer).metadata();
      const maxDim = 3000;
      if (metadata.width && metadata.height && (metadata.width > maxDim || metadata.height > maxDim)) {
        const scale = maxDim / Math.max(metadata.width, metadata.height);
        artworkBuffer = await sharp(artworkBuffer)
          .resize(Math.round(metadata.width * scale), Math.round(metadata.height * scale), { fit: "fill" })
          .jpeg({ quality: 95 })
          .toBuffer();
      }

      const buf = await generateProductMockup(artworkBuffer, ratioCategory, frame, orientation, {
        mockupScaleMultiplier: scaleMultiplier,
      });
      res.json({ success: true, base64: buf.toString("base64") });
    } catch (error: any) {
      console.error("[ProductMedia] Calibration preview error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/product-media/batch-update-mockups", requireAuth, async (req, res) => {
    req.setTimeout(600000);
    res.setTimeout(600000);
    try {
      const { productGids, frames, ratioCategory, orientation } = req.body;
      if (!Array.isArray(productGids) || productGids.length === 0 || !frames || !ratioCategory || !orientation) {
        return res.status(400).json({ error: "productGids, frames, ratioCategory, and orientation are required" });
      }

      const results: Array<{ gid: string; title: string; success: boolean; uploaded: number; error?: string }> = [];

      for (const gid of productGids) {
        try {
          const details = await fetchProductMediaDetails(gid);
          const firstImage = details.media.find(m => m.mediaContentType === "IMAGE" && m.url);
          if (!firstImage?.url) {
            results.push({ gid, title: details.product.title, success: false, uploaded: 0, error: "No source image" });
            continue;
          }

          const imgResponse = await fetch(firstImage.url);
          if (!imgResponse.ok) {
            results.push({ gid, title: details.product.title, success: false, uploaded: 0, error: "Failed to fetch source image" });
            continue;
          }
          let artworkBuffer = Buffer.from(await imgResponse.arrayBuffer());

          const metadata = await sharp(artworkBuffer).metadata();
          const maxDim = 3000;
          if (metadata.width && metadata.height && (metadata.width > maxDim || metadata.height > maxDim)) {
            const scale = maxDim / Math.max(metadata.width, metadata.height);
            artworkBuffer = await sharp(artworkBuffer)
              .resize(Math.round(metadata.width * scale), Math.round(metadata.height * scale), { fit: "fill" })
              .jpeg({ quality: 95 })
              .toBuffer();
          }

          let uploadedCount = 0;
          for (const frame of frames) {
            const mockupBuf = await generateProductMockup(artworkBuffer, ratioCategory, frame, orientation);
            const sanitize = (s: string) => s.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
            const filename = `${sanitize(details.product.title)}_${frame}_Frame_Scaled.jpg`;
            const frameLabel = frame === "unframed" ? "Unframed" : frame.charAt(0).toUpperCase() + frame.slice(1) + " Frame";
            const altText = `${details.product.title} - ${frameLabel} [auto-scaled] |frame=${frameLabel}|`;

            const uploadResult = await uploadImageToShopifyProduct(mockupBuf, filename, gid, altText);
            if (uploadResult.success) uploadedCount++;
          }

          results.push({ gid, title: details.product.title, success: uploadedCount > 0, uploaded: uploadedCount });
        } catch (err: any) {
          results.push({ gid, title: gid, success: false, uploaded: 0, error: err.message });
        }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error("[ProductMedia] Batch update error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/social-media/generate-captions", requireAuth, async (req, res) => {
    try {
      const { artistName, artistBio, artistLocation, isExclusive, postType } = req.body;
      if (!artistName) {
        return res.status(400).json({ error: "artistName is required" });
      }
      const artist: ArtistPostDetails = {
        name: artistName,
        bio: artistBio || "A talented contemporary artist.",
        location: artistLocation,
        isExclusive: isExclusive !== false,
      };
      const captions = await generateArtistLaunchPost(artist, postType || "new_artist");
      res.json({ success: true, captions });
    } catch (error: any) {
      console.error("[SocialMedia] Caption generation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/social-media/send-drafts", requireAuth, async (req, res) => {
    try {
      const { captions, mediaUrl, mediaName, platforms } = req.body;
      if (!captions) {
        return res.status(400).json({ error: "captions object is required" });
      }

      const { scheduleInstagramPost, scheduleLinkedInPost, scheduleThreadsPost } = await import("./postponeService");
      const enabledPlatforms = platforms || ["instagram", "linkedin", "threads"];

      const tasks: Array<{ name: string; fn: () => Promise<void> }> = [];
      if (enabledPlatforms.includes("instagram")) {
        tasks.push({ name: "Instagram", fn: () => scheduleInstagramPost({ caption: captions.instagram, mediaUrl, mediaName }) });
      }
      if (enabledPlatforms.includes("linkedin")) {
        tasks.push({ name: "LinkedIn", fn: () => scheduleLinkedInPost({ caption: captions.linkedin, mediaUrl, mediaName }) });
      }
      if (enabledPlatforms.includes("threads")) {
        tasks.push({ name: "Threads", fn: () => scheduleThreadsPost({ caption: captions.threads, mediaUrl, mediaName }) });
      }

      const results = await Promise.allSettled(tasks.map(t => t.fn()));
      const platformResults = tasks.map((t, i) => ({
        platform: t.name,
        success: results[i].status === "fulfilled",
        error: results[i].status === "rejected" ? (results[i] as PromiseRejectedResult).reason?.message : undefined,
      }));

      res.json({ success: platformResults.some(r => r.success), platformResults });
    } catch (error: any) {
      console.error("[SocialMedia] Send drafts error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/social-media/accounts", requireAuth, async (_req, res) => {
    try {
      const accounts = {
        instagram: process.env.POSTPONE_INSTAGRAM_USERNAME || null,
        linkedin: process.env.POSTPONE_LINKEDIN_USERNAME || null,
        threads: process.env.POSTPONE_THREADS_USERNAME || null,
      };
      const configured = !!process.env.POSTPONE_API_TOKEN;
      res.json({ configured, accounts });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/social-media/mockups", requireAuth, async (req, res) => {
    try {
      const { search, artistName } = req.query;
      const allMockups = await storage.getAllMockups();
      const allArtworks = await storage.getAllArtworks();
      const artworkMap = new Map(allArtworks.map(a => [a.id, a]));

      let filtered = allMockups.filter(m => m.mockupImageUrl);

      if (artistName && typeof artistName === "string") {
        const lowerArtist = artistName.toLowerCase();
        filtered = filtered.filter(m => {
          const aw = artworkMap.get(m.artworkId);
          return aw && aw.artistName.toLowerCase().includes(lowerArtist);
        });
      }

      if (search && typeof search === "string") {
        const lowerSearch = search.toLowerCase();
        filtered = filtered.filter(m => {
          const aw = artworkMap.get(m.artworkId);
          return (
            m.frameType.toLowerCase().includes(lowerSearch) ||
            (aw && (aw.title.toLowerCase().includes(lowerSearch) || aw.artistName.toLowerCase().includes(lowerSearch)))
          );
        });
      }

      const recent = filtered
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 50);

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const results = recent.map(m => {
        const aw = artworkMap.get(m.artworkId);
        const imageUrl = m.mockupImageUrl.startsWith("http")
          ? m.mockupImageUrl
          : `${baseUrl}${m.mockupImageUrl}`;
        return {
          id: m.id,
          frameType: m.frameType,
          imageUrl,
          artworkTitle: aw?.title || "Unknown",
          artistName: aw?.artistName || "Unknown",
          isLifestyle: m.isLifestyle,
        };
      });

      res.json({ mockups: results });
    } catch (error: any) {
      console.error("[SocialMedia] Browse mockups error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/social-media/upload-image", requireAuth, (req, res, next) => {
    imageUpload.single("image")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  }, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image uploaded" });
      }

      const timestamp = Date.now();
      const safeFilename = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `social-media/${timestamp}_${safeFilename}`;

      const relativeUrl = await objectStorageService.uploadFile(
        req.file.buffer,
        storagePath,
        req.file.mimetype
      );

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const absoluteUrl = relativeUrl.startsWith("http") ? relativeUrl : `${baseUrl}${relativeUrl}`;

      res.json({ url: absoluteUrl, filename: req.file.originalname });
    } catch (error: any) {
      console.error("[SocialMedia] Upload image error:", error);
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  const AUTO_MOCKUP_ALT_PATTERNS = ["Black Frame", "White Frame", "Natural Frame", "Unframed"];
  const FRAME_ALT_TO_KEY: Record<string, string> = {
    "Black Frame": "black",
    "White Frame": "white",
    "Natural Frame": "natural",
    "Unframed": "unframed",
  };

  app.post("/api/admin/product-media/scan-auto-mockups", requireAuth, async (req, res) => {
    req.setTimeout(120000);
    res.setTimeout(120000);
    try {
      const { productGids } = req.body;
      if (!Array.isArray(productGids) || productGids.length === 0) {
        return res.status(400).json({ error: "productGids array is required" });
      }

      const results: Array<{
        gid: string;
        title: string;
        autoMockups: Array<{ id: string; alt: string; frameKey: string; position: number; url: string | null }>;
        sourceImage: { id: string; url: string } | null;
        hasLocalSource: boolean;
      }> = [];

      const allArtworksCache = await storage.getAllArtworks();

      for (const gid of productGids) {
        try {
          const details = await fetchProductMediaDetails(gid);
          const autoMockups: Array<{ id: string; alt: string; frameKey: string; position: number; url: string | null }> = [];

          for (const m of details.media) {
            if (m.mediaContentType !== "IMAGE" || !m.alt) continue;
            for (const pattern of AUTO_MOCKUP_ALT_PATTERNS) {
              if (m.alt.endsWith(` - ${pattern}`) || m.alt.includes(`|frame=${pattern}|`)) {
                autoMockups.push({
                  id: m.id,
                  alt: m.alt,
                  frameKey: FRAME_ALT_TO_KEY[pattern],
                  position: m.position,
                  url: m.url,
                });
                break;
              }
            }
          }

          const isTaggedImage = (alt: string | null) => {
            if (!alt) return false;
            return alt.includes("|frame=") || alt.includes("|type=");
          };
          const sourceImage = details.media.find(m => m.mediaContentType === "IMAGE" && m.url && !autoMockups.some(am => am.id === m.id) && !isTaggedImage(m.alt));

          const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          let hasLocalSource = false;
          if (!sourceImage) {
            const pNorm = normalizeForMatch(details.product.title);
            const candidates = allArtworksCache
              .filter(a =>
                (a.originalFileUrl || a.lowResFileUrl) &&
                pNorm.includes(normalizeForMatch(a.title)) &&
                pNorm.includes(normalizeForMatch(a.artistName))
              )
              .sort((a, b) => b.title.length - a.title.length);
            if (candidates.length > 0) {
              hasLocalSource = true;
            }
          }

          results.push({
            gid,
            title: details.product.title,
            autoMockups,
            sourceImage: sourceImage ? { id: sourceImage.id, url: sourceImage.url! } : null,
            hasLocalSource,
          });
        } catch (err: any) {
          results.push({ gid, title: gid, autoMockups: [], sourceImage: null, hasLocalSource: false });
        }
      }

      res.json({ success: true, products: results });
    } catch (error: any) {
      console.error("[ProductMedia] Scan auto mockups error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/product-media/rescale-mockups", requireAuth, async (req, res) => {
    req.setTimeout(600000);
    res.setTimeout(600000);
    try {
      const { productGid, ratioCategory, orientation } = req.body;
      if (!productGid || !ratioCategory || !orientation) {
        return res.status(400).json({ error: "productGid, ratioCategory, and orientation are required" });
      }

      const details = await fetchProductMediaDetails(productGid);
      const productTitle = details.product.title;

      const autoMockups: Array<{ id: string; alt: string; frameKey: string; position: number }> = [];
      for (const m of details.media) {
        if (m.mediaContentType !== "IMAGE" || !m.alt) continue;
        for (const pattern of AUTO_MOCKUP_ALT_PATTERNS) {
          if (m.alt.endsWith(` - ${pattern}`) || m.alt.includes(`|frame=${pattern}|`)) {
            autoMockups.push({
              id: m.id,
              alt: m.alt,
              frameKey: FRAME_ALT_TO_KEY[pattern],
              position: m.position,
            });
            break;
          }
        }
      }

      if (autoMockups.length === 0) {
        return res.json({ success: true, message: "No auto-generated mockups found", replaced: 0 });
      }

      let artworkBuffer: Buffer | null = null;

      const isTaggedImg = (alt: string | null) => {
        if (!alt) return false;
        return alt.includes("|frame=") || alt.includes("|type=");
      };
      const sourceImage = details.media.find(m => m.mediaContentType === "IMAGE" && m.url && !autoMockups.some(am => am.id === m.id) && !isTaggedImg(m.alt));
      if (sourceImage?.url) {
        const imgResponse = await fetch(sourceImage.url);
        if (imgResponse.ok) {
          artworkBuffer = Buffer.from(await imgResponse.arrayBuffer());
        }
      }

      if (!artworkBuffer) {
        const allArtworks = await storage.getAllArtworks();
        const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const pNorm = normalizeForMatch(productTitle);
        const candidates = allArtworks
          .filter(a =>
            (a.originalFileUrl || a.lowResFileUrl) &&
            pNorm.includes(normalizeForMatch(a.title)) &&
            pNorm.includes(normalizeForMatch(a.artistName))
          )
          .sort((a, b) => b.title.length - a.title.length);

        for (const artwork of candidates) {
          const imageUrl = artwork.originalFileUrl || artwork.lowResFileUrl;
          if (!imageUrl) continue;
          try {
            if (imageUrl.startsWith("/objects/")) {
              const objectStorage = new ObjectStorageService();
              artworkBuffer = await objectStorage.downloadFileAsBuffer(imageUrl);
            } else {
              const imgResponse = await fetch(imageUrl);
              if (imgResponse.ok) {
                artworkBuffer = Buffer.from(await imgResponse.arrayBuffer());
              }
            }
            if (artworkBuffer) {
              console.log(`[ProductMedia] Using local artwork "${artwork.title}" as source for rescale`);
              break;
            }
          } catch (err: any) {
            console.warn(`[ProductMedia] Failed to fetch local artwork "${artwork.title}": ${err.message}`);
          }
        }
      }

      if (!artworkBuffer) {
        return res.status(400).json({ error: "No source artwork image found on Shopify or in local storage" });
      }

      const metadata = await sharp(artworkBuffer).metadata();
      const maxDim = 3000;
      if (metadata.width && metadata.height && (metadata.width > maxDim || metadata.height > maxDim)) {
        const scale = maxDim / Math.max(metadata.width, metadata.height);
        artworkBuffer = await sharp(artworkBuffer)
          .resize(Math.round(metadata.width * scale), Math.round(metadata.height * scale), { fit: "fill" })
          .jpeg({ quality: 95 })
          .toBuffer();
      }

      const deleteResult = await deleteProductMedia(productGid, autoMockups.map(m => m.id));
      if (!deleteResult.success) {
        console.error(`[ProductMedia] Failed to delete old mockups: ${deleteResult.error}`);
      }

      const sanitize = (s: string) => s.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
      const newMediaIds: string[] = [];
      let replacedCount = 0;

      for (const mockup of autoMockups) {
        try {
          const buf = await generateProductMockup(artworkBuffer, ratioCategory, mockup.frameKey as any, orientation);
          const frameLabel = AUTO_MOCKUP_ALT_PATTERNS.find(p => FRAME_ALT_TO_KEY[p] === mockup.frameKey) || mockup.frameKey;
          const filename = `${sanitize(productTitle)}_${mockup.frameKey}_Frame_Scaled.jpg`;
          const altText = `${productTitle} - ${frameLabel} [auto-scaled] |frame=${frameLabel}|`;

          const uploadResult = await uploadImageToShopifyProduct(buf, filename, productGid, altText);
          if (uploadResult.success && uploadResult.mediaId) {
            newMediaIds.push(uploadResult.mediaId);
            replacedCount++;
          }
        } catch (err: any) {
          console.error(`[ProductMedia] Failed to regenerate ${mockup.frameKey} for ${productGid}:`, err.message);
        }
      }

      if (newMediaIds.length > 0) {
        const updatedDetails = await fetchProductMediaDetails(productGid);
        const existingIds = updatedDetails.media.map(m => m.id);
        const nonNewIds = existingIds.filter(id => !newMediaIds.includes(id));
        const firstOldPosition = Math.min(...autoMockups.map(m => m.position));
        const insertIdx = Math.max(0, Math.min(firstOldPosition - 1, nonNewIds.length));
        const reordered = [...nonNewIds.slice(0, insertIdx), ...newMediaIds, ...nonNewIds.slice(insertIdx)];
        await reorderProductMedia(productGid, reordered);
      }

      res.json({
        success: true,
        title: productTitle,
        replaced: replacedCount,
        deleted: deleteResult.deletedCount,
      });
    } catch (error: any) {
      console.error("[ProductMedia] Rescale mockups error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/product-media/batch-regenerate-mockups", requireAuth, async (req, res) => {
    req.setTimeout(1800000);
    res.setTimeout(1800000);
    try {
      const { productGid } = req.body;
      if (!productGid) {
        return res.status(400).json({ error: "productGid is required" });
      }

      const details = await fetchProductMediaDetails(productGid);
      const productTitle = details.product.title;

      const FRAME_LABELS = ["Black Frame", "White Frame", "Natural Frame", "Unframed"];
      const isFrameMockup = (alt: string | null) => {
        if (!alt) return false;
        if (alt.includes("|frame=")) return true;
        for (const label of FRAME_LABELS) {
          if (alt.endsWith(` - ${label}`) || alt.includes(` - ${label} |`)) return true;
        }
        return false;
      };
      const frameMockups = details.media.filter(m => m.mediaContentType === "IMAGE" && isFrameMockup(m.alt));

      const allArtworks = await storage.getAllArtworks();
      const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const pNorm = normalizeForMatch(productTitle);
      const candidates = allArtworks
        .filter(a =>
          (a.originalFileUrl || a.lowResFileUrl) &&
          pNorm.includes(normalizeForMatch(a.title)) &&
          pNorm.includes(normalizeForMatch(a.artistName))
        )
        .sort((a, b) => b.title.length - a.title.length);

      let artworkBuffer: Buffer | null = null;
      let ratioCategory = "";
      let orientation: "portrait" | "landscape" = "portrait";

      for (const artwork of candidates) {
        const fileUrl = artwork.originalFileUrl || artwork.lowResFileUrl;
        if (!fileUrl) continue;
        try {
          if (fileUrl.startsWith("/objects/")) {
            const objStorage = new ObjectStorageService();
            artworkBuffer = await objStorage.downloadFileAsBuffer(fileUrl);
          } else {
            const resp = await fetch(fileUrl);
            if (resp.ok) artworkBuffer = Buffer.from(await resp.arrayBuffer());
          }
          if (artworkBuffer) {
            ratioCategory = aspectRatioToCategory(artwork.aspectRatio);
            orientation = (artwork.widthPx > artwork.heightPx) ? "landscape" : "portrait";
            console.log(`[ProductMedia] Batch regen: using "${artwork.title}" (${ratioCategory}, ${orientation}) for "${productTitle}"`);
            break;
          }
        } catch (err: any) {
          console.warn(`[ProductMedia] Failed to fetch artwork "${artwork.title}": ${err.message}`);
        }
      }

      if (!artworkBuffer) {
        return res.json({ success: false, title: productTitle, error: "No local artwork found" });
      }
      if (!ratioCategory || ratioCategory === "custom") {
        return res.json({ success: false, title: productTitle, error: `Unsupported ratio: ${ratioCategory}` });
      }

      const metadata = await sharp(artworkBuffer).metadata();
      const maxDim = 3000;
      if (metadata.width && metadata.height && (metadata.width > maxDim || metadata.height > maxDim)) {
        const scale = maxDim / Math.max(metadata.width, metadata.height);
        artworkBuffer = await sharp(artworkBuffer)
          .resize(Math.round(metadata.width * scale), Math.round(metadata.height * scale), { fit: "fill" })
          .jpeg({ quality: 95 })
          .toBuffer();
      }

      if (frameMockups.length > 0) {
        const deleteResult = await deleteProductMedia(productGid, frameMockups.map(m => m.id));
        if (!deleteResult.success) {
          console.error(`[ProductMedia] Failed to delete old frame mockups: ${deleteResult.error}`);
          return res.json({ success: false, title: productTitle, error: `Delete failed: ${deleteResult.error}` });
        }
        console.log(`[ProductMedia] Deleted ${frameMockups.length} old frame mockups for "${productTitle}"`);
      }

      const sanitize = (s: string) => s.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
      const frames = ["black", "white", "natural", "unframed"] as const;
      const newMediaIds: string[] = [];

      for (const frame of frames) {
        try {
          const buf = await generateProductMockup(artworkBuffer!, ratioCategory, frame, orientation);
          const frameLabel = frame === "unframed" ? "Unframed" : `${frame.charAt(0).toUpperCase() + frame.slice(1)} Frame`;
          const filename = `${sanitize(productTitle)}_${frame}_Frame.jpg`;
          const altText = `${productTitle} - ${frameLabel} |frame=${frameLabel}|`;

          const uploadResult = await uploadImageToShopifyProduct(buf, filename, productGid, altText);
          if (uploadResult.success && uploadResult.mediaId) {
            newMediaIds.push(uploadResult.mediaId);
          }
        } catch (err: any) {
          console.error(`[ProductMedia] Failed to generate ${frame} for "${productTitle}": ${err.message}`);
        }
      }

      if (newMediaIds.length > 0) {
        const updatedDetails = await fetchProductMediaDetails(productGid);
        const existingIds = updatedDetails.media.map(m => m.id);
        const nonNewIds = existingIds.filter(id => !newMediaIds.includes(id));
        const reordered = [...newMediaIds, ...nonNewIds];
        await reorderProductMedia(productGid, reordered);
      }

      res.json({
        success: newMediaIds.length > 0,
        title: productTitle,
        deleted: frameMockups.length,
        generated: newMediaIds.length,
        error: newMediaIds.length === 0 ? "No mockups were generated" : undefined,
      });
    } catch (error: any) {
      console.error("[ProductMedia] Batch regenerate error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Global error handler - catches unhandled errors
  app.use((err: any, req: any, res: any, next: any) => {
    logError(req.path, req.method, err, {
      requestBody: req.body,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
    
    if (res.headersSent) {
      return next(err);
    }
    
    res.status(500).json({
      error: "Internal server error",
      message: err.message || "An unexpected error occurred",
      type: err.name || "Error",
    });
  });

  // Temporary download endpoint for artist CSV
  app.get("/api/admin/download-artist-csv", requireAuth, (_req, res) => {
    const csvPath = "/tmp/Artist_Collection_Data.csv";
    if (!existsSync(csvPath)) {
      return res.status(404).json({ error: "CSV file not found" });
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=Artist_Collection_Data.csv");
    createReadStream(csvPath).pipe(res);
  });

  // Temporary download endpoint for artist collection photos ZIP
  app.get("/api/admin/download-artist-photos-zip", requireAuth, (_req, res) => {
    const zipPath = "/tmp/Artist_Collection_Photos.zip";
    if (!existsSync(zipPath)) {
      return res.status(404).json({ error: "ZIP file not found" });
    }
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=Artist_Collection_Photos.zip");
    createReadStream(zipPath).pipe(res);
  });

  const httpServer = createServer(app);

  return httpServer;
}
