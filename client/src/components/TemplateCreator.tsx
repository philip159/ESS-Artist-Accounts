import { useState, useRef, useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X, Settings, FileImage, Upload, Eye, GripVertical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { insertTemplateSchema, PRINT_SIZES } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Artwork } from "@shared/schema";
import { z } from "zod";

const formSchema = insertTemplateSchema.omit({
  templateImageUrl: true,
  frameZones: true,
}).extend({
  file: z.any().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface FrameZone {
  id: string;
  corners: { x: number; y: number }[];
  blendMode: "over" | "multiply";
  blendOpacity: number;
}

interface DragState {
  zoneId: string;
  cornerIdx: number;
}

interface CornerInputs {
  zoneId: string;
  cornerIdx: number;
  xValue: string;
  yValue: string;
}


export function TemplateCreator({ onSuccess }: { onSuccess?: () => void }) {
  const [imagePreview, setImagePreview] = useState<string>("");
  const [frameZones, setFrameZones] = useState<FrameZone[]>([]);
  const [currentZone, setCurrentZone] = useState<FrameZone | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [psdFile, setPsdFile] = useState<File | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [editingCorner, setEditingCorner] = useState<CornerInputs | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewArtworkId, setPreviewArtworkId] = useState<string>("");
  const [savedTemplateId, setSavedTemplateId] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string>("__global__");
  const canvasRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const { toast } = useToast();

  const { data: artworks } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"],
  });

  const { data: artistNames } = useQuery<string[]>({
    queryKey: ["/api/admin/artwork-artist-names"],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      supportedSizes: [],
    },
  });

  const parsePsdMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("psdFile", file);
      const response = await fetch("/api/templates/parse-psd", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to parse PSD file");
      }
      return response.json();
    },
    onSuccess: (data: { width: number; height: number; frameZones: any[] }) => {
      const convertedZones: FrameZone[] = data.frameZones.map((zone, idx) => ({
        id: `zone-${Date.now()}-${idx}`,
        corners: [
          { x: zone.topLeft.x / 100, y: zone.topLeft.y / 100 },
          { x: zone.topRight.x / 100, y: zone.topRight.y / 100 },
          { x: zone.bottomRight.x / 100, y: zone.bottomRight.y / 100 },
          { x: zone.bottomLeft.x / 100, y: zone.bottomLeft.y / 100 },
        ],
        blendMode: zone.blendMode || "multiply",
        blendOpacity: zone.blendOpacity !== undefined ? zone.blendOpacity : 1.0,
      }));
      setFrameZones(convertedZones);
      toast({
        title: "PSD parsed successfully",
        description: `Found ${convertedZones.length} smart object layer${convertedZones.length !== 1 ? 's' : ''}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "PSD parsing failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const convertedZones = frameZones.map(zone => ({
        id: zone.id,
        topLeft: { x: zone.corners[0].x * 100, y: zone.corners[0].y * 100 },
        topRight: { x: zone.corners[1].x * 100, y: zone.corners[1].y * 100 },
        bottomRight: { x: zone.corners[2].x * 100, y: zone.corners[2].y * 100 },
        bottomLeft: { x: zone.corners[3].x * 100, y: zone.corners[3].y * 100 },
        supportedSizes: data.supportedSizes,
        blendMode: zone.blendMode,
        blendOpacity: zone.blendOpacity,
      }));

      const formData = new FormData();
      formData.append("name", data.name);
      formData.append("description", data.description || "");
      formData.append("supportedSizes", JSON.stringify(data.supportedSizes));
      formData.append("frameZones", JSON.stringify(convertedZones));
      if (selectedArtist !== "__global__") {
        formData.append("artistVendorName", selectedArtist);
      }

      if (selectedFile) {
        formData.append("templateImage", selectedFile);
      }

      const response = await fetch("/api/templates", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create template");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setSavedTemplateId(data.id);
      toast({
        title: "Template created",
        description: "Your mockup template has been created successfully.",
      });
      onSuccess?.();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create template. Please try again.",
        variant: "destructive",
      });
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
      toast({
        title: "Preview failed",
        description: "Could not generate preview. Make sure you have saved the template first.",
        variant: "destructive",
      });
    },
  });

  const handlePsdUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.psd')) {
      toast({
        title: "Invalid file",
        description: "Please upload a .psd (Photoshop) file",
        variant: "destructive",
      });
      return;
    }
    setPsdFile(file);
    parsePsdMutation.mutate(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (!psdFile) {
      setFrameZones([]);
      setCurrentZone(null);
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.width, height: img.height });
        setImagePreview(reader.result as string);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const getRelativeCoords = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!imageRef.current) return null;
    const imgRect = imageRef.current.getBoundingClientRect();
    const x = (e.clientX - imgRect.left) / imgRect.width;
    const y = (e.clientY - imgRect.top) / imgRect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragState) return;
    const coords = getRelativeCoords(e);
    if (!coords) return;

    if (!currentZone) {
      const newZone: FrameZone = {
        id: `zone-${Date.now()}`,
        corners: [coords],
        blendMode: "multiply",
        blendOpacity: 1.0,
      };
      setCurrentZone(newZone);
    } else if (currentZone.corners.length < 4) {
      const updatedZone = {
        ...currentZone,
        corners: [...currentZone.corners, coords],
      };
      setCurrentZone(updatedZone);
      if (updatedZone.corners.length === 4) {
        setFrameZones(prev => [...prev, updatedZone]);
        setCurrentZone(null);
      }
    }
  };

  const handleCornerMouseDown = useCallback((e: React.MouseEvent, zoneId: string, cornerIdx: number) => {
    e.stopPropagation();
    e.preventDefault();
    setDragState({ zoneId, cornerIdx });
  }, []);

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const coords = getRelativeCoords(e);
      if (!coords) return;

      setFrameZones(prev => prev.map(zone => {
        if (zone.id !== dragState.zoneId) return zone;
        const newCorners = [...zone.corners];
        newCorners[dragState.cornerIdx] = coords;
        return { ...zone, corners: newCorners };
      }));
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, getRelativeCoords]);

  const removeFrameZone = (id: string) => {
    setFrameZones(prev => prev.filter(z => z.id !== id));
  };

  const resetCurrentZone = () => {
    setCurrentZone(null);
  };

  const cornerLabels = ["TL", "TR", "BR", "BL"];

  const startEditingCorner = (zoneId: string, cornerIdx: number, corner: { x: number; y: number }) => {
    setEditingCorner({
      zoneId,
      cornerIdx,
      xValue: (corner.x * 100).toFixed(2),
      yValue: (corner.y * 100).toFixed(2),
    });
  };

  const commitCornerEdit = () => {
    if (!editingCorner) return;
    const xPct = parseFloat(editingCorner.xValue);
    const yPct = parseFloat(editingCorner.yValue);
    if (isNaN(xPct) || isNaN(yPct)) return;

    setFrameZones(prev => prev.map(zone => {
      if (zone.id !== editingCorner.zoneId) return zone;
      const newCorners = [...zone.corners];
      newCorners[editingCorner.cornerIdx] = {
        x: Math.max(0, Math.min(1, xPct / 100)),
        y: Math.max(0, Math.min(1, yPct / 100)),
      };
      return { ...zone, corners: newCorners };
    }));
    setEditingCorner(null);
  };

  const onSubmit = (data: FormData) => {
    if (!selectedFile) {
      toast({ title: "Image required", description: "Please upload a template image.", variant: "destructive" });
      return;
    }
    if (frameZones.length === 0) {
      toast({ title: "Frame zones required", description: "Please define at least one frame zone.", variant: "destructive" });
      return;
    }
    createMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Template Name</Label>
            <Input
              id="name"
              data-testid="input-template-name"
              placeholder="e.g., Gallery Wall Staircase"
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              data-testid="input-template-description"
              placeholder="Describe this template..."
              rows={3}
              {...form.register("description")}
            />
          </div>

          <div className="space-y-2">
            <Label>Artist Assignment</Label>
            <Select value={selectedArtist} onValueChange={setSelectedArtist}>
              <SelectTrigger data-testid="select-template-artist">
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
            <p className="text-xs text-muted-foreground">
              Global templates generate mockups for every artist. Artist-specific templates only generate when that artist submits work.
            </p>
          </div>

          <div className="space-y-2 p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-2">
              <FileImage className="w-4 h-4 text-primary" />
              <Label htmlFor="psd-upload" className="text-base font-semibold">Import from Photoshop (Recommended)</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Upload a .psd file with smart objects to automatically extract frame zones.
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              <Input
                id="psd-upload"
                data-testid="input-psd-file"
                type="file"
                accept=".psd"
                onChange={handlePsdUpload}
                className="cursor-pointer"
                disabled={parsePsdMutation.isPending}
              />
              {parsePsdMutation.isPending && <Badge variant="secondary">Parsing...</Badge>}
              {psdFile && !parsePsdMutation.isPending && (
                <Badge variant="default">
                  {frameZones.length} zone{frameZones.length !== 1 ? 's' : ''} found
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              <Label htmlFor="image">Template Image {!psdFile && "(Required)"}</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              {psdFile
                ? "Upload the flattened template image (JPEG or PNG) for final mockup generation."
                : "Upload an image and define frame zones by clicking corners."}
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              <Input
                id="image"
                data-testid="input-template-image"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="cursor-pointer"
              />
              {imagePreview && <Badge variant="secondary">Uploaded</Badge>}
            </div>
          </div>
        </div>

        {imagePreview && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Label>Frame Zones</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {currentZone && (
                  <Button type="button" variant="ghost" size="sm" onClick={resetCurrentZone} data-testid="button-reset-zone">
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Cancel
                  </Button>
                )}
                <Badge variant="secondary">
                  {frameZones.length} zone{frameZones.length !== 1 ? "s" : ""} defined
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {currentZone
                  ? `Click ${4 - currentZone.corners.length} more corner${4 - currentZone.corners.length !== 1 ? "s" : ""} (clockwise: TL, TR, BR, BL)`
                  : "Click 4 corners clockwise (TL, TR, BR, BL) to define a zone. Drag corners to adjust."}
              </p>

              <div
                ref={canvasRef}
                onClick={handleCanvasClick}
                className="relative border-2 border-dashed rounded-lg cursor-crosshair flex items-center justify-center bg-muted/30 select-none"
                style={{
                  maxWidth: "100%",
                  aspectRatio: imageDimensions
                    ? `${imageDimensions.width}/${imageDimensions.height}`
                    : "16/9",
                }}
                data-testid="canvas-frame-mapper"
              >
                <img
                  ref={imageRef}
                  src={imagePreview}
                  alt="Template preview"
                  className="w-full h-full object-contain pointer-events-none"
                  draggable={false}
                />

                <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
                  {frameZones.map((zone) => (
                    <g key={zone.id}>
                      <polygon
                        points={zone.corners.map(c => `${c.x * 100}%,${c.y * 100}%`).join(" ")}
                        fill="rgba(59, 130, 246, 0.15)"
                        stroke="rgb(59, 130, 246)"
                        strokeWidth="2"
                      />
                      {zone.corners.map((corner, idx) => (
                        <g key={idx}>
                          <circle
                            cx={`${corner.x * 100}%`}
                            cy={`${corner.y * 100}%`}
                            r="8"
                            fill="rgba(59, 130, 246, 0.3)"
                            stroke="rgb(59, 130, 246)"
                            strokeWidth="2"
                            style={{ pointerEvents: "all", cursor: "grab" }}
                            onMouseDown={(e) => handleCornerMouseDown(e as any, zone.id, idx)}
                          />
                          <text
                            x={`${corner.x * 100}%`}
                            y={`${corner.y * 100}%`}
                            dy="-12"
                            textAnchor="middle"
                            fill="rgb(59, 130, 246)"
                            fontSize="10"
                            fontWeight="bold"
                          >
                            {cornerLabels[idx]}
                          </text>
                        </g>
                      ))}
                    </g>
                  ))}

                  {currentZone && (
                    <g>
                      {currentZone.corners.map((corner, idx) => (
                        <g key={idx}>
                          <circle
                            cx={`${corner.x * 100}%`}
                            cy={`${corner.y * 100}%`}
                            r="6"
                            fill="rgb(239, 68, 68)"
                            stroke="white"
                            strokeWidth="2"
                          />
                          <text
                            x={`${corner.x * 100}%`}
                            y={`${corner.y * 100}%`}
                            dy="-10"
                            textAnchor="middle"
                            fill="rgb(239, 68, 68)"
                            fontSize="10"
                            fontWeight="bold"
                          >
                            {cornerLabels[idx]}
                          </text>
                        </g>
                      ))}
                      {currentZone.corners.length > 1 && (
                        <polyline
                          points={currentZone.corners.map(c => `${c.x * 100}%,${c.y * 100}%`).join(" ")}
                          fill="none"
                          stroke="rgb(239, 68, 68)"
                          strokeWidth="2"
                          strokeDasharray="4 4"
                        />
                      )}
                    </g>
                  )}
                </svg>
              </div>
            </div>

            {frameZones.length > 0 && (
              <div className="space-y-3">
                <Label>Defined Zones</Label>
                {frameZones.map((zone, idx) => (
                  <div
                    key={zone.id}
                    className="p-4 border rounded-lg space-y-3"
                    data-testid={`zone-settings-${idx}`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">Frame {idx + 1}</span>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeFrameZone(zone.id)}
                        data-testid={`button-remove-zone-${idx}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {zone.corners.map((corner, cIdx) => (
                        <div key={cIdx} className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{cornerLabels[cIdx]}</Label>
                          {editingCorner?.zoneId === zone.id && editingCorner?.cornerIdx === cIdx ? (
                            <div className="flex gap-1">
                              <Input
                                className="h-7 text-xs"
                                value={editingCorner.xValue}
                                onChange={(e) => setEditingCorner({ ...editingCorner, xValue: e.target.value })}
                                onBlur={commitCornerEdit}
                                onKeyDown={(e) => { if (e.key === "Enter") commitCornerEdit(); }}
                                autoFocus
                                data-testid={`input-corner-x-${idx}-${cIdx}`}
                              />
                              <Input
                                className="h-7 text-xs"
                                value={editingCorner.yValue}
                                onChange={(e) => setEditingCorner({ ...editingCorner, yValue: e.target.value })}
                                onBlur={commitCornerEdit}
                                onKeyDown={(e) => { if (e.key === "Enter") commitCornerEdit(); }}
                                data-testid={`input-corner-y-${idx}-${cIdx}`}
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="text-xs text-left font-mono bg-muted/50 rounded px-2 py-1 w-full"
                              onClick={() => startEditingCorner(zone.id, cIdx, corner)}
                              data-testid={`button-edit-corner-${idx}-${cIdx}`}
                            >
                              {(corner.x * 100).toFixed(1)}%, {(corner.y * 100).toFixed(1)}%
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`blend-mode-${zone.id}`} className="text-sm">Blend Mode</Label>
                        <Select
                          value={zone.blendMode}
                          onValueChange={(value: "over" | "multiply") => {
                            setFrameZones(prev => prev.map(z =>
                              z.id === zone.id ? { ...z, blendMode: value } : z
                            ));
                          }}
                        >
                          <SelectTrigger id={`blend-mode-${zone.id}`} data-testid={`select-blend-mode-${idx}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="multiply">Multiply</SelectItem>
                            <SelectItem value="over">Over</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {zone.blendMode === "multiply" ? "Blends with shadows/lighting" : "Flat overlay"}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`opacity-${zone.id}`} className="text-sm">
                          Opacity
                        </Label>
                        <div className="flex items-center gap-3">
                          <Slider
                            id={`opacity-${zone.id}`}
                            data-testid={`slider-opacity-${idx}`}
                            value={[zone.blendOpacity * 100]}
                            onValueChange={([value]) => {
                              setFrameZones(prev => prev.map(z =>
                                z.id === zone.id ? { ...z, blendOpacity: Math.round(value * 10) / 1000 } : z
                              ));
                            }}
                            min={1}
                            max={100}
                            step={0.1}
                            className="flex-1"
                          />
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              data-testid={`input-opacity-${idx}`}
                              value={parseFloat((zone.blendOpacity * 100).toFixed(1))}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val >= 1 && val <= 100) {
                                  setFrameZones(prev => prev.map(z =>
                                    z.id === zone.id ? { ...z, blendOpacity: Math.round(val * 10) / 1000 } : z
                                  ));
                                }
                              }}
                              min={1}
                              max={100}
                              step={0.1}
                              className="w-20 text-right"
                            />
                            <span className="text-sm text-muted-foreground">%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <Label>Supported Print Sizes (Optional)</Label>
          <p className="text-sm text-muted-foreground">Leave empty to support all sizes</p>
          <div className="flex flex-wrap gap-2">
            {PRINT_SIZES.map((size) => {
              const isSelected = form.watch("supportedSizes")?.includes(size.code);
              return (
                <Badge
                  key={size.code}
                  variant={isSelected ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => {
                    const current = form.watch("supportedSizes") || [];
                    if (isSelected) {
                      form.setValue("supportedSizes", current.filter(s => s !== size.code), { shouldValidate: true });
                    } else {
                      form.setValue("supportedSizes", [...current, size.code], { shouldValidate: true });
                    }
                  }}
                  data-testid={`badge-size-${size.code}`}
                >
                  {size.code}
                </Badge>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3 flex-wrap">
          <Button
            type="submit"
            disabled={createMutation.isPending || !selectedFile || frameZones.length === 0}
            data-testid="button-create-template"
          >
            {createMutation.isPending ? "Creating..." : "Create Template"}
          </Button>
        </div>
      </form>

      {savedTemplateId && frameZones.length > 0 && (
        <div className="border-t pt-6 space-y-4">
          <Label className="text-base font-semibold">Preview Lifestyle Mockup</Label>
          <p className="text-sm text-muted-foreground">
            Select an artwork to preview how it looks composited into this template.
          </p>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-2 flex-1 min-w-[200px]">
              <Label htmlFor="preview-artwork" className="text-sm">Artwork</Label>
              <Select value={previewArtworkId} onValueChange={setPreviewArtworkId}>
                <SelectTrigger id="preview-artwork" data-testid="select-preview-artwork">
                  <SelectValue placeholder="Select artwork..." />
                </SelectTrigger>
                <SelectContent>
                  {artworks?.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title} - {a.artistName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!previewArtworkId || previewMutation.isPending}
              onClick={() => {
                if (savedTemplateId && previewArtworkId) {
                  previewMutation.mutate({ templateId: savedTemplateId, artworkId: previewArtworkId });
                }
              }}
              data-testid="button-generate-preview"
            >
              <Eye className="w-4 h-4 mr-2" />
              {previewMutation.isPending ? "Generating..." : "Preview"}
            </Button>
          </div>

          {previewImage && (
            <div className="border rounded-lg p-2 bg-muted/30">
              <img
                src={previewImage}
                alt="Lifestyle mockup preview"
                className="w-full rounded"
                data-testid="img-lifestyle-preview"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
