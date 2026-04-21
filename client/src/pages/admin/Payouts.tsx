import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Plus, 
  Loader2, 
  PoundSterling, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock,
  ArrowRight,
  Trash2,
  Eye
} from "lucide-react";
import type { PayoutBatch, PayoutItem } from "@shared/schema";
import { format } from "date-fns";

interface PayoutBatchWithItems {
  batch: PayoutBatch;
  items: (PayoutItem & { artistName: string; artistDisplayName?: string })[];
}

interface PayPalConfig {
  configured: boolean;
  sandbox: boolean;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "draft":
      return <Badge variant="secondary" data-testid="status-draft">Draft</Badge>;
    case "pending_approval":
      return <Badge variant="outline" data-testid="status-pending">Pending Approval</Badge>;
    case "approved":
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" data-testid="status-approved">Approved</Badge>;
    case "processing":
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" data-testid="status-processing">Processing</Badge>;
    case "completed":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="status-completed">Completed</Badge>;
    case "failed":
      return <Badge variant="destructive" data-testid="status-failed">Failed</Badge>;
    case "cancelled":
      return <Badge variant="secondary" data-testid="status-cancelled">Cancelled</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getItemStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary" data-testid="item-status-pending">Pending</Badge>;
    case "queued":
      return <Badge variant="outline" data-testid="item-status-queued">Queued</Badge>;
    case "processing":
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" data-testid="item-status-processing">Processing</Badge>;
    case "paid":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="item-status-paid">Paid</Badge>;
    case "failed":
      return <Badge variant="destructive" data-testid="item-status-failed">Failed</Badge>;
    case "cancelled":
      return <Badge variant="secondary" data-testid="item-status-cancelled">Cancelled</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function AdminPayouts() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<PayoutBatchWithItems | null>(null);
  const [periodStart, setPeriodStart] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    date.setDate(1);
    return date.toISOString().split('T')[0];
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    const date = new Date();
    date.setDate(0);
    return date.toISOString().split('T')[0];
  });

  const { data: batches, isLoading } = useQuery<PayoutBatch[]>({
    queryKey: ["/api/admin/payouts"],
  });

  const { data: paypalConfig } = useQuery<PayPalConfig>({
    queryKey: ["/api/admin/payouts/config/status"],
  });

  const createBatchMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/payouts/create", {
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
      });
      return response.json();
    },
    onSuccess: (data: { batch: PayoutBatch; items: PayoutItem[]; message: string }) => {
      toast({
        title: "Payout batch created",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payouts"] });
      setCreateDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create batch",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const response = await apiRequest("POST", `/api/admin/payouts/${batchId}/approve`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Batch approved",
        description: "The payout batch has been approved and is ready for processing",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payouts"] });
      if (selectedBatch) {
        fetchBatchDetails(selectedBatch.batch.id);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Approval failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const processMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const response = await apiRequest("POST", `/api/admin/payouts/${batchId}/process`);
      return response.json();
    },
    onSuccess: (data: { batch: PayoutBatch; paypalBatchId: string; message: string }) => {
      toast({
        title: "Processing started",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payouts"] });
      if (selectedBatch) {
        fetchBatchDetails(selectedBatch.batch.id);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Processing failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const response = await apiRequest("POST", `/api/admin/payouts/${batchId}/refresh`);
      return response.json();
    },
    onSuccess: (data: PayoutBatchWithItems) => {
      toast({
        title: "Status refreshed",
        description: "Payout status has been updated from PayPal",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payouts"] });
      setSelectedBatch(data);
    },
    onError: (error: Error) => {
      toast({
        title: "Refresh failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const response = await apiRequest("POST", `/api/admin/payouts/${batchId}/cancel`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Batch cancelled",
        description: "The payout batch has been cancelled",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payouts"] });
      setViewDialogOpen(false);
      setSelectedBatch(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Cancel failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const response = await apiRequest("DELETE", `/api/admin/payouts/${batchId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Batch deleted",
        description: "The payout batch has been removed",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payouts"] });
      setViewDialogOpen(false);
      setSelectedBatch(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const fetchBatchDetails = async (batchId: string) => {
    try {
      const response = await fetch(`/api/admin/payouts/${batchId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch batch details");
      const data = await response.json();
      setSelectedBatch(data);
      setViewDialogOpen(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load batch details",
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (pence: number) => {
    return `£${(pence / 100).toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Bulk Payouts</h1>
          <p className="text-muted-foreground">Manage PayPal bulk payments to artists</p>
        </div>
        <div className="flex items-center gap-2">
          {paypalConfig && (
            <Badge 
              variant={paypalConfig.configured ? "default" : "destructive"}
              data-testid="status-paypal-config"
            >
              PayPal: {paypalConfig.configured ? (paypalConfig.sandbox ? "Sandbox" : "Live") : "Not Configured"}
            </Badge>
          )}
          <Button 
            onClick={() => setCreateDialogOpen(true)}
            data-testid="button-create-payout"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Payout Batch
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PoundSterling className="h-5 w-5" />
            Payout Batches
          </CardTitle>
          <CardDescription>
            View and manage artist commission payouts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : batches && batches.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id} data-testid={`row-payout-batch-${batch.id}`}>
                    <TableCell>
                      {format(new Date(batch.periodStart), "d MMM yyyy")} - {format(new Date(batch.periodEnd), "d MMM yyyy")}
                    </TableCell>
                    <TableCell>{getStatusBadge(batch.status)}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(batch.totalNet)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(batch.createdAt), "d MMM yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fetchBatchDetails(batch.id)}
                        data-testid={`button-view-batch-${batch.id}`}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <PoundSterling className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No payout batches yet</p>
              <p className="text-sm">Create a payout batch to get started</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Payout Batch</DialogTitle>
            <DialogDescription>
              Create a new payout batch for artist commissions within a date range.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="periodStart">Period Start</Label>
                <input
                  id="periodStart"
                  type="date"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  data-testid="input-period-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodEnd">Period End</Label>
                <input
                  id="periodEnd"
                  type="date"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  data-testid="input-period-end"
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              This will aggregate all unpaid sales within the selected period for artists with PayPal info configured.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => createBatchMutation.mutate()}
              disabled={createBatchMutation.isPending}
              data-testid="button-confirm-create"
            >
              {createBatchMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl">
          {selectedBatch && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  Payout Batch Details
                  {getStatusBadge(selectedBatch.batch.status)}
                </DialogTitle>
                <DialogDescription>
                  {format(new Date(selectedBatch.batch.periodStart), "d MMM yyyy")} - {format(new Date(selectedBatch.batch.periodEnd), "d MMM yyyy")}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold" data-testid="text-total-amount">
                        {formatCurrency(selectedBatch.batch.totalNet)}
                      </div>
                      <p className="text-sm text-muted-foreground">Total Payout</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold" data-testid="text-item-count">
                        {selectedBatch.items.length}
                      </div>
                      <p className="text-sm text-muted-foreground">Artists</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold" data-testid="text-paid-count">
                        {selectedBatch.items.filter(i => i.status === "paid").length}
                      </div>
                      <p className="text-sm text-muted-foreground">Paid</p>
                    </CardContent>
                  </Card>
                </div>

                {selectedBatch.items.length > 0 && (
                  <div className="border rounded-lg max-h-64 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Artist</TableHead>
                          <TableHead>PayPal Email</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedBatch.items.map((item) => (
                          <TableRow key={item.id} data-testid={`row-payout-item-${item.id}`}>
                            <TableCell className="font-medium">
                              {item.artistDisplayName || item.artistName}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.paypalEmailSnapshot}
                            </TableCell>
                            <TableCell>{formatCurrency(item.netAmount)}</TableCell>
                            <TableCell>
                              {getItemStatusBadge(item.status)}
                              {item.errorMessage && (
                                <p className="text-xs text-destructive mt-1">{item.errorMessage}</p>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {selectedBatch.batch.externalBatchId && (
                  <p className="text-sm text-muted-foreground">
                    PayPal Batch ID: <code className="bg-muted px-1 rounded">{selectedBatch.batch.externalBatchId}</code>
                  </p>
                )}

                {selectedBatch.batch.errorMessage && (
                  <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
                    <strong>Error:</strong> {selectedBatch.batch.errorMessage}
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 flex-wrap">
                {(selectedBatch.batch.status === "draft" || selectedBatch.batch.status === "cancelled") && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteMutation.mutate(selectedBatch.batch.id)}
                    disabled={deleteMutation.isPending}
                    data-testid="button-delete-batch"
                  >
                    {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                    Delete
                  </Button>
                )}

                {(selectedBatch.batch.status === "draft" || selectedBatch.batch.status === "approved" || selectedBatch.batch.status === "failed") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cancelMutation.mutate(selectedBatch.batch.id)}
                    disabled={cancelMutation.isPending}
                    data-testid="button-cancel-batch"
                  >
                    {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
                    Cancel
                  </Button>
                )}

                {selectedBatch.batch.externalBatchId && selectedBatch.batch.status === "processing" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refreshMutation.mutate(selectedBatch.batch.id)}
                    disabled={refreshMutation.isPending}
                    data-testid="button-refresh-status"
                  >
                    {refreshMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                    Refresh Status
                  </Button>
                )}

                {selectedBatch.batch.status === "draft" && (
                  <Button
                    size="sm"
                    onClick={() => approveMutation.mutate(selectedBatch.batch.id)}
                    disabled={approveMutation.isPending}
                    data-testid="button-approve-batch"
                  >
                    {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                    Approve
                  </Button>
                )}

                {selectedBatch.batch.status === "approved" && (
                  <Button
                    size="sm"
                    onClick={() => processMutation.mutate(selectedBatch.batch.id)}
                    disabled={processMutation.isPending || !paypalConfig?.configured}
                    data-testid="button-process-batch"
                  >
                    {processMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-1" />}
                    Process via PayPal
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
