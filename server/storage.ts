import { 
  type Artwork, 
  type InsertArtwork,
  type Template,
  type InsertTemplate,
  type Mockup,
  type InsertMockup,
  type VariantConfig,
  type InsertVariantConfig,
  type ExportBatch,
  type InsertExportBatch,
  type FormSettings,
  type InsertFormSettings,
  type Job,
  type InsertJob,
  type UserFeedback,
  type InsertUserFeedback,
  type COALayout,
  type InsertCOALayout,
  type EmailTemplate,
  type InsertEmailTemplate,
  type ArtistAccount,
  type InsertArtistAccount,
  type ArtistSales,
  type InsertArtistSales,
  type PayoutBatch,
  type InsertPayoutBatch,
  type PayoutItem,
  type InsertPayoutItem,
  type CommissionSettings,
  type InsertCommissionSettings,
  type ContractSettings,
  type InsertContractSettings,
  type SignedContract,
  type InsertSignedContract,
  type FormDefinition,
  type InsertFormDefinition,
  type FormField,
  type InsertFormField,
  type FormSubmission,
  type InsertFormSubmission,
  type ScheduledEmail,
  type InsertScheduledEmail,
  type PendingMockup,
  type InsertPendingMockup,
  type OnboardingInvitation,
  type InsertOnboardingInvitation,
  type Creator,
  type InsertCreator,
  type CreatorContract,
  type AddonVariantImage,
  type InsertAddonVariantImage,
  type InsertCreatorContract,
  type CreatorContent,
  type InsertCreatorContent,
  type CreatorInvoice,
  type InsertCreatorInvoice,
  type ContractTemplateDefaults,
  type InsertContractTemplateDefaults,
  type ContractSectionPreset,
  type InsertContractSectionPreset,
  type MockupSettings,
  type InsertMockupSettings,
  type ArSizeMapping,
  type InsertArSizeMapping,
  type ArAnalytics,
  type InsertArAnalytics,
  type ArConversion,
  type InsertArConversion,
  type ProductAddon,
  type InsertProductAddon,
  type AddonVariant,
  type InsertAddonVariant,
  mockupSettings,
  pendingMockups,
  onboardingInvitations,
  creators,
  creatorContracts,
  creatorContents,
  creatorInvoices,
  contractSectionPresets,
  arSizeMappings,
  arAnalytics,
  arConversions,
  productAddons,
  addonVariants,
  addonVariantImages,
  addonOptionSets,
  addonGroups,
  type AddonOptionSet,
  type AddonGroup,
  type InsertAddonOptionSet,
  type InsertAddonGroup,
} from "@shared/schema";
import { randomUUID } from "crypto";

// Storage interface for all CRUD operations
export interface IStorage {
  // Artworks
  getAllArtworks(): Promise<Artwork[]>;
  getArtworksByArtistName(vendorName: string): Promise<Artwork[]>;
  getArtwork(id: string): Promise<Artwork | undefined>;
  createArtwork(artwork: InsertArtwork): Promise<Artwork>;
  updateArtwork(id: string, updates: Partial<Artwork>): Promise<Artwork | undefined>;
  deleteArtwork(id: string): Promise<boolean>;
  groupArtworks(artworkIds: string[], primaryId: string): Promise<void>;
  ungroupArtworks(artworkIds: string[]): Promise<void>;

  // Templates
  getAllTemplates(): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | undefined>;
  createTemplate(template: InsertTemplate): Promise<Template>;
  updateTemplate(id: string, updates: Partial<Template>): Promise<Template | undefined>;
  deleteTemplate(id: string): Promise<boolean>;

  // Mockups
  getAllMockups(): Promise<Mockup[]>;
  getMockup(id: string): Promise<Mockup | undefined>;
  getMockupsByArtwork(artworkId: string): Promise<Mockup[]>;
  getMockupsByTemplate(templateId: string): Promise<Mockup[]>;
  createMockup(mockup: InsertMockup): Promise<Mockup>;
  updateMockup(id: string, updates: Partial<Mockup>): Promise<Mockup | undefined>;
  deleteMockup(id: string): Promise<boolean>;

  // Mockup Settings (positioning/customization)
  getMockupSettingsForArtwork(artworkId: string): Promise<MockupSettings[]>;
  getMockupSettingsForTemplate(templateId: string): Promise<MockupSettings[]>;
  getMockupSetting(artworkId: string, templateId: string, zoneId: string): Promise<MockupSettings | undefined>;
  upsertMockupSettings(settings: InsertMockupSettings): Promise<MockupSettings>;
  deleteMockupSettings(id: string): Promise<boolean>;

  // Pending Mockups (unmatched mockups awaiting manual assignment)
  getAllPendingMockups(): Promise<PendingMockup[]>;
  getPendingMockup(id: string): Promise<PendingMockup | undefined>;
  getPendingMockupByPath(dropboxPath: string): Promise<PendingMockup | undefined>;
  getUnassignedPendingMockups(): Promise<PendingMockup[]>;
  createPendingMockup(mockup: InsertPendingMockup): Promise<PendingMockup>;
  updatePendingMockup(id: string, updates: Partial<PendingMockup>): Promise<PendingMockup | undefined>;
  deletePendingMockup(id: string): Promise<boolean>;

  // Variant Configurations
  getAllVariantConfigs(): Promise<VariantConfig[]>;
  getVariantConfig(id: string): Promise<VariantConfig | undefined>;
  getVariantConfigByOptions(printSize: string, frameOption: string): Promise<VariantConfig | undefined>;
  createVariantConfig(config: InsertVariantConfig): Promise<VariantConfig>;
  updateVariantConfig(id: string, updates: Partial<VariantConfig>): Promise<VariantConfig | undefined>;
  deleteVariantConfig(id: string): Promise<boolean>;

  // Export Batches
  getAllExportBatches(): Promise<ExportBatch[]>;
  getExportBatch(id: string): Promise<ExportBatch | undefined>;
  createExportBatch(batch: InsertExportBatch): Promise<ExportBatch>;
  updateExportBatch(id: string, updates: Partial<ExportBatch>): Promise<ExportBatch | undefined>;
  deleteExportBatch(id: string): Promise<boolean>;

  // Jobs
  getAllJobs(): Promise<Job[]>;
  getJob(id: string): Promise<Job | undefined>;
  getPendingJobs(): Promise<Job[]>;
  claimNextPendingJob(): Promise<Job | undefined>;
  createJob(job: InsertJob): Promise<Job>;
  updateJobStatus(id: string, status: string, progress?: number): Promise<Job | undefined>;
  updateJobResult(id: string, result: { mockupIds?: string[], error?: string }): Promise<Job | undefined>;
  deleteJob(id: string): Promise<boolean>;

  // Form Settings (singleton)
  getFormSettings(): Promise<FormSettings | undefined>;
  createFormSettings(settings: InsertFormSettings): Promise<FormSettings>;
  updateFormSettings(id: string, updates: Partial<FormSettings>): Promise<FormSettings | undefined>;

  // User Feedback
  getAllUserFeedback(): Promise<UserFeedback[]>;
  createUserFeedback(feedback: InsertUserFeedback): Promise<UserFeedback>;

  // COA Layouts
  getAllCOALayouts(): Promise<COALayout[]>;
  getCOALayout(id: string): Promise<COALayout | undefined>;
  getDefaultCOALayout(): Promise<COALayout | undefined>;
  createCOALayout(layout: InsertCOALayout): Promise<COALayout>;
  updateCOALayout(id: string, updates: Partial<COALayout>): Promise<COALayout | undefined>;
  deleteCOALayout(id: string): Promise<boolean>;
  setDefaultCOALayout(id: string): Promise<COALayout | undefined>;

  // Email Templates
  getAllEmailTemplates(): Promise<EmailTemplate[]>;
  getEmailTemplate(id: string): Promise<EmailTemplate | undefined>;
  getEmailTemplateByKey(templateKey: string): Promise<EmailTemplate | undefined>;
  createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate>;
  updateEmailTemplate(id: string, updates: Partial<EmailTemplate>): Promise<EmailTemplate | undefined>;
  deleteEmailTemplate(id: string): Promise<boolean>;

  // Artist Accounts
  getAllArtistAccounts(): Promise<ArtistAccount[]>;
  getArtistAccount(id: string): Promise<ArtistAccount | undefined>;
  getArtistAccountByVendor(vendorName: string): Promise<ArtistAccount | undefined>;
  getArtistAccountByReplitUserId(replitUserId: string): Promise<ArtistAccount | undefined>;
  getArtistAccountBySupabaseUserId(supabaseUserId: string): Promise<ArtistAccount | undefined>;
  getArtistAccountByEmail(email: string): Promise<ArtistAccount | undefined>;
  getArtistAccountByToken(token: string): Promise<ArtistAccount | undefined>;
  createArtistAccount(account: InsertArtistAccount): Promise<ArtistAccount>;
  updateArtistAccount(id: string, updates: Partial<ArtistAccount>): Promise<ArtistAccount | undefined>;
  deleteArtistAccount(id: string): Promise<boolean>;
  upsertArtistAccountByVendor(vendorName: string, updates?: Partial<InsertArtistAccount>): Promise<ArtistAccount>;

  // Artist Sales
  getArtistSales(artistAccountId: string): Promise<ArtistSales[]>;
  createArtistSales(sales: InsertArtistSales): Promise<ArtistSales>;
  updateArtistSales(id: string, updates: Partial<ArtistSales>): Promise<ArtistSales | undefined>;

  // Processed Orders (Webhook Idempotency)
  isOrderProcessed(orderId: string): Promise<boolean>;
  markOrderProcessed(orderId: string): Promise<void>;

  // Payout Batches
  getAllPayoutBatches(): Promise<PayoutBatch[]>;
  getPayoutBatch(id: string): Promise<PayoutBatch | undefined>;
  createPayoutBatch(batch: InsertPayoutBatch): Promise<PayoutBatch>;
  updatePayoutBatch(id: string, updates: Partial<PayoutBatch>): Promise<PayoutBatch | undefined>;
  deletePayoutBatch(id: string): Promise<boolean>;

  // Payout Items
  getPayoutItemsByBatch(batchId: string): Promise<PayoutItem[]>;
  getPayoutItemsByArtist(artistAccountId: string): Promise<PayoutItem[]>;
  getPayoutItem(id: string): Promise<PayoutItem | undefined>;
  createPayoutItem(item: InsertPayoutItem): Promise<PayoutItem>;
  updatePayoutItem(id: string, updates: Partial<PayoutItem>): Promise<PayoutItem | undefined>;
  deletePayoutItem(id: string): Promise<boolean>;

  // Commission Settings (singleton)
  getCommissionSettings(): Promise<CommissionSettings | undefined>;
  createCommissionSettings(settings: InsertCommissionSettings): Promise<CommissionSettings>;
  updateCommissionSettings(id: string, updates: Partial<CommissionSettings>): Promise<CommissionSettings | undefined>;

  // Contract Settings (singleton)
  getContractSettings(): Promise<ContractSettings | undefined>;
  createContractSettings(settings: InsertContractSettings): Promise<ContractSettings>;
  updateContractSettings(id: string, updates: Partial<ContractSettings>): Promise<ContractSettings | undefined>;

  // Signed Contracts
  getAllSignedContracts(): Promise<SignedContract[]>;
  getSignedContract(id: string): Promise<SignedContract | undefined>;
  createSignedContract(contract: InsertSignedContract): Promise<SignedContract>;
  updateSignedContract(id: string, updates: Partial<SignedContract>): Promise<SignedContract | undefined>;

  // Form Definitions
  getAllFormDefinitions(): Promise<FormDefinition[]>;
  getFormDefinition(id: string): Promise<FormDefinition | undefined>;
  getFormDefinitionByKey(key: string): Promise<FormDefinition | undefined>;
  createFormDefinition(definition: InsertFormDefinition): Promise<FormDefinition>;
  updateFormDefinition(id: string, updates: Partial<FormDefinition>): Promise<FormDefinition | undefined>;

  // Form Fields
  getFormFields(formId: string): Promise<FormField[]>;
  createFormField(field: InsertFormField): Promise<FormField>;
  deleteFormFields(formId: string): Promise<void>;

  // Form Submissions
  getFormSubmissions(formId: string, status?: string): Promise<FormSubmission[]>;
  getFormSubmission(id: string): Promise<FormSubmission | undefined>;
  createFormSubmission(submission: InsertFormSubmission): Promise<FormSubmission>;
  updateFormSubmission(id: string, updates: Partial<FormSubmission>): Promise<FormSubmission | undefined>;

  // Scheduled Emails
  getScheduledEmails(status?: string): Promise<ScheduledEmail[]>;
  getPendingScheduledEmails(): Promise<ScheduledEmail[]>;
  getScheduledEmailsBySubmission(submissionId: string): Promise<ScheduledEmail[]>;
  createScheduledEmail(email: InsertScheduledEmail): Promise<ScheduledEmail>;
  updateScheduledEmail(id: number, updates: Partial<ScheduledEmail>): Promise<ScheduledEmail | undefined>;
  cancelScheduledEmailsBySubmission(submissionId: string): Promise<void>;

  // Onboarding Invitations
  getAllOnboardingInvitations(): Promise<OnboardingInvitation[]>;
  getOnboardingInvitation(id: number): Promise<OnboardingInvitation | undefined>;
  getOnboardingInvitationByToken(token: string): Promise<OnboardingInvitation | undefined>;
  createOnboardingInvitation(invitation: InsertOnboardingInvitation): Promise<OnboardingInvitation>;
  updateOnboardingInvitation(id: number, updates: Partial<OnboardingInvitation>): Promise<OnboardingInvitation | undefined>;
  deleteOnboardingInvitation(id: number): Promise<boolean>;

  // Creators
  getAllCreators(): Promise<Creator[]>;
  getCreator(id: string): Promise<Creator | undefined>;
  createCreator(creator: InsertCreator): Promise<Creator>;
  updateCreator(id: string, updates: Partial<Creator>): Promise<Creator | undefined>;
  deleteCreator(id: string): Promise<boolean>;

  // Creator Contracts
  getCreatorContracts(creatorId: string): Promise<CreatorContract[]>;
  getAllCreatorContracts(): Promise<CreatorContract[]>;
  getCreatorContract(id: number): Promise<CreatorContract | undefined>;
  getCreatorContractByToken(token: string): Promise<CreatorContract | undefined>;
  createCreatorContract(contract: InsertCreatorContract): Promise<CreatorContract>;
  updateCreatorContract(id: number, updates: Partial<CreatorContract>): Promise<CreatorContract | undefined>;
  deleteCreatorContract(id: number): Promise<boolean>;

  // Creator Contents
  getCreatorContents(creatorId: string): Promise<CreatorContent[]>;
  createCreatorContent(content: InsertCreatorContent): Promise<CreatorContent>;
  deleteCreatorContent(id: number): Promise<boolean>;

  // Creator Invoices
  getCreatorInvoices(creatorId: string): Promise<CreatorInvoice[]>;
  createCreatorInvoice(invoice: InsertCreatorInvoice): Promise<CreatorInvoice>;
  updateCreatorInvoice(id: number, updates: Partial<CreatorInvoice>): Promise<CreatorInvoice | undefined>;
  deleteCreatorInvoice(id: number): Promise<boolean>;

  // Contract Template Defaults
  getContractTemplateDefaults(): Promise<ContractTemplateDefaults | undefined>;
  upsertContractTemplateDefaults(defaults: InsertContractTemplateDefaults): Promise<ContractTemplateDefaults>;

  // Contract Section Presets
  getContractSectionPresets(sectionType?: string): Promise<ContractSectionPreset[]>;
  getContractSectionPreset(id: string): Promise<ContractSectionPreset | undefined>;
  createContractSectionPreset(preset: InsertContractSectionPreset): Promise<ContractSectionPreset>;
  updateContractSectionPreset(id: string, updates: Partial<ContractSectionPreset>): Promise<ContractSectionPreset | undefined>;
  deleteContractSectionPreset(id: string): Promise<boolean>;
  setDefaultContractSectionPreset(id: string, sectionType: string): Promise<ContractSectionPreset | undefined>;

  // AR Size Mappings
  getArSizeMappings(): Promise<ArSizeMapping[]>;
  getArSizeMapping(id: string): Promise<ArSizeMapping | undefined>;
  getArSizeMappingBySize(websiteSize: string): Promise<ArSizeMapping | undefined>;
  createArSizeMapping(mapping: InsertArSizeMapping): Promise<ArSizeMapping>;
  updateArSizeMapping(id: string, updates: Partial<ArSizeMapping>): Promise<ArSizeMapping | undefined>;
  deleteArSizeMapping(id: string): Promise<boolean>;

  // AR Analytics
  createArAnalyticsEvent(event: InsertArAnalytics): Promise<ArAnalytics>;
  getArAnalytics(days: number): Promise<ArAnalytics[]>;
  getArAnalyticsSummary(days: number, dateFilter?: { start: Date; end: Date } | null): Promise<{
    totalEvents: number;
    uniqueSessions: number;
    byPlatform: { platform: string; count: number }[];
    byEventType: { eventType: string; count: number }[];
    topProducts: { productTitle: string; count: number }[];
    dailyTrend: { date: string; count: number }[];
    byCountry: { country: string; countryCode: string; count: number }[];
    byFrame: { frame: string; frameType: string; count: number }[];
    bySize: { size: string; count: number }[];
    qrScans: number;
    completionRate: number;
    avgGenerationTimeMs: number | null;
  }>;
  
  // AR Conversions
  createArConversion(conversion: InsertArConversion): Promise<ArConversion>;
  getArConversions(days: number): Promise<ArConversion[]>;
  findArSessionForProduct(productHandle: string, lookbackMinutes?: number): Promise<ArAnalytics | null>;
  findArSessionBySessionId(sessionId: string, productHandle: string): Promise<ArAnalytics | null>;
  getArConversionStats(days: number, dateFilter?: { start: Date; end: Date } | null): Promise<{
    totalConversions: number;
    totalRevenue: number;
    conversionRate: number;
    avgTimeToPurchase: number;
    byPlatform: { platform: string; conversions: number; revenue: number }[];
    topConvertingProducts: { productHandle: string; productTitle: string; conversions: number; revenue: number }[];
  }>;

  // Product Add-ons
  getAllProductAddons(): Promise<ProductAddon[]>;
  getProductAddon(id: string): Promise<ProductAddon | undefined>;
  getProductAddonBySlug(slug: string): Promise<ProductAddon | undefined>;
  getProductAddonWithVariants(id: string): Promise<(ProductAddon & { variants: AddonVariant[] }) | undefined>;
  createProductAddon(addon: InsertProductAddon): Promise<ProductAddon>;
  updateProductAddon(id: string, updates: Partial<ProductAddon>): Promise<ProductAddon | undefined>;
  deleteProductAddon(id: string): Promise<boolean>;

  // Addon Variants
  getAddonVariants(addonId: string): Promise<AddonVariant[]>;
  getAllAddonVariants(): Promise<AddonVariant[]>;
  getAddonVariant(id: string): Promise<AddonVariant | undefined>;
  createAddonVariant(variant: InsertAddonVariant): Promise<AddonVariant>;
  updateAddonVariant(id: string, updates: Partial<AddonVariant>): Promise<AddonVariant | undefined>;
  deleteAddonVariant(id: string): Promise<boolean>;

  // Addon Variant Images
  getAddonVariantImages(variantId: string): Promise<AddonVariantImage[]>;
  getAddonVariantImage(variantId: string, frameType: string | null): Promise<AddonVariantImage | undefined>;
  createAddonVariantImage(image: InsertAddonVariantImage): Promise<AddonVariantImage>;
  updateAddonVariantImage(id: string, updates: Partial<AddonVariantImage>): Promise<AddonVariantImage | undefined>;
  deleteAddonVariantImage(id: string): Promise<boolean>;
  upsertAddonVariantImage(image: InsertAddonVariantImage): Promise<AddonVariantImage>;

  // NEW: Addon Option Sets (Level 1 - Globo-style hierarchy)
  getAllAddonOptionSets(): Promise<AddonOptionSet[]>;
  getAddonOptionSet(id: string): Promise<AddonOptionSet | undefined>;
  getAddonOptionSetsByCountry(country: string): Promise<AddonOptionSet[]>;
  createAddonOptionSet(optionSet: InsertAddonOptionSet): Promise<AddonOptionSet>;
  updateAddonOptionSet(id: string, updates: Partial<AddonOptionSet>): Promise<AddonOptionSet | undefined>;
  deleteAddonOptionSet(id: string): Promise<boolean>;

  // NEW: Addon Groups (Level 2 - Globo-style hierarchy)
  getAllAddonGroups(): Promise<AddonGroup[]>;
  getAddonGroup(id: string): Promise<AddonGroup | undefined>;
  getAddonGroupsByOptionSet(optionSetId: string): Promise<AddonGroup[]>;
  getAddonVariantsByGroup(groupId: string): Promise<AddonVariant[]>;
  createAddonGroup(group: InsertAddonGroup): Promise<AddonGroup>;
  updateAddonGroup(id: string, updates: Partial<AddonGroup>): Promise<AddonGroup | undefined>;
  deleteAddonGroup(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private artworks: Map<string, Artwork>;
  private templates: Map<string, Template>;
  private mockups: Map<string, Mockup>;
  private variantConfigs: Map<string, VariantConfig>;
  private exportBatches: Map<string, ExportBatch>;
  private jobs: Map<string, Job>;
  private formSettings: FormSettings | undefined;
  private userFeedback: Map<string, UserFeedback>;
  private coaLayouts: Map<string, COALayout>;
  private emailTemplates: Map<string, EmailTemplate>;
  private artistAccounts: Map<string, ArtistAccount>;
  private artistSales: Map<string, ArtistSales>;
  private processedOrders: Set<string>;
  private payoutBatches: Map<string, PayoutBatch>;
  private payoutItems: Map<string, PayoutItem>;
  private commissionSettingsData: CommissionSettings | undefined;
  private contractSettingsData: ContractSettings | undefined;
  private signedContracts: Map<string, SignedContract>;
  private formDefinitionsMap: Map<string, FormDefinition>;
  private formFieldsMap: Map<string, FormField>;
  private formSubmissionsMap: Map<string, FormSubmission>;
  private pendingMockupsMap: Map<string, PendingMockup>;

  constructor() {
    this.artworks = new Map();
    this.templates = new Map();
    this.mockups = new Map();
    this.variantConfigs = new Map();
    this.exportBatches = new Map();
    this.jobs = new Map();
    this.formSettings = undefined;
    this.userFeedback = new Map();
    this.coaLayouts = new Map();
    this.emailTemplates = new Map();
    this.artistAccounts = new Map();
    this.artistSales = new Map();
    this.processedOrders = new Set();
    this.payoutBatches = new Map();
    this.payoutItems = new Map();
    this.commissionSettingsData = undefined;
    this.contractSettingsData = undefined;
    this.signedContracts = new Map();
    this.formDefinitionsMap = new Map();
    this.formFieldsMap = new Map();
    this.formSubmissionsMap = new Map();
    this.pendingMockupsMap = new Map();
  }

  // Artworks
  async getAllArtworks(): Promise<Artwork[]> {
    return Array.from(this.artworks.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getArtworksByArtistName(vendorName: string): Promise<Artwork[]> {
    return Array.from(this.artworks.values())
      .filter(a => a.artistName === vendorName || a.vendor === vendorName)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getArtwork(id: string): Promise<Artwork | undefined> {
    return this.artworks.get(id);
  }

  async createArtwork(insertArtwork: InsertArtwork): Promise<Artwork> {
    const id = randomUUID();
    const now = new Date();
    const artwork: Artwork = { 
      ...insertArtwork,
      comments: insertArtwork.comments ?? null,
      signature: insertArtwork.signature ?? null,
      lowResFileUrl: insertArtwork.lowResFileUrl ?? null,
      dropboxPath: insertArtwork.dropboxPath ?? null,
      uploadBatchId: insertArtwork.uploadBatchId ?? null,
      uploadedAt: insertArtwork.uploadedAt ?? now,
      groupId: insertArtwork.groupId ?? null,
      isGroupPrimary: insertArtwork.isGroupPrimary ?? false,
      description: insertArtwork.description ?? null,
      vendor: insertArtwork.vendor ?? null,
      tags: insertArtwork.tags ? (insertArtwork.tags as string[]) : null,
      availableSizes: insertArtwork.availableSizes as string[],
      status: insertArtwork.status ?? "pending",
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.artworks.set(id, artwork);
    return artwork;
  }

  async updateArtwork(id: string, updates: Partial<Artwork>): Promise<Artwork | undefined> {
    const artwork = this.artworks.get(id);
    if (!artwork) return undefined;

    const updated: Artwork = {
      ...artwork,
      ...updates,
      id: artwork.id,
      createdAt: artwork.createdAt,
      updatedAt: new Date(),
    };
    this.artworks.set(id, updated);
    return updated;
  }

  async deleteArtwork(id: string): Promise<boolean> {
    return this.artworks.delete(id);
  }

  async groupArtworks(artworkIds: string[], primaryId: string): Promise<void> {
    const groupId = randomUUID();
    for (const id of artworkIds) {
      const artwork = this.artworks.get(id);
      if (artwork) {
        const updated: Artwork = {
          ...artwork,
          groupId,
          isGroupPrimary: id === primaryId,
          updatedAt: new Date(),
        };
        this.artworks.set(id, updated);
      }
    }
  }

  async ungroupArtworks(artworkIds: string[]): Promise<void> {
    for (const id of artworkIds) {
      const artwork = this.artworks.get(id);
      if (artwork) {
        const updated: Artwork = {
          ...artwork,
          groupId: null,
          isGroupPrimary: false,
          updatedAt: new Date(),
        };
        this.artworks.set(id, updated);
      }
    }
  }

  // Templates
  async getAllTemplates(): Promise<Template[]> {
    return Array.from(this.templates.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    return this.templates.get(id);
  }

  async createTemplate(insertTemplate: InsertTemplate): Promise<Template> {
    const id = randomUUID();
    const now = new Date();
    const template: Template = {
      ...insertTemplate,
      description: insertTemplate.description ?? null,
      supportedSizes: insertTemplate.supportedSizes as string[],
      frameZones: insertTemplate.frameZones as Array<{
        id: string;
        corners: { x: number; y: number }[];
      }>,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.templates.set(id, template);
    return template;
  }

  async updateTemplate(id: string, updates: Partial<Template>): Promise<Template | undefined> {
    const template = this.templates.get(id);
    if (!template) return undefined;

    const updated: Template = {
      ...template,
      ...updates,
      id: template.id,
      createdAt: template.createdAt,
      updatedAt: new Date(),
    };
    this.templates.set(id, updated);
    return updated;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    return this.templates.delete(id);
  }

  // Mockups
  async getAllMockups(): Promise<Mockup[]> {
    return Array.from(this.mockups.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getMockup(id: string): Promise<Mockup | undefined> {
    return this.mockups.get(id);
  }

  async getMockupsByArtwork(artworkId: string): Promise<Mockup[]> {
    return Array.from(this.mockups.values())
      .filter(m => m.artworkId === artworkId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getMockupsByTemplate(templateId: string): Promise<Mockup[]> {
    return Array.from(this.mockups.values())
      .filter(m => m.templateId === templateId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createMockup(insertMockup: InsertMockup): Promise<Mockup> {
    const id = randomUUID();
    const mockup: Mockup = {
      ...insertMockup,
      dropboxPath: insertMockup.dropboxPath ?? null,
      id,
      createdAt: new Date(),
    };
    this.mockups.set(id, mockup);
    return mockup;
  }

  async updateMockup(id: string, updates: Partial<Mockup>): Promise<Mockup | undefined> {
    const mockup = this.mockups.get(id);
    if (!mockup) return undefined;
    const updated: Mockup = { ...mockup, ...updates, id: mockup.id, createdAt: mockup.createdAt };
    this.mockups.set(id, updated);
    return updated;
  }

  async deleteMockup(id: string): Promise<boolean> {
    return this.mockups.delete(id);
  }

  // Mockup Settings
  private mockupSettingsMap: Map<string, MockupSettings> = new Map();

  async getMockupSettingsForArtwork(artworkId: string): Promise<MockupSettings[]> {
    return Array.from(this.mockupSettingsMap.values())
      .filter(s => s.artworkId === artworkId);
  }

  async getMockupSettingsForTemplate(templateId: string): Promise<MockupSettings[]> {
    return Array.from(this.mockupSettingsMap.values())
      .filter(s => s.templateId === templateId);
  }

  async getMockupSetting(artworkId: string, templateId: string, zoneId: string): Promise<MockupSettings | undefined> {
    return Array.from(this.mockupSettingsMap.values())
      .find(s => s.artworkId === artworkId && s.templateId === templateId && s.zoneId === zoneId);
  }

  async upsertMockupSettings(settings: InsertMockupSettings): Promise<MockupSettings> {
    const existing = await this.getMockupSetting(settings.artworkId, settings.templateId, settings.zoneId);
    if (existing) {
      const updated: MockupSettings = {
        ...existing,
        ...settings,
        updatedAt: new Date(),
      };
      this.mockupSettingsMap.set(existing.id, updated);
      return updated;
    }

    const id = randomUUID();
    const newSettings: MockupSettings = {
      id,
      artworkId: settings.artworkId,
      templateId: settings.templateId,
      zoneId: settings.zoneId,
      positioning: settings.positioning ?? { scale: 1.0, offsetX: 0, offsetY: 0, rotation: 0 },
      enabled: settings.enabled ?? true,
      previewUrl: settings.previewUrl ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.mockupSettingsMap.set(id, newSettings);
    return newSettings;
  }

  async deleteMockupSettings(id: string): Promise<boolean> {
    return this.mockupSettingsMap.delete(id);
  }

  // Pending Mockups
  async getAllPendingMockups(): Promise<PendingMockup[]> {
    return Array.from(this.pendingMockupsMap.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getPendingMockup(id: string): Promise<PendingMockup | undefined> {
    return this.pendingMockupsMap.get(id);
  }

  async getPendingMockupByPath(dropboxPath: string): Promise<PendingMockup | undefined> {
    return Array.from(this.pendingMockupsMap.values()).find(m => m.dropboxPath === dropboxPath);
  }

  async getUnassignedPendingMockups(): Promise<PendingMockup[]> {
    return Array.from(this.pendingMockupsMap.values())
      .filter(m => m.status === 'unassigned')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createPendingMockup(insert: InsertPendingMockup): Promise<PendingMockup> {
    const id = randomUUID();
    const now = new Date();
    const pending: PendingMockup = {
      id,
      dropboxPath: insert.dropboxPath,
      filename: insert.filename,
      frameType: insert.frameType ?? 'Unframed',
      isLifestyle: insert.isLifestyle ?? false,
      previewUrl: insert.previewUrl ?? null,
      parsedArtworkName: insert.parsedArtworkName ?? null,
      parsedArtistName: insert.parsedArtistName ?? null,
      status: insert.status ?? 'unassigned',
      assignedArtworkId: insert.assignedArtworkId ?? null,
      assignedMockupId: insert.assignedMockupId ?? null,
      bestMatchScore: insert.bestMatchScore ?? null,
      bestMatchReason: insert.bestMatchReason ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.pendingMockupsMap.set(id, pending);
    return pending;
  }

  async updatePendingMockup(id: string, updates: Partial<PendingMockup>): Promise<PendingMockup | undefined> {
    const pending = this.pendingMockupsMap.get(id);
    if (!pending) return undefined;
    const updated: PendingMockup = {
      ...pending,
      ...updates,
      id: pending.id,
      createdAt: pending.createdAt,
      updatedAt: new Date(),
    };
    this.pendingMockupsMap.set(id, updated);
    return updated;
  }

  async deletePendingMockup(id: string): Promise<boolean> {
    return this.pendingMockupsMap.delete(id);
  }

  // Variant Configurations
  async getAllVariantConfigs(): Promise<VariantConfig[]> {
    return Array.from(this.variantConfigs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getVariantConfig(id: string): Promise<VariantConfig | undefined> {
    return this.variantConfigs.get(id);
  }

  async getVariantConfigByOptions(printSize: string, frameOption: string): Promise<VariantConfig | undefined> {
    return Array.from(this.variantConfigs.values()).find(
      vc => vc.printSize === printSize && vc.frameOption === frameOption
    );
  }

  async createVariantConfig(insertConfig: InsertVariantConfig): Promise<VariantConfig> {
    const id = randomUUID();
    const now = new Date();
    const config: VariantConfig = {
      ...insertConfig,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.variantConfigs.set(id, config);
    return config;
  }

  async updateVariantConfig(id: string, updates: Partial<VariantConfig>): Promise<VariantConfig | undefined> {
    const config = this.variantConfigs.get(id);
    if (!config) return undefined;

    const updated: VariantConfig = {
      ...config,
      ...updates,
      id: config.id,
      createdAt: config.createdAt,
      updatedAt: new Date(),
    };
    this.variantConfigs.set(id, updated);
    return updated;
  }

  async deleteVariantConfig(id: string): Promise<boolean> {
    return this.variantConfigs.delete(id);
  }

  // Export Batches
  async getAllExportBatches(): Promise<ExportBatch[]> {
    return Array.from(this.exportBatches.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getExportBatch(id: string): Promise<ExportBatch | undefined> {
    return this.exportBatches.get(id);
  }

  async createExportBatch(insertBatch: InsertExportBatch): Promise<ExportBatch> {
    const id = randomUUID();
    const now = new Date();
    const batch: ExportBatch = {
      ...insertBatch,
      status: insertBatch.status ?? "pending",
      csvFileUrl: insertBatch.csvFileUrl ?? null,
      googleSheetUrl: insertBatch.googleSheetUrl ?? null,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.exportBatches.set(id, batch);
    return batch;
  }

  async updateExportBatch(id: string, updates: Partial<ExportBatch>): Promise<ExportBatch | undefined> {
    const batch = this.exportBatches.get(id);
    if (!batch) return undefined;

    const updated: ExportBatch = {
      ...batch,
      ...updates,
      id: batch.id,
      createdAt: batch.createdAt,
      updatedAt: new Date(),
    };
    this.exportBatches.set(id, updated);
    return updated;
  }

  async deleteExportBatch(id: string): Promise<boolean> {
    return this.exportBatches.delete(id);
  }

  // Jobs
  async getAllJobs(): Promise<Job[]> {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getJob(id: string): Promise<Job | undefined> {
    return this.jobs.get(id);
  }

  async getPendingJobs(): Promise<Job[]> {
    return Array.from(this.jobs.values())
      .filter(j => j.status === "pending")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async claimNextPendingJob(): Promise<Job | undefined> {
    const pending = await this.getPendingJobs();
    if (pending.length === 0) return undefined;
    
    const job = pending[0];
    // Atomically mark as processing
    return this.updateJobStatus(job.id, "processing", 0);
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const id = randomUUID();
    const now = new Date();
    const job: Job = {
      ...insertJob,
      status: insertJob.status ?? "pending",
      progress: insertJob.progress ?? 0,
      artworkIds: insertJob.artworkIds ?? null,
      templateIds: insertJob.templateIds ?? null,
      result: (insertJob.result as { mockupIds?: string[], error?: string } | null) ?? null,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, job);
    return job;
  }

  async updateJobStatus(id: string, status: string, progress?: number): Promise<Job | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;

    const updated: Job = {
      ...job,
      status,
      progress: progress !== undefined ? progress : job.progress,
      updatedAt: new Date(),
    };
    this.jobs.set(id, updated);
    return updated;
  }

  async updateJobResult(id: string, result: { mockupIds?: string[], error?: string }): Promise<Job | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;

    const updated: Job = {
      ...job,
      result,
      updatedAt: new Date(),
    };
    this.jobs.set(id, updated);
    return updated;
  }

  async deleteJob(id: string): Promise<boolean> {
    return this.jobs.delete(id);
  }

  // Form Settings (singleton)
  async getFormSettings(): Promise<FormSettings | undefined> {
    return this.formSettings;
  }

  async createFormSettings(insertSettings: InsertFormSettings): Promise<FormSettings> {
    const id = randomUUID();
    const now = new Date();
    const settings: FormSettings = {
      ...insertSettings,
      id,
      updatedAt: now,
    };
    this.formSettings = settings;
    return settings;
  }

  async updateFormSettings(id: string, updates: Partial<FormSettings>): Promise<FormSettings | undefined> {
    if (!this.formSettings || this.formSettings.id !== id) return undefined;

    const updated: FormSettings = {
      ...this.formSettings,
      ...updates,
      id: this.formSettings.id,
      updatedAt: new Date(),
    };
    this.formSettings = updated;
    return updated;
  }

  // User Feedback
  async getAllUserFeedback(): Promise<UserFeedback[]> {
    return Array.from(this.userFeedback.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createUserFeedback(feedback: InsertUserFeedback): Promise<UserFeedback> {
    const id = randomUUID();
    const now = new Date();
    const newFeedback: UserFeedback = {
      id,
      ...feedback,
      createdAt: now,
    };
    this.userFeedback.set(id, newFeedback);
    return newFeedback;
  }

  // COA Layouts
  async getAllCOALayouts(): Promise<COALayout[]> {
    return Array.from(this.coaLayouts.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getCOALayout(id: string): Promise<COALayout | undefined> {
    return this.coaLayouts.get(id);
  }

  async getDefaultCOALayout(): Promise<COALayout | undefined> {
    return Array.from(this.coaLayouts.values()).find(l => l.isDefault);
  }

  async createCOALayout(insertLayout: InsertCOALayout): Promise<COALayout> {
    const id = randomUUID();
    const now = new Date();
    const layout: COALayout = {
      ...insertLayout,
      id,
      qrCodeImageUrl: insertLayout.qrCodeImageUrl ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.coaLayouts.set(id, layout);
    return layout;
  }

  async updateCOALayout(id: string, updates: Partial<COALayout>): Promise<COALayout | undefined> {
    const layout = this.coaLayouts.get(id);
    if (!layout) return undefined;

    const updated: COALayout = {
      ...layout,
      ...updates,
      id: layout.id,
      createdAt: layout.createdAt,
      updatedAt: new Date(),
    };
    this.coaLayouts.set(id, updated);
    return updated;
  }

  async deleteCOALayout(id: string): Promise<boolean> {
    return this.coaLayouts.delete(id);
  }

  async setDefaultCOALayout(id: string): Promise<COALayout | undefined> {
    const layout = this.coaLayouts.get(id);
    if (!layout) return undefined;

    // Unset any current default
    for (const [layoutId, l] of this.coaLayouts.entries()) {
      if (l.isDefault && layoutId !== id) {
        this.coaLayouts.set(layoutId, { ...l, isDefault: false, updatedAt: new Date() });
      }
    }

    // Set new default
    const updated: COALayout = {
      ...layout,
      isDefault: true,
      updatedAt: new Date(),
    };
    this.coaLayouts.set(id, updated);
    return updated;
  }

  // Email Templates
  async getAllEmailTemplates(): Promise<EmailTemplate[]> {
    return Array.from(this.emailTemplates.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getEmailTemplate(id: string): Promise<EmailTemplate | undefined> {
    return this.emailTemplates.get(id);
  }

  async getEmailTemplateByKey(templateKey: string): Promise<EmailTemplate | undefined> {
    return Array.from(this.emailTemplates.values()).find(t => t.templateKey === templateKey);
  }

  async createEmailTemplate(insertTemplate: InsertEmailTemplate): Promise<EmailTemplate> {
    const id = randomUUID();
    const now = new Date();
    const template: EmailTemplate = {
      ...insertTemplate,
      id,
      description: insertTemplate.description ?? null,
      isActive: insertTemplate.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.emailTemplates.set(id, template);
    return template;
  }

  async updateEmailTemplate(id: string, updates: Partial<EmailTemplate>): Promise<EmailTemplate | undefined> {
    const template = this.emailTemplates.get(id);
    if (!template) return undefined;

    const updated: EmailTemplate = {
      ...template,
      ...updates,
      id: template.id,
      createdAt: template.createdAt,
      updatedAt: new Date(),
    };
    this.emailTemplates.set(id, updated);
    return updated;
  }

  async deleteEmailTemplate(id: string): Promise<boolean> {
    return this.emailTemplates.delete(id);
  }

  // Artist Accounts
  async getAllArtistAccounts(): Promise<ArtistAccount[]> {
    return Array.from(this.artistAccounts.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getArtistAccount(id: string): Promise<ArtistAccount | undefined> {
    return this.artistAccounts.get(id);
  }

  async getArtistAccountByVendor(vendorName: string): Promise<ArtistAccount | undefined> {
    return Array.from(this.artistAccounts.values()).find(a => a.vendorName === vendorName);
  }

  async getArtistAccountByReplitUserId(replitUserId: string): Promise<ArtistAccount | undefined> {
    return Array.from(this.artistAccounts.values()).find(a => a.replitUserId === replitUserId);
  }

  async getArtistAccountBySupabaseUserId(supabaseUserId: string): Promise<ArtistAccount | undefined> {
    return Array.from(this.artistAccounts.values()).find(a => a.supabaseUserId === supabaseUserId);
  }

  async getArtistAccountByEmail(email: string): Promise<ArtistAccount | undefined> {
    const lowerEmail = email.toLowerCase();
    return Array.from(this.artistAccounts.values()).find(
      a => a.primaryEmail?.toLowerCase() === lowerEmail
    );
  }

  async getArtistAccountByToken(token: string): Promise<ArtistAccount | undefined> {
    return Array.from(this.artistAccounts.values()).find(
      a => a.invitationToken === token
    );
  }

  async createArtistAccount(insertAccount: InsertArtistAccount): Promise<ArtistAccount> {
    const id = randomUUID();
    const now = new Date();
    const account: ArtistAccount = {
      ...insertAccount,
      id,
      replitUserId: insertAccount.replitUserId ?? null,
      primaryEmail: insertAccount.primaryEmail ?? null,
      displayName: insertAccount.displayName ?? null,
      paypalEmail: insertAccount.paypalEmail ?? null,
      paypalRecipientName: insertAccount.paypalRecipientName ?? null,
      onboardingStatus: insertAccount.onboardingStatus ?? "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.artistAccounts.set(id, account);
    return account;
  }

  async updateArtistAccount(id: string, updates: Partial<ArtistAccount>): Promise<ArtistAccount | undefined> {
    const account = this.artistAccounts.get(id);
    if (!account) return undefined;

    const updated: ArtistAccount = {
      ...account,
      ...updates,
      id: account.id,
      createdAt: account.createdAt,
      updatedAt: new Date(),
    };
    this.artistAccounts.set(id, updated);
    return updated;
  }

  async deleteArtistAccount(id: string): Promise<boolean> {
    return this.artistAccounts.delete(id);
  }

  async upsertArtistAccountByVendor(vendorName: string, updates?: Partial<InsertArtistAccount>): Promise<ArtistAccount> {
    const existing = await this.getArtistAccountByVendor(vendorName);
    if (existing) {
      if (updates) {
        return (await this.updateArtistAccount(existing.id, updates))!;
      }
      return existing;
    }
    return this.createArtistAccount({ vendorName, ...updates });
  }

  // Artist Sales
  async getArtistSales(artistAccountId: string): Promise<ArtistSales[]> {
    return Array.from(this.artistSales.values())
      .filter(s => s.artistAccountId === artistAccountId)
      .sort((a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime());
  }

  async createArtistSales(insertSales: InsertArtistSales): Promise<ArtistSales> {
    const id = randomUUID();
    const now = new Date();
    const sales: ArtistSales = {
      ...insertSales,
      id,
      productBreakdown: insertSales.productBreakdown ?? null,
      lastSyncedAt: now,
      createdAt: now,
    };
    this.artistSales.set(id, sales);
    return sales;
  }

  async updateArtistSales(id: string, updates: Partial<ArtistSales>): Promise<ArtistSales | undefined> {
    const sales = this.artistSales.get(id);
    if (!sales) return undefined;

    const updated: ArtistSales = {
      ...sales,
      ...updates,
      id: sales.id,
      createdAt: sales.createdAt,
    };
    this.artistSales.set(id, updated);
    return updated;
  }

  // Processed Orders (Webhook Idempotency)
  async isOrderProcessed(orderId: string): Promise<boolean> {
    return this.processedOrders.has(orderId);
  }

  async markOrderProcessed(orderId: string): Promise<void> {
    this.processedOrders.add(orderId);
  }

  // Payout Batches
  async getAllPayoutBatches(): Promise<PayoutBatch[]> {
    return Array.from(this.payoutBatches.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getPayoutBatch(id: string): Promise<PayoutBatch | undefined> {
    return this.payoutBatches.get(id);
  }

  async createPayoutBatch(insertBatch: InsertPayoutBatch): Promise<PayoutBatch> {
    const id = randomUUID();
    const now = new Date();
    const batch: PayoutBatch = {
      ...insertBatch,
      id,
      status: insertBatch.status ?? "draft",
      totalGross: insertBatch.totalGross ?? 0,
      totalFees: insertBatch.totalFees ?? 0,
      totalNet: insertBatch.totalNet ?? 0,
      currency: insertBatch.currency ?? "GBP",
      initiatedBy: insertBatch.initiatedBy ?? null,
      approvedBy: insertBatch.approvedBy ?? null,
      approvedAt: insertBatch.approvedAt ?? null,
      externalBatchId: insertBatch.externalBatchId ?? null,
      errorMessage: insertBatch.errorMessage ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.payoutBatches.set(id, batch);
    return batch;
  }

  async updatePayoutBatch(id: string, updates: Partial<PayoutBatch>): Promise<PayoutBatch | undefined> {
    const batch = this.payoutBatches.get(id);
    if (!batch) return undefined;

    const updated: PayoutBatch = {
      ...batch,
      ...updates,
      id: batch.id,
      createdAt: batch.createdAt,
      updatedAt: new Date(),
    };
    this.payoutBatches.set(id, updated);
    return updated;
  }

  async deletePayoutBatch(id: string): Promise<boolean> {
    // Also delete related payout items
    for (const [itemId, item] of this.payoutItems) {
      if (item.batchId === id) {
        this.payoutItems.delete(itemId);
      }
    }
    return this.payoutBatches.delete(id);
  }

  // Payout Items
  async getPayoutItemsByBatch(batchId: string): Promise<PayoutItem[]> {
    return Array.from(this.payoutItems.values())
      .filter(item => item.batchId === batchId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async getPayoutItemsByArtist(artistAccountId: string): Promise<PayoutItem[]> {
    return Array.from(this.payoutItems.values())
      .filter(item => item.artistAccountId === artistAccountId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getPayoutItem(id: string): Promise<PayoutItem | undefined> {
    return this.payoutItems.get(id);
  }

  async createPayoutItem(insertItem: InsertPayoutItem): Promise<PayoutItem> {
    const id = randomUUID();
    const now = new Date();
    const item: PayoutItem = {
      ...insertItem,
      id,
      paypalRecipientNameSnapshot: insertItem.paypalRecipientNameSnapshot ?? null,
      feeAmount: insertItem.feeAmount ?? 0,
      currency: insertItem.currency ?? "GBP",
      status: insertItem.status ?? "pending",
      externalItemId: insertItem.externalItemId ?? null,
      errorCode: insertItem.errorCode ?? null,
      errorMessage: insertItem.errorMessage ?? null,
      metadata: insertItem.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.payoutItems.set(id, item);
    return item;
  }

  async updatePayoutItem(id: string, updates: Partial<PayoutItem>): Promise<PayoutItem | undefined> {
    const item = this.payoutItems.get(id);
    if (!item) return undefined;

    const updated: PayoutItem = {
      ...item,
      ...updates,
      id: item.id,
      createdAt: item.createdAt,
      updatedAt: new Date(),
    };
    this.payoutItems.set(id, updated);
    return updated;
  }

  async deletePayoutItem(id: string): Promise<boolean> {
    return this.payoutItems.delete(id);
  }

  // Commission Settings
  async getCommissionSettings(): Promise<CommissionSettings | undefined> {
    return this.commissionSettingsData;
  }

  async createCommissionSettings(settings: InsertCommissionSettings): Promise<CommissionSettings> {
    const id = randomUUID();
    const now = new Date();
    const newSettings: CommissionSettings = {
      id,
      defaultCommissionRate: settings.defaultCommissionRate ?? 50,
      applyAfterTax: settings.applyAfterTax ?? true,
      applyAfterShipping: settings.applyAfterShipping ?? true,
      applyAfterDiscounts: settings.applyAfterDiscounts ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.commissionSettingsData = newSettings;
    return newSettings;
  }

  async updateCommissionSettings(id: string, updates: Partial<CommissionSettings>): Promise<CommissionSettings | undefined> {
    if (!this.commissionSettingsData || this.commissionSettingsData.id !== id) {
      return undefined;
    }
    this.commissionSettingsData = {
      ...this.commissionSettingsData,
      ...updates,
      id: this.commissionSettingsData.id,
      createdAt: this.commissionSettingsData.createdAt,
      updatedAt: new Date(),
    };
    return this.commissionSettingsData;
  }

  // Contract Settings
  async getContractSettings(): Promise<ContractSettings | undefined> {
    return this.contractSettingsData;
  }

  async createContractSettings(settings: InsertContractSettings): Promise<ContractSettings> {
    const id = randomUUID();
    const now = new Date();
    const newSettings: ContractSettings = {
      id,
      templateContent: settings.templateContent,
      companySignatureUrl: settings.companySignatureUrl ?? null,
      companySignerName: settings.companySignerName ?? "Philip Jobling",
      companyName: settings.companyName ?? "East Side Studio London",
      defaultCommissionRate: settings.defaultCommissionRate ?? 18,
      updatedAt: now,
    };
    this.contractSettingsData = newSettings;
    return newSettings;
  }

  async updateContractSettings(id: string, updates: Partial<ContractSettings>): Promise<ContractSettings | undefined> {
    if (!this.contractSettingsData || this.contractSettingsData.id !== id) {
      return undefined;
    }
    this.contractSettingsData = {
      ...this.contractSettingsData,
      ...updates,
      id: this.contractSettingsData.id,
      updatedAt: new Date(),
    };
    return this.contractSettingsData;
  }

  // Signed Contracts
  async getAllSignedContracts(): Promise<SignedContract[]> {
    return Array.from(this.signedContracts.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getSignedContract(id: string): Promise<SignedContract | undefined> {
    return this.signedContracts.get(id);
  }

  async createSignedContract(contract: InsertSignedContract): Promise<SignedContract> {
    const id = randomUUID();
    const now = new Date();
    const newContract: SignedContract = {
      ...contract,
      id,
      pdfUrl: null,
      createdAt: now,
    };
    this.signedContracts.set(id, newContract);
    return newContract;
  }

  async updateSignedContract(id: string, updates: Partial<SignedContract>): Promise<SignedContract | undefined> {
    const contract = this.signedContracts.get(id);
    if (!contract) return undefined;
    const updated: SignedContract = {
      ...contract,
      ...updates,
      id: contract.id,
      createdAt: contract.createdAt,
    };
    this.signedContracts.set(id, updated);
    return updated;
  }

  // Form Definitions
  async getAllFormDefinitions(): Promise<FormDefinition[]> {
    return Array.from(this.formDefinitionsMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getFormDefinition(id: string): Promise<FormDefinition | undefined> {
    return this.formDefinitionsMap.get(id);
  }

  async getFormDefinitionByKey(key: string): Promise<FormDefinition | undefined> {
    return Array.from(this.formDefinitionsMap.values()).find(f => f.key === key);
  }

  async createFormDefinition(definition: InsertFormDefinition): Promise<FormDefinition> {
    const id = randomUUID();
    const now = new Date();
    const newDefinition: FormDefinition = {
      id,
      key: definition.key,
      name: definition.name,
      description: definition.description ?? null,
      route: definition.route ?? null,
      emailAssociations: definition.emailAssociations ?? [],
      createdAt: now,
    };
    this.formDefinitionsMap.set(id, newDefinition);
    return newDefinition;
  }

  async updateFormDefinition(id: string, updates: Partial<FormDefinition>): Promise<FormDefinition | undefined> {
    const definition = this.formDefinitionsMap.get(id);
    if (!definition) return undefined;
    const updated: FormDefinition = {
      ...definition,
      ...updates,
      id: definition.id,
      createdAt: definition.createdAt,
    };
    this.formDefinitionsMap.set(id, updated);
    return updated;
  }

  // Form Fields
  async getFormFields(formId: string): Promise<FormField[]> {
    return Array.from(this.formFieldsMap.values())
      .filter(f => f.formId === formId)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }

  async createFormField(field: InsertFormField): Promise<FormField> {
    const id = randomUUID();
    const newField: FormField = {
      id,
      formId: field.formId,
      key: field.key,
      label: field.label,
      type: field.type,
      stepIndex: field.stepIndex ?? 0,
      displayOrder: field.displayOrder ?? 0,
      isArray: field.isArray ?? false,
    };
    this.formFieldsMap.set(id, newField);
    return newField;
  }

  async deleteFormFields(formId: string): Promise<void> {
    for (const [id, field] of this.formFieldsMap.entries()) {
      if (field.formId === formId) {
        this.formFieldsMap.delete(id);
      }
    }
  }

  // Form Submissions
  async getFormSubmissions(formId: string, status?: string): Promise<FormSubmission[]> {
    let submissions = Array.from(this.formSubmissionsMap.values())
      .filter(s => s.formId === formId);
    if (status) {
      submissions = submissions.filter(s => s.status === status);
    }
    return submissions.sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime());
  }

  async getFormSubmission(id: string): Promise<FormSubmission | undefined> {
    return this.formSubmissionsMap.get(id);
  }

  async createFormSubmission(submission: InsertFormSubmission): Promise<FormSubmission> {
    const id = randomUUID();
    const now = new Date();
    const newSubmission: FormSubmission = {
      id,
      formId: submission.formId,
      status: submission.status ?? "in_progress",
      currentStep: submission.currentStep ?? 1,
      totalSteps: submission.totalSteps ?? 1,
      actorEmail: submission.actorEmail ?? null,
      actorName: submission.actorName ?? null,
      data: submission.data ?? {},
      startedAt: now,
      lastUpdatedAt: now,
      completedAt: submission.completedAt ?? null,
      linkedArtistAccountId: submission.linkedArtistAccountId ?? null,
      linkedArtworkIds: submission.linkedArtworkIds ?? [],
    };
    this.formSubmissionsMap.set(id, newSubmission);
    return newSubmission;
  }

  async updateFormSubmission(id: string, updates: Partial<FormSubmission>): Promise<FormSubmission | undefined> {
    const submission = this.formSubmissionsMap.get(id);
    if (!submission) return undefined;
    const updated: FormSubmission = {
      ...submission,
      ...updates,
      id: submission.id,
      startedAt: submission.startedAt,
      lastUpdatedAt: new Date(),
    };
    this.formSubmissionsMap.set(id, updated);
    return updated;
  }

  // Scheduled Emails (placeholder for MemStorage - not used in production)
  async getScheduledEmails(_status?: string): Promise<ScheduledEmail[]> {
    return [];
  }

  async getPendingScheduledEmails(): Promise<ScheduledEmail[]> {
    return [];
  }

  async getScheduledEmailsBySubmission(_submissionId: string): Promise<ScheduledEmail[]> {
    return [];
  }

  async createScheduledEmail(email: InsertScheduledEmail): Promise<ScheduledEmail> {
    return {
      id: 1,
      formSubmissionId: email.formSubmissionId,
      templateKey: email.templateKey,
      recipientEmail: email.recipientEmail,
      recipientType: email.recipientType,
      scheduledFor: email.scheduledFor,
      status: "pending",
      createdAt: new Date(),
      sentAt: null,
      error: null,
    };
  }

  async updateScheduledEmail(_id: number, _updates: Partial<ScheduledEmail>): Promise<ScheduledEmail | undefined> {
    return undefined;
  }

  async cancelScheduledEmailsBySubmission(_submissionId: string): Promise<void> {
    // No-op for MemStorage
  }

  // Onboarding Invitations (placeholder implementations for MemStorage)
  async getAllOnboardingInvitations(): Promise<OnboardingInvitation[]> {
    return [];
  }

  async getOnboardingInvitation(_id: number): Promise<OnboardingInvitation | undefined> {
    return undefined;
  }

  async getOnboardingInvitationByToken(_token: string): Promise<OnboardingInvitation | undefined> {
    return undefined;
  }

  async createOnboardingInvitation(invitation: InsertOnboardingInvitation): Promise<OnboardingInvitation> {
    return {
      id: 1,
      token: invitation.token,
      artistEmail: invitation.artistEmail ?? null,
      artistName: invitation.artistName ?? null,
      status: invitation.status ?? "pending",
      expiresAt: invitation.expiresAt,
      usedAt: null,
      formSubmissionId: null,
      createdAt: new Date(),
      createdBy: invitation.createdBy ?? null,
    };
  }

  async updateOnboardingInvitation(_id: number, _updates: Partial<OnboardingInvitation>): Promise<OnboardingInvitation | undefined> {
    return undefined;
  }

  async deleteOnboardingInvitation(_id: number): Promise<boolean> {
    return false;
  }

  // Creator placeholder implementations
  async getAllCreators(): Promise<Creator[]> { return []; }
  async getCreator(_id: string): Promise<Creator | undefined> { return undefined; }
  async createCreator(creator: InsertCreator): Promise<Creator> {
    return { id: randomUUID(), ...creator, createdAt: new Date(), updatedAt: new Date() } as Creator;
  }
  async updateCreator(_id: string, _updates: Partial<Creator>): Promise<Creator | undefined> { return undefined; }
  async deleteCreator(_id: string): Promise<boolean> { return false; }

  async getCreatorContracts(_creatorId: string): Promise<CreatorContract[]> { return []; }
  async getAllCreatorContracts(): Promise<CreatorContract[]> { return []; }
  async getCreatorContract(_id: number): Promise<CreatorContract | undefined> { return undefined; }
  async getCreatorContractByToken(_token: string): Promise<CreatorContract | undefined> { return undefined; }
  async createCreatorContract(contract: InsertCreatorContract): Promise<CreatorContract> {
    return { id: 1, ...contract, signedAt: null, signerName: null, signatureUrl: null, pdfUrl: null, createdAt: new Date() } as CreatorContract;
  }
  async updateCreatorContract(_id: number, _updates: Partial<CreatorContract>): Promise<CreatorContract | undefined> { return undefined; }
  async deleteCreatorContract(_id: number): Promise<boolean> { return false; }

  async getCreatorContents(_creatorId: string): Promise<CreatorContent[]> { return []; }
  async createCreatorContent(content: InsertCreatorContent): Promise<CreatorContent> {
    return { id: 1, ...content, createdAt: new Date() } as CreatorContent;
  }
  async deleteCreatorContent(_id: number): Promise<boolean> { return false; }

  async getCreatorInvoices(_creatorId: string): Promise<CreatorInvoice[]> { return []; }
  async createCreatorInvoice(invoice: InsertCreatorInvoice): Promise<CreatorInvoice> {
    return { id: 1, ...invoice, createdAt: new Date() } as CreatorInvoice;
  }
  async updateCreatorInvoice(_id: number, _updates: Partial<CreatorInvoice>): Promise<CreatorInvoice | undefined> { return undefined; }
  async deleteCreatorInvoice(_id: number): Promise<boolean> { return false; }

  // Contract Template Defaults
  private contractTemplateDefaultsData: ContractTemplateDefaults | undefined;
  async getContractTemplateDefaults(): Promise<ContractTemplateDefaults | undefined> { 
    return this.contractTemplateDefaultsData; 
  }
  async upsertContractTemplateDefaults(defaults: InsertContractTemplateDefaults): Promise<ContractTemplateDefaults> {
    this.contractTemplateDefaultsData = { id: 1, ...defaults, updatedAt: new Date() } as ContractTemplateDefaults;
    return this.contractTemplateDefaultsData;
  }

  // Contract Section Presets
  private contractSectionPresetsMap: Map<string, ContractSectionPreset> = new Map();
  async getContractSectionPresets(sectionType?: string): Promise<ContractSectionPreset[]> {
    const presets = Array.from(this.contractSectionPresetsMap.values());
    if (sectionType) {
      return presets.filter(p => p.sectionType === sectionType);
    }
    return presets;
  }
  async getContractSectionPreset(id: string): Promise<ContractSectionPreset | undefined> {
    return this.contractSectionPresetsMap.get(id);
  }
  async createContractSectionPreset(preset: InsertContractSectionPreset): Promise<ContractSectionPreset> {
    const id = randomUUID();
    const newPreset: ContractSectionPreset = { 
      id, 
      ...preset, 
      isDefault: preset.isDefault ?? false,
      sortOrder: preset.sortOrder ?? 0,
      createdAt: new Date(), 
      updatedAt: new Date() 
    };
    this.contractSectionPresetsMap.set(id, newPreset);
    return newPreset;
  }
  async updateContractSectionPreset(id: string, updates: Partial<ContractSectionPreset>): Promise<ContractSectionPreset | undefined> {
    const existing = this.contractSectionPresetsMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.contractSectionPresetsMap.set(id, updated);
    return updated;
  }
  async deleteContractSectionPreset(id: string): Promise<boolean> {
    return this.contractSectionPresetsMap.delete(id);
  }
  async setDefaultContractSectionPreset(id: string, sectionType: string): Promise<ContractSectionPreset | undefined> {
    // Clear all defaults for this section type
    for (const [key, preset] of this.contractSectionPresetsMap) {
      if (preset.sectionType === sectionType && preset.isDefault) {
        this.contractSectionPresetsMap.set(key, { ...preset, isDefault: false });
      }
    }
    // Set new default
    const preset = this.contractSectionPresetsMap.get(id);
    if (preset) {
      const updated = { ...preset, isDefault: true };
      this.contractSectionPresetsMap.set(id, updated);
      return updated;
    }
    return undefined;
  }

  // AR Size Mappings (in-memory)
  private arSizeMappingsMap = new Map<string, ArSizeMapping>();
  
  async getArSizeMappings(): Promise<ArSizeMapping[]> {
    return Array.from(this.arSizeMappingsMap.values());
  }
  async getArSizeMapping(id: string): Promise<ArSizeMapping | undefined> {
    return this.arSizeMappingsMap.get(id);
  }
  async getArSizeMappingBySize(websiteSize: string): Promise<ArSizeMapping | undefined> {
    return Array.from(this.arSizeMappingsMap.values()).find(m => m.websiteSize.toLowerCase() === websiteSize.toLowerCase());
  }
  async createArSizeMapping(mapping: InsertArSizeMapping): Promise<ArSizeMapping> {
    const id = randomUUID();
    const now = new Date();
    const newMapping: ArSizeMapping = {
      id,
      ...mapping,
      isActive: mapping.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.arSizeMappingsMap.set(id, newMapping);
    return newMapping;
  }
  async updateArSizeMapping(id: string, updates: Partial<ArSizeMapping>): Promise<ArSizeMapping | undefined> {
    const existing = this.arSizeMappingsMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.arSizeMappingsMap.set(id, updated);
    return updated;
  }
  async deleteArSizeMapping(id: string): Promise<boolean> {
    return this.arSizeMappingsMap.delete(id);
  }

  // AR Analytics (stub for MemStorage - not used in production)
  private arAnalyticsEvents: ArAnalytics[] = [];
  
  async createArAnalyticsEvent(event: InsertArAnalytics): Promise<ArAnalytics> {
    const newEvent: ArAnalytics = {
      id: randomUUID(),
      ...event,
      createdAt: new Date(),
    };
    this.arAnalyticsEvents.push(newEvent);
    return newEvent;
  }
  
  async getArAnalytics(days: number): Promise<ArAnalytics[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return this.arAnalyticsEvents.filter(e => e.createdAt >= cutoff);
  }
  
  async getArAnalyticsSummary(days: number, dateFilter?: { start: Date; end: Date } | null): Promise<{
    totalEvents: number;
    uniqueSessions: number;
    byPlatform: { platform: string; count: number }[];
    byEventType: { eventType: string; count: number }[];
    topProducts: { productTitle: string; count: number }[];
    dailyTrend: { date: string; count: number }[];
    byCountry: { country: string; countryCode: string; count: number }[];
    byFrame: { frame: string; frameType: string; count: number }[];
    bySize: { size: string; count: number }[];
    qrScans: number;
    completionRate: number;
    avgGenerationTimeMs: number | null;
  }> {
    // Note: MemStorage doesn't support dateFilter, just uses days
    const events = await this.getArAnalytics(days);
    const launchEvents = events.filter(e => e.eventType.startsWith('ar_launch_'));
    const sessions = new Set(launchEvents.map(e => e.sessionId).filter(Boolean));
    
    const platformCounts: Record<string, number> = {};
    const eventTypeCounts: Record<string, number> = {};
    const productCounts: Record<string, number> = {};
    const dateCounts: Record<string, number> = {};
    const countryCounts: Record<string, { country: string; countryCode: string; count: number }> = {};
    const frameCounts: Record<string, { frame: string; frameType: string; count: number }> = {};
    const sizeCounts: Record<string, number> = {};
    
    let genTimeTotal = 0;
    let genTimeCount = 0;
    
    for (const e of launchEvents) {
      if (e.platform) platformCounts[e.platform] = (platformCounts[e.platform] || 0) + 1;
      if (e.productTitle) productCounts[e.productTitle] = (productCounts[e.productTitle] || 0) + 1;
      const dateKey = e.createdAt.toISOString().split('T')[0];
      dateCounts[dateKey] = (dateCounts[dateKey] || 0) + 1;
      if (e.country) {
        if (!countryCounts[e.country]) {
          countryCounts[e.country] = { country: e.country, countryCode: e.countryCode || '', count: 0 };
        }
        countryCounts[e.country].count++;
      }
      if (e.generationTimeMs) {
        genTimeTotal += e.generationTimeMs;
        genTimeCount++;
      }
      // Track frame styles
      if (e.frame) {
        const frameKey = `${e.frame}|${e.frameType || 'standard'}`;
        if (!frameCounts[frameKey]) {
          frameCounts[frameKey] = { frame: e.frame, frameType: e.frameType || 'standard', count: 0 };
        }
        frameCounts[frameKey].count++;
      }
      // Track sizes
      if (e.size) {
        sizeCounts[e.size] = (sizeCounts[e.size] || 0) + 1;
      }
    }
    
    for (const e of events) {
      eventTypeCounts[e.eventType] = (eventTypeCounts[e.eventType] || 0) + 1;
    }
    
    // Count QR scan page loads
    const qrScans = events.filter(e => e.eventType === 'qr_scan_page_load').length;
    
    const buttonClicks = events.filter(e => e.eventType === 'ar_button_click').length;
    const completionRate = buttonClicks > 0 ? Math.round((launchEvents.length / buttonClicks) * 100) : 0;
    
    return {
      totalEvents: launchEvents.length,
      uniqueSessions: sessions.size,
      byPlatform: Object.entries(platformCounts).map(([platform, count]) => ({ platform, count })),
      byEventType: Object.entries(eventTypeCounts).map(([eventType, count]) => ({ eventType, count })),
      topProducts: Object.entries(productCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([productTitle, count]) => ({ productTitle, count })),
      dailyTrend: Object.entries(dateCounts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, count]) => ({ date, count })),
      byCountry: Object.values(countryCounts).sort((a, b) => b.count - a.count).slice(0, 15),
      byFrame: Object.values(frameCounts).sort((a, b) => b.count - a.count).slice(0, 10),
      bySize: Object.entries(sizeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([size, count]) => ({ size, count })),
      qrScans,
      completionRate,
      avgGenerationTimeMs: genTimeCount > 0 ? Math.round(genTimeTotal / genTimeCount) : null,
    };
  }
  
  // AR Conversions (MemStorage stub implementations)
  private arConversionsData: ArConversion[] = [];
  
  async createArConversion(conversion: InsertArConversion): Promise<ArConversion> {
    const newConversion: ArConversion = {
      id: randomUUID(),
      ...conversion,
      orderId: conversion.orderId,
      orderNumber: conversion.orderNumber ?? null,
      orderTotal: conversion.orderTotal ?? null,
      currency: conversion.currency ?? 'GBP',
      productHandle: conversion.productHandle,
      productTitle: conversion.productTitle ?? null,
      productId: conversion.productId ?? null,
      variantId: conversion.variantId ?? null,
      quantity: conversion.quantity ?? 1,
      lineItemPrice: conversion.lineItemPrice ?? null,
      sessionId: conversion.sessionId ?? null,
      arEventId: conversion.arEventId ?? null,
      platform: conversion.platform ?? null,
      timeBetweenArAndPurchase: conversion.timeBetweenArAndPurchase ?? null,
      customerEmail: conversion.customerEmail ?? null,
      shopDomain: conversion.shopDomain ?? null,
      createdAt: new Date(),
    };
    this.arConversionsData.push(newConversion);
    return newConversion;
  }
  
  async getArConversions(days: number): Promise<ArConversion[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return this.arConversionsData.filter(c => c.createdAt >= cutoff);
  }
  
  async findArSessionForProduct(productHandle: string, lookbackMinutes: number = 60): Promise<ArAnalytics | null> {
    const cutoff = new Date();
    cutoff.setMinutes(cutoff.getMinutes() - lookbackMinutes);
    
    const matchingEvents = this.arAnalyticsEvents
      .filter(e => e.productHandle === productHandle && e.createdAt >= cutoff)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    return matchingEvents[0] || null;
  }
  
  async findArSessionBySessionId(sessionId: string, productHandle: string): Promise<ArAnalytics | null> {
    const matchingEvents = this.arAnalyticsEvents
      .filter(e => e.sessionId === sessionId && e.productHandle === productHandle && e.eventType.startsWith('ar_launch_'))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    return matchingEvents[0] || null;
  }
  
  async getArConversionStats(days: number, dateFilter?: { start: Date; end: Date } | null): Promise<{
    totalConversions: number;
    totalRevenue: number;
    conversionRate: number;
    avgTimeToPurchase: number;
    byPlatform: { platform: string; conversions: number; revenue: number }[];
    topConvertingProducts: { productHandle: string; productTitle: string; conversions: number; revenue: number }[];
  }> {
    // Note: MemStorage doesn't support dateFilter, just uses days
    const conversions = await this.getArConversions(days);
    const arEvents = await this.getArAnalytics(days);
    
    const totalRevenue = conversions.reduce((sum, c) => sum + (parseFloat(c.lineItemPrice || '0') || 0), 0);
    const totalArViews = arEvents.filter(e => e.eventType.startsWith('ar_launch_')).length;
    const conversionRate = totalArViews > 0 ? (conversions.length / totalArViews) * 100 : 0;
    
    const timesWithValue = conversions.filter(c => c.timeBetweenArAndPurchase).map(c => c.timeBetweenArAndPurchase!);
    const avgTimeToPurchase = timesWithValue.length > 0 ? timesWithValue.reduce((a, b) => a + b, 0) / timesWithValue.length : 0;
    
    const platformStats: Record<string, { conversions: number; revenue: number }> = {};
    const productStats: Record<string, { title: string; conversions: number; revenue: number }> = {};
    
    for (const c of conversions) {
      const platform = c.platform || 'unknown';
      if (!platformStats[platform]) platformStats[platform] = { conversions: 0, revenue: 0 };
      platformStats[platform].conversions++;
      platformStats[platform].revenue += parseFloat(c.lineItemPrice || '0') || 0;
      
      if (!productStats[c.productHandle]) productStats[c.productHandle] = { title: c.productTitle || c.productHandle, conversions: 0, revenue: 0 };
      productStats[c.productHandle].conversions++;
      productStats[c.productHandle].revenue += parseFloat(c.lineItemPrice || '0') || 0;
    }
    
    return {
      totalConversions: conversions.length,
      totalRevenue,
      conversionRate,
      avgTimeToPurchase,
      byPlatform: Object.entries(platformStats).map(([platform, stats]) => ({ platform, ...stats })),
      topConvertingProducts: Object.entries(productStats)
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, 10)
        .map(([productHandle, stats]) => ({ productHandle, productTitle: stats.title, ...stats })),
    };
  }

  // Product Add-ons (MemStorage stub implementations)
  private productAddonsMap = new Map<string, ProductAddon>();
  private addonVariantsMap = new Map<string, AddonVariant>();

  async getAllProductAddons(): Promise<ProductAddon[]> {
    return Array.from(this.productAddonsMap.values()).filter(a => a.isActive);
  }
  async getProductAddon(id: string): Promise<ProductAddon | undefined> {
    return this.productAddonsMap.get(id);
  }
  async getProductAddonBySlug(slug: string): Promise<ProductAddon | undefined> {
    return Array.from(this.productAddonsMap.values()).find(a => a.slug === slug);
  }
  async getProductAddonWithVariants(id: string): Promise<(ProductAddon & { variants: AddonVariant[] }) | undefined> {
    const addon = await this.getProductAddon(id);
    if (!addon) return undefined;
    const variants = await this.getAddonVariants(id);
    return { ...addon, variants };
  }
  async createProductAddon(addon: InsertProductAddon): Promise<ProductAddon> {
    const id = randomUUID();
    const now = new Date();
    const newAddon: ProductAddon = { ...addon, id, createdAt: now, updatedAt: now, isActive: addon.isActive ?? true, displayOrder: addon.displayOrder ?? 0, conditionLogic: addon.conditionLogic ?? 'all' };
    this.productAddonsMap.set(id, newAddon);
    return newAddon;
  }
  async updateProductAddon(id: string, updates: Partial<ProductAddon>): Promise<ProductAddon | undefined> {
    const existing = this.productAddonsMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.productAddonsMap.set(id, updated);
    return updated;
  }
  async deleteProductAddon(id: string): Promise<boolean> {
    return this.productAddonsMap.delete(id);
  }

  async getAddonVariants(addonId: string): Promise<AddonVariant[]> {
    return Array.from(this.addonVariantsMap.values()).filter(v => v.addonId === addonId && v.isActive);
  }
  async getAllAddonVariants(): Promise<AddonVariant[]> {
    return Array.from(this.addonVariantsMap.values()).filter(v => v.isActive);
  }
  async getAddonVariant(id: string): Promise<AddonVariant | undefined> {
    return this.addonVariantsMap.get(id);
  }
  async createAddonVariant(variant: InsertAddonVariant): Promise<AddonVariant> {
    const id = randomUUID();
    const now = new Date();
    const newVariant: AddonVariant = { ...variant, id, createdAt: now, updatedAt: now, isActive: variant.isActive ?? true, displayOrder: variant.displayOrder ?? 0, currency: variant.currency ?? 'GBP' };
    this.addonVariantsMap.set(id, newVariant);
    return newVariant;
  }
  async updateAddonVariant(id: string, updates: Partial<AddonVariant>): Promise<AddonVariant | undefined> {
    const existing = this.addonVariantsMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.addonVariantsMap.set(id, updated);
    return updated;
  }
  async deleteAddonVariant(id: string): Promise<boolean> {
    return this.addonVariantsMap.delete(id);
  }

  // Addon Variant Images - stub implementations for MemStorage
  private addonVariantImagesMap = new Map<string, AddonVariantImage>();

  async getAddonVariantImages(variantId: string): Promise<AddonVariantImage[]> {
    return Array.from(this.addonVariantImagesMap.values()).filter(i => i.variantId === variantId);
  }
  async getAddonVariantImage(variantId: string, frameType: string | null): Promise<AddonVariantImage | undefined> {
    return Array.from(this.addonVariantImagesMap.values()).find(
      i => i.variantId === variantId && i.frameType === frameType
    );
  }
  async createAddonVariantImage(image: InsertAddonVariantImage): Promise<AddonVariantImage> {
    const id = randomUUID();
    const now = new Date();
    const newImage: AddonVariantImage = { ...image, id, createdAt: now, updatedAt: now, displayOrder: image.displayOrder ?? 0 };
    this.addonVariantImagesMap.set(id, newImage);
    return newImage;
  }
  async updateAddonVariantImage(id: string, updates: Partial<AddonVariantImage>): Promise<AddonVariantImage | undefined> {
    const existing = this.addonVariantImagesMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.addonVariantImagesMap.set(id, updated);
    return updated;
  }
  async deleteAddonVariantImage(id: string): Promise<boolean> {
    return this.addonVariantImagesMap.delete(id);
  }
  async upsertAddonVariantImage(image: InsertAddonVariantImage): Promise<AddonVariantImage> {
    const existing = await this.getAddonVariantImage(image.variantId, image.frameType ?? null);
    if (existing) {
      return this.updateAddonVariantImage(existing.id, image) as Promise<AddonVariantImage>;
    }
    return this.createAddonVariantImage(image);
  }

  // NEW: Addon Option Sets - stub implementations for MemStorage
  private addonOptionSetsMap = new Map<string, AddonOptionSet>();
  private addonGroupsMap = new Map<string, AddonGroup>();

  async getAllAddonOptionSets(): Promise<AddonOptionSet[]> {
    return Array.from(this.addonOptionSetsMap.values()).filter(os => os.isActive);
  }
  async getAddonOptionSet(id: string): Promise<AddonOptionSet | undefined> {
    return this.addonOptionSetsMap.get(id);
  }
  async getAddonOptionSetsByCountry(country: string): Promise<AddonOptionSet[]> {
    return Array.from(this.addonOptionSetsMap.values()).filter(os => 
      os.isActive && (!os.allowedCountries || os.allowedCountries.length === 0 || os.allowedCountries.includes(country))
    );
  }

  // NEW: Addon Groups - stub implementations for MemStorage
  async getAllAddonGroups(): Promise<AddonGroup[]> {
    return Array.from(this.addonGroupsMap.values()).filter(g => g.isActive);
  }
  async getAddonGroup(id: string): Promise<AddonGroup | undefined> {
    return this.addonGroupsMap.get(id);
  }
  async getAddonGroupsByOptionSet(optionSetId: string): Promise<AddonGroup[]> {
    return Array.from(this.addonGroupsMap.values()).filter(g => g.optionSetId === optionSetId && g.isActive);
  }
  async getAddonVariantsByGroup(groupId: string): Promise<AddonVariant[]> {
    return Array.from(this.addonVariantsMap.values()).filter(v => v.groupId === groupId && v.isActive);
  }

  async createAddonOptionSet(optionSet: InsertAddonOptionSet): Promise<AddonOptionSet> {
    const id = optionSet.id || randomUUID();
    const newOptionSet: AddonOptionSet = {
      ...optionSet,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: optionSet.isActive ?? true,
      displayOrder: optionSet.displayOrder ?? 0,
      allowedCountries: optionSet.allowedCountries ?? [],
    };
    this.addonOptionSetsMap.set(id, newOptionSet);
    return newOptionSet;
  }

  async updateAddonOptionSet(id: string, updates: Partial<AddonOptionSet>): Promise<AddonOptionSet | undefined> {
    const existing = this.addonOptionSetsMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.addonOptionSetsMap.set(id, updated);
    return updated;
  }

  async deleteAddonOptionSet(id: string): Promise<boolean> {
    return this.addonOptionSetsMap.delete(id);
  }

  async createAddonGroup(group: InsertAddonGroup): Promise<AddonGroup> {
    const id = group.id || randomUUID();
    const newGroup: AddonGroup = {
      ...group,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: group.isActive ?? true,
      displayOrder: group.displayOrder ?? 0,
      description: group.description ?? null,
      imageUrl: group.imageUrl ?? null,
      shopifyProductId: group.shopifyProductId ?? null,
      shopifyProductHandle: group.shopifyProductHandle ?? null,
      displayConditions: group.displayConditions ?? null,
      conditionLogic: group.conditionLogic ?? 'any',
    };
    this.addonGroupsMap.set(id, newGroup);
    return newGroup;
  }

  async updateAddonGroup(id: string, updates: Partial<AddonGroup>): Promise<AddonGroup | undefined> {
    const existing = this.addonGroupsMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.addonGroupsMap.set(id, updated);
    return updated;
  }

  async deleteAddonGroup(id: string): Promise<boolean> {
    return this.addonGroupsMap.delete(id);
  }
}

import { DbStorage } from "./dbStorage";

// Initialize storage with schema validation
async function initializeStorage() {
  if (process.env.DATABASE_URL) {
    const dbStorage = new DbStorage();
    const isValid = await dbStorage.verifySchema();
    if (isValid) {
      console.log("[storage] Using PostgreSQL database");
      return dbStorage;
    } else {
      console.warn("[storage] Database schema not ready, falling back to in-memory storage");
      console.warn("[storage] Run 'npm run db:push' to create database tables");
      return new MemStorage();
    }
  }
  console.log("[storage] Using in-memory storage");
  return new MemStorage();
}

export const storagePromise = initializeStorage();
export let storage: IStorage;

// Set storage once initialized
storagePromise.then(s => {
  storage = s;
});
