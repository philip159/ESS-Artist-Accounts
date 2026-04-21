/// <reference lib="webworker" />

interface RenderMessage {
  type: 'init' | 'render' | 'loadTexture';
  canvas?: OffscreenCanvas;
  textureData?: ImageBitmap;
  params?: RenderParams;
}

interface RenderParams {
  imageBitmap: ImageBitmap;
  layout: LayoutParams;
  activeFrame: 'unframed' | 'black' | 'white' | 'oak';
  shadowOpacity: number;
}

interface LayoutParams {
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
  scaleToFit: number;
  actualImageWidth: number;
  actualImageHeight: number;
  actualImageOffsetX: number;
  actualImageOffsetY: number;
}

let offscreenCanvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let oakTexture: ImageBitmap | null = null;

self.onmessage = async (event: MessageEvent<RenderMessage>) => {
  const { type, canvas, textureData, params } = event.data;

  if (type === 'init' && canvas) {
    offscreenCanvas = canvas;
    ctx = canvas.getContext('2d');
    self.postMessage({ type: 'ready' });
    return;
  }

  if (type === 'loadTexture' && textureData) {
    oakTexture = textureData;
    self.postMessage({ type: 'textureLoaded' });
    return;
  }

  if (type === 'render' && params && offscreenCanvas && ctx) {
    try {
      await renderMockup(params);
      self.postMessage({ type: 'rendered' });
    } catch (error) {
      self.postMessage({ type: 'error', error: String(error) });
    }
  }
};

async function renderMockup(params: RenderParams): Promise<void> {
  if (!offscreenCanvas || !ctx) return;

  const { imageBitmap, layout, activeFrame, shadowOpacity: paramShadowOpacity } = params;
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

  offscreenCanvas.width = targetWidth;
  offscreenCanvas.height = targetHeight;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const getFrameStyle = () => {
    if (activeFrame === "unframed") return null;
    if (activeFrame === "black") return "#000000";
    if (activeFrame === "white") return "#FFFFFF";
    return null;
  };

  const isFramed = activeFrame !== "unframed";
  const artworkX = frameX + finalDisplayFrameWidth;
  const artworkY = frameY + finalDisplayFrameWidth;

  if (isFramed) {
    const frameStyle = getFrameStyle();

    if (frameStyle) {
      ctx.save();
      ctx.shadowColor = `rgba(0, 0, 0, ${shadowOpacity})`;
      ctx.shadowBlur = finalShadowBlur;
      ctx.shadowOffsetX = finalShadowOffset;
      ctx.shadowOffsetY = finalShadowOffset;
      ctx.fillStyle = frameStyle;
      ctx.fillRect(frameX, frameY, finalFrameWidth, finalFrameHeight);
      ctx.restore();

      ctx.fillStyle = frameStyle;
      ctx.fillRect(frameX, frameY, finalFrameWidth, finalFrameHeight);
    } else if (oakTexture) {
      ctx.save();
      ctx.shadowColor = `rgba(0, 0, 0, ${shadowOpacity})`;
      ctx.shadowBlur = finalShadowBlur;
      ctx.shadowOffsetX = finalShadowOffset;
      ctx.shadowOffsetY = finalShadowOffset;
      ctx.fillStyle = "#8B7355";
      ctx.fillRect(frameX, frameY, finalFrameWidth, finalFrameHeight);
      ctx.restore();

      const textureHeightPx = 75;
      const scale = finalDisplayFrameWidth / textureHeightPx;
      const pattern = ctx.createPattern(oakTexture, 'repeat');

      if (pattern) {
        const interiorX = frameX + finalDisplayFrameWidth;
        const interiorY = frameY + finalDisplayFrameWidth;

        const drawTrapezoid = (points: [number, number][], rotationAngle: number) => {
          ctx!.save();
          ctx!.beginPath();
          ctx!.moveTo(points[0][0], points[0][1]);
          for (let i = 1; i < points.length; i++) {
            ctx!.lineTo(points[i][0], points[i][1]);
          }
          ctx!.closePath();

          const centerX = points.reduce((sum, p) => sum + p[0], 0) / points.length;
          const centerY = points.reduce((sum, p) => sum + p[1], 0) / points.length;

          const transform = new DOMMatrix()
            .translate(centerX, centerY)
            .rotate(rotationAngle)
            .scale(scale, scale)
            .translate(-centerX, -centerY);

          pattern.setTransform(transform);
          ctx!.fillStyle = pattern;
          ctx!.fill();
          ctx!.restore();
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
    }

    const lipWidth = Math.max(1, 2 * scaleToFit);
    const interiorX = frameX + finalDisplayFrameWidth;
    const interiorY = frameY + finalDisplayFrameWidth;

    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(interiorX, interiorY, finalArtworkWidth, lipWidth);
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(interiorX, interiorY, lipWidth, finalArtworkHeight);
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(interiorX, interiorY + finalArtworkHeight - lipWidth, finalArtworkWidth, lipWidth);
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.fillRect(interiorX + finalArtworkWidth - lipWidth, interiorY, lipWidth, finalArtworkHeight);

    const mitreLineWidth = Math.max(0.2, 0.12 * scaleToFit);
    const mitreOffset = mitreLineWidth * 0.5;
    ctx.lineWidth = mitreLineWidth;
    ctx.lineCap = "butt";

    const drawBeveledMitre = (x1: number, y1: number, x2: number, y2: number, invertBevel: boolean) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const perpX = (-dy / len) * mitreOffset;
      const perpY = (dx / len) * mitreOffset;

      ctx!.strokeStyle = "rgba(0, 0, 0, 0.6)";
      ctx!.beginPath();
      if (invertBevel) {
        ctx!.moveTo(x1 + perpX, y1 + perpY);
        ctx!.lineTo(x2 + perpX, y2 + perpY);
      } else {
        ctx!.moveTo(x1 - perpX, y1 - perpY);
        ctx!.lineTo(x2 - perpX, y2 - perpY);
      }
      ctx!.stroke();

      ctx!.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx!.beginPath();
      if (invertBevel) {
        ctx!.moveTo(x1 - perpX, y1 - perpY);
        ctx!.lineTo(x2 - perpX, y2 - perpY);
      } else {
        ctx!.moveTo(x1 + perpX, y1 + perpY);
        ctx!.lineTo(x2 + perpX, y2 + perpY);
      }
      ctx!.stroke();
    };

    drawBeveledMitre(frameX, frameY, interiorX, interiorY, false);
    drawBeveledMitre(frameX + finalFrameWidth, frameY, interiorX + finalArtworkWidth, interiorY, true);
    drawBeveledMitre(frameX, frameY + finalFrameHeight, interiorX, interiorY + finalArtworkHeight, true);
    drawBeveledMitre(frameX + finalFrameWidth, frameY + finalFrameHeight, interiorX + finalArtworkWidth, interiorY + finalArtworkHeight, false);
  }

  if (imageBitmap) {
    if (!isFramed) {
      ctx.save();
      ctx.shadowColor = `rgba(0, 0, 0, ${shadowOpacity})`;
      ctx.shadowBlur = finalShadowBlur;
      ctx.shadowOffsetX = finalShadowOffset;
      ctx.shadowOffsetY = finalShadowOffset;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(artworkX, artworkY, finalArtworkWidth, finalArtworkHeight);
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(artworkX, artworkY, finalArtworkWidth, finalArtworkHeight);
    ctx.clip();
    ctx.drawImage(
      imageBitmap,
      artworkX + actualImageOffsetX,
      artworkY + actualImageOffsetY,
      actualImageWidth,
      actualImageHeight
    );
    ctx.restore();
  } else {
    ctx.fillStyle = isFramed ? "#f5f5f5" : "#FFFFFF";
    ctx.fillRect(artworkX, artworkY, finalArtworkWidth, finalArtworkHeight);
  }

  if (isFramed) {
    const interiorX = frameX + finalDisplayFrameWidth;
    const interiorY = frameY + finalDisplayFrameWidth;
    const shadowDepth = Math.max(6, 8 * scaleToFit);

    for (let i = 0; i < shadowDepth; i++) {
      const offset = i;
      const opacity = 0.1 * (1 - (i / shadowDepth));

      ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(
        interiorX + offset,
        interiorY + offset,
        finalArtworkWidth - offset * 2,
        finalArtworkHeight - offset * 2
      );
      ctx.stroke();
    }
  }

  if (hasResolutionWarning) {
    const badgeX = frameX + totalFrameWidth - 120;
    const badgeY = frameY + 15;
    const badgeWidth = 110;
    const badgeHeight = 28;

    ctx.fillStyle = "rgba(239, 68, 68, 0.95)";
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 6);
    ctx.fill();

    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("LOW RESOLUTION", badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);
  }
}

export {};
