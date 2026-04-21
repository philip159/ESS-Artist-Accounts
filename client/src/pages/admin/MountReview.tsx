import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Search, Filter, RefreshCw, Eye, Check, X, Undo2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

interface MountReviewProduct {
  productId: string;
  gid: string;
  title: string;
  handle: string;
  vendor: string;
  status: string;
  wavImageUrl: string | null;
  hasMount: string | null;
  shape: string | null;
  sizes: string[];
  featuredImageUrl: string | null;
}

type Decision = "approved" | "rejected";

const SQUARE_SIZE_KEYS = new Set(["10x10", "12x12", "16x16", "20x20", "30x30"]);
const A_RATIO_KEYS = new Set(["a0", "a1", "a2", "a3", "a4"]);

function isARatioOnly(sizes: string[]): boolean {
  if (!sizes || sizes.length === 0) return false;
  const normalised = sizes.map(s =>
    s.replace(/["\u201C\u201D\u2033\s]/g, "").toLowerCase()
  );
  return normalised.every(s => Array.from(A_RATIO_KEYS).some(k => s.startsWith(k)));
}

function isSquareProduct(sizes: string[]): boolean {
  if (!sizes || sizes.length === 0) return false;
  const normalised = sizes.map(s =>
    s.replace(/["\u201C\u201D\u2033\s]/g, "").toLowerCase()
  );
  return normalised.every(s => SQUARE_SIZE_KEYS.has(s) || /^(\d+)x\1$/.test(s));
}

function getShapeFromMetafield(shape: string | null): "portrait" | "landscape" | "square" | null {
  if (!shape) return null;
  const cleaned = shape.replace(/[\[\]"]/g, '').trim().toLowerCase();
  if (cleaned === "square") return "square";
  if (cleaned === "portrait") return "portrait";
  if (cleaned === "landscape") return "landscape";
  return null;
}

function getEffectiveDecision(product: MountReviewProduct, localDecisions: Record<string, Decision>): Decision | null {
  if (localDecisions[product.gid]) return localDecisions[product.gid];
  if (product.hasMount === "Yes") return "approved";
  if (product.hasMount === "No") return "rejected";
  return null;
}

const PREVIEW_W = 110;
const PREVIEW_H = 150;
const FRAME_COLOR = "#1a1a1a";
const MOUNT_COLOR = "#f5f2ed";
const FRAME_WIDTH_MM = 21;

function getMountBorderMm(wMm: number, hMm: number): number {
  const shorter = Math.min(wMm, hMm);
  const longer = Math.max(wMm, hMm);
  if (shorter <= 254 && longer <= 254) return 25;
  if (shorter <= 279 && longer <= 356) return 40;
  return 50;
}

const PRINT_SIZES: { key: string; wMm: number; hMm: number }[] = [
  { key: "6x8", wMm: 152, hMm: 203 },
  { key: "8x10", wMm: 203, hMm: 254 },
  { key: "a4", wMm: 210, hMm: 297 },
  { key: "8x12", wMm: 203, hMm: 305 },
  { key: "11x14", wMm: 279, hMm: 356 },
  { key: "a3", wMm: 297, hMm: 420 },
  { key: "12x16", wMm: 305, hMm: 406 },
  { key: "12x18", wMm: 305, hMm: 457 },
  { key: "16x20", wMm: 406, hMm: 508 },
  { key: "a2", wMm: 420, hMm: 594 },
  { key: "18x24", wMm: 457, hMm: 610 },
  { key: "20x28", wMm: 508, hMm: 711 },
  { key: "20x30", wMm: 508, hMm: 762 },
  { key: "a1", wMm: 594, hMm: 841 },
  { key: "24x32", wMm: 610, hMm: 813 },
  { key: "24x36", wMm: 610, hMm: 914 },
  { key: "28x40", wMm: 711, hMm: 1016 },
  { key: "30x40", wMm: 762, hMm: 1016 },
  { key: "a0", wMm: 841, hMm: 1189 },
  { key: "12x12", wMm: 305, hMm: 305 },
  { key: "16x16", wMm: 406, hMm: 406 },
  { key: "20x20", wMm: 508, hMm: 508 },
  { key: "30x30", wMm: 762, hMm: 762 },
];

function findAllMatchedSizes(productSizes: string[]): { key: string; wMm: number; hMm: number; label: string }[] {
  const normalised = productSizes.map(s =>
    s.replace(/["\u201C\u201D\u2033\s]/g, "").toLowerCase()
  );

  const matched: { key: string; wMm: number; hMm: number; label: string }[] = [];
  for (const ps of PRINT_SIZES) {
    const idx = normalised.findIndex(s => s.includes(ps.key));
    if (idx >= 0) {
      matched.push({ ...ps, label: productSizes[idx] });
    }
  }
  matched.sort((a, b) => (a.wMm * a.hMm) - (b.wMm * b.hMm));
  return matched;
}

function FramePreview({
  artworkUrl,
  withMount,
  printSize,
}: {
  artworkUrl: string;
  withMount: boolean;
  printSize: { wMm: number; hMm: number } | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    imgRef.current = null;
    setImageLoaded(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setImageLoaded(true);
    };
    img.src = artworkUrl;
  }, [artworkUrl]);

  useEffect(() => {
    if (!imageLoaded || !imgRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = PREVIEW_W * dpr;
    canvas.height = PREVIEW_H * dpr;
    canvas.style.width = PREVIEW_W + "px";
    canvas.style.height = PREVIEW_H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);

    const imgW = imgRef.current.naturalWidth;
    const imgH = imgRef.current.naturalHeight;
    const imgRatio = imgW / imgH;

    let printWMm: number, printHMm: number;
    if (printSize) {
      const isLandscape = imgRatio > 1;
      printWMm = isLandscape ? Math.max(printSize.wMm, printSize.hMm) : Math.min(printSize.wMm, printSize.hMm);
      printHMm = isLandscape ? Math.min(printSize.wMm, printSize.hMm) : Math.max(printSize.wMm, printSize.hMm);
    } else {
      printWMm = imgRatio >= 1 ? 400 : 400 * imgRatio;
      printHMm = imgRatio >= 1 ? 400 / imgRatio : 400;
    }
    const mountMm = withMount ? getMountBorderMm(printWMm, printHMm) : 0;

    const totalFramedW = printWMm + FRAME_WIDTH_MM * 2;
    const totalFramedH = printHMm + FRAME_WIDTH_MM * 2;

    const framedRatio = totalFramedW / totalFramedH;

    const maxW = PREVIEW_W - 20;
    const maxH = PREVIEW_H - 20;
    let frameOuterW: number, frameOuterH: number;
    if (framedRatio > maxW / maxH) {
      frameOuterW = maxW;
      frameOuterH = maxW / framedRatio;
    } else {
      frameOuterH = maxH;
      frameOuterW = maxH * framedRatio;
    }

    const frameX = (PREVIEW_W - frameOuterW) / 2;
    const frameY = (PREVIEW_H - frameOuterH) / 2;

    const scale = frameOuterW / totalFramedW;
    const frameBorderW = FRAME_WIDTH_MM * scale;
    const frameBorderH = FRAME_WIDTH_MM * scale;
    const mountBorderW = mountMm * scale;
    const mountBorderH = mountMm * scale;

    ctx.fillStyle = FRAME_COLOR;
    ctx.fillRect(frameX, frameY, frameOuterW, frameOuterH);

    if (withMount) {
      const mountX = frameX + frameBorderW;
      const mountY = frameY + frameBorderH;
      const mountW = frameOuterW - frameBorderW * 2;
      const mountH = frameOuterH - frameBorderH * 2;
      ctx.fillStyle = MOUNT_COLOR;
      ctx.fillRect(mountX, mountY, mountW, mountH);

      const innerShadowDepth = 2;
      const apertureX = mountX + mountBorderW;
      const apertureY = mountY + mountBorderH;
      const grad = ctx.createLinearGradient(apertureX, apertureY - innerShadowDepth, apertureX, apertureY + innerShadowDepth);
      grad.addColorStop(0, "rgba(0,0,0,0.12)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      const apertureW = mountW - mountBorderW * 2;
      ctx.fillRect(apertureX, apertureY - innerShadowDepth, apertureW, innerShadowDepth * 2);
    }

    const artX = frameX + frameBorderW + mountBorderW;
    const artY = frameY + frameBorderH + mountBorderH;
    const artW = frameOuterW - (frameBorderW + mountBorderW) * 2;
    const artH = frameOuterH - (frameBorderH + mountBorderH) * 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(artX, artY, artW, artH);
    ctx.clip();

    const img = imgRef.current;
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    const drawRatio = img.naturalWidth / img.naturalHeight;
    if (drawRatio > artW / artH) {
      sw = img.naturalHeight * (artW / artH);
      sx = (img.naturalWidth - sw) / 2;
    } else {
      sh = img.naturalWidth / (artW / artH);
      sy = (img.naturalHeight - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, artX, artY, artW, artH);
    ctx.restore();

    ctx.strokeStyle = "rgba(0, 120, 255, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(artX, artY, artW, artH);

    if (!withMount) {
      const lipWidth = 1.5;
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(artX, artY, artW, lipWidth);
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(artX, artY, lipWidth, artH);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(artX, artY + artH - lipWidth, artW, lipWidth);
      ctx.fillRect(artX + artW - lipWidth, artY, lipWidth, artH);
    }
  }, [imageLoaded, withMount, printSize]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{ width: PREVIEW_W, height: PREVIEW_H, borderRadius: 6 }} className="border bg-muted/30 flex items-center justify-center">
        {!imageLoaded ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <canvas ref={canvasRef} />
        )}
      </div>
      <span className="text-xs text-muted-foreground">{withMount ? "With Mount" : "No Mount"}</span>
    </div>
  );
}

function ProductRow({
  product,
  decision,
  hasLocalOverride,
  onApprove,
  onReject,
  onUndo,
}: {
  product: MountReviewProduct;
  decision: Decision | null;
  hasLocalOverride: boolean;
  onApprove: () => void;
  onReject: () => void;
  onUndo: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);

  const artworkUrl = product.wavImageUrl;
  const isSizesSquare = isSquareProduct(product.sizes);
  const detectedShape = isSizesSquare ? "square" : getShapeFromMetafield(product.shape);
  const shapeLabel = isSizesSquare ? "Square" : (product.shape ? product.shape.replace(/[\[\]"]/g, '') : null);
  const allSizes = useMemo(() => findAllMatchedSizes(product.sizes || []), [product.sizes]);

  return (
    <Card className="p-4" data-testid={`card-product-${product.productId}`}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm truncate" data-testid={`text-title-${product.productId}`}>
                  {product.title}
                </span>
                {decision === "approved" && (
                  <Badge variant="secondary" className="text-xs">Approved</Badge>
                )}
                {decision === "rejected" && (
                  <Badge variant="outline" className="text-xs">Rejected</Badge>
                )}
                {decision === null && (
                  <Badge variant="outline" className="text-xs opacity-50">Needs Review</Badge>
                )}
                {hasLocalOverride && (
                  <Badge variant="default" className="text-xs">Unsaved</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {product.vendor}
                {shapeLabel && <> &middot; {shapeLabel}</>}
              </div>
              {product.sizes && product.sizes.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {product.sizes.map(size => (
                    <Badge key={size} variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{size}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {artworkUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                data-testid={`button-preview-${product.productId}`}
              >
                <Eye className="w-4 h-4 mr-1" />
                {showPreview ? "Hide" : "Preview"}
              </Button>
            )}
            {hasLocalOverride && (
              <Button
                variant="outline"
                size="sm"
                onClick={onUndo}
                data-testid={`button-undo-${product.productId}`}
              >
                <Undo2 className="w-4 h-4 mr-1" />
                Undo
              </Button>
            )}
            {decision !== "approved" && (
              <Button
                variant="outline"
                size="sm"
                onClick={onApprove}
                className="text-green-700 dark:text-green-400 border-green-300 dark:border-green-700"
                data-testid={`button-approve-${product.productId}`}
              >
                <Check className="w-4 h-4 mr-1" />
                Approve
              </Button>
            )}
            {decision !== "rejected" && (
              <Button
                variant="outline"
                size="sm"
                onClick={onReject}
                className="text-red-700 dark:text-red-400 border-red-300 dark:border-red-700"
                data-testid={`button-reject-${product.productId}`}
              >
                <X className="w-4 h-4 mr-1" />
                Reject
              </Button>
            )}
          </div>
        </div>

        {showPreview && artworkUrl && (
          <div className="pt-2 border-t space-y-4">
            {allSizes.length === 0 ? (
              <div className="flex gap-4 justify-center">
                <FramePreview artworkUrl={artworkUrl} withMount={false} printSize={null} />
                <FramePreview artworkUrl={artworkUrl} withMount={true} printSize={null} />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {allSizes.map((size) => {
                  const mountBorder = getMountBorderMm(size.wMm, size.hMm);
                  return (
                    <div key={size.key} className="flex flex-col items-center gap-1 p-2 rounded-md border bg-muted/20">
                      <p className="text-[10px] font-medium text-center" data-testid={`text-size-label-${size.key}`}>
                        {size.label}
                      </p>
                      <p className="text-[9px] text-muted-foreground text-center">
                        {size.wMm} x {size.hMm}mm &middot; Mount: {mountBorder}mm
                      </p>
                      <div className="flex gap-2 justify-center">
                        <FramePreview artworkUrl={artworkUrl} withMount={false} printSize={size} />
                        <FramePreview artworkUrl={artworkUrl} withMount={true} printSize={size} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

type FilterMode = "needs_review" | "approved" | "rejected" | "changed" | "all";

export default function MountReview() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("needs_review");
  const [shapeFilter, setShapeFilter] = useState<"all" | "square" | "rectangular" | "a-ratio">("all");
  const [localDecisions, setLocalDecisions] = useState<Record<string, Decision>>({});
  const [showNoArSection, setShowNoArSection] = useState(false);

  const productsQuery = useQuery<MountReviewProduct[]>({
    queryKey: ["/api/admin/mount-review/products"],
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: { gid: string; hasMount: boolean }[]) => {
      const res = await apiRequest("POST", "/api/admin/mount-review/update", { updates });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Saved",
        description: `Updated ${data.succeeded} product${data.succeeded !== 1 ? "s" : ""}${data.failed > 0 ? `, ${data.failed} failed` : ""}`,
      });
      setLocalDecisions({});
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mount-review/products"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const changedProducts = useMemo(() => {
    if (!productsQuery.data) return [];
    return productsQuery.data.filter(p => {
      const local = localDecisions[p.gid];
      if (!local) return false;
      const shopifyDecision = p.hasMount === "Yes" ? "approved" : p.hasMount === "No" ? "rejected" : null;
      return local !== shopifyDecision;
    });
  }, [productsQuery.data, localDecisions]);

  const { withArImage, noArImage } = useMemo(() => {
    if (!productsQuery.data) return { withArImage: [] as MountReviewProduct[], noArImage: [] as MountReviewProduct[] };
    const withAr: MountReviewProduct[] = [];
    const noAr: MountReviewProduct[] = [];
    for (const p of productsQuery.data) {
      if (p.wavImageUrl) withAr.push(p);
      else noAr.push(p);
    }
    return { withArImage: withAr, noArImage: noAr };
  }, [productsQuery.data]);

  const counts = useMemo(() => {
    let needsReview = 0, approved = 0, rejected = 0;
    for (const p of withArImage) {
      const d = getEffectiveDecision(p, localDecisions);
      if (d === "approved") approved++;
      else if (d === "rejected") rejected++;
      else needsReview++;
    }
    return { needsReview, approved, rejected };
  }, [withArImage, localDecisions]);

  const filteredProducts = useMemo(() => {
    let list = [...withArImage];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.vendor.toLowerCase().includes(q) ||
        p.handle.toLowerCase().includes(q)
      );
    }

    if (filterMode === "needs_review") {
      list = list.filter(p => getEffectiveDecision(p, localDecisions) === null);
    } else if (filterMode === "approved") {
      list = list.filter(p => getEffectiveDecision(p, localDecisions) === "approved");
    } else if (filterMode === "rejected") {
      list = list.filter(p => getEffectiveDecision(p, localDecisions) === "rejected");
    } else if (filterMode === "changed") {
      list = list.filter(p => {
        const shopifyDecision = p.hasMount === "Yes" ? "approved" : p.hasMount === "No" ? "rejected" : null;
        const localDecision = localDecisions[p.gid] ?? null;
        return localDecision !== shopifyDecision;
      });
    }

    if (shapeFilter === "square") {
      list = list.filter(p => isSquareProduct(p.sizes));
    } else if (shapeFilter === "rectangular") {
      list = list.filter(p => !isSquareProduct(p.sizes));
    } else if (shapeFilter === "a-ratio") {
      list = list.filter(p => isARatioOnly(p.sizes));
    }

    return list;
  }, [withArImage, searchQuery, filterMode, shapeFilter, localDecisions]);

  const handleApprove = (gid: string) => {
    setLocalDecisions(prev => ({ ...prev, [gid]: "approved" }));
  };

  const handleReject = (gid: string) => {
    setLocalDecisions(prev => ({ ...prev, [gid]: "rejected" }));
  };

  const handleUndo = (gid: string) => {
    setLocalDecisions(prev => {
      const next = { ...prev };
      delete next[gid];
      return next;
    });
  };

  const handleSaveChanges = () => {
    if (changedProducts.length === 0) {
      toast({ title: "No changes", description: "Nothing to save." });
      return;
    }
    const updates = changedProducts.map(p => ({
      gid: p.gid,
      hasMount: localDecisions[p.gid] === "approved",
    }));
    saveMutation.mutate(updates);
  };

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Mount Review</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review artworks and decide which should have a mount option. Approve or reject each artwork, then save your decisions to Shopify.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLocalDecisions({});
              queryClient.invalidateQueries({ queryKey: ["/api/admin/mount-review/products"] });
            }}
            data-testid="button-refresh"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          <Button
            onClick={handleSaveChanges}
            disabled={changedProducts.length === 0 || saveMutation.isPending}
            data-testid="button-save-changes"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            Save Changes ({changedProducts.length})
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3" data-testid="filter-counts">
        <Card
          className={`p-3 cursor-pointer flex-1 min-w-[140px] text-center ${filterMode === "needs_review" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setFilterMode("needs_review")}
          data-testid="filter-needs-review"
        >
          <div className="text-2xl font-bold" data-testid="count-needs-review">{counts.needsReview}</div>
          <div className="text-xs text-muted-foreground">Needs Review</div>
        </Card>
        <Card
          className={`p-3 cursor-pointer flex-1 min-w-[140px] text-center ${filterMode === "approved" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setFilterMode("approved")}
          data-testid="filter-approved"
        >
          <div className="text-2xl font-bold text-green-700 dark:text-green-400" data-testid="count-approved">{counts.approved}</div>
          <div className="text-xs text-muted-foreground">Approved</div>
        </Card>
        <Card
          className={`p-3 cursor-pointer flex-1 min-w-[140px] text-center ${filterMode === "rejected" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setFilterMode("rejected")}
          data-testid="filter-rejected"
        >
          <div className="text-2xl font-bold text-red-700 dark:text-red-400" data-testid="count-rejected">{counts.rejected}</div>
          <div className="text-xs text-muted-foreground">Rejected</div>
        </Card>
        <Card
          className={`p-3 cursor-pointer flex-1 min-w-[140px] text-center ${filterMode === "all" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setFilterMode("all")}
          data-testid="filter-all"
        >
          <div className="text-2xl font-bold" data-testid="count-all">{(counts.needsReview + counts.approved + counts.rejected)}</div>
          <div className="text-xs text-muted-foreground">All</div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, vendor, or handle..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={shapeFilter} onValueChange={(v: any) => setShapeFilter(v)}>
              <SelectTrigger className="w-[150px]" data-testid="select-shape-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Shapes</SelectItem>
                <SelectItem value="square">Square</SelectItem>
                <SelectItem value="rectangular">Rectangular</SelectItem>
                <SelectItem value="a-ratio">A-Ratio Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {changedProducts.length > 0 && (
            <Badge variant="default" className="text-xs" data-testid="badge-unsaved">
              {changedProducts.length} unsaved change{changedProducts.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </Card>

      {productsQuery.isLoading && (
        <div className="flex items-center justify-center p-12" data-testid="loading-products">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span className="text-muted-foreground">Loading products from Shopify...</span>
        </div>
      )}

      {productsQuery.error && (
        <Card className="p-6 text-center text-destructive" data-testid="error-products">
          Failed to load products: {(productsQuery.error as Error).message}
        </Card>
      )}

      {productsQuery.data && (
        <div className="text-sm text-muted-foreground" data-testid="text-product-count">
          Showing {filteredProducts.length} products
        </div>
      )}

      <div className="space-y-2">
        {filteredProducts.map(product => (
          <ProductRow
            key={product.gid}
            product={product}
            decision={getEffectiveDecision(product, localDecisions)}
            hasLocalOverride={product.gid in localDecisions}
            onApprove={() => handleApprove(product.gid)}
            onReject={() => handleReject(product.gid)}
            onUndo={() => handleUndo(product.gid)}
          />
        ))}
      </div>

      {filteredProducts.length === 0 && productsQuery.data && !productsQuery.isLoading && (
        <Card className="p-8 text-center text-muted-foreground" data-testid="text-no-results">
          {filterMode === "needs_review"
            ? "All artworks have been reviewed. Switch to Approved or Rejected to see your decisions."
            : "No products match your search or filter criteria."}
        </Card>
      )}

      {noArImage.length > 0 && (
        <div className="space-y-2 pt-4 border-t" data-testid="section-no-ar-image">
          <button
            className="flex items-center gap-2 w-full text-left"
            onClick={() => setShowNoArSection(!showNoArSection)}
            data-testid="button-toggle-no-ar"
          >
            {showNoArSection ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="font-medium text-sm">No AR Image ({noArImage.length})</span>
            <span className="text-xs text-muted-foreground">These products have no AR image assigned and cannot be previewed.</span>
          </button>
          {showNoArSection && (
            <div className="space-y-2 pl-6">
              {noArImage.map(product => {
                const shapeLabel = isSquareProduct(product.sizes) ? "Square" : (product.shape ? product.shape.replace(/[\[\]"]/g, '') : null);
                return (
                  <Card key={product.gid} className="p-3" data-testid={`card-no-ar-${product.productId}`}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate" data-testid={`text-no-ar-title-${product.productId}`}>
                            {product.title}
                          </span>
                          <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700">No AR Image</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {product.vendor}
                          {shapeLabel && <> &middot; {shapeLabel}</>}
                        </div>
                        {product.sizes && product.sizes.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {product.sizes.map(size => (
                              <Badge key={size} variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{size}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
