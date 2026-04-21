import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  ArrowLeft,
  Image as ImageIcon,
  Video,
  Tag,
  Loader2,
  Check,
  Upload,
  GripVertical,
  ExternalLink,
  ChevronDown,
  Film,
  Palette,
  Type,
  X,
  SlidersHorizontal,
  RefreshCw,
} from "lucide-react";

interface ProductMediaItem {
  productId: string;
  gid: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  tags: string[];
  featuredImageUrl: string | null;
  totalInventory: number;
  imageCount: number;
  videoCount: number;
  totalMediaCount: number;
  hasLifestyle: boolean;
  salesCount90d: number;
  createdAt: string;
}

type SortOption = "best-sellers" | "newest" | "oldest" | "title-az" | "title-za" | "most-media" | "least-media";
type MediaFilterOption = "all" | "0" | "lt3" | "lt5" | "gte5" | "gte10" | "has-video" | "no-video";

const SORT_LABELS: Record<SortOption, string> = {
  "best-sellers": "Best Sellers",
  "newest": "Newest First",
  "oldest": "Oldest First",
  "title-az": "Title A-Z",
  "title-za": "Title Z-A",
  "most-media": "Most Media",
  "least-media": "Least Media",
};

const MEDIA_FILTER_LABELS: Record<MediaFilterOption, string> = {
  "all": "All media counts",
  "0": "No media (0)",
  "lt3": "Less than 3",
  "lt5": "Less than 5",
  "gte5": "5 or more",
  "gte10": "10 or more",
  "has-video": "Has video",
  "no-video": "No video",
};

interface MediaDetail {
  id: string;
  mediaContentType: string;
  alt: string | null;
  url: string | null;
  width: number | null;
  height: number | null;
  position: number;
  sources?: Array<{ url: string; mimeType: string }>;
}

interface ProductDetails {
  product: { gid: string; title: string; handle: string; vendor: string };
  media: MediaDetail[];
}

interface GeneratedMockup {
  frame: string;
  base64: string;
  selected: boolean;
}

type TabValue = "gallery" | "alt-text" | "scan-video" | "mockups" | "scale-calibration";

const FRAME_LABELS: Record<string, string> = {
  black: "Black Frame",
  white: "White Frame",
  natural: "Natural Frame",
  unframed: "Unframed",
};

export default function ProductMedia() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [mediaFilter, setMediaFilter] = useState<MediaFilterOption>("all");
  const [sortBy, setSortBy] = useState<SortOption>("best-sellers");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [showGlobalCalibration, setShowGlobalCalibration] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchResults, setBatchResults] = useState<Array<{ gid: string; title: string; status: "pending" | "success" | "failed"; error?: string; deleted?: number; generated?: number; detail?: string }>>([]);
  const [isPushReplacing, setIsPushReplacing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>("gallery");
  const [altTextEdits, setAltTextEdits] = useState<Record<string, string>>({});
  const [mockups, setMockups] = useState<GeneratedMockup[]>([]);
  const [mockupFrames, setMockupFrames] = useState<string[]>(["black", "white", "natural", "unframed"]);
  const [mockupRatio, setMockupRatio] = useState("a-ratio");
  const [mockupOrientation, setMockupOrientation] = useState<"portrait" | "landscape">("portrait");
  const [insertPosition, setInsertPosition] = useState(2);

  const productsQuery = useQuery<ProductMediaItem[]>({
    queryKey: ["/api/admin/product-media/products"],
  });

  const detailsQuery = useQuery<ProductDetails>({
    queryKey: ["/api/admin/product-media/product", selectedProductId, "details"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/product-media/product/${selectedProductId}/details`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch product details");
      return r.json();
    },
    enabled: !!selectedProductId,
  });

  const allTypes = useMemo(() => {
    if (!productsQuery.data) return [];
    const types = new Set(productsQuery.data.map(p => p.productType).filter(Boolean));
    return Array.from(types).sort();
  }, [productsQuery.data]);

  const allTags = useMemo(() => {
    if (!productsQuery.data) return [];
    const tags = new Set<string>();
    productsQuery.data.forEach(p => p.tags.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [productsQuery.data]);

  const filteredProducts = useMemo(() => {
    if (!productsQuery.data) return [];
    let list = [...productsQuery.data];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.vendor.toLowerCase().includes(q) ||
        p.handle.toLowerCase().includes(q)
      );
    }
    if (typeFilter !== "all") {
      list = list.filter(p => p.productType === typeFilter);
    }
    if (tagFilter !== "all") {
      list = list.filter(p => p.tags.includes(tagFilter));
    }

    if (mediaFilter !== "all") {
      switch (mediaFilter) {
        case "0": list = list.filter(p => p.totalMediaCount === 0); break;
        case "lt3": list = list.filter(p => p.totalMediaCount < 3); break;
        case "lt5": list = list.filter(p => p.totalMediaCount < 5); break;
        case "gte5": list = list.filter(p => p.totalMediaCount >= 5); break;
        case "gte10": list = list.filter(p => p.totalMediaCount >= 10); break;
        case "has-video": list = list.filter(p => p.videoCount > 0); break;
        case "no-video": list = list.filter(p => p.videoCount === 0); break;
      }
    }

    switch (sortBy) {
      case "best-sellers": list.sort((a, b) => b.salesCount90d - a.salesCount90d); break;
      case "newest": list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break;
      case "oldest": list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); break;
      case "title-az": list.sort((a, b) => a.title.localeCompare(b.title)); break;
      case "title-za": list.sort((a, b) => b.title.localeCompare(a.title)); break;
      case "most-media": list.sort((a, b) => b.totalMediaCount - a.totalMediaCount); break;
      case "least-media": list.sort((a, b) => a.totalMediaCount - b.totalMediaCount); break;
    }

    return list;
  }, [productsQuery.data, searchQuery, typeFilter, tagFilter, mediaFilter, sortBy]);

  const updateAltMutation = useMutation({
    mutationFn: async ({ productGid, updates }: { productGid: string; updates: { mediaId: string; altText: string }[] }) => {
      const res = await apiRequest("POST", "/api/admin/media-editor/update-alt-text", { productGid, updates });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Alt text updated", description: `Updated ${data.updated} media items` });
        setAltTextEdits({});
        queryClient.invalidateQueries({ queryKey: ["/api/admin/product-media/product", selectedProductId, "details"] });
      } else {
        toast({ title: "Update failed", description: data.error, variant: "destructive" });
      }
    },
  });

  const generateMockupsMutation = useMutation({
    mutationFn: async (params: { imageUrl: string; imageSource: string; productTitle?: string }) => {
      const res = await apiRequest("POST", "/api/admin/product-media/generate-mockups", {
        imageUrl: params.imageUrl,
        imageSource: params.imageSource,
        productTitle: params.productTitle,
        frames: mockupFrames,
        ratioCategory: mockupRatio,
        orientation: mockupOrientation,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.mockups) {
        setMockups(data.mockups.map((m: any) => ({ ...m, selected: true })));
        if (data.ratioCategory) setMockupRatio(data.ratioCategory);
        if (data.orientation) setMockupOrientation(data.orientation);
        toast({ title: "Mockups generated", description: `${data.mockups.length} mockup(s) ready` });
      } else {
        toast({ title: "Generation failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Generation failed", description: error.message || "Unknown error", variant: "destructive" });
    },
  });

  const uploadMockupMutation = useMutation({
    mutationFn: async ({ productGid, mockup, filename, altText }: { productGid: string; mockup: GeneratedMockup; filename: string; altText: string }) => {
      const byteString = atob(mockup.base64);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
      const blob = new Blob([ab], { type: "image/jpeg" });

      const formData = new FormData();
      formData.append("image", blob, filename);
      formData.append("productGid", productGid);
      formData.append("filename", filename);
      formData.append("altText", altText);

      const res = await fetch("/api/admin/product-media/upload-mockup-buffer", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      return res.json();
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ productGid, mediaIds }: { productGid: string; mediaIds: string[] }) => {
      const res = await apiRequest("POST", "/api/admin/product-media/reorder", { productGid, mediaIds });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Media reordered" });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/product-media/product", selectedProductId, "details"] });
      }
    },
  });

  const scanVideoMutation = useMutation({
    mutationFn: async (params: { productGid: string; productTitle: string; imageUrl: string; imageSource: string; maxSourceDim?: number }) => {
      const res = await fetch("/api/admin/scan-videos/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(params),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Scan video generated", description: `${data.sourceDim}px source → ${data.fileSizeMB}MB video uploaded` });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/product-media/product", selectedProductId, "details"] });
      } else {
        toast({ title: "Scan video failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Scan video failed", description: error.message || "Unknown error", variant: "destructive" });
    },
  });

  const handleSelectProduct = useCallback((productId: string) => {
    setSelectedProductId(productId);
    setActiveTab("gallery");
    setAltTextEdits({});
    setMockups([]);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedProductId(null);
    setAltTextEdits({});
    setMockups([]);
  }, []);

  const handleSaveAltText = useCallback(() => {
    if (!detailsQuery.data) return;
    const updates = Object.entries(altTextEdits)
      .filter(([, val]) => val !== undefined)
      .map(([mediaId, altText]) => ({ mediaId, altText }));
    if (updates.length === 0) return;
    updateAltMutation.mutate({ productGid: detailsQuery.data.product.gid, updates });
  }, [altTextEdits, detailsQuery.data, updateAltMutation]);

  const handleGenerateMockups = useCallback(() => {
    if (!detailsQuery.data) return;
    const productTitle = detailsQuery.data.product.title;
    generateMockupsMutation.mutate({ imageUrl: "", imageSource: "local", productTitle });
  }, [detailsQuery.data, generateMockupsMutation]);

  const handlePushMockups = useCallback(async () => {
    if (!detailsQuery.data) return;

    const productGid = detailsQuery.data.product.gid;
    setIsPushReplacing(true);

    try {
      const res = await apiRequest("POST", "/api/admin/product-media/batch-regenerate-mockups", {
        productGid,
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Mockups replaced", description: `Removed ${data.deleted}, added ${data.generated} new mockups` });
      } else {
        toast({ title: "Failed", description: data.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsPushReplacing(false);
    }

    queryClient.invalidateQueries({ queryKey: ["/api/admin/product-media/product", selectedProductId, "details"] });
  }, [detailsQuery.data, selectedProductId, toast]);

  const handleBatchRegenerate = useCallback(async () => {
    if (batchSelected.size === 0) return;
    const products = productsQuery.data || [];
    const selectedProducts = products.filter(p => batchSelected.has(p.gid));
    setBatchProcessing(true);
    setBatchResults([]);

    for (const product of selectedProducts) {
      setBatchResults(prev => [...prev, { gid: product.gid, title: product.title, status: "pending" }]);
      try {
        const res = await apiRequest("POST", "/api/admin/product-media/batch-regenerate-mockups", {
          productGid: product.gid,
        });
        const data = await res.json();
        setBatchResults(prev => prev.map(r =>
          r.gid === product.gid
            ? { ...r, status: data.success ? "success" : "failed", error: data.error, deleted: data.deleted, generated: data.generated }
            : r
        ));
      } catch (err: any) {
        setBatchResults(prev => prev.map(r =>
          r.gid === product.gid ? { ...r, status: "failed", error: err.message } : r
        ));
      }
    }

    setBatchProcessing(false);
    toast({ title: "Batch complete", description: `Processed ${selectedProducts.length} products` });
  }, [batchSelected, productsQuery.data, toast]);

  const handleBatchScanVideos = useCallback(async () => {
    if (batchSelected.size === 0) return;
    const products = productsQuery.data || [];
    const selectedProducts = products.filter(p => batchSelected.has(p.gid));
    setBatchProcessing(true);
    setBatchResults([]);

    for (const product of selectedProducts) {
      setBatchResults(prev => [...prev, { gid: product.gid, title: product.title, status: "pending" }]);
      try {
        const res = await fetch("/api/admin/scan-videos/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            productGid: product.gid,
            productTitle: product.title,
            imageUrl: "",
            imageSource: "local",
            maxSourceDim: 2500,
          }),
        });
        const data = await res.json();
        setBatchResults(prev => prev.map(r =>
          r.gid === product.gid
            ? {
                ...r,
                status: data.success ? "success" : "failed",
                error: data.error,
                detail: data.success ? `${data.fileSizeMB}MB` : undefined,
                deleted: data.deletedVideos,
              }
            : r
        ));
      } catch (err: any) {
        setBatchResults(prev => prev.map(r =>
          r.gid === product.gid ? { ...r, status: "failed", error: err.message } : r
        ));
      }
    }

    setBatchProcessing(false);
    toast({ title: "Batch complete", description: `Processed ${selectedProducts.length} scan videos` });
  }, [batchSelected, productsQuery.data, toast]);

  const toggleBatchSelect = useCallback((gid: string) => {
    setBatchSelected(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
  }, []);

  const [scanSourceDim, setScanSourceDim] = useState(2500);

  const handleGenerateScanVideo = useCallback(() => {
    if (!detailsQuery.data) return;
    scanVideoMutation.mutate({
      productGid: detailsQuery.data.product.gid,
      productTitle: detailsQuery.data.product.title,
      imageUrl: "",
      imageSource: "local",
      maxSourceDim: scanSourceDim,
    });
  }, [detailsQuery.data, scanVideoMutation, scanSourceDim, toast]);

  if (selectedProductId) {
    return (
      <div className="p-6 space-y-4 max-w-6xl" data-testid="product-media-detail">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBackToList} data-testid="button-back-to-list">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            {detailsQuery.isLoading ? (
              <Skeleton className="h-6 w-64" />
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-lg font-semibold truncate">{detailsQuery.data?.product.title}</h1>
                <a
                  href={`https://${import.meta.env.VITE_SHOPIFY_DOMAIN || "east-side-studio.myshopify.com"}/products/${detailsQuery.data?.product.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="link-shopify-product"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-1 border-b" data-testid="media-tabs">
          {([
            { key: "gallery", label: "Media Gallery", icon: ImageIcon },
            { key: "alt-text", label: "Alt Text", icon: Type },
            { key: "scan-video", label: "Scan Video", icon: Film },
            { key: "mockups", label: "Generate Mockups", icon: Palette },
            { key: "scale-calibration", label: "Scale Calibration", icon: SlidersHorizontal },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-${tab.key}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {detailsQuery.isLoading ? (
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-md" />
            ))}
          </div>
        ) : (
          <>
            {activeTab === "gallery" && (
              <MediaGalleryTab media={detailsQuery.data?.media || []} />
            )}
            {activeTab === "alt-text" && (
              <AltTextTab
                media={detailsQuery.data?.media || []}
                edits={altTextEdits}
                setEdits={setAltTextEdits}
                onSave={handleSaveAltText}
                isSaving={updateAltMutation.isPending}
              />
            )}
            {activeTab === "scan-video" && (
              <ScanVideoTab
                media={detailsQuery.data?.media || []}
                onGenerate={handleGenerateScanVideo}
                isGenerating={scanVideoMutation.isPending}
                sourceDim={scanSourceDim}
                setSourceDim={setScanSourceDim}
              />
            )}
            {activeTab === "mockups" && (
              <MockupsTab
                media={detailsQuery.data?.media || []}
                mockups={mockups}
                setMockups={setMockups}
                frames={mockupFrames}
                setFrames={setMockupFrames}
                ratio={mockupRatio}
                setRatio={setMockupRatio}
                orientation={mockupOrientation}
                setOrientation={setMockupOrientation}
                insertPosition={insertPosition}
                setInsertPosition={setInsertPosition}
                onGenerate={handleGenerateMockups}
                onPush={handlePushMockups}
                isGenerating={generateMockupsMutation.isPending}
                isPushing={isPushReplacing}
              />
            )}
            {activeTab === "scale-calibration" && (
              <ScaleCalibrationTab
                productGid={selectedProductId!}
                media={detailsQuery.data?.media || []}
              />
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-6xl" data-testid="product-media-list">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-lg font-semibold">Product Media</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {batchSelected.size > 0 && (
            <>
              <Button
                size="sm"
                onClick={handleBatchRegenerate}
                disabled={batchProcessing}
                data-testid="button-batch-regenerate"
              >
                {batchProcessing ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
                ) : (
                  <><RefreshCw className="w-4 h-4 mr-2" />Regenerate {batchSelected.size} Mockups</>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchScanVideos}
                disabled={batchProcessing}
                data-testid="button-batch-scan-videos"
              >
                {batchProcessing ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
                ) : (
                  <><Film className="w-4 h-4 mr-2" />Scan Videos ({batchSelected.size})</>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setBatchSelected(new Set()); setBatchResults([]); }}
                data-testid="button-clear-selection"
              >
                Clear
              </Button>
            </>
          )}
          {batchSelected.size === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const allGids = new Set(filteredProducts.map(p => p.gid));
                setBatchSelected(allGids);
              }}
              data-testid="button-select-all"
            >
              Select All
            </Button>
          )}
          <Button
            variant={showGlobalCalibration ? "default" : "outline"}
            size="sm"
            onClick={() => setShowGlobalCalibration(!showGlobalCalibration)}
            data-testid="button-global-calibration"
          >
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Scale Settings
          </Button>
          <Badge variant="secondary">
            {filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      {batchResults.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium">Batch Progress</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {batchResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {r.status === "pending" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />}
                  {r.status === "success" && <Check className="w-4 h-4 text-green-600 flex-shrink-0" />}
                  {r.status === "failed" && <X className="w-4 h-4 text-destructive flex-shrink-0" />}
                  <span className="truncate flex-1">{r.title}</span>
                  {r.status === "success" && r.generated !== undefined && <span className="text-xs text-muted-foreground flex-shrink-0">{r.deleted} removed, {r.generated} added</span>}
                  {r.status === "success" && r.detail && !r.generated && <span className="text-xs text-muted-foreground flex-shrink-0">{r.detail}{r.deleted ? `, replaced ${r.deleted}` : ""}</span>}
                  {r.status === "failed" && r.error && <span className="text-xs text-destructive flex-shrink-0">{r.error}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {showGlobalCalibration && (
        <ScaleCalibrationTab media={[]} />
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-products"
          />
        </div>
        <Select value={sortBy} onValueChange={(v: SortOption) => setSortBy(v)}>
          <SelectTrigger className="w-[160px]" data-testid="select-sort">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={mediaFilter} onValueChange={(v: MediaFilterOption) => setMediaFilter(v)}>
          <SelectTrigger className="w-[160px]" data-testid="select-media-filter">
            <SelectValue placeholder="Media count" />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(MEDIA_FILTER_LABELS) as [MediaFilterOption, string][]).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-type-filter">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {allTypes.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-tag-filter">
            <SelectValue placeholder="All tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
            {allTags.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(typeFilter !== "all" || tagFilter !== "all" || mediaFilter !== "all" || searchQuery || sortBy !== "best-sellers") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearchQuery(""); setTypeFilter("all"); setTagFilter("all"); setMediaFilter("all"); setSortBy("best-sellers"); }}
            data-testid="button-clear-filters"
          >
            <X className="w-4 h-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {productsQuery.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-md" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredProducts.map(product => (
            <Card
              key={product.productId}
              className="cursor-pointer hover-elevate overflow-visible"
              onClick={() => handleSelectProduct(product.productId)}
              data-testid={`card-product-${product.productId}`}
            >
              <CardContent className="p-3">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center gap-2 flex-shrink-0">
                    <Checkbox
                      checked={batchSelected.has(product.gid)}
                      onCheckedChange={(e) => {
                        e && e.valueOf();
                        toggleBatchSelect(product.gid);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`checkbox-product-${product.productId}`}
                    />
                  </div>
                  {product.featuredImageUrl ? (
                    <img
                      src={product.featuredImageUrl + "&width=120"}
                      alt={product.title}
                      className="w-16 h-20 object-cover rounded-sm flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-20 bg-muted rounded-sm flex items-center justify-center flex-shrink-0">
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-medium truncate" data-testid={`text-title-${product.productId}`}>
                      {product.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{product.vendor}</p>
                    {product.productType && (
                      <Badge variant="secondary" className="text-xs">{product.productType}</Badge>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" /> {product.imageCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Video className="w-3 h-3" /> {product.videoCount}
                      </span>
                      {product.salesCount90d > 0 && (
                        <span className="text-xs">{product.salesCount90d} sold</span>
                      )}
                      {product.hasLifestyle && (
                        <Badge variant="outline" className="text-xs py-0">Lifestyle</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!productsQuery.isLoading && filteredProducts.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No products found matching your filters</p>
        </div>
      )}
    </div>
  );
}

function MediaGalleryTab({ media }: { media: MediaDetail[] }) {
  if (media.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">No media found for this product</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{media.length} media item{media.length !== 1 ? "s" : ""}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {media.map((item) => (
          <div key={item.id} className="space-y-1" data-testid={`media-item-${item.position}`}>
            <div className="relative aspect-[3/4] bg-muted rounded-md overflow-hidden">
              {item.url ? (
                <img
                  src={item.url + (item.mediaContentType === "IMAGE" ? "&width=300" : "")}
                  alt={item.alt || ""}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {item.mediaContentType === "VIDEO" ? (
                    <Video className="w-8 h-8 text-muted-foreground" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
              )}
              <div className="absolute top-1 left-1">
                <Badge variant="secondary" className="text-xs font-mono">
                  {item.position}
                </Badge>
              </div>
              {item.mediaContentType === "VIDEO" && (
                <div className="absolute top-1 right-1">
                  <Badge className="text-xs">Video</Badge>
                </div>
              )}
            </div>
            {item.alt && (
              <p className="text-xs text-muted-foreground truncate">{item.alt}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AltTextTab({
  media,
  edits,
  setEdits,
  onSave,
  isSaving,
}: {
  media: MediaDetail[];
  edits: Record<string, string>;
  setEdits: (edits: Record<string, string>) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const imageMedia = media.filter(m => m.mediaContentType === "IMAGE");
  const hasEdits = Object.keys(edits).length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">{imageMedia.length} image{imageMedia.length !== 1 ? "s" : ""}</p>
        <Button
          onClick={onSave}
          disabled={!hasEdits || isSaving}
          data-testid="button-save-alt-text"
        >
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
          Save Alt Text
        </Button>
      </div>

      <div className="space-y-2">
        {imageMedia.map((item) => (
          <div key={item.id} className="flex items-start gap-3" data-testid={`alt-text-row-${item.position}`}>
            <div className="w-16 h-20 flex-shrink-0 bg-muted rounded-sm overflow-hidden">
              {item.url && (
                <img src={item.url + "&width=120"} alt="" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-mono">{item.position}</Badge>
                {item.alt && !edits[item.id] && (
                  <Badge variant="outline" className="text-xs">
                    <Tag className="w-3 h-3 mr-1" /> Has alt
                  </Badge>
                )}
              </div>
              <Input
                value={edits[item.id] ?? item.alt ?? ""}
                onChange={e => setEdits({ ...edits, [item.id]: e.target.value })}
                placeholder="Enter alt text..."
                className="text-sm"
                data-testid={`input-alt-text-${item.position}`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScanVideoTab({
  media,
  onGenerate,
  isGenerating,
  sourceDim,
  setSourceDim,
}: {
  media: MediaDetail[];
  onGenerate: () => void;
  isGenerating: boolean;
  sourceDim: number;
  setSourceDim: (d: number) => void;
}) {
  const videos = media.filter(m => m.mediaContentType === "VIDEO" || m.mediaContentType === "EXTERNAL_VIDEO");
  const SOURCE_OPTIONS = [1500, 2000, 2500, 3000, 3500, 4000];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-medium">Scan Video Settings</p>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Source resolution (max dimension)</p>
            <div className="flex gap-2 flex-wrap">
              {SOURCE_OPTIONS.map(dim => (
                <Button
                  key={dim}
                  variant={sourceDim === dim ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSourceDim(dim)}
                  data-testid={`button-source-dim-${dim}`}
                >
                  {dim}px
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Higher = sharper zoom detail but larger file. Output is always 1080x1350. Existing video will be replaced.
          </p>
          <Button
            onClick={onGenerate}
            disabled={isGenerating}
            data-testid="button-generate-scan-video"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating at {sourceDim}px...
              </>
            ) : (
              <>
                <Film className="w-4 h-4 mr-2" />
                Generate Scan Video ({sourceDim}px)
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {videos.length} video{videos.length !== 1 ? "s" : ""} on this product
        </p>
      </div>

      {isGenerating && (
        <Card>
          <CardContent className="p-6 text-center space-y-2">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Generating scan video... this may take a few minutes</p>
          </CardContent>
        </Card>
      )}

      {videos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {videos.map((v) => (
            <div key={v.id} className="space-y-1" data-testid={`video-item-${v.position}`}>
              <div className="relative aspect-[3/4] bg-muted rounded-md overflow-hidden flex items-center justify-center">
                {v.url ? (
                  <img src={v.url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Video className="w-10 h-10 text-muted-foreground" />
                )}
                <div className="absolute top-1 left-1">
                  <Badge variant="secondary" className="text-xs font-mono">{v.position}</Badge>
                </div>
                <div className="absolute top-1 right-1">
                  <Badge className="text-xs">Video</Badge>
                </div>
              </div>
              {v.alt && <p className="text-xs text-muted-foreground truncate">{v.alt}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MockupsTab({
  media,
  mockups,
  setMockups,
  frames,
  setFrames,
  ratio,
  setRatio,
  orientation,
  setOrientation,
  insertPosition,
  setInsertPosition,
  onGenerate,
  onPush,
  isGenerating,
  isPushing,
}: {
  media: MediaDetail[];
  mockups: GeneratedMockup[];
  setMockups: (m: GeneratedMockup[]) => void;
  frames: string[];
  setFrames: (f: string[]) => void;
  ratio: string;
  setRatio: (r: string) => void;
  orientation: "portrait" | "landscape";
  setOrientation: (o: "portrait" | "landscape") => void;
  insertPosition: number;
  setInsertPosition: (p: number) => void;
  onGenerate: () => void;
  onPush: () => void;
  isGenerating: boolean;
  isPushing: boolean;
}) {
  const allFrameOptions = ["black", "white", "natural", "unframed"];

  const toggleFrame = (frame: string) => {
    if (frames.includes(frame)) {
      setFrames(frames.filter(f => f !== frame));
    } else {
      setFrames([...frames, frame]);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-sm font-medium">Mockup Settings</p>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-2">Frame styles</p>
              <div className="flex gap-2 flex-wrap">
                {allFrameOptions.map(f => (
                  <label key={f} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={frames.includes(f)}
                      onCheckedChange={() => toggleFrame(f)}
                      data-testid={`checkbox-frame-${f}`}
                    />
                    {FRAME_LABELS[f]}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-4 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Insert at position</p>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={insertPosition}
                  onChange={e => setInsertPosition(parseInt(e.target.value) || 1)}
                  className="w-[80px]"
                  data-testid="input-insert-position"
                />
              </div>
              {ratio && (
                <div className="flex items-end gap-2">
                  <Badge variant="secondary" className="text-xs">{ratio}</Badge>
                  <Badge variant="secondary" className="text-xs">{orientation}</Badge>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={onGenerate}
              variant="outline"
              disabled={isGenerating || frames.length === 0}
              data-testid="button-generate-mockups"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating Preview...
                </>
              ) : (
                <>
                  <Palette className="w-4 h-4 mr-2" />
                  Preview Mockups
                </>
              )}
            </Button>
            <Button
              onClick={onPush}
              disabled={isPushing}
              data-testid="button-replace-mockups-direct"
            >
              {isPushing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Replacing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Replace Mockups on Shopify
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {mockups.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-medium">Generated Mockups ({mockups.length})</p>
              <Button
                onClick={onPush}
                disabled={isPushing || mockups.filter(m => m.selected).length === 0}
                data-testid="button-push-mockups"
              >
                {isPushing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Replace Mockups on Shopify
                  </>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {mockups.map((mockup, idx) => (
                <div key={idx} className="space-y-2" data-testid={`mockup-preview-${mockup.frame}`}>
                  <div className="relative aspect-[3/4] bg-muted rounded-md overflow-hidden">
                    <img
                      src={`data:image/jpeg;base64,${mockup.base64}`}
                      alt={FRAME_LABELS[mockup.frame]}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={mockup.selected}
                      onCheckedChange={(checked) => {
                        const updated = [...mockups];
                        updated[idx] = { ...updated[idx], selected: !!checked };
                        setMockups(updated);
                      }}
                      data-testid={`checkbox-mockup-${mockup.frame}`}
                    />
                    <span className="text-sm">{FRAME_LABELS[mockup.frame] || mockup.frame}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScaleCalibrationTab({ productGid, media }: {
  productGid?: string;
  media: Array<{ id: string; url: string; alt: string; mediaContentType: string }>;
}) {
  const { toast } = useToast();
  const [referenceUrl, setReferenceUrl] = useState("");
  const [scaleValue, setScaleValue] = useState(1.0);
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);
  const [calibrationFrame, setCalibrationFrame] = useState("black");
  const [calibrationRatio, setCalibrationRatio] = useState("a-ratio");
  const [calibrationOrientation, setCalibrationOrientation] = useState("portrait");
  const [overlayOpacity, setOverlayOpacity] = useState(50);

  const scaleSettingsQuery = useQuery<{ mockupScaleMultiplier: number }>({
    queryKey: ["/api/admin/product-media/scale-settings"],
  });

  useEffect(() => {
    if (scaleSettingsQuery.data) {
      setScaleValue(scaleSettingsQuery.data.mockupScaleMultiplier);
    }
  }, [scaleSettingsQuery.data]);

  const [artworkUrl, setArtworkUrl] = useState("");
  const sourceImage = media.find(m => m.mediaContentType === "IMAGE" && m.url);
  const effectiveArtworkUrl = artworkUrl || sourceImage?.url || "";

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveArtworkUrl) throw new Error("No artwork image URL provided");
      const res = await apiRequest("POST", "/api/admin/product-media/calibration-preview", {
        imageUrl: effectiveArtworkUrl,
        imageSource: "url",
        frame: calibrationFrame,
        ratioCategory: calibrationRatio,
        orientation: calibrationOrientation,
        scaleMultiplier: scaleValue,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewBase64(data.base64);
    },
    onError: (err: Error) => {
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
    },
  });

  const saveScaleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/product-media/scale-settings", {
        mockupScaleMultiplier: scaleValue,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/product-media/scale-settings"] });
      toast({ title: "Scale saved", description: `Multiplier set to ${scaleValue.toFixed(2)}x` });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4" data-testid="scale-calibration-tab">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Scale Calibration</h3>
            <p className="text-xs text-muted-foreground">
              Compare auto-generated mockups against a legacy reference image. Adjust the scale multiplier until the frame size matches, then save for future mockup generation.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Frame</label>
              <Select value={calibrationFrame} onValueChange={setCalibrationFrame}>
                <SelectTrigger data-testid="select-calibration-frame">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="black">Black</SelectItem>
                  <SelectItem value="white">White</SelectItem>
                  <SelectItem value="natural">Natural</SelectItem>
                  <SelectItem value="unframed">Unframed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Ratio</label>
              <Select value={calibrationRatio} onValueChange={setCalibrationRatio}>
                <SelectTrigger data-testid="select-calibration-ratio">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a-ratio">A Ratio</SelectItem>
                  <SelectItem value="3:4">3:4</SelectItem>
                  <SelectItem value="2:3">2:3</SelectItem>
                  <SelectItem value="4:5">4:5</SelectItem>
                  <SelectItem value="square">Square</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Orientation</label>
              <Select value={calibrationOrientation} onValueChange={setCalibrationOrientation}>
                <SelectTrigger data-testid="select-calibration-orientation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="landscape">Landscape</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <label className="text-sm font-medium">
                Scale Multiplier: {scaleValue.toFixed(2)}x
              </label>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setScaleValue(1.0)}
                  data-testid="button-reset-scale"
                >
                  Reset to 1.0
                </Button>
              </div>
            </div>
            <Slider
              value={[scaleValue]}
              onValueChange={([v]) => setScaleValue(v)}
              min={0.5}
              max={2.0}
              step={0.01}
              className="w-full"
              data-testid="slider-scale"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.50x</span>
              <span>1.00x</span>
              <span>1.50x</span>
              <span>2.00x</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">
              Artwork Image URL {sourceImage ? "(auto-filled from product)" : "(required)"}
            </label>
            <Input
              value={artworkUrl}
              onChange={(e) => setArtworkUrl(e.target.value)}
              placeholder={sourceImage ? sourceImage.url : "https://cdn.shopify.com/... (paste artwork image URL)"}
              data-testid="input-artwork-url"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Legacy Reference URL (optional, for overlay comparison)</label>
            <Input
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              placeholder="https://cdn.shopify.com/... (paste legacy mockup URL)"
              data-testid="input-reference-url"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending || !effectiveArtworkUrl}
              data-testid="button-generate-preview"
            >
              {previewMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Generate Preview
                </>
              )}
            </Button>
            <Button
              variant="default"
              onClick={() => saveScaleMutation.mutate()}
              disabled={saveScaleMutation.isPending}
              data-testid="button-save-scale"
            >
              {saveScaleMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Save Scale ({scaleValue.toFixed(2)}x)
                </>
              )}
            </Button>
          </div>

          {!sourceImage && !artworkUrl && (
            <p className="text-xs text-muted-foreground">Paste a Shopify CDN artwork image URL above to generate a preview mockup for calibration.</p>
          )}
        </CardContent>
      </Card>

      {(previewBase64 || referenceUrl) && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-medium">Preview Comparison</h3>

            {referenceUrl && previewBase64 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <label className="text-xs text-muted-foreground">Overlay Opacity</label>
                  <span className="text-xs text-muted-foreground">{overlayOpacity}%</span>
                </div>
                <Slider
                  value={[overlayOpacity]}
                  onValueChange={([v]) => setOverlayOpacity(v)}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full"
                  data-testid="slider-overlay-opacity"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {referenceUrl && (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground font-medium">Legacy Reference</label>
                  <div className="relative aspect-[3/4] bg-muted rounded-md overflow-hidden">
                    <img
                      src={referenceUrl}
                      alt="Legacy reference"
                      className="w-full h-full object-contain"
                      data-testid="img-reference"
                    />
                  </div>
                </div>
              )}

              {previewBase64 && (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground font-medium">
                    Generated ({scaleValue.toFixed(2)}x)
                  </label>
                  <div className="relative aspect-[3/4] bg-muted rounded-md overflow-hidden">
                    {referenceUrl && (
                      <img
                        src={referenceUrl}
                        alt="Reference overlay"
                        className="absolute inset-0 w-full h-full object-contain"
                        style={{ opacity: overlayOpacity / 100 }}
                        data-testid="img-reference-overlay"
                      />
                    )}
                    <img
                      src={`data:image/jpeg;base64,${previewBase64}`}
                      alt="Generated preview"
                      className={`w-full h-full object-contain ${referenceUrl ? "absolute inset-0" : ""}`}
                      style={referenceUrl ? { opacity: 1 - overlayOpacity / 100 } : undefined}
                      data-testid="img-generated-preview"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <RescaleProductsSection
        ratioCategory={calibrationRatio}
        orientation={calibrationOrientation}
      />
    </div>
  );
}

interface ScannedProduct {
  gid: string;
  title: string;
  autoMockups: Array<{ id: string; alt: string; frameKey: string; position: number; url: string | null }>;
  sourceImage: { id: string; url: string } | null;
  hasLocalSource?: boolean;
  selected: boolean;
}

function RescaleProductsSection({ ratioCategory, orientation }: {
  ratioCategory: string;
  orientation: string;
}) {
  const { toast } = useToast();
  const [scannedProducts, setScannedProducts] = useState<ScannedProduct[]>([]);
  const [rescaleProgress, setRescaleProgress] = useState<Record<string, "pending" | "processing" | "done" | "error">>({});

  const productsQuery = useQuery<Array<{ gid: string }>>({
    queryKey: ["/api/admin/product-media/products"],
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const products = productsQuery.data || [];
      if (products.length === 0) throw new Error("No products loaded");
      const sorted = [...products].sort((a: any, b: any) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return db - da;
      });
      const gids = sorted.slice(0, 100).map(p => p.gid);
      const batchSize = 25;
      const allResults: ScannedProduct[] = [];
      for (let i = 0; i < gids.length; i += batchSize) {
        const batch = gids.slice(i, i + batchSize);
        const res = await apiRequest("POST", "/api/admin/product-media/scan-auto-mockups", { productGids: batch });
        const data = await res.json();
        if (data.products) {
          allResults.push(...data.products.filter((p: any) => p.autoMockups.length > 0).map((p: any) => ({ ...p, selected: true })));
        }
      }
      return allResults;
    },
    onSuccess: (data) => {
      setScannedProducts(data);
      toast({
        title: "Scan complete",
        description: `Found ${data.length} product${data.length !== 1 ? "s" : ""} with auto-generated mockups`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    },
  });

  const rescaleMutation = useMutation({
    mutationFn: async () => {
      const selected = scannedProducts.filter(p => p.selected);
      if (selected.length === 0) throw new Error("No products selected");
      const results: Array<{ gid: string; title: string; success: boolean; replaced: number; error?: string }> = [];
      for (const product of selected) {
        setRescaleProgress(prev => ({ ...prev, [product.gid]: "processing" }));
        try {
          const res = await apiRequest("POST", "/api/admin/product-media/rescale-mockups", {
            productGid: product.gid,
            ratioCategory,
            orientation,
          });
          const data = await res.json();
          results.push({ gid: product.gid, title: product.title, success: true, replaced: data.replaced });
          setRescaleProgress(prev => ({ ...prev, [product.gid]: "done" }));
        } catch (err: any) {
          results.push({ gid: product.gid, title: product.title, success: false, replaced: 0, error: err.message });
          setRescaleProgress(prev => ({ ...prev, [product.gid]: "error" }));
        }
      }
      return results;
    },
    onSuccess: (data) => {
      const succeeded = data.filter(r => r.success).length;
      const totalReplaced = data.reduce((sum, r) => sum + r.replaced, 0);
      toast({
        title: "Re-scale complete",
        description: `${succeeded}/${data.length} products updated, ${totalReplaced} mockups replaced`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Re-scale failed", description: err.message, variant: "destructive" });
    },
  });

  const selectedCount = scannedProducts.filter(p => p.selected).length;
  const totalMockups = scannedProducts.filter(p => p.selected).reduce((sum, p) => sum + p.autoMockups.length, 0);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Re-scale Existing Mockups</h3>
          <p className="text-xs text-muted-foreground">
            Scan your products to find auto-generated frame mockups, then replace them with newly scaled versions. This deletes the old mockups and uploads regenerated ones at the saved scale.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending || !productsQuery.data}
            data-testid="button-scan-mockups"
          >
            {scanMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Scan Recent Products (latest 100)
              </>
            )}
          </Button>

          {scannedProducts.length > 0 && (
            <Button
              onClick={() => rescaleMutation.mutate()}
              disabled={rescaleMutation.isPending || selectedCount === 0}
              data-testid="button-rescale-all"
            >
              {rescaleMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Re-scaling...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Re-scale {selectedCount} Product{selectedCount !== 1 ? "s" : ""} ({totalMockups} mockup{totalMockups !== 1 ? "s" : ""})
                </>
              )}
            </Button>
          )}
        </div>

        {scannedProducts.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <span className="text-xs text-muted-foreground">
                {scannedProducts.length} product{scannedProducts.length !== 1 ? "s" : ""} with auto-generated mockups
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScannedProducts(prev => prev.map(p => ({ ...p, selected: true })))}
                  data-testid="button-select-all"
                >
                  Select All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScannedProducts(prev => prev.map(p => ({ ...p, selected: false })))}
                  data-testid="button-deselect-all"
                >
                  Deselect All
                </Button>
              </div>
            </div>

            <div className="border rounded-md divide-y max-h-[400px] overflow-y-auto">
              {scannedProducts.map(product => {
                const status = rescaleProgress[product.gid];
                return (
                  <div
                    key={product.gid}
                    className="flex items-center gap-3 p-3"
                    data-testid={`rescale-product-${product.gid}`}
                  >
                    <Checkbox
                      checked={product.selected}
                      onCheckedChange={(checked) => {
                        setScannedProducts(prev => prev.map(p =>
                          p.gid === product.gid ? { ...p, selected: !!checked } : p
                        ));
                      }}
                      disabled={rescaleMutation.isPending}
                      data-testid={`checkbox-product-${product.gid}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{product.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.autoMockups.length} auto-generated mockup{product.autoMockups.length !== 1 ? "s" : ""}
                        {" "}({product.autoMockups.map(m => m.frameKey).join(", ")})
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {status === "processing" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                      {status === "done" && <Check className="w-4 h-4 text-green-600" />}
                      {status === "error" && <X className="w-4 h-4 text-destructive" />}
                      {!status && product.sourceImage && (
                        <Badge variant="secondary" className="text-xs">Shopify source</Badge>
                      )}
                      {!status && !product.sourceImage && product.hasLocalSource && (
                        <Badge variant="secondary" className="text-xs">Local source</Badge>
                      )}
                      {!status && !product.sourceImage && !product.hasLocalSource && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">No source</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
