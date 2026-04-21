import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Search, ArrowLeft, Check, Tag, Loader2 } from "lucide-react";

interface ProductListItem {
  productId: string;
  gid: string;
  title: string;
  vendor: string;
  handle: string;
  featuredImageUrl: string | null;
  salesCount: number;
  hasLifestyle: boolean;
}

interface MediaItem {
  id: string;
  alt: string | null;
  url: string;
  width: number | null;
  height: number | null;
}

interface ProductWithMedia {
  productId: string;
  gid: string;
  title: string;
  vendor: string;
  handle: string;
  media: MediaItem[];
}

const TAG_TO_APPEND = "Style = Lifestyle";

type TabValue = "needs-tagging" | "assigned";

export default function MediaEditor() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabValue>("needs-tagging");
  const [localAssigned, setLocalAssigned] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("mediaEditorAssigned");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const productsQuery = useQuery<ProductListItem[]>({
    queryKey: ["/api/admin/media-editor/products"],
  });

  const mediaQuery = useQuery<ProductWithMedia>({
    queryKey: ["/api/admin/media-editor/product", selectedProductId, "media"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/media-editor/product/${selectedProductId}/media`, { credentials: "include" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      return r.json();
    },
    enabled: !!selectedProductId,
  });

  const updateAltMutation = useMutation({
    mutationFn: async ({ productGid, updates }: { productGid: string; updates: { mediaId: string; altText: string }[] }) => {
      const res = await apiRequest("POST", "/api/admin/media-editor/update-alt-text", { productGid, updates });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Alt text updated", description: `Updated ${data.updated} image(s) successfully.` });
        setSelectedMediaIds(new Set());
        queryClient.invalidateQueries({ queryKey: ["/api/admin/media-editor/product", selectedProductId, "media"] });
        if (selectedProductId) {
          const next = new Set(localAssigned);
          next.add(selectedProductId);
          setLocalAssigned(next);
          try { localStorage.setItem("mediaEditorAssigned", JSON.stringify([...next])); } catch {}
        }
      } else {
        toast({ title: "Update failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const { needsTagging, assigned } = useMemo(() => {
    if (!productsQuery.data) return { needsTagging: [], assigned: [] };
    const needs: ProductListItem[] = [];
    const done: ProductListItem[] = [];
    for (const p of productsQuery.data) {
      if (p.hasLifestyle || localAssigned.has(p.productId)) {
        done.push(p);
      } else {
        needs.push(p);
      }
    }
    return { needsTagging: needs, assigned: done };
  }, [productsQuery.data, localAssigned]);

  const filteredProducts = useMemo(() => {
    const list = activeTab === "needs-tagging" ? needsTagging : assigned;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;
    return list.filter(p =>
      p.title.toLowerCase().includes(q) || p.vendor.toLowerCase().includes(q)
    );
  }, [needsTagging, assigned, activeTab, searchQuery]);

  function toggleMediaSelection(mediaId: string) {
    setSelectedMediaIds(prev => {
      const next = new Set(prev);
      if (next.has(mediaId)) next.delete(mediaId);
      else next.add(mediaId);
      return next;
    });
  }

  function selectAll() {
    if (!mediaQuery.data) return;
    setSelectedMediaIds(new Set(mediaQuery.data.media.map(m => m.id)));
  }

  function selectNone() {
    setSelectedMediaIds(new Set());
  }

  function handleAppendTag() {
    if (!mediaQuery.data || selectedMediaIds.size === 0) return;
    const updates = mediaQuery.data.media
      .filter(m => selectedMediaIds.has(m.id))
      .map(m => {
        const currentAlt = (m.alt || "").trim();
        const alreadyHasTag = currentAlt.includes(TAG_TO_APPEND);
        const newAlt = alreadyHasTag ? currentAlt : (currentAlt ? `${currentAlt} | ${TAG_TO_APPEND}` : TAG_TO_APPEND);
        return { mediaId: m.id, altText: newAlt };
      })
      .filter(u => {
        const original = mediaQuery.data!.media.find(m => m.id === u.mediaId);
        return (original?.alt || "").trim() !== u.altText;
      });

    if (updates.length === 0) {
      toast({ title: "No changes needed", description: "All selected images already have the lifestyle tag." });
      return;
    }

    updateAltMutation.mutate({ productGid: mediaQuery.data.gid, updates });
  }

  function hasLifestyleTag(alt: string | null): boolean {
    return !!alt && alt.includes(TAG_TO_APPEND);
  }

  if (selectedProductId && mediaQuery.data) {
    const product = mediaQuery.data;
    const selectedCount = selectedMediaIds.size;
    const totalCount = product.media.length;

    return (
      <div className="p-6 space-y-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { setSelectedProductId(null); setSelectedMediaIds(new Set()); }}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold truncate" data-testid="text-product-title">{product.title}</h1>
            <p className="text-sm text-muted-foreground">{product.vendor} &middot; {totalCount} images</p>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={selectAll} data-testid="button-select-all">Select All</Button>
              <Button variant="outline" size="sm" onClick={selectNone} data-testid="button-select-none">Select None</Button>
              <span className="text-sm text-muted-foreground">{selectedCount} of {totalCount} selected</span>
            </div>
            <Button
              onClick={handleAppendTag}
              disabled={selectedCount === 0 || updateAltMutation.isPending}
              data-testid="button-append-tag"
            >
              {updateAltMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Tag className="w-4 h-4 mr-2" />
              )}
              Append "{TAG_TO_APPEND}"
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {product.media.map((m) => {
                const isSelected = selectedMediaIds.has(m.id);
                const tagged = hasLifestyleTag(m.alt);
                return (
                  <div
                    key={m.id}
                    className={`relative rounded-md border overflow-hidden cursor-pointer transition-colors ${
                      isSelected ? "border-primary ring-2 ring-primary/30" : "border-border"
                    }`}
                    onClick={() => toggleMediaSelection(m.id)}
                    data-testid={`media-card-${m.id.split("/").pop()}`}
                  >
                    <div className="aspect-square bg-muted relative">
                      <img
                        src={m.url + "&width=300"}
                        alt={m.alt || ""}
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                      <div className="absolute top-2 left-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleMediaSelection(m.id)}
                          className="bg-background/80"
                          data-testid={`checkbox-media-${m.id.split("/").pop()}`}
                        />
                      </div>
                      {tagged && (
                        <div className="absolute top-2 right-2">
                          <Badge variant="secondary" className="text-xs">
                            <Check className="w-3 h-3 mr-1" />
                            Lifestyle
                          </Badge>
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs text-muted-foreground truncate" data-testid={`text-alt-${m.id.split("/").pop()}`}>
                        {m.alt || <span className="italic">No alt text</span>}
                      </p>
                      {m.width && m.height && (
                        <p className="text-xs text-muted-foreground/60">{m.width}&times;{m.height}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (selectedProductId && mediaQuery.isLoading) {
    return (
      <div className="p-6 flex items-center justify-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading product media...</span>
      </div>
    );
  }

  if (selectedProductId && mediaQuery.error) {
    return (
      <div className="p-6 space-y-4 max-w-7xl mx-auto">
        <Button variant="ghost" size="icon" onClick={() => { setSelectedProductId(null); setSelectedMediaIds(new Set()); }} data-testid="button-back-error">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Card>
          <CardContent className="py-8 text-center text-destructive">
            Failed to load product media: {(mediaQuery.error as Error).message}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold" data-testid="text-page-title">Media Alt Text Editor</h1>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-md border border-border overflow-visible">
          <Button
            variant="ghost"
            size="sm"
            className={`rounded-none ${activeTab === "needs-tagging" ? "toggle-elevate toggle-elevated" : ""}`}
            onClick={() => setActiveTab("needs-tagging")}
            data-testid="tab-needs-tagging"
          >
            Needs Tagging
            <Badge variant="secondary" className="ml-2">{needsTagging.length}</Badge>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`rounded-none ${activeTab === "assigned" ? "toggle-elevate toggle-elevated" : ""}`}
            onClick={() => setActiveTab("assigned")}
            data-testid="tab-assigned"
          >
            Assigned
            <Badge variant="secondary" className="ml-2">{assigned.length}</Badge>
          </Button>
        </div>

        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by title or artist..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
      </div>

      {productsQuery.isLoading ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading products from Shopify...</span>
        </div>
      ) : productsQuery.error ? (
        <Card>
          <CardContent className="py-8 text-center text-destructive">
            Failed to load products. Please try again.
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="text-product-count">
            {filteredProducts.length} products
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredProducts.map((product) => (
              <Card
                key={product.productId}
                className="cursor-pointer hover-elevate"
                onClick={() => setSelectedProductId(product.productId)}
                data-testid={`card-product-${product.productId}`}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-14 h-14 rounded-md bg-muted flex-shrink-0 overflow-hidden">
                    {product.featuredImageUrl ? (
                      <img
                        src={product.featuredImageUrl + "&width=100"}
                        alt={product.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                        No img
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" data-testid={`text-title-${product.productId}`}>{product.title}</p>
                    <p className="text-xs text-muted-foreground">{product.vendor}</p>
                    {product.salesCount > 0 && (
                      <p className="text-xs text-muted-foreground">{product.salesCount} sold (90d)</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {filteredProducts.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              {searchQuery ? "No products match your search." : activeTab === "assigned" ? "No products have lifestyle tags yet." : "All products have been tagged."}
            </div>
          )}
        </>
      )}
    </div>
  );
}
