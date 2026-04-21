import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { readFile } from "fs/promises";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

interface ScanKeyframe {
  x: number;
  y: number;
  zoom: number;
  holdFrames: number;
  panFrames: number;
}

export type ScanVideoVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

function calculateMinZoom(
  imgWidth: number,
  imgHeight: number,
  outWidth: number,
  outHeight: number,
): number {
  const zoomForHeight = (imgWidth * outHeight) / (imgHeight * outWidth);
  return Math.max(1.0, zoomForHeight);
}

function clampPosition(
  pos: number,
  imgDim: number,
  zoom: number,
  outDim: number,
): number {
  const viewportSize = imgDim / zoom;
  const halfView = viewportSize / 2;
  return Math.max(halfView, Math.min(imgDim - halfView, pos));
}

function edgeAwarePosition(
  fraction: number,
  imgDim: number,
  zoom: number,
): number {
  const viewportSize = imgDim / zoom;
  const halfView = viewportSize / 2;
  const usableRange = imgDim - viewportSize;
  return halfView + usableRange * fraction;
}

function generateScanKeyframes(
  imgWidth: number,
  imgHeight: number,
  minZoom: number,
): ScanKeyframe[] {
  return generateCrossPatternKeyframes(imgWidth, imgHeight, minZoom, 100);
}

function generateCrossPatternKeyframes(
  imgWidth: number,
  imgHeight: number,
  minZoom: number,
  panSpeed: number,
): ScanKeyframe[] {
  const z = Math.max(minZoom * 2.2, 2.4);
  return [
    { x: edgeAwarePosition(0.5, imgWidth, z), y: edgeAwarePosition(0.0, imgHeight, z), zoom: z, holdFrames: 0, panFrames: 0 },
    { x: edgeAwarePosition(0.5, imgWidth, z), y: edgeAwarePosition(1.0, imgHeight, z), zoom: z, holdFrames: 0, panFrames: panSpeed },
    { x: edgeAwarePosition(1.0, imgWidth, z), y: edgeAwarePosition(1.0, imgHeight, z), zoom: z, holdFrames: 0, panFrames: 0 },
    { x: edgeAwarePosition(0.0, imgWidth, z), y: edgeAwarePosition(1.0, imgHeight, z), zoom: z, holdFrames: 0, panFrames: panSpeed },
    { x: edgeAwarePosition(0.0, imgWidth, z), y: edgeAwarePosition(0.0, imgHeight, z), zoom: z, holdFrames: 0, panFrames: 0 },
    { x: edgeAwarePosition(1.0, imgWidth, z), y: edgeAwarePosition(0.0, imgHeight, z), zoom: z, holdFrames: 0, panFrames: panSpeed },
    { x: edgeAwarePosition(1.0, imgWidth, z), y: edgeAwarePosition(0.5, imgHeight, z), zoom: z, holdFrames: 0, panFrames: 0 },
    { x: edgeAwarePosition(0.0, imgWidth, z), y: edgeAwarePosition(0.5, imgHeight, z), zoom: z, holdFrames: 0, panFrames: panSpeed },
  ];
}

function isLandscape(w: number, h: number): boolean {
  return w / h > 1.05;
}

function getPanSpeedForVariant(variant?: ScanVideoVariant): number {
  switch (variant) {
    case 1: return 100;
    case 2: return 115;
    case 3: return 130;
    case 4: return 150;
    case 5: return 170;
    default: return 100;
  }
}

function buildLandscapeCropExpression(
  imgWidth: number,
  imgHeight: number,
  cropW: number,
  cropH: number,
  panSpeed: number,
): { x: string; y: string; totalFrames: number } {
  const pos = (frac: number, imgDim: number, cropDim: number) => {
    const maxOffset = imgDim - cropDim;
    return Math.max(0, Math.min(maxOffset, Math.round(maxOffset * frac)));
  };

  const keyframes = [
    { cx: pos(0.5, imgWidth, cropW), cy: pos(0.0, imgHeight, cropH), panFrames: 0 },
    { cx: pos(0.5, imgWidth, cropW), cy: pos(1.0, imgHeight, cropH), panFrames: panSpeed },
    { cx: pos(1.0, imgWidth, cropW), cy: pos(1.0, imgHeight, cropH), panFrames: 0 },
    { cx: pos(0.0, imgWidth, cropW), cy: pos(1.0, imgHeight, cropH), panFrames: panSpeed },
    { cx: pos(0.0, imgWidth, cropW), cy: pos(0.0, imgHeight, cropH), panFrames: 0 },
    { cx: pos(1.0, imgWidth, cropW), cy: pos(0.0, imgHeight, cropH), panFrames: panSpeed },
    { cx: pos(1.0, imgWidth, cropW), cy: pos(0.5, imgHeight, cropH), panFrames: 0 },
    { cx: pos(0.0, imgWidth, cropW), cy: pos(0.5, imgHeight, cropH), panFrames: panSpeed },
  ];

  let totalFrames = 0;
  for (const kf of keyframes) totalFrames += kf.panFrames;

  const xParts: string[] = [];
  const yParts: string[] = [];
  let frameOffset = 0;

  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    const prev = i > 0 ? keyframes[i - 1] : kf;

    if (kf.panFrames > 0) {
      const panStart = frameOffset;
      const panEnd = frameOffset + kf.panFrames;
      const t = `((n-${panStart})/${kf.panFrames})`;

      xParts.push(
        `if(between(n,${panStart},${panEnd - 1}),${prev.cx}+(${kf.cx}-${prev.cx})*${t}`,
      );
      yParts.push(
        `if(between(n,${panStart},${panEnd - 1}),${prev.cy}+(${kf.cy}-${prev.cy})*${t}`,
      );

      frameOffset = panEnd;
    }
  }

  const closingParens = ")".repeat(xParts.length - 1);
  const defaultX = pos(0.5, imgWidth, cropW);
  const defaultY = pos(0.5, imgHeight, cropH);
  const x = xParts.join(",") + `,${defaultX}` + closingParens + ")";
  const y = yParts.join(",") + `,${defaultY}` + closingParens + ")";

  return { x, y, totalFrames };
}

function getKeyframesForVariant(
  variant: ScanVideoVariant,
  imgWidth: number,
  imgHeight: number,
  minZoom: number,
): ScanKeyframe[] {
  switch (variant) {
    case 1: return generateCrossPatternKeyframes(imgWidth, imgHeight, minZoom, 100);
    case 2: return generateCrossPatternKeyframes(imgWidth, imgHeight, minZoom, 115);
    case 3: return generateCrossPatternKeyframes(imgWidth, imgHeight, minZoom, 130);
    case 4: return generateCrossPatternKeyframes(imgWidth, imgHeight, minZoom, 150);
    case 5: return generateCrossPatternKeyframes(imgWidth, imgHeight, minZoom, 170);
    default: return generateScanKeyframes(imgWidth, imgHeight, minZoom);
  }
}

export const SCAN_VIDEO_VARIANT_DESCRIPTIONS: Record<number, { name: string; description: string }> = {
  1: {
    name: "Speed 1 (Original)",
    description: "Cross pattern with cuts. 100 frames per pan (~3.3s each, ~13s total).",
  },
  2: {
    name: "Speed 2",
    description: "Cross pattern with cuts. 115 frames per pan (~3.8s each, ~15s total).",
  },
  3: {
    name: "Speed 3",
    description: "Cross pattern with cuts. 130 frames per pan (~4.3s each, ~17s total).",
  },
  4: {
    name: "Speed 4",
    description: "Cross pattern with cuts. 150 frames per pan (~5.0s each, ~20s total).",
  },
  5: {
    name: "Speed 5 (Slowest)",
    description: "Cross pattern with cuts. 170 frames per pan (~5.7s each, ~23s total).",
  },
};

function buildZoompanExpression(
  keyframes: ScanKeyframe[],
  imgWidth: number,
  imgHeight: number,
  outWidth: number,
  outHeight: number,
): { zoom: string; x: string; y: string; totalFrames: number } {
  let totalFrames = 0;
  for (const kf of keyframes) {
    totalFrames += kf.panFrames + kf.holdFrames;
  }

  const zoomParts: string[] = [];
  const xParts: string[] = [];
  const yParts: string[] = [];

  let frameOffset = 0;

  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    const prev = i > 0 ? keyframes[i - 1] : kf;

    const panStart = frameOffset;
    const panEnd = frameOffset + kf.panFrames;
    const holdEnd = panEnd + kf.holdFrames;

    if (kf.panFrames > 0) {
      const prevNx = prev.x / imgWidth;
      const prevNy = prev.y / imgHeight;
      const curNx = kf.x / imgWidth;
      const curNy = kf.y / imgHeight;

      const t = `((on-${panStart})/${kf.panFrames})`;
      const eased = t;

      zoomParts.push(
        `if(between(on,${panStart},${panEnd - 1}),${prev.zoom}+(${kf.zoom}-${prev.zoom})*${eased}`,
      );
      xParts.push(
        `if(between(on,${panStart},${panEnd - 1}),floor((${prevNx}+(${curNx}-${prevNx})*${eased})*iw-iw/zoom/2)`,
      );
      yParts.push(
        `if(between(on,${panStart},${panEnd - 1}),floor((${prevNy}+(${curNy}-${prevNy})*${eased})*ih-ih/zoom/2)`,
      );
    }

    if (kf.holdFrames > 0) {
      const nx = kf.x / imgWidth;
      const ny = kf.y / imgHeight;
      zoomParts.push(
        `if(between(on,${panEnd},${holdEnd - 1}),${kf.zoom}`,
      );
      xParts.push(
        `if(between(on,${panEnd},${holdEnd - 1}),floor(${nx}*iw-iw/zoom/2)`,
      );
      yParts.push(
        `if(between(on,${panEnd},${holdEnd - 1}),floor(${ny}*ih-ih/zoom/2)`,
      );
    }

    frameOffset = holdEnd;
  }

  const closingParens = ")".repeat(zoomParts.length - 1);
  const fallbackZoom = keyframes[0]?.zoom ?? 1;
  const zoom = zoomParts.join(",") + `,${fallbackZoom}` + closingParens + ")";
  const x = xParts.join(",") + ",iw/2-iw/zoom/2" + closingParens + ")";
  const y = yParts.join(",") + ",ih/2-ih/zoom/2" + closingParens + ")";

  return { zoom, x, y, totalFrames };
}

async function prepareSourceImage(
  artworkBuffer: Buffer,
  outputWidth: number,
  outputHeight: number,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const metadata = await sharp(artworkBuffer).metadata();
  const imgWidth = metadata.width!;
  const imgHeight = metadata.height!;

  const minDim = 2400;
  let scaledBuffer = artworkBuffer;
  let sW = imgWidth;
  let sH = imgHeight;
  if (sW < minDim && sH < minDim) {
    const scale = minDim / Math.min(sW, sH);
    sW = Math.round(sW * scale);
    sH = Math.round(sH * scale);
    scaledBuffer = await sharp(artworkBuffer)
      .resize(sW, sH, { fit: "fill" })
      .jpeg({ quality: 95 })
      .toBuffer();
  }

  const outputAspect = outputWidth / outputHeight;
  const srcAspect = sW / sH;
  const landscape = isLandscape(sW, sH);

  if (!landscape && Math.abs(srcAspect - outputAspect) > 0.01) {
    let cropW: number;
    let cropH: number;
    if (srcAspect > outputAspect) {
      cropH = sH;
      cropW = Math.round(sH * outputAspect);
    } else {
      cropW = sW;
      cropH = Math.round(sW / outputAspect);
    }
    cropW = cropW % 2 === 0 ? cropW : cropW - 1;
    cropH = cropH % 2 === 0 ? cropH : cropH - 1;

    const left = Math.round((sW - cropW) / 2);
    const top = Math.round((sH - cropH) / 2);

    scaledBuffer = await sharp(scaledBuffer)
      .extract({ left, top, width: cropW, height: cropH })
      .jpeg({ quality: 95 })
      .toBuffer();
    console.log(`[VideoGen] Cropped source from ${sW}x${sH} to ${cropW}x${cropH} (cover fill) to match output aspect ${outputAspect.toFixed(3)}`);
    sW = cropW;
    sH = cropH;
  }

  const evenW = sW % 2 === 0 ? sW : sW - 1;
  const evenH = sH % 2 === 0 ? sH : sH - 1;
  if (evenW !== sW || evenH !== sH) {
    scaledBuffer = await sharp(scaledBuffer)
      .resize(evenW, evenH, { fit: "fill" })
      .jpeg({ quality: 95 })
      .toBuffer();
  }

  return { buffer: scaledBuffer, width: evenW, height: evenH };
}

export async function generateArtworkScanVideo(
  artworkBuffer: Buffer,
  options: {
    outputWidth?: number;
    outputHeight?: number;
    fps?: number;
    quality?: number;
    variant?: ScanVideoVariant;
  } = {},
): Promise<Buffer> {
  const {
    outputWidth = 1080,
    outputHeight = 1350,
    fps = 30,
    quality = 26,
    variant,
  } = options;

  const { buffer: scaledBuffer, width: evenW, height: evenH } = await prepareSourceImage(artworkBuffer, outputWidth, outputHeight);

  const landscape = isLandscape(evenW, evenH);
  const variantLabel = variant ? ` (variant ${variant})` : '';

  let filterComplex: string;
  let totalFrames: number;

  if (landscape) {
    const zoomFactor = 2.4;
    let cropH = Math.round(evenH / zoomFactor);
    let cropW = Math.round(cropH * outputWidth / outputHeight);
    if (cropW > evenW) {
      cropW = evenW;
      cropH = Math.round(cropW * outputHeight / outputWidth);
    }
    cropW = cropW % 2 === 0 ? cropW : cropW - 1;
    cropH = cropH % 2 === 0 ? cropH : cropH - 1;

    const panSpeed = getPanSpeedForVariant(variant);
    const cropExpr = buildLandscapeCropExpression(evenW, evenH, cropW, cropH, panSpeed);
    totalFrames = cropExpr.totalFrames;

    console.log(`[VideoGen] Landscape source: ${evenW}x${evenH}, crop window: ${cropW}x${cropH}, Output: ${outputWidth}x${outputHeight}${variantLabel}`);
    filterComplex = `crop=${cropW}:${cropH}:'${cropExpr.x}':'${cropExpr.y}',scale=${outputWidth}:${outputHeight}:flags=lanczos,format=yuv420p`;
  } else {
    const minZoom = calculateMinZoom(evenW, evenH, outputWidth, outputHeight);
    console.log(`[VideoGen] Source: ${evenW}x${evenH}, Output: ${outputWidth}x${outputHeight}, minZoom: ${minZoom.toFixed(3)}${variantLabel}`);

    const keyframes = variant
      ? getKeyframesForVariant(variant, evenW, evenH, minZoom)
      : generateScanKeyframes(evenW, evenH, minZoom);

    const zoompanExpr = buildZoompanExpression(
      keyframes, evenW, evenH, outputWidth, outputHeight,
    );
    totalFrames = zoompanExpr.totalFrames;

    const zoompanFilter = `zoompan=z='${zoompanExpr.zoom}':x='${zoompanExpr.x}':y='${zoompanExpr.y}':d=${totalFrames}:s=${outputWidth}x${outputHeight}:fps=${fps}`;
    filterComplex = `${zoompanFilter},format=yuv420p`;
  }

  const duration = totalFrames / fps;
  console.log(`[VideoGen] Generating ${duration.toFixed(1)}s scan video (${totalFrames} frames @ ${fps}fps)`);

  const tempDir = await mkdtemp(join(tmpdir(), "vidgen-"));
  const inputPath = join(tempDir, "input.jpg");
  const outputPath = join(tempDir, "output.mp4");

  try {
    await writeFile(inputPath, scaledBuffer);


    const ffmpegTimeout = Math.round(Math.max(180000, duration * 15000));
    const ffmpegArgs = ["-y"];
    if (landscape) {
      ffmpegArgs.push("-r", fps.toString());
    }
    ffmpegArgs.push(
      "-loop", "1",
      "-i", inputPath,
      "-vf", filterComplex,
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", quality.toString(),
      "-profile:v", "high",
      "-level", "4.1",
      "-movflags", "+faststart",
      "-t", duration.toString(),
      "-r", fps.toString(),
      "-an",
      outputPath,
    );
    await execFileAsync("ffmpeg", ffmpegArgs, { timeout: ffmpegTimeout, maxBuffer: 50 * 1024 * 1024 });

    const videoBuffer = await readFile(outputPath);
    console.log(`[VideoGen] Video generated: ${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB`);

    return videoBuffer;
  } finally {
    try { await unlink(inputPath); } catch {}
    try { await unlink(outputPath); } catch {}
    try {
      const { rmdir } = await import("fs/promises");
      await rmdir(tempDir);
    } catch {}
  }
}
