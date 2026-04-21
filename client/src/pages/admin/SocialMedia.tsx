import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Instagram,
  Linkedin,
  AtSign,
  Sparkles,
  Send,
  ImagePlus,
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Eye,
  Upload,
  Search,
  Image as ImageIcon,
  Layers,
} from "lucide-react";

interface Captions {
  instagram: string;
  linkedin: string;
  threads: string;
}

interface PlatformResult {
  platform: string;
  success: boolean;
  error?: string;
}

interface MockupItem {
  id: string;
  frameType: string;
  imageUrl: string;
  artworkTitle: string;
  artistName: string;
  isLifestyle: boolean;
}

type Platform = "instagram" | "linkedin" | "threads";

const PLATFORM_CONFIG: Record<Platform, { label: string; icon: typeof Instagram; color: string; bgClass: string }> = {
  instagram: { label: "Instagram", icon: Instagram, color: "text-pink-500", bgClass: "bg-gradient-to-br from-purple-500/10 to-pink-500/10" },
  linkedin: { label: "LinkedIn", icon: Linkedin, color: "text-blue-600", bgClass: "bg-blue-500/10" },
  threads: { label: "Threads", icon: AtSign, color: "text-foreground", bgClass: "bg-muted/50" },
};

function ImagePicker({
  image,
  onSetImage,
  onClearImage,
  artistName,
}: {
  image: { url: string; name: string } | null;
  onSetImage: (url: string, name: string) => void;
  onClearImage: () => void;
  artistName: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mockupSearch, setMockupSearch] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: mockupsData, isLoading: loadingMockups } = useQuery<{ mockups: MockupItem[] }>({
    queryKey: ["/api/admin/social-media/mockups", mockupSearch, artistName],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (mockupSearch) params.set("search", mockupSearch);
      if (artistName) params.set("artistName", artistName);
      const res = await fetch(`/api/admin/social-media/mockups?${params}`, { credentials: "include" });
      return res.json();
    },
    enabled: dialogOpen,
  });

  const handleFileUpload = async (file: File) => {
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/admin/social-media/upload-image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }
      const data = await res.json();
      onSetImage(data.url, data.filename || file.name);
      toast({ title: "Image uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingFile(false);
    }
  };

  const selectMockup = (mockup: MockupItem) => {
    onSetImage(mockup.imageUrl, `${mockup.artworkTitle} - ${mockup.frameType}`);
    setDialogOpen(false);
  };

  return (
    <div className="space-y-3">
      {image && (
        <div className="relative group rounded-md overflow-hidden border">
          <img
            src={image.url}
            alt={image.name}
            className="w-full h-40 object-cover"
            data-testid="img-selected-0"
          />
          <Button
            size="icon"
            variant="secondary"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={onClearImage}
            data-testid="button-remove-image"
          >
            <X className="w-4 h-4" />
          </Button>
          <p className="text-xs text-muted-foreground p-2 truncate">{image.name}</p>
        </div>
      )}

      {!image && <div className="flex gap-2">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1" data-testid="button-browse-mockups">
              <Layers className="w-4 h-4 mr-1" />
              Browse Mockups
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Select from Mockups</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={mockupSearch}
                  onChange={(e) => setMockupSearch(e.target.value)}
                  placeholder="Search by artwork title, artist, or frame type..."
                  className="pl-9"
                  data-testid="input-mockup-search"
                />
              </div>
              <ScrollArea className="h-[400px]">
                {loadingMockups ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !mockupsData?.mockups?.length ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>No mockups found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3 pr-4">
                    {mockupsData.mockups.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => selectMockup(m)}
                        className="text-left rounded-md border overflow-hidden hover-elevate cursor-pointer"
                        data-testid={`mockup-item-${m.id}`}
                      >
                        <img
                          src={m.imageUrl}
                          alt={`${m.artworkTitle} - ${m.frameType}`}
                          className="w-full h-32 object-cover"
                          loading="lazy"
                        />
                        <div className="p-2">
                          <p className="text-xs font-medium truncate">{m.artworkTitle}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {m.artistName} {m.isLifestyle ? "" : `- ${m.frameType}`}
                          </p>
                          {m.isLifestyle && (
                            <Badge variant="secondary" className="text-[9px] mt-1">Lifestyle</Badge>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </DialogContent>
        </Dialog>

        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingFile}
          data-testid="button-upload-image"
        >
          {uploadingFile ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 mr-1" />
          )}
          {uploadingFile ? "Uploading..." : "Upload Image"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
            e.target.value = "";
          }}
        />
      </div>}

      <p className="text-xs text-muted-foreground">
        {!image
          ? "Required for Instagram. Optional for LinkedIn and Threads."
          : "1 image selected. Replace by browsing mockups or uploading a new file."}
      </p>
    </div>
  );
}

function PlatformPreview({
  platform,
  caption,
  username,
  image,
  onCaptionChange,
  enabled,
  onToggle,
}: {
  platform: Platform;
  caption: string;
  username: string | null;
  image: { url: string; name: string } | null;
  onCaptionChange: (val: string) => void;
  enabled: boolean;
  onToggle: (val: boolean) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const config = PLATFORM_CONFIG[platform];
  const Icon = config.icon;

  return (
    <Card className={`${!enabled ? "opacity-50" : ""}`} data-testid={`card-platform-${platform}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Icon className={`w-5 h-5 ${config.color}`} />
          <CardTitle className="text-base">{config.label}</CardTitle>
          {username && (
            <Badge variant="secondary">@{username}</Badge>
          )}
          {platform === "instagram" && !image && (
            <Badge variant="outline" className="text-orange-500 border-orange-300">Requires image</Badge>
          )}
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          data-testid={`switch-platform-${platform}`}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={caption}
              onChange={(e) => onCaptionChange(e.target.value)}
              className="min-h-[200px] text-sm"
              data-testid={`textarea-caption-${platform}`}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(false)}
                data-testid={`button-done-editing-${platform}`}
              >
                <Eye className="w-4 h-4 mr-1" />
                Preview
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={`rounded-md overflow-hidden cursor-pointer ${config.bgClass}`}
            onClick={() => setIsEditing(true)}
            data-testid={`preview-caption-${platform}`}
          >
            {image && (
              <img
                src={image.url}
                alt={image.name}
                className="w-full h-48 object-cover"
              />
            )}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <span className="font-medium text-sm">
                  {username ? `@${username}` : config.label}
                </span>
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{caption}</div>
              <p className="text-xs text-muted-foreground mt-3">Click to edit</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{caption.length} characters</span>
          {platform === "instagram" && <span>Max: 2,200</span>}
          {platform === "linkedin" && <span>Max: 3,000</span>}
          {platform === "threads" && <span>Max: 500</span>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SocialMedia() {
  const { toast } = useToast();

  const [artistName, setArtistName] = useState("");
  const [artistBio, setArtistBio] = useState("");
  const [artistLocation, setArtistLocation] = useState("");
  const [isExclusive, setIsExclusive] = useState(true);
  const [postType, setPostType] = useState<"new_artist" | "new_collection">("new_artist");

  const [captions, setCaptions] = useState<Captions | null>(null);
  const [image, setImage] = useState<{ url: string; name: string } | null>(null);

  const [enabledPlatforms, setEnabledPlatforms] = useState<Record<Platform, boolean>>({
    instagram: true,
    linkedin: true,
    threads: true,
  });

  const [sendResults, setSendResults] = useState<PlatformResult[] | null>(null);

  const { data: accountsData } = useQuery<{ configured: boolean; accounts: Record<Platform, string | null> }>({
    queryKey: ["/api/admin/social-media/accounts"],
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/social-media/generate-captions", {
        artistName,
        artistBio: artistBio || undefined,
        artistLocation: artistLocation || undefined,
        isExclusive,
        postType,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setCaptions(data.captions);
      setSendResults(null);
      toast({ title: "Captions generated", description: "Review and edit the drafts below before sending." });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!captions) throw new Error("No captions to send");
      const platforms = (Object.entries(enabledPlatforms) as [Platform, boolean][])
        .filter(([, v]) => v)
        .map(([k]) => k);

      if (platforms.includes("instagram") && !image) {
        throw new Error("Instagram requires an image. Please add an image or disable Instagram.");
      }

      const mediaUrl = image?.url;
      const mediaName = image?.name;

      const res = await apiRequest("POST", "/api/admin/social-media/send-drafts", {
        captions,
        mediaUrl,
        mediaName,
        platforms,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSendResults(data.platformResults);
      const succeeded = data.platformResults.filter((r: PlatformResult) => r.success).length;
      const failed = data.platformResults.filter((r: PlatformResult) => !r.success).length;
      if (succeeded > 0 && failed === 0) {
        toast({ title: "All drafts sent", description: `${succeeded} draft(s) created in Postpone.` });
      } else if (succeeded > 0) {
        toast({ title: "Partial success", description: `${succeeded} sent, ${failed} failed.`, variant: "destructive" });
      } else {
        toast({ title: "All drafts failed", description: "Check the error details below.", variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    },
  });

  const updateCaption = (platform: Platform, value: string) => {
    if (!captions) return;
    setCaptions({ ...captions, [platform]: value });
    setSendResults(null);
  };

  const togglePlatform = (platform: Platform, val: boolean) => {
    setEnabledPlatforms((prev) => ({ ...prev, [platform]: val }));
  };

  const addImage = (url: string, name: string) => {
    setImage({ url, name });
  };

  const clearImage = () => {
    setImage(null);
  };

  const anyEnabled = Object.values(enabledPlatforms).some(Boolean);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6" data-testid="page-social-media">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Social Media Drafts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate AI captions, preview, edit, and send as drafts to Postpone
          </p>
        </div>
        {accountsData && (
          <Badge variant={accountsData.configured ? "secondary" : "destructive"} data-testid="badge-connection-status">
            {accountsData.configured ? "Postpone connected" : "Postpone not configured"}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Post Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="postType">Post type</Label>
                <Select value={postType} onValueChange={(v) => setPostType(v as "new_artist" | "new_collection")}>
                  <SelectTrigger data-testid="select-post-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new_artist">New Artist Launch</SelectItem>
                    <SelectItem value="new_collection">New Collection</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="artistName">Artist name *</Label>
                <Input
                  id="artistName"
                  value={artistName}
                  onChange={(e) => setArtistName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  data-testid="input-artist-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="artistBio">Artist bio</Label>
                <Textarea
                  id="artistBio"
                  value={artistBio}
                  onChange={(e) => setArtistBio(e.target.value)}
                  placeholder="Brief description of the artist's style and work..."
                  className="min-h-[80px]"
                  data-testid="textarea-artist-bio"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="artistLocation">Location</Label>
                <Input
                  id="artistLocation"
                  value={artistLocation}
                  onChange={(e) => setArtistLocation(e.target.value)}
                  placeholder="e.g. London, UK"
                  data-testid="input-artist-location"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="exclusive">Exclusive to ESS</Label>
                <Switch
                  id="exclusive"
                  checked={isExclusive}
                  onCheckedChange={setIsExclusive}
                  data-testid="switch-exclusive"
                />
              </div>

              <Button
                className="w-full"
                onClick={() => generateMutation.mutate()}
                disabled={!artistName.trim() || generateMutation.isPending}
                data-testid="button-generate-captions"
              >
                {generateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                {generateMutation.isPending ? "Generating..." : "Generate Captions"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Images</CardTitle>
            </CardHeader>
            <CardContent>
              <ImagePicker
                image={image}
                onSetImage={addImage}
                onClearImage={clearImage}
                artistName={artistName}
              />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {!captions ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Sparkles className="w-10 h-10 text-muted-foreground/40 mb-4" />
                <h3 className="font-medium text-muted-foreground" data-testid="text-empty-state">
                  No captions generated yet
                </h3>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  Fill in the artist details and click Generate Captions
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-medium">Draft Previews</h2>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSendResults(null);
                      generateMutation.mutate();
                    }}
                    disabled={generateMutation.isPending}
                    data-testid="button-regenerate"
                  >
                    <RefreshCw className={`w-4 h-4 mr-1 ${generateMutation.isPending ? "animate-spin" : ""}`} />
                    Regenerate
                  </Button>
                  <Button
                    onClick={() => sendMutation.mutate()}
                    disabled={sendMutation.isPending || !anyEnabled}
                    data-testid="button-send-drafts"
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    {sendMutation.isPending ? "Sending..." : "Send to Postpone"}
                  </Button>
                </div>
              </div>

              {sendResults && (
                <Card data-testid="card-send-results">
                  <CardContent className="py-4">
                    <div className="flex flex-col gap-2">
                      {sendResults.map((r) => (
                        <div key={r.platform} className="flex items-center gap-2 text-sm">
                          {r.success ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                          )}
                          <span className="font-medium">{r.platform}</span>
                          {r.success ? (
                            <span className="text-muted-foreground">Draft created in Postpone</span>
                          ) : (
                            <span className="text-red-500 text-xs">{r.error}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {(["instagram", "linkedin", "threads"] as Platform[]).map((platform) => (
                <PlatformPreview
                  key={platform}
                  platform={platform}
                  caption={captions[platform]}
                  username={accountsData?.accounts[platform] || null}
                  image={image}
                  onCaptionChange={(val) => updateCaption(platform, val)}
                  enabled={enabledPlatforms[platform]}
                  onToggle={(val) => togglePlatform(platform, val)}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
