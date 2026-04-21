import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play, Download, RefreshCw } from "lucide-react";

interface VariantDescription {
  name: string;
  description: string;
}

interface VariantResult {
  variant: number;
  base64: string;
  sizeBytes: number;
  description: VariantDescription;
}

const ARTWORK_OPTIONS = [
  { id: "9653718a-5d4d-49ab-aea6-968a6e954752", label: "Laureneely Mahjong Carver Portrait 1/2 - Philip Jobling (5:7)" },
  { id: "f0ee22c6-0527-4f2d-937d-4ca3b571f209", label: "Rick Crane Nature Study Entomology Square - Philip Jobling (1:1)" },
];

export default function ScanVideoVariants() {
  const [artworkId, setArtworkId] = useState(ARTWORK_OPTIONS[0].id);
  const [results, setResults] = useState<Map<string, VariantResult>>(new Map());
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  const resultKey = (v: number) => `${artworkId}:${v}`;

  const { data: descriptions } = useQuery<Record<string, VariantDescription>>({
    queryKey: ["/api/admin/scan-video-variants"],
  });

  const generateVariant = useMutation({
    mutationFn: async (variant: number) => {
      const res = await apiRequest(
        "POST",
        `/api/admin/artworks/${artworkId}/generate-scan-video-variant`,
        { variant },
      );
      return res.json();
    },
    onMutate: (variant) => {
      setGenerating((prev) => new Set(prev).add(resultKey(variant)));
    },
    onSuccess: (data, variant) => {
      setResults((prev) => {
        const next = new Map(prev);
        next.set(resultKey(variant), data);
        return next;
      });
      setGenerating((prev) => {
        const next = new Set(prev);
        next.delete(resultKey(variant));
        return next;
      });
    },
    onError: (_error, variant) => {
      setGenerating((prev) => {
        const next = new Set(prev);
        next.delete(resultKey(variant));
        return next;
      });
    },
  });

  const handleGenerateAll = async () => {
    for (let i = 1; i <= 5; i++) {
      const key = resultKey(i);
      if (!generating.has(key) && !results.has(key)) {
        setGenerating((prev) => new Set(prev).add(key));
        try {
          const res = await apiRequest(
            "POST",
            `/api/admin/artworks/${artworkId}/generate-scan-video-variant`,
            { variant: i },
          );
          const data = await res.json();
          setResults((prev) => {
            const next = new Map(prev);
            next.set(key, data);
            return next;
          });
        } catch {
        } finally {
          setGenerating((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      }
    }
  };

  const handleDownload = (variant: number) => {
    const result = results.get(resultKey(variant));
    if (!result) return;
    const byteChars = atob(result.base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scan-video-variant-${variant}.mp4`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentArtwork = ARTWORK_OPTIONS.find(a => a.id === artworkId);
  const generatingCount = Array.from(generating).filter(k => k.startsWith(artworkId)).length;
  const variants = [1, 2, 3, 4, 5] as const;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            Scan Video Variants
          </h1>
          <Select value={artworkId} onValueChange={setArtworkId} data-testid="select-artwork">
            <SelectTrigger className="w-[420px]" data-testid="select-artwork-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ARTWORK_OPTIONS.map(opt => (
                <SelectItem key={opt.id} value={opt.id} data-testid={`select-artwork-${opt.id}`}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={handleGenerateAll}
          disabled={generatingCount > 0}
          data-testid="button-generate-all"
        >
          {generatingCount > 0 ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating {generatingCount} of 5...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Generate All 5 Variants
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {variants.map((v) => {
          const desc = descriptions?.[String(v)];
          const key = resultKey(v);
          const result = results.get(key);
          const isGenerating = generating.has(key);

          return (
            <Card key={`${artworkId}-${v}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-base">
                  <Badge variant="outline" className="mr-2">V{v}</Badge>
                  {desc?.name || `Variant ${v}`}
                </CardTitle>
                {result && (
                  <Badge variant="secondary">
                    {(result.sizeBytes / 1024 / 1024).toFixed(1)}MB
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {desc?.description || "Loading..."}
                </p>

                {result?.base64 ? (
                  <div className="space-y-2">
                    <video
                      ref={(el) => {
                        if (el) videoRefs.current.set(key, el);
                      }}
                      src={`data:video/mp4;base64,${result.base64}`}
                      controls
                      loop
                      playsInline
                      className="w-full rounded-md bg-black"
                      style={{ aspectRatio: "1080/1350" }}
                      data-testid={`video-variant-${v}`}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(v)}
                        data-testid={`button-download-${v}`}
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => generateVariant.mutate(v)}
                        disabled={isGenerating}
                        data-testid={`button-regenerate-${v}`}
                      >
                        <RefreshCw className="w-3 h-3" />
                        Regenerate
                      </Button>
                    </div>
                  </div>
                ) : isGenerating ? (
                  <div
                    className="flex flex-col items-center justify-center bg-muted rounded-md py-12"
                    style={{ aspectRatio: "1080/1350" }}
                  >
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Generating...</p>
                    <p className="text-xs text-muted-foreground mt-1">This may take 30-60s</p>
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center justify-center bg-muted rounded-md py-12 cursor-pointer hover-elevate"
                    style={{ aspectRatio: "1080/1350" }}
                    onClick={() => generateVariant.mutate(v)}
                    data-testid={`button-generate-${v}`}
                  >
                    <Play className="w-8 h-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Click to generate</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
