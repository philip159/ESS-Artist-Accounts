import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  FolderSearch,
  Upload,
  ImageIcon,
  ShieldCheck,
  ShieldX,
  CheckSquare,
  Square,
  Zap,
  AlertTriangle,
  Eye,
} from "lucide-react";

interface RatioImageInfo {
  url: string | null;
  hasImage: boolean;
  width: number | null;
  height: number | null;
}

const APPROVED_STORAGE_KEY = "multiRatioApproved";
function loadApprovedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(APPROVED_STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}
function saveApprovedIds(ids: Set<string>) {
  localStorage.setItem(APPROVED_STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

let _refetchTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedRefetchProducts() {
  if (_refetchTimer) clearTimeout(_refetchTimer);
  _refetchTimer = setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/multi-ratio/products"] });
    _refetchTimer = null;
  }, 5000);
}

interface Product {
  productId: string;
  gid: string;
  title: string;
  handle: string;
  vendor: string;
  status: string;
  sizes: string[];
  featuredImageUrl: string | null;
  ratioImages: Record<string, RatioImageInfo>;
  wavImageRatio: string | null;
  wavImageDimensions: { width: number; height: number } | null;
  totalInventory: number;
  salesCount90d: number;
}

const PRINT_SIZES: { key: string; label: string; wMm: number; hMm: number }[] = [
  { key: "6x8", label: '6" x 8"', wMm: 152, hMm: 203 },
  { key: "8x10", label: '8" x 10"', wMm: 203, hMm: 254 },
  { key: "a4", label: "A4", wMm: 210, hMm: 297 },
  { key: "8x12", label: '8" x 12"', wMm: 203, hMm: 305 },
  { key: "11x14", label: '11" x 14"', wMm: 279, hMm: 356 },
  { key: "a3", label: "A3", wMm: 297, hMm: 420 },
  { key: "12x16", label: '12" x 16"', wMm: 305, hMm: 406 },
  { key: "12x18", label: '12" x 18"', wMm: 305, hMm: 457 },
  { key: "16x20", label: '16" x 20"', wMm: 406, hMm: 508 },
  { key: "a2", label: "A2", wMm: 420, hMm: 594 },
  { key: "18x24", label: '18" x 24"', wMm: 457, hMm: 610 },
  { key: "20x28", label: '20" x 28"', wMm: 508, hMm: 711 },
  { key: "20x30", label: '20" x 30"', wMm: 508, hMm: 762 },
  { key: "a1", label: "A1", wMm: 594, hMm: 841 },
  { key: "24x32", label: '24" x 32"', wMm: 610, hMm: 813 },
  { key: "24x36", label: '24" x 36"', wMm: 610, hMm: 914 },
  { key: "28x40", label: '28" x 40"', wMm: 711, hMm: 1016 },
  { key: "30x40", label: '30" x 40"', wMm: 762, hMm: 1016 },
  { key: "a0", label: "A0", wMm: 841, hMm: 1189 },
  { key: "12x12", label: '12" x 12"', wMm: 305, hMm: 305 },
  { key: "16x16", label: '16" x 16"', wMm: 406, hMm: 406 },
  { key: "20x20", label: '20" x 20"', wMm: 508, hMm: 508 },
  { key: "30x30", label: '30" x 30"', wMm: 762, hMm: 762 },
];

const RATIO_METAFIELD_MAP: Record<string, string> = {
  "5:7 / A-series": "ar_image_a_ratio",
  "3:4": "ar_image_3x4",
  "2:3": "ar_image_2x3",
  "4:5": "ar_image_4x5",
  "1:1": "ar_image_1x1",
};

function getRatioLabel(wMm: number, hMm: number): string {
  const r = Math.min(wMm, hMm) / Math.max(wMm, hMm);
  if (Math.abs(r - 1) < 0.01) return "1:1";
  if (Math.abs(r - 1 / Math.SQRT2) < 0.005 || Math.abs(r - 5 / 7) < 0.015) return "5:7 / A-series";
  if (Math.abs(r - 3 / 4) < 0.015) return "3:4";
  if (Math.abs(r - 4 / 5) < 0.015 || Math.abs(r - 11 / 14) < 0.015) return "4:5";
  if (Math.abs(r - 2 / 3) < 0.015) return "2:3";
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(Math.round(wMm), Math.round(hMm));
  return `${Math.round(Math.min(wMm, hMm) / g)}:${Math.round(Math.max(wMm, hMm) / g)}`;
}

function detectRatioLabel(w: number, h: number): string {
  if (w <= 0 || h <= 0) return "?";
  const r = Math.min(w, h) / Math.max(w, h);
  if (Math.abs(r - 1) < 0.02) return "1:1";
  if (Math.abs(r - 1 / Math.SQRT2) < 0.02 || Math.abs(r - 5 / 7) < 0.02) return "5:7 / A-series";
  if (Math.abs(r - 3 / 4) < 0.02) return "3:4";
  if (Math.abs(r - 4 / 5) < 0.02 || Math.abs(r - 11 / 14) < 0.02) return "4:5";
  if (Math.abs(r - 2 / 3) < 0.02) return "2:3";
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(short, long);
  return `${short / g}:${long / g}`;
}

function normaliseSizeString(s: string): string {
  return s.replace(/["\u201C\u201D\u2033\u2032\s]/g, "").toLowerCase();
}

function matchProductSize(sizeStr: string): { key: string; ratio: string } | null {
  const norm = normaliseSizeString(sizeStr);
  for (const ps of PRINT_SIZES) {
    if (norm.includes(ps.key)) {
      return { key: ps.key, ratio: getRatioLabel(ps.wMm, ps.hMm) };
    }
  }
  return null;
}

interface AnalysedProduct extends Product {
  ratios: Map<string, string[]>;
  ratioCount: number;
}

function analyseProduct(product: Product): AnalysedProduct {
  const ratios = new Map<string, string[]>();
  for (const size of product.sizes) {
    const match = matchProductSize(size);
    if (match) {
      if (!ratios.has(match.ratio)) ratios.set(match.ratio, []);
      ratios.get(match.ratio)!.push(match.key);
    }
  }
  return { ...product, ratios, ratioCount: ratios.size };
}

const RATIO_COLORS: Record<string, string> = {
  "1:1": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "5:7 / A-series": "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  "3:4": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "4:5": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "2:3": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

interface DropboxMatch {
  name: string;
  path: string;
  id: string;
  isFolder: boolean;
}

function isExcludedFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("mockup") || lower.includes("frame");
}

function RatioCell({
  ratio,
  sizes,
  imageInfo,
  productId,
  productTitle,
  isWavImageRatio,
}: {
  ratio: string;
  sizes: string[];
  imageInfo: RatioImageInfo | undefined;
  productId: string;
  productTitle: string;
  isWavImageRatio: boolean;
}) {
  const { toast } = useToast();
  const colorClass = RATIO_COLORS[ratio] || "bg-muted text-muted-foreground";
  const hasImage = imageInfo?.hasImage ?? false;
  const metafield = RATIO_METAFIELD_MAP[ratio] || "unknown";

  const [showSearch, setShowSearch] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [matches, setMatches] = useState<DropboxMatch[]>([]);
  const [isPushing, setIsPushing] = useState(false);
  const [dimensions, setDimensions] = useState<Record<string, { w: number; h: number; loading: boolean }>>({});
  const [allDimsChecked, setAllDimsChecked] = useState(false);
  const [customQuery, setCustomQuery] = useState("");

  const checkDimensions = async (path: string) => {
    setDimensions((prev) => ({ ...prev, [path]: { w: 0, h: 0, loading: true } }));
    try {
      const res = await fetch(
        `/api/dropbox/image-dimensions?path=${encodeURIComponent(path)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to get dimensions");
      const data = await res.json();
      setDimensions((prev) => ({ ...prev, [path]: { w: data.width, h: data.height, loading: false } }));
    } catch {
      setDimensions((prev) => ({ ...prev, [path]: { w: 0, h: 0, loading: false } }));
    }
  };

  const checkAllDimensions = async (files: DropboxMatch[]) => {
    setAllDimsChecked(false);
    const filtered = files.filter((m) => !m.isFolder && !isExcludedFile(m.name));
    await Promise.all(filtered.map((m) => checkDimensions(m.path)));
    setAllDimsChecked(true);
  };

  const searchDropbox = async (query?: string) => {
    setIsSearching(true);
    setMatches([]);
    setDimensions({});
    setAllDimsChecked(false);
    const searchTerm = query || productTitle;
    try {
      const res = await fetch(
        `/api/dropbox/search-artwork-all?title=${encodeURIComponent(searchTerm)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      const allMatches: DropboxMatch[] = data.matches || [];
      setMatches(allMatches);
      if (allMatches.length === 0) {
        toast({ title: "No matches found", description: `No files found in Dropbox for "${searchTerm}"` });
      } else {
        checkAllDimensions(allMatches);
      }
    } catch (err: any) {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const pushImage = async (path: string) => {
    setIsPushing(true);
    try {
      const res = await apiRequest("POST", "/api/admin/multi-ratio/push-image", { productId, dropboxPath: path, ratio });

      const data = await res.json();
      if (data.success) {
        toast({
          title: "Image pushed",
          description: `Set ${metafield} (${data.width}x${data.height})`,
        });
        debouncedRefetchProducts();
        setShowSearch(false);
      } else {
        toast({ title: "Push failed", description: data.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Push failed", description: err.message, variant: "destructive" });
    } finally {
      setIsPushing(false);
    }
  };

  const filteredMatches = matches.filter((m) => !m.isFolder && !isExcludedFile(m.name));

  const matchingRatioFiles = filteredMatches.filter((m) => {
    const dim = dimensions[m.path];
    if (!dim || dim.loading) return false;
    return detectRatioLabel(dim.w, dim.h) === ratio;
  });

  const otherFiles = filteredMatches.filter((m) => {
    const dim = dimensions[m.path];
    if (!dim || dim.loading) return false;
    return detectRatioLabel(dim.w, dim.h) !== ratio;
  });

  const noMatchingFound = allDimsChecked && matchingRatioFiles.length === 0;

  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="outline" className={`${colorClass} border-0`}>
          {ratio}
        </Badge>
        {hasImage ? (
          <Badge variant="outline" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">
            <Check className="w-3 h-3 mr-1" />
            {isWavImageRatio ? "via AR_image" : "Set"}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-0">
            <X className="w-3 h-3 mr-1" />
            Missing
          </Badge>
        )}
      </div>

      {imageInfo?.url && (
        <div className="mb-2">
          <img
            src={imageInfo.url}
            alt={`${ratio} preview`}
            className="w-full h-20 object-contain rounded bg-muted"
            data-testid={`img-ratio-preview-${ratio.replace(/[^a-z0-9]/gi, "")}`}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-1 mb-2">
        {sizes.map((sizeKey) => {
          const sizeInfo = PRINT_SIZES.find((p) => p.key === sizeKey);
          return (
            <Badge key={sizeKey} variant="outline" className="text-xs">
              {sizeInfo?.label || sizeKey}
            </Badge>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground mb-2 font-mono">custom.{metafield}</p>

      {!hasImage && !showSearch && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            setShowSearch(true);
            searchDropbox();
          }}
          data-testid={`button-search-${ratio.replace(/[^a-z0-9]/gi, "")}-${productId}`}
        >
          <FolderSearch className="w-3 h-3 mr-1" />
          Find in Dropbox
        </Button>
      )}

      {showSearch && (
        <div className="mt-2 space-y-2">
          <Separator />

          {isSearching && (
            <div className="flex items-center gap-2 py-2 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs text-muted-foreground">Searching Dropbox...</span>
            </div>
          )}

          {!isSearching && !allDimsChecked && filteredMatches.length > 0 && (
            <div className="flex items-center gap-2 py-2 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs text-muted-foreground">Checking dimensions...</span>
            </div>
          )}

          {!isSearching && filteredMatches.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No matches found</p>
          )}

          {matchingRatioFiles.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1 text-green-700 dark:text-green-300">
                Matching {ratio} images:
              </p>
              {matchingRatioFiles.map((match) => {
                const dim = dimensions[match.path];
                return (
                  <div key={match.id} className="flex items-center gap-2 py-1.5 border-b last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" title={match.name}>{match.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {dim.w}x{dim.h}px
                        <span className="ml-1 font-medium">({detectRatioLabel(dim.w, dim.h)})</span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => pushImage(match.path)}
                      disabled={isPushing}
                      data-testid={`button-push-${match.id}`}
                    >
                      {isPushing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />}
                      Push
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {noMatchingFound && otherFiles.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1 text-amber-700 dark:text-amber-300">
                No {ratio} images found. Other files:
              </p>
              {otherFiles.map((match) => {
                const dim = dimensions[match.path];
                return (
                  <div key={match.id} className="flex items-center gap-2 py-1.5 border-b last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" title={match.name}>{match.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {dim.w}x{dim.h}px
                        <span className="ml-1 font-medium">({detectRatioLabel(dim.w, dim.h)})</span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => pushImage(match.path)}
                      disabled={isPushing}
                      data-testid={`button-push-other-${match.id}`}
                    >
                      {isPushing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />}
                      Push
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {noMatchingFound && filteredMatches.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              No suitable images found in Dropbox.
            </p>
          )}

          <div className="space-y-1">
            <div className="flex gap-1">
              <Input
                placeholder="Custom search..."
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customQuery.trim()) {
                    searchDropbox(customQuery.trim());
                  }
                }}
                className="h-8 text-xs"
                data-testid={`input-custom-search-${ratio.replace(/[^a-z0-9]/gi, "")}`}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => customQuery.trim() ? searchDropbox(customQuery.trim()) : searchDropbox()}
                disabled={isSearching}
                data-testid={`button-retry-search-${ratio.replace(/[^a-z0-9]/gi, "")}`}
              >
                {isSearching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSearch(false)}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

interface BatchResult {
  productId: string;
  productTitle: string;
  ratio: string;
  match: DropboxMatch;
  width: number;
  height: number;
  selected: boolean;
}

interface BatchProgress {
  current: number;
  total: number;
  currentProduct: string;
  phase: "searching" | "dimensions" | "done";
}

function BatchSearchPanel({
  results,
  progress,
  isRunning,
  onToggleResult,
  onPushAll,
  onClose,
  isPushing,
  pushProgress,
}: {
  results: BatchResult[];
  progress: BatchProgress | null;
  isRunning: boolean;
  onToggleResult: (idx: number) => void;
  onPushAll: () => void;
  onClose: () => void;
  isPushing: boolean;
  pushProgress: { current: number; total: number } | null;
}) {
  const selectedCount = results.filter((r) => r.selected).length;
  const grouped = useMemo(() => {
    const map = new Map<string, BatchResult[]>();
    for (const r of results) {
      const key = r.productId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [results]);

  return (
    <Card className="p-4 space-y-3" data-testid="batch-search-panel">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold">Batch Search Results</h3>
        <div className="flex items-center gap-2">
          {isRunning && progress && (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs text-muted-foreground">
                {progress.phase === "searching" ? "Searching" : "Checking dims"} {progress.current}/{progress.total}: {progress.currentProduct}
              </span>
            </div>
          )}
          {!isRunning && results.length > 0 && (
            <Button
              size="sm"
              onClick={onPushAll}
              disabled={selectedCount === 0 || isPushing}
              data-testid="button-push-all-batch"
            >
              {isPushing ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  Pushing {pushProgress ? `${pushProgress.current}/${pushProgress.total}` : "..."}
                </>
              ) : (
                <>
                  <Upload className="w-3 h-3 mr-1" />
                  Push {selectedCount} image{selectedCount !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-batch">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {!isRunning && results.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No matching images found for the selected products.
        </p>
      )}

      {results.length > 0 && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {Array.from(grouped.entries()).map(([productId, items]) => (
            <div key={productId} className="border rounded-md p-2 space-y-1">
              <p className="text-xs font-medium truncate">{items[0].productTitle}</p>
              {items.map((item) => {
                const stableKey = `${item.productId}-${item.ratio}-${item.match.id}`;
                const idx = results.findIndex(
                  (r) => r.productId === item.productId && r.ratio === item.ratio && r.match.id === item.match.id
                );
                return (
                  <div key={stableKey} className="flex items-center gap-2 pl-2">
                    <Checkbox
                      checked={item.selected}
                      onCheckedChange={() => onToggleResult(idx)}
                      data-testid={`checkbox-batch-${stableKey}`}
                    />
                    <Badge variant="outline" className={`${RATIO_COLORS[item.ratio] || "bg-muted text-muted-foreground"} border-0 text-[10px]`}>
                      {item.ratio}
                    </Badge>
                    <span className="text-xs truncate flex-1" title={item.match.name}>
                      {item.match.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {item.width}x{item.height}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const AR_MAX_DIMENSION = 1000;

function ReviewCompletePanel({
  products,
  approvedIds,
  onClose,
}: {
  products: AnalysedProduct[];
  approvedIds: Set<string>;
  onClose: () => void;
}) {
  const completeProducts = useMemo(() => {
    return products.filter((p) => {
      if (approvedIds.has(p.productId)) return false;
      const ratios = Array.from(p.ratios.keys());
      return ratios.every((r) => p.ratioImages[r]?.hasImage);
    });
  }, [products, approvedIds]);

  const allImages = useMemo(() => {
    const items: {
      productId: string;
      productTitle: string;
      vendor: string;
      ratio: string;
      url: string;
      width: number | null;
      height: number | null;
      isOversized: boolean;
    }[] = [];
    for (const p of completeProducts) {
      for (const [ratio] of p.ratios.entries()) {
        const img = p.ratioImages[ratio];
        if (img?.hasImage && img.url) {
          const maxDim = Math.max(img.width || 0, img.height || 0);
          items.push({
            productId: p.productId,
            productTitle: p.title,
            vendor: p.vendor,
            ratio,
            url: img.url,
            width: img.width,
            height: img.height,
            isOversized: maxDim > AR_MAX_DIMENSION,
          });
        }
      }
    }
    return items;
  }, [completeProducts]);

  const oversizedCount = allImages.filter((i) => i.isOversized).length;
  const [showOversizedOnly, setShowOversizedOnly] = useState(false);

  const displayed = showOversizedOnly ? allImages.filter((i) => i.isOversized) : allImages;

  const grouped = useMemo(() => {
    const map = new Map<string, typeof displayed>();
    for (const item of displayed) {
      if (!map.has(item.productId)) map.set(item.productId, []);
      map.get(item.productId)!.push(item);
    }
    return map;
  }, [displayed]);

  return (
    <div className="space-y-4" data-testid="review-complete-panel">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Review Complete Products</h2>
          <p className="text-sm text-muted-foreground">
            {completeProducts.length} products with all AR images set ({allImages.length} total images)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {oversizedCount > 0 && (
            <Button
              variant={showOversizedOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowOversizedOnly(!showOversizedOnly)}
              data-testid="button-filter-oversized"
            >
              <AlertTriangle className="w-3 h-3 mr-1" />
              {oversizedCount} oversized ({`>${AR_MAX_DIMENSION}px`})
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-review">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {displayed.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          {showOversizedOnly ? "No oversized images found." : "No complete products to review."}
        </Card>
      ) : (
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([productId, items]) => (
            <Card key={productId} className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-medium truncate flex-1" data-testid={`text-review-title-${productId}`}>
                  {items[0].productTitle}
                </p>
                <span className="text-xs text-muted-foreground shrink-0">{items[0].vendor}</span>
                <a
                  href={`https://admin.shopify.com/store/east-side-studio/products/${productId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`link-review-shopify-${productId}`}
                >
                  <Button size="icon" variant="ghost">
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                </a>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {items.map((item) => (
                  <div
                    key={`${item.productId}-${item.ratio}`}
                    className={`rounded-md border p-1.5 ${item.isOversized ? "border-amber-400 dark:border-amber-600" : ""}`}
                    data-testid={`review-image-${item.productId}-${item.ratio.replace(/[^a-z0-9]/gi, "")}`}
                  >
                    <img
                      src={item.url}
                      alt={`${item.ratio} AR`}
                      className="w-full h-24 object-contain rounded bg-muted mb-1"
                    />
                    <div className="flex items-center justify-between gap-1">
                      <Badge
                        variant="outline"
                        className={`${RATIO_COLORS[item.ratio] || "bg-muted text-muted-foreground"} border-0 text-[10px]`}
                      >
                        {item.ratio}
                      </Badge>
                      <span className={`text-[10px] ${item.isOversized ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>
                        {item.width && item.height ? `${item.width}x${item.height}` : "?"}
                        {item.isOversized && (
                          <AlertTriangle className="w-3 h-3 inline ml-0.5 -mt-0.5" />
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductRow({
  product,
  expanded,
  onToggle,
  isApproved,
  onToggleApproved,
  isSelected,
  onToggleSelect,
  selectionMode,
}: {
  product: AnalysedProduct;
  expanded: boolean;
  onToggle: () => void;
  isApproved: boolean;
  onToggleApproved: () => void;
  isSelected: boolean;
  onToggleSelect: () => void;
  selectionMode: boolean;
}) {
  const productUrl = `https://admin.shopify.com/store/east-side-studio/products/${product.productId}`;

  const relevantRatios = Array.from(product.ratios.entries());
  const missingCount = relevantRatios.filter(
    ([ratio]) => !product.ratioImages[ratio]?.hasImage
  ).length;
  const totalRelevant = relevantRatios.length;

  return (
    <div className="border-b last:border-b-0" data-testid={`row-product-${product.productId}`}>
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover-elevate"
        onClick={onToggle}
        data-testid={`button-toggle-${product.productId}`}
      >
        {selectionMode && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={(e) => {
              onToggleSelect();
            }}
            onClick={(e) => e.stopPropagation()}
            data-testid={`checkbox-select-${product.productId}`}
          />
        )}

        {expanded ? (
          <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
        )}

        {product.featuredImageUrl ? (
          <img
            src={product.featuredImageUrl}
            alt={product.title}
            className="w-10 h-10 rounded object-cover shrink-0"
            data-testid={`img-product-${product.productId}`}
          />
        ) : (
          <div className="w-10 h-10 rounded bg-muted shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" data-testid={`text-title-${product.productId}`}>
            {product.title}
          </p>
          <p className="text-xs text-muted-foreground">
            {product.vendor}
            {product.salesCount90d > 0 && (
              <span className="ml-2 font-medium">
                {product.salesCount90d} sold (90d)
              </span>
            )}
            {product.wavImageDimensions && (
              <span className="ml-2 text-muted-foreground">
                AR_image: {product.wavImageRatio || "unknown ratio"} ({product.wavImageDimensions.width}x{product.wavImageDimensions.height})
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1 flex-wrap justify-end">
          {relevantRatios.map(([ratio, sizes]) => {
            const hasImg = product.ratioImages[ratio]?.hasImage;
            const colorClass = RATIO_COLORS[ratio] || "bg-muted text-muted-foreground";
            return (
              <Badge
                key={ratio}
                variant="outline"
                className={`${hasImg ? colorClass : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"} border-0`}
              >
                {hasImg ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
                {ratio}
              </Badge>
            );
          })}
        </div>

        {isApproved ? (
          <Badge variant="secondary" className="shrink-0 bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200">
            Approved
          </Badge>
        ) : missingCount > 0 ? (
          <Badge variant="secondary" className="shrink-0 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
            {missingCount} missing
          </Badge>
        ) : (
          <Badge variant="secondary" className="shrink-0 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            {totalRelevant}/{totalRelevant}
          </Badge>
        )}

        <Button
          size="icon"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onToggleApproved();
          }}
          className={isApproved ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"}
          data-testid={`button-approve-${product.productId}`}
          title={isApproved ? "Remove approval" : "Approve (single AR image covers all ratios)"}
        >
          {isApproved ? <ShieldCheck className="w-4 h-4" /> : <ShieldX className="w-4 h-4" />}
        </Button>

        <a
          href={productUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          data-testid={`link-product-${product.productId}`}
        >
          <Button size="icon" variant="ghost">
            <ExternalLink className="w-4 h-4" />
          </Button>
        </a>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pl-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {relevantRatios.map(([ratio, sizes]) => (
              <RatioCell
                key={ratio}
                ratio={ratio}
                sizes={sizes}
                imageInfo={product.ratioImages[ratio]}
                productId={product.productId}
                productTitle={product.title}
                isWavImageRatio={product.wavImageRatio === ratio}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MultiRatio() {
  const [searchQuery, setSearchQuery] = useState("");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "missing" | "complete" | "approved">("all");
  const [sortBy, setSortBy] = useState<"bestselling" | "missing" | "ratios" | "title" | "sizes">("bestselling");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [approvedIds, setApprovedIds] = useState<Set<string>>(() => loadApprovedIds());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [isBatchPushing, setIsBatchPushing] = useState(false);
  const [batchPushProgress, setBatchPushProgress] = useState<{ current: number; total: number } | null>(null);
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [showReview, setShowReview] = useState(false);

  const toggleApproved = (productId: string) => {
    setApprovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      saveApprovedIds(next);
      return next;
    });
  };

  const toggleSelect = (productId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const selectAllFiltered = () => {
    const missingOnly = filtered.filter((p) => {
      if (approvedIds.has(p.productId)) return false;
      return Array.from(p.ratios.keys()).some((r) => !p.ratioImages[r]?.hasImage);
    });
    setSelectedIds(new Set(missingOnly.map((p) => p.productId)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const { data: products, isLoading, error } = useQuery<Product[]>({
    queryKey: ["/api/admin/multi-ratio/products"],
    staleTime: 5 * 60 * 1000,
  });

  const analysed = useMemo(() => {
    if (!products) return [];
    return products.map(analyseProduct).filter((p) => p.ratioCount >= 2);
  }, [products]);

  const vendors = useMemo(() => {
    const set = new Set(analysed.map((p) => p.vendor));
    return Array.from(set).sort();
  }, [analysed]);

  const stats = useMemo(() => {
    let totalMissing = 0;
    let totalComplete = 0;
    let totalApproved = 0;
    for (const p of analysed) {
      if (approvedIds.has(p.productId)) {
        totalApproved++;
        continue;
      }
      const relevant = Array.from(p.ratios.keys());
      const missing = relevant.filter((r) => !p.ratioImages[r]?.hasImage).length;
      if (missing > 0) totalMissing++;
      else totalComplete++;
    }
    return { totalMissing, totalComplete, totalApproved };
  }, [analysed, approvedIds]);

  const filtered = useMemo(() => {
    let list = analysed;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) => p.title.toLowerCase().includes(q) || p.vendor.toLowerCase().includes(q)
      );
    }
    if (vendorFilter !== "all") {
      list = list.filter((p) => p.vendor === vendorFilter);
    }
    if (statusFilter === "missing") {
      list = list.filter((p) => {
        if (approvedIds.has(p.productId)) return false;
        const relevant = Array.from(p.ratios.keys());
        return relevant.some((r) => !p.ratioImages[r]?.hasImage);
      });
    } else if (statusFilter === "complete") {
      list = list.filter((p) => {
        if (approvedIds.has(p.productId)) return false;
        const relevant = Array.from(p.ratios.keys());
        return relevant.every((r) => p.ratioImages[r]?.hasImage);
      });
    } else if (statusFilter === "approved") {
      list = list.filter((p) => approvedIds.has(p.productId));
    }

    list = [...list].sort((a, b) => {
      if (sortBy === "bestselling") return b.salesCount90d - a.salesCount90d;
      if (sortBy === "missing") {
        const aMissing = Array.from(a.ratios.keys()).filter((r) => !a.ratioImages[r]?.hasImage).length;
        const bMissing = Array.from(b.ratios.keys()).filter((r) => !b.ratioImages[r]?.hasImage).length;
        return bMissing - aMissing;
      }
      if (sortBy === "ratios") return b.ratioCount - a.ratioCount;
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "sizes") return b.sizes.length - a.sizes.length;
      return 0;
    });
    return list;
  }, [analysed, searchQuery, vendorFilter, statusFilter, sortBy, approvedIds]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { toast } = useToast();

  const [batchCancelledRef] = useState<{ current: boolean }>({ current: false });

  const runBatchSearch = useCallback(async () => {
    const selected = analysed.filter(
      (p) => selectedIds.has(p.productId) && !approvedIds.has(p.productId)
    );
    if (selected.length === 0) {
      toast({ title: "No products to search", description: "Selected products are all approved or have no missing ratios." });
      return;
    }

    batchCancelledRef.current = false;

    setIsBatchRunning(true);
    setShowBatchPanel(true);
    setBatchResults([]);
    setBatchPushProgress(null);

    const allResults: BatchResult[] = [];

    for (let i = 0; i < selected.length; i++) {
      if (batchCancelledRef.current) break;

      const product = selected[i];
      const missingRatios = Array.from(product.ratios.keys()).filter(
        (r) => !product.ratioImages[r]?.hasImage
      );
      if (missingRatios.length === 0) continue;

      setBatchProgress({ current: i + 1, total: selected.length, currentProduct: product.title, phase: "searching" });

      try {
        const res = await fetch(
          `/api/dropbox/search-artwork-all?title=${encodeURIComponent(product.title)}`,
          { credentials: "include" }
        );
        if (!res.ok) continue;
        const data = await res.json();
        const matches: DropboxMatch[] = (data.matches || []).filter(
          (m: DropboxMatch) => !m.isFolder && !isExcludedFile(m.name)
        );
        if (matches.length === 0) continue;

        setBatchProgress({ current: i + 1, total: selected.length, currentProduct: product.title, phase: "dimensions" });

        const dimsPromises = matches.map(async (m) => {
          try {
            const dRes = await fetch(
              `/api/dropbox/image-dimensions?path=${encodeURIComponent(m.path)}`,
              { credentials: "include" }
            );
            if (!dRes.ok) return null;
            const d = await dRes.json();
            return { match: m, width: d.width as number, height: d.height as number };
          } catch {
            return null;
          }
        });
        const dims = (await Promise.all(dimsPromises)).filter(Boolean) as { match: DropboxMatch; width: number; height: number }[];

        for (const ratio of missingRatios) {
          const matching = dims.filter((d) => detectRatioLabel(d.width, d.height) === ratio);
          if (matching.length > 0) {
            const best = matching.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
            allResults.push({
              productId: product.productId,
              productTitle: product.title,
              ratio,
              match: best.match,
              width: best.width,
              height: best.height,
              selected: true,
            });
          }
        }
        setBatchResults([...allResults]);
      } catch {
        continue;
      }
    }

    setBatchProgress({ current: selected.length, total: selected.length, currentProduct: "", phase: "done" });
    setBatchResults(allResults);
    setIsBatchRunning(false);
  }, [analysed, selectedIds, approvedIds, toast, batchCancelledRef]);

  const toggleBatchResult = (idx: number) => {
    setBatchResults((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, selected: !r.selected } : r))
    );
  };

  const pushAllBatch = useCallback(async () => {
    const toPush = batchResults.filter((r) => r.selected);
    if (toPush.length === 0) return;

    setIsBatchPushing(true);
    setBatchPushProgress({ current: 0, total: toPush.length });

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < toPush.length; i++) {
      const item = toPush[i];
      setBatchPushProgress({ current: i + 1, total: toPush.length });
      try {
        const res = await apiRequest("POST", "/api/admin/multi-ratio/push-image", {
          productId: item.productId,
          dropboxPath: item.match.path,
          ratio: item.ratio,
        });
        const data = await res.json();
        if (data.success) succeeded++;
        else failed++;
      } catch {
        failed++;
      }
    }

    toast({
      title: "Batch push complete",
      description: `${succeeded} succeeded, ${failed} failed`,
    });

    setIsBatchPushing(false);
    setBatchPushProgress(null);
    setBatchResults((prev) => prev.map((r) => ({ ...r, selected: false })));
    debouncedRefetchProducts();
  }, [batchResults, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 p-8" data-testid="loading-indicator">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-muted-foreground">Loading products from Shopify...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-destructive" data-testid="error-message">
        Failed to load products: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold" data-testid="text-page-title">Multi-Ratio Products</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Products spanning multiple aspect ratios. Each ratio needs its own AR
          image set via the corresponding Shopify metafield.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-3 text-center">
          <p className="text-2xl font-semibold" data-testid="text-stat-total">{products?.length ?? 0}</p>
          <p className="text-xs text-muted-foreground">Total Active</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-semibold" data-testid="text-stat-multi">{analysed.length}</p>
          <p className="text-xs text-muted-foreground">Multi-Ratio</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-semibold text-red-600 dark:text-red-400" data-testid="text-stat-missing">
            {stats.totalMissing}
          </p>
          <p className="text-xs text-muted-foreground">Missing Images</p>
        </Card>
        <Card
          className="p-3 text-center hover-elevate cursor-pointer"
          onClick={() => setShowReview(!showReview)}
          data-testid="card-stat-complete"
        >
          <div className="flex items-center justify-center gap-1.5">
            <p className="text-2xl font-semibold text-green-600 dark:text-green-400" data-testid="text-stat-complete">
              {stats.totalComplete}
            </p>
            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">Complete</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-semibold text-sky-600 dark:text-sky-400" data-testid="text-stat-approved">
            {stats.totalApproved}
          </p>
          <p className="text-xs text-muted-foreground">Approved</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by title or vendor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-vendor">
            <SelectValue placeholder="All Vendors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vendors</SelectItem>
            {vendors.map((v) => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[160px]" data-testid="select-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="missing">Missing Images</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-[160px]" data-testid="select-sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bestselling">Best Selling</SelectItem>
            <SelectItem value="missing">Most Missing</SelectItem>
            <SelectItem value="ratios">Most Ratios</SelectItem>
            <SelectItem value="sizes">Most Sizes</SelectItem>
            <SelectItem value="title">Title A-Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showReview && (
        <ReviewCompletePanel
          products={analysed}
          approvedIds={approvedIds}
          onClose={() => setShowReview(false)}
        />
      )}

      {showBatchPanel && (
        <BatchSearchPanel
          results={batchResults}
          progress={batchProgress}
          isRunning={isBatchRunning}
          onToggleResult={toggleBatchResult}
          onPushAll={pushAllBatch}
          onClose={() => {
            batchCancelledRef.current = true;
            setShowBatchPanel(false);
            setBatchResults([]);
            setBatchProgress(null);
            setIsBatchRunning(false);
          }}
          isPushing={isBatchPushing}
          pushProgress={batchPushProgress}
        />
      )}

      <Card>
        <div className="p-3 border-b flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" data-testid="text-results-count">
              {filtered.length} product{filtered.length !== 1 ? "s" : ""}
            </span>
            {selectionMode && selectedIds.size > 0 && (
              <Badge variant="secondary">{selectedIds.size} selected</Badge>
            )}
          </div>
          <div className="flex gap-2">
            {!selectionMode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectionMode(true)}
                data-testid="button-select-mode"
              >
                <CheckSquare className="w-3 h-3 mr-1" />
                Select
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllFiltered}
                  data-testid="button-select-all-missing"
                >
                  Select All Missing
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearSelection}
                  data-testid="button-clear-selection"
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  onClick={runBatchSearch}
                  disabled={selectedIds.size === 0 || isBatchRunning}
                  data-testid="button-batch-search"
                >
                  {isBatchRunning ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <Zap className="w-3 h-3 mr-1" />
                  )}
                  Batch Search
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSelectionMode(false); clearSelection(); }}
                  data-testid="button-exit-select"
                >
                  Done
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpandedIds(new Set(filtered.map((p) => p.gid)))}
              data-testid="button-expand-all"
            >
              Expand All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpandedIds(new Set())}
              data-testid="button-collapse-all"
            >
              Collapse All
            </Button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground" data-testid="text-no-results">
            No multi-ratio products found.
          </div>
        ) : (
          filtered.map((product) => (
            <ProductRow
              key={product.gid}
              product={product}
              expanded={expandedIds.has(product.gid)}
              onToggle={() => toggleExpand(product.gid)}
              isApproved={approvedIds.has(product.productId)}
              onToggleApproved={() => toggleApproved(product.productId)}
              isSelected={selectedIds.has(product.productId)}
              onToggleSelect={() => toggleSelect(product.productId)}
              selectionMode={selectionMode}
            />
          ))
        )}
      </Card>
    </div>
  );
}
