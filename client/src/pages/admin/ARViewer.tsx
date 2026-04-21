import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, View, Smartphone, QrCode, RefreshCw, ExternalLink, Upload, Paintbrush, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import "@google/model-viewer";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          ar?: boolean;
          "ar-modes"?: string;
          "ar-scale"?: string;
          "ar-placement"?: string;
          "camera-controls"?: boolean;
          "auto-rotate"?: boolean;
          "shadow-intensity"?: string;
          exposure?: string;
          "environment-image"?: string;
        },
        HTMLElement
      >;
    }
  }
}

type FrameStyle = "black" | "white" | "natural";
type FrameType = "standard" | "box" | "canvas";

const FRAME_STYLES: { value: FrameStyle; label: string }[] = [
  { value: "black", label: "Black" },
  { value: "white", label: "White" },
  { value: "natural", label: "Natural Wood" },
];

const FRAME_TYPES: { value: FrameType; label: string; description: string }[] = [
  { value: "standard", label: "Standard Frame", description: "20mm face, 22mm depth" },
  { value: "box", label: "Box Frame", description: "20mm face, 33mm depth" },
  { value: "canvas", label: "Canvas Frame", description: "12mm face, 35mm depth, 5mm gap" },
];

const FRAME_TYPE_DEFAULTS: Record<FrameType, { width: number; mount: number }> = {
  standard: { width: 20, mount: 50 },
  box: { width: 20, mount: 0 },
  canvas: { width: 12, mount: 0 },
};

const TEST_SIZES = [
  "20x30cm",
  "30x40cm",
  "40x50cm",
  "50x70cm",
  "60x80cm",
  "70x100cm",
];

interface Artwork {
  id: string;
  title: string;
  artistName: string;
  lowResFileUrl: string | null;
  originalFileUrl: string | null;
  availableSizes: string[] | null;
  calculatedSizes: string[] | null;
}

export default function AdminARViewer() {
  const [selectedArtworkId, setSelectedArtworkId] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState("30x40cm");
  const [frameStyle, setFrameStyle] = useState<FrameStyle>("black");
  const [frameType, setFrameType] = useState<FrameType>("standard");
  const [frameWidth, setFrameWidth] = useState(20);
  const [mountBorder, setMountBorder] = useState(50);
  const [isLoading, setIsLoading] = useState(false);
  const [modelKey, setModelKey] = useState(0);
  const modelViewerRef = useRef<HTMLElement>(null);

  const { data: artworks, isLoading: artworksLoading } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"],
  });

  useEffect(() => {
    if (artworks && artworks.length > 0 && !selectedArtworkId) {
      const artworkWithImage = artworks.find(a => a.lowResFileUrl || a.originalFileUrl);
      if (artworkWithImage) {
        setSelectedArtworkId(artworkWithImage.id);
      }
    }
  }, [artworks, selectedArtworkId]);

  const isCanvas = frameType === "canvas";

  const selectedArtwork = artworks?.find(a => a.id === selectedArtworkId);
  const availableSizes = selectedArtwork?.availableSizes || selectedArtwork?.calculatedSizes || TEST_SIZES;

  useEffect(() => {
    const defaults = FRAME_TYPE_DEFAULTS[frameType];
    setFrameWidth(defaults.width);
    if (frameType === "canvas") {
      setMountBorder(0);
    }
  }, [frameType]);

  const modelUrl = selectedArtworkId 
    ? `/api/artworks/${selectedArtworkId}/ar-model?size=${encodeURIComponent(selectedSize)}&frame=${frameStyle}&frameType=${frameType}${frameWidth !== FRAME_TYPE_DEFAULTS[frameType].width ? `&frameWidth=${frameWidth}` : ''}&mount=${mountBorder}&_t=${modelKey}`
    : "";

  const mobileUrl = selectedArtworkId
    ? `${window.location.origin}/ar/${selectedArtworkId}?size=${encodeURIComponent(selectedSize)}&frame=${frameStyle}&frameType=${frameType}`
    : "";

  const handleRefresh = () => {
    setIsLoading(true);
    setModelKey(prev => prev + 1);
  };

  const handleARClick = () => {
    if (modelViewerRef.current) {
      (modelViewerRef.current as any).activateAR?.();
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <View className="w-6 h-6" />
            AR Viewer Development
          </h1>
          <p className="text-muted-foreground">Test and develop the AR preview feature</p>
        </div>
        <Badge variant="outline">Development Tool</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>3D Preview</CardTitle>
              <CardDescription>
                Interactive 3D model of the framed artwork
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative aspect-square bg-muted rounded-lg overflow-hidden">
                {(isLoading || !selectedArtworkId) && (
                  <div className="absolute inset-0 flex items-center justify-center z-10 bg-muted/80">
                    {!selectedArtworkId ? (
                      <p className="text-muted-foreground">Select an artwork to preview</p>
                    ) : (
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    )}
                  </div>
                )}
                {selectedArtworkId && (
                  <model-viewer
                    key={modelKey}
                    ref={modelViewerRef}
                    src={modelUrl}
                    alt={`3D preview of ${selectedArtwork?.title || "artwork"}`}
                    ar
                    ar-modes="webxr scene-viewer quick-look"
                    ar-scale="fixed"
                    ar-placement="wall"
                    camera-controls
                    auto-rotate
                    shadow-intensity="1"
                    exposure="1"
                    environment-image="neutral"
                    style={{ width: "100%", height: "100%" }}
                    onLoad={() => setIsLoading(false)}
                    data-testid="model-viewer-admin"
                  />
                )}
              </div>

              <div className="flex gap-2 mt-4">
                <Button onClick={handleRefresh} variant="outline" data-testid="button-refresh-model">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Model
                </Button>
                <Button onClick={handleARClick} data-testid="button-launch-ar-admin">
                  <View className="w-4 h-4 mr-2" />
                  Launch AR
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mobile Testing</CardTitle>
              <CardDescription>
                Scan QR code or use the direct link on your mobile device
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col items-center space-y-4">
                  <div className="bg-white p-4 rounded-lg">
                    {selectedArtworkId ? (
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mobileUrl)}`}
                        alt="QR Code for AR preview"
                        className="w-48 h-48"
                        data-testid="img-ar-qrcode-admin"
                      />
                    ) : (
                      <div className="w-48 h-48 flex items-center justify-center bg-muted rounded">
                        <QrCode className="w-12 h-12 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    Scan with your phone camera
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Direct Link</Label>
                    <div className="flex gap-2">
                      <Input 
                        value={mobileUrl} 
                        readOnly 
                        className="text-xs"
                        data-testid="input-mobile-url"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => window.open(mobileUrl, "_blank")}
                        disabled={!selectedArtworkId}
                        data-testid="button-open-mobile-url"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>GLB Model URL</Label>
                    <div className="flex gap-2">
                      <Input 
                        value={modelUrl} 
                        readOnly 
                        className="text-xs"
                        data-testid="input-model-url"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => window.open(modelUrl, "_blank")}
                        disabled={!selectedArtworkId}
                        data-testid="button-download-glb"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Testing Instructions</h4>
                    <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                      <li>Scan QR code with your phone</li>
                      <li>Open the link in your browser</li>
                      <li>Tap "View in Your Space"</li>
                      <li>Point camera at a wall</li>
                    </ol>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Artwork Selection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Select Artwork</Label>
                <Select value={selectedArtworkId} onValueChange={setSelectedArtworkId}>
                  <SelectTrigger data-testid="select-artwork">
                    <SelectValue placeholder="Choose artwork..." />
                  </SelectTrigger>
                  <SelectContent>
                    {artworksLoading ? (
                      <SelectItem value="loading" disabled>Loading...</SelectItem>
                    ) : (
                      artworks?.filter(a => a.lowResFileUrl || a.originalFileUrl).map((artwork) => (
                        <SelectItem key={artwork.id} value={artwork.id}>
                          {artwork.title} - {artwork.artistName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedArtwork && (
                <div className="p-3 bg-muted rounded-lg space-y-2">
                  <p className="font-medium">{selectedArtwork.title}</p>
                  <p className="text-sm text-muted-foreground">{selectedArtwork.artistName}</p>
                  {selectedArtwork.lowResFileUrl && (
                    <img 
                      src={selectedArtwork.lowResFileUrl} 
                      alt={selectedArtwork.title}
                      className="w-full rounded mt-2"
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Frame Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Print Size</Label>
                <Select value={selectedSize} onValueChange={setSelectedSize}>
                  <SelectTrigger data-testid="select-size-admin">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSizes.map((size) => (
                      <SelectItem key={size} value={size}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Frame Type</Label>
                <Select value={frameType} onValueChange={(v) => setFrameType(v as FrameType)}>
                  <SelectTrigger data-testid="select-frame-type-admin">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FRAME_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex flex-col">
                          <span>{type.label}</span>
                          <span className="text-xs text-muted-foreground">{type.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Frame Style</Label>
                <Select value={frameStyle} onValueChange={(v) => setFrameStyle(v as FrameStyle)}>
                  <SelectTrigger data-testid="select-frame-admin">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FRAME_STYLES.map((style) => (
                      <SelectItem key={style.value} value={style.value}>
                        {style.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Frame Width (mm)</Label>
                <Input
                  type="number"
                  value={frameWidth}
                  onChange={(e) => setFrameWidth(parseInt(e.target.value) || 20)}
                  min={10}
                  max={100}
                  data-testid="input-frame-width"
                />
              </div>

              {!isCanvas && (
                <div className="space-y-2">
                  <Label>Mount Border (mm)</Label>
                  <div className="flex items-center gap-2 mb-2">
                    <Checkbox
                      id="no-mount"
                      checked={mountBorder === 0}
                      onCheckedChange={(checked) => setMountBorder(checked ? 0 : 50)}
                      data-testid="checkbox-no-mount"
                    />
                    <label htmlFor="no-mount" className="text-sm cursor-pointer">
                      No mount
                    </label>
                  </div>
                  <Input
                    type="number"
                    value={mountBorder}
                    onChange={(e) => setMountBorder(Math.max(0, parseInt(e.target.value) || 0))}
                    min={0}
                    max={150}
                    disabled={mountBorder === 0}
                    data-testid="input-mount-border"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Debug Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Artwork ID:</span>
                <span className="font-mono text-xs">{selectedArtworkId || "None"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Size:</span>
                <span>{selectedSize}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frame Type:</span>
                <span>{frameType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frame Style:</span>
                <span>{frameStyle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frame Width:</span>
                <span>{frameWidth}mm</span>
              </div>
              {!isCanvas && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mount:</span>
                  <span>{mountBorder}mm</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ARTextureManager />
    </div>
  );
}

interface ARTextureSlot {
  id: string;
  label: string;
  filename: string;
  category: string;
  exists: boolean;
  sizeBytes: number;
  removable: boolean;
}

function ARTextureManager() {
  const { toast } = useToast();
  const [cacheBuster, setCacheBuster] = useState(Date.now());
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  const slotsQuery = useQuery<ARTextureSlot[]>({
    queryKey: ["/api/admin/ar-textures"],
  });

  const [removingSlot, setRemovingSlot] = useState<string | null>(null);

  const handleUpload = async (slotId: string, file: File) => {
    setUploadingSlot(slotId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/admin/ar-textures/${slotId}`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
      setCacheBuster(Date.now());
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ar-textures"] });
      toast({ title: "Texture Updated", description: `Replaced texture for ${slotId}. AR cache cleared.` });
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    }
    setUploadingSlot(null);
  };

  const handleRemove = async (slotId: string, label: string) => {
    setRemovingSlot(slotId);
    try {
      const res = await fetch(`/api/admin/ar-textures/${slotId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Remove failed");
      setCacheBuster(Date.now());
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ar-textures"] });
      toast({ title: "Texture Removed", description: `${label} has been removed. AR cache cleared.` });
    } catch (err: any) {
      toast({ title: "Remove Failed", description: err.message, variant: "destructive" });
    }
    setRemovingSlot(null);
  };

  const categories = ["Standard Frame", "Box Frame", "Backing", "Branding"];

  return (
    <Card className="p-6" data-testid="ar-texture-manager">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Paintbrush className="w-5 h-5" />
          AR Viewer Textures
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setCacheBuster(Date.now());
            queryClient.invalidateQueries({ queryKey: ["/api/admin/ar-textures"] });
          }}
          data-testid="button-refresh-ar-textures"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        These textures are used by the AR frame generator for 3D GLB models. Upload a replacement to update a texture — the AR cache is cleared automatically.
      </p>

      {slotsQuery.isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {slotsQuery.data && categories.map((cat) => {
        const slots = slotsQuery.data!.filter((s) => s.category === cat);
        if (slots.length === 0) return null;
        return (
          <div key={cat} className="mb-6">
            <h3 className="text-sm font-medium mb-3">{cat}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {slots.map((slot) => (
                <div
                  key={slot.id}
                  className="border rounded-md p-3 flex flex-col gap-2"
                  data-testid={`ar-texture-slot-${slot.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{slot.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{slot.filename}</p>
                    </div>
                    {slot.exists ? (
                      <Badge variant="secondary" className="shrink-0">{(slot.sizeBytes / 1024).toFixed(0)} KB</Badge>
                    ) : (
                      <Badge variant="destructive" className="shrink-0">Missing</Badge>
                    )}
                  </div>

                  {slot.exists && (
                    <div className="w-full h-20 rounded overflow-hidden bg-muted flex items-center justify-center">
                      <img
                        src={`/api/admin/ar-textures/${slot.id}/preview?v=${cacheBuster}`}
                        alt={slot.label}
                        className="max-w-full max-h-full object-contain"
                        data-testid={`ar-texture-preview-${slot.id}`}
                      />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <label className="cursor-pointer flex-1">
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUpload(slot.id, f);
                          e.target.value = "";
                        }}
                        data-testid={`ar-texture-upload-${slot.id}`}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full pointer-events-none"
                        disabled={uploadingSlot === slot.id}
                      >
                        {uploadingSlot === slot.id ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-2" />
                        )}
                        {uploadingSlot === slot.id ? "Uploading..." : slot.exists ? "Replace" : "Upload"}
                      </Button>
                    </label>
                    {slot.removable && slot.exists && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleRemove(slot.id, slot.label)}
                        disabled={removingSlot === slot.id}
                        data-testid={`ar-texture-remove-${slot.id}`}
                      >
                        {removingSlot === slot.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </Card>
  );
}
