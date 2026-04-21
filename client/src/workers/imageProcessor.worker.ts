import { PRINT_SIZES, MIN_DPI } from "@shared/schema";
import exifr from 'exifr';

interface ProcessImageRequest {
  requestId: string;
  file: File;
  maxThumbnailWidth: number;
}

interface ProcessImageResponse {
  requestId: string;
  thumbnailUrl: string;
  analysis: {
    widthPx: number;
    heightPx: number;
    dpi: number;
    aspectRatio: string;
    ratioCategory: string;
    maxPrintSize: string;
    availableSizes: string[];
    ratio: number;
    effectiveDpi: number;
    warning?: string;
    isCMYK?: boolean; // Client-side CMYK detection from EXIF/TIFF metadata
    isDefinitelyRGB?: boolean; // True only when EXIF confirms RGB/sRGB - safe to skip server
  } | null;
}

// Ratio categorization (same as imageUtils.ts)
function getRatioCategory(ratio: number): string {
  const tolerance = 0.03;
  
  if (Math.abs(ratio - 1) < tolerance) return "square";
  if (Math.abs(ratio - 1.414) < tolerance || Math.abs(ratio - 1/1.414) < tolerance) return "a-ratio";
  if (Math.abs(ratio - 0.75) < tolerance || Math.abs(ratio - 1.33) < tolerance) return "3:4";
  if (Math.abs(ratio - 0.667) < tolerance || Math.abs(ratio - 1.5) < tolerance) return "2:3";
  if (Math.abs(ratio - 0.8) < tolerance || Math.abs(ratio - 1.25) < tolerance) return "4:5";
  if (Math.abs(ratio - 0.625) < tolerance || Math.abs(ratio - 1.6) < tolerance) return "5:8";
  
  return "custom";
}

function calculateAspectRatio(width: number, height: number): { ratio: number; name: string } {
  const ratio = width / height;
  const tolerance = 0.05;
  
  if (Math.abs(ratio - 1) < tolerance) {
    return { ratio, name: "Square (1:1)" };
  }
  
  const ratios = [
    { ratio: 1.414, name: "A Ratio (√2:1)" },
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
  
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const w = Math.round(width);
  const h = Math.round(height);
  const divisor = gcd(w, h);
  const simplifiedW = w / divisor;
  const simplifiedH = h / divisor;
  
  return { ratio, name: `${simplifiedW}:${simplifiedH}` };
}

function calculateAvailableSizes(
  widthPx: number,
  heightPx: number,
  _unusedDpiParam: number
): { maxSize: string; available: string[]; dpi: number; effectiveDpi: number; ratioCategory: string; warning?: string } {
  const imageRatio = widthPx / heightPx;
  const imageCategory = getRatioCategory(imageRatio);
  const imageIsLandscape = widthPx > heightPx;
  const availableSizes: string[] = [];
  let maxSizeIndex = -1;
  let maxArea = 0;
  let minDpiAll = Infinity;  // Track across ALL evaluated sizes
  let minDpiQualifying = Infinity;  // Track only sizes that meet MIN_DPI
  
  PRINT_SIZES.forEach((size, index) => {
    const sizeRatio = size.widthIn / size.heightIn;
    const sizeCategory = getRatioCategory(sizeRatio);
    
    if (imageCategory !== sizeCategory) return;
    
    const printSizeIsLandscape = size.widthIn > size.heightIn;
    let printWidthIn: number = size.widthIn;
    let printHeightIn: number = size.heightIn;
    
    if (imageIsLandscape !== printSizeIsLandscape) {
      printWidthIn = size.heightIn;
      printHeightIn = size.widthIn;
    }
    
    const actualDpiWidth = widthPx / printWidthIn;
    const actualDpiHeight = heightPx / printHeightIn;
    const actualDpi = Math.min(actualDpiWidth, actualDpiHeight);
    
    // Track minimum DPI across ALL evaluated sizes (even those below threshold)
    minDpiAll = Math.min(minDpiAll, actualDpi);
    
    if (actualDpi >= MIN_DPI) {
      availableSizes.push(size.code);
      // Track minimum DPI across qualifying sizes only
      minDpiQualifying = Math.min(minDpiQualifying, actualDpi);
      
      const area = printWidthIn * printHeightIn;
      if (area > maxArea) {
        maxArea = area;
        maxSizeIndex = index;
      }
    }
  });
  
  // Fallback DPI calculation for aspect ratios that don't match any preset
  if (minDpiAll === Infinity && PRINT_SIZES.length > 0) {
    // Find the actual print size with the largest long edge
    type PrintSize = (typeof PRINT_SIZES)[number];
    let largestSize: PrintSize = PRINT_SIZES[0];
    let maxLongSide = Math.max(largestSize.widthIn, largestSize.heightIn);
    
    for (const size of PRINT_SIZES) {
      const longSide = Math.max(size.widthIn, size.heightIn);
      if (longSide > maxLongSide) {
        maxLongSide = longSide;
        largestSize = size;
      }
    }
    
    // Orient the preset to match artwork's orientation
    const sizeIsLandscape = largestSize.widthIn > largestSize.heightIn;
    const artworkIsLandscape = widthPx > heightPx;
    
    let targetWidthIn: number = largestSize.widthIn;
    let targetHeightIn: number = largestSize.heightIn;
    
    // Rotate if orientations don't match
    if (sizeIsLandscape !== artworkIsLandscape) {
      [targetWidthIn, targetHeightIn] = [targetHeightIn, targetWidthIn];
    }
    
    // Calculate DPI using actual preset dimensions (both axes)
    const fallbackDpi = Math.min(widthPx / targetWidthIn, heightPx / targetHeightIn);
    minDpiAll = fallbackDpi;
  } else if (minDpiAll === Infinity) {
    // No configured sizes (shouldn't happen)
    minDpiAll = 72;
  }
  
  const maxSizeName = maxSizeIndex >= 0
    ? `${PRINT_SIZES[maxSizeIndex].name} (${PRINT_SIZES[maxSizeIndex].widthIn}" x ${PRINT_SIZES[maxSizeIndex].heightIn}")`
    : "None (insufficient resolution)";
  
  let warning: string | undefined;
  if (imageCategory === "custom") {
    warning = "Incompatible aspect ratio: This artwork's proportions do not match any standard print sizes. Supported ratios: Square (1:1), A Ratio (√2:1), 2:3, 3:4, 4:5, 5:8.";
  } else if (availableSizes.length === 1) {
    warning = `Insufficient print options: This file can only be printed at ${availableSizes[0]} size. Artworks must support at least 2 print sizes. Please upload a higher resolution image.`;
  } else if (availableSizes.length === 0) {
    warning = "No print sizes available at sufficient resolution (minimum 200 DPI required).";
  }
  
  // Return both values:
  // - dpi: true minimum across ALL sizes (for messaging/display)
  // - effectiveDpi: minimum of qualifying sizes only (for eligibility checks)
  // - ratioCategory: category for UI messaging about incompatible ratios
  return {
    maxSize: maxSizeName,
    available: availableSizes,
    dpi: Math.round(minDpiAll),
    effectiveDpi: minDpiQualifying === Infinity ? 0 : Math.round(minDpiQualifying),
    ratioCategory: imageCategory,
    warning,
  };
}

async function processImage(request: ProcessImageRequest): Promise<ProcessImageResponse> {
  try {
    const { requestId, file, maxThumbnailWidth } = request;
    
    console.log('[Worker] Processing file:', file.name);
    
    // Parse EXIF metadata for orientation, dimensions, AND color space detection (instant, no image decode)
    const exif = await exifr.parse(file, [
      'Orientation', 'ImageWidth', 'ImageHeight', 'PixelXDimension', 'PixelYDimension',
      'ColorSpace', 'PhotometricInterpretation', 'ColorModel'
    ]);
    const orientation = exif?.Orientation || 1;
    
    // Detect CMYK from EXIF/TIFF metadata
    // PhotometricInterpretation: 5 = CMYK in TIFF, 2 = RGB, 6 = YCbCr (JPEG)
    // ColorModel: 'CMYK' or 'RGB' in some formats
    // ColorSpace: 1 = sRGB in EXIF, 65535 = uncalibrated (often means CMYK)
    const photometric = exif?.PhotometricInterpretation;
    const colorModel = exif?.ColorModel;
    const colorSpace = exif?.ColorSpace;
    
    // Check for CMYK indicators
    const isCMYK = 
      photometric === 5 || // TIFF CMYK
      colorModel === 'CMYK' ||
      (typeof colorSpace === 'string' && colorSpace.toUpperCase().includes('CMYK'));
    
    // Check for definite RGB indicators (only skip server when we're sure it's RGB)
    // EXIF ColorSpace=1 means sRGB, ColorSpace=2 means AdobeRGB
    // PhotometricInterpretation 2=RGB, 6=YCbCr (JPEG default)
    const isDefinitelyRGB = 
      photometric === 2 || // RGB
      photometric === 6 || // YCbCr (standard JPEG)
      colorSpace === 1 ||  // sRGB
      colorSpace === 2 ||  // AdobeRGB
      colorModel === 'RGB';
    
    console.log('[Worker] Color space detection:', {
      filename: file.name,
      PhotometricInterpretation: photometric,
      ColorModel: colorModel,
      ColorSpace: colorSpace,
      isCMYK,
      isDefinitelyRGB
    });
    
    // Get dimensions - prefer createImageBitmap (accurate), fall back to EXIF for CMYK/unsupported
    let widthPx = 0;
    let heightPx = 0;
    let dimensionSource = 'unknown';
    
    try {
      // Try createImageBitmap first - gives actual decoded dimensions (works for RGB)
      const dimensionBitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
        colorSpaceConversion: 'none'
      });
      widthPx = dimensionBitmap.width;
      heightPx = dimensionBitmap.height;
      dimensionBitmap.close();
      dimensionSource = 'ImageBitmap';
    } catch (bitmapError) {
      // createImageBitmap failed (CMYK, TIFF, PSD, etc) - fall back to EXIF
      console.log('[Worker] createImageBitmap failed, using EXIF dimensions:', bitmapError);
      widthPx = exif?.PixelXDimension || exif?.ImageWidth || 0;
      heightPx = exif?.PixelYDimension || exif?.ImageHeight || 0;
      
      // Handle EXIF orientation - orientations 5-8 swap width/height
      if (orientation >= 5 && orientation <= 8 && widthPx && heightPx) {
        [widthPx, heightPx] = [heightPx, widthPx];
      }
      dimensionSource = 'EXIF';
    }
    
    console.log('[Worker] Image dimensions:', {
      filename: file.name,
      dimensions: `${widthPx} × ${heightPx}`,
      orientation: orientation,
      displayOrientation: widthPx > heightPx ? 'landscape' : 'portrait',
      source: dimensionSource
    });
    
    // Calculate thumbnail dimensions
    const scale = Math.min(maxThumbnailWidth / widthPx, 1);
    const thumbnailWidth = Math.round(widthPx * scale);
    const thumbnailHeight = Math.round(heightPx * scale);
    
    // OPTIMIZATION: Use resizeWidth/resizeHeight in createImageBitmap
    // This lets the browser decode and resize in one step, much faster than
    // decoding full image then resizing in canvas
    const thumbnailBitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
      colorSpaceConversion: 'default',
      resizeWidth: thumbnailWidth,
      resizeHeight: thumbnailHeight,
      resizeQuality: 'medium'  // 'low', 'medium', or 'high' - medium is good balance
    });
    
    // Draw to OffscreenCanvas (now working with small thumbnail-sized bitmap)
    const offscreenCanvas = new OffscreenCanvas(thumbnailWidth, thumbnailHeight);
    const ctx = offscreenCanvas.getContext('2d');
    
    if (!ctx) {
      thumbnailBitmap.close();
      throw new Error('Failed to get OffscreenCanvas context');
    }
    
    ctx.drawImage(thumbnailBitmap, 0, 0);
    thumbnailBitmap.close();
    
    // Convert to blob URL
    const blob = await offscreenCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    const thumbnailUrl = URL.createObjectURL(blob);
    
    // Analyze image - calculate actual DPI based on dimensions
    const { ratio, name: aspectRatioName } = calculateAspectRatio(widthPx, heightPx);
    const { maxSize, available, dpi, effectiveDpi, ratioCategory, warning } = calculateAvailableSizes(widthPx, heightPx, 300);
    
    return {
      requestId,
      thumbnailUrl,
      analysis: {
        widthPx,
        heightPx,
        dpi, // True minimum DPI across all matching sizes (even if < MIN_DPI)
        aspectRatio: aspectRatioName,
        ratioCategory, // For UI messaging about incompatible ratios
        maxPrintSize: maxSize,
        availableSizes: available,
        ratio,
        effectiveDpi, // Minimum DPI of sizes that meet MIN_DPI threshold
        warning,
        isCMYK, // For detecting CMYK files
        isDefinitelyRGB, // Only true when EXIF confirms RGB - safe to skip server
      },
    };
  } catch (error) {
    console.error('Error processing image:', error);
    return {
      requestId: request.requestId,
      thumbnailUrl: '',
      analysis: null,
    };
  }
}

// Listen for messages from main thread
self.onmessage = async (e: MessageEvent<ProcessImageRequest>) => {
  const result = await processImage(e.data);
  self.postMessage(result);
};
