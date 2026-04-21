import sharp from "sharp";
import fs from "fs";
import path from "path";

// Yield the event loop to allow other requests to be processed
const yieldEventLoop = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

// Cache for static textures (never change, load once)
export const textureCache = new Map<string, { data: string; width: number; height: number }>();

// Cache for parsed hanger GLB data
let cachedHangerData: {
  meshes: Array<{
    positions: number[];
    normals: number[];
    uvs: number[];
    indices: number[];
    material: { baseColor: [number, number, number, number]; metallic: number; roughness: number };
  }>;
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
} | null = null;

// Load and parse the frame hanger GLB file
async function loadHangerGLB(): Promise<typeof cachedHangerData> {
  if (cachedHangerData) return cachedHangerData;
  
  try {
    const glbPath = path.join(process.cwd(), "server/assets/frame_hanger.glb");
    if (!fs.existsSync(glbPath)) {
      console.warn("[AR] Frame hanger GLB not found");
      return null;
    }
    
    const buffer = fs.readFileSync(glbPath);
    
    // Parse GLB header
    const magic = buffer.readUInt32LE(0);
    if (magic !== 0x46546C67) { // 'glTF'
      console.error("[AR] Invalid GLB magic number");
      return null;
    }
    
    // Read chunks
    let offset = 12;
    let jsonChunk: any = null;
    let binBuffer: Buffer | null = null;
    
    while (offset < buffer.length) {
      const chunkLength = buffer.readUInt32LE(offset);
      const chunkType = buffer.readUInt32LE(offset + 4);
      
      if (chunkType === 0x4E4F534A) { // 'JSON'
        const jsonStr = buffer.slice(offset + 8, offset + 8 + chunkLength).toString("utf-8");
        jsonChunk = JSON.parse(jsonStr);
      } else if (chunkType === 0x004E4942) { // 'BIN'
        binBuffer = buffer.slice(offset + 8, offset + 8 + chunkLength);
      }
      
      offset += 8 + chunkLength;
    }
    
    if (!jsonChunk || !binBuffer) {
      console.error("[AR] Failed to parse GLB chunks");
      return null;
    }
    
    // Check for node transforms that need to be applied
    // We only apply SCALE from the GLB node - rotation is handled by our placement logic
    let nodeScale: [number, number, number] = [1, 1, 1];
    const nodeRotation: [number, number, number, number] = [0, 0, 0, 1]; // Identity - don't apply GLB rotation
    
    if (jsonChunk.nodes && jsonChunk.nodes.length > 0) {
      const node = jsonChunk.nodes[0];
      if (node.scale) {
        nodeScale = node.scale;
        console.log(`[AR] Hanger node scale: [${nodeScale.join(', ')}]`);
      }
      if (node.rotation) {
        // Log but don't use - our placement logic handles rotation
        console.log(`[AR] Hanger node rotation (ignored): [${node.rotation.join(', ')}]`);
      }
    }
    
    // Helper to apply quaternion rotation to a point
    const applyQuaternionRotation = (x: number, y: number, z: number, q: [number, number, number, number]): [number, number, number] => {
      const [qx, qy, qz, qw] = q;
      // v' = q * v * q^(-1)
      const ix = qw * x + qy * z - qz * y;
      const iy = qw * y + qz * x - qx * z;
      const iz = qw * z + qx * y - qy * x;
      const iw = -qx * x - qy * y - qz * z;
      return [
        ix * qw + iw * -qx + iy * -qz - iz * -qy,
        iy * qw + iw * -qy + iz * -qx - ix * -qz,
        iz * qw + iw * -qz + ix * -qy - iy * -qx,
      ];
    };
    
    // Extract mesh data
    const meshes: typeof cachedHangerData["meshes"] = [];
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    for (const mesh of jsonChunk.meshes || []) {
      for (const primitive of mesh.primitives || []) {
        const posAccessor = jsonChunk.accessors[primitive.attributes.POSITION];
        const normAccessor = primitive.attributes.NORMAL !== undefined 
          ? jsonChunk.accessors[primitive.attributes.NORMAL] : null;
        const uvAccessor = primitive.attributes.TEXCOORD_0 !== undefined 
          ? jsonChunk.accessors[primitive.attributes.TEXCOORD_0] : null;
        const idxAccessor = primitive.indices !== undefined 
          ? jsonChunk.accessors[primitive.indices] : null;
        
        // Get buffer view for positions
        const posView = jsonChunk.bufferViews[posAccessor.bufferView];
        const posData = new Float32Array(
          binBuffer.buffer, 
          binBuffer.byteOffset + posView.byteOffset + (posAccessor.byteOffset || 0),
          posAccessor.count * 3
        );
        
        // Apply node transforms to positions and calculate bounds
        const transformedPositions: number[] = [];
        for (let i = 0; i < posData.length; i += 3) {
          // Apply scale first
          let x = posData[i] * nodeScale[0];
          let y = posData[i + 1] * nodeScale[1];
          let z = posData[i + 2] * nodeScale[2];
          
          // Apply rotation
          const [rx, ry, rz] = applyQuaternionRotation(x, y, z, nodeRotation);
          x = rx; y = ry; z = rz;
          
          transformedPositions.push(x, y, z);
          
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          minZ = Math.min(minZ, z);
          maxZ = Math.max(maxZ, z);
        }
        
        // Get normals and apply rotation transform
        let normals: number[] = [];
        if (normAccessor) {
          const normView = jsonChunk.bufferViews[normAccessor.bufferView];
          const normData = new Float32Array(
            binBuffer.buffer,
            binBuffer.byteOffset + normView.byteOffset + (normAccessor.byteOffset || 0),
            normAccessor.count * 3
          );
          // Apply rotation to normals (scale doesn't affect normals direction)
          for (let i = 0; i < normData.length; i += 3) {
            const [rx, ry, rz] = applyQuaternionRotation(normData[i], normData[i + 1], normData[i + 2], nodeRotation);
            normals.push(rx, ry, rz);
          }
        } else {
          // Generate flat normals
          normals = new Array(transformedPositions.length).fill(0);
          for (let i = 2; i < normals.length; i += 3) normals[i] = -1;
        }
        
        // Get UVs
        let uvs: number[] = [];
        if (uvAccessor) {
          const uvView = jsonChunk.bufferViews[uvAccessor.bufferView];
          const uvData = new Float32Array(
            binBuffer.buffer,
            binBuffer.byteOffset + uvView.byteOffset + (uvAccessor.byteOffset || 0),
            uvAccessor.count * 2
          );
          uvs = Array.from(uvData);
        } else {
          uvs = new Array((posData.length / 3) * 2).fill(0);
        }
        
        // Get indices
        let indices: number[] = [];
        if (idxAccessor) {
          const idxView = jsonChunk.bufferViews[idxAccessor.bufferView];
          const componentType = idxAccessor.componentType;
          
          if (componentType === 5123) { // UNSIGNED_SHORT
            const idxData = new Uint16Array(
              binBuffer.buffer,
              binBuffer.byteOffset + idxView.byteOffset + (idxAccessor.byteOffset || 0),
              idxAccessor.count
            );
            indices = Array.from(idxData);
          } else if (componentType === 5125) { // UNSIGNED_INT
            const idxData = new Uint32Array(
              binBuffer.buffer,
              binBuffer.byteOffset + idxView.byteOffset + (idxAccessor.byteOffset || 0),
              idxAccessor.count
            );
            indices = Array.from(idxData);
          }
        }
        
        // Get material properties
        let material = { baseColor: [0.1, 0.1, 0.1, 1.0] as [number, number, number, number], metallic: 0.9, roughness: 0.3 };
        if (primitive.material !== undefined && jsonChunk.materials?.[primitive.material]) {
          const mat = jsonChunk.materials[primitive.material];
          const pbr = mat.pbrMetallicRoughness || {};
          material = {
            baseColor: (pbr.baseColorFactor || [0.1, 0.1, 0.1, 1.0]) as [number, number, number, number],
            metallic: pbr.metallicFactor ?? 0.9,
            roughness: pbr.roughnessFactor ?? 0.3,
          };
        }
        
        meshes.push({
          positions: transformedPositions,
          normals,
          uvs,
          indices,
          material,
        });
      }
    }
    
    cachedHangerData = {
      meshes,
      bounds: { minX, maxX, minY, maxY, minZ, maxZ },
    };
    
    console.log(`[AR] Loaded hanger: ${meshes.length} meshes, bounds: ${(maxX - minX).toFixed(3)}m x ${(maxY - minY).toFixed(3)}m x ${(maxZ - minZ).toFixed(3)}m`);
    
    return cachedHangerData;
  } catch (error) {
    console.error("[AR] Failed to load hanger GLB:", error);
    return null;
  }
}

// Frame types: standard (traditional), box (deep, float-mounted), or canvas (stretched canvas in tray frame)
export type FrameType = "standard" | "box" | "canvas";

/**
 * Calculate mount border width based on frame size.
 * Mount rules:
 * - Frames 10x10" or below: 1" (25mm) mount
 * - Frames 11x14" or below: 1.5" (40mm) mount
 * - Frames 12x16" and above: 2" (50mm) mount
 * 
 * Note: When a mount is selected, the FRAME size stays the same,
 * but the visible ARTWORK area is reduced by the mount border on all sides.
 */
export function calculateMountBorderMm(frameWidthMm: number, frameHeightMm: number): number {
  // Convert mm to inches for comparison (25.4mm per inch)
  const frameWidthIn = frameWidthMm / 25.4;
  const frameHeightIn = frameHeightMm / 25.4;
  
  // Use the larger dimension for categorization
  const maxDimIn = Math.max(frameWidthIn, frameHeightIn);
  const minDimIn = Math.min(frameWidthIn, frameHeightIn);
  
  // Frames 10x10" or below (both dimensions <= 10")
  if (maxDimIn <= 10 && minDimIn <= 10) {
    return 25; // 1" = 25mm
  }
  
  // Frames 11x14" or below (fits within 11x14" bounding box)
  if (maxDimIn <= 14 && minDimIn <= 11) {
    return 40; // 1.5" = ~40mm (38.1mm rounded)
  }
  
  // Frames 12x16" and above
  return 50; // 2" = ~50mm (50.8mm rounded)
}

export interface FrameConfig {
  artworkWidthMm: number;     // Frame inner opening width (product size) - frame stays this size
  artworkHeightMm: number;    // Frame inner opening height (product size) - frame stays this size
  frameWidthMm?: number;      // Face width (default: 20mm standard, 35mm box)
  frameDepthMm?: number;      // Depth from wall (default: 22mm standard, 45mm box)
  rebateWidthMm?: number;     // Rebate width - inner lip (default: 5mm)
  rebateDepthMm?: number;     // Rebate depth (default: 17mm standard, 40mm box)
  mountBorderMm: number;      // Mount border width. Frame stays same, artwork shrinks. 0 = no mount
  frameStyle: "black" | "white" | "oak" | "natural" | "ash";
  frameType?: FrameType;      // standard or box frame (default: standard)
  artworkImageUrl?: string;
  skipHanger?: boolean;       // Skip adding the hanger (for positioning tool)
  // Hanger positioning overrides (for testing/positioning tool)
  hangerRotX?: number;        // X rotation in degrees
  hangerRotY?: number;        // Y rotation in degrees
  hangerRotZ?: number;        // Z rotation in degrees
  hangerPosX?: number;        // X position offset in mm
  hangerPosY?: number;        // Y position offset in mm
  hangerPosZ?: number;        // Z position offset in mm
  // Build level for incremental testing (default: 6 = full frame)
  // 1: Outer frame shell only
  // 2: + artwork plane
  // 3: + mount (if applicable)
  // 4: + rebate walls
  // 5: + backing (MDF)
  // 6: + all details (tape, hanger, logo, rebate caps)
  buildLevel?: number;
}

// Box frame defaults - based on actual cross-section dimensions
const BOX_FRAME_DEFAULTS = {
  frameWidthMm: 20,     // Face width (visible from front)
  frameDepthMm: 33,     // Total depth from wall
  rebateWidthMm: 8,     // Inner lip width (rebate)
  rebateDepthMm: 30,    // Rebate depth (where artwork sits)
  floatGapMm: 0,        // No float gap needed with this profile
};

const CANVAS_FRAME_DEFAULTS = {
  frameWidthMm: 12,     // Narrow tray frame face width (matches 2D mockup CANVAS_FRAME_WIDTH_MM)
  frameDepthMm: 35,     // Canvas stretcher depth from wall
  rebateWidthMm: 0,     // No rebate — canvas edge sits flush
  rebateDepthMm: 30,    // Depth where canvas sits inside the tray
  gapMm: 5,             // Gap between frame inner edge and canvas (matches CANVAS_GAP_MM)
};

const ALLOWED_HOSTS = [
  "storage.googleapis.com",
  "storage.cloud.google.com",
  "replitusercontent.com",
  "dropbox.com",
  "dropboxusercontent.com",
  "dl.dropboxusercontent.com",
  "eastsidestudiolondon.co.uk",
  "upload.eastsidestudiolondon.co.uk",
  "cdn.shopify.com",
  "shopify.com",
  "replit.dev",
  "replit.app",
  "localhost",
];

const FRAME_COLORS: Record<string, [number, number, number, number]> = {
  black: [0.02, 0.02, 0.02, 1.0],  // True black
  white: [0.94, 0.94, 0.93, 1.0],  // Slightly off-white for better visibility
  oak: [0.77, 0.66, 0.48, 1.0],
  natural: [0.87, 0.72, 0.53, 1.0],
  ash: [0.45, 0.38, 0.32, 1.0],    // Hand-stained ash - rich dark brown
};

// Material properties for satin finish (soft reflections)
const FRAME_MATERIALS: Record<string, { metallic: number; roughness: number }> = {
  black: { metallic: 0.0, roughness: 0.35 },   // Satin black - soft sheen
  white: { metallic: 0.0, roughness: 0.4 },    // Satin white - subtle reflections
  oak: { metallic: 0.0, roughness: 0.65 },     // Wood - more matte
  natural: { metallic: 0.0, roughness: 0.6 },  // Wood - slightly glossy
  ash: { metallic: 0.0, roughness: 0.85 },     // Natural ash - matte wood finish
};

// Load MDF texture from file for frame backing (cached)
async function loadMDFTexture(): Promise<{ data: string; width: number; height: number } | null> {
  const cacheKey = 'mdf-texture';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;
  
  try {
    const texturePath = path.join(process.cwd(), "server/assets/mdf-texture.jpg");
    if (!fs.existsSync(texturePath)) {
      console.warn("MDF texture not found at:", texturePath);
      return null;
    }
    
    const buffer = fs.readFileSync(texturePath);
    const resized = await sharp(buffer)
      .resize(512, 512, { fit: "cover" })
      .flip()  // Flip for GLTF UV coordinates
      .jpeg({ quality: 85 })
      .toBuffer();
    
    const result = { data: resized.toString("base64"), width: 512, height: 512 };
    textureCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Failed to load MDF texture:", error);
    return null;
  }
}

// Load MDF normal map for surface detail (cached)
async function loadMDFNormalMap(): Promise<{ data: string; width: number; height: number } | null> {
  const cacheKey = 'mdf-normal';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;
  
  try {
    const texturePath = path.join(process.cwd(), "server/assets/mdf-normal.png");
    if (!fs.existsSync(texturePath)) {
      console.log("[AR] No normal map found for MDF backing");
      return null;
    }
    
    const buffer = fs.readFileSync(texturePath);
    const resized = await sharp(buffer)
      .resize(512, 512, { fit: "cover" })
      .flip()  // Flip for GLTF UV coordinates
      .png()
      .toBuffer();
    
    const result = { data: resized.toString("base64"), width: 512, height: 512 };
    textureCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Failed to load MDF normal map:", error);
    return null;
  }
}

// Load MDF roughness map for surface variation (cached)
async function loadMDFRoughnessMap(): Promise<{ data: string; width: number; height: number } | null> {
  const cacheKey = 'mdf-roughness';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;
  
  try {
    const texturePath = path.join(process.cwd(), "server/assets/mdf-roughness.jpg");
    if (!fs.existsSync(texturePath)) {
      console.log("[AR] No roughness map found for MDF backing");
      return null;
    }
    
    const buffer = fs.readFileSync(texturePath);
    const resized = await sharp(buffer)
      .resize(512, 512, { fit: "cover" })
      .flip()  // Flip for GLTF UV coordinates
      .jpeg({ quality: 90 })
      .toBuffer();
    
    const result = { data: resized.toString("base64"), width: 512, height: 512 };
    textureCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Failed to load MDF roughness map:", error);
    return null;
  }
}

// Load rectangular sticker texture from file for branding on backing
async function loadLogoTexture(): Promise<{ data: string; width: number; height: number; physicalWidth: number; physicalHeight: number } | null> {
  try {
    const texturePath = path.join(process.cwd(), "server/assets/east_side_studio_sticker.jpg");
    if (!fs.existsSync(texturePath)) {
      console.warn("Sticker texture not found at:", texturePath);
      return null;
    }
    
    const buffer = fs.readFileSync(texturePath);
    const metadata = await sharp(buffer).metadata();
    
    // Keep original aspect ratio, resize for texture
    // Flop horizontally (mirror) so it reads correctly from the back of the frame
    const resized = await sharp(buffer)
      .resize(512, 256, { fit: "inside", withoutEnlargement: true })
      .flop()  // Mirror horizontally for back-facing view
      .flip()  // Flip vertically for GLTF UV coordinates
      .jpeg({ quality: 90 })
      .toBuffer();
    
    const resizedMeta = await sharp(resized).metadata();
    
    // Fixed physical size: 80mm wide sticker (same for all frames)
    // Calculate height from aspect ratio
    const aspect = (resizedMeta.width || 512) / (resizedMeta.height || 256);
    const physicalWidth = 0.080; // 80mm in meters
    const physicalHeight = physicalWidth / aspect;
    
    return {
      data: resized.toString("base64"),
      width: resizedMeta.width || 512,
      height: resizedMeta.height || 256,
      physicalWidth,
      physicalHeight,
    };
  } catch (error) {
    console.error("Failed to load sticker texture:", error);
    return null;
  }
}

// Load kraft tape texture for protective tape on frame backs
async function loadKraftTapeTexture(): Promise<{ data: string; width: number; height: number } | null> {
  try {
    const texturePath = path.join(process.cwd(), "server/assets/kraft_tape_texture.jpg");
    if (!fs.existsSync(texturePath)) {
      console.warn("Kraft tape texture not found at:", texturePath);
      return null;
    }
    
    const buffer = fs.readFileSync(texturePath);
    const metadata = await sharp(buffer).metadata();
    console.log(`[AR] Loading kraft tape texture: ${metadata.width}x${metadata.height}`);
    
    // Resize to reasonable dimensions
    const resized = await sharp(buffer)
      .resize(256, 512, { fit: "fill" })
      .flip() // Vertical flip for GLTF UV origin
      .jpeg({ quality: 85 })
      .toBuffer();
    
    return {
      data: resized.toString("base64"),
      width: 256,
      height: 512,
    };
  } catch (error) {
    console.error("Failed to load kraft tape texture:", error);
    return null;
  }
}

// Load box frame texture for premium box frames (black, white, or ash)
async function loadBoxFrameTexture(color: "black" | "white" | "ash"): Promise<{ data: string; width: number; height: number } | null> {
  try {
    // First try the new texture format, then fall back to legacy
    let texturePath = path.join(process.cwd(), `server/assets/box_frame_${color}_texture.jpg`);
    if (!fs.existsSync(texturePath)) {
      texturePath = path.join(process.cwd(), `server/assets/${color}-box-frame-texture.jpg`);
    }
    if (!fs.existsSync(texturePath)) {
      console.warn(`${color} box frame texture not found`);
      return null;
    }
    
    const buffer = fs.readFileSync(texturePath);
    const metadata = await sharp(buffer).metadata();
    console.log(`[AR] Loading ${color} box frame texture: ${metadata.width}x${metadata.height}`);
    
    // Resize to reasonable dimensions while preserving aspect ratio
    const maxWidth = 2048;
    const targetWidth = Math.min(metadata.width || 2048, maxWidth);
    const aspectRatio = (metadata.height || 100) / (metadata.width || 8000);
    const targetHeight = Math.max(Math.round(targetWidth * aspectRatio), 32);
    
    let pipeline = sharp(buffer)
      .resize(targetWidth, targetHeight, { fit: "fill" })
      .flip(); // Vertical flip for GLTF UV origin
    
    // Brighten white box frame texture
    if (color === "white") {
      pipeline = pipeline.modulate({ brightness: 1.3 });
    }
    
    const resized = await pipeline
      .jpeg({ quality: 85 })
      .toBuffer();
    
    const finalMeta = await sharp(resized).metadata();
    console.log(`[AR] Resized ${color} box frame texture: ${finalMeta.width}x${finalMeta.height}`);
    
    return {
      data: resized.toString("base64"),
      width: finalMeta.width || targetWidth,
      height: finalMeta.height || targetHeight,
    };
  } catch (error) {
    console.error(`Failed to load ${color} box frame texture:`, error);
    return null;
  }
}

// Load normal map for box frames (adds surface detail without geometry)
async function loadBoxFrameNormalMap(color: "black" | "white" | "ash"): Promise<{ data: string; width: number; height: number } | null> {
  try {
    const texturePath = path.join(process.cwd(), `server/assets/box_frame_${color}_normal.png`);
    if (!fs.existsSync(texturePath)) {
      console.log(`[AR] No normal map found for ${color} box frame`);
      return null;
    }
    
    const buffer = fs.readFileSync(texturePath);
    const metadata = await sharp(buffer).metadata();
    console.log(`[AR] Loading ${color} box frame normal map: ${metadata.width}x${metadata.height}`);
    
    // Resize to match base texture dimensions
    const maxWidth = 2048;
    const targetWidth = Math.min(metadata.width || 2048, maxWidth);
    const aspectRatio = (metadata.height || 100) / (metadata.width || 8000);
    const targetHeight = Math.max(Math.round(targetWidth * aspectRatio), 32);
    
    const resized = await sharp(buffer)
      .resize(targetWidth, targetHeight, { fit: "fill" })
      .flip() // Vertical flip for GLTF UV origin
      .png() // Keep as PNG for normal maps (no compression artifacts)
      .toBuffer();
    
    const finalMeta = await sharp(resized).metadata();
    console.log(`[AR] Resized ${color} box frame normal map: ${finalMeta.width}x${finalMeta.height}`);
    
    return {
      data: resized.toString("base64"),
      width: finalMeta.width || targetWidth,
      height: finalMeta.height || targetHeight,
    };
  } catch (error) {
    console.error(`Failed to load ${color} box frame normal map:`, error);
    return null;
  }
}

// Load roughness map for box frames (varies shininess across wood grain)
async function loadBoxFrameRoughnessMap(color: "black" | "white" | "ash"): Promise<{ data: string; width: number; height: number } | null> {
  try {
    const texturePath = path.join(process.cwd(), `server/assets/box_frame_${color}_roughness.jpg`);
    if (!fs.existsSync(texturePath)) {
      console.log(`[AR] No roughness map found for ${color} box frame`);
      return null;
    }
    
    const buffer = fs.readFileSync(texturePath);
    const metadata = await sharp(buffer).metadata();
    console.log(`[AR] Loading ${color} box frame roughness map: ${metadata.width}x${metadata.height}`);
    
    // Resize to match base texture dimensions
    const maxWidth = 2048;
    const targetWidth = Math.min(metadata.width || 2048, maxWidth);
    const aspectRatio = (metadata.height || 100) / (metadata.width || 8000);
    const targetHeight = Math.max(Math.round(targetWidth * aspectRatio), 32);
    
    const resized = await sharp(buffer)
      .resize(targetWidth, targetHeight, { fit: "fill" })
      .flip() // Vertical flip for GLTF UV origin
      .jpeg({ quality: 90 })
      .toBuffer();
    
    const finalMeta = await sharp(resized).metadata();
    console.log(`[AR] Resized ${color} box frame roughness map: ${finalMeta.width}x${finalMeta.height}`);
    
    return {
      data: resized.toString("base64"),
      width: finalMeta.width || targetWidth,
      height: finalMeta.height || targetHeight,
    };
  } catch (error) {
    console.error(`Failed to load ${color} box frame roughness map:`, error);
    return null;
  }
}

// Load real wood texture from file for oak/natural frames
// IMPORTANT: Preserves original aspect ratio - texture is 8192×173 (47:1 ratio)
// with grain running horizontally along the width (U axis)
async function loadWoodTexture(style: "oak" | "natural"): Promise<{ data: string; width: number; height: number } | null> {
  try {
    const texturePath = path.join(process.cwd(), "server/assets/Oak_Veneered_MDF_Final_Texture.jpg");
    if (!fs.existsSync(texturePath)) {
      // Fallback to legacy texture name
      const legacyPath = path.join(process.cwd(), "server/assets/oak-texture.jpg");
      if (!fs.existsSync(legacyPath)) {
        console.warn("Wood texture not found at:", texturePath);
        return null;
      }
    }
    
    const actualPath = fs.existsSync(path.join(process.cwd(), "server/assets/Oak_Veneered_MDF_Final_Texture.jpg"))
      ? path.join(process.cwd(), "server/assets/Oak_Veneered_MDF_Final_Texture.jpg")
      : path.join(process.cwd(), "server/assets/oak-texture.jpg");
    
    const buffer = fs.readFileSync(actualPath);
    const metadata = await sharp(buffer).metadata();
    console.log(`[AR] Loading wood texture: ${metadata.width}x${metadata.height}`);
    
    // Preserve aspect ratio! Original is 8192×173 with horizontal grain.
    // Resize to max 2048 width while keeping proportions.
    // Use "inside" to prevent upscaling and maintain aspect ratio.
    const maxWidth = 2048;
    const targetWidth = Math.min(metadata.width || 2048, maxWidth);
    const aspectRatio = (metadata.height || 173) / (metadata.width || 8192);
    const targetHeight = Math.max(Math.round(targetWidth * aspectRatio), 32); // Min 32px height
    
    let pipeline = sharp(buffer)
      .resize(targetWidth, targetHeight, { fit: "fill" }) // fill to exact dimensions preserving ratio
      .flip(); // Vertical flip for GLTF UV origin
    
    if (style === "natural") {
      pipeline = pipeline.modulate({ brightness: 1.1 });
    }
    
    const resized = await pipeline.jpeg({ quality: 85 }).toBuffer();
    const finalMeta = await sharp(resized).metadata();
    console.log(`[AR] Resized wood texture: ${finalMeta.width}x${finalMeta.height}`);
    
    return {
      data: resized.toString("base64"),
      width: finalMeta.width || targetWidth,
      height: finalMeta.height || targetHeight,
    };
  } catch (error) {
    console.error("Failed to load wood texture:", error);
    return null;
  }
}

// Load normal map for oak/natural frames
async function loadWoodNormalMap(): Promise<{ data: string; width: number; height: number } | null> {
  try {
    const texturePath = path.join(process.cwd(), "server/assets/oak_normal.png");
    if (!fs.existsSync(texturePath)) {
      console.log("[AR] No normal map found for oak frame");
      return null;
    }
    
    const buffer = fs.readFileSync(texturePath);
    const metadata = await sharp(buffer).metadata();
    console.log(`[AR] Loading oak normal map: ${metadata.width}x${metadata.height}`);
    
    // Match dimensions with wood texture
    const maxWidth = 2048;
    const targetWidth = Math.min(metadata.width || 2048, maxWidth);
    const aspectRatio = (metadata.height || 100) / (metadata.width || 5000);
    const targetHeight = Math.max(Math.round(targetWidth * aspectRatio), 32);
    
    const resized = await sharp(buffer)
      .resize(targetWidth, targetHeight, { fit: "fill" })
      .flip() // Vertical flip for GLTF UV origin
      .png()
      .toBuffer();
    
    const finalMeta = await sharp(resized).metadata();
    console.log(`[AR] Resized oak normal map: ${finalMeta.width}x${finalMeta.height}`);
    
    return {
      data: resized.toString("base64"),
      width: finalMeta.width || targetWidth,
      height: finalMeta.height || targetHeight,
    };
  } catch (error) {
    console.error("Failed to load oak normal map:", error);
    return null;
  }
}

async function loadImageAsBase64(url: string): Promise<{ data: string; width: number; height: number } | null> {
  try {
    console.log(`[AR Texture] Fetching image from: ${url}`);
    const parsedUrl = new URL(url);
    const isAllowed = ALLOWED_HOSTS.some(host => parsedUrl.hostname.endsWith(host));
    if (!isAllowed) {
      console.warn("Texture URL not from allowed host:", parsedUrl.hostname);
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: { "Accept": "image/*" }
    });
    clearTimeout(timeout);
    
    if (!response.ok) {
      console.warn(`[AR Texture] Failed to fetch: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const contentType = response.headers.get("content-type");
    console.log(`[AR Texture] Response content-type: ${contentType}`);
    
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) {
      console.warn("Texture file too large:", contentLength);
      return null;
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Log incoming image details
    const inputMeta = await sharp(buffer).metadata();
    console.log(`[AR Texture] Input: ${inputMeta.width}x${inputMeta.height}, format: ${inputMeta.format}, size: ${(buffer.length / 1024).toFixed(1)}KB`);
    
    // For graphic artwork with sharp edges (like "YES!"), avoid any resampling artifacts
    // Keep original dimensions if <= 4096, otherwise resize with nearest-neighbor
    const inputWidth = inputMeta.width || 1024;
    const inputHeight = inputMeta.height || 1024;
    const maxDim = 4096;
    
    let pipeline = sharp(buffer);
    
    // Only resize if image exceeds max dimensions
    if (inputWidth > maxDim || inputHeight > maxDim) {
      // Use nearest-neighbor to preserve hard edges in graphic artwork
      console.log(`[AR Texture] Resizing from ${inputWidth}x${inputHeight} to fit ${maxDim}x${maxDim}`);
      pipeline = pipeline.resize(maxDim, maxDim, { 
        fit: "inside",
        withoutEnlargement: true,
        kernel: 'nearest'  // Preserve hard edges for graphic artwork
      });
    } else {
      console.log(`[AR Texture] Keeping original dimensions: ${inputWidth}x${inputHeight}`);
    }
    
    const resized = await pipeline
      .flip()  // Vertical flip for GLTF UV coordinates
      .jpeg({ quality: 92 })  // High-quality JPEG - 90% smaller than PNG
      .toBuffer();
    
    const metadata = await sharp(resized).metadata();
    console.log(`[AR Texture] Output: ${metadata.width}x${metadata.height}, format: jpeg, size: ${(resized.length / 1024).toFixed(1)}KB`);
    
    return {
      data: resized.toString("base64"),
      width: metadata.width || 512,
      height: metadata.height || 512,
    };
  } catch (error) {
    console.error("Failed to load texture:", error);
    return null;
  }
}

// Mount constants
const MOUNT_THICKNESS = 0.0024; // 2.4mm thick mount board
const MOUNT_CHAMFER = 0.0024;   // 2.4mm chamfer width (45-degree angle)

/**
 * Ensures vertices are in CCW order when viewed from the normal direction.
 * This is critical for Apple AR Quick Look which strictly enforces backface culling.
 * 
 * Algorithm:
 * 1. Calculate the winding of the input vertices using cross product
 * 2. Compare with the intended normal direction
 * 3. If they disagree, reverse the vertex order
 * 
 * @param vertices Array of 4 vertices [p0, p1, p2, p3] forming a quad
 * @param normal The intended outward-facing normal [nx, ny, nz]
 * @returns Vertices reordered to be CCW when viewed from normal direction
 */
function ensureCCWWinding(
  vertices: [number[], number[], number[], number[]],
  normal: [number, number, number]
): [number[], number[], number[], number[]] {
  const [p0, p1, p2, p3] = vertices;
  
  // Calculate two edge vectors from p0
  const edge1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const edge2 = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];
  
  // Cross product gives the face normal based on current winding
  const crossProduct = [
    edge1[1] * edge2[2] - edge1[2] * edge2[1],
    edge1[2] * edge2[0] - edge1[0] * edge2[2],
    edge1[0] * edge2[1] - edge1[1] * edge2[0]
  ];
  
  // Dot product with intended normal - if negative, winding is backwards
  const dot = crossProduct[0] * normal[0] + crossProduct[1] * normal[1] + crossProduct[2] * normal[2];
  
  if (dot < 0) {
    // Reverse winding: swap p1 and p3
    return [p0, p3, p2, p1];
  }
  
  return vertices;
}

/**
 * Creates a quad with guaranteed correct CCW winding for the given normal.
 * Pass vertices in any reasonable order - the function will fix the winding automatically.
 */
function createCCWQuad(
  p0: number[], p1: number[], p2: number[], p3: number[],
  nx: number, ny: number, nz: number,
  addQuadFn: (p0: number[], p1: number[], p2: number[], p3: number[], nx: number, ny: number, nz: number) => void
): void {
  const corrected = ensureCCWWinding([p0, p1, p2, p3], [nx, ny, nz]);
  addQuadFn(corrected[0], corrected[1], corrected[2], corrected[3], nx, ny, nz);
}

/**
 * VERIFIED SOLID WALL BUILDER
 * Creates a rectangular solid wall at specified position with guaranteed CCW winding on all 6 faces.
 * This is the ONLY function that should be used for creating frame walls to ensure Apple AR Quick Look compatibility.
 * 
 * Each face is created with explicit CCW winding verification.
 * 
 * @param minX Left edge X
 * @param maxX Right edge X
 * @param minY Bottom edge Y
 * @param maxY Top edge Y
 * @param minZ Back edge Z (negative, into frame)
 * @param maxZ Front edge Z (positive, toward viewer)
 * @returns Geometry with guaranteed CCW winding on all faces
 */
function createVerifiedSolidWall(
  minX: number, maxX: number,
  minY: number, maxY: number,
  minZ: number, maxZ: number
): { positions: number[]; normals: number[]; uvs: number[]; indices: number[] } {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  
  /**
   * Add a quad with verified CCW winding.
   * Vertices MUST be provided in CCW order when viewed from the normal direction.
   * This function verifies the winding and logs an error if incorrect.
   */
  const addVerifiedQuad = (
    v0: [number, number, number],
    v1: [number, number, number],
    v2: [number, number, number],
    v3: [number, number, number],
    normal: [number, number, number]
  ) => {
    // Verify CCW winding by checking cross product against normal
    const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const edge2 = [v3[0] - v0[0], v3[1] - v0[1], v3[2] - v0[2]];
    const cross = [
      edge1[1] * edge2[2] - edge1[2] * edge2[1],
      edge1[2] * edge2[0] - edge1[0] * edge2[2],
      edge1[0] * edge2[1] - edge1[1] * edge2[0]
    ];
    const dot = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2];
    
    // Use corrected vertices if needed
    let finalVerts = [v0, v1, v2, v3];
    if (dot < 0) {
      // Swap v1 and v3 to fix winding
      finalVerts = [v0, v3, v2, v1];
    }
    
    const base = positions.length / 3;
    finalVerts.forEach(v => positions.push(...v));
    for (let i = 0; i < 4; i++) normals.push(...normal);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    // Two triangles: (0,1,2) and (0,2,3)
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  
  // Define all 8 corners of the box
  const corners = {
    // Front face (maxZ)
    frontBottomLeft:  [minX, minY, maxZ] as [number, number, number],
    frontBottomRight: [maxX, minY, maxZ] as [number, number, number],
    frontTopRight:    [maxX, maxY, maxZ] as [number, number, number],
    frontTopLeft:     [minX, maxY, maxZ] as [number, number, number],
    // Back face (minZ)
    backBottomLeft:   [minX, minY, minZ] as [number, number, number],
    backBottomRight:  [maxX, minY, minZ] as [number, number, number],
    backTopRight:     [maxX, maxY, minZ] as [number, number, number],
    backTopLeft:      [minX, maxY, minZ] as [number, number, number],
  };
  
  // FRONT FACE (+Z normal): CCW when viewed from +Z direction
  // Standing at +Z looking at face: bottom-left → bottom-right → top-right → top-left
  addVerifiedQuad(
    corners.frontBottomLeft, corners.frontBottomRight, 
    corners.frontTopRight, corners.frontTopLeft,
    [0, 0, 1]
  );
  
  // BACK FACE (-Z normal): CCW when viewed from -Z direction  
  // Standing at -Z looking at face: bottom-right → bottom-left → top-left → top-right
  addVerifiedQuad(
    corners.backBottomRight, corners.backBottomLeft,
    corners.backTopLeft, corners.backTopRight,
    [0, 0, -1]
  );
  
  // TOP FACE (+Y normal): CCW when viewed from +Y direction
  // Standing above looking down: front-left → back-left → back-right → front-right
  addVerifiedQuad(
    corners.frontTopLeft, corners.backTopLeft,
    corners.backTopRight, corners.frontTopRight,
    [0, 1, 0]
  );
  
  // BOTTOM FACE (-Y normal): CCW when viewed from -Y direction
  // Standing below looking up: front-right → back-right → back-left → front-left
  addVerifiedQuad(
    corners.frontBottomRight, corners.backBottomRight,
    corners.backBottomLeft, corners.frontBottomLeft,
    [0, -1, 0]
  );
  
  // RIGHT FACE (+X normal): CCW when viewed from +X direction
  // Standing at +X looking at face: front-bottom → back-bottom → back-top → front-top
  addVerifiedQuad(
    corners.frontBottomRight, corners.backBottomRight,
    corners.backTopRight, corners.frontTopRight,
    [1, 0, 0]
  );
  
  // LEFT FACE (-X normal): CCW when viewed from -X direction
  // Standing at -X looking at face: back-bottom → front-bottom → front-top → back-top
  addVerifiedQuad(
    corners.backBottomLeft, corners.frontBottomLeft,
    corners.frontTopLeft, corners.backTopLeft,
    [-1, 0, 0]
  );
  
  return { positions, normals, uvs, indices };
}

/**
 * Creates a solid rebate wall for one side of the frame using verified geometry.
 * This replaces the separate front/back facing walls with a single solid wall
 * that's guaranteed to work in Apple AR Quick Look.
 * 
 * @param side Which side of the frame
 * @param outerLength The full outer dimension (width for top/bottom, height for left/right)
 * @param faceW Frame face width
 * @param depth Total depth of the rebate wall
 * @param frontZ Where the front of the wall starts (Z position)
 * @param wallThickness How thick the wall is (small value for thin wall)
 */
function createVerifiedRebateWall(
  side: 'top' | 'bottom' | 'left' | 'right',
  outerLength: number,
  faceW: number,
  depth: number,
  frontZ: number = 0,
  wallThickness: number = 0.001 // 1mm thick wall
): { positions: number[]; normals: number[]; uvs: number[]; indices: number[] } {
  const halfOuter = outerLength / 2;
  const halfInner = halfOuter - faceW;
  const fw = faceW;
  
  // Calculate wall bounds based on side
  let minX: number, maxX: number, minY: number, maxY: number;
  
  if (side === 'top') {
    // Top rebate: horizontal surface at top inner edge
    // Wall runs along X from -halfInner to +halfInner
    // Wall is thin in Y direction (at y = -fw/2 which is the inner edge)
    minX = -halfInner;
    maxX = halfInner;
    minY = -fw / 2 - wallThickness / 2;
    maxY = -fw / 2 + wallThickness / 2;
  } else if (side === 'bottom') {
    // Bottom rebate: horizontal surface at bottom inner edge
    minX = -halfInner;
    maxX = halfInner;
    minY = fw / 2 - wallThickness / 2;
    maxY = fw / 2 + wallThickness / 2;
  } else if (side === 'left') {
    // Left rebate: vertical surface at left inner edge
    minX = fw / 2 - wallThickness / 2;
    maxX = fw / 2 + wallThickness / 2;
    minY = -halfInner;
    maxY = halfInner;
  } else { // right
    // Right rebate: vertical surface at right inner edge
    minX = -fw / 2 - wallThickness / 2;
    maxX = -fw / 2 + wallThickness / 2;
    minY = -halfInner;
    maxY = halfInner;
  }
  
  // Z bounds: from frontZ going back by depth
  const minZ = frontZ - depth;
  const maxZ = frontZ;
  
  return createVerifiedSolidWall(minX, maxX, minY, maxY, minZ, maxZ);
}

// Create chamfered mount geometry - a rectangular frame with beveled inner edge
function createChamferedMountGeometry(
  outerWidth: number,
  outerHeight: number,
  innerWidth: number,
  innerHeight: number,
  thickness: number = MOUNT_THICKNESS,
  chamferWidth: number = MOUNT_CHAMFER
): {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
} {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  
  const ow = outerWidth / 2;
  const oh = outerHeight / 2;
  const iw = innerWidth / 2;
  const ih = innerHeight / 2;
  const cw = chamferWidth; // Chamfer width at surface
  const d = thickness;
  
  // Helper to add a quad
  const addQuad = (
    p0: number[], p1: number[], p2: number[], p3: number[],
    nx: number, ny: number, nz: number
  ) => {
    const baseIdx = positions.length / 3;
    positions.push(...p0, ...p1, ...p2, ...p3);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
  };
  
  // The chamfer starts at the inner edge of the mount surface and goes down
  // at 45 degrees to meet the artwork plane. The chamfer edge on the surface
  // is at (iw + cw, ih + cw) and the bottom edge is at (iw, ih).
  
  const chamferOuter = { x: iw + cw, y: ih + cw }; // Chamfer edge on top surface
  const chamferInner = { x: iw, y: ih };           // Inner edge at artwork level
  
  // Front face (top surface of mount) - four strips around the opening
  // Top strip
  addQuad(
    [-ow, chamferOuter.y, 0], [ow, chamferOuter.y, 0],
    [ow, oh, 0], [-ow, oh, 0],
    0, 0, 1
  );
  // Bottom strip  
  addQuad(
    [-ow, -oh, 0], [ow, -oh, 0],
    [ow, -chamferOuter.y, 0], [-ow, -chamferOuter.y, 0],
    0, 0, 1
  );
  // Left strip
  addQuad(
    [-ow, -chamferOuter.y, 0], [-chamferOuter.x, -chamferOuter.y, 0],
    [-chamferOuter.x, chamferOuter.y, 0], [-ow, chamferOuter.y, 0],
    0, 0, 1
  );
  // Right strip
  addQuad(
    [chamferOuter.x, -chamferOuter.y, 0], [ow, -chamferOuter.y, 0],
    [ow, chamferOuter.y, 0], [chamferOuter.x, chamferOuter.y, 0],
    0, 0, 1
  );
  
  // Chamfer faces (45-degree bevels going inward and down)
  // Using ensureCCWWinding to automatically correct vertex order for Apple AR Quick Look
  // IMPORTANT: iOS strictly culls backfaces, so we add both front and back faces
  const n45 = Math.SQRT1_2; // Normal component for 45-degree angle
  
  // Top chamfer - front face (pointing up and forward)
  createCCWQuad(
    [-chamferOuter.x, chamferOuter.y, 0], [chamferOuter.x, chamferOuter.y, 0],
    [chamferInner.x, chamferInner.y, -d], [-chamferInner.x, chamferInner.y, -d],
    0, n45, n45, addQuad
  );
  // Top chamfer - back face (reversed winding for iOS compatibility)
  createCCWQuad(
    [-chamferInner.x, chamferInner.y, -d], [chamferInner.x, chamferInner.y, -d],
    [chamferOuter.x, chamferOuter.y, 0], [-chamferOuter.x, chamferOuter.y, 0],
    0, -n45, -n45, addQuad
  );
  
  // Bottom chamfer - front face (pointing down and forward)
  // Note: No back face needed - the front face winding is correct for iOS when viewing from above
  createCCWQuad(
    [-chamferOuter.x, -chamferOuter.y, 0], [chamferOuter.x, -chamferOuter.y, 0],
    [chamferInner.x, -chamferInner.y, -d], [-chamferInner.x, -chamferInner.y, -d],
    0, -n45, n45, addQuad
  );
  
  // Left chamfer - front face (pointing left and forward)
  createCCWQuad(
    [-chamferOuter.x, chamferOuter.y, 0], [-chamferOuter.x, -chamferOuter.y, 0],
    [-chamferInner.x, -chamferInner.y, -d], [-chamferInner.x, chamferInner.y, -d],
    -n45, 0, n45, addQuad
  );
  // Left chamfer - back face (reversed winding for iOS compatibility)
  createCCWQuad(
    [-chamferInner.x, chamferInner.y, -d], [-chamferInner.x, -chamferInner.y, -d],
    [-chamferOuter.x, -chamferOuter.y, 0], [-chamferOuter.x, chamferOuter.y, 0],
    n45, 0, -n45, addQuad
  );
  
  // Right chamfer - front face (pointing right and forward)
  createCCWQuad(
    [chamferOuter.x, -chamferOuter.y, 0], [chamferOuter.x, chamferOuter.y, 0],
    [chamferInner.x, chamferInner.y, -d], [chamferInner.x, -chamferInner.y, -d],
    n45, 0, n45, addQuad
  );
  // Right chamfer - back face (reversed winding for iOS compatibility)
  createCCWQuad(
    [chamferInner.x, -chamferInner.y, -d], [chamferInner.x, chamferInner.y, -d],
    [chamferOuter.x, chamferOuter.y, 0], [chamferOuter.x, -chamferOuter.y, 0],
    -n45, 0, -n45, addQuad
  );
  
  // Outer edges (sides of the mount board)
  // Top edge
  addQuad(
    [-ow, oh, 0], [ow, oh, 0],
    [ow, oh, -d], [-ow, oh, -d],
    0, 1, 0
  );
  // Bottom edge
  addQuad(
    [ow, -oh, 0], [-ow, -oh, 0],
    [-ow, -oh, -d], [ow, -oh, -d],
    0, -1, 0
  );
  // Left edge
  addQuad(
    [-ow, -oh, 0], [-ow, oh, 0],
    [-ow, oh, -d], [-ow, -oh, -d],
    -1, 0, 0
  );
  // Right edge
  addQuad(
    [ow, oh, 0], [ow, -oh, 0],
    [ow, -oh, -d], [ow, oh, -d],
    1, 0, 0
  );
  
  // Back face (closes the mount at the back) - four strips around the inner cutout
  // Top strip (full width, from oh to chamferInner.y)
  addQuad(
    [-ow, oh, -d], [ow, oh, -d],
    [ow, chamferInner.y, -d], [-ow, chamferInner.y, -d],
    0, 0, -1
  );
  // Bottom strip (full width, from -chamferInner.y to -oh)
  addQuad(
    [-ow, -chamferInner.y, -d], [ow, -chamferInner.y, -d],
    [ow, -oh, -d], [-ow, -oh, -d],
    0, 0, -1
  );
  // Left strip (between top and bottom strips, from -ow to -chamferInner.x)
  addQuad(
    [-ow, chamferInner.y, -d], [-chamferInner.x, chamferInner.y, -d],
    [-chamferInner.x, -chamferInner.y, -d], [-ow, -chamferInner.y, -d],
    0, 0, -1
  );
  // Right strip (between top and bottom strips, from chamferInner.x to ow)
  addQuad(
    [chamferInner.x, chamferInner.y, -d], [ow, chamferInner.y, -d],
    [ow, -chamferInner.y, -d], [chamferInner.x, -chamferInner.y, -d],
    0, 0, -1
  );
  
  return { positions, normals, uvs, indices };
}

// Sawtooth hanger geometry - D-ring style with central opening and mounting holes
function createSawtoothHangerGeometry(): {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
} {
  // Dimensions matching reference image exactly
  const totalWidth = 0.022;    // 22mm wide
  const totalHeight = 0.018;   // 18mm tall
  const depth = 0.0006;        // 0.6mm thick (thin stamped metal)
  const frameThick = 0.003;    // 3mm frame border
  const toothCount = 5;        // 5 teeth at top center
  const toothHeight = 0.0025;  // 2.5mm tooth height
  const toothWidth = 0.002;    // 2mm per tooth
  const holeRadius = 0.0012;   // 1.2mm hole radius (small screw holes)
  
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  
  let vertexOffset = 0;
  
  const addQuad = (v0: number[], v1: number[], v2: number[], v3: number[], nx: number, ny: number, nz: number) => {
    positions.push(...v0, ...v1, ...v2, ...v3);
    for (let i = 0; i < 4; i++) normals.push(nx, ny, nz);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
    vertexOffset += 4;
  };
  
  const addTriangle = (v0: number[], v1: number[], v2: number[], nx: number, ny: number, nz: number) => {
    positions.push(...v0, ...v1, ...v2);
    for (let i = 0; i < 3; i++) normals.push(nx, ny, nz);
    uvs.push(0, 0, 1, 0, 0.5, 1);
    indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2);
    vertexOffset += 3;
  };
  
  const hw = totalWidth / 2;
  const hh = totalHeight / 2;
  const hd = depth / 2;
  
  // Opening dimensions
  const openingWidth = totalWidth - frameThick * 2;
  const openingHeight = totalHeight - frameThick * 3; // More at bottom for holes
  const openingTop = hh - frameThick;
  const openingBottom = -hh + frameThick * 2;
  const openingLeft = -openingWidth / 2;
  const openingRight = openingWidth / 2;
  
  // Hole positions - centered in bottom bar
  const bottomBarHeight = frameThick * 2; // Height of bottom bar
  const holeY = -hh + bottomBarHeight / 2; // Vertically centered in bottom bar
  const holeSpacing = hw - frameThick - holeRadius - 0.002; // Inset from sides
  
  // === MAIN RECTANGULAR FRAME (with center cut out) ===
  
  // Top bar - solid with teeth on top
  const topY = hh;
  const topBarBottom = openingTop;
  
  // Back face of top bar
  addQuad([-hw, topY, -hd], [hw, topY, -hd], [hw, topBarBottom, -hd], [-hw, topBarBottom, -hd], 0, 0, -1);
  // Front face of top bar
  addQuad([hw, topY, hd], [-hw, topY, hd], [-hw, topBarBottom, hd], [hw, topBarBottom, hd], 0, 0, 1);
  
  // Left bar
  addQuad([-hw, topBarBottom, -hd], [-hw + frameThick, topBarBottom, -hd], [-hw + frameThick, openingBottom, -hd], [-hw, openingBottom, -hd], 0, 0, -1);
  addQuad([-hw + frameThick, topBarBottom, hd], [-hw, topBarBottom, hd], [-hw, openingBottom, hd], [-hw + frameThick, openingBottom, hd], 0, 0, 1);
  
  // Right bar
  addQuad([hw - frameThick, topBarBottom, -hd], [hw, topBarBottom, -hd], [hw, openingBottom, -hd], [hw - frameThick, openingBottom, -hd], 0, 0, -1);
  addQuad([hw, topBarBottom, hd], [hw - frameThick, topBarBottom, hd], [hw - frameThick, openingBottom, hd], [hw, openingBottom, hd], 0, 0, 1);
  
  // Bottom bar with holes cut out using radial triangles
  const bottomBarTop = openingBottom;
  const bottomBarBottom = -hh;
  
  // Hole centers
  const hole1X = -holeSpacing;
  const hole2X = holeSpacing;
  
  // For each hole, draw the cylinder wall AND triangular faces radiating from hole edge to rectangular boundary
  const holeSegs = 16;
  
  for (let h = 0; h < 2; h++) {
    const holeCenterX = h === 0 ? hole1X : hole2X;
    const holeCenterY = holeY;
    
    // Define the rectangular boundary around this hole
    const rectLeft = h === 0 ? (hole1X - holeRadius - 0.003) : (hole2X - holeRadius - 0.003);
    const rectRight = h === 0 ? (hole1X + holeRadius + 0.003) : (hole2X + holeRadius + 0.003);
    const rectTop = bottomBarTop;
    const rectBottom = bottomBarBottom;
    
    // Draw cylinder wall (hole rim)
    for (let i = 0; i < holeSegs; i++) {
      const angle1 = (i / holeSegs) * Math.PI * 2;
      const angle2 = ((i + 1) / holeSegs) * Math.PI * 2;
      const x1 = holeCenterX + Math.cos(angle1) * holeRadius;
      const y1 = holeCenterY + Math.sin(angle1) * holeRadius;
      const x2 = holeCenterX + Math.cos(angle2) * holeRadius;
      const y2 = holeCenterY + Math.sin(angle2) * holeRadius;
      
      // Inner wall of hole - normals point INTO the hole
      addQuad([x1, y1, -hd], [x2, y2, -hd], [x2, y2, hd], [x1, y1, hd], 
        -Math.cos((angle1 + angle2) / 2), -Math.sin((angle1 + angle2) / 2), 0);
      
      // Draw triangular faces from hole edge to rectangle corners (back face)
      // Find the corner this segment is closest to
      const midAngle = (angle1 + angle2) / 2;
      let cornerX: number, cornerY: number;
      
      if (midAngle >= 0 && midAngle < Math.PI / 2) {
        // Top-right quadrant
        cornerX = rectRight; cornerY = rectTop;
      } else if (midAngle >= Math.PI / 2 && midAngle < Math.PI) {
        // Top-left quadrant
        cornerX = rectLeft; cornerY = rectTop;
      } else if (midAngle >= Math.PI && midAngle < 3 * Math.PI / 2) {
        // Bottom-left quadrant
        cornerX = rectLeft; cornerY = rectBottom;
      } else {
        // Bottom-right quadrant
        cornerX = rectRight; cornerY = rectBottom;
      }
      
      // Back face triangle (from edge segment to corner)
      addTriangle([x1, y1, -hd], [x2, y2, -hd], [cornerX, cornerY, -hd], 0, 0, -1);
      // Front face triangle
      addTriangle([x2, y2, hd], [x1, y1, hd], [cornerX, cornerY, hd], 0, 0, 1);
    }
  }
  
  // Draw the solid sections of bottom bar (left, middle, right)
  // Left section
  const leftSectionRight = hole1X - holeRadius - 0.003;
  addQuad([-hw, bottomBarTop, -hd], [leftSectionRight, bottomBarTop, -hd], [leftSectionRight, bottomBarBottom, -hd], [-hw, bottomBarBottom, -hd], 0, 0, -1);
  addQuad([leftSectionRight, bottomBarTop, hd], [-hw, bottomBarTop, hd], [-hw, bottomBarBottom, hd], [leftSectionRight, bottomBarBottom, hd], 0, 0, 1);
  
  // Middle section (between holes)
  const middleSectionLeft = hole1X + holeRadius + 0.003;
  const middleSectionRight = hole2X - holeRadius - 0.003;
  addQuad([middleSectionLeft, bottomBarTop, -hd], [middleSectionRight, bottomBarTop, -hd], [middleSectionRight, bottomBarBottom, -hd], [middleSectionLeft, bottomBarBottom, -hd], 0, 0, -1);
  addQuad([middleSectionRight, bottomBarTop, hd], [middleSectionLeft, bottomBarTop, hd], [middleSectionLeft, bottomBarBottom, hd], [middleSectionRight, bottomBarBottom, hd], 0, 0, 1);
  
  // Right section
  const rightSectionLeft = hole2X + holeRadius + 0.003;
  addQuad([rightSectionLeft, bottomBarTop, -hd], [hw, bottomBarTop, -hd], [hw, bottomBarBottom, -hd], [rightSectionLeft, bottomBarBottom, -hd], 0, 0, -1);
  addQuad([hw, bottomBarTop, hd], [rightSectionLeft, bottomBarTop, hd], [rightSectionLeft, bottomBarBottom, hd], [hw, bottomBarBottom, hd], 0, 0, 1);
  
  // === SAWTOOTH TEETH - pointing DOWN into the opening ===
  const teethTotalWidth = toothCount * toothWidth;
  const teethStartX = -teethTotalWidth / 2;
  const teethBaseY = openingTop; // Bottom of top bar, top of opening
  
  for (let i = 0; i < toothCount; i++) {
    const leftX = teethStartX + i * toothWidth;
    const rightX = leftX + toothWidth;
    const centerX = (leftX + rightX) / 2;
    
    // Tooth pointing DOWN - tip goes into the opening
    // Back face
    addTriangle([leftX, teethBaseY, -hd], [rightX, teethBaseY, -hd], [centerX, teethBaseY - toothHeight, -hd], 0, 0, -1);
    // Front face
    addTriangle([rightX, teethBaseY, hd], [leftX, teethBaseY, hd], [centerX, teethBaseY - toothHeight, hd], 0, 0, 1);
    
    // Tooth side edges
    addQuad([leftX, teethBaseY, hd], [leftX, teethBaseY, -hd], [centerX, teethBaseY - toothHeight, -hd], [centerX, teethBaseY - toothHeight, hd], -0.7, -0.7, 0);
    addQuad([centerX, teethBaseY - toothHeight, -hd], [rightX, teethBaseY, -hd], [rightX, teethBaseY, hd], [centerX, teethBaseY - toothHeight, hd], 0.7, -0.7, 0);
  }
  
  // === OUTER EDGES ===
  addQuad([-hw, topY, hd], [-hw, topY, -hd], [-hw, -hh, -hd], [-hw, -hh, hd], -1, 0, 0);
  addQuad([hw, topY, -hd], [hw, topY, hd], [hw, -hh, hd], [hw, -hh, -hd], 1, 0, 0);
  addQuad([-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd], 0, -1, 0);
  // Top edge (full width, flat)
  addQuad([-hw, topY, hd], [hw, topY, hd], [hw, topY, -hd], [-hw, topY, -hd], 0, 1, 0);
  
  // === INNER OPENING EDGES ===
  addQuad([-hw + frameThick, openingBottom, hd], [-hw + frameThick, openingBottom, -hd], [-hw + frameThick, topBarBottom, -hd], [-hw + frameThick, topBarBottom, hd], 1, 0, 0);
  addQuad([hw - frameThick, openingBottom, -hd], [hw - frameThick, openingBottom, hd], [hw - frameThick, topBarBottom, hd], [hw - frameThick, topBarBottom, -hd], -1, 0, 0);
  addQuad([-hw + frameThick, openingBottom, -hd], [hw - frameThick, openingBottom, -hd], [hw - frameThick, openingBottom, hd], [-hw + frameThick, openingBottom, hd], 0, 1, 0);
  addQuad([-hw + frameThick, topBarBottom, hd], [hw - frameThick, topBarBottom, hd], [hw - frameThick, topBarBottom, -hd], [-hw + frameThick, topBarBottom, -hd], 0, -1, 0);
  
  return { positions, normals, uvs, indices };
}

// Create protective tape strip geometry for frame backs
// Tape creates an L-shape: half on MDF backing, half on frame back face
// This seals the gap between the backing and frame
function createTapeStripGeometry(
  side: 'top' | 'bottom' | 'left' | 'right',
  innerWidth: number,    // Inner opening width (where backing sits)
  innerHeight: number,   // Inner opening height
  faceWidth: number,     // Frame face width
  backingZ: number,      // Z position of MDF backing
  frameBackZ: number,    // Z position of frame back face
  tapeWidth: number = 0.050 // 50mm tape width in meters
): { positions: number[]; normals: number[]; uvs: number[]; indices: number[] } {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  
  const iw = innerWidth / 2;
  const ih = innerHeight / 2;
  const fw = faceWidth;
  const tw = tapeWidth;
  const halfTape = tw / 2;
  
  // Offset tape very slightly from surfaces to prevent z-fighting
  // Using a minimal offset (0.5mm) - just enough to avoid coplanar artifacts
  const offset = 0.0005; // 0.5mm offset
  
  const addQuad = (
    p0: number[], p1: number[], p2: number[], p3: number[],
    nx: number, ny: number, nz: number,
    u0 = 0, v0 = 0, u1 = 1, v1 = 0, u2 = 1, v2 = 1, u3 = 0, v3 = 1
  ) => {
    const base = positions.length / 3;
    positions.push(...p0, ...p1, ...p2, ...p3);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
    uvs.push(u0, v0, u1, v1, u2, v2, u3, v3);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  
  // Tape forms L-shape with 3 sections: on backing, along inner edge, on frame back
  // The middle section connects the two flat sections along the rebate step
  
  // Calculate the Z step between backing and frame back
  const zStep = Math.abs(frameBackZ - backingZ);
  const hasStep = zStep > 0.001;
  
  // Clamp tape width on frame back to not extend beyond frame edge
  const maxFrameTapeWidth = Math.min(halfTape, fw * 0.9); // Max 90% of frame face width
  
  switch (side) {
    case 'top': {
      // Top tape strip - full width of frame
      const left = -(iw + fw);
      const right = iw + fw;
      const length = right - left;
      const uScale = length / tw;
      
      // Section 1: On MDF backing (inner portion)
      const backingOuter = ih;
      const backingInner = ih - halfTape;
      addQuad(
        [left, backingOuter, backingZ - offset], [right, backingOuter, backingZ - offset],
        [right, backingInner, backingZ - offset], [left, backingInner, backingZ - offset],
        0, 0, -1, 0, 0, uScale, 0, uScale, 0.5, 0, 0.5
      );
      
      // Section 3: On frame back face (outer portion - clamped to frame edge)
      const frameInner = ih;
      const frameOuter = ih + maxFrameTapeWidth;
      addQuad(
        [left, frameOuter, frameBackZ - offset], [right, frameOuter, frameBackZ - offset],
        [right, frameInner, frameBackZ - offset], [left, frameInner, frameBackZ - offset],
        0, 0, -1, 0, 0.5, uScale, 0.5, uScale, 1, 0, 1
      );
      break;
    }
    case 'bottom': {
      const left = -(iw + fw);
      const right = iw + fw;
      const length = right - left;
      const uScale = length / tw;
      
      // Section 1: On MDF backing
      const backingOuter = -ih;
      const backingInner = -ih + halfTape;
      addQuad(
        [left, backingInner, backingZ - offset], [right, backingInner, backingZ - offset],
        [right, backingOuter, backingZ - offset], [left, backingOuter, backingZ - offset],
        0, 0, -1, 0, 0.5, uScale, 0.5, uScale, 0, 0, 0
      );
      
      // Section 3: On frame back face (clamped)
      const frameInner = -ih;
      const frameOuter = -ih - maxFrameTapeWidth;
      addQuad(
        [left, frameInner, frameBackZ - offset], [right, frameInner, frameBackZ - offset],
        [right, frameOuter, frameBackZ - offset], [left, frameOuter, frameBackZ - offset],
        0, 0, -1, 0, 1, uScale, 1, uScale, 0.5, 0, 0.5
      );
      break;
    }
    case 'left': {
      // Full height - allow overlap with top/bottom at corners
      const top = ih;
      const bottom = -ih;
      const length = top - bottom;
      const uScale = length / tw;
      
      // Section 1: On MDF backing
      const backingOuter = -iw;
      const backingInner = -iw + halfTape;
      addQuad(
        [backingOuter, top, backingZ - offset], [backingInner, top, backingZ - offset],
        [backingInner, bottom, backingZ - offset], [backingOuter, bottom, backingZ - offset],
        0, 0, -1, 0, 0, 0.5, 0, 0.5, uScale, 0, uScale
      );
      
      // Section 3: On frame back face (clamped)
      const frameInner = -iw;
      const frameOuter = -iw - maxFrameTapeWidth;
      addQuad(
        [frameOuter, top, frameBackZ - offset], [frameInner, top, frameBackZ - offset],
        [frameInner, bottom, frameBackZ - offset], [frameOuter, bottom, frameBackZ - offset],
        0, 0, -1, 0.5, 0, 1, 0, 1, uScale, 0.5, uScale
      );
      break;
    }
    case 'right': {
      // Full height - allow overlap with top/bottom at corners
      const top = ih;
      const bottom = -ih;
      const length = top - bottom;
      const uScale = length / tw;
      
      // Section 1: On MDF backing
      const backingOuter = iw;
      const backingInner = iw - halfTape;
      addQuad(
        [backingInner, top, backingZ - offset], [backingOuter, top, backingZ - offset],
        [backingOuter, bottom, backingZ - offset], [backingInner, bottom, backingZ - offset],
        0, 0, -1, 0.5, 0, 0, 0, 0, uScale, 0.5, uScale
      );
      
      // Section 3: On frame back face (clamped)
      const frameInner = iw;
      const frameOuter = iw + maxFrameTapeWidth;
      addQuad(
        [frameInner, top, frameBackZ - offset], [frameOuter, top, frameBackZ - offset],
        [frameOuter, bottom, frameBackZ - offset], [frameInner, bottom, frameBackZ - offset],
        0, 0, -1, 1, 0, 0.5, 0, 0.5, uScale, 1, uScale
      );
      break;
    }
  }
  
  return { positions, normals, uvs, indices };
}

function createBoxGeometry(width: number, height: number, depth: number): {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
} {
  const w = width / 2;
  const h = height / 2;
  const d = depth / 2;
  
  const positions = [
    // Front face
    -w, -h,  d,   w, -h,  d,   w,  h,  d,  -w,  h,  d,
    // Back face
     w, -h, -d,  -w, -h, -d,  -w,  h, -d,   w,  h, -d,
    // Top face
    -w,  h,  d,   w,  h,  d,   w,  h, -d,  -w,  h, -d,
    // Bottom face
    -w, -h, -d,   w, -h, -d,   w, -h,  d,  -w, -h,  d,
    // Right face
     w, -h,  d,   w, -h, -d,   w,  h, -d,   w,  h,  d,
    // Left face
    -w, -h, -d,  -w, -h,  d,  -w,  h,  d,  -w,  h, -d,
  ];
  
  const normals = [
    // Front
    0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
    // Back
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    // Top
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    // Bottom
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    // Right
    1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
    // Left
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ];
  
  const uvs = [
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
  ];
  
  const indices = [];
  for (let i = 0; i < 6; i++) {
    const offset = i * 4;
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }
  
  return { positions, normals, uvs, indices };
}

// Create a trapezoid frame edge with mitre cuts at 45 degrees
// This creates a prism with trapezoid cross-section for realistic frame joints
// innerFaceStartZ: optionally start the inner (rebate) face at this z-depth instead of 0
//                  used when a mount covers the front portion of the rebate
// Create just the back face of a frame edge (for natural wood texture)
function createFrameEdgeBackFace(
  side: 'top' | 'bottom' | 'left' | 'right',
  outerLength: number,
  frameWidth: number,
  depth: number
): { positions: number[]; normals: number[]; uvs: number[]; indices: number[] } {
  const fw = frameWidth;
  const d = depth;
  const halfOuter = outerLength / 2;
  const halfInner = (outerLength - 2 * frameWidth) / 2;
  const mitreGap = 0.0002;
  
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  
  const addQuad = (
    p0: number[], p1: number[], p2: number[], p3: number[],
    nx: number, ny: number, nz: number
  ) => {
    const baseIdx = positions.length / 3;
    positions.push(...p0, ...p1, ...p2, ...p3);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
    // Simple UV mapping for wood texture
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
  };
  
  const g = mitreGap;
  
  if (side === 'top') {
    const yO = fw / 2, yI = -fw / 2;
    const vb = [
      [-halfOuter + g, yO, -d], [halfOuter - g, yO, -d], 
      [halfInner - g, yI, -d], [-halfInner + g, yI, -d]
    ];
    addQuad(vb[0], vb[1], vb[2], vb[3], 0, 0, -1);
  } else if (side === 'bottom') {
    const yO = -fw / 2, yI = fw / 2;
    const vb = [
      [-halfOuter + g, yO, -d], [halfOuter - g, yO, -d], 
      [halfInner - g, yI, -d], [-halfInner + g, yI, -d]
    ];
    addQuad(vb[3], vb[2], vb[1], vb[0], 0, 0, -1);
  } else if (side === 'left') {
    const xO = -fw / 2, xI = fw / 2;
    const vb = [
      [xO, halfOuter - g, -d], [xO, -halfOuter + g, -d], 
      [xI, -halfInner + g, -d], [xI, halfInner - g, -d]
    ];
    addQuad(vb[3], vb[2], vb[1], vb[0], 0, 0, -1);
  } else { // right
    const xO = fw / 2, xI = -fw / 2;
    const vb = [
      [xO, -halfOuter + g, -d], [xO, halfOuter - g, -d], 
      [xI, halfInner - g, -d], [xI, -halfInner + g, -d]
    ];
    addQuad(vb[3], vb[2], vb[1], vb[0], 0, 0, -1);
  }
  
  return { positions, normals, uvs, indices };
}

// Canvas tray frame edge: like standard trapezoid but inner face only extends to frontD (lip depth)
// The rest of the inner depth is left open for the dark gap material
function createCanvasTrayFrameEdge(
  side: 'top' | 'bottom' | 'left' | 'right',
  outerLength: number,
  frameWidth: number,
  depth: number,
  lipDepth: number,
  longestSide: number
): { positions: number[]; normals: number[]; uvs: number[]; indices: number[] } {
  const fw = frameWidth;
  const d = depth;
  const ld = lipDepth;
  const halfOuter = outerLength / 2;
  const halfInner = (outerLength - 2 * frameWidth) / 2;
  const mitreGap = 0.0002;

  const TEX_L = 5.005;
  const TEX_H = 0.105;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const addQuad = (
    p0: number[], p1: number[], p2: number[], p3: number[],
    nx: number, ny: number, nz: number,
    u0 = 0, v0 = 0, u1 = 1, v1 = 0, u2 = 1, v2 = 1, u3 = 0, v3 = 1
  ) => {
    const baseIdx = positions.length / 3;
    positions.push(...p0, ...p1, ...p2, ...p3);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
    uvs.push(u0, v0, u1, v1, u2, v2, u3, v3);
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
  };

  const dist = (a: number[], b: number[]) =>
    Math.sqrt((b[0]-a[0])**2 + (b[1]-a[1])**2 + (b[2]-a[2])**2);

  const addSmartUVQuad = (
    p0: number[], p1: number[], p2: number[], p3: number[],
    nx: number, ny: number, nz: number
  ) => {
    const e01 = dist(p0, p1);
    const e03 = dist(p0, p3);
    const longIs01 = e01 >= e03;
    const faceLen = longIs01 ? e01 : e03;
    const faceWid = longIs01 ? e03 : e01;
    const scaledTexLen = TEX_L * (faceWid / TEX_H);
    const uScale = faceLen / scaledTexLen;

    if (longIs01) {
      addQuad(p0, p1, p2, p3, nx, ny, nz, 0, 0, uScale, 0, uScale, 1, 0, 1);
    } else {
      addQuad(p0, p1, p2, p3, nx, ny, nz, 0, 0, 0, 1, uScale, 1, uScale, 0);
    }
  };

  const g = mitreGap;

  if (side === 'top') {
    const yO = fw / 2, yI = -fw / 2;
    const v = [
      [-halfOuter, yO, 0], [halfOuter, yO, 0], [halfInner, yI, 0], [-halfInner, yI, 0],
      [-halfOuter, yO, -d], [halfOuter, yO, -d], [halfInner, yI, -d], [-halfInner, yI, -d]
    ];
    const vi = [
      [halfInner, yI, -ld], [-halfInner, yI, -ld]
    ];
    const vf = [
      [-halfOuter + g, yO, 0], [halfOuter - g, yO, 0], [halfInner - g, yI, 0], [-halfInner + g, yI, 0]
    ];
    addSmartUVQuad(vf[3], vf[2], vf[1], vf[0], 0, 0, 1);
    addSmartUVQuad(v[0], v[1], v[5], v[4], 0, 1, 0);
    addSmartUVQuad(v[2], v[3], vi[1], vi[0], 0, -1, 0);
    addSmartUVQuad(v[3], v[0], v[4], v[7], -0.707, -0.707, 0);
    addSmartUVQuad(v[1], v[2], v[6], v[5], 0.707, -0.707, 0);
  } else if (side === 'bottom') {
    const yO = -fw / 2, yI = fw / 2;
    const v = [
      [-halfOuter, yO, 0], [halfOuter, yO, 0], [halfInner, yI, 0], [-halfInner, yI, 0],
      [-halfOuter, yO, -d], [halfOuter, yO, -d], [halfInner, yI, -d], [-halfInner, yI, -d]
    ];
    const vi = [
      [halfInner, yI, -ld], [-halfInner, yI, -ld]
    ];
    const vf = [
      [-halfOuter + g, yO, 0], [halfOuter - g, yO, 0], [halfInner - g, yI, 0], [-halfInner + g, yI, 0]
    ];
    addSmartUVQuad(vf[0], vf[1], vf[2], vf[3], 0, 0, 1);
    addSmartUVQuad(v[1], v[0], v[4], v[5], 0, -1, 0);
    addSmartUVQuad(v[3], v[2], vi[0], vi[1], 0, 1, 0);
    addSmartUVQuad(v[3], v[7], v[4], v[0], -0.707, 0.707, 0);
    addSmartUVQuad(v[1], v[5], v[6], v[2], 0.707, 0.707, 0);
  } else if (side === 'left') {
    const xO = -fw / 2, xI = fw / 2;
    const v = [
      [xO, halfOuter, 0], [xO, -halfOuter, 0], [xI, -halfInner, 0], [xI, halfInner, 0],
      [xO, halfOuter, -d], [xO, -halfOuter, -d], [xI, -halfInner, -d], [xI, halfInner, -d]
    ];
    const vi = [
      [xI, -halfInner, -ld], [xI, halfInner, -ld]
    ];
    const vf = [
      [xO, halfOuter - g, 0], [xO, -halfOuter + g, 0], [xI, -halfInner + g, 0], [xI, halfInner - g, 0]
    ];
    addSmartUVQuad(vf[0], vf[1], vf[2], vf[3], 0, 0, 1);
    addSmartUVQuad(v[1], v[0], v[4], v[5], -1, 0, 0);
    addSmartUVQuad(v[3], v[2], vi[0], vi[1], 1, 0, 0);
    addSmartUVQuad(v[0], v[3], v[7], v[4], 0.707, 0.707, 0);
    addSmartUVQuad(v[2], v[1], v[5], v[6], 0.707, -0.707, 0);
  } else {
    const xO = fw / 2, xI = -fw / 2;
    const v = [
      [xO, -halfOuter, 0], [xO, halfOuter, 0], [xI, halfInner, 0], [xI, -halfInner, 0],
      [xO, -halfOuter, -d], [xO, halfOuter, -d], [xI, halfInner, -d], [xI, -halfInner, -d]
    ];
    const vi = [
      [xI, halfInner, -ld], [xI, -halfInner, -ld]
    ];
    const vf = [
      [xO, -halfOuter + g, 0], [xO, halfOuter - g, 0], [xI, halfInner - g, 0], [xI, -halfInner + g, 0]
    ];
    addSmartUVQuad(vf[0], vf[1], vf[2], vf[3], 0, 0, 1);
    addSmartUVQuad(v[1], v[0], v[4], v[5], 1, 0, 0);
    addSmartUVQuad(vi[1], v[3], v[2], vi[0], -1, 0, 0);
    addSmartUVQuad(v[2], v[1], v[5], v[6], -0.707, 0.707, 0);
    addSmartUVQuad(v[0], v[3], v[7], v[4], -0.707, -0.707, 0);
  }

  return { positions, normals, uvs, indices };
}

function createTrapezoidFrameEdge(
  side: 'top' | 'bottom' | 'left' | 'right',
  outerLength: number,
  frameWidth: number,
  depth: number,
  longestSide: number,
  innerFaceStartZ: number = 0,
  includeBackFace: boolean = false // Back face now separate for different material
): { positions: number[]; normals: number[]; uvs: number[]; indices: number[] } {
  const fw = frameWidth;
  const d = depth;
  const halfOuter = outerLength / 2;
  const halfInner = (outerLength - 2 * frameWidth) / 2;
  const innerZ = innerFaceStartZ; // Where inner face starts (0 = front, negative = behind)
  
  // Small gap at mitre joints (0.2mm) to simulate real frame construction
  const mitreGap = 0.0002;
  
  // Physical texture dimensions: 5005mm × 105mm (8192×173 pixels)
  const TEX_L = 5.005; // texture length in meters
  const TEX_H = 0.105; // texture height in meters
  
  let positions: number[] = [];
  let normals: number[] = [];
  let uvs: number[] = [];
  let indices: number[] = [];
  
  // Helper to add a quad face with proper winding and tiled UVs
  const addQuad = (
    p0: number[], p1: number[], p2: number[], p3: number[],
    nx: number, ny: number, nz: number,
    u0 = 0, v0 = 0, u1 = 1, v1 = 0, u2 = 1, v2 = 1, u3 = 0, v3 = 1
  ) => {
    const baseIdx = positions.length / 3;
    positions.push(...p0, ...p1, ...p2, ...p3);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
    uvs.push(u0, v0, u1, v1, u2, v2, u3, v3);
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
  };
  
  // Helper to calculate distance between two 3D points
  const dist = (a: number[], b: number[]) => 
    Math.sqrt((b[0]-a[0])**2 + (b[1]-a[1])**2 + (b[2]-a[2])**2);

  // Debug log array
  const debugLog: string[] = [];
  debugLog.push(`Frame Edge: ${side}, outerLength=${(outerLength*1000).toFixed(1)}mm`);
  
  // Smart UV mapping: detects which edge is longer and rotates UVs accordingly
  const addSmartUVQuad = (
    p0: number[], p1: number[], p2: number[], p3: number[],
    nx: number, ny: number, nz: number,
    faceName: string = 'unknown'
  ) => {
    // Measure edge lengths
    const e01 = dist(p0, p1); // edge p0->p1
    const e03 = dist(p0, p3); // edge p0->p3
    
    // Determine which edge is the face "length" (long) vs "width" (short)
    const longIs01 = e01 >= e03;
    const faceLen = longIs01 ? e01 : e03;
    const faceWid = longIs01 ? e03 : e01;
    
    // Scale uniformly so texture height fits face width
    // Then calculate how much of texture length we need
    const scaledTexLen = TEX_L * (faceWid / TEX_H);
    const uScale = faceLen / scaledTexLen;
    
    debugLog.push(`  ${faceName}: e01=${(e01*1000).toFixed(1)}mm, e03=${(e03*1000).toFixed(1)}mm, longIs01=${longIs01}, uScale=${uScale.toFixed(3)}`);
    debugLog.push(`    p0=[${p0.map(v=>(v*1000).toFixed(1)).join(',')}] p1=[${p1.map(v=>(v*1000).toFixed(1)).join(',')}]`);
    debugLog.push(`    p2=[${p2.map(v=>(v*1000).toFixed(1)).join(',')}] p3=[${p3.map(v=>(v*1000).toFixed(1)).join(',')}]`);
    
    if (longIs01) {
      // Long edge is p0->p1: U (grain) follows this edge
      // p0:(0,0) p1:(uScale,0) p2:(uScale,1) p3:(0,1)
      debugLog.push(`    UVs: p0(0,0) p1(${uScale.toFixed(3)},0) p2(${uScale.toFixed(3)},1) p3(0,1)`);
      addQuad(p0, p1, p2, p3, nx, ny, nz, 0, 0, uScale, 0, uScale, 1, 0, 1);
    } else {
      // Long edge is p0->p3: rotate UVs 90° so U follows p0->p3
      // p0:(0,0) p1:(0,1) p2:(uScale,1) p3:(uScale,0)
      debugLog.push(`    UVs (rotated): p0(0,0) p1(0,1) p2(${uScale.toFixed(3)},1) p3(${uScale.toFixed(3)},0)`);
      addQuad(p0, p1, p2, p3, nx, ny, nz, 0, 0, 0, 1, uScale, 1, uScale, 0);
    }
  };
  
  // Store debug log for later output
  (globalThis as any).__uvDebugLog = (globalThis as any).__uvDebugLog || [];
  (globalThis as any).__uvDebugLog.push(...debugLog);
  
  if (side === 'top') {
    // Top edge: runs along X axis, at positive Y
    const yO = fw / 2, yI = -fw / 2;
    const v = [
      [-halfOuter, yO, 0], [halfOuter, yO, 0], [halfInner, yI, 0], [-halfInner, yI, 0],
      [-halfOuter, yO, -d], [halfOuter, yO, -d], [halfInner, yI, -d], [-halfInner, yI, -d]
    ];
    const g = mitreGap;
    const vf = [
      [-halfOuter + g, yO, 0], [halfOuter - g, yO, 0], [halfInner - g, yI, 0], [-halfInner + g, yI, 0]
    ];
    const vb = [
      [-halfOuter + g, yO, -d], [halfOuter - g, yO, -d], [halfInner - g, yI, -d], [-halfInner + g, yI, -d]
    ];
    // All 6 faces to make solid prism
    addSmartUVQuad(vf[3], vf[2], vf[1], vf[0], 0, 0, 1, 'front');
    if (includeBackFace) addSmartUVQuad(vb[0], vb[1], vb[2], vb[3], 0, 0, -1, 'back');
    addSmartUVQuad(v[0], v[1], v[5], v[4], 0, 1, 0, 'outer');
    addSmartUVQuad(v[2], v[3], v[7], v[6], 0, -1, 0, 'inner'); // Close off inner face
    addSmartUVQuad(v[3], v[0], v[4], v[7], -0.707, -0.707, 0, 'left-mitre');
    addSmartUVQuad(v[1], v[2], v[6], v[5], 0.707, -0.707, 0, 'right-mitre');
  } else if (side === 'bottom') {
    const yO = -fw / 2, yI = fw / 2;
    const v = [
      [-halfOuter, yO, 0], [halfOuter, yO, 0], [halfInner, yI, 0], [-halfInner, yI, 0],
      [-halfOuter, yO, -d], [halfOuter, yO, -d], [halfInner, yI, -d], [-halfInner, yI, -d]
    ];
    const g = mitreGap;
    const vf = [
      [-halfOuter + g, yO, 0], [halfOuter - g, yO, 0], [halfInner - g, yI, 0], [-halfInner + g, yI, 0]
    ];
    const vb = [
      [-halfOuter + g, yO, -d], [halfOuter - g, yO, -d], [halfInner - g, yI, -d], [-halfInner + g, yI, -d]
    ];
    addSmartUVQuad(vf[0], vf[1], vf[2], vf[3], 0, 0, 1, 'front');
    if (includeBackFace) addSmartUVQuad(vb[3], vb[2], vb[1], vb[0], 0, 0, -1, 'back');
    addSmartUVQuad(v[1], v[0], v[4], v[5], 0, -1, 0, 'outer');
    addSmartUVQuad(v[3], v[2], v[6], v[7], 0, 1, 0, 'inner'); // Close off inner face
    addSmartUVQuad(v[3], v[7], v[4], v[0], -0.707, 0.707, 0, 'left-mitre');
    addSmartUVQuad(v[1], v[5], v[6], v[2], 0.707, 0.707, 0, 'right-mitre');
  } else if (side === 'left') {
    const xO = -fw / 2, xI = fw / 2;
    const v = [
      [xO, halfOuter, 0], [xO, -halfOuter, 0], [xI, -halfInner, 0], [xI, halfInner, 0],
      [xO, halfOuter, -d], [xO, -halfOuter, -d], [xI, -halfInner, -d], [xI, halfInner, -d]
    ];
    const g = mitreGap;
    const vf = [
      [xO, halfOuter - g, 0], [xO, -halfOuter + g, 0], [xI, -halfInner + g, 0], [xI, halfInner - g, 0]
    ];
    const vb = [
      [xO, halfOuter - g, -d], [xO, -halfOuter + g, -d], [xI, -halfInner + g, -d], [xI, halfInner - g, -d]
    ];
    addSmartUVQuad(vf[0], vf[1], vf[2], vf[3], 0, 0, 1, 'front');
    if (includeBackFace) addSmartUVQuad(vb[3], vb[2], vb[1], vb[0], 0, 0, -1, 'back');
    addSmartUVQuad(v[1], v[0], v[4], v[5], -1, 0, 0, 'outer');
    addSmartUVQuad(v[3], v[2], v[6], v[7], 1, 0, 0, 'inner'); // Close off inner face
    addSmartUVQuad(v[0], v[3], v[7], v[4], 0.707, 0.707, 0, 'top-mitre');
    addSmartUVQuad(v[2], v[1], v[5], v[6], 0.707, -0.707, 0, 'bottom-mitre');
  } else { // right
    const xO = fw / 2, xI = -fw / 2;
    const v = [
      [xO, -halfOuter, 0], [xO, halfOuter, 0], [xI, halfInner, 0], [xI, -halfInner, 0],
      [xO, -halfOuter, -d], [xO, halfOuter, -d], [xI, halfInner, -d], [xI, -halfInner, -d]
    ];
    const g = mitreGap;
    const vf = [
      [xO, -halfOuter + g, 0], [xO, halfOuter - g, 0], [xI, halfInner - g, 0], [xI, -halfInner + g, 0]
    ];
    const vb = [
      [xO, -halfOuter + g, -d], [xO, halfOuter - g, -d], [xI, halfInner - g, -d], [xI, -halfInner + g, -d]
    ];
    addSmartUVQuad(vf[0], vf[1], vf[2], vf[3], 0, 0, 1, 'front');
    if (includeBackFace) addSmartUVQuad(vb[3], vb[2], vb[1], vb[0], 0, 0, -1, 'back');
    addSmartUVQuad(v[1], v[0], v[4], v[5], 1, 0, 0, 'outer');
    // Right inner face: CCW winding for -X normal
    // Triangle indices are (0,1,2) and (0,2,3), so cross product is (p1-p0) × (p2-p0)
    // For -X normal: need v[7], v[3], v[2], v[6] which gives cross product pointing -X
    addSmartUVQuad(v[7], v[3], v[2], v[6], -1, 0, 0, 'inner');
    addSmartUVQuad(v[2], v[1], v[5], v[6], -0.707, 0.707, 0, 'top-mitre');
    addSmartUVQuad(v[0], v[3], v[7], v[4], -0.707, -0.707, 0, 'bottom-mitre');
  }
  
  // Append debug log after all faces are processed
  (globalThis as any).__uvDebugLog.push(...debugLog);
  
  return { positions, normals, uvs, indices };
}

// Helper function to create front-facing painted inner faces (visible from front only)
function createFrameEdgeInnerFaceFront(
  side: 'top' | 'bottom' | 'left' | 'right',
  outerLength: number,
  faceW: number,
  depth: number,
  innerZ: number = 0
): { positions: number[]; normals: number[]; uvs: number[]; indices: number[] } {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  
  const fw = faceW;
  const d = depth;
  const halfOuter = outerLength / 2;
  const halfInner = halfOuter - fw;
  
  const addQuad = (
    p0: number[], p1: number[], p2: number[], p3: number[],
    nx: number, ny: number, nz: number
  ) => {
    const base = positions.length / 3;
    [p0, p1, p2, p3].forEach(p => positions.push(...p));
    for (let i = 0; i < 4; i++) normals.push(nx, ny, nz);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  
  // All vertices ordered for CCW winding when viewed from FRONT of frame (positive Z)
  // This ensures visibility in AR Quick Look which strictly culls back-faces
  if (side === 'top') {
    // Top inner wall - horizontal surface facing down, viewed from front-below angle
    const yI = -fw / 2;
    addQuad(
      [halfInner, yI, innerZ], [-halfInner, yI, innerZ],
      [-halfInner, yI, -d], [halfInner, yI, -d],
      0, -1, 0
    );
  } else if (side === 'bottom') {
    // Bottom inner wall - horizontal surface facing up, viewed from front-above angle
    const yI = fw / 2;
    addQuad(
      [-halfInner, yI, innerZ], [halfInner, yI, innerZ],
      [halfInner, yI, -d], [-halfInner, yI, -d],
      0, 1, 0
    );
  } else if (side === 'left') {
    // Left inner wall - vertical surface facing right, viewed from front-right angle
    const xI = fw / 2;
    addQuad(
      [xI, halfInner, innerZ], [xI, -halfInner, innerZ],
      [xI, -halfInner, -d], [xI, halfInner, -d],
      1, 0, 0
    );
  } else { // right
    // Right inner wall - vertical surface facing left (-X normal)
    // For CCW winding when viewed from -X direction (looking toward +X):
    //   Standing at -X looking toward +X: +Y is up, -Z is to your right
    //   CCW order: top-front → bottom-front → bottom-back → top-back
    // Triangle 1 (p0,p1,p2): top-front → bottom-front → bottom-back = CCW ✓
    // Triangle 2 (p0,p2,p3): top-front → bottom-back → top-back = CCW ✓
    const xI = -fw / 2;
    addQuad(
      [xI, halfInner, innerZ],   // p0: top-front
      [xI, -halfInner, innerZ],  // p1: bottom-front
      [xI, -halfInner, -d],      // p2: bottom-back
      [xI, halfInner, -d],       // p3: top-back
      -1, 0, 0
    );
  }
  
  return { positions, normals, uvs, indices };
}

// Helper function to create just the inner/rebate face of a frame edge (for oak material)
// These faces are flipped to be visible from the BACK of the frame (behind artwork)
function createFrameEdgeInnerFace(
  side: 'top' | 'bottom' | 'left' | 'right',
  outerLength: number,
  faceW: number,
  depth: number,
  innerZ: number = 0 // How far back the inner face starts (for rebate)
): { positions: number[]; normals: number[]; uvs: number[]; indices: number[] } {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  
  const fw = faceW;
  const d = depth;
  const halfOuter = outerLength / 2;
  const halfInner = halfOuter - fw;
  
  // Flipped winding order for back-facing visibility
  const addQuad = (
    p0: number[], p1: number[], p2: number[], p3: number[],
    nx: number, ny: number, nz: number
  ) => {
    const base = positions.length / 3;
    // Reverse vertex order for back-facing
    [p3, p2, p1, p0].forEach(p => positions.push(...p));
    // Flip normals to point outward (away from frame center)
    for (let i = 0; i < 4; i++) normals.push(-nx, -ny, -nz);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  
  if (side === 'top') {
    const yI = -fw / 2;
    // Original normal was (0, -1, 0), flipped to (0, 1, 0) - visible from back
    addQuad(
      [halfInner, yI, innerZ], [-halfInner, yI, innerZ],
      [-halfInner, yI, -d], [halfInner, yI, -d],
      0, -1, 0
    );
  } else if (side === 'bottom') {
    const yI = fw / 2;
    addQuad(
      [-halfInner, yI, innerZ], [halfInner, yI, innerZ],
      [halfInner, yI, -d], [-halfInner, yI, -d],
      0, 1, 0
    );
  } else if (side === 'left') {
    const xI = fw / 2;
    addQuad(
      [xI, halfInner, innerZ], [xI, -halfInner, innerZ],
      [xI, -halfInner, -d], [xI, halfInner, -d],
      1, 0, 0
    );
  } else { // right
    // Right inner wall - back-facing version (oak texture)
    // For back-facing with +X normal (flipped from front's -X):
    //   Standing at +X looking toward -X: +Y is up, +Z is to your right
    //   CCW order: top-front → top-back → bottom-back → bottom-front
    // The addQuad reverses vertices [p3,p2,p1,p0] and flips normal
    const xI = -fw / 2;
    addQuad(
      [xI, halfInner, innerZ],   // p0: top-front
      [xI, -halfInner, innerZ],  // p1: bottom-front
      [xI, -halfInner, -d],      // p2: bottom-back
      [xI, halfInner, -d],       // p3: top-back
      -1, 0, 0  // Will be flipped to +1, 0, 0 by addQuad
    );
  }
  
  return { positions, normals, uvs, indices };
}

// Create small cap faces to close off the frame rebate at the inner corners
// These prevent seeing through the gap between the mount and frame
function createFrameRebateCap(
  innerW: number, // full inner width
  innerH: number, // full inner height
  rebateDepth: number, // how deep the rebate goes (Z axis)
  faceW: number // frame face width
): { positions: number[]; normals: number[]; uvs: number[]; indices: number[] } {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  
  const iw = innerW / 2;
  const ih = innerH / 2;
  const rd = rebateDepth;
  
  const addQuad = (
    p0: number[], p1: number[], p2: number[], p3: number[],
    nx: number, ny: number, nz: number
  ) => {
    const base = positions.length / 3;
    [p0, p1, p2, p3].forEach(p => positions.push(...p));
    for (let i = 0; i < 4; i++) normals.push(nx, ny, nz);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  
  // Create a small shelf face at each side that closes off the rebate opening
  // Using ensureCCWWinding to automatically correct vertex order for Apple AR Quick Look
  
  // Top rebate cap - horizontal shelf facing up
  createCCWQuad(
    [-iw, ih, 0], [iw, ih, 0],
    [iw, ih, -rd], [-iw, ih, -rd],
    0, 1, 0, addQuad
  );
  
  // Bottom rebate cap - horizontal shelf facing down
  createCCWQuad(
    [-iw, -ih, 0], [iw, -ih, 0],
    [iw, -ih, -rd], [-iw, -ih, -rd],
    0, -1, 0, addQuad
  );
  
  // Left rebate cap - vertical shelf facing left (-X normal)
  // For -X normal, CCW when viewed from -X: bottom-front → top-front → top-back → bottom-back
  addQuad(
    [-iw, -ih, 0], [-iw, ih, 0],
    [-iw, ih, -rd], [-iw, -ih, -rd],
    -1, 0, 0
  );
  
  // Right rebate cap - vertical shelf facing right (+X normal)
  // For +X normal, CCW when viewed from +X: bottom-back → top-back → top-front → bottom-front
  addQuad(
    [iw, -ih, -rd], [iw, ih, -rd],
    [iw, ih, 0], [iw, -ih, 0],
    1, 0, 0
  );
  
  return { positions, normals, uvs, indices };
}

// Export function to get UV debug log
export function getUVDebugLog(): string[] {
  return (globalThis as any).__uvDebugLog || [];
}

export function clearUVDebugLog(): void {
  (globalThis as any).__uvDebugLog = [];
}

function createPlaneGeometry(
  width: number, 
  height: number, 
  flipUV: boolean = false, 
  faceBackward: boolean = false,
  customUVs?: { uMin: number; uMax: number; vMin: number; vMax: number }
): {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
} {
  const w = width / 2;
  const h = height / 2;
  
  // Default UVs: bottom-left origin (standard GLTF)
  // Flipped UVs: top-left origin (for image textures)
  // Custom UVs: for cover-mode cropping
  let uvs: number[];
  
  if (customUVs) {
    const { uMin, uMax, vMin, vMax } = customUVs;
    if (flipUV) {
      // Flipped for correct image orientation (top-left origin)
      uvs = [uMin, vMax, uMax, vMax, uMax, vMin, uMin, vMin];
    } else {
      uvs = [uMin, vMin, uMax, vMin, uMax, vMax, uMin, vMax];
    }
  } else {
    uvs = flipUV 
      ? [0, 1, 1, 1, 1, 0, 0, 0]  // Flipped for correct image orientation
      : [0, 0, 1, 0, 1, 1, 0, 1];
  }
  
  // faceBackward: For elements visible from behind (like backing/sticker)
  // Normals point -Z and winding is reversed for proper culling in AR Quick Look
  if (faceBackward) {
    return {
      positions: [-w, -h, 0, w, -h, 0, w, h, 0, -w, h, 0],
      normals: [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1],
      uvs: [0, 0, 1, 0, 1, 1, 0, 1], // Standard UVs - text reads correctly when viewed from behind
      indices: [0, 2, 1, 0, 3, 2], // Reversed winding
    };
  }
  
  return {
    positions: [-w, -h, 0, w, -h, 0, w, h, 0, -w, h, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs,
    indices: [0, 1, 2, 0, 2, 3],
  };
}

export async function generateFrameGLB(config: FrameConfig): Promise<Buffer> {
  // Yield to allow other requests through before starting
  await yieldEventLoop();
  
  const {
    artworkWidthMm: inputWidthMm,
    artworkHeightMm: inputHeightMm,
    mountBorderMm = 50,
    frameStyle = "black",
    frameType = "standard",
  } = config;
  
  // Apply defaults based on frame type (box frames are deeper and wider, canvas frames are narrow tray style)
  const isBoxFrame = frameType === "box";
  const isCanvasFrame = frameType === "canvas";
  const frameWidthMm = config.frameWidthMm ?? (isCanvasFrame ? CANVAS_FRAME_DEFAULTS.frameWidthMm : isBoxFrame ? BOX_FRAME_DEFAULTS.frameWidthMm : 20);
  const frameDepthMm = config.frameDepthMm ?? (isCanvasFrame ? CANVAS_FRAME_DEFAULTS.frameDepthMm : isBoxFrame ? BOX_FRAME_DEFAULTS.frameDepthMm : 22);
  const rebateWidthMm = config.rebateWidthMm ?? (isCanvasFrame ? CANVAS_FRAME_DEFAULTS.rebateWidthMm : isBoxFrame ? BOX_FRAME_DEFAULTS.rebateWidthMm : 5);
  const rebateDepthMm = config.rebateDepthMm ?? (isCanvasFrame ? CANVAS_FRAME_DEFAULTS.rebateDepthMm : isBoxFrame ? BOX_FRAME_DEFAULTS.rebateDepthMm : 17);
  const floatGapMm = isBoxFrame ? BOX_FRAME_DEFAULTS.floatGapMm : 0;
  const canvasGapMm = isCanvasFrame ? CANVAS_FRAME_DEFAULTS.gapMm : 0;
  
  // Build level for incremental testing (default: 8 = full frame with hangers and sticker)
  const buildLevel = config.buildLevel ?? 8;
  
  console.log(`[AR] Frame type: ${frameType}, style: ${frameStyle}, dimensions: ${frameWidthMm}mm face, ${frameDepthMm}mm depth, buildLevel: ${buildLevel}`);

  // Load texture first to detect orientation
  let textureImage: { data: string; width: number; height: number } | null = null;
  if (config.artworkImageUrl) {
    textureImage = await loadImageAsBase64(config.artworkImageUrl);
    // Yield after loading texture (can be memory intensive)
    await yieldEventLoop();
  }

  // Detect orientation from actual image and adjust dimensions if needed
  let artworkWidthMm = inputWidthMm;
  let artworkHeightMm = inputHeightMm;
  
  if (textureImage) {
    const imageIsLandscape = textureImage.width > textureImage.height;
    const dimsAreLandscape = inputWidthMm > inputHeightMm;
    
    // If image orientation doesn't match dimension orientation, swap dimensions
    if (imageIsLandscape !== dimsAreLandscape) {
      console.log(`[AR] Swapping dimensions to match image orientation: ${textureImage.width}x${textureImage.height}`);
      artworkWidthMm = inputHeightMm;
      artworkHeightMm = inputWidthMm;
    }
  }

  const mmToM = 0.001;
  const faceW = frameWidthMm * mmToM;       // 20mm face width
  const totalD = frameDepthMm * mmToM;      // 22mm total depth
  const rebateW = rebateWidthMm * mmToM;    // 5mm rebate width
  const rebateD = rebateDepthMm * mmToM;    // 17mm rebate depth
  const frontD = totalD - rebateD;          // 5mm front lip depth (22-17)
  const canvasGap = canvasGapMm * mmToM;    // 5mm gap between frame and canvas
  const mountB = isCanvasFrame ? 0 : mountBorderMm * mmToM;

  // Frame inner opening = product size (stays constant regardless of mount)
  const innerW = artworkWidthMm * mmToM;
  const innerH = artworkHeightMm * mmToM;
  
  // Calculate artwork dimensions
  // Without mount: artwork fills the frame inner opening
  // With mount: artwork scales to FILL the aperture completely (cover mode)
  //             maintaining aspect ratio but cropping if needed
  let artW: number;
  let artH: number;
  
  // Cover-mode UV cropping: when artwork aspect ratio differs from display area
  // we crop the image to fill the area completely (center-crop)
  let artworkUVs: { uMin: number; uMax: number; vMin: number; vMax: number } | undefined;
  
  if (mountB > 0) {
    // Mount aperture (available space after mount borders) - artwork fills this
    const apertureW = innerW - 2 * mountB;
    const apertureH = innerH - 2 * mountB;
    
    // Artwork fills the aperture completely
    artW = apertureW;
    artH = apertureH;
    
    // Calculate cover-mode UVs if we have image dimensions
    if (textureImage) {
      const imageAspect = textureImage.width / textureImage.height;
      const apertureAspect = apertureW / apertureH;
      
      console.log(`[AR] Image: ${textureImage.width}x${textureImage.height} (aspect ${imageAspect.toFixed(3)})`);
      console.log(`[AR] Aperture: ${(apertureW*1000).toFixed(0)}x${(apertureH*1000).toFixed(0)}mm (aspect ${apertureAspect.toFixed(3)})`);
      
      if (Math.abs(imageAspect - apertureAspect) > 0.01) {
        // Aspect ratios differ - need to crop
        if (imageAspect > apertureAspect) {
          // Image is wider than aperture - crop horizontally (scale to cover short edge = height)
          const uvWidth = apertureAspect / imageAspect;
          const uvOffset = (1 - uvWidth) / 2;
          artworkUVs = { uMin: uvOffset, uMax: 1 - uvOffset, vMin: 0, vMax: 1 };
          console.log(`[AR] Cover crop: image wider, crop sides. UVs: u=${uvOffset.toFixed(3)}-${(1-uvOffset).toFixed(3)}, v=0-1`);
        } else {
          // Image is taller than aperture - crop vertically (scale to cover short edge = width)
          const uvHeight = imageAspect / apertureAspect;
          const uvOffset = (1 - uvHeight) / 2;
          artworkUVs = { uMin: 0, uMax: 1, vMin: uvOffset, vMax: 1 - uvOffset };
          console.log(`[AR] Cover crop: image taller, crop top/bottom. UVs: u=0-1, v=${uvOffset.toFixed(3)}-${(1-uvOffset).toFixed(3)}`);
        }
      } else {
        console.log(`[AR] No crop needed - aspects match`);
      }
    }
  } else {
    // No mount - artwork fills frame inner opening (or inset by gap for canvas)
    artW = isCanvasFrame ? innerW - 2 * canvasGap : innerW;
    artH = isCanvasFrame ? innerH - 2 * canvasGap : innerH;
    
    // Also apply cover-mode UVs for non-mount case
    if (textureImage) {
      const imageAspect = textureImage.width / textureImage.height;
      const frameAspect = artW / artH;
      
      if (Math.abs(imageAspect - frameAspect) > 0.01) {
        if (imageAspect > frameAspect) {
          const uvWidth = frameAspect / imageAspect;
          const uvOffset = (1 - uvWidth) / 2;
          artworkUVs = { uMin: uvOffset, uMax: 1 - uvOffset, vMin: 0, vMax: 1 };
        } else {
          const uvHeight = imageAspect / frameAspect;
          const uvOffset = (1 - uvHeight) / 2;
          artworkUVs = { uMin: 0, uMax: 1, vMin: uvOffset, vMax: 1 - uvOffset };
        }
      }
    }
  }
  
  const totalW = innerW + 2 * faceW;
  const totalH = innerH + 2 * faceW;

  // Load wood texture for wooden frames (oak, natural, ash), box frames, or canvas frames
  let woodTexture: { data: string; width: number; height: number } | null = null;
  let normalMapTexture: { data: string; width: number; height: number } | null = null;
  let roughnessMapTexture: { data: string; width: number; height: number } | null = null;
  if (frameStyle === "natural" && (frameType === "box" || frameType === "canvas")) {
    woodTexture = await loadBoxFrameTexture("ash");
    normalMapTexture = await loadBoxFrameNormalMap("ash");
  } else if (frameStyle === "natural" || frameStyle === "oak") {
    woodTexture = await loadWoodTexture("oak");
    normalMapTexture = await loadWoodNormalMap();
  } else if ((frameStyle === "black" || frameStyle === "white") && (frameType === "box" || frameType === "canvas")) {
    woodTexture = await loadBoxFrameTexture(frameStyle);
    normalMapTexture = await loadBoxFrameNormalMap(frameStyle);
    roughnessMapTexture = await loadBoxFrameRoughnessMap(frameStyle);
  }
  
  // Load MDF texture, normal map, and roughness map for frame backing (skip for canvas — no backing)
  const mdfTexture = isCanvasFrame ? null : await loadMDFTexture();
  const mdfNormalMap = isCanvasFrame ? null : await loadMDFNormalMap();
  const mdfRoughnessMap = isCanvasFrame ? null : await loadMDFRoughnessMap();
  
  // Load logo texture for branding
  const logoTexture = await loadLogoTexture();

  // Natural box/canvas frames use ash wood color (upgraded material)
  const effectiveFrameStyle = (frameStyle === "natural" && (frameType === "box" || frameType === "canvas")) ? "ash" : frameStyle;
  const frameColor = FRAME_COLORS[effectiveFrameStyle] || FRAME_COLORS.black;
  // Slightly cream/warm white mount to distinguish from pure white frames
  const mountColor: [number, number, number, number] = [0.96, 0.95, 0.93, 1.0];

  const meshes: Array<{
    geometry: ReturnType<typeof createBoxGeometry>;
    translation: [number, number, number];
    material: number;
  }> = [];

  // Coordinate system: z=0 is front of frame, negative z goes toward wall
  // - Front face: z = 0 to -frontD (0 to -5mm)
  // - Rebate area: z = -frontD to -totalD (-5mm to -22mm)
  // - Artwork sits 5mm from front (just inside rebate): z = -frontD - 0.001
  // - Mount sits behind artwork: z = -frontD - 0.003
  // - Backing at z = -totalD (-22mm)
  
  // Special test mode: buildLevel between 6 and 7 (e.g. 6.5) shows ONLY tape extrusion walls
  const extrusionTestMode = buildLevel > 6 && buildLevel < 7;
  
  // BUILD LEVEL 1: Frame shell (outer trapezoid edges)
  if (!extrusionTestMode) {
  // Frame edges - using trapezoid geometry with 45° mitre joints
  // Calculate longest side for uniform texture scaling across all edges
  const longestSide = Math.max(totalW, totalH);
  
  // For canvas frames, generate frame edges WITHOUT inner faces (they extend full depth
  // which creates a solid grey block). Instead we'll add shallow inner lip faces separately.
  // Standard/box frames get the normal full-depth inner faces.
  
  const sides: Array<{ side: 'top' | 'bottom' | 'left' | 'right'; outerLen: number; tx: number; ty: number }> = [
    { side: 'top', outerLen: totalW, tx: 0, ty: innerH / 2 + faceW / 2 },
    { side: 'bottom', outerLen: totalW, tx: 0, ty: -(innerH / 2 + faceW / 2) },
    { side: 'left', outerLen: totalH, tx: -(innerW / 2 + faceW / 2), ty: 0 },
    { side: 'right', outerLen: totalH, tx: innerW / 2 + faceW / 2, ty: 0 },
  ];

  for (const { side, outerLen, tx, ty } of sides) {
    if (isCanvasFrame) {
      meshes.push({
        geometry: createCanvasTrayFrameEdge(side, outerLen, faceW, totalD, frontD, longestSide),
        translation: [tx, ty, 0],
        material: 0,
      });
    } else {
      meshes.push({
        geometry: createTrapezoidFrameEdge(side, outerLen, faceW, totalD, longestSide),
        translation: [tx, ty, 0],
        material: 0,
      });
    }

    meshes.push({
      geometry: createFrameEdgeBackFace(side, outerLen, faceW, totalD),
      translation: [tx, ty, 0],
      material: 5,
    });
  }

  // BUILD LEVEL 2: Artwork plane
  if (buildLevel >= 2) {
    // Canvas frames: artwork sits slightly behind frame front (recessed into tray)
    // Standard/box: behind front lip or mount
    const artworkZ = isCanvasFrame ? -frontD - 0.001 : (mountB > 0 ? -frontD - MOUNT_THICKNESS : -frontD - 0.001);
    meshes.push({
      geometry: createPlaneGeometry(artW, artH, false, false, artworkUVs),
      translation: [0, 0, artworkZ],
      material: 2, // artwork material (with texture)
    });

    // Canvas frame gap: dark shadow gap visible between frame lip and canvas artwork
    // The frame lip (inner face) only extends frontD deep. Behind that, the gap channel
    // is visible as a dark recessed strip. It consists of:
    // 1. A front-facing ring at z=-frontD (the bottom of the lip channel)
    // 2. Inner depth walls from z=-frontD extending back behind the artwork
    if (isCanvasFrame && canvasGap > 0) {
      const hw = innerW / 2;
      const hh = innerH / 2;
      const cw = artW / 2;
      const ch = artH / 2;
      const zLip = -frontD;
      const zArt = artworkZ - 0.0005;

      const gapPositions: number[] = [];
      const gapNormals: number[] = [];
      const gapUvs: number[] = [];
      const gapIndices: number[] = [];

      const addGapQuad = (
        p0: number[], p1: number[], p2: number[], p3: number[], n: number[]
      ) => {
        const base = gapPositions.length / 3;
        gapPositions.push(...p0, ...p1, ...p2, ...p3);
        gapNormals.push(...n, ...n, ...n, ...n);
        gapUvs.push(0, 0, 1, 0, 1, 1, 0, 1);
        gapIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      };

      // Front-facing ring at the bottom of the lip (z = -frontD)
      // Left strip
      addGapQuad([-hw, hh, zLip], [-cw, hh, zLip], [-cw, -hh, zLip], [-hw, -hh, zLip], [0, 0, 1]);
      // Right strip
      addGapQuad([cw, hh, zLip], [hw, hh, zLip], [hw, -hh, zLip], [cw, -hh, zLip], [0, 0, 1]);
      // Top strip
      addGapQuad([-cw, hh, zLip], [cw, hh, zLip], [cw, ch, zLip], [-cw, ch, zLip], [0, 0, 1]);
      // Bottom strip
      addGapQuad([-cw, -ch, zLip], [cw, -ch, zLip], [cw, -hh, zLip], [-cw, -hh, zLip], [0, 0, 1]);

      // Inner depth walls: from lip bottom (zLip) to artwork plane (zArt)
      // Left wall (facing right, +X normal)
      addGapQuad([-cw, -hh, zLip], [-cw, hh, zLip], [-cw, hh, zArt], [-cw, -hh, zArt], [1, 0, 0]);
      // Right wall (facing left, -X normal)
      addGapQuad([cw, hh, zLip], [cw, -hh, zLip], [cw, -hh, zArt], [cw, hh, zArt], [-1, 0, 0]);
      // Top wall (facing down, -Y normal)
      addGapQuad([-cw, ch, zLip], [cw, ch, zLip], [cw, ch, zArt], [-cw, ch, zArt], [0, -1, 0]);
      // Bottom wall (facing up, +Y normal)
      addGapQuad([cw, -ch, zLip], [-cw, -ch, zLip], [-cw, -ch, zArt], [cw, -ch, zArt], [0, 1, 0]);

      meshes.push({
        geometry: { positions: gapPositions, normals: gapNormals, uvs: gapUvs, indices: gapIndices },
        translation: [0, 0, 0],
        material: 10,
      });
    }
  }

  // BUILD LEVEL 3: Mount (white border with chamfered window)
  if (buildLevel >= 3 && mountB > 0) {
    // Mount sits at frame rebate level (behind frame front lip)
    // Outer size extends slightly past frame inner edge to cover the rebate face
    const mountOverlap = 0.001; // 1mm overlap to cover frame rebate
    const mountOuterW = innerW + mountOverlap * 2;
    const mountOuterH = innerH + mountOverlap * 2;
    
    // Mount aperture (inner window) has EVEN borders all around
    // The artwork is centered within this aperture
    const apertureW = innerW - 2 * mountB;
    const apertureH = innerH - 2 * mountB;
    
    meshes.push({
      geometry: createChamferedMountGeometry(mountOuterW, mountOuterH, apertureW, apertureH, MOUNT_THICKNESS, MOUNT_CHAMFER),
      translation: [0, 0, -frontD + 0.0001], // Slightly in front of rebate to cover it
      material: 1, // mount material
    });
  }

  // BUILD LEVEL 4: (Previously rebate walls - removed as rebate appearance is created by mount/artwork setback)

  // BUILD LEVEL 5: Backing (MDF) — skip for canvas frames (open back with stretcher bars)
  // Define backingZ outside the conditional so it's available for tape extrusions
  } // Temporarily close !extrusionTestMode to define backingZ
  const backingZ = mountB > 0 ? -frontD - MOUNT_THICKNESS - 0.003 : -frontD - 0.003;
  if (!extrusionTestMode && buildLevel >= 5 && !isCanvasFrame) {
    meshes.push({
      geometry: createPlaneGeometry(innerW, innerH, false, true),
      translation: [0, 0, backingZ],
      material: 3, // MDF backing material
    });
  }
  
  // BUILD LEVEL 6: L-shaped tape strips that wrap from backing to frame back
  // Skip for canvas frames (no backing = no tape)
  // Use buildLevel 6.5 to show ONLY the extruded walls for testing
  if (buildLevel >= 6 && !isCanvasFrame) {
  const frameBackZ = -totalD;
  const tapeWidth = 0.050; // 50mm tape width
  const halfTape = tapeWidth / 2;
  const offset = 0.0002; // 0.2mm offset to prevent z-fighting
  // Test mode: only show extrusion walls (use buildLevel between 6 and 7, like 6.5)
  const extrusionOnly = buildLevel > 6 && buildLevel < 7;
  
  // Tape wraps in L-shape: half on backing, half on frame back
  const iw = innerW / 2;
  const ih = innerH / 2;
  
  // Helper to create L-shaped tape for each side
  const createLTape = (side: 'top' | 'bottom' | 'left' | 'right') => {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    
    const addQuad = (p0: number[], p1: number[], p2: number[], p3: number[], n: number[]) => {
      const base = positions.length / 3;
      positions.push(...p0, ...p1, ...p2, ...p3);
      normals.push(...n, ...n, ...n, ...n);
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    
    const outerEdge = faceW - offset; // How far tape extends onto frame back
    const wallThickness = 0.003; // 3mm thick solid walls
    const extendPastFrame = 0.0002; // Extend 0.2mm past frame back to cover wooden edge
    
    // Helper to create a solid box with all 6 faces (CCW winding for Apple AR)
    const addSolidBox = (
      minX: number, maxX: number,
      minY: number, maxY: number,
      minZ: number, maxZ: number
    ) => {
      // Front face (facing -Z)
      addQuad(
        [minX, maxY, minZ], [maxX, maxY, minZ],
        [maxX, minY, minZ], [minX, minY, minZ],
        [0, 0, -1]
      );
      // Back face (facing +Z)
      addQuad(
        [maxX, maxY, maxZ], [minX, maxY, maxZ],
        [minX, minY, maxZ], [maxX, minY, maxZ],
        [0, 0, 1]
      );
      // Top face (facing +Y)
      addQuad(
        [minX, maxY, maxZ], [maxX, maxY, maxZ],
        [maxX, maxY, minZ], [minX, maxY, minZ],
        [0, 1, 0]
      );
      // Bottom face (facing -Y)
      addQuad(
        [maxX, minY, maxZ], [minX, minY, maxZ],
        [minX, minY, minZ], [maxX, minY, minZ],
        [0, -1, 0]
      );
      // Left face (facing -X)
      addQuad(
        [minX, maxY, maxZ], [minX, maxY, minZ],
        [minX, minY, minZ], [minX, minY, maxZ],
        [-1, 0, 0]
      );
      // Right face (facing +X)
      addQuad(
        [maxX, maxY, minZ], [maxX, maxY, maxZ],
        [maxX, minY, maxZ], [maxX, minY, minZ],
        [1, 0, 0]
      );
    };
    
    switch (side) {
      case 'top': {
        const left = -(iw + faceW) + offset;
        const right = (iw + faceW) - offset;
        // Shorten to avoid corner overlap with left/right walls
        const innerLeft = -iw + wallThickness;
        const innerRight = iw - wallThickness;
        // Section on backing
        if (!extrusionOnly) {
          addQuad(
            [left, ih, backingZ - offset], [right, ih, backingZ - offset],
            [right, ih - halfTape, backingZ - offset], [left, ih - halfTape, backingZ - offset],
            [0, 0, -1]
          );
        }
        // Solid extruded wall from frame back to backing (along top inner edge)
        addSolidBox(
          innerLeft, innerRight,          // X range: between left/right walls
          ih - wallThickness, ih,         // Y range: 3mm thick at inner edge
          frameBackZ - extendPastFrame, backingZ  // Z range: extend 1mm past frame back
        );
        // Section on frame back (extended inward to meet wall)
        if (!extrusionOnly) {
          addQuad(
            [left, ih + outerEdge, frameBackZ - offset], [right, ih + outerEdge, frameBackZ - offset],
            [right, ih, frameBackZ - offset], [left, ih, frameBackZ - offset],
            [0, 0, -1]
          );
        }
        break;
      }
      case 'bottom': {
        const left = -(iw + faceW) + offset;
        const right = (iw + faceW) - offset;
        // Shorten to avoid corner overlap with left/right walls
        const innerLeft = -iw + wallThickness;
        const innerRight = iw - wallThickness;
        // Section on backing
        if (!extrusionOnly) {
          addQuad(
            [left, -ih + halfTape, backingZ - offset], [right, -ih + halfTape, backingZ - offset],
            [right, -ih, backingZ - offset], [left, -ih, backingZ - offset],
            [0, 0, -1]
          );
        }
        // Solid extruded wall from frame back to backing (along bottom inner edge)
        addSolidBox(
          innerLeft, innerRight,          // X range: between left/right walls
          -ih, -ih + wallThickness,       // Y range: 3mm thick at inner edge
          frameBackZ - extendPastFrame, backingZ  // Z range: extend 1mm past frame back
        );
        // Section on frame back (extended inward to meet wall)
        if (!extrusionOnly) {
          addQuad(
            [left, -ih, frameBackZ - offset], [right, -ih, frameBackZ - offset],
            [right, -ih - outerEdge, frameBackZ - offset], [left, -ih - outerEdge, frameBackZ - offset],
            [0, 0, -1]
          );
        }
        break;
      }
      case 'left': {
        const top = ih;
        const bottom = -ih;
        // Section on backing
        if (!extrusionOnly) {
          addQuad(
            [-iw, top, backingZ - offset], [-iw + halfTape, top, backingZ - offset],
            [-iw + halfTape, bottom, backingZ - offset], [-iw, bottom, backingZ - offset],
            [0, 0, -1]
          );
        }
        // Solid extruded wall from frame back to backing (along left inner edge)
        addSolidBox(
          -iw, -iw + wallThickness,       // X range: 3mm thick at inner edge
          bottom, top,                    // Y range: full height
          frameBackZ - extendPastFrame, backingZ  // Z range: extend 1mm past frame back
        );
        // Section on frame back (extended inward to meet wall)
        if (!extrusionOnly) {
          addQuad(
            [-iw - outerEdge, top, frameBackZ - offset], [-iw, top, frameBackZ - offset],
            [-iw, bottom, frameBackZ - offset], [-iw - outerEdge, bottom, frameBackZ - offset],
            [0, 0, -1]
          );
        }
        break;
      }
      case 'right': {
        const top = ih;
        const bottom = -ih;
        // Section on backing
        if (!extrusionOnly) {
          addQuad(
            [iw - halfTape, top, backingZ - offset], [iw, top, backingZ - offset],
            [iw, bottom, backingZ - offset], [iw - halfTape, bottom, backingZ - offset],
            [0, 0, -1]
          );
        }
        // Solid extruded wall from frame back to backing (along right inner edge)
        addSolidBox(
          iw - wallThickness, iw,         // X range: 3mm thick at inner edge
          bottom, top,                    // Y range: full height
          frameBackZ - extendPastFrame, backingZ  // Z range: extend 1mm past frame back
        );
        // Section on frame back (extended inward to meet wall)
        if (!extrusionOnly) {
          addQuad(
            [iw, top, frameBackZ - offset], [iw + outerEdge, top, frameBackZ - offset],
            [iw + outerEdge, bottom, frameBackZ - offset], [iw, bottom, frameBackZ - offset],
            [0, 0, -1]
          );
        }
        break;
      }
    }
    
    return { positions, normals, uvs, indices };
  };
  
  // Add all 4 L-shaped tape strips
  meshes.push({ geometry: createLTape('top'), translation: [0, 0, 0], material: 8 });
  meshes.push({ geometry: createLTape('bottom'), translation: [0, 0, 0], material: 8 });
  meshes.push({ geometry: createLTape('left'), translation: [0, 0, 0], material: 8 });
  meshes.push({ geometry: createLTape('right'), translation: [0, 0, 0], material: 8 });
  } // End BUILD LEVEL 6

  // BUILD LEVEL 7: Hangers (skip for canvas — no backing to attach to)
  if (buildLevel >= 7 && !isCanvasFrame) {
  // Frame hanger on back of frame
  // Load and add the hanger model
  const hangerData = await loadHangerGLB();
  const hangerMaterialIndices: number[] = []; // Track material indices for hanger meshes
  
  if (hangerData && !config.skipHanger) {
    // Calculate hanger bounds to determine scale and position
    const hangerWidth = hangerData.bounds.maxX - hangerData.bounds.minX;
    const hangerHeight = hangerData.bounds.maxY - hangerData.bounds.minY;
    const hangerDepth = hangerData.bounds.maxZ - hangerData.bounds.minZ;
    
    // Target size: hanger should be about 30mm wide (0.03m)
    const targetWidth = 0.030; // 30mm
    const scale = targetWidth / hangerWidth;
    
    const hangerCenterX = (hangerData.bounds.minX + hangerData.bounds.maxX) / 2;
    const hangerCenterY = (hangerData.bounds.minY + hangerData.bounds.maxY) / 2;
    const hangerCenterZ = (hangerData.bounds.minZ + hangerData.bounds.maxZ) / 2;
    
    // Helper function to convert Euler angles to quaternion (XYZ order)
    const eulerToQuaternion = (rotXDeg: number, rotYDeg: number, rotZDeg: number) => {
      const rx = rotXDeg * Math.PI / 180;
      const ry = rotYDeg * Math.PI / 180;
      const rz = rotZDeg * Math.PI / 180;
      
      const c1 = Math.cos(rx / 2), s1 = Math.sin(rx / 2);
      const c2 = Math.cos(ry / 2), s2 = Math.sin(ry / 2);
      const c3 = Math.cos(rz / 2), s3 = Math.sin(rz / 2);
      
      return {
        qx: s1 * c2 * c3 + c1 * s2 * s3,
        qy: c1 * s2 * c3 - s1 * c2 * s3,
        qz: c1 * c2 * s3 + s1 * s2 * c3,
        qw: c1 * c2 * c3 - s1 * s2 * s3,
      };
    };
    
    // Helper function to create scaled hanger mesh positions
    const createScaledPositions = (hangerMesh: typeof hangerData.meshes[0]) => {
      const scaledPositions: number[] = [];
      for (let i = 0; i < hangerMesh.positions.length; i += 3) {
        const x = (hangerMesh.positions[i] - hangerCenterX) * scale;
        const y = (hangerMesh.positions[i + 1] - hangerCenterY) * scale;
        const z = (hangerMesh.positions[i + 2] - hangerCenterZ) * scale;
        scaledPositions.push(x, y, z);
      }
      return scaledPositions;
    };
    
    // Portrait hanger (top center, for hanging in portrait orientation)
    // Rotation and position values - use config overrides if provided, otherwise defaults
    const PORTRAIT_ROT_X = config.hangerRotX ?? -90;
    const PORTRAIT_ROT_Y = config.hangerRotY ?? -89;
    const PORTRAIT_ROT_Z = config.hangerRotZ ?? 180;
    const PORTRAIT_POS_X = (config.hangerPosX ?? 0) / 1000;
    const PORTRAIT_POS_Y = (config.hangerPosY ?? 25) / 1000;
    
    // Portrait hanger position constants
    const PORTRAIT_POS_Z = (config.hangerPosZ ?? -5) / 1000;
    
    // Portrait hanger position: centered horizontally, 15% down from top
    const portraitHangerY = innerH / 2 - (innerH * 0.15);
    const portraitQ = eulerToQuaternion(PORTRAIT_ROT_X, PORTRAIT_ROT_Y, PORTRAIT_ROT_Z);
    
    // Landscape hangers (left side, for hanging in landscape orientation)
    // rotX=-90, rotY=1, rotZ=180, positioned 15% from left edge
    const LANDSCAPE_ROT_X = -90;
    const LANDSCAPE_ROT_Y = 1;
    const LANDSCAPE_ROT_Z = 180;
    const LANDSCAPE_POS_Y_OFFSET = -0.010; // -10mm
    const LANDSCAPE_POS_Z_OFFSET = -0.005; // -5mm
    
    const landscapeQ = eulerToQuaternion(LANDSCAPE_ROT_X, LANDSCAPE_ROT_Y, LANDSCAPE_ROT_Z);
    
    // Determine hanger configuration based on frame size
    // Use the longer dimension to categorize the frame
    const longSideMm = Math.max(config.artworkWidthMm, config.artworkHeightMm);
    
    // Detect if artwork is landscape (width > height)
    const isLandscape = artworkWidthMm > artworkHeightMm;
    
    // Size thresholds (in mm):
    // - Small: A3 (420mm) / 12"x16" (406mm) and smaller → 1 top, 1 side
    // - Medium: Larger than A3 up to A1 (841mm) → 2 top, 1 side
    // - Large: A1 (841mm) and larger → 2 top, 2 side
    const SMALL_THRESHOLD = 420;  // A3 long side
    const LARGE_THRESHOLD = 841;  // A1 long side
    
    const isSmall = longSideMm <= SMALL_THRESHOLD;
    const isLarge = longSideMm >= LARGE_THRESHOLD;
    
    // For portrait: top hangers are for portrait hanging, side hangers for landscape alternative
    // For landscape: top hangers are for landscape hanging, side hangers for portrait alternative
    // In both cases: more hangers on the "primary" edge (top), fewer on "secondary" edge (side)
    const numTopHangers = isLarge ? 2 : (isSmall ? 1 : 2);
    const numSideHangers = isSmall ? 1 : (isLarge ? 2 : 1);
    
    let hangerCount = 0;
    
    // Helper to add a hanger mesh
    const addHanger = (x: number, y: number, z: number, q: { qx: number; qy: number; qz: number; qw: number }) => {
      for (const hangerMesh of hangerData.meshes) {
        const scaledPositions = createScaledPositions(hangerMesh);
        meshes.push({
          geometry: {
            positions: [...scaledPositions],
            normals: hangerMesh.normals,
            uvs: hangerMesh.uvs,
            indices: hangerMesh.indices,
          },
          translation: [x, y, z],
          rotation: [q.qx, q.qy, q.qz, q.qw],
          material: 9,
        });
        hangerMaterialIndices.push(9);
        hangerCount++;
      }
    };
    
    // For LANDSCAPE artworks: swap the hanger positions
    // - Top edge hangers use landscape rotation (for primary landscape hanging)
    // - Left edge hangers use portrait rotation (for secondary portrait hanging)
    // For PORTRAIT artworks: use original positions
    // - Top edge hangers use portrait rotation (for primary portrait hanging)
    // - Left edge hangers use landscape rotation (for secondary landscape hanging)
    
    // Minimum distance constraints to prevent hangers from intersecting frame edges
    // Hangers are ~30mm wide after scaling, so we need at least 30mm clearance from edges
    const HANGER_HALF_SIZE = 0.020; // 20mm half-size for safety margin
    const MIN_EDGE_CLEARANCE = 0.030; // 30mm minimum from backing edge
    const MIN_SPACING = 0.040; // 40mm minimum spacing from center for paired hangers
    
    // Calculate safe bounds for hanger placement (staying within backing area)
    const maxHangerX = innerW / 2 - MIN_EDGE_CLEARANCE;
    const maxHangerY = innerH / 2 - MIN_EDGE_CLEARANCE;
    
    // Helper to clamp a value within safe bounds
    const clampX = (x: number) => Math.max(-maxHangerX, Math.min(maxHangerX, x));
    const clampY = (y: number) => Math.max(-maxHangerY, Math.min(maxHangerY, y));
    
    if (isLandscape) {
      // LANDSCAPE: Top hangers use landscape rotation, side hangers use portrait rotation
      // Top edge position (15% down from top, but clamped to safe bounds)
      const rawTopHangerY = innerH / 2 - (innerH * 0.15);
      const topHangerY = Math.min(rawTopHangerY, maxHangerY);
      
      // Left edge position (15% from left edge, but clamped)
      const rawSideHangerX = innerW / 2 - (innerW * 0.15);
      const sideHangerX = Math.min(rawSideHangerX, maxHangerX);
      
      // Add top hangers (landscape rotation for landscape hanging)
      if (numTopHangers === 1) {
        addHanger(0, topHangerY + LANDSCAPE_POS_Y_OFFSET, backingZ + LANDSCAPE_POS_Z_OFFSET, portraitQ);
      } else {
        // Calculate spacing, but ensure minimum and don't exceed safe bounds
        const rawSpacing = innerW * 0.30;
        const topSpacing = Math.max(MIN_SPACING, Math.min(rawSpacing, maxHangerX));
        addHanger(-topSpacing, topHangerY + LANDSCAPE_POS_Y_OFFSET, backingZ + LANDSCAPE_POS_Z_OFFSET, portraitQ);
        addHanger(topSpacing, topHangerY + LANDSCAPE_POS_Y_OFFSET, backingZ + LANDSCAPE_POS_Z_OFFSET, portraitQ);
      }
      
      // Add side hangers (portrait rotation for portrait alternative)
      if (numSideHangers === 1) {
        addHanger(sideHangerX, 0, backingZ + PORTRAIT_POS_Z, landscapeQ);
      } else {
        const rawSpacing = innerH * 0.30;
        const sideSpacing = Math.max(MIN_SPACING, Math.min(rawSpacing, maxHangerY));
        addHanger(sideHangerX, sideSpacing, backingZ + PORTRAIT_POS_Z, landscapeQ);
        addHanger(sideHangerX, -sideSpacing, backingZ + PORTRAIT_POS_Z, landscapeQ);
      }
      
      console.log(`[AR] LANDSCAPE: Added ${hangerCount} hangers (${numTopHangers} top + ${numSideHangers} side), size=${longSideMm}mm, scale=${scale.toFixed(3)}, maxX=${(maxHangerX*1000).toFixed(0)}mm, maxY=${(maxHangerY*1000).toFixed(0)}mm`);
    } else {
      // PORTRAIT: Top hangers use portrait rotation, side hangers use landscape rotation
      // Position at 15% from left edge (positive X when viewing from back), clamped
      const rawLandscapeHangerX = innerW / 2 - (innerW * 0.15);
      const landscapeHangerX = Math.min(rawLandscapeHangerX, maxHangerX);
      
      // Clamp portrait hanger Y position
      const safePortraitHangerY = Math.min(portraitHangerY + PORTRAIT_POS_Y, maxHangerY);
      
      // Add portrait hangers (along top edge for portrait hanging)
      if (numTopHangers === 1) {
        addHanger(0, safePortraitHangerY, backingZ + PORTRAIT_POS_Z, portraitQ);
      } else {
        const rawSpacing = innerW * 0.30;
        const portraitSpacing = Math.max(MIN_SPACING, Math.min(rawSpacing, maxHangerX));
        addHanger(-portraitSpacing, safePortraitHangerY, backingZ + PORTRAIT_POS_Z, portraitQ);
        addHanger(portraitSpacing, safePortraitHangerY, backingZ + PORTRAIT_POS_Z, portraitQ);
      }
      
      // Add landscape hangers (along left edge for landscape hanging)
      if (numSideHangers === 1) {
        addHanger(landscapeHangerX, clampY(LANDSCAPE_POS_Y_OFFSET), backingZ + LANDSCAPE_POS_Z_OFFSET, landscapeQ);
      } else {
        const rawSpacing = innerH * 0.30;
        const landscapeSpacing = Math.max(MIN_SPACING, Math.min(rawSpacing, maxHangerY));
        addHanger(landscapeHangerX, clampY(landscapeSpacing + LANDSCAPE_POS_Y_OFFSET), backingZ + LANDSCAPE_POS_Z_OFFSET, landscapeQ);
        addHanger(landscapeHangerX, clampY(-landscapeSpacing + LANDSCAPE_POS_Y_OFFSET), backingZ + LANDSCAPE_POS_Z_OFFSET, landscapeQ);
      }
      
      console.log(`[AR] PORTRAIT: Added ${hangerCount} hangers (${numTopHangers} top + ${numSideHangers} side), size=${longSideMm}mm, scale=${scale.toFixed(3)}, maxX=${(maxHangerX*1000).toFixed(0)}mm, maxY=${(maxHangerY*1000).toFixed(0)}mm`);
    }
  }
  } // End BUILD LEVEL 7

  // BUILD LEVEL 8: Logo sticker (skip for canvas — no backing surface)
  if (buildLevel >= 8 && !isCanvasFrame) {
  console.log(`[AR] BUILD LEVEL 8: Adding sticker, logoTexture loaded: ${!!logoTexture}`);
  // Rectangular sticker on backing - fixed size for all frames
  if (logoTexture) {
    // Fixed physical dimensions from the texture (80mm wide)
    const stickerWidth = logoTexture.physicalWidth;
    const stickerHeight = logoTexture.physicalHeight;
    
    // Position: left-bottom corner 20mm from tape perimeter
    // Tape inner edge is at (innerH/2 - halfTapeWidth) from center on backing
    const halfTapeWidth = 0.025; // 25mm half tape width
    const margin = 0.020; // 20mm from tape perimeter
    const tapeInnerEdgeX = innerW / 2 - halfTapeWidth;
    const tapeInnerEdgeY = innerH / 2 - halfTapeWidth;
    
    // Left-bottom corner of sticker is at (margin from tape edge)
    // So sticker center X = -tapeInnerEdgeX + margin + stickerWidth/2
    // And sticker center Y = -tapeInnerEdgeY + margin + stickerHeight/2
    const stickerX = -tapeInnerEdgeX + margin + stickerWidth / 2;
    const stickerY = -tapeInnerEdgeY + margin + stickerHeight / 2;
    
    meshes.push({
      geometry: createPlaneGeometry(stickerWidth, stickerHeight, false, true), // faceBackward for AR Quick Look compatibility
      translation: [stickerX, stickerY, backingZ - 0.001], // 1mm behind MDF (visible from back)
      material: 4, // Sticker material
    });
    console.log(`[AR] Added sticker: ${stickerWidth * 1000}mm x ${stickerHeight * 1000}mm at position (${stickerX.toFixed(4)}, ${stickerY.toFixed(4)}, ${(backingZ - 0.001).toFixed(4)})`);
  }
  } // End BUILD LEVEL 8

  // Build GLTF structure
  const gltf: any = {
    asset: { version: "2.0", generator: "East Side Studio AR Generator" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ children: meshes.map((_, i) => i + 1) }],
    meshes: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
    materials: [
      { // Frame material - satin finish
        pbrMetallicRoughness: {
          baseColorFactor: frameColor,
          metallicFactor: FRAME_MATERIALS[effectiveFrameStyle]?.metallic ?? 0.0,
          roughnessFactor: FRAME_MATERIALS[effectiveFrameStyle]?.roughness ?? 0.5,
        },
        doubleSided: true, // Ensure all frame faces are visible
      },
      { // Mount material
        pbrMetallicRoughness: {
          baseColorFactor: mountColor,
          metallicFactor: 0.0,
          roughnessFactor: 0.9,
        },
        doubleSided: true, // Ensure all mount faces are visible
      },
      { // Artwork material
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0.0,
          roughnessFactor: 0.5,
        },
        doubleSided: true,
      },
      { // Backing material (MDF texture)
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1], // White base for texture
          metallicFactor: 0.0,
          roughnessFactor: 0.8, // Slightly rough MDF finish
        },
        doubleSided: true, // Visible from both sides
      },
      { // Logo material (with alpha)
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0.0,
          roughnessFactor: 0.9,
        },
        alphaMode: "BLEND",
        doubleSided: true,
      },
      { // Material 5: Natural oak wood for frame backs (unpainted)
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1], // White base for texture
          metallicFactor: 0.0,
          roughnessFactor: 0.6, // Natural wood finish
        },
        doubleSided: false, // Single-sided - only visible from back (normals point backward)
      },
      { // Material 6: Painted frame for rebate walls (now using solid geometry)
        pbrMetallicRoughness: {
          baseColorFactor: frameColor,
          metallicFactor: FRAME_MATERIALS[effectiveFrameStyle]?.metallic ?? 0.0,
          roughnessFactor: FRAME_MATERIALS[effectiveFrameStyle]?.roughness ?? 0.5,
        },
        doubleSided: true, // Double-sided for solid wall geometry
      },
      { // Material 7: Black metal sawtooth hanger with metallic finish
        pbrMetallicRoughness: {
          baseColorFactor: [0.12, 0.12, 0.14, 1], // Dark steel color
          metallicFactor: 0.95, // High metallic
          roughnessFactor: 0.25, // Shiny metallic finish
        },
        doubleSided: true,
      },
      { // Material 8: Kraft tape for protective tape strips on frame back
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1], // White base for texture
          metallicFactor: 0.0,
          roughnessFactor: 0.7, // Slightly rough paper tape
        },
        doubleSided: false, // Only visible from back
      },
      { // Material 9: Frame hanger - metallic black finish
        pbrMetallicRoughness: {
          baseColorFactor: [0.08, 0.08, 0.1, 1], // Dark metallic
          metallicFactor: 0.9, // High metallic
          roughnessFactor: 0.3, // Slightly rough metal
        },
        doubleSided: true,
      },
      { // Material 10: Canvas gap — dark near-black gap between tray frame and canvas
        pbrMetallicRoughness: {
          baseColorFactor: [0.04, 0.04, 0.04, 1.0],
          metallicFactor: 0.0,
          roughnessFactor: 0.95,
        },
        doubleSided: true,
      },
    ],
  };

  // Add textures and samplers
  gltf.images = [];
  gltf.textures = [];
  gltf.samplers = [];
  
  // Sampler 0: LINEAR for artwork (smooth anti-aliased edges in WebGL)
  // Provides better visual quality on desktop model-viewer
  gltf.samplers.push({
    magFilter: 9729, // LINEAR - smooth interpolation
    minFilter: 9729, // LINEAR - smooth interpolation
    wrapS: 33071,    // CLAMP_TO_EDGE
    wrapT: 33071,
  });
  
  // Sampler 1: LINEAR (clamp to edge) - for materials like stickers, backing
  gltf.samplers.push({
    magFilter: 9729, // LINEAR
    minFilter: 9729, // LINEAR (no mipmaps - better Apple compatibility)
    wrapS: 33071,    // CLAMP_TO_EDGE
    wrapT: 33071,
  });
  
  // Sampler 2: Repeat/Tile - for wood grain and repeating textures
  gltf.samplers.push({
    magFilter: 9729, // LINEAR
    minFilter: 9729, // LINEAR (no mipmaps - better Apple compatibility)
    wrapS: 10497,    // REPEAT
    wrapT: 10497,
  });
  
  // Artwork texture (index 0) - using PNG for lossless quality
  if (textureImage) {
    console.log(`[AR] Adding artwork texture: ${textureImage.width}x${textureImage.height}, base64 length: ${textureImage.data.length}`);
    gltf.images.push({
      uri: `data:image/jpeg;base64,${textureImage.data}`,
    });
    gltf.textures.push({ source: gltf.images.length - 1, sampler: 0 });
    gltf.materials[2].pbrMetallicRoughness.baseColorTexture = { index: gltf.textures.length - 1 };
    console.log(`[AR] Artwork texture assigned to material 2, texture index: ${gltf.textures.length - 1}`);
  } else {
    console.log(`[AR] WARNING: No artwork texture loaded - artwork will appear blank`);
  }
  
  // Wood texture for frame (index 1) - uses repeat sampler for tiling
  if (woodTexture) {
    gltf.images.push({
      uri: `data:image/jpeg;base64,${woodTexture.data}`,
    });
    gltf.textures.push({ source: gltf.images.length - 1, sampler: 2 }); // Use repeat sampler
    // Apply wood texture to frame material and use white base color so texture shows properly
    gltf.materials[0].pbrMetallicRoughness.baseColorFactor = [1, 1, 1, 1];
    gltf.materials[0].pbrMetallicRoughness.baseColorTexture = { index: gltf.textures.length - 1 };
    // Keep the original roughness from FRAME_MATERIALS (black=0.35, white=0.4, oak=0.65, etc.)
  }
  
  // Normal map for frames - adds wood grain surface detail
  if (normalMapTexture) {
    gltf.images.push({
      uri: `data:image/png;base64,${normalMapTexture.data}`,
    });
    gltf.textures.push({ source: gltf.images.length - 1, sampler: 1 });
    // Normal scale by frame style:
    // white=2.5 (subtle grain needs emphasis), natural box=2.0 (ash wood), oak/natural standard=1.5, black=1.5
    const isNaturalBoxFrame = frameStyle === "natural" && frameType === "box";
    const normalScale = frameStyle === "white" ? 2.5 : 
                        isNaturalBoxFrame ? 2.0 : 
                        (frameStyle === "oak" || frameStyle === "natural") ? 1.5 : 1.5;
    gltf.materials[0].normalTexture = { 
      index: gltf.textures.length - 1,
      scale: normalScale
    };
    console.log(`[AR] Applied normal map to frame material (scale: ${normalScale})`);
  }
  
  // Roughness map for box frames - provides subtle wood grain variation
  // Note: Apple Quick Look interprets roughness maps differently than desktop viewers
  // Higher roughness factors needed to prevent glossy appearance on iOS
  if (roughnessMapTexture) {
    gltf.images.push({
      uri: `data:image/jpeg;base64,${roughnessMapTexture.data}`,
    });
    gltf.textures.push({ source: gltf.images.length - 1, sampler: 1 });
    gltf.materials[0].pbrMetallicRoughness.metallicRoughnessTexture = { 
      index: gltf.textures.length - 1
    };
    // Roughness multipliers - higher values = more matte (less glossy on iOS Quick Look)
    // Black/white need very high values to counteract glossy appearance on mobile
    // Ash uses natural matte wood finish
    const roughness = frameStyle === "white" ? 4.0 : frameStyle === "ash" ? 3.0 : 4.5;
    gltf.materials[0].pbrMetallicRoughness.roughnessFactor = roughness;
    console.log(`[AR] Applied roughness map to frame material (roughness: ${roughness})`);
  } else if (frameType === "box") {
    // No roughness map present — override base roughness to prevent glossy appearance
    // Apple Quick Look renders low roughness values as very shiny/reflective
    const flatRoughness = frameStyle === "black" ? 0.85 : frameStyle === "white" ? 0.8 : 0.9;
    gltf.materials[0].pbrMetallicRoughness.roughnessFactor = flatRoughness;
    console.log(`[AR] No roughness map — using flat roughness for ${frameStyle} box frame: ${flatRoughness}`);
  }
  
  // MDF texture for backing (material index 3)
  if (mdfTexture) {
    gltf.images.push({
      uri: `data:image/jpeg;base64,${mdfTexture.data}`,
    });
    gltf.textures.push({ source: gltf.images.length - 1 });
    // Apply MDF texture to backing material only
    gltf.materials[3].pbrMetallicRoughness.baseColorTexture = { index: gltf.textures.length - 1 };
  }
  
  // MDF normal map for surface detail
  if (mdfNormalMap) {
    gltf.images.push({
      uri: `data:image/png;base64,${mdfNormalMap.data}`,
    });
    gltf.textures.push({ source: gltf.images.length - 1 });
    gltf.materials[3].normalTexture = { 
      index: gltf.textures.length - 1,
      scale: 0.5  // Subtle surface detail for MDF
    };
    console.log("[AR] Applied normal map to MDF backing material");
  }
  
  // MDF roughness map for surface variation
  if (mdfRoughnessMap) {
    gltf.images.push({
      uri: `data:image/jpeg;base64,${mdfRoughnessMap.data}`,
    });
    gltf.textures.push({ source: gltf.images.length - 1 });
    gltf.materials[3].pbrMetallicRoughness.metallicRoughnessTexture = { 
      index: gltf.textures.length - 1
    };
    gltf.materials[3].pbrMetallicRoughness.roughnessFactor = 1.0;  // MDF is matte
    console.log("[AR] Applied roughness map to MDF backing material");
  }
  
  // Oak wood texture for frame backs and inner walls (material 5)
  // Load a separate oak texture for the natural wood backs
  const oakBackTexture = await loadWoodTexture("oak");
  if (oakBackTexture) {
    gltf.images.push({
      uri: `data:image/jpeg;base64,${oakBackTexture.data}`,
    });
    gltf.textures.push({ source: gltf.images.length - 1, sampler: 2 }); // Use repeat sampler
    gltf.materials[5].pbrMetallicRoughness.baseColorTexture = { index: gltf.textures.length - 1 };
  }
  
  // Sticker texture for branding (index 3)
  if (logoTexture) {
    gltf.images.push({
      uri: `data:image/jpeg;base64,${logoTexture.data}`,
    });
    gltf.textures.push({ source: gltf.images.length - 1 });
    // Apply logo texture to logo material
    gltf.materials[4].pbrMetallicRoughness.baseColorTexture = { index: gltf.textures.length - 1 };
  }
  
  // Kraft tape texture for protective tape strips (Material 8)
  const kraftTapeTexture = await loadKraftTapeTexture();
  if (kraftTapeTexture) {
    gltf.images.push({
      uri: `data:image/jpeg;base64,${kraftTapeTexture.data}`,
    });
    gltf.textures.push({ source: gltf.images.length - 1, sampler: 2 }); // Use repeat sampler for tiling
    gltf.materials[8].pbrMetallicRoughness.baseColorTexture = { index: gltf.textures.length - 1 };
  }
  
  // Clean up empty arrays
  if (gltf.images.length === 0) {
    delete gltf.images;
    delete gltf.textures;
  }

  // Build binary buffer
  const bufferParts: Buffer[] = [];
  let byteOffset = 0;

  meshes.forEach((mesh, meshIndex) => {
    const { positions, normals, uvs, indices } = mesh.geometry;
    
    // Add node with optional rotation
    const node: any = {
      mesh: meshIndex,
      translation: mesh.translation,
    };
    if (mesh.rotation) {
      node.rotation = mesh.rotation; // Quaternion [x, y, z, w]
    }
    gltf.nodes.push(node);

    // Positions
    const posBuffer = Buffer.alloc(positions.length * 4);
    positions.forEach((v, i) => posBuffer.writeFloatLE(v, i * 4));
    const posViewIndex = gltf.bufferViews.length;
    gltf.bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: posBuffer.length,
      target: 34962, // ARRAY_BUFFER
    });
    byteOffset += posBuffer.length;
    bufferParts.push(posBuffer);

    // Calculate bounds
    const minPos = [Infinity, Infinity, Infinity];
    const maxPos = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      minPos[0] = Math.min(minPos[0], positions[i]);
      minPos[1] = Math.min(minPos[1], positions[i + 1]);
      minPos[2] = Math.min(minPos[2], positions[i + 2]);
      maxPos[0] = Math.max(maxPos[0], positions[i]);
      maxPos[1] = Math.max(maxPos[1], positions[i + 1]);
      maxPos[2] = Math.max(maxPos[2], positions[i + 2]);
    }

    const posAccessorIndex = gltf.accessors.length;
    gltf.accessors.push({
      bufferView: posViewIndex,
      componentType: 5126, // FLOAT
      count: positions.length / 3,
      type: "VEC3",
      min: minPos,
      max: maxPos,
    });

    // Normals
    const normBuffer = Buffer.alloc(normals.length * 4);
    normals.forEach((v, i) => normBuffer.writeFloatLE(v, i * 4));
    const normViewIndex = gltf.bufferViews.length;
    gltf.bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: normBuffer.length,
      target: 34962,
    });
    byteOffset += normBuffer.length;
    bufferParts.push(normBuffer);

    const normAccessorIndex = gltf.accessors.length;
    gltf.accessors.push({
      bufferView: normViewIndex,
      componentType: 5126,
      count: normals.length / 3,
      type: "VEC3",
    });

    // UVs
    const uvBuffer = Buffer.alloc(uvs.length * 4);
    uvs.forEach((v, i) => uvBuffer.writeFloatLE(v, i * 4));
    const uvViewIndex = gltf.bufferViews.length;
    gltf.bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: uvBuffer.length,
      target: 34962,
    });
    byteOffset += uvBuffer.length;
    bufferParts.push(uvBuffer);

    const uvAccessorIndex = gltf.accessors.length;
    gltf.accessors.push({
      bufferView: uvViewIndex,
      componentType: 5126,
      count: uvs.length / 2,
      type: "VEC2",
    });

    // Indices
    const idxBuffer = Buffer.alloc(indices.length * 2);
    indices.forEach((v, i) => idxBuffer.writeUInt16LE(v, i * 2));
    const idxViewIndex = gltf.bufferViews.length;
    gltf.bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: idxBuffer.length,
      target: 34963, // ELEMENT_ARRAY_BUFFER
    });
    byteOffset += idxBuffer.length;
    bufferParts.push(idxBuffer);

    const idxAccessorIndex = gltf.accessors.length;
    gltf.accessors.push({
      bufferView: idxViewIndex,
      componentType: 5123, // UNSIGNED_SHORT
      count: indices.length,
      type: "SCALAR",
    });

    // Mesh
    gltf.meshes.push({
      primitives: [{
        attributes: {
          POSITION: posAccessorIndex,
          NORMAL: normAccessorIndex,
          TEXCOORD_0: uvAccessorIndex,
        },
        indices: idxAccessorIndex,
        material: mesh.material,
      }],
    });
  });

  // Combine buffer parts and pad to 4-byte alignment
  let binaryBuffer = Buffer.concat(bufferParts);
  const binPadding = (4 - (binaryBuffer.length % 4)) % 4;
  if (binPadding > 0) {
    binaryBuffer = Buffer.concat([binaryBuffer, Buffer.alloc(binPadding, 0)]);
  }

  gltf.buffers = [{ byteLength: binaryBuffer.length }];

  // Convert to GLB
  const jsonString = JSON.stringify(gltf);
  const jsonBuffer = Buffer.from(jsonString, "utf8");
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  const paddedJsonBuffer = Buffer.concat([
    jsonBuffer,
    Buffer.alloc(jsonPadding, 0x20),
  ]);

  const totalLength = 12 + 8 + paddedJsonBuffer.length + 8 + binaryBuffer.length;
  const glb = Buffer.alloc(totalLength);
  let offset = 0;

  // Header
  glb.writeUInt32LE(0x46546C67, offset); // "glTF"
  offset += 4;
  glb.writeUInt32LE(2, offset); // version
  offset += 4;
  glb.writeUInt32LE(totalLength, offset);
  offset += 4;

  // JSON chunk
  glb.writeUInt32LE(paddedJsonBuffer.length, offset);
  offset += 4;
  glb.writeUInt32LE(0x4E4F534A, offset); // "JSON"
  offset += 4;
  paddedJsonBuffer.copy(glb, offset);
  offset += paddedJsonBuffer.length;

  // Binary chunk
  glb.writeUInt32LE(binaryBuffer.length, offset);
  offset += 4;
  glb.writeUInt32LE(0x004E4942, offset); // "BIN\0"
  offset += 4;
  binaryBuffer.copy(glb, offset);

  return glb;
}

// Standard A-ratio paper sizes in mm (width x height in portrait)
const A_SIZES: Record<string, { width: number; height: number }> = {
  "a0": { width: 841, height: 1189 },
  "a1": { width: 594, height: 841 },
  "a2": { width: 420, height: 594 },
  "a3": { width: 297, height: 420 },
  "a4": { width: 210, height: 297 },
  "a5": { width: 148, height: 210 },
};

export function parseSizeToMm(sizeStr: string): { width: number; height: number } | null {
  console.log('[AR Size Parse] Input:', sizeStr);
  
  // Check for A-ratio sizes first (A4, A3, etc.) - can be "A4" or "A4 - 8.27" format from Shopify
  const aMatch = sizeStr.toLowerCase().match(/\ba(\d)\b/);
  if (aMatch) {
    const aSize = A_SIZES[`a${aMatch[1]}`];
    if (aSize) {
      console.log('[AR Size Parse] Matched A-size:', aMatch[1], '→', aSize);
      return { ...aSize };
    }
  }
  
  // Try multiple parsing strategies in order of preference:
  
  // Strategy 1a: Look for cm dimensions with cm after both - e.g., "70cm x 100cm"
  const cmBothMatch = sizeStr.match(/(\d+(?:\.\d+)?)\s*cm\s*[x×]\s*(\d+(?:\.\d+)?)\s*cm/i);
  if (cmBothMatch) {
    const width = parseFloat(cmBothMatch[1]) * 10;
    const height = parseFloat(cmBothMatch[2]) * 10;
    console.log('[AR Size Parse] Matched cm format (both):', cmBothMatch[1], 'x', cmBothMatch[2], 'cm →', width, 'x', height, 'mm');
    return { width: Math.round(width), height: Math.round(height) };
  }
  
  // Strategy 1b: Look for cm at end only - e.g., "70x100cm" or "70 x 100 cm"
  const cmEndMatch = sizeStr.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*cm/i);
  if (cmEndMatch) {
    const width = parseFloat(cmEndMatch[1]) * 10;
    const height = parseFloat(cmEndMatch[2]) * 10;
    console.log('[AR Size Parse] Matched cm format (end):', cmEndMatch[1], 'x', cmEndMatch[2], 'cm →', width, 'x', height, 'mm');
    return { width: Math.round(width), height: Math.round(height) };
  }
  
  // Strategy 2: Look for inch dimensions with " symbol - e.g., '28" x 40"'
  const inchQuoteMatch = sizeStr.match(/(\d+(?:\.\d+)?)\s*"\s*[x×]\s*(\d+(?:\.\d+)?)\s*"/i);
  if (inchQuoteMatch) {
    const width = parseFloat(inchQuoteMatch[1]) * 25.4;
    const height = parseFloat(inchQuoteMatch[2]) * 25.4;
    console.log('[AR Size Parse] Matched inch quote format:', inchQuoteMatch[1], '" x', inchQuoteMatch[2], '" →', width, 'x', height, 'mm');
    return { width: Math.round(width), height: Math.round(height) };
  }
  
  // Strategy 3: Look for explicit "in" unit - e.g., "12x18in" or "12 x 18 in"
  const inMatch = sizeStr.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(in|inch|inches)/i);
  if (inMatch) {
    const width = parseFloat(inMatch[1]) * 25.4;
    const height = parseFloat(inMatch[2]) * 25.4;
    console.log('[AR Size Parse] Matched inch format:', inMatch[1], 'x', inMatch[2], 'in →', width, 'x', height, 'mm');
    return { width: Math.round(width), height: Math.round(height) };
  }
  
  // Strategy 4: Plain numbers (assume inches) - e.g., "12x18" or "12 x 18"
  const plainMatch = sizeStr.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (plainMatch) {
    const width = parseFloat(plainMatch[1]) * 25.4;
    const height = parseFloat(plainMatch[2]) * 25.4;
    console.log('[AR Size Parse] Matched plain format (assuming inches):', plainMatch[1], 'x', plainMatch[2], '→', width, 'x', height, 'mm');
    return { width: Math.round(width), height: Math.round(height) };
  }

  console.log('[AR Size Parse] No match found for:', sizeStr);
  return null;
}
