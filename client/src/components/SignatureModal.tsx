import { useState, useRef, useEffect, useCallback } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pen, Upload, Type, X, CheckCircle2 } from "lucide-react";
import type { FormCopy } from "@shared/schema";

interface SignatureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (signatureDataUrl: string) => void;
  existingSignature?: string;
  copy?: Partial<FormCopy>;
}

const SIGNATURE_FONTS = [
  { name: "Dancing Script", style: "'Dancing Script', cursive" },
  { name: "Great Vibes", style: "'Great Vibes', cursive" },
  { name: "Allura", style: "'Allura', cursive" },
  { name: "Parisienne", style: "'Parisienne', cursive" },
];

export function SignatureModal({ open, onOpenChange, onSave, existingSignature, copy }: SignatureModalProps) {
  const [activeTab, setActiveTab] = useState<"draw" | "upload" | "type">("draw");
  const [typedName, setTypedName] = useState("");
  const [selectedFont, setSelectedFont] = useState(SIGNATURE_FONTS[0]);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const signatureRef = useRef<SignatureCanvas>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typedCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (open) {
      SIGNATURE_FONTS.forEach((font) => {
        const fontName = font.name;
        const fontId = `signature-font-${fontName.replace(/\s+/g, "-")}`;
        if (document.getElementById(fontId)) return;
        
        const link = document.createElement("link");
        link.id = fontId;
        link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, "+")}:wght@400&display=swap`;
        link.rel = "stylesheet";
        document.head.appendChild(link);
      });
    }
  }, [open]);

  const clearDrawing = () => {
    signatureRef.current?.clear();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearUpload = () => {
    setUploadedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const renderTypedSignature = useCallback((): string | null => {
    if (!typedName.trim()) return null;
    
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 150;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = `48px ${selectedFont.style}`;
    ctx.fillStyle = "black";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillText(typedName, canvas.width / 2, canvas.height / 2);

    return canvas.toDataURL("image/png");
  }, [typedName, selectedFont]);

  const handleSave = () => {
    let signatureData: string | null = null;

    switch (activeTab) {
      case "draw":
        if (signatureRef.current && !signatureRef.current.isEmpty()) {
          signatureData = signatureRef.current.toDataURL("image/png");
        }
        break;
      case "upload":
        signatureData = uploadedImage;
        break;
      case "type":
        signatureData = renderTypedSignature();
        break;
    }

    if (signatureData) {
      onSave(signatureData);
      onOpenChange(false);
      setTypedName("");
      setUploadedImage(null);
      signatureRef.current?.clear();
    }
  };

  const isValid = (): boolean => {
    switch (activeTab) {
      case "draw":
        return signatureRef.current ? !signatureRef.current.isEmpty() : false;
      case "upload":
        return !!uploadedImage;
      case "type":
        return !!typedName.trim();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copy?.signatureModalTitle || "Add Your Signature"}</DialogTitle>
          <DialogDescription>
            {copy?.signatureModalDescription || "Choose how you'd like to add your signature. You can draw, upload an image, or type your name."}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "draw" | "upload" | "type")}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="draw" className="flex items-center gap-1.5" data-testid="tab-draw-signature">
              <Pen className="w-4 h-4" />
              <span className="hidden sm:inline">Draw</span>
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-1.5" data-testid="tab-upload-signature">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Upload</span>
            </TabsTrigger>
            <TabsTrigger value="type" className="flex items-center gap-1.5" data-testid="tab-type-signature">
              <Type className="w-4 h-4" />
              <span className="hidden sm:inline">Type</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="draw" className="space-y-4">
            <div className="border-2 border-input rounded-lg overflow-hidden bg-white">
              <SignatureCanvas
                ref={signatureRef}
                canvasProps={{
                  className: "w-full h-48 cursor-crosshair",
                  style: { touchAction: "none" },
                }}
                data-testid="signature-canvas-modal"
              />
            </div>
            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearDrawing}
                data-testid="button-clear-drawing"
              >
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
              <p className="text-xs text-muted-foreground self-center">
                {copy?.signatureDrawHelpText || "Draw your signature using your mouse or finger"}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="upload" className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              onChange={handleFileChange}
              className="hidden"
              data-testid="input-upload-signature"
            />
            
            {uploadedImage ? (
              <div className="space-y-3">
                <div className="border-2 border-input rounded-lg p-4 bg-white flex items-center justify-center min-h-48">
                  <img
                    src={uploadedImage}
                    alt="Uploaded signature"
                    className="max-h-40 max-w-full object-contain"
                    data-testid="img-uploaded-signature"
                  />
                </div>
                <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearUpload}
                    data-testid="button-clear-upload"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Remove
                  </Button>
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="w-4 h-4" />
                    Image uploaded
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-input rounded-lg p-8 text-center cursor-pointer hover-elevate transition-colors min-h-48 flex flex-col items-center justify-center"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-upload-signature-area"
              >
                <Upload className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium">Click to upload an image</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {copy?.signatureUploadHelpText || "PNG or JPG only"}
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="type" className="space-y-4">
            <div className="space-y-3">
              <Input
                placeholder="Type your full name"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                className="h-12"
                data-testid="input-type-signature"
              />
              
              <div className="flex flex-wrap gap-2">
                {SIGNATURE_FONTS.map((font) => (
                  <button
                    key={font.name}
                    type="button"
                    onClick={() => setSelectedFont(font)}
                    className={`px-3 py-2 rounded-md border text-lg transition-colors ${
                      selectedFont.name === font.name
                        ? "border-primary bg-primary/5"
                        : "border-input hover-elevate"
                    }`}
                    style={{ fontFamily: font.style }}
                    data-testid={`button-font-${font.name.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    Aa
                  </button>
                ))}
              </div>

              <div className="border-2 border-input rounded-lg p-6 bg-white min-h-32 flex items-center justify-center">
                {typedName ? (
                  <p
                    className="text-4xl text-center"
                    style={{ fontFamily: selectedFont.style }}
                    data-testid="text-typed-signature-preview"
                  >
                    {typedName}
                  </p>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {copy?.signatureTypeHelpText || "Your signature will appear here"}
                  </p>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
            data-testid="button-cancel-signature"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="flex-1"
            data-testid="button-save-signature-modal"
          >
            Save Signature
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
