import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Image, ImageOff, Search, ExternalLink, Filter, Download, FolderSearch, Upload, Loader2, CheckCircle, Square, CheckSquare, X, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";

interface ARImageReportItem {
  productId: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  status: string;
  hasArImage: boolean;
  arImageUrl: string | null;
  salesCount: number;
  createdAt: string;
}

interface ARImageReport {
  total: number;
  withArImage: number;
  withoutArImage: number;
  products: ARImageReportItem[];
}

interface DropboxMatch {
  name: string;
  path: string;
  id: string;
  isFolder: boolean;
}

interface BatchSearchResult {
  product: ARImageReportItem;
  matches: DropboxMatch[];
  selectedPath: string | null;
  dimensions: { width: number; height: number } | null;
  status: 'pending' | 'searching' | 'found' | 'not_found' | 'pushing' | 'success' | 'error';
  error?: string;
  excluded?: boolean;
}

export default function ARImageReport() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [arImageFilter, setArImageFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [productTypeFilter, setProductTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("sales");
  
  const [selectedProduct, setSelectedProduct] = useState<ARImageReportItem | null>(null);
  const [dropboxMatches, setDropboxMatches] = useState<DropboxMatch[]>([]);
  const [isSearchingDropbox, setIsSearchingDropbox] = useState(false);
  const [selectedDropboxPath, setSelectedDropboxPath] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number; loading: boolean } | null>(null);

  // Batch selection state
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [batchSearchOpen, setBatchSearchOpen] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchSearchResult[]>([]);
  const [batchSearchProgress, setBatchSearchProgress] = useState(0);
  const [isBatchSearching, setIsBatchSearching] = useState(false);
  const [isBatchPushing, setIsBatchPushing] = useState(false);

  const { data: report, isLoading, error, refetch } = useQuery<ARImageReport>({
    queryKey: ["/api/shopify/ar-image-report"],
    queryFn: async () => {
      const response = await fetch("/api/shopify/ar-image-report", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch AR Image report");
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const vendors = useMemo(() => {
    if (!report?.products) return [];
    const uniqueVendors = [...new Set(report.products.map((p) => p.vendor))].filter(Boolean).sort();
    return uniqueVendors;
  }, [report?.products]);

  const productTypes = useMemo(() => {
    if (!report?.products) return [];
    const uniqueTypes = [...new Set(report.products.map((p) => p.productType))].filter(Boolean).sort();
    return uniqueTypes;
  }, [report?.products]);

  const filteredProducts = useMemo(() => {
    if (!report?.products) return [];

    return report.products.filter((product) => {
      if (search) {
        const searchLower = search.toLowerCase();
        if (
          !product.title.toLowerCase().includes(searchLower) &&
          !product.vendor.toLowerCase().includes(searchLower) &&
          !product.handle.toLowerCase().includes(searchLower)
        ) {
          return false;
        }
      }

      if (statusFilter !== "all" && product.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }

      if (arImageFilter === "with" && !product.hasArImage) return false;
      if (arImageFilter === "without" && product.hasArImage) return false;

      if (vendorFilter !== "all" && product.vendor !== vendorFilter) {
        return false;
      }

      if (productTypeFilter !== "all" && product.productType !== productTypeFilter) {
        return false;
      }

      return true;
    });
  }, [report?.products, search, statusFilter, arImageFilter, vendorFilter, productTypeFilter]);

  const sortedProducts = useMemo(() => {
    const sorted = [...filteredProducts];
    
    switch (sortBy) {
      case "newest":
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "oldest":
        sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case "title":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "vendor":
        sorted.sort((a, b) => a.vendor.localeCompare(b.vendor));
        break;
      case "sales":
      default:
        sorted.sort((a, b) => b.salesCount - a.salesCount);
        break;
    }
    
    return sorted;
  }, [filteredProducts, sortBy]);

  const exportCSV = () => {
    if (!sortedProducts.length) return;

    const headers = ["Product ID", "Title", "Artist/Vendor", "Status", "Sales Count", "Has AR Image", "AR Image URL", "Shopify URL"];
    const rows = sortedProducts.map((p) => [
      p.productId,
      `"${p.title.replace(/"/g, '""')}"`,
      `"${p.vendor.replace(/"/g, '""')}"`,
      p.status,
      p.salesCount,
      p.hasArImage ? "Yes" : "No",
      p.arImageUrl || "",
      `https://admin.shopify.com/store/eastside-studio-london/products/${p.productId}`,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ar-image-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const searchDropbox = async (product: ARImageReportItem) => {
    setSelectedProduct(product);
    setDropboxMatches([]);
    setSelectedDropboxPath(null);
    setImageDimensions(null);
    setIsSearchingDropbox(true);
    
    try {
      const response = await fetch(`/api/dropbox/search-artwork?title=${encodeURIComponent(product.title)}`, {
        credentials: "include",
      });
      
      if (!response.ok) throw new Error("Failed to search Dropbox");
      
      const data = await response.json();
      setDropboxMatches(data.matches || []);
    } catch (err) {
      toast({
        title: "Search failed",
        description: "Could not search Dropbox for matching files",
        variant: "destructive",
      });
    } finally {
      setIsSearchingDropbox(false);
    }
  };

  const fetchDimensions = async (path: string) => {
    setSelectedDropboxPath(path);
    setImageDimensions({ width: 0, height: 0, loading: true });
    
    try {
      const response = await fetch(`/api/dropbox/image-dimensions?path=${encodeURIComponent(path)}`, {
        credentials: "include",
      });
      
      if (!response.ok) throw new Error("Failed to get dimensions");
      
      const data = await response.json();
      setImageDimensions({ width: data.width, height: data.height, loading: false });
    } catch (err) {
      setImageDimensions(null);
      toast({
        title: "Error",
        description: "Could not get image dimensions",
        variant: "destructive",
      });
    }
  };

  const getDimensionStatus = () => {
    if (!imageDimensions || imageDimensions.loading) return null;
    
    const { width, height } = imageDimensions;
    const minDim = Math.min(width, height);
    const maxDim = Math.max(width, height);
    
    if (minDim < 500) {
      return { valid: false, tooLarge: false, message: `Too small (${width}x${height}). Min dimension must be 500px.` };
    }
    if (maxDim > 4096) {
      return { valid: false, tooLarge: true, message: `Too large (${width}x${height}). Can be converted for AR.` };
    }
    return { valid: true, tooLarge: false, message: `${width}x${height} - Good for AR` };
  };

  const pushToShopifyMutation = useMutation({
    mutationFn: async ({ productId, dropboxPath }: { productId: string; dropboxPath: string }) => {
      return apiRequest("POST", "/api/shopify/set-wav-image", { productId, dropboxPath });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "AR image has been set on the product",
      });
      setSelectedProduct(null);
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/ar-image-report"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to set AR image",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Convert and push mutation for high-res images
  const convertAndPushMutation = useMutation({
    mutationFn: async ({ productId, dropboxPath }: { productId: string; dropboxPath: string }) => {
      return apiRequest("POST", "/api/dropbox/convert-and-push", { productId, dropboxPath });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Success",
        description: `Image converted from ${data.originalWidth}x${data.originalHeight} to ${data.width}x${data.height} and set on product`,
      });
      setSelectedProduct(null);
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/ar-image-report"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to convert and push",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Batch selection helpers
  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const selectAllWithoutAR = () => {
    const idsWithoutAR = filteredProducts
      .filter(p => !p.hasArImage)
      .map(p => p.productId);
    setSelectedProductIds(new Set(idsWithoutAR));
  };

  const clearSelection = () => {
    setSelectedProductIds(new Set());
  };

  // Batch search function
  const startBatchSearch = async () => {
    const selectedProducts = filteredProducts.filter(p => selectedProductIds.has(p.productId));
    if (selectedProducts.length === 0) return;

    setBatchSearchOpen(true);
    setIsBatchSearching(true);
    setBatchSearchProgress(0);
    
    const results: BatchSearchResult[] = selectedProducts.map(product => ({
      product,
      matches: [],
      selectedPath: null,
      dimensions: null,
      status: 'pending' as const,
    }));
    setBatchResults(results);

    // Search each product sequentially to avoid rate limits
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      result.status = 'searching';
      setBatchResults([...results]);
      
      try {
        const response = await fetch(`/api/dropbox/search-artwork?title=${encodeURIComponent(result.product.title)}`, {
          credentials: "include",
        });
        
        if (!response.ok) throw new Error("Failed to search");
        
        const data = await response.json();
        result.matches = data.matches || [];
        
        if (result.matches.length > 0) {
          result.status = 'found';
          // Auto-select first match and get dimensions
          result.selectedPath = result.matches[0].path;
          try {
            const dimResponse = await fetch(`/api/dropbox/image-dimensions?path=${encodeURIComponent(result.selectedPath)}`, {
              credentials: "include",
            });
            if (dimResponse.ok) {
              const dimData = await dimResponse.json();
              result.dimensions = { width: dimData.width, height: dimData.height };
            }
          } catch {}
        } else {
          result.status = 'not_found';
        }
      } catch (err) {
        result.status = 'not_found';
        result.error = 'Search failed';
      }
      
      setBatchSearchProgress(((i + 1) / results.length) * 100);
      setBatchResults([...results]);
    }
    
    setIsBatchSearching(false);
  };

  // Update batch result selection
  const updateBatchResultPath = async (index: number, path: string) => {
    const newResults = [...batchResults];
    newResults[index].selectedPath = path;
    newResults[index].dimensions = null;
    setBatchResults(newResults);
    
    // Fetch dimensions
    try {
      const response = await fetch(`/api/dropbox/image-dimensions?path=${encodeURIComponent(path)}`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        newResults[index].dimensions = { width: data.width, height: data.height };
        setBatchResults([...newResults]);
      }
    } catch {}
  };

  // Check if dimensions are valid for AR
  const isDimensionValid = (dims: { width: number; height: number } | null) => {
    if (!dims) return false;
    const minDim = Math.min(dims.width, dims.height);
    const maxDim = Math.max(dims.width, dims.height);
    return minDim >= 500 && maxDim <= 4096;
  };

  // Check if image is too large but can be converted
  const isDimensionConvertible = (dims: { width: number; height: number } | null) => {
    if (!dims) return false;
    const minDim = Math.min(dims.width, dims.height);
    const maxDim = Math.max(dims.width, dims.height);
    return minDim >= 500 && maxDim > 4096; // Large enough but too big - can convert
  };

  // State for batch converting
  const [isBatchConverting, setIsBatchConverting] = useState(false);

  // Convert and push a single item in batch
  const convertBatchItem = async (index: number) => {
    const result = batchResults[index];
    if (!result.selectedPath) return;

    const newResults = [...batchResults];
    newResults[index].status = 'pushing';
    setBatchResults(newResults);

    try {
      await apiRequest("POST", "/api/dropbox/convert-and-push", {
        productId: result.product.productId,
        dropboxPath: result.selectedPath,
      });
      newResults[index].status = 'success';
      toast({
        title: "Converted & pushed",
        description: `${result.product.title} converted and uploaded`,
      });
    } catch (err: any) {
      newResults[index].status = 'error';
      newResults[index].error = err.message || 'Failed to convert';
    }
    setBatchResults([...newResults]);
    queryClient.invalidateQueries({ queryKey: ["/api/shopify/ar-image-report"] });
  };

  // Convert all large images in batch
  const convertAllLargeImages = async () => {
    const convertibleResults = batchResults.filter(
      r => r.status === 'found' && r.selectedPath && r.dimensions && isDimensionConvertible(r.dimensions) && !r.excluded
    );
    
    if (convertibleResults.length === 0) {
      toast({
        title: "Nothing to convert",
        description: "No large images found to convert",
        variant: "destructive",
      });
      return;
    }

    setIsBatchConverting(true);
    const newResults = [...batchResults];
    let successCount = 0;
    let errorCount = 0;

    for (const result of convertibleResults) {
      const index = newResults.findIndex(r => r.product.productId === result.product.productId);
      newResults[index].status = 'pushing';
      setBatchResults([...newResults]);

      try {
        await apiRequest("POST", "/api/dropbox/convert-and-push", {
          productId: result.product.productId,
          dropboxPath: result.selectedPath,
        });
        newResults[index].status = 'success';
        successCount++;
      } catch (err: any) {
        newResults[index].status = 'error';
        newResults[index].error = err.message || 'Failed to convert';
        errorCount++;
      }
      setBatchResults([...newResults]);
    }

    setIsBatchConverting(false);
    
    toast({
      title: "Batch conversion complete",
      description: `${successCount} images converted${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
      variant: errorCount > 0 && successCount === 0 ? "destructive" : "default",
    });

    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/ar-image-report"] });
    }
  };

  // Toggle excluded state for a batch result
  const toggleBatchExclude = (index: number) => {
    const newResults = [...batchResults];
    newResults[index].excluded = !newResults[index].excluded;
    setBatchResults(newResults);
  };

  // Batch push function
  const pushAllToShopify = async () => {
    const readyResults = batchResults.filter(
      r => r.status === 'found' && r.selectedPath && r.dimensions && isDimensionValid(r.dimensions) && !r.excluded
    );
    
    if (readyResults.length === 0) {
      toast({
        title: "Nothing to push",
        description: "No valid images found to push",
        variant: "destructive",
      });
      return;
    }

    setIsBatchPushing(true);
    const newResults = [...batchResults];
    let successCount = 0;
    let errorCount = 0;

    for (const result of readyResults) {
      const index = newResults.findIndex(r => r.product.productId === result.product.productId);
      newResults[index].status = 'pushing';
      setBatchResults([...newResults]);

      try {
        await apiRequest("POST", "/api/shopify/set-wav-image", {
          productId: result.product.productId,
          dropboxPath: result.selectedPath,
        });
        newResults[index].status = 'success';
        successCount++;
      } catch (err: any) {
        newResults[index].status = 'error';
        newResults[index].error = err.message || 'Failed to push';
        errorCount++;
      }
      setBatchResults([...newResults]);
    }

    setIsBatchPushing(false);
    
    toast({
      title: "Batch push complete",
      description: `${successCount} images pushed successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
      variant: errorCount > 0 && successCount === 0 ? "destructive" : "default",
    });

    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/ar-image-report"] });
      setSelectedProductIds(new Set());
    }
  };

  const closeBatchDialog = () => {
    setBatchSearchOpen(false);
    setBatchResults([]);
    setBatchSearchProgress(0);
  };

  const withoutCount = filteredProducts.filter((p) => !p.hasArImage).length;
  const withCount = filteredProducts.filter((p) => p.hasArImage).length;
  const foundCount = batchResults.filter(r => (r.status === 'found' || r.status === 'success') && !r.excluded).length;
  const excludedCount = batchResults.filter(r => r.excluded).length;
  const readyToPushCount = batchResults.filter(
    r => r.status === 'found' && r.selectedPath && r.dimensions && isDimensionValid(r.dimensions) && !r.excluded
  ).length;
  const convertibleCount = batchResults.filter(
    r => r.status === 'found' && r.selectedPath && r.dimensions && isDimensionConvertible(r.dimensions) && !r.excluded
  ).length;

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold font-display">AR Image Report</h1>
          <p className="text-muted-foreground mt-2">
            Review which products have AR images assigned for the AR viewer feature
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
            Refresh
          </Button>
          <Button variant="outline" onClick={exportCSV} disabled={!sortedProducts.length} data-testid="button-export">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading report from Shopify...</div>
      ) : error ? (
        <div className="text-center py-12 text-destructive">Failed to load report. Please try again.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card data-testid="card-total">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Products</CardTitle>
                <Filter className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report?.total || 0}</div>
                <p className="text-xs text-muted-foreground">Active products in Shopify</p>
              </CardContent>
            </Card>

            <Card data-testid="card-with-ar">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">With AR Image</CardTitle>
                <Image className="w-4 h-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{report?.withArImage || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {report?.total ? ((report.withArImage / report.total) * 100).toFixed(1) : 0}% coverage
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-without-ar">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Without AR Image</CardTitle>
                <ImageOff className="w-4 h-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{report?.withoutArImage || 0}</div>
                <p className="text-xs text-muted-foreground">Needs AR image assignment</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Filter Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <div className="relative lg:col-span-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by title, artist, or handle..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                    data-testid="input-search"
                  />
                </div>

                <Select value={arImageFilter} onValueChange={setArImageFilter}>
                  <SelectTrigger data-testid="select-ar-filter">
                    <SelectValue placeholder="AR Image Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    <SelectItem value="without">Missing AR Image</SelectItem>
                    <SelectItem value="with">Has AR Image</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue placeholder="Product Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={vendorFilter} onValueChange={setVendorFilter}>
                  <SelectTrigger data-testid="select-vendor">
                    <SelectValue placeholder="Artist/Vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Artists</SelectItem>
                    {vendors.map((vendor) => (
                      <SelectItem key={vendor} value={vendor}>
                        {vendor}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={productTypeFilter} onValueChange={setProductTypeFilter}>
                  <SelectTrigger data-testid="select-product-type">
                    <SelectValue placeholder="Product Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {productTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger data-testid="select-sort-by">
                    <SelectValue placeholder="Sort By" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="sales">Best Sellers</SelectItem>
                    <SelectItem value="title">Title A-Z</SelectItem>
                    <SelectItem value="vendor">Artist A-Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-4">
                <CardTitle>
                  Products ({sortedProducts.length})
                  {withoutCount > 0 && (
                    <Badge variant="outline" className="ml-2 text-orange-600 border-orange-300">
                      {withoutCount} missing AR
                    </Badge>
                  )}
                </CardTitle>
                {selectedProductIds.size > 0 && (
                  <Badge variant="default">
                    {selectedProductIds.size} selected
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedProductIds.size > 0 ? (
                  <>
                    <Button variant="outline" size="sm" onClick={clearSelection} data-testid="button-clear-selection">
                      <X className="w-4 h-4 mr-1" />
                      Clear
                    </Button>
                    <Button size="sm" onClick={startBatchSearch} data-testid="button-batch-search">
                      <FolderSearch className="w-4 h-4 mr-1" />
                      Search Selected ({selectedProductIds.size})
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={selectAllWithoutAR} disabled={withoutCount === 0} data-testid="button-select-all-missing">
                    <CheckSquare className="w-4 h-4 mr-1" />
                    Select All Missing AR
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {sortedProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No products match your filters</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead className="text-right">Sales</TableHead>
                        <TableHead>AR</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Artist</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedProducts.map((product) => (
                        <TableRow key={product.productId} data-testid={`row-product-${product.productId}`}>
                          <TableCell>
                            <Checkbox
                              checked={selectedProductIds.has(product.productId)}
                              onCheckedChange={() => toggleProductSelection(product.productId)}
                              disabled={product.hasArImage}
                              data-testid={`checkbox-${product.productId}`}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {product.salesCount > 0 ? product.salesCount : "-"}
                          </TableCell>
                          <TableCell>
                            {product.hasArImage ? (
                              <Badge variant="outline" className="text-green-600 border-green-300">
                                <Image className="w-3 h-3 mr-1" />
                                Yes
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-orange-600 border-orange-300">
                                <ImageOff className="w-3 h-3 mr-1" />
                                No
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-medium max-w-md truncate">{product.title}</TableCell>
                          <TableCell>{product.vendor}</TableCell>
                          <TableCell>
                            <Badge
                              variant={product.status === "ACTIVE" ? "default" : "secondary"}
                            >
                              {product.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {!product.hasArImage && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => searchDropbox(product)}
                                  title="Find in Dropbox"
                                  data-testid={`button-dropbox-${product.productId}`}
                                >
                                  <FolderSearch className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                asChild
                                data-testid={`button-view-${product.productId}`}
                              >
                                <a
                                  href={`https://admin.shopify.com/store/eastside-studio-london/products/${product.productId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Find AR Image in Dropbox</DialogTitle>
            <DialogDescription>
              Searching for: <span className="font-medium">{selectedProduct?.title}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
            {isSearchingDropbox ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span>Searching Dropbox...</span>
              </div>
            ) : dropboxMatches.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No matching low-res files found in Dropbox
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {dropboxMatches.map((match) => (
                  <div
                    key={match.id || match.path}
                    className={`p-3 rounded-md border cursor-pointer transition-colors ${
                      selectedDropboxPath === match.path
                        ? "border-primary bg-primary/5"
                        : "border-border hover-elevate"
                    }`}
                    onClick={() => fetchDimensions(match.path)}
                    data-testid={`dropbox-match-${match.id}`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      {selectedDropboxPath === match.path && (
                        <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                      )}
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <p className="font-medium truncate">{match.name}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-full">{match.path}</p>
                      </div>
                    </div>
                    {selectedDropboxPath === match.path && imageDimensions && (
                      <div className="mt-2">
                        {imageDimensions.loading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Badge variant={getDimensionStatus()?.valid ? "default" : "destructive"}>
                            {getDimensionStatus()?.message}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setSelectedProduct(null)} data-testid="button-cancel-dropbox">
              Cancel
            </Button>
            {/* Show Convert & Push button when image is too large */}
            {getDimensionStatus()?.tooLarge && (
              <Button
                onClick={() => {
                  if (selectedProduct && selectedDropboxPath) {
                    convertAndPushMutation.mutate({
                      productId: selectedProduct.productId,
                      dropboxPath: selectedDropboxPath,
                    });
                  }
                }}
                disabled={
                  !selectedDropboxPath || 
                  convertAndPushMutation.isPending || 
                  imageDimensions?.loading
                }
                data-testid="button-convert-and-push"
              >
                {convertAndPushMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Converting...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Convert & Push
                  </>
                )}
              </Button>
            )}
            {/* Show regular Push button when image is valid */}
            {(!getDimensionStatus()?.tooLarge) && (
              <Button
                onClick={() => {
                  if (selectedProduct && selectedDropboxPath) {
                    pushToShopifyMutation.mutate({
                      productId: selectedProduct.productId,
                      dropboxPath: selectedDropboxPath,
                    });
                  }
                }}
                disabled={
                  !selectedDropboxPath || 
                  pushToShopifyMutation.isPending || 
                  imageDimensions?.loading ||
                  (imageDimensions && !getDimensionStatus()?.valid)
                }
                data-testid="button-push-to-shopify"
              >
                {pushToShopifyMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Push to Shopify
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Search Dialog */}
      <Dialog open={batchSearchOpen} onOpenChange={(open) => !open && !isBatchSearching && !isBatchPushing && closeBatchDialog()}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Batch AR Image Search</DialogTitle>
            <DialogDescription>
              Searching {batchResults.length} products in Dropbox
              {foundCount > 0 && ` - Found ${foundCount} matches`}
              {excludedCount > 0 && ` (${excludedCount} excluded)`}
            </DialogDescription>
          </DialogHeader>

          {isBatchSearching && (
            <div className="space-y-2">
              <Progress value={batchSearchProgress} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">
                Searching... {Math.round(batchSearchProgress)}%
              </p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {batchResults.map((result, index) => (
              <div
                key={result.product.productId}
                className={`p-3 rounded-md border ${
                  result.excluded ? 'border-muted bg-muted/30 opacity-60' :
                  result.status === 'success' ? 'border-green-300 bg-green-50 dark:bg-green-900/20' :
                  result.status === 'error' ? 'border-red-300 bg-red-50 dark:bg-red-900/20' :
                  result.status === 'not_found' ? 'border-orange-300 bg-orange-50 dark:bg-orange-900/20' :
                  'border-border'
                }`}
                data-testid={`batch-result-${result.product.productId}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {result.excluded ? (
                        <X className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <>
                          {result.status === 'searching' && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                          {result.status === 'found' && <CheckCircle className="w-4 h-4 text-green-600" />}
                          {result.status === 'not_found' && <AlertCircle className="w-4 h-4 text-orange-600" />}
                          {result.status === 'pushing' && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                          {result.status === 'success' && <CheckCircle className="w-4 h-4 text-green-600" />}
                          {result.status === 'error' && <X className="w-4 h-4 text-red-600" />}
                        </>
                      )}
                      <span className={`font-medium truncate ${result.excluded ? 'line-through text-muted-foreground' : ''}`}>
                        {result.product.title}
                      </span>
                      {result.excluded && (
                        <Badge variant="outline" className="text-xs">Excluded</Badge>
                      )}
                    </div>
                    
                    {!result.excluded && result.status === 'found' && result.matches.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <Select
                          value={result.selectedPath || ''}
                          onValueChange={(path) => updateBatchResultPath(index, path)}
                        >
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-path-${index}`}>
                            <SelectValue placeholder="Select file" />
                          </SelectTrigger>
                          <SelectContent>
                            {result.matches.map((match) => (
                              <SelectItem key={match.path} value={match.path}>
                                {match.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {result.dimensions && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={isDimensionValid(result.dimensions) ? "default" : "destructive"} className="text-xs">
                              {result.dimensions.width}x{result.dimensions.height}
                              {isDimensionValid(result.dimensions) ? ' - Good' : isDimensionConvertible(result.dimensions) ? ' - Too Large' : ' - Invalid'}
                            </Badge>
                            {isDimensionConvertible(result.dimensions) && result.status === 'found' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs px-2"
                                onClick={() => convertBatchItem(index)}
                                disabled={isBatchPushing || isBatchConverting}
                                data-testid={`button-convert-${index}`}
                              >
                                Convert & Push
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {!result.excluded && result.status === 'not_found' && (
                      <p className="text-xs text-muted-foreground mt-1">No matching files found</p>
                    )}
                    
                    {!result.excluded && result.status === 'error' && result.error && (
                      <p className="text-xs text-red-600 mt-1">{result.error}</p>
                    )}
                    
                    {!result.excluded && result.status === 'success' && (
                      <p className="text-xs text-green-600 mt-1">Pushed successfully</p>
                    )}
                  </div>
                  
                  {/* Exclude/Include button */}
                  {result.status === 'found' && result.status !== 'success' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleBatchExclude(index)}
                      disabled={isBatchPushing}
                      className="shrink-0"
                      data-testid={`button-exclude-${index}`}
                    >
                      {result.excluded ? 'Include' : 'Exclude'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="shrink-0 border-t pt-4 flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={closeBatchDialog}
              disabled={isBatchSearching || isBatchPushing || isBatchConverting}
              data-testid="button-close-batch"
            >
              Close
            </Button>
            {convertibleCount > 0 && (
              <Button
                variant="secondary"
                onClick={convertAllLargeImages}
                disabled={isBatchSearching || isBatchPushing || isBatchConverting}
                data-testid="button-convert-all"
              >
                {isBatchConverting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Converting...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Convert All Large ({convertibleCount})
                  </>
                )}
              </Button>
            )}
            <Button
              onClick={pushAllToShopify}
              disabled={isBatchSearching || isBatchPushing || isBatchConverting || readyToPushCount === 0}
              data-testid="button-push-all"
            >
              {isBatchPushing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Pushing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Push All ({readyToPushCount})
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
