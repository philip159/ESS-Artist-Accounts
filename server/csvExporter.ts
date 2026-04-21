import { createObjectCsvWriter } from "csv-writer";
import type { Artwork } from "@shared/schema";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

export interface MatrixifyRow {
  Handle: string;
  Title: string;
  "Body HTML": string;
  Vendor: string;
  "Product Category": string;
  Type: string;
  Tags: string;
  Published: string;
  "Option1 Name": string;
  "Option1 Value": string;
  "Variant SKU": string;
  "Variant Inventory Qty": string;
  "Variant Price": string;
  "Image Src": string;
  "Image Position": string;
  "Image Alt Text": string;
  "Metafield: custom.dpi": string;
  "Metafield: custom.aspect_ratio": string;
  "Metafield: custom.max_print_size": string;
}

export async function generateMatrixifyCSV(artworks: Artwork[]): Promise<string> {
  const csvPath = join(tmpdir(), `matrixify-${randomUUID()}.csv`);
  
  const csvWriter = createObjectCsvWriter({
    path: csvPath,
    header: [
      { id: "Handle", title: "Handle" },
      { id: "Title", title: "Title" },
      { id: "BodyHTML", title: "Body HTML" },
      { id: "Vendor", title: "Vendor" },
      { id: "ProductCategory", title: "Product Category" },
      { id: "Type", title: "Type" },
      { id: "Tags", title: "Tags" },
      { id: "Published", title: "Published" },
      { id: "Option1Name", title: "Option1 Name" },
      { id: "Option1Value", title: "Option1 Value" },
      { id: "VariantSKU", title: "Variant SKU" },
      { id: "VariantInventoryQty", title: "Variant Inventory Qty" },
      { id: "VariantPrice", title: "Variant Price" },
      { id: "ImageSrc", title: "Image Src" },
      { id: "ImagePosition", title: "Image Position" },
      { id: "ImageAltText", title: "Image Alt Text" },
      { id: "MetafieldDPI", title: "Metafield: custom.dpi" },
      { id: "MetafieldAspectRatio", title: "Metafield: custom.aspect_ratio" },
      { id: "MetafieldMaxPrintSize", title: "Metafield: custom.max_print_size" },
    ],
  });
  
  const records = artworks.flatMap((artwork) => {
    // Create rows for each available size variant
    return artwork.availableSizes.map((size, index) => ({
      Handle: artwork.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      Title: artwork.title,
      BodyHTML: artwork.description || `High-quality print available in ${artwork.availableSizes.length} sizes.`,
      Vendor: artwork.vendor || "Art Gallery",
      ProductCategory: "Home & Garden > Decor > Artwork",
      Type: "Art Print",
      Tags: artwork.tags?.join(", ") || `${artwork.aspectRatio}, ${artwork.maxPrintSize}`,
      Published: "TRUE",
      Option1Name: "Size",
      Option1Value: size,
      VariantSKU: `${artwork.id}-${size}`,
      VariantInventoryQty: "100",
      VariantPrice: "0.00", // Price should be configured
      ImageSrc: index === 0 ? (artwork.lowResFileUrl || artwork.originalFileUrl) : "",
      ImagePosition: index === 0 ? "1" : "",
      ImageAltText: artwork.title,
      MetafieldDPI: artwork.dpi.toString(),
      MetafieldAspectRatio: artwork.aspectRatio,
      MetafieldMaxPrintSize: artwork.maxPrintSize,
    }));
  });
  
  await csvWriter.writeRecords(records);
  
  return csvPath;
}
