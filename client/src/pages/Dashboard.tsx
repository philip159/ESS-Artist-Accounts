import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  Upload, 
  Image as ImageIcon, 
  LayoutTemplate, 
  Download,
  TrendingUp,
  CheckCircle,
  Clock,
  AlertCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Artwork } from "@shared/schema";

export default function Dashboard() {
  const { data: artworks, isLoading } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"],
  });

  const stats = {
    total: artworks?.length || 0,
    pending: artworks?.filter(a => a.status === "pending").length || 0,
    analyzed: artworks?.filter(a => a.status === "analyzed").length || 0,
    completed: artworks?.filter(a => a.status === "mockups_generated").length || 0,
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold font-display">
                Dashboard
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage your artwork submissions and mockups
              </p>
            </div>
            
            <Link href="/submit">
              <Button size="lg" data-testid="button-submit-artwork">
                <Upload className="w-4 h-4 mr-2" />
                Submit Artwork
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12 space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Artworks
              </CardTitle>
              <ImageIcon className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground mt-1">
                All time submissions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Pending Analysis
              </CardTitle>
              <Clock className="w-4 h-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Awaiting processing
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Analyzed
              </CardTitle>
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.analyzed}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Ready for mockups
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Completed
              </CardTitle>
              <CheckCircle className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completed}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Mockups generated
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-2xl font-semibold font-display mb-6">
            Quick Actions
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link href="/submit">
              <Card className="hover-elevate cursor-pointer transition-all h-full">
                <CardContent className="p-6">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="p-4 bg-primary/10 rounded-full">
                      <Upload className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Submit Artwork</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Upload new artwork for analysis
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/templates">
              <Card className="hover-elevate cursor-pointer transition-all h-full">
                <CardContent className="p-6">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="p-4 bg-blue-500/10 rounded-full">
                      <LayoutTemplate className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Manage Templates</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Configure mockup templates
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/exports">
              <Card className="hover-elevate cursor-pointer transition-all h-full">
                <CardContent className="p-6">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="p-4 bg-green-500/10 rounded-full">
                      <Download className="w-8 h-8 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Export Data</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Generate Shopify CSV exports
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>

        {/* Recent Artworks */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold font-display">
              Recent Artworks
            </h2>
            <Link href="/artworks">
              <Button variant="outline" data-testid="button-view-all">
                View All
              </Button>
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="w-full h-48 mb-4" />
                    <Skeleton className="w-3/4 h-6 mb-2" />
                    <Skeleton className="w-1/2 h-4" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : artworks && artworks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {artworks.slice(0, 6).map((artwork) => (
                <Card key={artwork.id} className="hover-elevate transition-all">
                  <CardContent className="p-6 space-y-4">
                    <div className="aspect-square bg-muted rounded-lg overflow-hidden">
                      {artwork.lowResFileUrl ? (
                        <img
                          src={artwork.lowResFileUrl}
                          alt={artwork.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-12 h-12 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="font-semibold font-display truncate">
                        {artwork.title}
                      </h3>
                      
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="text-xs">
                          {artwork.dpi} DPI
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {artwork.aspectRatio}
                        </Badge>
                        {artwork.status === "pending" && (
                          <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400">
                            <Clock className="w-3 h-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                        {artwork.status === "analyzed" && (
                          <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-400">
                            Analyzed
                          </Badge>
                        )}
                        {artwork.status === "mockups_generated" && (
                          <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Complete
                          </Badge>
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
                      <ImageIcon className="w-12 h-12 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold">No artworks yet</h3>
                    <p className="text-muted-foreground">
                      Get started by submitting your first artwork
                    </p>
                  </div>
                  <Link href="/submit">
                    <Button data-testid="button-get-started">
                      <Upload className="w-4 h-4 mr-2" />
                      Submit Artwork
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
