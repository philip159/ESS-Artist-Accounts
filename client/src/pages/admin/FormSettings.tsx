import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { X, CheckCircle2, Plus, Trash2, Upload, Edit, Save, XCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertFormSettingsSchema, insertVariantConfigSchema, type FormSettings, type VariantConfig, type FAQItem, FRAME_OPTIONS } from "@shared/schema";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { z } from "zod";

// Popular Google Fonts (curated list)
const GOOGLE_FONTS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Oswald",
  "Raleway",
  "PT Sans",
  "Merriweather",
  "Nunito",
  "Playfair Display",
  "Poppins",
  "Ubuntu",
  "Mukta",
  "Rubik",
  "Work Sans",
  "Noto Sans",
  "Fira Sans",
  "Quicksand",
  "Karla",
  "Space Grotesk",
  "DM Sans",
  "Manrope",
  "Source Sans Pro",
  "Bebas Neue",
  "Crimson Text",
  "Libre Baskerville",
  "Arvo",
  "Cabin",
  "Anton",
  "Josefin Sans",
  "Barlow",
  "Archivo",
  "Hind",
  "Bitter",
  "Oxygen",
  "Exo 2",
  "Lobster",
  "Dancing Script",
  "Pacifico",
  "Caveat",
  "Satisfy",
].sort();

type FormSettingsData = z.infer<typeof insertFormSettingsSchema>;

type VariantConfigFormData = z.infer<typeof insertVariantConfigSchema>;

// Helper function to load a Google Font dynamically
const loadGoogleFont = (fontName: string) => {
  const fontId = `google-font-${fontName.replace(/\s+/g, '-')}`;
  
  // Check if font is already loaded
  if (document.getElementById(fontId)) {
    return;
  }
  
  // Create link element to load the font
  const link = document.createElement('link');
  link.id = fontId;
  link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, '+')}:wght@400;500;600;700&display=swap`;
  link.rel = 'stylesheet';
  document.head.appendChild(link);
};

export default function FormSettings() {
  const { toast } = useToast();
  const [newArtist, setNewArtist] = useState("");
  const [newColour, setNewColour] = useState("");
  const [newMood, setNewMood] = useState("");
  const [newStyle, setNewStyle] = useState("");
  const [newTheme, setNewTheme] = useState("");
  const [newConfig, setNewConfig] = useState({
    printSize: "",
    frameOption: "Unframed" as string,
    priceGBP: "",
    limitedEditionPriceGBP: "",
    weightGrams: "",
    inventory: "10",
  });
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [editConfig, setEditConfig] = useState<{
    printSize: string;
    frameOption: string;
    priceGBP: string;
    limitedEditionPriceGBP: string;
    weightGrams: string;
    inventory: string;
  } | null>(null);
  
  // FAQ editing state
  const [openEditionFAQs, setOpenEditionFAQs] = useState<FAQItem[]>([]);
  const [limitedEditionFAQs, setLimitedEditionFAQs] = useState<FAQItem[]>([]);
  const [newOpenFAQ, setNewOpenFAQ] = useState({ question: "", answer: "" });
  const [newLimitedFAQ, setNewLimitedFAQ] = useState({ question: "", answer: "" });

  const { data: settings, isLoading } = useQuery<FormSettings>({
    queryKey: ["/api/form-settings"],
  });

  const { data: variantConfigs = [], isLoading: isLoadingConfigs } = useQuery<VariantConfig[]>({
    queryKey: ["/api/variant-configs"],
  });

  const form = useForm<FormSettingsData>({
    resolver: zodResolver(insertFormSettingsSchema),
    defaultValues: {
      copy: {
        step1Title: "",
        step1Subtitle: "",
        nameLabel: "",
        emailLabel: "",
        nameHelpText: "",
        emailHelpText: "",
        step2Title: "",
        step2Subtitle: "",
        uploadLabel: "",
        uploadHelpText: "",
        titleLabel: "",
        titleHelpText: "",
        commentsLabel: "",
        commentsHelpText: "",
        requirementsLabel: "",
        requirementsHelpText: "",
        step3Title: "",
        signatureStatement: "",
        signatureButtonText: "",
        thankYouTitle: "",
        thankYouSubtitle: "",
        printSizesTitle: "Available Print Sizes",
        printSizesHelpText: "Your artwork's aspect ratio determines which print sizes are available.",
        signatureModalTitle: "Add Your Signature",
        signatureModalDescription: "Choose how you'd like to add your signature. You can draw, upload an image, or type your name.",
        signatureDrawHelpText: "Draw your signature using your mouse or finger",
        signatureUploadHelpText: "PNG or JPG only",
        signatureTypeHelpText: "Your signature will appear here",
      },
      typography: {
        headingFont: "Inter",
        bodyFont: "Inter",
        h1Size: "36px",
        h2Size: "30px",
        h3Size: "24px",
        h4Size: "20px",
        bodySize: "16px",
      },
      branding: {
        logoUrl: "",
        primaryColor: "#000000",
        fieldSpacing: "medium",
      },
      nonExclusiveArtists: [],
      colourOptions: [],
      moodOptions: [],
      styleOptions: [],
      themeOptions: [],
      aiPrompts: {
        bodyHTMLPrompt: "",
        titleTagPrompt: "",
        descriptionTagPrompt: "",
      },
      printSizeFAQs: {
        openEdition: [],
        limitedEdition: [],
      },
      additionalFilesHelperText: "Upload alternative versions of this artwork optimized for specific print sizes. This gives you more control over borders and details at different sizes.",
      limitedEditionOverview: "Limited editions are one of the best ways to grow your collection with East Side Studio London. Each edition is capped at a fixed number of prints. Once it sells out, it's retired for good – no reprints. That scarcity makes the work feel more collectable and gives buyers a clear reason to act now. Because these pieces are genuinely limited, they're priced around 150% higher than our open editions. Every edition is produced to our highest spec on 310gsm Hahnemühle German Etching – a richly textured, museum-grade fine art paper that does justice to the work. Released in small quantities, limited editions help you offer something rarer, increase your average selling price, and build momentum around each launch.",
      dropboxBasePath: "/Artist Uploads 2026",
      creatorHeroImageUrl: null,
    },
    values: settings ? {
      ...(() => {
        const { id, updatedAt, faqsLastUpdated, ...rest } = settings;
        return rest;
      })(),
      nonExclusiveArtists: settings.nonExclusiveArtists ?? [],
      colourOptions: settings.colourOptions ?? [],
      moodOptions: settings.moodOptions ?? [],
      styleOptions: settings.styleOptions ?? [],
      themeOptions: settings.themeOptions ?? [],
      aiPrompts: settings.aiPrompts ?? { bodyHTMLPrompt: "", titleTagPrompt: "", descriptionTagPrompt: "" },
      printSizeFAQs: settings.printSizeFAQs ?? { openEdition: [], limitedEdition: [] },
      copy: {
        step1Title: "", step1Subtitle: "", nameLabel: "", emailLabel: "",
        nameHelpText: "", emailHelpText: "", step2Title: "", step2Subtitle: "",
        uploadLabel: "", uploadHelpText: "", titleLabel: "", titleHelpText: "",
        commentsLabel: "", commentsHelpText: "", requirementsLabel: "", requirementsHelpText: "",
        step3Title: "", signatureStatement: "", signatureButtonText: "",
        thankYouTitle: "", thankYouSubtitle: "",
        ...settings.copy,
      },
      typography: {
        headingFont: "Inter", bodyFont: "Inter",
        h1Size: "36px", h2Size: "30px", h3Size: "24px", h4Size: "20px", bodySize: "16px",
        ...settings.typography,
      },
      branding: {
        logoUrl: "", primaryColor: "#000000", fieldSpacing: "medium",
        ...settings.branding,
      },
      limitedEditionOverview: settings.limitedEditionOverview ?? "",
      additionalFilesHelperText: settings.additionalFilesHelperText ?? "",
      dropboxBasePath: settings.dropboxBasePath ?? "/Artist Uploads 2026",
      creatorHeroImageUrl: settings.creatorHeroImageUrl ?? null,
      creatorContractIntroductionDefault: settings.creatorContractIntroductionDefault ?? "",
      creatorContractContentUsageDefault: settings.creatorContractContentUsageDefault ?? "",
      creatorContractExclusivityDefault: settings.creatorContractExclusivityDefault ?? "",
      creatorContractScheduleDefault: settings.creatorContractScheduleDefault ?? "",
      creatorContractPaymentDefault: settings.creatorContractPaymentDefault ?? "",
    } : undefined,
  });

  // Load selected fonts when settings are loaded
  useEffect(() => {
    if (settings?.typography) {
      if (settings.typography.headingFont) {
        loadGoogleFont(settings.typography.headingFont);
      }
      if (settings.typography.bodyFont) {
        loadGoogleFont(settings.typography.bodyFont);
      }
    }
  }, [settings?.typography]);

  // Sync FAQ state when settings load
  useEffect(() => {
    if (settings?.printSizeFAQs) {
      setOpenEditionFAQs(settings.printSizeFAQs.openEdition || []);
      setLimitedEditionFAQs(settings.printSizeFAQs.limitedEdition || []);
    }
  }, [settings?.printSizeFAQs]);

  const updateMutation = useMutation({
    mutationFn: async (data: FormSettingsData) => {
      if (!settings) throw new Error("Settings not loaded");
      return await apiRequest("PUT", `/api/form-settings/${settings.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/form-settings"] });
      toast({
        title: "Settings updated",
        description: "Form settings have been saved successfully",
      });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Failed to update form settings",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormSettingsData) => {
    updateMutation.mutate(data);
  };

  const onInvalid = (errors: Record<string, any>) => {
    console.error("Form validation errors:", errors);
    const errorFields = Object.keys(errors).join(", ");
    toast({
      title: "Validation error",
      description: `Please check these fields: ${errorFields}`,
      variant: "destructive",
    });
  };

  const addArtist = () => {
    if (!newArtist.trim()) return;
    const current = form.getValues("nonExclusiveArtists") || [];
    if (!current.includes(newArtist.trim())) {
      form.setValue("nonExclusiveArtists", [...current, newArtist.trim()]);
      setNewArtist("");
    }
  };

  const removeArtist = (artist: string) => {
    const current = form.getValues("nonExclusiveArtists") || [];
    form.setValue(
      "nonExclusiveArtists",
      current.filter((a) => a !== artist)
    );
  };

  const addOption = (listName: "colourOptions" | "moodOptions" | "styleOptions" | "themeOptions", value: string, setValue: (val: string) => void) => {
    if (!value.trim()) return;
    const current = form.getValues(listName) || [];
    if (!current.includes(value.trim())) {
      form.setValue(listName, [...current, value.trim()]);
      setValue("");
    }
  };

  const removeOption = (listName: "colourOptions" | "moodOptions" | "styleOptions" | "themeOptions", value: string) => {
    const current = form.getValues(listName) || [];
    form.setValue(listName, current.filter((item) => item !== value));
  };

  const createConfigMutation = useMutation({
    mutationFn: async (data: VariantConfigFormData) => {
      return await apiRequest("POST", "/api/variant-configs", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/variant-configs"] });
      setNewConfig({
        printSize: "",
        frameOption: "Unframed",
        priceGBP: "",
        limitedEditionPriceGBP: "",
        weightGrams: "",
        inventory: "10",
      });
      toast({
        title: "Config created",
        description: "Variant configuration has been created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Creation failed",
        description: error.message || "Failed to create variant config",
        variant: "destructive",
      });
    },
  });


  const updateConfigMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<VariantConfigFormData> }) => {
      return await apiRequest("PATCH", `/api/variant-configs/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/variant-configs"] });
      setEditingConfigId(null);
      setEditConfig(null);
      toast({
        title: "Config updated",
        description: "Variant configuration has been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Failed to update variant config",
        variant: "destructive",
      });
    },
  });

  const deleteConfigMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/variant-configs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/variant-configs"] });
      toast({
        title: "Config deleted",
        description: "Variant configuration has been deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Deletion failed",
        description: "Failed to delete variant config",
        variant: "destructive",
      });
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: async () => {
      // Pricing data from the provided CSV
      const pricingData = [
        { size: 'A4 - 8.27" x 11.67"', framedPrice: 69, unframedPrice: 29, framedWeight: 200, unframedWeight: 10 },
        { size: 'A3 - 11.7" x 16.5"', framedPrice: 92, unframedPrice: 39, framedWeight: 200, unframedWeight: 10 },
        { size: 'A2 - 16.5" x 23.4"', framedPrice: 150, unframedPrice: 65, framedWeight: 200, unframedWeight: 10 },
        { size: '20" x 28" (50cm x 70cm)', framedPrice: 175, unframedPrice: 80, framedWeight: 3000, unframedWeight: 10 },
        { size: 'A1 - 23.4" x 33.1"', framedPrice: 210, unframedPrice: 99, framedWeight: 3000, unframedWeight: 10 },
        { size: 'A0 - 33.1" x 46.8"', framedPrice: 310, unframedPrice: 150, framedWeight: 15000, unframedWeight: 10 },
        { size: '12" x 12"', framedPrice: 70, unframedPrice: 32, framedWeight: 200, unframedWeight: 10 },
        { size: '16" x 16"', framedPrice: 95, unframedPrice: 55, framedWeight: 200, unframedWeight: 10 },
        { size: '20" x 20"', framedPrice: 155, unframedPrice: 80, framedWeight: 200, unframedWeight: 10 },
        { size: '30" x 30"', framedPrice: 210, unframedPrice: 95, framedWeight: 3000, unframedWeight: 10 },
        { size: '6" x 8"', unframedPrice: 21, unframedWeight: 10 }, // Only unframed
        { size: '12" x 16"', framedPrice: 92, unframedPrice: 39, framedWeight: 200, unframedWeight: 10 },
        { size: '18" x 24"', framedPrice: 165, unframedPrice: 75, framedWeight: 200, unframedWeight: 10 },
        { size: '24" x 32"', framedPrice: 220, unframedPrice: 95, framedWeight: 3000, unframedWeight: 10 },
        { size: '30" x 40"', framedPrice: 280, unframedPrice: 125, framedWeight: 3000, unframedWeight: 10 },
        { size: '8" x 12"', framedPrice: 69, unframedPrice: 29, framedWeight: 200, unframedWeight: 10 },
        { size: '12" x 18"', framedPrice: 95, unframedPrice: 39, framedWeight: 200, unframedWeight: 10 },
        { size: '20" x 30"', framedPrice: 185, unframedPrice: 85, framedWeight: 3000, unframedWeight: 10 },
        { size: '24" x 36"', framedPrice: 210, unframedPrice: 99, framedWeight: 3000, unframedWeight: 10 },
        { size: '8" x 10"', framedPrice: 69, unframedPrice: 29, framedWeight: 200, unframedWeight: 10 },
        { size: '11" x 14"', framedPrice: 92, unframedPrice: 39, framedWeight: 200, unframedWeight: 10 },
        { size: '16" x 20"', framedPrice: 150, unframedPrice: 60, framedWeight: 200, unframedWeight: 10 },
      ];
      
      return await apiRequest("POST", "/api/variant-configs/bulk-import", { pricingData });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/variant-configs"] });
      toast({
        title: "Bulk import completed",
        description: `Successfully created ${data.created} variant configurations${data.errors > 0 ? ` (${data.errors} errors)` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import variant configs",
        variant: "destructive",
      });
    },
  });

  const handleCreateConfig = () => {
    if (!newConfig.printSize?.trim() || !newConfig.frameOption) {
      toast({
        title: "Validation error",
        description: "Print size and frame option are required",
        variant: "destructive",
      });
      return;
    }
    
    const priceGBP = Number(newConfig.priceGBP);
    const weightGrams = Number(newConfig.weightGrams);
    const inventory = Number(newConfig.inventory);
    
    if (isNaN(priceGBP) || priceGBP < 0) {
      toast({
        title: "Validation error",
        description: "Please enter a valid price",
        variant: "destructive",
      });
      return;
    }
    
    if (isNaN(weightGrams) || weightGrams <= 0) {
      toast({
        title: "Validation error",
        description: "Please enter a valid weight",
        variant: "destructive",
      });
      return;
    }
    
    if (isNaN(inventory) || inventory < 0) {
      toast({
        title: "Validation error",
        description: "Please enter a valid inventory",
        variant: "destructive",
      });
      return;
    }
    
    // Create properly typed data for mutation
    const limitedEditionPriceGBP = newConfig.limitedEditionPriceGBP ? Number(newConfig.limitedEditionPriceGBP) : null;
    
    const configData: VariantConfigFormData = {
      printSize: newConfig.printSize.trim(),
      frameOption: newConfig.frameOption,
      priceGBP,
      limitedEditionPriceGBP: limitedEditionPriceGBP ? Math.round(limitedEditionPriceGBP * 100) : null,
      weightGrams,
      inventory,
    };
    
    createConfigMutation.mutate(configData);
  };

  const startEditConfig = (config: VariantConfig) => {
    setEditingConfigId(config.id);
    setEditConfig({
      printSize: config.printSize,
      frameOption: config.frameOption,
      priceGBP: (config.priceGBP / 100).toString(),
      limitedEditionPriceGBP: config.limitedEditionPriceGBP ? (config.limitedEditionPriceGBP / 100).toString() : "",
      weightGrams: config.weightGrams.toString(),
      inventory: config.inventory.toString(),
    });
  };

  const cancelEdit = () => {
    setEditingConfigId(null);
    setEditConfig(null);
  };

  const handleUpdateConfig = (id: string) => {
    if (!editConfig) return;
    
    const priceGBP = Number(editConfig.priceGBP);
    const weightGrams = Number(editConfig.weightGrams);
    const inventory = Number(editConfig.inventory);
    
    if (isNaN(priceGBP) || priceGBP < 0) {
      toast({
        title: "Validation error",
        description: "Please enter a valid price",
        variant: "destructive",
      });
      return;
    }
    
    if (isNaN(weightGrams) || weightGrams <= 0) {
      toast({
        title: "Validation error",
        description: "Please enter a valid weight",
        variant: "destructive",
      });
      return;
    }
    
    if (isNaN(inventory) || inventory < 0) {
      toast({
        title: "Validation error",
        description: "Please enter a valid inventory",
        variant: "destructive",
      });
      return;
    }
    
    const limitedEditionPriceGBP = editConfig.limitedEditionPriceGBP ? Number(editConfig.limitedEditionPriceGBP) : null;
    
    const configData: Partial<VariantConfigFormData> = {
      priceGBP: Math.round(priceGBP * 100),
      limitedEditionPriceGBP: limitedEditionPriceGBP ? Math.round(limitedEditionPriceGBP * 100) : null,
      weightGrams,
      inventory,
    };
    
    updateConfigMutation.mutate({ id, data: configData });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Form Settings</h1>
        <p className="text-muted-foreground">
          Customize the artist submission form configuration
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
          <Tabs defaultValue="copy" className="w-full">
            <TabsList className="grid w-full grid-cols-8">
              <TabsTrigger value="copy" data-testid="tab-copy">
                Copy & Text
              </TabsTrigger>
              <TabsTrigger value="typography" data-testid="tab-typography">
                Typography
              </TabsTrigger>
              <TabsTrigger value="branding" data-testid="tab-branding">
                Branding
              </TabsTrigger>
              <TabsTrigger value="artists" data-testid="tab-artists">
                Artists
              </TabsTrigger>
              <TabsTrigger value="ai-options" data-testid="tab-ai-options">
                AI Options
              </TabsTrigger>
              <TabsTrigger value="variants" data-testid="tab-variants">
                Variant Configs
              </TabsTrigger>
              <TabsTrigger value="integrations" data-testid="tab-integrations">
                Integrations
              </TabsTrigger>
              <TabsTrigger value="creator-contracts" data-testid="tab-creator-contracts">
                Creators
              </TabsTrigger>
            </TabsList>

            <TabsContent value="copy" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Step 1: Name & Email</CardTitle>
                  <CardDescription>Text shown on the first step of the form</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="copy.step1Title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Page Title</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-step1-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.step1Subtitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subtitle (optional)</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-step1-subtitle" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.nameLabel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name Field Label</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-name-label" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.nameHelpText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name Field Help Text</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-name-help" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.emailLabel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Field Label</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-email-label" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.emailHelpText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Field Help Text</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-email-help" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Step 2: File Upload</CardTitle>
                  <CardDescription>Text shown on the file upload step</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="copy.step2Title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Page Title</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-step2-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.step2Subtitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subtitle</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-step2-subtitle" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.uploadLabel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Upload Field Label</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-upload-label" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.uploadHelpText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Upload Help Text</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-upload-help" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.commentsLabel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Comments Field Label</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-comments-label" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.commentsHelpText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Comments Help Text</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-comments-help" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Step 3: Signature</CardTitle>
                  <CardDescription>Text shown on the signature step</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="copy.step3Title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Page Title</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-step3-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.signatureStatement"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Signature Statement</FormLabel>
                        <FormDescription>
                          The exclusivity agreement text shown above the signature box
                        </FormDescription>
                        <FormControl>
                          <Textarea rows={3} {...field} data-testid="input-signature-statement" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.signatureButtonText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Signature Button Text</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-signature-button" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Thank You Page</CardTitle>
                  <CardDescription>Text shown after successful submission</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="copy.thankYouTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Thank You Title</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-thankyou-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.thankYouSubtitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Thank You Subtitle</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-thankyou-subtitle" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Print Sizes Section</CardTitle>
                  <CardDescription>Text shown in the print sizes dropdown on the upload page</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="copy.printSizesTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dropdown Title</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} data-testid="input-printsizes-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.printSizesHelpText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Help Text</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} data-testid="input-printsizes-help" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Print Size FAQs</CardTitle>
                  <CardDescription>Frequently asked questions shown under the Available Print Sizes section</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm">Open Edition FAQs</h4>
                    {openEditionFAQs.length > 0 && (
                      <Accordion type="single" collapsible className="w-full">
                        {openEditionFAQs.map((faq, index) => (
                          <AccordionItem key={index} value={`open-${index}`}>
                            <div className="flex items-center gap-2">
                              <AccordionTrigger className="flex-1 text-left" data-testid={`accordion-open-faq-${index}`}>
                                {faq.question}
                              </AccordionTrigger>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const updated = openEditionFAQs.filter((_, i) => i !== index);
                                  setOpenEditionFAQs(updated);
                                  form.setValue("printSizeFAQs", { openEdition: updated, limitedEdition: limitedEditionFAQs });
                                }}
                                data-testid={`button-delete-open-faq-${index}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <AccordionContent>
                              <div className="space-y-2 pt-2">
                                <Input
                                  value={faq.question}
                                  onChange={(e) => {
                                    const updated = [...openEditionFAQs];
                                    updated[index] = { ...updated[index], question: e.target.value };
                                    setOpenEditionFAQs(updated);
                                    form.setValue("printSizeFAQs", { openEdition: updated, limitedEdition: limitedEditionFAQs });
                                  }}
                                  placeholder="Question"
                                  data-testid={`input-open-faq-question-${index}`}
                                />
                                <Textarea
                                  value={faq.answer}
                                  onChange={(e) => {
                                    const updated = [...openEditionFAQs];
                                    updated[index] = { ...updated[index], answer: e.target.value };
                                    setOpenEditionFAQs(updated);
                                    form.setValue("printSizeFAQs", { openEdition: updated, limitedEdition: limitedEditionFAQs });
                                  }}
                                  placeholder="Answer"
                                  rows={3}
                                  data-testid={`input-open-faq-answer-${index}`}
                                />
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    )}
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-2">
                        <Input
                          value={newOpenFAQ.question}
                          onChange={(e) => setNewOpenFAQ({ ...newOpenFAQ, question: e.target.value })}
                          placeholder="New question..."
                          data-testid="input-new-open-faq-question"
                        />
                        <Textarea
                          value={newOpenFAQ.answer}
                          onChange={(e) => setNewOpenFAQ({ ...newOpenFAQ, answer: e.target.value })}
                          placeholder="Answer..."
                          rows={2}
                          data-testid="input-new-open-faq-answer"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          if (newOpenFAQ.question.trim() && newOpenFAQ.answer.trim()) {
                            const updated = [...openEditionFAQs, newOpenFAQ];
                            setOpenEditionFAQs(updated);
                            form.setValue("printSizeFAQs", { openEdition: updated, limitedEdition: limitedEditionFAQs });
                            setNewOpenFAQ({ question: "", answer: "" });
                          }
                        }}
                        data-testid="button-add-open-faq"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="border-t pt-6 space-y-4">
                    <h4 className="font-medium text-sm">Limited Edition FAQs</h4>
                    {limitedEditionFAQs.length > 0 && (
                      <Accordion type="single" collapsible className="w-full">
                        {limitedEditionFAQs.map((faq, index) => (
                          <AccordionItem key={index} value={`limited-${index}`}>
                            <div className="flex items-center gap-2">
                              <AccordionTrigger className="flex-1 text-left" data-testid={`accordion-limited-faq-${index}`}>
                                {faq.question}
                              </AccordionTrigger>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const updated = limitedEditionFAQs.filter((_, i) => i !== index);
                                  setLimitedEditionFAQs(updated);
                                  form.setValue("printSizeFAQs", { openEdition: openEditionFAQs, limitedEdition: updated });
                                }}
                                data-testid={`button-delete-limited-faq-${index}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <AccordionContent>
                              <div className="space-y-2 pt-2">
                                <Input
                                  value={faq.question}
                                  onChange={(e) => {
                                    const updated = [...limitedEditionFAQs];
                                    updated[index] = { ...updated[index], question: e.target.value };
                                    setLimitedEditionFAQs(updated);
                                    form.setValue("printSizeFAQs", { openEdition: openEditionFAQs, limitedEdition: updated });
                                  }}
                                  placeholder="Question"
                                  data-testid={`input-limited-faq-question-${index}`}
                                />
                                <Textarea
                                  value={faq.answer}
                                  onChange={(e) => {
                                    const updated = [...limitedEditionFAQs];
                                    updated[index] = { ...updated[index], answer: e.target.value };
                                    setLimitedEditionFAQs(updated);
                                    form.setValue("printSizeFAQs", { openEdition: openEditionFAQs, limitedEdition: updated });
                                  }}
                                  placeholder="Answer"
                                  rows={3}
                                  data-testid={`input-limited-faq-answer-${index}`}
                                />
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    )}
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-2">
                        <Input
                          value={newLimitedFAQ.question}
                          onChange={(e) => setNewLimitedFAQ({ ...newLimitedFAQ, question: e.target.value })}
                          placeholder="New question..."
                          data-testid="input-new-limited-faq-question"
                        />
                        <Textarea
                          value={newLimitedFAQ.answer}
                          onChange={(e) => setNewLimitedFAQ({ ...newLimitedFAQ, answer: e.target.value })}
                          placeholder="Answer..."
                          rows={2}
                          data-testid="input-new-limited-faq-answer"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          if (newLimitedFAQ.question.trim() && newLimitedFAQ.answer.trim()) {
                            const updated = [...limitedEditionFAQs, newLimitedFAQ];
                            setLimitedEditionFAQs(updated);
                            form.setValue("printSizeFAQs", { openEdition: openEditionFAQs, limitedEdition: updated });
                            setNewLimitedFAQ({ question: "", answer: "" });
                          }
                        }}
                        data-testid="button-add-limited-faq"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Signature Modal</CardTitle>
                  <CardDescription>Text shown in the signature popup (Limited Edition only)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="copy.signatureModalTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Modal Title</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} data-testid="input-sigmodal-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.signatureModalDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Modal Description</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} data-testid="input-sigmodal-desc" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.signatureDrawHelpText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Draw Tab Help Text</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} data-testid="input-sigmodal-draw" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.signatureUploadHelpText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Upload Tab Help Text</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} data-testid="input-sigmodal-upload" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="copy.signatureTypeHelpText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type Tab Placeholder</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} data-testid="input-sigmodal-type" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="typography" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Typography Settings</CardTitle>
                  <CardDescription>Font families used in the form</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="typography.headingFont"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Heading Font</FormLabel>
                        <FormDescription>
                          Choose a Google Font for titles and headings
                        </FormDescription>
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            loadGoogleFont(value);
                          }}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-heading-font">
                              <SelectValue 
                                placeholder="Select a font" 
                                style={{ fontFamily: field.value }}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-60">
                            {GOOGLE_FONTS.map((font) => (
                              <SelectItem 
                                key={font} 
                                value={font}
                                style={{ fontFamily: font }}
                              >
                                {font}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {field.value && (
                          <p 
                            className="text-sm mt-2 p-3 border rounded-md bg-muted/30"
                            style={{ fontFamily: field.value }}
                          >
                            Preview: The quick brown fox jumps over the lazy dog
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="typography.bodyFont"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Body Font</FormLabel>
                        <FormDescription>
                          Choose a Google Font for body text and labels
                        </FormDescription>
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            loadGoogleFont(value);
                          }}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-body-font">
                              <SelectValue 
                                placeholder="Select a font" 
                                style={{ fontFamily: field.value }}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-60">
                            {GOOGLE_FONTS.map((font) => (
                              <SelectItem 
                                key={font} 
                                value={font}
                                style={{ fontFamily: font }}
                              >
                                {font}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {field.value && (
                          <p 
                            className="text-sm mt-2 p-3 border rounded-md bg-muted/30"
                            style={{ fontFamily: field.value }}
                          >
                            Preview: The quick brown fox jumps over the lazy dog
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Typography Sizes</CardTitle>
                  <CardDescription>Font sizes for headings and body text</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="typography.h1Size"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>H1 Size</FormLabel>
                        <FormDescription>
                          Font size for main titles (e.g., 36px, 2.25rem, 2.5em)
                        </FormDescription>
                        <FormControl>
                          <Input {...field} placeholder="36px" data-testid="input-h1-size" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="typography.h2Size"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>H2 Size</FormLabel>
                        <FormDescription>
                          Font size for section headings (e.g., 30px, 1.875rem, 2em)
                        </FormDescription>
                        <FormControl>
                          <Input {...field} placeholder="30px" data-testid="input-h2-size" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="typography.h3Size"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>H3 Size</FormLabel>
                        <FormDescription>
                          Font size for subheadings (e.g., 24px, 1.5rem, 1.5em)
                        </FormDescription>
                        <FormControl>
                          <Input {...field} placeholder="24px" data-testid="input-h3-size" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="typography.h4Size"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>H4 Size</FormLabel>
                        <FormDescription>
                          Font size for smaller headings (e.g., 20px, 1.25rem, 1.25em)
                        </FormDescription>
                        <FormControl>
                          <Input {...field} placeholder="20px" data-testid="input-h4-size" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="typography.bodySize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Body Text Size</FormLabel>
                        <FormDescription>
                          Font size for body text and labels (e.g., 16px, 1rem, 1em)
                        </FormDescription>
                        <FormControl>
                          <Input {...field} placeholder="16px" data-testid="input-body-size" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="branding" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Branding Settings</CardTitle>
                  <CardDescription>Colors and logo used in the form</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="branding.primaryColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Color</FormLabel>
                        <FormDescription>
                          Hex color code for buttons and accents (e.g., #1319C1)
                        </FormDescription>
                        <div className="flex gap-2">
                          <div
                            className="w-12 h-12 rounded border border-input"
                            style={{ backgroundColor: field.value }}
                          />
                          <FormControl>
                            <Input {...field} placeholder="#1319C1" data-testid="input-primary-color" />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="branding.logoUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Logo URL</FormLabel>
                        <FormDescription>
                          Path to logo image file (e.g., /assets/logo.png)
                        </FormDescription>
                        <FormControl>
                          <Input {...field} data-testid="input-logo-url" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="branding.fieldSpacing"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Field Spacing</FormLabel>
                        <FormDescription>
                          Gap between field label and body text (e.g., 0.5rem, 1rem, 1.5rem)
                        </FormDescription>
                        <FormControl>
                          <Input {...field} placeholder="1rem" data-testid="input-field-spacing" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Creator Contract Welcome Image</CardTitle>
                  <CardDescription>The hero image shown on the left side of the creator contract welcome page</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="creatorHeroImageUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hero Image URL</FormLabel>
                        <FormDescription>
                          URL of the image to display on the creator contract welcome page
                        </FormDescription>
                        <FormControl>
                          <Input {...field} value={field.value || ""} placeholder="/objects/.private/creator-hero.jpg" data-testid="input-creator-hero-url" />
                        </FormControl>
                        <FormMessage />
                        {field.value && (
                          <div className="mt-2">
                            <img
                              src={field.value}
                              alt="Creator hero preview"
                              className="max-h-48 rounded-lg object-cover"
                            />
                          </div>
                        )}
                      </FormItem>
                    )}
                  />
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Upload a new hero image:
                    </p>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        
                        const formData = new FormData();
                        formData.append("file", file);
                        formData.append("folderKey", "creatorHeroImage");
                        
                        try {
                          const response = await apiRequest("POST", "/api/upload", formData);
                          const data = await response.json();
                          if (data.url) {
                            form.setValue("creatorHeroImageUrl", data.url);
                            toast({ title: "Image uploaded successfully", description: "Save settings to apply the change" });
                          }
                        } catch (error) {
                          toast({ 
                            title: "Upload failed", 
                            description: error instanceof Error ? error.message : "Network error occurred",
                            variant: "destructive" 
                          });
                        }
                        e.target.value = "";
                      }}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                      data-testid="input-creator-hero-upload"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="artists" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Non-Exclusive Artists</CardTitle>
                  <CardDescription>
                    Artists in this list will not see the signature step
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      value={newArtist}
                      onChange={(e) => setNewArtist(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addArtist())}
                      placeholder="Enter artist name"
                      data-testid="input-new-artist"
                    />
                    <Button type="button" onClick={addArtist} data-testid="button-add-artist">
                      Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(form.watch("nonExclusiveArtists") || []).map((artist) => (
                      <Badge
                        key={artist}
                        variant="secondary"
                        className="gap-1 pr-1"
                        data-testid={`artist-badge-${artist}`}
                      >
                        {artist}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0 hover:bg-transparent"
                          onClick={() => removeArtist(artist)}
                          data-testid={`button-remove-artist-${artist}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                  {(form.watch("nonExclusiveArtists") || []).length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No non-exclusive artists added yet
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ai-options" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>AI Prompts</CardTitle>
                  <CardDescription>
                    Customize the prompts used to generate AI metadata for artwork products.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="aiPrompts.bodyHTMLPrompt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Body HTML Prompt</FormLabel>
                        <FormDescription>
                          Instructions for generating the product description HTML
                        </FormDescription>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={3}
                            placeholder="Create an engaging, SEO-optimized product description..."
                            data-testid="input-body-html-prompt"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="aiPrompts.titleTagPrompt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title Tag Prompt</FormLabel>
                        <FormDescription>
                          Instructions for generating the SEO title tag (60 characters max)
                        </FormDescription>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={2}
                            placeholder="Generate a concise, SEO-friendly title tag..."
                            data-testid="input-title-tag-prompt"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="aiPrompts.descriptionTagPrompt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description Tag Prompt</FormLabel>
                        <FormDescription>
                          Instructions for generating the SEO meta description (155 characters max)
                        </FormDescription>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={2}
                            placeholder="Write a compelling meta description..."
                            data-testid="input-description-tag-prompt"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>AI Metadata Options</CardTitle>
                  <CardDescription>
                    Define the allowed values for AI-generated metadata. The AI will only select from these predefined options.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Colour Options */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium mb-2">Colour Options</h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        Dominant colors that can be identified in artworks
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newColour}
                        onChange={(e) => setNewColour(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption("colourOptions", newColour, setNewColour))}
                        placeholder="e.g., Blue, Red, Green"
                        data-testid="input-new-colour"
                      />
                      <Button type="button" onClick={() => addOption("colourOptions", newColour, setNewColour)} data-testid="button-add-colour">
                        Add
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(form.watch("colourOptions") || []).map((colour) => (
                        <Badge
                          key={colour}
                          variant="secondary"
                          className="gap-1 pr-1"
                          data-testid={`colour-badge-${colour}`}
                        >
                          {colour}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 hover:bg-transparent"
                            onClick={() => removeOption("colourOptions", colour)}
                            data-testid={`button-remove-colour-${colour}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                    {(form.watch("colourOptions") || []).length === 0 && (
                      <p className="text-sm text-muted-foreground">No colour options added yet</p>
                    )}
                  </div>

                  {/* Mood Options */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium mb-2">Mood Options</h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        Emotional moods that artworks can evoke
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newMood}
                        onChange={(e) => setNewMood(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption("moodOptions", newMood, setNewMood))}
                        placeholder="e.g., Contemplative, Joyful, Serene"
                        data-testid="input-new-mood"
                      />
                      <Button type="button" onClick={() => addOption("moodOptions", newMood, setNewMood)} data-testid="button-add-mood">
                        Add
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(form.watch("moodOptions") || []).map((mood) => (
                        <Badge
                          key={mood}
                          variant="secondary"
                          className="gap-1 pr-1"
                          data-testid={`mood-badge-${mood}`}
                        >
                          {mood}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 hover:bg-transparent"
                            onClick={() => removeOption("moodOptions", mood)}
                            data-testid={`button-remove-mood-${mood}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                    {(form.watch("moodOptions") || []).length === 0 && (
                      <p className="text-sm text-muted-foreground">No mood options added yet</p>
                    )}
                  </div>

                  {/* Style Options */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium mb-2">Style Options</h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        Artistic styles and movements
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newStyle}
                        onChange={(e) => setNewStyle(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption("styleOptions", newStyle, setNewStyle))}
                        placeholder="e.g., Abstract, Contemporary, Minimalist"
                        data-testid="input-new-style"
                      />
                      <Button type="button" onClick={() => addOption("styleOptions", newStyle, setNewStyle)} data-testid="button-add-style">
                        Add
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(form.watch("styleOptions") || []).map((style) => (
                        <Badge
                          key={style}
                          variant="secondary"
                          className="gap-1 pr-1"
                          data-testid={`style-badge-${style}`}
                        >
                          {style}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 hover:bg-transparent"
                            onClick={() => removeOption("styleOptions", style)}
                            data-testid={`button-remove-style-${style}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                    {(form.watch("styleOptions") || []).length === 0 && (
                      <p className="text-sm text-muted-foreground">No style options added yet</p>
                    )}
                  </div>

                  {/* Theme Options */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium mb-2">Theme Options</h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        Thematic subjects and concepts
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newTheme}
                        onChange={(e) => setNewTheme(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption("themeOptions", newTheme, setNewTheme))}
                        placeholder="e.g., Nature, Urban, Humanity"
                        data-testid="input-new-theme"
                      />
                      <Button type="button" onClick={() => addOption("themeOptions", newTheme, setNewTheme)} data-testid="button-add-theme">
                        Add
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(form.watch("themeOptions") || []).map((theme) => (
                        <Badge
                          key={theme}
                          variant="secondary"
                          className="gap-1 pr-1"
                          data-testid={`theme-badge-${theme}`}
                        >
                          {theme}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 hover:bg-transparent"
                            onClick={() => removeOption("themeOptions", theme)}
                            data-testid={`button-remove-theme-${theme}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                    {(form.watch("themeOptions") || []).length === 0 && (
                      <p className="text-sm text-muted-foreground">No theme options added yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="variants" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Variant Configurations</CardTitle>
                  <CardDescription>
                    Set pricing and weight for each print size and frame option combination
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {isLoadingConfigs ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-4">
                        <h3 className="text-sm font-medium">Add New Configuration</h3>
                        <div className="grid gap-4 md:grid-cols-5">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Print Size</label>
                            <Input
                              value={newConfig.printSize}
                              onChange={(e) => setNewConfig({ ...newConfig, printSize: e.target.value })}
                              placeholder='e.g., A4 - 8.3" x 11.7"'
                              data-testid="input-new-config-size"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Frame</label>
                            <Select
                              value={newConfig.frameOption}
                              onValueChange={(value) => setNewConfig({ ...newConfig, frameOption: value })}
                            >
                              <SelectTrigger data-testid="select-new-config-frame">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FRAME_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Price (pence)</label>
                            <Input
                              type="number"
                              value={newConfig.priceGBP}
                              onChange={(e) => setNewConfig({ ...newConfig, priceGBP: e.target.value })}
                              placeholder="3000"
                              data-testid="input-new-config-price"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Weight (g)</label>
                            <Input
                              type="number"
                              value={newConfig.weightGrams}
                              onChange={(e) => setNewConfig({ ...newConfig, weightGrams: e.target.value })}
                              placeholder="100"
                              data-testid="input-new-config-weight"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Inventory</label>
                            <Input
                              type="number"
                              value={newConfig.inventory}
                              onChange={(e) => setNewConfig({ ...newConfig, inventory: e.target.value })}
                              placeholder="10"
                              data-testid="input-new-config-inventory"
                            />
                          </div>
                        </div>
                        <Button
                          onClick={handleCreateConfig}
                          disabled={createConfigMutation.isPending}
                          data-testid="button-create-config"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          {createConfigMutation.isPending ? "Adding..." : "Add Configuration"}
                        </Button>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium">Existing Configurations ({variantConfigs.length})</h3>
                          {variantConfigs.length === 0 && (
                            <Button
                              variant="outline"
                              onClick={() => bulkImportMutation.mutate()}
                              disabled={bulkImportMutation.isPending}
                              data-testid="button-bulk-import"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              {bulkImportMutation.isPending ? "Importing..." : "Import Pricing Data"}
                            </Button>
                          )}
                        </div>
                        {variantConfigs.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4">
                            No variant configurations yet. Add your first configuration above.
                          </p>
                        ) : (
                          <div className="border rounded-md">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Print Size</TableHead>
                                  <TableHead>Frame Option</TableHead>
                                  <TableHead className="text-right">Price (£)</TableHead>
                                  <TableHead className="text-right">Ltd Ed Price (£)</TableHead>
                                  <TableHead className="text-right">Weight (g)</TableHead>
                                  <TableHead className="text-right">Inventory</TableHead>
                                  <TableHead className="w-20">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {variantConfigs.map((config) => (
                                  <TableRow key={config.id} data-testid={`config-row-${config.id}`}>
                                    {editingConfigId === config.id && editConfig ? (
                                      <>
                                        <TableCell className="font-medium">{config.printSize}</TableCell>
                                        <TableCell>{config.frameOption}</TableCell>
                                        <TableCell className="text-right">
                                          <Input
                                            type="text"
                                            value={editConfig.priceGBP}
                                            onChange={(e) => setEditConfig({ ...editConfig, priceGBP: e.target.value })}
                                            className="w-24 text-right"
                                            placeholder="Price"
                                            data-testid={`input-edit-price-${config.id}`}
                                          />
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <Input
                                            type="text"
                                            value={editConfig.limitedEditionPriceGBP}
                                            onChange={(e) => setEditConfig({ ...editConfig, limitedEditionPriceGBP: e.target.value })}
                                            className="w-24 text-right"
                                            placeholder="Ltd Ed"
                                            data-testid={`input-edit-ltd-price-${config.id}`}
                                          />
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <Input
                                            type="text"
                                            value={editConfig.weightGrams}
                                            onChange={(e) => setEditConfig({ ...editConfig, weightGrams: e.target.value })}
                                            className="w-24 text-right"
                                            placeholder="Weight"
                                            data-testid={`input-edit-weight-${config.id}`}
                                          />
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <Input
                                            type="text"
                                            value={editConfig.inventory}
                                            onChange={(e) => setEditConfig({ ...editConfig, inventory: e.target.value })}
                                            className="w-20 text-right"
                                            placeholder="Inv"
                                            data-testid={`input-edit-inventory-${config.id}`}
                                          />
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex gap-1">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => handleUpdateConfig(config.id)}
                                              disabled={updateConfigMutation.isPending}
                                              data-testid={`button-save-config-${config.id}`}
                                            >
                                              <Save className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={cancelEdit}
                                              data-testid={`button-cancel-edit-${config.id}`}
                                            >
                                              <XCircle className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </TableCell>
                                      </>
                                    ) : (
                                      <>
                                        <TableCell className="font-medium">{config.printSize}</TableCell>
                                        <TableCell>{config.frameOption}</TableCell>
                                        <TableCell className="text-right">£{(config.priceGBP / 100).toFixed(2)}</TableCell>
                                        <TableCell className="text-right">{config.limitedEditionPriceGBP ? `£${(config.limitedEditionPriceGBP / 100).toFixed(2)}` : '-'}</TableCell>
                                        <TableCell className="text-right">{config.weightGrams}g</TableCell>
                                        <TableCell className="text-right">{config.inventory}</TableCell>
                                        <TableCell>
                                          <div className="flex gap-1">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => startEditConfig(config)}
                                              data-testid={`button-edit-config-${config.id}`}
                                            >
                                              <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => deleteConfigMutation.mutate(config.id)}
                                              disabled={deleteConfigMutation.isPending}
                                              data-testid={`button-delete-config-${config.id}`}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </TableCell>
                                      </>
                                    )}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="integrations" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Dropbox Integration</CardTitle>
                  <CardDescription>Configure where artwork files are stored in Dropbox</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="dropboxBasePath"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dropbox Base Path</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            value={field.value || "/Artist Uploads 2026"}
                            placeholder="/Artist Uploads 2026" 
                            data-testid="input-dropbox-base-path" 
                          />
                        </FormControl>
                        <FormDescription>
                          The root folder in Dropbox where artist submissions will be stored. Each submission creates a subfolder with the artist name and date.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Additional Files Helper Text */}
              <Card>
                <CardHeader>
                  <CardTitle>Upload Form Settings</CardTitle>
                  <CardDescription>Configure help text shown on the artist submission form</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="additionalFilesHelperText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Add Files Helper Text</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            value={field.value || "Upload alternative versions of this artwork optimized for specific print sizes. This gives you more control over borders and details at different sizes."}
                            placeholder="Enter helper text for the 'Add files' button..." 
                            rows={3}
                            data-testid="input-additional-files-helper-text" 
                          />
                        </FormControl>
                        <FormDescription>
                          This text appears in the tooltip when artists hover over the "Add files" button. It explains how to use size-specific file uploads.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="limitedEditionOverview"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Limited Edition Overview</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            value={field.value || ""}
                            placeholder="Enter the overview text for limited editions..." 
                            rows={6}
                            data-testid="input-limited-edition-overview" 
                          />
                        </FormControl>
                        <FormDescription>
                          This text appears in the artist submission form when they select "Limited Edition" to explain what limited editions are and their benefits.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="creator-contracts" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Creator Contract Default Content</CardTitle>
                  <CardDescription>
                    Set default content for each section of creator contracts. These defaults will be used when creating new contracts.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="creatorContractIntroductionDefault"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Introduction Section</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            value={field.value || ""}
                            placeholder="Welcome message and collaboration overview..." 
                            rows={4}
                            data-testid="input-creator-introduction-default" 
                          />
                        </FormControl>
                        <FormDescription>
                          The opening section that introduces the collaboration to the creator.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="creatorContractContentUsageDefault"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Content Usage Permissions</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            value={field.value || ""}
                            placeholder="Terms for content usage rights..." 
                            rows={4}
                            data-testid="input-creator-content-usage-default" 
                          />
                        </FormControl>
                        <FormDescription>
                          Describes the content usage rights you're requesting. Creator will be asked to agree Yes/No.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="creatorContractExclusivityDefault"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Short-Term Exclusivity</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            value={field.value || ""}
                            placeholder="Exclusivity period requirements..." 
                            rows={4}
                            data-testid="input-creator-exclusivity-default" 
                          />
                        </FormControl>
                        <FormDescription>
                          Exclusivity terms if applicable. This section can be enabled/disabled per contract.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="creatorContractScheduleDefault"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Schedule</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            value={field.value || ""}
                            placeholder="Content posting timeline requirements..." 
                            rows={4}
                            data-testid="input-creator-schedule-default" 
                          />
                        </FormControl>
                        <FormDescription>
                          Timeline expectations for content creation and posting. Creator will confirm if they can accommodate.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="creatorContractPaymentDefault"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            value={field.value || ""}
                            placeholder="Payment terms and timeline..." 
                            rows={4}
                            data-testid="input-creator-payment-default" 
                          />
                        </FormControl>
                        <FormDescription>
                          Payment terms and timeline. Creator will provide their PayPal email for payment.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pb-6">
            {updateMutation.isSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                Settings saved successfully
              </div>
            )}
            <Button
              type="submit"
              size="lg"
              disabled={updateMutation.isPending}
              data-testid="button-save-settings"
            >
              {updateMutation.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
