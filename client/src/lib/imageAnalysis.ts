import { PRINT_SIZES, MIN_DPI } from "@shared/schema";

export interface ClientImageAnalysis {
  widthPx: number;
  heightPx: number;
  aspectRatio: string;
  ratioCategory: string;
  availableSizesAtMinDpi: string[];
  maxPrintSize: string;
}

function getRatioCategory(ratio: number): string {
  const tolerance = 0.03;
  
  if (Math.abs(ratio - 1) < tolerance) {
    return "square";
  }
  
  if (Math.abs(ratio - 1.414) < tolerance || Math.abs(ratio - (1 / 1.414)) < tolerance) {
    return "a-ratio";
  }
  
  if (Math.abs(ratio - 0.75) < tolerance || Math.abs(ratio - 1.33) < tolerance) {
    return "3:4";
  }
  
  if (Math.abs(ratio - 0.667) < tolerance || Math.abs(ratio - 1.5) < tolerance) {
    return "2:3";
  }
  
  if (Math.abs(ratio - 0.8) < tolerance || Math.abs(ratio - 1.25) < tolerance) {
    return "4:5";
  }
  
  if (Math.abs(ratio - 0.625) < tolerance || Math.abs(ratio - 1.6) < tolerance) {
    return "5:8";
  }
  
  return "custom";
}

function calculateAspectRatioName(width: number, height: number): string {
  const ratio = width / height;
  const tolerance = 0.05;
  
  if (Math.abs(ratio - 1) < tolerance) {
    return "Square (1:1)";
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
    return closestMatch.name;
  }
  
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const w = Math.round(width);
  const h = Math.round(height);
  const divisor = gcd(w, h);
  const simplifiedW = w / divisor;
  const simplifiedH = h / divisor;
  
  return `${simplifiedW}:${simplifiedH}`;
}

export async function analyzeImageFile(file: File): Promise<ClientImageAnalysis> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const widthPx = img.naturalWidth;
      const heightPx = img.naturalHeight;
      const ratio = widthPx / heightPx;
      const ratioCategory = getRatioCategory(ratio);
      const aspectRatio = calculateAspectRatioName(widthPx, heightPx);
      
      // Calculate available sizes assuming minimum DPI
      const availableSizes: string[] = [];
      let maxSizeIndex = -1;
      let maxArea = 0;
      
      PRINT_SIZES.forEach((size, index) => {
        const sizeRatio = size.widthIn / size.heightIn;
        const sizeCategory = getRatioCategory(sizeRatio);
        
        if (ratioCategory !== sizeCategory) return;
        
        const actualDpiWidth = widthPx / size.widthIn;
        const actualDpiHeight = heightPx / size.heightIn;
        const actualDpi = Math.min(actualDpiWidth, actualDpiHeight);
        
        if (actualDpi >= MIN_DPI) {
          availableSizes.push(size.code);
          
          const area = size.widthIn * size.heightIn;
          if (area > maxArea) {
            maxArea = area;
            maxSizeIndex = index;
          }
        }
      });
      
      const maxPrintSize = maxSizeIndex >= 0 
        ? PRINT_SIZES[maxSizeIndex].name
        : "None";
      
      resolve({
        widthPx,
        heightPx,
        aspectRatio,
        ratioCategory,
        availableSizesAtMinDpi: availableSizes,
        maxPrintSize,
      });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}
