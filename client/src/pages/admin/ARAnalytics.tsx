import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Monitor, MousePointerClick, Eye, TrendingUp, Users, ShoppingCart, PoundSterling, Clock, Percent, RefreshCw, QrCode, Globe, Zap, CheckCircle } from "lucide-react";

interface AnalyticsSummary {
  totalEvents: number;
  uniqueSessions: number;
  byPlatform: { platform: string; count: number }[];
  byEventType: { eventType: string; count: number }[];
  topProducts: { productTitle: string; count: number }[];
  dailyTrend: { date: string; count: number }[];
  byCountry: { country: string; countryCode: string; count: number }[];
  qrScans: number;
  completionRate: number;
  avgGenerationTimeMs: number | null;
}

interface ConversionStats {
  totalConversions: number;
  totalRevenue: number;
  conversionRate: number;
  avgTimeToPurchase: number;
  byPlatform: { platform: string; conversions: number; revenue: number }[];
  topConvertingProducts: { productHandle: string; productTitle: string; conversions: number; revenue: number }[];
}

export default function ARAnalytics() {
  const [days, setDays] = useState("7");

  const { data: summary, isLoading, error } = useQuery<AnalyticsSummary>({
    queryKey: ["/api/admin/ar-analytics/summary", { days }],
    queryFn: async () => {
      const response = await fetch(`/api/admin/ar-analytics/summary?days=${days}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error("Failed to fetch analytics");
      return response.json();
    },
  });

  const { data: conversionStats, isLoading: conversionLoading, error: conversionError } = useQuery<ConversionStats>({
    queryKey: ["/api/admin/ar-analytics/conversions", { days }],
    queryFn: async () => {
      const response = await fetch(`/api/admin/ar-analytics/conversions?days=${days}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error("Failed to fetch conversions");
      return response.json();
    },
  });

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case "ios":
      case "android":
        return <Smartphone className="w-4 h-4" />;
      default:
        return <Monitor className="w-4 h-4" />;
    }
  };

  const getPlatformLabel = (platform: string) => {
    switch (platform) {
      case "ios": return "iOS";
      case "android": return "Android";
      case "desktop": return "Desktop";
      default: return platform;
    }
  };

  const getEventLabel = (eventType: string) => {
    switch (eventType) {
      case "ar_button_click": return "Button Clicks";
      case "ar_launch_ios": return "iOS AR Launches";
      case "ar_launch_android": return "Android AR Launches";
      case "ar_launch_desktop": return "Desktop Viewer Opens";
      default: return eventType;
    }
  };

  const getCountryFlag = (countryCode: string) => {
    if (!countryCode || countryCode.length !== 2) return "🌍";
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  const buttonClicks = summary?.byEventType.find(e => e.eventType === "ar_button_click")?.count || 0;
  const arLaunches = (summary?.byEventType || [])
    .filter(e => e.eventType.startsWith("ar_launch_"))
    .reduce((sum, e) => sum + e.count, 0);

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold font-display">AR Analytics</h1>
          <p className="text-muted-foreground mt-2">
            Track engagement with the AR "View in Your Space" feature
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="font-medium">Debug tip:</span> Open browser console and run{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">window.EASTSIDE_AR_DEBUG = true</code>{" "}
            to enable verbose AR logging
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[180px]" data-testid="select-date-range">
              <SelectValue placeholder="Select date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/admin/ar-analytics/summary"] });
              queryClient.invalidateQueries({ queryKey: ["/api/admin/ar-analytics/conversions"] });
            }}
            data-testid="button-refresh-analytics"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading analytics...</div>
      ) : error ? (
        <div className="text-center py-12 text-destructive">
          Failed to load analytics. Please try again.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card data-testid="card-total-events">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">AR Views</CardTitle>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary?.totalEvents || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Successful AR launches
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-unique-sessions">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Unique Sessions</CardTitle>
                <Users className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary?.uniqueSessions || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Unique visitors using AR
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-button-clicks">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Button Clicks</CardTitle>
                <MousePointerClick className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{buttonClicks}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  "View in Your Space" clicks
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-ar-launches">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">AR Launches</CardTitle>
                <Eye className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{arLaunches}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Successful AR experiences
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card data-testid="card-qr-scans">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">QR Code Scans</CardTitle>
                <QrCode className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary?.qrScans || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Desktop to mobile via QR
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-completion-rate">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
                <CheckCircle className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {buttonClicks > 0 ? `${summary?.completionRate || 0}%` : "—"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Clicks that launch AR
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-avg-generation-time">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Load Time</CardTitle>
                <Zap className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summary?.avgGenerationTimeMs 
                    ? `${(summary.avgGenerationTimeMs / 1000).toFixed(1)}s`
                    : "—"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  3D model generation time
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-countries">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Countries</CardTitle>
                <Globe className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary?.byCountry?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Unique countries reached
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="border-t pt-6 mt-2">
            <h2 className="text-xl font-semibold mb-4">Conversion Tracking</h2>
            {conversionError && (
              <div className="text-destructive text-sm mb-4">Failed to load conversion data</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card data-testid="card-conversions">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">AR Conversions</CardTitle>
                  <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{conversionLoading ? "..." : conversionStats?.totalConversions || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Purchases after AR view
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-revenue">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">AR Revenue</CardTitle>
                  <PoundSterling className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{conversionLoading ? "..." : formatCurrency(conversionStats?.totalRevenue || 0)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Revenue from AR users
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-conversion-rate">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
                  <Percent className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{conversionLoading ? "..." : `${(conversionStats?.conversionRate || 0).toFixed(1)}%`}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    AR view to purchase
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-time-to-purchase">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Time to Purchase</CardTitle>
                  <Clock className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{conversionLoading ? "..." : formatTime(conversionStats?.avgTimeToPurchase || 0)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    From AR view to checkout
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Platform Breakdown</CardTitle>
                <CardDescription>AR usage by device type</CardDescription>
              </CardHeader>
              <CardContent>
                {(summary?.byPlatform?.length || 0) === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No data yet</p>
                ) : (
                  <div className="space-y-4">
                    {summary?.byPlatform.map((item) => {
                      const percentage = summary.totalEvents > 0 
                        ? Math.round((item.count / summary.totalEvents) * 100) 
                        : 0;
                      return (
                        <div key={item.platform} className="flex items-center gap-4">
                          <div className="flex items-center gap-2 w-24">
                            {getPlatformIcon(item.platform)}
                            <span className="font-medium">{getPlatformLabel(item.platform)}</span>
                          </div>
                          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <div className="w-20 text-right text-sm text-muted-foreground">
                            {item.count} ({percentage}%)
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Event Types</CardTitle>
                <CardDescription>Breakdown of AR interactions</CardDescription>
              </CardHeader>
              <CardContent>
                {(summary?.byEventType?.length || 0) === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No data yet</p>
                ) : (
                  <div className="space-y-3">
                    {summary?.byEventType.map((item) => (
                      <div key={item.eventType} className="flex items-center justify-between p-3 border rounded-lg">
                        <span>{getEventLabel(item.eventType)}</span>
                        <Badge variant="secondary">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card data-testid="card-geographic-distribution">
              <CardHeader>
                <CardTitle>Geographic Distribution</CardTitle>
                <CardDescription>Top countries using AR</CardDescription>
              </CardHeader>
              <CardContent>
                {(summary?.byCountry?.length || 0) === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No geographic data yet</p>
                ) : (
                  <div className="space-y-2">
                    {summary?.byCountry.slice(0, 10).map((item, index) => {
                      const totalViews = summary?.totalEvents || 1;
                      const percentage = Math.round((item.count / totalViews) * 100);
                      return (
                        <div 
                          key={item.country} 
                          className="flex items-center justify-between p-3 border rounded-lg"
                          data-testid={`country-row-${index}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">{getCountryFlag(item.countryCode)}</span>
                            <span className="font-medium">{item.country}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{item.count} views</Badge>
                            <span className="text-sm text-muted-foreground">({percentage}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card data-testid="card-popular-frames">
              <CardHeader>
                <CardTitle>Popular Frame Styles</CardTitle>
                <CardDescription>Most viewed frame combinations</CardDescription>
              </CardHeader>
              <CardContent>
                {(summary?.byFrame?.length || 0) === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No frame data yet</p>
                ) : (
                  <div className="space-y-2">
                    {summary?.byFrame.map((item, index) => {
                      const totalViews = summary?.totalEvents || 1;
                      const percentage = Math.round((item.count / totalViews) * 100);
                      return (
                        <div 
                          key={`${item.frame}-${item.frameType}`} 
                          className="flex items-center justify-between p-3 border rounded-lg"
                          data-testid={`frame-row-${index}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                              {index + 1}
                            </span>
                            <div className="flex flex-col">
                              <span className="font-medium capitalize">{item.frame}</span>
                              {item.frameType === 'box' && (
                                <span className="text-xs text-muted-foreground">Box Frame</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{item.count}</Badge>
                            <span className="text-sm text-muted-foreground">({percentage}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-popular-sizes">
              <CardHeader>
                <CardTitle>Popular Print Sizes</CardTitle>
                <CardDescription>Most viewed sizes in AR</CardDescription>
              </CardHeader>
              <CardContent>
                {(summary?.bySize?.length || 0) === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No size data yet</p>
                ) : (
                  <div className="space-y-2">
                    {summary?.bySize.map((item, index) => {
                      const totalViews = summary?.totalEvents || 1;
                      const percentage = Math.round((item.count / totalViews) * 100);
                      return (
                        <div 
                          key={item.size} 
                          className="flex items-center justify-between p-3 border rounded-lg"
                          data-testid={`size-row-${index}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                              {index + 1}
                            </span>
                            <span className="font-medium">{item.size}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{item.count}</Badge>
                            <span className="text-sm text-muted-foreground">({percentage}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Products Scanned</span>
                  {(summary?.topProducts?.length || 0) > 0 && (
                    <Badge variant="secondary">{summary?.topProducts.length} products</Badge>
                  )}
                </CardTitle>
                <CardDescription>All products viewed in AR during this period</CardDescription>
              </CardHeader>
              <CardContent>
                {(summary?.topProducts?.length || 0) === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No product data yet</p>
                ) : (
                  <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
                    {summary?.topProducts.map((product, index) => (
                      <div 
                        key={product.productTitle || index} 
                        className="flex items-center justify-between p-3 border rounded-lg"
                        data-testid={`product-row-${index}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 h-6 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                            {index + 1}
                          </span>
                          <span className="font-medium truncate">
                            {product.productTitle || "Unknown Product"}
                          </span>
                        </div>
                        <Badge variant="outline" className="shrink-0 ml-2">{product.count} views</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Converting Products</span>
                  {(conversionStats?.topConvertingProducts?.length || 0) > 0 && (
                    <Badge variant="secondary">{conversionStats?.topConvertingProducts.length} products</Badge>
                  )}
                </CardTitle>
                <CardDescription>Products with AR conversion revenue</CardDescription>
              </CardHeader>
              <CardContent>
                {(conversionStats?.topConvertingProducts?.length || 0) === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No conversion data yet</p>
                ) : (
                  <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
                    {conversionStats?.topConvertingProducts.map((product, index) => (
                      <div 
                        key={product.productHandle || index} 
                        className="flex items-center justify-between p-3 border rounded-lg"
                        data-testid={`converting-product-row-${index}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 h-6 shrink-0 rounded-full bg-green-500/10 flex items-center justify-center text-sm font-medium text-green-600">
                            {index + 1}
                          </span>
                          <span className="font-medium truncate">
                            {product.productTitle || "Unknown Product"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <Badge variant="outline">{product.conversions} sales</Badge>
                          <Badge variant="secondary">{formatCurrency(product.revenue)}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Daily Trend</CardTitle>
              <CardDescription>AR usage over time</CardDescription>
            </CardHeader>
            <CardContent>
              {(summary?.dailyTrend?.length || 0) === 0 ? (
                <p className="text-muted-foreground text-center py-8">No data yet</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-end gap-1 h-40 border-b border-border pb-2">
                    {summary?.dailyTrend.map((day) => {
                      const maxCount = Math.max(...(summary.dailyTrend.map(d => d.count) || [1]), 1);
                      const height = (day.count / maxCount) * 100;
                      return (
                        <div 
                          key={day.date} 
                          className="flex-1 flex flex-col items-center justify-end h-full group cursor-pointer"
                          title={`${new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${day.count} events`}
                        >
                          <span className="text-xs text-muted-foreground mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {day.count}
                          </span>
                          <div 
                            className="w-full bg-primary rounded-t transition-all group-hover:bg-primary/80"
                            style={{ height: `${Math.max(height, 2)}%`, minHeight: day.count > 0 ? '8px' : '2px' }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {summary.dailyTrend.length <= 14 && (
                    <div className="flex gap-1">
                      {summary.dailyTrend.map((day) => (
                        <div key={day.date} className="flex-1 text-center">
                          <span className="text-xs text-muted-foreground">
                            {new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
