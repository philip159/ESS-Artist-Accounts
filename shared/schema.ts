import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, json, jsonb, boolean, unique, pgEnum, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

// Artwork submissions from artists
export const artworks = pgTable("artworks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistName: text("artist_name").notNull(),
  artistEmail: text("artist_email").notNull(),
  title: text("title").notNull(),
  comments: text("comments"),
  signature: text("signature"),
  originalFilename: text("original_filename").notNull(),
  originalFileUrl: text("original_file_url").notNull(),
  lowResFileUrl: text("low_res_file_url"),
  dropboxPath: text("dropbox_path"),
  dropboxUploadFailed: boolean("dropbox_upload_failed").notNull().default(false), // Track failed Dropbox uploads for retry
  uploadBatchId: text("upload_batch_id"), // Groups artworks uploaded together
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  
  // Product grouping (for multi-ratio artworks)
  groupId: text("group_id"), // Links artworks that should be one product
  isGroupPrimary: boolean("is_group_primary").notNull().default(false), // Primary artwork in group
  
  // Edition type
  editionType: text("edition_type").notNull().default("open"), // "open" or "limited"
  editionSize: integer("edition_size"), // Number of prints for limited editions (20-150)
  artworkStory: text("artwork_story"), // Story/inspiration behind the artwork (Limited Edition)
  artistSignatureFileUrl: text("artist_signature_file_url"), // Uploaded signature image (Limited Edition)
  coaUrls: json("coa_urls").$type<string[]>(), // Generated COA image URLs for limited editions
  coaDropboxPath: text("coa_dropbox_path"), // Path to COAs folder in Dropbox
  
  // Image metadata
  widthPx: integer("width_px").notNull(),
  heightPx: integer("height_px").notNull(),
  dpi: integer("dpi").notNull(),
  aspectRatio: text("aspect_ratio").notNull(), // e.g., "3:4", "A Ratio", "Square"
  
  // Print size info
  maxPrintSize: text("max_print_size").notNull(), // e.g., "A2 - 16.5 x 23.4"
  calculatedSizes: json("calculated_sizes").$type<string[]>().notNull(), // all sizes calculated from DPI/dimensions
  availableSizes: json("available_sizes").$type<string[]>().notNull(), // user-selected subset of calculatedSizes (min 2)
  
  // Metadata
  description: text("description"),
  vendor: text("vendor"),
  tags: json("tags").$type<string[]>(),
  
  // Artist-applied tags (categorised)
  styleTags: json("style_tags").$type<string[]>(),
  colourTags: json("colour_tags").$type<string[]>(),
  moodTags: json("mood_tags").$type<string[]>(),
  themeTags: json("theme_tags").$type<string[]>(),
  
  // Mount option
  hasMount: boolean("has_mount").notNull().default(false),
  
  // Status tracking
  status: text("status").notNull().default("pending"), // pending, analyzed, mockups_generated, exported
  
  // Artist notification tracking
  artistNotifiedAt: timestamp("artist_notified_at"), // When the artist was notified about this artwork being live
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Frame zone types
export interface FramePoint {
  x: number; // percentage (0-100)
  y: number; // percentage (0-100)
}

export interface FrameZone {
  id: string;
  topLeft: FramePoint;
  topRight: FramePoint;
  bottomRight: FramePoint;
  bottomLeft: FramePoint;
  supportedSizes: string[]; // print sizes this specific zone supports
  blendMode?: "over" | "multiply"; // blend mode for compositing artwork
  blendOpacity?: number; // opacity for blend (0-1), default 1
}

export const KNOWN_RATIOS: { key: string; value: number; labels: string[] }[] = [
  { key: "5:7", value: 5 / 7, labels: ["5:7", "a ratio", "a ratio portrait", "a ratio landscape", "7:5"] },
  { key: "3:4", value: 3 / 4, labels: ["3:4", "4:3"] },
  { key: "2:3", value: 2 / 3, labels: ["2:3", "3:2"] },
  { key: "4:5", value: 4 / 5, labels: ["4:5", "5:4"] },
  { key: "1:1", value: 1, labels: ["1:1", "square"] },
  { key: "11:14", value: 11 / 14, labels: ["11:14", "14:11"] },
];

export function detectZoneRatio(zone: FrameZone, templateWidth?: number, templateHeight?: number): string {
  const tw = templateWidth || 1500;
  const th = templateHeight || 2000;
  const tl = { x: (zone.topLeft.x / 100) * tw, y: (zone.topLeft.y / 100) * th };
  const tr = { x: (zone.topRight.x / 100) * tw, y: (zone.topRight.y / 100) * th };
  const br = { x: (zone.bottomRight.x / 100) * tw, y: (zone.bottomRight.y / 100) * th };
  const bl = { x: (zone.bottomLeft.x / 100) * tw, y: (zone.bottomLeft.y / 100) * th };

  const topEdge = Math.sqrt((tr.x - tl.x) ** 2 + (tr.y - tl.y) ** 2);
  const bottomEdge = Math.sqrt((br.x - bl.x) ** 2 + (br.y - bl.y) ** 2);
  const leftEdge = Math.sqrt((bl.x - tl.x) ** 2 + (bl.y - tl.y) ** 2);
  const rightEdge = Math.sqrt((br.x - tr.x) ** 2 + (br.y - tr.y) ** 2);
  const w = (topEdge + bottomEdge) / 2;
  const h = (leftEdge + rightEdge) / 2;
  const r = Math.min(w, h) / Math.max(w, h);

  for (const ratio of KNOWN_RATIOS) {
    if (Math.abs(r - ratio.value) < 0.02) return ratio.key;
    if (ratio.key === "5:7" && Math.abs(r - 1 / Math.SQRT2) < 0.02) return ratio.key;
  }
  return `${r.toFixed(3)}`;
}

function parseArtworkRatioNumeric(aspectRatio: string): number | null {
  const s = aspectRatio.trim().toLowerCase();
  if (s.includes("square") || s === "1:1") return 1;
  if (s.includes("a ratio") || s.includes("√2")) return 1 / Math.SQRT2;
  const match = s.match(/(\d+):(\d+)/);
  if (match) {
    const a = parseInt(match[1]);
    const b = parseInt(match[2]);
    if (a > 0 && b > 0) return Math.min(a, b) / Math.max(a, b);
  }
  return null;
}

export function artworkMatchesRatio(artworkAspectRatio: string, zoneRatio: string): boolean {
  const knownRatio = KNOWN_RATIOS.find(r => r.key === zoneRatio);
  if (!knownRatio) return false;

  const normalised = artworkAspectRatio.trim().toLowerCase();
  if (knownRatio.labels.some(l => normalised.includes(l))) return true;

  const artNumeric = parseArtworkRatioNumeric(artworkAspectRatio);
  if (artNumeric !== null) {
    return Math.abs(artNumeric - knownRatio.value) < 0.02;
  }
  return false;
}

// Mockup templates (e.g., lifestyle shots with frames)
export const templates = pgTable("templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  templateImageUrl: text("template_image_url").notNull(),
  
  // Frame mapping coordinates
  frameZones: json("frame_zones").$type<FrameZone[]>().notNull(),
  
  // Sizing support (union of all zone supportedSizes)
  supportedSizes: json("supported_sizes").$type<string[]>().notNull(),
  
  artistVendorName: text("artist_vendor_name"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Generated mockups
export const mockups = pgTable("mockups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artworkId: varchar("artwork_id").notNull().references(() => artworks.id, { onDelete: 'cascade' }),
  templateId: varchar("template_id").references(() => templates.id, { onDelete: 'cascade' }),
  
  // One mockup per frame type per template - applies to all print sizes
  // Multiple lifestyle images allowed (numbered: Lifestyle 1, Lifestyle 2, etc.)
  frameType: text("frame_type").notNull().default("Unframed"), // "Unframed", "Black Frame", "White Frame", "Natural Frame", "Lifestyle 1", "Lifestyle 2", etc.
  mockupImageUrl: text("mockup_image_url").notNull(),
  dropboxPath: text("dropbox_path"),
  isLifestyle: boolean("is_lifestyle").notNull().default(false), // true for lifestyle images
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // Ensure one mockup per artwork + frame type combination (template is optional for imported mockups)
  uniqueArtworkFrame: unique().on(table.artworkId, table.frameType),
}));

// Mockup positioning/customization settings per artwork-template combination
export interface MockupPositioning {
  scale: number; // 0.5 to 2.0, default 1.0
  offsetX: number; // percentage offset from center (-50 to 50)
  offsetY: number; // percentage offset from center (-50 to 50)
  rotation: number; // degrees (-15 to 15)
}

export const mockupSettings = pgTable("mockup_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artworkId: varchar("artwork_id").notNull().references(() => artworks.id, { onDelete: 'cascade' }),
  templateId: varchar("template_id").notNull().references(() => templates.id, { onDelete: 'cascade' }),
  zoneId: text("zone_id").notNull(), // Which frame zone in the template
  
  // Positioning controls
  positioning: json("positioning").$type<MockupPositioning>().notNull().default({
    scale: 1.0,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
  }),
  
  // Whether this template is enabled for this artwork
  enabled: boolean("enabled").notNull().default(true),
  
  // Preview image URL (cached for quick display)
  previewUrl: text("preview_url"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // One setting per artwork-template-zone combination
  uniqueArtworkTemplateZone: unique().on(table.artworkId, table.templateId, table.zoneId),
}));

// Pending mockups - unmatched mockups from Dropbox import awaiting manual assignment
export const pendingMockups = pgTable("pending_mockups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Dropbox source info
  dropboxPath: text("dropbox_path").notNull(),
  filename: text("filename").notNull(),
  previewUrl: text("preview_url"), // Cached shared link for preview
  
  // Parsed metadata from filename
  parsedArtworkName: text("parsed_artwork_name"),
  parsedArtistName: text("parsed_artist_name"),
  frameType: text("frame_type").notNull().default("Unframed"),
  isLifestyle: boolean("is_lifestyle").notNull().default(false),
  
  // Status tracking
  status: text("status").notNull().default("unassigned"), // unassigned, assigned, ignored, duplicate
  
  // If assigned, link to created mockup
  assignedArtworkId: varchar("assigned_artwork_id").references(() => artworks.id, { onDelete: 'set null' }),
  assignedMockupId: varchar("assigned_mockup_id").references(() => mockups.id, { onDelete: 'set null' }),
  
  // Best match score from import (for debugging)
  bestMatchScore: integer("best_match_score"),
  bestMatchReason: text("best_match_reason"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Prevent duplicate entries for the same Dropbox path
  uniqueDropboxPath: unique().on(table.dropboxPath),
}));

// Variant configurations for pricing and weight
export const variantConfigs = pgTable("variant_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  printSize: text("print_size").notNull(), // e.g., "A3 - 11.7\" x 16.5\""
  frameOption: text("frame_option").notNull(), // e.g., "Unframed", "Black", "White", "Natural"
  
  priceGBP: integer("price_gbp").notNull(), // price in GBP (pence) for open editions
  limitedEditionPriceGBP: integer("limited_edition_price_gbp"), // price in GBP (pence) for limited editions
  weightGrams: integer("weight_grams").notNull(), // weight in grams
  inventory: integer("inventory").notNull().default(10),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqueSizeFrame: unique().on(table.printSize, table.frameOption),
}));

// Export batches for Shopify/Matrixify
export const exportBatches = pgTable("export_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  csvFileUrl: text("csv_file_url"),
  googleSheetUrl: text("google_sheet_url"),
  
  artworkIds: json("artwork_ids").$type<string[]>().notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Background jobs for long-running tasks
export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // 'mockup_generation', 'ai_metadata', etc.
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  progress: integer("progress").notNull().default(0), // 0-100
  
  // Input data
  artworkIds: json("artwork_ids").$type<string[]>(),
  templateIds: json("template_ids").$type<string[]>(),
  
  // Output data
  result: json("result").$type<{ mockupIds?: string[], error?: string }>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Form copy/text configuration
export interface FormCopy {
  step1Title: string;
  step1Subtitle: string;
  nameLabel: string;
  emailLabel: string;
  nameHelpText: string;
  emailHelpText: string;
  step2Title: string;
  step2Subtitle: string;
  uploadLabel: string;
  uploadHelpText: string;
  titleLabel: string;
  titleHelpText: string;
  commentsLabel: string;
  commentsHelpText: string;
  requirementsLabel: string;
  requirementsHelpText: string;
  step3Title: string;
  signatureStatement: string;
  signatureButtonText: string;
  thankYouTitle: string;
  thankYouSubtitle: string;
  // Print sizes section
  printSizesTitle?: string;
  printSizesHelpText?: string;
  // Signature modal
  signatureModalTitle?: string;
  signatureModalDescription?: string;
  signatureDrawHelpText?: string;
  signatureUploadHelpText?: string;
  signatureTypeHelpText?: string;
}

// Form typography configuration
export interface FormTypography {
  headingFont: string;
  bodyFont: string;
  h1Size: string; // e.g., "36px", "2.25rem"
  h2Size: string;
  h3Size: string;
  h4Size: string;
  bodySize: string;
}

// Form branding configuration
export interface FormBranding {
  primaryColor: string;
  logoUrl: string;
  fieldSpacing: string;
}

export interface AIPrompts {
  bodyHTMLPrompt: string;
  titleTagPrompt: string;
  descriptionTagPrompt: string;
}

// FAQ item for print sizes section
export interface FAQItem {
  question: string;
  answer: string;
}

// FAQs for different edition types
export interface PrintSizeFAQs {
  openEdition: FAQItem[];
  limitedEdition: FAQItem[];
}

// Form settings (singleton - only one row)
export const formSettings = pgTable("form_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  copy: json("copy").$type<FormCopy>().notNull(),
  typography: json("typography").$type<FormTypography>().notNull(),
  branding: json("branding").$type<FormBranding>().notNull(),
  nonExclusiveArtists: json("non_exclusive_artists").$type<string[]>().notNull().default(sql`'[]'::json`),
  
  colourOptions: json("colour_options").$type<string[]>().notNull().default(sql`'[]'::json`),
  moodOptions: json("mood_options").$type<string[]>().notNull().default(sql`'[]'::json`),
  styleOptions: json("style_options").$type<string[]>().notNull().default(sql`'[]'::json`),
  themeOptions: json("theme_options").$type<string[]>().notNull().default(sql`'[]'::json`),
  
  aiPrompts: json("ai_prompts").$type<AIPrompts>().notNull().default(sql`'{}'::json`),
  
  printSizeFAQs: json("print_size_faqs").$type<PrintSizeFAQs>().default(sql`'{"openEdition":[],"limitedEdition":[]}'::json`),
  faqsLastUpdated: timestamp("faqs_last_updated"),
  
  limitedEditionOverview: text("limited_edition_overview").notNull().default("Limited editions are one of the best ways to grow your collection with East Side Studio London. Each edition is capped at a fixed number of prints. Once it sells out, it's retired for good – no reprints. That scarcity makes the work feel more collectable and gives buyers a clear reason to act now. Because these pieces are genuinely limited, they're priced around 150% higher than our open editions. Every edition is produced to our highest spec on 310gsm Hahnemühle German Etching – a richly textured, museum-grade fine art paper that does justice to the work. Released in small quantities, limited editions help you offer something rarer, increase your average selling price, and build momentum around each launch."),
  
  additionalFilesHelperText: text("additional_files_helper_text").notNull().default("Upload alternative versions of this artwork optimized for specific print sizes. This gives you more control over borders and details at different sizes."),
  
  dropboxBasePath: text("dropbox_base_path").notNull().default("/Artist Uploads 2026"),
  
  creatorHeroImageUrl: text("creator_hero_image_url"),
  
  // Creator contract default section content
  creatorContractIntroductionDefault: text("creator_contract_introduction_default").notNull().default("Welcome! We're excited to collaborate with you. This agreement outlines the terms of our partnership and what we'll be creating together."),
  creatorContractContentUsageDefault: text("creator_contract_content_usage_default").notNull().default("In exchange for the agreed fee, you grant East Side Studio London a world-wide, perpetual, royalty-free licence to use, edit and promote the content you create on any platform."),
  creatorContractExclusivityDefault: text("creator_contract_exclusivity_default").notNull().default("We ask for a 30-day exclusivity period following your first post. During this time, please refrain from partnering with competing art and wall decor brands."),
  creatorContractScheduleDefault: text("creator_contract_schedule_default").notNull().default("We require content to be posted within 3 weeks of the delivery date."),
  creatorContractPaymentDefault: text("creator_contract_payment_default").notNull().default("The collaboration fee will be paid within 14 days of your reel going live."),
  
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Insert schemas
export const insertArtworkSchema = createInsertSchema(artworks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  artistName: z.string().min(1, "Artist name is required"),
  artistEmail: z.string().email("Valid email is required"),
  title: z.string().min(1, "Title is required"),
  comments: z.string().optional(),
  signature: z.string().optional(),
  editionType: z.enum(["open", "limited"]).default("open"),
  editionSize: z.number().int().min(20).max(150).optional(),
  artworkStory: z.string().optional(),
  artistSignatureFileUrl: z.string().optional(),
  widthPx: z.number().positive(),
  heightPx: z.number().positive(),
  dpi: z.number().positive(),
});

const framePointSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

const frameZoneSchema = z.object({
  id: z.string(),
  topLeft: framePointSchema,
  topRight: framePointSchema,
  bottomRight: framePointSchema,
  bottomLeft: framePointSchema,
  supportedSizes: z.array(z.string()),
  blendMode: z.enum(["over", "multiply"]).default("multiply").optional(),
  blendOpacity: z.number().min(0).max(1).default(0.8).optional(),
});

export const insertTemplateSchema = createInsertSchema(templates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Template name is required"),
  templateImageUrl: z.string().min(1, "Template image is required"),
  frameZones: z.array(frameZoneSchema).min(1, "At least one frame zone is required"),
  supportedSizes: z.array(z.string()).min(1, "At least one supported size is required"),
});

export const insertMockupSchema = createInsertSchema(mockups).omit({
  id: true,
  createdAt: true,
});

export const insertMockupSettingsSchema = createInsertSchema(mockupSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMockupSettings = z.infer<typeof insertMockupSettingsSchema>;
export type MockupSettings = typeof mockupSettings.$inferSelect;

export const insertPendingMockupSchema = createInsertSchema(pendingMockups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  dropboxPath: z.string().min(1, "Dropbox path is required"),
  filename: z.string().min(1, "Filename is required"),
});

export const insertVariantConfigSchema = createInsertSchema(variantConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  printSize: z.string().min(1, "Print size is required"),
  frameOption: z.string().min(1, "Frame option is required"),
  priceGBP: z.number().int().positive("Price must be positive"),
  limitedEditionPriceGBP: z.number().int().positive("Limited edition price must be positive").nullable().optional(),
  weightGrams: z.number().int().positive("Weight must be positive"),
  inventory: z.number().int().min(0, "Inventory cannot be negative"),
});

export const insertExportBatchSchema = createInsertSchema(exportBatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Batch name is required"),
  artworkIds: z.array(z.string()).min(1, "At least one artwork required"),
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  type: z.string().min(1, "Job type is required"),
  artworkIds: z.array(z.string()).optional(),
  templateIds: z.array(z.string()).optional(),
});

const formCopySchema = z.object({
  step1Title: z.string(),
  step1Subtitle: z.string(),
  nameLabel: z.string(),
  emailLabel: z.string(),
  nameHelpText: z.string(),
  emailHelpText: z.string(),
  step2Title: z.string(),
  step2Subtitle: z.string(),
  uploadLabel: z.string(),
  uploadHelpText: z.string(),
  titleLabel: z.string(),
  titleHelpText: z.string(),
  commentsLabel: z.string(),
  commentsHelpText: z.string(),
  requirementsLabel: z.string(),
  requirementsHelpText: z.string(),
  step3Title: z.string(),
  signatureStatement: z.string(),
  signatureButtonText: z.string(),
  thankYouTitle: z.string(),
  thankYouSubtitle: z.string(),
  printSizesTitle: z.string().optional(),
  printSizesHelpText: z.string().optional(),
  signatureModalTitle: z.string().optional(),
  signatureModalDescription: z.string().optional(),
  signatureDrawHelpText: z.string().optional(),
  signatureUploadHelpText: z.string().optional(),
  signatureTypeHelpText: z.string().optional(),
});

const formTypographySchema = z.object({
  headingFont: z.string(),
  bodyFont: z.string(),
  h1Size: z.string().default("36px"),
  h2Size: z.string().default("30px"),
  h3Size: z.string().default("24px"),
  h4Size: z.string().default("20px"),
  bodySize: z.string().default("16px"),
});

const formBrandingSchema = z.object({
  primaryColor: z.string(),
  logoUrl: z.string(),
  fieldSpacing: z.string(),
});

const aiPromptsSchema = z.object({
  bodyHTMLPrompt: z.string(),
  titleTagPrompt: z.string(),
  descriptionTagPrompt: z.string(),
});

const faqItemSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

const printSizeFAQsSchema = z.object({
  openEdition: z.array(faqItemSchema),
  limitedEdition: z.array(faqItemSchema),
});

export const insertFormSettingsSchema = createInsertSchema(formSettings).omit({
  id: true,
  updatedAt: true,
  faqsLastUpdated: true,
}).extend({
  copy: formCopySchema,
  typography: formTypographySchema,
  branding: formBrandingSchema,
  nonExclusiveArtists: z.array(z.string()),
  colourOptions: z.array(z.string()),
  moodOptions: z.array(z.string()),
  styleOptions: z.array(z.string()),
  themeOptions: z.array(z.string()),
  aiPrompts: aiPromptsSchema,
  printSizeFAQs: printSizeFAQsSchema.optional(),
  dropboxBasePath: z.string().optional(),
  creatorHeroImageUrl: z.string().nullable().optional(),
});

// TypeScript types
export type InsertArtwork = z.infer<typeof insertArtworkSchema>;
export type Artwork = typeof artworks.$inferSelect;

export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Template = typeof templates.$inferSelect;

export type InsertMockup = z.infer<typeof insertMockupSchema>;
export type Mockup = typeof mockups.$inferSelect;

export type InsertPendingMockup = z.infer<typeof insertPendingMockupSchema>;
export type PendingMockup = typeof pendingMockups.$inferSelect;

export type InsertVariantConfig = z.infer<typeof insertVariantConfigSchema>;
export type VariantConfig = typeof variantConfigs.$inferSelect;

export type InsertExportBatch = z.infer<typeof insertExportBatchSchema>;
export type ExportBatch = typeof exportBatches.$inferSelect;

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

export type InsertFormSettings = z.infer<typeof insertFormSettingsSchema>;
export type FormSettings = typeof formSettings.$inferSelect;

// Print size constants
export const PRINT_SIZES = [
  { code: "A4", name: "A4", widthIn: 8.27, heightIn: 11.67 },
  { code: "A3", name: "A3", widthIn: 11.7, heightIn: 16.5 },
  { code: "A2", name: "A2", widthIn: 16.5, heightIn: 23.4 },
  { code: "20x28", name: "20\" x 28\"", widthIn: 20, heightIn: 28 },
  { code: "28x40", name: "28\" x 40\"", widthIn: 28, heightIn: 40 },
  { code: "A1", name: "A1", widthIn: 23.4, heightIn: 33.1 },
  { code: "A0", name: "A0", widthIn: 33.1, heightIn: 46.8 },
  { code: "12x12", name: "12\" x 12\"", widthIn: 12, heightIn: 12 },
  { code: "16x16", name: "16\" x 16\"", widthIn: 16, heightIn: 16 },
  { code: "20x20", name: "20\" x 20\"", widthIn: 20, heightIn: 20 },
  { code: "30x30", name: "30\" x 30\"", widthIn: 30, heightIn: 30 },
  { code: "6x8", name: "6\" x 8\"", widthIn: 6, heightIn: 8 },
  { code: "12x16", name: "12\" x 16\"", widthIn: 12, heightIn: 16 },
  { code: "18x24", name: "18\" x 24\"", widthIn: 18, heightIn: 24 },
  { code: "24x32", name: "24\" x 32\"", widthIn: 24, heightIn: 32 },
  { code: "30x40", name: "30\" x 40\"", widthIn: 30, heightIn: 40 },
  { code: "8x12", name: "8\" x 12\"", widthIn: 8, heightIn: 12 },
  { code: "12x18", name: "12\" x 18\"", widthIn: 12, heightIn: 18 },
  { code: "20x30", name: "20\" x 30\"", widthIn: 20, heightIn: 30 },
  { code: "24x36", name: "24\" x 36\"", widthIn: 24, heightIn: 36 },
  { code: "8x10", name: "8\" x 10\"", widthIn: 8, heightIn: 10 },
  { code: "11x14", name: "11\" x 14\"", widthIn: 11, heightIn: 14 },
  { code: "16x20", name: "16\" x 20\"", widthIn: 16, heightIn: 20 },
  { code: "24x30", name: "24\" x 30\"", widthIn: 24, heightIn: 30 },
  { code: "32x40", name: "32\" x 40\"", widthIn: 32, heightIn: 40 },
] as const;

export const MIN_DPI = 200;

// Frame options for variant configs (simplified to Unframed/Framed for pricing)
export const FRAME_OPTIONS = ["Unframed", "Framed"] as const;

// COA Layout Text Element Configuration
export interface COATextElement {
  id: string; // unique identifier for the element
  label: string; // display name (e.g., "Certificate Title")
  content: string; // actual text content or placeholder like "{artworkTitle}"
  fontFamily: string;
  fontSize: number; // in pixels
  fontWeight: number; // 100-900
  fontStyle: "normal" | "italic";
  textAlign: "left" | "center" | "right";
  letterSpacing: number; // in pixels
  lineHeight: number; // multiplier (e.g., 1.5)
  color: string; // hex color
  // Position and size (percentages relative to canvas)
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

// COA Layout Image Element Configuration (for artwork preview, signature, QR code)
export interface COAImageElement {
  id: string; // "artworkPreview", "signature", "qrCode"
  label: string;
  // Bounding box (percentages relative to canvas)
  x: number;
  y: number;
  width: number;
  height: number;
  // Fit mode
  objectFit: "contain" | "cover" | "fill";
  // Optional cropping (percentages of original image)
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  visible: boolean;
  // For static images like QR code
  staticImageUrl?: string;
}

// COA Layout Settings
export const coaLayouts = pgTable("coa_layouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  
  // Canvas dimensions (in pixels for rendering, aspect ratio maintained)
  canvasWidth: integer("canvas_width").notNull().default(400),
  canvasHeight: integer("canvas_height").notNull().default(600),
  backgroundColor: text("background_color").notNull().default("#ffffff"),
  
  // Text elements configuration
  textElements: json("text_elements").$type<COATextElement[]>().notNull(),
  
  // Image elements configuration (artwork preview, signature, QR code)
  imageElements: json("image_elements").$type<COAImageElement[]>().notNull(),
  
  // Static QR code image URL
  qrCodeImageUrl: text("qr_code_image_url"),
  
  // Custom template image URL (from object storage)
  templateImageUrl: text("template_image_url"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Insert schema for COA layouts
const coaTextElementSchema = z.object({
  id: z.string(),
  label: z.string(),
  content: z.string(),
  fontFamily: z.string(),
  fontSize: z.number().min(6).max(120),
  fontWeight: z.number().min(100).max(900),
  fontStyle: z.enum(["normal", "italic"]),
  textAlign: z.enum(["left", "center", "right"]),
  letterSpacing: z.number().min(-5).max(20),
  lineHeight: z.number().min(0.5).max(3),
  color: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
  visible: z.boolean(),
});

const coaImageElementSchema = z.object({
  id: z.string(),
  label: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
  objectFit: z.enum(["contain", "cover", "fill"]),
  cropX: z.number().min(0).max(100).optional(),
  cropY: z.number().min(0).max(100).optional(),
  cropWidth: z.number().min(0).max(100).optional(),
  cropHeight: z.number().min(0).max(100).optional(),
  visible: z.boolean(),
  staticImageUrl: z.string().optional(),
});

export const insertCOALayoutSchema = createInsertSchema(coaLayouts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Layout name is required"),
  canvasWidth: z.number().int().min(100).max(2000).default(400),
  canvasHeight: z.number().int().min(100).max(3000).default(600),
  backgroundColor: z.string().default("#ffffff"),
  textElements: z.array(coaTextElementSchema),
  imageElements: z.array(coaImageElementSchema),
  qrCodeImageUrl: z.string().optional(),
});

export type InsertCOALayout = z.infer<typeof insertCOALayoutSchema>;
export type COALayout = typeof coaLayouts.$inferSelect;

// User experience feedback from submission form
export const userFeedback = pgTable("user_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rating: text("rating").notNull(), // "positive" or "negative"
  feedback: text("feedback"), // Optional text feedback
  artistName: text("artist_name"), // Optional - for tracking
  artistEmail: text("artist_email"), // Optional - for tracking
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserFeedbackSchema = createInsertSchema(userFeedback).omit({
  id: true,
  createdAt: true,
});

export type InsertUserFeedback = z.infer<typeof insertUserFeedbackSchema>;
export type UserFeedback = typeof userFeedback.$inferSelect;

// Email templates for ReSend
export const emailTemplates = pgTable("email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateKey: text("template_key").notNull().unique(), // "artist_confirmation", "admin_notification", "batch_artist", "batch_admin"
  name: text("name").notNull(), // Display name
  subject: text("subject").notNull(), // Email subject line (can include {{variables}})
  htmlBody: text("html_body").notNull(), // HTML email content (can include {{variables}})
  description: text("description"), // Description of when this template is used
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;

// Specific frame types used in mockups and products
// Note: "Natural Frame" may also be called "Oak Frame" or "Wood Frame" in filenames
export const SPECIFIC_FRAME_TYPES = ["Unframed", "Black Frame", "White Frame", "Natural Frame"] as const;

// Helper function to get full size name from code
export function getSizeNameFromCode(code: string): string {
  const size = PRINT_SIZES.find(s => s.code === code);
  if (!size) return code;
  
  // Format: "A4 - 8.27" x 11.67"" or "6" x 8""
  if (size.code.startsWith('A')) {
    return `${size.code} - ${size.widthIn}" x ${size.heightIn}"`;
  }
  return `${size.widthIn}" x ${size.heightIn}"`;
}

// Helper function to get code from full size name
export function getCodeFromSizeName(name: string): string {
  // Extract code from formats like "A4 - 8.27" x 11.67"" or "6" x 8""
  const aRatioMatch = name.match(/^(A\d+)\s*-/);
  if (aRatioMatch) return aRatioMatch[1];
  
  // For other sizes, try to match by dimensions
  const dimensionMatch = name.match(/(\d+\.?\d*)"?\s*x\s*(\d+\.?\d*)"/);
  if (dimensionMatch) {
    const width = parseFloat(dimensionMatch[1]);
    const height = parseFloat(dimensionMatch[2]);
    const size = PRINT_SIZES.find(s => 
      Math.abs(s.widthIn - width) < 0.1 && Math.abs(s.heightIn - height) < 0.1
    );
    if (size) return size.code;
  }
  
  return name;
}

// ============================================
// Artist Dashboard Tables
// ============================================

// Artist accounts for dashboard login (linked to Shopify vendors)
export const artistAccounts = pgTable("artist_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Vendor name in Shopify (unique identifier for matching)
  vendorName: text("vendor_name").notNull().unique(),
  
  // Artist name fields
  firstName: text("first_name"),
  lastName: text("last_name"),
  artistAlias: text("artist_alias"), // Optional alias/pseudonym
  
  // Replit Auth user ID (set when artist links their account via Replit Auth)
  replitUserId: text("replit_user_id").unique(),
  
  // Supabase Auth user UUID (set on first successful Supabase login or admin invite)
  supabaseUserId: text("supabase_user_id").unique(),
  
  // Contact info
  primaryEmail: text("primary_email"), // Email for login/invitation
  displayName: text("display_name"), // Name shown in dashboard
  
  // Password authentication (for magic link flow)
  passwordHash: text("password_hash"), // bcrypt hash of password
  invitationToken: text("invitation_token"), // Magic link token for onboarding
  invitationExpiresAt: timestamp("invitation_expires_at"), // When token expires
  
  // PayPal payout info
  paypalEmail: text("paypal_email"),
  paypalRecipientName: text("paypal_recipient_name"),
  
  // Commission settings (null = use global defaults)
  useCustomCommission: boolean("use_custom_commission").notNull().default(false),
  commissionRate: integer("commission_rate"), // Percentage (0-100), null = use global
  
  // Account status: pending (imported), invited (email sent), active (password set)
  onboardingStatus: text("onboarding_status").notNull().default("pending"),
  
  // Shopify setup status (metaobject created, collection created, menu items added)
  shopifySetupComplete: boolean("shopify_setup_complete").notNull().default(false),
  shopifyMetaobjectId: text("shopify_metaobject_id"), // GID for artist metaobject
  shopifyCollectionId: text("shopify_collection_id"), // GID for artist collection
  shopifyPhotoFileId: text("shopify_photo_file_id"), // GID for uploaded artist photo file
  
  // Per-step Shopify setup tracking (pending, processing, succeeded, failed)
  shopifyMetaobjectStatus: text("shopify_metaobject_status").notNull().default("pending"),
  shopifyMetaobjectError: text("shopify_metaobject_error"),
  shopifyCollectionStatus: text("shopify_collection_status").notNull().default("pending"),
  shopifyCollectionError: text("shopify_collection_error"),
  shopifyMenusStatus: text("shopify_menus_status").notNull().default("pending"),
  shopifyMenusError: text("shopify_menus_error"),
  
  // Bio and photos from onboarding
  bio: text("bio"),
  photoUrls: json("photo_urls").$type<string[]>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Cached sales data from Shopify (aggregated by vendor)
export const artistSales = pgTable("artist_sales", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  artistAccountId: varchar("artist_account_id").notNull().references(() => artistAccounts.id, { onDelete: 'cascade' }),
  
  // Time period for aggregation
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  
  // Sales metrics
  totalOrders: integer("total_orders").notNull().default(0),
  totalUnits: integer("total_units").notNull().default(0),
  grossRevenue: integer("gross_revenue").notNull().default(0), // In pence
  netRevenue: integer("net_revenue").notNull().default(0), // After deductions, in pence
  
  // Breakdown by product (JSON for flexibility)
  productBreakdown: json("product_breakdown").$type<{
    productId: string;
    productTitle: string;
    units: number;
    revenue: number;
  }[]>(),
  
  // Sync metadata
  lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Insert schemas for artist tables
export const insertArtistAccountSchema = createInsertSchema(artistAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  vendorName: z.string().min(1, "Vendor name is required"),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  artistAlias: z.string().optional().nullable(),
  primaryEmail: z.string().email().optional().nullable(),
  passwordHash: z.string().optional().nullable(),
  invitationToken: z.string().optional().nullable(),
  invitationExpiresAt: z.date().optional().nullable(),
  paypalEmail: z.string().email("Valid PayPal email required").optional().nullable(),
  paypalRecipientName: z.string().optional().nullable(),
  useCustomCommission: z.boolean().default(false),
  commissionRate: z.number().int().min(0).max(100).optional().nullable(),
  onboardingStatus: z.enum(["pending", "invited", "active"]).default("pending"),
  shopifySetupComplete: z.boolean().default(false),
  shopifyMetaobjectId: z.string().optional().nullable(),
  shopifyCollectionId: z.string().optional().nullable(),
  shopifyPhotoFileId: z.string().optional().nullable(),
  shopifyMetaobjectStatus: z.enum(["pending", "processing", "succeeded", "failed"]).default("pending"),
  shopifyMetaobjectError: z.string().optional().nullable(),
  shopifyCollectionStatus: z.enum(["pending", "processing", "succeeded", "failed"]).default("pending"),
  shopifyCollectionError: z.string().optional().nullable(),
  shopifyMenusStatus: z.enum(["pending", "processing", "succeeded", "failed"]).default("pending"),
  shopifyMenusError: z.string().optional().nullable(),
  bio: z.string().optional().nullable(),
  photoUrls: z.array(z.string()).optional().nullable(),
});

export const insertArtistSalesSchema = createInsertSchema(artistSales).omit({
  id: true,
  createdAt: true,
}).extend({
  artistAccountId: z.string().min(1),
  periodStart: z.date(),
  periodEnd: z.date(),
  totalOrders: z.number().int().min(0).default(0),
  totalUnits: z.number().int().min(0).default(0),
  grossRevenue: z.number().int().min(0).default(0),
  netRevenue: z.number().int().min(0).default(0),
});

export type InsertArtistAccount = z.infer<typeof insertArtistAccountSchema>;
export type ArtistAccount = typeof artistAccounts.$inferSelect;

export type InsertArtistSales = z.infer<typeof insertArtistSalesSchema>;
export type ArtistSales = typeof artistSales.$inferSelect;

// Global commission settings (applied to all artists without custom settings)
export const commissionSettings = pgTable("commission_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Default commission rate for new artists
  defaultCommissionRate: integer("default_commission_rate").notNull().default(50), // Percentage (0-100)
  
  // What to calculate commission on
  applyAfterTax: boolean("apply_after_tax").notNull().default(true), // Calculate after tax is deducted
  applyAfterShipping: boolean("apply_after_shipping").notNull().default(true), // Calculate after shipping is deducted
  applyAfterDiscounts: boolean("apply_after_discounts").notNull().default(true), // Calculate after discounts
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCommissionSettingsSchema = createInsertSchema(commissionSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  defaultCommissionRate: z.number().int().min(0).max(100).default(50),
  applyAfterTax: z.boolean().default(true),
  applyAfterShipping: z.boolean().default(true),
  applyAfterDiscounts: z.boolean().default(true),
});

export type InsertCommissionSettings = z.infer<typeof insertCommissionSettingsSchema>;
export type CommissionSettings = typeof commissionSettings.$inferSelect;

// ========== Processed Orders (Webhook Idempotency) ==========

export const processedOrders = pgTable("processed_orders", {
  id: varchar("id").primaryKey(), // Shopify order ID
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});

// ========== PayPal Payouts ==========

// Payout batch status
export const payoutBatchStatusEnum = z.enum([
  "draft",           // Created but not submitted
  "pending_approval", // Awaiting admin approval
  "approved",        // Approved, ready to process
  "processing",      // Being processed by PayPal
  "completed",       // Successfully completed
  "failed",          // Failed to process
  "cancelled",       // Cancelled by admin
]);
export type PayoutBatchStatus = z.infer<typeof payoutBatchStatusEnum>;

// Payout item status
export const payoutItemStatusEnum = z.enum([
  "pending",    // Waiting to be processed
  "queued",     // Queued for PayPal processing
  "processing", // Being processed by PayPal
  "paid",       // Successfully paid
  "failed",     // Payment failed
  "cancelled",  // Cancelled
]);
export type PayoutItemStatus = z.infer<typeof payoutItemStatusEnum>;

// Payout batches (one per payout run, covering a period)
export const payoutBatches = pgTable("payout_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Period covered by this payout
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  
  // Status tracking
  status: text("status").notNull().default("draft"), // PayoutBatchStatus
  
  // Amounts (in pence)
  totalGross: integer("total_gross").notNull().default(0),
  totalFees: integer("total_fees").notNull().default(0),
  totalNet: integer("total_net").notNull().default(0),
  currency: text("currency").notNull().default("GBP"),
  
  // Audit trail
  initiatedBy: text("initiated_by"), // Admin who created the batch
  approvedBy: text("approved_by"),   // Admin who approved the batch
  approvedAt: timestamp("approved_at"),
  
  // PayPal reference
  externalBatchId: text("external_batch_id"), // PayPal payout batch ID
  
  // Error tracking
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Individual payout items (one per artist per batch)
export const payoutItems = pgTable("payout_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Links
  batchId: varchar("batch_id").notNull().references(() => payoutBatches.id, { onDelete: 'cascade' }),
  artistAccountId: varchar("artist_account_id").notNull().references(() => artistAccounts.id, { onDelete: 'cascade' }),
  
  // Snapshot of PayPal info at time of payout (in case it changes)
  paypalEmailSnapshot: text("paypal_email_snapshot").notNull(),
  paypalRecipientNameSnapshot: text("paypal_recipient_name_snapshot"),
  
  // Amounts (in pence)
  grossAmount: integer("gross_amount").notNull(),
  feeAmount: integer("fee_amount").notNull().default(0),
  netAmount: integer("net_amount").notNull(),
  currency: text("currency").notNull().default("GBP"),
  
  // Status
  status: text("status").notNull().default("pending"), // PayoutItemStatus
  
  // PayPal reference
  externalItemId: text("external_item_id"), // PayPal payout item ID
  
  // Error tracking
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  
  // Additional metadata
  metadata: json("metadata").$type<{
    salesPeriod?: string;
    orderCount?: number;
    unitCount?: number;
  }>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // One payout item per artist per batch
  uniqueArtistBatch: unique().on(table.batchId, table.artistAccountId),
}));

// Insert schemas
export const insertPayoutBatchSchema = createInsertSchema(payoutBatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  periodStart: z.date(),
  periodEnd: z.date(),
  status: payoutBatchStatusEnum.default("draft"),
  totalGross: z.number().int().min(0).default(0),
  totalFees: z.number().int().min(0).default(0),
  totalNet: z.number().int().min(0).default(0),
  currency: z.string().default("GBP"),
});

export const insertPayoutItemSchema = createInsertSchema(payoutItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  batchId: z.string().min(1),
  artistAccountId: z.string().min(1),
  paypalEmailSnapshot: z.string().email(),
  grossAmount: z.number().int().min(0),
  feeAmount: z.number().int().min(0).default(0),
  netAmount: z.number().int().min(0),
  status: payoutItemStatusEnum.default("pending"),
});

export type InsertPayoutBatch = z.infer<typeof insertPayoutBatchSchema>;
export type PayoutBatch = typeof payoutBatches.$inferSelect;

export type InsertPayoutItem = z.infer<typeof insertPayoutItemSchema>;
export type PayoutItem = typeof payoutItems.$inferSelect;

// Contract template settings (singleton)
export const contractSettings = pgTable("contract_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Contract template content (with variable placeholders)
  templateContent: text("template_content").notNull(),
  
  // Company signature info
  companySignatureUrl: text("company_signature_url"),
  companySignerName: text("company_signer_name").notNull().default("Philip Jobling"),
  companyName: text("company_name").notNull().default("East Side Studio London"),
  
  // Default commission rate for new contracts
  defaultCommissionRate: integer("default_commission_rate").notNull().default(18),
  
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Signed artist contracts
export const signedContracts = pgTable("signed_contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Artist info (snapshot at signing time)
  artistFirstName: text("artist_first_name").notNull(),
  artistLastName: text("artist_last_name").notNull(),
  artistAddress: text("artist_address").notNull(),
  artistEmail: text("artist_email").notNull(),
  
  // Contract content (frozen at signing time)
  contractContent: text("contract_content").notNull(),
  commissionRate: integer("commission_rate").notNull(),
  
  // Signatures
  artistSignatureUrl: text("artist_signature_url").notNull(),
  companySignatureUrl: text("company_signature_url").notNull(),
  companySignerName: text("company_signer_name").notNull(),
  
  // Signing date
  signedAt: timestamp("signed_at").notNull().defaultNow(),
  
  // PDF storage
  pdfUrl: text("pdf_url"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertContractSettingsSchema = createInsertSchema(contractSettings).omit({
  id: true,
  updatedAt: true,
}).extend({
  templateContent: z.string().min(1),
  companySignatureUrl: z.string().optional(),
  companySignerName: z.string().min(1),
  companyName: z.string().min(1),
  defaultCommissionRate: z.number().int().min(0).max(100),
});

export const insertSignedContractSchema = createInsertSchema(signedContracts).omit({
  id: true,
  createdAt: true,
}).extend({
  artistFirstName: z.string().min(1),
  artistLastName: z.string().min(1),
  artistAddress: z.string().min(1),
  artistEmail: z.string().email(),
  contractContent: z.string().min(1),
  commissionRate: z.number().int().min(0).max(100),
  artistSignatureUrl: z.string().min(1),
  companySignatureUrl: z.string().min(1),
  companySignerName: z.string().min(1),
  signedAt: z.date(),
});

export type InsertContractSettings = z.infer<typeof insertContractSettingsSchema>;
export type ContractSettings = typeof contractSettings.$inferSelect;

export type InsertSignedContract = z.infer<typeof insertSignedContractSchema>;
export type SignedContract = typeof signedContracts.$inferSelect;

// Contract variable placeholders
export const CONTRACT_VARIABLES = {
  "{{DATE}}": "Today's date (DD/MM/YYYY)",
  "{{FULL_NAME}}": "Artist's full name",
  "{{ADDRESS}}": "Artist's address",
  "{{COMMISSION}}": "Commission percentage",
} as const;

// Form Tracking System
export const formDefinitions = pgTable("form_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  route: varchar("route", { length: 255 }),
  emailAssociations: jsonb("email_associations").$type<{
    triggerStatus: "in_progress" | "completed" | "abandoned";
    templateKey: string;
    recipient: "artist" | "admin";
    description: string;
    delayMinutes?: number;
  }[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const formFields = pgTable("form_fields", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  formId: varchar("form_id").notNull().references(() => formDefinitions.id),
  key: varchar("key", { length: 100 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  stepIndex: integer("step_index").default(0),
  displayOrder: integer("display_order").default(0),
  isArray: boolean("is_array").default(false),
});

export const formSubmissionStatusEnum = pgEnum("form_submission_status", ["in_progress", "completed", "abandoned"]);

export const formSubmissions = pgTable("form_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  formId: varchar("form_id").notNull().references(() => formDefinitions.id),
  status: formSubmissionStatusEnum("status").notNull().default("in_progress"),
  currentStep: integer("current_step").default(1),
  totalSteps: integer("total_steps").default(1),
  actorEmail: varchar("actor_email", { length: 255 }),
  actorName: varchar("actor_name", { length: 255 }),
  data: jsonb("data").$type<Record<string, unknown>>().default({}),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  lastUpdatedAt: timestamp("last_updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  linkedArtistAccountId: integer("linked_artist_account_id"),
  linkedArtworkIds: jsonb("linked_artwork_ids").$type<number[]>().default([]),
});

export const insertFormDefinitionSchema = createInsertSchema(formDefinitions).omit({
  id: true,
  createdAt: true,
});

export const insertFormFieldSchema = createInsertSchema(formFields).omit({
  id: true,
});

export const insertFormSubmissionSchema = createInsertSchema(formSubmissions).omit({
  id: true,
  startedAt: true,
  lastUpdatedAt: true,
});

export type InsertFormDefinition = z.infer<typeof insertFormDefinitionSchema>;
export type FormDefinition = typeof formDefinitions.$inferSelect;
export type InsertFormField = z.infer<typeof insertFormFieldSchema>;
export type FormField = typeof formFields.$inferSelect;
export type InsertFormSubmission = z.infer<typeof insertFormSubmissionSchema>;
export type FormSubmission = typeof formSubmissions.$inferSelect;

// Scheduled Emails for delayed sending
export const scheduledEmailStatusEnum = pgEnum("scheduled_email_status", ["pending", "sent", "cancelled", "failed"]);

export const scheduledEmails = pgTable("scheduled_emails", {
  id: serial("id").primaryKey(),
  formSubmissionId: varchar("form_submission_id").references(() => formSubmissions.id),
  templateKey: varchar("template_key", { length: 100 }).notNull(),
  recipientEmail: varchar("recipient_email", { length: 255 }).notNull(),
  recipientName: varchar("recipient_name", { length: 255 }),
  triggerType: varchar("trigger_type", { length: 50 }).notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: scheduledEmailStatusEnum("status").notNull().default("pending"),
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertScheduledEmailSchema = createInsertSchema(scheduledEmails).omit({
  id: true,
  sentAt: true,
  errorMessage: true,
  createdAt: true,
});

export type InsertScheduledEmail = z.infer<typeof insertScheduledEmailSchema>;
export type ScheduledEmail = typeof scheduledEmails.$inferSelect;

// Onboarding Invitations - unique URLs for artist onboarding forms
export const onboardingInvitationStatusEnum = pgEnum("onboarding_invitation_status", ["pending", "used", "expired"]);
export const contractTypeEnum = pgEnum("contract_type", ["exclusive", "non_exclusive"]);

export const onboardingInvitations = pgTable("onboarding_invitations", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  artistEmail: varchar("artist_email", { length: 255 }),
  artistName: varchar("artist_name", { length: 255 }),
  status: onboardingInvitationStatusEnum("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  formSubmissionId: varchar("form_submission_id").references(() => formSubmissions.id),
  commissionRate: integer("commission_rate").notNull().default(18),
  contractType: contractTypeEnum("contract_type").notNull().default("exclusive"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by", { length: 255 }),
});

export const insertOnboardingInvitationSchema = createInsertSchema(onboardingInvitations).omit({
  id: true,
  usedAt: true,
  formSubmissionId: true,
  createdAt: true,
});

export type InsertOnboardingInvitation = z.infer<typeof insertOnboardingInvitationSchema>;
export type OnboardingInvitation = typeof onboardingInvitations.$inferSelect;

// ========== Creator/Influencer Management ==========

export const creatorStatusEnum = pgEnum("creator_status", ["active", "inactive", "pending"]);
export const creatorContractStatusEnum = pgEnum("creator_contract_status", ["pending", "signed", "expired", "cancelled"]);

export const creators = pgTable("creators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  instagramHandle: varchar("instagram_handle", { length: 100 }),
  tiktokHandle: varchar("tiktok_handle", { length: 100 }),
  youtubeHandle: varchar("youtube_handle", { length: 100 }),
  otherSocialHandles: text("other_social_handles"),
  notes: text("notes"),
  status: creatorStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCreatorSchema = createInsertSchema(creators).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCreator = z.infer<typeof insertCreatorSchema>;
export type Creator = typeof creators.$inferSelect;

export const creatorContracts = pgTable("creator_contracts", {
  id: serial("id").primaryKey(),
  creatorId: varchar("creator_id").references(() => creators.id).notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  contractContent: text("contract_content").notNull(),
  status: creatorContractStatusEnum("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  signedAt: timestamp("signed_at"),
  signerName: varchar("signer_name", { length: 255 }),
  signatureUrl: text("signature_url"),
  pdfUrl: text("pdf_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by", { length: 255 }),
  
  // Editable contract sections - dual content (form view + contract view)
  // Introduction section
  introductionFormContent: text("introduction_form_content"),
  introductionContractContent: text("introduction_contract_content"),
  
  // Deliverables section (scope of work)
  deliverablesFormContent: text("deliverables_form_content"),
  deliverablesContractContent: text("deliverables_contract_content"),
  
  // Content Usage section
  contentUsageFormContent: text("content_usage_form_content"),
  contentUsageContractContent: text("content_usage_contract_content"),
  
  // Exclusivity section
  exclusivityEnabled: boolean("exclusivity_enabled").default(true),
  exclusivityFormContent: text("exclusivity_form_content"),
  exclusivityContractContent: text("exclusivity_contract_content"),
  
  // Schedule section
  scheduleFormContent: text("schedule_form_content"),
  scheduleContractContent: text("schedule_contract_content"),
  
  // Payment section
  paymentFormContent: text("payment_form_content"),
  paymentContractContent: text("payment_contract_content"),
  
  // Legacy fields for backward compatibility (will be migrated)
  introductionContent: text("introduction_content"),
  contentUsageContent: text("content_usage_content"),
  exclusivityContent: text("exclusivity_content"),
  scheduleContent: text("schedule_content"),
  paymentContent: text("payment_content"),
  
  // Creator responses
  contentUsageAgreed: boolean("content_usage_agreed"),
  exclusivityAgreed: boolean("exclusivity_agreed"),
  scheduleAgreed: boolean("schedule_agreed"),
  paypalEmail: varchar("paypal_email", { length: 255 }),
  
  // Shipping info (collected at signing) - Prodigi format
  shippingFirstName: varchar("shipping_first_name", { length: 255 }),
  shippingLastName: varchar("shipping_last_name", { length: 255 }),
  shippingAddressLine1: varchar("shipping_address_line1", { length: 255 }),
  shippingAddressLine2: varchar("shipping_address_line2", { length: 255 }),
  shippingTownCity: varchar("shipping_town_city", { length: 255 }),
  shippingCountyState: varchar("shipping_county_state", { length: 255 }),
  shippingPostcode: varchar("shipping_postcode", { length: 50 }),
  shippingCountryCode: varchar("shipping_country_code", { length: 10 }),
  shippingPhone: varchar("shipping_phone", { length: 50 }),
  shippingEmail: varchar("shipping_email", { length: 255 }),
});

export const insertCreatorContractSchema = createInsertSchema(creatorContracts).omit({
  id: true,
  signedAt: true,
  signerName: true,
  signatureUrl: true,
  pdfUrl: true,
  createdAt: true,
  contentUsageAgreed: true,
  exclusivityAgreed: true,
  scheduleAgreed: true,
  paypalEmail: true,
  shippingFirstName: true,
  shippingLastName: true,
  shippingAddressLine1: true,
  shippingAddressLine2: true,
  shippingTownCity: true,
  shippingCountyState: true,
  shippingPostcode: true,
  shippingCountryCode: true,
  shippingPhone: true,
  shippingEmail: true,
});

export type InsertCreatorContract = z.infer<typeof insertCreatorContractSchema>;
export type CreatorContract = typeof creatorContracts.$inferSelect;

export const creatorContents = pgTable("creator_contents", {
  id: serial("id").primaryKey(),
  creatorId: varchar("creator_id").references(() => creators.id).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  contentType: varchar("content_type", { length: 50 }),
  mediaUrl: text("media_url"),
  externalUrl: text("external_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCreatorContentSchema = createInsertSchema(creatorContents).omit({
  id: true,
  createdAt: true,
});

export type InsertCreatorContent = z.infer<typeof insertCreatorContentSchema>;
export type CreatorContent = typeof creatorContents.$inferSelect;

export const creatorInvoices = pgTable("creator_invoices", {
  id: serial("id").primaryKey(),
  creatorId: varchar("creator_id").references(() => creators.id).notNull(),
  invoiceNumber: varchar("invoice_number", { length: 100 }),
  amount: integer("amount"),
  currency: varchar("currency", { length: 10 }).default("GBP"),
  description: text("description"),
  fileUrl: text("file_url"),
  status: varchar("status", { length: 50 }).default("pending"),
  dueDate: timestamp("due_date"),
  paidDate: timestamp("paid_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCreatorInvoiceSchema = createInsertSchema(creatorInvoices).omit({
  id: true,
  createdAt: true,
});

export type InsertCreatorInvoice = z.infer<typeof insertCreatorInvoiceSchema>;
export type CreatorInvoice = typeof creatorInvoices.$inferSelect;

// Contract Template Defaults - configurable default content for contracts
export const contractTemplateDefaults = pgTable("contract_template_defaults", {
  id: serial("id").primaryKey(),
  
  // Section Headings - Form View
  introductionHeadingForm: text("introduction_heading_form"),
  deliverablesHeadingForm: text("deliverables_heading_form"),
  paymentHeadingForm: text("payment_heading_form"),
  contentUsageHeadingForm: text("content_usage_heading_form"),
  exclusivityHeadingForm: text("exclusivity_heading_form"),
  scheduleHeadingForm: text("schedule_heading_form"),
  
  // Section Headings - Contract View
  introductionHeadingContract: text("introduction_heading_contract"),
  deliverablesHeadingContract: text("deliverables_heading_contract"),
  paymentHeadingContract: text("payment_heading_contract"),
  contentUsageHeadingContract: text("content_usage_heading_contract"),
  exclusivityHeadingContract: text("exclusivity_heading_contract"),
  scheduleHeadingContract: text("schedule_heading_contract"),
  
  // Form View content (casual language shown to creators)
  introductionFormDefault: text("introduction_form_default"),
  deliverablesFormDefault: text("deliverables_form_default"),
  paymentFormDefault: text("payment_form_default"),
  contentUsageFormDefault: text("content_usage_form_default"),
  exclusivityFormDefault: text("exclusivity_form_default"),
  scheduleFormDefault: text("schedule_form_default"),
  
  // Contract View content (formal legal language)
  introductionContractDefault: text("introduction_contract_default"),
  deliverablesContractDefault: text("deliverables_contract_default"),
  paymentContractDefault: text("payment_contract_default"),
  contentUsageContractDefault: text("content_usage_contract_default"),
  exclusivityContractDefault: text("exclusivity_contract_default"),
  scheduleContractDefault: text("schedule_contract_default"),
  
  // Default settings
  exclusivityEnabledDefault: boolean("exclusivity_enabled_default").default(true),
  
  // Standard Legal Terms (editable)
  legalComplianceDefault: text("legal_compliance_default"),
  moralityDefault: text("morality_default"),
  independentContractorDefault: text("independent_contractor_default"),
  forceMajeureDefault: text("force_majeure_default"),
  disputeResolutionDefault: text("dispute_resolution_default"),
  takedownDefault: text("takedown_default"),
  terminationDefault: text("termination_default"),
  indemnityDefault: text("indemnity_default"),
  confidentialityDefault: text("confidentiality_default"),
  dataProtectionDefault: text("data_protection_default"),
  insuranceDefault: text("insurance_default"),
  languageDefault: text("language_default"),
  boilerplateDefault: text("boilerplate_default"),
  
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertContractTemplateDefaultsSchema = createInsertSchema(contractTemplateDefaults).omit({
  id: true,
  updatedAt: true,
});

export type InsertContractTemplateDefaults = z.infer<typeof insertContractTemplateDefaultsSchema>;
export type ContractTemplateDefaults = typeof contractTemplateDefaults.$inferSelect;

// Contract Section Presets - multiple preset options per section type
export const contractSectionPresets = pgTable("contract_section_presets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sectionType: varchar("section_type").notNull(), // introduction, deliverables, contentUsage, exclusivity, schedule, payment
  name: varchar("name").notNull(), // e.g., "Full Rights (Including Paid Ads)"
  formContent: text("form_content"), // Casual language for form view
  contractContent: text("contract_content"), // Legal language for contract view
  isDefault: boolean("is_default").default(false), // Mark one as default per section
  sortOrder: integer("sort_order").default(0), // For ordering in dropdown
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertContractSectionPresetSchema = createInsertSchema(contractSectionPresets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContractSectionPreset = z.infer<typeof insertContractSectionPresetSchema>;
export type ContractSectionPreset = typeof contractSectionPresets.$inferSelect;

// AR Size Mappings - Map website size options to actual print dimensions
export const arSizeMappings = pgTable("ar_size_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  websiteSize: varchar("website_size").notNull().unique(), // The size as shown on website (e.g., "8x10in", "A4")
  widthMm: integer("width_mm").notNull(), // Actual width in millimeters
  heightMm: integer("height_mm").notNull(), // Actual height in millimeters
  description: text("description"), // Optional description
  matchType: varchar("match_type").notNull().default("exact"), // "exact" or "contains"
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertArSizeMappingSchema = createInsertSchema(arSizeMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertArSizeMapping = z.infer<typeof insertArSizeMappingSchema>;
export type ArSizeMapping = typeof arSizeMappings.$inferSelect;

// AR Analytics - tracks AR/3D viewer usage
export const arAnalytics = pgTable("ar_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: varchar("event_type").notNull(), // "ar_button_click", "ar_launched", "3d_view", "prefetch"
  platform: varchar("platform"), // "ios", "android", "desktop"
  productTitle: text("product_title"),
  productHandle: text("product_handle"), // Shopify product handle for linking
  imageUrl: text("image_url"),
  size: varchar("size"), // Selected size
  frame: varchar("frame"), // Selected frame color
  frameType: varchar("frame_type"), // "standard" or "box"
  shopDomain: varchar("shop_domain"), // Shopify store domain
  userAgent: text("user_agent"),
  ipAddress: varchar("ip_address"),
  sessionId: varchar("session_id"), // To group events from same user session
  country: varchar("country"), // Geographic location (from IP lookup)
  countryCode: varchar("country_code"), // ISO country code (e.g., "GB", "US")
  generationTimeMs: integer("generation_time_ms"), // GLB generation time in milliseconds
  isQrScan: boolean("is_qr_scan").default(false), // True if user arrived via QR code scan
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertArAnalyticsSchema = createInsertSchema(arAnalytics).omit({
  id: true,
  createdAt: true,
});

export type InsertArAnalytics = z.infer<typeof insertArAnalyticsSchema>;
export type ArAnalytics = typeof arAnalytics.$inferSelect;

// AR Conversions - Track purchases from AR sessions
export const arConversions = pgTable("ar_conversions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Order details from Shopify
  orderId: varchar("order_id").notNull(),
  orderNumber: varchar("order_number"),
  orderTotal: numeric("order_total", { precision: 10, scale: 2 }),
  currency: varchar("currency").default("GBP"),
  
  // Product that was viewed in AR and purchased
  productHandle: text("product_handle").notNull(),
  productTitle: text("product_title"),
  productId: varchar("product_id"),
  variantId: varchar("variant_id"),
  quantity: integer("quantity").default(1),
  lineItemPrice: numeric("line_item_price", { precision: 10, scale: 2 }),
  
  // AR session that led to this conversion
  sessionId: varchar("session_id"),
  arEventId: varchar("ar_event_id"),
  
  // Attribution details
  platform: varchar("platform"),
  timeBetweenArAndPurchase: integer("time_between_ar_and_purchase"),
  
  // Customer info
  customerEmail: varchar("customer_email"),
  shopDomain: varchar("shop_domain"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertArConversionSchema = createInsertSchema(arConversions).omit({
  id: true,
  createdAt: true,
});

export type InsertArConversion = z.infer<typeof insertArConversionSchema>;
export type ArConversion = typeof arConversions.$inferSelect;

// ========================================
// PRODUCT ADD-ONS HIERARCHY (Globo-style)
// ========================================
// Level 1: Option Sets - Country-specific containers
// Level 2: Addon Groups - Frame color groups (Black Box Frame, White Box Frame, etc.)
// Level 3: Addon Variants - Individual pricing tiers with size/frame rules

// Level 1: Option Sets (e.g., "Box Frame Option Set", "Box Frame Option Set - AU + NZ Only")
export const addonOptionSets = pgTable("addon_option_sets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // "Box Frame Option Set", "Box Frame Option Set - AU + NZ Only"
  description: text("description"),
  
  // Country restrictions for this option set
  allowedCountries: text("allowed_countries").array(), // ["GB", "US", "FR", ...] or ["AU", "NZ"]
  
  // Product restrictions - which Shopify products can show this option set (null = all products)
  allowedProductIds: text("allowed_product_ids").array(),
  
  // How this option set renders in the widget: 'checkbox' (image cards) or 'toggle' (Yes/No split button)
  displayType: text("display_type").notNull().default("checkbox"),
  
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Level 2: Addon Groups (e.g., "Black Box Frame", "White Box Frame", "Paper Upgrade")
export const addonGroups = pgTable("addon_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  optionSetId: varchar("option_set_id").notNull().references(() => addonOptionSets.id, { onDelete: 'cascade' }),
  
  name: text("name").notNull(), // "Black Box Frame", "White Box Frame", "Hahnemühle German Etching Paper"
  slug: text("slug").notNull(), // "black-box-frame", "paper-upgrade"
  description: text("description"), // Displayed to customer
  specs: text("specs"), // Pipe-separated spec highlights, e.g. "99% UV protection | <1% reflection | Shatter-resistant"
  imageUrl: text("image_url"), // Default swatch/preview image
  
  // Shopify product this group adds to cart
  shopifyProductId: text("shopify_product_id").notNull(),
  shopifyProductHandle: text("shopify_product_handle").notNull(),
  
  // Display conditions (when to show this group)
  // e.g., show "Black Box Frame" only when variant contains "Black Frame"
  displayConditions: jsonb("display_conditions").$type<AddonDisplayCondition[]>(),
  conditionLogic: text("condition_logic").notNull().default("all"), // "all" or "any"
  
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Legacy table - kept for backward compatibility during migration
// Product Add-ons (Box Frame, Paper Upgrade, Mount, etc.)
// These are separate Shopify products added to cart alongside the main artwork
export const productAddons = pgTable("product_addons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // "Box Frame", "Hahnemühle Paper", "Mount"
  slug: text("slug").notNull().unique(), // "box-frame", "paper-upgrade", "mount"
  description: text("description"), // Displayed to customer
  specs: text("specs"), // Pipe-separated spec highlights, e.g. "99% UV protection | <1% reflection | Shatter-resistant"
  imageUrl: text("image_url"), // Swatch/preview image
  shopifyProductId: text("shopify_product_id").notNull(), // Shopify product ID
  shopifyProductHandle: text("shopify_product_handle").notNull(), // Shopify handle
  displayOrder: integer("display_order").notNull().default(0), // Sort order
  isActive: boolean("is_active").notNull().default(true),
  
  // Display conditions (when to show this addon)
  // JSON array of conditions: [{ "field": "frame", "operator": "contains", "value": "Black Frame" }]
  displayConditions: jsonb("display_conditions").$type<AddonDisplayCondition[]>(),
  conditionLogic: text("condition_logic").notNull().default("all"), // "all" or "any"
  
  // Country restrictions (null = available everywhere)
  allowedCountries: text("allowed_countries").array(), // ["GB", "US", "FR", ...]
  
  // Product restrictions - which Shopify products can show this addon (null = all products)
  allowedProductIds: text("allowed_product_ids").array(), // ["15079516209529", ...]
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Display condition type for addon visibility
export interface AddonDisplayCondition {
  field: "shopify_variant" | "size" | "frame";
  operator: "contains" | "not_contains" | "equals";
  value: string;
}

// Level 3: Add-on variants with size-based pricing
export const addonVariants = pgTable("addon_variants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // NEW: Reference to addon_groups (Level 2) - preferred
  groupId: varchar("group_id").references(() => addonGroups.id, { onDelete: 'cascade' }),
  
  // LEGACY: Reference to product_addons - kept for backward compatibility
  addonId: varchar("addon_id").references(() => productAddons.id, { onDelete: 'cascade' }),
  
  name: text("name").notNull(), // "Box Frame - Tier 1", "Paper Upgrade - Small"
  shopifyVariantId: text("shopify_variant_id").notNull(), // Shopify variant ID
  price: text("price").notNull(), // "40.00"
  currency: text("currency").notNull().default("GBP"),
  
  // Size matching patterns (variant shown when size matches any of these)
  // e.g., ["A4", "8\" X 12\"", "8\" X 10\"", "11\" X 14\""]
  sizePatterns: text("size_patterns").array().notNull(),
  
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Insert schemas for new hierarchy
export const insertAddonOptionSetSchema = createInsertSchema(addonOptionSets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAddonGroupSchema = createInsertSchema(addonGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Legacy insert schemas
export const insertProductAddonSchema = createInsertSchema(productAddons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAddonVariantSchema = createInsertSchema(addonVariants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Addon variant images - supports frame-specific images for addons like Box Frame
// For Box Frame: each variant can have different images for Black, White, Natural, Oak frames
// For Paper Upgrade: single image per variant (no frame dependency)
export const addonVariantImages = pgTable("addon_variant_images", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  variantId: varchar("variant_id").notNull().references(() => addonVariants.id, { onDelete: 'cascade' }),
  
  // Frame type this image applies to (null = default/all frames)
  // Used for Box Frame upgrade which needs different images per frame color
  frameType: text("frame_type"), // "black", "white", "natural", "oak", null for non-frame-dependent
  
  // Image stored in object storage
  imageUrl: text("image_url").notNull(),
  
  // Alt text for accessibility
  altText: text("alt_text"),
  
  displayOrder: integer("display_order").notNull().default(0),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // One image per variant + frame type combination
  uniqueVariantFrame: unique().on(table.variantId, table.frameType),
}));

export const insertAddonVariantImageSchema = createInsertSchema(addonVariantImages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for new hierarchy
export type InsertAddonOptionSet = z.infer<typeof insertAddonOptionSetSchema>;
export type AddonOptionSet = typeof addonOptionSets.$inferSelect;
export type InsertAddonGroup = z.infer<typeof insertAddonGroupSchema>;
export type AddonGroup = typeof addonGroups.$inferSelect;

// Legacy types
export type InsertProductAddon = z.infer<typeof insertProductAddonSchema>;
export type ProductAddon = typeof productAddons.$inferSelect;

export const ARTWORK_TAG_OPTIONS = {
  style: [
    "Abstract", "Art Nouveau", "Brutalist", "Cartoon", "Collage", "Comics, Manga & Anime",
    "Contemporary", "Doodle", "Futurism", "Geometric", "Gradient/Colour Field", "Graphic Design",
    "Illustration", "Japanese", "Landscapes", "Line Art", "Minimalist", "Mixed Media",
    "Nude", "Optical Illusion", "Oriental", "Photography", "Pop Art", "Psychedelic",
    "Still Life", "Surreal", "Typography", "3D/CGI",
  ],
  colour: [
    "Beige", "Black", "Black and White", "Blue", "Brown", "Earth Tone",
    "Gradient", "Green", "Grey", "Multicolour", "Neon/Vibrant", "Neutral",
    "Orange", "Pastel", "Pink", "Purple", "Red", "Terracotta", "White", "Yellow",
  ],
  mood: [
    "Bold", "Calm", "Cool", "Dreamy", "Electric", "Energetic", "Funny",
    "Quirky/Offbeat", "Romantic", "Warm", "Whimsical",
  ],
  themes: [
    "Animals", "Architecture", "Beach", "Cars", "Celestial",
    "Cute", "Fantasy", "Floral", "Food and Drink", "Gothic", "Literature",
    "Love", "Motivational", "Music", "Mythology", "Nature", "People", "Positivity",
    "Sci-Fi", "Sports", "Travel", "Urban", "Vintage", "Western",
  ],
} as const;
export type InsertAddonVariant = z.infer<typeof insertAddonVariantSchema>;
export type AddonVariant = typeof addonVariants.$inferSelect;
export type InsertAddonVariantImage = z.infer<typeof insertAddonVariantImageSchema>;
export type AddonVariantImage = typeof addonVariantImages.$inferSelect;
