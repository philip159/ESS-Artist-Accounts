import { useQuery, useMutation } from "@tanstack/react-query";
import { Image as ImageIcon, Search, Download, CheckSquare, Square, ChevronDown, ChevronRight, X, Trash2, Link2, Unlink, Edit, CloudOff, RefreshCw, Cloud, Loader2, FolderDown, AlertCircle, CheckCircle2, Store, Mail, Eye, Ban, View, Undo2, Video, Play, LayoutTemplate } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, apiRequestLong } from "@/lib/queryClient";
import type { Artwork, Template, Mockup } from "@shared/schema";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FramedMockup } from "@/components/FramedMockup";
import { MockupCustomizer } from "@/components/MockupCustomizer";
import { ARPreview } from "@/components/ARPreview";
import { Settings } from "lucide-react";

function ArtworkThumbnail({ 
  artwork, 
  size = "sm",
  onClick 
}: { 
  artwork: { lowResFileUrl: string | null; originalFileUrl: string | null; title: string }; 
  size?: "sm" | "md";
  onClick?: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const sizeClasses = size === "sm" ? "w-12 h-12" : "w-16 h-16";
  const iconSize = size === "sm" ? "w-6 h-6" : "w-8 h-8";
  
  const imgSrc = artwork.lowResFileUrl || artwork.originalFileUrl;
  const showImage = imgSrc && !imgError;
  
  return (
    <button
      onClick={onClick}
      className={`${sizeClasses} bg-muted rounded overflow-hidden flex-shrink-0 hover-elevate`}
    >
      {showImage ? (
        <img
          src={imgSrc}
          alt={artwork.title}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className={`${iconSize} text-muted-foreground`} />
        </div>
      )}
    </button>
  );
}

function InlineEditTitle({ artworkId, title }: { artworkId: string; title: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => { setValue(title); }, [title]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === title) {
      setValue(title);
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/artworks/${artworkId}`, { title: trimmed });
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      toast({ title: "Title updated" });
      setEditing(false);
    } catch (err: any) {
      toast({ title: "Failed to update title", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") { setValue(title); setEditing(false); }
          }}
          onBlur={save}
          disabled={saving}
          className="h-7 text-sm font-semibold"
          data-testid={`input-title-${artworkId}`}
        />
        {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground flex-shrink-0" />}
      </div>
    );
  }

  return (
    <h4
      className="group/title font-semibold truncate cursor-pointer hover:text-foreground/70"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      title="Click to edit title"
      data-testid={`text-title-${artworkId}`}
    >
      {title}
      <Edit className="w-3 h-3 inline-block ml-1 text-muted-foreground invisible group-hover/title:visible" />
    </h4>
  );
}

const MOUNT_PREVIEW_W = 120;
const MOUNT_PREVIEW_H = 160;
const FRAME_COLORS: Record<string, string> = {
  black: "#1a1a1a",
  white: "#e8e5e0",
  natural: "#c4a882",
};
const MOUNT_COLOR = "#f5f2ed";
const FRAME_WIDTH_MM = 21;

const PRINT_SIZES: { key: string; wMm: number; hMm: number; label: string }[] = [
  { key: "6x8", wMm: 152, hMm: 203, label: '6" x 8"' },
  { key: "8x10", wMm: 203, hMm: 254, label: '8" x 10"' },
  { key: "a4", wMm: 210, hMm: 297, label: "A4" },
  { key: "8x12", wMm: 203, hMm: 305, label: '8" x 12"' },
  { key: "10x10", wMm: 254, hMm: 254, label: '10" x 10"' },
  { key: "11x14", wMm: 279, hMm: 356, label: '11" x 14"' },
  { key: "a3", wMm: 297, hMm: 420, label: "A3" },
  { key: "12x12", wMm: 305, hMm: 305, label: '12" x 12"' },
  { key: "12x16", wMm: 305, hMm: 406, label: '12" x 16"' },
  { key: "12x18", wMm: 305, hMm: 457, label: '12" x 18"' },
  { key: "16x16", wMm: 406, hMm: 406, label: '16" x 16"' },
  { key: "16x20", wMm: 406, hMm: 508, label: '16" x 20"' },
  { key: "a2", wMm: 420, hMm: 594, label: "A2" },
  { key: "18x24", wMm: 457, hMm: 610, label: '18" x 24"' },
  { key: "20x20", wMm: 508, hMm: 508, label: '20" x 20"' },
  { key: "20x28", wMm: 508, hMm: 711, label: '20" x 28"' },
  { key: "20x30", wMm: 508, hMm: 762, label: '20" x 30"' },
  { key: "a1", wMm: 594, hMm: 841, label: "A1" },
  { key: "24x32", wMm: 610, hMm: 813, label: '24" x 32"' },
  { key: "24x36", wMm: 610, hMm: 914, label: '24" x 36"' },
  { key: "28x40", wMm: 711, hMm: 1016, label: '28" x 40"' },
  { key: "30x30", wMm: 762, hMm: 762, label: '30" x 30"' },
  { key: "30x40", wMm: 762, hMm: 1016, label: '30" x 40"' },
  { key: "a0", wMm: 841, hMm: 1189, label: "A0" },
];

function getMountBorderMm(wMm: number, hMm: number): number {
  const shorter = Math.min(wMm, hMm);
  const longer = Math.max(wMm, hMm);
  if (shorter <= 254 && longer <= 254) return 25;
  if (shorter <= 279 && longer <= 356) return 40;
  return 50;
}

function findMatchedSizes(availableSizes: string[]): typeof PRINT_SIZES {
  const normalised = availableSizes.map(s =>
    s.replace(/["\u201C\u201D\u2033\s]/g, "").toLowerCase()
  );
  const matched: typeof PRINT_SIZES = [];
  for (const ps of PRINT_SIZES) {
    if (normalised.some(s => s.includes(ps.key))) {
      matched.push(ps);
    }
  }
  matched.sort((a, b) => (a.wMm * a.hMm) - (b.wMm * b.hMm));
  return matched;
}

function MountFrameCanvas({
  artworkUrl,
  withMount,
  printSize,
  frameColor,
}: {
  artworkUrl: string;
  withMount: boolean;
  printSize: { wMm: number; hMm: number };
  frameColor: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    imgRef.current = null;
    setImageLoaded(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { imgRef.current = img; setImageLoaded(true); };
    img.src = artworkUrl;
  }, [artworkUrl]);

  useEffect(() => {
    if (!imageLoaded || !imgRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = MOUNT_PREVIEW_W * dpr;
    canvas.height = MOUNT_PREVIEW_H * dpr;
    canvas.style.width = MOUNT_PREVIEW_W + "px";
    canvas.style.height = MOUNT_PREVIEW_H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, MOUNT_PREVIEW_W, MOUNT_PREVIEW_H);

    const imgW = imgRef.current.naturalWidth;
    const imgH = imgRef.current.naturalHeight;
    const imgRatio = imgW / imgH;

    const isLandscape = imgRatio > 1;
    const printWMm = isLandscape ? Math.max(printSize.wMm, printSize.hMm) : Math.min(printSize.wMm, printSize.hMm);
    const printHMm = isLandscape ? Math.min(printSize.wMm, printSize.hMm) : Math.max(printSize.wMm, printSize.hMm);

    const mountMm = withMount ? getMountBorderMm(printWMm, printHMm) : 0;
    const totalFramedW = printWMm + mountMm * 2 + FRAME_WIDTH_MM * 2;
    const totalFramedH = printHMm + mountMm * 2 + FRAME_WIDTH_MM * 2;
    const framedRatio = totalFramedW / totalFramedH;

    const maxW = MOUNT_PREVIEW_W - 16;
    const maxH = MOUNT_PREVIEW_H - 16;
    let frameOuterW: number, frameOuterH: number;
    if (framedRatio > maxW / maxH) {
      frameOuterW = maxW;
      frameOuterH = maxW / framedRatio;
    } else {
      frameOuterH = maxH;
      frameOuterW = maxH * framedRatio;
    }

    const frameX = (MOUNT_PREVIEW_W - frameOuterW) / 2;
    const frameY = (MOUNT_PREVIEW_H - frameOuterH) / 2;
    const scale = frameOuterW / totalFramedW;
    const frameBorderPx = FRAME_WIDTH_MM * scale;
    const mountBorderPx = mountMm * scale;

    ctx.fillStyle = frameColor;
    ctx.fillRect(frameX, frameY, frameOuterW, frameOuterH);

    if (withMount) {
      const mountX = frameX + frameBorderPx;
      const mountY = frameY + frameBorderPx;
      const mountW = frameOuterW - frameBorderPx * 2;
      const mountH = frameOuterH - frameBorderPx * 2;
      ctx.fillStyle = MOUNT_COLOR;
      ctx.fillRect(mountX, mountY, mountW, mountH);

      const apertureX = mountX + mountBorderPx;
      const apertureY = mountY + mountBorderPx;
      const apertureW = mountW - mountBorderPx * 2;
      const innerShadowDepth = 2;
      const grad = ctx.createLinearGradient(apertureX, apertureY - innerShadowDepth, apertureX, apertureY + innerShadowDepth);
      grad.addColorStop(0, "rgba(0,0,0,0.12)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(apertureX, apertureY - innerShadowDepth, apertureW, innerShadowDepth * 2);
    }

    const artX = frameX + frameBorderPx + mountBorderPx;
    const artY = frameY + frameBorderPx + mountBorderPx;
    const artW = frameOuterW - (frameBorderPx + mountBorderPx) * 2;
    const artH = frameOuterH - (frameBorderPx + mountBorderPx) * 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(artX, artY, artW, artH);
    ctx.clip();

    const img = imgRef.current;
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    const drawRatio = img.naturalWidth / img.naturalHeight;
    if (drawRatio > artW / artH) {
      sw = img.naturalHeight * (artW / artH);
      sx = (img.naturalWidth - sw) / 2;
    } else {
      sh = img.naturalWidth / (artW / artH);
      sy = (img.naturalHeight - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, artX, artY, artW, artH);
    ctx.restore();

    if (!withMount) {
      const lipWidth = 1.5;
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(artX, artY, artW, lipWidth);
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(artX, artY, lipWidth, artH);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(artX, artY + artH - lipWidth, artW, lipWidth);
      ctx.fillRect(artX + artW - lipWidth, artY, lipWidth, artH);
    }
  }, [imageLoaded, withMount, printSize, frameColor]);

  return (
    <div style={{ width: MOUNT_PREVIEW_W, height: MOUNT_PREVIEW_H }} className="border rounded-md bg-muted/30 flex items-center justify-center">
      {!imageLoaded ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : (
        <canvas ref={canvasRef} />
      )}
    </div>
  );
}

interface PendingMockupItem {
  id: string;
  dropboxPath: string;
  filename: string;
  parsedArtworkName: string | null;
  parsedArtistName: string | null;
  frameType: string;
  isLifestyle: boolean;
  previewUrl: string | null;
}

interface ArtworkPendingGroup {
  artworkId: string;
  artworkTitle: string;
  artistName: string;
  pendingMockups: PendingMockupItem[];
}

interface PendingMockupsResult {
  artworkGroups: ArtworkPendingGroup[];
  unmatchedPendingMockups: PendingMockupItem[];
  totalPending: number;
}

interface ArtworkGroup {
  uploadBatchId: string;
  uploadedAt: Date;
  artworks: Artwork[];
}

export default function Artworks() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"pending" | "submitted">("pending");
  const [selectedArtworkIds, setSelectedArtworkIds] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [viewingArtwork, setViewingArtwork] = useState<Artwork | null>(null);
  const [editingSizesArtwork, setEditingSizesArtwork] = useState<Artwork | null>(null);
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showImportMockupsDialog, setShowImportMockupsDialog] = useState(false);
  const [customizeMockupArtwork, setCustomizeMockupArtwork] = useState<Artwork | null>(null);
  const [pendingMockupsData, setPendingMockupsData] = useState<PendingMockupsResult | null>(null);
  const [selectedPendingMockups, setSelectedPendingMockups] = useState<Map<string, Set<string>>>(new Map());
  const [showNotifyArtistsDialog, setShowNotifyArtistsDialog] = useState(false);
  const [emailPreviewData, setEmailPreviewData] = useState<{
    totalArtists: number;
    totalArtworks: number;
    groups: { 
      artistName: string; 
      email: string; 
      artworks: { id: string; title: string; status?: string }[];
      liveArtworks?: { id: string; title: string }[];
      rejectedArtworks?: { id: string; title: string }[];
    }[];
    skippedMissingEmail?: { id: string; title: string; artistName: string }[];
    emailPreview?: { subject: string; html: string } | null;
  } | null>(null);
  const [showEmailPreviewPane, setShowEmailPreviewPane] = useState(false);
  const [mountPreviewArtwork, setMountPreviewArtwork] = useState<Artwork | null>(null);
  const [mockupPreviewArtwork, setMockupPreviewArtwork] = useState<Artwork | null>(null);
  const [mockupPreviews, setMockupPreviews] = useState<{ frame: string; dataUrl: string; sizeBytes: number }[] | null>(null);
  const [mockupDialogMode, setMockupDialogMode] = useState<"generate" | "view">("generate");
  const [savedMockupsForView, setSavedMockupsForView] = useState<Mockup[] | null>(null);
  const [scanVideoResult, setScanVideoResult] = useState<{ url: string; sizeBytes: number; mockupId?: string } | null>(null);
  const { toast } = useToast();

  const { data: artworks, isLoading } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"],
  });

  const { data: templates } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });

  const { data: mockupSummary } = useQuery<Record<string, { product: number; lifestyle: number; video: number }>>({
    queryKey: ["/api/admin/mockup-summary"],
  });

  const exportMutation = useMutation({
    mutationFn: async (artworkIds: string[]) => {
      return apiRequest("POST", "/api/export-batches", {
        artworkIds,
        generateAI: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/export-batches"] });
      toast({
        title: "Export Started",
        description: "Your export batch is being generated.",
      });
      setSelectedArtworkIds(new Set());
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start export",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (artworkIds: string[]) => {
      await Promise.all(
        artworkIds.map((id) => apiRequest("DELETE", `/api/artworks/${id}`))
      );
    },
    onSuccess: (_, artworkIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      toast({
        title: "Deleted",
        description: `Successfully deleted ${artworkIds.length} artwork${artworkIds.length > 1 ? 's' : ''}`,
      });
      setSelectedArtworkIds(new Set());
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete artworks",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (artworkIds: string[]) => {
      await Promise.all(
        artworkIds.map((id) => apiRequest("PATCH", `/api/artworks/${id}`, { status: "rejected" }))
      );
    },
    onSuccess: (_, artworkIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      toast({
        title: "Rejected",
        description: `Successfully rejected ${artworkIds.length} artwork${artworkIds.length > 1 ? 's' : ''}`,
      });
      setSelectedArtworkIds(new Set());
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject artworks",
        variant: "destructive",
      });
    },
  });

  const unrejectMutation = useMutation({
    mutationFn: async (artworkIds: string[]) => {
      await Promise.all(
        artworkIds.map((id) => apiRequest("PATCH", `/api/artworks/${id}`, { status: "analyzed" }))
      );
    },
    onSuccess: (_, artworkIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      toast({
        title: "Restored",
        description: `Successfully restored ${artworkIds.length} artwork${artworkIds.length > 1 ? 's' : ''}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to restore artworks",
        variant: "destructive",
      });
    },
  });

  const bulkGenerateMockupsMutation = useMutation({
    mutationFn: async (artworkIds: string[]) => {
      const response = await apiRequestLong("POST", "/api/admin/artworks/bulk-generate-mockups", { artworkIds });
      return await response.json();
    },
    onSuccess: (data: { succeeded: number; failed: number; total: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mockup-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      toast({
        title: "Product Mockups Generated",
        description: `${data.succeeded} of ${data.total} artworks processed successfully${data.failed > 0 ? ` (${data.failed} failed)` : ""}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate mockups",
        variant: "destructive",
      });
    },
  });

  const bulkGenerateVideosMutation = useMutation({
    mutationFn: async (artworkIds: string[]) => {
      const response = await apiRequestLong("POST", "/api/admin/artworks/bulk-generate-videos", { artworkIds });
      return await response.json();
    },
    onSuccess: (data: { succeeded: number; failed: number; total: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mockup-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      toast({
        title: "Scan Videos Generated",
        description: `${data.succeeded} of ${data.total} artworks processed successfully${data.failed > 0 ? ` (${data.failed} failed)` : ""}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate videos",
        variant: "destructive",
      });
    },
  });

  const generateScanVideoMutation = useMutation({
    mutationFn: async (artworkId: string) => {
      const response = await apiRequestLong("POST", `/api/admin/artworks/${artworkId}/generate-scan-video`);
      return await response.json();
    },
    onSuccess: (data: { url: string; sizeBytes: number; artworkId: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mockup-summary"] });
      if (mockupPreviewArtwork) {
        setScanVideoResult(data);
      }
      toast({
        title: "Scan Video Generated",
        description: `Video saved (${(data.sizeBytes / 1024 / 1024).toFixed(1)}MB)`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Video Generation Failed",
        description: error.message || "Failed to generate scan video",
        variant: "destructive",
      });
    },
  });

  const generateTemplateMockupsMutation = useMutation({
    mutationFn: async (artworkId: string) => {
      const response = await apiRequestLong("POST", `/api/admin/artworks/${artworkId}/generate-template-mockups`);
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mockups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mockup-summary"] });
      if (mockupPreviewArtwork) {
        queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      }
      toast({
        title: "Template Mockups Generated",
        description: data.succeeded > 0
          ? `${data.succeeded} lifestyle mockup${data.succeeded !== 1 ? 's' : ''} generated${data.failed > 0 ? `, ${data.failed} failed` : ''}.`
          : "No matching templates found for this artwork.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate template mockups",
        variant: "destructive",
      });
    },
  });

  const deleteMockupMutation = useMutation({
    mutationFn: async (mockupId: string) => {
      return apiRequest("DELETE", `/api/mockups/${mockupId}`);
    },
    onSuccess: (_data, mockupId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mockups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mockup-summary"] });
      if (savedMockupsForView) {
        setSavedMockupsForView(savedMockupsForView.filter(m => m.id !== mockupId));
      }
      toast({ title: "Mockup deleted" });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete mockup",
        variant: "destructive",
      });
    },
  });

  const groupMutation = useMutation({
    mutationFn: async ({ artworkIds, primaryId }: { artworkIds: string[], primaryId: string }) => {
      return apiRequest("POST", "/api/artworks/group", { artworkIds, primaryId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      toast({
        title: "Artworks Grouped",
        description: "Selected artworks will now export as a single product",
      });
      setSelectedArtworkIds(new Set());
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to group artworks",
        variant: "destructive",
      });
    },
  });

  const ungroupMutation = useMutation({
    mutationFn: async (artworkIds: string[]) => {
      return apiRequest("POST", "/api/artworks/ungroup", { artworkIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      toast({
        title: "Artworks Ungrouped",
        description: "Selected artworks will now export as separate products",
      });
      setSelectedArtworkIds(new Set());
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to ungroup artworks",
        variant: "destructive",
      });
    },
  });

  const updateSizesMutation = useMutation({
    mutationFn: async ({ artworkId, selectedSizes }: { artworkId: string, selectedSizes: string[] }) => {
      return apiRequest("PATCH", `/api/artworks/${artworkId}/sizes`, { selectedSizes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      toast({
        title: "Sizes Updated",
        description: "Artwork print sizes have been updated",
      });
      setEditingSizesArtwork(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update sizes",
        variant: "destructive",
      });
    },
  });

  const retryDropboxMutation = useMutation({
    mutationFn: async (artworkId: string) => {
      return apiRequest("POST", `/api/artworks/${artworkId}/retry-dropbox`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      toast({
        title: "Dropbox Upload Successful",
        description: "Artwork has been uploaded to Dropbox",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Dropbox Upload Failed",
        description: error.message || "Please check if Dropbox is connected",
        variant: "destructive",
      });
    },
  });

  const previewMockupsMutation = useMutation({
    mutationFn: async (artworkIds: string[]) => {
      const response = await apiRequest("POST", "/api/pending-mockups/for-artworks", {
        artworkIds,
      });
      return await response.json() as PendingMockupsResult;
    },
    onSuccess: (data) => {
      setPendingMockupsData(data);
      const initialSelections = new Map<string, Set<string>>();
      data.artworkGroups.forEach(group => {
        if (group.pendingMockups.length > 0) {
          initialSelections.set(group.artworkId, new Set(group.pendingMockups.map(m => m.id)));
        }
      });
      setSelectedPendingMockups(initialSelections);
      setShowImportMockupsDialog(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Preview Failed",
        description: error.message || "Failed to load pending mockups",
        variant: "destructive",
      });
    },
  });

  const importMockupsMutation = useMutation({
    mutationFn: async (assignments: { artworkId: string; pendingMockupIds: string[] }[]) => {
      const response = await apiRequest("POST", "/api/pending-mockups/bulk-assign", {
        assignments,
      });
      return await response.json();
    },
    onSuccess: (data: { success: boolean; imported: number; errors: string[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mockups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pending-mockups"] });
      setShowImportMockupsDialog(false);
      setPendingMockupsData(null);
      setSelectedPendingMockups(new Map());
      
      let description = `Imported ${data.imported} mockups.`;
      if (data.errors.length > 0) {
        description += ` ${data.errors.length} errors.`;
      }
      toast({
        title: "Import Complete",
        description,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import mockups",
        variant: "destructive",
      });
    },
  });

  const shopifySyncMutation = useMutation({
    mutationFn: async (artworkIds: string[]) => {
      const response = await apiRequestLong("POST", "/api/shopify/sync-batch", {
        artworkIds,
        generateAI: true,
      });
      return await response.json();
    },
    onSuccess: (data: { successful: number; failed: number; skipped?: number; results: any[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      const skippedText = data.skipped ? ` ${data.skipped} skipped (already exist).` : '';
      const failedText = data.failed > 0 ? ` ${data.failed} failed.` : '';
      
      if (data.failed > 0) {
        toast({
          title: "Shopify Sync Completed",
          description: `${data.successful} products synced.${skippedText}${failedText}`,
          variant: data.successful > 0 ? "default" : "destructive",
        });
      } else if (data.skipped && data.successful === 0) {
        toast({
          title: "Shopify Sync Complete",
          description: `All ${data.skipped} products already exist in Shopify.`,
        });
      } else {
        toast({
          title: "Shopify Sync Successful",
          description: `${data.successful} products synced to Shopify.${skippedText}`,
        });
      }
      setSelectedArtworkIds(new Set());
    },
    onError: (error: Error) => {
      toast({
        title: "Shopify Sync Failed",
        description: error.message || "Failed to sync to Shopify",
        variant: "destructive",
      });
    },
  });

  const previewEmailsMutation = useMutation({
    mutationFn: async (artworkIds: string[]) => {
      const response = await apiRequest("POST", "/api/admin/preview-artist-emails", {
        artworkIds,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      setEmailPreviewData(data);
      setShowNotifyArtistsDialog(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to preview emails",
        variant: "destructive",
      });
    },
  });

  const sendNotificationsMutation = useMutation({
    mutationFn: async (artworkIds: string[]) => {
      const response = await apiRequest("POST", "/api/admin/notify-artists", {
        artworkIds,
      });
      return await response.json();
    },
    onSuccess: (data: { sent: number; failed: number; results: any[]; skippedMissingEmail?: { id: string; title: string }[] }) => {
      setShowNotifyArtistsDialog(false);
      setEmailPreviewData(null);
      const skippedCount = data.skippedMissingEmail?.length || 0;
      const skippedText = skippedCount > 0 ? ` ${skippedCount} skipped (no email).` : '';
      
      if (data.failed > 0) {
        toast({
          title: "Notifications Sent",
          description: `${data.sent} emails sent, ${data.failed} failed.${skippedText}`,
          variant: data.sent > 0 ? "default" : "destructive",
        });
      } else {
        toast({
          title: "Notifications Sent",
          description: `Successfully sent ${data.sent} email${data.sent !== 1 ? 's' : ''} to artists.${skippedText}`,
        });
      }
      setSelectedArtworkIds(new Set());
      // Refresh artworks to show the "Artist Notified" badge
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send notifications",
        variant: "destructive",
      });
    },
  });

  const toggleMountMutation = useMutation({
    mutationFn: async ({ artworkId, hasMount }: { artworkId: string; hasMount: boolean }) => {
      return apiRequest("PATCH", `/api/artworks/${artworkId}`, { hasMount });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update mount setting",
        variant: "destructive",
      });
    },
  });

  const generateProductMockupsMutation = useMutation({
    mutationFn: async (artworkId: string) => {
      const response = await apiRequestLong("POST", `/api/admin/artworks/${artworkId}/generate-mockups`);
      return await response.json();
    },
    onSuccess: (data: { artworkId: string; previews: { frame: string; dataUrl: string; sizeBytes: number }[] }) => {
      if (mockupPreviewArtwork && data.artworkId === mockupPreviewArtwork.id) {
        setMockupPreviews(data.previews);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Generation failed",
        description: error.message || "Failed to generate mockup previews",
        variant: "destructive",
      });
    },
  });

  const saveProductMockupsMutation = useMutation({
    mutationFn: async (artworkId: string) => {
      const response = await apiRequestLong("POST", `/api/admin/artworks/${artworkId}/save-mockups`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mockups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mockup-summary"] });
      setMockupPreviewArtwork(null);
      setMockupPreviews(null);
      toast({
        title: "Mockups saved",
        description: "Product mockups have been saved successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Save failed",
        description: error.message || "Failed to save mockups",
        variant: "destructive",
      });
    },
  });

  const openMockupsDialog = useCallback(async (artwork: Artwork) => {
    setMockupPreviewArtwork(artwork);
    setMockupPreviews(null);
    setSavedMockupsForView(null);
    setScanVideoResult(null);
    try {
      const res = await apiRequest("GET", `/api/artworks/${artwork.id}/mockups`);
      const mockups: Mockup[] = await res.json();
      const productMockups = mockups.filter(m =>
        ["Black Frame", "White Frame", "Natural Frame", "Unframed", "Lifestyle"].includes(m.frameType)
      );
      const existingVideo = mockups.find(m => m.frameType === "Scan Video");
      if (existingVideo) {
        setScanVideoResult({ url: existingVideo.mockupImageUrl, sizeBytes: 0, mockupId: existingVideo.id });
      }
      if (productMockups.length > 0) {
        setMockupDialogMode("view");
        setSavedMockupsForView(productMockups);
      } else {
        setMockupDialogMode("generate");
        generateProductMockupsMutation.mutate(artwork.id);
      }
    } catch {
      setMockupDialogMode("generate");
      generateProductMockupsMutation.mutate(artwork.id);
    }
  }, [generateProductMockupsMutation]);

  const downloadMockupImage = useCallback((url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const downloadAllMockups = useCallback(async (artwork: Artwork, mockups: { url: string; frame: string }[]) => {
    for (const m of mockups) {
      const frameSlug = m.frame.replace(/\s+/g, "-");
      const filename = `${artwork.title.replace(/\s+/g, "-")}_${frameSlug}.jpg`;
      downloadMockupImage(m.url, filename);
      await new Promise(r => setTimeout(r, 300));
    }
  }, [downloadMockupImage]);

  const filteredArtworks = useMemo(() => {
    if (!artworks) return [];
    return artworks.filter((artwork) =>
      artwork.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      artwork.artistName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [artworks, searchQuery]);

  const groupedArtworks = useMemo(() => {
    const batched = new Map<string, ArtworkGroup>();
    const singles: Artwork[] = [];
    
    filteredArtworks.forEach((artwork) => {
      if (artwork.uploadBatchId) {
        if (!batched.has(artwork.uploadBatchId)) {
          batched.set(artwork.uploadBatchId, {
            uploadBatchId: artwork.uploadBatchId,
            uploadedAt: new Date(artwork.uploadedAt),
            artworks: [],
          });
        }
        batched.get(artwork.uploadBatchId)!.artworks.push(artwork);
      } else {
        singles.push(artwork);
      }
    });
    
    // Convert batched groups to array
    const batchedGroups = Array.from(batched.values());
    
    // Convert single artworks to groups (for consistent rendering)
    const singleGroups: ArtworkGroup[] = singles.map(artwork => ({
      uploadBatchId: `single-${artwork.id}`,
      uploadedAt: new Date(artwork.uploadedAt),
      artworks: [artwork],
    }));
    
    // Combine and sort all groups by upload date
    const allGroups = [...batchedGroups, ...singleGroups].sort((a, b) => 
      b.uploadedAt.getTime() - a.uploadedAt.getTime()
    );
    
    // Filter groups based on active tab
    // "pending" = groups where NOT all artworks have artistNotifiedAt
    // "submitted" = groups where ALL artworks have artistNotifiedAt
    return allGroups.filter(group => {
      const allNotified = group.artworks.every(a => a.artistNotifiedAt);
      if (activeTab === "submitted") {
        return allNotified;
      } else {
        return !allNotified;
      }
    });
  }, [filteredArtworks, activeTab]);
  
  // Count groups for tab badges
  const { pendingCount, submittedCount } = useMemo(() => {
    if (!artworks) return { pendingCount: 0, submittedCount: 0 };
    
    // Build groups from all artworks (not just filtered)
    const batched = new Map<string, Artwork[]>();
    const singles: Artwork[] = [];
    
    artworks.forEach((artwork) => {
      if (artwork.uploadBatchId) {
        if (!batched.has(artwork.uploadBatchId)) {
          batched.set(artwork.uploadBatchId, []);
        }
        batched.get(artwork.uploadBatchId)!.push(artwork);
      } else {
        singles.push(artwork);
      }
    });
    
    let pending = 0;
    let submitted = 0;
    
    // Count batched groups
    batched.forEach(artworks => {
      const allNotified = artworks.every(a => a.artistNotifiedAt);
      if (allNotified) {
        submitted++;
      } else {
        pending++;
      }
    });
    
    // Count single artworks
    singles.forEach(artwork => {
      if (artwork.artistNotifiedAt) {
        submitted++;
      } else {
        pending++;
      }
    });
    
    return { pendingCount: pending, submittedCount: submitted };
  }, [artworks]);

  const handleSelectAll = () => {
    if (selectedArtworkIds.size === filteredArtworks.length && filteredArtworks.length > 0) {
      setSelectedArtworkIds(new Set());
    } else {
      setSelectedArtworkIds(new Set(filteredArtworks.map(a => a.id)));
    }
  };

  const handleToggleArtwork = (artworkId: string) => {
    const newSelected = new Set(selectedArtworkIds);
    if (newSelected.has(artworkId)) {
      newSelected.delete(artworkId);
    } else {
      newSelected.add(artworkId);
    }
    setSelectedArtworkIds(newSelected);
  };

  const handleToggleGroup = (group: ArtworkGroup) => {
    const groupArtworkIds = group.artworks.map(a => a.id);
    const allSelected = groupArtworkIds.every(id => selectedArtworkIds.has(id));
    
    const newSelected = new Set(selectedArtworkIds);
    if (allSelected) {
      groupArtworkIds.forEach(id => newSelected.delete(id));
    } else {
      groupArtworkIds.forEach(id => newSelected.add(id));
    }
    setSelectedArtworkIds(newSelected);
  };

  const handleToggleExpand = (batchId: string) => {
    // Only track real batch IDs, not synthetic ones
    if (batchId.startsWith('single-')) return;
    
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(batchId)) {
      newExpanded.delete(batchId);
    } else {
      newExpanded.add(batchId);
    }
    setExpandedGroups(newExpanded);
  };

  const handleExport = () => {
    if (selectedArtworkIds.size === 0) {
      toast({
        title: "No artworks selected",
        description: "Please select at least one artwork to export",
        variant: "destructive",
      });
      return;
    }
    exportMutation.mutate(Array.from(selectedArtworkIds));
  };

  const handleShopifySync = () => {
    if (selectedArtworkIds.size === 0) {
      toast({
        title: "No artworks selected",
        description: "Please select at least one artwork to sync to Shopify",
        variant: "destructive",
      });
      return;
    }
    shopifySyncMutation.mutate(Array.from(selectedArtworkIds));
  };

  const handleNotifyArtists = () => {
    if (selectedArtworkIds.size === 0) {
      toast({
        title: "No artworks selected",
        description: "Please select at least one artwork to notify the artist",
        variant: "destructive",
      });
      return;
    }
    previewEmailsMutation.mutate(Array.from(selectedArtworkIds));
  };

  const handleSendNotifications = () => {
    if (!emailPreviewData || emailPreviewData.groups.length === 0) return;
    const artworkIds = emailPreviewData.groups.flatMap(g => g.artworks.map(a => a.id));
    sendNotificationsMutation.mutate(artworkIds);
  };

  const handleDeleteClick = () => {
    if (selectedArtworkIds.size === 0) {
      toast({
        title: "No artworks selected",
        description: "Please select at least one artwork to delete",
        variant: "destructive",
      });
      return;
    }
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = () => {
    deleteMutation.mutate(Array.from(selectedArtworkIds));
    setShowDeleteDialog(false);
  };

  const handleBulkGenerateMockups = () => {
    const artworkIdsArray = Array.from(selectedArtworkIds);
    bulkGenerateMockupsMutation.mutate(artworkIdsArray);
  };

  const handleBulkGenerateVideos = () => {
    const artworkIdsArray = Array.from(selectedArtworkIds);
    bulkGenerateVideosMutation.mutate(artworkIdsArray);
  };

  const handleGroup = () => {
    const artworkIdsArray = Array.from(selectedArtworkIds);
    if (artworkIdsArray.length < 2) {
      toast({
        title: "Select at least 2 artworks",
        description: "You need to select at least 2 artworks to group them together",
        variant: "destructive",
      });
      return;
    }
    // Use first selected artwork as primary by default
    const primaryId = artworkIdsArray[0];
    groupMutation.mutate({ artworkIds: artworkIdsArray, primaryId });
  };

  const handleUngroup = () => {
    const artworkIdsArray = Array.from(selectedArtworkIds);
    ungroupMutation.mutate(artworkIdsArray);
  };

  const handleImportMockups = () => {
    if (selectedArtworkIds.size === 0) {
      toast({
        title: "No artworks selected",
        description: "Please select at least one artwork to import mockups for",
        variant: "destructive",
      });
      return;
    }
    previewMockupsMutation.mutate(Array.from(selectedArtworkIds));
  };

  const handleTogglePendingMockup = (artworkId: string, mockupId: string) => {
    const newMap = new Map(selectedPendingMockups);
    const artworkSelections = newMap.get(artworkId) || new Set<string>();
    const newSelections = new Set(artworkSelections);
    
    if (newSelections.has(mockupId)) {
      newSelections.delete(mockupId);
    } else {
      newSelections.add(mockupId);
    }
    
    if (newSelections.size > 0) {
      newMap.set(artworkId, newSelections);
    } else {
      newMap.delete(artworkId);
    }
    setSelectedPendingMockups(newMap);
  };

  const handleSelectAllForArtwork = (artworkId: string, mockupIds: string[]) => {
    const newMap = new Map(selectedPendingMockups);
    newMap.set(artworkId, new Set(mockupIds));
    setSelectedPendingMockups(newMap);
  };

  const handleDeselectAllForArtwork = (artworkId: string) => {
    const newMap = new Map(selectedPendingMockups);
    newMap.delete(artworkId);
    setSelectedPendingMockups(newMap);
  };

  const handleConfirmImportMockups = () => {
    const assignments: { artworkId: string; pendingMockupIds: string[] }[] = [];
    
    selectedPendingMockups.forEach((mockupIds, artworkId) => {
      if (mockupIds.size > 0) {
        assignments.push({
          artworkId,
          pendingMockupIds: Array.from(mockupIds),
        });
      }
    });
    
    if (assignments.length === 0) {
      toast({
        title: "Nothing Selected",
        description: "Please select at least one pending mockup to import.",
        variant: "destructive",
      });
      return;
    }
    
    importMockupsMutation.mutate(assignments);
  };

  const getTotalSelectedCount = () => {
    let total = 0;
    selectedPendingMockups.forEach(set => {
      total += set.size;
    });
    return total;
  };

  const handleEditSizes = (artwork: Artwork) => {
    setEditingSizesArtwork(artwork);
    setSelectedSizes(new Set(artwork.availableSizes));
  };

  const handleToggleSize = (size: string) => {
    const newSizes = new Set(selectedSizes);
    if (newSizes.has(size)) {
      newSizes.delete(size);
    } else {
      newSizes.add(size);
    }
    setSelectedSizes(newSizes);
  };

  const handleSaveSizes = () => {
    if (!editingSizesArtwork) return;
    
    if (selectedSizes.size < 2) {
      toast({
        title: "Minimum 2 sizes required",
        description: "Artworks must have at least 2 print sizes selected",
        variant: "destructive",
      });
      return;
    }

    updateSizesMutation.mutate({
      artworkId: editingSizesArtwork.id,
      selectedSizes: Array.from(selectedSizes),
    });
  };

  const isGroupSelected = (group: ArtworkGroup) => {
    const groupArtworkIds = group.artworks.map(a => a.id);
    return groupArtworkIds.every(id => selectedArtworkIds.has(id));
  };

  const isGroupPartiallySelected = (group: ArtworkGroup) => {
    const groupArtworkIds = group.artworks.map(a => a.id);
    const selectedCount = groupArtworkIds.filter(id => selectedArtworkIds.has(id)).length;
    return selectedCount > 0 && selectedCount < groupArtworkIds.length;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div>
            <h1 className="text-3xl font-bold font-display">All Artworks</h1>
            <p className="text-muted-foreground mt-1">
              Browse and manage all submitted artworks
            </p>
          </div>
          
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "pending" | "submitted")} className="mt-6">
            <TabsList>
              <TabsTrigger value="pending" data-testid="tab-pending-uploads">
                Pending Uploads
                {pendingCount > 0 && (
                  <Badge variant="secondary" className="ml-2">{pendingCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="submitted" data-testid="tab-submitted-artworks">
                Submitted Artworks
                {submittedCount > 0 && (
                  <Badge variant="secondary" className="ml-2">{submittedCount}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by title or artist..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-artworks"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={handleSelectAll}
              disabled={isLoading || filteredArtworks.length === 0}
              data-testid="button-select-all"
            >
              {selectedArtworkIds.size === filteredArtworks.length && filteredArtworks.length > 0 ? (
                <><CheckSquare className="w-4 h-4 mr-2" /> Deselect All</>
              ) : (
                <><Square className="w-4 h-4 mr-2" /> Select All</>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleGroup}
              disabled={selectedArtworkIds.size < 2 || groupMutation.isPending}
              data-testid="button-group-artworks"
            >
              <Link2 className="w-4 h-4 mr-2" />
              {groupMutation.isPending ? "Grouping..." : `Group (${selectedArtworkIds.size})`}
            </Button>
            <Button
              variant="outline"
              onClick={handleUngroup}
              disabled={selectedArtworkIds.size === 0 || ungroupMutation.isPending}
              data-testid="button-ungroup-artworks"
            >
              <Unlink className="w-4 h-4 mr-2" />
              {ungroupMutation.isPending ? "Ungrouping..." : `Ungroup (${selectedArtworkIds.size})`}
            </Button>
            <Button
              variant="outline"
              onClick={handleBulkGenerateMockups}
              disabled={selectedArtworkIds.size === 0 || bulkGenerateMockupsMutation.isPending}
              data-testid="button-bulk-generate-mockups"
            >
              <ImageIcon className="w-4 h-4 mr-2" />
              {bulkGenerateMockupsMutation.isPending ? "Generating..." : `Product Mockups (${selectedArtworkIds.size})`}
            </Button>
            <Button
              variant="outline"
              onClick={handleBulkGenerateVideos}
              disabled={selectedArtworkIds.size === 0 || bulkGenerateVideosMutation.isPending}
              data-testid="button-bulk-generate-videos"
            >
              <Video className="w-4 h-4 mr-2" />
              {bulkGenerateVideosMutation.isPending ? "Generating..." : `Scan Videos (${selectedArtworkIds.size})`}
            </Button>
            <Button
              variant="outline"
              onClick={handleImportMockups}
              disabled={selectedArtworkIds.size === 0 || previewMockupsMutation.isPending}
              data-testid="button-import-mockups"
            >
              {previewMockupsMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning...</>
              ) : (
                <><FolderDown className="w-4 h-4 mr-2" /> Import Mockups ({selectedArtworkIds.size})</>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => rejectMutation.mutate(Array.from(selectedArtworkIds))}
              disabled={selectedArtworkIds.size === 0 || rejectMutation.isPending}
              data-testid="button-reject-selected"
              className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
            >
              <Ban className="w-4 h-4 mr-2" />
              {rejectMutation.isPending ? "Rejecting..." : `Reject (${selectedArtworkIds.size})`}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteClick}
              disabled={selectedArtworkIds.size === 0 || deleteMutation.isPending}
              data-testid="button-delete-selected"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleteMutation.isPending ? "Deleting..." : `Delete Selected (${selectedArtworkIds.size})`}
            </Button>
            <Button
              onClick={handleExport}
              disabled={selectedArtworkIds.size === 0 || exportMutation.isPending}
              data-testid="button-export-selected"
            >
              <Download className="w-4 h-4 mr-2" />
              {exportMutation.isPending ? "Exporting..." : `Export Selected (${selectedArtworkIds.size})`}
            </Button>
            <Button
              onClick={handleShopifySync}
              disabled={selectedArtworkIds.size === 0 || shopifySyncMutation.isPending}
              variant="outline"
              data-testid="button-shopify-sync"
            >
              <Store className="w-4 h-4 mr-2" />
              {shopifySyncMutation.isPending ? "Syncing..." : `Sync to Shopify (${selectedArtworkIds.size})`}
            </Button>
            <Button
              onClick={handleNotifyArtists}
              disabled={selectedArtworkIds.size === 0 || previewEmailsMutation.isPending}
              variant="outline"
              data-testid="button-notify-artists"
            >
              <Mail className="w-4 h-4 mr-2" />
              {previewEmailsMutation.isPending ? "Loading..." : `Notify Artists (${selectedArtworkIds.size})`}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Card>
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-5" />
                  <Skeleton className="h-16 w-16" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : groupedArtworks.length > 0 ? (
          <div className="space-y-4">
            {groupedArtworks.map((group) => {
              const isExpanded = expandedGroups.has(group.uploadBatchId);
              const isSingleArtwork = group.artworks.length === 1;
              const groupSelected = isGroupSelected(group);
              const groupPartiallySelected = isGroupPartiallySelected(group);

              return (
                <Card key={group.uploadBatchId} data-testid={`group-${group.uploadBatchId}`}>
                  {/* Group Header */}
                  <div className="flex items-center gap-4 p-4 border-b hover-elevate">
                    <input
                      type="checkbox"
                      checked={groupSelected}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = groupPartiallySelected;
                        }
                      }}
                      onChange={() => handleToggleGroup(group)}
                      className="h-4 w-4 rounded border-input cursor-pointer"
                      data-testid={`checkbox-group-${group.uploadBatchId}`}
                    />
                    
                    {!isSingleArtwork && (
                      <button
                        onClick={() => handleToggleExpand(group.uploadBatchId)}
                        className="flex items-center gap-2 hover-elevate p-2 rounded"
                        data-testid={`button-expand-${group.uploadBatchId}`}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                      </button>
                    )}
                    
                    <ArtworkThumbnail
                      artwork={group.artworks[0]}
                      size="sm"
                      onClick={() => setViewingArtwork(group.artworks[0])}
                    />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">
                          {isSingleArtwork ? group.artworks[0].title : `by ${group.artworks[0].artistName}`}
                        </h3>
                        {!isSingleArtwork && (
                          <Badge variant="secondary">
                            {group.artworks.length} artworks
                          </Badge>
                        )}
                        {/* Rejected count badge for batch header */}
                        {!isSingleArtwork && group.artworks.some(a => a.status === "rejected") && (
                          <Badge variant="outline" className="text-xs bg-red-500/10 text-red-700 dark:text-red-400">
                            {group.artworks.filter(a => a.status === "rejected").length} rejected
                          </Badge>
                        )}
                        {/* Artist Notified Badge for batch header */}
                        {!isSingleArtwork && group.artworks.every(a => a.artistNotifiedAt) && (
                          <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-400">
                            <Mail className="w-3 h-3 mr-1" />
                            Artist Notified
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {isSingleArtwork 
                          ? `by ${group.artworks[0].artistName}` 
                          : `Uploaded ${group.uploadedAt.toLocaleDateString()}`
                        }
                      </p>
                    </div>

                    {isSingleArtwork && (
                      <>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="outline" className="text-xs whitespace-nowrap">
                            {group.artworks[0].widthPx} × {group.artworks[0].heightPx}px
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {group.artworks[0].dpi} DPI
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {group.artworks[0].status === "rejected" && (
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-xs bg-red-500/10 text-red-700 dark:text-red-400">
                                Rejected
                              </Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  unrejectMutation.mutate([group.artworks[0].id]);
                                }}
                                disabled={unrejectMutation.isPending}
                                data-testid={`button-unreject-${group.artworks[0].id}`}
                              >
                                <Undo2 className="w-3 h-3 mr-1" />
                                Restore
                              </Button>
                            </div>
                          )}
                          {group.artworks[0].groupId && (
                            <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-700 dark:text-purple-400">
                              <Link2 className="w-3 h-3 mr-1" />
                              Grouped
                            </Badge>
                          )}
                          {group.artworks[0].availableSizes && group.artworks[0].availableSizes.length > 0 && (
                            <>
                              <Badge variant="secondary" className="text-xs">
                                {group.artworks[0].availableSizes.length} sizes
                              </Badge>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditSizes(group.artworks[0]);
                                }}
                                data-testid={`button-edit-sizes-${group.artworks[0].id}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCustomizeMockupArtwork(group.artworks[0]);
                                }}
                                title="Customize Mockup Positioning"
                                data-testid={`button-customize-mockup-${group.artworks[0].id}`}
                              >
                                <Settings className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant={group.artworks[0].hasMount ? "default" : "outline"}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMountPreviewArtwork(group.artworks[0]);
                            }}
                            title="Mount Preview"
                            data-testid={`button-mount-preview-${group.artworks[0].id}`}
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            {group.artworks[0].hasMount ? "Mount" : "Add Mount"}
                          </Button>
                          <Button
                            size="sm"
                            variant={mockupSummary?.[group.artworks[0].id]?.product ? "default" : "outline"}
                            onClick={(e) => {
                              e.stopPropagation();
                              openMockupsDialog(group.artworks[0]);
                            }}
                            disabled={generateProductMockupsMutation.isPending}
                            title={mockupSummary?.[group.artworks[0].id]?.product ? `${mockupSummary[group.artworks[0].id].product} mockups saved` : "Product Mockups"}
                            data-testid={`button-generate-mockups-${group.artworks[0].id}`}
                          >
                            <ImageIcon className="w-3 h-3 mr-1" />
                            Mockups{mockupSummary?.[group.artworks[0].id]?.product ? ` (${mockupSummary[group.artworks[0].id].product})` : ""}
                          </Button>
                          {/* Dropbox Status for single artwork */}
                          {group.artworks[0].dropboxUploadFailed ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                retryDropboxMutation.mutate(group.artworks[0].id);
                              }}
                              disabled={retryDropboxMutation.isPending}
                              data-testid={`button-retry-dropbox-${group.artworks[0].id}`}
                            >
                              {retryDropboxMutation.isPending ? (
                                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <CloudOff className="w-3 h-3 mr-1" />
                              )}
                              {retryDropboxMutation.isPending ? "Uploading..." : "Send to Dropbox"}
                            </Button>
                          ) : group.artworks[0].dropboxPath ? (
                            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400">
                              <Cloud className="w-3 h-3 mr-1" />
                              Dropbox
                            </Badge>
                          ) : null}
                          {/* Artist Notified Badge */}
                          {group.artworks[0].artistNotifiedAt && (
                            <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-400">
                              <Mail className="w-3 h-3 mr-1" />
                              Artist Notified
                            </Badge>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Expanded Group Content */}
                  {!isSingleArtwork && isExpanded && (
                    <div className="divide-y">
                      {group.artworks.map((artwork) => (
                        <div
                          key={artwork.id}
                          className="flex items-center gap-4 p-4 pl-16 hover-elevate"
                          data-testid={`row-artwork-${artwork.id}`}
                        >
                          <Checkbox
                            checked={selectedArtworkIds.has(artwork.id)}
                            onCheckedChange={() => handleToggleArtwork(artwork.id)}
                            data-testid={`checkbox-artwork-${artwork.id}`}
                          />
                          
                          <ArtworkThumbnail
                            artwork={artwork}
                            size="md"
                            onClick={() => setViewingArtwork(artwork)}
                          />

                          <div className="flex-1 min-w-0">
                            <InlineEditTitle
                              artworkId={artwork.id}
                              title={artwork.title}
                            />
                            <p className="text-sm text-muted-foreground truncate" data-testid={`text-artist-${artwork.id}`}>
                              by {artwork.artistName}
                            </p>
                            {(artwork.styleTags?.length || artwork.colourTags?.length || artwork.moodTags?.length || artwork.themeTags?.length) ? (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {artwork.styleTags?.map((tag) => (
                                  <Badge key={`style-${tag}`} variant="secondary" className="text-[10px] px-1.5 py-0" data-testid={`tag-style-${tag}`}>
                                    {tag}
                                  </Badge>
                                ))}
                                {artwork.colourTags?.map((tag) => (
                                  <Badge key={`colour-${tag}`} variant="secondary" className="text-[10px] px-1.5 py-0" data-testid={`tag-colour-${tag}`}>
                                    {tag}
                                  </Badge>
                                ))}
                                {artwork.moodTags?.map((tag) => (
                                  <Badge key={`mood-${tag}`} variant="secondary" className="text-[10px] px-1.5 py-0" data-testid={`tag-mood-${tag}`}>
                                    {tag}
                                  </Badge>
                                ))}
                                {artwork.themeTags?.map((tag) => (
                                  <Badge key={`theme-${tag}`} variant="secondary" className="text-[10px] px-1.5 py-0" data-testid={`tag-theme-${tag}`}>
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="outline" className="text-xs whitespace-nowrap">
                              {artwork.widthPx} × {artwork.heightPx}px
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {artwork.dpi} DPI
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {artwork.availableSizes && artwork.availableSizes.length > 0 && (
                              <>
                                <Badge variant="secondary" className="text-xs">
                                  {artwork.availableSizes.length} sizes
                                </Badge>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditSizes(artwork);
                                  }}
                                  data-testid={`button-edit-sizes-${artwork.id}`}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCustomizeMockupArtwork(artwork);
                                  }}
                                  title="Customize Mockup Positioning"
                                  data-testid={`button-customize-mockup-${artwork.id}`}
                                >
                                  <Settings className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant={artwork.hasMount ? "default" : "outline"}
                              onClick={(e) => {
                                e.stopPropagation();
                                setMountPreviewArtwork(artwork);
                              }}
                              title="Mount Preview"
                              data-testid={`button-mount-preview-${artwork.id}`}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              {artwork.hasMount ? "Mount" : "Add Mount"}
                            </Button>
                            <Button
                              size="sm"
                              variant={mockupSummary?.[artwork.id]?.product ? "default" : "outline"}
                              onClick={(e) => {
                                e.stopPropagation();
                                openMockupsDialog(artwork);
                              }}
                              disabled={generateProductMockupsMutation.isPending}
                              title={mockupSummary?.[artwork.id]?.product ? `${mockupSummary[artwork.id].product} mockups saved` : "Product Mockups"}
                              data-testid={`button-generate-mockups-${artwork.id}`}
                            >
                              <ImageIcon className="w-3 h-3 mr-1" />
                              Mockups{mockupSummary?.[artwork.id]?.product ? ` (${mockupSummary[artwork.id].product})` : ""}
                            </Button>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {artwork.groupId && (
                              <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-700 dark:text-purple-400">
                                <Link2 className="w-3 h-3 mr-1" />
                                Grouped
                              </Badge>
                            )}
                            {artwork.status === "pending" && (
                              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                Pending
                              </Badge>
                            )}
                            {artwork.status === "mockups_generated" && (
                              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400">
                                Complete
                              </Badge>
                            )}
                            {artwork.status === "rejected" && (
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-xs bg-red-500/10 text-red-700 dark:text-red-400">
                                  Rejected
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    unrejectMutation.mutate([artwork.id]);
                                  }}
                                  disabled={unrejectMutation.isPending}
                                  data-testid={`button-unreject-${artwork.id}`}
                                >
                                  <Undo2 className="w-3 h-3 mr-1" />
                                  Restore
                                </Button>
                              </div>
                            )}
                            {/* Dropbox Status */}
                            {artwork.dropboxUploadFailed ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  retryDropboxMutation.mutate(artwork.id);
                                }}
                                disabled={retryDropboxMutation.isPending}
                                data-testid={`button-retry-dropbox-${artwork.id}`}
                              >
                                {retryDropboxMutation.isPending ? (
                                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                ) : (
                                  <CloudOff className="w-3 h-3 mr-1" />
                                )}
                                {retryDropboxMutation.isPending ? "Uploading..." : "Send to Dropbox"}
                              </Button>
                            ) : artwork.dropboxPath ? (
                              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400">
                                <Cloud className="w-3 h-3 mr-1" />
                                Dropbox
                              </Badge>
                            ) : null}
                            {/* Artist Notified Badge */}
                            {artwork.artistNotifiedAt && (
                              <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-400">
                                <Mail className="w-3 h-3 mr-1" />
                                Artist Notified
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <div className="p-12">
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="p-6 bg-muted rounded-full">
                    <ImageIcon className="w-12 h-12 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">No artworks found</h3>
                  <p className="text-muted-foreground">
                    {searchQuery
                      ? "Try adjusting your search criteria"
                      : "Get started by submitting your first artwork"}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Image Viewing Modal */}
      <Dialog open={viewingArtwork !== null} onOpenChange={() => setViewingArtwork(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden">
          <button
            onClick={() => setViewingArtwork(null)}
            className="absolute top-4 right-4 z-10 p-2 bg-background/80 backdrop-blur rounded-full hover-elevate"
            data-testid="button-close-modal"
          >
            <X className="w-5 h-5" />
          </button>
          {viewingArtwork && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 max-h-[95vh] overflow-y-auto">
              {/* Original Artwork */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Original Artwork</h3>
                  <p className="text-sm text-muted-foreground">
                    {viewingArtwork.title} - {viewingArtwork.artistName}
                  </p>
                </div>
                <div className="w-full bg-muted rounded-lg p-4">
                  <img
                    src={viewingArtwork.originalFileUrl || viewingArtwork.lowResFileUrl || ""}
                    alt={viewingArtwork.title}
                    className="w-full h-auto object-contain"
                    data-testid="img-modal-artwork"
                  />
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge variant="outline">
                    {viewingArtwork.widthPx} × {viewingArtwork.heightPx}px
                  </Badge>
                  <Badge variant="outline">
                    {viewingArtwork.dpi} DPI
                  </Badge>
                  <Badge variant="outline">
                    {viewingArtwork.aspectRatio}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const link = document.createElement("a");
                      link.href = `/api/artworks/${viewingArtwork.id}/download`;
                      link.download = viewingArtwork.originalFilename || `${viewingArtwork.title}.jpg`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    data-testid="button-download-artwork"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Original
                  </Button>
                  <ARPreview
                    artworkId={viewingArtwork.id}
                    artworkTitle={viewingArtwork.title}
                    artworkImageUrl={viewingArtwork.originalFileUrl || viewingArtwork.lowResFileUrl || ""}
                    availableSizes={viewingArtwork.availableSizes || viewingArtwork.calculatedSizes}
                  />
                </div>
                {(viewingArtwork.styleTags?.length || viewingArtwork.colourTags?.length || viewingArtwork.moodTags?.length || viewingArtwork.themeTags?.length) ? (
                  <div className="space-y-2 mt-2" data-testid="section-artist-tags">
                    <h4 className="text-sm font-medium">Artist Tags</h4>
                    <div className="space-y-1.5">
                      {viewingArtwork.styleTags?.length ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground w-14">Style</span>
                          {viewingArtwork.styleTags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs" data-testid={`tag-modal-style-${tag}`}>{tag}</Badge>
                          ))}
                        </div>
                      ) : null}
                      {viewingArtwork.colourTags?.length ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground w-14">Colour</span>
                          {viewingArtwork.colourTags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs" data-testid={`tag-modal-colour-${tag}`}>{tag}</Badge>
                          ))}
                        </div>
                      ) : null}
                      {viewingArtwork.moodTags?.length ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground w-14">Mood</span>
                          {viewingArtwork.moodTags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs" data-testid={`tag-modal-mood-${tag}`}>{tag}</Badge>
                          ))}
                        </div>
                      ) : null}
                      {viewingArtwork.themeTags?.length ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground w-14">Themes</span>
                          {viewingArtwork.themeTags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs" data-testid={`tag-modal-theme-${tag}`}>{tag}</Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Framed Mockup Preview */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Website Preview</h3>
                  <p className="text-sm text-muted-foreground">
                    How this artwork will appear on the website
                  </p>
                </div>
                <FramedMockup
                  imageUrl={viewingArtwork.originalFileUrl || viewingArtwork.lowResFileUrl || ""}
                  title={viewingArtwork.title}
                  artistName={viewingArtwork.artistName}
                  availableSizes={viewingArtwork.availableSizes || viewingArtwork.calculatedSizes}
                  widthPx={viewingArtwork.widthPx}
                  heightPx={viewingArtwork.heightPx}
                  dpi={viewingArtwork.dpi}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Artworks</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedArtworkIds.size} artwork{selectedArtworkIds.size > 1 ? 's' : ''}? 
              This action cannot be undone and will permanently remove the artwork{selectedArtworkIds.size > 1 ? 's' : ''} from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Sizes Dialog */}
      <Dialog open={editingSizesArtwork !== null} onOpenChange={() => setEditingSizesArtwork(null)}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-edit-sizes">
          <DialogHeader>
            <DialogTitle>Edit Print Sizes</DialogTitle>
            <DialogDescription>
              Select which print sizes should be available for this artwork. Minimum 2 sizes required.
            </DialogDescription>
          </DialogHeader>
          {editingSizesArtwork && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">{editingSizesArtwork.title}</p>
                <p className="text-sm text-muted-foreground">by {editingSizesArtwork.artistName}</p>
              </div>
              
              <div className="space-y-3">
                <p className="text-sm font-medium">Available Sizes ({editingSizesArtwork.calculatedSizes.length} calculated)</p>
                <div className="grid grid-cols-2 gap-3">
                  {editingSizesArtwork.calculatedSizes.map((size) => (
                    <div key={size} className="flex items-center gap-2">
                      <Checkbox
                        id={`size-${size}`}
                        checked={selectedSizes.has(size)}
                        onCheckedChange={() => handleToggleSize(size)}
                        data-testid={`checkbox-size-${size}`}
                      />
                      <label
                        htmlFor={`size-${size}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {size}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {selectedSizes.size < 2 && (
                <p className="text-sm text-destructive">
                  At least 2 sizes must be selected
                </p>
              )}

              <p className="text-sm text-muted-foreground">
                {selectedSizes.size} of {editingSizesArtwork.calculatedSizes.length} sizes selected
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingSizesArtwork(null)}
              data-testid="button-cancel-edit-sizes"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveSizes}
              disabled={selectedSizes.size < 2 || updateSizesMutation.isPending}
              data-testid="button-save-sizes"
            >
              {updateSizesMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mockup Customizer Dialog */}
      <Dialog open={customizeMockupArtwork !== null} onOpenChange={() => setCustomizeMockupArtwork(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto" data-testid="dialog-customize-mockup">
          <DialogHeader>
            <DialogTitle>Customize Mockup Positioning</DialogTitle>
            <DialogDescription>
              Adjust artwork positioning within each template. Select a template, then use the controls to fine-tune scale, position, and rotation.
            </DialogDescription>
          </DialogHeader>
          {customizeMockupArtwork && (
            <MockupCustomizer
              artwork={customizeMockupArtwork}
              onClose={() => setCustomizeMockupArtwork(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Mount Preview Dialog */}
      <Dialog open={mountPreviewArtwork !== null} onOpenChange={() => setMountPreviewArtwork(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto" data-testid="dialog-mount-preview">
          <DialogHeader>
            <DialogTitle>Mount Preview</DialogTitle>
            <DialogDescription>
              {mountPreviewArtwork ? `${mountPreviewArtwork.title} by ${mountPreviewArtwork.artistName}` : ""}
            </DialogDescription>
          </DialogHeader>
          {mountPreviewArtwork && (() => {
            const artworkUrl = mountPreviewArtwork.lowResFileUrl || mountPreviewArtwork.originalFileUrl;
            const sizes = findMatchedSizes(mountPreviewArtwork.availableSizes || mountPreviewArtwork.calculatedSizes);
            return (
              <div className="space-y-6">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-sm font-medium">Mount:</span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={mountPreviewArtwork.hasMount ? "default" : "outline"}
                      onClick={() => {
                        toggleMountMutation.mutate({ artworkId: mountPreviewArtwork.id, hasMount: true });
                        setMountPreviewArtwork({ ...mountPreviewArtwork, hasMount: true });
                      }}
                      disabled={toggleMountMutation.isPending}
                      data-testid="button-mount-yes"
                    >
                      Yes
                    </Button>
                    <Button
                      size="sm"
                      variant={!mountPreviewArtwork.hasMount ? "default" : "outline"}
                      onClick={() => {
                        toggleMountMutation.mutate({ artworkId: mountPreviewArtwork.id, hasMount: false });
                        setMountPreviewArtwork({ ...mountPreviewArtwork, hasMount: false });
                      }}
                      disabled={toggleMountMutation.isPending}
                      data-testid="button-mount-no"
                    >
                      No
                    </Button>
                  </div>
                  {mountPreviewArtwork.hasMount && (
                    <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400">
                      Mount Enabled
                    </Badge>
                  )}
                </div>

                {sizes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No matched print sizes found for this artwork.</p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(FRAME_COLORS).map(([frameName, frameHex]) => (
                      <div key={frameName}>
                        <h4 className="text-sm font-medium capitalize mb-3">{frameName} Frame</h4>
                        <div className="flex gap-4 overflow-x-auto pb-2">
                          {sizes.map(size => {
                            const mountMm = getMountBorderMm(
                              Math.min(size.wMm, size.hMm),
                              Math.max(size.wMm, size.hMm)
                            );
                            return (
                              <div key={size.key} className="flex flex-col items-center gap-1 flex-shrink-0">
                                <MountFrameCanvas
                                  artworkUrl={artworkUrl || ""}
                                  withMount={mountPreviewArtwork.hasMount}
                                  printSize={size}
                                  frameColor={frameHex}
                                />
                                <span className="text-xs font-medium">{size.label}</span>
                                <span className="text-xs text-muted-foreground">
                                  {mountPreviewArtwork.hasMount ? `${mountMm}mm mount` : "No mount"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Import Pending Mockups Dialog - Artwork First */}
      <Dialog open={showImportMockupsDialog} onOpenChange={setShowImportMockupsDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Assign Pending Mockups to Artworks</DialogTitle>
            <DialogDescription>
              Select which pending mockups to assign to each selected artwork. Only unassigned mockups are shown.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-4 py-2 flex-wrap">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm">{pendingMockupsData?.totalPending || 0} pending mockups available</span>
            </div>
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-blue-500" />
              <span className="text-sm">{getTotalSelectedCount()} selected</span>
            </div>
          </div>

          <ScrollArea className="h-[450px] border rounded-md p-4">
            <div className="space-y-6">
              {pendingMockupsData?.artworkGroups.map((group) => {
                const artworkSelections = selectedPendingMockups.get(group.artworkId) || new Set<string>();
                const hasMatches = group.pendingMockups.length > 0;
                
                return (
                  <div key={group.artworkId} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-medium">{group.artworkTitle}</h4>
                        <p className="text-sm text-muted-foreground">{group.artistName}</p>
                      </div>
                      {hasMatches && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSelectAllForArtwork(group.artworkId, group.pendingMockups.map(m => m.id))}
                          >
                            Select All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeselectAllForArtwork(group.artworkId)}
                          >
                            Deselect
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {hasMatches ? (
                      <div className="space-y-2">
                        {group.pendingMockups.map((mockup) => (
                          <div
                            key={mockup.id}
                            className={`flex items-start gap-3 p-3 rounded-lg border ${
                              artworkSelections.has(mockup.id)
                                ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                                : 'bg-background'
                            }`}
                          >
                            <Checkbox
                              checked={artworkSelections.has(mockup.id)}
                              onCheckedChange={() => handleTogglePendingMockup(group.artworkId, mockup.id)}
                              data-testid={`checkbox-pending-${mockup.id}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="shrink-0">{mockup.frameType}</Badge>
                                {mockup.isLifestyle && <Badge variant="secondary" className="shrink-0">Lifestyle</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-1">{mockup.filename}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        No pending mockups found for this artwork
                      </p>
                    )}
                  </div>
                );
              })}

              {pendingMockupsData?.unmatchedPendingMockups && pendingMockupsData.unmatchedPendingMockups.length > 0 && (
                <details className="border rounded-lg p-4" open>
                  <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                    {pendingMockupsData.unmatchedPendingMockups.length} other pending mockups (manually assign to artworks)
                  </summary>
                  <p className="text-xs text-muted-foreground mt-2 mb-3">
                    Select an artwork from the dropdown and check the mockup to assign it.
                  </p>
                  <div className="mt-3 space-y-2">
                    {pendingMockupsData.unmatchedPendingMockups.map((mockup) => {
                      const selectedArtworkForMockup = Array.from(selectedPendingMockups.entries()).find(
                        ([_, mockupIds]) => mockupIds.has(mockup.id)
                      )?.[0];
                      
                      return (
                        <div 
                          key={mockup.id} 
                          className={`flex items-start gap-3 p-3 rounded-lg border ${
                            selectedArtworkForMockup
                              ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                              : 'bg-muted/50'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <span className="text-sm font-medium">{mockup.parsedArtworkName || 'Unknown'}</span>
                              <Badge variant="outline" className="shrink-0">{mockup.frameType}</Badge>
                              {mockup.isLifestyle && <Badge variant="secondary" className="shrink-0">Lifestyle</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground truncate mb-2">{mockup.filename}</p>
                            <div className="flex items-center gap-2">
                              <Select
                                value={selectedArtworkForMockup || ""}
                                onValueChange={(artworkId) => {
                                  if (!artworkId) return;
                                  // Remove from any previous artwork
                                  const newMap = new Map(selectedPendingMockups);
                                  newMap.forEach((mockupIds, existingArtworkId) => {
                                    if (mockupIds.has(mockup.id)) {
                                      const newSet = new Set(mockupIds);
                                      newSet.delete(mockup.id);
                                      if (newSet.size > 0) {
                                        newMap.set(existingArtworkId, newSet);
                                      } else {
                                        newMap.delete(existingArtworkId);
                                      }
                                    }
                                  });
                                  // Add to selected artwork
                                  const existingSet = newMap.get(artworkId) || new Set<string>();
                                  existingSet.add(mockup.id);
                                  newMap.set(artworkId, existingSet);
                                  setSelectedPendingMockups(newMap);
                                }}
                              >
                                <SelectTrigger className="w-[250px] h-8 text-xs" data-testid={`select-artwork-for-${mockup.id}`}>
                                  <SelectValue placeholder="Assign to artwork..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {pendingMockupsData?.artworkGroups.map((group) => (
                                    <SelectItem key={group.artworkId} value={group.artworkId}>
                                      {group.artworkTitle} - {group.artistName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {selectedArtworkForMockup && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => {
                                    const newMap = new Map(selectedPendingMockups);
                                    const existingSet = newMap.get(selectedArtworkForMockup);
                                    if (existingSet) {
                                      existingSet.delete(mockup.id);
                                      if (existingSet.size === 0) {
                                        newMap.delete(selectedArtworkForMockup);
                                      }
                                      setSelectedPendingMockups(newMap);
                                    }
                                  }}
                                >
                                  <X className="w-3 h-3 mr-1" />
                                  Remove
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}

              {(!pendingMockupsData?.artworkGroups || pendingMockupsData.artworkGroups.length === 0) && (
                <p className="text-muted-foreground text-center py-8">No artworks selected or no pending mockups available</p>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowImportMockupsDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmImportMockups}
              disabled={importMockupsMutation.isPending || getTotalSelectedCount() === 0}
              data-testid="button-confirm-import-mockups"
            >
              {importMockupsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>Import {getTotalSelectedCount()} Mockups</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notify Artists Dialog */}
      <Dialog open={showNotifyArtistsDialog} onOpenChange={(open) => {
        if (!open) {
          setShowNotifyArtistsDialog(false);
          setEmailPreviewData(null);
          setShowEmailPreviewPane(false);
        }
      }}>
        <DialogContent className="max-w-2xl" data-testid="dialog-notify-artists">
          <DialogHeader>
            <DialogTitle>Notify Artists</DialogTitle>
            <DialogDescription>
              Send an email to artists letting them know their collection is now live on the shop.
            </DialogDescription>
          </DialogHeader>

          {emailPreviewData && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <Badge variant="secondary">
                  {emailPreviewData.totalArtists} artist{emailPreviewData.totalArtists !== 1 ? 's' : ''}
                </Badge>
                <Badge variant="outline">
                  {emailPreviewData.totalArtworks} artwork{emailPreviewData.totalArtworks !== 1 ? 's' : ''}
                </Badge>
                {emailPreviewData.skippedMissingEmail && emailPreviewData.skippedMissingEmail.length > 0 && (
                  <Badge variant="destructive">
                    {emailPreviewData.skippedMissingEmail.length} skipped (no email)
                  </Badge>
                )}
              </div>

              {emailPreviewData.skippedMissingEmail && emailPreviewData.skippedMissingEmail.length > 0 && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-destructive">Missing artist emails</p>
                      <p className="text-muted-foreground">
                        The following artworks were skipped because they don't have an artist email:
                      </p>
                      <ul className="mt-1 list-disc list-inside text-muted-foreground">
                        {emailPreviewData.skippedMissingEmail.map((item) => (
                          <li key={item.id}>{item.title} by {item.artistName}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Toggle between recipients list and email preview */}
              <div className="flex gap-2 border-b pb-2">
                <Button
                  variant={!showEmailPreviewPane ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setShowEmailPreviewPane(false)}
                  data-testid="button-show-recipients"
                >
                  Recipients
                </Button>
                <Button
                  variant={showEmailPreviewPane ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setShowEmailPreviewPane(true)}
                  data-testid="button-show-email-preview"
                >
                  <Eye className="w-4 h-4 mr-1" />
                  Preview Email
                </Button>
              </div>

              {!showEmailPreviewPane ? (
                <>
                  <ScrollArea className="h-[300px] border rounded-md">
                    <div className="p-4 space-y-4">
                      {emailPreviewData.groups.map((group, index) => (
                        <div key={index} className="border rounded-md p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{group.artistName}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>Email:</span>
                            <code className="bg-muted px-2 py-0.5 rounded text-foreground" data-testid={`text-artist-email-${index}`}>
                              {group.email}
                            </code>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">Artworks to notify about:</span>
                            <ul className="mt-1 list-disc list-inside">
                              {group.artworks.map((artwork) => (
                                <li key={artwork.id} className="text-sm">{artwork.title}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <p className="text-sm text-muted-foreground">
                    An email will be sent to each artist with details about their artworks that are now live.
                  </p>
                </>
              ) : (
                <>
                  {emailPreviewData.emailPreview ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Subject:</span>
                        <span className="font-medium">{emailPreviewData.emailPreview.subject}</span>
                      </div>
                      <div className="border rounded-md overflow-hidden">
                        <iframe
                          srcDoc={emailPreviewData.emailPreview.html}
                          className="w-full h-[350px] bg-white"
                          title="Email Preview"
                          sandbox=""
                          data-testid="iframe-email-preview"
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        This preview shows the email for <span className="font-medium">{emailPreviewData.groups[0]?.artistName}</span>. 
                        Each artist will receive a personalized version.
                      </p>
                    </div>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      No email preview available
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowNotifyArtistsDialog(false);
                setEmailPreviewData(null);
                setShowEmailPreviewPane(false);
              }}
              data-testid="button-cancel-notify"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendNotifications}
              disabled={sendNotificationsMutation.isPending || !emailPreviewData || emailPreviewData.groups.length === 0}
              data-testid="button-send-notifications"
            >
              {sendNotificationsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Send {emailPreviewData?.totalArtists || 0} Email{(emailPreviewData?.totalArtists || 0) !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mockupPreviewArtwork !== null} onOpenChange={(open) => {
        if (!open) {
          setMockupPreviewArtwork(null);
          setMockupPreviews(null);
          setSavedMockupsForView(null);
          setScanVideoResult(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mockupDialogMode === "view" ? "Saved Product Mockups" : "Product Mockup Preview"}
            </DialogTitle>
            <DialogDescription>
              {mockupPreviewArtwork ? `${mockupPreviewArtwork.title} by ${mockupPreviewArtwork.artistName}` : ""}
            </DialogDescription>
          </DialogHeader>

          {mockupDialogMode === "generate" && generateProductMockupsMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Generating mockup previews...</p>
            </div>
          )}

          {mockupDialogMode === "generate" && mockupPreviews && (
            <>
              <div className="grid grid-cols-2 gap-4">
                {mockupPreviews.map((preview) => (
                  <div key={preview.frame} className="flex flex-col gap-2">
                    <div className="border rounded-md overflow-hidden bg-muted/30">
                      <img
                        src={preview.dataUrl}
                        alt={`${preview.frame} frame mockup`}
                        className="w-full h-auto"
                        data-testid={`img-mockup-preview-${preview.frame}`}
                      />
                    </div>
                    <div className="flex items-center justify-between px-1">
                      <span className="text-sm font-medium capitalize" data-testid={`text-mockup-frame-${preview.frame}`}>
                        {preview.frame === "unframed" ? "Unframed" : `${preview.frame} Frame`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {(preview.sizeBytes / 1024).toFixed(0)} KB
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (mockupPreviewArtwork && mockupPreviews) {
                      mockupPreviews.forEach((p) => {
                        const frameSlug = p.frame === "unframed" ? "Unframed" : `${p.frame.charAt(0).toUpperCase() + p.frame.slice(1)}-Frame`;
                        const filename = `${mockupPreviewArtwork.title.replace(/\s+/g, "-")}_${frameSlug}.jpg`;
                        const a = document.createElement("a");
                        a.href = p.dataUrl;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                      });
                    }
                  }}
                  data-testid="button-download-all-previews"
                >
                  <Download className="w-3 h-3 mr-1" />
                  Download All Previews
                </Button>
              </div>
            </>
          )}

          {mockupDialogMode === "view" && !savedMockupsForView && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading saved mockups...</p>
            </div>
          )}

          {mockupDialogMode === "view" && savedMockupsForView && (
            <>
              <div className="grid grid-cols-2 gap-4">
                {savedMockupsForView.map((mockup) => (
                  <div key={mockup.id} className="flex flex-col gap-2">
                    <div className="border rounded-md overflow-hidden bg-muted/30">
                      <img
                        src={mockup.mockupImageUrl}
                        alt={`${mockup.frameType} mockup`}
                        className="w-full h-auto"
                        data-testid={`img-saved-mockup-${mockup.id}`}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-1 px-1">
                      <span className="text-sm font-medium" data-testid={`text-saved-mockup-${mockup.id}`}>
                        {mockup.frameType}
                      </span>
                      <div className="flex items-center gap-1 flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (mockupPreviewArtwork) {
                              const frameSlug = mockup.frameType.replace(/\s+/g, "-");
                              downloadMockupImage(mockup.mockupImageUrl, `${mockupPreviewArtwork.title.replace(/\s+/g, "-")}_${frameSlug}.jpg`);
                            }
                          }}
                          data-testid={`button-download-mockup-${mockup.id}`}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Download
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          disabled={deleteMockupMutation.isPending}
                          onClick={() => deleteMockupMutation.mutate(mockup.id)}
                          data-testid={`button-delete-mockup-${mockup.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (mockupPreviewArtwork && savedMockupsForView) {
                      downloadAllMockups(
                        mockupPreviewArtwork,
                        savedMockupsForView.map(m => ({ url: m.mockupImageUrl, frame: m.frameType }))
                      );
                    }
                  }}
                  data-testid="button-download-all-saved"
                >
                  <Download className="w-3 h-3 mr-1" />
                  Download All
                </Button>
              </div>
            </>
          )}

          {mockupPreviewArtwork && (
            <div className="border-t pt-4 mt-2">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4" />
                  Lifestyle Templates
                </h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (mockupPreviewArtwork) {
                      generateTemplateMockupsMutation.mutate(mockupPreviewArtwork.id);
                    }
                  }}
                  disabled={generateTemplateMockupsMutation.isPending}
                  data-testid="button-generate-template-mockups"
                >
                  {generateTemplateMockupsMutation.isPending ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <LayoutTemplate className="w-3 h-3 mr-1" />
                      Generate from Templates
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Generate lifestyle mockups from all matching templates for this artwork. Results will appear in the saved mockups above.
              </p>
            </div>
          )}

          {mockupPreviewArtwork && (
            <div className="border-t pt-4 mt-2">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Video className="w-4 h-4" />
                  Scan Video
                </h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (mockupPreviewArtwork) {
                      generateScanVideoMutation.mutate(mockupPreviewArtwork.id);
                    }
                  }}
                  disabled={generateScanVideoMutation.isPending}
                  data-testid="button-generate-scan-video"
                >
                  {generateScanVideoMutation.isPending ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Generating...
                    </>
                  ) : scanVideoResult ? (
                    <>
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Regenerate
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 mr-1" />
                      Generate
                    </>
                  )}
                </Button>
              </div>
              {generateScanVideoMutation.isPending && (
                <div className="flex flex-col items-center justify-center py-6 gap-2 border rounded-md bg-muted/30">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Generating scan video... this may take a minute</p>
                </div>
              )}
              {scanVideoResult && !generateScanVideoMutation.isPending && (
                <div className="flex flex-col gap-2">
                  <div className="border rounded-md overflow-hidden bg-black flex items-center justify-center">
                    <video
                      src={scanVideoResult.url}
                      controls
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="max-h-[300px] w-auto"
                      data-testid="video-scan-preview"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-1 px-1">
                    <span className="text-xs text-muted-foreground">
                      {scanVideoResult.sizeBytes > 0 ? `${(scanVideoResult.sizeBytes / 1024 / 1024).toFixed(1)}MB` : "Saved"}
                    </span>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const a = document.createElement("a");
                          a.href = scanVideoResult.url;
                          a.download = `${mockupPreviewArtwork.title.replace(/\s+/g, "-")}_Scan-Video.mp4`;
                          a.target = "_blank";
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        }}
                        data-testid="button-download-scan-video"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Download
                      </Button>
                      {scanVideoResult.mockupId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          disabled={deleteMockupMutation.isPending}
                          onClick={() => {
                            if (scanVideoResult.mockupId) {
                              deleteMockupMutation.mutate(scanVideoResult.mockupId);
                              setScanVideoResult(null);
                            }
                          }}
                          data-testid="button-delete-scan-video"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {!scanVideoResult && !generateScanVideoMutation.isPending && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No scan video yet. Click Generate to create an artwork detail video.
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            {mockupDialogMode === "view" && (
              <Button
                variant="outline"
                onClick={() => {
                  if (mockupPreviewArtwork) {
                    setMockupDialogMode("generate");
                    setSavedMockupsForView(null);
                    setMockupPreviews(null);
                    generateProductMockupsMutation.mutate(mockupPreviewArtwork.id);
                  }
                }}
                disabled={generateProductMockupsMutation.isPending}
                data-testid="button-regenerate-mockups"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Regenerate
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setMockupPreviewArtwork(null);
                setMockupPreviews(null);
                setSavedMockupsForView(null);
                setScanVideoResult(null);
              }}
              data-testid="button-cancel-mockups"
            >
              Cancel
            </Button>
            {mockupDialogMode === "generate" && mockupPreviews && mockupPreviewArtwork && (
              <Button
                onClick={() => saveProductMockupsMutation.mutate(mockupPreviewArtwork.id)}
                disabled={saveProductMockupsMutation.isPending}
                data-testid="button-save-mockups"
              >
                {saveProductMockupsMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Approve & Save
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
