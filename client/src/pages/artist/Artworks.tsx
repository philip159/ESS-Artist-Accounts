import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Artwork, ArtistAccount } from "@shared/schema";
import { format } from "date-fns";
import { Clock, CheckCircle, Package } from "lucide-react";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { artistQueryFn } from "@/lib/artistApiRequest";

async function impersonationFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json() as Promise<T>;
}

interface ShopifyProduct {
  id: string;
  title: string;
  vendor: string;
  status: string;
  featuredImageUrl: string | null;
  createdAt: string;
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "exported":
      return "default";
    case "mockups_generated":
    case "analyzed":
      return "secondary";
    case "pending":
      return "outline";
    default:
      return "outline";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "exported":
      return "Live";
    case "mockups_generated":
      return "Ready for Export";
    case "analyzed":
      return "Processing";
    case "pending":
      return "Pending";
    default:
      return status;
  }
}

export default function ArtistArtworks() {
  const { apiPrefix, isImpersonating, artistProfile, isLoading: impersonationLoading } = useImpersonation();

  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery<ArtistAccount>({
    queryKey: [apiPrefix, "profile"],
    queryFn: () => artistQueryFn<ArtistAccount>("/api/artist/profile"),
    enabled: !isImpersonating,
  });

  const activeProfile = isImpersonating ? artistProfile : profile;
  const isProfileLoading = isImpersonating ? impersonationLoading : profileLoading;

  const { data: pendingArtworks, isLoading: pendingLoading } = useQuery<Artwork[]>({
    queryKey: [apiPrefix, "artworks"],
    queryFn: () => isImpersonating
      ? impersonationFetch<Artwork[]>(`${apiPrefix}/artworks`)
      : artistQueryFn<Artwork[]>("/api/artist/artworks"),
    enabled: !!activeProfile,
  });

  const { data: collection, isLoading: collectionLoading } = useQuery<ShopifyProduct[]>({
    queryKey: [apiPrefix, "collection"],
    queryFn: () => isImpersonating
      ? impersonationFetch<ShopifyProduct[]>(`${apiPrefix}/collection`)
      : artistQueryFn<ShopifyProduct[]>("/api/artist/collection"),
    enabled: !!activeProfile,
  });

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

  const isLoading = profileLoading;
  const liveProducts = collection?.filter(p => p.status === "ACTIVE") || [];

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900" data-testid="text-page-title">
          My Artworks
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          View your pending submissions and live collection
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="card-pending-count">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Submissions</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {pendingLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{pendingArtworks?.length || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Awaiting review</p>
          </CardContent>
        </Card>

        <Card data-testid="card-live-count">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Live Products</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {collectionLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{liveProducts.length}</div>
            )}
            <p className="text-xs text-muted-foreground">Available in store</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="collection" className="space-y-4">
        <TabsList>
          <TabsTrigger value="collection" data-testid="tab-collection">
            <Package className="h-4 w-4 mr-2" />
            Your Collection
          </TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending">
            <Clock className="h-4 w-4 mr-2" />
            Pending Submissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card data-testid="card-pending-table">
            <CardHeader>
              <CardTitle>Pending Submissions</CardTitle>
              <CardDescription>
                Recent artwork submissions that are being processed
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : pendingArtworks && pendingArtworks.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Artwork</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Edition</TableHead>
                      <TableHead>Sizes</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingArtworks.map((artwork) => (
                      <TableRow key={artwork.id} data-testid={`row-pending-${artwork.id}`}>
                        <TableCell>
                          {artwork.lowResFileUrl ? (
                            <img
                              src={artwork.lowResFileUrl}
                              alt={artwork.title}
                              className="w-16 h-16 object-cover rounded"
                            />
                          ) : (
                            <div className="w-16 h-16 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                              No preview
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{artwork.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {artwork.editionType}
                            {artwork.editionType === "limited" && artwork.editionSize && (
                              <span className="ml-1">({artwork.editionSize})</span>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {artwork.availableSizes?.length || 0} sizes
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(artwork.status)}>
                            {getStatusLabel(artwork.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(artwork.uploadedAt), "dd MMM yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No pending submissions. Submit new artwork to see it here.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="collection">
          <Card data-testid="card-collection-table">
            <CardHeader>
              <CardTitle>Your Collection</CardTitle>
              <CardDescription>
                Live products available in the store
              </CardDescription>
            </CardHeader>
            <CardContent>
              {collectionLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : liveProducts.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {liveProducts.map((product) => (
                    <Card key={product.id} className="overflow-hidden" data-testid={`card-product-${product.id}`}>
                      <div className="aspect-[3/4] bg-muted">
                        {product.featuredImageUrl ? (
                          <img
                            src={product.featuredImageUrl}
                            alt={product.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            No image
                          </div>
                        )}
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-medium line-clamp-2">{product.title}</h3>
                        <p className="text-xs text-muted-foreground mt-2">
                          {format(new Date(product.createdAt), "MMM yyyy")}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No live products yet. Once your submissions are approved, they'll appear here.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
