import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Plus, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExportBatch } from "@shared/schema";
import { format } from "date-fns";

export default function Exports() {
  const { data: exports, isLoading } = useQuery<ExportBatch[]>({
    queryKey: ["/api/export-batches"],
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold font-display">Export Batches</h1>
              <p className="text-muted-foreground mt-1">
                Generate and manage Shopify product data exports
              </p>
            </div>

            <Button size="lg" data-testid="button-create-export">
              <Plus className="w-4 h-4 mr-2" />
              New Export Batch
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12">
        {isLoading ? (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="w-full h-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : exports && exports.length > 0 ? (
          <div className="space-y-6">
            {exports.map((exportBatch) => (
              <Card key={exportBatch.id} className="hover-elevate transition-all">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="font-display">{exportBatch.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Created {format(new Date(exportBatch.createdAt), "PPP 'at' p")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {exportBatch.status === "pending" && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400">
                          Pending
                        </Badge>
                      )}
                      {exportBatch.status === "processing" && (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400">
                          Processing
                        </Badge>
                      )}
                      {exportBatch.status === "completed" && (
                        <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400">
                          Completed
                        </Badge>
                      )}
                      {exportBatch.status === "failed" && (
                        <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400">
                          Failed
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        {exportBatch.artworkIds.length} artwork{exportBatch.artworkIds.length !== 1 ? 's' : ''} included
                      </p>
                    </div>

                    <div className="flex gap-2">
                      {exportBatch.csvFileUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={exportBatch.csvFileUrl} download>
                            <Download className="w-3 h-3 mr-2" />
                            Download CSV
                          </a>
                        </Button>
                      )}
                      {exportBatch.googleSheetUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={exportBatch.googleSheetUrl} target="_blank" rel="noopener noreferrer">
                            <FileSpreadsheet className="w-3 h-3 mr-2" />
                            Open Sheet
                            <ExternalLink className="w-3 h-3 ml-2" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12">
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="p-6 bg-muted rounded-full">
                    <FileSpreadsheet className="w-12 h-12 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">No export batches yet</h3>
                  <p className="text-muted-foreground">
                    Create your first export to generate Shopify product data
                  </p>
                </div>
                <Button data-testid="button-create-first-export">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Export Batch
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
