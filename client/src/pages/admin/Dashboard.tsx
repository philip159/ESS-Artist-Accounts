import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Image as ImageIcon, Layers, FileText, CheckCircle2 } from "lucide-react";
import type { Artwork } from "@shared/schema";
import { DropboxStatus } from "@/components/DropboxStatus";

export default function AdminDashboard() {
  const { data: artworks = [] } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"],
  });

  const stats = [
    {
      title: "Total Artworks",
      value: artworks.length,
      icon: ImageIcon,
      description: "Submitted by artists",
    },
    {
      title: "Pending",
      value: artworks.filter((a) => a.status === "pending").length,
      icon: FileText,
      description: "Awaiting processing",
    },
    {
      title: "Mockups Generated",
      value: artworks.filter((a) => a.status === "mockups_generated").length,
      icon: Layers,
      description: "Ready for export",
    },
    {
      title: "Exported",
      value: artworks.filter((a) => a.status === "exported").length,
      icon: CheckCircle2,
      description: "Completed",
    },
  ];

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-display">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Overview of your artwork submissions and processing pipeline
        </p>
      </div>

      <DropboxStatus />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Submissions</CardTitle>
          <CardDescription>
            Latest artwork uploads from artists
          </CardDescription>
        </CardHeader>
        <CardContent>
          {artworks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No artworks submitted yet
            </p>
          ) : (
            <div className="space-y-4">
              {artworks.slice(0, 5).map((artwork) => (
                <div
                  key={artwork.id}
                  className="flex items-center gap-4 p-4 border rounded-lg"
                  data-testid={`artwork-${artwork.id}`}
                >
                  <img
                    src={artwork.lowResFileUrl || artwork.originalFileUrl}
                    alt={artwork.title}
                    className="w-16 h-16 object-cover rounded-md"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">
                      {artwork.title}
                      {artwork.editionType === "limited" && " (Limited Edition)"}
                    </h3>
                    <p className="text-sm text-muted-foreground truncate">
                      by {artwork.artistName}
                    </p>
                    {(artwork.comments || artwork.artworkStory) && (
                      <p className="text-sm text-muted-foreground mt-1 italic line-clamp-2">
                        {artwork.artworkStory || artwork.comments}
                      </p>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {artwork.widthPx} × {artwork.heightPx} • {artwork.dpi} DPI
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
