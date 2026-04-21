import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, LayoutTemplate, Edit, Trash2, Eye, Save, GripVertical, User } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TemplateCreator } from "@/components/TemplateCreator";
import { detectZoneRatio, artworkMatchesRatio } from "@shared/schema";
import type { Template, Artwork } from "@shared/schema";


interface EditableZone {
  id: string;
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  supportedSizes: string[];
  blendMode: "over" | "multiply";
  blendOpacity: number;
}

export default function Templates() {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [previewArtworkId, setPreviewArtworkId] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editableZones, setEditableZones] = useState<EditableZone[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [dragState, setDragState] = useState<{ zoneIdx: number; corner: string } | null>(null);
  const [configImageDims, setConfigImageDims] = useState<{ w: number; h: number } | null>(null);
  const configImageRef = useRef<HTMLImageElement>(null);
  const { toast } = useToast();

  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });

  const { data: artworks } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"],
  });

  const { data: artistNames } = useQuery<string[]>({
    queryKey: ["/api/admin/artwork-artist-names"],
  });

  const assignArtistMutation = useMutation({
    mutationFn: async ({ templateId, artistVendorName }: { templateId: string; artistVendorName: string | null }) => {
      return await apiRequest("PATCH", `/api/templates/${templateId}`, { artistVendorName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({ title: "Artist assignment updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update artist", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (templateId: number | string) => {
      return await apiRequest("DELETE", `/api/templates/${templateId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({ title: "Template deleted", description: "The template has been removed successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete template. Please try again.", variant: "destructive" });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async ({ templateId, artworkId }: { templateId: string; artworkId: string }) => {
      const response = await apiRequest("POST", `/api/admin/templates/${templateId}/generate-lifestyle-mockup`, {
        artworkId,
        zoneIndex: 0,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      setPreviewImage(data.preview);
    },
    onError: () => {
      toast({ title: "Preview failed", description: "Could not generate lifestyle mockup preview.", variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ templateId, artworkId }: { templateId: string; artworkId: string }) => {
      const response = await apiRequest("POST", `/api/admin/templates/${templateId}/save-lifestyle-mockup`, {
        artworkId,
        zoneIndex: 0,
      });
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Mockup saved", description: "Lifestyle mockup has been saved successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save lifestyle mockup.", variant: "destructive" });
    },
  });

  const updateZonesMutation = useMutation({
    mutationFn: async ({ templateId, zones }: { templateId: string; zones: EditableZone[] }) => {
      const frameZones = zones.map(z => ({
        id: z.id,
        topLeft: z.topLeft,
        topRight: z.topRight,
        bottomRight: z.bottomRight,
        bottomLeft: z.bottomLeft,
        supportedSizes: z.supportedSizes,
        blendMode: z.blendMode,
        blendOpacity: z.blendOpacity,
      }));
      return await apiRequest("PATCH", `/api/templates/${templateId}`, { frameZones });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setIsEditing(false);
      if (selectedTemplate) {
        setSelectedTemplate({
          ...selectedTemplate,
          frameZones: variables.zones.map(z => ({
            id: z.id,
            topLeft: z.topLeft,
            topRight: z.topRight,
            bottomRight: z.bottomRight,
            bottomLeft: z.bottomLeft,
            blendMode: z.blendMode,
            blendOpacity: z.blendOpacity,
            supportedSizes: selectedTemplate.frameZones[0]?.supportedSizes || [],
          })),
        });
      }
      toast({ title: "Template updated", description: "Zone configuration has been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update template.", variant: "destructive" });
    },
  });

  const startEditing = useCallback(() => {
    if (!selectedTemplate) return;
    setEditableZones(selectedTemplate.frameZones.map(z => ({
      id: z.id,
      topLeft: { ...z.topLeft },
      topRight: { ...z.topRight },
      bottomRight: { ...z.bottomRight },
      bottomLeft: { ...z.bottomLeft },
      supportedSizes: z.supportedSizes || [],
      blendMode: (z.blendMode as "over" | "multiply") || "multiply",
      blendOpacity: z.blendOpacity ?? 1.0,
    })));
    setIsEditing(true);
  }, [selectedTemplate]);

  const getRelativeCoords = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!configImageRef.current) return null;
    const rect = configImageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  }, []);

  const handleCornerMouseDown = useCallback((e: React.MouseEvent, zoneIdx: number, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState({ zoneIdx, corner });
  }, []);

  useEffect(() => {
    if (!dragState) return;
    const handleMouseMove = (e: MouseEvent) => {
      const coords = getRelativeCoords(e);
      if (!coords) return;
      setEditableZones(prev => prev.map((z, i) => {
        if (i !== dragState.zoneIdx) return z;
        return { ...z, [dragState.corner]: coords };
      }));
    };
    const handleMouseUp = () => setDragState(null);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, getRelativeCoords]);

  const cornerLabels = ["TL", "TR", "BR", "BL"];
  const cornerKeys = ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold font-display" data-testid="text-page-title">
                Mockup Templates
              </h1>
              <p className="text-muted-foreground mt-1">
                Configure frame zones for perspective-aware lifestyle mockup generation
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => setShowCreateDialog(true)}
              data-testid="button-create-template"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="w-full aspect-video mb-4" />
                  <Skeleton className="w-3/4 h-6 mb-2" />
                  <Skeleton className="w-1/2 h-4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : templates && templates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {templates.map((template) => (
              <Card key={template.id} className="hover-elevate transition-all group">
                <CardContent className="p-6 space-y-4">
                  <div className="aspect-video bg-muted rounded-lg overflow-hidden relative">
                    {template.templateImageUrl ? (
                      <img
                        src={template.templateImageUrl}
                        alt={template.name}
                        className="w-full h-full object-cover"
                        data-testid={`img-template-${template.id}`}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <LayoutTemplate className="w-12 h-12 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <Badge variant="secondary" className="text-xs">
                        {template.frameZones.length} zone{template.frameZones.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold font-display truncate" data-testid={`text-template-name-${template.id}`}>
                      {template.name}
                    </h3>
                    {template.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {template.frameZones?.[0] && (
                      <Badge variant="default" className="text-xs" data-testid={`badge-ratio-${template.id}`}>
                        {detectZoneRatio(template.frameZones[0])}
                      </Badge>
                    )}
                    {template.supportedSizes.slice(0, 3).map((size) => (
                      <Badge key={size} variant="outline" className="text-xs">{size}</Badge>
                    ))}
                    {template.supportedSizes.length > 3 && (
                      <Badge variant="outline" className="text-xs">+{template.supportedSizes.length - 3}</Badge>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Artist Assignment</Label>
                    <Select
                      value={template.artistVendorName || "__global__"}
                      onValueChange={(val) => {
                        assignArtistMutation.mutate({
                          templateId: template.id,
                          artistVendorName: val === "__global__" ? null : val,
                        });
                      }}
                      data-testid={`select-artist-${template.id}`}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid={`trigger-artist-${template.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__global__">Global (All Artists)</SelectItem>
                        {artistNames?.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2 pt-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setSelectedTemplate(template);
                        setPreviewImage(null);
                        setPreviewArtworkId("");
                        setShowConfigDialog(true);
                      }}
                      data-testid={`button-edit-${template.id}`}
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      Configure
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteMutation.mutate(template.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-${template.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
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
                    <LayoutTemplate className="w-12 h-12 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">No templates yet</h3>
                  <p className="text-muted-foreground">
                    Create your first mockup template to get started
                  </p>
                </div>
                <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-template">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Template
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Template</DialogTitle>
            <DialogDescription>
              Upload a mockup image and define frame zones for artwork placement
            </DialogDescription>
          </DialogHeader>
          <TemplateCreator onSuccess={() => setShowCreateDialog(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={showConfigDialog} onOpenChange={(open) => {
        setShowConfigDialog(open);
        if (!open) {
          setIsEditing(false);
          setDragState(null);
        }
      }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure: {selectedTemplate?.name}</DialogTitle>
            <DialogDescription>
              {isEditing ? "Drag corners to reposition, edit settings below" : "Preview lifestyle mockups and view zone coordinates"}
            </DialogDescription>
          </DialogHeader>

          {selectedTemplate && (
            <div className="space-y-6 py-4">
              <div className="border rounded-lg p-4 bg-muted/30">
                <div className="relative select-none">
                  <img
                    ref={configImageRef}
                    src={selectedTemplate.templateImageUrl}
                    alt={selectedTemplate.name}
                    className="w-full rounded"
                    draggable={false}
                    data-testid="img-template-configure"
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      setConfigImageDims({ w: img.naturalWidth, h: img.naturalHeight });
                    }}
                  />
                  <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: isEditing ? "auto" : "none" }}>
                    {(isEditing ? editableZones : selectedTemplate.frameZones).map((zone, idx) => {
                      const corners = isEditing
                        ? [zone.topLeft, zone.topRight, zone.bottomRight, zone.bottomLeft]
                        : [(zone as any).topLeft, (zone as any).topRight, (zone as any).bottomRight, (zone as any).bottomLeft];
                      const points = corners.map(p => `${p.x}%,${p.y}%`).join(" ");
                      return (
                        <g key={zone.id}>
                          <polygon
                            points={points}
                            fill="rgba(59, 130, 246, 0.15)"
                            stroke="rgb(59, 130, 246)"
                            strokeWidth="2"
                          />
                          {corners.map((p, i) => (
                            <g key={i}>
                              <circle
                                cx={`${p.x}%`}
                                cy={`${p.y}%`}
                                r={isEditing ? "8" : "6"}
                                fill={isEditing ? "rgb(59, 130, 246)" : "rgba(59, 130, 246, 0.4)"}
                                stroke="white"
                                strokeWidth={isEditing ? "2" : "1"}
                                style={{ cursor: isEditing ? "grab" : "default" }}
                                onMouseDown={isEditing ? (e) => handleCornerMouseDown(e, idx, cornerKeys[i]) : undefined}
                              />
                              <text x={`${p.x}%`} y={`${p.y}%`} dy="-12" textAnchor="middle" fill="rgb(59, 130, 246)" fontSize="11" fontWeight="bold">
                                {cornerLabels[i]}
                              </text>
                            </g>
                          ))}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="font-semibold">Frame Zones ({selectedTemplate.frameZones.length})</h4>
                {!isEditing ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={startEditing}
                    data-testid="button-start-editing"
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    Reconfigure
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setIsEditing(false); setDragState(null); }}
                      data-testid="button-cancel-editing"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (selectedTemplate) {
                          updateZonesMutation.mutate({ templateId: selectedTemplate.id, zones: editableZones });
                        }
                      }}
                      disabled={updateZonesMutation.isPending}
                      data-testid="button-save-zones"
                    >
                      <Save className="w-3 h-3 mr-1" />
                      {updateZonesMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-4">
                  {editableZones.map((zone, idx) => (
                    <div key={zone.id} className="p-4 border rounded-lg space-y-4">
                      <span className="font-medium text-sm">Zone {idx + 1}</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {cornerKeys.map((key, i) => (
                          <div key={key} className="space-y-1">
                            <Label className="text-xs">{cornerLabels[i]}</Label>
                            <div className="flex gap-1">
                              <Input
                                type="number"
                                value={parseFloat(zone[key].x.toFixed(1))}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val)) {
                                    setEditableZones(prev => prev.map((z, zi) =>
                                      zi === idx ? { ...z, [key]: { ...z[key], x: Math.max(0, Math.min(100, val)) } } : z
                                    ));
                                  }
                                }}
                                step={0.1}
                                className="text-xs"
                                data-testid={`input-zone-${idx}-${key}-x`}
                              />
                              <Input
                                type="number"
                                value={parseFloat(zone[key].y.toFixed(1))}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val)) {
                                    setEditableZones(prev => prev.map((z, zi) =>
                                      zi === idx ? { ...z, [key]: { ...z[key], y: Math.max(0, Math.min(100, val)) } } : z
                                    ));
                                  }
                                }}
                                step={0.1}
                                className="text-xs"
                                data-testid={`input-zone-${idx}-${key}-y`}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm">Blend Mode</Label>
                          <Select
                            value={zone.blendMode}
                            onValueChange={(val) => {
                              setEditableZones(prev => prev.map((z, zi) =>
                                zi === idx ? { ...z, blendMode: val as "over" | "multiply" } : z
                              ));
                            }}
                          >
                            <SelectTrigger data-testid={`select-blend-${idx}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="multiply">Multiply</SelectItem>
                              <SelectItem value="over">Over</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Opacity</Label>
                          <div className="flex items-center gap-3">
                            <Slider
                              value={[zone.blendOpacity * 100]}
                              onValueChange={([value]) => {
                                setEditableZones(prev => prev.map((z, zi) =>
                                  zi === idx ? { ...z, blendOpacity: Math.round(value * 10) / 1000 } : z
                                ));
                              }}
                              min={1}
                              max={100}
                              step={0.1}
                              className="flex-1"
                              data-testid={`slider-edit-opacity-${idx}`}
                            />
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={parseFloat((zone.blendOpacity * 100).toFixed(1))}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val) && val >= 1 && val <= 100) {
                                    setEditableZones(prev => prev.map((z, zi) =>
                                      zi === idx ? { ...z, blendOpacity: Math.round(val * 10) / 1000 } : z
                                    ));
                                  }
                                }}
                                min={1}
                                max={100}
                                step={0.1}
                                className="w-20 text-right"
                                data-testid={`input-edit-opacity-${idx}`}
                              />
                              <span className="text-sm text-muted-foreground">%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selectedTemplate.frameZones.map((zone, idx) => (
                    <div key={zone.id} className="p-3 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="font-medium text-sm">Zone {idx + 1}</span>
                        <div className="flex gap-1 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {zone.blendMode || "multiply"}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {Math.round((zone.blendOpacity ?? 1.0) * 100)}% opacity
                          </Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {[zone.topLeft, zone.topRight, zone.bottomRight, zone.bottomLeft].map((p, i) => (
                          <div key={i} className="text-xs font-mono text-muted-foreground">
                            <span className="text-foreground">{cornerLabels[i]}</span>: {p.x.toFixed(1)}, {p.y.toFixed(1)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-4 space-y-4">
                <h4 className="font-semibold flex items-center gap-2 flex-wrap">
                  Generate Lifestyle Mockup
                  {selectedTemplate?.frameZones?.[0] && (
                    <Badge variant="secondary" data-testid="badge-zone-ratio">
                      Zone ratio: {detectZoneRatio(selectedTemplate.frameZones[0], configImageDims?.w, configImageDims?.h)}
                    </Badge>
                  )}
                </h4>
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="space-y-2 flex-1 min-w-[200px]">
                    <Label htmlFor="config-artwork" className="text-sm">Select Artwork</Label>
                    {(() => {
                      const zoneRatio = selectedTemplate?.frameZones?.[0]
                        ? detectZoneRatio(selectedTemplate.frameZones[0], configImageDims?.w, configImageDims?.h)
                        : null;
                      const filteredArtworks = zoneRatio
                        ? artworks?.filter(a => artworkMatchesRatio(a.aspectRatio, zoneRatio))
                        : artworks;
                      return (
                        <Select value={previewArtworkId} onValueChange={setPreviewArtworkId}>
                          <SelectTrigger id="config-artwork" data-testid="select-config-artwork">
                            <SelectValue placeholder="Choose artwork..." />
                          </SelectTrigger>
                          <SelectContent>
                            {!artworks ? (
                              <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                                Loading artworks...
                              </div>
                            ) : filteredArtworks && filteredArtworks.length > 0 ? (
                              filteredArtworks.map(a => (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.title} - {a.artistName} ({a.aspectRatio})
                                </SelectItem>
                              ))
                            ) : (
                              <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                                No artworks match ratio {zoneRatio}
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                  </div>
                  <Button
                    variant="outline"
                    disabled={!previewArtworkId || previewMutation.isPending}
                    onClick={() => {
                      if (selectedTemplate) {
                        previewMutation.mutate({ templateId: selectedTemplate.id, artworkId: previewArtworkId });
                      }
                    }}
                    data-testid="button-config-preview"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    {previewMutation.isPending ? "Generating..." : "Preview"}
                  </Button>
                  {previewImage && (
                    <Button
                      disabled={!previewArtworkId || saveMutation.isPending}
                      onClick={() => {
                        if (selectedTemplate) {
                          saveMutation.mutate({ templateId: selectedTemplate.id, artworkId: previewArtworkId });
                        }
                      }}
                      data-testid="button-config-save"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {saveMutation.isPending ? "Saving..." : "Save Mockup"}
                    </Button>
                  )}
                </div>

                {previewArtworkId && selectedTemplate && (() => {
                  const selectedArtwork = artworks?.find(a => a.id === previewArtworkId);
                  if (!selectedArtwork) return null;
                  const altText = `${selectedArtwork.title} by ${selectedArtwork.artistName} - Modern Gallery Wall | Style = Lifestyle`;
                  return (
                    <div className="p-3 border rounded-lg bg-muted/30 space-y-1" data-testid="alt-text-preview">
                      <Label className="text-xs text-muted-foreground">Alt Text Preview</Label>
                      <p className="text-sm font-mono" data-testid="text-alt-preview">{altText}</p>
                    </div>
                  );
                })()}

                {previewImage && (
                  <div className="border rounded-lg p-2 bg-muted/30">
                    <img
                      src={previewImage}
                      alt="Lifestyle preview"
                      className="w-full rounded"
                      data-testid="img-config-preview"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
