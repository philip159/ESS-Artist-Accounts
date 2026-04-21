import { PRINT_SIZES, MIN_DPI } from "@shared/schema";
import exifr from 'exifr';

export interface ImageAnalysis {
  widthPx: number;
  heightPx: number;
  dpi: number;
  aspectRatio: string;
  maxPrintSize: string;
  availableSizes: string[];
  ratio: number;
}

/**
 * Generate a thumbnail for fast preview rendering
 * Reduces large images (e.g., 500MB) to small previews (e.g., 800px wide)
 * for mockup canvas performance
 */
export async function generateThumbnail(file: File, maxWidth: number = 800): Promise<string> {
  // Use createImageBitmap with explicit EXIF orientation and color space handling
  // colorSpaceConversion: 'default' ensures ICC profiles are converted to sRGB properly
  const imageBitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image', // Explicitly apply EXIF orientation
    colorSpaceConversion: 'default' // Convert embedded color profiles to display color space
  });
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    imageBitmap.close();
    throw new Error('Failed to get canvas context');
  }
  
  // Calculate thumbnail dimensions maintaining aspect ratio
  const scale = Math.min(maxWidth / imageBitmap.width, 1); // Don't upscale
  canvas.width = imageBitmap.width * scale;
  canvas.height = imageBitmap.height * scale;
  
  // Draw scaled image
  ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
  
  // Clean up bitmap
  imageBitmap.close();
  
  // Convert to blob
  const blob = await new Promise<Blob | null>((resolveBlob) => {
    canvas.toBlob(resolveBlob, 'image/jpeg', 0.85);
  });
  
  if (!blob) {
    throw new Error('Failed to create thumbnail blob');
  }
  
  // Create and return unique blob URL for this specific thumbnail
  return URL.createObjectURL(blob);
}

export function extractTitleFromFilename(filename: string): string {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  
  // Replace underscores and hyphens with spaces
  let title = nameWithoutExt.replace(/[_-]/g, " ");
  
  // Capitalize first letter of each word
  title = title.replace(/\b\w/g, l => l.toUpperCase());
  
  return title.trim();
}

export function calculateAspectRatio(width: number, height: number): { ratio: number; name: string } {
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
  const tolerance = 0.03; // 3% tolerance for categorization
  
  // Square
  if (Math.abs(ratio - 1) < tolerance) {
    return "square";
  }
  
  // A-Ratio (ISO A-series): √2:1 ≈ 1.414 landscape or 1:√2 ≈ 0.707 portrait
  if (Math.abs(ratio - 1.414) < tolerance || Math.abs(ratio - (1 / 1.414)) < tolerance) {
    return "a-ratio";
  }
  
  // 3:4 ratio (0.75 portrait or 1.33 landscape)
  if (Math.abs(ratio - 0.75) < tolerance || Math.abs(ratio - 1.33) < tolerance) {
    return "3:4";
  }
  
  // 2:3 ratio (0.667 portrait or 1.5 landscape)
  if (Math.abs(ratio - 0.667) < tolerance || Math.abs(ratio - 1.5) < tolerance) {
    return "2:3";
  }
  
  // 4:5 ratio (0.8 portrait or 1.25 landscape)
  if (Math.abs(ratio - 0.8) < tolerance || Math.abs(ratio - 1.25) < tolerance) {
    return "4:5";
  }
  
  // 5:8 ratio (0.625 portrait or 1.6 landscape)
  if (Math.abs(ratio - 0.625) < tolerance || Math.abs(ratio - 1.6) < tolerance) {
    return "5:8";
  }
  
  return "custom";
}

export function calculateAvailableSizes(
  widthPx: number, 
  heightPx: number, 
  dpi: number
): { maxSize: string; available: string[]; sizeDetails: typeof PRINT_SIZES } {
  const imageRatio = widthPx / heightPx;
  const imageCategory = getRatioCategory(imageRatio);
  const imageIsLandscape = widthPx > heightPx;
  const availableSizes: string[] = [];
  let maxSizeIndex = -1;
  let maxArea = 0;
  
  PRINT_SIZES.forEach((size, index) => {
    const sizeRatio = size.widthIn / size.heightIn;
    const sizeCategory = getRatioCategory(sizeRatio);
    
    // Only match sizes with the SAME ratio category
    // This ensures A-ratio artworks only get A-ratio sizes, not 3:4 or square
    if (imageCategory !== sizeCategory) return;
    
    // Detect if this print size needs rotation to match artwork orientation
    const printSizeIsLandscape = size.widthIn > size.heightIn;
    let printWidthIn: number = size.widthIn;
    let printHeightIn: number = size.heightIn;
    
    // Rotate print size if orientations don't match
    if (imageIsLandscape !== printSizeIsLandscape) {
      printWidthIn = size.heightIn;
      printHeightIn = size.widthIn;
    }
    
    // Calculate actual DPI for this size (using potentially rotated dimensions)
    const actualDpiWidth = widthPx / printWidthIn;
    const actualDpiHeight = heightPx / printHeightIn;
    const actualDpi = Math.min(actualDpiWidth, actualDpiHeight);
    
    // Check if image has sufficient resolution
    if (actualDpi >= MIN_DPI) {
      availableSizes.push(size.code);
      
      const area = printWidthIn * printHeightIn;
      if (area > maxArea) {
        maxArea = area;
        maxSizeIndex = index;
      }
    }
  });
  
  const maxSizeName = maxSizeIndex >= 0 
    ? `${PRINT_SIZES[maxSizeIndex].name} (${PRINT_SIZES[maxSizeIndex].widthIn}" x ${PRINT_SIZES[maxSizeIndex].heightIn}")`
    : "None (insufficient resolution)";
  
  return {
    maxSize: maxSizeName,
    available: availableSizes,
    sizeDetails: PRINT_SIZES,
  };
}

export async function analyzeImage(file: File): Promise<ImageAnalysis> {
  // Parse EXIF metadata directly from file (fast, no image decode)
  // This gives us the true full-resolution dimensions, not a preview/thumbnail
  const exif = await exifr.parse(file, ['ImageWidth', 'ImageHeight', 'PixelXDimension', 'PixelYDimension', 'Orientation']);
  
  // Get raw pixel dimensions from EXIF (full resolution, not preview)
  let widthPx = exif?.PixelXDimension || exif?.ImageWidth;
  let heightPx = exif?.PixelYDimension || exif?.ImageHeight;
  const orientation = exif?.Orientation || 1;
  
  // If EXIF parsing failed, fall back to createImageBitmap
  if (!widthPx || !heightPx) {
    const imageBitmap = await createImageBitmap(file);
    widthPx = imageBitmap.width;
    heightPx = imageBitmap.height;
    imageBitmap.close();
  }
  
  // Apply EXIF orientation transformation (orientations 5-8 swap width/height)
  // Orientation values: 1=normal, 3=180°, 6=90°CW, 8=90°CCW
  // Orientations 5,6,7,8 require swapping dimensions
  if (orientation >= 5 && orientation <= 8) {
    [widthPx, heightPx] = [heightPx, widthPx];
  }
  
  console.log('[analyzeImage] Dimensions from EXIF metadata:', {
    filename: file.name,
    rawDimensions: `${exif?.PixelXDimension || exif?.ImageWidth} × ${exif?.PixelYDimension || exif?.ImageHeight}`,
    orientation: orientation,
    finalDimensions: `${widthPx} × ${heightPx}`,
    displayOrientation: widthPx > heightPx ? 'landscape' : 'portrait'
  });
  
  // Default DPI assumption for high-quality images
  const dpi = 300;
  
  const { ratio, name: aspectRatioName } = calculateAspectRatio(widthPx, heightPx);
  const { maxSize, available } = calculateAvailableSizes(widthPx, heightPx, dpi);
  
  return {
    widthPx,
    heightPx,
    dpi,
    aspectRatio: aspectRatioName,
    maxPrintSize: maxSize,
    availableSizes: available,
    ratio,
  };
}
