import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequestLong } from "@/lib/queryClient";
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
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Search,
  ChevronDown,
  ChevronRight,
  Video,
  VideoOff,
  FolderSearch,
  Upload,
  Check,
  AlertTriangle,
  ExternalLink,
  CheckSquare,
  X,
  Eye,
} from "lucide-react";

interface ScanVideoProduct {
  productId: string;
  gid: string;
  title: string;
  handle: string;
  vendor: string;
  featuredImageUrl: string | null;
  featuredImageWidth: number | null;
  featuredImageHeight: number | null;
  totalInventory: number;
  salesCount90d: number;
  hasVideo: boolean;
  videoCount: number;
}

interface DropboxMatch {
  name: string;
  path: string;
  id: string;
  isFolder: boolean;
}

interface DropboxSearchResult {
  path: string;
  name: string;
  width?: number;
  height?: number;
  loading?: boolean;
}

interface BulkCandidate {
  product: ScanVideoProduct;
  bestFile: { path: string; name: string; width: number; height: number; maxDim: number; ratioDiff: number } | null;
  status: "searching" | "found" | "no_match" | "skipped";
  approved: boolean;
  generating: boolean;
  done: boolean;
  error?: string;
}

const MIN_HIGH_RES = 2000;
const TARGET_RATIO = 3 / 4;

function isExcludedFile(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("mockup") ||
    lower.includes("frame") ||
    lower.includes("lifestyle") ||
    lower.includes("_scan") ||
    lower.includes("_video")
  );
}

function isHighRes(result: DropboxSearchResult): boolean {
  if (!result.width || !result.height) return false;
  return Math.max(result.width, result.height) >= MIN_HIGH_RES;
}

function shopifyAdminUrl(productId: string): string {
  return `https://admin.shopify.com/store/east-side-studio/products/${productId}`;
}

function ratioLabel(w: number, h: number): string {
  const ratio = Math.min(w, h) / Math.max(w, h);
  const diff34 = Math.abs(ratio - 3 / 4);
  if (diff34 < 0.02) return "3:4";
  const diff57 = Math.abs(ratio - 5 / 7);
  if (diff57 < 0.02) return "5:7";
  const diff23 = Math.abs(ratio - 2 / 3);
  if (diff23 < 0.02) return "2:3";
  const diff45 = Math.abs(ratio - 4 / 5);
  if (diff45 < 0.02) return "4:5";
  if (Math.abs(ratio - 1) < 0.02) return "1:1";
  return `${(Math.min(w, h) / Math.max(w, h)).toFixed(2)}`;
}

export default function ScanVideoManager() {
  const { toast } = useToast();
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "has_video" | "no_video">("all");
  const [orientationFilter, setOrientationFilter] = useState<"all" | "portrait" | "landscape" | "square">("all");
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [dropboxResults, setDropboxResults] = useState<Record<string, DropboxSearchResult[]>>({});
  const [dropboxSearching, setDropboxSearching] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [localVideoStatus, setLocalVideoStatus] = useState<Record<string, boolean>>({});
  const [manualSearchQuery, setManualSearchQuery] = useState<Record<string, string>>({});
  const [bulkPhase, setBulkPhase] = useState<"idle" | "searching" | "review" | "generating">("idle");
  const [bulkCandidates, setBulkCandidates] = useState<BulkCandidate[]>([]);
  const [bulkSearchProgress, setBulkSearchProgress] = useState<{ current: number; total: number } | null>(null);
  const [bulkGenProgress, setBulkGenProgress] = useState<{ current: number; total: number; currentTitle: string } | null>(null);

  const { data: products, isLoading, isError, error, refetch } = useQuery<ScanVideoProduct[]>({
    queryKey: ["/api/admin/scan-videos/products"],
    staleTime: 5 * 60 * 1000,
  });

  const getProductVideoStatus = useCallback((product: ScanVideoProduct) => {
    if (product.productId in localVideoStatus) return localVideoStatus[product.productId];
    return product.hasVideo;
  }, [localVideoStatus]);

  const markAsHasVideo = useCallback((productId: string) => {
    setLocalVideoStatus(prev => ({ ...prev, [productId]: true }));
  }, []);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter((p) => {
      const hasVid = getProductVideoStatus(p);
      if (statusFilter === "has_video" && !hasVid) return false;
      if (statusFilter === "no_video" && hasVid) return false;
      if (orientationFilter !== "all" && p.featuredImageWidth && p.featuredImageHeight) {
        const ratio = p.featuredImageWidth / p.featuredImageHeight;
        if (orientationFilter === "portrait" && ratio >= 0.95) return false;
        if (orientationFilter === "landscape" && ratio <= 1.05) return false;
        if (orientationFilter === "square" && (ratio < 0.95 || ratio > 1.05)) return false;
      }
      if (searchFilter) {
        const q = searchFilter.toLowerCase();
        if (
          !p.title.toLowerCase().includes(q) &&
          !p.vendor.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [products, searchFilter, statusFilter, orientationFilter, getProductVideoStatus]);

  const stats = useMemo(() => {
    if (!products) return { total: 0, withVideo: 0, withoutVideo: 0 };
    return {
      total: products.length,
      withVideo: products.filter((p) => getProductVideoStatus(p)).length,
      withoutVideo: products.filter((p) => !getProductVideoStatus(p)).length,
    };
  }, [products, getProductVideoStatus]);

  const searchDropbox = useCallback(
    async (productId: string, query: string) => {
      setDropboxSearching((prev) => ({ ...prev, [productId]: true }));
      try {
        const res = await fetch(
          `/api/dropbox/search-artwork-all?title=${encodeURIComponent(query)}`,
          { credentials: "include" }
        );
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        const matches: DropboxMatch[] = data.matches || [];
        const imageFiles = matches.filter(
          (m) =>
            !m.isFolder &&
            !isExcludedFile(m.name) &&
            /\.(jpg|jpeg|png|tif|tiff)$/i.test(m.name)
        );

        const results: DropboxSearchResult[] = imageFiles.map((f) => ({
          path: f.path,
          name: f.name,
          loading: true,
        }));
        setDropboxResults((prev) => ({ ...prev, [productId]: results }));

        for (let i = 0; i < results.length; i++) {
          try {
            const dimRes = await fetch(
              `/api/dropbox/image-dimensions?path=${encodeURIComponent(results[i].path)}`,
              { credentials: "include" }
            );
            if (dimRes.ok) {
              const dims = await dimRes.json();
              results[i] = {
                ...results[i],
                width: dims.width,
                height: dims.height,
                loading: false,
              };
            } else {
              results[i] = { ...results[i], loading: false };
            }
          } catch {
            results[i] = { ...results[i], loading: false };
          }
          setDropboxResults((prev) => ({
            ...prev,
            [productId]: [...results],
          }));
        }
      } catch (error: any) {
        toast({
          title: "Dropbox search failed",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setDropboxSearching((prev) => ({ ...prev, [productId]: false }));
      }
    },
    [toast]
  );

  const generateAndPush = useCallback(
    async (
      product: ScanVideoProduct,
      dropboxPath: string,
      resultIndex: number
    ) => {
      const key = `${product.productId}-${resultIndex}`;
      setGenerating((prev) => ({ ...prev, [key]: true }));
      try {
        const res = await apiRequestLong("POST", "/api/admin/scan-videos/generate", {
          productGid: product.gid,
          productTitle: product.title,
          imageUrl: dropboxPath,
          imageSource: "dropbox",
        });
        const data = await res.json();
        if (data.success) {
          toast({
            title: "Scan video pushed",
            description: `Video for "${product.title}" uploaded to Shopify (${data.fileSizeMB}MB)`,
          });
          setCompleted((prev) => new Set(prev).add(key));
          markAsHasVideo(product.productId);
        } else {
          throw new Error(data.error || "Unknown error");
        }
      } catch (error: any) {
        toast({
          title: "Video generation failed",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setGenerating((prev) => ({ ...prev, [key]: false }));
      }
    },
    [toast, markAsHasVideo]
  );

  const generateFromFeaturedImage = useCallback(
    async (product: ScanVideoProduct) => {
      if (!product.featuredImageUrl) return;
      const key = `${product.productId}-featured`;
      setGenerating((prev) => ({ ...prev, [key]: true }));
      try {
        const res = await apiRequestLong("POST", "/api/admin/scan-videos/generate", {
          productGid: product.gid,
          productTitle: product.title,
          imageUrl: product.featuredImageUrl,
          imageSource: "url",
        });
        const data = await res.json();
        if (data.success) {
          toast({
            title: "Scan video pushed",
            description: `Video for "${product.title}" uploaded to Shopify (${data.fileSizeMB}MB)`,
          });
          setCompleted((prev) => new Set(prev).add(key));
          markAsHasVideo(product.productId);
        } else {
          throw new Error(data.error || "Unknown error");
        }
      } catch (error: any) {
        toast({
          title: "Video generation failed",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setGenerating((prev) => ({ ...prev, [key]: false }));
      }
    },
    [toast, markAsHasVideo]
  );

  const toggleSelection = useCallback((productId: string) => {
    setSelectedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    const noVideoProducts = filteredProducts.filter(p => !getProductVideoStatus(p));
    setSelectedProducts(new Set(noVideoProducts.map(p => p.productId)));
  }, [filteredProducts, getProductVideoStatus]);

  const clearSelection = useCallback(() => {
    setSelectedProducts(new Set());
  }, []);

  const startBulkSearch = useCallback(async () => {
    if (!products || selectedProducts.size === 0) return;

    const selectedList = products.filter(p => selectedProducts.has(p.productId) && !getProductVideoStatus(p));
    if (selectedList.length === 0) {
      toast({ title: "No products to process", description: "All selected products already have videos" });
      return;
    }

    setBulkPhase("searching");
    const candidates: BulkCandidate[] = selectedList.map(p => ({
      product: p,
      bestFile: null,
      status: "searching" as const,
      approved: false,
      generating: false,
      done: false,
    }));
    setBulkCandidates(candidates);
    setBulkSearchProgress({ current: 0, total: selectedList.length });

    for (let i = 0; i < candidates.length; i++) {
      setBulkSearchProgress({ current: i + 1, total: candidates.length });
      const candidate = candidates[i];

      try {
        const searchRes = await fetch(
          `/api/dropbox/search-artwork-all?title=${encodeURIComponent(candidate.product.title)}`,
          { credentials: "include" }
        );
        if (!searchRes.ok) {
          candidates[i] = { ...candidates[i], status: "no_match" };
          setBulkCandidates([...candidates]);
          continue;
        }
        const searchData = await searchRes.json();
        const matches: DropboxMatch[] = searchData.matches || [];
        const imageFiles = matches.filter(
          (m) =>
            !m.isFolder &&
            !isExcludedFile(m.name) &&
            /\.(jpg|jpeg|png|tif|tiff)$/i.test(m.name)
        );

        if (imageFiles.length === 0) {
          candidates[i] = { ...candidates[i], status: "no_match" };
          setBulkCandidates([...candidates]);
          continue;
        }

        let bestFile: BulkCandidate["bestFile"] = null;

        for (const file of imageFiles) {
          try {
            const dimRes = await fetch(
              `/api/dropbox/image-dimensions?path=${encodeURIComponent(file.path)}`,
              { credentials: "include" }
            );
            if (dimRes.ok) {
              const dims = await dimRes.json();
              const w = dims.width || 0;
              const h = dims.height || 0;
              const maxDim = Math.max(w, h);
              if (maxDim < MIN_HIGH_RES) continue;
              const imageRatio = Math.min(w, h) / Math.max(w, h);
              const ratioDiff = Math.abs(imageRatio - TARGET_RATIO);
              if (!bestFile || ratioDiff < bestFile.ratioDiff || (ratioDiff === bestFile.ratioDiff && maxDim > bestFile.maxDim)) {
                bestFile = { path: file.path, name: file.name, width: w, height: h, maxDim, ratioDiff };
              }
            }
          } catch {}
        }

        if (bestFile) {
          candidates[i] = { ...candidates[i], bestFile, status: "found", approved: true };
        } else {
          candidates[i] = { ...candidates[i], status: "no_match" };
        }
        setBulkCandidates([...candidates]);
      } catch {
        candidates[i] = { ...candidates[i], status: "no_match" };
        setBulkCandidates([...candidates]);
      }
    }

    setBulkPhase("review");
    setBulkSearchProgress(null);
  }, [products, selectedProducts, toast, getProductVideoStatus]);

  const toggleBulkApproval = useCallback((productId: string) => {
    setBulkCandidates(prev => prev.map(c =>
      c.product.productId === productId ? { ...c, approved: !c.approved } : c
    ));
  }, []);

  const approveAll = useCallback(() => {
    setBulkCandidates(prev => prev.map(c =>
      c.status === "found" ? { ...c, approved: true } : c
    ));
  }, []);

  const cancelBulk = useCallback(() => {
    setBulkPhase("idle");
    setBulkCandidates([]);
    setBulkSearchProgress(null);
    setBulkGenProgress(null);
  }, []);

  const startBulkGenerate = useCallback(async () => {
    const approved = bulkCandidates.filter(c => c.approved && c.bestFile && c.status === "found");
    if (approved.length === 0) {
      toast({ title: "Nothing to generate", description: "No products are approved" });
      return;
    }

    setBulkPhase("generating");
    setBulkGenProgress({ current: 0, total: approved.length, currentTitle: "" });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < approved.length; i++) {
      const candidate = approved[i];
      setBulkGenProgress({ current: i + 1, total: approved.length, currentTitle: candidate.product.title });

      setBulkCandidates(prev => prev.map(c =>
        c.product.productId === candidate.product.productId ? { ...c, generating: true } : c
      ));

      try {
        const res = await apiRequestLong("POST", "/api/admin/scan-videos/generate", {
          productGid: candidate.product.gid,
          productTitle: candidate.product.title,
          imageUrl: candidate.bestFile!.path,
          imageSource: "dropbox",
        });
        const data = await res.json();
        if (data.success) {
          successCount++;
          markAsHasVideo(candidate.product.productId);
          setBulkCandidates(prev => prev.map(c =>
            c.product.productId === candidate.product.productId ? { ...c, generating: false, done: true } : c
          ));
        } else {
          failCount++;
          setBulkCandidates(prev => prev.map(c =>
            c.product.productId === candidate.product.productId ? { ...c, generating: false, error: data.error || "Failed" } : c
          ));
        }
      } catch (err: any) {
        failCount++;
        setBulkCandidates(prev => prev.map(c =>
          c.product.productId === candidate.product.productId ? { ...c, generating: false, error: err.message } : c
        ));
      }
    }

    setBulkGenProgress(null);
    setSelectedProducts(new Set());

    toast({
      title: "Bulk generation complete",
      description: `${successCount} pushed, ${failCount} failed`,
    });
  }, [bulkCandidates, toast, markAsHasVideo]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12" data-testid="loading-scan-videos">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Loading products from Shopify...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center p-12 gap-3" data-testid="error-scan-videos">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">
          Failed to load products: {(error as Error)?.message || "Unknown error"}
        </p>
        <Button variant="outline" onClick={() => refetch()} data-testid="button-retry">
          Retry
        </Button>
      </div>
    );
  }

  if (bulkPhase === "searching") {
    return (
      <div className="p-4 space-y-4 max-w-6xl mx-auto" data-testid="bulk-searching">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-xl font-semibold">Searching Dropbox...</h1>
          <Button variant="outline" onClick={cancelBulk} data-testid="button-cancel-bulk">
            Cancel
          </Button>
        </div>
        {bulkSearchProgress && (
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm mb-2">
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              <span>Searching {bulkSearchProgress.current} of {bulkSearchProgress.total} products...</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${(bulkSearchProgress.current / bulkSearchProgress.total) * 100}%` }}
              />
            </div>
          </Card>
        )}
        <div className="space-y-1">
          {bulkCandidates.map((c) => (
            <div key={c.product.productId} className="flex items-center gap-3 p-2 rounded-md bg-muted/30 text-sm">
              {c.product.featuredImageUrl && (
                <img src={c.product.featuredImageUrl} alt="" className="w-8 h-8 object-cover rounded" />
              )}
              <span className="flex-1 truncate">{c.product.title}</span>
              {c.status === "searching" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              {c.status === "found" && <Badge variant="default" className="text-xs">Found</Badge>}
              {c.status === "no_match" && <Badge variant="outline" className="text-xs">No match</Badge>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (bulkPhase === "review" || bulkPhase === "generating") {
    const foundCandidates = bulkCandidates.filter(c => c.status === "found");
    const noMatchCandidates = bulkCandidates.filter(c => c.status === "no_match");
    const approvedCount = bulkCandidates.filter(c => c.approved && c.status === "found").length;

    return (
      <div className="p-4 space-y-4 max-w-6xl mx-auto" data-testid="bulk-review">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-xl font-semibold">
            {bulkPhase === "review" ? "Review Image Matches" : "Generating Videos..."}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            {bulkPhase === "review" && (
              <>
                <Button variant="outline" onClick={cancelBulk} data-testid="button-cancel-review">
                  Cancel
                </Button>
                <Button variant="outline" size="sm" onClick={approveAll} data-testid="button-approve-all">
                  Approve All ({foundCandidates.length})
                </Button>
                <Button
                  onClick={startBulkGenerate}
                  disabled={approvedCount === 0}
                  data-testid="button-generate-approved"
                >
                  <Upload className="w-4 h-4 mr-1" />
                  Generate {approvedCount} Video{approvedCount !== 1 ? "s" : ""}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 text-center">
            <div className="text-2xl font-bold">{foundCandidates.length}</div>
            <div className="text-sm text-muted-foreground">Images Found</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
            <div className="text-sm text-muted-foreground">Approved</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-2xl font-bold text-orange-600">{noMatchCandidates.length}</div>
            <div className="text-sm text-muted-foreground">No Match</div>
          </Card>
        </div>

        {bulkPhase === "generating" && bulkGenProgress && (
          <Card className="p-3">
            <div className="flex items-center gap-2 text-sm mb-2">
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              <span>Generating {bulkGenProgress.current}/{bulkGenProgress.total}: {bulkGenProgress.currentTitle}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${(bulkGenProgress.current / bulkGenProgress.total) * 100}%` }}
              />
            </div>
          </Card>
        )}

        <div className="space-y-1">
          {foundCandidates.map((c) => (
            <Card key={c.product.productId} className="overflow-visible" data-testid={`review-card-${c.product.productId}`}>
              <div className="flex items-center gap-3 p-3">
                {bulkPhase === "review" && (
                  <div className="flex-shrink-0" onClick={() => toggleBulkApproval(c.product.productId)}>
                    <Checkbox
                      checked={c.approved}
                      data-testid={`checkbox-approve-${c.product.productId}`}
                    />
                  </div>
                )}

                {c.product.featuredImageUrl && (
                  <img src={c.product.featuredImageUrl} alt="" className="w-10 h-10 object-cover rounded flex-shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm">{c.product.title}</div>
                  <div className="text-xs text-muted-foreground">{c.product.vendor}</div>
                </div>

                {c.bestFile && (
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    <img
                      src={`/api/dropbox/thumbnail?path=${encodeURIComponent(c.bestFile.path)}`}
                      alt=""
                      className="w-12 h-16 object-cover rounded border"
                      data-testid={`thumb-match-${c.product.productId}`}
                    />
                    <div className="text-right">
                      <div className="text-xs font-mono truncate max-w-[200px]" title={c.bestFile.path}>
                        {c.bestFile.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.bestFile.width} x {c.bestFile.height}px
                        <span className="ml-1">({ratioLabel(c.bestFile.width, c.bestFile.height)})</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex-shrink-0">
                  {c.generating && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Generating
                    </Badge>
                  )}
                  {c.done && (
                    <Badge variant="default" className="text-xs gap-1">
                      <Check className="w-3 h-3" />
                      Pushed
                    </Badge>
                  )}
                  {c.error && (
                    <Badge variant="destructive" className="text-xs">
                      Failed
                    </Badge>
                  )}
                </div>

                <a
                  href={shopifyAdminUrl(c.product.productId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </Card>
          ))}
        </div>

        {noMatchCandidates.length > 0 && (
          <>
            <h2 className="text-sm font-medium text-muted-foreground mt-4">No high-res image found ({noMatchCandidates.length})</h2>
            <div className="space-y-1">
              {noMatchCandidates.map((c) => (
                <div key={c.product.productId} className="flex items-center gap-3 p-2 rounded-md bg-muted/30 text-sm opacity-60">
                  {c.product.featuredImageUrl && (
                    <img src={c.product.featuredImageUrl} alt="" className="w-8 h-8 object-cover rounded" />
                  )}
                  <span className="flex-1 truncate">{c.product.title}</span>
                  <Badge variant="outline" className="text-xs">No match</Badge>
                </div>
              ))}
            </div>
          </>
        )}

        {bulkPhase === "generating" && bulkGenProgress === null && (
          <div className="flex justify-center pt-4">
            <Button onClick={cancelBulk} data-testid="button-done-bulk">
              Done
            </Button>
          </div>
        )}
      </div>
    );
  }

  const noVideoVisible = filteredProducts.filter(p => !getProductVideoStatus(p));

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto" data-testid="scan-video-manager">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold" data-testid="text-page-title">Scan Video Manager</h1>
        <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center cursor-pointer" onClick={() => setStatusFilter("all")} data-testid="stat-total">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-muted-foreground">Total Products</div>
        </Card>
        <Card className="p-3 text-center cursor-pointer" onClick={() => setStatusFilter("has_video")} data-testid="stat-with-video">
          <div className="text-2xl font-bold text-green-600">{stats.withVideo}</div>
          <div className="text-sm text-muted-foreground">With Video</div>
        </Card>
        <Card className="p-3 text-center cursor-pointer" onClick={() => setStatusFilter("no_video")} data-testid="stat-without-video">
          <div className="text-2xl font-bold text-orange-600">{stats.withoutVideo}</div>
          <div className="text-sm text-muted-foreground">Without Video</div>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by title or vendor..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="has_video">Has Video</SelectItem>
            <SelectItem value="no_video">No Video</SelectItem>
          </SelectContent>
        </Select>
        <Select value={orientationFilter} onValueChange={(v) => setOrientationFilter(v as any)}>
          <SelectTrigger className="w-[160px]" data-testid="select-orientation-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orientations</SelectItem>
            <SelectItem value="portrait">Portrait</SelectItem>
            <SelectItem value="landscape">Landscape</SelectItem>
            <SelectItem value="square">Square</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""}
        </span>
      </div>

      {selectedProducts.size > 0 && (
        <Card className="p-3 flex items-center justify-between gap-3 flex-wrap" data-testid="bulk-toolbar">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4" />
            <span className="text-sm font-medium">{selectedProducts.size} selected</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
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
              onClick={startBulkSearch}
              data-testid="button-bulk-search"
            >
              <Eye className="w-4 h-4 mr-1" />
              Find Images & Review
            </Button>
          </div>
        </Card>
      )}

      {noVideoVisible.length > 0 && selectedProducts.size === 0 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={selectAllVisible}
            data-testid="button-select-all"
          >
            <CheckSquare className="w-4 h-4 mr-1" />
            Select all without video ({noVideoVisible.length})
          </Button>
        </div>
      )}

      <div className="space-y-1">
        {filteredProducts.map((product) => {
          const isExpanded = expandedProduct === product.productId;
          const results = dropboxResults[product.productId];
          const isSearching = dropboxSearching[product.productId];
          const hasVid = getProductVideoStatus(product);
          const isSelected = selectedProducts.has(product.productId);

          return (
            <Card key={product.productId} className="overflow-visible" data-testid={`card-product-${product.productId}`}>
              <div
                className="flex items-center gap-3 p-3 cursor-pointer hover-elevate"
                onClick={() =>
                  setExpandedProduct(isExpanded ? null : product.productId)
                }
                data-testid={`row-product-${product.productId}`}
              >
                <div
                  className="flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelection(product.productId);
                  }}
                >
                  <Checkbox
                    checked={isSelected}
                    data-testid={`checkbox-product-${product.productId}`}
                  />
                </div>

                <div className="flex-shrink-0">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </div>

                {product.featuredImageUrl ? (
                  <img
                    src={product.featuredImageUrl}
                    alt=""
                    className="w-10 h-10 object-cover rounded"
                    data-testid={`img-product-${product.productId}`}
                  />
                ) : (
                  <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                    <VideoOff className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm" data-testid={`text-title-${product.productId}`}>
                    {product.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {product.vendor}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  {product.salesCount90d > 0 && (
                    <Badge variant="secondary" className="text-xs" data-testid={`badge-sales-${product.productId}`}>
                      {product.salesCount90d} sold
                    </Badge>
                  )}
                  {hasVid ? (
                    <Badge variant="default" className="text-xs gap-1" data-testid={`badge-has-video-${product.productId}`}>
                      <Video className="w-3 h-3" />
                      {product.videoCount > 0 ? `${product.videoCount} video${product.videoCount !== 1 ? "s" : ""}` : "Video"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs gap-1" data-testid={`badge-no-video-${product.productId}`}>
                      <VideoOff className="w-3 h-3" />
                      No video
                    </Badge>
                  )}
                  <a
                    href={shopifyAdminUrl(product.productId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    data-testid={`link-shopify-${product.productId}`}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t px-3 pb-3 pt-2 space-y-3" data-testid={`panel-expanded-${product.productId}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        searchDropbox(product.productId, product.title);
                      }}
                      disabled={isSearching}
                      data-testid={`button-search-dropbox-${product.productId}`}
                    >
                      {isSearching ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <FolderSearch className="w-4 h-4 mr-1" />
                      )}
                      Search Dropbox
                    </Button>

                    <form
                      className="flex items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const q = manualSearchQuery[product.productId]?.trim();
                        if (q) searchDropbox(product.productId, q);
                      }}
                    >
                      <Input
                        placeholder="Custom search..."
                        value={manualSearchQuery[product.productId] || ""}
                        onChange={(e) =>
                          setManualSearchQuery((prev) => ({ ...prev, [product.productId]: e.target.value }))
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="w-[200px]"
                        data-testid={`input-manual-search-${product.productId}`}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        type="submit"
                        disabled={isSearching || !manualSearchQuery[product.productId]?.trim()}
                        data-testid={`button-manual-search-${product.productId}`}
                      >
                        <Search className="w-4 h-4" />
                      </Button>
                    </form>

                    {product.featuredImageUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          generateFromFeaturedImage(product);
                        }}
                        disabled={
                          generating[`${product.productId}-featured`] ||
                          completed.has(`${product.productId}-featured`)
                        }
                        data-testid={`button-use-featured-${product.productId}`}
                      >
                        {generating[`${product.productId}-featured`] ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-1" />
                            Generating...
                          </>
                        ) : completed.has(`${product.productId}-featured`) ? (
                          <>
                            <Check className="w-4 h-4 mr-1" />
                            Pushed
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-1" />
                            Use Featured Image
                          </>
                        )}
                      </Button>
                    )}

                    <a
                      href={shopifyAdminUrl(product.productId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex"
                      data-testid={`link-shopify-admin-${product.productId}`}
                    >
                      <Button variant="outline" size="sm" type="button" asChild>
                        <span>
                          <ExternalLink className="w-4 h-4 mr-1" />
                          View in Shopify
                        </span>
                      </Button>
                    </a>
                  </div>

                  {results && results.length === 0 && !isSearching && (
                    <div className="text-sm text-muted-foreground flex items-center gap-1" data-testid={`text-no-results-${product.productId}`}>
                      <AlertTriangle className="w-4 h-4" />
                      No images found in Dropbox
                    </div>
                  )}

                  {results && results.length > 0 && (
                    <div className="space-y-1" data-testid={`list-dropbox-results-${product.productId}`}>
                      {results.map((result, idx) => {
                        const key = `${product.productId}-${idx}`;
                        const isGen = generating[key];
                        const isDone = completed.has(key);
                        const highRes = isHighRes(result);
                        const lowRes = !result.loading && result.width && result.height && !highRes;

                        return (
                          <div
                            key={idx}
                            className={`flex items-center gap-2 p-2 rounded-md text-sm ${lowRes ? "bg-muted/30 opacity-60" : "bg-muted/50"}`}
                            data-testid={`row-dropbox-result-${product.productId}-${idx}`}
                          >
                            <img
                              src={`/api/dropbox/thumbnail?path=${encodeURIComponent(result.path)}`}
                              alt=""
                              className="w-10 h-14 object-cover rounded border flex-shrink-0"
                              data-testid={`thumb-result-${product.productId}-${idx}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-mono text-xs" title={result.path}>
                                {result.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {result.loading ? (
                                  <span className="flex items-center gap-1">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Checking dimensions...
                                  </span>
                                ) : result.width && result.height ? (
                                  <span>
                                    {result.width} x {result.height}px
                                    <span className="ml-1">({ratioLabel(result.width, result.height)})</span>
                                    {lowRes && (
                                      <span className="text-orange-500 ml-1">(low res - min {MIN_HIGH_RES}px)</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">Dimensions unknown</span>
                                )}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant={isDone ? "default" : "outline"}
                              onClick={() => generateAndPush(product, result.path, idx)}
                              disabled={isGen || isDone || result.loading || !!lowRes}
                              data-testid={`button-generate-${product.productId}-${idx}`}
                            >
                              {isGen ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                  Generating...
                                </>
                              ) : isDone ? (
                                <>
                                  <Check className="w-3 h-3 mr-1" />
                                  Pushed
                                </>
                              ) : lowRes ? (
                                "Low res"
                              ) : (
                                <>
                                  <Upload className="w-3 h-3 mr-1" />
                                  Generate & Push
                                </>
                              )}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              )}
            </Card>
          );
        })}
      </div>

      {filteredProducts.length === 0 && !isLoading && (
        <div className="text-center text-muted-foreground py-8" data-testid="text-empty-state">
          No products match your filters
        </div>
      )}
    </div>
  );
}
