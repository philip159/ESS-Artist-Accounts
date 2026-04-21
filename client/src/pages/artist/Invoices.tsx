import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, PoundSterling, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { artistQueryFn } from "@/lib/artistApiRequest";
import type { PayoutItem } from "@shared/schema";

async function impersonationFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json() as Promise<T>;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "paid":
      return <Badge className="bg-green-100 text-green-800 border-green-200">Paid</Badge>;
    case "pending":
      return <Badge variant="outline">Pending</Badge>;
    case "queued":
      return <Badge variant="secondary">Queued</Badge>;
    case "processing":
      return <Badge variant="secondary">Processing</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "cancelled":
      return <Badge variant="outline">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function ArtistInvoices() {
  const { apiPrefix, isImpersonating } = useImpersonation();

  const { data: payouts, isLoading } = useQuery<PayoutItem[]>({
    queryKey: [apiPrefix, "invoices"],
    queryFn: () =>
      isImpersonating
        ? impersonationFetch<PayoutItem[]>(`${apiPrefix}/invoices`)
        : artistQueryFn<PayoutItem[]>("/api/artist/invoices"),
  });

  const totalPaid = payouts
    ?.filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + (p.netAmount || 0), 0) || 0;

  const totalPending = payouts
    ?.filter((p) => p.status === "pending" || p.status === "processing" || p.status === "queued")
    .reduce((sum, p) => sum + (p.netAmount || 0), 0) || 0;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900" data-testid="text-page-title">
          Invoices
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Your payment history and payout records
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <Card data-testid="card-total-paid">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <PoundSterling className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-green-700">£{(totalPaid / 100).toFixed(2)}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Payments received</p>
          </CardContent>
        </Card>

        <Card data-testid="card-total-pending">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payout</CardTitle>
            <PoundSterling className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">£{(totalPending / 100).toFixed(2)}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Awaiting transfer</p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-invoices-table">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Payment History
          </CardTitle>
          <CardDescription>
            All payouts issued to your PayPal account — click the PayPal reference to view the transaction
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : payouts && payouts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>PayPal Account</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                  <TableHead className="text-right">Net Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((payout) => (
                  <TableRow key={payout.id} data-testid={`row-invoice-${payout.id}`}>
                    <TableCell className="font-medium">
                      {format(new Date(payout.createdAt), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {payout.paypalEmailSnapshot}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      £{((payout.grossAmount || 0) / 100).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      £{((payout.feeAmount || 0) / 100).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      £{((payout.netAmount || 0) / 100).toFixed(2)}
                    </TableCell>
                    <TableCell>{getStatusBadge(payout.status)}</TableCell>
                    <TableCell>
                      {payout.externalItemId ? (
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={`https://www.paypal.com/activity/payment/${payout.externalItemId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs"
                          >
                            <ExternalLink className="h-3 w-3" />
                            PayPal
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground font-mono">
                          {payout.id.slice(0, 8).toUpperCase()}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <FileText className="h-10 w-10 mx-auto opacity-30" />
              <p className="font-medium">No invoices yet</p>
              <p className="text-sm">Payment records will appear here once commissions have been processed and paid.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
