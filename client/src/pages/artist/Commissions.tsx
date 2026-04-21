import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Handshake, TrendingUp, ShoppingBag } from "lucide-react";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { artistQueryFn } from "@/lib/artistApiRequest";
import type { ArtistSales } from "@shared/schema";

async function impersonationFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json() as Promise<T>;
}

interface ProductBreakdown {
  productId: string;
  productTitle: string;
  units: number;
  revenue: number;
}

interface ArtworkCommission {
  productId: string;
  productTitle: string;
  unitsSold: number;
  grossRevenue: number;
  netCommission: number;
}

function buildArtworkCommissions(sales: ArtistSales[]): ArtworkCommission[] {
  const byProduct: Record<string, ArtworkCommission> = {};

  for (const sale of sales) {
    if (!sale.productBreakdown) continue;

    for (const item of sale.productBreakdown as ProductBreakdown[]) {
      if (!byProduct[item.productId]) {
        byProduct[item.productId] = {
          productId: item.productId,
          productTitle: item.productTitle,
          unitsSold: 0,
          grossRevenue: 0,
          netCommission: 0,
        };
      }
      byProduct[item.productId].unitsSold += item.units || 0;
      // item.revenue is already the net commission (gross × rate) stored by the sync script
      byProduct[item.productId].netCommission += item.revenue || 0;
    }
  }

  return Object.values(byProduct).sort((a, b) => b.netCommission - a.netCommission);
}

export default function ArtistCommissions() {
  const { apiPrefix, isImpersonating } = useImpersonation();

  const { data: sales, isLoading } = useQuery<ArtistSales[]>({
    queryKey: [apiPrefix, "commissions"],
    queryFn: () =>
      isImpersonating
        ? impersonationFetch<ArtistSales[]>(`${apiPrefix}/commissions`)
        : artistQueryFn<ArtistSales[]>("/api/artist/commissions"),
  });

  const artworkCommissions = sales ? buildArtworkCommissions(sales) : [];
  // Sum netRevenue directly from sales records to match the Dashboard figure exactly
  const totalNet = sales?.reduce((sum, s) => sum + (s.netRevenue ?? 0), 0) ?? 0;
  const totalUnits = artworkCommissions.reduce((sum, a) => sum + a.unitsSold, 0);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900" data-testid="text-page-title">
          Commissions
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Your earnings broken down by artwork
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <Card data-testid="card-net-earnings">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Your Earnings</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-green-700">£{(totalNet / 100).toFixed(2)}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Your share of all sales</p>
          </CardContent>
        </Card>

        <Card data-testid="card-units-sold">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Units Sold</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{totalUnits}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Across all artworks</p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-commissions-table">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5" />
            Per-Artwork Breakdown
          </CardTitle>
          <CardDescription>
            Your earnings for each artwork sold through the East Side Studio shop
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : artworkCommissions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artwork</TableHead>
                  <TableHead className="text-right">Units Sold</TableHead>
                  <TableHead className="text-right">Your Earnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {artworkCommissions.map((item) => (
                  <TableRow key={item.productId} data-testid={`row-commission-${item.productId}`}>
                    <TableCell className="font-medium">
                      <span className="line-clamp-2">{item.productTitle}</span>
                    </TableCell>
                    <TableCell className="text-right">{item.unitsSold}</TableCell>
                    <TableCell className="text-right font-semibold text-green-700">
                      £{(item.netCommission / 100).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="font-bold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{totalUnits}</TableCell>
                  <TableCell className="text-right text-green-700">£{(totalNet / 100).toFixed(2)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <Handshake className="h-10 w-10 mx-auto opacity-30" />
              <p className="font-medium">No commission data yet</p>
              <p className="text-sm">Commissions will appear here once your artwork starts selling.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
