import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, GripVertical, Package, Globe, Filter, Image, Upload, X, ChevronDown, ChevronUp, Copy } from "lucide-react";
import type { ProductAddon, AddonVariant, AddonDisplayCondition, AddonVariantImage } from "@shared/schema";

type AddonWithVariants = ProductAddon & { variants: AddonVariant[] };
type BulkImageStatus = { [frameType: string]: string | null };

const FRAME_TYPES = [
  { value: "black", label: "Black Frame" },
  { value: "white", label: "White Frame" },
  { value: "natural", label: "Natural Frame" },
  { value: "oak", label: "Oak Frame" },
];

const BOX_FRAME_SLUGS = ["box-frame", "box-frame-upgrade", "boxframe"];

const SHOPIFY_COUNTRIES = [
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "CZ", name: "Czech Republic" },
  { code: "GR", name: "Greece" },
  { code: "HU", name: "Hungary" },
  { code: "RO", name: "Romania" },
  { code: "BG", name: "Bulgaria" },
  { code: "HR", name: "Croatia" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "EE", name: "Estonia" },
  { code: "LV", name: "Latvia" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MT", name: "Malta" },
  { code: "CY", name: "Cyprus" },
  { code: "IS", name: "Iceland" },
  { code: "JP", name: "Japan" },
  { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "IL", name: "Israel" },
];

function isBoxFrameAddon(addon: ProductAddon): boolean {
  const slug = addon.slug?.toLowerCase() || "";
  const name = addon.name?.toLowerCase() || "";
  return BOX_FRAME_SLUGS.some(s => slug.includes(s)) || name.includes("box frame");
}

function BulkFrameImages({ addon }: { addon: AddonWithVariants }) {
  const { toast } = useToast();
  const [bulkImages, setBulkImages] = useState<BulkImageStatus>({});
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadAndCopyMutation = useMutation({
    mutationFn: async ({ file, frameType }: { file: File; frameType: string }) => {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("frameType", frameType);
      
      const firstVariant = addon.variants[0];
      if (!firstVariant) throw new Error("No variants");
      
      const uploadRes = await fetch(`/api/admin/addon-variants/${firstVariant.id}/images`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      
      if (!uploadRes.ok) throw new Error("Upload failed");
      const uploadedImage = await uploadRes.json();
      
      const copyRes = await apiRequest("POST", `/api/admin/addons/${addon.id}/copy-image-to-variants`, { imageUrl: uploadedImage.imageUrl, frameType });
      const copyData = await copyRes.json();
      
      return { imageUrl: uploadedImage.imageUrl, count: copyData.count };
    },
    onSuccess: (data, variables) => {
      setBulkImages(prev => ({ ...prev, [variables.frameType]: data.imageUrl }));
      addon.variants.forEach(v => {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/admin/addon-variants", v.id, "images"] 
        });
      });
      toast({ title: `Image applied to all ${addon.variants.length} size variants` });
      setUploadingFor(null);
    },
    onError: (error: Error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploadingFor(null);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && uploadingFor) {
      uploadAndCopyMutation.mutate({ file, frameType: uploadingFor });
    }
  };

  const triggerUpload = (frameType: string) => {
    setUploadingFor(frameType);
    setTimeout(() => fileInputRef.current?.click(), 0);
  };

  return (
    <div className="mb-6 p-4 bg-muted/30 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Copy className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Bulk Frame Images</span>
        <Badge variant="outline" className="text-xs">All sizes</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Upload once to apply the same image to all size variants for each frame color.
      </p>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {FRAME_TYPES.map((frame) => {
          const existingImage = bulkImages[frame.value];
          return (
            <div key={frame.value} className="space-y-2">
              <Label className="text-xs">{frame.label}</Label>
              <div className="relative aspect-square border-2 border-dashed rounded-lg overflow-hidden group">
                {existingImage ? (
                  <>
                    <img
                      src={existingImage}
                      alt={frame.label}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => triggerUpload(frame.value)}
                        disabled={uploadAndCopyMutation.isPending}
                      >
                        <Upload className="w-3 h-3 mr-1" />
                        Replace
                      </Button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => triggerUpload(frame.value)}
                    disabled={uploadAndCopyMutation.isPending}
                    className="w-full h-full flex flex-col items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {uploadAndCopyMutation.isPending && uploadingFor === frame.value ? (
                      <span className="text-xs">Uploading...</span>
                    ) : (
                      <>
                        <Upload className="w-6 h-6 mb-1" />
                        <span className="text-xs">Upload to all</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BulkSingleImage({ addon }: { addon: AddonWithVariants }) {
  const { toast } = useToast();
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadAndCopyMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("frameType", "default");
      
      const firstVariant = addon.variants[0];
      if (!firstVariant) throw new Error("No variants");
      
      const uploadRes = await fetch(`/api/admin/addon-variants/${firstVariant.id}/images`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      
      if (!uploadRes.ok) throw new Error("Upload failed");
      const uploadedImage = await uploadRes.json();
      
      const copyRes = await apiRequest("POST", `/api/admin/addons/${addon.id}/copy-image-to-variants`, { 
        imageUrl: uploadedImage.imageUrl, 
        frameType: "default" 
      });
      const copyData = await copyRes.json();
      
      return { imageUrl: uploadedImage.imageUrl, count: copyData.count };
    },
    onSuccess: (data) => {
      setCurrentImage(data.imageUrl);
      addon.variants.forEach(v => {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/admin/addon-variants", v.id, "images"] 
        });
      });
      toast({ title: `Image applied to all ${addon.variants.length} pricing tiers` });
      setIsUploading(false);
    },
    onError: (error: Error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setIsUploading(false);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      uploadAndCopyMutation.mutate(file);
    }
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="mb-6 p-4 bg-muted/30 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Image className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Addon Image</span>
        <Badge variant="outline" className="text-xs">All tiers</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Upload an image to apply to all pricing tiers for this addon.
      </p>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="flex items-start gap-4">
        <div className="relative w-24 h-24 border-2 border-dashed rounded-lg overflow-hidden group">
          {currentImage ? (
            <>
              <img
                src={currentImage}
                alt={addon.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={triggerUpload}
                  disabled={uploadAndCopyMutation.isPending}
                >
                  <Upload className="w-3 h-3 mr-1" />
                  Replace
                </Button>
              </div>
            </>
          ) : (
            <button
              onClick={triggerUpload}
              disabled={uploadAndCopyMutation.isPending}
              className="w-full h-full flex flex-col items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              {uploadAndCopyMutation.isPending ? (
                <span className="text-xs">Uploading...</span>
              ) : (
                <>
                  <Upload className="w-6 h-6 mb-1" />
                  <span className="text-xs text-center">Upload image</span>
                </>
              )}
            </button>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          <p className="mb-1">This image will appear in the add-on selector widget.</p>
          <p>Recommended: 4:3 landscape ratio</p>
        </div>
      </div>
    </div>
  );
}

function WidgetPreview() {
  const [selectedSize, setSelectedSize] = useState("A3 - 11.7\" x 16.5\"");
  const [selectedFrame, setSelectedFrame] = useState("Black Frame");
  const [selectedMount, setSelectedMount] = useState("No");
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());

  const sizes = [
    "A4 - 8.27\" x 11.67\"",
    "A3 - 11.7\" x 16.5\"",
    "A2 - 16.5\" x 23.4\"",
    "20\" x 28\" (50cm x 70cm)",
    "A1 - 23.4\" x 33.1\"",
    "A0 - 33.1\" x 46.8\"",
  ];

  const frames = [
    { name: "Black Frame", color: "#1a1a1a" },
    { name: "White Frame", color: "#f5f5f5" },
    { name: "Natural Frame", color: "#c4a574" },
    { name: "Unframed", color: null },
  ];

  const mounts = ["Yes", "No"];

  const { data: addonsData = [] } = useQuery<AddonWithVariants[]>({
    queryKey: ["/api/admin/addons"],
  });

  const isUnframed = selectedFrame === "Unframed";

  const toggleAddon = (addonId: string) => {
    setSelectedAddons(prev => {
      const next = new Set(prev);
      if (next.has(addonId)) {
        next.delete(addonId);
      } else {
        next.add(addonId);
      }
      return next;
    });
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="bg-muted/30 border rounded-lg p-4 mb-4">
        <p className="text-xs text-muted-foreground">This preview replicates your Shopify variant picker design</p>
      </div>

      <div className="bg-background border rounded-lg p-6 space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Sample Artwork</h2>
          <p className="text-lg font-medium">£125.00</p>
        </div>

        {/* Size Option - Block style pills */}
        <fieldset className="space-y-3">
          <div className="flex items-center gap-2">
            <legend className="text-sm font-normal">Size:</legend>
            <span className="text-sm text-muted-foreground">{selectedSize}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {sizes.map(size => (
              <label
                key={size}
                className={`
                  relative flex items-center justify-center px-4 h-10 text-sm cursor-pointer
                  bg-white border rounded transition-all
                  ${selectedSize === size 
                    ? "border-foreground shadow-[inset_0_0_0_1px_currentColor]" 
                    : "border-border/40 hover:border-border/60"
                  }
                `}
                data-testid={`preview-size-${size}`}
              >
                <input
                  type="radio"
                  name="preview-size"
                  value={size}
                  checked={selectedSize === size}
                  onChange={() => setSelectedSize(size)}
                  className="sr-only"
                />
                {size}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Frame Option - Image boxes with label below */}
        <fieldset className="space-y-3">
          <div className="flex items-center gap-2">
            <legend className="text-sm font-normal">Frame:</legend>
            <span className="text-sm text-muted-foreground">{selectedFrame}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {frames.map(frame => (
              <label
                key={frame.name}
                className={`
                  relative flex flex-col items-center justify-between cursor-pointer
                  bg-white border rounded overflow-hidden transition-all
                  h-[50px] w-[66px]
                  ${selectedFrame === frame.name 
                    ? "border-foreground shadow-[inset_0_0_0_1px_currentColor]" 
                    : "border-border/40 hover:border-border/60"
                  }
                `}
                data-testid={`preview-frame-${frame.name}`}
              >
                <input
                  type="radio"
                  name="preview-frame"
                  value={frame.name}
                  checked={selectedFrame === frame.name}
                  onChange={() => {
                    setSelectedFrame(frame.name);
                    if (frame.name === "Unframed") {
                      setSelectedMount("No");
                    }
                  }}
                  className="sr-only"
                />
                <div 
                  className="flex-1 w-full flex items-center justify-center"
                  style={{ backgroundColor: frame.color || '#f0f0f0' }}
                >
                  {!frame.color && (
                    <span className="text-[10px] text-muted-foreground">None</span>
                  )}
                </div>
                <span className="text-[11px] py-0.5 px-1 text-center w-full truncate">
                  {frame.name.replace(" Frame", "")}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Mount Option - Split bar (segmented control) */}
        <fieldset className="space-y-3">
          <div className="flex items-center gap-2">
            <legend className="text-sm font-normal">Mount:</legend>
            <span className="text-sm text-muted-foreground">{selectedMount}</span>
          </div>
          <div className="flex">
            {mounts.map((mount, idx) => (
              <label
                key={mount}
                className={`
                  relative flex items-center justify-center flex-1 h-10 text-sm cursor-pointer
                  bg-white border transition-all
                  ${idx === 0 ? "rounded-l -mr-px" : ""}
                  ${idx === mounts.length - 1 ? "rounded-r" : ""}
                  ${selectedMount === mount 
                    ? "border-foreground z-10 text-foreground" 
                    : "border-border/40 text-muted-foreground hover:text-foreground"
                  }
                `}
                data-testid={`preview-mount-${mount}`}
              >
                <input
                  type="radio"
                  name="preview-mount"
                  value={mount}
                  checked={selectedMount === mount}
                  onChange={() => setSelectedMount(mount)}
                  className="sr-only"
                />
                {mount}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Add-ons section - matches ess-addons widget styling */}
        <fieldset className="space-y-3">
          <div className="flex items-center gap-2">
            <legend className="text-sm font-normal">Upgrades:</legend>
            <span className="text-sm text-muted-foreground">
              {selectedAddons.size === 0 ? "None selected" : `${selectedAddons.size} selected`}
            </span>
          </div>
          
          <div className="flex flex-wrap gap-3">
            {addonsData
              .filter(addon => addon.isActive)
              .filter(addon => !(addon.slug === "box-frame" && isUnframed))
              .map(addon => {
                const isSelected = selectedAddons.has(addon.id);
                const variant = addon.variants?.[0];
                const price = variant?.price ? `+£${(variant.price / 100).toFixed(2)}` : "";
              
                return (
                  <label
                    key={addon.id}
                    className={`
                      relative flex items-center gap-3 cursor-pointer transition-all
                      bg-white border rounded h-[50px] px-4 flex-1 min-w-[200px]
                      ${isSelected 
                        ? "border-foreground shadow-[inset_0_0_0_1px_currentColor]" 
                        : "border-border/40 hover:border-border/60"
                      }
                    `}
                    data-testid={`preview-addon-${addon.id}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleAddon(addon.id)}
                      className="sr-only"
                    />
                    <div className={`
                      w-[18px] h-[18px] rounded-[3px] border flex items-center justify-center transition-all flex-shrink-0
                      ${isSelected 
                        ? "bg-foreground border-foreground" 
                        : "bg-white border-border/50"
                      }
                    `}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <span className="text-sm">{addon.name}</span>
                      {addon.slug === "box-frame" && (
                        <Badge variant="secondary" className="text-[10px] uppercase">Premium</Badge>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">{price}</span>
                    <div className="w-10 h-10 bg-muted rounded flex items-center justify-center flex-shrink-0">
                      <Image className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </label>
                );
              })}
          </div>
        </fieldset>
      </div>
    </div>
  );
}

export default function ProductAddons() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("hierarchy");

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/addon-variants/sync-prices", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-option-sets"] });
      if (data.updated > 0) {
        toast({ 
          title: `Synced ${data.updated} variants from Shopify`,
          description: data.results?.slice(0, 5).map((r: any) => `${r.name}: ${r.change}`).join("\n"),
        });
      } else if (data.failed > 0) {
        toast({ 
          title: `${data.failed} variants could not be matched`,
          variant: "destructive",
        });
      } else {
        toast({ title: "All variants are up to date" });
      }
    },
    onError: () => {
      toast({ title: "Failed to sync", variant: "destructive" });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Product Add-ons</h1>
          <p className="text-muted-foreground">
            Manage upgrade options like Box Frames and Paper Upgrades
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          data-testid="button-sync"
        >
          {syncMutation.isPending ? "Syncing..." : "Sync"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="hierarchy" data-testid="tab-hierarchy">Option Sets</TabsTrigger>
          <TabsTrigger value="preview" data-testid="tab-preview">Preview</TabsTrigger>
        </TabsList>

      <TabsContent value="hierarchy" className="mt-4">
        <OptionSetsManager />
      </TabsContent>

      <TabsContent value="preview" className="mt-4">
        <WidgetPreview />
      </TabsContent>
    </Tabs>
    </div>
  );
}

function VariantRow({ 
  variant, 
  addon, 
  isExpanded, 
  onToggle 
}: { 
  variant: AddonVariant; 
  addon: AddonWithVariants;
  isExpanded: boolean; 
  onToggle: () => void;
}) {
  const isBoxFrame = isBoxFrameAddon(addon);

  const { data: images = [] } = useQuery<AddonVariantImage[]>({
    queryKey: ["/api/admin/addon-variants", variant.id, "images"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/addon-variants/${variant.id}/images`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch images");
      return res.json();
    },
  });

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover-elevate"
        onClick={onToggle}
        data-testid={`variant-row-${variant.id}`}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="font-medium">{variant.name}</span>
          </div>
          {images.length > 0 && (
            <Badge variant="outline" className="text-xs">
              <Image className="w-3 h-3 mr-1" />
              {images.length} {images.length === 1 ? "image" : "images"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground max-w-md truncate">
            {variant.sizePatterns?.slice(0, 5).join(", ")}
            {variant.sizePatterns && variant.sizePatterns.length > 5 && "..."}
          </span>
          <span className="font-medium text-primary">
            {variant.currency === "GBP" ? "£" : variant.currency === "EUR" ? "€" : "$"}
            {variant.price}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 border-t bg-background">
          <VariantImageManager
            variant={variant}
            images={images}
            isBoxFrame={isBoxFrame}
          />
        </div>
      )}
    </div>
  );
}

function VariantImageManager({
  variant,
  images,
  isBoxFrame,
}: {
  variant: AddonVariant;
  images: AddonVariantImage[];
  isBoxFrame: boolean;
}) {
  const { toast } = useToast();
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async ({ file, frameType }: { file: File; frameType: string | null }) => {
      const formData = new FormData();
      formData.append("image", file);
      if (frameType) {
        formData.append("frameType", frameType);
      }
      
      const res = await fetch(`/api/admin/addon-variants/${variant.id}/images`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/admin/addon-variants", variant.id, "images"] 
      });
      toast({ title: "Image uploaded" });
      setUploadingFor(null);
    },
    onError: (error: Error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploadingFor(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (imageId: string) => {
      return apiRequest("DELETE", `/api/admin/addon-variant-images/${imageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/admin/addon-variants", variant.id, "images"] 
      });
      toast({ title: "Image deleted" });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, frameType: string | null) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate({ file, frameType });
    }
  };

  const triggerUpload = (frameType: string | null) => {
    setUploadingFor(frameType);
    fileInputRef.current?.click();
  };

  const getImageForFrame = (frameType: string | null) => {
    return images.find(img => img.frameType === frameType);
  };

  if (isBoxFrame) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Image className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Frame-specific Images</span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Upload different images for each frame color. These will be shown to customers when they select a frame.
        </p>
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e, uploadingFor)}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {FRAME_TYPES.map((frame) => {
            const existingImage = getImageForFrame(frame.value);
            return (
              <div key={frame.value} className="space-y-2">
                <Label className="text-xs">{frame.label}</Label>
                <div className="relative aspect-square border-2 border-dashed rounded-lg overflow-hidden group">
                  {existingImage ? (
                    <>
                      <img
                        src={existingImage.imageUrl}
                        alt={frame.label}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => triggerUpload(frame.value)}
                          disabled={uploadMutation.isPending}
                        >
                          <Upload className="w-3 h-3 mr-1" />
                          Replace
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteMutation.mutate(existingImage.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <button
                      onClick={() => triggerUpload(frame.value)}
                      disabled={uploadMutation.isPending}
                      className="w-full h-full flex flex-col items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                    >
                      <Upload className="w-6 h-6 mb-1" />
                      <span className="text-xs">Upload</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const defaultImage = getImageForFrame(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Image className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Variant Image</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Upload an image to show customers when this upgrade option is available.
      </p>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileSelect(e, null)}
      />

      <div className="w-32">
        <div className="relative aspect-square border-2 border-dashed rounded-lg overflow-hidden group">
          {defaultImage ? (
            <>
              <img
                src={defaultImage.imageUrl}
                alt="Variant"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setUploadingFor(null);
                    fileInputRef.current?.click();
                  }}
                  disabled={uploadMutation.isPending}
                >
                  <Upload className="w-3 h-3 mr-1" />
                  Replace
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteMutation.mutate(defaultImage.id)}
                  disabled={deleteMutation.isPending}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </>
          ) : (
            <button
              onClick={() => {
                setUploadingFor(null);
                fileInputRef.current?.click();
              }}
              disabled={uploadMutation.isPending}
              className="w-full h-full flex flex-col items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
            >
              <Upload className="w-6 h-6 mb-1" />
              <span className="text-xs">Upload</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddonForm({ addon, onSave }: { addon: AddonWithVariants | null; onSave: () => void }) {
  const { toast } = useToast();
  const isEditing = !!addon;
  
  const [formData, setFormData] = useState({
    name: addon?.name || "",
    slug: addon?.slug || "",
    description: addon?.description || "",
    specs: addon?.specs || "",
    imageUrl: addon?.imageUrl || "",
    shopifyProductId: addon?.shopifyProductId || "",
    shopifyProductHandle: addon?.shopifyProductHandle || "",
    displayOrder: addon?.displayOrder || 0,
    isActive: addon?.isActive ?? true,
    conditionLogic: addon?.conditionLogic || "all",
    allowedCountries: addon?.allowedCountries || [] as string[],
    allowedProductIds: addon?.allowedProductIds?.join(", ") || "",
    displayConditions: addon?.displayConditions || [],
  });

  const toggleCountry = (code: string) => {
    setFormData(prev => ({
      ...prev,
      allowedCountries: prev.allowedCountries.includes(code)
        ? prev.allowedCountries.filter(c => c !== code)
        : [...prev.allowedCountries, code]
    }));
  };

  const selectAllCountries = () => {
    setFormData(prev => ({
      ...prev,
      allowedCountries: SHOPIFY_COUNTRIES.map(c => c.code)
    }));
  };

  const clearAllCountries = () => {
    setFormData(prev => ({
      ...prev,
      allowedCountries: []
    }));
  };

  const [variants, setVariants] = useState<Partial<AddonVariant>[]>(
    addon?.variants || []
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...formData,
        allowedCountries: formData.allowedCountries.length > 0 ? formData.allowedCountries : null,
        allowedProductIds: formData.allowedProductIds
          ? formData.allowedProductIds.split(",").map((s) => s.trim()).filter(Boolean)
          : null,
        variants: variants.map((v) => {
          const { createdAt, updatedAt, id, addonId, ...rest } = v as AddonVariant & { createdAt?: unknown; updatedAt?: unknown };
          return {
            ...rest,
            sizePatterns: typeof v.sizePatterns === "string"
              ? (v.sizePatterns as string).split(",").map((s: string) => s.trim())
              : v.sizePatterns,
          };
        }),
      };

      if (isEditing) {
        return apiRequest("PUT", `/api/admin/addons/${addon.id}`, payload);
      } else {
        return apiRequest("POST", "/api/admin/addons", payload);
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? "Add-on updated" : "Add-on created" });
      onSave();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addVariant = () => {
    setVariants([
      ...variants,
      {
        name: "",
        shopifyVariantId: "",
        price: "0.00",
        currency: "GBP",
        sizePatterns: [],
        displayOrder: variants.length,
        isActive: true,
      },
    ]);
  };

  const updateVariant = (index: number, field: string, value: unknown) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    setVariants(updated);
  };

  const removeVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  return (
    <Tabs defaultValue="basic" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="basic">Basic Info</TabsTrigger>
        <TabsTrigger value="pricing">Pricing Tiers</TabsTrigger>
        <TabsTrigger value="conditions">Display Rules</TabsTrigger>
      </TabsList>

      <TabsContent value="basic" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Box Frame Upgrade"
              data-testid="input-addon-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              placeholder="box-frame"
              data-testid="input-addon-slug"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Premium deep-set box frame with ash wood finish"
            data-testid="input-addon-description"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="specs">Specs (pipe-separated)</Label>
          <Input
            id="specs"
            value={formData.specs}
            onChange={(e) => setFormData({ ...formData, specs: e.target.value })}
            placeholder="e.g. 99% UV protection | <1% reflection | Shatter-resistant"
            data-testid="input-addon-specs"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="shopifyProductId">Shopify Product ID</Label>
            <Input
              id="shopifyProductId"
              value={formData.shopifyProductId}
              onChange={(e) => setFormData({ ...formData, shopifyProductId: e.target.value })}
              placeholder="15079516209529"
              data-testid="input-shopify-product-id"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shopifyProductHandle">Shopify Handle</Label>
            <Input
              id="shopifyProductHandle"
              value={formData.shopifyProductHandle}
              onChange={(e) => setFormData({ ...formData, shopifyProductHandle: e.target.value })}
              placeholder="box-frame-upgrade"
              data-testid="input-shopify-handle"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="imageUrl">Image URL (optional)</Label>
          <Input
            id="imageUrl"
            value={formData.imageUrl}
            onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
            placeholder="https://cdn.shopify.com/..."
            data-testid="input-image-url"
          />
        </div>
      </TabsContent>

      <TabsContent value="pricing" className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Pricing Tiers</h3>
          <Button variant="outline" size="sm" onClick={addVariant} data-testid="button-add-variant">
            <Plus className="w-4 h-4 mr-2" />
            Add Tier
          </Button>
        </div>

        <div className="space-y-4">
          {variants.map((variant, index) => (
            <Card key={index}>
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Tier {index + 1}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeVariant(index)}
                    data-testid={`button-remove-variant-${index}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={variant.name || ""}
                      onChange={(e) => updateVariant(index, "name", e.target.value)}
                      placeholder="Tier 1 - Small"
                      data-testid={`input-variant-name-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Shopify Variant ID</Label>
                    <Input
                      value={variant.shopifyVariantId || ""}
                      onChange={(e) => updateVariant(index, "shopifyVariantId", e.target.value)}
                      placeholder="44891607679225"
                      data-testid={`input-variant-shopify-id-${index}`}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Price</Label>
                    <Input
                      value={variant.price || ""}
                      onChange={(e) => updateVariant(index, "price", e.target.value)}
                      placeholder="40.00"
                      data-testid={`input-variant-price-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select
                      value={variant.currency || "GBP"}
                      onValueChange={(v) => updateVariant(index, "currency", v)}
                    >
                      <SelectTrigger data-testid={`select-variant-currency-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GBP">GBP</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Size Patterns (comma-separated)</Label>
                  <Input
                    value={
                      Array.isArray(variant.sizePatterns)
                        ? variant.sizePatterns.join(", ")
                        : variant.sizePatterns || ""
                    }
                    onChange={(e) => updateVariant(index, "sizePatterns", e.target.value)}
                    placeholder='T, S, A5, A4, 8" X 10", 8" X 12"'
                    data-testid={`input-variant-sizes-${index}`}
                  />
                  <p className="text-xs text-muted-foreground">
                    This tier shows when the variant size matches any of these patterns
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}

          {variants.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              No pricing tiers yet. Add a tier to define size-based pricing.
            </p>
          )}
        </div>
      </TabsContent>

      <TabsContent value="conditions" className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Allowed Countries</Label>
            <div className="flex gap-2">
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={selectAllCountries}
              >
                Select All
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={clearAllCountries}
              >
                Clear All
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {formData.allowedCountries.length === 0 
              ? "No countries selected - shows in all countries" 
              : `${formData.allowedCountries.length} countries selected`}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-64 overflow-y-auto p-2 border rounded-lg">
            {SHOPIFY_COUNTRIES.map((country) => (
              <label 
                key={country.code}
                className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={formData.allowedCountries.includes(country.code)}
                  onChange={() => toggleCountry(country.code)}
                  className="rounded border-input"
                  data-testid={`checkbox-country-${country.code}`}
                />
                <span className="text-sm">{country.code}</span>
                <span className="text-xs text-muted-foreground truncate">{country.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="allowedProductIds">Allowed Product IDs (comma-separated)</Label>
          <Input
            id="allowedProductIds"
            value={formData.allowedProductIds}
            onChange={(e) => setFormData({ ...formData, allowedProductIds: e.target.value })}
            placeholder="8547629015211, 8547629015212 (leave empty for all products)"
            data-testid="input-allowed-products"
          />
          <p className="text-xs text-muted-foreground">
            Shopify product IDs that can show this add-on. Leave empty for all products.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Condition Logic</Label>
          <Select
            value={formData.conditionLogic}
            onValueChange={(v) => setFormData({ ...formData, conditionLogic: v })}
          >
            <SelectTrigger data-testid="select-condition-logic">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All conditions must match</SelectItem>
              <SelectItem value="any">Any condition can match</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="p-4 bg-muted/50 rounded-lg">
          <h4 className="font-medium mb-2">Display Conditions</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Control when this add-on appears based on the selected variant
          </p>
          
          <ConditionBuilder
            conditions={formData.displayConditions}
            onChange={(conditions) => setFormData({ ...formData, displayConditions: conditions })}
          />
        </div>
      </TabsContent>

      <div className="flex justify-end gap-2 pt-4 border-t mt-4">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-addon"
        >
          {saveMutation.isPending ? "Saving..." : isEditing ? "Update Add-on" : "Create Add-on"}
        </Button>
      </div>
    </Tabs>
  );
}

function ConditionBuilder({
  conditions,
  onChange,
}: {
  conditions: AddonDisplayCondition[];
  onChange: (conditions: AddonDisplayCondition[]) => void;
}) {
  const addCondition = () => {
    onChange([
      ...conditions,
      { field: "shopify_variant", operator: "contains", value: "" },
    ]);
  };

  const updateCondition = (index: number, field: keyof AddonDisplayCondition, value: string) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const removeCondition = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {conditions.map((condition, index) => (
        <div key={index} className="flex gap-2 items-center">
          <Select
            value={condition.field}
            onValueChange={(v) => updateCondition(index, "field", v)}
          >
            <SelectTrigger className="w-[180px]" data-testid={`select-condition-field-${index}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shopify_variant">Variant</SelectItem>
              <SelectItem value="size">Size</SelectItem>
              <SelectItem value="frame">Frame</SelectItem>
              <SelectItem value="metafield:custom.has_mount">Metafield: has_mount</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={condition.operator}
            onValueChange={(v) => updateCondition(index, "operator", v)}
          >
            <SelectTrigger className="w-[140px]" data-testid={`select-condition-operator-${index}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contains">Contains</SelectItem>
              <SelectItem value="not_contains">Does not contain</SelectItem>
              <SelectItem value="equals">Equals</SelectItem>
            </SelectContent>
          </Select>

          <Input
            value={condition.value}
            onChange={(e) => updateCondition(index, "value", e.target.value)}
            placeholder="Value"
            className="flex-1"
            data-testid={`input-condition-value-${index}`}
          />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => removeCondition(index)}
            data-testid={`button-remove-condition-${index}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={addCondition}
        data-testid="button-add-condition"
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Condition
      </Button>
    </div>
  );
}

type AddonOptionSet = {
  id: string;
  name: string;
  description: string | null;
  allowedCountries: string[];
  displayType: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

type AddonGroup = {
  id: string;
  optionSetId: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  shopifyProductId: string | null;
  shopifyProductHandle: string | null;
  isActive: boolean;
  displayOrder: number;
  displayConditions: AddonDisplayCondition[] | null;
  conditionLogic: string;
  createdAt: string;
  updatedAt: string;
};

type AddonGroupWithVariants = AddonGroup & { variants?: AddonVariant[] };
type AddonOptionSetWithGroups = AddonOptionSet & { groups?: AddonGroupWithVariants[] };

function OptionSetsManager() {
  const { toast } = useToast();
  const [selectedOptionSet, setSelectedOptionSet] = useState<string | null>(null);
  const [isOptionSetDialogOpen, setIsOptionSetDialogOpen] = useState(false);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [isVariantDialogOpen, setIsVariantDialogOpen] = useState(false);
  const [editingOptionSet, setEditingOptionSet] = useState<AddonOptionSet | null>(null);
  const [editingGroup, setEditingGroup] = useState<AddonGroup | null>(null);
  const [editingVariant, setEditingVariant] = useState<AddonVariant | null>(null);
  const [editingVariantGroupId, setEditingVariantGroupId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const { data: optionSets = [], isLoading } = useQuery<AddonOptionSet[]>({
    queryKey: ["/api/admin/addon-option-sets"],
  });

  const { data: selectedOptionSetData } = useQuery<AddonOptionSetWithGroups>({
    queryKey: ["/api/admin/addon-option-sets", selectedOptionSet],
    enabled: !!selectedOptionSet,
  });

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const createOptionSetMutation = useMutation({
    mutationFn: async (data: Partial<AddonOptionSet>) => {
      return apiRequest("POST", "/api/admin/addon-option-sets", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-option-sets"] });
      setIsOptionSetDialogOpen(false);
      toast({ title: "Option set created" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create option set", description: error.message, variant: "destructive" });
    },
  });

  const updateOptionSetMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AddonOptionSet> }) => {
      return apiRequest("PATCH", `/api/admin/addon-option-sets/${id}`, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-option-sets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-option-sets", variables.id] });
      setIsOptionSetDialogOpen(false);
      toast({ title: "Option set updated" });
    },
  });

  const deleteOptionSetMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/addon-option-sets/${id}`);
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-option-sets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-option-sets", deletedId] });
      if (selectedOptionSet === deletedId) setSelectedOptionSet(null);
      toast({ title: "Option set deleted" });
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: async (data: Partial<AddonGroup>) => {
      return apiRequest("POST", "/api/admin/addon-groups", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-option-sets", selectedOptionSet] });
      setIsGroupDialogOpen(false);
      toast({ title: "Group created" });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AddonGroup> }) => {
      return apiRequest("PATCH", `/api/admin/addon-groups/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-option-sets", selectedOptionSet] });
      setIsGroupDialogOpen(false);
      toast({ title: "Group updated" });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/addon-groups/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-option-sets", selectedOptionSet] });
      toast({ title: "Group deleted" });
    },
  });

  const createVariantMutation = useMutation({
    mutationFn: async (data: Partial<AddonVariant>) => {
      return apiRequest("POST", "/api/admin/addon-variants", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-option-sets", selectedOptionSet] });
      setIsVariantDialogOpen(false);
      toast({ title: "Variant created" });
    },
  });

  const updateVariantMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AddonVariant> }) => {
      return apiRequest("PATCH", `/api/admin/addon-variants/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-option-sets", selectedOptionSet] });
      setIsVariantDialogOpen(false);
      toast({ title: "Variant updated" });
    },
  });

  const deleteVariantMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/addon-variants/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-option-sets", selectedOptionSet] });
      toast({ title: "Variant deleted" });
    },
  });

  if (isLoading) {
    return <div className="p-4">Loading option sets...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Hierarchical Add-on Structure</h2>
          <p className="text-sm text-muted-foreground">
            Option Sets (countries) → Groups (frame colors) → Variants (sizes)
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingOptionSet(null);
            setIsOptionSetDialogOpen(true);
          }}
          data-testid="button-add-option-set"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Option Set
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Option Sets</CardTitle>
            <CardDescription>Country-based groups</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {optionSets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No option sets yet</p>
            ) : (
              optionSets.map((os) => (
                <div
                  key={os.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedOptionSet === os.id ? "bg-accent border-accent" : "hover-elevate"
                  }`}
                  onClick={() => setSelectedOptionSet(os.id)}
                  data-testid={`option-set-${os.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{os.name}</span>
                        {os.displayType === 'toggle' && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Yes/No</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {os.allowedCountries?.join(", ") || "All countries"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingOptionSet(os);
                          setIsOptionSetDialogOpen(true);
                        }}
                        data-testid={`edit-option-set-${os.id}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Delete this option set?")) {
                            deleteOptionSetMutation.mutate(os.id);
                          }
                        }}
                        data-testid={`delete-option-set-${os.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  {selectedOptionSetData?.name || "Select an Option Set"}
                </CardTitle>
                <CardDescription>
                  {selectedOptionSetData?.description || "Groups and their variants"}
                </CardDescription>
              </div>
              {selectedOptionSet && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingGroup(null);
                    setIsGroupDialogOpen(true);
                  }}
                  data-testid="button-add-group"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Group
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedOptionSet ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Select an option set to view its groups
              </p>
            ) : !selectedOptionSetData?.groups?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No groups in this option set yet
              </p>
            ) : (
              <div className="space-y-2">
                {selectedOptionSetData.groups.map((group) => (
                  <div
                    key={group.id}
                    className="border rounded-lg overflow-hidden"
                    data-testid={`group-${group.id}`}
                  >
                    <div
                      className="p-4 cursor-pointer hover-elevate flex items-center gap-3"
                      onClick={() => toggleGroupExpand(group.id)}
                    >
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${
                          expandedGroups.has(group.id) ? "" : "-rotate-90"
                        }`}
                      />
                      {group.imageUrl && (
                        <img
                          src={group.imageUrl}
                          alt={group.name}
                          className="w-10 h-10 rounded object-cover"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium flex items-center gap-2">
                          {group.name}
                          {!group.isActive && <Badge variant="secondary">Inactive</Badge>}
                          <Badge variant="outline" className="text-xs">
                            {group.variants?.length || 0} variants
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          Slug: {group.slug} | Shopify: {group.shopifyProductHandle || "N/A"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingGroup(group);
                            setIsGroupDialogOpen(true);
                          }}
                          data-testid={`edit-group-${group.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Delete this group?")) {
                              deleteGroupMutation.mutate(group.id);
                            }
                          }}
                          data-testid={`delete-group-${group.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {expandedGroups.has(group.id) && (
                      <div className="border-t bg-muted/30">
                        <div className="p-3 space-y-2">
                          {group.variants && group.variants.length > 0 ? (
                            group.variants.map((variant) => (
                              <div
                                key={variant.id}
                                className="flex items-center justify-between p-2 rounded bg-background border"
                                data-testid={`variant-${variant.id}`}
                              >
                                <div className="flex items-center gap-2">
                                  <Package className="w-4 h-4 text-muted-foreground" />
                                  <div>
                                    <div className="text-sm font-medium">{variant.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {variant.currency} {variant.price} | ID: {variant.shopifyVariantId}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Sizes: {variant.sizePatterns?.join(", ") || "None"}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setEditingVariant(variant);
                                      setEditingVariantGroupId(group.id);
                                      setIsVariantDialogOpen(true);
                                    }}
                                    data-testid={`edit-variant-${variant.id}`}
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      if (confirm("Delete this variant?")) {
                                        deleteVariantMutation.mutate(variant.id);
                                      }
                                    }}
                                    data-testid={`delete-variant-${variant.id}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-2">
                              No variants in this group
                            </p>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              setEditingVariant(null);
                              setEditingVariantGroupId(group.id);
                              setIsVariantDialogOpen(true);
                            }}
                            data-testid={`add-variant-${group.id}`}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Variant
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isOptionSetDialogOpen} onOpenChange={setIsOptionSetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOptionSet ? "Edit Option Set" : "Create Option Set"}</DialogTitle>
            <DialogDescription>Option sets group add-ons by country/region</DialogDescription>
          </DialogHeader>
          <OptionSetForm
            optionSet={editingOptionSet}
            onSave={(data) => {
              if (editingOptionSet) {
                updateOptionSetMutation.mutate({ id: editingOptionSet.id, data });
              } else {
                createOptionSetMutation.mutate(data);
              }
            }}
            isPending={createOptionSetMutation.isPending || updateOptionSetMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Edit Group" : "Create Group"}</DialogTitle>
            <DialogDescription>Groups organize variants by frame color or upgrade type</DialogDescription>
          </DialogHeader>
          <GroupForm
            group={editingGroup}
            optionSetId={selectedOptionSet || ""}
            onSave={(data) => {
              if (editingGroup) {
                updateGroupMutation.mutate({ id: editingGroup.id, data });
              } else {
                createGroupMutation.mutate(data);
              }
            }}
            isPending={createGroupMutation.isPending || updateGroupMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isVariantDialogOpen} onOpenChange={setIsVariantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingVariant ? "Edit Variant" : "Create Variant"}</DialogTitle>
            <DialogDescription>Each variant represents a size tier with unique pricing</DialogDescription>
          </DialogHeader>
          <VariantForm
            variant={editingVariant}
            groupId={editingVariantGroupId || ""}
            shopifyProductId={
              selectedOptionSetData?.groups?.find(g => g.id === editingVariantGroupId)?.shopifyProductId || ""
            }
            onSave={(data) => {
              if (editingVariant) {
                updateVariantMutation.mutate({ id: editingVariant.id, data });
              } else {
                createVariantMutation.mutate(data);
              }
            }}
            isPending={createVariantMutation.isPending || updateVariantMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OptionSetForm({
  optionSet,
  onSave,
  isPending,
}: {
  optionSet: AddonOptionSet | null;
  onSave: (data: Partial<AddonOptionSet>) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(optionSet?.name || "");
  const [description, setDescription] = useState(optionSet?.description || "");
  const [countries, setCountries] = useState<string[]>(optionSet?.allowedCountries || []);
  const [displayType, setDisplayType] = useState(optionSet?.displayType || "checkbox");

  useEffect(() => {
    setName(optionSet?.name || "");
    setDescription(optionSet?.description || "");
    setCountries(optionSet?.allowedCountries || []);
    setDisplayType(optionSet?.displayType || "checkbox");
  }, [optionSet]);

  const toggleCountry = (code: string) => {
    setCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Box Frame Option Set"
          data-testid="input-option-set-name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          data-testid="input-option-set-description"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="displayType">Display Type</Label>
        <Select value={displayType} onValueChange={setDisplayType}>
          <SelectTrigger data-testid="select-display-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="checkbox">Checkbox (image cards)</SelectItem>
            <SelectItem value="toggle">Toggle (Yes/No buttons)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Checkbox shows image cards with descriptions. Toggle shows a simple Yes/No split button.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Allowed Countries</Label>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border rounded-md">
          {SHOPIFY_COUNTRIES.map((country) => (
            <Badge
              key={country.code}
              variant={countries.includes(country.code) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleCountry(country.code)}
              data-testid={`country-${country.code}`}
            >
              {country.code}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Selected: {countries.length > 0 ? countries.join(", ") : "All countries"}
        </p>
      </div>

      <Button
        onClick={() => onSave({ name, description, allowedCountries: countries, displayType })}
        disabled={!name || isPending}
        data-testid="button-save-option-set"
      >
        {isPending ? "Saving..." : optionSet ? "Update" : "Create"}
      </Button>
    </div>
  );
}

function GroupForm({
  group,
  optionSetId,
  onSave,
  isPending,
}: {
  group: AddonGroup | null;
  optionSetId: string;
  onSave: (data: Partial<AddonGroup>) => void;
  isPending: boolean;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(group?.name || "");
  const [slug, setSlug] = useState(group?.slug || "");
  const [description, setDescription] = useState(group?.description || "");
  const [specs, setSpecs] = useState(group?.specs || "");
  const [imageUrl, setImageUrl] = useState(group?.imageUrl || "");
  const [shopifyProductId, setShopifyProductId] = useState(group?.shopifyProductId || "");
  const [shopifyProductHandle, setShopifyProductHandle] = useState(group?.shopifyProductHandle || "");
  const [conditions, setConditions] = useState<AddonDisplayCondition[]>(group?.displayConditions || []);
  const [conditionLogic, setConditionLogic] = useState(group?.conditionLogic || "any");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!group?.id) throw new Error("Group must be saved first");
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`/api/admin/addon-groups/${group.id}/upload-image`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: (data) => {
      setImageUrl(data.imageUrl);
      toast({ title: "Image uploaded successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-groups"] });
    },
    onError: () => {
      toast({ title: "Failed to upload image", variant: "destructive" });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImageMutation.mutate(file);
    }
  };

  useEffect(() => {
    setName(group?.name || "");
    setSlug(group?.slug || "");
    setDescription(group?.description || "");
    setSpecs(group?.specs || "");
    setImageUrl(group?.imageUrl || "");
    setShopifyProductId(group?.shopifyProductId || "");
    setShopifyProductHandle(group?.shopifyProductHandle || "");
    setConditions(group?.displayConditions || []);
    setConditionLogic(group?.conditionLogic || "any");
  }, [group]);

  const generateSlug = (text: string) => {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="group-name">Name</Label>
          <Input
            id="group-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!group) setSlug(generateSlug(e.target.value));
            }}
            placeholder="e.g., Black Box Frame"
            data-testid="input-group-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-slug">Slug</Label>
          <Input
            id="group-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="black-box-frame"
            data-testid="input-group-slug"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="group-description">Description</Label>
        <Textarea
          id="group-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          rows={2}
          data-testid="input-group-description"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="group-specs">Specs (pipe-separated)</Label>
        <Input
          id="group-specs"
          value={specs}
          onChange={(e) => setSpecs(e.target.value)}
          placeholder="e.g. 99% UV protection | <1% reflection | Shatter-resistant"
          data-testid="input-group-specs"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="group-image">Image</Label>
        <div className="flex gap-2 items-center">
          <Input
            id="group-image"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://... or upload"
            className="flex-1"
            data-testid="input-group-image"
          />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*"
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={!group?.id || uploadImageMutation.isPending}
            title={!group?.id ? "Save group first to upload" : "Upload image"}
            data-testid="button-upload-group-image"
          >
            {uploadImageMutation.isPending ? (
              <span className="animate-spin">...</span>
            ) : (
              <Upload className="h-4 w-4" />
            )}
          </Button>
          {imageUrl && (
            <>
              <img
                src={imageUrl}
                alt="Preview"
                className="w-10 h-10 rounded object-cover border"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setImageUrl("")}
                title="Remove image"
                data-testid="button-remove-group-image"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
        {!group?.id && (
          <p className="text-xs text-muted-foreground">Save the group first to enable image upload</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="shopify-product-id">Shopify Product ID</Label>
          <Input
            id="shopify-product-id"
            value={shopifyProductId}
            onChange={(e) => setShopifyProductId(e.target.value)}
            placeholder="15079516209529"
            data-testid="input-shopify-product-id"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="shopify-handle">Shopify Handle</Label>
          <Input
            id="shopify-handle"
            value={shopifyProductHandle}
            onChange={(e) => setShopifyProductHandle(e.target.value)}
            placeholder="option-set-1180177-buttons-1"
            data-testid="input-shopify-handle"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Condition Logic</Label>
        <Select value={conditionLogic} onValueChange={setConditionLogic}>
          <SelectTrigger data-testid="select-group-condition-logic">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All conditions must match</SelectItem>
            <SelectItem value="any">Any condition can match</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="p-3 bg-muted/50 rounded-lg">
        <Label className="text-sm font-medium mb-2 block">Display Conditions</Label>
        <ConditionBuilder conditions={conditions} onChange={setConditions} />
      </div>

      <Button
        onClick={() =>
          onSave({
            optionSetId,
            name,
            slug,
            description,
            specs: specs || null,
            imageUrl: imageUrl || null,
            shopifyProductId,
            shopifyProductHandle,
            displayConditions: conditions,
            conditionLogic,
          })
        }
        disabled={!name || !slug || isPending}
        data-testid="button-save-group"
      >
        {isPending ? "Saving..." : group ? "Update" : "Create"}
      </Button>
    </div>
  );
}

function VariantForm({
  variant,
  groupId,
  shopifyProductId,
  onSave,
  isPending,
}: {
  variant: AddonVariant | null;
  groupId: string;
  shopifyProductId: string;
  onSave: (data: Partial<AddonVariant>) => void;
  isPending: boolean;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(variant?.name || "");
  const [shopifyVariantId, setShopifyVariantId] = useState(variant?.shopifyVariantId || "");
  const [price, setPrice] = useState(variant?.price || "0.00");
  const [currency, setCurrency] = useState(variant?.currency || "GBP");
  const [sizePatterns, setSizePatterns] = useState(variant?.sizePatterns?.join(", ") || "");

  const { data: shopifyVariants = [], isLoading: loadingVariants } = useQuery<{ id: string; title: string; price: string }[]>({
    queryKey: ["/api/admin/shopify/products", shopifyProductId, "variants"],
    queryFn: async () => {
      if (!shopifyProductId) return [];
      const res = await fetch(`/api/admin/shopify/products/${shopifyProductId}/variants`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!shopifyProductId,
  });

  const handleSelectShopifyVariant = (variantId: string) => {
    setShopifyVariantId(variantId);
    const selected = shopifyVariants.find(v => v.id === variantId);
    if (selected) {
      setPrice(selected.price);
      toast({ title: "Variant selected", description: `${selected.title} - £${selected.price}` });
    }
  };

  useEffect(() => {
    setName(variant?.name || "");
    setShopifyVariantId(variant?.shopifyVariantId || "");
    setPrice(variant?.price || "0.00");
    setCurrency(variant?.currency || "GBP");
    setSizePatterns(variant?.sizePatterns?.join(", ") || "");
  }, [variant]);

  // Sync price from Shopify when variants load and there's already a selected variant
  useEffect(() => {
    if (shopifyVariants.length > 0 && shopifyVariantId) {
      const selected = shopifyVariants.find(v => v.id === shopifyVariantId);
      if (selected) {
        setPrice(selected.price);
      }
    }
  }, [shopifyVariants, shopifyVariantId]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="variant-name">Name</Label>
        <Input
          id="variant-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Frame Upgrade - Tier 1"
          data-testid="input-variant-name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="variant-shopify-id">Shopify Variant</Label>
        {shopifyProductId && shopifyVariants.length > 0 ? (
          <Select value={shopifyVariantId} onValueChange={handleSelectShopifyVariant}>
            <SelectTrigger data-testid="select-shopify-variant">
              <SelectValue placeholder={loadingVariants ? "Loading..." : "Select a Shopify variant"} />
            </SelectTrigger>
            <SelectContent>
              {shopifyVariants.map((sv) => (
                <SelectItem key={sv.id} value={sv.id}>
                  {sv.title} - £{sv.price}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id="variant-shopify-id"
            value={shopifyVariantId}
            onChange={(e) => setShopifyVariantId(e.target.value)}
            placeholder={shopifyProductId ? "Loading variants..." : "Set Shopify Product ID on the group first"}
            className="flex-1"
            data-testid="input-variant-shopify-id"
            disabled={!shopifyProductId}
          />
        )}
        <p className="text-xs text-muted-foreground">
          {shopifyVariantId ? `Selected: ${shopifyVariantId}` : "Select a variant from the dropdown"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="variant-price">Price</Label>
          <Input
            id="variant-price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="40.00"
            data-testid="input-variant-price"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="variant-currency">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger data-testid="select-variant-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GBP">GBP</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="AUD">AUD</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="variant-sizes">Size Patterns</Label>
        <Textarea
          id="variant-sizes"
          value={sizePatterns}
          onChange={(e) => setSizePatterns(e.target.value)}
          placeholder="A4, 8&quot; X 12&quot;, 8&quot; X 10&quot;, 11&quot; X 14&quot;"
          rows={2}
          data-testid="input-variant-sizes"
        />
        <p className="text-xs text-muted-foreground">Comma-separated list of sizes this variant applies to</p>
      </div>

      <Button
        onClick={() =>
          onSave({
            groupId,
            name,
            shopifyVariantId,
            price,
            currency,
            sizePatterns: sizePatterns.split(",").map((s) => s.trim()).filter(Boolean),
          })
        }
        disabled={!name || !shopifyVariantId || isPending}
        data-testid="button-save-variant"
      >
        {isPending ? "Saving..." : variant ? "Update" : "Create"}
      </Button>
    </div>
  );
}
