import sharp from "sharp";
import { Artwork, COALayout, COATextElement, COAImageElement } from "@shared/schema";
import { ObjectStorageService } from "./objectStorage";
import { uploadToDropbox, createFolder } from "./dropboxService";
import { readFileSync, existsSync } from "fs";
import path from "path";

const objectStorageService = new ObjectStorageService();

// Landscape A5 at 300 DPI (print quality)
const COA_WIDTH = 2480;
const COA_HEIGHT = 1748;

// Template image path
const TEMPLATE_PATH = "attached_assets/COA_Template_December25_01_1765730884579.jpg";

export interface COAGenerationResult {
  coaUrls: string[];
  coaDropboxPath: string;
}

interface GeneratedCOA {
  buffer: Buffer;
  filename: string;
  editionNumber: number;
}

function sanitizeForFilename(str: string): string {
  return str
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // Only remove filesystem-unsafe chars, preserve Unicode
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function replacePlaceholders(text: string, artwork: Artwork, editionNumber: number): string {
  return text
    .replace(/\{artworkTitle\}/g, artwork.title)
    .replace(/\{artistName\}/g, artwork.artistName)
    .replace(/\{editionNumber\}/g, String(editionNumber))
    .replace(/\{editionSize\}/g, String(artwork.editionSize || 0))
    .replace(/\{year\}/g, String(new Date().getFullYear()))
    .replace(/\{aspectRatio\}/g, artwork.aspectRatio)
    .replace(/\{dimensions\}/g, `${artwork.widthPx} x ${artwork.heightPx}px`);
}

function getTextAnchor(align: "left" | "center" | "right"): "start" | "middle" | "end" {
  switch (align) {
    case "left": return "start";
    case "center": return "middle";
    case "right": return "end";
  }
}

function getTextX(element: COATextElement, canvasWidth: number): number {
  const x = (element.x / 100) * canvasWidth;
  const width = (element.width / 100) * canvasWidth;
  switch (element.textAlign) {
    case "left": return x;
    case "center": return x + width / 2;
    case "right": return x + width;
  }
}

async function renderTextElement(
  element: COATextElement,
  artwork: Artwork,
  editionNumber: number,
  canvasWidth: number,
  canvasHeight: number
): Promise<{ svg: string; visible: boolean }> {
  if (!element.visible) {
    return { svg: "", visible: false };
  }

  const text = replacePlaceholders(element.content, artwork, editionNumber);
  const x = getTextX(element, canvasWidth);
  const y = (element.y / 100) * canvasHeight;
  // Scale factor: frontend editor is 620px wide and displays at fontSize*0.5
  // Backend renders at 2480px, so we need fontSize * 0.5 * (2480/620) = fontSize * 2
  const FONT_SCALE_FACTOR = 2;
  const fontSize = element.fontSize * FONT_SCALE_FACTOR;
  const fontWeight = element.fontWeight;
  const fontStyle = element.fontStyle;
  const letterSpacing = element.letterSpacing * FONT_SCALE_FACTOR;
  const textAnchor = getTextAnchor(element.textAlign);
  const color = element.color;

  const escapedText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // Both Asul and Montserrat are installed in ~/.fonts
  let fontFamily = element.fontFamily;
  if (fontFamily === "Asul") {
    fontFamily = "Asul, Georgia, 'Times New Roman', serif";
  } else if (fontFamily === "Montserrat") {
    fontFamily = "Montserrat, Arial, Helvetica, sans-serif";
  } else {
    fontFamily = `${element.fontFamily}, sans-serif`;
  }

  const svg = `<text 
    x="${x}" 
    y="${y + fontSize}" 
    font-family="${fontFamily}" 
    font-size="${fontSize}px" 
    font-weight="${fontWeight}" 
    font-style="${fontStyle}" 
    letter-spacing="${letterSpacing}px" 
    fill="${color}" 
    text-anchor="${textAnchor}">${escapedText}</text>`;

  return { svg, visible: true };
}

async function loadImageBuffer(imageUrl: string): Promise<Buffer | null> {
  try {
    if (imageUrl.startsWith("data:")) {
      // Handle base64 data URLs (e.g., from signature canvas)
      const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        return Buffer.from(matches[2], 'base64');
      }
      return null;
    } else if (imageUrl.startsWith("/objects/")) {
      return await objectStorageService.downloadFileAsBuffer(imageUrl);
    } else if (imageUrl.startsWith("attached_assets/") || imageUrl.startsWith("./attached_assets/")) {
      const cleanPath = imageUrl.replace(/^\.\//, "");
      return readFileSync(path.resolve(process.cwd(), cleanPath));
    }
    return null;
  } catch (error) {
    console.error(`[COAGenerator] Failed to load image: ${imageUrl}`, error);
    return null;
  }
}

async function renderImageElement(
  element: COAImageElement,
  artwork: Artwork,
  canvasWidth: number,
  canvasHeight: number
): Promise<{ composite: sharp.OverlayOptions | null; visible: boolean }> {
  if (!element.visible) {
    return { composite: null, visible: false };
  }

  let imageBuffer: Buffer | null = null;

  if (element.id === "artworkPreview") {
    if (artwork.lowResFileUrl) {
      imageBuffer = await loadImageBuffer(artwork.lowResFileUrl);
    }
  } else if (element.id === "signature") {
    if (artwork.artistSignatureFileUrl) {
      imageBuffer = await loadImageBuffer(artwork.artistSignatureFileUrl);
    }
  } else if (element.id === "qrCode") {
    if (element.staticImageUrl) {
      imageBuffer = await loadImageBuffer(element.staticImageUrl);
    }
  }

  if (!imageBuffer) {
    return { composite: null, visible: false };
  }

  const boxLeft = Math.round((element.x / 100) * canvasWidth);
  const boxTop = Math.round((element.y / 100) * canvasHeight);
  const boxWidth = Math.round((element.width / 100) * canvasWidth);
  const boxHeight = Math.round((element.height / 100) * canvasHeight);

  try {
    let processedImage = sharp(imageBuffer);

    if (element.objectFit === "contain") {
      processedImage = processedImage.resize(boxWidth, boxHeight, { fit: "inside" });
    } else if (element.objectFit === "cover") {
      processedImage = processedImage.resize(boxWidth, boxHeight, { fit: "cover" });
    } else {
      processedImage = processedImage.resize(boxWidth, boxHeight, { fit: "fill" });
    }

    const resizedBuffer = await processedImage.toBuffer();
    
    // Get actual dimensions of the resized image to center it within the bounding box
    const resizedMeta = await sharp(resizedBuffer).metadata();
    const actualWidth = resizedMeta.width || boxWidth;
    const actualHeight = resizedMeta.height || boxHeight;
    
    // Calculate centered position within the bounding box
    const left = boxLeft + Math.round((boxWidth - actualWidth) / 2);
    const top = boxTop + Math.round((boxHeight - actualHeight) / 2);

    return {
      composite: {
        input: resizedBuffer,
        left,
        top,
      },
      visible: true,
    };
  } catch (error) {
    console.error(`[COAGenerator] Failed to process image element: ${element.id}`, error);
    return { composite: null, visible: false };
  }
}

export function getDefaultLayout(): COALayout {
  // Template-based layout - only dynamic elements that overlay on the template
  // The template already contains: title, certifying statement, labels, QR code, studio name
  // We only need to add: dynamic values and images
  return {
    id: "default",
    name: "East Side Studio COA Layout",
    isDefault: true,
    canvasWidth: COA_WIDTH,
    canvasHeight: COA_HEIGHT,
    backgroundColor: "#ffffff",
    textElements: [
      // Artwork Title value (positioned after "Artwork Title:" label in template)
      {
        id: "artworkTitle",
        label: "Artwork Title",
        content: "{artworkTitle}",
        fontFamily: "Montserrat",
        fontSize: 14,
        fontWeight: 400,
        fontStyle: "normal",
        textAlign: "left",
        letterSpacing: 0,
        lineHeight: 1.4,
        color: "#000000",
        x: 13.5,
        y: 30.5,
        width: 40,
        height: 3,
        visible: true,
      },
      // Artist Name value (positioned after "Artist Name:" label in template)
      {
        id: "artistName",
        label: "Artist Name",
        content: "{artistName}",
        fontFamily: "Montserrat",
        fontSize: 14,
        fontWeight: 400,
        fontStyle: "normal",
        textAlign: "left",
        letterSpacing: 0,
        lineHeight: 1.4,
        color: "#000000",
        x: 13,
        y: 34,
        width: 40,
        height: 3,
        visible: true,
      },
      // Edition number value (positioned after "Edition No." label in template)
      {
        id: "edition",
        label: "Edition",
        content: "{editionNumber}/{editionSize}",
        fontFamily: "Montserrat",
        fontSize: 14,
        fontWeight: 400,
        fontStyle: "normal",
        textAlign: "left",
        letterSpacing: 0,
        lineHeight: 1.4,
        color: "#000000",
        x: 12,
        y: 41,
        width: 20,
        height: 3,
        visible: true,
      },
      // Year Created value (positioned after "Year Created:" label in template)
      {
        id: "year",
        label: "Year Created",
        content: "{year}",
        fontFamily: "Montserrat",
        fontSize: 14,
        fontWeight: 400,
        fontStyle: "normal",
        textAlign: "left",
        letterSpacing: 0,
        lineHeight: 1.4,
        color: "#000000",
        x: 14,
        y: 56,
        width: 15,
        height: 3,
        visible: true,
      },
      // Medium value (positioned after "Medium:" label in template)
      {
        id: "medium",
        label: "Medium",
        content: "Giclée Print on Hahnemühle German Etching (310gsm)",
        fontFamily: "Montserrat",
        fontSize: 14,
        fontWeight: 400,
        fontStyle: "normal",
        textAlign: "left",
        letterSpacing: 0,
        lineHeight: 1.4,
        color: "#000000",
        x: 8,
        y: 52,
        width: 45,
        height: 3,
        visible: true,
      },
    ],
    imageElements: [
      // Artist signature - below "Artist Signature" label
      {
        id: "signature",
        label: "Artist Signature",
        x: 4,
        y: 68,
        width: 25,
        height: 18,
        objectFit: "contain",
        visible: true,
      },
      // Artwork preview - can be positioned where desired (not in original template)
      {
        id: "artworkPreview",
        label: "Artwork Preview",
        x: 55,
        y: 5,
        width: 40,
        height: 45,
        objectFit: "contain",
        visible: false, // Hidden by default since template doesn't have a spot for it
      },
    ],
    qrCodeImageUrl: "attached_assets/verisart-qr-code.jpeg",
    templateImageUrl: TEMPLATE_PATH,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function generateSingleCOA(
  artwork: Artwork,
  editionNumber: number,
  layout?: COALayout
): Promise<GeneratedCOA> {
  const coaLayout = layout || getDefaultLayout();
  
  const canvasWidth = COA_WIDTH;
  const canvasHeight = COA_HEIGHT;

  // Load the template image as the base
  let image: sharp.Sharp;
  
  // Check if layout has a custom template from object storage
  if (coaLayout.templateImageUrl && coaLayout.templateImageUrl.startsWith('/objects/')) {
    console.log(`[COAGenerator] Using custom template from object storage: ${coaLayout.templateImageUrl}`);
    const templateBuffer = await objectStorageService.downloadFileAsBuffer(coaLayout.templateImageUrl);
    if (templateBuffer) {
      image = sharp(templateBuffer).resize(canvasWidth, canvasHeight, { fit: "fill" });
    } else {
      console.log(`[COAGenerator] Failed to load custom template, falling back to default`);
      const templateFullPath = path.resolve(process.cwd(), TEMPLATE_PATH);
      if (existsSync(templateFullPath)) {
        image = sharp(templateFullPath).resize(canvasWidth, canvasHeight, { fit: "fill" });
      } else {
        image = sharp({
          create: {
            width: canvasWidth,
            height: canvasHeight,
            channels: 4,
            background: coaLayout.backgroundColor || "#ffffff",
          },
        });
      }
    }
  } else {
    const templateFullPath = path.resolve(process.cwd(), TEMPLATE_PATH);
    
    if (existsSync(templateFullPath)) {
      console.log(`[COAGenerator] Using template: ${TEMPLATE_PATH}`);
      image = sharp(templateFullPath).resize(canvasWidth, canvasHeight, { fit: "fill" });
    } else {
      console.log(`[COAGenerator] Template not found, using blank canvas`);
      image = sharp({
        create: {
          width: canvasWidth,
          height: canvasHeight,
          channels: 4,
          background: coaLayout.backgroundColor || "#ffffff",
        },
      });
    }
  }

  // Convert to buffer first to allow compositing
  const baseBuffer = await image.toBuffer();
  image = sharp(baseBuffer);

  const textSvgs: string[] = [];
  for (const element of coaLayout.textElements) {
    const result = await renderTextElement(element, artwork, editionNumber, canvasWidth, canvasHeight);
    if (result.visible) {
      textSvgs.push(result.svg);
    }
  }

  const svgText = `<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
    ${textSvgs.join("\n")}
  </svg>`;

  const composites: sharp.OverlayOptions[] = [];

  for (const element of coaLayout.imageElements) {
    const result = await renderImageElement(element, artwork, canvasWidth, canvasHeight);
    if (result.composite) {
      composites.push(result.composite);
    }
  }

  composites.push({
    input: Buffer.from(svgText),
    top: 0,
    left: 0,
  });

  image = image.composite(composites);

  const buffer = await image.jpeg({ quality: 90 }).toBuffer();

  const sanitizedTitle = sanitizeForFilename(artwork.title);
  const filename = `COA_${sanitizedTitle}_${editionNumber}.jpg`;

  return {
    buffer,
    filename,
    editionNumber,
  };
}

export async function generateAllCOAs(
  artwork: Artwork,
  layout?: COALayout
): Promise<GeneratedCOA[]> {
  if (artwork.editionType !== "limited" || !artwork.editionSize) {
    throw new Error("COA generation only available for limited edition artworks");
  }

  const coas: GeneratedCOA[] = [];
  
  for (let i = 1; i <= artwork.editionSize; i++) {
    console.log(`[COAGenerator] Generating COA ${i}/${artwork.editionSize} for "${artwork.title}"`);
    const coa = await generateSingleCOA(artwork, i, layout);
    coas.push(coa);
  }

  return coas;
}

export async function generateAndUploadCOAs(
  artwork: Artwork,
  coaDropboxPath: string,
  layout?: COALayout
): Promise<COAGenerationResult> {
  console.log(`[COAGenerator] Starting COA generation for "${artwork.title}" (${artwork.editionSize} editions)`);

  const coas = await generateAllCOAs(artwork, layout);
  
  const coaUrls: string[] = [];
  let dropboxUploadSuccess = true;
  
  // Create the COAs folder in Dropbox
  try {
    await createFolder(coaDropboxPath);
    console.log(`[COAGenerator] Created Dropbox folder: ${coaDropboxPath}`);
  } catch (error) {
    console.error(`[COAGenerator] Failed to create Dropbox folder:`, error);
    dropboxUploadSuccess = false;
  }

  for (const coa of coas) {
    // Always upload to object storage first
    const objectUrl = await objectStorageService.uploadFile(
      coa.buffer,
      coa.filename,
      "image/jpeg"
    );
    coaUrls.push(objectUrl);
    console.log(`[COAGenerator] Uploaded to object storage: ${coa.filename}`);

    // Upload to Dropbox if folder creation succeeded
    if (dropboxUploadSuccess) {
      try {
        await uploadToDropbox(coa.buffer, coaDropboxPath, coa.filename);
        console.log(`[COAGenerator] Uploaded to Dropbox: ${coa.filename}`);
      } catch (error) {
        console.error(`[COAGenerator] Dropbox upload failed for ${coa.filename}:`, error);
        dropboxUploadSuccess = false;
      }
    }
  }

  console.log(`[COAGenerator] Completed COA generation: ${coaUrls.length} COAs created`);

  return {
    coaUrls,
    coaDropboxPath: dropboxUploadSuccess ? coaDropboxPath : "",
  };
}
