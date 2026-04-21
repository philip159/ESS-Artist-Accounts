import sharp from "sharp";

export interface Point {
  x: number;
  y: number;
}

export interface PerspectiveOptions {
  blendMode: "over" | "multiply";
  blendOpacity: number;
}

function crossProduct2D(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function validateQuadrilateral(corners: Point[]): { valid: boolean; error?: string } {
  if (corners.length !== 4) {
    return { valid: false, error: "Exactly 4 corners required" };
  }

  for (const p of corners) {
    if (!isFinite(p.x) || !isFinite(p.y)) {
      return { valid: false, error: "Corner coordinates must be finite numbers" };
    }
  }

  const cross01 = crossProduct2D(corners[0], corners[1], corners[2]);
  const cross12 = crossProduct2D(corners[1], corners[2], corners[3]);
  const cross23 = crossProduct2D(corners[2], corners[3], corners[0]);
  const cross30 = crossProduct2D(corners[3], corners[0], corners[1]);

  const allPositive = cross01 > 0 && cross12 > 0 && cross23 > 0 && cross30 > 0;
  const allNegative = cross01 < 0 && cross12 < 0 && cross23 < 0 && cross30 < 0;

  if (!allPositive && !allNegative) {
    return { valid: false, error: "Corners do not form a convex quadrilateral. Check ordering: TL, TR, BR, BL" };
  }

  const area = Math.abs(
    (corners[0].x * corners[1].y - corners[1].x * corners[0].y) +
    (corners[1].x * corners[2].y - corners[2].x * corners[1].y) +
    (corners[2].x * corners[3].y - corners[3].x * corners[2].y) +
    (corners[3].x * corners[0].y - corners[0].x * corners[3].y)
  ) / 2;

  if (area < 100) {
    return { valid: false, error: "Zone area is too small (corners may be nearly collinear)" };
  }

  return { valid: true };
}

function solveHomography(src: Point[], dst: Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const sx = src[i].x, sy = src[i].y;
    const dx = dst[i].x, dy = dst[i].y;

    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  return gaussianElimination(A, b);
}

function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = b.length;
  const aug: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) {
      throw new Error(`Singular matrix encountered at column ${col} — corners may be degenerate`);
    }

    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / pivot;
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    if (Math.abs(aug[row][row]) < 1e-12) {
      throw new Error("Singular matrix in back-substitution — corners may be degenerate");
    }
    x[row] = aug[row][n];
    for (let j = row + 1; j < n; j++) {
      x[row] -= aug[row][j] * x[j];
    }
    x[row] /= aug[row][row];
  }

  for (const val of x) {
    if (!isFinite(val)) {
      throw new Error("Homography produced non-finite values — corners may be degenerate");
    }
  }

  return x;
}

function invertHomography(h: number[]): number[] {
  const [a, b, c, d, e, f, g, hh] = h;
  const i = 1;

  const A = e * i - f * hh;
  const B = -(b * i - c * hh);
  const C = b * f - c * e;
  const D = -(d * i - f * g);
  const E = a * i - c * g;
  const F = -(a * f - c * d);
  const G = d * hh - e * g;
  const H = -(a * hh - b * g);
  const I = a * e - b * d;

  const det = a * A + b * D + c * G;
  if (Math.abs(det) < 1e-12) {
    throw new Error("Homography matrix is singular (determinant near zero)");
  }

  if (Math.abs(I) < 1e-12) {
    throw new Error("Homography inverse (3,3) element is near zero");
  }

  return [
    A / I, B / I, C / I,
    D / I, E / I, F / I,
    G / I, H / I,
  ];
}

function applyHomography(h: number[], x: number, y: number): Point {
  const w = h[6] * x + h[7] * y + 1;
  if (Math.abs(w) < 1e-10) {
    return { x: -1, y: -1 };
  }
  return {
    x: (h[0] * x + h[1] * y + h[2]) / w,
    y: (h[3] * x + h[4] * y + h[5]) / w,
  };
}

function isPointInQuad(p: Point, quad: Point[]): boolean {
  let crossings = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    if ((a.y <= p.y && b.y > p.y) || (b.y <= p.y && a.y > p.y)) {
      const t = (p.y - a.y) / (b.y - a.y);
      if (p.x < a.x + t * (b.x - a.x)) {
        crossings++;
      }
    }
  }
  return crossings % 2 === 1;
}

function bilinearSample(
  pixels: Buffer,
  width: number,
  height: number,
  channels: number,
  x: number,
  y: number,
): number[] {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);

  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) {
    return new Array(channels).fill(0);
  }

  const fx = x - x0;
  const fy = y - y0;

  const result: number[] = [];
  for (let c = 0; c < channels; c++) {
    const p00 = pixels[(y0 * width + x0) * channels + c];
    const p10 = pixels[(y0 * width + x1) * channels + c];
    const p01 = pixels[(y1 * width + x0) * channels + c];
    const p11 = pixels[(y1 * width + x1) * channels + c];

    const top = p00 + (p10 - p00) * fx;
    const bottom = p01 + (p11 - p01) * fx;
    result.push(top + (bottom - top) * fy);
  }
  return result;
}

export interface CompositeResult {
  result: Buffer;
  flatCanvas?: Buffer;
}

export async function compositeWithPerspective(
  templateBuffer: Buffer,
  artworkBuffer: Buffer,
  dstCorners: Point[],
  options: PerspectiveOptions = { blendMode: "multiply", blendOpacity: 0.8 },
  returnFlatCanvas: boolean = false,
): Promise<CompositeResult> {
  const validation = validateQuadrilateral(dstCorners);
  if (!validation.valid) {
    throw new Error(`Invalid zone corners: ${validation.error}`);
  }

  const templateMeta = await sharp(templateBuffer).metadata();
  const artworkMeta = await sharp(artworkBuffer).metadata();

  const tW = templateMeta.width!;
  const tH = templateMeta.height!;
  const aW = artworkMeta.width!;
  const aH = artworkMeta.height!;

  const topEdge = Math.sqrt((dstCorners[1].x - dstCorners[0].x) ** 2 + (dstCorners[1].y - dstCorners[0].y) ** 2);
  const bottomEdge = Math.sqrt((dstCorners[2].x - dstCorners[3].x) ** 2 + (dstCorners[2].y - dstCorners[3].y) ** 2);
  const leftEdge = Math.sqrt((dstCorners[3].x - dstCorners[0].x) ** 2 + (dstCorners[3].y - dstCorners[0].y) ** 2);
  const rightEdge = Math.sqrt((dstCorners[2].x - dstCorners[1].x) ** 2 + (dstCorners[2].y - dstCorners[1].y) ** 2);
  const zoneW = (topEdge + bottomEdge) / 2;
  const zoneH = (leftEdge + rightEdge) / 2;
  const zoneAspect = zoneW / zoneH;
  const artAspect = aW / aH;

  const maxArtworkDim = 1200;
  let canvasW: number, canvasH: number;
  if (artAspect > zoneAspect) {
    canvasH = Math.min(aH, maxArtworkDim);
    canvasW = Math.round(canvasH * zoneAspect);
  } else if (artAspect < zoneAspect) {
    canvasW = Math.min(aW, maxArtworkDim);
    canvasH = Math.round(canvasW / zoneAspect);
  } else {
    canvasW = Math.min(aW, maxArtworkDim);
    canvasH = Math.min(aH, maxArtworkDim);
  }

  const scaleToCover = Math.max(canvasW / aW, canvasH / aH);
  const coverW = Math.round(aW * scaleToCover);
  const coverH = Math.round(aH * scaleToCover);

  const artworkResized = await sharp(artworkBuffer)
    .resize(coverW, coverH, { fit: "fill" })
    .toBuffer();

  const cropLeft = Math.round((coverW - canvasW) / 2);
  const cropTop = Math.round((coverH - canvasH) / 2);

  const artworkForProcessing = await sharp(artworkResized)
    .extract({ left: cropLeft, top: cropTop, width: canvasW, height: canvasH })
    .png()
    .toBuffer();

  console.log(`[Perspective] Artwork ${aW}x${aH} (${artAspect.toFixed(3)}) → canvas ${canvasW}x${canvasH} (zone ${zoneAspect.toFixed(3)}), cover ${coverW}x${coverH}, crop ${cropLeft},${cropTop}`);

  let flatCanvasBuffer: Buffer | undefined;
  if (returnFlatCanvas) {
    flatCanvasBuffer = await sharp(artworkForProcessing)
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  const scaledAW = canvasW;
  const scaledAH = canvasH;

  const srcCorners: Point[] = [
    { x: 0, y: 0 },
    { x: scaledAW - 1, y: 0 },
    { x: scaledAW - 1, y: scaledAH - 1 },
    { x: 0, y: scaledAH - 1 },
  ];

  const H = solveHomography(srcCorners, dstCorners);
  const Hinv = invertHomography(H);


  const templatePixels = await sharp(templateBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer();

  const artworkPixels = await sharp(artworkForProcessing)
    .ensureAlpha()
    .raw()
    .toBuffer();

  const output = Buffer.from(templatePixels);

  const minX = Math.max(0, Math.floor(Math.min(...dstCorners.map(p => p.x))));
  const maxX = Math.min(tW - 1, Math.ceil(Math.max(...dstCorners.map(p => p.x))));
  const minY = Math.max(0, Math.floor(Math.min(...dstCorners.map(p => p.y))));
  const maxY = Math.min(tH - 1, Math.ceil(Math.max(...dstCorners.map(p => p.y))));

  const channels = 4;
  const blendOpacity = options.blendOpacity;
  const isMultiply = options.blendMode === "multiply";

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!isPointInQuad({ x, y }, dstCorners)) continue;

      const srcPoint = applyHomography(Hinv, x, y);

      const sx = Math.max(0, Math.min(srcPoint.x, scaledAW - 1));
      const sy = Math.max(0, Math.min(srcPoint.y, scaledAH - 1));

      const artSample = bilinearSample(artworkPixels, scaledAW, scaledAH, channels, sx, sy);
      const idx = (y * tW + x) * channels;

      const tR = output[idx];
      const tG = output[idx + 1];
      const tB = output[idx + 2];

      let rR: number, rG: number, rB: number;

      if (isMultiply) {
        rR = (tR * artSample[0]) / 255;
        rG = (tG * artSample[1]) / 255;
        rB = (tB * artSample[2]) / 255;
      } else {
        rR = artSample[0];
        rG = artSample[1];
        rB = artSample[2];
      }

      output[idx] = Math.round(tR + (rR - tR) * blendOpacity);
      output[idx + 1] = Math.round(tG + (rG - tG) * blendOpacity);
      output[idx + 2] = Math.round(tB + (rB - tB) * blendOpacity);
      output[idx + 3] = 255;
    }
  }

  const resultBuffer = await sharp(output, {
    raw: {
      width: tW,
      height: tH,
      channels: channels,
    },
  })
    .jpeg({ quality: 92 })
    .toBuffer();

  return { result: resultBuffer, flatCanvas: flatCanvasBuffer };
}
