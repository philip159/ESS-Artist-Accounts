// Google Sheets integration for product data export
import { getUncachableGoogleSheetClient } from "./googleSheetsClient";
import type { Artwork } from "@shared/schema";

export interface ProductRow {
  title: string;
  description: string;
  vendor: string;
  availableSizes: string;
  aspectRatio: string;
  dpi: number;
  maxPrintSize: string;
  dropboxPath: string;
  lowResUrl: string;
  originalUrl: string;
}

export async function syncToGoogleSheet(
  artworks: Artwork[],
  spreadsheetId?: string
): Promise<string> {
  const sheets = await getUncachableGoogleSheetClient();
  
  // Create or use existing spreadsheet
  let sheetId = spreadsheetId;
  if (!sheetId) {
    const createResponse = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: `Artwork Export - ${new Date().toISOString()}`,
        },
      },
    });
    sheetId = createResponse.data.spreadsheetId!;
  }
  
  // Prepare data
  const headers = [
    "Title",
    "Description",
    "Vendor",
    "Available Sizes",
    "Aspect Ratio",
    "DPI",
    "Max Print Size",
    "Dropbox Path",
    "Low Res URL",
    "Original URL",
  ];
  
  const rows = artworks.map((artwork) => [
    artwork.title,
    artwork.description || "",
    artwork.vendor || "",
    artwork.availableSizes.join(", "),
    artwork.aspectRatio,
    artwork.dpi,
    artwork.maxPrintSize,
    artwork.dropboxPath || "",
    artwork.lowResFileUrl || "",
    artwork.originalFileUrl,
  ]);
  
  const values = [headers, ...rows];
  
  // Write to sheet
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: "Sheet1!A1",
    valueInputOption: "RAW",
    requestBody: {
      values,
    },
  });
  
  return `https://docs.google.com/spreadsheets/d/${sheetId}`;
}
