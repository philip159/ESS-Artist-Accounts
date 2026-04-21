import sharp from "sharp";
import cvLoader from "@techstark/opencv-js";
import type { Artwork, Template, FrameZone, MockupPositioning } from "@shared/schema";

export interface MockupGenerationOptions {
  artwork: Artwork;
  template: Template;
  printSize: string; // e.g., "A4"
  positioning?: MockupPositioning; // Custom positioning settings
}

const DEFAULT_POSITIONING: MockupPositioning = {
  scale: 1.0,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
};

// Load OpenCV.js (async initialization)
let cvInstance: any = null;
async function getOpenCV() {
  if (!cvInstance) {
    cvInstance = await cvLoader;
  }
  return cvInstance;
}

// Helper to convert buffer to OpenCV Mat with proper color profile handling
async function bufferToMat(buffer: Buffer): Promise<any> {
  const cv = await getOpenCV();
  
  // Check if image is CMYK - requires special handling for accurate color conversion
  const metadata = await sharp(buffer).metadata();
  const isCMYK = metadata.space === 'cmyk' || metadata.channels === 4;
  
  let pipeline = sharp(buffer);
  
  // For CMYK images, use pipelineColourspace to ensure proper color conversion
  if (isCMYK) {
    console.log('[MockupGenerator] Detected CMYK image, applying proper color conversion');
    pipeline = pipeline.pipelineColourspace('cmyk');
  }
  
  // Convert to sRGB color space for web display
  const { data, info } = await pipeline
    .toColorspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const mat = new cv.Mat(info.height, info.width, cv.CV_8UC4);
  mat.data.set(data);
  return mat;
}

// Helper to convert OpenCV Mat to buffer
async function matToBuffer(mat: any): Promise<Buffer> {
  const channels = mat.channels();
  const data = Buffer.from(mat.data);
  
  // Convert back to PNG using sharp
  return await sharp(data, {
    raw: {
      width: mat.cols,
      height: mat.rows,
      channels: channels,
    }
  })
  .png()
  .toBuffer();
}

/**
 * Apply a 2D rotation/scale/translation transform to a point
 */
function transformPoint(
  x: number, 
  y: number, 
  cx: number, 
  cy: number, 
  scale: number, 
  rotation: number, 
  offsetX: number, 
  offsetY: number
): { x: number; y: number } {
  // Translate to origin (center)
  const dx = x - cx;
  const dy = y - cy;
  
  // Apply rotation
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;
  
  // Apply scale (inverse - larger scale means smaller source area)
  const sx = rx / scale;
  const sy = ry / scale;
  
  // Translate back and apply offset
  return {
    x: sx + cx + offsetX,
    y: sy + cy + offsetY,
  };
}

/**
 * Apply perspective transformation to artwork using OpenCV
 * Now supports positioning adjustments (scale, offset, rotation)
 */
async function warpArtworkToZone(
  artworkBuffer: Buffer,
  frameZone: FrameZone,
  templateWidth: number,
  templateHeight: number,
  positioning: MockupPositioning = DEFAULT_POSITIONING
): Promise<Buffer> {
  const cv = await getOpenCV();
  
  // Convert artwork to Mat
  const artworkMat = await bufferToMat(artworkBuffer);
  
  // Convert percentage coordinates to pixels
  const tlx = (frameZone.topLeft.x / 100) * templateWidth;
  const tly = (frameZone.topLeft.y / 100) * templateHeight;
  const trx = (frameZone.topRight.x / 100) * templateWidth;
  const try_ = (frameZone.topRight.y / 100) * templateHeight;
  const brx = (frameZone.bottomRight.x / 100) * templateWidth;
  const bry = (frameZone.bottomRight.y / 100) * templateHeight;
  const blx = (frameZone.bottomLeft.x / 100) * templateWidth;
  const bly = (frameZone.bottomLeft.y / 100) * templateHeight;
  
  // Destination points (the 4 corners in the template)
  const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tlx, tly,  // top-left
    trx, try_, // top-right
    brx, bry,  // bottom-right
    blx, bly   // bottom-left
  ]);
  
  // Calculate center of artwork for positioning transforms
  const artCenterX = artworkMat.cols / 2;
  const artCenterY = artworkMat.rows / 2;
  
  // Calculate offset in pixels (percentage of artwork size)
  const offsetPxX = (positioning.offsetX / 100) * artworkMat.cols;
  const offsetPxY = (positioning.offsetY / 100) * artworkMat.rows;
  
  // Apply positioning transforms to source corners
  const tl = transformPoint(0, 0, artCenterX, artCenterY, positioning.scale, positioning.rotation, offsetPxX, offsetPxY);
  const tr = transformPoint(artworkMat.cols, 0, artCenterX, artCenterY, positioning.scale, positioning.rotation, offsetPxX, offsetPxY);
  const br = transformPoint(artworkMat.cols, artworkMat.rows, artCenterX, artCenterY, positioning.scale, positioning.rotation, offsetPxX, offsetPxY);
  const bl = transformPoint(0, artworkMat.rows, artCenterX, artCenterY, positioning.scale, positioning.rotation, offsetPxX, offsetPxY);
  
  // Source points (corners of the artwork rectangle, transformed)
  const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y,  // top-left
    tr.x, tr.y,  // top-right
    br.x, br.y,  // bottom-right
    bl.x, bl.y   // bottom-left
  ]);
  
  // Get perspective transform matrix
  const transformMatrix = cv.getPerspectiveTransform(srcPoints, dstPoints);
  
  // Create output mat with template dimensions and transparent background
  const warpedMat = new cv.Mat(templateHeight, templateWidth, cv.CV_8UC4, [0, 0, 0, 0]);
  
  // Apply perspective warp
  cv.warpPerspective(
    artworkMat,
    warpedMat,
    transformMatrix,
    new cv.Size(templateWidth, templateHeight),
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    [0, 0, 0, 0] // Transparent border
  );
  
  // Clean up OpenCV resources
  artworkMat.delete();
  srcPoints.delete();
  dstPoints.delete();
  transformMatrix.delete();
  
  // Convert back to buffer
  const warpedBuffer = await matToBuffer(warpedMat);
  warpedMat.delete();
  
  return warpedBuffer;
}

/**
 * Generate a mockup by compositing artwork onto a template image.
 * Uses perspective transformation to map artwork to the 4 corner points.
 */
export async function generateMockup(
  artworkBuffer: Buffer,
  templateBuffer: Buffer,
  options: MockupGenerationOptions
): Promise<Buffer> {
  const { template, printSize, positioning } = options;
  
  // Find frame zone that supports this print size
  const frameZone = template.frameZones.find(zone => {
    const zoneSizes = zone.supportedSizes || template.supportedSizes;
    return zoneSizes && zoneSizes.includes(printSize);
  });
    
  if (!frameZone) {
    throw new Error(`No frame zone found for print size ${printSize}`);
  }
  
  // Get template dimensions
  const templateImage = sharp(templateBuffer);
  const templateMetadata = await templateImage.metadata();
  
  if (!templateMetadata.width || !templateMetadata.height) {
    throw new Error("Invalid template image");
  }
  
  // Apply perspective transformation to artwork with positioning
  const warpedArtwork = await warpArtworkToZone(
    artworkBuffer,
    frameZone,
    templateMetadata.width,
    templateMetadata.height,
    positioning || DEFAULT_POSITIONING
  );
  
  // Get blend settings from frame zone (with defaults)
  const blendMode = frameZone.blendMode || "multiply";
  const blendOpacity = frameZone.blendOpacity !== undefined ? frameZone.blendOpacity : 0.8;
  
  // Apply opacity if needed
  let compositedArtwork = warpedArtwork;
  if (blendOpacity < 1.0) {
    // Extract RGBA channels and multiply alpha by blendOpacity
    const { data, info } = await sharp(warpedArtwork)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // Multiply alpha channel by blend opacity
    for (let i = 3; i < data.length; i += 4) {
      data[i] = Math.round(data[i] * blendOpacity);
    }
    
    compositedArtwork = await sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels: 4
      }
    })
    .png()
    .toBuffer();
  }
  
  // Composite warped artwork onto template with proper color space
  const mockup = await sharp(templateBuffer)
    .toColorspace('srgb') // Ensure template is in sRGB as well
    .composite([{
      input: compositedArtwork,
      blend: blendMode,
    }])
    .jpeg({ quality: 90 })
    .toBuffer();
  
  return mockup;
}

