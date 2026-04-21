import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Download, Plus, Trash2, AlertCircle, Store, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiRequest, apiRequestLong, queryClient } from "@/lib/queryClient";
import type { Artwork, VariantConfig, ExportBatch } from "@shared/schema";
import { FRAME_OPTIONS, getSizeNameFromCode } from "@shared/schema";
import Papa from "papaparse";

interface ShopifySyncResult {
  success: boolean;
  productId?: number;
  productUrl?: string;
  error?: string;
}

interface ShopifyBatchResult {
  successful: number;
  failed: number;
  skipped?: number;
  results: ShopifySyncResult[];
}

interface ShopifyConnectionTest {
  success: boolean;
  shopName?: string;
  error?: string;
}

interface CSVRow {
  [key: string]: string;
}

export default function Exports() {
  const { toast } = useToast();
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; column: string } | null>(null);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [generateAI, setGenerateAI] = useState(true);
  const [shopifyGenerateAI, setShopifyGenerateAI] = useState(true);
  const [shopifyTestResult, setShopifyTestResult] = useState<ShopifyConnectionTest | null>(null);
  const [shopifySyncResult, setShopifySyncResult] = useState<ShopifyBatchResult | null>(null);

  const { data: artworks = [] } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"],
  });

  const { data: variantConfigs = [] } = useQuery<VariantConfig[]>({
    queryKey: ["/api/variant-configs"],
  });

  const { data: exportBatches = [] } = useQuery<ExportBatch[]>({
    queryKey: ["/api/export-batches"],
  });

  const testShopifyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/shopify/test");
      return await response.json() as ShopifyConnectionTest;
    },
    onSuccess: (result) => {
      setShopifyTestResult(result);
      if (result.success) {
        toast({
          title: "Shopify Connected",
          description: `Connected to ${result.shopName}`,
        });
      } else {
        toast({
          title: "Connection Failed",
          description: result.error || "Could not connect to Shopify",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      setShopifyTestResult({ success: false, error: error.message });
      toast({
        title: "Connection Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const syncToShopifyMutation = useMutation({
    mutationFn: async () => {
      const artworkIds = artworks.map(a => a.id);
      const response = await apiRequestLong("POST", "/api/shopify/sync-batch", { 
        artworkIds, 
        generateAI: shopifyGenerateAI 
      });
      return await response.json() as ShopifyBatchResult;
    },
    onSuccess: (result) => {
      setShopifySyncResult(result);
      const skippedText = result.skipped ? ` ${result.skipped} skipped (already exist).` : '';
      
      if (result.failed === 0) {
        if (result.skipped && result.successful === 0) {
          toast({
            title: "Sync Complete",
            description: `All ${result.skipped} products already exist in Shopify.`,
          });
        } else {
          toast({
            title: "Sync Complete",
            description: `Successfully synced ${result.successful} product(s) to Shopify.${skippedText}`,
          });
        }
      } else {
        toast({
          title: "Sync Completed with Errors",
          description: `${result.successful} succeeded, ${result.failed} failed.${skippedText}`,
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createExportMutation = useMutation({
    mutationFn: async () => {
      // Export ALL artworks
      const artworkIds = artworks.map(a => a.id);
      const response = await apiRequest("POST", "/api/export-batches", { artworkIds, generateAI });
      return await response.json() as ExportBatch;
    },
    onSuccess: async (batch) => {
      queryClient.invalidateQueries({ queryKey: ["/api/export-batches"] });
      setCurrentBatchId(batch.id);

      if (batch.status === "failed") {
        toast({
          title: "Export Failed",
          description: "An error occurred during export",
          variant: "destructive",
        });
        return;
      }

      if (batch.csvFileUrl) {
        await fetchAndParseCSV(batch.csvFileUrl);
        toast({
          title: "CSV Generated",
          description: `Successfully exported ${artworks.length} artworks`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Export Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteExportMutation = useMutation({
    mutationFn: async (batchId: string) => {
      await apiRequest("DELETE", `/api/export-batches/${batchId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/export-batches"] });
      toast({
        title: "Export Deleted",
        description: "Export batch successfully deleted",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const fetchAndParseCSV = async (url: string) => {
    try {
      const response = await fetch(url);
      const text = await response.text();

      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data.length > 0) {
            setCsvHeaders(results.meta.fields || []);
            setCsvData(results.data as CSVRow[]);
          }
        },
        error: (error: Error) => {
          toast({
            title: "Error parsing CSV",
            description: error.message,
            variant: "destructive",
          });
        },
      });
    } catch (error) {
      toast({
        title: "Error fetching CSV",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const updateCell = (rowIndex: number, column: string, value: string) => {
    const newData = [...csvData];
    newData[rowIndex][column] = value;
    setCsvData(newData);
  };

  const addRow = () => {
    const newRow: CSVRow = {};
    csvHeaders.forEach(header => {
      newRow[header] = '';
    });
    setCsvData([...csvData, newRow]);
  };

  const deleteRow = (index: number) => {
    setCsvData(csvData.filter((_, i) => i !== index));
  };

  const downloadCSV = () => {
    if (csvData.length === 0) {
      toast({
        title: "No data",
        description: "Generate CSV data first",
        variant: "destructive",
      });
      return;
    }

    const csvContent = Papa.unparse(csvData, {
      columns: csvHeaders,
      quotes: true,
    });

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shopify-products-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "CSV Downloaded",
      description: `Downloaded ${csvData.length} rows`,
    });
  };

  const uniqueSizeFramePairs = new Set<string>();
  artworks.forEach(a => {
    a.availableSizes.forEach(sizeCode => {
      // Convert size code (e.g., "A4") to full format (e.g., 'A4 - 8.27" x 11.67"')
      const fullSizeName = getSizeNameFromCode(sizeCode);
      FRAME_OPTIONS.forEach(frame => {
        uniqueSizeFramePairs.add(`${fullSizeName}|${frame}`);
      });
    });
  });

  const missingConfigs = Array.from(uniqueSizeFramePairs)
    .map(pair => {
      const [size, frame] = pair.split('|');
      return {
        size,
        frame,
        exists: variantConfigs.some(vc => vc.printSize === size && vc.frameOption === frame)
      };
    })
    .filter(config => !config.exists);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Product Exports</h1>
        <p className="text-muted-foreground">Export products to Shopify via CSV or direct API sync</p>
      </div>

      {missingConfigs.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Missing Variant Configurations</AlertTitle>
          <AlertDescription>
            <p className="mb-2">The following size/frame combinations don't have pricing configured and will be skipped in the export:</p>
            <ul className="list-disc list-inside max-h-40 overflow-y-auto">
              {missingConfigs.slice(0, 10).map((config, i) => (
                <li key={i} className="text-sm">
                  {config.size} - {config.frame}
                </li>
              ))}
              {missingConfigs.length > 10 && (
                <li className="text-sm font-medium">...and {missingConfigs.length - 10} more</li>
              )}
            </ul>
            <p className="mt-2 text-sm">To include these variants, add configurations in the Variant Configs section.</p>
          </AlertDescription>
        </Alert>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Generate Export</CardTitle>
          <CardDescription>Create a Shopify Matrixify CSV export for all artworks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Total artworks: {artworks.length}</Label>
            <Label className="text-sm text-muted-foreground">
              Variant configs available: {variantConfigs.length}
            </Label>
          </div>

          <div className="flex items-center space-x-2 p-3 border rounded-md bg-muted/30">
            <Checkbox
              id="generate-ai"
              checked={generateAI}
              onCheckedChange={(checked) => setGenerateAI(checked as boolean)}
              data-testid="checkbox-generate-ai"
            />
            <Label htmlFor="generate-ai" className="cursor-pointer text-sm">
              <div className="font-medium">Generate AI metadata</div>
              <div className="text-muted-foreground">
                Use OpenAI GPT-5 Vision to analyze artwork and generate SEO-optimized descriptions, tags, and metadata
              </div>
            </Label>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={() => createExportMutation.mutate()}
              disabled={artworks.length === 0 || createExportMutation.isPending}
              data-testid="button-generate-csv"
            >
              {createExportMutation.isPending ? "Generating..." : "Generate CSV Export"}
            </Button>
            {missingConfigs.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {missingConfigs.length} variant(s) will be skipped (no pricing configured)
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Shopify Direct Sync
          </CardTitle>
          <CardDescription>
            Send products directly to Shopify via API (no CSV import needed)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => testShopifyMutation.mutate()}
              disabled={testShopifyMutation.isPending}
              data-testid="button-test-shopify"
            >
              {testShopifyMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                "Test Connection"
              )}
            </Button>
            {shopifyTestResult && (
              <div className="flex items-center gap-2 text-sm">
                {shopifyTestResult.success ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span>Connected to {shopifyTestResult.shopName}</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-red-500">{shopifyTestResult.error}</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2 p-3 border rounded-md bg-muted/30">
            <Checkbox
              id="shopify-generate-ai"
              checked={shopifyGenerateAI}
              onCheckedChange={(checked) => setShopifyGenerateAI(checked as boolean)}
              data-testid="checkbox-shopify-generate-ai"
            />
            <Label htmlFor="shopify-generate-ai" className="cursor-pointer text-sm">
              <div className="font-medium">Generate AI metadata</div>
              <div className="text-muted-foreground">
                Use OpenAI to generate SEO-optimized descriptions and alt text
              </div>
            </Label>
          </div>

          <div className="space-y-2">
            <Label>Products to sync: {artworks.length}</Label>
          </div>

          <Button
            onClick={() => syncToShopifyMutation.mutate()}
            disabled={artworks.length === 0 || syncToShopifyMutation.isPending}
            data-testid="button-sync-shopify"
          >
            {syncToShopifyMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Syncing to Shopify...
              </>
            ) : (
              <>
                <Store className="w-4 h-4 mr-2" />
                Sync All to Shopify
              </>
            )}
          </Button>

          {shopifySyncResult && (
            <Alert variant={shopifySyncResult.failed > 0 ? "destructive" : "default"}>
              <AlertTitle>Sync Results</AlertTitle>
              <AlertDescription>
                <p>{shopifySyncResult.successful} product(s) synced successfully</p>
                {shopifySyncResult.failed > 0 && (
                  <p>{shopifySyncResult.failed} product(s) failed</p>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {csvData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>CSV Spreadsheet Editor</CardTitle>
                <CardDescription>{csvData.length} rows - Click any cell to edit</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={addRow} data-testid="button-add-row">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Row
                </Button>
                <Button onClick={downloadCSV} data-testid="button-download-csv">
                  <Download className="w-4 h-4 mr-2" />
                  Download CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto overflow-y-auto max-h-[600px] border rounded-md">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted z-20">
                  <tr>
                    <th className="p-2 text-left font-medium border-b sticky left-0 bg-muted z-30">Actions</th>
                    {csvHeaders.map(col => (
                      <th key={col} className="p-2 text-left font-medium border-b whitespace-nowrap min-w-[150px]">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvData.map((row, rowIndex) => (
                    <tr key={rowIndex} className="hover-elevate">
                      <td className="p-2 border-b sticky left-0 bg-background z-10">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteRow(rowIndex)}
                          data-testid={`button-delete-row-${rowIndex}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                      {csvHeaders.map(col => (
                        <td
                          key={col}
                          className="p-0 border-b"
                          onClick={() => setEditingCell({ rowIndex, column: col })}
                        >
                          {editingCell?.rowIndex === rowIndex && editingCell?.column === col ? (
                            <Input
                              value={row[col] || ''}
                              onChange={(e) => updateCell(rowIndex, col, e.target.value)}
                              onBlur={() => setEditingCell(null)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              autoFocus
                              className="border-0 rounded-none h-full min-h-[36px]"
                              data-testid={`input-cell-${rowIndex}-${col}`}
                            />
                          ) : (
                            <div className="p-2 min-h-[36px] cursor-pointer hover:bg-accent/10 whitespace-nowrap">
                              {row[col] || <span className="text-muted-foreground italic">empty</span>}
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {exportBatches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Export History</CardTitle>
            <CardDescription>Previous CSV exports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {exportBatches.slice(0, 5).map(batch => (
                <div key={batch.id} className="flex items-center justify-between p-3 border rounded-md">
                  <div>
                    <div className="font-medium">
                      {batch.artworkIds.length} artworks
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {batch.status} - Created {new Date(batch.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {batch.csvFileUrl && batch.status === "completed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchAndParseCSV(batch.csvFileUrl!)}
                        data-testid={`button-load-batch-${batch.id}`}
                      >
                        Load
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteExportMutation.mutate(batch.id)}
                      disabled={deleteExportMutation.isPending}
                      data-testid={`button-delete-batch-${batch.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
