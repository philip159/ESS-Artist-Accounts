# Canvas-Based Frame Rendering Guide

A comprehensive guide for building high-quality, realistic 2D canvas frame preview systems based on proven techniques from the Eastside Studio London frame designer.

## Table of Contents
1. [Core Concepts](#core-concepts)
2. [Canvas Setup & Performance](#canvas-setup--performance)
3. [Dimension Handling](#dimension-handling)
4. [Material Rendering](#material-rendering)
5. [Beveling & Lighting Effects](#beveling--lighting-effects)
6. [Image Transformations](#image-transformations)
7. [High-DPI Display Handling](#high-dpi-display-handling)
8. [Common Pitfalls](#common-pitfalls)
9. [Best Practices Checklist](#best-practices-checklist)

---

## Core Concepts

### Physical Constants

Define these as **global constants** at the top of your schema file. These are critical for accurate dimension calculations:

```typescript
// Frame overlap constants (based on physical specifications)
export const FRAME_OVERLAP_MM = 8;        // Frame rebate overlaps artwork by 8mm per side
export const VISUAL_FRAME_OVERLAP_MM = 5; // Visual overlap for canvas rendering (aesthetic)
export const FRAME_MOUNT_OVERLAP_MM = 8;  // Frame overlaps mount edge by 8mm per side
export const MOUNT_OVERLAP_MM = 5;        // Mount overlaps artwork by 5mm per side
```

**Why this matters:**
- `FRAME_OVERLAP_MM = 8` is the **physical specification** - use for dimension calculations
- `VISUAL_FRAME_OVERLAP_MM = 5` is for **canvas rendering** - creates better visual appearance
- These constants ensure consistency between UI, database, and API submissions

### Dimension Units

**✅ DO:** Use integer millimeters (mm) for ALL dimensions
```typescript
widthMm: z.number().int().min(50).max(2000)
heightMm: z.number().int().min(50).max(2000)
```

**❌ DON'T:** Mix units (cm, inches) in your data model - only convert for display

### Mount Aperture Calculation

Create a **helper function** to ensure consistency:

```typescript
export function getMountAperture(frame: FrameConfig, mount: MountConfig) {
  // First, calculate inner cavity by subtracting frame borders
  const innerWidth = frame.widthMm - (2 * frame.borderWidthMm);
  const innerHeight = frame.heightMm - (2 * frame.borderWidthMm);
  
  // Then subtract mount borders and overlap from inner cavity
  return {
    width: innerWidth - mount.mountBorderLeftMm - mount.mountBorderRightMm - (2 * MOUNT_OVERLAP_MM),
    height: innerHeight - mount.mountBorderTopMm - mount.mountBorderBottomMm - (2 * MOUNT_OVERLAP_MM),
    offsetX: mount.mountBorderLeftMm + MOUNT_OVERLAP_MM,
    offsetY: mount.mountBorderTopMm + MOUNT_OVERLAP_MM,
  };
}
```

**Key principle:** Mount aperture = artwork size - (2 × 5mm overlap) for secure artwork fixing.

---

## Canvas Setup & Performance

### Double Buffering (Critical!)

**✅ DO:** Use an offscreen canvas to prevent flashing and glitching:

```typescript
// Create/reuse offscreen canvas for double buffering
const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

const drawFrame = useCallback(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const dpr = (window.devicePixelRatio || 1) * 2;
  const rect = canvas.getBoundingClientRect();
  
  // Reuse offscreen canvas for double buffering
  const targetWidth = rect.width * dpr;
  const targetHeight = rect.height * dpr;
  
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
  
  // Draw everything to offscreen canvas first
  offscreenCtx.scale(dpr, dpr);
  // ... render frame, mount, image, etc.
  
  // Copy offscreen to visible canvas in one operation
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offscreen, 0, 0);
  }
}, []);
```

**Why:** Without double buffering, you'll see flashing, tearing, and glitches during re-renders.

### Canvas Sizing

**✅ DO:** Handle high-DPI displays with 2× resolution multiplier:

```typescript
const dpr = (window.devicePixelRatio || 1) * 2; // 2x for extra sharpness
const rect = canvas.getBoundingClientRect();

canvas.width = rect.width * dpr;
canvas.height = rect.height * dpr;
canvas.style.width = rect.width + 'px';
canvas.style.height = rect.height + 'px';

ctx.scale(dpr, dpr);
```

**❌ DON'T:** Use just `devicePixelRatio` - multiply by 2 for crisper rendering on standard displays.

---

## Dimension Handling

### Millimeters to Pixels Conversion

**Standard formula:**
```typescript
const pixelSize = (mmSize / 10 / 2.54) * 96 * scale;
```

**Breakdown:**
- `mm / 10` → convert mm to cm
- `/ 2.54` → convert cm to inches
- `* 96` → convert inches to pixels (96 DPI standard)
- `* scale` → apply canvas scaling factor

### Frame Border Calculations

**✅ DO:** Calculate visible border correctly:

```typescript
const visibleBorder = borderWidthMm - FRAME_OVERLAP_MM;
// Example: 23mm face width - 8mm overlap = 15mm visible border

const frameExternalWidth = mountExternalWidth + (2 * visibleBorder);
const frameExternalHeight = mountExternalHeight + (2 * visibleBorder);
```

**Example:**
- Mount external: 320mm × 270mm
- Frame face width: 23mm
- Visible border: 23mm - 8mm = 15mm
- Frame external: 320 + (2 × 15) = **350mm × 300mm**

### Dimension Sync Logic

**❌ DON'T:** Let aperture-sync effects revert dimensions during frame color changes.

**✅ DO:** Implement sync locks:

```typescript
const [isSyncingAperture, setIsSyncingAperture] = useState(false);

// Only sync if not triggered by frame color change
if (!isSyncingAperture) {
  setIsSyncingAperture(true);
  // ... perform sync
  setIsSyncingAperture(false);
}
```

---

## Material Rendering

### Wood Grain Textures

**✅ DO:** Use seamless tiling with proper grain orientation:

```typescript
const drawWoodGrainSide = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number,
  side: 'top' | 'bottom' | 'left' | 'right',
  woodKey: string,
  borderWidth: number
) => {
  const textureImg = woodTextureImages[woodKey];
  if (!textureImg) return;

  // Scale pattern for high-DPR displays
  const dpr = (window.devicePixelRatio || 1) * 2;
  const patternScale = Math.min(2, dpr / 2);
  
  // Different seed offsets for natural variation
  const sideSeeds = { top: 0.3, bottom: 0.7, left: 0.5, right: 0.5 };
  
  if (side === 'top' || side === 'bottom') {
    // Rotate 90° for horizontal grain
    const offsetX = Math.floor((sideSeeds[side] * 1000) % textureImg.width);
    const pattern = ctx.createPattern(textureImg, 'repeat');
    
    if (pattern) {
      const transform = new DOMMatrix()
        .scale(patternScale, patternScale)
        .translate(offsetX / patternScale, 0)
        .rotate(90); // Make vertical grain horizontal
      
      pattern.setTransform(transform);
      ctx.fillStyle = pattern;
      // Draw trapezoid for perspective
      ctx.fill();
    }
  } else {
    // Keep vertical grain for left/right sides
    const offsetY = Math.floor((sideSeeds[side] * 1000) % textureImg.height);
    const pattern = ctx.createPattern(textureImg, 'repeat');
    
    if (pattern) {
      pattern.setTransform(new DOMMatrix()
        .scale(patternScale, patternScale)
        .translate(0, offsetY / patternScale));
      ctx.fillStyle = pattern;
      ctx.fill();
    }
  }
};
```

**Key points:**
- Top/bottom borders: Rotate texture 90° for horizontal grain
- Left/right borders: Keep vertical grain
- Use different seed offsets per side for natural variation
- Scale patterns for high-DPI displays

### Glossy/Lacquer Effects

**✅ DO:** Add gradient overlays for lacquer finishes:

```typescript
if (colorKey === 'blackLacquer') {
  // Top edge highlight
  const topGloss = ctx.createLinearGradient(x, y, x, y + height * 0.3);
  topGloss.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
  topGloss.addColorStop(0.6, 'rgba(255, 255, 255, 0.1)');
  topGloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = topGloss;
  ctx.fill();
  
  // Left edge highlight
  const leftGloss = ctx.createLinearGradient(x, y, x + width * 0.25, y);
  leftGloss.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
  leftGloss.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
  leftGloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = leftGloss;
  ctx.fill();
}
```

---

## Beveling & Lighting Effects

### Mount Bevel

**✅ DO:** Simulate directional lighting with trapezoid shapes:

```typescript
const drawMountBevel = (
  ctx: CanvasRenderingContext2D,
  apertureX: number,
  apertureY: number,
  aperturePixelWidth: number,
  aperturePixelHeight: number,
  bevelDepth: number,
  bevelIntensity: number,
  mountColor: string
) => {
  // Get base RGB from mount color
  const [r, g, b] = hexToRgb(mountColor);
  
  // Top bevel (darkest - simulates shadow from top-left light)
  ctx.beginPath();
  ctx.moveTo(apertureX, apertureY);
  ctx.lineTo(apertureX + aperturePixelWidth, apertureY);
  ctx.lineTo(apertureX + aperturePixelWidth - bevelDepth, apertureY + bevelDepth);
  ctx.lineTo(apertureX + bevelDepth, apertureY + bevelDepth);
  ctx.closePath();
  
  const topDarkR = Math.max(0, r - (60 * bevelIntensity));
  const topDarkG = Math.max(0, g - (60 * bevelIntensity));
  const topDarkB = Math.max(0, b - (60 * bevelIntensity));
  ctx.fillStyle = `rgb(${topDarkR}, ${topDarkG}, ${topDarkB})`;
  ctx.fill();
  
  // Right bevel (lighter)
  ctx.beginPath();
  ctx.moveTo(apertureX + aperturePixelWidth, apertureY);
  ctx.lineTo(apertureX + aperturePixelWidth, apertureY + aperturePixelHeight);
  ctx.lineTo(apertureX + aperturePixelWidth - bevelDepth, apertureY + aperturePixelHeight - bevelDepth);
  ctx.lineTo(apertureX + aperturePixelWidth - bevelDepth, apertureY + bevelDepth);
  ctx.closePath();
  
  const rightLightR = Math.max(0, r - (30 * bevelIntensity));
  const rightLightG = Math.max(0, g - (30 * bevelIntensity));
  const rightLightB = Math.max(0, b - (30 * bevelIntensity));
  ctx.fillStyle = `rgb(${rightLightR}, ${rightLightG}, ${rightLightB})`;
  ctx.fill();
  
  // Bottom bevel (lighter)
  // ... same pattern, reduce RGB by 30 * bevelIntensity
  
  // Left bevel (darkest)
  // ... same pattern, reduce RGB by 60 * bevelIntensity
};
```

**Lighting model:**
- Top & Left: Darkest (simulates shadow)
- Right & Bottom: Lighter (simulates light reflection)
- Default intensity: 0.6 (60%)
- Default depth: 10px

### Frame Lip (Interior Edge)

**✅ DO:** Add subtle 1mm interior lip for visual depth:

```typescript
const drawFrameLip = (
  ctx: CanvasRenderingContext2D,
  frameX: number,
  frameY: number,
  frameWidth: number,
  frameHeight: number,
  borderWidth: number,
  scale: number
) => {
  const lipWidth = (1 / 10 / 2.54) * 96 * scale; // 1mm converted to pixels
  
  const interiorX = frameX + borderWidth;
  const interiorY = frameY + borderWidth;
  const interiorWidth = frameWidth - 2 * borderWidth;
  const interiorHeight = frameHeight - 2 * borderWidth;
  
  // Render with wood texture or solid color
  // Add darkening overlay for depth
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.fillRect(interiorX, interiorY, interiorWidth, lipWidth);
};
```

### Corner Mitre Lines

**✅ DO:** Add subtle diagonal lines at corners:

```typescript
const drawCornerMitreLines = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  width: number, height: number,
  borderWidth: number
) => {
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 0.2; // Very thin
  ctx.lineCap = 'round';
  
  // Top-left corner
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + borderWidth, y + borderWidth);
  ctx.stroke();
  
  // Repeat for other 3 corners...
};
```

---

## Image Transformations

### Crop & Transform Logic

**✅ DO:** Apply transformations in correct order:

```typescript
const drawImage = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  apertureX: number,
  apertureY: number,
  apertureWidth: number,
  apertureHeight: number,
  rotation: number,
  scaleRatio: number,
  flipHorizontal: boolean,
  flipVertical: boolean,
  offsetX: number, // in percentage (0-1)
  offsetY: number  // in percentage (0-1)
) => {
  ctx.save();
  
  // 1. Clip to aperture (prevent image bleeding)
  ctx.beginPath();
  ctx.rect(apertureX, apertureY, apertureWidth, apertureHeight);
  ctx.clip();
  
  // 2. Calculate fit scale (cover aperture)
  const fitScaleX = apertureWidth / img.width;
  const fitScaleY = apertureHeight / img.height;
  const fitScale = Math.max(fitScaleX, fitScaleY); // Cover, not contain
  
  // 3. Apply user's scale ratio
  const finalScale = fitScale * scaleRatio;
  const scaledWidth = img.width * finalScale;
  const scaledHeight = img.height * finalScale;
  
  // 4. Move to aperture center for transformations
  const centerX = apertureX + apertureWidth / 2;
  const centerY = apertureY + apertureHeight / 2;
  ctx.translate(centerX, centerY);
  
  // 5. Apply rotation
  ctx.rotate((rotation * Math.PI) / 180);
  
  // 6. Apply flips
  ctx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
  
  // 7. Apply offset (as percentage of overflow)
  const overflowX = Math.max(0, scaledWidth - apertureWidth);
  const overflowY = Math.max(0, scaledHeight - apertureHeight);
  const pixelOffsetX = offsetX * overflowX;
  const pixelOffsetY = offsetY * overflowY;
  
  // 8. Draw image centered with offset
  ctx.drawImage(
    img,
    -scaledWidth / 2 - pixelOffsetX,
    -scaledHeight / 2 - pixelOffsetY,
    scaledWidth,
    scaledHeight
  );
  
  ctx.restore();
};
```

**Order matters!** Translate → Rotate → Scale → Offset → Draw

---

## High-DPI Display Handling

### Pattern Scaling

**✅ DO:** Scale patterns for high-DPI displays:

```typescript
const dpr = (window.devicePixelRatio || 1) * 2;
const patternScale = Math.min(2, dpr / 2); // Cap at 2x

const pattern = ctx.createPattern(textureImg, 'repeat');
if (pattern) {
  pattern.setTransform(new DOMMatrix().scale(patternScale, patternScale));
  ctx.fillStyle = pattern;
}
```

**❌ DON'T:** Use unscaled patterns - they'll appear pixelated on Retina displays.

### Image Smoothing

**✅ DO:** Enable for uploaded artwork:

```typescript
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
```

**❌ DON'T:** Disable for textures - you'll get sharp pixelation.

---

## Common Pitfalls

### 1. Dimension Calculation Errors

**❌ WRONG:**
```typescript
const innerWidth = frameWidth - borderWidth; // Missing 2× multiplier
```

**✅ CORRECT:**
```typescript
const innerWidth = frameWidth - (2 * borderWidth); // Both sides
```

### 2. Using Wrong Overlap Constant

**❌ WRONG:**
```typescript
const visibleBorder = borderWidthMm - FRAME_MOUNT_OVERLAP_MM; // Wrong constant
```

**✅ CORRECT:**
```typescript
const visibleBorder = borderWidthMm - FRAME_OVERLAP_MM; // 8mm for frames
```

### 3. Forgetting to Restore Canvas State

**❌ WRONG:**
```typescript
ctx.save();
ctx.rotate(45);
// ... draw
// Forgot ctx.restore()!
```

**✅ CORRECT:**
```typescript
ctx.save();
ctx.rotate(45);
// ... draw
ctx.restore(); // Always restore!
```

### 4. Pattern Offset Errors

**❌ WRONG:**
```typescript
const offset = sideSeeds[side] * textureImg.width; // Can exceed bounds
```

**✅ CORRECT:**
```typescript
const offset = Math.floor((sideSeeds[side] * 1000) % textureImg.width); // Modulo ensures bounds
```

### 5. Aperture Clipping

**❌ WRONG:** Drawing image without clipping
```typescript
ctx.drawImage(img, x, y, width, height); // Image bleeds outside aperture
```

**✅ CORRECT:** Always clip to aperture first
```typescript
ctx.save();
ctx.beginPath();
ctx.rect(apertureX, apertureY, apertureWidth, apertureHeight);
ctx.clip();
ctx.drawImage(img, x, y, width, height);
ctx.restore();
```

### 6. Canvas Not Updating

**❌ WRONG:** Forgetting dependencies in `useCallback`
```typescript
const drawFrame = useCallback(() => {
  // Uses frameDesign but not in deps
}, []); // Missing dependency!
```

**✅ CORRECT:** Include all dependencies
```typescript
const drawFrame = useCallback(() => {
  // Uses frameDesign
}, [frameDesign, woodTextures, mountColors]); // All deps
```

---

## Best Practices Checklist

### Setup
- ✅ Use double buffering with offscreen canvas
- ✅ Handle high-DPI displays with 2× resolution multiplier
- ✅ Set canvas width/height AND style.width/style.height
- ✅ Apply `ctx.scale(dpr, dpr)` after setting canvas size

### Dimensions
- ✅ Use integer millimeters for all dimensions
- ✅ Define global overlap constants
- ✅ Create helper functions for aperture calculations
- ✅ Always multiply by 2 for both sides (borders, overlaps)

### Rendering
- ✅ Always call `ctx.save()` and `ctx.restore()` for transformations
- ✅ Scale wood texture patterns for high-DPI
- ✅ Rotate textures 90° for horizontal grain
- ✅ Use different seed offsets for natural variation
- ✅ Clip to aperture before drawing images
- ✅ Apply transformations in correct order (translate → rotate → scale)

### Performance
- ✅ Reuse offscreen canvas (don't recreate every render)
- ✅ Use `useCallback` for draw functions with proper dependencies
- ✅ Load texture images once and cache in refs
- ✅ Guard against zero dimensions during initial layout

### Visual Quality
- ✅ Add beveled edges with directional lighting
- ✅ Draw 1mm interior lip for depth
- ✅ Add subtle corner mitre lines (0.2px width)
- ✅ Apply glossy gradients for lacquer finishes
- ✅ Use `imageSmoothingQuality: 'high'` for uploaded images

### Debugging
- ✅ Log dimension calculations during development
- ✅ Validate dimensions before rendering (check > 0)
- ✅ Show placeholder message for invalid dimensions
- ✅ Clear canvas background with theme-aware color
- ✅ Handle missing texture images gracefully (fallback to solid color)

---

## Summary

The key to realistic canvas frame rendering:

1. **Double buffering** prevents flashing
2. **Integer millimeters** ensure precision
3. **Overlap constants** create accurate dimensions
4. **Proper texture scaling** maintains sharpness on all displays
5. **Beveling with directional lighting** adds realism
6. **Correct transformation order** ensures accurate image positioning
7. **State management** (`save`/`restore`) prevents canvas pollution

Follow these patterns and you'll create a professional-grade frame preview system that rivals the best in the industry.
