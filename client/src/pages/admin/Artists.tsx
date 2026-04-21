import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Download, Link2, Trash2, Loader2, Users, RefreshCw, Mail, Send, Eye, Pencil, Settings2, AlertTriangle, Plus, Copy, ExternalLink, Clock, Store, BarChart2, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { useLocation } from "wouter";
import type { ArtistAccount, CommissionSettings, OnboardingInvitation } from "@shared/schema";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function AdminArtists() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [commissionDialogOpen, setCommissionDialogOpen] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<ArtistAccount | null>(null);
  const [linkEmail, setLinkEmail] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  
  // Bulk selection state
  const [selectedArtistIds, setSelectedArtistIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  
  // Edit artist form state
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editArtistAlias, setEditArtistAlias] = useState("");
  const [editUseCustomCommission, setEditUseCustomCommission] = useState(false);
  const [editCommissionRate, setEditCommissionRate] = useState("");
  
  // Global commission settings form state
  const [globalDefaultRate, setGlobalDefaultRate] = useState("");
  const [globalApplyAfterTax, setGlobalApplyAfterTax] = useState(true);
  const [globalApplyAfterShipping, setGlobalApplyAfterShipping] = useState(true);
  const [globalApplyAfterDiscounts, setGlobalApplyAfterDiscounts] = useState(true);

  // Supabase portal invite state
  const [supabaseInviteDialogOpen, setSupabaseInviteDialogOpen] = useState(false);
  const [supabaseInviteEmail, setSupabaseInviteEmail] = useState("");

  // Create + invite new artist state
  const [createInviteDialogOpen, setCreateInviteDialogOpen] = useState(false);
  const [newCreateFirstName, setNewCreateFirstName] = useState("");
  const [newCreateLastName, setNewCreateLastName] = useState("");
  const [newCreateEmail, setNewCreateEmail] = useState("");
  const [newCreateCommission, setNewCreateCommission] = useState("");

  // Sales sync state
  const [syncMonths, setSyncMonths] = useState(12);
  const [syncResult, setSyncResult] = useState<{ month: string; orders: number; artistsUpdated: string[] }[] | null>(null);
  const [syncExpanded, setSyncExpanded] = useState(false);

  // Onboarding invitations state
  const [onboardingDialogOpen, setOnboardingDialogOpen] = useState(false);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null);
  const [newInviteName, setNewInviteName] = useState("");
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [newInviteCommission, setNewInviteCommission] = useState("18");
  const [newInviteContractType, setNewInviteContractType] = useState<"exclusive" | "non_exclusive">("exclusive");

  const { data: artists, isLoading } = useQuery<ArtistAccount[]>({
    queryKey: ["/api/admin/artist-accounts"],
  });

  const { data: onboardingInvitations } = useQuery<OnboardingInvitation[]>({
    queryKey: ["/api/admin/onboarding-invitations"],
  });
  
  const { data: commissionSettings } = useQuery<CommissionSettings>({
    queryKey: ["/api/admin/commission-settings"],
  });
  
  useEffect(() => {
    if (commissionSettings) {
      setGlobalDefaultRate(String(commissionSettings.defaultCommissionRate));
      setGlobalApplyAfterTax(commissionSettings.applyAfterTax);
      setGlobalApplyAfterShipping(commissionSettings.applyAfterShipping);
      setGlobalApplyAfterDiscounts(commissionSettings.applyAfterDiscounts);
    }
  }, [commissionSettings]);

  const importVendorsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/import-vendors");
      return response.json();
    },
    onSuccess: (data: { total: number; created: number; existing: number; errors: number }) => {
      toast({
        title: "Import complete",
        description: `Imported ${data.created} new artists (${data.existing} existing, ${data.errors} errors)`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artist-accounts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const syncSalesMutation = useMutation({
    mutationFn: async (months: number) => {
      const response = await apiRequest("POST", "/api/admin/sync-artist-sales", { months });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "Sync failed");
      }
      return response.json() as Promise<{ success: boolean; months: number; summary: { month: string; orders: number; artistsUpdated: string[] }[] }>;
    },
    onSuccess: (data) => {
      const totalOrders = data.summary.reduce((s, m) => s + m.orders, 0);
      const updatedVendors = new Set(data.summary.flatMap(m => m.artistsUpdated));
      setSyncResult(data.summary);
      setSyncExpanded(true);
      toast({
        title: "Sales sync complete",
        description: `${totalOrders} orders processed across ${data.months} months — ${updatedVendors.size} artist${updatedVendors.size !== 1 ? "s" : ""} updated`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const linkAccountMutation = useMutation({
    mutationFn: async ({ id, primaryEmail }: { id: string; primaryEmail: string }) => {
      const response = await apiRequest("POST", `/api/admin/artist-accounts/${id}/link`, { primaryEmail });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Account linked",
        description: "Artist account has been updated",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artist-accounts"] });
      setLinkDialogOpen(false);
      setSelectedArtist(null);
      setLinkEmail("");
    },
    onError: (error: Error) => {
      toast({
        title: "Link failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/artist-accounts/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Account deleted",
        description: "Artist account has been removed",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artist-accounts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.all(
        ids.map(id => apiRequest("DELETE", `/api/admin/artist-accounts/${id}`))
      );
      return { results, count: ids.length };
    },
    onSuccess: (data) => {
      toast({
        title: "Artists deleted",
        description: `${data.count} artist(s) have been removed`,
      });
      setSelectedArtistIds(new Set());
      setDeleteConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artist-accounts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const inviteArtistMutation = useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }) => {
      const response = await apiRequest("POST", `/api/admin/artist-accounts/${id}/invite`, { email });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Invitation sent",
        description: "The artist will receive an email with login instructions",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artist-accounts"] });
      setInviteDialogOpen(false);
      setSelectedArtist(null);
      setInviteEmail("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send invitation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateArtistMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const response = await apiRequest("PATCH", `/api/admin/artist-accounts/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Artist updated",
        description: "Artist details have been saved",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artist-accounts"] });
      handleCloseEditDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update artist",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateCommissionSettingsMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CommissionSettings> }) => {
      const response = await apiRequest("PATCH", `/api/admin/commission-settings/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings saved",
        description: "Global commission settings have been updated",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commission-settings"] });
      setCommissionDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateOnboardingLinkMutation = useMutation({
    mutationFn: async (data: { artistName?: string; artistEmail?: string; commissionRate?: number; contractType?: string }) => {
      const response = await apiRequest("POST", "/api/admin/onboarding-invitations", data);
      return response.json();
    },
    onSuccess: (data: OnboardingInvitation) => {
      const url = `${window.location.origin}/onboarding/${data.token}`;
      setGeneratedInviteUrl(url);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/onboarding-invitations"] });
      toast({
        title: "Onboarding link created",
        description: "Copy the link and share it with the artist",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create link",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const supabaseInviteMutation = useMutation({
    mutationFn: async ({ email, artistAccountId }: { email: string; artistAccountId: string }) => {
      const response = await apiRequest("POST", "/api/admin/artists/invite", { email, artistAccountId });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Portal invitation sent",
        description: "The artist will receive a Supabase invitation email to set up their account",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artist-accounts"] });
      setSupabaseInviteDialogOpen(false);
      setSelectedArtist(null);
      setSupabaseInviteEmail("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send portal invitation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createAndInviteMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; email: string; commissionRate?: number }) => {
      const response = await apiRequest("POST", "/api/admin/artists/create-and-invite", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.warning) {
        toast({
          title: "Account created — invite failed",
          description: data.warning,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Artist invited",
          description: "Account created and portal invitation email sent",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artist-accounts"] });
      setCreateInviteDialogOpen(false);
      setNewCreateFirstName("");
      setNewCreateLastName("");
      setNewCreateEmail("");
      setNewCreateCommission("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to invite artist",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteOnboardingInvitationMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/admin/onboarding-invitations/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Invitation deleted",
        description: "The onboarding invitation has been removed",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/onboarding-invitations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete invitation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLink = (artist: ArtistAccount) => {
    setSelectedArtist(artist);
    setLinkEmail(artist.primaryEmail || "");
    setLinkDialogOpen(true);
  };

  const handleSaveLink = () => {
    if (selectedArtist && linkEmail) {
      linkAccountMutation.mutate({ id: selectedArtist.id, primaryEmail: linkEmail });
    }
  };

  const handleInvite = (artist: ArtistAccount) => {
    setSelectedArtist(artist);
    setInviteEmail(artist.primaryEmail || "");
    setInviteDialogOpen(true);
  };

  const handleSupabaseInvite = (artist: ArtistAccount) => {
    setSelectedArtist(artist);
    setSupabaseInviteEmail(artist.primaryEmail || "");
    setSupabaseInviteDialogOpen(true);
  };

  const handleSendInvite = () => {
    if (selectedArtist && inviteEmail) {
      inviteArtistMutation.mutate({ id: selectedArtist.id, email: inviteEmail });
    }
  };

  const handleGenerateOnboardingLink = () => {
    generateOnboardingLinkMutation.mutate({
      artistName: newInviteName || undefined,
      artistEmail: newInviteEmail || undefined,
      commissionRate: parseInt(newInviteCommission, 10) || 18,
      contractType: newInviteContractType,
    });
  };

  const handleCopyOnboardingLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied",
      description: "The onboarding link has been copied to your clipboard",
    });
  };

  const handleCloseOnboardingDialog = () => {
    setOnboardingDialogOpen(false);
    setGeneratedInviteUrl(null);
    setNewInviteName("");
    setNewInviteEmail("");
    setNewInviteCommission("18");
    setNewInviteContractType("exclusive");
  };

  const getInvitationStatusBadge = (status: string, expiresAt: string | Date) => {
    const isExpired = new Date(expiresAt) < new Date();
    if (status === "used") {
      return <Badge variant="default">Used</Badge>;
    }
    if (isExpired) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    return <Badge variant="secondary">Pending</Badge>;
  };

  const setupShopifyMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/admin/artist-accounts/${id}/setup-shopify`);
      return response.json();
    },
    onSuccess: (data: { success: boolean; metaobjectId?: string; collectionId?: string }) => {
      toast({
        title: "Shopify setup complete",
        description: "Artist metaobject, collection, and menu items have been created",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artist-accounts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Shopify setup failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSetupShopify = async (artist: ArtistAccount) => {
    // If artist has photos, show photo selection first, then run all steps
    const photoUrls = artist.photoUrls || [];
    if (photoUrls.length > 1) {
      // Show photo selection dialog, then run full sync with selected photo
      setPhotoSelectArtist(artist);
      setSelectedPhotoUrl(photoUrls[0]);
      setPhotoSelectMode("fullSync");
      setPhotoSelectDialogOpen(true);
    } else if (photoUrls.length === 1) {
      // Run full sync with the single photo
      await runFullSyncWithPhoto(artist.id, photoUrls[0]);
    } else {
      // No photos, just run the standard sync
      setupShopifyMutation.mutate(artist.id);
    }
  };

  const runFullSyncWithPhoto = async (artistId: string, photoUrl: string | null) => {
    try {
      // Step 1: Metaobject with photo
      setStepPending(artistId, "metaobject", true);
      const metaResponse = await apiRequest("POST", `/api/admin/artist-accounts/${artistId}/shopify/metaobject`, { photoUrl });
      const metaResult = await metaResponse.json();
      setStepPending(artistId, "metaobject", false);
      
      if (!metaResult.success && !metaResult.metaobjectId) {
        toast({ title: "Metaobject failed", description: "Could not create artist metaobject", variant: "destructive" });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/artist-accounts"] });
        return;
      }
      
      // Step 2: Collection
      setStepPending(artistId, "collection", true);
      await apiRequest("POST", `/api/admin/artist-accounts/${artistId}/shopify/collection`);
      setStepPending(artistId, "collection", false);
      
      // Step 3: Menus
      setStepPending(artistId, "menus", true);
      await apiRequest("POST", `/api/admin/artist-accounts/${artistId}/shopify/menus`);
      setStepPending(artistId, "menus", false);
      
      toast({ title: "Shopify setup complete", description: "Artist metaobject, collection, and menu items have been created" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artist-accounts"] });
    } catch (error) {
      setStepPending(artistId, "metaobject", false);
      setStepPending(artistId, "collection", false);
      setStepPending(artistId, "menus", false);
      toast({ title: "Shopify setup failed", description: (error as Error).message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artist-accounts"] });
    }
  };

  // Reset Shopify status mutation
  const resetShopifyMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/admin/artist-accounts/${id}/shopify/reset`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Shopify status reset",
        description: "You can now re-run the Shopify setup steps",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artist-accounts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Reset failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleResetShopify = (artistId: string) => {
    resetShopifyMutation.mutate(artistId);
  };

  // Track pending states per artist/step
  const [pendingSteps, setPendingSteps] = useState<Record<string, Set<string>>>({});
  
  // Photo selection dialog state
  const [photoSelectDialogOpen, setPhotoSelectDialogOpen] = useState(false);
  const [photoSelectArtist, setPhotoSelectArtist] = useState<ArtistAccount | null>(null);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
  const [photoSelectMode, setPhotoSelectMode] = useState<"metaobject" | "fullSync">("metaobject");

  const isStepPending = (artistId: string, step: string) => {
    return pendingSteps[artistId]?.has(step) || false;
  };

  const setStepPending = (artistId: string, step: string, pending: boolean) => {
    setPendingSteps(prev => {
      const artistSteps = new Set(prev[artistId] || []);
      if (pending) {
        artistSteps.add(step);
      } else {
        artistSteps.delete(step);
      }
      return { ...prev, [artistId]: artistSteps };
    });
  };

  const handleMetaobjectClick = (artist: ArtistAccount) => {
    const photoUrls = artist.photoUrls || [];
    if (photoUrls.length > 1) {
      setPhotoSelectArtist(artist);
      setSelectedPhotoUrl(photoUrls[0]);
      setPhotoSelectMode("metaobject");
      setPhotoSelectDialogOpen(true);
    } else {
      handleSetupMetaobject(artist.id, photoUrls[0] || null);
    }
  };

  const handlePhotoSelectConfirm = () => {
    if (photoSelectArtist && selectedPhotoUrl) {
      setPhotoSelectDialogOpen(false);
      if (photoSelectMode === "fullSync") {
        runFullSyncWithPhoto(photoSelectArtist.id, selectedPhotoUrl);
      } else {
        handleSetupMetaobject(photoSelectArtist.id, selectedPhotoUrl);
      }
      setPhotoSelectArtist(null);
      setSelectedPhotoUrl(null);
      setPhotoSelectMode("metaobject");
    }
  };

  const handleSetupMetaobject = async (artistId: string, photoUrl?: string | null) => {
    setStepPending(artistId, "metaobject", true);
    try {
      await apiRequest("POST", `/api/admin/artist-accounts/${artistId}/shopify/metaobject`, { photoUrl });
      toast({ title: "Metaobject created", description: "Artist page created in Shopify" });
    } catch (error) {
      toast({ title: "Metaobject failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setStepPending(artistId, "metaobject", false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artist-accounts"] });
    }
  };

  const handleSetupCollection = async (artistId: string) => {
    setStepPending(artistId, "collection", true);
    try {
      await apiRequest("POST", `/api/admin/artist-accounts/${artistId}/shopify/collection`);
      toast({ title: "Collection created", description: "Artist collection created in Shopify" });
    } catch (error) {
      toast({ title: "Collection failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setStepPending(artistId, "collection", false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artist-accounts"] });
    }
  };

  const handleSetupMenus = async (artistId: string) => {
    setStepPending(artistId, "menus", true);
    try {
      await apiRequest("POST", `/api/admin/artist-accounts/${artistId}/shopify/menus`);
      toast({ title: "Menus updated", description: "Artist added to Shopify menus" });
    } catch (error) {
      toast({ title: "Menus failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setStepPending(artistId, "menus", false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artist-accounts"] });
    }
  };

  const getStepBadge = (status: string | undefined | null) => {
    switch (status) {
      case "succeeded":
        return <Badge variant="outline" className="text-green-600 border-green-600">Done</Badge>;
      case "processing":
        return <Badge variant="outline" className="text-blue-600 border-blue-600">...</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const handleEdit = (artist: ArtistAccount) => {
    // Reset all edit state before setting new values
    setEditFirstName(artist.firstName || "");
    setEditLastName(artist.lastName || "");
    setEditArtistAlias(artist.artistAlias || "");
    setEditUseCustomCommission(artist.useCustomCommission ?? false);
    setEditCommissionRate(artist.commissionRate !== null && artist.commissionRate !== undefined ? String(artist.commissionRate) : "");
    setSelectedArtist(artist);
    setEditDialogOpen(true);
  };
  
  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setSelectedArtist(null);
    setEditFirstName("");
    setEditLastName("");
    setEditArtistAlias("");
    setEditUseCustomCommission(false);
    setEditCommissionRate("");
  };

  // Selection handlers for bulk delete
  const handleToggleArtist = (artistId: string) => {
    setSelectedArtistIds(prev => {
      const next = new Set(prev);
      if (next.has(artistId)) {
        next.delete(artistId);
      } else {
        next.add(artistId);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    if (!artists) return;
    if (selectedArtistIds.size === artists.length) {
      setSelectedArtistIds(new Set());
    } else {
      setSelectedArtistIds(new Set(artists.map(a => a.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedArtistIds.size > 0) {
      setDeleteConfirmOpen(true);
    }
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(Array.from(selectedArtistIds));
  };

  const handleSaveEdit = () => {
    if (selectedArtist) {
      const rate = editCommissionRate ? parseFloat(editCommissionRate) : null;
      if (editUseCustomCommission && (rate === null || isNaN(rate) || rate < 0 || rate > 100)) {
        toast({
          title: "Invalid commission rate",
          description: "Please enter a valid percentage between 0 and 100",
          variant: "destructive",
        });
        return;
      }
      updateArtistMutation.mutate({
        id: selectedArtist.id,
        updates: {
          firstName: editFirstName.trim() || null,
          lastName: editLastName.trim() || null,
          artistAlias: editArtistAlias.trim() || null,
          useCustomCommission: editUseCustomCommission,
          commissionRate: editUseCustomCommission && rate !== null ? rate : null,
        },
      });
    }
  };

  const handleSaveCommissionSettings = () => {
    if (commissionSettings) {
      const rate = parseFloat(globalDefaultRate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        toast({
          title: "Invalid commission rate",
          description: "Please enter a valid percentage between 0 and 100",
          variant: "destructive",
        });
        return;
      }
      updateCommissionSettingsMutation.mutate({
        id: commissionSettings.id,
        updates: {
          defaultCommissionRate: rate,
          applyAfterTax: globalApplyAfterTax,
          applyAfterShipping: globalApplyAfterShipping,
          applyAfterDiscounts: globalApplyAfterDiscounts,
        },
      });
    }
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "outline" => {
    switch (status) {
      case "active":
        return "default";
      case "invited":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display" data-testid="text-page-title">
            Artist Accounts
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage artist accounts imported from Shopify vendors
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setCreateInviteDialogOpen(true)}
            data-testid="button-new-artist"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Artist
          </Button>
          <Button
            variant="outline"
            onClick={() => setCommissionDialogOpen(true)}
            data-testid="button-commission-settings"
          >
            <Settings2 className="h-4 w-4 mr-2" />
            Commission Settings
          </Button>
          <Button
            onClick={() => importVendorsMutation.mutate()}
            disabled={importVendorsMutation.isPending}
            data-testid="button-import-vendors"
          >
            {importVendorsMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Import from Shopify
          </Button>
          <div className="flex items-center gap-1 border rounded-md overflow-hidden">
            <Select value={String(syncMonths)} onValueChange={(v) => setSyncMonths(Number(v))}>
              <SelectTrigger className="border-0 rounded-none h-9 w-24 text-xs focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 6, 12, 18, 24].map(m => (
                  <SelectItem key={m} value={String(m)}>{m} months</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="default"
              size="sm"
              className="rounded-none h-9 px-3"
              onClick={() => syncSalesMutation.mutate(syncMonths)}
              disabled={syncSalesMutation.isPending}
              data-testid="button-sync-sales"
            >
              {syncSalesMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <BarChart2 className="h-4 w-4 mr-2" />
              )}
              Sync Sales
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="card-total-artists">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Artists</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{artists?.length || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-linked-artists">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Linked</CardTitle>
            <Link2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {artists?.filter(a => a.onboardingStatus !== "pending").length || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-pending-artists">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {artists?.filter(a => a.onboardingStatus === "pending").length || 0}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sales Sync Results */}
      {(syncSalesMutation.isPending || syncResult) && (
        <Card className={syncSalesMutation.isPending ? "border-blue-200 bg-blue-50/40" : "border-green-200 bg-green-50/40"}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {syncSalesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                )}
                <CardTitle className="text-sm font-medium">
                  {syncSalesMutation.isPending
                    ? `Syncing ${syncMonths} months of sales from Shopify…`
                    : `Sync complete — ${syncResult?.reduce((s, m) => s + m.orders, 0)} orders across ${syncResult?.length} months`}
                </CardTitle>
              </div>
              {syncResult && !syncSalesMutation.isPending && (
                <Button variant="ghost" size="sm" onClick={() => setSyncExpanded(v => !v)} className="h-7 px-2">
                  {syncExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </CardHeader>
          {syncExpanded && syncResult && (
            <CardContent className="pt-0">
              <div className="space-y-1 max-h-64 overflow-y-auto text-sm">
                {syncResult.map(row => (
                  <div key={row.month} className="flex items-center justify-between py-1 border-b border-green-100 last:border-0">
                    <span className="font-medium text-stone-700 w-36">{row.month}</span>
                    <span className="text-stone-500 text-xs">{row.orders} orders</span>
                    <span className="text-stone-600 text-xs flex-1 text-right">
                      {row.artistsUpdated.length > 0
                        ? row.artistsUpdated.join(", ")
                        : <span className="text-stone-400 italic">no artist sales</span>}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Onboarding Invitations Section */}
      <Card data-testid="card-onboarding-invitations">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Onboarding Invitations</CardTitle>
            <CardDescription>
              Generate unique links for new artists to complete the onboarding form. Links expire after 14 days.
            </CardDescription>
          </div>
          <Button
            onClick={() => setOnboardingDialogOpen(true)}
            data-testid="button-new-onboarding-link"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Onboarding Link
          </Button>
        </CardHeader>
        <CardContent>
          {onboardingInvitations && onboardingInvitations.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artist Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {onboardingInvitations.map((invitation) => (
                  <TableRow key={invitation.id} data-testid={`row-invitation-${invitation.id}`}>
                    <TableCell className="font-medium">
                      {invitation.artistName || "-"}
                    </TableCell>
                    <TableCell>{invitation.artistEmail || "-"}</TableCell>
                    <TableCell>
                      {getInvitationStatusBadge(invitation.status, invitation.expiresAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(invitation.createdAt), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(invitation.expiresAt), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {invitation.status !== "used" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopyOnboardingLink(`${window.location.origin}/onboarding/${invitation.token}`)}
                            data-testid={`button-copy-link-${invitation.id}`}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copy Link
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteOnboardingInvitationMutation.mutate(invitation.id)}
                          disabled={deleteOnboardingInvitationMutation.isPending}
                          data-testid={`button-delete-invitation-${invitation.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No onboarding invitations yet. Click "New Onboarding Link" to create one.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Applications - Artists who completed onboarding but need Shopify setup */}
      {artists && artists.filter(a => a.onboardingStatus === "active" && !a.shopifySetupComplete).length > 0 && (
        <Card data-testid="card-pending-applications" className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-amber-600" />
              Pending Applications
            </CardTitle>
            <CardDescription>
              Artists who completed onboarding and need their Shopify collection, metaobject, and menu items set up
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artist Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Photo</TableHead>
                  <TableHead>Metaobject</TableHead>
                  <TableHead>Collection</TableHead>
                  <TableHead>Menus</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {artists
                  .filter(a => a.onboardingStatus === "active" && !a.shopifySetupComplete)
                  .map((artist) => (
                    <TableRow key={artist.id} data-testid={`row-pending-${artist.id}`}>
                      <TableCell className="font-medium">
                        {artist.artistAlias || artist.vendorName}
                      </TableCell>
                      <TableCell>{artist.primaryEmail || "-"}</TableCell>
                      <TableCell>
                        {artist.photoUrls && artist.photoUrls.length > 0 ? (
                          <div className="flex items-center gap-1">
                            {artist.photoUrls.slice(0, 3).map((url, idx) => (
                              <img
                                key={idx}
                                src={url}
                                alt={`Photo ${idx + 1}`}
                                className="w-8 h-8 object-cover rounded border"
                              />
                            ))}
                            {artist.photoUrls.length > 1 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-xs"
                                onClick={() => {
                                  setPhotoSelectArtist(artist);
                                  setSelectedPhotoUrl(artist.photoUrls?.[0] || null);
                                  setPhotoSelectDialogOpen(true);
                                }}
                                data-testid={`button-select-photo-${artist.id}`}
                              >
                                Select
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">No photos</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStepBadge(artist.shopifyMetaobjectStatus)}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMetaobjectClick(artist)}
                            disabled={isStepPending(artist.id, "metaobject") || artist.shopifyMetaobjectStatus === "succeeded"}
                            data-testid={`button-metaobject-${artist.id}`}
                          >
                            {isStepPending(artist.id, "metaobject") ? <Loader2 className="h-3 w-3 animate-spin" /> : "Run"}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStepBadge(artist.shopifyCollectionStatus)}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSetupCollection(artist.id)}
                            disabled={isStepPending(artist.id, "collection") || artist.shopifyCollectionStatus === "succeeded"}
                            data-testid={`button-collection-${artist.id}`}
                          >
                            {isStepPending(artist.id, "collection") ? <Loader2 className="h-3 w-3 animate-spin" /> : "Run"}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStepBadge(artist.shopifyMenusStatus)}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSetupMenus(artist.id)}
                            disabled={isStepPending(artist.id, "menus") || artist.shopifyMenusStatus === "succeeded" || !artist.shopifyCollectionId}
                            data-testid={`button-menus-${artist.id}`}
                          >
                            {isStepPending(artist.id, "menus") ? <Loader2 className="h-3 w-3 animate-spin" /> : "Run"}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/admin/view-artist/${artist.id}`)}
                            data-testid={`button-view-pending-${artist.id}`}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(artist)}
                            data-testid={`button-edit-pending-${artist.id}`}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResetShopify(artist.id)}
                            disabled={resetShopifyMutation.isPending}
                            data-testid={`button-reset-shopify-${artist.id}`}
                            title="Reset Shopify status to re-run steps"
                          >
                            <RefreshCw className={`h-3 w-3 ${resetShopifyMutation.isPending ? 'animate-spin' : ''}`} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-artists-table">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
          <div>
            <CardTitle>All Artists</CardTitle>
            <CardDescription>
              Artists imported from Shopify product vendors
            </CardDescription>
          </div>
          {selectedArtistIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              data-testid="button-bulk-delete"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete {selectedArtistIds.size} selected
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : artists && artists.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedArtistIds.size === artists.length ? true : selectedArtistIds.size === 0 ? false : "indeterminate"}
                      onCheckedChange={handleToggleAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Vendor Name</TableHead>
                  <TableHead>Photos</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>PayPal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {artists.map((artist) => (
                  <TableRow key={artist.id} data-testid={`row-artist-${artist.id}`}>
                    <TableCell>
                      <Checkbox
                        checked={selectedArtistIds.has(artist.id)}
                        onCheckedChange={() => handleToggleArtist(artist.id)}
                        data-testid={`checkbox-artist-${artist.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{artist.vendorName}</TableCell>
                    <TableCell>
                      {artist.photoUrls && artist.photoUrls.length > 0 ? (
                        <div className="flex items-center gap-1">
                          {artist.photoUrls.slice(0, 3).map((url, idx) => (
                            <div key={idx} className="relative group">
                              <img
                                src={url}
                                alt={`Photo ${idx + 1}`}
                                className="w-10 h-10 object-cover rounded"
                              />
                              <Button
                                variant="secondary"
                                size="icon"
                                className="absolute inset-0 w-10 h-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const link = document.createElement("a");
                                  link.href = `/api/admin/artist-accounts/${artist.id}/photos/${idx}/download`;
                                  link.download = `${artist.vendorName.replace(/[^a-zA-Z0-9]/g, "_")}_photo_${idx + 1}.jpg`;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                }}
                                data-testid={`button-download-photo-${artist.id}-${idx}`}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          {artist.photoUrls.length > 3 && (
                            <span className="text-xs text-muted-foreground">+{artist.photoUrls.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell>{artist.primaryEmail || "-"}</TableCell>
                    <TableCell>{artist.paypalEmail || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(artist.onboardingStatus)}>
                        {artist.onboardingStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(artist.createdAt), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/admin/view-artist/${artist.id}`)}
                          data-testid={`button-view-${artist.id}`}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(artist)}
                          data-testid={`button-edit-${artist.id}`}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleInvite(artist)}
                          disabled={artist.onboardingStatus === "active"}
                          data-testid={`button-invite-${artist.id}`}
                        >
                          <Mail className="h-3 w-3 mr-1" />
                          Invite
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSupabaseInvite(artist)}
                          data-testid={`button-portal-invite-${artist.id}`}
                          title="Send Supabase portal invitation"
                        >
                          <Send className="h-3 w-3 mr-1" />
                          Portal Invite
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLink(artist)}
                          data-testid={`button-link-${artist.id}`}
                        >
                          <Link2 className="h-3 w-3 mr-1" />
                          Link
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetupShopify(artist)}
                          disabled={setupShopifyMutation.isPending || artist.shopifySetupComplete}
                          data-testid={`button-sync-shopify-${artist.id}`}
                          title={artist.shopifySetupComplete ? "Already synced to Shopify" : "Sync metaobject, collection & menus to Shopify"}
                        >
                          {setupShopifyMutation.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Store className="h-3 w-3 mr-1" />
                          )}
                          Sync
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteAccountMutation.mutate(artist.id)}
                          disabled={deleteAccountMutation.isPending}
                          data-testid={`button-delete-${artist.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No artists found. Click "Import from Shopify" to import vendors as artists.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Artist Account</DialogTitle>
            <DialogDescription>
              Enter the artist's email to link their account. They will use this email to log in to the artist dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Artist Name</Label>
              <Input value={selectedArtist?.vendorName || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkEmail">Email Address</Label>
              <Input
                id="linkEmail"
                type="email"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                placeholder="artist@example.com"
                data-testid="input-link-email"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveLink}
              disabled={!linkEmail || linkAccountMutation.isPending}
              data-testid="button-save-link"
            >
              {linkAccountMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Artist</DialogTitle>
            <DialogDescription>
              Send an invitation email with a magic link to set up their account password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Artist Name</Label>
              <Input value={selectedArtist?.vendorName || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inviteEmail">Email Address</Label>
              <Input
                id="inviteEmail"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="artist@example.com"
                data-testid="input-invite-email"
              />
              <p className="text-sm text-muted-foreground">
                The artist will receive an email with a link to set their password (valid for 7 days).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendInvite}
              disabled={!inviteEmail || inviteArtistMutation.isPending}
              data-testid="button-send-invite"
            >
              {inviteArtistMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Artist Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => !open && handleCloseEditDialog()}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Artist</DialogTitle>
            <DialogDescription>
              Update artist details and commission settings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Vendor Name (Shopify)</Label>
              <Input value={selectedArtist?.vendorName || ""} disabled />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editFirstName">First Name</Label>
                <Input
                  id="editFirstName"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  placeholder="First name"
                  data-testid="input-edit-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editLastName">Last Name</Label>
                <Input
                  id="editLastName"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  placeholder="Last name"
                  data-testid="input-edit-last-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editArtistAlias">Artist Alias</Label>
              <Input
                id="editArtistAlias"
                value={editArtistAlias}
                onChange={(e) => setEditArtistAlias(e.target.value)}
                placeholder="Stage name or alias"
                data-testid="input-edit-artist-alias"
              />
              <p className="text-sm text-muted-foreground">
                Optional display name to use instead of vendor name
              </p>
            </div>
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="editUseCustomCommission">Custom Commission Rate</Label>
                  <p className="text-sm text-muted-foreground">
                    Override the default rate ({commissionSettings?.defaultCommissionRate || 50}%)
                  </p>
                </div>
                <Switch
                  id="editUseCustomCommission"
                  checked={editUseCustomCommission}
                  onCheckedChange={setEditUseCustomCommission}
                  data-testid="switch-custom-commission"
                />
              </div>
              {editUseCustomCommission && (
                <div className="mt-4 space-y-2">
                  <Label htmlFor="editCommissionRate">Commission Rate (%)</Label>
                  <Input
                    id="editCommissionRate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={editCommissionRate}
                    onChange={(e) => setEditCommissionRate(e.target.value)}
                    placeholder="e.g. 50"
                    data-testid="input-edit-commission-rate"
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseEditDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateArtistMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateArtistMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Global Commission Settings Dialog */}
      <Dialog open={commissionDialogOpen} onOpenChange={setCommissionDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Commission Settings</DialogTitle>
            <DialogDescription>
              Configure default commission rates and calculation options
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="globalDefaultRate">Default Commission Rate (%)</Label>
              <Input
                id="globalDefaultRate"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={globalDefaultRate}
                onChange={(e) => setGlobalDefaultRate(e.target.value)}
                placeholder="e.g. 50"
                data-testid="input-global-default-rate"
              />
              <p className="text-sm text-muted-foreground">
                Default percentage paid to artists (can be overridden per artist)
              </p>
            </div>
            <div className="border-t pt-4 space-y-4">
              <h4 className="text-sm font-medium">Commission Calculation</h4>
              <p className="text-sm text-muted-foreground">
                Choose what to exclude from the commission calculation
              </p>
              <div className="flex items-center justify-between">
                <Label htmlFor="globalApplyAfterTax">Apply after tax</Label>
                <Switch
                  id="globalApplyAfterTax"
                  checked={globalApplyAfterTax}
                  onCheckedChange={setGlobalApplyAfterTax}
                  data-testid="switch-apply-after-tax"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="globalApplyAfterShipping">Apply after shipping</Label>
                <Switch
                  id="globalApplyAfterShipping"
                  checked={globalApplyAfterShipping}
                  onCheckedChange={setGlobalApplyAfterShipping}
                  data-testid="switch-apply-after-shipping"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="globalApplyAfterDiscounts">Apply after discounts</Label>
                <Switch
                  id="globalApplyAfterDiscounts"
                  checked={globalApplyAfterDiscounts}
                  onCheckedChange={setGlobalApplyAfterDiscounts}
                  data-testid="switch-apply-after-discounts"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommissionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveCommissionSettings}
              disabled={updateCommissionSettingsMutation.isPending || !commissionSettings}
              data-testid="button-save-commission-settings"
            >
              {updateCommissionSettingsMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photo Selection Dialog */}
      <Dialog open={photoSelectDialogOpen} onOpenChange={setPhotoSelectDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {photoSelectMode === "fullSync" ? "Select Photo for Full Shopify Sync" : "Select Artist Photo"}
            </DialogTitle>
            <DialogDescription>
              Choose which photo to use for {photoSelectArtist?.artistAlias || photoSelectArtist?.vendorName}'s Shopify profile
              {photoSelectMode === "fullSync" && " (this will create metaobject, collection, and menu items)"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-4 py-4">
            {photoSelectArtist?.photoUrls?.map((url, index) => (
              <div
                key={index}
                className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                  selectedPhotoUrl === url
                    ? "border-primary ring-2 ring-primary"
                    : "border-muted hover:border-primary/50"
                }`}
                onClick={() => setSelectedPhotoUrl(url)}
                data-testid={`photo-option-${index}`}
              >
                <img
                  src={url}
                  alt={`Photo ${index + 1}`}
                  className="w-full h-32 object-cover"
                />
                {selectedPhotoUrl === url && (
                  <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute bottom-2 right-2 h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    const link = document.createElement("a");
                    link.href = `/api/admin/artist-accounts/${photoSelectArtist?.id}/photos/${index}/download`;
                    link.download = `photo_${index + 1}.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  data-testid={`button-download-photo-${index}`}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setPhotoSelectDialogOpen(false);
              setPhotoSelectArtist(null);
              setSelectedPhotoUrl(null);
            }}>
              Cancel
            </Button>
            <Button
              onClick={handlePhotoSelectConfirm}
              disabled={!selectedPhotoUrl}
              data-testid="button-confirm-photo"
            >
              Use Selected Photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete {selectedArtistIds.size} Artist{selectedArtistIds.size > 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected artist account{selectedArtistIds.size > 1 ? 's' : ''} and remove all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Supabase Portal Invite Dialog */}
      <Dialog open={supabaseInviteDialogOpen} onOpenChange={(open) => {
        setSupabaseInviteDialogOpen(open);
        if (!open) { setSelectedArtist(null); setSupabaseInviteEmail(""); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite to Artist Portal</DialogTitle>
            <DialogDescription>
              Send a Supabase-powered invitation email. The artist will receive a secure link to set up their password and access the new artist portal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Artist Name</Label>
              <Input value={selectedArtist?.vendorName || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supabaseInviteEmail">Email Address</Label>
              <Input
                id="supabaseInviteEmail"
                type="email"
                value={supabaseInviteEmail}
                onChange={(e) => setSupabaseInviteEmail(e.target.value)}
                placeholder="artist@example.com"
                data-testid="input-supabase-invite-email"
              />
              <p className="text-sm text-muted-foreground">
                The artist will receive an invitation email from Supabase with a secure setup link.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupabaseInviteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedArtist && supabaseInviteEmail) {
                  supabaseInviteMutation.mutate({ email: supabaseInviteEmail, artistAccountId: selectedArtist.id });
                }
              }}
              disabled={!supabaseInviteEmail || supabaseInviteMutation.isPending}
              data-testid="button-send-supabase-invite"
            >
              {supabaseInviteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Portal Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Onboarding Link Dialog */}
      <Dialog open={onboardingDialogOpen} onOpenChange={handleCloseOnboardingDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Generate Onboarding Link</DialogTitle>
            <DialogDescription>
              Create a unique link for a new artist to complete the onboarding form. The link expires after 14 days.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {generatedInviteUrl ? (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <Label className="text-sm text-muted-foreground mb-2 block">Onboarding Link</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={generatedInviteUrl}
                      readOnly
                      className="font-mono text-sm"
                      data-testid="input-generated-url"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => handleCopyOnboardingLink(generatedInviteUrl)}
                      data-testid="button-copy-url"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  This link expires in 14 days
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="newInviteName">Artist Name (optional)</Label>
                  <Input
                    id="newInviteName"
                    value={newInviteName}
                    onChange={(e) => setNewInviteName(e.target.value)}
                    placeholder="Enter artist name"
                    data-testid="input-invite-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newInviteEmail">Artist Email (optional)</Label>
                  <Input
                    id="newInviteEmail"
                    type="email"
                    value={newInviteEmail}
                    onChange={(e) => setNewInviteEmail(e.target.value)}
                    placeholder="artist@example.com"
                    data-testid="input-invite-email-new"
                  />
                </div>
                <div className="border-t pt-4 mt-4">
                  <h4 className="text-sm font-medium mb-3">Contract Settings</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="newInviteCommission">Commission Rate (%)</Label>
                      <Input
                        id="newInviteCommission"
                        type="number"
                        min="0"
                        max="100"
                        value={newInviteCommission}
                        onChange={(e) => setNewInviteCommission(e.target.value)}
                        data-testid="input-invite-commission"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newInviteContractType">Contract Type</Label>
                      <Select
                        value={newInviteContractType}
                        onValueChange={(value: "exclusive" | "non_exclusive") => setNewInviteContractType(value)}
                      >
                        <SelectTrigger data-testid="select-contract-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="exclusive">Exclusive</SelectItem>
                          <SelectItem value="non_exclusive">Non-Exclusive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            {generatedInviteUrl ? (
              <Button onClick={handleCloseOnboardingDialog} data-testid="button-done">
                Done
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleCloseOnboardingDialog}>
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerateOnboardingLink}
                  disabled={generateOnboardingLinkMutation.isPending}
                  data-testid="button-generate-link"
                >
                  {generateOnboardingLinkMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  Generate Link
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create + Invite New Artist */}
      <Dialog open={createInviteDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setCreateInviteDialogOpen(false);
          setNewCreateFirstName("");
          setNewCreateLastName("");
          setNewCreateEmail("");
          setNewCreateCommission("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite New Artist</DialogTitle>
            <DialogDescription>
              Create an artist account and send them a portal invitation email in one step.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="newCreateFirstName">First Name</Label>
                <Input
                  id="newCreateFirstName"
                  value={newCreateFirstName}
                  onChange={(e) => setNewCreateFirstName(e.target.value)}
                  placeholder="Jane"
                  data-testid="input-new-first-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newCreateLastName">Last Name</Label>
                <Input
                  id="newCreateLastName"
                  value={newCreateLastName}
                  onChange={(e) => setNewCreateLastName(e.target.value)}
                  placeholder="Smith"
                  data-testid="input-new-last-name"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newCreateEmail">Email Address</Label>
              <Input
                id="newCreateEmail"
                type="email"
                value={newCreateEmail}
                onChange={(e) => setNewCreateEmail(e.target.value)}
                placeholder="jane@example.com"
                data-testid="input-new-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newCreateCommission">Commission Rate (%) <span className="text-muted-foreground font-normal">optional</span></Label>
              <Input
                id="newCreateCommission"
                type="number"
                min="0"
                max="100"
                value={newCreateCommission}
                onChange={(e) => setNewCreateCommission(e.target.value)}
                placeholder="Leave blank for global default"
                data-testid="input-new-commission"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateInviteDialogOpen(false);
                setNewCreateFirstName("");
                setNewCreateLastName("");
                setNewCreateEmail("");
                setNewCreateCommission("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const rate = newCreateCommission ? parseFloat(newCreateCommission) : undefined;
                createAndInviteMutation.mutate({
                  firstName: newCreateFirstName.trim(),
                  lastName: newCreateLastName.trim(),
                  email: newCreateEmail.trim(),
                  commissionRate: rate,
                });
              }}
              disabled={
                createAndInviteMutation.isPending ||
                !newCreateEmail.trim() ||
                (!newCreateFirstName.trim() && !newCreateLastName.trim())
              }
              data-testid="button-create-invite"
            >
              {createAndInviteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Create & Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
