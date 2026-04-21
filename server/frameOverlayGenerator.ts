import sharp from "sharp";
import path from "path";
import fs from "fs";
import { ObjectStorageService } from "./objectStorage";

const FRAME_WIDTH_MM = 21;
const CANVAS_FRAME_WIDTH_MM = 12;
const CANVAS_GAP_MM = 5;
const REFERENCE_DPI = 300;
const CANVAS_PADDING = 60;
const BOX_SHADOW_MULTIPLIER = 1.6;
const CANVAS_SHADOW_MULTIPLIER = 1.8;

export interface OverlaySize {
  sizeKey: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

export const A_RATIO_SIZES: OverlaySize[] = [
  { sizeKey: "6x8", label: '6" x 8" (152x203mm)', widthMm: 152, heightMm: 203 },
  { sizeKey: "8x10", label: '8" x 10" (203x254mm)', widthMm: 203, heightMm: 254 },
  { sizeKey: "a4", label: "A4 (210x297mm)", widthMm: 210, heightMm: 297 },
  { sizeKey: "8x12", label: '8" x 12" (203x305mm)', widthMm: 203, heightMm: 305 },
  { sizeKey: "11x14", label: '11" x 14" (279x356mm)', widthMm: 279, heightMm: 356 },
  { sizeKey: "a3", label: "A3 (297x420mm)", widthMm: 297, heightMm: 420 },
  { sizeKey: "12x16", label: '12" x 16" (305x406mm)', widthMm: 305, heightMm: 406 },
  { sizeKey: "12x18", label: '12" x 18" (305x457mm)', widthMm: 305, heightMm: 457 },
  { sizeKey: "16x20", label: '16" x 20" (406x508mm)', widthMm: 406, heightMm: 508 },
  { sizeKey: "a2", label: "A2 (420x594mm)", widthMm: 420, heightMm: 594 },
  { sizeKey: "18x24", label: '18" x 24" (457x610mm)', widthMm: 457, heightMm: 610 },
  { sizeKey: "20x28", label: '20" x 28" (508x711mm)', widthMm: 508, heightMm: 711 },
  { sizeKey: "20x30", label: '20" x 30" (508x762mm)', widthMm: 508, heightMm: 762 },
  { sizeKey: "a1", label: "A1 (594x841mm)", widthMm: 594, heightMm: 841 },
  { sizeKey: "24x30", label: '24" x 30" (610x762mm)', widthMm: 610, heightMm: 762 },
  { sizeKey: "24x32", label: '24" x 32" (610x813mm)', widthMm: 610, heightMm: 813 },
  { sizeKey: "24x36", label: '24" x 36" (610x914mm)', widthMm: 610, heightMm: 914 },
  { sizeKey: "28x40", label: '28" x 40" (711x1016mm)', widthMm: 711, heightMm: 1016 },
  { sizeKey: "30x40", label: '30" x 40" (762x1016mm)', widthMm: 762, heightMm: 1016 },
  { sizeKey: "32x40", label: '32" x 40" (813x1016mm)', widthMm: 813, heightMm: 1016 },
  { sizeKey: "a0", label: "A0 (841x1189mm)", widthMm: 841, heightMm: 1189 },
  { sizeKey: "12x12", label: '12" x 12" (305x305mm)', widthMm: 305, heightMm: 305 },
  { sizeKey: "16x16", label: '16" x 16" (406x406mm)', widthMm: 406, heightMm: 406 },
  { sizeKey: "20x20", label: '20" x 20" (508x508mm)', widthMm: 508, heightMm: 508 },
  { sizeKey: "30x30", label: '30" x 30" (762x762mm)', widthMm: 762, heightMm: 762 },
];

type FrameColor = "black" | "white" | "natural" | "unframed";
type FrameDepth = "std" | "box" | "canvas";
type Orientation = "p" | "l" | "s";

const MOUNT_BORDERS: Record<string, number> = {
  "6x8": 30,
  "8x10": 40,
  a4: 40,
  "8x12": 40,
  "11x14": 40,
  a3: 50,
  "12x16": 50,
  "12x18": 50,
  "16x20": 50,
  a2: 50,
  "18x24": 50,
  "20x28": 50,
  "20x30": 50,
  a1: 50,
  "24x32": 50,
  "24x36": 50,
  "28x40": 60,
  "30x40": 60,
  a0: 50,
  "12x12": 40,
  "16x16": 50,
  "20x20": 50,
  "30x30": 60,
};

export function getMountBorderMm(sizeKey: string): number {
  return MOUNT_BORDERS[sizeKey] || 50;
}

const CANVAS_WIDTH = 1500;
const CANVAS_HEIGHT = 2000;

interface OverlayConfig {
  sizeKey: string;
  ori: Orientation;
  frame: FrameColor;
  depth: FrameDepth;
  mount: "m0" | "m1";
}

function buildFilename(cfg: OverlayConfig): string {
  return `overlay_${cfg.sizeKey}_${cfg.ori}_${cfg.frame}_${cfg.depth}_${cfg.mount}.webp`;
}

function calculateDiagonal(widthMm: number, heightMm: number): number {
  return Math.sqrt(widthMm * widthMm + heightMm * heightMm);
}

function calculateNormalizedScale(size: OverlaySize): number {
  const currentDiagonal = calculateDiagonal(size.widthMm, size.heightMm);
  const maxDiagonal = Math.max(...A_RATIO_SIZES.map(s => calculateDiagonal(s.widthMm, s.heightMm)));
  const MIN_SCALE = 0.25;
  const ratio = currentDiagonal / maxDiagonal;
  return MIN_SCALE + (ratio * ratio * (1.0 - MIN_SCALE));
}

interface OverlayDims {
  canvasWidth: number;
  canvasHeight: number;
  frameWidthPxH: number;
  frameWidthPxV: number;
  artworkX: number;
  artworkY: number;
  artworkW: number;
  artworkH: number;
  mountBorderPxH: number;
  mountBorderPxV: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowBlur: number;
  scaleToFit: number;
  fillRatio: number;
}

export function calculateDims(size: OverlaySize, ori: Orientation, depth: FrameDepth, hasMount: boolean, isFramed: boolean, settings: RenderSettings, canvasOverride?: { width: number; height: number }): OverlayDims {
  const canvasWidth = canvasOverride?.width || CANVAS_WIDTH;
  const canvasHeight = canvasOverride?.height || CANVAS_HEIGHT;

  const artWidthMm = ori === "l" ? size.heightMm : size.widthMm;
  const artHeightMm = ori === "l" ? size.widthMm : size.heightMm;

  const dpiScale = REFERENCE_DPI / 25.4;
  const frameWidthMm = isFramed ? (depth === "canvas" ? CANVAS_FRAME_WIDTH_MM + CANVAS_GAP_MM : FRAME_WIDTH_MM) : 0;

  const largestSize = A_RATIO_SIZES.reduce((a, b) =>
    calculateDiagonal(a.widthMm, a.heightMm) > calculateDiagonal(b.widthMm, b.heightMm) ? a : b
  );
  const largestW = largestSize.widthMm;
  const largestH = largestSize.heightMm;
  const largestFrameW = (largestW + frameWidthMm * 2) * dpiScale;
  const largestFrameH = (largestH + frameWidthMm * 2) * dpiScale;
  const largestShadowOffset = settings.shadowOffset;
  const largestShadowBlur = settings.shadowBlur;
  const largestTotalW = largestFrameW + largestShadowOffset + largestShadowBlur;
  const largestTotalH = largestFrameH + largestShadowOffset + largestShadowBlur;

  const availableWidth = canvasWidth - CANVAS_PADDING * 2;
  const availableHeight = canvasHeight - CANVAS_PADDING * 2;
  const baseScaleToFit = Math.min(availableWidth / largestTotalW, availableHeight / largestTotalH);

  const totalFrameHeightPx = (artHeightMm + frameWidthMm * 2) * dpiScale;
  const totalFrameWidthPx = (artWidthMm + frameWidthMm * 2) * dpiScale;

  const MIN_FILL = 0.4;
  const MAX_FILL = 0.92;

  const sizeRatio = calculateDiagonal(size.widthMm, size.heightMm) / calculateDiagonal(largestW, largestH);
  const fillRatio = MIN_FILL + sizeRatio * (MAX_FILL - MIN_FILL);

  const scaleMultiplier = settings.mockupScaleMultiplier ?? 1.0;
  const scaleForHeight = (availableHeight * fillRatio) / totalFrameHeightPx;
  const scaleForWidth = (availableWidth * fillRatio) / totalFrameWidthPx;
  const effectiveScale = Math.min(scaleForHeight, scaleForWidth) * scaleMultiplier;

  const frameWidthBase = frameWidthMm * dpiScale;
  const artWidthBase = artWidthMm * dpiScale;
  const artHeightBase = artHeightMm * dpiScale;

  const scaleToFit = effectiveScale;

  const frameWidthPx = Math.round(frameWidthBase * scaleToFit);
  const artworkW = Math.round(artWidthBase * scaleToFit);
  const artworkH = Math.round(artHeightBase * scaleToFit);
  const frameW = artworkW + frameWidthPx * 2;
  const frameH = artworkH + frameWidthPx * 2;

  const inverseFill = 1 - fillRatio + 0.3;
  const unframedScale = isFramed ? 1.0 : (settings.unframedShadowScale ?? 0.3);
  const shadowOffsetPx = settings.shadowOffset * canvasHeight * 0.012 * inverseFill * unframedScale;
  const shadowBlurPx = settings.shadowBlur * canvasHeight * 0.012 * inverseFill * unframedScale;

  const frameX = Math.round((canvasWidth - frameW) / 2);
  const frameY = Math.round((canvasHeight - frameH) / 2);

  const artworkX = frameX + frameWidthPx;
  const artworkY = frameY + frameWidthPx;

  const mountBorderMm = hasMount && isFramed ? getMountBorderMm(size.sizeKey) : 0;
  const mountBorderBase = mountBorderMm * dpiScale;
  const mountBorderPx = Math.round(mountBorderBase * scaleToFit);

  return {
    canvasWidth,
    canvasHeight,
    frameWidthPxH: frameWidthPx,
    frameWidthPxV: frameWidthPx,
    artworkX,
    artworkY,
    artworkW,
    artworkH,
    mountBorderPxH: mountBorderPx,
    mountBorderPxV: mountBorderPx,
    shadowOffsetX: shadowOffsetPx,
    shadowOffsetY: shadowOffsetPx,
    shadowBlur: shadowBlurPx,
    scaleToFit,
    fillRatio,
  };
}

const ASSIGNMENTS_PATH = "frame-textures/_assignments.json";
const RENDER_SETTINGS_PATH = "frame-textures/_render-settings.json";

export interface TextureAssignments {
  [finish: string]: string | null;
}

export interface RenderSettings {
  shadowOffset: number;
  shadowBlur: number;
  shadowOpacity: number;
  shadowDarkness: number;
  innerShadowDepth: number;
  innerShadowOpacity: number;
  chamferDark: number;
  chamferLight: number;
  chamferSize: number;
  lipIntensity: number;
  edgeHighlight: number;
  edgeShadow: number;
  frameGradient: number;
  innerShadowOverlap: number;
  unframedShadowScale: number;
  mockupScaleMultiplier?: number;
}

const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  shadowOffset: 4,
  shadowBlur: 3,
  shadowOpacity: 1.0,
  shadowDarkness: 0.5,
  innerShadowDepth: 4,
  innerShadowOpacity: 0.27,
  chamferDark: 0.15,
  chamferLight: 0.10,
  chamferSize: 2.0,
  lipIntensity: 1.0,
  edgeHighlight: 1.0,
  edgeShadow: 1.0,
  frameGradient: 1.0,
  innerShadowOverlap: 1,
  unframedShadowScale: 0.3,
};

export async function getRenderSettings(): Promise<RenderSettings> {
  try {
    const objectStorage = new ObjectStorageService();
    const buf = await objectStorage.downloadFileAsBuffer(`/objects/${RENDER_SETTINGS_PATH}`);
    const saved = JSON.parse(buf.toString("utf-8"));
    return { ...DEFAULT_RENDER_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_RENDER_SETTINGS };
  }
}

export async function saveRenderSettings(settings: RenderSettings): Promise<void> {
  const objectStorage = new ObjectStorageService();
  await objectStorage.uploadFileDirect(
    Buffer.from(JSON.stringify(settings, null, 2)),
    RENDER_SETTINGS_PATH,
    "application/json"
  );
}

export async function getTextureAssignments(): Promise<TextureAssignments> {
  try {
    const objectStorage = new ObjectStorageService();
    const buf = await objectStorage.downloadFileAsBuffer(`/objects/${ASSIGNMENTS_PATH}`);
    return JSON.parse(buf.toString("utf-8"));
  } catch {
    return { black: null, white: null, natural: null, box_black: null, box_white: null, box_natural: null };
  }
}

export async function setTextureAssignment(finish: string, textureUrl: string | null): Promise<void> {
  const assignments = await getTextureAssignments();
  assignments[finish] = textureUrl;
  const objectStorage = new ObjectStorageService();
  await objectStorage.uploadFileDirect(
    Buffer.from(JSON.stringify(assignments, null, 2)),
    ASSIGNMENTS_PATH,
    "application/json"
  );
}

async function loadTexture(frame: FrameColor, depth: FrameDepth = "std"): Promise<Buffer | null> {
  try {
    const assignments = await getTextureAssignments();
    const key = (depth === "box" || depth === "canvas") ? `box_${frame}` : frame;
    const assignedUrl = assignments[key];

    if (!assignedUrl) {
      console.log(`[FrameOverlay] No texture assigned for "${key}", using solid color`);
      return null;
    }

    console.log(`[FrameOverlay] Loading assigned texture for "${key}": ${assignedUrl}`);
    const objectStorage = new ObjectStorageService();
    const buf = await objectStorage.downloadFileAsBuffer(assignedUrl);
    return buf;
  } catch (e) {
    console.warn(`[FrameOverlay] Failed to load texture for ${frame}/${depth}:`, e);
    return null;
  }
}

async function loadMountTexture(): Promise<Buffer | null> {
  try {
    const assignments = await getTextureAssignments();
    const mountUrl = assignments["mount"];
    if (!mountUrl) {
      return null;
    }
    const objectStorage = new ObjectStorageService();
    const buf = await objectStorage.downloadFileAsBuffer(mountUrl);
    return buf;
  } catch (e) {
    console.warn("[FrameOverlay] Failed to load mount texture:", e);
    return null;
  }
}

const DEFAULT_FRAME_COLORS: Record<string, string> = {
  black: "#1a1a1a",
  white: "#f5f5f0",
  natural: "#8B7355",
};

function getFrameColor(frame: FrameColor): string {
  return DEFAULT_FRAME_COLORS[frame] || "#000000";
}

export async function getFrameColorFromAssignments(frame: FrameColor, depth: FrameDepth = "std"): Promise<string> {
  const assignments = await getTextureAssignments();
  const colorKey = (depth === "box" || depth === "canvas") ? `box_${frame}_color` : `${frame}_color`;
  return assignments[colorKey] || DEFAULT_FRAME_COLORS[frame] || "#000000";
}

async function generateCombinedOverlay(cfg: OverlayConfig, size: OverlaySize, renderSettings?: RenderSettings, canvasOverride?: { width: number; height: number }, outputFormat?: "webp" | "png"): Promise<Buffer> {
  const settings = renderSettings || await getRenderSettings();
  const isFramed = cfg.frame !== "unframed";
  const hasMount = cfg.mount === "m1" && isFramed;
  const dims = calculateDims(size, cfg.ori, cfg.depth, hasMount, isFramed, settings, canvasOverride);
  const {
    canvasWidth, canvasHeight,
    frameWidthPxH, frameWidthPxV,
    artworkX, artworkY, artworkW, artworkH,
    mountBorderPxH, mountBorderPxV,
    shadowOffsetX, shadowBlur,
    scaleToFit, fillRatio,
  } = dims;

  const frameX = artworkX - frameWidthPxH;
  const frameY = artworkY - frameWidthPxV;
  const frameW = artworkW + frameWidthPxH * 2;
  const frameH = artworkH + frameWidthPxV * 2;

  const visualDetailScale = frameW / canvasWidth;
  const lipWidth = Math.max(1, Math.round(2 * visualDetailScale));
  const chamferInverse = 1 - fillRatio + 0.4;
  const chamferWidth = Math.max(1, Math.round(settings.chamferSize * chamferInverse));

  const cutoutX = hasMount ? artworkX + mountBorderPxH : artworkX;
  const cutoutY = hasMount ? artworkY + mountBorderPxV : artworkY;
  const cutoutW = hasMount ? artworkW - mountBorderPxH * 2 : artworkW;
  const cutoutH = hasMount ? artworkH - mountBorderPxV * 2 : artworkH;

  const isBoxFrame = cfg.depth === "box" && isFramed;
  const isCanvasFrame = cfg.depth === "canvas" && isFramed;
  const canvasGapRatio = CANVAS_GAP_MM / (CANVAS_FRAME_WIDTH_MM + CANVAS_GAP_MM);
  const gapPxH = isCanvasFrame ? Math.max(1, Math.round(frameWidthPxH * canvasGapRatio)) : 0;
  const gapPxV = isCanvasFrame ? Math.max(1, Math.round(frameWidthPxV * canvasGapRatio)) : 0;
  const woodPxH = frameWidthPxH - gapPxH;
  const woodPxV = frameWidthPxV - gapPxV;
  const shadowDarkness = settings.shadowDarkness;
  const shadowOpacity = settings.shadowOpacity;

  const layers: sharp.OverlayOptions[] = [];

  // Shadow region bounds — for framed: around the frame; for unframed: around the artwork
  const shadowL = isFramed ? frameX : cutoutX;
  const shadowT = isFramed ? frameY : cutoutY;
  const shadowW = isFramed ? frameW : cutoutW;
  const shadowH = isFramed ? frameH : cutoutH;

  // DEBUG: ambient and contact shadows temporarily disabled to isolate parallelogram

  // // Subtle ambient shadow around full perimeter
  // {
  //   const ambientSpread = Math.max(3, Math.round(6 * scaleToFit));
  //   const ambientSvg = `<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
  //     <defs>
  //       <filter id="ablur" x="-50%" y="-50%" width="200%" height="200%">
  //         <feGaussianBlur stdDeviation="${ambientSpread}" />
  //       </filter>
  //     </defs>
  //     <rect x="${shadowL}" y="${shadowT}" width="${shadowW}" height="${shadowH}" fill="rgba(0,0,0,0.08)" filter="url(#ablur)"/>
  //   </svg>`;
  //   layers.push({ input: Buffer.from(ambientSvg), blend: "over" as const });
  // }

  // // Wall contact shadow — tight dark line along bottom edge
  // {
  //   const contactH = Math.max(1, Math.round(2 * scaleToFit));
  //   const contactBlur = Math.max(1, Math.round(3 * scaleToFit));
  //   const contactInset = isFramed ? Math.round(frameWidthPxH * 0.3) : Math.round(shadowW * 0.05);
  //   const contactW = shadowW - contactInset * 2;
  //   const contactSvg = `<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
  //     <defs>
  //       <filter id="cblur" x="-50%" y="-50%" width="200%" height="200%">
  //         <feGaussianBlur stdDeviation="${contactBlur}" />
  //       </filter>
  //     </defs>
  //     <rect x="${shadowL + contactInset}" y="${shadowT + shadowH}" width="${contactW}" height="${contactH}" fill="rgba(0,0,0,0.25)" filter="url(#cblur)"/>
  //   </svg>`;
  //   layers.push({ input: Buffer.from(contactSvg), blend: "over" as const });
  // }

  // Main directional shadow
  {
    const shadowMult = isCanvasFrame ? CANVAS_SHADOW_MULTIPLIER : (isBoxFrame ? BOX_SHADOW_MULTIPLIER : 1);
    const maxDist = Math.round(shadowOffsetX * shadowMult);
    const fade = Math.round(shadowBlur * shadowMult);
    const oL = shadowL;
    const oT = shadowT;
    const oR = shadowL + shadowW;
    const oB = shadowT + shadowH;

    const darkVal = Math.min(1, shadowDarkness);
    const darkHex = Math.round(darkVal * 255).toString(16).padStart(2, '0');
    const fillColor = `#000000${darkHex}`;

    const shR = oR + maxDist;
    const shB = oB + maxDist;
    const triPoints = `${oR},${oT} ${shR},${oT + maxDist} ${shR},${shB} ${oL + maxDist},${shB} ${oL},${oB}`;

    const clipId = isFramed ? '' : 'clip-shadow';
    const clipDef = !isFramed ? `<defs><clipPath id="${clipId}"><rect x="0" y="${oB}" width="${canvasWidth}" height="${canvasHeight - oB}"/><rect x="${oR}" y="${oT}" width="${canvasWidth - oR}" height="${oB - oT}"/></clipPath></defs>` : '';
    const clipAttr = !isFramed ? `clip-path="url(#${clipId})"` : '';

    const solidSvg = `<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      ${clipDef}
      <polygon points="${triPoints}" fill="${fillColor}" opacity="${Math.min(1, shadowOpacity)}" ${clipAttr}/>
    </svg>`;

    const solidBuf = await sharp(Buffer.from(solidSvg))
      .png()
      .toBuffer();

    const blurredBuf = fade > 0.3
      ? await sharp(solidBuf).blur(fade).toBuffer()
      : solidBuf;

    layers.push({ input: blurredBuf, blend: "over" as const });
  }

  const isLightFrame = cfg.frame === "white" || cfg.frame === "natural";
  const detailScale = isLightFrame ? 0.4 : 1.0;

  // --- Frame rendering ---
  if (isFramed) {
    const texture = await loadTexture(cfg.frame, cfg.depth);

    if (texture) {
      const texMeta = await sharp(texture).metadata();
      const texW = texMeta.width || 200;
      const texH = texMeta.height || 200;
      const isStrip = texW > texH * 3;

      async function cropTexture(targetW: number, targetH: number, rotate = 0, offsetFraction = 0): Promise<Buffer> {
        let pipeline = sharp(texture!);
        if (rotate) pipeline = sharp(await pipeline.rotate(rotate).toBuffer());

        const rotMeta = await pipeline.metadata();
        const srcW = rotMeta.width || texW;
        const srcH = rotMeta.height || texH;

        const scaleX = srcW / targetW;
        const scaleY = srcH / targetH;
        const scale = Math.min(scaleX, scaleY);

        let cropW: number, cropH: number;
        if (scale >= 1) {
          cropW = Math.round(targetW * scale);
          cropH = Math.round(targetH * scale);
        } else {
          cropW = srcW;
          cropH = srcH;
        }

        cropW = Math.min(cropW, srcW);
        cropH = Math.min(cropH, srcH);

        const maxOffsetX = srcW - cropW;
        const maxOffsetY = srcH - cropH;
        const cropX = Math.min(Math.floor(maxOffsetX * offsetFraction), maxOffsetX);
        const cropY = Math.min(Math.floor(maxOffsetY * offsetFraction), maxOffsetY);

        pipeline = pipeline.extract({ left: cropX, top: cropY, width: cropW, height: cropH });
        pipeline = pipeline.resize(targetW, targetH, { fit: "fill", kernel: "lanczos3" });

        const downscaleRatio = Math.max(cropW / targetW, cropH / targetH);
        if (downscaleRatio > 1.5) {
          const sigma = Math.min(0.5 + (downscaleRatio - 1.5) * 0.15, 1.2);
          pipeline = pipeline.sharpen({ sigma, m1: 1.0, m2: 0.5 });
        }

        return pipeline.png().toBuffer();
      }

      {
        const texFwH = isCanvasFrame ? woodPxH : frameWidthPxH;
        const texFwV = isCanvasFrame ? woodPxV : frameWidthPxV;

        const topTex = await cropTexture(frameW, texFwV, 0, 0);
        const topMask = `<svg width="${frameW}" height="${texFwV}" xmlns="http://www.w3.org/2000/svg">
          <polygon points="0,0 ${frameW},0 ${frameW - texFwH},${texFwV} ${texFwH},${texFwV}" fill="white"/>
        </svg>`;
        const topSide = await sharp(topTex)
          .composite([{ input: Buffer.from(topMask), blend: "dest-in" as const }])
          .png().toBuffer();
        layers.push({ input: topSide, left: frameX, top: frameY, blend: "over" as const });

        const bottomTex = await cropTexture(frameW, texFwV, 180, 0.7);
        const bottomMask = `<svg width="${frameW}" height="${texFwV}" xmlns="http://www.w3.org/2000/svg">
          <polygon points="${texFwH},0 ${frameW - texFwH},0 ${frameW},${texFwV} 0,${texFwV}" fill="white"/>
        </svg>`;
        const bottomSide = await sharp(bottomTex)
          .composite([{ input: Buffer.from(bottomMask), blend: "dest-in" as const }])
          .png().toBuffer();
        layers.push({ input: bottomSide, left: frameX, top: frameY + frameH - texFwV, blend: "over" as const });

        const leftTex = await cropTexture(texFwH, frameH, 90, 0.3);
        const leftMask = `<svg width="${texFwH}" height="${frameH}" xmlns="http://www.w3.org/2000/svg">
          <polygon points="0,0 ${texFwH},${texFwV} ${texFwH},${frameH - texFwV} 0,${frameH}" fill="white"/>
        </svg>`;
        const leftSide = await sharp(leftTex)
          .composite([{ input: Buffer.from(leftMask), blend: "dest-in" as const }])
          .png().toBuffer();
        layers.push({ input: leftSide, left: frameX, top: frameY, blend: "over" as const });

        const rightTex = await cropTexture(texFwH, frameH, -90, 0.5);
        const rightMask = `<svg width="${texFwH}" height="${frameH}" xmlns="http://www.w3.org/2000/svg">
          <polygon points="0,${texFwV} ${texFwH},0 ${texFwH},${frameH} 0,${frameH - texFwV}" fill="white"/>
        </svg>`;
        const rightSide = await sharp(rightTex)
          .composite([{ input: Buffer.from(rightMask), blend: "dest-in" as const }])
          .png().toBuffer();
        layers.push({ input: rightSide, left: frameX + frameW - texFwH, top: frameY, blend: "over" as const });
      }

      if (isCanvasFrame && gapPxH > 0) {
        const gapOuterX = woodPxH;
        const gapOuterY = woodPxV;
        const gapOuterW = frameW - woodPxH * 2;
        const gapOuterH = frameH - woodPxV * 2;
        const gapInnerX = frameWidthPxH;
        const gapInnerY = frameWidthPxV;

        const gapSvg = `<svg width="${frameW}" height="${frameH}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <mask id="gapmask">
              <rect x="${gapOuterX}" y="${gapOuterY}" width="${gapOuterW}" height="${gapOuterH}" fill="white"/>
              <rect x="${gapInnerX}" y="${gapInnerY}" width="${artworkW}" height="${artworkH}" fill="black"/>
            </mask>
          </defs>
          <rect width="${frameW}" height="${frameH}" fill="#0a0a0a" mask="url(#gapmask)"/>
        </svg>`;
        layers.push({ input: Buffer.from(gapSvg), left: frameX, top: frameY, blend: "over" as const });

        const gapDepthSvg = `<svg width="${frameW}" height="${frameH}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <mask id="gapdmask">
              <rect x="${gapOuterX}" y="${gapOuterY}" width="${gapOuterW}" height="${gapOuterH}" fill="white"/>
              <rect x="${gapInnerX}" y="${gapInnerY}" width="${artworkW}" height="${artworkH}" fill="black"/>
            </mask>
            <linearGradient id="gapVGrad" x1="0" y1="${gapOuterY}" x2="0" y2="${gapOuterY + gapOuterH}" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="black" stop-opacity="0.35"/>
              <stop offset="0.3" stop-color="black" stop-opacity="0"/>
              <stop offset="0.85" stop-color="white" stop-opacity="0"/>
              <stop offset="1" stop-color="white" stop-opacity="0.06"/>
            </linearGradient>
            <linearGradient id="gapHGrad" x1="${gapOuterX}" y1="0" x2="${gapOuterX + gapOuterW}" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="black" stop-opacity="0.25"/>
              <stop offset="0.25" stop-color="black" stop-opacity="0"/>
              <stop offset="0.9" stop-color="white" stop-opacity="0"/>
              <stop offset="1" stop-color="white" stop-opacity="0.04"/>
            </linearGradient>
          </defs>
          <rect width="${frameW}" height="${frameH}" fill="url(#gapVGrad)" mask="url(#gapdmask)"/>
          <rect width="${frameW}" height="${frameH}" fill="url(#gapHGrad)" mask="url(#gapdmask)"/>
        </svg>`;
        layers.push({ input: Buffer.from(gapDepthSvg), left: frameX, top: frameY, blend: "over" as const });
      }
    } else {
      const color = await getFrameColorFromAssignments(cfg.frame, cfg.depth);
      const solidInnerX = isCanvasFrame ? woodPxH : frameWidthPxH;
      const solidInnerY = isCanvasFrame ? woodPxV : frameWidthPxV;
      const solidInnerW = frameW - solidInnerX * 2;
      const solidInnerH = frameH - solidInnerY * 2;

      const frameSvg = `<svg width="${frameW}" height="${frameH}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="fm">
            <rect width="${frameW}" height="${frameH}" fill="white"/>
            <rect x="${solidInnerX}" y="${solidInnerY}" width="${solidInnerW}" height="${solidInnerH}" fill="black"/>
          </mask>
        </defs>
        <rect width="${frameW}" height="${frameH}" fill="${color}" mask="url(#fm)"/>
      </svg>`;

      layers.push({ input: Buffer.from(frameSvg), left: frameX, top: frameY, blend: "over" as const });

      if (isCanvasFrame && gapPxH > 0) {
        const gapOuterX = woodPxH;
        const gapOuterY = woodPxV;
        const gapOuterW = frameW - woodPxH * 2;
        const gapOuterH = frameH - woodPxV * 2;
        const gapInnerX = frameWidthPxH;
        const gapInnerY = frameWidthPxV;

        const gapSvg = `<svg width="${frameW}" height="${frameH}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <mask id="gapmask2">
              <rect x="${gapOuterX}" y="${gapOuterY}" width="${gapOuterW}" height="${gapOuterH}" fill="white"/>
              <rect x="${gapInnerX}" y="${gapInnerY}" width="${artworkW}" height="${artworkH}" fill="black"/>
            </mask>
          </defs>
          <rect width="${frameW}" height="${frameH}" fill="#0a0a0a" mask="url(#gapmask2)"/>
        </svg>`;
        layers.push({ input: Buffer.from(gapSvg), left: frameX, top: frameY, blend: "over" as const });
      }
    }

    // --- Subtle texture grain overlay — black and white standard frames only ---
    if (!isBoxFrame && !isCanvasFrame && (cfg.frame === "black" || cfg.frame === "white")) {
      const grainPixels = Buffer.alloc(frameW * frameH * 4);
      const isBlack = cfg.frame === "black";
      for (let i = 0; i < grainPixels.length; i += 4) {
        const px = (i / 4) % frameW;
        const py = Math.floor(i / 4 / frameW);
        const inCutout = px >= frameWidthPxH && px < frameW - frameWidthPxH &&
                         py >= frameWidthPxV && py < frameH - frameWidthPxV;
        if (inCutout) continue;
        if (isBlack) {
          const v = Math.floor(Math.random() * 256);
          grainPixels[i] = v; grainPixels[i + 1] = v; grainPixels[i + 2] = v;
          grainPixels[i + 3] = 8;
        } else {
          const v = Math.floor(Math.random() * 128);
          grainPixels[i] = v; grainPixels[i + 1] = v; grainPixels[i + 2] = v;
          grainPixels[i + 3] = 4;
        }
      }
      const grainBuf = await sharp(grainPixels, { raw: { width: frameW, height: frameH, channels: 4 } })
        .png()
        .toBuffer();
      layers.push({ input: grainBuf, left: frameX, top: frameY, blend: "over" as const });
    }

    // --- Directional gradient overlay — simulates light from top-right ---
    if (settings.frameGradient > 0) {
      const iX = isCanvasFrame ? woodPxH : frameWidthPxH;
      const iY = isCanvasFrame ? woodPxV : frameWidthPxV;
      const iW = isCanvasFrame ? frameW - woodPxH * 2 : artworkW;
      const iH = isCanvasFrame ? frameH - woodPxV * 2 : artworkH;
      const gm = settings.frameGradient;
      const isDark = cfg.frame === "black";
      let gradSvg = `<svg width="${frameW}" height="${frameH}" xmlns="http://www.w3.org/2000/svg"><defs>`;
      gradSvg += `<clipPath id="frameBandGrad"><path d="M0,0 H${frameW} V${frameH} H0 Z M${iX},${iY} V${iY + iH} H${iX + iW} V${iY} Z" clip-rule="evenodd"/></clipPath>`;

      gradSvg += `<linearGradient id="vg" x1="0" y1="0" x2="0" y2="${frameH}" gradientUnits="userSpaceOnUse">`;
      gradSvg += `<stop offset="0" stop-color="white" stop-opacity="${(isDark ? 0.06 : 0.15) * gm}"/>`;
      gradSvg += `<stop offset="0.5" stop-color="black" stop-opacity="0"/>`;
      gradSvg += `<stop offset="1" stop-color="black" stop-opacity="${(isDark ? 0.08 : 0.04) * gm}"/>`;
      gradSvg += `</linearGradient>`;
      gradSvg += `<linearGradient id="hg" x1="0" y1="0" x2="${frameW}" y2="0" gradientUnits="userSpaceOnUse">`;
      gradSvg += `<stop offset="0" stop-color="black" stop-opacity="${(isDark ? 0.06 : 0.03) * gm}"/>`;
      gradSvg += `<stop offset="0.5" stop-color="black" stop-opacity="0"/>`;
      gradSvg += `<stop offset="1" stop-color="white" stop-opacity="${(isDark ? 0.04 : 0.1) * gm}"/>`;
      gradSvg += `</linearGradient>`;

      gradSvg += `</defs><g clip-path="url(#frameBandGrad)">`;
      gradSvg += `<rect width="${frameW}" height="${frameH}" fill="url(#vg)"/>`;
      gradSvg += `<rect width="${frameW}" height="${frameH}" fill="url(#hg)"/>`;
      gradSvg += `</g></svg>`;
      layers.push({ input: Buffer.from(gradSvg), left: frameX, top: frameY, blend: "over" as const });
    }

    // --- Textured frame lip (inner edges) ---
    // For canvas frames, the lip is at the wood-to-gap boundary; for standard, at frame-to-artwork boundary
    const lipDarkenOpacity = 0.45 * detailScale * settings.lipIntensity;
    const lipInsetH = isCanvasFrame ? woodPxH : frameWidthPxH;
    const lipInsetV = isCanvasFrame ? woodPxV : frameWidthPxV;
    const lipSpanW = isCanvasFrame ? frameW - woodPxH * 2 : artworkW;
    const lipSpanH = isCanvasFrame ? frameH - woodPxV * 2 : artworkH;
    if (texture) {
      const topLip = await sharp(texture)
        .resize(lipSpanW, lipWidth, { fit: "fill", kernel: "lanczos3" })
        .composite([{
          input: Buffer.from(`<svg width="${lipSpanW}" height="${lipWidth}"><rect width="${lipSpanW}" height="${lipWidth}" fill="rgba(0,0,0,${lipDarkenOpacity})"/></svg>`),
          blend: "over" as const,
        }])
        .png().toBuffer();
      layers.push({ input: topLip, left: frameX + lipInsetH, top: frameY + lipInsetV, blend: "over" as const });

      const leftLip = await sharp(texture)
        .rotate(90)
        .resize(lipWidth, lipSpanH, { fit: "fill", kernel: "lanczos3" })
        .composite([{
          input: Buffer.from(`<svg width="${lipWidth}" height="${lipSpanH}"><rect width="${lipWidth}" height="${lipSpanH}" fill="rgba(0,0,0,${lipDarkenOpacity * 0.75})"/></svg>`),
          blend: "over" as const,
        }])
        .png().toBuffer();
      layers.push({ input: leftLip, left: frameX + lipInsetH, top: frameY + lipInsetV, blend: "over" as const });

      const bottomLip = await sharp(texture)
        .resize(lipSpanW, lipWidth, { fit: "fill", kernel: "lanczos3" })
        .flip()
        .composite([{
          input: Buffer.from(`<svg width="${lipSpanW}" height="${lipWidth}"><rect width="${lipSpanW}" height="${lipWidth}" fill="rgba(0,0,0,${lipDarkenOpacity * 0.3})"/></svg>`),
          blend: "over" as const,
        }])
        .png().toBuffer();
      layers.push({ input: bottomLip, left: frameX + lipInsetH, top: frameY + lipInsetV + lipSpanH - lipWidth, blend: "over" as const });

      const rightLip = await sharp(texture)
        .rotate(90)
        .resize(lipWidth, lipSpanH, { fit: "fill", kernel: "lanczos3" })
        .flop()
        .composite([{
          input: Buffer.from(`<svg width="${lipWidth}" height="${lipSpanH}"><rect width="${lipWidth}" height="${lipSpanH}" fill="rgba(0,0,0,${lipDarkenOpacity * 0.2})"/></svg>`),
          blend: "over" as const,
        }])
        .png().toBuffer();
      layers.push({ input: rightLip, left: frameX + lipInsetH + lipSpanW - lipWidth, top: frameY + lipInsetV, blend: "over" as const });
    } else {
      const color = await getFrameColorFromAssignments(cfg.frame, cfg.depth);
      const detailsSvg = `<svg width="${frameW}" height="${frameH}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${lipInsetH}" y="${lipInsetV}" width="${lipSpanW}" height="${lipWidth}" fill="${color}" opacity="${0.85 * settings.lipIntensity}"/>
        <rect x="${lipInsetH}" y="${lipInsetV}" width="${lipWidth}" height="${lipSpanH}" fill="${color}" opacity="${0.8 * settings.lipIntensity}"/>
        <rect x="${lipInsetH}" y="${lipInsetV + lipSpanH - lipWidth}" width="${lipSpanW}" height="${lipWidth}" fill="${color}" opacity="${0.7 * settings.lipIntensity}"/>
        <rect x="${lipInsetH + lipSpanW - lipWidth}" y="${lipInsetV}" width="${lipWidth}" height="${lipSpanH}" fill="${color}" opacity="${0.65 * settings.lipIntensity}"/>
      </svg>`;
      layers.push({ input: Buffer.from(detailsSvg), left: frameX, top: frameY, blend: "over" as const });
    }

    // --- Enhanced mitred corner joints — V-groove with gradient shading ---
    // Adapt intensity by frame finish: lighter frames get softer mitres
    const mitreIntensity = isLightFrame ? 0.4 : 1.0;
    const mitreDarkRgb = isLightFrame ? "60,40,20" : "0,0,0";
    const mitreLineWidth = Math.max(0.2, 0.1 * visualDetailScale);
    const grooveGap = Math.max(0.25, 0.18 * visualDetailScale);
    const innerX = isCanvasFrame ? woodPxH : frameWidthPxH;
    const innerY = isCanvasFrame ? woodPxV : frameWidthPxV;

    const corners = [
      { x1: 0, y1: 0, x2: innerX, y2: innerY, invert: false, darkOp: 0.55, lightOp: 0.35 },
      { x1: frameW, y1: 0, x2: frameW - innerX, y2: innerY, invert: true, darkOp: 0.4, lightOp: 0.3 },
      { x1: 0, y1: frameH, x2: innerX, y2: frameH - innerY, invert: true, darkOp: 0.4, lightOp: 0.3 },
      { x1: frameW, y1: frameH, x2: frameW - innerX, y2: frameH - innerY, invert: false, darkOp: 0.55, lightOp: 0.35 },
    ];

    let mitreSvgContent = '<defs>';
    mitreSvgContent += `<clipPath id="frameBandClip"><path d="M0,0 H${frameW} V${frameH} H0 Z M${innerX},${innerY} V${frameH - innerY} H${frameW - innerX} V${innerY} Z" clip-rule="evenodd"/></clipPath>`;
    corners.forEach((c, i) => {
      const dx = c.x2 - c.x1;
      const dy = c.y2 - c.y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const perpNx = -dy / len;
      const perpNy = dx / len;
      const darkSign = c.invert ? 1 : -1;
      const gradW = Math.max(1, 0.8 * visualDetailScale);
      const scaledDarkDef = c.darkOp * mitreIntensity;

      const gx = (c.x1 + c.x2) / 2;
      const gy = (c.y1 + c.y2) / 2;
      const gx2 = gx + perpNx * darkSign * gradW * 2;
      const gy2 = gy + perpNy * darkSign * gradW * 2;

      mitreSvgContent += `<linearGradient id="mg${i}" x1="${gx}" y1="${gy}" x2="${gx2}" y2="${gy2}" gradientUnits="userSpaceOnUse">`;
      mitreSvgContent += `<stop offset="0" stop-color="rgb(${mitreDarkRgb})" stop-opacity="${scaledDarkDef * 0.15}"/>`;
      mitreSvgContent += `<stop offset="1" stop-color="rgb(${mitreDarkRgb})" stop-opacity="0"/>`;
      mitreSvgContent += `</linearGradient>`;
    });
    mitreSvgContent += '</defs>';
    mitreSvgContent += '<g clip-path="url(#frameBandClip)">';

    corners.forEach((c, i) => {
      const dx = c.x2 - c.x1;
      const dy = c.y2 - c.y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const perpNx = -dy / len;
      const perpNy = dx / len;
      const darkSign = c.invert ? 1 : -1;
      const lightSign = c.invert ? -1 : 1;
      const gradW = Math.max(1, 0.8 * visualDetailScale);
      const scaledDark = c.darkOp * mitreIntensity;
      const scaledLight = c.lightOp * mitreIntensity;

      // Gradient shadow strip
      const p1x = c.x1;
      const p1y = c.y1;
      const p2x = c.x2;
      const p2y = c.y2;
      const p3x = c.x2 + perpNx * darkSign * gradW * 2;
      const p3y = c.y2 + perpNy * darkSign * gradW * 2;
      const p4x = c.x1 + perpNx * darkSign * gradW * 2;
      const p4y = c.y1 + perpNy * darkSign * gradW * 2;
      mitreSvgContent += `<polygon points="${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y} ${p4x},${p4y}" fill="url(#mg${i})"/>`;

      // Dark groove line — tinted to frame color
      const dOff = grooveGap;
      mitreSvgContent += `<line x1="${c.x1 + perpNx * darkSign * dOff}" y1="${c.y1 + perpNy * darkSign * dOff}" x2="${c.x2 + perpNx * darkSign * dOff}" y2="${c.y2 + perpNy * darkSign * dOff}" stroke="rgba(${mitreDarkRgb},${scaledDark})" stroke-width="${mitreLineWidth}" stroke-linecap="butt"/>`;

      // Light highlight line (hairline)
      const hlW = Math.max(0.2, mitreLineWidth * 0.6);
      mitreSvgContent += `<line x1="${c.x1 + perpNx * lightSign * dOff}" y1="${c.y1 + perpNy * lightSign * dOff}" x2="${c.x2 + perpNx * lightSign * dOff}" y2="${c.y2 + perpNy * lightSign * dOff}" stroke="rgba(255,255,255,${scaledLight})" stroke-width="${hlW}" stroke-linecap="butt"/>`;

      // V-groove shadow fill between lines
      mitreSvgContent += `<line x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}" stroke="rgba(${mitreDarkRgb},${scaledDark * 0.15})" stroke-width="${grooveGap * 1.5}" stroke-linecap="butt"/>`;
    });
    mitreSvgContent += '</g>';

    const mitreSvg = `<svg width="${frameW}" height="${frameH}" xmlns="http://www.w3.org/2000/svg">${mitreSvgContent}</svg>`;
    layers.push({ input: Buffer.from(mitreSvg), left: frameX, top: frameY, blend: "over" as const });

    // --- Frame outer edge highlight — clipped to mitre trapezoids ---
    const edgeW = Math.max(0.5, 1 * visualDetailScale);
    const edgeHalf = edgeW * 0.5;
    const iX2 = isCanvasFrame ? woodPxH : frameWidthPxH;
    const iY2 = isCanvasFrame ? woodPxV : frameWidthPxV;
    const iR2 = frameW - iX2;
    const iB2 = frameH - iY2;
    const edgeSvg = `<svg width="${frameW}" height="${frameH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="ct"><polygon points="0,0 ${frameW},0 ${iR2},${iY2} ${iX2},${iY2}"/></clipPath>
        <clipPath id="cr"><polygon points="${frameW},0 ${frameW},${frameH} ${iR2},${iB2} ${iR2},${iY2}"/></clipPath>
        <clipPath id="cb"><polygon points="0,${frameH} ${frameW},${frameH} ${iR2},${iB2} ${iX2},${iB2}"/></clipPath>
        <clipPath id="cl"><polygon points="0,0 0,${frameH} ${iX2},${iB2} ${iX2},${iY2}"/></clipPath>
      </defs>
      <line x1="0" y1="${edgeHalf}" x2="${frameW}" y2="${edgeHalf}" stroke="rgba(255,255,255,${0.18 * settings.edgeHighlight})" stroke-width="${edgeW}" clip-path="url(#ct)"/>
      <line x1="${edgeHalf}" y1="0" x2="${edgeHalf}" y2="${frameH}" stroke="rgba(255,255,255,${0.12 * settings.edgeHighlight})" stroke-width="${edgeW}" clip-path="url(#cl)"/>
      <line x1="0" y1="${frameH - edgeHalf}" x2="${frameW}" y2="${frameH - edgeHalf}" stroke="rgba(0,0,0,${0.15 * settings.edgeShadow})" stroke-width="${edgeW}" clip-path="url(#cb)"/>
      <line x1="${frameW - edgeHalf}" y1="0" x2="${frameW - edgeHalf}" y2="${frameH}" stroke="rgba(0,0,0,${0.1 * settings.edgeShadow})" stroke-width="${edgeW}" clip-path="url(#cr)"/>
    </svg>`;
    layers.push({ input: Buffer.from(edgeSvg), left: frameX, top: frameY, blend: "over" as const });
  }

  // --- Mount overlay with proper chamfer trapezoids ---
  if (hasMount) {
    const mountOuterW = artworkW;
    const mountOuterH = artworkH;
    const apertureX = mountBorderPxH;
    const apertureY = mountBorderPxV;
    const apertureW = mountOuterW - mountBorderPxH * 2;
    const apertureH = mountOuterH - mountBorderPxV * 2;

    const cW = chamferWidth;
    const iL = apertureX;
    const iT = apertureY;
    const iR = apertureX + apertureW;
    const iB = apertureY + apertureH;
    const oL = iL - cW;
    const oT = iT - cW;
    const oR = iR + cW;
    const oB = iB + cW;

    const chamferDark = settings.chamferDark * detailScale;
    const chamferLight = settings.chamferLight * detailScale;

    const mountTexture = await loadMountTexture();
    if (mountTexture) {
      const mountTexResized = await sharp(mountTexture)
        .resize(mountOuterW, mountOuterH, { fit: "fill", kernel: "lanczos3" })
        .png()
        .toBuffer();
      const maskSvg = `<svg width="${mountOuterW}" height="${mountOuterH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${mountOuterW}" height="${mountOuterH}" fill="white"/>
        <rect x="${apertureX}" y="${apertureY}" width="${apertureW}" height="${apertureH}" fill="black"/>
      </svg>`;
      const maskBuf = await sharp(Buffer.from(maskSvg)).png().toBuffer();
      const mountWithHole = await sharp(mountTexResized)
        .composite([{ input: maskBuf, blend: "dest-in" as const }])
        .png()
        .toBuffer();
      layers.push({ input: mountWithHole, left: artworkX, top: artworkY, blend: "over" as const });
    } else {
      const mountSvg = `<svg width="${mountOuterW}" height="${mountOuterH}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="mm">
            <rect width="${mountOuterW}" height="${mountOuterH}" fill="white"/>
            <rect x="${apertureX}" y="${apertureY}" width="${apertureW}" height="${apertureH}" fill="black"/>
          </mask>
        </defs>
        <rect width="${mountOuterW}" height="${mountOuterH}" fill="#FEFEFA" mask="url(#mm)"/>
      </svg>`;
      layers.push({ input: Buffer.from(mountSvg), left: artworkX, top: artworkY, blend: "over" as const });
    }

    const chamferSvg = `<svg width="${mountOuterW}" height="${mountOuterH}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${oL},${oT} ${oR},${oT} ${iR},${iT} ${iL},${iT}" fill="rgba(0,0,0,${chamferDark})"/>
      <polygon points="${oL},${oT} ${iL},${iT} ${iL},${iB} ${oL},${oB}" fill="rgba(0,0,0,${chamferDark * 0.75})"/>
      <polygon points="${iL},${iB} ${iR},${iB} ${oR},${oB} ${oL},${oB}" fill="rgba(0,0,0,${chamferLight})"/>
      <polygon points="${oR},${oT} ${oR},${oB} ${iR},${iB} ${iR},${iT}" fill="rgba(0,0,0,${chamferLight * 0.75})"/>
    </svg>`;
    layers.push({ input: Buffer.from(chamferSvg), left: artworkX, top: artworkY, blend: "over" as const });
  }

  let innerShadowLayer: sharp.OverlayOptions | null = null;
  if (isFramed && settings.innerShadowDepth > 0 && settings.innerShadowOpacity > 0) {
    const overlap = settings.innerShadowOverlap;
    const iX = frameWidthPxH - overlap;
    const iY = frameWidthPxV - overlap;
    const canvasScale = canvasWidth / 500;
    const depthPx = Math.max(4 * canvasScale, settings.innerShadowDepth * visualDetailScale * canvasScale) + overlap;
    const aW = artworkW + overlap * 2;
    const aH = artworkH + overlap * 2;
    const maxAlpha = Math.round(settings.innerShadowOpacity * 255);

    const ambientDepthPx = depthPx * 0.4;
    const ambientMaxAlpha = Math.round(maxAlpha * 0.25);

    const pixelData = Buffer.alloc(aW * aH * 4, 0);
    for (let row = 0; row < aH; row++) {
      for (let col = 0; col < aW; col++) {
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
        const distBottom = (aH - 1) - row;
        const distRight = (aW - 1) - col;
        const minDistAmbient = Math.min(distBottom, distRight);
        if (minDistAmbient < ambientDepthPx) {
          const t = 1 - minDistAmbient / ambientDepthPx;
          const ambAlpha = Math.round(ambientMaxAlpha * t);
          alpha = Math.max(alpha, ambAlpha);
        }

        if (alpha > 0) {
          const idx = (row * aW + col) * 4;
          pixelData[idx + 3] = alpha;
        }
      }
    }

    const innerShadowBuf = await sharp(pixelData, {
      raw: { width: aW, height: aH, channels: 4 },
    }).png().toBuffer();

    innerShadowLayer = {
      input: innerShadowBuf,
      left: frameX + iX,
      top: frameY + iY,
      blend: "over" as const,
    };
  }

  // --- Cutout mask (transparent artwork window) ---
  const holeSvg = `<svg width="${cutoutW}" height="${cutoutH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${cutoutW}" height="${cutoutH}" fill="white"/>
  </svg>`;

  const cutoutMask = await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 255 },
    },
  })
    .composite([{ input: Buffer.from(holeSvg), left: cutoutX, top: cutoutY, blend: "dest-out" as const }])
    .png()
    .toBuffer();

  const debugShadowLayer = layers.pop()!;

  const compositeLayers: sharp.OverlayOptions[] = [
    ...layers,
    { input: cutoutMask, blend: "dest-in" as const },
  ];
  if (innerShadowLayer) {
    compositeLayers.push(innerShadowLayer);
  }

  // Subtle glass reflection — diagonal sheen across artwork window (skip for canvas prints)
  if (isFramed && !isCanvasFrame) {
    const glassX = cutoutX;
    const glassY = cutoutY;
    const glassW = cutoutW;
    const glassH = cutoutH;

    const glassSvg = `<svg width="${glassW}" height="${glassH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="white" stop-opacity="0.04"/>
          <stop offset="35%" stop-color="white" stop-opacity="0"/>
          <stop offset="45%" stop-color="white" stop-opacity="0.03"/>
          <stop offset="55%" stop-color="white" stop-opacity="0"/>
          <stop offset="100%" stop-color="white" stop-opacity="0.015"/>
        </linearGradient>
      </defs>
      <rect width="${glassW}" height="${glassH}" fill="url(#glass)"/>
    </svg>`;

    compositeLayers.push({
      input: Buffer.from(glassSvg),
      left: glassX,
      top: glassY,
      blend: "over" as const,
    });
  }

  // DEBUG: render shadow on top of everything to verify shape
  compositeLayers.push(debugShadowLayer);

  const fmt = outputFormat || "webp";
  let pipeline = sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(compositeLayers);

  const result = fmt === "png"
    ? await pipeline.png().toBuffer()
    : await pipeline.webp({ quality: 95, effort: 6, alphaQuality: 95 }).toBuffer();

  return result;
}

export interface QualityTestResult {
  label: string;
  quality: number;
  lossless: boolean;
  effort: number;
  alphaQuality: number;
  sizeBytes: number;
  buffer: Buffer;
}

export async function generateQualityTest(sizeKey: string, frame: FrameColor, depth: FrameDepth, mount: "m0" | "m1"): Promise<QualityTestResult[]> {
  const size = A_RATIO_SIZES.find(s => s.sizeKey === sizeKey);
  if (!size) throw new Error(`Unknown size: ${sizeKey}`);

  const cfg: OverlayConfig = { sizeKey, ori: "p", frame, depth, mount };
  const settings = await getRenderSettings();

  const pngSource = await generateCombinedOverlay(cfg, size, settings, undefined, "png");
  const losslessSource = await sharp(pngSource)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const qualityLevels = [
    { label: "Q80 E6 A80", quality: 80, effort: 6, alphaQuality: 80, lossless: false },
    { label: "Q85 E6 A85", quality: 85, effort: 6, alphaQuality: 85, lossless: false },
    { label: "Q90 E6 A90", quality: 90, effort: 6, alphaQuality: 90, lossless: false },
    { label: "Current (Q95 E6 A95)", quality: 95, effort: 6, alphaQuality: 95, lossless: false },
    { label: "Q100 E6 A100", quality: 100, effort: 6, alphaQuality: 100, lossless: false },
    { label: "Lossless E6", quality: 100, effort: 6, alphaQuality: 100, lossless: true },
  ];

  const results: QualityTestResult[] = [];

  for (const level of qualityLevels) {
    const encoded = await sharp(losslessSource.data, {
      raw: { width: losslessSource.info.width, height: losslessSource.info.height, channels: losslessSource.info.channels as 4 },
    })
      .webp({
        quality: level.quality,
        effort: level.effort,
        alphaQuality: level.alphaQuality,
        lossless: level.lossless,
      })
      .toBuffer();

    results.push({
      label: level.label,
      quality: level.quality,
      lossless: level.lossless,
      effort: level.effort,
      alphaQuality: level.alphaQuality,
      sizeBytes: encoded.length,
      buffer: encoded,
    });
  }

  return results;
}

export interface CanvasSizeTestResult {
  label: string;
  canvasWidth: number;
  canvasHeight: number;
  frameWidthPx: number;
  sizeBytes: number;
  buffer: Buffer;
}

export async function generateCanvasSizeTest(sizeKey: string, frame: FrameColor, depth: FrameDepth, mount: "m0" | "m1"): Promise<CanvasSizeTestResult[]> {
  const size = A_RATIO_SIZES.find(s => s.sizeKey === sizeKey);
  if (!size) throw new Error(`Unknown size: ${sizeKey}`);

  const cfg: OverlayConfig = { sizeKey, ori: "p", frame, depth, mount };
  const settings = await getRenderSettings();

  const canvasSizes = [
    { label: "750×1000", width: 750, height: 1000 },
    { label: "1000×1333", width: 1000, height: 1333 },
    { label: "1500×2000 (current)", width: 1500, height: 2000 },
    { label: "2000×2667", width: 2000, height: 2667 },
    { label: "2500×3333", width: 2500, height: 3333 },
    { label: "3000×4000", width: 3000, height: 4000 },
  ];

  const results: CanvasSizeTestResult[] = [];

  for (const cs of canvasSizes) {
    const canvasOverride = { width: cs.width, height: cs.height };
    const overlay = await generateCombinedOverlay(cfg, size, settings, canvasOverride);
    const isFramed = frame !== "unframed";
    const hasMount = mount === "m1" && isFramed;
    const dims = calculateDims(size, "p", depth, hasMount, isFramed, settings, canvasOverride);

    results.push({
      label: cs.label,
      canvasWidth: cs.width,
      canvasHeight: cs.height,
      frameWidthPx: dims.frameWidthPxH,
      sizeBytes: overlay.length,
      buffer: overlay,
    });
  }

  return results;
}

export interface ArtworkWindowBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GeneratedOverlay {
  filename: string;
  buffer: Buffer;
  config: OverlayConfig;
  widthPx: number;
  heightPx: number;
  sizeLabel: string;
  artworkWindow: ArtworkWindowBounds;
}

export interface OverlayGenerationRequest {
  sizes?: string[];
  frames?: FrameColor[];
  depths?: FrameDepth[];
  mounts?: ("m0" | "m1")[];
}

export async function generateOverlays(req?: OverlayGenerationRequest): Promise<GeneratedOverlay[]> {
  const sizes = req?.sizes || ["a4", "a3", "a2", "a1", "a0"];
  const frames = req?.frames || ["black", "white", "natural"];
  const depths = req?.depths || ["std"];
  const mounts = req?.mounts || ["m0", "m1"];

  const results: GeneratedOverlay[] = [];
  const selectedSizes = A_RATIO_SIZES.filter((s) => sizes.includes(s.sizeKey));
  const renderSettings = await getRenderSettings();
  console.log(`[FrameOverlay] Using render settings:`, JSON.stringify(renderSettings));

  for (const size of selectedSizes) {
    const isSquare = size.widthMm === size.heightMm;
    const orientations: Orientation[] = isSquare ? ["s"] : ["p", "l"];

    for (const ori of orientations) {
    for (const frame of frames) {
      for (const depth of depths) {
        if (frame === "unframed" && depth === "box") continue;

        for (const mount of mounts) {
          if (frame === "unframed" && mount === "m1") continue;

          const cfg: OverlayConfig = { sizeKey: size.sizeKey, ori, frame, depth, mount };
          const filename = buildFilename(cfg);

          console.log(`[FrameOverlay] Generating ${filename}...`);
          try {
            const isFramed = frame !== "unframed";
            const hasMount = mount === "m1" && isFramed;
            const dims = calculateDims(size, ori, depth, hasMount, isFramed, renderSettings);
            const buffer = await generateCombinedOverlay(cfg, size, renderSettings);

            const cutoutX = hasMount ? dims.artworkX + dims.mountBorderPxH : dims.artworkX;
            const cutoutY = hasMount ? dims.artworkY + dims.mountBorderPxV : dims.artworkY;
            const cutoutW = hasMount ? dims.artworkW - dims.mountBorderPxH * 2 : dims.artworkW;
            const cutoutH = hasMount ? dims.artworkH - dims.mountBorderPxV * 2 : dims.artworkH;

            const artworkWindow: ArtworkWindowBounds = {
              x: parseFloat((cutoutX / dims.canvasWidth).toFixed(4)),
              y: parseFloat((cutoutY / dims.canvasHeight).toFixed(4)),
              w: parseFloat((cutoutW / dims.canvasWidth).toFixed(4)),
              h: parseFloat((cutoutH / dims.canvasHeight).toFixed(4)),
            };

            results.push({
              filename,
              buffer,
              config: cfg,
              widthPx: dims.canvasWidth,
              heightPx: dims.canvasHeight,
              sizeLabel: size.label,
              artworkWindow,
            });
          } catch (err) {
            console.error(`[FrameOverlay] Failed to generate ${filename}:`, err);
          }
        }
      }
    }
    }
  }

  return results;
}

export interface MockupReferenceSize {
  ratioCategory: string;
  sizeKey: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

const MOCKUP_REFERENCE_SIZES: MockupReferenceSize[] = [
  { ratioCategory: "a-ratio", sizeKey: "a2", label: "A2", widthMm: 420, heightMm: 594 },
  { ratioCategory: "3:4", sizeKey: "18x24", label: '18" x 24"', widthMm: 457, heightMm: 610 },
  { ratioCategory: "2:3", sizeKey: "16x24", label: '16" x 24"', widthMm: 406, heightMm: 610 },
  { ratioCategory: "4:5", sizeKey: "16x20", label: '16" x 20"', widthMm: 406, heightMm: 508 },
  { ratioCategory: "square", sizeKey: "20x20", label: '20" x 20"', widthMm: 508, heightMm: 508 },
];

export function getMockupReferenceSizes(): MockupReferenceSize[] {
  return MOCKUP_REFERENCE_SIZES;
}

export function getMockupReferenceSize(ratioCategory: string): MockupReferenceSize | undefined {
  return MOCKUP_REFERENCE_SIZES.find(s => s.ratioCategory === ratioCategory);
}

export async function generateProductMockup(
  artworkImageBuffer: Buffer,
  ratioCategory: string,
  frame: FrameColor,
  orientation: "portrait" | "landscape",
  settingsOverride?: Partial<RenderSettings>,
  depth: FrameDepth = "std",
): Promise<Buffer> {
  const refSize = getMockupReferenceSize(ratioCategory);
  if (!refSize) {
    throw new Error(`No reference size defined for ratio category: ${ratioCategory}`);
  }

  const ori: Orientation = orientation === "landscape" ? "l" : (refSize.widthMm === refSize.heightMm ? "s" : "p");
  const isFramed = frame !== "unframed";
  const hasMount = false;

  const size: OverlaySize = {
    sizeKey: refSize.sizeKey,
    label: refSize.label,
    widthMm: refSize.widthMm,
    heightMm: refSize.heightMm,
  };

  const baseSettings = await getRenderSettings();
  const settings = settingsOverride ? { ...baseSettings, ...settingsOverride } : baseSettings;
  const dims = calculateDims(size, ori, depth, hasMount, isFramed, settings);

  const {
    canvasWidth, canvasHeight,
    artworkX, artworkY, artworkW, artworkH,
  } = dims;

  const cutoutX = artworkX;
  const cutoutY = artworkY;
  const cutoutW = artworkW;
  const cutoutH = artworkH;

  const artworkResized = await sharp(artworkImageBuffer)
    .resize(cutoutW, cutoutH, { fit: "cover", position: "centre", kernel: "lanczos3" })
    .jpeg({ quality: 98 })
    .toBuffer();

  const overlayCfg: OverlayConfig = {
    sizeKey: refSize.sizeKey,
    ori,
    frame,
    depth,
    mount: "m0",
  };
  const overlayBuffer = await generateCombinedOverlay(overlayCfg, size, settings, undefined, "png");

  const result = await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 255 },
    },
  })
    .composite([
      { input: artworkResized, left: cutoutX, top: cutoutY, blend: "over" as const },
      { input: overlayBuffer, left: 0, top: 0, blend: "over" as const },
    ])
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();

  return result;
}

export async function generateCanvasProductMockups(
  artworkImageBuffer: Buffer,
  ratioCategory: string,
  orientation: "portrait" | "landscape",
): Promise<{ frame: string; buffer: Buffer }[]> {
  const frames: FrameColor[] = ["black", "white", "natural"];
  const results: { frame: string; buffer: Buffer }[] = [];

  for (const frame of frames) {
    const buffer = await generateProductMockup(artworkImageBuffer, ratioCategory, frame, orientation, undefined, "canvas");
    results.push({ frame: `canvas_${frame}`, buffer });
  }

  return results;
}

export async function generateAllProductMockups(
  artworkImageBuffer: Buffer,
  ratioCategory: string,
  orientation: "portrait" | "landscape",
): Promise<{ frame: string; buffer: Buffer }[]> {
  const frames: FrameColor[] = ["black", "white", "natural", "unframed"];
  const results: { frame: string; buffer: Buffer }[] = [];

  for (const frame of frames) {
    const buffer = await generateProductMockup(artworkImageBuffer, ratioCategory, frame, orientation);
    results.push({ frame, buffer });
  }

  return results;
}

export async function generateAllOverlays(): Promise<GeneratedOverlay[]> {
  return generateOverlays({
    sizes: ["a4", "a3", "a2", "a1", "a0"],
    frames: ["black", "white", "natural"],
    depths: ["std", "box"],
    mounts: ["m0", "m1"],
  });
}

export function getOverlaySizes() {
  return A_RATIO_SIZES.map((size) => {
    const frameWidthMm = FRAME_WIDTH_MM;
    const mountBorderMm = getMountBorderMm(size.sizeKey);
    const totalW = size.widthMm + frameWidthMm * 2;
    const totalH = size.heightMm + frameWidthMm * 2;
    const framePctH = (frameWidthMm / totalW) * 100;
    const framePctV = (frameWidthMm / totalH) * 100;
    const mountPctH = (mountBorderMm / totalW) * 100;
    const mountPctV = (mountBorderMm / totalH) * 100;
    return {
      sizeKey: size.sizeKey,
      label: size.label,
      widthMm: size.widthMm,
      heightMm: size.heightMm,
      frameWidthMm,
      mountBorderMm,
      framePctH: parseFloat(framePctH.toFixed(2)),
      framePctV: parseFloat(framePctV.toFixed(2)),
      mountPctH: parseFloat(mountPctH.toFixed(2)),
      mountPctV: parseFloat(mountPctV.toFixed(2)),
    };
  });
}
