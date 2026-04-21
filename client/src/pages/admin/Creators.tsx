import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Copy, ExternalLink, FileText, Edit2, Instagram, Youtube, Clock, Loader2, ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SiTiktok } from "react-icons/si";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import type { Creator, CreatorContract, CreatorContent, CreatorInvoice, FormSettings, ContractTemplateDefaults, ContractSectionPreset } from "@shared/schema";
import { FormalContractPreview } from "@/components/FormalContractPreview";
import { ScrollArea } from "@/components/ui/scroll-area";

const creatorFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  instagramHandle: z.string().optional(),
  tiktokHandle: z.string().optional(),
  youtubeHandle: z.string().optional(),
  otherSocialHandles: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["active", "inactive", "pending"]).default("active"),
});

type CreatorFormData = z.infer<typeof creatorFormSchema>;

interface CreatorWithDetails extends Creator {
  contracts?: CreatorContract[];
  contents?: CreatorContent[];
  invoices?: CreatorInvoice[];
}

export default function AdminCreators() {
  const { toast } = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState<CreatorWithDetails | null>(null);
  const [contractTitle, setContractTitle] = useState("");
  const [contractContent, setContractContent] = useState("");
  const [editingCreator, setEditingCreator] = useState<Creator | null>(null);
  
  // Contract invitation state
  const [showNewContractLinkModal, setShowNewContractLinkModal] = useState(false);
  const [newContractCreatorId, setNewContractCreatorId] = useState("");
  const [newContractTitle, setNewContractTitle] = useState("Influencer Partnership Agreement");
  const [newContractContent, setNewContractContent] = useState("");
  const [generatedContractUrl, setGeneratedContractUrl] = useState<string | null>(null);
  
  // Preview sample state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewStep, setPreviewStep] = useState<"welcome" | "details" | "collaboration" | "contract">("welcome");
  
  // Edit contract state
  const [showEditContractModal, setShowEditContractModal] = useState(false);
  const [editingContract, setEditingContract] = useState<CreatorContract | null>(null);
  
  // Selected preset IDs for each section
  const [selectedPresets, setSelectedPresets] = useState<Record<string, string>>({});

  // Contract sections state - dual content (form view + contract view)
  // Introduction section
  const [introductionFormContent, setIntroductionFormContent] = useState(
    `We're offering $500 (USD) plus framed (open edition) artwork(s) of your choice in exchange for a dedicated Instagram reel featuring an unboxing, styling and short intro to the studio.

We hope you love the artworks you've chosen, so please tag us in any future posts where they feature.

We prefer not to provide too much creative direction, as we want your content to feel authentic. But if you have any questions, or want some guidance, feel free to ask us. Once the contract is signed and artworks are selected, we will send you more information about our company.`
  );
  const [introductionContractContent, setIntroductionContractContent] = useState(
    `Brand engages Creative Partner to create and deliver content promoting Brand's art products in accordance with the terms set forth herein.`
  );
  
  // Deliverables section
  const [deliverablesFormContent, setDeliverablesFormContent] = useState(
    `We'd love for you to create a dedicated Instagram reel (min 15 seconds) highlighting East Side Studio London and the artworks you've selected.`
  );
  const [deliverablesContractContent, setDeliverablesContractContent] = useState(
    `Deliverables: 1 x dedicated Instagram reel (min 15 secs) highlighting East Side Studio London and their artworks. The reel must be posted on the main Instagram feed.

Deadline: Within 3 weeks of product delivery.

Tags / Hashtags: Tag @eastsidestudio_london in every post; include #Ad (and/or Instagram "Paid Partnership") clearly within the caption.

Content Approval: Pre-approval required with 1 round of amends.

Minimum Availability: Content must remain live for at least 180 days unless Brand requests removal under §10. Content must not be hidden or removed from feeds during this 180-day period.`
  );
  
  // Content Usage section
  const [contentUsageFormContent, setContentUsageFormContent] = useState(
    `In exchange for the agreed fee, you grant East Side Studio London a world-wide, perpetual, royalty-free licence to use, edit and promote the content you create on any platform (owned channels, social media, paid ads, print, OOH, etc.) and to let our agencies do the same. You keep ownership; credit will be given on organic posts where practical.`
  );
  const [contentUsageContractContent, setContentUsageContractContent] = useState(
    `Creative Partner grants Brand an irrevocable, worldwide, royalty-free licence to reproduce, edit, adapt and publish the Deliverables on any platform including owned channels, social media, paid advertising, print, and out-of-home media. Creative Partner retains underlying copyright. Brand will credit Creative Partner on organic posts where practical.`
  );
  
  // Exclusivity section
  const [exclusivityEnabled, setExclusivityEnabled] = useState(true);
  const [exclusivityFormContent, setExclusivityFormContent] = useState(
    `To help make the most of this collaboration, we ask for a 30-day exclusivity period following your first post.

This just means that during that time, we kindly ask that you don't post any paid or gifted collaborations with other art print or wall decor brands. Other collaborations with non-competitors is completely fine.`
  );
  const [exclusivityContractContent, setExclusivityContractContent] = useState(
    `For 30 days from the date of the first Deliverable post, Creative Partner shall not promote any competing art print, wall decor, or home art brand. Non-competing categories are unaffected.`
  );
  
  // Schedule section
  const [scheduleFormContent, setScheduleFormContent] = useState(
    `We require content to be posted within 3 weeks of the delivery date. Shipping generally takes 7 days from the date the partnership is finalised.`
  );
  const [scheduleContractContent, setScheduleContractContent] = useState(
    `Products will be dispatched within 7 business days of contract execution. All Deliverables must be posted within 21 days of product receipt.`
  );
  
  // Payment section
  const [paymentFormContent, setPaymentFormContent] = useState(
    `The collaboration fee will be paid within 14 days of your reel going live.

You will need to provide an invoice to receive payment.`
  );
  const [paymentContractContent, setPaymentContractContent] = useState(
    `Brand shall pay Creative Partner the agreed Fee within 14 days of the first Deliverable going live, upon receipt of a valid invoice. Payment will be made via PayPal or bank transfer to the details provided by Creative Partner.`
  );

  const form = useForm<CreatorFormData>({
    resolver: zodResolver(creatorFormSchema),
    defaultValues: {
      name: "",
      email: "",
      instagramHandle: "",
      tiktokHandle: "",
      youtubeHandle: "",
      otherSocialHandles: "",
      notes: "",
      status: "active",
    },
  });

  const { data: creators = [], isLoading } = useQuery<Creator[]>({
    queryKey: ["/api/admin/creators"],
  });

  const { data: creatorDetails, isLoading: isLoadingDetails } = useQuery<CreatorWithDetails>({
    queryKey: [`/api/admin/creators/${selectedCreator?.id}`],
    enabled: !!selectedCreator?.id,
  });

  // Query for all contracts across all creators
  const { data: allContracts = [] } = useQuery<CreatorContract[]>({
    queryKey: ["/api/admin/creator-contracts"],
  });

  // Query for form settings to get default contract section content
  const { data: formSettings } = useQuery<FormSettings>({
    queryKey: ["/api/form-settings"],
  });

  // Query for contract template defaults
  const { data: templateDefaults } = useQuery<ContractTemplateDefaults | null>({
    queryKey: ["/api/admin/contract-template-defaults"],
  });

  // Query for contract section presets
  const { data: sectionPresets = [] } = useQuery<ContractSectionPreset[]>({
    queryKey: ["/api/admin/contract-section-presets"],
  });

  // Helper to get presets for a section type
  const getPresetsForSection = (sectionType: string) => 
    sectionPresets.filter(p => p.sectionType === sectionType);

  // Handle preset selection
  const handlePresetSelect = (sectionType: string, presetId: string) => {
    const preset = sectionPresets.find(p => p.id === presetId);
    if (!preset) return;
    
    // Store the selected preset ID
    setSelectedPresets(prev => ({ ...prev, [sectionType]: presetId }));
    
    switch (sectionType) {
      case "introduction":
        setIntroductionFormContent(preset.formContent);
        setIntroductionContractContent(preset.contractContent);
        break;
      case "deliverables":
        setDeliverablesFormContent(preset.formContent);
        setDeliverablesContractContent(preset.contractContent);
        break;
      case "payment":
        setPaymentFormContent(preset.formContent);
        setPaymentContractContent(preset.contractContent);
        break;
      case "contentUsage":
        setContentUsageFormContent(preset.formContent);
        setContentUsageContractContent(preset.contractContent);
        break;
      case "exclusivity":
        setExclusivityFormContent(preset.formContent);
        setExclusivityContractContent(preset.contractContent);
        break;
      case "schedule":
        setScheduleFormContent(preset.formContent);
        setScheduleContractContent(preset.contractContent);
        break;
    }
  };

  // Load defaults when templateDefaults is available
  useEffect(() => {
    if (templateDefaults) {
      if (templateDefaults.introductionFormDefault) setIntroductionFormContent(templateDefaults.introductionFormDefault);
      if (templateDefaults.introductionContractDefault) setIntroductionContractContent(templateDefaults.introductionContractDefault);
      if (templateDefaults.deliverablesFormDefault) setDeliverablesFormContent(templateDefaults.deliverablesFormDefault);
      if (templateDefaults.deliverablesContractDefault) setDeliverablesContractContent(templateDefaults.deliverablesContractDefault);
      if (templateDefaults.contentUsageFormDefault) setContentUsageFormContent(templateDefaults.contentUsageFormDefault);
      if (templateDefaults.contentUsageContractDefault) setContentUsageContractContent(templateDefaults.contentUsageContractDefault);
      if (templateDefaults.exclusivityFormDefault) setExclusivityFormContent(templateDefaults.exclusivityFormDefault);
      if (templateDefaults.exclusivityContractDefault) setExclusivityContractContent(templateDefaults.exclusivityContractDefault);
      if (templateDefaults.scheduleFormDefault) setScheduleFormContent(templateDefaults.scheduleFormDefault);
      if (templateDefaults.scheduleContractDefault) setScheduleContractContent(templateDefaults.scheduleContractDefault);
      if (templateDefaults.paymentFormDefault) setPaymentFormContent(templateDefaults.paymentFormDefault);
      if (templateDefaults.paymentContractDefault) setPaymentContractContent(templateDefaults.paymentContractDefault);
      if (templateDefaults.exclusivityEnabledDefault !== null && templateDefaults.exclusivityEnabledDefault !== undefined) {
        setExclusivityEnabled(templateDefaults.exclusivityEnabledDefault);
      }
    }
  }, [templateDefaults]);

  const createMutation = useMutation({
    mutationFn: (data: CreatorFormData) =>
      apiRequest("POST", "/api/admin/creators", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/creators"] });
      setShowCreateModal(false);
      form.reset();
      toast({ title: "Creator added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add creator", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreatorFormData> }) =>
      apiRequest("PATCH", `/api/admin/creators/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/creators"] });
      setEditingCreator(null);
      form.reset();
      toast({ title: "Creator updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update creator", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/admin/creators/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/creators"] });
      setSelectedCreator(null);
      toast({ title: "Creator deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete creator", variant: "destructive" });
    },
  });

  const createContractMutation = useMutation({
    mutationFn: ({ creatorId, title, contractContent }: { creatorId: string; title: string; contractContent: string }) =>
      apiRequest("POST", `/api/admin/creators/${creatorId}/contracts`, { title, contractContent }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/creators/${selectedCreator?.id}`] });
      setShowContractModal(false);
      setContractTitle("");
      setContractContent("");
      toast({ title: "Contract created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create contract", variant: "destructive" });
    },
  });

  const deleteContractMutation = useMutation({
    mutationFn: (contractId: number) =>
      apiRequest("DELETE", `/api/admin/creator-contracts/${contractId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/creators/${selectedCreator?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/creator-contracts"] });
      toast({ title: "Contract deleted" });
    },
  });

  // Update pending contract mutation
  const updateContractMutation = useMutation({
    mutationFn: (data: { id: number; updates: Partial<CreatorContract> }) =>
      apiRequest("PATCH", `/api/admin/creator-contracts/${data.id}`, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/creator-contracts"] });
      setShowEditContractModal(false);
      setEditingContract(null);
      toast({ title: "Contract updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update contract", description: error.message, variant: "destructive" });
    },
  });

  // Handle opening edit contract modal
  const handleEditContract = (contract: CreatorContract) => {
    setEditingContract(contract);
    // Load contract values into the form state
    setIntroductionFormContent(contract.introductionFormContent || "");
    setIntroductionContractContent(contract.introductionContractContent || "");
    setDeliverablesFormContent(contract.deliverablesFormContent || "");
    setDeliverablesContractContent(contract.deliverablesContractContent || "");
    setContentUsageFormContent(contract.contentUsageFormContent || "");
    setContentUsageContractContent(contract.contentUsageContractContent || "");
    setExclusivityEnabled(contract.exclusivityEnabled ?? true);
    setExclusivityFormContent(contract.exclusivityFormContent || "");
    setExclusivityContractContent(contract.exclusivityContractContent || "");
    setScheduleFormContent(contract.scheduleFormContent || "");
    setScheduleContractContent(contract.scheduleContractContent || "");
    setPaymentFormContent(contract.paymentFormContent || "");
    setPaymentContractContent(contract.paymentContractContent || "");
    setNewContractTitle(contract.title);
    setShowEditContractModal(true);
  };

  // Handle saving edited contract
  const handleSaveEditedContract = () => {
    if (!editingContract) return;
    
    updateContractMutation.mutate({
      id: editingContract.id,
      updates: {
        title: newContractTitle,
        introductionFormContent,
        introductionContractContent,
        deliverablesFormContent,
        deliverablesContractContent,
        contentUsageFormContent,
        contentUsageContractContent,
        exclusivityEnabled,
        exclusivityFormContent,
        exclusivityContractContent,
        scheduleFormContent,
        scheduleContractContent,
        paymentFormContent,
        paymentContractContent,
      },
    });
  };

  // Create new contract link mutation with all section content
  const createContractLinkMutation = useMutation({
    mutationFn: async (data: {
      creatorId: string;
      title: string;
      contractContent: string;
      // Dual content fields
      introductionFormContent?: string;
      introductionContractContent?: string;
      deliverablesFormContent?: string;
      deliverablesContractContent?: string;
      contentUsageFormContent?: string;
      contentUsageContractContent?: string;
      exclusivityEnabled?: boolean;
      exclusivityFormContent?: string | null;
      exclusivityContractContent?: string | null;
      scheduleFormContent?: string;
      scheduleContractContent?: string;
      paymentFormContent?: string;
      paymentContractContent?: string;
    }) => {
      const res = await apiRequest("POST", `/api/admin/creators/${data.creatorId}/contracts`, data);
      return res.json();
    },
    onSuccess: (data: CreatorContract) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/creator-contracts"] });
      const url = `${window.location.origin}/creator-contract/${data.token}`;
      setGeneratedContractUrl(url);
      toast({ title: "Contract link generated" });
    },
    onError: () => {
      toast({ title: "Failed to generate contract link", variant: "destructive" });
    },
  });

  const onSubmit = (data: CreatorFormData) => {
    if (editingCreator) {
      updateMutation.mutate({ id: editingCreator.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEditCreator = (creator: Creator) => {
    setEditingCreator(creator);
    form.reset({
      name: creator.name,
      email: creator.email || "",
      instagramHandle: creator.instagramHandle || "",
      tiktokHandle: creator.tiktokHandle || "",
      youtubeHandle: creator.youtubeHandle || "",
      otherSocialHandles: creator.otherSocialHandles || "",
      notes: creator.notes || "",
      status: creator.status as "active" | "inactive" | "pending",
    });
    setShowCreateModal(true);
  };

  const copyContractLink = (token: string) => {
    const url = `${window.location.origin}/creator-contract/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Contract link copied to clipboard" });
  };

  const handleCloseNewContractLinkModal = () => {
    setShowNewContractLinkModal(false);
    setNewContractCreatorId("");
    setNewContractTitle("Influencer Partnership Agreement");
    setNewContractContent("");
    setGeneratedContractUrl(null);
  };

  // Reset section defaults from form settings when opening new contract modal
  const handleOpenNewContractModal = () => {
    // TODO: Load defaults from formSettings if available for dual content
    setGeneratedContractUrl(null);
    setShowNewContractLinkModal(true);
  };

  const handleGenerateContractLink = () => {
    if (!newContractCreatorId || !newContractTitle) {
      toast({ title: "Please select a creator and enter a title", variant: "destructive" });
      return;
    }
    createContractLinkMutation.mutate({
      creatorId: newContractCreatorId,
      title: newContractTitle,
      contractContent: newContractContent || "See sections below",
      introductionFormContent,
      introductionContractContent,
      deliverablesFormContent,
      deliverablesContractContent,
      contentUsageFormContent,
      contentUsageContractContent,
      exclusivityEnabled,
      exclusivityFormContent: exclusivityEnabled ? exclusivityFormContent : null,
      exclusivityContractContent: exclusivityEnabled ? exclusivityContractContent : null,
      scheduleFormContent,
      scheduleContractContent,
      paymentFormContent,
      paymentContractContent,
    });
  };

  const getCreatorName = (creatorId: string) => {
    const creator = creators.find(c => c.id === creatorId);
    return creator?.name || "Unknown";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "signed":
        return <Badge variant="default" className="bg-green-600">Signed</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "expired":
        return <Badge variant="destructive">Expired</Badge>;
      case "cancelled":
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Creators</h1>
        <Button onClick={() => { setEditingCreator(null); form.reset(); setShowCreateModal(true); }} data-testid="button-add-creator">
          <Plus className="h-4 w-4 mr-2" />
          Add Creator
        </Button>
      </div>

      {/* Contract Invitations Section */}
      <Card data-testid="card-contract-invitations">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Contract Invitations</CardTitle>
            <CardDescription>
              Generate unique contract links for creators to sign. Links expire after 14 days.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowPreviewModal(true)}
              data-testid="button-preview-sample"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Preview Sample
            </Button>
            <Button
              onClick={handleOpenNewContractModal}
              data-testid="button-new-contract-link"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Contract Link
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {allContracts && allContracts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Creator</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allContracts.map((contract) => (
                  <TableRow key={contract.id} data-testid={`row-contract-${contract.id}`}>
                    <TableCell className="font-medium">
                      {getCreatorName(contract.creatorId)}
                    </TableCell>
                    <TableCell>{contract.title}</TableCell>
                    <TableCell>
                      {getStatusBadge(contract.status)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(contract.createdAt), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(contract.expiresAt), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {contract.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditContract(contract)}
                              data-testid={`button-edit-contract-${contract.id}`}
                            >
                              <Edit2 className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyContractLink(contract.token)}
                              data-testid={`button-copy-contract-${contract.id}`}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Copy Link
                            </Button>
                          </>
                        )}
                        {contract.pdfUrl && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => window.open(contract.pdfUrl!, "_blank")}
                            title="Download PDF"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteContractMutation.mutate(contract.id)}
                          data-testid={`button-delete-contract-${contract.id}`}
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
              No contract invitations yet. Click "New Contract Link" to create one.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Creators List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>All Creators</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : creators.length === 0 ? (
              <p className="text-muted-foreground">No creators yet. Add your first creator to get started.</p>
            ) : (
              <div className="space-y-2">
                {creators.map((creator) => (
                  <div
                    key={creator.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedCreator?.id === creator.id ? "bg-accent border-primary" : "hover:bg-muted"
                    }`}
                    onClick={() => setSelectedCreator(creator)}
                    data-testid={`creator-item-${creator.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{creator.name}</p>
                        {creator.email && (
                          <p className="text-sm text-muted-foreground">{creator.email}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {creator.instagramHandle && <Instagram className="h-4 w-4 text-muted-foreground" />}
                        {creator.tiktokHandle && <SiTiktok className="h-4 w-4 text-muted-foreground" />}
                        {creator.youtubeHandle && <Youtube className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Creator Details */}
        <Card className="lg:col-span-2">
          {selectedCreator ? (
            <>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{selectedCreator.name}</CardTitle>
                  {selectedCreator.email && (
                    <p className="text-sm text-muted-foreground">{selectedCreator.email}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleEditCreator(selectedCreator)} data-testid="button-edit-creator">
                    <Edit2 className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteMutation.mutate(selectedCreator.id)}
                    data-testid="button-delete-creator"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="contracts">
                  <TabsList>
                    <TabsTrigger value="contracts">Contracts</TabsTrigger>
                    <TabsTrigger value="content">Content</TabsTrigger>
                    <TabsTrigger value="invoices">Invoices</TabsTrigger>
                    <TabsTrigger value="details">Details</TabsTrigger>
                  </TabsList>

                  <TabsContent value="contracts" className="space-y-4">
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => setShowContractModal(true)} data-testid="button-new-contract">
                        <Plus className="h-4 w-4 mr-1" />
                        New Contract
                      </Button>
                    </div>

                    {isLoadingDetails ? (
                      <p className="text-muted-foreground">Loading contracts...</p>
                    ) : creatorDetails?.contracts?.length === 0 ? (
                      <p className="text-muted-foreground">No contracts yet.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Title</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Expires</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {creatorDetails?.contracts?.map((contract) => (
                            <TableRow key={contract.id}>
                              <TableCell className="font-medium">{contract.title}</TableCell>
                              <TableCell>{getStatusBadge(contract.status)}</TableCell>
                              <TableCell>
                                {new Date(contract.expiresAt).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex gap-1 justify-end">
                                  {contract.status === "pending" && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => copyContractLink(contract.token)}
                                      title="Copy link"
                                    >
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {contract.pdfUrl && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => window.open(contract.pdfUrl!, "_blank")}
                                      title="Download PDF"
                                    >
                                      <FileText className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => deleteContractMutation.mutate(contract.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>

                  <TabsContent value="content">
                    <p className="text-muted-foreground">Content management coming soon.</p>
                  </TabsContent>

                  <TabsContent value="invoices">
                    <p className="text-muted-foreground">Invoice management coming soon.</p>
                  </TabsContent>

                  <TabsContent value="details" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {selectedCreator.instagramHandle && (
                        <div>
                          <p className="text-sm font-medium">Instagram</p>
                          <p className="text-muted-foreground">@{selectedCreator.instagramHandle}</p>
                        </div>
                      )}
                      {selectedCreator.tiktokHandle && (
                        <div>
                          <p className="text-sm font-medium">TikTok</p>
                          <p className="text-muted-foreground">@{selectedCreator.tiktokHandle}</p>
                        </div>
                      )}
                      {selectedCreator.youtubeHandle && (
                        <div>
                          <p className="text-sm font-medium">YouTube</p>
                          <p className="text-muted-foreground">{selectedCreator.youtubeHandle}</p>
                        </div>
                      )}
                      {selectedCreator.otherSocialHandles && (
                        <div className="col-span-2">
                          <p className="text-sm font-medium">Other Socials</p>
                          <p className="text-muted-foreground">{selectedCreator.otherSocialHandles}</p>
                        </div>
                      )}
                      {selectedCreator.notes && (
                        <div className="col-span-2">
                          <p className="text-sm font-medium">Notes</p>
                          <p className="text-muted-foreground whitespace-pre-wrap">{selectedCreator.notes}</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </>
          ) : (
            <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
              Select a creator to view details
            </CardContent>
          )}
        </Card>
      </div>

      {/* Create/Edit Creator Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCreator ? "Edit Creator" : "Add New Creator"}</DialogTitle>
            <DialogDescription>
              {editingCreator ? "Update the creator's information." : "Add a new influencer or content creator to manage."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Creator name" data-testid="input-creator-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="Email address" data-testid="input-creator-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-3 gap-2">
                <FormField
                  control={form.control}
                  name="instagramHandle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instagram</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="@handle" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tiktokHandle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>TikTok</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="@handle" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="youtubeHandle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>YouTube</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Channel" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Any notes about this creator..." rows={3} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-creator">
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Create Contract Modal */}
      <Dialog open={showContractModal} onOpenChange={setShowContractModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Contract for {selectedCreator?.name}</DialogTitle>
            <DialogDescription>
              Create a new contract that will generate a unique signing link valid for 14 days.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Contract Title</label>
              <Input
                value={contractTitle}
                onChange={(e) => setContractTitle(e.target.value)}
                placeholder="e.g., Influencer Partnership Agreement"
                data-testid="input-contract-title"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Contract Content</label>
              <Textarea
                value={contractContent}
                onChange={(e) => setContractContent(e.target.value)}
                placeholder="Enter the full contract text here..."
                rows={15}
                data-testid="input-contract-content"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowContractModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedCreator && contractTitle && contractContent) {
                  createContractMutation.mutate({
                    creatorId: selectedCreator.id,
                    title: contractTitle,
                    contractContent,
                  });
                }
              }}
              disabled={!contractTitle || !contractContent || createContractMutation.isPending}
              data-testid="button-create-contract"
            >
              {createContractMutation.isPending ? "Creating..." : "Create Contract"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Contract Link Modal */}
      <Dialog open={showNewContractLinkModal} onOpenChange={handleCloseNewContractLinkModal}>
        <DialogContent className="!max-w-none !w-[95vw] !h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Generate Contract Link</DialogTitle>
            <DialogDescription>
              Create a unique contract signing link for a creator. The link expires after 14 days.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            {generatedContractUrl ? (
              <div className="space-y-4 p-4">
                <div className="p-4 bg-muted rounded-lg">
                  <Label className="text-sm text-muted-foreground mb-2 block">Contract Link</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={generatedContractUrl}
                      readOnly
                      className="font-mono text-sm"
                      data-testid="input-generated-contract-url"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedContractUrl);
                        toast({ title: "Contract link copied to clipboard" });
                      }}
                      data-testid="button-copy-contract-url"
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
              <div className="grid grid-cols-2 gap-6 h-full">
                {/* Left side: Form */}
                <div className="flex flex-col gap-4 h-full min-h-0">
                  <div className="space-y-2">
                    <Label>Select Creator</Label>
                    <Select
                      value={newContractCreatorId}
                      onValueChange={setNewContractCreatorId}
                    >
                      <SelectTrigger data-testid="select-contract-creator">
                        <SelectValue placeholder="Choose a creator..." />
                      </SelectTrigger>
                      <SelectContent>
                        {creators.map((creator) => (
                          <SelectItem key={creator.id} value={creator.id}>
                            {creator.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Contract Title</Label>
                    <Input
                      value={newContractTitle}
                      onChange={(e) => setNewContractTitle(e.target.value)}
                      placeholder="e.g., Influencer Partnership Agreement"
                      data-testid="input-new-contract-title"
                    />
                  </div>
                  
                  <ScrollArea className="flex-1 min-h-0 border rounded-lg p-4 w-full overflow-y-auto">
                    <div className="space-y-6 pr-4 w-full pb-4">
                      {/* Section headers */}
                      <div className="grid grid-cols-2 gap-4 pb-2 border-b">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">Form View</Badge>
                          <span className="text-xs text-muted-foreground">Casual language for creators</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">Contract View</Badge>
                          <span className="text-xs text-muted-foreground">Legal language for contract</span>
                        </div>
                      </div>
                      
                      {/* 1. Introduction */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <Label className="font-semibold">1. Introduction (About The Collaboration)</Label>
                          {getPresetsForSection("introduction").length > 0 && (
                            <Select value={selectedPresets["introduction"] || ""} onValueChange={(v) => handlePresetSelect("introduction", v)}>
                              <SelectTrigger className="w-[200px]" data-testid="select-preset-introduction">
                                <SelectValue placeholder="Load preset..." />
                              </SelectTrigger>
                              <SelectContent>
                                {getPresetsForSection("introduction").map((preset) => (
                                  <SelectItem key={preset.id} value={preset.id}>
                                    {preset.name}{preset.isDefault && " (Default)"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Textarea
                            value={introductionFormContent}
                            onChange={(e) => setIntroductionFormContent(e.target.value)}
                            placeholder="Friendly intro for creators..."
                            className="text-sm min-h-[120px] w-full"
                            data-testid="input-introduction-form"
                          />
                          <Textarea
                            value={introductionContractContent}
                            onChange={(e) => setIntroductionContractContent(e.target.value)}
                            placeholder="Legal scope of work statement..."
                            className="text-sm min-h-[120px] w-full"
                            data-testid="input-introduction-contract"
                          />
                        </div>
                      </div>
                      
                      {/* 2. Deliverables */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <Label className="font-semibold">2. Deliverables & Requirements</Label>
                          {getPresetsForSection("deliverables").length > 0 && (
                            <Select value={selectedPresets["deliverables"] || ""} onValueChange={(v) => handlePresetSelect("deliverables", v)}>
                              <SelectTrigger className="w-[200px]" data-testid="select-preset-deliverables">
                                <SelectValue placeholder="Load preset..." />
                              </SelectTrigger>
                              <SelectContent>
                                {getPresetsForSection("deliverables").map((preset) => (
                                  <SelectItem key={preset.id} value={preset.id}>
                                    {preset.name}{preset.isDefault && " (Default)"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Textarea
                            value={deliverablesFormContent}
                            onChange={(e) => setDeliverablesFormContent(e.target.value)}
                            placeholder="Casual description of what we'd like..."
                            className="text-sm min-h-[100px] w-full"
                            data-testid="input-deliverables-form"
                          />
                          <Textarea
                            value={deliverablesContractContent}
                            onChange={(e) => setDeliverablesContractContent(e.target.value)}
                            placeholder="Specific deliverables, deadlines, tags..."
                            className="text-sm min-h-[100px] w-full"
                            data-testid="input-deliverables-contract"
                          />
                        </div>
                      </div>
                      
                      {/* 3. Content Usage */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <Label className="font-semibold">3. Content Usage Permissions</Label>
                          {getPresetsForSection("contentUsage").length > 0 && (
                            <Select value={selectedPresets["contentUsage"] || ""} onValueChange={(v) => handlePresetSelect("contentUsage", v)}>
                              <SelectTrigger className="w-[200px]" data-testid="select-preset-content-usage">
                                <SelectValue placeholder="Load preset..." />
                              </SelectTrigger>
                              <SelectContent>
                                {getPresetsForSection("contentUsage").map((preset) => (
                                  <SelectItem key={preset.id} value={preset.id}>
                                    {preset.name}{preset.isDefault && " (Default)"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Textarea
                            value={contentUsageFormContent}
                            onChange={(e) => setContentUsageFormContent(e.target.value)}
                            placeholder="Friendly explanation of usage rights..."
                            className="text-sm min-h-[100px] w-full"
                            data-testid="input-content-usage-form"
                          />
                          <Textarea
                            value={contentUsageContractContent}
                            onChange={(e) => setContentUsageContractContent(e.target.value)}
                            placeholder="Legal licence grant terms..."
                            className="text-sm min-h-[100px] w-full"
                            data-testid="input-content-usage-contract"
                          />
                        </div>
                      </div>
                      
                      {/* 4. Exclusivity */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <Label className="font-semibold">4. Short-Term Exclusivity</Label>
                          <div className="flex items-center gap-2">
                            {exclusivityEnabled && getPresetsForSection("exclusivity").length > 0 && (
                              <Select value={selectedPresets["exclusivity"] || ""} onValueChange={(v) => handlePresetSelect("exclusivity", v)}>
                                <SelectTrigger className="w-[200px]" data-testid="select-preset-exclusivity">
                                  <SelectValue placeholder="Load preset..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {getPresetsForSection("exclusivity").map((preset) => (
                                    <SelectItem key={preset.id} value={preset.id}>
                                      {preset.name}{preset.isDefault && " (Default)"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            <Label className="text-sm text-muted-foreground">Include section</Label>
                            <Switch
                              checked={exclusivityEnabled}
                              onCheckedChange={setExclusivityEnabled}
                              data-testid="switch-exclusivity"
                            />
                          </div>
                        </div>
                        {exclusivityEnabled && (
                          <div className="grid grid-cols-2 gap-4">
                            <Textarea
                              value={exclusivityFormContent}
                              onChange={(e) => setExclusivityFormContent(e.target.value)}
                              placeholder="Friendly exclusivity explanation..."
                              className="text-sm min-h-[100px] w-full"
                              data-testid="input-exclusivity-form"
                            />
                            <Textarea
                              value={exclusivityContractContent}
                              onChange={(e) => setExclusivityContractContent(e.target.value)}
                              placeholder="Legal exclusivity terms..."
                              className="text-sm min-h-[100px] w-full"
                              data-testid="input-exclusivity-contract"
                            />
                          </div>
                        )}
                      </div>
                      
                      {/* 5. Schedule */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <Label className="font-semibold">5. Schedule & Deadlines</Label>
                          {getPresetsForSection("schedule").length > 0 && (
                            <Select value={selectedPresets["schedule"] || ""} onValueChange={(v) => handlePresetSelect("schedule", v)}>
                              <SelectTrigger className="w-[200px]" data-testid="select-preset-schedule">
                                <SelectValue placeholder="Load preset..." />
                              </SelectTrigger>
                              <SelectContent>
                                {getPresetsForSection("schedule").map((preset) => (
                                  <SelectItem key={preset.id} value={preset.id}>
                                    {preset.name}{preset.isDefault && " (Default)"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Textarea
                            value={scheduleFormContent}
                            onChange={(e) => setScheduleFormContent(e.target.value)}
                            placeholder="Casual timeline info..."
                            className="text-sm min-h-[80px] w-full"
                            data-testid="input-schedule-form"
                          />
                          <Textarea
                            value={scheduleContractContent}
                            onChange={(e) => setScheduleContractContent(e.target.value)}
                            placeholder="Legal schedule requirements..."
                            className="text-sm min-h-[80px] w-full"
                            data-testid="input-schedule-contract"
                          />
                        </div>
                      </div>
                      
                      {/* 6. Payment */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <Label className="font-semibold">6. Payment</Label>
                          {getPresetsForSection("payment").length > 0 && (
                            <Select value={selectedPresets["payment"] || ""} onValueChange={(v) => handlePresetSelect("payment", v)}>
                              <SelectTrigger className="w-[200px]" data-testid="select-preset-payment">
                                <SelectValue placeholder="Load preset..." />
                              </SelectTrigger>
                              <SelectContent>
                                {getPresetsForSection("payment").map((preset) => (
                                  <SelectItem key={preset.id} value={preset.id}>
                                    {preset.name}{preset.isDefault && " (Default)"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Textarea
                            value={paymentFormContent}
                            onChange={(e) => setPaymentFormContent(e.target.value)}
                            placeholder="Friendly payment info..."
                            className="text-sm min-h-[80px] w-full"
                            data-testid="input-payment-form"
                          />
                          <Textarea
                            value={paymentContractContent}
                            onChange={(e) => setPaymentContractContent(e.target.value)}
                            placeholder="Legal payment terms..."
                            className="text-sm min-h-[80px] w-full"
                            data-testid="input-payment-contract"
                          />
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </div>

                {/* Right side: Preview */}
                <div className="flex flex-col gap-2 h-full min-h-0">
                  <div className="flex items-center justify-between">
                    <Label className="font-semibold">Contract Preview</Label>
                    <Badge variant="secondary">Live Preview</Badge>
                  </div>
                  <ScrollArea className="flex-1 min-h-0 border rounded-lg p-4 bg-white dark:bg-gray-950">
                    <FormalContractPreview
                      creatorName="[Creator's Full Name]"
                      contractDate={new Date()}
                      introductionContent={introductionContractContent}
                      deliverablesContent={deliverablesContractContent}
                      contentUsageContent={contentUsageContractContent}
                      exclusivityEnabled={exclusivityEnabled}
                      exclusivityContent={exclusivityContractContent}
                      scheduleContent={scheduleContractContent}
                      paymentContent={paymentContractContent}
                    />
                  </ScrollArea>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            {generatedContractUrl ? (
              <Button onClick={handleCloseNewContractLinkModal} data-testid="button-done-contract">
                Done
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleCloseNewContractLinkModal}>
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerateContractLink}
                  disabled={!newContractCreatorId || !newContractTitle || createContractLinkMutation.isPending}
                  data-testid="button-generate-contract-link"
                >
                  {createContractLinkMutation.isPending ? (
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

      {/* Preview Sample Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Contract Preview</DialogTitle>
            <DialogDescription>
              Preview how the contract form looks to creators. Select a step to preview.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-4">
              <Label>Preview Step:</Label>
              <Select value={previewStep} onValueChange={(v) => setPreviewStep(v as typeof previewStep)}>
                <SelectTrigger className="w-64" data-testid="select-preview-step">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="welcome">1. Welcome</SelectItem>
                  <SelectItem value="details">2. Your Details</SelectItem>
                  <SelectItem value="collaboration">3. Collaboration Details</SelectItem>
                  <SelectItem value="contract">4. Contract & Signature</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-lg bg-gray-50 p-6">
              {previewStep === "welcome" && (
                <div className="text-center space-y-6 py-8">
                  <div className="space-y-4">
                    <h1 className="text-2xl font-bold">Hey [Creator Name]!</h1>
                    <div className="max-w-lg mx-auto text-gray-600 space-y-4 text-left whitespace-pre-wrap">
                      {introductionFormContent}
                    </div>
                  </div>
                  <div className="pt-4">
                    <Button size="lg" className="rounded-full px-8" disabled>
                      Let's Go!
                    </Button>
                  </div>
                </div>
              )}

              {previewStep === "details" && (
                <div className="space-y-6 max-w-2xl mx-auto">
                  <div className="text-center">
                    <h1 className="text-2xl font-bold mb-2">Your Details</h1>
                    <p className="text-muted-foreground">Please confirm your shipping and contact details.</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>First Name *</Label>
                      <Input placeholder="John" disabled />
                    </div>
                    <div>
                      <Label>Last Name *</Label>
                      <Input placeholder="Smith" disabled />
                    </div>
                  </div>
                  
                  <div>
                    <Label>Email *</Label>
                    <Input placeholder="john@example.com" disabled />
                  </div>
                  
                  <div>
                    <Label>Address Line 1 *</Label>
                    <Input placeholder="123 Main Street" disabled />
                  </div>
                  
                  <div>
                    <Label>Address Line 2</Label>
                    <Input placeholder="Apartment 4B" disabled />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Town/City *</Label>
                      <Input placeholder="London" disabled />
                    </div>
                    <div>
                      <Label>Postcode *</Label>
                      <Input placeholder="E14 6NU" disabled />
                    </div>
                  </div>
                  
                  <div>
                    <Label>Phone Number *</Label>
                    <Input placeholder="+44 7123 456789" disabled />
                  </div>
                  
                  <Button className="w-full rounded-full" disabled>Continue</Button>
                </div>
              )}

              {previewStep === "collaboration" && (
                <div className="space-y-6 max-w-2xl mx-auto">
                  <div className="text-center">
                    <h1 className="text-2xl font-bold mb-2">Collaboration Details</h1>
                    <p className="text-muted-foreground">Please review and accept the collaboration terms.</p>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4 bg-white">
                      <h3 className="font-semibold mb-2">Content Usage Permissions</h3>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{contentUsageFormContent}</p>
                      <div className="flex gap-4 mt-3">
                        <label className="flex items-center gap-2">
                          <input type="radio" name="content" disabled /> Yes, I agree
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="radio" name="content" disabled /> No
                        </label>
                      </div>
                    </div>
                    
                    {exclusivityEnabled && (
                      <div className="border rounded-lg p-4 bg-white">
                        <h3 className="font-semibold mb-2">Short-Term Exclusivity</h3>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap">{exclusivityFormContent}</p>
                        <div className="flex gap-4 mt-3">
                          <label className="flex items-center gap-2">
                            <input type="radio" name="excl" disabled /> Yes, I agree
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="radio" name="excl" disabled /> No
                          </label>
                        </div>
                      </div>
                    )}
                    
                    <div className="border rounded-lg p-4 bg-white">
                      <h3 className="font-semibold mb-2">Schedule</h3>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{scheduleFormContent}</p>
                      <div className="flex gap-4 mt-3">
                        <label className="flex items-center gap-2">
                          <input type="radio" name="sched" disabled /> Yes, I can accommodate
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="radio" name="sched" disabled /> No
                        </label>
                      </div>
                    </div>
                    
                    <div className="border rounded-lg p-4 bg-white">
                      <h3 className="font-semibold mb-2">Payment Details</h3>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{paymentFormContent}</p>
                      <div className="mt-3">
                        <Label>PayPal Email *</Label>
                        <Input placeholder="paypal@example.com" disabled />
                      </div>
                    </div>
                  </div>
                  
                  <Button className="w-full rounded-full" disabled>Continue</Button>
                </div>
              )}

              {previewStep === "contract" && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h1 className="text-2xl font-bold mb-2">Contractual Agreement</h1>
                    <p className="text-muted-foreground">Please read the contract carefully and sign at the bottom.</p>
                  </div>
                  
                  <div className="border rounded-lg p-6 bg-white max-h-[400px] overflow-y-auto text-sm space-y-4">
                    <div className="text-center space-y-2">
                      <p className="font-bold">CREATIVE PARTNER COLLABORATION AGREEMENT</p>
                      <p className="text-gray-500">("Agreement")</p>
                    </div>
                    
                    <p>This Agreement is made on {format(new Date(), "dd/MM/yyyy")} between:</p>
                    <p>1. East Side Studio London, a company incorporated in England & Wales, registered office 6 Patent House, 48 Morris Road, E14 6NU London, UK; and</p>
                    <p>2. [Creator Name], of [Address] ("Creative Partner").</p>
                    <p>Brand and Creative Partner together are the "Parties".</p>
                    
                    <hr className="my-4" />
                    
                    <div>
                      <p className="font-bold">1. SCOPE OF WORK</p>
                      <p className="whitespace-pre-wrap">{deliverablesContractContent}</p>
                    </div>
                    
                    <div>
                      <p className="font-bold">2. COMPENSATION</p>
                      <p className="whitespace-pre-wrap">{paymentContractContent}</p>
                    </div>
                    
                    <div>
                      <p className="font-bold">3. CONTENT USAGE & LICENCE</p>
                      <p className="whitespace-pre-wrap">{contentUsageContractContent}</p>
                    </div>
                    
                    {exclusivityEnabled && (
                      <div>
                        <p className="font-bold">4. EXCLUSIVITY</p>
                        <p className="whitespace-pre-wrap">{exclusivityContractContent}</p>
                      </div>
                    )}
                    
                    <div>
                      <p className="font-bold">5. SCHEDULE & DEADLINES</p>
                      <p className="whitespace-pre-wrap">{scheduleContractContent}</p>
                    </div>
                    
                    <p className="text-gray-500 text-xs mt-4">[Standard legal terms 6-15 follow...]</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <h4 className="font-bold">(The Company)</h4>
                      <div className="border rounded-lg p-4 bg-white h-24 flex items-center justify-center text-gray-400 italic">
                        [Company Signature]
                      </div>
                      <p className="font-medium">Philip Jobling</p>
                      <p className="text-sm text-muted-foreground">Printed Name</p>
                    </div>
                    
                    <div className="space-y-3">
                      <h4 className="font-bold">(The Creative Partner) - Signature</h4>
                      <div className="border rounded-lg p-4 border-dashed bg-white h-24 flex items-center justify-center text-gray-400">
                        Add signature
                      </div>
                      <p className="font-medium text-[#8B4C5A]">[Creator Name]</p>
                      <p className="text-sm text-muted-foreground">Printed Name</p>
                    </div>
                  </div>
                  
                  <Button className="w-full rounded-full" disabled>Continue to Review</Button>
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreviewModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Contract Modal - Same layout as Create */}
      <Dialog open={showEditContractModal} onOpenChange={(open) => {
        setShowEditContractModal(open);
        if (!open) setEditingContract(null);
      }}>
        <DialogContent className="!max-w-none !w-[95vw] !h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Pending Contract</DialogTitle>
            <DialogDescription>
              Update the contract details for {editingContract ? getCreatorName(editingContract.creatorId) : "creator"}. Only pending contracts can be edited.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="grid grid-cols-2 gap-6 h-full">
              {/* Left side: Form */}
              <div className="flex flex-col gap-4 h-full min-h-0">
                <div className="space-y-2">
                  <Label>Contract Title</Label>
                  <Input
                    value={newContractTitle}
                    onChange={(e) => setNewContractTitle(e.target.value)}
                    placeholder="e.g., Influencer Partnership Agreement"
                    data-testid="input-edit-contract-title"
                  />
                </div>
                
                <ScrollArea className="flex-1 min-h-0 border rounded-lg p-4 w-full overflow-y-auto">
                  <div className="space-y-6 pr-4 w-full pb-4">
                    {/* Section headers */}
                    <div className="grid grid-cols-2 gap-4 pb-2 border-b">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">Form View</Badge>
                        <span className="text-xs text-muted-foreground">Casual language for creators</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">Contract View</Badge>
                        <span className="text-xs text-muted-foreground">Legal language for contract</span>
                      </div>
                    </div>
                    
                    {/* 1. Introduction */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <Label className="font-semibold">1. Introduction (About The Collaboration)</Label>
                        {getPresetsForSection("introduction").length > 0 && (
                          <Select value={selectedPresets["introduction"] || ""} onValueChange={(v) => handlePresetSelect("introduction", v)}>
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Load preset..." />
                            </SelectTrigger>
                            <SelectContent>
                              {getPresetsForSection("introduction").map((preset) => (
                                <SelectItem key={preset.id} value={preset.id}>
                                  {preset.name}{preset.isDefault && " (Default)"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Textarea
                          value={introductionFormContent}
                          onChange={(e) => setIntroductionFormContent(e.target.value)}
                          placeholder="Friendly intro for creators..."
                          className="text-sm min-h-[120px] w-full"
                          data-testid="textarea-edit-intro-form"
                        />
                        <Textarea
                          value={introductionContractContent}
                          onChange={(e) => setIntroductionContractContent(e.target.value)}
                          placeholder="Legal scope of work statement..."
                          className="text-sm min-h-[120px] w-full"
                          data-testid="textarea-edit-intro-contract"
                        />
                      </div>
                    </div>
                    
                    {/* 2. Deliverables */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <Label className="font-semibold">2. Deliverables & Requirements</Label>
                        {getPresetsForSection("deliverables").length > 0 && (
                          <Select value={selectedPresets["deliverables"] || ""} onValueChange={(v) => handlePresetSelect("deliverables", v)}>
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Load preset..." />
                            </SelectTrigger>
                            <SelectContent>
                              {getPresetsForSection("deliverables").map((preset) => (
                                <SelectItem key={preset.id} value={preset.id}>
                                  {preset.name}{preset.isDefault && " (Default)"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Textarea
                          value={deliverablesFormContent}
                          onChange={(e) => setDeliverablesFormContent(e.target.value)}
                          placeholder="Casual description of what we'd like..."
                          className="text-sm min-h-[100px] w-full"
                          data-testid="textarea-edit-deliverables-form"
                        />
                        <Textarea
                          value={deliverablesContractContent}
                          onChange={(e) => setDeliverablesContractContent(e.target.value)}
                          placeholder="Specific deliverables, deadlines, tags..."
                          className="text-sm min-h-[100px] w-full"
                          data-testid="textarea-edit-deliverables-contract"
                        />
                      </div>
                    </div>
                    
                    {/* 3. Content Usage */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <Label className="font-semibold">3. Content Usage Permissions</Label>
                        {getPresetsForSection("contentUsage").length > 0 && (
                          <Select value={selectedPresets["contentUsage"] || ""} onValueChange={(v) => handlePresetSelect("contentUsage", v)}>
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Load preset..." />
                            </SelectTrigger>
                            <SelectContent>
                              {getPresetsForSection("contentUsage").map((preset) => (
                                <SelectItem key={preset.id} value={preset.id}>
                                  {preset.name}{preset.isDefault && " (Default)"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Textarea
                          value={contentUsageFormContent}
                          onChange={(e) => setContentUsageFormContent(e.target.value)}
                          placeholder="Friendly explanation of usage rights..."
                          className="text-sm min-h-[100px] w-full"
                          data-testid="textarea-edit-contentusage-form"
                        />
                        <Textarea
                          value={contentUsageContractContent}
                          onChange={(e) => setContentUsageContractContent(e.target.value)}
                          placeholder="Legal licence grant terms..."
                          className="text-sm min-h-[100px] w-full"
                          data-testid="textarea-edit-contentusage-contract"
                        />
                      </div>
                    </div>
                    
                    {/* 4. Exclusivity */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <Label className="font-semibold">4. Short-Term Exclusivity</Label>
                        <div className="flex items-center gap-2">
                          {exclusivityEnabled && getPresetsForSection("exclusivity").length > 0 && (
                            <Select value={selectedPresets["exclusivity"] || ""} onValueChange={(v) => handlePresetSelect("exclusivity", v)}>
                              <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Load preset..." />
                              </SelectTrigger>
                              <SelectContent>
                                {getPresetsForSection("exclusivity").map((preset) => (
                                  <SelectItem key={preset.id} value={preset.id}>
                                    {preset.name}{preset.isDefault && " (Default)"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <Label className="text-sm text-muted-foreground">Include section</Label>
                          <Switch
                            checked={exclusivityEnabled}
                            onCheckedChange={setExclusivityEnabled}
                            data-testid="switch-edit-exclusivity"
                          />
                        </div>
                      </div>
                      {exclusivityEnabled && (
                        <div className="grid grid-cols-2 gap-4">
                          <Textarea
                            value={exclusivityFormContent}
                            onChange={(e) => setExclusivityFormContent(e.target.value)}
                            placeholder="Friendly exclusivity explanation..."
                            className="text-sm min-h-[100px] w-full"
                            data-testid="textarea-edit-exclusivity-form"
                          />
                          <Textarea
                            value={exclusivityContractContent}
                            onChange={(e) => setExclusivityContractContent(e.target.value)}
                            placeholder="Legal exclusivity terms..."
                            className="text-sm min-h-[100px] w-full"
                            data-testid="textarea-edit-exclusivity-contract"
                          />
                        </div>
                      )}
                    </div>
                    
                    {/* 5. Schedule */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <Label className="font-semibold">5. Schedule & Deadlines</Label>
                        {getPresetsForSection("schedule").length > 0 && (
                          <Select value={selectedPresets["schedule"] || ""} onValueChange={(v) => handlePresetSelect("schedule", v)}>
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Load preset..." />
                            </SelectTrigger>
                            <SelectContent>
                              {getPresetsForSection("schedule").map((preset) => (
                                <SelectItem key={preset.id} value={preset.id}>
                                  {preset.name}{preset.isDefault && " (Default)"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Textarea
                          value={scheduleFormContent}
                          onChange={(e) => setScheduleFormContent(e.target.value)}
                          placeholder="Casual timeline info..."
                          className="text-sm min-h-[80px] w-full"
                          data-testid="textarea-edit-schedule-form"
                        />
                        <Textarea
                          value={scheduleContractContent}
                          onChange={(e) => setScheduleContractContent(e.target.value)}
                          placeholder="Legal schedule requirements..."
                          className="text-sm min-h-[80px] w-full"
                          data-testid="textarea-edit-schedule-contract"
                        />
                      </div>
                    </div>
                    
                    {/* 6. Payment */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <Label className="font-semibold">6. Payment</Label>
                        {getPresetsForSection("payment").length > 0 && (
                          <Select value={selectedPresets["payment"] || ""} onValueChange={(v) => handlePresetSelect("payment", v)}>
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Load preset..." />
                            </SelectTrigger>
                            <SelectContent>
                              {getPresetsForSection("payment").map((preset) => (
                                <SelectItem key={preset.id} value={preset.id}>
                                  {preset.name}{preset.isDefault && " (Default)"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Textarea
                          value={paymentFormContent}
                          onChange={(e) => setPaymentFormContent(e.target.value)}
                          placeholder="Friendly payment info..."
                          className="text-sm min-h-[80px] w-full"
                          data-testid="textarea-edit-payment-form"
                        />
                        <Textarea
                          value={paymentContractContent}
                          onChange={(e) => setPaymentContractContent(e.target.value)}
                          placeholder="Legal payment terms..."
                          className="text-sm min-h-[80px] w-full"
                          data-testid="textarea-edit-payment-contract"
                        />
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>

              {/* Right side: Preview */}
              <div className="flex flex-col gap-2 h-full min-h-0">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Contract Preview</Label>
                  <Badge variant="secondary">Live Preview</Badge>
                </div>
                <ScrollArea className="flex-1 min-h-0 border rounded-lg p-4 bg-white dark:bg-gray-950">
                  <FormalContractPreview
                    creatorName={editingContract ? getCreatorName(editingContract.creatorId) : "[Creator's Full Name]"}
                    contractDate={editingContract ? new Date(editingContract.createdAt) : new Date()}
                    introductionContent={introductionContractContent}
                    deliverablesContent={deliverablesContractContent}
                    contentUsageContent={contentUsageContractContent}
                    exclusivityEnabled={exclusivityEnabled}
                    exclusivityContent={exclusivityContractContent}
                    scheduleContent={scheduleContractContent}
                    paymentContent={paymentContractContent}
                  />
                </ScrollArea>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowEditContractModal(false);
              setEditingContract(null);
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEditedContract}
              disabled={updateContractMutation.isPending}
              data-testid="button-save-edited-contract"
            >
              {updateContractMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
