import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { artistApiRequest, artistQueryFn } from "@/lib/artistApiRequest";
import { CreditCard, Save, Loader2 } from "lucide-react";
import type { ArtistAccount, ArtistSales } from "@shared/schema";
import { format } from "date-fns";
import { useImpersonation } from "@/contexts/ImpersonationContext";

async function impersonationFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json() as Promise<T>;
}

export default function ArtistPayouts() {
  const { toast } = useToast();
  const { apiPrefix, isImpersonating, artistProfile, isLoading: impersonationLoading } = useImpersonation();
  const [paypalEmail, setPaypalEmail] = useState("");
  const [paypalRecipientName, setPaypalRecipientName] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery<ArtistAccount>({
    queryKey: [apiPrefix, "profile"],
    queryFn: () => artistQueryFn<ArtistAccount>("/api/artist/profile"),
    enabled: !isImpersonating,
  });

  const activeProfile = isImpersonating ? artistProfile : profile;
  const isProfileLoading = isImpersonating ? impersonationLoading : profileLoading;

  const { data: sales, isLoading: salesLoading } = useQuery<ArtistSales[]>({
    queryKey: [apiPrefix, "sales"],
    queryFn: () => isImpersonating
      ? impersonationFetch<ArtistSales[]>(`${apiPrefix}/sales`)
      : artistQueryFn<ArtistSales[]>("/api/artist/sales"),
    enabled: !!activeProfile,
  });

  useEffect(() => {
    if (activeProfile) {
      setPaypalEmail(activeProfile.paypalEmail || "");
      setPaypalRecipientName(activeProfile.paypalRecipientName || "");
    }
  }, [activeProfile]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { paypalEmail: string; paypalRecipientName: string }) => {
      const response = await artistApiRequest("PATCH", "/api/artist/profile", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Profile updated",
        description: "Your PayPal information has been saved",
      });
      queryClient.invalidateQueries({ queryKey: [apiPrefix, "profile"] });
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateProfileMutation.mutate({ paypalEmail, paypalRecipientName });
  };

  if (profileError && !isImpersonating) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Account Not Linked</CardTitle>
            <CardDescription>
              Your account hasn't been linked to an artist profile yet. Please contact the admin.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const totalRevenue = sales?.reduce((sum, s) => sum + (s.grossRevenue || 0), 0) || 0;
  const totalNetRevenue = sales?.reduce((sum, s) => sum + (s.netRevenue || 0), 0) || 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display" data-testid="text-page-title">
          Payouts
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your payout settings and view earnings
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-testid="card-paypal-settings">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              PayPal Settings
            </CardTitle>
            <CardDescription>
              Set up your PayPal account for receiving payouts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profileLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="paypalEmail">PayPal Email</Label>
                  <Input
                    id="paypalEmail"
                    type="email"
                    placeholder="your@paypal.com"
                    value={paypalEmail}
                    onChange={(e) => {
                      setPaypalEmail(e.target.value);
                      setIsEditing(true);
                    }}
                    disabled={isImpersonating}
                    data-testid="input-paypal-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paypalRecipientName">Recipient Name</Label>
                  <Input
                    id="paypalRecipientName"
                    placeholder="Your name as it appears on PayPal"
                    value={paypalRecipientName}
                    onChange={(e) => {
                      setPaypalRecipientName(e.target.value);
                      setIsEditing(true);
                    }}
                    disabled={isImpersonating}
                    data-testid="input-paypal-name"
                  />
                </div>
                {!isImpersonating && (
                  <Button
                    onClick={handleSave}
                    disabled={!isEditing || updateProfileMutation.isPending}
                    className="w-full"
                    data-testid="button-save-paypal"
                  >
                    {updateProfileMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save PayPal Settings
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-earnings-summary">
          <CardHeader>
            <CardTitle>Earnings Summary</CardTitle>
            <CardDescription>Your total earnings from sales</CardDescription>
          </CardHeader>
          <CardContent>
            {salesLoading || profileLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-8 w-32" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Gross Revenue</p>
                  <p className="text-2xl font-bold">£{(totalRevenue / 100).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Net Earnings</p>
                  <p className="text-2xl font-bold text-primary">
                    £{(totalNetRevenue / 100).toFixed(2)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-sales-history">
        <CardHeader>
          <CardTitle>Sales History</CardTitle>
          <CardDescription>Your sales data by period</CardDescription>
        </CardHeader>
        <CardContent>
          {salesLoading || profileLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sales && sales.length > 0 ? (
            <div className="space-y-3">
              {sales.map((sale) => (
                <div
                  key={sale.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                  data-testid={`row-sale-${sale.id}`}
                >
                  <div>
                    <p className="font-medium">
                      {format(new Date(sale.periodStart), "MMM yyyy")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {sale.totalOrders} orders, {sale.totalUnits} units
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">£{((sale.grossRevenue || 0) / 100).toFixed(2)}</p>
                    <p className="text-sm text-muted-foreground">gross</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No sales data available yet. Sales will appear here once you have orders.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
