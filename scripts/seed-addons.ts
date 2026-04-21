import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { productAddons, addonVariants } from "../shared/schema";
import type { AddonDisplayCondition } from "../shared/schema";

neonConfig.webSocketConstructor = ws;

async function seedAddons() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const db = drizzle(pool);

  console.log("Seeding product addons...");

  // Clear existing data
  await db.delete(addonVariants);
  await db.delete(productAddons);

  // Box Frame Upgrade
  const boxFrameConditions: AddonDisplayCondition[] = [
    { field: "shopify_variant", operator: "contains", value: "Frame" },
    { field: "shopify_variant", operator: "not_contains", value: "Unframed" }
  ];

  const [boxFrame] = await db.insert(productAddons).values({
    name: "Box Frame",
    slug: "box-frame",
    description: "Our most luxurious frame. Milled from solid Ash and hand-stained.",
    imageUrl: "https://option.globo.io/storage/uploads/222691/swatch-17694678643263.jpg",
    shopifyProductId: "15079516209529",
    shopifyProductHandle: "option-set-1180177-buttons-1",
    displayOrder: 1,
    isActive: true,
    displayConditions: boxFrameConditions,
    conditionLogic: "all",
    allowedCountries: ["GB", "US", "FR", "DE", "ES", "BE", "AT", "SE", "FI", "EE", "DK", "BG", "HR", "CY", "GI", "GR", "HU", "IS", "IE", "IL", "IT", "LU", "NL", "NO", "PL", "PT", "RO", "CH"],
  }).returning();

  console.log("Created Box Frame addon:", boxFrame.id);

  // Box Frame Variants (size-based pricing)
  const boxFrameVariants = [
    {
      name: "Box Frame - Tier 1",
      shopifyVariantId: "55597339967865",
      price: "40.00",
      currency: "GBP",
      sizePatterns: ["A4", "8\" X 12\"", "8\" X 10\"", "11\" X 14\"", "8x12", "8x10", "11x14"],
      displayOrder: 1,
    },
    {
      name: "Box Frame - Tier 2",
      shopifyVariantId: "55602886672761",
      price: "65.00",
      currency: "GBP",
      sizePatterns: ["A3", "12\" X 16\"", "12\" X 12\"", "12\" X 18\"", "16\" X 16\"", "12x16", "12x12", "12x18", "16x16"],
      displayOrder: 2,
    },
    {
      name: "Box Frame - Tier 3",
      shopifyVariantId: "55602886705529",
      price: "80.00",
      currency: "GBP",
      sizePatterns: ["A2", "16\" X 20\"", "18\" X 24\"", "20\" X 20\"", "16x20", "18x24", "20x20"],
      displayOrder: 3,
    },
    {
      name: "Box Frame - Tier 4",
      shopifyVariantId: "55602886738297",
      price: "90.00",
      currency: "GBP",
      sizePatterns: ["A1", "20\" X 28\"", "24\" X 32\"", "20\" X 30\"", "24\" X 36\"", "30\" X 30\"", "20x28", "24x32", "20x30", "24x36", "30x30"],
      displayOrder: 4,
    },
    {
      name: "Box Frame - Tier 5",
      shopifyVariantId: "55602886803833",
      price: "110.00",
      currency: "GBP",
      sizePatterns: ["30\" X 40\"", "30x40"],
      displayOrder: 5,
    },
    {
      name: "Box Frame - Tier 6",
      shopifyVariantId: "55602886836601",
      price: "120.00",
      currency: "GBP",
      sizePatterns: ["A0", "28\" X 40\"", "28x40"],
      displayOrder: 6,
    },
  ];

  for (const variant of boxFrameVariants) {
    await db.insert(addonVariants).values({
      addonId: boxFrame.id,
      ...variant,
    });
  }

  console.log("Created", boxFrameVariants.length, "Box Frame variants");

  // Paper Upgrade (Hahnemühle German Etching)
  const paperConditions: AddonDisplayCondition[] = [
    { field: "shopify_variant", operator: "contains", value: "Unframed" }
  ];

  const [paperUpgrade] = await db.insert(productAddons).values({
    name: "Hahnemühle German Etching Paper",
    slug: "paper-upgrade",
    description: "Luxurious, 310gsm textured paper.",
    imageUrl: null,
    shopifyProductId: "15081129247097",
    shopifyProductHandle: "paper-upgrade",
    displayOrder: 2,
    isActive: true,
    displayConditions: paperConditions,
    conditionLogic: "all",
    allowedCountries: null, // Available everywhere
  }).returning();

  console.log("Created Paper Upgrade addon:", paperUpgrade.id);

  // Paper Upgrade Variants
  const paperVariants = [
    {
      name: "Paper Upgrade - Small",
      shopifyVariantId: "55603412337017",
      price: "15.00",
      currency: "GBP",
      sizePatterns: ["A4", "8\" X 12\"", "8\" X 10\"", "11\" X 14\"", "8x12", "8x10", "11x14"],
      displayOrder: 1,
    },
    {
      name: "Paper Upgrade - Medium",
      shopifyVariantId: "55603412369785",
      price: "20.00",
      currency: "GBP",
      sizePatterns: ["A3", "12\" X 16\"", "12\" X 12\"", "12\" X 18\"", "16\" X 16\"", "A2", "16\" X 20\"", "18\" X 24\"", "20\" X 20\"", "12x16", "12x12", "12x18", "16x16", "16x20", "18x24", "20x20"],
      displayOrder: 2,
    },
    {
      name: "Paper Upgrade - Large",
      shopifyVariantId: "55603412402553",
      price: "25.00",
      currency: "GBP",
      sizePatterns: ["A1", "A0", "20\" X 28\"", "24\" X 32\"", "20\" X 30\"", "24\" X 36\"", "30\" X 30\"", "30\" X 40\"", "28\" X 40\"", "20x28", "24x32", "20x30", "24x36", "30x30", "30x40", "28x40"],
      displayOrder: 3,
    },
  ];

  for (const variant of paperVariants) {
    await db.insert(addonVariants).values({
      addonId: paperUpgrade.id,
      ...variant,
    });
  }

  console.log("Created", paperVariants.length, "Paper Upgrade variants");

  console.log("Seeding complete!");
  process.exit(0);
}

seedAddons().catch(console.error);
