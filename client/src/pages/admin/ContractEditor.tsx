import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Save, Upload, FileText, Info, RotateCcw, Settings } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CONTRACT_VARIABLES } from "@shared/schema";
import type { ContractTemplateDefaults } from "@shared/schema";
import SectionPresetsManager from "@/components/SectionPresetsManager";
import { getDefaultLegalTerms } from "@shared/contractSections";

interface ContractSettings {
  id: string;
  templateContent: string;
  companySignatureUrl: string | null;
  companySignerName: string;
  companyName: string;
  defaultCommissionRate: number;
  updatedAt: string;
}

const defaultFormContent = {
  introduction: `We're offering $500 (USD) plus framed (open edition) artwork(s) of your choice in exchange for a dedicated Instagram reel featuring an unboxing, styling and short intro to the studio.

We hope you love the artworks you've chosen, so please tag us in any future posts where they feature.

We prefer not to provide too much creative direction, as we want your content to feel authentic. But if you have any questions, or want some guidance, feel free to ask us. Once the contract is signed and artworks are selected, we will send you more information about our company.`,
  deliverables: `One (1) Instagram Reel featuring the artwork unboxing, styling and brand mention.`,
  contentUsage: `In exchange for the agreed fee, you grant East Side Studio London a world-wide, perpetual, royalty-free licence to use, edit and promote the content you create on any platform (owned channels, social media, paid ads, print, OOH, etc.) and to let our agencies do the same. You keep ownership; credit will be given on organic posts where practical.`,
  exclusivity: `We ask for a 30-day exclusivity period following your first post. During this time, we'd ask that you don't feature, review, or promote competing art or wall-décor brands, whether gifted, paid, or organic.`,
  schedule: `We require content to be posted within 3 weeks of the delivery date. Shipping generally takes 7 days from the date the partnership is finalised.`,
  payment: `The collaboration fee will be paid within 14 days of your reel going live.

You will need to provide an invoice to receive payment.`,
};

const defaultContractContent = {
  introduction: `Brand engages Creative Partner to create and deliver content promoting Brand's art products in accordance with the terms set forth herein.`,
  deliverables: `Creative Partner shall deliver: One (1) Instagram Reel featuring product unboxing, styling demonstration, and brand mention, meeting all technical specifications outlined in the creative brief.`,
  contentUsage: `Creative Partner grants Brand a worldwide, perpetual, royalty-free, transferable licence to use, reproduce, modify, distribute, publicly display, and create derivative works from all Deliverables across all media channels including but not limited to social media, digital advertising, print, out-of-home, and point-of-sale materials. Creative Partner retains underlying copyright; credit will be provided on organic Brand-owned posts where commercially practical.`,
  exclusivity: `During the Exclusivity Period of thirty (30) calendar days following first publication of the Deliverables, Creative Partner shall not create, publish, or promote content featuring directly competing products (defined as art prints, wall décor, or home artwork from other brands) whether paid, gifted, or organic.`,
  schedule: `All Deliverables must be published within twenty-one (21) calendar days of product delivery. Estimated shipping time is seven (7) business days from contract execution. Late delivery without prior written approval constitutes material breach.`,
  payment: `Brand shall pay the agreed Collaboration Fee within fourteen (14) calendar days of Creative Partner's first publication of approved Deliverables. Payment is contingent upon receipt of a valid invoice from Creative Partner.`,
};

// Get defaults from shared source - single source of truth
const defaultLegalTerms = getDefaultLegalTerms();

export default function ContractEditor() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("artist");
  
  // Artist contract state
  const [templateContent, setTemplateContent] = useState("");
  const [companySignerName, setCompanySignerName] = useState("Philip Jobling");
  const [companyName, setCompanyName] = useState("East Side Studio London");
  const [defaultCommissionRate, setDefaultCommissionRate] = useState(18);
  const [companySignatureUrl, setCompanySignatureUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Creator contract state
  const [introductionForm, setIntroductionForm] = useState(defaultFormContent.introduction);
  const [introductionContract, setIntroductionContract] = useState(defaultContractContent.introduction);
  const [deliverablesForm, setDeliverablesForm] = useState(defaultFormContent.deliverables);
  const [deliverablesContract, setDeliverablesContract] = useState(defaultContractContent.deliverables);
  const [contentUsageForm, setContentUsageForm] = useState(defaultFormContent.contentUsage);
  const [contentUsageContract, setContentUsageContract] = useState(defaultContractContent.contentUsage);
  const [exclusivityForm, setExclusivityForm] = useState(defaultFormContent.exclusivity);
  const [exclusivityContract, setExclusivityContract] = useState(defaultContractContent.exclusivity);
  const [scheduleForm, setScheduleForm] = useState(defaultFormContent.schedule);
  const [scheduleContract, setScheduleContract] = useState(defaultContractContent.schedule);
  const [paymentForm, setPaymentForm] = useState(defaultFormContent.payment);
  const [paymentContract, setPaymentContract] = useState(defaultContractContent.payment);
  const [exclusivityEnabled, setExclusivityEnabled] = useState(true);

  // Legal terms state
  const [legalCompliance, setLegalCompliance] = useState(defaultLegalTerms.legalCompliance);
  const [morality, setMorality] = useState(defaultLegalTerms.morality);
  const [independentContractor, setIndependentContractor] = useState(defaultLegalTerms.independentContractor);
  const [forceMajeure, setForceMajeure] = useState(defaultLegalTerms.forceMajeure);
  const [disputeResolution, setDisputeResolution] = useState(defaultLegalTerms.disputeResolution);
  const [takedown, setTakedown] = useState(defaultLegalTerms.takedown);
  const [termination, setTermination] = useState(defaultLegalTerms.termination);
  const [indemnity, setIndemnity] = useState(defaultLegalTerms.indemnity);
  const [confidentiality, setConfidentiality] = useState(defaultLegalTerms.confidentiality);
  const [dataProtection, setDataProtection] = useState(defaultLegalTerms.dataProtection);
  const [insurance, setInsurance] = useState(defaultLegalTerms.insurance);
  const [language, setLanguage] = useState(defaultLegalTerms.language);
  const [boilerplate, setBoilerplate] = useState(defaultLegalTerms.boilerplate);

  // Section headings state - Form View
  const [introductionHeadingForm, setIntroductionHeadingForm] = useState("Introduction / About The Collaboration");
  const [deliverablesHeadingForm, setDeliverablesHeadingForm] = useState("Deliverables & Requirements");
  const [paymentHeadingForm, setPaymentHeadingForm] = useState("Payment");
  const [contentUsageHeadingForm, setContentUsageHeadingForm] = useState("Content Usage Permissions");
  const [exclusivityHeadingForm, setExclusivityHeadingForm] = useState("Exclusivity");
  const [scheduleHeadingForm, setScheduleHeadingForm] = useState("Schedule & Deadlines");

  // Section headings state - Contract View
  const [introductionHeadingContract, setIntroductionHeadingContract] = useState("SCOPE OF COLLABORATION");
  const [deliverablesHeadingContract, setDeliverablesHeadingContract] = useState("SCOPE OF WORK");
  const [paymentHeadingContract, setPaymentHeadingContract] = useState("COMPENSATION");
  const [contentUsageHeadingContract, setContentUsageHeadingContract] = useState("CONTENT USAGE & LICENCE");
  const [exclusivityHeadingContract, setExclusivityHeadingContract] = useState("EXCLUSIVITY");
  const [scheduleHeadingContract, setScheduleHeadingContract] = useState("SCHEDULE & DEADLINES");

  // Queries
  const { data: settings, isLoading: settingsLoading } = useQuery<ContractSettings>({
    queryKey: ["/api/admin/contract-settings"],
  });

  const { data: savedDefaults, isLoading: defaultsLoading } = useQuery<ContractTemplateDefaults | null>({
    queryKey: ["/api/admin/contract-template-defaults"],
  });

  useEffect(() => {
    if (settings) {
      setTemplateContent(settings.templateContent);
      setCompanySignerName(settings.companySignerName);
      setCompanyName(settings.companyName);
      setDefaultCommissionRate(settings.defaultCommissionRate);
      setCompanySignatureUrl(settings.companySignatureUrl);
    }
  }, [settings]);

  useEffect(() => {
    if (savedDefaults) {
      setIntroductionForm(savedDefaults.introductionFormDefault || defaultFormContent.introduction);
      setIntroductionContract(savedDefaults.introductionContractDefault || defaultContractContent.introduction);
      setDeliverablesForm(savedDefaults.deliverablesFormDefault || defaultFormContent.deliverables);
      setDeliverablesContract(savedDefaults.deliverablesContractDefault || defaultContractContent.deliverables);
      setContentUsageForm(savedDefaults.contentUsageFormDefault || defaultFormContent.contentUsage);
      setContentUsageContract(savedDefaults.contentUsageContractDefault || defaultContractContent.contentUsage);
      setExclusivityForm(savedDefaults.exclusivityFormDefault || defaultFormContent.exclusivity);
      setExclusivityContract(savedDefaults.exclusivityContractDefault || defaultContractContent.exclusivity);
      setScheduleForm(savedDefaults.scheduleFormDefault || defaultFormContent.schedule);
      setScheduleContract(savedDefaults.scheduleContractDefault || defaultContractContent.schedule);
      setPaymentForm(savedDefaults.paymentFormDefault || defaultFormContent.payment);
      setPaymentContract(savedDefaults.paymentContractDefault || defaultContractContent.payment);
      setExclusivityEnabled(savedDefaults.exclusivityEnabledDefault ?? true);
      // Legal terms
      setLegalCompliance(savedDefaults.legalComplianceDefault || defaultLegalTerms.legalCompliance);
      setMorality(savedDefaults.moralityDefault || defaultLegalTerms.morality);
      setIndependentContractor(savedDefaults.independentContractorDefault || defaultLegalTerms.independentContractor);
      setForceMajeure(savedDefaults.forceMajeureDefault || defaultLegalTerms.forceMajeure);
      setDisputeResolution(savedDefaults.disputeResolutionDefault || defaultLegalTerms.disputeResolution);
      setTakedown(savedDefaults.takedownDefault || defaultLegalTerms.takedown);
      setTermination(savedDefaults.terminationDefault || defaultLegalTerms.termination);
      setIndemnity(savedDefaults.indemnityDefault || defaultLegalTerms.indemnity);
      setConfidentiality(savedDefaults.confidentialityDefault || defaultLegalTerms.confidentiality);
      setDataProtection(savedDefaults.dataProtectionDefault || defaultLegalTerms.dataProtection);
      setInsurance(savedDefaults.insuranceDefault || defaultLegalTerms.insurance);
      setLanguage(savedDefaults.languageDefault || defaultLegalTerms.language);
      setBoilerplate(savedDefaults.boilerplateDefault || defaultLegalTerms.boilerplate);
      // Section headings
      setIntroductionHeadingForm(savedDefaults.introductionHeadingForm || "Introduction / About The Collaboration");
      setDeliverablesHeadingForm(savedDefaults.deliverablesHeadingForm || "Deliverables & Requirements");
      setPaymentHeadingForm(savedDefaults.paymentHeadingForm || "Payment");
      setContentUsageHeadingForm(savedDefaults.contentUsageHeadingForm || "Content Usage Permissions");
      setExclusivityHeadingForm(savedDefaults.exclusivityHeadingForm || "Exclusivity");
      setScheduleHeadingForm(savedDefaults.scheduleHeadingForm || "Schedule & Deadlines");
      setIntroductionHeadingContract(savedDefaults.introductionHeadingContract || "SCOPE OF COLLABORATION");
      setDeliverablesHeadingContract(savedDefaults.deliverablesHeadingContract || "SCOPE OF WORK");
      setPaymentHeadingContract(savedDefaults.paymentHeadingContract || "COMPENSATION");
      setContentUsageHeadingContract(savedDefaults.contentUsageHeadingContract || "CONTENT USAGE & LICENCE");
      setExclusivityHeadingContract(savedDefaults.exclusivityHeadingContract || "EXCLUSIVITY");
      setScheduleHeadingContract(savedDefaults.scheduleHeadingContract || "SCHEDULE & DEADLINES");
    }
  }, [savedDefaults]);

  // Mutations
  const updateArtistMutation = useMutation({
    mutationFn: async (updates: Partial<ContractSettings>) => {
      if (!settings?.id) throw new Error("No settings to update");
      return apiRequest("PATCH", `/api/admin/contract-settings/${settings.id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contract-settings"] });
      toast({
        title: "Settings saved",
        description: "Artist contract template has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  const saveCreatorMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/contract-template-defaults", {
        introductionFormDefault: introductionForm,
        introductionContractDefault: introductionContract,
        deliverablesFormDefault: deliverablesForm,
        deliverablesContractDefault: deliverablesContract,
        contentUsageFormDefault: contentUsageForm,
        contentUsageContractDefault: contentUsageContract,
        exclusivityFormDefault: exclusivityForm,
        exclusivityContractDefault: exclusivityContract,
        scheduleFormDefault: scheduleForm,
        scheduleContractDefault: scheduleContract,
        paymentFormDefault: paymentForm,
        paymentContractDefault: paymentContract,
        exclusivityEnabledDefault: exclusivityEnabled,
        // Legal terms
        legalComplianceDefault: legalCompliance,
        moralityDefault: morality,
        independentContractorDefault: independentContractor,
        forceMajeureDefault: forceMajeure,
        disputeResolutionDefault: disputeResolution,
        takedownDefault: takedown,
        terminationDefault: termination,
        indemnityDefault: indemnity,
        confidentialityDefault: confidentiality,
        dataProtectionDefault: dataProtection,
        insuranceDefault: insurance,
        languageDefault: language,
        boilerplateDefault: boilerplate,
        // Section headings
        introductionHeadingForm,
        deliverablesHeadingForm,
        paymentHeadingForm,
        contentUsageHeadingForm,
        exclusivityHeadingForm,
        scheduleHeadingForm,
        introductionHeadingContract,
        deliverablesHeadingContract,
        paymentHeadingContract,
        contentUsageHeadingContract,
        exclusivityHeadingContract,
        scheduleHeadingContract,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contract-template-defaults"] });
      toast({ title: "Settings saved", description: "Creator contract defaults have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    },
  });

  const handleSaveArtist = () => {
    updateArtistMutation.mutate({
      templateContent,
      companySignerName,
      companyName,
      defaultCommissionRate,
      companySignatureUrl,
    });
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        setCompanySignatureUrl(dataUrl);
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setIsUploading(false);
      toast({
        title: "Upload failed",
        description: "Failed to upload signature image",
        variant: "destructive",
      });
    }
  };

  const resetCreatorToDefaults = () => {
    setIntroductionForm(defaultFormContent.introduction);
    setIntroductionContract(defaultContractContent.introduction);
    setDeliverablesForm(defaultFormContent.deliverables);
    setDeliverablesContract(defaultContractContent.deliverables);
    setContentUsageForm(defaultFormContent.contentUsage);
    setContentUsageContract(defaultContractContent.contentUsage);
    setExclusivityForm(defaultFormContent.exclusivity);
    setExclusivityContract(defaultContractContent.exclusivity);
    setScheduleForm(defaultFormContent.schedule);
    setScheduleContract(defaultContractContent.schedule);
    setPaymentForm(defaultFormContent.payment);
    setPaymentContract(defaultContractContent.payment);
    setExclusivityEnabled(true);
    // Legal terms
    setLegalCompliance(defaultLegalTerms.legalCompliance);
    setMorality(defaultLegalTerms.morality);
    setIndependentContractor(defaultLegalTerms.independentContractor);
    setForceMajeure(defaultLegalTerms.forceMajeure);
    setDisputeResolution(defaultLegalTerms.disputeResolution);
    setTakedown(defaultLegalTerms.takedown);
    setTermination(defaultLegalTerms.termination);
    setIndemnity(defaultLegalTerms.indemnity);
    setConfidentiality(defaultLegalTerms.confidentiality);
    setDataProtection(defaultLegalTerms.dataProtection);
    setInsurance(defaultLegalTerms.insurance);
    setLanguage(defaultLegalTerms.language);
    setBoilerplate(defaultLegalTerms.boilerplate);
    toast({ title: "Reset complete", description: "All fields have been reset to defaults." });
  };

  const highlightVariables = (text: string) => {
    const parts = text.split(/(\{\{[A-Z_]+\}\})/g);
    return parts.map((part, index) => {
      if (part.match(/^\{\{[A-Z_]+\}\}$/)) {
        return (
          <span key={index} className="bg-primary/20 text-primary font-semibold px-1 rounded">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  if (settingsLoading || defaultsLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contract Editor</h1>
        <p className="text-muted-foreground">
          Manage contract templates for artists and creators
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="artist" data-testid="tab-artist-contracts">Artist Contracts</TabsTrigger>
          <TabsTrigger value="creator" data-testid="tab-creator-contracts">Creator Contracts</TabsTrigger>
        </TabsList>

        {/* Artist Contracts Tab */}
        <TabsContent value="artist" className="space-y-6 mt-6">
          <div className="flex justify-end">
            <Button 
              onClick={handleSaveArtist} 
              disabled={updateArtistMutation.isPending}
              data-testid="button-save-artist-contract"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateArtistMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Artist Agreement Template
                  </CardTitle>
                  <CardDescription>
                    Edit the contract text for artist onboarding. Use variable placeholders to insert dynamic values.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={templateContent}
                    onChange={(e) => setTemplateContent(e.target.value)}
                    className="min-h-[500px] font-mono text-sm"
                    placeholder="Enter contract template..."
                    data-testid="textarea-artist-template"
                  />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Info className="w-5 h-5" />
                    Variable Placeholders
                  </CardTitle>
                  <CardDescription>
                    These placeholders will be replaced with actual values.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(CONTRACT_VARIABLES).map(([variable, description]) => (
                    <div key={variable} className="space-y-1">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {variable}
                      </Badge>
                      <p className="text-sm text-muted-foreground">{description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Company Settings</CardTitle>
                  <CardDescription>
                    Configure company details for contracts
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Company Name</Label>
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="East Side Studio London"
                      data-testid="input-company-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Signer Name</Label>
                    <Input
                      value={companySignerName}
                      onChange={(e) => setCompanySignerName(e.target.value)}
                      placeholder="Philip Jobling"
                      data-testid="input-signer-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Default Commission Rate (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={defaultCommissionRate}
                      onChange={(e) => setDefaultCommissionRate(parseInt(e.target.value) || 0)}
                      placeholder="18"
                      data-testid="input-commission-rate"
                    />
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Company Signature</Label>
                    <p className="text-sm text-muted-foreground">
                      Upload a signature image for signed contracts.
                    </p>
                    
                    {companySignatureUrl && (
                      <div className="border rounded-lg p-4 bg-white">
                        <img
                          src={companySignatureUrl}
                          alt="Company signature"
                          className="max-h-16 mx-auto"
                        />
                      </div>
                    )}

                    <div className="relative">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleSignatureUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        disabled={isUploading}
                        data-testid="input-signature-upload"
                      />
                      <Button variant="outline" className="w-full pointer-events-none" disabled={isUploading}>
                        <Upload className="w-4 h-4 mr-2" />
                        {isUploading ? "Uploading..." : companySignatureUrl ? "Replace Signature" : "Upload Signature"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Preview Variables</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm leading-relaxed bg-muted/50 p-4 rounded-lg max-h-[200px] overflow-y-auto">
                    {highlightVariables(templateContent.slice(0, 500))}
                    {templateContent.length > 500 && "..."}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Creator Contracts Tab */}
        <TabsContent value="creator" className="space-y-6 mt-6">
          <Tabs defaultValue="defaults" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
              <TabsTrigger value="defaults" data-testid="tab-creator-defaults">
                <FileText className="w-4 h-4 mr-2" />
                Default Templates
              </TabsTrigger>
              <TabsTrigger value="presets" data-testid="tab-creator-presets">
                <Settings className="w-4 h-4 mr-2" />
                Section Presets
              </TabsTrigger>
            </TabsList>

            <TabsContent value="defaults" className="space-y-6">
              <div className="flex justify-end gap-2">
                <Button onClick={() => saveCreatorMutation.mutate()} disabled={saveCreatorMutation.isPending} data-testid="button-save-creator-contract">
                  <Save className="w-4 h-4 mr-2" />
                  {saveCreatorMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Default Settings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Switch
                      id="exclusivity-default"
                      checked={exclusivityEnabled}
                      onCheckedChange={setExclusivityEnabled}
                      data-testid="switch-exclusivity-default"
                    />
                    <Label htmlFor="exclusivity-default">Include Exclusivity Section by Default</Label>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>1. Introduction / About The Collaboration</CardTitle>
                  <CardDescription>The opening section that introduces the partnership</CardDescription>
                </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Form Heading</Label>
                  <Input
                    value={introductionHeadingForm}
                    onChange={(e) => setIntroductionHeadingForm(e.target.value)}
                    data-testid="input-introduction-heading-form"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Contract Heading</Label>
                  <Input
                    value={introductionHeadingContract}
                    onChange={(e) => setIntroductionHeadingContract(e.target.value)}
                    data-testid="input-introduction-heading-contract"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="default" className="bg-blue-500">Form View</Badge>
                    <span className="text-xs text-muted-foreground">Casual language shown to creators</span>
                  </div>
                  <Textarea
                    value={introductionForm}
                    onChange={(e) => setIntroductionForm(e.target.value)}
                    rows={6}
                    data-testid="textarea-introduction-form"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="default" className="bg-amber-500">Contract View</Badge>
                    <span className="text-xs text-muted-foreground">Legal language for formal contract</span>
                  </div>
                  <Textarea
                    value={introductionContract}
                    onChange={(e) => setIntroductionContract(e.target.value)}
                    rows={6}
                    data-testid="textarea-introduction-contract"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Deliverables & Requirements</CardTitle>
              <CardDescription>What the creator is expected to deliver</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Form Heading</Label>
                  <Input
                    value={deliverablesHeadingForm}
                    onChange={(e) => setDeliverablesHeadingForm(e.target.value)}
                    data-testid="input-deliverables-heading-form"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Contract Heading</Label>
                  <Input
                    value={deliverablesHeadingContract}
                    onChange={(e) => setDeliverablesHeadingContract(e.target.value)}
                    data-testid="input-deliverables-heading-contract"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="default" className="bg-blue-500">Form View</Badge>
                  </div>
                  <Textarea
                    value={deliverablesForm}
                    onChange={(e) => setDeliverablesForm(e.target.value)}
                    rows={4}
                    data-testid="textarea-deliverables-form"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="default" className="bg-amber-500">Contract View</Badge>
                  </div>
                  <Textarea
                    value={deliverablesContract}
                    onChange={(e) => setDeliverablesContract(e.target.value)}
                    rows={4}
                    data-testid="textarea-deliverables-contract"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Payment</CardTitle>
              <CardDescription>Payment terms and conditions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Form Heading</Label>
                  <Input
                    value={paymentHeadingForm}
                    onChange={(e) => setPaymentHeadingForm(e.target.value)}
                    data-testid="input-payment-heading-form"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Contract Heading</Label>
                  <Input
                    value={paymentHeadingContract}
                    onChange={(e) => setPaymentHeadingContract(e.target.value)}
                    data-testid="input-payment-heading-contract"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="default" className="bg-blue-500">Form View</Badge>
                  </div>
                  <Textarea
                    value={paymentForm}
                    onChange={(e) => setPaymentForm(e.target.value)}
                    rows={4}
                    data-testid="textarea-payment-form"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="default" className="bg-amber-500">Contract View</Badge>
                  </div>
                  <Textarea
                    value={paymentContract}
                    onChange={(e) => setPaymentContract(e.target.value)}
                    rows={4}
                    data-testid="textarea-payment-contract"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>4. Content Usage Permissions</CardTitle>
              <CardDescription>How the brand can use the creator's content</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Form Heading</Label>
                  <Input
                    value={contentUsageHeadingForm}
                    onChange={(e) => setContentUsageHeadingForm(e.target.value)}
                    data-testid="input-content-usage-heading-form"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Contract Heading</Label>
                  <Input
                    value={contentUsageHeadingContract}
                    onChange={(e) => setContentUsageHeadingContract(e.target.value)}
                    data-testid="input-content-usage-heading-contract"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="default" className="bg-blue-500">Form View</Badge>
                  </div>
                  <Textarea
                    value={contentUsageForm}
                    onChange={(e) => setContentUsageForm(e.target.value)}
                    rows={5}
                    data-testid="textarea-usage-form"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="default" className="bg-amber-500">Contract View</Badge>
                  </div>
                  <Textarea
                    value={contentUsageContract}
                    onChange={(e) => setContentUsageContract(e.target.value)}
                    rows={5}
                    data-testid="textarea-usage-contract"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>5. Exclusivity</CardTitle>
              <CardDescription>Short-term exclusivity requirements (optional section)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Form Heading</Label>
                  <Input
                    value={exclusivityHeadingForm}
                    onChange={(e) => setExclusivityHeadingForm(e.target.value)}
                    data-testid="input-exclusivity-heading-form"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Contract Heading</Label>
                  <Input
                    value={exclusivityHeadingContract}
                    onChange={(e) => setExclusivityHeadingContract(e.target.value)}
                    data-testid="input-exclusivity-heading-contract"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="default" className="bg-blue-500">Form View</Badge>
                  </div>
                  <Textarea
                    value={exclusivityForm}
                    onChange={(e) => setExclusivityForm(e.target.value)}
                    rows={4}
                    data-testid="textarea-exclusivity-form"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="default" className="bg-amber-500">Contract View</Badge>
                  </div>
                  <Textarea
                    value={exclusivityContract}
                    onChange={(e) => setExclusivityContract(e.target.value)}
                    rows={4}
                    data-testid="textarea-exclusivity-contract"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>6. Schedule & Deadlines</CardTitle>
              <CardDescription>Timing requirements for content delivery</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Form Heading</Label>
                  <Input
                    value={scheduleHeadingForm}
                    onChange={(e) => setScheduleHeadingForm(e.target.value)}
                    data-testid="input-schedule-heading-form"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Contract Heading</Label>
                  <Input
                    value={scheduleHeadingContract}
                    onChange={(e) => setScheduleHeadingContract(e.target.value)}
                    data-testid="input-schedule-heading-contract"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="default" className="bg-blue-500">Form View</Badge>
                  </div>
                  <Textarea
                    value={scheduleForm}
                    onChange={(e) => setScheduleForm(e.target.value)}
                    rows={4}
                    data-testid="textarea-schedule-form"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="default" className="bg-amber-500">Contract View</Badge>
                  </div>
                  <Textarea
                    value={scheduleContract}
                    onChange={(e) => setScheduleContract(e.target.value)}
                    rows={4}
                    data-testid="textarea-schedule-contract"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator />

          <div className="bg-muted/50 p-4 rounded-lg mb-4">
            <h3 className="font-semibold mb-2">Standard Legal Terms</h3>
            <p className="text-sm text-muted-foreground">
              The following sections are automatically included in all contracts. You can customise the language below.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>7. Legal Compliance & Disclosures</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={legalCompliance}
                onChange={(e) => setLegalCompliance(e.target.value)}
                rows={3}
                data-testid="textarea-legal-compliance"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>8. Morality & Brand Safety</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={morality}
                onChange={(e) => setMorality(e.target.value)}
                rows={3}
                data-testid="textarea-morality"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>9. Independent Contractor & Taxes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={independentContractor}
                onChange={(e) => setIndependentContractor(e.target.value)}
                rows={3}
                data-testid="textarea-independent-contractor"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>10. Force Majeure & Platform Outage</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={forceMajeure}
                onChange={(e) => setForceMajeure(e.target.value)}
                rows={3}
                data-testid="textarea-force-majeure"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>11. Dispute Resolution</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={disputeResolution}
                onChange={(e) => setDisputeResolution(e.target.value)}
                rows={3}
                data-testid="textarea-dispute-resolution"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>12. Takedown & Content Removal</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={takedown}
                onChange={(e) => setTakedown(e.target.value)}
                rows={3}
                data-testid="textarea-takedown"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>13. Termination & Non-Delivery</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={termination}
                onChange={(e) => setTermination(e.target.value)}
                rows={3}
                data-testid="textarea-termination"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>14. Mutual Indemnity</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={indemnity}
                onChange={(e) => setIndemnity(e.target.value)}
                rows={3}
                data-testid="textarea-indemnity"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>15. Confidentiality</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={confidentiality}
                onChange={(e) => setConfidentiality(e.target.value)}
                rows={3}
                data-testid="textarea-confidentiality"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>16. Data Protection & Privacy</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={dataProtection}
                onChange={(e) => setDataProtection(e.target.value)}
                rows={3}
                data-testid="textarea-data-protection"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>17. Insurance</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={insurance}
                onChange={(e) => setInsurance(e.target.value)}
                rows={2}
                data-testid="textarea-insurance"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>18. Language & Interpretation</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                rows={2}
                data-testid="textarea-language"
              />
            </CardContent>
          </Card>

              <Card>
                <CardHeader>
                  <CardTitle>19. Boilerplate</CardTitle>
                  <CardDescription>Entire Agreement, Amendments, Severability, Assignment, No Partnership</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={boilerplate}
                    onChange={(e) => setBoilerplate(e.target.value)}
                    rows={5}
                    data-testid="textarea-boilerplate"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="presets">
              <SectionPresetsManager />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
