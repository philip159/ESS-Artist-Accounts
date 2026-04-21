# Frame Rendering with Photographic Wood Textures

## Overview
This document explains how the frame designer renders realistic wooden frames using photographic textures of actual moulding lengths from eFrame. The system supports both front view (2D orthographic) and isometric (3D perspective) rendering using HTML5 Canvas with pattern-based texture mapping.

## Texture Source & Format

### eFrame Moulding Photographs
- **Format**: High-resolution JPG photographs of actual wood moulding lengths
- **Standard Dimensions**: 3145px × 75px (landscape orientation for horizontal grain)
- **Aspect Ratio**: ~42:1 (extremely wide strip)
- **Content**: Continuous photographic capture of wood grain along moulding length
- **URL Pattern**: `https://www.eframe.co.uk/content/images/frames/test/{REFERENCE}.jpg`

### Grain Direction Handling
Wood grain can run in two directions:
- **Horizontal Grain (grainAngle = 90°)**: Texture used as-is (3145×75)
- **Vertical Grain (grainAngle = 0°)**: Texture rotated 90° counter-clockwise (75×3145)

The rotation is applied **before** pattern creation to ensure grain flows correctly along each frame side.

## Front View (2D Orthographic) Rendering

### Rendering Strategy
The front view renders the frame as a traditional 2D rectangle with realistic wood texture applied to each of the four sides (top, right, bottom, left).

### Core Rendering Process

#### 1. Calculate Frame Geometry
```typescript
// Frame consists of 4 rectangles (top, right, bottom, left)
// Each side has:
const faceWidth = frame.face_width_mm; // e.g., 23mm
const visibleBorder = faceWidth - FRAME_MOUNT_OVERLAP_MM; // 23mm - 8mm = 15mm

// Mount dimensions
const mountWidth = design.mountWidth; // e.g., 320mm
const mountHeight = design.mountHeight; // e.g., 270mm

// Frame external dimensions
const frameWidth = mountWidth + (2 * visibleBorder); // 350mm
const frameHeight = mountHeight + (2 * visibleBorder); // 300mm
```

#### 2. Create Canvas Pattern from Texture
```typescript
const img = new Image();
img.src = textureUrl; // eFrame texture URL
img.crossOrigin = 'anonymous';

img.onload = () => {
  // Create repeating pattern from texture
  const pattern = ctx.createPattern(img, 'repeat');
  
  if (pattern) {
    // Pattern is now ready for transformation and rendering
  }
};
```

#### 3. Apply Pattern with Transformation
For each frame side, the pattern needs to be:
- **Scaled** to match physical dimensions and display resolution
- **Rotated** to align grain direction along the frame side
- **Translated** to position correctly

**Example: Top Frame Side**
```typescript
// Save canvas state
ctx.save();

// Calculate scaling factor
// Texture is 3145px representing ~42mm of real wood
const texturePhysicalLength = 3145 / 75; // ~42mm per pixel height
const scaleX = (visibleBorder / texturePhysicalLength) * DPR;
const scaleY = scaleX; // Maintain aspect ratio

// Set pattern transformation
// Pattern transform order: scale → translate → rotate
const transform = new DOMMatrix()
  .scale(scaleX, scaleY)
  .translate(0, 0) // Position adjustment if needed
  .rotate(0); // No rotation for top side (horizontal)

pattern.setTransform(transform);

// Fill the top rectangle with transformed pattern
ctx.fillStyle = pattern;
ctx.fillRect(0, 0, frameWidth * DPR, visibleBorder * DPR);

ctx.restore();
```

#### 4. Rotation for Each Side
Each frame side requires different rotation to ensure grain flows correctly:

| Side   | Rotation | Grain Direction |
|--------|----------|-----------------|
| Top    | 0°       | Left to right   |
| Right  | 90°      | Top to bottom   |
| Bottom | 180°     | Right to left   |
| Left   | 270°     | Bottom to top   |

**Example: Right Side (Vertical)**
```typescript
ctx.save();

// For vertical sides, rotate pattern 90°
const transform = new DOMMatrix()
  .scale(scaleX, scaleY)
  .rotate(90); // Rotate for vertical grain flow

pattern.setTransform(transform);

// Fill right rectangle
const x = frameWidth * DPR - visibleBorder * DPR;
ctx.fillStyle = pattern;
ctx.fillRect(x, 0, visibleBorder * DPR, frameHeight * DPR);

ctx.restore();
```

### Key Technique: Pattern Repeat Mode
Using `'repeat'` mode ensures:
- Texture tiles seamlessly across long frame sides
- No stretching or distortion of wood grain
- Consistent photographic quality throughout

```typescript
const pattern = ctx.createPattern(img, 'repeat'); // ← Critical: 'repeat' not 'no-repeat'
```

## Isometric View (3D Perspective) Rendering

### Additional Complexity
The isometric view renders the frame in 3D perspective, showing:
- Front face (visible frame border)
- Top face (depth of moulding)
- Right face (depth of moulding)

Each face requires texture mapping with perspective correction.

### Isometric Pattern Transformation
For isometric rendering, additional considerations apply:

#### 1. Overscan for Corner Coverage
To prevent gaps at corners due to sub-pixel anti-aliasing and perspective transforms:
```typescript
// Apply 4% overscan to pattern scale
scaleX *= 1.04;
scaleY *= 1.04;
```

#### 2. Transform Order (Critical)
The pattern transformation must follow this exact order:
```typescript
const cx = centerX; // Center of rotation
const cy = centerY;

const transform = new DOMMatrix()
  .scale(scaleX, scaleY)           // 1. Scale first
  .translate(cx, cy)                // 2. Move to rotation center
  .rotate(rotationAngle)            // 3. Rotate
  .translate(-cx, -cy);             // 4. Move back

pattern.setTransform(transform);
```

**Why this order?** 
- Scaling affects the texture's intrinsic size
- Translation to center point establishes rotation pivot
- Rotation happens around the center
- Translation back positions the pattern correctly

#### 3. Perspective Path Rendering
Isometric faces are rendered as trapezoids using `ctx.beginPath()`:

```typescript
// Example: Top face of frame (isometric trapezoid)
ctx.save();
ctx.beginPath();

// Define trapezoid path (4 corner points)
ctx.moveTo(x1, y1);
ctx.lineTo(x2, y2);
ctx.lineTo(x3, y3);
ctx.lineTo(x4, y4);
ctx.closePath();

// Fill with transformed pattern
ctx.fillStyle = pattern;
ctx.fill();

ctx.restore();
```

### Grain Direction in Isometric View
For isometric rendering, grain direction must account for:
- Original texture orientation (horizontal/vertical grain)
- Face orientation (front/top/right)
- Perspective angle (30° isometric projection)

**Vertical Grain Example:**
```typescript
if (grainAngle === 0) { // Vertical grain
  // Texture is pre-rotated to 75×3145 (tall)
  // For top face: rotate pattern by (isoAngle - 90°)
  const rotationAngle = 30 - 90; // -60°
  
  const transform = new DOMMatrix()
    .scale(scaleX * 1.04, scaleY * 1.04) // 4% overscan
    .translate(cx, cy)
    .rotate(rotationAngle)
    .translate(-cx, -cy);
    
  pattern.setTransform(transform);
}
```

## Device Pixel Ratio (DPR) Handling

### High-DPI Display Support
To ensure crisp rendering on Retina/high-DPI displays:

```typescript
const DPR = window.devicePixelRatio || 1;

// Scale canvas internal resolution
canvas.width = displayWidth * DPR;
canvas.height = displayHeight * DPR;

// Scale canvas CSS display size
canvas.style.width = `${displayWidth}px`;
canvas.style.height = `${displayHeight}px`;

// Scale context to match DPR
ctx.scale(DPR, DPR);
```

**All calculations must account for DPR:**
```typescript
// Convert mm to pixels
const pixelsPerMM = scaleFactor; // Base scale factor
const renderWidth = widthMM * pixelsPerMM * DPR;
const renderHeight = heightMM * pixelsPerMM * DPR;
```

## Complete Rendering Pipeline

### Step-by-Step Process

1. **Load Texture Image**
   - Fetch photographic texture from eFrame
   - Wait for image to fully load
   - Handle CORS with `crossOrigin = 'anonymous'`

2. **Create Canvas Pattern**
   - Use `ctx.createPattern(img, 'repeat')`
   - Store pattern reference for transformation

3. **Calculate Physical Scale**
   - Determine texture's physical dimensions (mm)
   - Calculate scale factor: `(desiredMM / texturePhysicalMM) * DPR`

4. **For Each Frame Side:**
   - Save canvas state (`ctx.save()`)
   - Calculate rotation angle based on side and grain direction
   - Create DOMMatrix transform (scale → translate → rotate → translate)
   - Apply transform to pattern (`pattern.setTransform()`)
   - Set fill style (`ctx.fillStyle = pattern`)
   - Draw rectangle or path (`ctx.fillRect()` or `ctx.fill()`)
   - Restore canvas state (`ctx.restore()`)

5. **Render Additional Elements**
   - Mount (if present)
   - Artwork
   - Shadows and highlights
   - Bevel effects

## Common Pitfalls & Solutions

### Problem: Gaps at Corners
**Cause**: Sub-pixel rendering and anti-aliasing
**Solution**: Apply 4% overscan (`scaleX *= 1.04`)

### Problem: Distorted Wood Grain
**Cause**: Incorrect rotation or scale order
**Solution**: Follow exact transform order (scale → translate → rotate → translate)

### Problem: Blurry Textures on Retina Displays
**Cause**: Not accounting for DPR
**Solution**: Multiply all dimensions by DPR

### Problem: Pattern Not Aligning
**Cause**: Using 'no-repeat' instead of 'repeat'
**Solution**: Always use `createPattern(img, 'repeat')`

### Problem: Incorrect Grain Flow
**Cause**: Not rotating texture based on grain direction
**Solution**: Pre-rotate texture 90° for vertical grain before pattern creation

## Performance Considerations

### Optimization Techniques

1. **Cache Pattern Objects**
   ```typescript
   const patternCache = new Map<string, CanvasPattern>();
   
   function getPattern(textureUrl: string) {
     if (patternCache.has(textureUrl)) {
       return patternCache.get(textureUrl);
     }
     // Create and cache new pattern
   }
   ```

2. **Minimize State Changes**
   - Group operations by pattern to reduce `save()`/`restore()` calls
   - Batch similar rendering operations

3. **Use OffscreenCanvas for Complex Frames**
   - Pre-render frame to offscreen canvas
   - Composite onto main canvas
   - Reduces redundant pattern calculations

4. **Lazy Load Textures**
   - Only load textures when frame is visible
   - Unload unused textures to free memory

## Code Example: Complete Front View Rendering

```typescript
async function renderFrontView(
  canvas: HTMLCanvasElement,
  design: Design,
  frame: Frame,
  textureUrl: string
) {
  const ctx = canvas.getContext('2d')!;
  const DPR = window.devicePixelRatio || 1;
  
  // Load texture
  const img = await loadImage(textureUrl);
  const pattern = ctx.createPattern(img, 'repeat')!;
  
  // Calculate dimensions
  const visibleBorder = frame.face_width_mm - 8; // FRAME_MOUNT_OVERLAP_MM
  const frameWidth = design.mountWidth + (2 * visibleBorder);
  const frameHeight = design.mountHeight + (2 * visibleBorder);
  
  // Calculate scale
  const texturePhysicalLength = 3145 / 75; // ~42mm
  const scale = (visibleBorder / texturePhysicalLength) * DPR;
  
  // Render each side
  const sides = [
    { name: 'top', x: 0, y: 0, w: frameWidth, h: visibleBorder, rotation: 0 },
    { name: 'right', x: frameWidth - visibleBorder, y: 0, w: visibleBorder, h: frameHeight, rotation: 90 },
    { name: 'bottom', x: 0, y: frameHeight - visibleBorder, w: frameWidth, h: visibleBorder, rotation: 180 },
    { name: 'left', x: 0, y: 0, w: visibleBorder, h: frameHeight, rotation: 270 }
  ];
  
  for (const side of sides) {
    ctx.save();
    
    // Transform pattern
    const transform = new DOMMatrix()
      .scale(scale, scale)
      .rotate(side.rotation);
    
    pattern.setTransform(transform);
    
    // Render
    ctx.fillStyle = pattern;
    ctx.fillRect(
      side.x * DPR,
      side.y * DPR,
      side.w * DPR,
      side.h * DPR
    );
    
    ctx.restore();
  }
}
```

## Summary

The frame rendering system achieves photorealistic results by:

1. **Using actual wood photographs** from eFrame's moulding database
2. **Pattern-based texture mapping** with `createPattern()` and `'repeat'` mode
3. **Precise mathematical transformations** (scale, rotate, translate) via DOMMatrix
4. **DPR-aware rendering** for crisp display on all devices
5. **Overscan technique** for gap-free corner coverage in isometric views
6. **Grain direction handling** through pre-rotation of texture images

This approach delivers professional-quality frame previews that accurately represent the final physical product customers will receive.
