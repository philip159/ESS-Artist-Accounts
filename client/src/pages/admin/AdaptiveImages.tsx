import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, RefreshCw, Layers, Eye, Package, Paintbrush, Upload, X, CloudUpload, Image, Trash2, RectangleVertical, RectangleHorizontal, Check, ScanSearch, Copy, Code, FlaskConical, Maximize } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import defaultArtwork from "@assets/Victoria Benjafield_A-Ratio_Rock, Cornwall II_1763596859349.jpg";
import { FramedMockup } from "@/components/FramedMockup";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface ArtworkOption {
  id: string;
  title: string;
  artistName: string;
  originalFileUrl: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
}

interface TextureFile {
  name: string;
  url: string;
  size: number;
  contentType: string;
}

interface TextureAssignments {
  [finish: string]: string | null;
}

interface OverlayResult {
  filename: string;
  config: {
    sizeKey: string;
    ori: string;
    frame: string;
    depth: string;
    mount: string;
  };
  sizeLabel: string;
  url: string;
  widthPx: number;
  heightPx: number;
  sizeBytes: number;
}

interface SizeInfo {
  sizeKey: string;
  label: string;
  widthMm: number;
  heightMm: number;
  frameWidthMm: number;
  mountBorderMm: number;
  framePctH: number;
  framePctV: number;
  mountPctH: number;
  mountPctV: number;
}

function formatWindowMapJs(data: Record<string, any>): string {
  const lines: string[] = [];
  lines.push("// Auto-generated from assets/es-window-map.json");
  lines.push("// Loaded via <script> to avoid CORS limitations of fetching JSON from cdn.shopify.com.");
  lines.push("window.__ES_WINDOW_MAP__ = {");
  const keys = Object.keys(data);
  keys.forEach((key, idx) => {
    const entry = data[key];
    const comma = idx < keys.length - 1 ? "," : "";
    lines.push(`  "${key}": {`);
    lines.push(`    "sizeKey": "${entry.sizeKey}",`);
    lines.push(`    "orientation": "${entry.orientation}",`);
    lines.push(`    "sizeMm": ${JSON.stringify(entry.sizeMm)},`);
    lines.push(`    "canvas": ${JSON.stringify(entry.canvas)},`);
    const variantKeys = ["framed_m0", "framed_m1", "unframed"];
    variantKeys.forEach((vk, vi) => {
      if (entry[vk]) {
        const vComma = vi < variantKeys.length - 1 ? "," : "";
        lines.push(`    "${vk}": ${JSON.stringify(entry[vk])}${vComma}`);
      }
    });
    lines.push(`  }${comma}`);
  });
  lines.push("};");
  return lines.join("\n");
}

export default function AdaptiveImages() {
  const { toast } = useToast();
  const [generatedOverlays, setGeneratedOverlays] = useState<OverlayResult[]>([]);
  const [cacheBuster, setCacheBuster] = useState(Date.now());
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());
  const [selectedFrames, setSelectedFrames] = useState<Set<string>>(new Set(["black", "white", "natural", "unframed"]));
  const [selectedDepths, setSelectedDepths] = useState<Set<string>>(new Set(["std", "box"]));
  const [selectedMounts, setSelectedMounts] = useState<Set<string>>(new Set(["m0", "m1"]));

  const sizesQuery = useQuery<SizeInfo[]>({
    queryKey: ["/api/admin/frame-overlays/sizes"],
  });

  const allSizeKeys = ["6x8", "8x10", "a4", "8x12", "11x14", "a3", "12x16", "12x18", "16x20", "a2", "18x24", "20x28", "20x30", "a1", "24x32", "24x36", "28x40", "30x40", "a0", "12x12", "16x16", "20x20", "30x30"];

  const generateTestMutation = useMutation({
    mutationFn: async () => {
      const frames = Array.from(selectedFrames);
      const depths = Array.from(selectedDepths);
      const mounts = Array.from(selectedMounts);
      if (frames.length === 0) throw new Error("No frames selected");
      const hasFramed = frames.some(f => f !== "unframed");
      const effectiveDepths = hasFramed ? depths : (depths.length > 0 ? depths : ["std"]);
      const effectiveMounts = hasFramed ? mounts : (mounts.length > 0 ? mounts : ["m0"]);
      const res = await apiRequest("POST", "/api/admin/frame-overlays/generate", {
        sizes: ["8x10", "a4", "a3", "16x20", "a2", "20x28", "12x12"],
        frames,
        depths: effectiveDepths,
        mounts: effectiveMounts,
      });
      return res.json();
    },
    onSuccess: (data: { overlays: OverlayResult[] }) => {
      setGeneratedOverlays(data.overlays);
      setTexturesStale(false);
      setCacheBuster(Date.now());
      toast({
        title: "Test Batch Generated",
        description: `Created ${data.overlays.length} test overlay images.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateSelectedMutation = useMutation({
    mutationFn: async () => {
      const sizesToGenerate = Array.from(selectedSizes);
      if (sizesToGenerate.length === 0) throw new Error("No sizes selected");
      const frames = Array.from(selectedFrames);
      const depths = Array.from(selectedDepths);
      const mounts = Array.from(selectedMounts);
      if (frames.length === 0) throw new Error("No frames selected");
      const hasFramed = frames.some(f => f !== "unframed");
      const effectiveDepths = hasFramed ? depths : (depths.length > 0 ? depths : ["std"]);
      const effectiveMounts = hasFramed ? mounts : (mounts.length > 0 ? mounts : ["m0"]);
      const res = await apiRequest("POST", "/api/admin/frame-overlays/generate", {
        sizes: sizesToGenerate,
        frames,
        depths: effectiveDepths,
        mounts: effectiveMounts,
      });
      return res.json();
    },
    onSuccess: (data: { overlays: OverlayResult[] }) => {
      setGeneratedOverlays(data.overlays);
      setTexturesStale(false);
      setCacheBuster(Date.now());
      toast({
        title: "Selected Sizes Generated",
        description: `Created ${data.overlays.length} overlay images for ${selectedSizes.size} size(s).`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const frames = Array.from(selectedFrames);
      const depths = Array.from(selectedDepths);
      const mounts = Array.from(selectedMounts);
      if (frames.length === 0) throw new Error("No frames selected");
      const hasFramed = frames.some(f => f !== "unframed");
      const effectiveDepths = hasFramed ? depths : (depths.length > 0 ? depths : ["std"]);
      const effectiveMounts = hasFramed ? mounts : (mounts.length > 0 ? mounts : ["m0"]);
      const res = await apiRequest("POST", "/api/admin/frame-overlays/generate", {
        sizes: allSizeKeys,
        frames,
        depths: effectiveDepths,
        mounts: effectiveMounts,
      });
      return res.json();
    },
    onSuccess: (data: { overlays: OverlayResult[] }) => {
      setGeneratedOverlays(data.overlays);
      setTexturesStale(false);
      setCacheBuster(Date.now());
      toast({
        title: "Full Batch Generated",
        description: `Created ${data.overlays.length} overlay images.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const downloadAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/frame-overlays/download-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sizes: allSizeKeys,
          frames: ["black", "white", "natural", "unframed"],
          depths: ["std", "box"],
          mounts: ["m0", "m1"],
        }),
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "frame-overlays.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({ title: "Download Complete", description: "ZIP file with all overlays has been downloaded." });
    },
    onError: (error: Error) => {
      toast({ title: "Download Failed", description: error.message, variant: "destructive" });
    },
  });

  const [pushResults, setPushResults] = useState<Array<{ filename: string; success: boolean; error?: string }> | null>(null);

  const pushToShopifyMutation = useMutation({
    mutationFn: async () => {
      const filenames = generatedOverlays.map((o) => o.filename);
      const res = await apiRequest("POST", "/api/admin/frame-overlays/push-to-shopify", {
        filenames,
      });
      return res.json();
    },
    onSuccess: (data: { results: Array<{ filename: string; success: boolean; error?: string }>; succeeded: number; failed: number; total: number }) => {
      setPushResults(data.results);
      toast({
        title: "Shopify Push Complete",
        description: `${data.succeeded}/${data.total} files uploaded successfully.${data.failed > 0 ? ` ${data.failed} failed.` : ""}`,
        variant: data.failed > 0 ? "destructive" : "default",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Shopify Push Failed", description: error.message, variant: "destructive" });
    },
  });

  const texturesQuery = useQuery<TextureFile[]>({
    queryKey: ["/api/frame-textures"],
  });

  const assignmentsQuery = useQuery<TextureAssignments>({
    queryKey: ["/api/admin/frame-texture-assignments"],
  });

  const uploadTextureMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/frame-textures", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/frame-textures"] });
      toast({ title: "Texture Uploaded", description: "Texture file has been uploaded to object storage." });
    },
    onError: (error: Error) => {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteTextureMutation = useMutation({
    mutationFn: async (url: string) => {
      await apiRequest("DELETE", "/api/frame-textures", { url });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/frame-textures"] });
      toast({ title: "Texture Deleted" });
    },
  });

  const [texturesStale, setTexturesStale] = useState(false);
  const [textureRefreshKey, setTextureRefreshKey] = useState(0);

  const [previewImageUrl, setPreviewImageUrl] = useState<string>(defaultArtwork);
  const [previewWidthPx, setPreviewWidthPx] = useState(3000);
  const [previewHeightPx, setPreviewHeightPx] = useState(4243);
  const [previewDpi, setPreviewDpi] = useState(300);
  const [previewTitle, setPreviewTitle] = useState("Preview Artwork");
  const [previewArtist, setPreviewArtist] = useState("Test");
  const [artworkPickerOpen, setArtworkPickerOpen] = useState(false);
  const [previewOrientation, setPreviewOrientation] = useState<"portrait" | "landscape">("portrait");

  const [overlayTestFrame, setOverlayTestFrame] = useState("black");
  const [overlayTestDepth, setOverlayTestDepth] = useState("std");
  const [overlayTestMount, setOverlayTestMount] = useState("m0");
  const [overlayTestSize, setOverlayTestSize] = useState("16x20");
  const [overlayTestOri, setOverlayTestOri] = useState("p");
  const [overlayTestCacheBuster, setOverlayTestCacheBuster] = useState(Date.now());

  const artworkWindowsQuery = useQuery<Record<string, { x: number; y: number; w: number; h: number }>>({
    queryKey: ["/api/admin/frame-overlays/artwork-windows"],
  });

  const windowMappingsQuery = useQuery<Record<string, { x: number; y: number; w: number; h: number }>>({
    queryKey: ["/api/admin/frame-overlays/window-mappings"],
  });

  const artworksQuery = useQuery<ArtworkOption[]>({
    queryKey: ["/api/artworks"],
  });

  const assignTextureMutation = useMutation({
    mutationFn: async ({ finish, textureUrl }: { finish: string; textureUrl: string | null }) => {
      await apiRequest("POST", "/api/admin/frame-texture-assignments", { finish, textureUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/frame-texture-assignments"] });
      setTexturesStale(true);
      setTextureRefreshKey(k => k + 1);
      toast({ title: "Assignment Saved", description: "Re-generate overlays to apply the new texture." });
    },
    onError: (error: Error) => {
      toast({ title: "Assignment Failed", description: error.message, variant: "destructive" });
    },
  });

  const allPreviewSizes = [
    '6" x 8" (152x203mm)',
    '8" x 10" (203x254mm)',
    "A4 (210x297mm)",
    '8" x 12" (203x305mm)',
    '11" x 14" (279x356mm)',
    "A3 (297x420mm)",
    '12" x 16" (305x406mm)',
    '12" x 18" (305x457mm)',
    '16" x 20" (406x508mm)',
    "A2 (420x594mm)",
    '18" x 24" (457x610mm)',
    '20" x 28" (508x711mm)',
    '20" x 30" (508x762mm)',
    "A1 (594x841mm)",
    '24" x 32" (610x813mm)',
    '24" x 36" (610x914mm)',
    '28" x 40" (711x1016mm)',
    '30" x 40" (762x1016mm)',
    "A0 (841x1189mm)",
    '12" x 12" (305x305mm)',
    '16" x 16" (406x406mm)',
    '20" x 20" (508x508mm)',
    '30" x 30" (762x762mm)',
  ];

  const effectivePreviewWidth = previewOrientation === "landscape" ? Math.max(previewWidthPx, previewHeightPx) : Math.min(previewWidthPx, previewHeightPx);
  const effectivePreviewHeight = previewOrientation === "landscape" ? Math.min(previewWidthPx, previewHeightPx) : Math.max(previewWidthPx, previewHeightPx);

  const STD_FINISHES = [
    { key: "black", label: "Black", fallbackColor: "#1a1a1a" },
    { key: "white", label: "White", fallbackColor: "#f5f5f0" },
    { key: "natural", label: "Natural", fallbackColor: "#8B7355" },
  ];

  const BOX_FINISHES = [
    { key: "box_black", label: "Black", fallbackColor: "#1a1a1a" },
    { key: "box_white", label: "White", fallbackColor: "#f5f5f0" },
    { key: "box_natural", label: "Natural", fallbackColor: "#8B7355" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">
          Adaptive Product Images
        </h1>
        <p className="text-muted-foreground mt-1">
          Generate combined WebP overlays (frame + mount + shadow) for fast CSS-based product previews on Shopify.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Paintbrush className="w-5 h-5" />
                Frame Texture Assignments
              </h2>
              <label>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadTextureMutation.mutate(file);
                    e.target.value = "";
                  }}
                  data-testid="input-upload-texture"
                />
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  data-testid="button-upload-texture"
                >
                  <span>
                    {uploadTextureMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    Upload Texture
                  </span>
                </Button>
              </label>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Assign a texture image to each frame finish. If no texture is assigned, a solid colour is used as fallback.
            </p>

            {texturesQuery.isLoading || assignmentsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading textures...
              </div>
            ) : (
              <div className="space-y-4">
                {(texturesQuery.data?.length ?? 0) > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Uploaded Textures</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {texturesQuery.data?.filter(t => !t.name.startsWith("_")).map((tex) => (
                        <div
                          key={tex.url}
                          className="relative rounded-md border overflow-hidden group"
                          data-testid={`texture-${tex.name}`}
                        >
                          <img
                            src={tex.url}
                            alt={tex.name}
                            className="w-full h-20 object-cover"
                          />
                          <div className="px-2 py-1 text-xs truncate bg-muted/80">{tex.name}</div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="absolute top-1 right-1 bg-background/80"
                            onClick={() => deleteTextureMutation.mutate(tex.url)}
                            data-testid={`button-delete-texture-${tex.name}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Standard Frame Finishes</h3>
                  {STD_FINISHES.map((finish) => {
                    const currentUrl = assignmentsQuery.data?.[finish.key] || null;
                    const customColor = assignmentsQuery.data?.[`${finish.key}_color`] || finish.fallbackColor;
                    const textures = texturesQuery.data?.filter(t => !t.name.startsWith("_")) || [];
                    return (
                      <div key={finish.key} className="flex items-center gap-3" data-testid={`assignment-${finish.key}`}>
                        <input
                          type="color"
                          value={typeof customColor === "string" ? customColor : finish.fallbackColor}
                          onChange={(e) => {
                            assignTextureMutation.mutate({
                              finish: `${finish.key}_color`,
                              textureUrl: e.target.value,
                            });
                          }}
                          className="w-8 h-8 rounded-md border cursor-pointer p-0 flex-shrink-0"
                          title={`Solid colour for ${finish.label}`}
                          data-testid={`color-picker-${finish.key}`}
                        />
                        <span className="text-sm font-medium w-16">{finish.label}</span>
                        <Select
                          value={currentUrl || "__solid__"}
                          onValueChange={(val) => {
                            assignTextureMutation.mutate({
                              finish: finish.key,
                              textureUrl: val === "__solid__" ? null : val,
                            });
                          }}
                        >
                          <SelectTrigger className="flex-1" data-testid={`select-texture-${finish.key}`}>
                            <SelectValue placeholder="Select texture..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__solid__">Solid colour ({typeof customColor === "string" ? customColor : finish.fallbackColor})</SelectItem>
                            {textures.map((tex) => (
                              <SelectItem key={tex.url} value={tex.url}>
                                {tex.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {currentUrl && (
                          <img
                            src={currentUrl}
                            alt={`${finish.label} texture`}
                            className="w-8 h-8 rounded-md border object-cover flex-shrink-0"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Box Frame Finishes</h3>
                  {BOX_FINISHES.map((finish) => {
                    const currentUrl = assignmentsQuery.data?.[finish.key] || null;
                    const customColor = assignmentsQuery.data?.[`${finish.key}_color`] || finish.fallbackColor;
                    const textures = texturesQuery.data?.filter(t => !t.name.startsWith("_")) || [];
                    return (
                      <div key={finish.key} className="flex items-center gap-3" data-testid={`assignment-${finish.key}`}>
                        <input
                          type="color"
                          value={typeof customColor === "string" ? customColor : finish.fallbackColor}
                          onChange={(e) => {
                            assignTextureMutation.mutate({
                              finish: `${finish.key}_color`,
                              textureUrl: e.target.value,
                            });
                          }}
                          className="w-8 h-8 rounded-md border cursor-pointer p-0 flex-shrink-0"
                          title={`Solid colour for ${finish.label}`}
                          data-testid={`color-picker-${finish.key}`}
                        />
                        <span className="text-sm font-medium w-16">{finish.label}</span>
                        <Select
                          value={currentUrl || "__solid__"}
                          onValueChange={(val) => {
                            assignTextureMutation.mutate({
                              finish: finish.key,
                              textureUrl: val === "__solid__" ? null : val,
                            });
                          }}
                        >
                          <SelectTrigger className="flex-1" data-testid={`select-texture-${finish.key}`}>
                            <SelectValue placeholder="Select texture..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__solid__">Solid colour ({typeof customColor === "string" ? customColor : finish.fallbackColor})</SelectItem>
                            {textures.map((tex) => (
                              <SelectItem key={tex.url} value={tex.url}>
                                {tex.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {currentUrl && (
                          <img
                            src={currentUrl}
                            alt={`${finish.label} texture`}
                            className="w-8 h-8 rounded-md border object-cover flex-shrink-0"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-6">
            {texturesStale && generatedOverlays.length > 0 && (
              <div className="mb-3 p-3 rounded-md bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 text-sm text-yellow-800 dark:text-yellow-200" data-testid="banner-textures-stale">
                Texture assignments changed. Run a batch to apply the new textures.
              </div>
            )}
            <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Layers className="w-5 h-5" />
                Overlay Generator
              </h2>
              {(() => {
                const hasFramed = Array.from(selectedFrames).some(f => f !== "unframed");
                const hasUnframed = selectedFrames.has("unframed");
                const framedCount = hasFramed ? (selectedFrames.size - (hasUnframed ? 1 : 0)) : 0;
                const framedVariants = framedCount * selectedDepths.size * selectedMounts.size * 2;
                const unframedVariants = hasUnframed ? 2 : 0;
                const variantCount = framedVariants + unframedVariants;
                const isAnyPending = generateTestMutation.isPending || generateSelectedMutation.isPending || generateMutation.isPending;
                return (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      onClick={() => generateTestMutation.mutate()}
                      disabled={selectedFrames.size === 0 || isAnyPending}
                      data-testid="button-generate-test"
                    >
                      {generateTestMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      {generateTestMutation.isPending ? "Generating..." : `Test (${7 * variantCount})`}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => generateSelectedMutation.mutate()}
                      disabled={selectedSizes.size === 0 || selectedFrames.size === 0 || isAnyPending}
                      data-testid="button-generate-selected"
                    >
                      {generateSelectedMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      {generateSelectedMutation.isPending ? "Generating..." : `Selected (${selectedSizes.size * variantCount})`}
                    </Button>
                    <Button
                      onClick={() => generateMutation.mutate()}
                      disabled={selectedFrames.size === 0 || isAnyPending}
                      data-testid="button-generate-overlays"
                    >
                      {generateMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      {generateMutation.isPending ? "Generating..." : `Full Batch (${allSizeKeys.length * variantCount})`}
                    </Button>
                  </div>
                );
              })()}
            </div>

            <div className="space-y-2 mb-4">
              <p className="text-sm text-muted-foreground">
                Each size generates both portrait + landscape orientations for the selected frame, depth, and mount variants.
              </p>
              <p className="text-sm text-muted-foreground">
                Naming: <code className="bg-muted px-1 rounded text-xs">overlay_&#123;size&#125;_&#123;ori&#125;_&#123;frame&#125;_&#123;depth&#125;_&#123;mount&#125;.webp</code> | Format: Lossless WebP with alpha.
              </p>
            </div>

            <div className="space-y-3 mb-4">
              <h3 className="text-sm font-medium">Filter Variants</h3>
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Frames</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {(["black", "white", "natural", "unframed"] as const).map((f) => {
                      const active = selectedFrames.has(f);
                      return (
                        <Button
                          key={f}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedFrames((prev) => {
                              const next = new Set(prev);
                              if (next.has(f)) next.delete(f);
                              else next.add(f);
                              return next;
                            });
                          }}
                          className={`toggle-elevate ${active ? "toggle-elevated" : ""}`}
                          data-testid={`filter-frame-${f}`}
                        >
                          {f.charAt(0).toUpperCase() + f.slice(1)}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Depths</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {(["std", "box"] as const).map((d) => {
                      const active = selectedDepths.has(d);
                      return (
                        <Button
                          key={d}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedDepths((prev) => {
                              const next = new Set(prev);
                              if (next.has(d)) next.delete(d);
                              else next.add(d);
                              return next;
                            });
                          }}
                          className={`toggle-elevate ${active ? "toggle-elevated" : ""}`}
                          data-testid={`filter-depth-${d}`}
                        >
                          {d === "std" ? "Standard" : "Box"}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Mounts</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {(["m0", "m1"] as const).map((m) => {
                      const active = selectedMounts.has(m);
                      return (
                        <Button
                          key={m}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedMounts((prev) => {
                              const next = new Set(prev);
                              if (next.has(m)) next.delete(m);
                              else next.add(m);
                              return next;
                            });
                          }}
                          className={`toggle-elevate ${active ? "toggle-elevated" : ""}`}
                          data-testid={`filter-mount-${m}`}
                        >
                          {m === "m0" ? "No Mount" : "Mount"}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {sizesQuery.data && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-medium">Select Sizes</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedSizes(new Set(sizesQuery.data?.map(s => s.sizeKey) || allSizeKeys))}
                      data-testid="button-select-all-sizes"
                    >
                      Select All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedSizes(new Set())}
                      data-testid="button-deselect-all-sizes"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {sizesQuery.data.map((size) => {
                    const isSelected = selectedSizes.has(size.sizeKey);
                    return (
                      <Button
                        key={size.sizeKey}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedSizes((prev) => {
                            const next = new Set(prev);
                            if (next.has(size.sizeKey)) next.delete(size.sizeKey);
                            else next.add(size.sizeKey);
                            return next;
                          });
                        }}
                        className={`justify-start toggle-elevate ${isSelected ? "toggle-elevated" : ""}`}
                        data-testid={`size-toggle-${size.sizeKey}`}
                      >
                        <div className={`w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 ${
                          isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <span className="font-medium">{size.sizeKey.toUpperCase()}</span>
                        <span className="text-xs text-muted-foreground">{size.widthMm}x{size.heightMm}mm</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          {generatedOverlays.length > 0 && (
            <Card className="p-6">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  Generated Overlays ({generatedOverlays.length})
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    onClick={() => downloadAllMutation.mutate()}
                    disabled={downloadAllMutation.isPending}
                    variant="outline"
                    data-testid="button-download-all-zip"
                  >
                    {downloadAllMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Package className="w-4 h-4 mr-2" />
                    )}
                    {downloadAllMutation.isPending ? "Generating ZIP..." : "Download ZIP"}
                  </Button>
                  <Button
                    onClick={() => pushToShopifyMutation.mutate()}
                    disabled={pushToShopifyMutation.isPending}
                    data-testid="button-push-to-shopify"
                  >
                    {pushToShopifyMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CloudUpload className="w-4 h-4 mr-2" />
                    )}
                    {pushToShopifyMutation.isPending ? "Pushing to Shopify..." : "Push to Shopify Files"}
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Review the overlays below, then push them directly to your Shopify Files.
              </p>

              {pushResults && (
                <div className="mb-4 p-3 rounded-md bg-muted/50 space-y-1">
                  <h3 className="text-sm font-medium">
                    Shopify Push Results: {pushResults.filter(r => r.success).length}/{pushResults.length} succeeded
                  </h3>
                  {pushResults.filter(r => !r.success).map((r) => (
                    <p key={r.filename} className="text-xs text-destructive">
                      {r.filename}: {r.error}
                    </p>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                {Array.from(new Set(generatedOverlays.map((o) => o.config.sizeKey))).map((sizeKey) => {
                  const sizeOverlays = generatedOverlays.filter((o) => o.config.sizeKey === sizeKey);

                  return (
                    <div key={sizeKey} className="space-y-2">
                      <h3 className="text-sm font-medium">{sizeKey.toUpperCase()}</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {sizeOverlays.map((overlay) => (
                          <a
                            key={overlay.filename}
                            href={overlay.url}
                            download={overlay.filename}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-col items-center gap-1 p-2 rounded-md bg-muted/50 hover-elevate cursor-pointer"
                            data-testid={`overlay-${overlay.filename}`}
                          >
                            <div
                              className="w-full aspect-[3/4] rounded border relative overflow-hidden"
                              style={{ background: "repeating-conic-gradient(#e5e5e5 0% 25%, white 0% 50%) 50% / 16px 16px" }}
                            >
                              <img
                                src={`${overlay.url}?v=${cacheBuster}`}
                                alt={overlay.filename}
                                className="absolute inset-0 w-full h-full object-contain"
                              />
                            </div>
                            <span className="text-xs text-muted-foreground truncate w-full text-center">
                              {overlay.config.frame} / {overlay.config.depth} / {overlay.config.mount}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {overlay.widthPx}x{overlay.heightPx} &middot; {(overlay.sizeBytes / 1024).toFixed(0)}KB
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Live Preview
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 border rounded-md p-0.5" data-testid="orientation-toggle">
                  <Button
                    variant={previewOrientation === "portrait" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setPreviewOrientation("portrait")}
                    data-testid="button-orientation-portrait"
                  >
                    <RectangleVertical className="w-4 h-4 mr-1" />
                    Portrait
                  </Button>
                  <Button
                    variant={previewOrientation === "landscape" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setPreviewOrientation("landscape")}
                    data-testid="button-orientation-landscape"
                  >
                    <RectangleHorizontal className="w-4 h-4 mr-1" />
                    Landscape
                  </Button>
                </div>
                <Dialog open={artworkPickerOpen} onOpenChange={setArtworkPickerOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-change-preview-image">
                      <Image className="w-4 h-4 mr-2" />
                      Change Image
                    </Button>
                  </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Choose Preview Artwork</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div
                      className="flex items-center gap-3 p-2 rounded-md cursor-pointer hover-elevate border"
                      onClick={() => {
                        setPreviewImageUrl(defaultArtwork);
                        setPreviewWidthPx(3000);
                        setPreviewHeightPx(4243);
                        setPreviewDpi(300);
                        setPreviewTitle("Preview Artwork");
                        setPreviewArtist("Test");
                        setArtworkPickerOpen(false);
                      }}
                      data-testid="artwork-option-default"
                    >
                      <img src={defaultArtwork} alt="Default" className="w-12 h-16 object-cover rounded-md" />
                      <div>
                        <div className="text-sm font-medium">Default Preview</div>
                        <div className="text-xs text-muted-foreground">Built-in test artwork</div>
                      </div>
                    </div>
                    {artworksQuery.isLoading && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading artworks...
                      </div>
                    )}
                    {artworksQuery.data?.map((art) => (
                      <div
                        key={art.id}
                        className="flex items-center gap-3 p-2 rounded-md cursor-pointer hover-elevate border"
                        onClick={() => {
                          setPreviewImageUrl(art.originalFileUrl);
                          setPreviewWidthPx(art.widthPx);
                          setPreviewHeightPx(art.heightPx);
                          setPreviewDpi(art.dpi);
                          setPreviewTitle(art.title);
                          setPreviewArtist(art.artistName);
                          setArtworkPickerOpen(false);
                        }}
                        data-testid={`artwork-option-${art.id}`}
                      >
                        <img src={art.originalFileUrl} alt={art.title} className="w-12 h-16 object-cover rounded-md" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{art.title}</div>
                          <div className="text-xs text-muted-foreground truncate">{art.artistName} &middot; {art.widthPx}x{art.heightPx}px &middot; {art.dpi}dpi</div>
                        </div>
                      </div>
                    ))}
                    {artworksQuery.data?.length === 0 && (
                      <p className="text-sm text-muted-foreground py-4 text-center">No artworks found. Submit some artwork first.</p>
                    )}
                  </div>
                </DialogContent>
                </Dialog>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Preview how the frame will look on your Shopify product page with different frame colours and mount options.
            </p>

            <div data-testid="preview-container">
              <FramedMockup
                imageUrl={previewImageUrl}
                title={previewTitle}
                artistName={previewArtist}
                availableSizes={allPreviewSizes}
                widthPx={effectivePreviewWidth}
                heightPx={effectivePreviewHeight}
                dpi={previewDpi}
                textureRefreshKey={textureRefreshKey}
              />
            </div>
          </Card>

        </div>
      </div>

      <QualityTestPanel />
      <CanvasSizeTestPanel />

      <Card className="p-6" data-testid="overlay-mapping-preview">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ScanSearch className="w-5 h-5" />
            Overlay Mapping Preview
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setOverlayTestCacheBuster(Date.now());
              queryClient.invalidateQueries({ queryKey: ["/api/admin/frame-overlays/artwork-windows"] });
            }}
            data-testid="button-refresh-overlay-preview"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Verify that the generated overlay images align correctly with artwork using the stored mapping coordinates.
          The artwork image is positioned using the fractional coordinates from artwork-windows.json, then the overlay is layered on top.
        </p>

        <div className="flex flex-wrap gap-3 mb-6">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Size</label>
            <Select value={overlayTestSize} onValueChange={setOverlayTestSize}>
              <SelectTrigger className="w-[120px]" data-testid="select-overlay-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allSizeKeys.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Orientation</label>
            <Select value={overlayTestOri} onValueChange={setOverlayTestOri}>
              <SelectTrigger className="w-[120px]" data-testid="select-overlay-ori">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="p">Portrait</SelectItem>
                <SelectItem value="l">Landscape</SelectItem>
                <SelectItem value="s">Square</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Frame</label>
            <Select value={overlayTestFrame} onValueChange={setOverlayTestFrame}>
              <SelectTrigger className="w-[120px]" data-testid="select-overlay-frame">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="black">Black</SelectItem>
                <SelectItem value="white">White</SelectItem>
                <SelectItem value="natural">Natural</SelectItem>
                <SelectItem value="unframed">Unframed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Depth</label>
            <Select value={overlayTestDepth} onValueChange={setOverlayTestDepth}>
              <SelectTrigger className="w-[100px]" data-testid="select-overlay-depth">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="std">Standard</SelectItem>
                <SelectItem value="box">Box</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Mount</label>
            <Select value={overlayTestMount} onValueChange={setOverlayTestMount}>
              <SelectTrigger className="w-[100px]" data-testid="select-overlay-mount">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="m0">No Mount</SelectItem>
                <SelectItem value="m1">Mounted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {(() => {
          const overlayFilename = `overlay_${overlayTestSize}_${overlayTestOri}_${overlayTestFrame}_${overlayTestDepth}_${overlayTestMount}`;
          const overlayKey = overlayFilename;
          const windowData = artworkWindowsQuery.data?.[overlayKey];
          const overlayUrl = `/api/admin/frame-overlays/preview/${overlayFilename}.webp?cb=${overlayTestCacheBuster}`;

          const CANVAS_W = 1500;
          const CANVAS_H = 2000;

          const windowPx = windowData ? {
            x: Math.round(windowData.x * CANVAS_W),
            y: Math.round(windowData.y * CANVAS_H),
            w: Math.round(windowData.w * CANVAS_W),
            h: Math.round(windowData.h * CANVAS_H),
          } : null;

          return (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Overlay key: </span>
                  <code className="bg-muted px-1 py-0.5 rounded text-xs" data-testid="text-overlay-key">{overlayKey}</code>
                </div>
                {windowData && (
                  <div data-testid="text-window-fractions">
                    <span className="text-muted-foreground">Window (fractions): </span>
                    <code className="bg-muted px-1 py-0.5 rounded text-xs">
                      x:{windowData.x} y:{windowData.y} w:{windowData.w} h:{windowData.h}
                    </code>
                  </div>
                )}
                {windowPx && (
                  <div data-testid="text-window-pixels">
                    <span className="text-muted-foreground">Window (px): </span>
                    <code className="bg-muted px-1 py-0.5 rounded text-xs">
                      x:{windowPx.x} y:{windowPx.y} w:{windowPx.w} h:{windowPx.h}
                    </code>
                  </div>
                )}
              </div>

              {!windowData && (
                <div className="text-sm text-muted-foreground p-4 border rounded-md text-center" data-testid="text-no-mapping">
                  No mapping found for this combination. Generate overlays first, or check that artwork-windows.json exists.
                </div>
              )}

              {windowData && windowPx && (
                <div className="flex justify-center">
                  <div
                    className="relative bg-muted/30 border rounded-md overflow-hidden"
                    style={{ width: "100%", maxWidth: 500, aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
                    data-testid="overlay-mapping-canvas"
                  >
                    <img
                      src={previewImageUrl}
                      alt="Artwork"
                      style={{
                        position: "absolute",
                        left: `${(windowPx.x / CANVAS_W) * 100}%`,
                        top: `${(windowPx.y / CANVAS_H) * 100}%`,
                        width: `${(windowPx.w / CANVAS_W) * 100}%`,
                        height: `${(windowPx.h / CANVAS_H) * 100}%`,
                        objectFit: "cover",
                      }}
                      data-testid="img-artwork-layer"
                    />
                    <img
                      src={overlayUrl}
                      alt="Overlay"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                      }}
                      data-testid="img-overlay-layer"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-mappings-title">
            <Code className="w-5 h-5" />
            Artwork Window Mappings
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                windowMappingsQuery.refetch();
              }}
              data-testid="button-refresh-mappings"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const data = windowMappingsQuery.data || {};
                navigator.clipboard.writeText(formatWindowMapJs(data) + "\n");
                toast({ title: "Copied", description: "Window map JS snippet copied to clipboard." });
              }}
              disabled={!windowMappingsQuery.data}
              data-testid="button-copy-mappings"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy JS Snippet
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Pixel coordinates for positioning artwork behind each overlay on a 1500x2000 canvas. Copy as a JS snippet for Shopify CDN hosting.
        </p>
        {windowMappingsQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="relative">
            <Badge className="absolute top-2 right-2 no-default-hover-elevate no-default-active-elevate">
              {Object.keys(windowMappingsQuery.data || {}).length} sizes
            </Badge>
            <pre
              className="bg-muted/50 rounded-md p-4 text-xs font-mono overflow-auto max-h-[600px] whitespace-pre"
              data-testid="text-mappings-json"
            >
              {formatWindowMapJs(windowMappingsQuery.data || {})}
            </pre>
          </div>
        )}
      </Card>
    </div>
  );
}

interface QualityResult {
  index: number;
  label: string;
  quality: number;
  lossless: boolean;
  effort: number;
  alphaQuality: number;
  sizeBytes: number;
  sizeKB: number;
}

function QualityTestPanel() {
  const { toast } = useToast();
  const [testFrame, setTestFrame] = useState("black");
  const [testDepth, setTestDepth] = useState("box");
  const [testMount, setTestMount] = useState("m1");
  const [testSize, setTestSize] = useState("16x20");
  const [results, setResults] = useState<QualityResult[]>([]);
  const [cacheBuster, setCacheBuster] = useState(0);

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/frame-overlays/quality-test", {
        sizeKey: testSize,
        frame: testFrame,
        depth: testDepth,
        mount: testMount,
      });
      return res.json();
    },
    onSuccess: (data: { results: QualityResult[] }) => {
      setResults(data.results);
      setCacheBuster(Date.now());
      toast({ title: "Quality Test Complete", description: `Generated ${data.results.length} quality variants for comparison.` });
    },
    onError: (error: Error) => {
      toast({ title: "Quality Test Failed", description: error.message, variant: "destructive" });
    },
  });

  const baselineSize = results.length > 0 ? results[0].sizeKB : 0;

  return (
    <Card className="p-6" data-testid="quality-test-panel">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FlaskConical className="w-5 h-5" />
          Quality Comparison Test
        </h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Generate the same overlay at different WebP quality levels to compare file size vs visual quality. All images are 1500x2000px.
      </p>

      <div className="flex items-end gap-3 flex-wrap mb-6">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Size</label>
          <Select value={testSize} onValueChange={setTestSize}>
            <SelectTrigger className="w-24" data-testid="select-quality-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6x8">6x8</SelectItem>
              <SelectItem value="a4">A4</SelectItem>
              <SelectItem value="a3">A3</SelectItem>
              <SelectItem value="16x20">16x20</SelectItem>
              <SelectItem value="a2">A2</SelectItem>
              <SelectItem value="28x40">28x40</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Frame</label>
          <Select value={testFrame} onValueChange={setTestFrame}>
            <SelectTrigger className="w-28" data-testid="select-quality-frame">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="black">Black</SelectItem>
              <SelectItem value="white">White</SelectItem>
              <SelectItem value="natural">Natural</SelectItem>
              <SelectItem value="unframed">Unframed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Depth</label>
          <Select value={testDepth} onValueChange={setTestDepth}>
            <SelectTrigger className="w-28" data-testid="select-quality-depth">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="std">Standard</SelectItem>
              <SelectItem value="box">Box</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Mount</label>
          <Select value={testMount} onValueChange={setTestMount}>
            <SelectTrigger className="w-28" data-testid="select-quality-mount">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="m0">No Mount</SelectItem>
              <SelectItem value="m1">Mount</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending}
          data-testid="button-run-quality-test"
        >
          {testMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <FlaskConical className="w-4 h-4 mr-2" />
          )}
          {testMutation.isPending ? "Generating..." : "Run Test"}
        </Button>
      </div>

      {results.length > 0 && (
        <>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4">Setting</th>
                  <th className="text-right py-2 px-4">File Size</th>
                  <th className="text-right py-2 px-4">vs Current</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.index} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium" data-testid={`text-quality-label-${r.index}`}>{r.label}</td>
                    <td className="text-right py-2 px-4" data-testid={`text-quality-size-${r.index}`}>
                      <Badge variant="secondary">{r.sizeKB} KB</Badge>
                    </td>
                    <td className="text-right py-2 px-4 text-muted-foreground">
                      {r.index === 0 ? "baseline" : (
                        <span className={r.sizeKB > baselineSize ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}>
                          {r.sizeKB > baselineSize ? "+" : ""}{((r.sizeKB - baselineSize) / baselineSize * 100).toFixed(0)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end mb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                results.forEach((r) => {
                  const a = document.createElement("a");
                  a.href = `/api/admin/frame-overlays/quality-test/${r.index}?v=${cacheBuster}`;
                  a.download = `quality_${r.label.replace(/[^a-zA-Z0-9]/g, "_")}.webp`;
                  a.click();
                });
              }}
              data-testid="button-download-all-quality"
            >
              <Download className="w-4 h-4 mr-2" />
              Download All
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {results.map((r) => (
              <div key={r.index} className="space-y-1" data-testid={`quality-preview-${r.index}`}>
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <div className="text-xs font-medium">{r.label}</div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = `/api/admin/frame-overlays/quality-test/${r.index}?v=${cacheBuster}`;
                      a.download = `quality_${r.label.replace(/[^a-zA-Z0-9]/g, "_")}.webp`;
                      a.click();
                    }}
                    data-testid={`button-download-quality-${r.index}`}
                  >
                    <Download className="w-3 h-3" />
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">{r.sizeKB} KB</div>
                <div className="border rounded-md overflow-hidden bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] dark:bg-[repeating-conic-gradient(#374151_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                  <img
                    src={`/api/admin/frame-overlays/quality-test/${r.index}?v=${cacheBuster}`}
                    alt={r.label}
                    className="w-full h-auto"
                    data-testid={`img-quality-${r.index}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

interface CanvasSizeResult {
  index: number;
  label: string;
  canvasWidth: number;
  canvasHeight: number;
  frameWidthPx: number;
  sizeBytes: number;
  sizeKB: number;
}

function CanvasSizeTestPanel() {
  const { toast } = useToast();
  const [testFrame, setTestFrame] = useState("black");
  const [testDepth, setTestDepth] = useState("box");
  const [testMount, setTestMount] = useState("m1");
  const [testSize, setTestSize] = useState("16x20");
  const [results, setResults] = useState<CanvasSizeResult[]>([]);
  const [cacheBuster, setCacheBuster] = useState(0);

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/frame-overlays/canvas-size-test", {
        sizeKey: testSize,
        frame: testFrame,
        depth: testDepth,
        mount: testMount,
      });
      return res.json();
    },
    onSuccess: (data: { results: CanvasSizeResult[] }) => {
      setResults(data.results);
      setCacheBuster(Date.now());
      toast({ title: "Canvas Size Test Complete", description: `Generated ${data.results.length} canvas size variants for comparison.` });
    },
    onError: (error: Error) => {
      toast({ title: "Canvas Size Test Failed", description: error.message, variant: "destructive" });
    },
  });

  const baselineIdx = results.findIndex(r => r.label.includes("current"));
  const baselineSize = baselineIdx >= 0 ? results[baselineIdx].sizeKB : results[0]?.sizeKB || 0;

  return (
    <Card className="p-6" data-testid="canvas-size-test-panel">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Maximize className="w-5 h-5" />
          Canvas Size Comparison Test
        </h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Generate the same overlay at different canvas resolutions (all 3:4 portrait) to compare texture detail vs file size. Larger canvases produce wider frame strips with more visible grain.
      </p>

      <div className="flex items-end gap-3 flex-wrap mb-6">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Size</label>
          <Select value={testSize} onValueChange={setTestSize}>
            <SelectTrigger className="w-24" data-testid="select-canvas-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6x8">6x8</SelectItem>
              <SelectItem value="a4">A4</SelectItem>
              <SelectItem value="a3">A3</SelectItem>
              <SelectItem value="16x20">16x20</SelectItem>
              <SelectItem value="a2">A2</SelectItem>
              <SelectItem value="28x40">28x40</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Frame</label>
          <Select value={testFrame} onValueChange={setTestFrame}>
            <SelectTrigger className="w-28" data-testid="select-canvas-frame">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="black">Black</SelectItem>
              <SelectItem value="white">White</SelectItem>
              <SelectItem value="natural">Natural</SelectItem>
              <SelectItem value="unframed">Unframed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Depth</label>
          <Select value={testDepth} onValueChange={setTestDepth}>
            <SelectTrigger className="w-28" data-testid="select-canvas-depth">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="std">Standard</SelectItem>
              <SelectItem value="box">Box</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Mount</label>
          <Select value={testMount} onValueChange={setTestMount}>
            <SelectTrigger className="w-28" data-testid="select-canvas-mount">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="m0">No Mount</SelectItem>
              <SelectItem value="m1">Mount</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending}
          data-testid="button-run-canvas-size-test"
        >
          {testMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Maximize className="w-4 h-4 mr-2" />
          )}
          {testMutation.isPending ? "Generating..." : "Run Test"}
        </Button>
      </div>

      {results.length > 0 && (
        <>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4">Canvas Size</th>
                  <th className="text-right py-2 px-4">Frame Width</th>
                  <th className="text-right py-2 px-4">File Size</th>
                  <th className="text-right py-2 px-4">vs Current</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.index} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium" data-testid={`text-canvas-label-${r.index}`}>{r.label}</td>
                    <td className="text-right py-2 px-4" data-testid={`text-canvas-frame-width-${r.index}`}>
                      <Badge variant="secondary">{r.frameWidthPx}px</Badge>
                    </td>
                    <td className="text-right py-2 px-4" data-testid={`text-canvas-file-size-${r.index}`}>
                      <Badge variant="secondary">{r.sizeKB} KB</Badge>
                    </td>
                    <td className="text-right py-2 px-4 text-muted-foreground">
                      {r.label.includes("current") ? "baseline" : (
                        <span className={r.sizeKB > baselineSize ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}>
                          {r.sizeKB > baselineSize ? "+" : ""}{((r.sizeKB - baselineSize) / baselineSize * 100).toFixed(0)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end mb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                results.forEach((r) => {
                  const a = document.createElement("a");
                  a.href = `/api/admin/frame-overlays/canvas-size-test/${r.index}?v=${cacheBuster}`;
                  a.download = `canvas_${r.canvasWidth}x${r.canvasHeight}.webp`;
                  a.click();
                });
              }}
              data-testid="button-download-all-canvas"
            >
              <Download className="w-4 h-4 mr-2" />
              Download All
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {results.map((r) => (
              <div key={r.index} className="space-y-1" data-testid={`canvas-preview-${r.index}`}>
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <div className="text-xs font-medium">{r.label}</div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = `/api/admin/frame-overlays/canvas-size-test/${r.index}?v=${cacheBuster}`;
                      a.download = `canvas_${r.canvasWidth}x${r.canvasHeight}.webp`;
                      a.click();
                    }}
                    data-testid={`button-download-canvas-${r.index}`}
                  >
                    <Download className="w-3 h-3" />
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">{r.sizeKB} KB / frame {r.frameWidthPx}px</div>
                <div className="border rounded-md overflow-hidden bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] dark:bg-[repeating-conic-gradient(#374151_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                  <img
                    src={`/api/admin/frame-overlays/canvas-size-test/${r.index}?v=${cacheBuster}`}
                    alt={r.label}
                    className="w-full h-auto"
                    data-testid={`img-canvas-${r.index}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
