/**
 * Standalone sales sync script.
 * Run with: npx tsx server/scripts/syncSales.ts [months]
 */
import { db } from "../db";
import { artistAccounts, artistSales, commissionSettings } from "../../shared/schema";
import { eq, and } from "drizzle-orm";

const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
  console.error("Missing SHOPIFY_SHOP_DOMAIN or SHOPIFY_ACCESS_TOKEN");
  process.exit(1);
}

const months = parseInt(process.argv[2] ?? "12", 10);

async function fetchOrdersInRange(start: Date, end: Date): Promise<any[]> {
  const orders: any[] = [];
  let url: string | null =
    `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/orders.json?` +
    `status=any&limit=250` +
    `&created_at_min=${start.toISOString()}` +
    `&created_at_max=${end.toISOString()}` +
    `&fields=id,created_at,line_items,shipping_lines,tax_lines,financial_status`;

  while (url) {
    const response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN },
    });
    if (!response.ok) throw new Error(`Shopify ${response.status}: ${await response.text()}`);
    const data = await response.json();
    orders.push(...(data.orders ?? []));
    const link = response.headers.get("link") ?? "";
    url = link.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  }
  return orders;
}

async function main() {
  console.log(`\n=== Sales Sync — ${months} months ===\n`);

  // Load commission settings
  const [settings] = await db.select().from(commissionSettings).limit(1);
  const defaultRate = settings?.defaultCommissionRate ?? 18;
  const applyAfterTax = settings?.applyAfterTax ?? true;
  const applyAfterShipping = settings?.applyAfterShipping ?? true;
  const applyAfterDiscounts = settings?.applyAfterDiscounts ?? true;
  console.log(`Commission settings: ${defaultRate}% | tax:${applyAfterTax} shipping:${applyAfterShipping} discounts:${applyAfterDiscounts}\n`);

  // Load all artist accounts
  const artists = await db.select().from(artistAccounts);
  const artistByVendor = new Map<string, typeof artists[0]>();
  for (const a of artists) {
    if (a.vendorName) artistByVendor.set(a.vendorName.toLowerCase().trim(), a);
  }
  console.log(`Artists loaded: ${artistByVendor.size}\n`);

  // Build month buckets
  const now = new Date();
  const buckets: { start: Date; end: Date; label: string }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      start: new Date(d.getFullYear(), d.getMonth(), 1),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
      label: d.toLocaleString("default", { month: "long", year: "numeric" }),
    });
  }

  let totalOrders = 0;
  const updatedArtists = new Set<string>();

  for (const bucket of buckets) {
    process.stdout.write(`${bucket.label}: fetching orders…`);
    const orders = await fetchOrdersInRange(bucket.start, bucket.end);
    totalOrders += orders.length;
    process.stdout.write(` ${orders.length} found\n`);

    // Aggregate per vendor
    const vendorSales: Record<string, {
      units: number; grossRevenue: number;
      orderIds: Set<string>;
      products: Record<string, { title: string; units: number; revenue: number }>;
    }> = {};

    for (const order of orders) {
      let totalShipping = 0;
      let totalShippingTax = 0;
      for (const sl of order.shipping_lines ?? []) {
        totalShipping += parseFloat(sl.price ?? "0") * 100;
        if (applyAfterTax) {
          for (const tl of sl.tax_lines ?? []) totalShippingTax += parseFloat(tl.price ?? "0") * 100;
        }
      }
      totalShipping += totalShippingTax;

      let orderLevelTax = 0;
      if (applyAfterTax) {
        for (const tl of order.tax_lines ?? []) orderLevelTax += parseFloat(tl.price ?? "0") * 100;
        let lineItemTaxTotal = 0;
        for (const item of order.line_items ?? []) {
          for (const tl of item.tax_lines ?? []) lineItemTaxTotal += parseFloat(tl.price ?? "0") * 100;
        }
        orderLevelTax = Math.max(0, orderLevelTax - lineItemTaxTotal - totalShippingTax);
      }

      let totalAdjustedValue = 0;
      const lineValues: { vendor: string; baseValue: number; adjustedValue: number; item: any }[] = [];
      for (const item of order.line_items ?? []) {
        if (!item.vendor) continue;
        const qty = item.quantity ?? 1;
        const price = parseFloat(item.price ?? "0") * 100;
        const base = price * qty;
        const adj = applyAfterDiscounts ? Math.max(0, base - parseFloat(item.total_discount ?? "0") * 100) : base;
        lineValues.push({ vendor: item.vendor, baseValue: base, adjustedValue: adj, item });
        totalAdjustedValue += adj;
      }

      for (const { vendor, baseValue, adjustedValue, item } of lineValues) {
        const qty = item.quantity ?? 1;
        let cb = baseValue;
        if (applyAfterDiscounts) cb -= parseFloat(item.total_discount ?? "0") * 100;
        if (applyAfterTax) {
          cb += (item.tax_lines ?? []).reduce((s: number, tl: any) => s + parseFloat(tl.price ?? "0") * 100, 0);
          if (orderLevelTax > 0 && totalAdjustedValue > 0)
            cb += Math.round(orderLevelTax * (adjustedValue / totalAdjustedValue));
        }
        if (applyAfterShipping && totalAdjustedValue > 0 && totalShipping > 0)
          cb += Math.round(totalShipping * (adjustedValue / totalAdjustedValue));
        cb = Math.max(0, cb);

        if (!vendorSales[vendor])
          vendorSales[vendor] = { units: 0, grossRevenue: 0, orderIds: new Set(), products: {} };
        vendorSales[vendor].units += qty;
        vendorSales[vendor].grossRevenue += cb;
        vendorSales[vendor].orderIds.add(String(order.id));

        const pid = item.product_id?.toString() ?? item.title;
        if (!vendorSales[vendor].products[pid])
          vendorSales[vendor].products[pid] = { title: item.title, units: 0, revenue: 0 };
        vendorSales[vendor].products[pid].units += qty;
        vendorSales[vendor].products[pid].revenue += cb;
      }
    }

    // Upsert per artist
    for (const [vendorName, sales] of Object.entries(vendorSales)) {
      const artist = artistByVendor.get(vendorName.toLowerCase().trim());
      if (!artist) continue;

      const rate = artist.useCustomCommission && artist.commissionRate !== null
        ? artist.commissionRate : defaultRate;
      const netRevenue = Math.round(sales.grossRevenue * (rate / 100));
      const productBreakdown = Object.entries(sales.products).map(([productId, d]) => ({
        productId,
        productTitle: d.title,
        units: d.units,
        revenue: Math.round(d.revenue * (rate / 100)),
      }));

      // Check for existing record this month
      const existing = await db.select()
        .from(artistSales)
        .where(eq(artistSales.artistAccountId, artist.id))
        .then(rows => rows.find(s => {
          const sDate = new Date(s.periodStart);
          return sDate.getFullYear() === bucket.start.getFullYear() &&
            sDate.getMonth() === bucket.start.getMonth();
        }));

      if (existing) {
        await db.update(artistSales)
          .set({
            totalOrders: sales.orderIds.size,
            totalUnits: sales.units,
            grossRevenue: sales.grossRevenue,
            netRevenue,
            productBreakdown,
            lastSyncedAt: new Date(),
          })
          .where(eq(artistSales.id, existing.id));
        console.log(`  ✓ Updated  ${vendorName}: ${sales.units} units, net £${(netRevenue / 100).toFixed(2)} (${rate}%)`);
      } else {
        await db.insert(artistSales).values({
          artistAccountId: artist.id,
          periodStart: bucket.start,
          periodEnd: bucket.end,
          totalOrders: sales.orderIds.size,
          totalUnits: sales.units,
          grossRevenue: sales.grossRevenue,
          netRevenue,
          productBreakdown,
        });
        console.log(`  ✓ Created  ${vendorName}: ${sales.units} units, net £${(netRevenue / 100).toFixed(2)} (${rate}%)`);
      }
      updatedArtists.add(vendorName);
    }
  }

  console.log(`\n✅ Sync complete.`);
  console.log(`   ${months} months | ${totalOrders} total orders | ${updatedArtists.size} artists updated`);
  if (updatedArtists.size > 0) console.log(`   Artists: ${[...updatedArtists].join(", ")}`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
