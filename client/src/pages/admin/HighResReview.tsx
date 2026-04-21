import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Search,
  ExternalLink,
  Check,
  X,
  FolderSearch,
  Zap,
  FileImage,
  EyeOff,
  ThumbsUp,
  Undo2,
  PlusCircle,
} from "lucide-react";
import { MIN_DPI } from "@shared/schema";

interface RatioImageInfo {
  url: string | null;
  hasImage: boolean;
  width: number | null;
  height: number | null;
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

interface Artwork {
  id: string;
  title: string;
  artistName: string;
  calculatedSizes: string[];
  availableSizes: string[];
  widthPx: number;
  heightPx: number;
  dpi: number;
  aspectRatio: string;
}

interface DropboxMatch {
  name: string;
  path: string;
  id: string;
  isFolder: boolean;
  size?: number;
}

const FOUR_FIVE_SIZES = [
  { code: "8x10", label: '8" x 10"', widthIn: 8, heightIn: 10 },
  { code: "11x14", label: '11" x 14"', widthIn: 11, heightIn: 14 },
  { code: "16x20", label: '16" x 20"', widthIn: 16, heightIn: 20 },
  { code: "24x30", label: '24" x 30"', widthIn: 24, heightIn: 30 },
  { code: "32x40", label: '32" x 40"', widthIn: 32, heightIn: 40 },
] as const;

const LARGER_SIZES = ["24x30", "32x40"];

const REVIEW_STORAGE_KEY = "highres-review-statuses";

interface ReviewEntry {
  status: "approved" | "hidden";
  selectedFile?: {
    name: string;
    path: string;
    width: number;
    height: number;
    ratio: string;
    eligibleSizes: string[];
  };
}

function loadReviewStatuses(): Record<string, ReviewEntry> {
  try {
    const raw = localStorage.getItem(REVIEW_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const result: Record<string, ReviewEntry> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") {
        result[k] = { status: v as "approved" | "hidden" };
      } else {
        result[k] = v as ReviewEntry;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function saveReviewStatuses(statuses: Record<string, ReviewEntry>) {
  localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(statuses));
}

function normaliseSizeString(s: string): string {
  return s.replace(/["\u201C\u201D\u2033\u2032\s]/g, "").toLowerCase();
}

function extractSizeCode(sizeStr: string): string | null {
  const norm = normaliseSizeString(sizeStr);
  const match = norm.match(/(\d+)x(\d+)/);
  if (!match) return null;
  return `${match[1]}x${match[2]}`;
}

function has4x5Size(sizes: string[]): boolean {
  const codes = new Set(FOUR_FIVE_SIZES.map((s) => s.code));
  return sizes.some((size) => {
    const code = extractSizeCode(size);
    return code !== null && codes.has(code);
  });
}

function getProduct4x5Sizes(sizes: string[]): string[] {
  const codes = new Set(FOUR_FIVE_SIZES.map((s) => s.code));
  const found: string[] = [];
  for (const size of sizes) {
    const code = extractSizeCode(size);
    if (code && codes.has(code) && !found.includes(code)) {
      found.push(code);
    }
  }
  return found;
}

function hasLargerSizes(sizes: string[]): boolean {
  const product4x5 = getProduct4x5Sizes(sizes);
  return LARGER_SIZES.some((ls) => product4x5.includes(ls));
}

function isHighResFile(name: string, path: string): boolean {
  const lower = name.toLowerCase();
  const pathLower = path.toLowerCase();
  if (
    lower.includes("low_res") ||
    lower.includes("lowres") ||
    lower.includes("low res") ||
    lower.includes("large") ||
    lower.includes("preview") ||
    lower.includes("mockup") ||
    lower.includes("frame") ||
    lower.includes("lifestyle")
  )
    return false;
  if (
    pathLower.includes("/low res/") ||
    pathLower.includes("/low_res/") ||
    pathLower.includes("/lowres/") ||
    pathLower.includes("/1mb/") ||
    pathLower.includes("/1 mb/")
  )
    return false;
  return true;
}

function isInHighResFolder(path: string): boolean {
  const pathLower = path.toLowerCase();
  return (
    pathLower.includes("/highres/") ||
    pathLower.includes("/high res/") ||
    pathLower.includes("/high_res/") ||
    pathLower.includes("/hi-res/") ||
    pathLower.includes("/hires/")
  );
}

function calculateDpi(
  widthPx: number,
  heightPx: number,
  widthIn: number,
  heightIn: number,
): number {
  const isLandscape = widthPx > heightPx;
  const printIsLandscape = widthIn > heightIn;
  let pW = widthIn;
  let pH = heightIn;
  if (isLandscape !== printIsLandscape) {
    pW = heightIn;
    pH = widthIn;
  }
  const dpiW = widthPx / pW;
  const dpiH = heightPx / pH;
  return Math.min(dpiW, dpiH);
}

function detectRatio(w: number, h: number): string {
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  if (long === 0 || short === 0) return "Unknown";
  const r = long / short;
  if (Math.abs(r - 5 / 4) < 0.04) return "4:5";
  if (Math.abs(r - 4 / 3) < 0.04) return "3:4";
  if (Math.abs(r - 3 / 2) < 0.04) return "2:3";
  if (Math.abs(r - 7 / 5) < 0.04) return "5:7";
  if (Math.abs(r - 1) < 0.04) return "1:1";
  if (Math.abs(r - Math.sqrt(2)) < 0.04) return "A-Ratio";
  if (Math.abs(r - 11 / 8.5) < 0.06) return "Letter";
  return `${short}:${long}`;
}

interface SizeAssessment {
  code: string;
  label: string;
  widthIn: number;
  heightIn: number;
  requiredW: number;
  requiredH: number;
  actualDpi: number;
  passes: boolean;
}

function assessSizes(widthPx: number, heightPx: number): SizeAssessment[] {
  return FOUR_FIVE_SIZES.map((size) => {
    const dpi = calculateDpi(widthPx, heightPx, size.widthIn, size.heightIn);
    const requiredW = size.widthIn * MIN_DPI;
    const requiredH = size.heightIn * MIN_DPI;
    return {
      code: size.code,
      label: size.label,
      widthIn: size.widthIn,
      heightIn: size.heightIn,
      requiredW,
      requiredH,
      actualDpi: Math.round(dpi),
      passes: dpi >= MIN_DPI,
    };
  });
}

interface HighResResult {
  file: DropboxMatch;
  width: number;
  height: number;
  ratio: string;
  assessments: SizeAssessment[];
  isHighResFolder: boolean;
}

interface ProductReviewState {
  searching: boolean;
  searched: boolean;
  results: HighResResult[];
  error?: string;
}

function ProductCard({
  product,
  artworks,
  reviewState,
  reviewEntry,
  onSearch,
  onBatchSelect,
  isSelected,
  onSetStatus,
}: {
  product: Product;
  artworks: Artwork[];
  reviewState?: ProductReviewState;
  reviewEntry?: ReviewEntry;
  onSearch: (productTitle: string) => void;
  onBatchSelect?: (selected: boolean) => void;
  isSelected?: boolean;
  onSetStatus: (status: "approved" | "hidden" | null, selectedFile?: ReviewEntry["selectedFile"]) => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [customQuery, setCustomQuery] = useState("");
  const [updatingSizes, setUpdatingSizes] = useState(false);
  const product4x5Sizes = getProduct4x5Sizes(product.sizes);
  const hasLarger = hasLargerSizes(product.sizes);

  const matchedArtwork = useMemo(() => {
    const productTitleNorm = product.title.toLowerCase().trim();
    const exactMatch = artworks.find((a) => a.title.toLowerCase().trim() === productTitleNorm);
    if (exactMatch) return exactMatch;
    const productBase = productTitleNorm
      .replace(/\s*-\s*(framed|unframed|canvas|print|limited edition|open edition).*$/i, "")
      .trim();
    if (productBase.length >= 5) {
      const baseMatch = artworks.find((a) => {
        const artBase = a.title.toLowerCase().trim()
          .replace(/\s*-\s*(framed|unframed|canvas|print|limited edition|open edition).*$/i, "")
          .trim();
        return artBase === productBase;
      });
      if (baseMatch) return baseMatch;
    }
    return undefined;
  }, [product.title, artworks]);

  const handleUpdateSizes = async (artwork: Artwork, newSelectedSizes: string[]) => {
    setUpdatingSizes(true);
    try {
      if (newSelectedSizes.length < 2) {
        toast({ title: "Error", description: "Artworks must have at least 2 sizes", variant: "destructive" });
        setUpdatingSizes(false);
        return;
      }
      const invalidSizes = newSelectedSizes.filter((s) => !artwork.calculatedSizes.includes(s));
      if (invalidSizes.length > 0) {
        toast({
          title: "Cannot update sizes",
          description: `These sizes are not in calculated sizes: ${invalidSizes.join(", ")}. The high-res source may need to be re-analyzed.`,
          variant: "destructive",
        });
        setUpdatingSizes(false);
        return;
      }
      await apiRequest("PATCH", `/api/artworks/${artwork.id}/sizes`, { selectedSizes: newSelectedSizes });
      toast({ title: "Sizes updated", description: `Updated sizes for ${artwork.title}` });
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    } finally {
      setUpdatingSizes(false);
    }
  };

  return (
    <Card className={`p-4 ${reviewEntry?.status === "approved" ? "border-green-300 dark:border-green-700" : ""}`}>
      <div className="flex items-start gap-3">
        {onBatchSelect && (
          <div className="pt-1">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onBatchSelect(!!checked)}
              data-testid={`checkbox-batch-${product.productId}`}
            />
          </div>
        )}
        {product.featuredImageUrl && (
          <img
            src={product.featuredImageUrl}
            alt={product.title}
            className="w-16 h-16 object-cover rounded"
            data-testid={`img-product-${product.productId}`}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-sm truncate" data-testid={`text-product-title-${product.productId}`}>
              {product.title}
            </h3>
            <a
              href={`https://admin.shopify.com/store/essential-art-house/products/${product.productId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground"
              data-testid={`link-shopify-${product.productId}`}
            >
              <ExternalLink className="w-3 h-3" />
            </a>
            {reviewEntry?.status === "approved" && (
              <Badge variant="outline" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">
                <ThumbsUp className="w-3 h-3 mr-1" />
                {reviewEntry.selectedFile
                  ? `${reviewEntry.selectedFile.width}x${reviewEntry.selectedFile.height} (${reviewEntry.selectedFile.eligibleSizes.map(s => FOUR_FIVE_SIZES.find(f => f.code === s)?.label || s).join(", ")})`
                  : "Approved"}
              </Badge>
            )}
            {reviewEntry?.status === "hidden" && (
              <Badge variant="outline" className="text-xs bg-muted text-muted-foreground border-0">
                <EyeOff className="w-3 h-3 mr-1" />Hidden
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{product.vendor}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {hasLarger ? (
              <Badge variant="outline" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">
                <Check className="w-3 h-3 mr-1" />
                Has larger 4:5 sizes
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-0">
                Missing 24x30 / 32x40
              </Badge>
            )}
            <div className="flex gap-1 flex-wrap">
              {product4x5Sizes.map((s) => (
                <Badge key={s} variant="outline" className="text-xs">
                  {FOUR_FIVE_SIZES.find((f) => f.code === s)?.label || s}
                </Badge>
              ))}
            </div>
          </div>
          {matchedArtwork && (
            <p className="text-[10px] text-muted-foreground mt-1 font-mono">
              Artwork ID: {matchedArtwork.id} ({matchedArtwork.widthPx}x{matchedArtwork.heightPx}px, {matchedArtwork.dpi}DPI, {matchedArtwork.aspectRatio})
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {reviewEntry?.status ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSetStatus(null)}
              title="Undo review"
              data-testid={`button-undo-${product.productId}`}
            >
              <Undo2 className="w-3 h-3 mr-1" />
              Undo
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSetStatus("hidden")}
                title="Hide — can't accommodate larger sizes"
                data-testid={`button-hide-${product.productId}`}
              >
                <EyeOff className="w-3 h-3 mr-1" />
                Hide
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setExpanded(!expanded);
              if (!expanded && !reviewState?.searched) {
                onSearch(product.title);
              }
            }}
            data-testid={`button-review-${product.productId}`}
          >
            {reviewState?.searching ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <FolderSearch className="w-3 h-3 mr-1" />
            )}
            {expanded ? "Hide" : "Find High-Res"}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3">
          <Separator />

          {reviewState?.searching && (
            <div className="flex items-center gap-2 py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Searching Dropbox for high-res files...</span>
            </div>
          )}

          {reviewState?.error && (
            <p className="text-sm text-destructive text-center py-2" data-testid={`text-error-${product.productId}`}>
              {reviewState.error}
            </p>
          )}

          {reviewState?.searched && !reviewState.searching && reviewState.results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No high-res files found in Dropbox.
            </p>
          )}

          {reviewState?.results && reviewState.results.length > 0 && (
            <div className="space-y-3">
              {reviewState.results.map((result) => {
                const is4x5 = result.ratio === "4:5";
                return (
                  <Card key={result.file.id} className={`p-3 ${result.isHighResFolder ? "border-green-300 dark:border-green-700" : ""}`}>
                    <div className="flex items-start gap-2 mb-2">
                      <FileImage className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" title={result.file.name} data-testid={`text-filename-${result.file.id}`}>
                          {result.file.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate" title={result.file.path}>
                          {result.file.path}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {result.width} x {result.height}px
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-xs border-0 ${
                              is4x5
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                            }`}
                          >
                            {result.ratio}
                          </Badge>
                          {result.isHighResFolder && (
                            <Badge variant="outline" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">
                              HighRes folder
                            </Badge>
                          )}
                          {!is4x5 && (
                            <span className="text-xs text-muted-foreground">
                              Not 4:5 — size assessment may not apply
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {is4x5 && (
                      <>
                        <div className="grid grid-cols-5 gap-2 mt-2">
                          {result.assessments.map((assessment) => (
                            <div
                              key={assessment.code}
                              className={`p-2 rounded text-center ${
                                assessment.passes
                                  ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800"
                                  : "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"
                              }`}
                              data-testid={`assessment-${assessment.code}-${result.file.id}`}
                            >
                              <p className="text-xs font-medium">{assessment.label}</p>
                              <div className="flex items-center justify-center gap-1 mt-1">
                                {assessment.passes ? (
                                  <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                                ) : (
                                  <X className="w-3 h-3 text-red-600 dark:text-red-400" />
                                )}
                                <span
                                  className={`text-xs font-mono ${
                                    assessment.passes
                                      ? "text-green-700 dark:text-green-300"
                                      : "text-red-700 dark:text-red-300"
                                  }`}
                                >
                                  {assessment.actualDpi} DPI
                                </span>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                needs {assessment.requiredW}x{assessment.requiredH}
                              </p>
                            </div>
                          ))}
                        </div>
                        {(() => {
                          const eligible = result.assessments
                            .filter(a => LARGER_SIZES.includes(a.code) && a.passes)
                            .map(a => a.code);
                          const isSelected = reviewEntry?.selectedFile?.path === result.file.path;
                          if (eligible.length === 0) return null;
                          return (
                            <div className="mt-2 flex items-center gap-2">
                              {isSelected ? (
                                <Badge variant="outline" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">
                                  <Check className="w-3 h-3 mr-1" />
                                  Selected — {eligible.map(s => FOUR_FIVE_SIZES.find(f => f.code === s)?.label || s).join(", ")}
                                </Badge>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    onSetStatus("approved", {
                                      name: result.file.name,
                                      path: result.file.path,
                                      width: result.width,
                                      height: result.height,
                                      ratio: result.ratio,
                                      eligibleSizes: eligible,
                                    });
                                  }}
                                  data-testid={`button-select-file-${result.file.id}`}
                                >
                                  <ThumbsUp className="w-3 h-3 mr-1" />
                                  Select — {eligible.map(s => FOUR_FIVE_SIZES.find(f => f.code === s)?.label || s).join(", ")}
                                </Button>
                              )}
                            </div>
                          );
                        })()}
                      </>
                    )}

                    {!is4x5 && (
                      <p className="text-xs text-muted-foreground mt-2 italic">
                        This file is {result.ratio} — you'll need a 4:5 crop to add 4:5 sizes.
                      </p>
                    )}

                    {matchedArtwork && is4x5 && (
                      <div className="mt-3">
                        <SizeUpdateControls
                          artwork={matchedArtwork}
                          assessments={result.assessments}
                          onUpdate={handleUpdateSizes}
                          updating={updatingSizes}
                        />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          <div className="flex gap-1">
            <Input
              placeholder="Custom search query..."
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customQuery.trim()) {
                  onSearch(customQuery.trim());
                }
              }}
              className="h-8 text-xs"
              data-testid={`input-custom-search-${product.productId}`}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => (customQuery.trim() ? onSearch(customQuery.trim()) : onSearch(product.title))}
              disabled={reviewState?.searching}
              data-testid={`button-retry-${product.productId}`}
            >
              {reviewState?.searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function SizeUpdateControls({
  artwork,
  assessments,
  onUpdate,
  updating,
}: {
  artwork: Artwork;
  assessments: SizeAssessment[];
  onUpdate: (artwork: Artwork, newSelectedSizes: string[]) => void;
  updating: boolean;
}) {
  const fourFiveCodes = FOUR_FIVE_SIZES.map((s) => s.code);
  const [localSizes, setLocalSizes] = useState<Set<string>>(() => new Set(artwork.availableSizes));
  const [dirty, setDirty] = useState(false);

  const toggleSize = (code: string) => {
    setLocalSizes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
    setDirty(true);
  };

  const handleSave = () => {
    const newSizes = Array.from(localSizes);
    onUpdate(artwork, newSizes);
    setDirty(false);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">4:5 Sizes — toggle to enable/disable:</p>
      <div className="flex items-center gap-2 flex-wrap">
        {fourFiveCodes.map((code) => {
          const assessment = assessments.find((a) => a.code === code);
          const isEnabled = localSizes.has(code);
          const inCalculated = artwork.calculatedSizes.includes(code);
          const label = FOUR_FIVE_SIZES.find((f) => f.code === code)?.label || code;

          return (
            <button
              key={code}
              onClick={() => {
                if (inCalculated) toggleSize(code);
              }}
              disabled={!inCalculated}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${
                isEnabled
                  ? "bg-green-100 border-green-300 text-green-800 dark:bg-green-900 dark:border-green-700 dark:text-green-200"
                  : "bg-muted border-border text-muted-foreground"
              } ${!inCalculated ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
              data-testid={`toggle-size-${code}-${artwork.id}`}
            >
              {isEnabled ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
              {label}
              {assessment && (
                <span className={`font-mono ${assessment.passes ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                  {assessment.actualDpi}dpi
                </span>
              )}
            </button>
          );
        })}
      </div>
      {dirty && (
        <Button
          size="sm"
          onClick={handleSave}
          disabled={updating || localSizes.size < 2}
          data-testid={`button-save-sizes-${artwork.id}`}
        >
          {updating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
          Save Size Changes
        </Button>
      )}
      {dirty && localSizes.size < 2 && (
        <p className="text-xs text-destructive">At least 2 sizes must remain enabled</p>
      )}
    </div>
  );
}

export default function HighResReview() {
  const { toast } = useToast();
  const [searchFilter, setSearchFilter] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "missing" | "has_larger">("all");
  const [reviewStates, setReviewStates] = useState<Record<string, ProductReviewState>>({});
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [batchSearching, setBatchSearching] = useState(false);
  const [reviewStatuses, setReviewStatuses] = useState<Record<string, ReviewEntry>>(loadReviewStatuses);
  const [activeTab, setActiveTab] = useState<"pending" | "reviewed">("pending");
  const [batchAddingSizes, setBatchAddingSizes] = useState(false);
  const [batchAddResults, setBatchAddResults] = useState<Array<{ productId: string; title: string; status: "pending" | "success" | "failed" | "skipped"; error?: string; detail?: string }>>([]);

  useEffect(() => {
    saveReviewStatuses(reviewStatuses);
  }, [reviewStatuses]);

  const setProductReviewStatus = useCallback((productId: string, status: "approved" | "hidden" | null, selectedFile?: ReviewEntry["selectedFile"]) => {
    setReviewStatuses(prev => {
      const next = { ...prev };
      if (status === null) {
        delete next[productId];
      } else {
        next[productId] = { status, selectedFile };
      }
      return next;
    });
  }, []);

  const { data: allProducts, isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/admin/multi-ratio/products"],
  });

  const { data: allArtworks } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"],
  });

  const products4x5 = useMemo(() => {
    if (!allProducts) return [];
    return allProducts.filter((p) => has4x5Size(p.sizes));
  }, [allProducts]);

  const pendingProducts = useMemo(() => {
    let list = products4x5.filter(p => !reviewStatuses[p.productId]);
    if (filterMode === "missing") {
      list = list.filter((p) => !hasLargerSizes(p.sizes));
    } else if (filterMode === "has_larger") {
      list = list.filter((p) => hasLargerSizes(p.sizes));
    }
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      list = list.filter(
        (p) => p.title.toLowerCase().includes(q) || p.vendor.toLowerCase().includes(q),
      );
    }
    return list;
  }, [products4x5, filterMode, searchFilter, reviewStatuses]);

  const reviewedProducts = useMemo(() => {
    let list = products4x5.filter(p => reviewStatuses[p.productId]);
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      list = list.filter(
        (p) => p.title.toLowerCase().includes(q) || p.vendor.toLowerCase().includes(q),
      );
    }
    return list;
  }, [products4x5, searchFilter, reviewStatuses]);

  const approvedProducts = useMemo(() => {
    return reviewedProducts.filter(p => reviewStatuses[p.productId]?.status === "approved");
  }, [reviewedProducts, reviewStatuses]);

  const hiddenProducts = useMemo(() => {
    return reviewedProducts.filter(p => reviewStatuses[p.productId]?.status === "hidden");
  }, [reviewedProducts, reviewStatuses]);

  const displayedProducts = activeTab === "pending" ? pendingProducts : reviewedProducts;

  const searchHighRes = useCallback(
    async (productId: string, query: string) => {
      setReviewStates((prev) => ({
        ...prev,
        [productId]: { searching: true, searched: false, results: [] },
      }));

      try {
        const res = await fetch(
          `/api/dropbox/search-artwork-all?title=${encodeURIComponent(query)}`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        const allMatches: DropboxMatch[] = data.matches || [];

        const highResFiles = allMatches
          .filter((m) => !m.isFolder && isHighResFile(m.name, m.path))
          .sort((a, b) => {
            const aHR = isInHighResFolder(a.path) ? 0 : 1;
            const bHR = isInHighResFolder(b.path) ? 0 : 1;
            if (aHR !== bHR) return aHR - bHR;
            return (b.size || 0) - (a.size || 0);
          });

        const results: HighResResult[] = [];
        for (const file of highResFiles.slice(0, 5)) {
          try {
            const dimRes = await fetch(
              `/api/dropbox/image-dimensions?path=${encodeURIComponent(file.path)}`,
              { credentials: "include" },
            );
            if (!dimRes.ok) continue;
            const dimData = await dimRes.json();
            if (dimData.width && dimData.height) {
              results.push({
                file,
                width: dimData.width,
                height: dimData.height,
                ratio: detectRatio(dimData.width, dimData.height),
                assessments: assessSizes(dimData.width, dimData.height),
                isHighResFolder: isInHighResFolder(file.path),
              });
            }
          } catch {
            continue;
          }
        }

        results.sort((a, b) => {
          const aIs4x5 = a.ratio === "4:5" ? 0 : 1;
          const bIs4x5 = b.ratio === "4:5" ? 0 : 1;
          if (aIs4x5 !== bIs4x5) return aIs4x5 - bIs4x5;
          const aMax = Math.max(...a.assessments.map((x) => x.actualDpi));
          const bMax = Math.max(...b.assessments.map((x) => x.actualDpi));
          return bMax - aMax;
        });

        setReviewStates((prev) => ({
          ...prev,
          [productId]: { searching: false, searched: true, results },
        }));

        return results;
      } catch (err: any) {
        setReviewStates((prev) => ({
          ...prev,
          [productId]: { searching: false, searched: true, results: [], error: err.message },
        }));
        return [];
      }
    },
    [],
  );

  const handleBatchSearch = useCallback(async () => {
    if (batchSelected.size === 0) {
      toast({ title: "No products selected", description: "Select products to batch search" });
      return;
    }

    setBatchSearching(true);
    const selectedProducts = pendingProducts.filter((p) => batchSelected.has(p.productId));

    for (const product of selectedProducts) {
      await searchHighRes(product.productId, product.title);
    }

    setBatchSearching(false);
    toast({
      title: "Batch search complete",
      description: `Searched ${selectedProducts.length} products`,
    });
  }, [batchSelected, pendingProducts, searchHighRes, toast]);

  const handleBatchAddSizes = useCallback(async () => {
    if (approvedProducts.length === 0) {
      toast({ title: "No approved products", description: "Approve products before adding sizes", variant: "destructive" });
      return;
    }

    const productsWithFiles = approvedProducts.filter(p => reviewStatuses[p.productId]?.selectedFile);
    if (productsWithFiles.length === 0) {
      toast({ title: "No files selected", description: "Select a high-res file for each approved product first", variant: "destructive" });
      return;
    }

    setBatchAddingSizes(true);
    setBatchAddResults([]);
    const artworks = allArtworks || [];

    for (const product of productsWithFiles) {
      const entry = reviewStatuses[product.productId];
      const selectedFile = entry?.selectedFile;
      if (!selectedFile || selectedFile.eligibleSizes.length === 0) {
        setBatchAddResults(prev => [...prev, { productId: product.productId, title: product.title, status: "skipped", error: "No eligible sizes from selected file" }]);
        continue;
      }

      setBatchAddResults(prev => [...prev, { productId: product.productId, title: product.title, status: "pending" }]);

      const productTitleNorm = product.title.toLowerCase().trim();
      const productBase = productTitleNorm
        .replace(/\s*-\s*(framed|unframed|canvas|print|limited edition|open edition).*$/i, "")
        .trim();
      const matchedArtwork = artworks.find((a) => a.title.toLowerCase().trim() === productTitleNorm)
        || (productBase.length >= 5
          ? artworks.find((a) => {
              const artBase = a.title.toLowerCase().trim()
                .replace(/\s*-\s*(framed|unframed|canvas|print|limited edition|open edition).*$/i, "")
                .trim();
              return artBase === productBase;
            })
          : undefined);

      if (!matchedArtwork) {
        setBatchAddResults(prev => prev.map(r =>
          r.productId === product.productId ? { ...r, status: "skipped", error: "No matched artwork" } : r
        ));
        continue;
      }

      const sizesToAdd = selectedFile.eligibleSizes.filter(s => !matchedArtwork.availableSizes.includes(s));

      if (sizesToAdd.length === 0) {
        setBatchAddResults(prev => prev.map(r =>
          r.productId === product.productId ? { ...r, status: "skipped", error: "Already has all eligible larger sizes" } : r
        ));
        continue;
      }

      const sizeLabels = sizesToAdd.map(s => FOUR_FIVE_SIZES.find(f => f.code === s)?.label || s);
      const notEligible = LARGER_SIZES.filter(s => !selectedFile.eligibleSizes.includes(s));
      const partialNote = notEligible.length > 0
        ? ` (${notEligible.map(s => FOUR_FIVE_SIZES.find(f => f.code === s)?.label || s).join(", ")} not eligible)`
        : "";

      try {
        const res = await fetch("/api/admin/high-res-review/push-sizes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            productId: product.productId,
            artworkId: matchedArtwork.id,
            sizeCodes: sizesToAdd,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setBatchAddResults(prev => prev.map(r =>
            r.productId === product.productId ? { ...r, status: "failed", error: data.error } : r
          ));
        } else {
          setBatchAddResults(prev => prev.map(r =>
            r.productId === product.productId ? {
              ...r,
              status: "success",
              detail: `Added ${sizeLabels.join(", ")} (${data.addedCount} variants)${partialNote}`,
            } : r
          ));
        }
      } catch (err: any) {
        setBatchAddResults(prev => prev.map(r =>
          r.productId === product.productId ? { ...r, status: "failed", error: err.message } : r
        ));
      }
    }

    queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
    setBatchAddingSizes(false);
    toast({ title: "Batch complete", description: `Processed ${productsWithFiles.length} products` });
  }, [approvedProducts, allArtworks, reviewStatuses, toast]);

  const handleSelectAll = () => {
    const current = displayedProducts;
    if (batchSelected.size === current.length && current.length > 0) {
      setBatchSelected(new Set());
    } else {
      setBatchSelected(new Set(current.map((p) => p.productId)));
    }
  };

  const stats = useMemo(() => {
    const total = products4x5.length;
    const withLarger = products4x5.filter((p) => hasLargerSizes(p.sizes)).length;
    const missing = total - withLarger;
    const pending = products4x5.filter(p => !reviewStatuses[p.productId]).length;
    const approved = products4x5.filter(p => reviewStatuses[p.productId]?.status === "approved").length;
    const hidden = products4x5.filter(p => reviewStatuses[p.productId]?.status === "hidden").length;
    return { total, withLarger, missing, pending, approved, hidden };
  }, [products4x5, reviewStatuses]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">High-Res Review</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review high-res source files for 4:5 ratio artworks and determine which larger print sizes can be supported.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold" data-testid="text-stat-total">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total 4:5</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold" data-testid="text-stat-pending">{stats.pending}</p>
          <p className="text-xs text-muted-foreground">Pending</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-green-600" data-testid="text-stat-approved">{stats.approved}</p>
          <p className="text-xs text-muted-foreground">Approved</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-muted-foreground" data-testid="text-stat-hidden">{stats.hidden}</p>
          <p className="text-xs text-muted-foreground">Hidden</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-amber-600" data-testid="text-stat-missing">{stats.missing}</p>
          <p className="text-xs text-muted-foreground">Missing larger</p>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "pending" | "reviewed"); setBatchSelected(new Set()); }}>
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending ({stats.pending})
          </TabsTrigger>
          <TabsTrigger value="reviewed" data-testid="tab-reviewed">
            Reviewed ({stats.approved + stats.hidden})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Filter products..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-64"
            data-testid="input-filter-products"
          />
        </div>
        {activeTab === "pending" && (
          <div className="flex gap-1">
            <Button
              variant={filterMode === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterMode("all")}
              data-testid="button-filter-all"
            >
              All
            </Button>
            <Button
              variant={filterMode === "missing" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterMode("missing")}
              data-testid="button-filter-missing"
            >
              Missing larger
            </Button>
            <Button
              variant={filterMode === "has_larger" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterMode("has_larger")}
              data-testid="button-filter-has-larger"
            >
              Has larger
            </Button>
          </div>
        )}
        <Separator orientation="vertical" className="h-6" />
        <Button
          variant="outline"
          size="sm"
          onClick={handleSelectAll}
          data-testid="button-select-all"
        >
          <Checkbox
            checked={batchSelected.size > 0 && batchSelected.size === displayedProducts.length}
            className="mr-1 pointer-events-none"
          />
          {batchSelected.size === displayedProducts.length && displayedProducts.length > 0 ? "Deselect all" : "Select all"}
        </Button>
        {activeTab === "pending" && (
          <Button
            size="sm"
            onClick={handleBatchSearch}
            disabled={batchSearching || batchSelected.size === 0}
            data-testid="button-batch-search"
          >
            {batchSearching ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <Zap className="w-3 h-3 mr-1" />
            )}
            Batch search ({batchSelected.size})
          </Button>
        )}
        {activeTab === "reviewed" && approvedProducts.length > 0 && (
          <Button
            size="sm"
            onClick={handleBatchAddSizes}
            disabled={batchAddingSizes}
            data-testid="button-batch-add-sizes"
          >
            {batchAddingSizes ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <PlusCircle className="w-3 h-3 mr-1" />
            )}
            Add sizes to {approvedProducts.filter(p => reviewStatuses[p.productId]?.selectedFile).length} approved
          </Button>
        )}
      </div>

      {batchAddResults.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium">Add Sizes Progress</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {batchAddResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {r.status === "pending" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />}
                  {r.status === "success" && <Check className="w-4 h-4 text-green-600 flex-shrink-0" />}
                  {r.status === "failed" && <X className="w-4 h-4 text-destructive flex-shrink-0" />}
                  {r.status === "skipped" && <span className="w-4 h-4 text-muted-foreground flex-shrink-0 text-center">-</span>}
                  <span className="truncate flex-1">{r.title}</span>
                  {r.status === "success" && <span className="text-xs text-muted-foreground flex-shrink-0">{r.detail || "Sizes added"}</span>}
                  {(r.status === "failed" || r.status === "skipped") && r.error && (
                    <span className="text-xs text-muted-foreground flex-shrink-0">{r.error}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {productsLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span className="text-muted-foreground">Loading products...</span>
        </div>
      )}

      {!productsLoading && displayedProducts.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          {activeTab === "pending"
            ? "No pending products to review."
            : "No reviewed products yet."}
        </div>
      )}

      {activeTab === "reviewed" && reviewedProducts.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">
            <ThumbsUp className="w-3 h-3 mr-1" />{approvedProducts.length} Approved
          </Badge>
          <Badge variant="outline" className="text-xs bg-muted text-muted-foreground border-0">
            <EyeOff className="w-3 h-3 mr-1" />{hiddenProducts.length} Hidden
          </Badge>
        </div>
      )}

      <div className="space-y-3">
        {displayedProducts.map((product) => (
          <ProductCard
            key={product.productId}
            product={product}
            artworks={allArtworks || []}
            reviewState={reviewStates[product.productId]}
            reviewEntry={reviewStatuses[product.productId]}
            onSearch={(query) => searchHighRes(product.productId, query)}
            onSetStatus={(status, selectedFile) => setProductReviewStatus(product.productId, status, selectedFile)}
            onBatchSelect={(selected) => {
              setBatchSelected((prev) => {
                const next = new Set(prev);
                if (selected) next.add(product.productId);
                else next.delete(product.productId);
                return next;
              });
            }}
            isSelected={batchSelected.has(product.productId)}
          />
        ))}
      </div>
    </div>
  );
}
