import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Save, RotateCcw, Eye, EyeOff, Type, Image, Move, Plus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { COALayout, COATextElement, COAImageElement } from "@shared/schema";
import qrCodeImage from "@assets/verisart-qr-code.jpeg";
import templateImage from "@assets/COA_Template_December25_01_1765730884579.jpg";

const GOOGLE_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Oswald", "Raleway",
  "PT Sans", "Merriweather", "Nunito", "Playfair Display", "Poppins",
  "Georgia", "Times New Roman", "Garamond", "Crimson Text", "Libre Baskerville",
  "Cormorant Garamond", "EB Garamond", "Bodoni Moda", "DM Serif Display"
].sort();

const loadGoogleFont = (fontName: string) => {
  const fontId = `google-font-${fontName.replace(/\s+/g, '-')}`;
  if (document.getElementById(fontId)) return;
  const link = document.createElement('link');
  link.id = fontId;
  link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, '+')}:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=swap`;
  link.rel = 'stylesheet';
  document.head.appendChild(link);
};

// Only dynamic elements that overlay on the template
const DEFAULT_TEXT_ELEMENTS: COATextElement[] = [
  {
    id: "artworkTitle",
    label: "Artwork Title",
    content: "{artworkTitle}",
    fontFamily: "Montserrat",
    fontSize: 14,
    fontWeight: 400,
    fontStyle: "normal",
    textAlign: "left",
    letterSpacing: 0,
    lineHeight: 1.4,
    color: "#000000",
    x: 13.5, y: 30.5, width: 40, height: 3,
    visible: true
  },
  {
    id: "artistName",
    label: "Artist Name",
    content: "{artistName}",
    fontFamily: "Montserrat",
    fontSize: 14,
    fontWeight: 400,
    fontStyle: "normal",
    textAlign: "left",
    letterSpacing: 0,
    lineHeight: 1.4,
    color: "#000000",
    x: 13, y: 34, width: 40, height: 3,
    visible: true
  },
  {
    id: "edition",
    label: "Edition Number",
    content: "{editionNumber}/{editionSize}",
    fontFamily: "Montserrat",
    fontSize: 14,
    fontWeight: 400,
    fontStyle: "normal",
    textAlign: "left",
    letterSpacing: 0,
    lineHeight: 1.4,
    color: "#000000",
    x: 12, y: 41, width: 20, height: 3,
    visible: true
  },
  {
    id: "year",
    label: "Year Created",
    content: "{year}",
    fontFamily: "Montserrat",
    fontSize: 14,
    fontWeight: 400,
    fontStyle: "normal",
    textAlign: "left",
    letterSpacing: 0,
    lineHeight: 1.4,
    color: "#000000",
    x: 14, y: 56, width: 15, height: 3,
    visible: true
  },
  {
    id: "medium",
    label: "Medium",
    content: "Giclée Print on Hahnemühle German Etching (310gsm)",
    fontFamily: "Montserrat",
    fontSize: 14,
    fontWeight: 400,
    fontStyle: "normal",
    textAlign: "left",
    letterSpacing: 0,
    lineHeight: 1.4,
    color: "#000000",
    x: 8, y: 52, width: 45, height: 3,
    visible: true
  }
];

const DEFAULT_IMAGE_ELEMENTS: COAImageElement[] = [
  {
    id: "signature",
    label: "Artist Signature",
    x: 4, y: 68, width: 25, height: 18,
    objectFit: "contain",
    visible: true
  },
  {
    id: "artworkPreview",
    label: "Artwork Preview",
    x: 55, y: 5, width: 40, height: 45,
    objectFit: "contain",
    visible: false
  }
];

export default function COAEditor() {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLDivElement>(null);
  
  const [textElements, setTextElements] = useState<COATextElement[]>(DEFAULT_TEXT_ELEMENTS);
  const [imageElements, setImageElements] = useState<COAImageElement[]>(DEFAULT_IMAGE_ELEMENTS);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [canvasWidth] = useState(620);
  const [canvasHeight] = useState(437);
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [layoutName, setLayoutName] = useState("Default Layout");
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedArtworkId, setSelectedArtworkId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [customTemplateUrl, setCustomTemplateUrl] = useState<string | null>(null);
  const [isUploadingTemplate, setIsUploadingTemplate] = useState(false);
  
  const { data: layouts = [], isLoading } = useQuery<COALayout[]>({
    queryKey: ["/api/coa-layouts"],
  });
  
  const { data: artworks = [] } = useQuery<any[]>({
    queryKey: ["/api/artworks"],
  });
  
  const { data: defaultLayout } = useQuery<COALayout>({
    queryKey: ["/api/coa-layout/default"],
  });
  
  useEffect(() => {
    if (defaultLayout) {
      setTextElements(defaultLayout.textElements);
      setImageElements(defaultLayout.imageElements);
      setBackgroundColor(defaultLayout.backgroundColor);
      setLayoutName(defaultLayout.name);
      if (defaultLayout.templateImageUrl && defaultLayout.templateImageUrl.startsWith('/objects/')) {
        setCustomTemplateUrl(defaultLayout.templateImageUrl);
      }
    }
  }, [defaultLayout]);
  
  useEffect(() => {
    GOOGLE_FONTS.forEach(loadGoogleFont);
  }, []);

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploadingTemplate(true);
    try {
      const formData = new FormData();
      formData.append('template', file);
      
      const response = await fetch('/api/coa-template/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      
      if (!response.ok) throw new Error("Upload failed");
      
      const data = await response.json();
      setCustomTemplateUrl(data.templateUrl);
      toast({ title: "Template uploaded successfully" });
    } catch (error) {
      toast({ title: "Failed to upload template", variant: "destructive" });
    } finally {
      setIsUploadingTemplate(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (data: { name: string; textElements: COATextElement[]; imageElements: COAImageElement[]; backgroundColor: string; templateImageUrl: string }) => {
      // Check if we have a real database layout (not the virtual "default" one)
      if (defaultLayout && defaultLayout.id !== "default") {
        return apiRequest("PUT", `/api/coa-layouts/${defaultLayout.id}`, {
          ...data,
          canvasWidth,
          canvasHeight,
          isDefault: true,
          qrCodeImageUrl: qrCodeImage
        });
      } else {
        // Create a new layout if none exists or if it's the virtual default
        return apiRequest("POST", "/api/coa-layouts", {
          ...data,
          canvasWidth,
          canvasHeight,
          isDefault: true,
          qrCodeImageUrl: qrCodeImage
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coa-layouts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coa-layout/default"] });
      toast({ title: "Layout saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save layout", variant: "destructive" });
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      name: layoutName,
      textElements,
      imageElements,
      backgroundColor,
      templateImageUrl: customTemplateUrl || "attached_assets/COA_Template_December25_01_1765730884579.jpg"
    });
  };

  const handleReset = () => {
    setTextElements(DEFAULT_TEXT_ELEMENTS);
    setImageElements(DEFAULT_IMAGE_ELEMENTS);
    setBackgroundColor("#ffffff");
    setLayoutName("Default Layout");
    setSelectedElement(null);
    setCustomTemplateUrl(null);
    toast({ title: "Layout reset to defaults" });
  };

  const handleGeneratePreview = async () => {
    if (!selectedArtworkId) {
      toast({ title: "Please select an artwork first", variant: "destructive" });
      return;
    }
    
    setIsGeneratingPreview(true);
    try {
      // Send current layout settings to generate preview with unsaved changes
      const currentLayout = {
        id: "preview",
        name: layoutName,
        isDefault: false,
        canvasWidth,
        canvasHeight,
        backgroundColor,
        textElements,
        imageElements,
        qrCodeImageUrl: qrCodeImage,
        templateImageUrl: customTemplateUrl || "attached_assets/COA_Template_December25_01_1765730884579.jpg",
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const response = await fetch(`/api/coa-preview/${selectedArtworkId}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(currentLayout)
      });
      if (!response.ok) throw new Error("Failed to generate preview");
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      toast({ title: "Preview generated successfully" });
    } catch (error) {
      toast({ title: "Failed to generate preview", variant: "destructive" });
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const limitedEditionArtworks = artworks.filter((a: any) => a.editionType === 'limited');

  const selectedTextElement = textElements.find(el => el.id === selectedElement);
  const selectedImageElement = imageElements.find(el => el.id === selectedElement);

  const updateTextElement = (id: string, updates: Partial<COATextElement>) => {
    setTextElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  };

  const updateImageElement = (id: string, updates: Partial<COAImageElement>) => {
    setImageElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  };

  const handleMouseDown = (e: React.MouseEvent, elementId: string) => {
    e.stopPropagation();
    setSelectedElement(elementId);
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedElement || !canvasRef.current) return;
    
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const deltaX = ((e.clientX - dragStart.x) / canvasRect.width) * 100;
    const deltaY = ((e.clientY - dragStart.y) / canvasRect.height) * 100;
    
    const textEl = textElements.find(el => el.id === selectedElement);
    const imageEl = imageElements.find(el => el.id === selectedElement);
    
    if (textEl) {
      const newX = Math.max(0, Math.min(100 - textEl.width, textEl.x + deltaX));
      const newY = Math.max(0, Math.min(100 - textEl.height, textEl.y + deltaY));
      updateTextElement(selectedElement, { x: newX, y: newY });
    } else if (imageEl) {
      const newX = Math.max(0, Math.min(100 - imageEl.width, imageEl.x + deltaX));
      const newY = Math.max(0, Math.min(100 - imageEl.height, imageEl.y + deltaY));
      updateImageElement(selectedElement, { x: newX, y: newY });
    }
    
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const renderTextElement = (el: COATextElement) => {
    if (!el.visible) return null;
    const isSelected = selectedElement === el.id;
    
    return (
      <div
        key={el.id}
        className={`absolute cursor-move select-none ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}`}
        style={{
          left: `${el.x}%`,
          top: `${el.y}%`,
          width: `${el.width}%`,
          height: `${el.height}%`,
          fontFamily: el.fontFamily,
          fontSize: `${el.fontSize * 0.5}px`,
          fontWeight: el.fontWeight,
          fontStyle: el.fontStyle,
          textAlign: el.textAlign,
          letterSpacing: `${el.letterSpacing * 0.5}px`,
          lineHeight: el.lineHeight,
          color: el.color,
          whiteSpace: 'pre-wrap',
          overflow: 'hidden',
        }}
        onMouseDown={(e) => handleMouseDown(e, el.id)}
        onClick={(e) => e.stopPropagation()}
        data-testid={`coa-element-${el.id}`}
      >
        {el.content.replace('{artworkTitle}', 'Sample Artwork').replace('{artistName}', 'Artist Name').replace('{editionSize}', '50').replace('{currentYear}', new Date().getFullYear().toString())}
      </div>
    );
  };

  const renderImageElement = (el: COAImageElement) => {
    if (!el.visible) return null;
    const isSelected = selectedElement === el.id;
    
    return (
      <div
        key={el.id}
        className={`absolute cursor-move ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}`}
        style={{
          left: `${el.x}%`,
          top: `${el.y}%`,
          width: `${el.width}%`,
          height: `${el.height}%`,
        }}
        onMouseDown={(e) => handleMouseDown(e, el.id)}
        onClick={(e) => e.stopPropagation()}
        data-testid={`coa-element-${el.id}`}
      >
        {el.id === 'qrCode' && el.staticImageUrl ? (
          <img src={el.staticImageUrl} alt="QR Code" className="w-full h-full" style={{ objectFit: el.objectFit }} />
        ) : (
          <div className="w-full h-full bg-muted rounded flex items-center justify-center">
            <span className="text-xs text-muted-foreground">{el.label}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="page-title">COA Layout Editor</h1>
          <p className="text-muted-foreground">Design your Certificate of Authenticity layout</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} data-testid="button-reset">
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save">
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Saving..." : "Save Layout"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Canvas Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center">
                <div
                  ref={canvasRef}
                  className="relative border-2 border-dashed border-muted-foreground/30 rounded-lg overflow-hidden"
                  style={{
                    width: `${canvasWidth}px`,
                    height: `${canvasHeight}px`,
                    backgroundImage: `url(${customTemplateUrl || templateImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onClick={() => setSelectedElement(null)}
                  data-testid="coa-canvas"
                >
                  {textElements.map(renderTextElement)}
                  {imageElements.map(renderImageElement)}
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* COA Preview with Real Artwork */}
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Eye className="w-4 h-4" /> Generate COA Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Select Artwork</Label>
                <Select
                  value={selectedArtworkId || ""}
                  onValueChange={(value) => setSelectedArtworkId(value)}
                >
                  <SelectTrigger data-testid="select-artwork-preview">
                    <SelectValue placeholder="Choose an artwork..." />
                  </SelectTrigger>
                  <SelectContent>
                    {limitedEditionArtworks.map((artwork: any) => (
                      <SelectItem key={artwork.id} value={artwork.id}>
                        {artwork.title} - {artwork.artistName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={handleGeneratePreview} 
                disabled={!selectedArtworkId || isGeneratingPreview}
                className="w-full"
                data-testid="button-generate-preview"
              >
                {isGeneratingPreview ? "Generating..." : "Generate Preview"}
              </Button>
              {previewUrl && (
                <div className="mt-4">
                  <img 
                    src={previewUrl} 
                    alt="COA Preview" 
                    className="w-full rounded-lg border"
                    data-testid="img-coa-preview"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Layout Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Layout Name</Label>
                <Input
                  value={layoutName}
                  onChange={(e) => setLayoutName(e.target.value)}
                  placeholder="Layout name"
                  data-testid="input-layout-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Background Color</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="w-12 h-9 p-1 cursor-pointer"
                    data-testid="input-bg-color"
                  />
                  <Input
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="flex-1"
                    data-testid="input-bg-color-hex"
                  />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Template Image</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleTemplateUpload}
                  disabled={isUploadingTemplate}
                  data-testid="input-template-upload"
                />
                {isUploadingTemplate && (
                  <p className="text-xs text-muted-foreground">Uploading template...</p>
                )}
                {customTemplateUrl && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Custom template uploaded</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCustomTemplateUrl(null)}
                      data-testid="button-remove-template"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Use Default Template
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Type className="w-4 h-4" /> Elements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="text">
                <TabsList className="w-full">
                  <TabsTrigger value="text" className="flex-1" data-testid="tab-text">Text</TabsTrigger>
                  <TabsTrigger value="images" className="flex-1" data-testid="tab-images">Images</TabsTrigger>
                </TabsList>
                
                <TabsContent value="text" className="mt-4">
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2">
                      {textElements.map(el => (
                        <div
                          key={el.id}
                          className={`p-2 rounded cursor-pointer flex items-center justify-between ${selectedElement === el.id ? 'bg-primary/10' : 'hover:bg-muted'}`}
                          onClick={() => setSelectedElement(el.id)}
                          data-testid={`element-list-${el.id}`}
                        >
                          <span className="text-sm truncate flex-1">{el.label}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateTextElement(el.id, { visible: !el.visible });
                            }}
                            data-testid={`toggle-visibility-${el.id}`}
                          >
                            {el.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="images" className="mt-4">
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2">
                      {imageElements.map(el => (
                        <div
                          key={el.id}
                          className={`p-2 rounded cursor-pointer flex items-center justify-between ${selectedElement === el.id ? 'bg-primary/10' : 'hover:bg-muted'}`}
                          onClick={() => setSelectedElement(el.id)}
                          data-testid={`element-list-${el.id}`}
                        >
                          <span className="text-sm truncate flex-1">{el.label}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateImageElement(el.id, { visible: !el.visible });
                            }}
                            data-testid={`toggle-visibility-${el.id}`}
                          >
                            {el.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {selectedTextElement && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{selectedTextElement.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Content</Label>
                  <Input
                    value={selectedTextElement.content}
                    onChange={(e) => updateTextElement(selectedTextElement.id, { content: e.target.value })}
                    data-testid="input-content"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Font Family</Label>
                  <Select
                    value={selectedTextElement.fontFamily}
                    onValueChange={(value) => updateTextElement(selectedTextElement.id, { fontFamily: value })}
                  >
                    <SelectTrigger data-testid="select-font-family">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GOOGLE_FONTS.map(font => (
                        <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                          {font}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Font Size ({selectedTextElement.fontSize}px)</Label>
                    <Slider
                      value={[selectedTextElement.fontSize]}
                      onValueChange={([value]) => updateTextElement(selectedTextElement.id, { fontSize: value })}
                      min={6}
                      max={72}
                      step={1}
                      data-testid="slider-font-size"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Font Weight</Label>
                    <Select
                      value={selectedTextElement.fontWeight.toString()}
                      onValueChange={(value) => updateTextElement(selectedTextElement.id, { fontWeight: parseInt(value) })}
                    >
                      <SelectTrigger data-testid="select-font-weight">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="400">Regular (400)</SelectItem>
                        <SelectItem value="500">Medium (500)</SelectItem>
                        <SelectItem value="600">Semibold (600)</SelectItem>
                        <SelectItem value="700">Bold (700)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Style</Label>
                    <Select
                      value={selectedTextElement.fontStyle}
                      onValueChange={(value: "normal" | "italic") => updateTextElement(selectedTextElement.id, { fontStyle: value })}
                    >
                      <SelectTrigger data-testid="select-font-style">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="italic">Italic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Alignment</Label>
                    <Select
                      value={selectedTextElement.textAlign}
                      onValueChange={(value: "left" | "center" | "right") => updateTextElement(selectedTextElement.id, { textAlign: value })}
                    >
                      <SelectTrigger data-testid="select-text-align">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={selectedTextElement.color}
                      onChange={(e) => updateTextElement(selectedTextElement.id, { color: e.target.value })}
                      className="w-12 h-9 p-1 cursor-pointer"
                      data-testid="input-text-color"
                    />
                    <Input
                      value={selectedTextElement.color}
                      onChange={(e) => updateTextElement(selectedTextElement.id, { color: e.target.value })}
                      className="flex-1"
                      data-testid="input-text-color-hex"
                    />
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Move className="w-4 h-4" /> Position & Size</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">X (%)</Label>
                      <Input
                        type="number"
                        value={selectedTextElement.x.toFixed(1)}
                        onChange={(e) => updateTextElement(selectedTextElement.id, { x: parseFloat(e.target.value) || 0 })}
                        min={0}
                        max={100}
                        step={0.5}
                        data-testid="input-pos-x"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Y (%)</Label>
                      <Input
                        type="number"
                        value={selectedTextElement.y.toFixed(1)}
                        onChange={(e) => updateTextElement(selectedTextElement.id, { y: parseFloat(e.target.value) || 0 })}
                        min={0}
                        max={100}
                        step={0.5}
                        data-testid="input-pos-y"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Width (%)</Label>
                      <Input
                        type="number"
                        value={selectedTextElement.width.toFixed(1)}
                        onChange={(e) => updateTextElement(selectedTextElement.id, { width: parseFloat(e.target.value) || 1 })}
                        min={1}
                        max={100}
                        step={0.5}
                        data-testid="input-width"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Height (%)</Label>
                      <Input
                        type="number"
                        value={selectedTextElement.height.toFixed(1)}
                        onChange={(e) => updateTextElement(selectedTextElement.id, { height: parseFloat(e.target.value) || 1 })}
                        min={1}
                        max={100}
                        step={0.5}
                        data-testid="input-height"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Letter Spacing ({selectedTextElement.letterSpacing}px)</Label>
                    <Slider
                      value={[selectedTextElement.letterSpacing]}
                      onValueChange={([value]) => updateTextElement(selectedTextElement.id, { letterSpacing: value })}
                      min={-2}
                      max={10}
                      step={0.5}
                      data-testid="slider-letter-spacing"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Line Height ({selectedTextElement.lineHeight.toFixed(1)})</Label>
                    <Slider
                      value={[selectedTextElement.lineHeight]}
                      onValueChange={([value]) => updateTextElement(selectedTextElement.id, { lineHeight: value })}
                      min={0.8}
                      max={2.5}
                      step={0.1}
                      data-testid="slider-line-height"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {selectedImageElement && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{selectedImageElement.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Object Fit</Label>
                  <Select
                    value={selectedImageElement.objectFit}
                    onValueChange={(value: "contain" | "cover" | "fill") => updateImageElement(selectedImageElement.id, { objectFit: value })}
                  >
                    <SelectTrigger data-testid="select-object-fit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contain">Contain</SelectItem>
                      <SelectItem value="cover">Cover</SelectItem>
                      <SelectItem value="fill">Fill</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Move className="w-4 h-4" /> Position & Size</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">X (%)</Label>
                      <Input
                        type="number"
                        value={selectedImageElement.x.toFixed(1)}
                        onChange={(e) => updateImageElement(selectedImageElement.id, { x: parseFloat(e.target.value) || 0 })}
                        min={0}
                        max={100}
                        step={0.5}
                        data-testid="input-img-pos-x"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Y (%)</Label>
                      <Input
                        type="number"
                        value={selectedImageElement.y.toFixed(1)}
                        onChange={(e) => updateImageElement(selectedImageElement.id, { y: parseFloat(e.target.value) || 0 })}
                        min={0}
                        max={100}
                        step={0.5}
                        data-testid="input-img-pos-y"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Width (%)</Label>
                      <Input
                        type="number"
                        value={selectedImageElement.width.toFixed(1)}
                        onChange={(e) => updateImageElement(selectedImageElement.id, { width: parseFloat(e.target.value) || 1 })}
                        min={1}
                        max={100}
                        step={0.5}
                        data-testid="input-img-width"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Height (%)</Label>
                      <Input
                        type="number"
                        value={selectedImageElement.height.toFixed(1)}
                        onChange={(e) => updateImageElement(selectedImageElement.id, { height: parseFloat(e.target.value) || 1 })}
                        min={1}
                        max={100}
                        step={0.5}
                        data-testid="input-img-height"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
