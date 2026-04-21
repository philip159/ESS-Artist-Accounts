import { readPsd } from "ag-psd";
import type { FrameZone } from "@shared/schema";

interface SmartObjectLayer {
  name: string;
  corners?: { x: number; y: number }[];
  bounds: {
    top: number;
    left: number;
    bottom: number;
    right: number;
  };
  blendMode?: string;
  opacity?: number;
}

export interface ParsedPSDData {
  width: number;
  height: number;
  frameZones: Omit<FrameZone, "id" | "supportedSizes">[];
}

const BLEND_MODE_MAP: Record<string, "over" | "multiply"> = {
  "normal": "over",
  "pass through": "over",
  "multiply": "multiply",
  "linear burn": "multiply",
  "color burn": "multiply",
  "darken": "multiply",
  "darker color": "multiply",
};

function mapBlendMode(psdBlendMode: string | undefined): "over" | "multiply" {
  if (!psdBlendMode) return "over";
  const normalized = psdBlendMode.toLowerCase();
  return BLEND_MODE_MAP[normalized] || "over";
}

function isLayerGroup(layer: any): boolean {
  return layer.sectionDivider !== undefined || 
         (layer.children && layer.children.length > 0);
}

function isSmartObjectLayer(layer: any): boolean {
  return layer.placedLayer !== undefined || 
         layer.smartObject !== undefined ||
         (layer.name && layer.name.toLowerCase().includes("smart"));
}

function isTargetLayer(layer: any): boolean {
  if (isLayerGroup(layer)) {
    return false;
  }
  
  if (isSmartObjectLayer(layer)) {
    return true;
  }
  
  const name = (layer.name || "").toLowerCase();
  return name.includes("image") || 
         name.includes("artwork") || 
         name.includes("photo") ||
         name.includes("frame zone") ||
         name === "@design";
}

function extractSmartObjectLayers(layer: any, parentTransform?: number[]): SmartObjectLayer[] {
  const layers: SmartObjectLayer[] = [];
  
  if (isTargetLayer(layer)) {
    let corners: { x: number; y: number }[] | undefined;
    let bounds = {
      top: layer.top || 0,
      left: layer.left || 0,
      bottom: layer.bottom || 0,
      right: layer.right || 0,
    };
    
    if (layer.placedLayer) {
      const pl = layer.placedLayer;
      if (pl.nonAffineTransform && pl.nonAffineTransform.length === 8) {
        const [x1, y1, x2, y2, x3, y3, x4, y4] = pl.nonAffineTransform;
        corners = [
          { x: x1, y: y1 },
          { x: x2, y: y2 },
          { x: x3, y: y3 },
          { x: x4, y: y4 },
        ];
        console.log(`[PSD] Smart object "${layer.name}" using nonAffineTransform corners:`, corners);
      } else if (pl.transform && pl.transform.length === 8) {
        const [x1, y1, x2, y2, x3, y3, x4, y4] = pl.transform;
        corners = [
          { x: x1, y: y1 },
          { x: x2, y: y2 },
          { x: x3, y: y3 },
          { x: x4, y: y4 },
        ];
        console.log(`[PSD] Smart object "${layer.name}" using transform corners (fallback):`, corners);
      }
    }
    
    const hasValidCorners = corners && corners.length === 4;
    const hasValidBounds = !(bounds.top === 0 && bounds.left === 0 && bounds.bottom === 0 && bounds.right === 0);
    
    if (hasValidCorners || hasValidBounds) {
      layers.push({
        name: layer.name || "Unnamed",
        corners,
        bounds,
        blendMode: layer.blendMode,
        opacity: layer.opacity !== undefined ? layer.opacity / 255 : 1,
      });
    }
  }
  
  if (layer.children) {
    for (const child of layer.children) {
      layers.push(...extractSmartObjectLayers(child, layer.transform || parentTransform));
    }
  }
  
  return layers;
}

function cornersToFrameZone(
  smartObj: SmartObjectLayer,
  imageWidth: number,
  imageHeight: number,
  blendMode: "over" | "multiply",
  opacity: number
): Omit<FrameZone, "id" | "supportedSizes"> {
  if (smartObj.corners && smartObj.corners.length === 4) {
    const [tl, tr, br, bl] = smartObj.corners;
    return {
      topLeft: {
        x: (tl.x / imageWidth) * 100,
        y: (tl.y / imageHeight) * 100,
      },
      topRight: {
        x: (tr.x / imageWidth) * 100,
        y: (tr.y / imageHeight) * 100,
      },
      bottomRight: {
        x: (br.x / imageWidth) * 100,
        y: (br.y / imageHeight) * 100,
      },
      bottomLeft: {
        x: (bl.x / imageWidth) * 100,
        y: (bl.y / imageHeight) * 100,
      },
      blendMode,
      blendOpacity: opacity,
    };
  }

  const { bounds } = smartObj;
  return {
    topLeft: {
      x: (bounds.left / imageWidth) * 100,
      y: (bounds.top / imageHeight) * 100,
    },
    topRight: {
      x: (bounds.right / imageWidth) * 100,
      y: (bounds.top / imageHeight) * 100,
    },
    bottomRight: {
      x: (bounds.right / imageWidth) * 100,
      y: (bounds.bottom / imageHeight) * 100,
    },
    bottomLeft: {
      x: (bounds.left / imageWidth) * 100,
      y: (bounds.bottom / imageHeight) * 100,
    },
    blendMode,
    blendOpacity: opacity,
  };
}

export async function parsePSD(buffer: Buffer): Promise<ParsedPSDData> {
  const psd = readPsd(buffer, { 
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true
  });
  
  if (!psd.width || !psd.height) {
    throw new Error("Invalid PSD file: missing dimensions");
  }
  
  console.log('[PSD] Parsed PSD dimensions:', psd.width, 'x', psd.height);
  console.log('[PSD] Number of top-level layers:', psd.children?.length || 0);
  
  function logLayer(layer: any, indent: string = '') {
    console.log(`${indent}Layer:`, {
      name: layer.name,
      hasPlacedLayer: !!layer.placedLayer,
      hasSmartObject: !!layer.smartObject,
      hasSectionDivider: !!layer.sectionDivider,
      hasChildren: !!layer.children,
      childrenCount: layer.children?.length || 0,
      bounds: layer.top !== undefined ? `${layer.left},${layer.top},${layer.right},${layer.bottom}` : 'none',
      placedLayerTransform: layer.placedLayer?.transform,
    });
    if (layer.placedLayer) {
      console.log(`${indent}  PlacedLayer details:`, JSON.stringify(layer.placedLayer, null, 2));
    }
    if (layer.vectorMask) {
      console.log(`${indent}  VectorMask:`, JSON.stringify(layer.vectorMask, null, 2));
    }
    
    if (layer.children) {
      layer.children.forEach((child: any) => {
        logLayer(child, indent + '  ');
      });
    }
  }
  
  if (psd.children) {
    psd.children.forEach((layer, i) => {
      console.log(`[PSD] Top-level layer ${i}:`);
      logLayer(layer, '  ');
    });
  }
  
  const smartObjects: SmartObjectLayer[] = [];
  if (psd.children) {
    for (const layer of psd.children) {
      smartObjects.push(...extractSmartObjectLayers(layer));
    }
  }
  
  console.log('[PSD] Found smart objects:', smartObjects.length);
  smartObjects.forEach((obj, i) => {
    console.log(`[PSD] Smart object ${i}: "${obj.name}"`, 
      obj.corners ? `corners: ${JSON.stringify(obj.corners)}` : `bounds: ${JSON.stringify(obj.bounds)}`
    );
  });
  
  if (smartObjects.length === 0) {
    throw new Error("No smart object layers found in PSD file. Please add smart objects to define frame zones.");
  }
  
  const frameZones = smartObjects.map((smartObj) => {
    const blendMode = mapBlendMode(smartObj.blendMode);
    const opacity = smartObj.opacity !== undefined ? smartObj.opacity : 0.8;
    
    return cornersToFrameZone(
      smartObj,
      psd.width!,
      psd.height!,
      blendMode,
      opacity
    );
  });
  
  return {
    width: psd.width,
    height: psd.height,
    frameZones,
  };
}
