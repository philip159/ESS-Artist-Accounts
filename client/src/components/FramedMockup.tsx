import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Check, Save, SlidersHorizontal } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import oakTextureUrl from "@assets/MLDA796_OAK Texture_1763735463200.jpg";

// Global ImageBitmap cache to survive component remounts
const imageBitmapCache = new Map<string, ImageBitmap>();

// Export a function to pre-cache images as ImageBitmaps for instant switching
export async function preloadImageBitmap(url: string): Promise<void> {
  if (!url || imageBitmapCache.has(url)) return;
  
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = async () => {
      try {
        const bitmap = await createImageBitmap(img);
        imageBitmapCache.set(url, bitmap);
      } catch (e) {
        // Ignore errors during pre-caching
      }
      resolve();
    };
    
    img.onerror = () => resolve();
    img.src = url;
  });
}

// Check if an image is already cached
export function isImageCached(url: string): boolean {
  return imageBitmapCache.has(url);
}

export interface PreviewConfig {
  previewBoost: number;
  maxVisualScale: number;
  shadowOffsetBase: number;
  shadowBlurBase: number;
  shadowOpacity: number;
  frameLipMultiplier: number;
}

export const DEFAULT_PREVIEW_CONFIG: PreviewConfig = {
  previewBoost: 2,
  maxVisualScale: 0.05,
  shadowOffsetBase: 4,
  shadowBlurBase: 3,
  shadowOpacity: 1.0,
  frameLipMultiplier: 1.0,
};

interface FramedMockupProps {
  imageUrl: string;
  fallbackUrl?: string; // Fast local preview to show instantly while imageUrl loads
  title: string;
  artistName: string;
  availableSizes: string[];
  widthPx: number;
  heightPx: number;
  dpi: number;
  previewConfig?: PreviewConfig;
  frameFinish?: FrameFinish;
  hideFrameOptions?: boolean;
  hideAdminControls?: boolean;
  editionType?: "open" | "limited";
  textureRefreshKey?: number;
}

interface ParsedSize {
  widthMm: number;
  heightMm: number;
  sourceLabel: string;
  error: string | null;
}

export type FrameFinish = "unframed" | "black" | "white" | "natural" | "oak";
export type FrameType = "std" | "box";

const MOUNT_BORDERS_MM: Record<string, number> = {
  "6X8": 30,
  "8X10": 40,
  A4: 40,
  "8X12": 40,
  "11X14": 40,
  A3: 50,
  "12X16": 50,
  "12X18": 50,
  "16X20": 50,
  A2: 50,
  "18X24": 50,
  "20X28": 50,
  "20X30": 50,
  A1: 50,
  "24X32": 50,
  "24X36": 50,
  "28X40": 60,
  "30X40": 60,
  A0: 50,
  "12X12": 40,
  "16X16": 50,
  "20X20": 50,
  "30X30": 60,
};

function getMountBorderMm(sizeStr: string): number {
  for (const [key, val] of Object.entries(MOUNT_BORDERS_MM)) {
    if (sizeStr.toUpperCase().includes(key)) return val;
  }
  return 50;
}

interface MockupLayout {
  targetWidth: number;
  targetHeight: number;
  dpr: number;
  rect: { width: number; height: number };
  frameX: number;
  frameY: number;
  finalFrameWidth: number;
  finalFrameHeight: number;
  finalArtworkWidth: number;
  finalArtworkHeight: number;
  finalDisplayFrameWidth: number;
  finalShadowOffset: number;
  finalShadowBlur: number;
  shadowOpacity: number;
  totalFrameWidth: number;
  totalFrameHeight: number;
  hasResolutionWarning: boolean;
  swatchOffset: number;
  scaleToFit: number;
  parseError: string | null;
  suggestedCanvasWidth: number;
  suggestedCanvasHeight: number;
  actualImageWidth: number;
  actualImageHeight: number;
  actualImageOffsetX: number;
  actualImageOffsetY: number;
  mountBorderPx: number;
  mountApertureWidth: number;
  mountApertureHeight: number;
  fillRatio: number;
}

function calculateDiagonalMm(widthMm: number, heightMm: number): number {
  return Math.sqrt(widthMm * widthMm + heightMm * heightMm);
}

const ALL_SIZES_MM = [
  { widthMm: 152, heightMm: 203 },
  { widthMm: 203, heightMm: 254 },
  { widthMm: 210, heightMm: 297 },
  { widthMm: 203, heightMm: 305 },
  { widthMm: 279, heightMm: 356 },
  { widthMm: 297, heightMm: 420 },
  { widthMm: 305, heightMm: 406 },
  { widthMm: 305, heightMm: 457 },
  { widthMm: 406, heightMm: 508 },
  { widthMm: 420, heightMm: 594 },
  { widthMm: 457, heightMm: 610 },
  { widthMm: 508, heightMm: 711 },
  { widthMm: 508, heightMm: 762 },
  { widthMm: 594, heightMm: 841 },
  { widthMm: 610, heightMm: 813 },
  { widthMm: 610, heightMm: 914 },
  { widthMm: 711, heightMm: 1016 },
  { widthMm: 762, heightMm: 1016 },
  { widthMm: 841, heightMm: 1189 },
  { widthMm: 305, heightMm: 305 },
  { widthMm: 406, heightMm: 406 },
  { widthMm: 508, heightMm: 508 },
  { widthMm: 762, heightMm: 762 },
];

const LARGEST_DIAGONAL = Math.max(...ALL_SIZES_MM.map(s => calculateDiagonalMm(s.widthMm, s.heightMm)));

function buildMockupLayout(
  canvas: HTMLCanvasElement,
  selectedSize: string,
  widthPx: number,
  heightPx: number,
  dpi: number,
  parseSizeString: (size: string) => ParsedSize,
  _calculateNormalizedScale: (printSize: ParsedSize) => number,
  config: PreviewConfig = DEFAULT_PREVIEW_CONFIG,
  showMount: boolean = false,
  shadowOverrides?: { offset: number; blur: number; opacity: number },
  unframedShadowScale: number = 0.3,
  isFramed: boolean = true
): MockupLayout | null {
  const rect = canvas.getBoundingClientRect();
  const printSize = parseSizeString(selectedSize);
  
  if (printSize.error) {
    return {
      targetWidth: 0,
      targetHeight: 0,
      dpr: 1,
      rect: { width: rect.width, height: rect.height },
      frameX: 0,
      frameY: 0,
      finalFrameWidth: 0,
      finalFrameHeight: 0,
      finalArtworkWidth: 0,
      finalArtworkHeight: 0,
      finalDisplayFrameWidth: 0,
      finalShadowOffset: 0,
      finalShadowBlur: 0,
      shadowOpacity: config.shadowOpacity,
      totalFrameWidth: 0,
      totalFrameHeight: 0,
      hasResolutionWarning: false,
      swatchOffset: 0,
      scaleToFit: 1,
      parseError: printSize.error,
      suggestedCanvasWidth: 600,
      suggestedCanvasHeight: 600,
      actualImageWidth: 0,
      actualImageHeight: 0,
      actualImageOffsetX: 0,
      actualImageOffsetY: 0,
      mountBorderPx: 0,
      mountApertureWidth: 0,
      mountApertureHeight: 0,
      fillRatio: 0.4,
    };
  }

  const FRAME_WIDTH_MM = 21;
  const REFERENCE_DPI = 300;
  const dpiScale = REFERENCE_DPI / 25.4;
  const CANVAS_PADDING = 60;
  const MIN_FILL = 0.4;
  const MAX_FILL = 0.92;
  const SHADOW_COEFFICIENT = 0.012;

  const artworkIsLandscape = widthPx > heightPx;
  const printSizeIsLandscape = printSize.widthMm > printSize.heightMm;
  
  let printWidthMm = printSize.widthMm;
  let printHeightMm = printSize.heightMm;
  
  if (artworkIsLandscape !== printSizeIsLandscape) {
    printWidthMm = printSize.heightMm;
    printHeightMm = printSize.widthMm;
  }

  const canvasWidth = rect.width;
  const canvasHeight = rect.height;

  const frameWidthMm = FRAME_WIDTH_MM;
  const totalFrameHeightMm = (printHeightMm + frameWidthMm * 2) * dpiScale;
  const totalFrameWidthMm = (printWidthMm + frameWidthMm * 2) * dpiScale;

  const availableWidth = canvasWidth - CANVAS_PADDING * 2;
  const availableHeight = canvasHeight - CANVAS_PADDING * 2;

  const sizeRatio = calculateDiagonalMm(printSize.widthMm, printSize.heightMm) / LARGEST_DIAGONAL;
  const fillRatio = MIN_FILL + sizeRatio * (MAX_FILL - MIN_FILL);

  const scaleForHeight = (availableHeight * fillRatio) / totalFrameHeightMm;
  const scaleForWidth = (availableWidth * fillRatio) / totalFrameWidthMm;
  const effectiveScale = Math.min(scaleForHeight, scaleForWidth);

  const frameWidthBase = frameWidthMm * dpiScale;
  const artWidthBase = printWidthMm * dpiScale;
  const artHeightBase = printHeightMm * dpiScale;

  const frameWidthPxFinal = Math.round(frameWidthBase * effectiveScale);
  const artworkW = Math.round(artWidthBase * effectiveScale);
  const artworkH = Math.round(artHeightBase * effectiveScale);
  const frameW = artworkW + frameWidthPxFinal * 2;
  const frameH = artworkH + frameWidthPxFinal * 2;

  const effectiveShadowOffset = shadowOverrides ? shadowOverrides.offset : config.shadowOffsetBase;
  const effectiveShadowBlur = shadowOverrides ? shadowOverrides.blur : config.shadowBlurBase;
  const effectiveShadowOpacity = shadowOverrides ? shadowOverrides.opacity : config.shadowOpacity;

  const inverseFill = 1 - fillRatio + 0.3;
  const unframedScale = isFramed ? 1.0 : unframedShadowScale;
  const finalShadowOffset = effectiveShadowOffset * canvasHeight * SHADOW_COEFFICIENT * inverseFill * unframedScale;
  const finalShadowBlur = effectiveShadowBlur * canvasHeight * SHADOW_COEFFICIENT * inverseFill * unframedScale;

  const frameX = Math.round((canvasWidth - frameW) / 2);
  const frameY = Math.round((canvasHeight - frameH) / 2);

  const printWidthPx = (printWidthMm * dpi) / 25.4;
  const printHeightPx = (printHeightMm * dpi) / 25.4;
  const resolutionRatio = Math.min(widthPx / printWidthPx, heightPx / printHeightPx);
  const hasResolutionWarning = resolutionRatio < 0.99;

  const dpr = (window.devicePixelRatio || 1) * 2;
  const targetWidth = rect.width * dpr;
  const targetHeight = rect.height * dpr;

  const frameAspectRatio = frameW / frameH;
  const MAX_CANVAS_DIMENSION = 600;
  const MIN_CANVAS_DIMENSION = 300;
  let suggestedCanvasWidth: number;
  let suggestedCanvasHeight: number;
  if (frameAspectRatio >= 1) {
    suggestedCanvasWidth = MAX_CANVAS_DIMENSION;
    suggestedCanvasHeight = Math.max(MIN_CANVAS_DIMENSION, MAX_CANVAS_DIMENSION / frameAspectRatio);
  } else {
    suggestedCanvasHeight = MAX_CANVAS_DIMENSION;
    suggestedCanvasWidth = Math.max(MIN_CANVAS_DIMENSION, MAX_CANVAS_DIMENSION * frameAspectRatio);
  }

  const frameCentreX = frameX + (frameW / 2);
  const canvasCentreX = canvasWidth / 2;
  const swatchOffset = frameCentreX - canvasCentreX;

  const mountBorderMm = getMountBorderMm(selectedSize);
  const mountBorderBase = mountBorderMm * dpiScale;
  const mountBorderPx = showMount ? Math.round(mountBorderBase * effectiveScale) : 0;
  const mountApertureWidth = artworkW - (mountBorderPx * 2);
  const mountApertureHeight = artworkH - (mountBorderPx * 2);

  const visibleWidth = showMount ? mountApertureWidth : artworkW;
  const visibleHeight = showMount ? mountApertureHeight : artworkH;
  const artworkAspectRatio = widthPx / heightPx;
  const visibleAspectRatio = visibleWidth / visibleHeight;
  
  let actualImageWidth: number;
  let actualImageHeight: number;
  let actualImageOffsetX: number;
  let actualImageOffsetY: number;
  
  if (artworkAspectRatio > visibleAspectRatio) {
    actualImageHeight = visibleHeight;
    actualImageWidth = visibleHeight * artworkAspectRatio;
    actualImageOffsetX = -(actualImageWidth - visibleWidth) / 2;
    actualImageOffsetY = 0;
  } else {
    actualImageWidth = visibleWidth;
    actualImageHeight = visibleWidth / artworkAspectRatio;
    actualImageOffsetX = 0;
    actualImageOffsetY = -(actualImageHeight - visibleHeight) / 2;
  }

  return {
    targetWidth,
    targetHeight,
    dpr,
    rect: { width: rect.width, height: rect.height },
    frameX,
    frameY,
    finalFrameWidth: frameW,
    finalFrameHeight: frameH,
    finalArtworkWidth: artworkW,
    finalArtworkHeight: artworkH,
    finalDisplayFrameWidth: frameWidthPxFinal,
    finalShadowOffset,
    finalShadowBlur,
    shadowOpacity: effectiveShadowOpacity,
    totalFrameWidth: frameW,
    totalFrameHeight: frameH,
    hasResolutionWarning,
    swatchOffset,
    scaleToFit: effectiveScale,
    parseError: null,
    suggestedCanvasWidth,
    suggestedCanvasHeight,
    actualImageWidth,
    actualImageHeight,
    actualImageOffsetX,
    actualImageOffsetY,
    mountBorderPx,
    mountApertureWidth,
    mountApertureHeight,
    fillRatio,
  };
}

export const FramedMockup = memo(function FramedMockup({
  imageUrl,
  fallbackUrl,
  title,
  artistName,
  availableSizes = [],
  widthPx,
  heightPx,
  dpi,
  previewConfig,
  frameFinish,
  hideFrameOptions = false,
  hideAdminControls = false,
  editionType = "open",
  textureRefreshKey,
}: FramedMockupProps) {
  
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const canvasCallbackRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvas(node);
  }, []);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageBitmapRef = useRef<ImageBitmap | null>(null);
  const frameCacheRef = useRef<Map<string, ImageData>>(new Map());
  
  const { toast } = useToast();
  const [selectedSize, setSelectedSize] = useState(availableSizes.length > 0 ? availableSizes[availableSizes.length - 1] : "");
  const [selectedFrame, setSelectedFrame] = useState<FrameFinish>("black");
  const [frameType, setFrameType] = useState<FrameType>("std");
  const [showMount, setShowMount] = useState(false);
  const [showShadowControls, setShowShadowControls] = useState(false);
  const effectiveConfig = previewConfig || DEFAULT_PREVIEW_CONFIG;
  const [shadowOffset, setShadowOffset] = useState(effectiveConfig.shadowOffsetBase);
  const [shadowBlur, setShadowBlur] = useState(effectiveConfig.shadowBlurBase);
  const [shadowOpacityVal, setShadowOpacityVal] = useState(effectiveConfig.shadowOpacity);
  const [shadowDarkness, setShadowDarkness] = useState(0.5);
  const [innerShadowDepth, setInnerShadowDepth] = useState(4);
  const [innerShadowOpacity, setInnerShadowOpacity] = useState(0.27);
  const [chamferDark, setChamferDark] = useState(0.15);
  const [chamferLight, setChamferLight] = useState(0.10);
  const [chamferSize, setChamferSize] = useState(2.0);
  const [lipIntensity, setLipIntensity] = useState(1.0);
  const [edgeHighlight, setEdgeHighlight] = useState(1.0);
  const [edgeShadow, setEdgeShadow] = useState(1.0);
  const [frameGradient, setFrameGradient] = useState(1.0);
  const [innerShadowOverlap, setInnerShadowOverlap] = useState(1);
  const [unframedShadowScale, setUnframedShadowScale] = useState(0.3);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [mountColor, setMountColor] = useState('#FEFEFA');

  useEffect(() => {
    if (settingsLoaded) return;
    (async () => {
      try {
        const res = await fetch("/api/admin/frame-overlays/render-settings", { credentials: "include" });
        if (!res.ok) return;
        const saved = await res.json();
        if (saved.shadowOffset !== undefined) setShadowOffset(saved.shadowOffset);
        if (saved.shadowBlur !== undefined) setShadowBlur(saved.shadowBlur);
        if (saved.shadowOpacity !== undefined) setShadowOpacityVal(saved.shadowOpacity);
        if (saved.shadowDarkness !== undefined) setShadowDarkness(saved.shadowDarkness);
        if (saved.innerShadowDepth !== undefined) setInnerShadowDepth(saved.innerShadowDepth);
        if (saved.innerShadowOpacity !== undefined) setInnerShadowOpacity(saved.innerShadowOpacity);
        if (saved.chamferDark !== undefined) setChamferDark(saved.chamferDark);
        if (saved.chamferLight !== undefined) setChamferLight(saved.chamferLight);
        if (saved.chamferSize !== undefined) setChamferSize(saved.chamferSize);
        if (saved.lipIntensity !== undefined) setLipIntensity(saved.lipIntensity);
        if (saved.edgeHighlight !== undefined) setEdgeHighlight(saved.edgeHighlight);
        if (saved.edgeShadow !== undefined) setEdgeShadow(saved.edgeShadow);
        if (saved.frameGradient !== undefined) setFrameGradient(saved.frameGradient);
        if (saved.innerShadowOverlap !== undefined) setInnerShadowOverlap(saved.innerShadowOverlap);
        if (saved.unframedShadowScale !== undefined) setUnframedShadowScale(saved.unframedShadowScale);
        setSettingsLoaded(true);
      } catch {
        setSettingsLoaded(true);
      }
    })();
  }, [settingsLoaded]);

  const handleSaveSettings = useCallback(async () => {
    setSavingSettings(true);
    try {
      await apiRequest("POST", "/api/admin/frame-overlays/render-settings", {
        shadowOffset,
        shadowBlur,
        shadowOpacity: shadowOpacityVal,
        shadowDarkness,
        innerShadowDepth,
        innerShadowOpacity,
        chamferDark,
        chamferLight,
        chamferSize,
        lipIntensity,
        edgeHighlight,
        edgeShadow,
        frameGradient,
        innerShadowOverlap,
        unframedShadowScale,
      });
      toast({ title: "Settings Saved", description: "Overlay generation will use these settings." });
    } catch {
      toast({ title: "Save Failed", description: "Could not save render settings.", variant: "destructive" });
    }
    setSavingSettings(false);
  }, [shadowOffset, shadowBlur, shadowOpacityVal, shadowDarkness, innerShadowDepth, innerShadowOpacity, chamferDark, chamferLight, chamferSize, lipIntensity, edgeHighlight, edgeShadow, frameGradient, innerShadowOverlap, unframedShadowScale, toast]);
  const [frameTextures, setFrameTextures] = useState<Array<{ id: string; name: string; url: string; bitmap?: ImageBitmap }>>([]);
  const [activeTextureId, setActiveTextureId] = useState<string | null>(null);
  const [texturesLoaded, setTexturesLoaded] = useState(false);
  const [textureAssignments, setTextureAssignments] = useState<Record<string, string | null>>({});
  const [mountTextureBitmap, setMountTextureBitmap] = useState<ImageBitmap | null>(null);

  useEffect(() => {
    setTexturesLoaded(false);
  }, [textureRefreshKey]);

  useEffect(() => {
    if (texturesLoaded) return;
    (async () => {
      try {
        const [texRes, assignRes] = await Promise.all([
          fetch("/api/frame-textures", { credentials: "include" }),
          fetch("/api/admin/frame-texture-assignments", { credentials: "include" }),
        ]);
        let assignments: Record<string, string | null> = {};
        if (assignRes.ok) {
          assignments = await assignRes.json();
          setTextureAssignments(assignments);
          if (assignments["mount"]) {
            try {
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.src = assignments["mount"];
              await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject();
              });
              const bmp = await createImageBitmap(img);
              setMountTextureBitmap(bmp);
            } catch {
              setMountTextureBitmap(null);
            }
          }
        }
        if (!texRes.ok) return;
        const files: Array<{ name: string; url: string }> = await texRes.json();
        const textures = await Promise.all(
          files.map(async (f) => {
            const id = `saved_${f.url}`;
            try {
              const img = new Image();
              img.crossOrigin = "anonymous";
              await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject();
                img.src = f.url;
              });
              const bitmap = await createImageBitmap(img);
              return { id, name: f.name, url: f.url, bitmap };
            } catch {
              return { id, name: f.name, url: f.url };
            }
          })
        );
        setFrameTextures(textures);
        setTexturesLoaded(true);
      } catch {
        setTexturesLoaded(true);
      }
    })();
  }, [texturesLoaded]);

  // Use controlled frameFinish prop if provided, otherwise use internal state
  // For limited editions (hideFrameOptions=true), force unframed
  const activeFrame = hideFrameOptions ? "unframed" : (frameFinish ?? selectedFrame);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [resolutionWarning, setResolutionWarning] = useState<boolean>(false);
  const [swatchOffset, setSwatchOffset] = useState<number>(0);

  // When imageUrl changes, DON'T reset immediately - keep showing old image until new one loads
  // This prevents the blank flash when switching between artworks
  // The image loading effect will update the bitmap and trigger a redraw when ready

  // Reset selectedSize when availableSizes changes
  useEffect(() => {
    if (availableSizes.length > 0) {
      setSelectedSize(availableSizes[availableSizes.length - 1]);
    }
  }, [availableSizes]);

  // Robust size parser supporting mm, cm, in, and decimal values (memoized)
  const parseSizeString = useMemo(() => {
    const cache = new Map<string, ParsedSize>();
    
    const A_SIZES_MM: Record<string, { w: number; h: number }> = {
      a0: { w: 841, h: 1189 },
      a1: { w: 594, h: 841 },
      a2: { w: 420, h: 594 },
      a3: { w: 297, h: 420 },
      a4: { w: 210, h: 297 },
      a5: { w: 148, h: 210 },
    };

    return (sizeStr: string): ParsedSize => {
      if (cache.has(sizeStr)) {
        return cache.get(sizeStr)!;
      }
      
      const trimmed = sizeStr.trim().toLowerCase();
      const aMatch = trimmed.match(/^(a\d)\b/);
      const aKey = aMatch ? aMatch[1] : null;
      if (aKey && A_SIZES_MM[aKey]) {
        const a = A_SIZES_MM[aKey];
        const result = { widthMm: a.w, heightMm: a.h, sourceLabel: sizeStr, error: null };
        cache.set(sizeStr, result);
        return result;
      }

      // Normalize all quote variants to standard ASCII quotes using explicit Unicode escapes
      const normalized = sizeStr
        .replace(/[\u201C\u201D\u201F\u2033]/g, '"')  // Left/right curly quotes, reversed quote, double prime → "
        .replace(/[\u2018\u2019\u201B\u2032]/g, "'");  // Left/right single quotes, reversed quote, prime → '
      
      // Extract dimension substring from labeled formats like "A4 (210x297mm)"
      // Look for the pattern: number [unit] x number [unit] anywhere in the string
      const match = normalized.match(
        /([\d.]+)\s*(mm|cm|in|inch|inches|"|in\.)?\s*[x×]\s*([\d.]+)\s*(mm|cm|in|inch|inches|"|in\.)?/i
      );

      if (!match) {
        const result = {
          widthMm: 0,
          heightMm: 0,
          sourceLabel: sizeStr,
          error: `Cannot parse size format: "${sizeStr}"`
        };
        cache.set(sizeStr, result);
        return result;
      }

      const width = parseFloat(match[1]);
      const widthUnit = (match[2] || "").toLowerCase();
      const height = parseFloat(match[3]);
      const heightUnit = (match[4] || "").toLowerCase();

      // Determine actual units (if second dimension has no unit, inherit from first)
      // Default to inches when no units specified — stored sizes like "30x40" are in inches
      const firstUnit = widthUnit || heightUnit || "in";
      const secondUnit = heightUnit || firstUnit;

      // Convert width to mm
      let widthMm = width;
      if (firstUnit.includes("in") || firstUnit === '"' || firstUnit === "in.") {
        widthMm = width * 25.4; // inches to mm
      } else if (firstUnit.includes("cm")) {
        widthMm = width * 10; // cm to mm
      }

      // Convert height to mm
      let heightMm = height;
      if (secondUnit.includes("in") || secondUnit === '"' || secondUnit === "in.") {
        heightMm = height * 25.4; // inches to mm
      } else if (secondUnit.includes("cm")) {
        heightMm = height * 10; // cm to mm
      }

      const result = { widthMm, heightMm, sourceLabel: sizeStr, error: null };
      cache.set(sizeStr, result);
      return result;
    };
  }, []); // Empty deps - parser logic doesn't change

  // Calculate diagonal for normalization (pure function)
  const calculateDiagonal = (widthMm: number, heightMm: number): number => {
    return Math.sqrt(widthMm * widthMm + heightMm * heightMm);
  };

  // Memoized parsed sizes and diagonal calculations
  const parsedSizesCache = useMemo(() => {
    return availableSizes.map(parseSizeString).filter(s => !s.error);
  }, [availableSizes, parseSizeString]);

  const maxDiagonal = useMemo(() => {
    if (parsedSizesCache.length === 0) return 0;
    const diagonals = parsedSizesCache.map(s => calculateDiagonal(s.widthMm, s.heightMm));
    return Math.max(...diagonals);
  }, [parsedSizesCache]);

  // Normalize size scaling based on all available sizes' diagonals (memoized)
  const calculateNormalizedScale = useMemo(() => {
    return (printSize: ParsedSize): number => {
      if (parsedSizesCache.length === 0) return 1.0;
      const currentDiagonal = calculateDiagonal(printSize.widthMm, printSize.heightMm);

      // Normalize between 0.5 (smallest) and 1.0 (largest)
      const MIN_SCALE = 0.5;
      return MIN_SCALE + ((currentDiagonal / maxDiagonal) * (1.0 - MIN_SCALE));
    };
  }, [parsedSizesCache, maxDiagonal]);

  const isFramed = activeFrame !== "unframed";
  const isBoxFrame = frameType === "box" && isFramed;
  const BOX_SHADOW_MULTIPLIER = 1.6;

  const getAssignedTexture = useCallback(() => {
    if (!isFramed) return null;
    const finish = activeFrame === "oak" ? "natural" : activeFrame;
    const key = isBoxFrame ? `box_${finish}` : finish;
    const assignedUrl = textureAssignments[key];
    if (assignedUrl) {
      const match = frameTextures.find(t => t.url === assignedUrl);
      if (match?.bitmap) return match;
    }
    return null;
  }, [isFramed, isBoxFrame, activeFrame, frameTextures, textureAssignments]);

  const layout = useMemo(() => {
    if (!canvas || !selectedSize) return null;
    return buildMockupLayout(
      canvas,
      selectedSize,
      widthPx,
      heightPx,
      dpi,
      parseSizeString,
      calculateNormalizedScale,
      previewConfig || DEFAULT_PREVIEW_CONFIG,
      showMount && isFramed,
      { offset: shadowOffset, blur: shadowBlur, opacity: shadowOpacityVal },
      unframedShadowScale,
      isFramed
    );
  }, [canvas, selectedSize, widthPx, heightPx, dpi, parseSizeString, calculateNormalizedScale, previewConfig, showMount, isFramed, shadowOffset, shadowBlur, shadowOpacityVal, unframedShadowScale]);

  // Separate effect to sync state from layout (non-blocking!)
  useEffect(() => {
    if (!layout) return;
    
    // Only update state if values actually changed
    if (layout.parseError !== parseError) {
      setParseError(layout.parseError);
    }
    if (layout.hasResolutionWarning !== resolutionWarning) {
      setResolutionWarning(layout.hasResolutionWarning);
    }
    if (Math.abs(layout.swatchOffset - swatchOffset) > 0.1) {
      setSwatchOffset(layout.swatchOffset);
    }
  }, [layout, parseError, resolutionWarning, swatchOffset]);

  // Main drawing effect - deferred to allow UI updates first
  useEffect(() => {
    if (!canvas || !layout) {
      return;
    }
    let rafId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Defer drawing to next macrotask so selection ring can paint first
    const scheduleDraw = () => {
      timeoutId = setTimeout(() => {
        rafId = requestAnimationFrame(() => {
        const {
          targetWidth,
          targetHeight,
          dpr,
          rect,
          frameX,
          frameY,
          finalFrameWidth,
          finalFrameHeight,
          finalArtworkWidth,
          finalArtworkHeight,
          finalDisplayFrameWidth,
          finalShadowOffset,
          finalShadowBlur,
          shadowOpacity,
          totalFrameWidth,
          totalFrameHeight,
          hasResolutionWarning,
          scaleToFit,
          actualImageWidth,
          actualImageHeight,
          actualImageOffsetX,
          actualImageOffsetY,
        } = layout;

        const visualDetailScale = totalFrameWidth / rect.width;

        // Reuse or create offscreen canvas for double buffering
        if (!offscreenCanvasRef.current || 
            offscreenCanvasRef.current.width !== targetWidth || 
            offscreenCanvasRef.current.height !== targetHeight) {
          offscreenCanvasRef.current = document.createElement('canvas');
          offscreenCanvasRef.current.width = targetWidth;
          offscreenCanvasRef.current.height = targetHeight;
        }

        const offscreen = offscreenCanvasRef.current;
        const offscreenCtx = offscreen.getContext('2d');
        if (!offscreenCtx) return;

        // Reset and scale
        offscreenCtx.setTransform(1, 0, 0, 1, 0, 0);
        offscreenCtx.scale(dpr, dpr);
        offscreenCtx.clearRect(0, 0, rect.width, rect.height);

        // Transparent background (cleared above)

        const getFrameStyle = () => {
          if (activeFrame === "unframed") return null;
          const finish = activeFrame === "oak" ? "natural" : activeFrame;
          const colorKey = isBoxFrame ? `box_${finish}_color` : `${finish}_color`;
          if (finish === "black") return textureAssignments[colorKey] as string || "#000000";
          if (finish === "white") return textureAssignments[colorKey] as string || "#FFFFFF";
          return null;
        };

        const artworkX = frameX + finalDisplayFrameWidth;
        const artworkY = frameY + finalDisplayFrameWidth;

        const { mountBorderPx, mountApertureWidth, mountApertureHeight } = layout;
        const mountActive = showMount && isFramed && mountBorderPx > 0;

        // --- Drop shadow (drawn FIRST, behind frame) ---
        // Physically-based penumbra: shadow is sharp at the frame edge and
        // progressively softer further away (extended light source simulation).
        // Approach: draw a single smooth gradient shadow using radial opacity
        // falloff on one temp canvas, then composite once — no banding.
        // "Length" = shadow distance, "Fade" = penumbra width,
        // "Darkness" = shadow colour intensity, "Opacity" = overall transparency.
        const drawTriangleShadow = (
          oL: number, oT: number, oR: number, oB: number,
          maxDist: number, fade: number, opacity: number, darkness: number
        ) => {
          if (maxDist < 0.5 && fade < 0.5) return;

          const shadowCanvas = document.createElement('canvas');
          shadowCanvas.width = offscreen.width;
          shadowCanvas.height = offscreen.height;
          const sCtx = shadowCanvas.getContext('2d')!;
          sCtx.scale(dpr, dpr);

          const shR = oR + maxDist;
          const shB = oB + maxDist;
          sCtx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, darkness)})`;
          sCtx.beginPath();
          sCtx.moveTo(oR, oT);
          sCtx.lineTo(shR, oT + maxDist);
          sCtx.lineTo(shR, shB);
          sCtx.lineTo(oL + maxDist, shB);
          sCtx.lineTo(oL, oB);
          sCtx.closePath();
          sCtx.fill();

          offscreenCtx.save();
          offscreenCtx.setTransform(1, 0, 0, 1, 0, 0);
          offscreenCtx.globalAlpha = Math.min(1, opacity);
          if (fade > 0.5) {
            offscreenCtx.filter = `blur(${fade * dpr}px)`;
          }
          offscreenCtx.drawImage(shadowCanvas, 0, 0);
          offscreenCtx.filter = 'none';
          offscreenCtx.globalAlpha = 1;
          offscreenCtx.restore();
        };

        const shadowMult = isBoxFrame ? BOX_SHADOW_MULTIPLIER : 1;
        if (isFramed) {
          // Subtle ambient shadow around full perimeter
          const ambientSpread = Math.max(3, 6 * visualDetailScale);
          offscreenCtx.save();
          offscreenCtx.filter = `blur(${ambientSpread * dpr}px)`;
          offscreenCtx.fillStyle = 'rgba(0, 0, 0, 0.08)';
          offscreenCtx.fillRect(frameX, frameY, finalFrameWidth, finalFrameHeight);
          offscreenCtx.filter = 'none';
          offscreenCtx.restore();

          drawTriangleShadow(
            frameX, frameY,
            frameX + finalFrameWidth, frameY + finalFrameHeight,
            finalShadowOffset * shadowMult, finalShadowBlur * shadowMult, shadowOpacity, shadowDarkness
          );
        } else if (!isFramed) {
          drawTriangleShadow(
            artworkX, artworkY,
            artworkX + finalArtworkWidth, artworkY + finalArtworkHeight,
            finalShadowOffset * 0.6, finalShadowBlur * 0.7, shadowOpacity * 0.8, shadowDarkness * 0.8
          );
        }

        // --- Frame rendering ---
        if (isFramed) {
          const frameStyle = getFrameStyle();
          const assignedTex = getAssignedTexture();
          
          if (assignedTex?.bitmap) {
            const texSource: CanvasImageSource = assignedTex.bitmap;
            const texW = assignedTex.bitmap.width;
            const texH = assignedTex.bitmap.height;
            const isStripTexture = texW > texH * 3;
            
            const interiorX = frameX + finalDisplayFrameWidth;
            const interiorY = frameY + finalDisplayFrameWidth;

            if (isStripTexture) {
              const fw = finalDisplayFrameWidth;
              const scaleCross = fw / texH;
              const pattern = offscreenCtx.createPattern(texSource, 'repeat');
              if (!pattern) return;

              const drawFrameSideStrip = (
                points: [number, number][],
                sideLength: number,
                originX: number,
                originY: number,
                angleDeg: number,
                flipCross: boolean
              ) => {
                offscreenCtx.save();
                offscreenCtx.beginPath();
                offscreenCtx.moveTo(points[0][0], points[0][1]);
                for (let i = 1; i < points.length; i++) {
                  offscreenCtx.lineTo(points[i][0], points[i][1]);
                }
                offscreenCtx.closePath();

                const t = new DOMMatrix()
                  .translate(originX, originY)
                  .rotate(angleDeg)
                  .scale(scaleCross, flipCross ? -scaleCross : scaleCross);

                pattern.setTransform(t);
                offscreenCtx.fillStyle = pattern;
                offscreenCtx.fill();
                offscreenCtx.restore();
              };

              // Top side: texture runs left-to-right, cross axis downward
              drawFrameSideStrip(
                [[frameX, frameY], [frameX + finalFrameWidth, frameY], [interiorX + finalArtworkWidth, interiorY], [interiorX, interiorY]],
                finalFrameWidth, frameX, frameY, 0, false
              );

              // Bottom side: texture runs left-to-right, cross axis upward (flipped)
              drawFrameSideStrip(
                [[frameX, frameY + finalFrameHeight], [interiorX, interiorY + finalArtworkHeight], [interiorX + finalArtworkWidth, interiorY + finalArtworkHeight], [frameX + finalFrameWidth, frameY + finalFrameHeight]],
                finalFrameWidth, frameX, frameY + finalFrameHeight, 0, true
              );

              // Right side: texture runs top-to-bottom, cross axis extends leftward into frame
              // Origin at top-right corner of frame, rotate 90° so pattern x runs downward
              // flipCross=false so y-scale is positive (extends left into frame)
              drawFrameSideStrip(
                [[frameX + finalFrameWidth, frameY], [frameX + finalFrameWidth, frameY + finalFrameHeight], [interiorX + finalArtworkWidth, interiorY + finalArtworkHeight], [interiorX + finalArtworkWidth, interiorY]],
                finalFrameHeight, frameX + finalFrameWidth, frameY, 90, false
              );

              // Left side: texture runs top-to-bottom, cross axis extends rightward into frame
              // Origin at bottom-left corner, rotate -90° so pattern x runs upward
              // flipCross=false so y-scale is positive (extends right into frame)
              drawFrameSideStrip(
                [[frameX, frameY], [interiorX, interiorY], [interiorX, interiorY + finalArtworkHeight], [frameX, frameY + finalFrameHeight]],
                finalFrameHeight, frameX, frameY + finalFrameHeight, -90, false
              );
            } else {
              // Square-ish texture (e.g. oak 75x75): use pattern repeat as before
              const scale = (finalDisplayFrameWidth / texH);
              const pattern = offscreenCtx.createPattern(texSource, 'repeat');
              if (!pattern) return;

              const drawTrapezoid = (points: [number, number][], rotationAngle: number) => {
                offscreenCtx.save();
                offscreenCtx.beginPath();
                offscreenCtx.moveTo(points[0][0], points[0][1]);
                for (let i = 1; i < points.length; i++) {
                  offscreenCtx.lineTo(points[i][0], points[i][1]);
                }
                offscreenCtx.closePath();
                
                const centerX = points.reduce((sum, p) => sum + p[0], 0) / points.length;
                const centerY = points.reduce((sum, p) => sum + p[1], 0) / points.length;
                
                const transform = new DOMMatrix()
                  .translate(centerX, centerY)
                  .rotate(rotationAngle)
                  .scale(scale, scale)
                  .translate(-centerX, -centerY);
                
                pattern.setTransform(transform);
                offscreenCtx.fillStyle = pattern;
                offscreenCtx.fill();
                offscreenCtx.restore();
              };
              
              drawTrapezoid([
                [frameX, frameY],
                [frameX + finalFrameWidth, frameY],
                [interiorX + finalArtworkWidth, interiorY],
                [interiorX, interiorY]
              ], 0);
              
              drawTrapezoid([
                [frameX + finalFrameWidth, frameY],
                [frameX + finalFrameWidth, frameY + finalFrameHeight],
                [interiorX + finalArtworkWidth, interiorY + finalArtworkHeight],
                [interiorX + finalArtworkWidth, interiorY]
              ], 90);
              
              drawTrapezoid([
                [frameX, frameY + finalFrameHeight],
                [interiorX, interiorY + finalArtworkHeight],
                [interiorX + finalArtworkWidth, interiorY + finalArtworkHeight],
                [frameX + finalFrameWidth, frameY + finalFrameHeight]
              ], 0);
              
              drawTrapezoid([
                [frameX, frameY],
                [interiorX, interiorY],
                [interiorX, interiorY + finalArtworkHeight],
                [frameX, frameY + finalFrameHeight]
              ], 90);
            }
          } else if (frameStyle) {
            offscreenCtx.fillStyle = frameStyle;
            offscreenCtx.fillRect(frameX, frameY, finalFrameWidth, finalFrameHeight);
          }

          // Subtle texture grain overlay — black and white standard frames only
          if (!isBoxFrame && (activeFrame === "black" || activeFrame === "white")) {
            const grainW = Math.ceil(finalFrameWidth);
            const grainH = Math.ceil(finalFrameHeight);
            if (grainW > 0 && grainH > 0) {
              const grainCanvas = document.createElement('canvas');
              grainCanvas.width = grainW;
              grainCanvas.height = grainH;
              const gCtx = grainCanvas.getContext('2d');
              if (gCtx) {
                const imgData = gCtx.createImageData(grainW, grainH);
                const d = imgData.data;
                const isBlack = activeFrame === "black";
                for (let i = 0; i < d.length; i += 4) {
                  if (isBlack) {
                    const v = Math.random() * 255;
                    d[i] = v; d[i + 1] = v; d[i + 2] = v;
                    d[i + 3] = 8;
                  } else {
                    const v = Math.random() * 128;
                    d[i] = v; d[i + 1] = v; d[i + 2] = v;
                    d[i + 3] = 4;
                  }
                }
                gCtx.putImageData(imgData, 0, 0);
                offscreenCtx.save();
                offscreenCtx.beginPath();
                offscreenCtx.rect(frameX, frameY, finalFrameWidth, finalFrameHeight);
                const iCutL = frameX + finalDisplayFrameWidth;
                const iCutT = frameY + finalDisplayFrameWidth;
                offscreenCtx.rect(iCutL + finalArtworkWidth, iCutT, -finalArtworkWidth, finalArtworkHeight);
                offscreenCtx.clip('evenodd');
                offscreenCtx.drawImage(grainCanvas, frameX, frameY);
                offscreenCtx.restore();
              }
            }
          }

          // Detect light frames — scale lip/mitre/chamfer intensity down
          const currentFinish = activeFrame === "oak" ? "natural" : activeFrame;
          const isLightFrame = currentFinish === "white" || currentFinish === "natural";
          const detailScale = isLightFrame ? 0.4 : 1.0;

          // Directional gradient overlay — simulates light from top-right
          if (frameGradient > 0) {
            const gradIntX = frameX + finalDisplayFrameWidth;
            const gradIntY = frameY + finalDisplayFrameWidth;
            offscreenCtx.save();
            offscreenCtx.beginPath();
            offscreenCtx.rect(frameX, frameY, finalFrameWidth, finalFrameHeight);
            offscreenCtx.rect(gradIntX, gradIntY, finalArtworkWidth, finalArtworkHeight);
            offscreenCtx.clip("evenodd");

            const isDark = currentFinish === "black";
            const vGrad = offscreenCtx.createLinearGradient(
              frameX, frameY, frameX, frameY + finalFrameHeight
            );
            vGrad.addColorStop(0, `rgba(255, 255, 255, ${(isDark ? 0.06 : 0.15) * frameGradient})`);
            vGrad.addColorStop(0.5, "rgba(0, 0, 0, 0)");
            vGrad.addColorStop(1, `rgba(0, 0, 0, ${(isDark ? 0.08 : 0.04) * frameGradient})`);
            offscreenCtx.fillStyle = vGrad;
            offscreenCtx.fillRect(frameX, frameY, finalFrameWidth, finalFrameHeight);

            const hGrad = offscreenCtx.createLinearGradient(
              frameX, frameY, frameX + finalFrameWidth, frameY
            );
            hGrad.addColorStop(0, `rgba(0, 0, 0, ${(isDark ? 0.06 : 0.03) * frameGradient})`);
            hGrad.addColorStop(0.5, "rgba(0, 0, 0, 0)");
            hGrad.addColorStop(1, `rgba(255, 255, 255, ${(isDark ? 0.04 : 0.1) * frameGradient})`);
            offscreenCtx.fillStyle = hGrad;
            offscreenCtx.fillRect(frameX, frameY, finalFrameWidth, finalFrameHeight);

            offscreenCtx.restore();
          }

          // Frame lip — textured (darkened texture strip) or flat fallback
          const lipWidth = Math.max(1, 2 * visualDetailScale);
          const lipInteriorX = frameX + finalDisplayFrameWidth;
          const lipInteriorY = frameY + finalDisplayFrameWidth;
          const lipTex = getAssignedTexture();

          if (lipIntensity > 0) {
            if (lipTex?.bitmap) {
              const drawTexturedLip = (
                dx: number, dy: number, dw: number, dh: number, darken: number
              ) => {
                offscreenCtx.save();
                offscreenCtx.globalAlpha = lipIntensity;
                offscreenCtx.drawImage(lipTex.bitmap!, 0, 0, lipTex.bitmap!.width, lipTex.bitmap!.height, dx, dy, dw, dh);
                offscreenCtx.globalAlpha = 1;
                offscreenCtx.fillStyle = `rgba(0, 0, 0, ${darken * detailScale * lipIntensity})`;
                offscreenCtx.fillRect(dx, dy, dw, dh);
                offscreenCtx.restore();
              };
              drawTexturedLip(lipInteriorX, lipInteriorY, finalArtworkWidth, lipWidth, 0.45);
              drawTexturedLip(lipInteriorX, lipInteriorY, lipWidth, finalArtworkHeight, 0.34);
              drawTexturedLip(lipInteriorX, lipInteriorY + finalArtworkHeight - lipWidth, finalArtworkWidth, lipWidth, 0.14);
              drawTexturedLip(lipInteriorX + finalArtworkWidth - lipWidth, lipInteriorY, lipWidth, finalArtworkHeight, 0.09);
            } else {
              offscreenCtx.fillStyle = `rgba(0, 0, 0, ${0.4 * detailScale * lipIntensity})`;
              offscreenCtx.fillRect(lipInteriorX, lipInteriorY, finalArtworkWidth, lipWidth);
              offscreenCtx.fillStyle = `rgba(0, 0, 0, ${0.3 * detailScale * lipIntensity})`;
              offscreenCtx.fillRect(lipInteriorX, lipInteriorY, lipWidth, finalArtworkHeight);
              offscreenCtx.fillStyle = `rgba(255, 255, 255, ${0.1 * detailScale * lipIntensity})`;
              offscreenCtx.fillRect(lipInteriorX, lipInteriorY + finalArtworkHeight - lipWidth, finalArtworkWidth, lipWidth);
              offscreenCtx.fillStyle = `rgba(255, 255, 255, ${0.05 * detailScale * lipIntensity})`;
              offscreenCtx.fillRect(lipInteriorX + finalArtworkWidth - lipWidth, lipInteriorY, lipWidth, finalArtworkHeight);
            }
          }

          // Enhanced mitred corner joints — V-groove with gradient shading
          const mitreIntensity = detailScale;
          const mitreLineWidth = Math.max(0.2, 0.1 * visualDetailScale);
          const grooveGap = Math.max(0.25, 0.18 * visualDetailScale);
          offscreenCtx.lineCap = "butt";

          // Get frame base color for tinted mitre lines
          const mitreDarkColor = isLightFrame ? "60, 40, 20" : "0, 0, 0";
          const mitreHighlightColor = "255, 255, 255";

          // Clip all mitre rendering to the frame band (outer rect minus inner opening)
          offscreenCtx.save();
          offscreenCtx.beginPath();
          offscreenCtx.rect(frameX, frameY, finalFrameWidth, finalFrameHeight);
          offscreenCtx.rect(lipInteriorX, lipInteriorY, finalArtworkWidth, finalArtworkHeight);
          offscreenCtx.clip("evenodd");

          const drawEnhancedMitre = (
            x1: number, y1: number, x2: number, y2: number,
            invertBevel: boolean, darkOpacity: number, lightOpacity: number
          ) => {
            const scaledDark = darkOpacity * mitreIntensity;
            const scaledLight = lightOpacity * mitreIntensity;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            const perpNx = -dy / len;
            const perpNy = dx / len;

            const darkSign = invertBevel ? 1 : -1;
            const lightSign = invertBevel ? -1 : 1;

            // Subtle gradient shadow along dark side of mitre
            const gradW = Math.max(1, 0.8 * visualDetailScale);
            offscreenCtx.save();
            offscreenCtx.beginPath();
            offscreenCtx.moveTo(x1, y1);
            offscreenCtx.lineTo(x2, y2);
            offscreenCtx.lineTo(x2 + perpNx * darkSign * gradW * 2, y2 + perpNy * darkSign * gradW * 2);
            offscreenCtx.lineTo(x1 + perpNx * darkSign * gradW * 2, y1 + perpNy * darkSign * gradW * 2);
            offscreenCtx.closePath();
            offscreenCtx.clip();
            const gx1 = (x1 + x2) / 2;
            const gy1 = (y1 + y2) / 2;
            const grad = offscreenCtx.createLinearGradient(
              gx1, gy1,
              gx1 + perpNx * darkSign * gradW * 2, gy1 + perpNy * darkSign * gradW * 2
            );
            grad.addColorStop(0, `rgba(${mitreDarkColor}, ${scaledDark * 0.15})`);
            grad.addColorStop(1, `rgba(${mitreDarkColor}, 0)`);
            offscreenCtx.fillStyle = grad;
            offscreenCtx.fillRect(
              Math.min(x1, x2, x1 + perpNx * darkSign * gradW * 2) - 1,
              Math.min(y1, y2, y1 + perpNy * darkSign * gradW * 2) - 1,
              Math.abs(dx) + gradW * 3 + 2,
              Math.abs(dy) + gradW * 3 + 2
            );
            offscreenCtx.restore();

            // Dark groove line — tinted to frame color
            offscreenCtx.lineWidth = mitreLineWidth;
            offscreenCtx.strokeStyle = `rgba(${mitreDarkColor}, ${scaledDark})`;
            offscreenCtx.beginPath();
            offscreenCtx.moveTo(x1 + perpNx * darkSign * grooveGap, y1 + perpNy * darkSign * grooveGap);
            offscreenCtx.lineTo(x2 + perpNx * darkSign * grooveGap, y2 + perpNy * darkSign * grooveGap);
            offscreenCtx.stroke();

            // Light highlight line (hairline)
            offscreenCtx.lineWidth = Math.max(0.2, mitreLineWidth * 0.6);
            offscreenCtx.strokeStyle = `rgba(${mitreHighlightColor}, ${scaledLight})`;
            offscreenCtx.beginPath();
            offscreenCtx.moveTo(x1 + perpNx * lightSign * grooveGap, y1 + perpNy * lightSign * grooveGap);
            offscreenCtx.lineTo(x2 + perpNx * lightSign * grooveGap, y2 + perpNy * lightSign * grooveGap);
            offscreenCtx.stroke();

            // Thin shadow fill between the two lines (V-groove depth)
            offscreenCtx.lineWidth = grooveGap * 1.5;
            offscreenCtx.strokeStyle = `rgba(${mitreDarkColor}, ${scaledDark * 0.15})`;
            offscreenCtx.beginPath();
            offscreenCtx.moveTo(x1, y1);
            offscreenCtx.lineTo(x2, y2);
            offscreenCtx.stroke();
          };

          // Top-left: where top (lit) meets left (shadow) — more pronounced
          drawEnhancedMitre(frameX, frameY, lipInteriorX, lipInteriorY, false, 0.55, 0.35);
          // Top-right: where top (lit) meets right (lit) — softer
          drawEnhancedMitre(frameX + finalFrameWidth, frameY, lipInteriorX + finalArtworkWidth, lipInteriorY, true, 0.4, 0.3);
          // Bottom-left: where bottom (shadow) meets left (shadow) — softer
          drawEnhancedMitre(frameX, frameY + finalFrameHeight, lipInteriorX, lipInteriorY + finalArtworkHeight, true, 0.4, 0.3);
          // Bottom-right: where bottom (shadow) meets right (lit) — more pronounced
          drawEnhancedMitre(frameX + finalFrameWidth, frameY + finalFrameHeight, lipInteriorX + finalArtworkWidth, lipInteriorY + finalArtworkHeight, false, 0.55, 0.35);

          // Restore from frame band clip
          offscreenCtx.restore();

          // Frame outer edge highlight — runs full length, clipped by mitre trapezoids
          const edgeW = Math.max(0.5, 1 * visualDetailScale);
          offscreenCtx.lineWidth = edgeW;
          const fL = frameX;
          const fT = frameY;
          const fR = frameX + finalFrameWidth;
          const fB = frameY + finalFrameHeight;
          const fw = finalDisplayFrameWidth;

          const drawClippedEdge = (
            clipPoly: [number, number][],
            x1: number, y1: number, x2: number, y2: number,
            color: string
          ) => {
            offscreenCtx.save();
            offscreenCtx.beginPath();
            offscreenCtx.moveTo(clipPoly[0][0], clipPoly[0][1]);
            for (let i = 1; i < clipPoly.length; i++) {
              offscreenCtx.lineTo(clipPoly[i][0], clipPoly[i][1]);
            }
            offscreenCtx.closePath();
            offscreenCtx.clip();
            offscreenCtx.strokeStyle = color;
            offscreenCtx.beginPath();
            offscreenCtx.moveTo(x1, y1);
            offscreenCtx.lineTo(x2, y2);
            offscreenCtx.stroke();
            offscreenCtx.restore();
          };

          const iL = lipInteriorX;
          const iT = lipInteriorY;
          const iR = lipInteriorX + finalArtworkWidth;
          const iB = lipInteriorY + finalArtworkHeight;

          // Top trapezoid clip: top edge highlight (light from top-left)
          drawClippedEdge([[fL,fT],[fR,fT],[iR,iT],[iL,iT]], fL, fT + edgeW * 0.5, fR, fT + edgeW * 0.5, `rgba(255,255,255,${0.18 * edgeHighlight})`);
          // Left trapezoid clip: left edge highlight (light from top-left)
          drawClippedEdge([[fL,fT],[fL,fB],[iL,iB],[iL,iT]], fL + edgeW * 0.5, fT, fL + edgeW * 0.5, fB, `rgba(255,255,255,${0.12 * edgeHighlight})`);
          // Bottom trapezoid clip: bottom edge shadow
          drawClippedEdge([[fL,fB],[fR,fB],[iR,iB],[iL,iB]], fL, fB - edgeW * 0.5, fR, fB - edgeW * 0.5, `rgba(0,0,0,${0.15 * edgeShadow})`);
          // Right trapezoid clip: right edge shadow (light from top-left)
          drawClippedEdge([[fR,fT],[fR,fB],[iR,iB],[iR,iT]], fR - edgeW * 0.5, fT, fR - edgeW * 0.5, fB, `rgba(0,0,0,${0.1 * edgeShadow})`);
        }

        // --- Artwork rendering ---
        const artClipX = mountActive ? artworkX + mountBorderPx : artworkX;
        const artClipY = mountActive ? artworkY + mountBorderPx : artworkY;
        const artClipW = mountActive ? mountApertureWidth : finalArtworkWidth;
        const artClipH = mountActive ? mountApertureHeight : finalArtworkHeight;

        const artBleed = Math.max(1, visualDetailScale * 0.5);

        if (isImageLoaded && imageBitmapRef.current) {
          offscreenCtx.save();
          offscreenCtx.beginPath();
          offscreenCtx.rect(artClipX, artClipY, artClipW, artClipH);
          offscreenCtx.clip();
          offscreenCtx.drawImage(
            imageBitmapRef.current,
            artClipX + actualImageOffsetX - artBleed,
            artClipY + actualImageOffsetY - artBleed,
            actualImageWidth + artBleed * 2,
            actualImageHeight + artBleed * 2
          );
          offscreenCtx.restore();
        } else {
          offscreenCtx.fillStyle = isFramed ? "#f5f5f5" : "#FFFFFF";
          offscreenCtx.fillRect(artClipX, artClipY, artClipW, artClipH);
        }

        // --- Mount overlay (on top of artwork) ---
        if (mountActive) {
          offscreenCtx.save();
          offscreenCtx.beginPath();
          offscreenCtx.rect(artworkX, artworkY, finalArtworkWidth, finalArtworkHeight);
          offscreenCtx.rect(artClipX, artClipY, artClipW, artClipH);
          offscreenCtx.clip("evenodd");
          if (mountTextureBitmap) {
            offscreenCtx.drawImage(mountTextureBitmap, artworkX, artworkY, finalArtworkWidth, finalArtworkHeight);
          } else {
            offscreenCtx.fillStyle = mountColor;
            offscreenCtx.fillRect(artworkX, artworkY, finalArtworkWidth, finalArtworkHeight);
          }
          offscreenCtx.restore();

          const chamferInverse = 1 - layout.fillRatio + 0.4;
          const OVERLAY_CANVAS_WIDTH = 1500;
          const chamferScale = rect.width / OVERLAY_CANVAS_WIDTH;
          const cW = Math.max(0.5, chamferSize * chamferInverse * chamferScale);
          const iL = artClipX;
          const iT = artClipY;
          const iR = artClipX + artClipW;
          const iB = artClipY + artClipH;
          const oL = iL - cW;
          const oT = iT - cW;
          const oR = iR + cW;
          const oB = iB + cW;

          // Top chamfer (dark — bevel catches light from top-left at steep angle)
          const mountFinish = activeFrame === "oak" ? "natural" : activeFrame;
          const mountDetailScale = (mountFinish === "white" || mountFinish === "natural") ? 0.4 : 1.0;
          const scaledChamferDark = chamferDark * mountDetailScale;
          const scaledChamferLight = chamferLight * mountDetailScale;
          offscreenCtx.fillStyle = `rgba(0,0,0,${scaledChamferDark})`;
          offscreenCtx.beginPath();
          offscreenCtx.moveTo(oL, oT);
          offscreenCtx.lineTo(oR, oT);
          offscreenCtx.lineTo(iR, iT);
          offscreenCtx.lineTo(iL, iT);
          offscreenCtx.closePath();
          offscreenCtx.fill();

          // Left chamfer (dark, slightly softer — bevel faces top-left light)
          offscreenCtx.fillStyle = `rgba(0,0,0,${scaledChamferDark * 0.75})`;
          offscreenCtx.beginPath();
          offscreenCtx.moveTo(oL, oT);
          offscreenCtx.lineTo(iL, iT);
          offscreenCtx.lineTo(iL, iB);
          offscreenCtx.lineTo(oL, oB);
          offscreenCtx.closePath();
          offscreenCtx.fill();

          // Bottom chamfer (light — shadow side, away from top-left light)
          offscreenCtx.fillStyle = `rgba(0, 0, 0, ${scaledChamferLight})`;
          offscreenCtx.beginPath();
          offscreenCtx.moveTo(iL, iB);
          offscreenCtx.lineTo(iR, iB);
          offscreenCtx.lineTo(oR, oB);
          offscreenCtx.lineTo(oL, oB);
          offscreenCtx.closePath();
          offscreenCtx.fill();

          // Right chamfer (light, slightly softer — away from top-left light)
          offscreenCtx.fillStyle = `rgba(0, 0, 0, ${scaledChamferLight * 0.75})`;
          offscreenCtx.beginPath();
          offscreenCtx.moveTo(oR, oT);
          offscreenCtx.lineTo(oR, oB);
          offscreenCtx.lineTo(iR, iB);
          offscreenCtx.lineTo(iR, iT);
          offscreenCtx.closePath();
          offscreenCtx.fill();
        }

        // Internal shadow — all four edges with directional weighting
        // Primary shadow from top + left (light from top-left),
        // plus subtle ambient occlusion on bottom + right edges
        if (isFramed && innerShadowDepth > 0 && innerShadowOpacity > 0) {
          const overlap = innerShadowOverlap;
          const iX = frameX + finalDisplayFrameWidth - overlap;
          const iY = frameY + finalDisplayFrameWidth - overlap;
          const depthCSS = Math.max(4, innerShadowDepth * visualDetailScale) + overlap;
          const aW = finalArtworkWidth + overlap * 2;
          const aH = finalArtworkHeight + overlap * 2;

          const tmpW = Math.ceil(aW * dpr);
          const tmpH = Math.ceil(aH * dpr);
          if (tmpW > 0 && tmpH > 0) {
            const tmp = document.createElement('canvas');
            tmp.width = tmpW; tmp.height = tmpH;
            const tc = tmp.getContext('2d')!;
            const imgData = tc.createImageData(tmpW, tmpH);
            const px = imgData.data;
            const depthPx = depthCSS * dpr;
            const maxAlpha = Math.round(innerShadowOpacity * 255);
            const ambientDepthPx = depthPx * 0.4;
            const ambientMaxAlpha = Math.round(maxAlpha * 0.25);

            for (let row = 0; row < tmpH; row++) {
              for (let col = 0; col < tmpW; col++) {
                let alpha = 0;

                // Primary shadow: top and left edges (light from top-left)
                const distTop = row;
                const distLeft = col;
                const minDistPrimary = Math.min(distTop, distLeft);
                if (minDistPrimary < depthPx) {
                  const t = 1 - minDistPrimary / depthPx;
                  alpha = Math.round(maxAlpha * t);
                }

                // Ambient shadow: bottom and right edges (subtle)
                const distBottom = (tmpH - 1) - row;
                const distRight = (tmpW - 1) - col;
                const minDistAmbient = Math.min(distBottom, distRight);
                if (minDistAmbient < ambientDepthPx) {
                  const t = 1 - minDistAmbient / ambientDepthPx;
                  const ambAlpha = Math.round(ambientMaxAlpha * t);
                  alpha = Math.max(alpha, ambAlpha);
                }

                if (alpha > 0) {
                  const idx = (row * tmpW + col) * 4;
                  px[idx + 3] = alpha;
                }
              }
            }

            tc.putImageData(imgData, 0, 0);

            offscreenCtx.save();
            offscreenCtx.beginPath();
            offscreenCtx.rect(iX, iY, aW, aH);
            offscreenCtx.clip();
            offscreenCtx.drawImage(tmp, 0, 0, tmpW, tmpH, iX, iY, aW, aH);
            offscreenCtx.restore();
          }
        }

        // Subtle glass reflection — faint diagonal sheen across artwork area
        if (isFramed) {
          const glassX = mountActive ? artClipX : artworkX;
          const glassY = mountActive ? artClipY : artworkY;
          const glassW = mountActive ? artClipW : finalArtworkWidth;
          const glassH = mountActive ? artClipH : finalArtworkHeight;

          offscreenCtx.save();
          offscreenCtx.beginPath();
          offscreenCtx.rect(glassX, glassY, glassW, glassH);
          offscreenCtx.clip();

          const grad = offscreenCtx.createLinearGradient(
            glassX, glassY,
            glassX + glassW, glassY + glassH
          );
          grad.addColorStop(0, "rgba(255, 255, 255, 0.04)");
          grad.addColorStop(0.35, "rgba(255, 255, 255, 0.0)");
          grad.addColorStop(0.45, "rgba(255, 255, 255, 0.03)");
          grad.addColorStop(0.55, "rgba(255, 255, 255, 0.0)");
          grad.addColorStop(1, "rgba(255, 255, 255, 0.015)");
          offscreenCtx.fillStyle = grad;
          offscreenCtx.fillRect(glassX, glassY, glassW, glassH);
          offscreenCtx.restore();
        }

        // Blit to visible canvas (guard against zero-dimension offscreen canvas)
        const ctx = canvas.getContext('2d');
        if (ctx && offscreen.width > 0 && offscreen.height > 0) {
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          canvas.style.width = rect.width + 'px';
          canvas.style.height = rect.height + 'px';
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(offscreen, 0, 0);
        }
      });
      }, 0);
    };

    scheduleDraw();

    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [canvas, layout, activeFrame, previewConfig, isImageLoaded, showMount, isFramed, innerShadowDepth, innerShadowOpacity, innerShadowOverlap, chamferDark, chamferLight, chamferSize, lipIntensity, edgeHighlight, edgeShadow, frameGradient, mountColor, activeTextureId, frameTextures, shadowDarkness, isBoxFrame, getAssignedTexture, textureAssignments, mountTextureBitmap]);

  // Preload artwork image as ImageBitmap with caching for instant switching
  // Use fallbackUrl for instant display while imageUrl loads in background
  useEffect(() => {
    // Don't cache or load empty URLs
    if (!imageUrl && !fallbackUrl) {
      setIsImageLoaded(false);
      return;
    }
    
    // Check if main imageUrl is already cached - instant display
    const cachedMainBitmap = imageUrl ? imageBitmapCache.get(imageUrl) : null;
    if (cachedMainBitmap) {
      imageBitmapRef.current = cachedMainBitmap;
      setIsImageLoaded(true);
      return;
    }
    
    // Check if fallback is cached - use it instantly while loading main
    const cachedFallbackBitmap = fallbackUrl ? imageBitmapCache.get(fallbackUrl) : null;
    if (cachedFallbackBitmap) {
      imageBitmapRef.current = cachedFallbackBitmap;
      setIsImageLoaded(true);
      // Continue loading main URL in background
    } else if (fallbackUrl) {
      // Load fallback first for instant display
      setIsImageLoaded(false);
    } else {
      setIsImageLoaded(false);
    }
    
    let cancelled = false;
    
    const loadBitmap = async (url: string): Promise<ImageBitmap | null> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        
        img.onload = async () => {
          if (cancelled) {
            resolve(null);
            return;
          }
          
          try {
            const bitmap = await createImageBitmap(img);
            if (cancelled) {
              bitmap.close();
              resolve(null);
              return;
            }
            imageBitmapCache.set(url, bitmap);
            resolve(bitmap);
          } catch (bitmapError) {
            console.error('[FramedMockup] Failed to create bitmap:', bitmapError);
            resolve(null);
          }
        };
        
        img.onerror = () => {
          console.error('[FramedMockup] Failed to load image:', url);
          resolve(null);
        };
        
        img.src = url;
      });
    };
    
    const loadImages = async () => {
      // If we don't have a cached fallback but have a fallback URL, load it first
      if (fallbackUrl && !cachedFallbackBitmap) {
        const fallbackBitmap = await loadBitmap(fallbackUrl);
        if (cancelled) return;
        
        if (fallbackBitmap) {
          imageBitmapRef.current = fallbackBitmap;
          setIsImageLoaded(true);
        }
      }
      
      // Now load the main URL (higher quality) in background
      if (imageUrl && imageUrl !== fallbackUrl) {
        const mainBitmap = await loadBitmap(imageUrl);
        if (cancelled) return;
        
        if (mainBitmap) {
          imageBitmapRef.current = mainBitmap;
          setIsImageLoaded(true);
        }
      } else if (!fallbackUrl && imageUrl) {
        // No fallback, just load main URL
        const mainBitmap = await loadBitmap(imageUrl);
        if (cancelled) return;
        
        if (mainBitmap) {
          imageBitmapRef.current = mainBitmap;
          setIsImageLoaded(true);
        }
      }
    };
    
    loadImages();
    
    return () => {
      cancelled = true;
    };
  }, [imageUrl, fallbackUrl]);

  if (availableSizes.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-muted/30 p-6 rounded-lg text-center">
          <p className="text-muted-foreground">No print sizes available for this artwork</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Row: Dropdown and Swatches */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium whitespace-nowrap">Frame Size:</label>
          <Select value={selectedSize} onValueChange={setSelectedSize}>
            <SelectTrigger className="w-full sm:w-48" data-testid="select-mockup-size">
              <SelectValue placeholder="Select size" />
            </SelectTrigger>
            <SelectContent>
              {availableSizes.map((size) => (
                <SelectItem key={size} value={size}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Frame Finish Swatches - Next to dropdown (hidden for limited editions) */}
        {!hideFrameOptions && (
        <div 
          className="flex gap-2 justify-center sm:justify-end" 
          style={{ transform: `translateX(${swatchOffset}px)` }}
        >
          {/* Unframed Swatch */}
          <button
            onClick={() => setSelectedFrame("unframed")}
            className={`relative w-8 h-8 rounded-full border-2 transition-all hover-elevate flex items-center justify-center ${
              activeFrame === "unframed" 
                ? "border-primary ring-2 ring-primary ring-offset-2" 
                : "border-border"
            }`}
            data-testid="swatch-unframed"
          >
            <div className="w-full h-full bg-gray-200 dark:bg-gray-500 rounded-full relative overflow-hidden">
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 32 32">
                <line x1="0" y1="0" x2="32" y2="32" stroke="black" strokeWidth="2" />
              </svg>
            </div>
            {activeFrame === "unframed" && (
              <div className="absolute -top-1 -right-1 bg-primary rounded-full p-0.5">
                <Check className="w-2.5 h-2.5 text-primary-foreground" />
              </div>
            )}
          </button>

          {/* Black Frame Swatch */}
          <button
            onClick={() => setSelectedFrame("black")}
            className={`relative w-8 h-8 rounded-full border-2 transition-all hover-elevate ${
              activeFrame === "black" 
                ? "border-primary ring-2 ring-primary ring-offset-2" 
                : "border-border"
            }`}
            data-testid="swatch-black"
          >
            <div className="w-full h-full bg-black rounded-full" />
            {activeFrame === "black" && (
              <div className="absolute -top-1 -right-1 bg-primary rounded-full p-0.5">
                <Check className="w-2.5 h-2.5 text-primary-foreground" />
              </div>
            )}
          </button>

          {/* White Frame Swatch */}
          <button
            onClick={() => setSelectedFrame("white")}
            className={`relative w-8 h-8 rounded-full border-2 transition-all hover-elevate ${
              activeFrame === "white" 
                ? "border-primary ring-2 ring-primary ring-offset-2" 
                : "border-border"
            }`}
            data-testid="swatch-white"
          >
            <div className="w-full h-full bg-white rounded-full border border-border" />
            {activeFrame === "white" && (
              <div className="absolute -top-1 -right-1 bg-primary rounded-full p-0.5">
                <Check className="w-2.5 h-2.5 text-primary-foreground" />
              </div>
            )}
          </button>

          {/* Oak Frame Swatch */}
          <button
            onClick={() => setSelectedFrame("oak")}
            className={`relative w-8 h-8 rounded-full border-2 transition-all hover-elevate ${
              activeFrame === "oak" 
                ? "border-primary ring-2 ring-primary ring-offset-2" 
                : "border-border"
            }`}
            data-testid="swatch-oak"
          >
            <div className="w-full h-full rounded-full overflow-hidden">
              <img 
                src={oakTextureUrl} 
                alt="Oak finish" 
                className="w-full h-full object-cover"
              />
            </div>
            {activeFrame === "oak" && (
              <div className="absolute -top-1 -right-1 bg-primary rounded-full p-0.5 z-10">
                <Check className="w-2.5 h-2.5 text-primary-foreground" />
              </div>
            )}
          </button>

          {!hideAdminControls && (
          <>
          <div className="w-px bg-border mx-1" />

          {/* Frame Type Toggle (Std / Box) */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFrameType("std")}
              disabled={!isFramed}
              className={`relative h-8 px-2.5 rounded-l-full border-2 border-r-0 transition-all hover-elevate text-xs font-medium whitespace-nowrap ${
                frameType === "std" && isFramed
                  ? "border-primary ring-1 ring-primary bg-primary/10"
                  : "border-border"
              } ${!isFramed ? "opacity-40 cursor-not-allowed" : ""}`}
              data-testid="toggle-frame-std"
            >
              Std
            </button>
            <button
              onClick={() => setFrameType("box")}
              disabled={!isFramed}
              className={`relative h-8 px-2.5 rounded-r-full border-2 border-l-0 transition-all hover-elevate text-xs font-medium whitespace-nowrap ${
                frameType === "box" && isFramed
                  ? "border-primary ring-1 ring-primary bg-primary/10"
                  : "border-border"
              } ${!isFramed ? "opacity-40 cursor-not-allowed" : ""}`}
              data-testid="toggle-frame-box"
            >
              Box
            </button>
          </div>

          {/* Mount Toggle */}
          <button
            onClick={() => setShowMount(!showMount)}
            disabled={!isFramed}
            className={`relative h-8 px-2.5 rounded-full border-2 transition-all hover-elevate text-xs font-medium whitespace-nowrap ${
              showMount && isFramed
                ? "border-primary ring-2 ring-primary ring-offset-2 bg-primary/10"
                : "border-border"
            } ${!isFramed ? "opacity-40 cursor-not-allowed" : ""}`}
            data-testid="toggle-mount"
          >
            Mount
          </button>

          <div className="w-px bg-border mx-1" />

          {/* Shadow Controls Toggle */}
          <button
            onClick={() => setShowShadowControls(!showShadowControls)}
            className={`relative h-8 px-2.5 rounded-full border-2 transition-all hover-elevate text-xs font-medium whitespace-nowrap flex items-center gap-1 ${
              showShadowControls
                ? "border-primary ring-2 ring-primary ring-offset-2 bg-primary/10"
                : "border-border"
            }`}
            data-testid="toggle-shadow-controls"
          >
            <SlidersHorizontal className="w-3 h-3" />
            Settings
          </button>
          </>
          )}
        </div>
        )}
      </div>

      {/* Canvas Preview - Grows to fill available space */}
      <div className="bg-muted/30 p-4 rounded-lg flex flex-col">
        {/* Header - Website Preview centered */}
        <div className="mb-3 text-center">
          <p className="text-sm font-bold">Website Preview</p>
        </div>
        
        <div 
          className="flex items-center justify-center mb-3 mx-auto relative" 
          style={{ 
            maxWidth: `${layout?.suggestedCanvasWidth ?? 600}px`,
            width: '100%',
            aspectRatio: layout ? `${layout.suggestedCanvasWidth} / ${layout.suggestedCanvasHeight}` : '1'
          }}
        >
          {/* Loading overlay while image loads */}
          {!isImageLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground mt-3">Preparing Preview</p>
            </div>
          )}
          <canvas
            ref={canvasCallbackRef}
            className={`w-full h-full transition-opacity duration-200 ${isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
            data-testid="canvas-framed-mockup"
          />
        </div>
        
        {/* Title below frame, left-aligned and bold */}
        <div className="mt-auto">
          <p className="text-sm font-bold">{title} - {artistName}{editionType === "limited" ? " - Limited Edition" : ""}</p>
        </div>
      </div>

      {/* Render Settings Panel - Full width below canvas */}
      {showShadowControls && (
        <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/20">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Drop Shadow</p>
            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
              data-testid="button-save-render-settings"
            >
              <Save className="w-3.5 h-3.5" />
              {savingSettings ? "Saving..." : "Save for Generation"}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-16 shrink-0">Length</label>
              <input type="range" min="0" max="20" step="0.1" value={shadowOffset} onChange={(e) => setShadowOffset(Number(e.target.value))} className="flex-1 min-w-0 h-1.5 accent-primary" data-testid="slider-shadow-offset" />
              <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{shadowOffset.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-16 shrink-0">Fade</label>
              <input type="range" min="0" max="10" step="0.1" value={shadowBlur} onChange={(e) => setShadowBlur(Number(e.target.value))} className="flex-1 min-w-0 h-1.5 accent-primary" data-testid="slider-shadow-blur" />
              <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{shadowBlur.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-16 shrink-0">Opacity</label>
              <input type="range" min="0" max="100" step="1" value={Math.round(shadowOpacityVal * 100)} onChange={(e) => setShadowOpacityVal(Number(e.target.value) / 100)} className="flex-1 min-w-0 h-1.5 accent-primary" data-testid="slider-shadow-opacity" />
              <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{Math.round(shadowOpacityVal * 100)}%</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-16 shrink-0">Darkness</label>
              <input type="range" min="0" max="100" step="1" value={Math.round(shadowDarkness * 100)} onChange={(e) => setShadowDarkness(Number(e.target.value) / 100)} className="flex-1 min-w-0 h-1.5 accent-primary" data-testid="slider-shadow-darkness" />
              <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{Math.round(shadowDarkness * 100)}%</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-16 shrink-0">Unframed</label>
              <input type="range" min="0" max="100" step="1" value={Math.round(unframedShadowScale * 100)} onChange={(e) => setUnframedShadowScale(Number(e.target.value) / 100)} className="flex-1 min-w-0 h-1.5 accent-primary" data-testid="slider-unframed-shadow" />
              <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{Math.round(unframedShadowScale * 100)}%</span>
            </div>
          </div>

          {isFramed && (
            <>
              <div className="border-t border-border" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Frame Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground w-16 shrink-0">Lip</label>
                  <input type="range" min="0" max="100" step="1" value={Math.round(lipIntensity * 100)} onChange={(e) => setLipIntensity(Number(e.target.value) / 100)} className="flex-1 min-w-0 h-1.5 accent-primary" data-testid="slider-lip-intensity" />
                  <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{Math.round(lipIntensity * 100)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground w-16 shrink-0">Highlight</label>
                  <input type="range" min="0" max="200" step="1" value={Math.round(edgeHighlight * 100)} onChange={(e) => setEdgeHighlight(Number(e.target.value) / 100)} className="flex-1 min-w-0 h-1.5 accent-primary" data-testid="slider-edge-highlight" />
                  <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{Math.round(edgeHighlight * 100)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground w-16 shrink-0">Lowlight</label>
                  <input type="range" min="0" max="200" step="1" value={Math.round(edgeShadow * 100)} onChange={(e) => setEdgeShadow(Number(e.target.value) / 100)} className="flex-1 min-w-0 h-1.5 accent-primary" data-testid="slider-edge-shadow" />
                  <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{Math.round(edgeShadow * 100)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground w-16 shrink-0">Gradient</label>
                  <input type="range" min="0" max="200" step="1" value={Math.round(frameGradient * 100)} onChange={(e) => setFrameGradient(Number(e.target.value) / 100)} className="flex-1 min-w-0 h-1.5 accent-primary" data-testid="slider-frame-gradient" />
                  <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{Math.round(frameGradient * 100)}%</span>
                </div>
              </div>
              {showMount && (
                <>
                  <div className="border-t border-border" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mount Chamfer</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-muted-foreground w-16 shrink-0">Dark</label>
                      <input type="range" min="0" max="40" step="1" value={Math.round(chamferDark * 100)} onChange={(e) => setChamferDark(Number(e.target.value) / 100)} className="flex-1 min-w-0 h-1.5 accent-primary" data-testid="slider-chamfer-dark" />
                      <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{Math.round(chamferDark * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-muted-foreground w-16 shrink-0">Light</label>
                      <input type="range" min="0" max="40" step="1" value={Math.round(chamferLight * 100)} onChange={(e) => setChamferLight(Number(e.target.value) / 100)} className="flex-1 min-w-0 h-1.5 accent-primary" data-testid="slider-chamfer-light" />
                      <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{Math.round(chamferLight * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-muted-foreground w-16 shrink-0">Size</label>
                      <input type="range" min="1" max="10" step="0.5" value={chamferSize} onChange={(e) => setChamferSize(Number(e.target.value))} className="flex-1 min-w-0 h-1.5 accent-primary" data-testid="slider-chamfer-size" />
                      <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{chamferSize}</span>
                    </div>
                  </div>
                </>
              )}
              <div className="border-t border-border" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Inner Shadow</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground w-16 shrink-0">Depth</label>
                  <input type="range" min="0" max="30" step="1" value={innerShadowDepth} onChange={(e) => setInnerShadowDepth(Number(e.target.value))} className="flex-1 min-w-0 h-1.5 accent-primary" data-testid="slider-inner-shadow-depth" />
                  <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{innerShadowDepth}</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground w-16 shrink-0">Opacity</label>
                  <input type="range" min="0" max="50" step="1" value={Math.round(innerShadowOpacity * 100)} onChange={(e) => setInnerShadowOpacity(Number(e.target.value) / 100)} className="flex-1 min-w-0 h-1.5 accent-primary" data-testid="slider-inner-shadow-opacity" />
                  <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{Math.round(innerShadowOpacity * 100)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground w-16 shrink-0">Overlap</label>
                  <input type="range" min="0" max="5" step="0.5" value={innerShadowOverlap} onChange={(e) => setInnerShadowOverlap(Number(e.target.value))} className="flex-1 min-w-0 h-1.5 accent-primary" data-testid="slider-inner-shadow-overlap" />
                  <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{innerShadowOverlap}px</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});
