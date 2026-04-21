import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  Package,
  Image as ImageIcon,
  ChevronRight,
  Upload,
  ShoppingBag,
  Star,
  Layers,
  BarChart3,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Artwork, ArtistAccount, ArtistSales, PayoutItem } from "@shared/schema";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { artistQueryFn } from "@/lib/artistApiRequest";
import { format, startOfMonth, subMonths, isSameMonth, endOfMonth } from "date-fns";
import { Link } from "wouter";

async function impersonationFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json() as Promise<T>;
}

interface ShopifyProduct {
  id: string;
  title: string;
  vendor: string;
  status: string;
  featuredImageUrl: string | null;
  handle: string | null;
  createdAt: string;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function fmtGBP(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

const chartConfig: ChartConfig = {
  commission: {
    label: "Commission",
    color: "hsl(0 0% 9%)",
  },
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-neutral-200 rounded-lg shadow-lg px-3 py-2 text-xs">
        <p className="font-semibold text-neutral-900 mb-0.5">{label}</p>
        <p className="text-neutral-500">
          Commission: <span className="font-medium text-neutral-900">{fmtGBP(payload[0].value)}</span>
        </p>
      </div>
    );
  }
  return null;
};

const RANGE_OPTIONS = [
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "12M", months: 12 },
];

export default function ArtistDashboard() {
  const [chartRange, setChartRange] = useState(6);
  const { apiPrefix, isImpersonating, artistProfile, isLoading: impersonationLoading } = useImpersonation();

  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery<ArtistAccount>({
    queryKey: [apiPrefix, "profile"],
    queryFn: () => artistQueryFn<ArtistAccount>("/api/artist/profile"),
    enabled: !isImpersonating,
  });

  const activeProfile = isImpersonating ? artistProfile : profile;
  const isProfileLoading = isImpersonating ? impersonationLoading : profileLoading;

  const { data: artworks, isLoading: artworksLoading } = useQuery<Artwork[]>({
    queryKey: [apiPrefix, "artworks"],
    queryFn: () => isImpersonating
      ? impersonationFetch<Artwork[]>(`${apiPrefix}/artworks`)
      : artistQueryFn<Artwork[]>("/api/artist/artworks"),
    enabled: !!activeProfile,
  });

  const { data: liveProducts, isLoading: collectionLoading } = useQuery<ShopifyProduct[]>({
    queryKey: [apiPrefix, "collection"],
    queryFn: () => isImpersonating
      ? impersonationFetch<ShopifyProduct[]>(`${apiPrefix}/collection`)
      : artistQueryFn<ShopifyProduct[]>("/api/artist/collection"),
    enabled: !!activeProfile,
  });

  const { data: sales, isLoading: salesLoading } = useQuery<ArtistSales[]>({
    queryKey: [apiPrefix, "sales"],
    queryFn: () => isImpersonating
      ? impersonationFetch<ArtistSales[]>(`${apiPrefix}/sales`)
      : artistQueryFn<ArtistSales[]>("/api/artist/sales"),
    enabled: !!activeProfile,
  });

  const { data: payoutItems, isLoading: payoutsLoading } = useQuery<PayoutItem[]>({
    queryKey: [apiPrefix, "payouts"],
    queryFn: () => isImpersonating
      ? impersonationFetch<PayoutItem[]>(`${apiPrefix}/payouts`)
      : artistQueryFn<PayoutItem[]>("/api/artist/payouts"),
    enabled: !!activeProfile,
  });

  if (profileError && !isImpersonating) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <h2 className="font-semibold text-lg">Account Not Linked</h2>
          <p className="text-sm text-neutral-500 mt-1">
            Your account hasn't been linked to an artist profile yet. Please contact the admin.
          </p>
        </Card>
      </div>
    );
  }

  const isLoading = isProfileLoading || artworksLoading || collectionLoading || salesLoading || payoutsLoading;

  const now = new Date();
  const thisMonth = startOfMonth(now);
  const lastMonth = startOfMonth(subMonths(now, 1));

  const thisMonthSales = sales?.filter(s => isSameMonth(new Date(s.periodStart), thisMonth)) ?? [];
  const lastMonthSales = sales?.filter(s => isSameMonth(new Date(s.periodStart), lastMonth)) ?? [];
  const thisMonthNet = thisMonthSales.reduce((sum, s) => sum + (s.netRevenue ?? 0), 0);
  const lastMonthNet = lastMonthSales.reduce((sum, s) => sum + (s.netRevenue ?? 0), 0);
  const pctChange = lastMonthNet > 0
    ? Math.round(((thisMonthNet - lastMonthNet) / lastMonthNet) * 100)
    : null;

  const nextPayout = payoutItems
    ?.filter(p => p.status === "pending" || p.status === "queued" || p.status === "processing")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
  const payoutAmount = nextPayout?.netAmount ?? 0;
  const commissionMonth: string | null = nextPayout
    ? (nextPayout.metadata?.salesPeriod
        ?? format(subMonths(new Date(nextPayout.createdAt), 1), "MMMM yyyy"))
    : null;
  const payoutDueDate = format(endOfMonth(now), "d MMMM yyyy");

  const liveCount = liveProducts?.length ?? 0;
  const pendingCount = artworks?.filter(a => a.status !== "exported").length ?? 0;

  // Chart data — driven by chartRange
  const chartMonths = Array.from({ length: chartRange }, (_, i) => subMonths(now, chartRange - 1 - i));
  const chartData = chartMonths.map(m => {
    const monthSales = sales?.filter(s => isSameMonth(new Date(s.periodStart), m)) ?? [];
    return {
      month: format(m, "MMM"),
      commission: monthSales.reduce((sum, s) => sum + (s.netRevenue ?? 0), 0),
      isCurrent: isSameMonth(m, now),
    };
  });

  // Bestseller
  const productMap = new Map<string, { title: string; units: number; revenue: number; productId: string }>();
  sales?.forEach(s => {
    s.productBreakdown?.forEach((pb: any) => {
      const existing = productMap.get(pb.productId);
      if (existing) {
        existing.units += pb.units;
        existing.revenue += pb.revenue;
      } else {
        productMap.set(pb.productId, { title: pb.productTitle, units: pb.units, revenue: pb.revenue, productId: pb.productId });
      }
    });
  });
  const bestseller = [...productMap.values()].sort((a, b) => b.units - a.units)[0] ?? null;

  // Find bestseller image from live products
  const bestsellerProduct = bestseller
    ? liveProducts?.find(p => {
        const pid = p.id.split("/").pop();
        const bpid = bestseller.productId?.split("/").pop();
        return pid === bpid || p.title === bestseller.title;
      }) ?? null
    : null;

  // Recent sales
  const recentSales = (sales ?? [])
    .sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime())
    .slice(0, 5)
    .flatMap(s => (s.productBreakdown ?? []).map((pb: any) => ({
      title: pb.productTitle,
      period: format(new Date(s.periodEnd), "MMM yyyy"),
      units: pb.units,
      amount: pb.revenue,
      productId: pb.productId,
    })))
    .slice(0, 5);

  const firstName = (() => {
    const name = isImpersonating
      ? (artistProfile?.displayName || artistProfile?.vendorName || "Artist")
      : (profile?.displayName || profile?.vendorName || "");
    return name.split(" ")[0] || "Artist";
  })();

  const totalNetAllTime = sales?.reduce((sum, s) => sum + (s.netRevenue ?? 0), 0) ?? 0;
  const totalUnitsAllTime = sales?.reduce((sum, s) => sum + (s.totalUnits ?? 0), 0) ?? 0;

  return (
    <div className="min-h-full bg-neutral-50/50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            {isLoading ? (
              <>
                <Skeleton className="h-7 w-48 mb-2" />
                <Skeleton className="h-4 w-72" />
              </>
            ) : (
              <>
                <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
                  {getGreeting()}, {firstName}
                </h1>
                <p className="text-sm text-neutral-500 mt-1">
                  Here's an overview of your gallery performance.
                </p>
              </>
            )}
          </div>
          {!isImpersonating && (
            <Button asChild size="sm" className="hidden sm:flex gap-2">
              <Link href="/artist/upload">
                <Upload className="h-4 w-4" />
                Upload Artwork
              </Link>
            </Button>
          )}
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          <Card className="bg-white shadow-sm border-neutral-200/70">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-neutral-100">
                  <Calendar className="h-4 w-4 text-neutral-600" />
                </div>
                <Badge variant="secondary" className="text-[11px] font-normal text-neutral-500 bg-neutral-100">
                  Pending
                </Badge>
              </div>
              <p className="text-xs font-medium text-neutral-500 mb-1">Next Payout</p>
              {isLoading ? (
                <>
                  <Skeleton className="h-7 w-24 mb-1" />
                  <Skeleton className="h-3 w-32" />
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold tracking-tight text-neutral-900">
                    {payoutAmount > 0 ? fmtGBP(payoutAmount) : "—"}
                  </p>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    {commissionMonth ? `${commissionMonth} commissions` : `Est. ${payoutDueDate}`}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm border-neutral-200/70">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-green-50">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </div>
                {pctChange !== null && !isLoading && (
                  <Badge className={`text-[11px] font-medium border-0 shadow-none flex items-center gap-0.5 ${pctChange >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                    {pctChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {pctChange >= 0 ? "+" : ""}{pctChange}%
                  </Badge>
                )}
              </div>
              <p className="text-xs font-medium text-neutral-500 mb-1">This Month</p>
              {isLoading ? (
                <>
                  <Skeleton className="h-7 w-24 mb-1" />
                  <Skeleton className="h-3 w-28" />
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold tracking-tight text-neutral-900">{fmtGBP(thisMonthNet)}</p>
                  {lastMonthNet > 0 && (
                    <p className="text-[11px] text-neutral-400 mt-1">vs {fmtGBP(lastMonthNet)} last month</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm border-neutral-200/70">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-blue-50">
                  <Layers className="h-4 w-4 text-blue-600" />
                </div>
              </div>
              <p className="text-xs font-medium text-neutral-500 mb-1">Live Artworks</p>
              {isLoading ? (
                <>
                  <Skeleton className="h-7 w-16 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold tracking-tight text-neutral-900">{liveCount}</p>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    {pendingCount > 0 ? `${pendingCount} pending review` : "All live on shop"}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm border-neutral-200/70">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-amber-50">
                  <ShoppingBag className="h-4 w-4 text-amber-600" />
                </div>
              </div>
              <p className="text-xs font-medium text-neutral-500 mb-1">Total Earned</p>
              {isLoading ? (
                <>
                  <Skeleton className="h-7 w-24 mb-1" />
                  <Skeleton className="h-3 w-20" />
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold tracking-tight text-neutral-900">{fmtGBP(totalNetAllTime)}</p>
                  <p className="text-[11px] text-neutral-400 mt-1">{totalUnitsAllTime} units sold all-time</p>
                </>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Main Content Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Revenue Chart — 2 cols */}
          <Card className="lg:col-span-2 bg-white shadow-sm border-neutral-200/70">
            <CardHeader className="pb-2 pt-5 px-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-neutral-400" />
                    Commission Revenue
                  </CardTitle>
                  <CardDescription className="text-xs text-neutral-400 mt-0.5">
                    Monthly commission earnings
                  </CardDescription>
                </div>
                <div className="flex items-center gap-0.5 bg-neutral-100 rounded-lg p-0.5">
                  {RANGE_OPTIONS.map(opt => (
                    <button
                      key={opt.label}
                      onClick={() => setChartRange(opt.months)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                        chartRange === opt.months
                          ? "bg-white text-neutral-900 shadow-sm"
                          : "text-neutral-400 hover:text-neutral-600"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              {isLoading ? (
                <div className="flex items-end gap-3 h-48 px-4">
                  {[55, 80, 35, 90, 60, 45].map((h, i) => (
                    <Skeleton key={i} className="flex-1 rounded-md" style={{ height: `${h}%` }} />
                  ))}
                </div>
              ) : (
                <ChartContainer config={chartConfig} className="h-52 w-full">
                  <BarChart data={chartData} barCategoryGap="30%" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#f0f0f0" />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "#9ca3af" }}
                      dy={4}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                      tickFormatter={(v) => v === 0 ? "£0" : `£${(v / 100).toFixed(0)}`}
                      width={44}
                    />
                    <ChartTooltip content={<CustomTooltip />} cursor={{ fill: "#f9fafb", radius: 4 }} />
                    <Bar dataKey="commission" radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.isCurrent ? "hsl(0 0% 9%)" : "hsl(0 0% 88%)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* Bestseller Tile */}
          <Card className="bg-white shadow-sm border-neutral-200/70 overflow-hidden flex flex-col">
            <CardHeader className="pb-3 pt-5 px-5">
              <CardTitle className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-500" />
                Top Seller
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 flex-1 flex flex-col">
              {isLoading ? (
                <>
                  <Skeleton className="w-full aspect-[4/3] rounded-xl mb-4" />
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </>
              ) : bestseller ? (
                <>
                  <div className="relative rounded-xl overflow-hidden bg-neutral-100 aspect-[4/3] mb-4 flex-shrink-0">
                    {bestsellerProduct?.featuredImageUrl ? (
                      <img
                        src={bestsellerProduct.featuredImageUrl}
                        alt={bestseller.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200">
                        <ImageIcon className="h-8 w-8 text-neutral-300" />
                      </div>
                    )}
                    <div className="absolute top-2.5 left-2.5">
                      <Badge className="bg-amber-50 text-amber-700 border border-amber-200 shadow-none text-[10px] font-semibold px-2 py-0.5">
                        ★ Best Seller
                      </Badge>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-neutral-900 text-sm leading-tight line-clamp-2 mb-2">
                      {bestseller.title}
                    </h3>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-500">{bestseller.units} units sold</span>
                      <span className="font-semibold text-neutral-900">{fmtGBP(bestseller.revenue)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                  <Star className="h-8 w-8 text-neutral-200 mb-3" />
                  <p className="text-sm text-neutral-400 font-medium">No sales yet</p>
                  <p className="text-xs text-neutral-300 mt-1">Your top seller will appear here</p>
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Portfolio Grid */}
          <Card className="lg:col-span-2 bg-white shadow-sm border-neutral-200/70">
            <CardHeader className="pb-3 pt-5 px-5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-neutral-400" />
                    Portfolio
                  </CardTitle>
                  <CardDescription className="text-xs text-neutral-400 mt-0.5">
                    Your live artworks on the shop
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {!isLoading && (
                    <Badge variant="outline" className="text-[11px] text-neutral-500 font-normal">
                      {liveCount} live
                    </Badge>
                  )}
                  <Link href="/artist/artworks">
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-neutral-500 hover:text-neutral-900 px-2">
                      View all
                      <ChevronRight className="h-3 w-3 ml-0.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {isLoading ? (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="aspect-square rounded-lg" />
                  ))}
                </div>
              ) : liveProducts && liveProducts.length > 0 ? (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {liveProducts.slice(0, 12).map((product, i) => (
                    <div
                      key={product.id}
                      className="aspect-square rounded-lg overflow-hidden bg-neutral-100 border border-neutral-100 relative group"
                    >
                      {product.featuredImageUrl ? (
                        <img
                          src={product.featuredImageUrl}
                          alt={product.title}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          title={product.title}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"
                          style={{ background: `linear-gradient(135deg, hsl(${i * 37 + 40}, 15%, 92%), hsl(${i * 37 + 40}, 15%, 86%))` }}>
                          <ImageIcon className="h-3 w-3 text-neutral-300" />
                        </div>
                      )}
                    </div>
                  ))}
                  {liveCount > 12 && (
                    <Link href="/artist/artworks">
                      <div className="aspect-square rounded-lg overflow-hidden bg-neutral-100 border border-neutral-200 flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-200 transition-colors">
                        <span className="text-xs font-medium text-neutral-500">+{liveCount - 12}</span>
                        <span className="text-[10px] text-neutral-400">more</span>
                      </div>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <ImageIcon className="h-8 w-8 text-neutral-200 mb-2" />
                  <p className="text-sm text-neutral-400 font-medium">No artworks yet</p>
                  <p className="text-xs text-neutral-300 mt-1">Upload your first artwork to get started</p>
                </div>
              )}
              {pendingCount > 0 && !isLoading && (
                <div className="mt-4 pt-4 border-t border-neutral-100 flex items-center justify-between">
                  <span className="text-xs text-neutral-400">{pendingCount} pending review</span>
                  <Link href="/artist/artworks">
                    <span className="text-xs text-neutral-500 hover:text-neutral-900 cursor-pointer transition-colors font-medium">Review →</span>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Sales */}
          <Card className="bg-white shadow-sm border-neutral-200/70 flex flex-col">
            <CardHeader className="pb-3 pt-5 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                  <Package className="h-4 w-4 text-neutral-400" />
                  Recent Sales
                </CardTitle>
                <Link href="/artist/sales">
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-neutral-500 hover:text-neutral-900 px-2">
                    View all
                    <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0 flex-1">
              {isLoading ? (
                <div className="space-y-0 divide-y divide-neutral-100 px-5">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 py-3">
                      <Skeleton className="h-9 w-9 rounded-lg flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <Skeleton className="h-3.5 w-28 mb-1.5" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                      <Skeleton className="h-3.5 w-14" />
                    </div>
                  ))}
                </div>
              ) : recentSales.length > 0 ? (
                <div className="divide-y divide-neutral-100">
                  {recentSales.map((sale, i) => {
                    const productImg = liveProducts?.find(p => {
                      const pid = p.id.split("/").pop();
                      const spid = sale.productId?.split("/").pop();
                      return pid === spid || p.title === sale.title;
                    })?.featuredImageUrl ?? null;

                    return (
                      <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 transition-colors">
                        <div className="h-9 w-9 rounded-lg overflow-hidden bg-neutral-100 flex-shrink-0 border border-neutral-100">
                          {productImg ? (
                            <img src={productImg} alt={sale.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="h-3.5 w-3.5 text-neutral-300" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-neutral-900 truncate">{sale.title}</p>
                          <p className="text-[11px] text-neutral-400 mt-0.5">{sale.period} · {sale.units} unit{sale.units !== 1 ? "s" : ""}</p>
                        </div>
                        <span className="text-xs font-semibold text-neutral-900 flex-shrink-0">{fmtGBP(sale.amount)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center px-5">
                  <Package className="h-7 w-7 text-neutral-200 mb-2" />
                  <p className="text-sm text-neutral-400 font-medium">No sales yet</p>
                  <p className="text-xs text-neutral-300 mt-1">Sales will appear here once your artwork sells</p>
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
