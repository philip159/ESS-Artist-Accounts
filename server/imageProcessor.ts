import sharp from "sharp";
import { PRINT_SIZES, MIN_DPI } from "@shared/schema";
import { convertWithEmbeddedProfile, getLCMS } from "./colorConverter";

// Configure Sharp for lower memory usage on large images
// concurrency: 1 = process one image at a time (prevents parallel memory spikes)
// cache: false = disable libvips cache (reduces memory retention)
sharp.cache(false);
sharp.concurrency(1);

// Yield the event loop to allow other requests to be processed
// This prevents long Sharp operations from blocking the entire server
const yieldEventLoop = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

export interface ImageMetadata {
  widthPx: number;
  heightPx: number;
  dpi: number;
  format: string;
  sizeBytes: number;
}

export interface ImageAnalysisResult {
  widthPx: number;
  heightPx: number;
  effectiveDpi: number; // DPI at maximum print size
  aspectRatio: string;
  maxPrintSize: string;
  availableSizes: string[];
}

export interface ExtendedImageMetadata extends ImageMetadata {
  isCMYK: boolean;
  colorSpace: string;
}

export async function extractImageMetadata(buffer: Buffer): Promise<ExtendedImageMetadata> {
  // Yield to allow other requests through before starting
  await yieldEventLoop();
  
  // Auto-rotate based on EXIF orientation before reading dimensions
  // Use sequentialRead for faster streaming of large images
  const image = sharp(buffer, { 
    sequentialRead: true,
    limitInputPixels: 500000000 // 500 megapixels max (allows very large print files)
  }).rotate();
  const metadata = await image.metadata();
  
  // Yield after metadata extraction
  await yieldEventLoop();
  
  // Detect CMYK for color profile handling
  const isCMYK = metadata.space === 'cmyk' || metadata.channels === 4;
  
  // DEBUG: Log what Sharp is reporting
  console.log('[ImageProcessor] Sharp metadata:', {
    width: metadata.width,
    height: metadata.height,
    orientation: metadata.orientation,
    density: metadata.density,
    format: metadata.format,
    space: metadata.space,
    channels: metadata.channels,
    isCMYK,
    bufferSize: buffer.length
  });
  
  // Extract DPI from metadata, default to 300 if not available
  const dpi = metadata.density || 300;
  
  return {
    widthPx: metadata.width || 0,
    heightPx: metadata.height || 0,
    dpi,
    format: metadata.format || "unknown",
    sizeBytes: buffer.length,
    isCMYK,
    colorSpace: metadata.space || 'srgb',
  };
}

export async function createLowResVersion(
  buffer: Buffer, 
  maxWidth: number = 800,
  preExtractedMetadata?: { isCMYK: boolean }
): Promise<Buffer> {
  try {
    // Yield to allow other requests through before starting
    await yieldEventLoop();
    
    // Use sequentialRead for faster streaming and limit input pixels for safety
    const sharpOptions = { 
      sequentialRead: true, 
      limitInputPixels: 500000000 
    };
    const metadata = await sharp(buffer, sharpOptions).metadata();
    
    // Yield after metadata extraction
    await yieldEventLoop();
    const isCMYK = preExtractedMetadata?.isCMYK ?? (metadata.space === 'cmyk' || metadata.channels === 4);
    const hasEmbeddedProfile = metadata.icc && metadata.icc.length > 0;
    
    // For CMYK images with embedded ICC profiles, use Sharp's native ICC handling
    // This is much faster than LittleCMS while still producing accurate colors
    if (isCMYK && hasEmbeddedProfile) {
      console.log('[ImageProcessor] Using Sharp with embedded ICC profile for fast CMYK conversion');
      
      try {
        // Sharp automatically uses embedded ICC profiles when converting colorspace
        // Using withIccProfile ensures proper color management
        return await sharp(buffer, sharpOptions)
          .rotate()
          .resize(maxWidth, undefined, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .toColorspace('srgb')  // Sharp uses embedded ICC profile for conversion
          .jpeg({ quality: 85, mozjpeg: true })
          .toBuffer();
        
      } catch (iccError) {
        console.warn('[ImageProcessor] Sharp ICC conversion failed, using fallback:', iccError);
        // Fall through to standard conversion
      }
    }
    
    // Standard Sharp-based conversion (for RGB images or as fallback)
    let pipeline = sharp(buffer, sharpOptions);
    
    if (isCMYK) {
      console.log('[ImageProcessor] Using Sharp for CMYK conversion with gamma correction');
      pipeline = pipeline.pipelineColourspace('cmyk');
    }
    
    pipeline = pipeline
      .rotate()
      .resize(maxWidth, undefined, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .toColorspace('srgb');
    
    // Apply gamma correction for CMYK images to compensate for washed-out appearance
    if (isCMYK) {
      pipeline = pipeline.gamma(0.85);
    }
    
    return await pipeline
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
      
  } catch (error) {
    console.warn("Standard Sharp processing failed, attempting fallback:", error);
    
    try {
      const image = sharp(buffer, { failOnError: false, sequentialRead: true, limitInputPixels: 500000000 });
      
      return await image
        .rotate()
        .resize(maxWidth, undefined, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .toColorspace('srgb')
        .jpeg({ quality: 80, force: true, mozjpeg: true })
        .toBuffer();
    } catch (fallbackError) {
      console.error("Fallback Sharp processing also failed:", fallbackError);
      throw new Error("Failed to process image with Sharp");
    }
  }
}

function calculateAspectRatio(width: number, height: number): { ratio: number; name: string } {
  const ratio = width / height;
  const tolerance = 0.05; // 5% tolerance
  
  // Check for square
  if (Math.abs(ratio - 1) < tolerance) {
    return { ratio, name: "Square (1:1)" };
  }
  
  // Common ratios
  const ratios = [
    { ratio: 1.414, name: "A Ratio (√2:1)" }, // ISO A-series
    { ratio: 1 / 1.414, name: "A Ratio Portrait (1:√2)" },
    { ratio: 0.75, name: "3:4 Portrait" },
    { ratio: 1.33, name: "4:3 Landscape" },
    { ratio: 0.8, name: "4:5 Portrait" },
    { ratio: 1.25, name: "5:4 Landscape" },
    { ratio: 0.67, name: "2:3 Portrait" },
    { ratio: 1.5, name: "3:2 Landscape" },
    { ratio: 0.625, name: "5:8 Portrait" },
    { ratio: 1.6, name: "8:5 Landscape" },
  ];
  
  // Find the closest matching ratio within tolerance
  let closestMatch: { ratio: number; name: string; diff: number } | null = null;
  
  for (const r of ratios) {
    const diff = Math.abs(ratio - r.ratio);
    if (diff < tolerance) {
      if (!closestMatch || diff < closestMatch.diff) {
        closestMatch = { ...r, diff };
      }
    }
  }
  
  if (closestMatch) {
    return { ratio, name: closestMatch.name };
  }
  
  // Return simplified ratio
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const w = Math.round(width);
  const h = Math.round(height);
  const divisor = gcd(w, h);
  const simplifiedW = w / divisor;
  const simplifiedH = h / divisor;
  
  return { 
    ratio, 
    name: `${simplifiedW}:${simplifiedH}` 
  };
}

function getRatioCategory(ratio: number): string {
  const tolerance = 0.03;

  if (Math.abs(ratio - 1) < tolerance) {
    return "square";
  }

  const categories = [
    { name: "a-ratio", values: [1.414, 1 / 1.414] },
    { name: "3:4", values: [0.75, 1.33] },
    { name: "2:3", values: [0.667, 1.5] },
    { name: "4:5", values: [0.8, 1.25] },
    { name: "5:8", values: [0.625, 1.6] },
  ];

  let bestMatch: { name: string; diff: number } | null = null;

  for (const cat of categories) {
    for (const v of cat.values) {
      const diff = Math.abs(ratio - v);
      if (diff < tolerance && (!bestMatch || diff < bestMatch.diff)) {
        bestMatch = { name: cat.name, diff };
      }
    }
  }

  return bestMatch ? bestMatch.name : "custom";
}

function calculateAvailableSizes(
  widthPx: number, 
  heightPx: number, 
  dpi: number
): { maxSize: string; available: string[]; effectiveDpi: number } {
  const imageRatio = widthPx / heightPx;
  const imageCategory = getRatioCategory(imageRatio);
  const imageIsLandscape = widthPx > heightPx;
  const availableSizes: string[] = [];
  let maxSizeIndex = -1;
  let maxArea = 0;
  let effectiveDpi = 0;
  
  PRINT_SIZES.forEach((size, index) => {
    const sizeRatio = size.widthIn / size.heightIn;
    const sizeCategory = getRatioCategory(sizeRatio);
    
    // Only match sizes with the SAME ratio category
    // This ensures A-ratio artworks only get A-ratio sizes, not 3:4 or square
    if (imageCategory !== sizeCategory) return;
    
    // Handle orientation: swap print size dimensions if orientation doesn't match
    const printSizeIsLandscape = size.widthIn > size.heightIn;
    let printWidthIn: number = size.widthIn;
    let printHeightIn: number = size.heightIn;
    
    if (imageIsLandscape !== printSizeIsLandscape) {
      printWidthIn = size.heightIn;
      printHeightIn = size.widthIn;
    }
    
    // Calculate actual DPI for this size (with orientation handled)
    const actualDpiWidth = widthPx / printWidthIn;
    const actualDpiHeight = heightPx / printHeightIn;
    const actualDpi = Math.min(actualDpiWidth, actualDpiHeight);
    
    // Check if image has sufficient resolution
    if (actualDpi >= MIN_DPI) {
      availableSizes.push(size.code);
      
      const area = size.widthIn * size.heightIn;
      if (area > maxArea) {
        maxArea = area;
        maxSizeIndex = index;
        effectiveDpi = Math.round(actualDpi);
      }
    }
  });
  
  const maxSizeName = maxSizeIndex >= 0 
    ? `${PRINT_SIZES[maxSizeIndex].name}`
    : "None";
  
  return {
    maxSize: maxSizeName,
    available: availableSizes,
    effectiveDpi,
  };
}

export interface ImageAnalysisResultWithMeta extends ImageAnalysisResult {
  isCMYK: boolean;
}

export async function analyzeImage(buffer: Buffer): Promise<ImageAnalysisResultWithMeta> {
  const metadata = await extractImageMetadata(buffer);
  const { name: aspectRatioName } = calculateAspectRatio(metadata.widthPx, metadata.heightPx);
  const { maxSize, available, effectiveDpi } = calculateAvailableSizes(
    metadata.widthPx, 
    metadata.heightPx, 
    metadata.dpi
  );
  
  return {
    widthPx: metadata.widthPx,
    heightPx: metadata.heightPx,
    effectiveDpi,
    aspectRatio: aspectRatioName,
    maxPrintSize: maxSize,
    availableSizes: available,
    isCMYK: metadata.isCMYK,
  };
}
