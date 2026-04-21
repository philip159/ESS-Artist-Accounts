import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Move, RotateCw, ZoomIn, Check, RefreshCw, Loader2 } from "lucide-react";
import type { Artwork, Template, MockupSettings, MockupPositioning } from "@shared/schema";

interface MockupCustomizerProps {
  artwork: Artwork;
  onClose?: () => void;
}

interface TemplateWithSettings extends Template {
  settings: MockupSettings | null;
  zoneId: string;
}

const DEFAULT_POSITIONING: MockupPositioning = {
  scale: 1.0,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
};

export function MockupCustomizer({ artwork, onClose }: MockupCustomizerProps) {
  const { toast } = useToast();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [positioning, setPositioning] = useState<MockupPositioning>(DEFAULT_POSITIONING);
  const [enabled, setEnabled] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { data: templates = [], isLoading: templatesLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });

  const { data: mockupSettings = [], isLoading: settingsLoading } = useQuery<MockupSettings[]>({
    queryKey: ["/api/artworks", artwork.id, "mockup-settings"],
  });

  const templatesWithSettings = useMemo<TemplateWithSettings[]>(() => {
    return templates.flatMap((template) => {
      const zones = template.frameZones || [];
      return zones.map((zone, idx) => {
        // Normalize zoneId: use zone.id if present, otherwise fallback to zone-{idx}
        const normalizedZoneId = zone.id || `zone-${idx}`;
        const setting = mockupSettings.find(
          (s) => s.templateId === template.id && s.zoneId === normalizedZoneId
        );
        return {
          ...template,
          settings: setting || null,
          zoneId: normalizedZoneId,
        };
      });
    });
  }, [templates, mockupSettings]);

  const selectedTemplate = useMemo(() => {
    return templatesWithSettings.find(
      (t) => t.id === selectedTemplateId && t.zoneId === selectedZoneId
    );
  }, [templatesWithSettings, selectedTemplateId, selectedZoneId]);

  useEffect(() => {
    if (selectedTemplate?.settings) {
      setPositioning(selectedTemplate.settings.positioning || DEFAULT_POSITIONING);
      setEnabled(selectedTemplate.settings.enabled);
    } else {
      setPositioning(DEFAULT_POSITIONING);
      setEnabled(true);
    }
  }, [selectedTemplate]);

  useEffect(() => {
    if (templatesWithSettings.length > 0 && !selectedTemplateId) {
      const first = templatesWithSettings[0];
      setSelectedTemplateId(first.id);
      setSelectedZoneId(first.zoneId);
    }
  }, [templatesWithSettings, selectedTemplateId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplateId || !selectedZoneId) return;
      return apiRequest("/api/mockup-settings", {
        method: "POST",
        body: JSON.stringify({
          artworkId: artwork.id,
          templateId: selectedTemplateId,
          zoneId: selectedZoneId,
          positioning,
          enabled,
        }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks", artwork.id, "mockup-settings"] });
      toast({ title: "Settings saved", description: "Mockup positioning updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save settings", variant: "destructive" });
    },
  });

  const renderPreview = () => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedTemplate) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) return;

    // Find zone using normalized ID (matching the same logic used in templatesWithSettings)
    const zones = template.frameZones || [];
    const zone = zones.find((z, idx) => {
      const normalizedId = z.id || `zone-${idx}`;
      return normalizedId === selectedZoneId;
    });
    if (!zone) return;

    const templateImg = new Image();
    templateImg.crossOrigin = "anonymous";
    templateImg.onload = () => {
      canvas.width = 400;
      canvas.height = (400 / templateImg.width) * templateImg.height;

      ctx.drawImage(templateImg, 0, 0, canvas.width, canvas.height);

      const artworkImg = new Image();
      artworkImg.crossOrigin = "anonymous";
      artworkImg.onload = () => {
        const zoneX = (zone.topLeft.x / 100) * canvas.width;
        const zoneY = (zone.topLeft.y / 100) * canvas.height;
        const zoneW = ((zone.topRight.x - zone.topLeft.x) / 100) * canvas.width;
        const zoneH = ((zone.bottomLeft.y - zone.topLeft.y) / 100) * canvas.height;

        ctx.save();
        ctx.translate(zoneX + zoneW / 2, zoneY + zoneH / 2);
        ctx.rotate((positioning.rotation * Math.PI) / 180);
        ctx.scale(positioning.scale, positioning.scale);

        const offsetPxX = (positioning.offsetX / 100) * zoneW;
        const offsetPxY = (positioning.offsetY / 100) * zoneH;

        const artAspect = artworkImg.width / artworkImg.height;
        const zoneAspect = zoneW / zoneH;
        let drawW, drawH;
        if (artAspect > zoneAspect) {
          drawW = zoneW;
          drawH = zoneW / artAspect;
        } else {
          drawH = zoneH;
          drawW = zoneH * artAspect;
        }

        ctx.drawImage(
          artworkImg,
          -drawW / 2 + offsetPxX,
          -drawH / 2 + offsetPxY,
          drawW,
          drawH
        );

        ctx.restore();
      };
      artworkImg.src = artwork.lowResFileUrl || artwork.originalFileUrl;
    };
    templateImg.src = template.templateImageUrl;
  };

  useEffect(() => {
    renderPreview();
  }, [selectedTemplate, positioning, enabled]);

  if (templatesLoading || settingsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Select Template</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="grid grid-cols-2 gap-3">
              {templatesWithSettings.map((template) => {
                const isSelected =
                  template.id === selectedTemplateId && template.zoneId === selectedZoneId;
                const hasCustomSettings = !!template.settings;
                const isEnabled = template.settings?.enabled ?? true;

                return (
                  <div
                    key={`${template.id}-${template.zoneId}`}
                    onClick={() => {
                      setSelectedTemplateId(template.id);
                      setSelectedZoneId(template.zoneId);
                    }}
                    className={`relative cursor-pointer rounded-md overflow-hidden border-2 transition-all hover-elevate ${
                      isSelected ? "border-primary" : "border-transparent"
                    } ${!isEnabled ? "opacity-50" : ""}`}
                    data-testid={`template-option-${template.id}-${template.zoneId}`}
                  >
                    <img
                      src={template.templateImageUrl}
                      alt={template.name}
                      className="w-full h-24 object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-1 left-1 right-1 text-xs text-white truncate">
                      {template.name}
                    </div>
                    {hasCustomSettings && (
                      <Badge
                        className="absolute top-1 right-1"
                        variant={isEnabled ? "default" : "secondary"}
                      >
                        {isEnabled ? "Custom" : "Disabled"}
                      </Badge>
                    )}
                    {isSelected && (
                      <div className="absolute top-1 left-1">
                        <Check className="w-4 h-4 text-primary-foreground bg-primary rounded-full p-0.5" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-lg">Positioning Controls</CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="enabled-switch" className="text-sm">Enabled</Label>
            <Switch
              id="enabled-switch"
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid="switch-template-enabled"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="relative bg-muted rounded-md overflow-hidden">
            <canvas
              ref={canvasRef}
              className="w-full h-auto max-h-[250px] object-contain"
              data-testid="mockup-preview-canvas"
            />
            {!selectedTemplate && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                Select a template to preview
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ZoomIn className="w-4 h-4" />
                <Label>Scale: {positioning.scale.toFixed(2)}x</Label>
              </div>
              <Slider
                value={[positioning.scale]}
                min={0.5}
                max={2.0}
                step={0.05}
                onValueChange={([v]) => setPositioning((p) => ({ ...p, scale: v }))}
                data-testid="slider-scale"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Move className="w-4 h-4" />
                <Label>Offset X: {positioning.offsetX}%</Label>
              </div>
              <Slider
                value={[positioning.offsetX]}
                min={-50}
                max={50}
                step={1}
                onValueChange={([v]) => setPositioning((p) => ({ ...p, offsetX: v }))}
                data-testid="slider-offset-x"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Move className="w-4 h-4" />
                <Label>Offset Y: {positioning.offsetY}%</Label>
              </div>
              <Slider
                value={[positioning.offsetY]}
                min={-50}
                max={50}
                step={1}
                onValueChange={([v]) => setPositioning((p) => ({ ...p, offsetY: v }))}
                data-testid="slider-offset-y"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RotateCw className="w-4 h-4" />
                <Label>Rotation: {positioning.rotation}°</Label>
              </div>
              <Slider
                value={[positioning.rotation]}
                min={-15}
                max={15}
                step={1}
                onValueChange={([v]) => setPositioning((p) => ({ ...p, rotation: v }))}
                data-testid="slider-rotation"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setPositioning(DEFAULT_POSITIONING);
                setEnabled(true);
              }}
              data-testid="button-reset-positioning"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reset
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !selectedTemplateId}
              data-testid="button-save-positioning"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
