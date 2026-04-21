import { createObjectCsvWriter } from 'csv-writer';
import type { Artwork, Mockup, VariantConfig, FormSettings } from '@shared/schema';
import { FRAME_OPTIONS, getSizeNameFromCode, PRINT_SIZES } from '@shared/schema';
import path from 'path';
import fs from 'fs/promises';
import { generateArtworkMetadataFromFile, generateImageAltText, type ArtworkMetadata, type MetadataOptions } from './openaiService';
import { ObjectStorageService } from './objectStorage';
import { convertToRawDropboxUrl } from './dropboxService';

interface MatrixifyProduct {
  artwork: Artwork;
  mockups: Mockup[];
  variantConfigs: VariantConfig[];
}

interface MatrixifyRow {
  Handle: string;
  Title: string;
  'Max Size': string;
  'Body (HTML)': string;
  Vendor: string;
  'Product Category': string;
  Type: string;
  Tags: string;
  Published: string;
  'Option1 Name': string;
  'Option1 Value': string;
  'Option1 Linked To': string;
  'Option2 Name': string;
  'Option2 Value': string;
  'Option2 Linked To': string;
  'Option3 Name': string;
  'Option3 Value': string;
  'Option3 Linked To': string;
  'Variant SKU': string;
  'Variant Grams': string;
  'Variant Inventory': string;
  'Variant Inventory Policy': string;
  'Variant Fulfillment Service': string;
  'Variant Price': string;
  'Variant Compare At Price': string;
  'Variant Requires Shipping': string;
  'Variant Taxable': string;
  'Variant Barcode': string;
  'Image Src': string;
  'Image Position': string;
  'Image Alt Text': string;
  'Gift Card': string;
  'Metafield: title_tag [string]': string;
  'Metafield: description_tag [string]': string;
  'Metafield: custom.colour [list.single_line_text_field]': string;
  'Metafield: custom.mood [list.single_line_text_field]': string;
  'Metafield: custom.style [list.single_line_text_field]': string;
  'Metafield: custom.themes [list.single_line_text_field]': string;
  'Metafield: custom.shape [list.single_line_text_field]': string;
  'Metafield: custom.space [list.single_line_text_field]': string;
  'Metafield: custom.artist_name [multi_line_text_field]': string;
  'Metafield: custom.artwork_story [multi_line_text_field]': string;
  'Metafield: custom.exclusivity [single_line_text_field]': string;
  'Metafield: custom.artist [metaobject_reference]': string;
  'Print Specification (product.metafields.custom.print_specification)': string;
  'Variant Image': string;
  'Variant Weight Unit': string;
  'Status': string;
  'Custom Collections': string;
  'Template Suffix': string;
  'Included / United Kingdom': string;
  'Price / United Kingdom': string;
  'Compare At Price / United Kingdom': string;
  'Included / Europe USA & ROW': string;
  'Price / Europe USA & ROW': string;
  'Compare At Price / Europe USA & ROW': string;
  'Included / Canada, AU & NZ': string;
  'Price / Canada, AU & NZ': string;
  'Compare At Price / Canada, AU & NZ': string;
}

interface ProductWithMetadata extends MatrixifyProduct {
  aiMetadata?: ArtworkMetadata;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function generateHandle(artwork: Artwork): string {
  const titleSlug = slugify(artwork.title);
  const artistSlug = slugify(artwork.artistName);
  return `${titleSlug}-${artistSlug}`;
}

function determineShape(artwork: Artwork): string {
  const aspectRatio = artwork.widthPx / artwork.heightPx;
  const tolerance = 0.05; // 5% tolerance for square
  
  if (Math.abs(aspectRatio - 1) < tolerance) {
    return "Square";
  } else if (aspectRatio > 1) {
    return "Landscape";
  } else {
    return "Portrait";
  }
}

// Ratio grouping for size sorting
// Determines which ratio group a size code belongs to
function getRatioGroup(sizeCode: string): string {
  // 3:4 ratio
  if (['6x8', '12x16', '18x24', '24x32', '30x40'].includes(sizeCode)) return '3:4';
  // 2:3 ratio
  if (['8x12', '12x18', '20x30', '24x36'].includes(sizeCode)) return '2:3';
  // A-ratio sizes (√2:1 ratio - ISO paper sizes and inch equivalents combined)
  if (sizeCode.match(/^A\d+$/) || ['20x28', '28x40'].includes(sizeCode)) return 'A-Ratio';
  // 4:5 ratio
  if (['8x10', '11x14', '16x20'].includes(sizeCode)) return '4:5';
  // 1:1 square
  if (['12x12', '16x16', '20x20', '30x30'].includes(sizeCode)) return '1:1';
  return 'Other';
}

// Ratio group order for consistent sorting (3:4 first, then 2:3, then A-Ratio, etc.)
const RATIO_GROUP_ORDER = ['3:4', '2:3', 'A-Ratio', '4:5', '1:1', 'Other'];

// Sort sizes by ratio group first, then by area (smallest to largest) within each group
function sortSizesByRatioAndArea(sizeCodes: string[]): string[] {
  return [...sizeCodes].sort((a, b) => {
    const ratioA = getRatioGroup(a);
    const ratioB = getRatioGroup(b);
    
    // First sort by ratio group order
    const ratioOrderA = RATIO_GROUP_ORDER.indexOf(ratioA);
    const ratioOrderB = RATIO_GROUP_ORDER.indexOf(ratioB);
    
    if (ratioOrderA !== ratioOrderB) {
      return ratioOrderA - ratioOrderB;
    }
    
    // Within same ratio group, sort by area (smallest first)
    const sizeA = PRINT_SIZES.find(s => s.code === a);
    const sizeB = PRINT_SIZES.find(s => s.code === b);
    const areaA = sizeA ? sizeA.widthIn * sizeA.heightIn : 0;
    const areaB = sizeB ? sizeB.widthIn * sizeB.heightIn : 0;
    
    return areaA - areaB;
  });
}

// Calculate edition size split: larger sizes get smaller quantities, smaller sizes get larger quantities
function calculateEditionSizeSplit(totalEdition: number, selectedSizes: string[]): Record<string, number> {
  if (selectedSizes.length === 0) return {};
  if (selectedSizes.length === 1) return { [selectedSizes[0]]: totalEdition };
  
  // Get size areas for sorting (larger area = larger size = fewer prints)
  const sizesWithArea = selectedSizes.map(code => {
    const size = PRINT_SIZES.find(s => s.code === code);
    const area = size ? size.widthIn * size.heightIn : 0;
    return { code, area };
  }).sort((a, b) => b.area - a.area); // Sort largest first
  
  // Create weighted distribution: smallest size gets most prints
  // Use position-based weights: first (largest) = 1, second = 2, etc.
  const weights = sizesWithArea.map((_, index) => index + 1);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  
  // Distribute edition based on weights
  const split: Record<string, number> = {};
  let remaining = totalEdition;
  
  sizesWithArea.forEach((item, index) => {
    if (index === sizesWithArea.length - 1) {
      // Last item gets whatever remains (to ensure exact total)
      split[item.code] = remaining;
    } else {
      const quantity = Math.round((weights[index] / totalWeight) * totalEdition);
      split[item.code] = Math.max(1, quantity); // At least 1 per size
      remaining -= split[item.code];
    }
  });
  
  // Ensure we have at least 1 for each size
  Object.keys(split).forEach(code => {
    if (split[code] < 1) split[code] = 1;
  });
  
  return split;
}

function formatSizeForDisplay(size: string): string {
  // Format sizes to proper display format: 18" x 24"
  // Handle various input formats: "18x24", "18 x 24", "18"x24"", etc.
  const match = size.match(/(\d+)\s*[""]?\s*[x×]\s*(\d+)\s*[""]?/i);
  if (match) {
    return `${match[1]}" x ${match[2]}"`;
  }
  // Return as-is if it doesn't match the pattern (e.g., A4, A3)
  return size;
}

function getEditionSizesText(availableSizes: string[], editionSize: number): string[] {
  if (!availableSizes || availableSizes.length === 0) {
    return [];
  }
  
  // Calculate edition split based on actual edition size
  const editionSplit = calculateEditionSizeSplit(editionSize, availableSizes);
  
  // Sort sizes from smallest to largest by area for display
  const sizesWithArea = availableSizes.map(code => {
    const size = PRINT_SIZES.find(s => s.code === code);
    const area = size ? size.widthIn * size.heightIn : 0;
    return { code, area };
  }).sort((a, b) => a.area - b.area); // Sort smallest first for display
  
  // Generate lines with actual edition quantities
  const lines: string[] = [];
  
  sizesWithArea.forEach(({ code }) => {
    const quantity = editionSplit[code] || 1;
    const formattedSize = formatSizeForDisplay(code);
    lines.push(`- ${formattedSize} - Edition of ${quantity}`);
  });
  
  return lines;
}

function generateLimitedEditionBodyHTML(artwork: Artwork): string {
  const parts: string[] = [];
  
  parts.push(`${artwork.title} by ${artwork.artistName}. A limited edition fine art print on 310gsm Hahnemühle German Etching paper.`);
  parts.push('');
  
  if (artwork.availableSizes && artwork.availableSizes.length > 0 && artwork.editionSize) {
    const lines = getEditionSizesText(artwork.availableSizes, artwork.editionSize);
    parts.push(`Limited edition of ${artwork.editionSize} pieces:`);
    parts.push(...lines);
  }
  
  return parts.join('\n');
}

function generateLimitedEditionPrintSpec(artwork: Artwork): string {
  const parts: string[] = [];
  
  parts.push('Giclée printed on 310gsm Hahnemühle German Etching paper, a beautiful mould-made paper with a soft felt-like textured finish, a favourite for fine art reproductions.');
  parts.push('');
  
  if (artwork.availableSizes && artwork.availableSizes.length > 0 && artwork.editionSize) {
    const lines = getEditionSizesText(artwork.availableSizes, artwork.editionSize);
    parts.push(`Limited edition of ${artwork.editionSize} pieces:`);
    parts.push(...lines);
  }
  
  parts.push('');
  parts.push('Accompanied by a physical certificate of authenticity, which includes the artists signature, edition number and artwork details. You will also be emailed a digital certification from Verisart.');
  
  return parts.join('\n');
}

function generateBodyHTML(artwork: Artwork): string {
  const parts: string[] = [];
  
  // Title and artist
  parts.push(`${artwork.title} by ${artwork.artistName}. A limited edition fine art print on 310gsm Hahnemühle German Etching paper.`);
  parts.push('');
  
  // Available sizes
  if (artwork.availableSizes && artwork.availableSizes.length > 0) {
    parts.push('Limited edition of 35 pieces:');
    artwork.availableSizes.forEach(size => {
      parts.push(`- ${size} - Edition of 35`);
    });
  }
  
  return parts.join('\n');
}

function getConfigForVariant(size: string, frame: string, variantConfigs: VariantConfig[]): VariantConfig | null {
  // First try exact match
  let config = variantConfigs.find(
    vc => vc.printSize === size && vc.frameOption === frame
  );
  
  if (config) return config;
  
  // Try partial/fuzzy match - the variant config might have extra info like "(70cm x 100cm)"
  // Extract just the dimensions from the size string for comparison
  // e.g., '28" x 40"' should match '28" x 40" (70cm x 100cm)'
  config = variantConfigs.find(vc => {
    if (vc.frameOption !== frame) return false;
    
    // Check if the config's printSize starts with the requested size
    if (vc.printSize.startsWith(size)) return true;
    
    // Also check if both contain the same dimension pattern
    const sizeMatch = size.match(/(\d+\.?\d*)"?\s*x\s*(\d+\.?\d*)/i);
    const configMatch = vc.printSize.match(/(\d+\.?\d*)"?\s*x\s*(\d+\.?\d*)/i);
    
    if (sizeMatch && configMatch) {
      const sizeW = parseFloat(sizeMatch[1]);
      const sizeH = parseFloat(sizeMatch[2]);
      const configW = parseFloat(configMatch[1]);
      const configH = parseFloat(configMatch[2]);
      
      // Match if dimensions are the same (within 0.1" tolerance)
      return Math.abs(sizeW - configW) < 0.1 && Math.abs(sizeH - configH) < 0.1;
    }
    
    return false;
  });
  
  return config || null;
}

function getMockupImageUrl(artwork: Artwork, size: string, frame: string, mockups: Mockup[]): string {
  // Find mockup that matches this frame type
  // Note: One mockup per frame type per template - pick any template's mockup for this frame
  // frameType should match: "Unframed", "Black Frame", "White Frame", "Natural Frame"
  // For grouped products, mockups array contains mockups from ALL artworks in the group,
  // so we don't filter by artworkId - just match by frameType
  const mockup = mockups.find(m => 
    m.frameType === frame &&
    !m.isLifestyle // Skip lifestyle images (Lifestyle 1, Lifestyle 2, etc.) for product variants
  );
  
  if (!mockup) {
    console.log(`[CSV Export] No mockup found for artwork ${artwork.id}, frame ${frame}`);
  }
  
  return mockup?.mockupImageUrl || '';
}

export async function generateMatrixifyCSV(
  products: MatrixifyProduct[],
  outputPath: string,
  generateAI: boolean = false,
  settings?: FormSettings,
  baseUrl?: string
): Promise<string> {
  const rows: MatrixifyRow[] = [];

  // Prepare AI metadata options from settings
  const aiOptions: MetadataOptions | undefined = settings ? {
    colourOptions: settings.colourOptions || [],
    moodOptions: settings.moodOptions || [],
    styleOptions: settings.styleOptions || [],
    themeOptions: settings.themeOptions || [],
    bodyHTMLPrompt: settings.aiPrompts?.bodyHTMLPrompt,
    titleTagPrompt: settings.aiPrompts?.titleTagPrompt,
    descriptionTagPrompt: settings.aiPrompts?.descriptionTagPrompt,
  } : undefined;

  // Initialize object storage service for downloading images
  const objectStorageService = new ObjectStorageService();

  // Generate AI metadata for all products if requested
  const productsWithMetadata: ProductWithMetadata[] = [];
  
  for (const product of products) {
    const productWithMeta: ProductWithMetadata = { ...product };
    
    if (generateAI && product.artwork.lowResFileUrl) {
      try {
        console.log(`[AI] Generating metadata for: ${product.artwork.title}`);
        console.log(`[AI] Image URL: ${product.artwork.lowResFileUrl}`);
        
        // Download image from object storage and send as base64
        // This works regardless of deployment environment (dev, prod, custom domains)
        const imageBuffer = await objectStorageService.downloadFileAsBuffer(product.artwork.lowResFileUrl);
        
        console.log(`[AI] Downloaded ${imageBuffer.length} bytes, sending to OpenAI as base64`);
        
        // Send the image buffer directly to OpenAI (it will convert to base64)
        const metadata = await generateArtworkMetadataFromFile(
          imageBuffer,
          product.artwork.title,
          product.artwork.artistName,
          aiOptions
        );
        productWithMeta.aiMetadata = metadata;
        console.log(`[AI] Generated metadata with descriptionTag: ${metadata.descriptionTag ? 'YES' : 'NO'}`);
      } catch (error) {
        console.error(`[AI] Failed to generate metadata for ${product.artwork.title}:`, error);
        // Continue without AI metadata
      }
    }
    
    productsWithMetadata.push(productWithMeta);
  }

  for (const product of productsWithMetadata) {
    const { artwork, mockups, variantConfigs, aiMetadata } = product;
    const handle = generateHandle(artwork);
    // Use limited edition body HTML for limited editions, otherwise use AI or default
    const bodyHTML = artwork.editionType === "limited" 
      ? generateLimitedEditionBodyHTML(artwork)
      : (aiMetadata?.bodyHTML || generateBodyHTML(artwork));
    
    // Generate print specification for limited editions
    const printSpecification = artwork.editionType === "limited" 
      ? generateLimitedEditionPrintSpec(artwork) 
      : '';
    
    // Build unique image list in correct order: Black, White, Natural, Lifestyle(s), Unframed
    // Each image needs: URL, ALT text, Position
    interface ProductImage {
      url: string;
      altText: string;
      position: number;
      frameType: string;
    }
    
    const productImages: ProductImage[] = [];
    const imageMap = new Map<string, ProductImage>(); // frameType -> image info
    
    // Order of frame types for images: Black, White, Natural, Lifestyle(s), Unframed
    // Note: Limited edition artworks skip framed mockups (only Unframed)
    const imageFrameOrder = ["Black Frame", "White Frame", "Natural Frame"];
    
    // Add frame mockups in order (skip for limited editions)
    // Note: For grouped products, mockups array contains mockups from ALL artworks in the group
    // so we don't filter by artworkId - just match by frameType
    if (artwork.editionType !== "limited") {
      for (const frameType of imageFrameOrder) {
        const mockup = mockups.find(m => m.frameType === frameType && !m.isLifestyle);
        if (mockup) {
          const image: ProductImage = {
            url: convertToRawDropboxUrl(mockup.mockupImageUrl), // Ensure Dropbox URLs are raw
            altText: `${artwork.title} by ${artwork.artistName}, fine art print in ${frameType.toLowerCase()}`,
            position: productImages.length + 1,
            frameType: frameType
          };
          productImages.push(image);
          imageMap.set(frameType, image);
          console.log(`[CSV Export] Mapped ${frameType} -> mockup ${mockup.id}, isLifestyle=${mockup.isLifestyle}`);
        } else {
          // Log when no matching mockup is found for debugging
          const availableFrameTypes = mockups.map(m => `${m.frameType}(lifestyle=${m.isLifestyle})`).join(', ');
          console.log(`[CSV Export] No mockup found for ${frameType} on artwork ${artwork.id}. Available: ${availableFrameTypes}`);
        }
      }
    }
    
    // Add lifestyle images (from any artwork in the group)
    const lifestyleMockups = mockups.filter(m => m.isLifestyle);
    for (const lifestyleMockup of lifestyleMockups) {
      const image: ProductImage = {
        url: convertToRawDropboxUrl(lifestyleMockup.mockupImageUrl), // Ensure Dropbox URLs are raw
        altText: `${artwork.title} by ${artwork.artistName}, fine art print in styled interior`,
        position: productImages.length + 1,
        frameType: lifestyleMockup.frameType // e.g., "Lifestyle 1", "Lifestyle 2"
      };
      productImages.push(image);
    }
    
    // Add Unframed mockup last (from any artwork in the group)
    const unframedMockup = mockups.find(m => m.frameType === "Unframed" && !m.isLifestyle);
    if (unframedMockup) {
      const image: ProductImage = {
        url: convertToRawDropboxUrl(unframedMockup.mockupImageUrl), // Ensure Dropbox URLs are raw
        altText: `${artwork.title} by ${artwork.artistName}, unframed fine art print`,
        position: productImages.length + 1,
        frameType: "Unframed"
      };
      productImages.push(image);
      imageMap.set("Unframed", image);
    }
    
    // Generate SEO-optimized ALT text for each image if AI is enabled
    if (generateAI) {
      console.log(`[AI] Generating ALT text for ${productImages.length} images`);
      for (const image of productImages) {
        try {
          const isLifestyle = image.frameType.startsWith('Lifestyle');
          const altText = await generateImageAltText(
            artwork.title,
            artwork.artistName,
            image.frameType,
            isLifestyle
          );
          image.altText = altText;
        } catch (error) {
          console.error(`[AI] Failed to generate ALT text for ${image.frameType}:`, error);
          // Keep the default altText
        }
      }
    }
    
    const productRows: MatrixifyRow[] = [];
    
    // Sort sizes by ratio group first, then by area (smallest to largest) within each group
    const sortedSizes = sortSizesByRatioAndArea(artwork.availableSizes);
    
    // For each available size (sorted by ratio, then by size)
    for (const sizeCode of sortedSizes) {
      // Convert size code to full format for matching with variant configs
      const fullSizeName = getSizeNameFromCode(sizeCode);
      
      // For each frame option: Unframed, and then the 3 framed colors
      // Note: Limited edition artworks only get "Unframed" option
      // Frame options for product variants
      // Note: "Natural Frame" may also be called "Oak Frame" or "Wood Frame" during import
      const frameOptions = artwork.editionType === "limited" 
        ? ["Unframed"] 
        : ["Unframed", "Black Frame", "White Frame", "Natural Frame"];
      
      for (const frameOption of frameOptions) {
        // Map frame option to config lookup - all frame colors map to "Framed" config
        const configFrameType = frameOption === "Unframed" ? "Unframed" : "Framed";
        const config = getConfigForVariant(fullSizeName, configFrameType, variantConfigs);
        
        // Skip this variant if no config exists
        if (!config) {
          continue;
        }
        
        // Get the variant's mockup image URL for the Variant Image column
        const variantImageInfo = imageMap.get(frameOption);
        const variantImageUrl = variantImageInfo?.url || '';
        
        const isFirstRow = productRows.length === 0;
        
        // Determine if this row should show a unique product image
        const rowIndex = productRows.length;
        const showProductImage = rowIndex < productImages.length;
        const productImage = showProductImage ? productImages[rowIndex] : null;
        
        const row: MatrixifyRow = {
          Handle: handle,
          Title: isFirstRow ? `${artwork.title} - ${artwork.artistName}${artwork.editionType === "limited" ? " - Limited Edition" : ""}` : '',
          'Max Size': isFirstRow ? artwork.maxPrintSize : '',
          'Body (HTML)': isFirstRow ? bodyHTML : '',
          Vendor: isFirstRow ? artwork.artistName : '', // Vendor is always the artist's name
          'Product Category': isFirstRow ? 'Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork' : '',
          Type: isFirstRow ? 'Posters, Prints, & Visual Artwork' : '',
          Tags: isFirstRow ? (artwork.tags || []).join(',') : '',
          Published: isFirstRow ? 'FALSE' : '',
          'Option1 Name': isFirstRow ? 'Size' : '',
          'Option1 Value': fullSizeName,
          'Option1 Linked To': '',
          'Option2 Name': isFirstRow ? 'Frame' : '',
          'Option2 Value': frameOption,
          'Option2 Linked To': '',
          'Option3 Name': '',
          'Option3 Value': '',
          'Option3 Linked To': '',
          'Variant SKU': '',
          'Variant Grams': config.weightGrams.toString(),
          'Variant Inventory': config.inventory.toString(),
          'Variant Inventory Policy': 'continue',
          'Variant Fulfillment Service': 'manual',
          'Variant Price': (artwork.editionType === "limited" && config.limitedEditionPriceGBP 
            ? config.limitedEditionPriceGBP / 100 
            : config.priceGBP / 100).toFixed(2), // Convert pence to pounds
          'Variant Compare At Price': '',
          'Variant Requires Shipping': 'true',
          'Variant Taxable': 'true',
          'Variant Barcode': '',
          'Image Src': productImage?.url || '',
          'Image Position': productImage ? productImage.position.toString() : '',
          'Image Alt Text': productImage?.altText || '',
          'Gift Card': '',
          'Metafield: title_tag [string]': isFirstRow ? (aiMetadata?.titleTag || `${artwork.title} - ${artwork.artistName} | East Side Studio London`) : '',
          'Metafield: description_tag [string]': isFirstRow ? (aiMetadata?.descriptionTag || '') : '',
          'Metafield: custom.colour [list.single_line_text_field]': isFirstRow ? JSON.stringify((product.artwork.colourTags && product.artwork.colourTags.length > 0) ? product.artwork.colourTags : (aiMetadata?.colours || [])) : '',
          'Metafield: custom.mood [list.single_line_text_field]': isFirstRow ? JSON.stringify((product.artwork.moodTags && product.artwork.moodTags.length > 0) ? product.artwork.moodTags : (aiMetadata?.moods || [])) : '',
          'Metafield: custom.style [list.single_line_text_field]': isFirstRow ? JSON.stringify((product.artwork.styleTags && product.artwork.styleTags.length > 0) ? product.artwork.styleTags : (aiMetadata?.styles || [])) : '',
          'Metafield: custom.themes [list.single_line_text_field]': isFirstRow ? JSON.stringify((product.artwork.themeTags && product.artwork.themeTags.length > 0) ? product.artwork.themeTags : (aiMetadata?.themes || [])) : '',
          'Metafield: custom.shape [list.single_line_text_field]': isFirstRow ? JSON.stringify([determineShape(artwork)]) : '',
          'Metafield: custom.space [list.single_line_text_field]': isFirstRow ? JSON.stringify(["Living Room","Kitchen","Office","Hallway","Bedroom","Dining Room","Bathroom"]) : '',
          'Metafield: custom.artist_name [multi_line_text_field]': isFirstRow ? artwork.artistName : '',
          'Metafield: custom.artwork_story [multi_line_text_field]': isFirstRow ? (artwork.artworkStory || '') : '',
          'Metafield: custom.exclusivity [single_line_text_field]': isFirstRow ? (settings?.nonExclusiveArtists?.includes(artwork.artistName) ? '' : 'Exclusive to East Side Studio London') : '',
          'Metafield: custom.artist [metaobject_reference]': isFirstRow ? `artists.${slugify(artwork.artistName)}` : '',
          'Print Specification (product.metafields.custom.print_specification)': isFirstRow ? printSpecification : '',
          'Variant Image': variantImageUrl,
          'Variant Weight Unit': 'g',
          'Status': isFirstRow ? 'draft' : '',
          'Custom Collections': isFirstRow ? 'New Releases, All Prints' : '',
          'Template Suffix': isFirstRow ? (artwork.editionType === "limited" ? 'limitededition-aug25' : 'main-product-template') : '',
          'Included / United Kingdom': 'TRUE',
          'Price / United Kingdom': '',
          'Compare At Price / United Kingdom': '',
          'Included / Europe USA & ROW': 'TRUE',
          'Price / Europe USA & ROW': '',
          'Compare At Price / Europe USA & ROW': '',
          'Included / Canada, AU & NZ': 'TRUE',
          'Price / Canada, AU & NZ': '',
          'Compare At Price / Canada, AU & NZ': '',
        };
        
        productRows.push(row);
      }
    }
    
    // Add all product rows to the main rows array
    rows.push(...productRows);
  }

  // Create CSV writer
  const csvWriter = createObjectCsvWriter({
    path: outputPath,
    header: [
      { id: 'Handle', title: 'Handle' },
      { id: 'Title', title: 'Title' },
      { id: 'Max Size', title: 'Max Size' },
      { id: 'Body (HTML)', title: 'Body (HTML)' },
      { id: 'Vendor', title: 'Vendor' },
      { id: 'Product Category', title: 'Product Category' },
      { id: 'Type', title: 'Type' },
      { id: 'Tags', title: 'Tags' },
      { id: 'Published', title: 'Published' },
      { id: 'Option1 Name', title: 'Option1 Name' },
      { id: 'Option1 Value', title: 'Option1 Value' },
      { id: 'Option1 Linked To', title: 'Option1 Linked To' },
      { id: 'Option2 Name', title: 'Option2 Name' },
      { id: 'Option2 Value', title: 'Option2 Value' },
      { id: 'Option2 Linked To', title: 'Option2 Linked To' },
      { id: 'Option3 Name', title: 'Option3 Name' },
      { id: 'Option3 Value', title: 'Option3 Value' },
      { id: 'Option3 Linked To', title: 'Option3 Linked To' },
      { id: 'Variant SKU', title: 'Variant SKU' },
      { id: 'Variant Grams', title: 'Variant Grams' },
      { id: 'Variant Inventory', title: 'Variant Inventory' },
      { id: 'Variant Inventory Policy', title: 'Variant Inventory Policy' },
      { id: 'Variant Fulfillment Service', title: 'Variant Fulfillment Service' },
      { id: 'Variant Price', title: 'Variant Price' },
      { id: 'Variant Compare At Price', title: 'Variant Compare At Price' },
      { id: 'Variant Requires Shipping', title: 'Variant Requires Shipping' },
      { id: 'Variant Taxable', title: 'Variant Taxable' },
      { id: 'Variant Barcode', title: 'Variant Barcode' },
      { id: 'Image Src', title: 'Image Src' },
      { id: 'Image Position', title: 'Image Position' },
      { id: 'Image Alt Text', title: 'Image Alt Text' },
      { id: 'Gift Card', title: 'Gift Card' },
      { id: 'Metafield: title_tag [string]', title: 'Metafield: title_tag [string]' },
      { id: 'Metafield: description_tag [string]', title: 'Metafield: description_tag [string]' },
      { id: 'Metafield: custom.colour [list.single_line_text_field]', title: 'Metafield: custom.colour [list.single_line_text_field]' },
      { id: 'Metafield: custom.mood [list.single_line_text_field]', title: 'Metafield: custom.mood [list.single_line_text_field]' },
      { id: 'Metafield: custom.style [list.single_line_text_field]', title: 'Metafield: custom.style [list.single_line_text_field]' },
      { id: 'Metafield: custom.themes [list.single_line_text_field]', title: 'Metafield: custom.themes [list.single_line_text_field]' },
      { id: 'Metafield: custom.shape [list.single_line_text_field]', title: 'Metafield: custom.shape [list.single_line_text_field]' },
      { id: 'Metafield: custom.space [list.single_line_text_field]', title: 'Metafield: custom.space [list.single_line_text_field]' },
      { id: 'Metafield: custom.artist_name [multi_line_text_field]', title: 'Metafield: custom.artist_name [multi_line_text_field]' },
      { id: 'Metafield: custom.artwork_story [multi_line_text_field]', title: 'Metafield: custom.artwork_story [multi_line_text_field]' },
      { id: 'Metafield: custom.exclusivity [single_line_text_field]', title: 'Metafield: custom.exclusivity [single_line_text_field]' },
      { id: 'Metafield: custom.artist [metaobject_reference]', title: 'Metafield: custom.artist [metaobject_reference]' },
      { id: 'Print Specification (product.metafields.custom.print_specification)', title: 'Print Specification (product.metafields.custom.print_specification)' },
      { id: 'Variant Image', title: 'Variant Image' },
      { id: 'Variant Weight Unit', title: 'Variant Weight Unit' },
      { id: 'Status', title: 'Status' },
      { id: 'Custom Collections', title: 'Custom Collections' },
      { id: 'Template Suffix', title: 'Template Suffix' },
      { id: 'Included / United Kingdom', title: 'Included / United Kingdom' },
      { id: 'Price / United Kingdom', title: 'Price / United Kingdom' },
      { id: 'Compare At Price / United Kingdom', title: 'Compare At Price / United Kingdom' },
      { id: 'Included / Europe USA & ROW', title: 'Included / Europe USA & ROW' },
      { id: 'Price / Europe USA & ROW', title: 'Price / Europe USA & ROW' },
      { id: 'Compare At Price / Europe USA & ROW', title: 'Compare At Price / Europe USA & ROW' },
      { id: 'Included / Canada, AU & NZ', title: 'Included / Canada, AU & NZ' },
      { id: 'Price / Canada, AU & NZ', title: 'Price / Canada, AU & NZ' },
      { id: 'Compare At Price / Canada, AU & NZ', title: 'Compare At Price / Canada, AU & NZ' },
    ],
  });

  await csvWriter.writeRecords(rows);
  return outputPath;
}
