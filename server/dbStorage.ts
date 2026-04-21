import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq, desc, and, lte, gte, sql, count, countDistinct, isNull, like, or } from "drizzle-orm";
import ws from "ws";
import {
  artworks,
  templates,
  mockups,
  variantConfigs,
  exportBatches,
  jobs,
  formSettings,
  userFeedback,
  coaLayouts,
  emailTemplates,
  artistAccounts,
  artistSales,
  processedOrders,
  payoutBatches,
  payoutItems,
  commissionSettings,
  contractSettings,
  signedContracts,
  formDefinitions,
  formFields,
  formSubmissions,
  scheduledEmails,
  pendingMockups,
  onboardingInvitations,
  creators,
  creatorContracts,
  creatorContents,
  creatorInvoices,
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
  type Job,
  type InsertJob,
  type FormSettings,
  type InsertFormSettings,
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
  type InsertCreatorContract,
  type CreatorContent,
  type InsertCreatorContent,
  type CreatorInvoice,
  type InsertCreatorInvoice,
  type ContractTemplateDefaults,
  type InsertContractTemplateDefaults,
  type ContractSectionPreset,
  type ArSizeMapping,
  type InsertArSizeMapping,
  type ArAnalytics,
  type InsertArAnalytics,
  type ArConversion,
  type InsertArConversion,
  type InsertContractSectionPreset,
  type MockupSettings,
  type InsertMockupSettings,
  type ProductAddon,
  type InsertProductAddon,
  type AddonVariant,
  type InsertAddonVariant,
  type AddonVariantImage,
  type InsertAddonVariantImage,
  mockupSettings,
  contractTemplateDefaults,
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
import type { IStorage } from "./storage";

// Configure WebSocket for Neon serverless driver (required for Node.js <22)
neonConfig.webSocketConstructor = ws;

export class DbStorage implements IStorage {
  private db;

  constructor() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
    this.db = drizzle(pool);
  }

  // Verify that required database tables exist
  async verifySchema(): Promise<boolean> {
    try {
      // Test query to ensure all tables exist
      await this.db.select().from(artworks).limit(1);
      await this.db.select().from(templates).limit(1);
      await this.db.select().from(mockups).limit(1);
      await this.db.select().from(exportBatches).limit(1);
      await this.db.select().from(jobs).limit(1);
      await this.db.select().from(formSettings).limit(1);
      return true;
    } catch (error) {
      console.error("Database schema verification failed:", error);
      return false;
    }
  }

  // Artworks
  async getAllArtworks(): Promise<Artwork[]> {
    return await this.db
      .select()
      .from(artworks)
      .orderBy(desc(artworks.createdAt));
  }

  async getArtwork(id: string): Promise<Artwork | undefined> {
    const results = await this.db
      .select()
      .from(artworks)
      .where(eq(artworks.id, id))
      .limit(1);
    return results[0];
  }

  async getArtworksByArtistName(vendorName: string): Promise<Artwork[]> {
    return await this.db
      .select()
      .from(artworks)
      .where(or(eq(artworks.artistName, vendorName), eq(artworks.vendor, vendorName)))
      .orderBy(desc(artworks.createdAt));
  }

  async createArtwork(artwork: InsertArtwork): Promise<Artwork> {
    const results = await this.db
      .insert(artworks)
      .values(artwork)
      .returning();
    return results[0];
  }

  async updateArtwork(id: string, updates: Partial<Artwork>): Promise<Artwork | undefined> {
    const results = await this.db
      .update(artworks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(artworks.id, id))
      .returning();
    return results[0];
  }

  async deleteArtwork(id: string): Promise<boolean> {
    const results = await this.db
      .delete(artworks)
      .where(eq(artworks.id, id))
      .returning();
    return results.length > 0;
  }

  async groupArtworks(artworkIds: string[], primaryId: string): Promise<void> {
    const groupId = crypto.randomUUID();
    
    // Update all artworks in the group
    for (const id of artworkIds) {
      await this.db
        .update(artworks)
        .set({
          groupId,
          isGroupPrimary: id === primaryId,
          updatedAt: new Date(),
        })
        .where(eq(artworks.id, id));
    }
  }

  async ungroupArtworks(artworkIds: string[]): Promise<void> {
    for (const id of artworkIds) {
      await this.db
        .update(artworks)
        .set({
          groupId: null,
          isGroupPrimary: false,
          updatedAt: new Date(),
        })
        .where(eq(artworks.id, id));
    }
  }

  // Templates
  async getAllTemplates(): Promise<Template[]> {
    return await this.db
      .select()
      .from(templates)
      .orderBy(desc(templates.createdAt));
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    const results = await this.db
      .select()
      .from(templates)
      .where(eq(templates.id, id))
      .limit(1);
    return results[0];
  }

  async createTemplate(template: InsertTemplate): Promise<Template> {
    const results = await this.db
      .insert(templates)
      .values(template)
      .returning();
    return results[0];
  }

  async updateTemplate(id: string, updates: Partial<Template>): Promise<Template | undefined> {
    const results = await this.db
      .update(templates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(templates.id, id))
      .returning();
    return results[0];
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const results = await this.db
      .delete(templates)
      .where(eq(templates.id, id))
      .returning();
    return results.length > 0;
  }

  // Mockups
  async getAllMockups(): Promise<Mockup[]> {
    return await this.db
      .select()
      .from(mockups)
      .orderBy(desc(mockups.createdAt));
  }

  async getMockup(id: string): Promise<Mockup | undefined> {
    const results = await this.db
      .select()
      .from(mockups)
      .where(eq(mockups.id, id))
      .limit(1);
    return results[0];
  }

  async getMockupsByArtwork(artworkId: string): Promise<Mockup[]> {
    return await this.db
      .select()
      .from(mockups)
      .where(eq(mockups.artworkId, artworkId))
      .orderBy(desc(mockups.createdAt));
  }

  async getMockupsByTemplate(templateId: string): Promise<Mockup[]> {
    return await this.db
      .select()
      .from(mockups)
      .where(eq(mockups.templateId, templateId))
      .orderBy(desc(mockups.createdAt));
  }

  async createMockup(mockup: InsertMockup): Promise<Mockup> {
    const results = await this.db
      .insert(mockups)
      .values(mockup)
      .returning();
    return results[0];
  }

  async updateMockup(id: string, updates: Partial<Mockup>): Promise<Mockup | undefined> {
    const results = await this.db
      .update(mockups)
      .set(updates)
      .where(eq(mockups.id, id))
      .returning();
    return results[0] || undefined;
  }

  async deleteMockup(id: string): Promise<boolean> {
    const results = await this.db
      .delete(mockups)
      .where(eq(mockups.id, id))
      .returning();
    return results.length > 0;
  }

  // Mockup Settings
  async getMockupSettingsForArtwork(artworkId: string): Promise<MockupSettings[]> {
    return await this.db
      .select()
      .from(mockupSettings)
      .where(eq(mockupSettings.artworkId, artworkId));
  }

  async getMockupSettingsForTemplate(templateId: string): Promise<MockupSettings[]> {
    return await this.db
      .select()
      .from(mockupSettings)
      .where(eq(mockupSettings.templateId, templateId));
  }

  async getMockupSetting(artworkId: string, templateId: string, zoneId: string): Promise<MockupSettings | undefined> {
    const results = await this.db
      .select()
      .from(mockupSettings)
      .where(
        and(
          eq(mockupSettings.artworkId, artworkId),
          eq(mockupSettings.templateId, templateId),
          eq(mockupSettings.zoneId, zoneId)
        )
      );
    return results[0];
  }

  async upsertMockupSettings(settings: InsertMockupSettings): Promise<MockupSettings> {
    const existing = await this.getMockupSetting(settings.artworkId, settings.templateId, settings.zoneId);
    
    if (existing) {
      const results = await this.db
        .update(mockupSettings)
        .set({
          ...settings,
          updatedAt: new Date(),
        })
        .where(eq(mockupSettings.id, existing.id))
        .returning();
      return results[0];
    }

    const results = await this.db
      .insert(mockupSettings)
      .values(settings)
      .returning();
    return results[0];
  }

  async deleteMockupSettings(id: string): Promise<boolean> {
    const results = await this.db
      .delete(mockupSettings)
      .where(eq(mockupSettings.id, id))
      .returning();
    return results.length > 0;
  }

  // Pending Mockups
  async getAllPendingMockups(): Promise<PendingMockup[]> {
    return await this.db
      .select()
      .from(pendingMockups)
      .orderBy(desc(pendingMockups.createdAt));
  }

  async getPendingMockup(id: string): Promise<PendingMockup | undefined> {
    const results = await this.db
      .select()
      .from(pendingMockups)
      .where(eq(pendingMockups.id, id))
      .limit(1);
    return results[0];
  }

  async getPendingMockupByPath(dropboxPath: string): Promise<PendingMockup | undefined> {
    const results = await this.db
      .select()
      .from(pendingMockups)
      .where(eq(pendingMockups.dropboxPath, dropboxPath))
      .limit(1);
    return results[0];
  }

  async getUnassignedPendingMockups(): Promise<PendingMockup[]> {
    return await this.db
      .select()
      .from(pendingMockups)
      .where(eq(pendingMockups.status, 'unassigned'))
      .orderBy(desc(pendingMockups.createdAt));
  }

  async createPendingMockup(mockup: InsertPendingMockup): Promise<PendingMockup> {
    const results = await this.db
      .insert(pendingMockups)
      .values(mockup)
      .returning();
    return results[0];
  }

  async updatePendingMockup(id: string, updates: Partial<PendingMockup>): Promise<PendingMockup | undefined> {
    const results = await this.db
      .update(pendingMockups)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(pendingMockups.id, id))
      .returning();
    return results[0];
  }

  async deletePendingMockup(id: string): Promise<boolean> {
    const results = await this.db
      .delete(pendingMockups)
      .where(eq(pendingMockups.id, id))
      .returning();
    return results.length > 0;
  }

  // Variant Configurations
  async getAllVariantConfigs(): Promise<VariantConfig[]> {
    return await this.db
      .select()
      .from(variantConfigs)
      .orderBy(desc(variantConfigs.createdAt));
  }

  async getVariantConfig(id: string): Promise<VariantConfig | undefined> {
    const results = await this.db
      .select()
      .from(variantConfigs)
      .where(eq(variantConfigs.id, id))
      .limit(1);
    return results[0];
  }

  async getVariantConfigByOptions(printSize: string, frameOption: string): Promise<VariantConfig | undefined> {
    const results = await this.db
      .select()
      .from(variantConfigs)
      .where(and(
        eq(variantConfigs.printSize, printSize),
        eq(variantConfigs.frameOption, frameOption)
      ))
      .limit(1);
    return results[0];
  }

  async createVariantConfig(config: InsertVariantConfig): Promise<VariantConfig> {
    const results = await this.db
      .insert(variantConfigs)
      .values(config)
      .returning();
    return results[0];
  }

  async updateVariantConfig(id: string, updates: Partial<VariantConfig>): Promise<VariantConfig | undefined> {
    const results = await this.db
      .update(variantConfigs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(variantConfigs.id, id))
      .returning();
    return results[0];
  }

  async deleteVariantConfig(id: string): Promise<boolean> {
    const results = await this.db
      .delete(variantConfigs)
      .where(eq(variantConfigs.id, id))
      .returning();
    return results.length > 0;
  }

  // Export Batches
  async getAllExportBatches(): Promise<ExportBatch[]> {
    return await this.db
      .select()
      .from(exportBatches)
      .orderBy(desc(exportBatches.createdAt));
  }

  async getExportBatch(id: string): Promise<ExportBatch | undefined> {
    const results = await this.db
      .select()
      .from(exportBatches)
      .where(eq(exportBatches.id, id))
      .limit(1);
    return results[0];
  }

  async createExportBatch(batch: InsertExportBatch): Promise<ExportBatch> {
    const results = await this.db
      .insert(exportBatches)
      .values(batch)
      .returning();
    return results[0];
  }

  async updateExportBatch(id: string, updates: Partial<ExportBatch>): Promise<ExportBatch | undefined> {
    const results = await this.db
      .update(exportBatches)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(exportBatches.id, id))
      .returning();
    return results[0];
  }

  async deleteExportBatch(id: string): Promise<boolean> {
    const results = await this.db
      .delete(exportBatches)
      .where(eq(exportBatches.id, id))
      .returning();
    return results.length > 0;
  }

  // Jobs
  async getAllJobs(): Promise<Job[]> {
    return await this.db
      .select()
      .from(jobs)
      .orderBy(desc(jobs.createdAt));
  }

  async getJob(id: string): Promise<Job | undefined> {
    const results = await this.db
      .select()
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);
    return results[0];
  }

  async getPendingJobs(): Promise<Job[]> {
    return await this.db
      .select()
      .from(jobs)
      .where(eq(jobs.status, "pending"))
      .orderBy(jobs.createdAt);
  }

  async claimNextPendingJob(): Promise<Job | undefined> {
    // Atomically claim oldest pending job in single query
    // This prevents race conditions between multiple workers
    try {
      // Use raw SQL for truly atomic operation
      const results = await this.db.execute(sql`
        UPDATE ${jobs}
        SET status = 'processing', progress = 0, updated_at = NOW()
        WHERE id = (
          SELECT id FROM ${jobs}
          WHERE status = 'pending'
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `);
      
      return results.rows[0] as Job | undefined;
    } catch (error) {
      console.error("[DbStorage] Failed to claim job:", error);
      return undefined;
    }
  }

  async createJob(job: InsertJob): Promise<Job> {
    const results = await this.db
      .insert(jobs)
      .values(job)
      .returning();
    return results[0];
  }

  async updateJobStatus(id: string, status: string, progress?: number): Promise<Job | undefined> {
    const updates: any = { status, updatedAt: new Date() };
    if (progress !== undefined) {
      updates.progress = progress;
    }
    
    const results = await this.db
      .update(jobs)
      .set(updates)
      .where(eq(jobs.id, id))
      .returning();
    return results[0];
  }

  async updateJobResult(id: string, result: { mockupIds?: string[], error?: string }): Promise<Job | undefined> {
    const results = await this.db
      .update(jobs)
      .set({ result, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    return results[0];
  }

  async deleteJob(id: string): Promise<boolean> {
    const results = await this.db
      .delete(jobs)
      .where(eq(jobs.id, id))
      .returning();
    return results.length > 0;
  }

  // Form Settings (singleton)
  async getFormSettings(): Promise<FormSettings | undefined> {
    const results = await this.db
      .select()
      .from(formSettings)
      .limit(1);
    return results[0];
  }

  async createFormSettings(settings: InsertFormSettings): Promise<FormSettings> {
    const results = await this.db
      .insert(formSettings)
      .values(settings)
      .returning();
    return results[0];
  }

  async updateFormSettings(id: string, updates: Partial<FormSettings>): Promise<FormSettings | undefined> {
    const results = await this.db
      .update(formSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(formSettings.id, id))
      .returning();
    return results[0];
  }

  // User Feedback
  async getAllUserFeedback(): Promise<UserFeedback[]> {
    return await this.db
      .select()
      .from(userFeedback)
      .orderBy(desc(userFeedback.createdAt));
  }

  async createUserFeedback(feedback: InsertUserFeedback): Promise<UserFeedback> {
    const results = await this.db
      .insert(userFeedback)
      .values(feedback)
      .returning();
    return results[0];
  }

  // COA Layouts
  async getAllCOALayouts(): Promise<COALayout[]> {
    return await this.db
      .select()
      .from(coaLayouts)
      .orderBy(desc(coaLayouts.createdAt));
  }

  async getCOALayout(id: string): Promise<COALayout | undefined> {
    const results = await this.db
      .select()
      .from(coaLayouts)
      .where(eq(coaLayouts.id, id))
      .limit(1);
    return results[0];
  }

  async getDefaultCOALayout(): Promise<COALayout | undefined> {
    const results = await this.db
      .select()
      .from(coaLayouts)
      .where(eq(coaLayouts.isDefault, true))
      .limit(1);
    return results[0];
  }

  async createCOALayout(layout: InsertCOALayout): Promise<COALayout> {
    const results = await this.db
      .insert(coaLayouts)
      .values(layout)
      .returning();
    return results[0];
  }

  async updateCOALayout(id: string, updates: Partial<COALayout>): Promise<COALayout | undefined> {
    const results = await this.db
      .update(coaLayouts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(coaLayouts.id, id))
      .returning();
    return results[0];
  }

  async deleteCOALayout(id: string): Promise<boolean> {
    const results = await this.db
      .delete(coaLayouts)
      .where(eq(coaLayouts.id, id))
      .returning();
    return results.length > 0;
  }

  async setDefaultCOALayout(id: string): Promise<COALayout | undefined> {
    // Unset current default
    await this.db
      .update(coaLayouts)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(coaLayouts.isDefault, true));

    // Set new default
    const results = await this.db
      .update(coaLayouts)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(coaLayouts.id, id))
      .returning();
    return results[0];
  }

  // Email Templates
  async getAllEmailTemplates(): Promise<EmailTemplate[]> {
    return await this.db
      .select()
      .from(emailTemplates)
      .orderBy(desc(emailTemplates.createdAt));
  }

  async getEmailTemplate(id: string): Promise<EmailTemplate | undefined> {
    const results = await this.db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.id, id))
      .limit(1);
    return results[0];
  }

  async getEmailTemplateByKey(templateKey: string): Promise<EmailTemplate | undefined> {
    const results = await this.db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.templateKey, templateKey))
      .limit(1);
    return results[0];
  }

  async createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate> {
    const results = await this.db
      .insert(emailTemplates)
      .values(template)
      .returning();
    return results[0];
  }

  async updateEmailTemplate(id: string, updates: Partial<EmailTemplate>): Promise<EmailTemplate | undefined> {
    const results = await this.db
      .update(emailTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(emailTemplates.id, id))
      .returning();
    return results[0];
  }

  async deleteEmailTemplate(id: string): Promise<boolean> {
    const results = await this.db
      .delete(emailTemplates)
      .where(eq(emailTemplates.id, id))
      .returning();
    return results.length > 0;
  }

  // Artist Accounts
  async getAllArtistAccounts(): Promise<ArtistAccount[]> {
    return await this.db
      .select()
      .from(artistAccounts)
      .orderBy(desc(artistAccounts.createdAt));
  }

  async getArtistAccount(id: string): Promise<ArtistAccount | undefined> {
    const results = await this.db
      .select()
      .from(artistAccounts)
      .where(eq(artistAccounts.id, id))
      .limit(1);
    return results[0];
  }

  async getArtistAccountByVendor(vendorName: string): Promise<ArtistAccount | undefined> {
    const results = await this.db
      .select()
      .from(artistAccounts)
      .where(eq(artistAccounts.vendorName, vendorName))
      .limit(1);
    return results[0];
  }

  async getArtistAccountByReplitUserId(replitUserId: string): Promise<ArtistAccount | undefined> {
    const results = await this.db
      .select()
      .from(artistAccounts)
      .where(eq(artistAccounts.replitUserId, replitUserId))
      .limit(1);
    return results[0];
  }

  async getArtistAccountBySupabaseUserId(supabaseUserId: string): Promise<ArtistAccount | undefined> {
    const results = await this.db
      .select()
      .from(artistAccounts)
      .where(eq(artistAccounts.supabaseUserId, supabaseUserId))
      .limit(1);
    return results[0];
  }

  async getArtistAccountByEmail(email: string): Promise<ArtistAccount | undefined> {
    const results = await this.db
      .select()
      .from(artistAccounts)
      .where(eq(artistAccounts.primaryEmail, email.toLowerCase()))
      .limit(1);
    return results[0];
  }

  async getArtistAccountByToken(token: string): Promise<ArtistAccount | undefined> {
    const results = await this.db
      .select()
      .from(artistAccounts)
      .where(eq(artistAccounts.invitationToken, token))
      .limit(1);
    return results[0];
  }

  async createArtistAccount(account: InsertArtistAccount): Promise<ArtistAccount> {
    const results = await this.db
      .insert(artistAccounts)
      .values(account)
      .returning();
    return results[0];
  }

  async updateArtistAccount(id: string, updates: Partial<ArtistAccount>): Promise<ArtistAccount | undefined> {
    const results = await this.db
      .update(artistAccounts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(artistAccounts.id, id))
      .returning();
    return results[0];
  }

  async deleteArtistAccount(id: string): Promise<boolean> {
    const results = await this.db
      .delete(artistAccounts)
      .where(eq(artistAccounts.id, id))
      .returning();
    return results.length > 0;
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
    return await this.db
      .select()
      .from(artistSales)
      .where(eq(artistSales.artistAccountId, artistAccountId))
      .orderBy(desc(artistSales.periodStart));
  }

  async createArtistSales(sales: InsertArtistSales): Promise<ArtistSales> {
    const results = await this.db
      .insert(artistSales)
      .values(sales)
      .returning();
    return results[0];
  }

  async updateArtistSales(id: string, updates: Partial<ArtistSales>): Promise<ArtistSales | undefined> {
    const results = await this.db
      .update(artistSales)
      .set({ ...updates, lastSyncedAt: new Date() })
      .where(eq(artistSales.id, id))
      .returning();
    return results[0];
  }

  // Processed Orders (Webhook Idempotency)
  async isOrderProcessed(orderId: string): Promise<boolean> {
    const results = await this.db
      .select()
      .from(processedOrders)
      .where(eq(processedOrders.id, orderId))
      .limit(1);
    return results.length > 0;
  }

  async markOrderProcessed(orderId: string): Promise<void> {
    await this.db
      .insert(processedOrders)
      .values({ id: orderId })
      .onConflictDoNothing();
  }

  // Payout Batches
  async getAllPayoutBatches(): Promise<PayoutBatch[]> {
    return await this.db
      .select()
      .from(payoutBatches)
      .orderBy(desc(payoutBatches.createdAt));
  }

  async getPayoutBatch(id: string): Promise<PayoutBatch | undefined> {
    const results = await this.db
      .select()
      .from(payoutBatches)
      .where(eq(payoutBatches.id, id));
    return results[0];
  }

  async createPayoutBatch(batch: InsertPayoutBatch): Promise<PayoutBatch> {
    const results = await this.db
      .insert(payoutBatches)
      .values(batch)
      .returning();
    return results[0];
  }

  async updatePayoutBatch(id: string, updates: Partial<PayoutBatch>): Promise<PayoutBatch | undefined> {
    const results = await this.db
      .update(payoutBatches)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(payoutBatches.id, id))
      .returning();
    return results[0];
  }

  async deletePayoutBatch(id: string): Promise<boolean> {
    const results = await this.db
      .delete(payoutBatches)
      .where(eq(payoutBatches.id, id))
      .returning();
    return results.length > 0;
  }

  // Payout Items
  async getPayoutItemsByBatch(batchId: string): Promise<PayoutItem[]> {
    return await this.db
      .select()
      .from(payoutItems)
      .where(eq(payoutItems.batchId, batchId))
      .orderBy(payoutItems.createdAt);
  }

  async getPayoutItemsByArtist(artistAccountId: string): Promise<PayoutItem[]> {
    return await this.db
      .select()
      .from(payoutItems)
      .where(eq(payoutItems.artistAccountId, artistAccountId))
      .orderBy(desc(payoutItems.createdAt));
  }

  async getPayoutItem(id: string): Promise<PayoutItem | undefined> {
    const results = await this.db
      .select()
      .from(payoutItems)
      .where(eq(payoutItems.id, id));
    return results[0];
  }

  async createPayoutItem(item: InsertPayoutItem): Promise<PayoutItem> {
    const results = await this.db
      .insert(payoutItems)
      .values(item)
      .returning();
    return results[0];
  }

  async updatePayoutItem(id: string, updates: Partial<PayoutItem>): Promise<PayoutItem | undefined> {
    const results = await this.db
      .update(payoutItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(payoutItems.id, id))
      .returning();
    return results[0];
  }

  async deletePayoutItem(id: string): Promise<boolean> {
    const results = await this.db
      .delete(payoutItems)
      .where(eq(payoutItems.id, id))
      .returning();
    return results.length > 0;
  }

  // Commission Settings (singleton)
  async getCommissionSettings(): Promise<CommissionSettings | undefined> {
    const results = await this.db
      .select()
      .from(commissionSettings)
      .limit(1);
    return results[0];
  }

  async createCommissionSettings(settings: InsertCommissionSettings): Promise<CommissionSettings> {
    const results = await this.db
      .insert(commissionSettings)
      .values(settings)
      .returning();
    return results[0];
  }

  async updateCommissionSettings(id: string, updates: Partial<CommissionSettings>): Promise<CommissionSettings | undefined> {
    const results = await this.db
      .update(commissionSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(commissionSettings.id, id))
      .returning();
    return results[0];
  }

  // Contract Settings (singleton)
  async getContractSettings(): Promise<ContractSettings | undefined> {
    const results = await this.db
      .select()
      .from(contractSettings)
      .limit(1);
    return results[0];
  }

  async createContractSettings(settings: InsertContractSettings): Promise<ContractSettings> {
    const results = await this.db
      .insert(contractSettings)
      .values(settings)
      .returning();
    return results[0];
  }

  async updateContractSettings(id: string, updates: Partial<ContractSettings>): Promise<ContractSettings | undefined> {
    const results = await this.db
      .update(contractSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(contractSettings.id, id))
      .returning();
    return results[0];
  }

  // Signed Contracts
  async getAllSignedContracts(): Promise<SignedContract[]> {
    return await this.db
      .select()
      .from(signedContracts)
      .orderBy(desc(signedContracts.createdAt));
  }

  async getSignedContract(id: string): Promise<SignedContract | undefined> {
    const results = await this.db
      .select()
      .from(signedContracts)
      .where(eq(signedContracts.id, id))
      .limit(1);
    return results[0];
  }

  async createSignedContract(contract: InsertSignedContract): Promise<SignedContract> {
    const results = await this.db
      .insert(signedContracts)
      .values(contract)
      .returning();
    return results[0];
  }

  async updateSignedContract(id: string, updates: Partial<SignedContract>): Promise<SignedContract | undefined> {
    const results = await this.db
      .update(signedContracts)
      .set(updates)
      .where(eq(signedContracts.id, id))
      .returning();
    return results[0];
  }

  // Form Definitions
  async getAllFormDefinitions(): Promise<FormDefinition[]> {
    return await this.db
      .select()
      .from(formDefinitions)
      .orderBy(desc(formDefinitions.createdAt));
  }

  async getFormDefinition(id: string): Promise<FormDefinition | undefined> {
    const results = await this.db
      .select()
      .from(formDefinitions)
      .where(eq(formDefinitions.id, id))
      .limit(1);
    return results[0];
  }

  async getFormDefinitionByKey(key: string): Promise<FormDefinition | undefined> {
    const results = await this.db
      .select()
      .from(formDefinitions)
      .where(eq(formDefinitions.key, key))
      .limit(1);
    return results[0];
  }

  async createFormDefinition(definition: InsertFormDefinition): Promise<FormDefinition> {
    const results = await this.db
      .insert(formDefinitions)
      .values(definition)
      .returning();
    return results[0];
  }

  async updateFormDefinition(id: string, updates: Partial<FormDefinition>): Promise<FormDefinition | undefined> {
    const results = await this.db
      .update(formDefinitions)
      .set(updates)
      .where(eq(formDefinitions.id, id))
      .returning();
    return results[0];
  }

  // Form Fields
  async getFormFields(formId: string): Promise<FormField[]> {
    return await this.db
      .select()
      .from(formFields)
      .where(eq(formFields.formId, formId))
      .orderBy(formFields.displayOrder);
  }

  async createFormField(field: InsertFormField): Promise<FormField> {
    const results = await this.db
      .insert(formFields)
      .values(field)
      .returning();
    return results[0];
  }

  async deleteFormFields(formId: string): Promise<void> {
    await this.db
      .delete(formFields)
      .where(eq(formFields.formId, formId));
  }

  // Form Submissions
  async getFormSubmissions(formId: string, status?: string): Promise<FormSubmission[]> {
    if (status) {
      return await this.db
        .select()
        .from(formSubmissions)
        .where(and(
          eq(formSubmissions.formId, formId),
          eq(formSubmissions.status, status as "in_progress" | "completed" | "abandoned")
        ))
        .orderBy(desc(formSubmissions.lastUpdatedAt));
    }
    return await this.db
      .select()
      .from(formSubmissions)
      .where(eq(formSubmissions.formId, formId))
      .orderBy(desc(formSubmissions.lastUpdatedAt));
  }

  async getFormSubmission(id: string): Promise<FormSubmission | undefined> {
    const results = await this.db
      .select()
      .from(formSubmissions)
      .where(eq(formSubmissions.id, id))
      .limit(1);
    return results[0];
  }

  async createFormSubmission(submission: InsertFormSubmission): Promise<FormSubmission> {
    const results = await this.db
      .insert(formSubmissions)
      .values(submission)
      .returning();
    return results[0];
  }

  async updateFormSubmission(id: string, updates: Partial<FormSubmission>): Promise<FormSubmission | undefined> {
    const results = await this.db
      .update(formSubmissions)
      .set({ ...updates, lastUpdatedAt: new Date() })
      .where(eq(formSubmissions.id, id))
      .returning();
    return results[0];
  }

  // Scheduled Emails
  async getScheduledEmails(status?: string): Promise<ScheduledEmail[]> {
    if (status) {
      return await this.db
        .select()
        .from(scheduledEmails)
        .where(eq(scheduledEmails.status, status as "pending" | "sent" | "cancelled" | "failed"))
        .orderBy(desc(scheduledEmails.scheduledFor));
    }
    return await this.db
      .select()
      .from(scheduledEmails)
      .orderBy(desc(scheduledEmails.scheduledFor));
  }

  async getPendingScheduledEmails(): Promise<ScheduledEmail[]> {
    const now = new Date();
    return await this.db
      .select()
      .from(scheduledEmails)
      .where(and(
        eq(scheduledEmails.status, "pending"),
        lte(scheduledEmails.scheduledFor, now)
      ))
      .orderBy(scheduledEmails.scheduledFor);
  }

  async getScheduledEmailsBySubmission(submissionId: string): Promise<ScheduledEmail[]> {
    return await this.db
      .select()
      .from(scheduledEmails)
      .where(eq(scheduledEmails.formSubmissionId, submissionId));
  }

  async createScheduledEmail(email: InsertScheduledEmail): Promise<ScheduledEmail> {
    const results = await this.db
      .insert(scheduledEmails)
      .values(email)
      .returning();
    return results[0];
  }

  async updateScheduledEmail(id: number, updates: Partial<ScheduledEmail>): Promise<ScheduledEmail | undefined> {
    const results = await this.db
      .update(scheduledEmails)
      .set(updates)
      .where(eq(scheduledEmails.id, id))
      .returning();
    return results[0];
  }

  async cancelScheduledEmailsBySubmission(submissionId: string): Promise<void> {
    await this.db
      .update(scheduledEmails)
      .set({ status: "cancelled" })
      .where(and(
        eq(scheduledEmails.formSubmissionId, submissionId),
        eq(scheduledEmails.status, "pending")
      ));
  }

  // Onboarding Invitations
  async getAllOnboardingInvitations(): Promise<OnboardingInvitation[]> {
    return await this.db
      .select()
      .from(onboardingInvitations)
      .orderBy(desc(onboardingInvitations.createdAt));
  }

  async getOnboardingInvitation(id: number): Promise<OnboardingInvitation | undefined> {
    const results = await this.db
      .select()
      .from(onboardingInvitations)
      .where(eq(onboardingInvitations.id, id))
      .limit(1);
    return results[0];
  }

  async getOnboardingInvitationByToken(token: string): Promise<OnboardingInvitation | undefined> {
    const results = await this.db
      .select()
      .from(onboardingInvitations)
      .where(eq(onboardingInvitations.token, token))
      .limit(1);
    return results[0];
  }

  async createOnboardingInvitation(invitation: InsertOnboardingInvitation): Promise<OnboardingInvitation> {
    const results = await this.db
      .insert(onboardingInvitations)
      .values(invitation)
      .returning();
    return results[0];
  }

  async updateOnboardingInvitation(id: number, updates: Partial<OnboardingInvitation>): Promise<OnboardingInvitation | undefined> {
    const results = await this.db
      .update(onboardingInvitations)
      .set(updates)
      .where(eq(onboardingInvitations.id, id))
      .returning();
    return results[0];
  }

  async deleteOnboardingInvitation(id: number): Promise<boolean> {
    const results = await this.db
      .delete(onboardingInvitations)
      .where(eq(onboardingInvitations.id, id))
      .returning();
    return results.length > 0;
  }

  // Creators
  async getAllCreators(): Promise<Creator[]> {
    return await this.db.select().from(creators).orderBy(desc(creators.createdAt));
  }

  async getCreator(id: string): Promise<Creator | undefined> {
    const results = await this.db.select().from(creators).where(eq(creators.id, id)).limit(1);
    return results[0];
  }

  async createCreator(creator: InsertCreator): Promise<Creator> {
    const results = await this.db.insert(creators).values(creator).returning();
    return results[0];
  }

  async updateCreator(id: string, updates: Partial<Creator>): Promise<Creator | undefined> {
    const results = await this.db.update(creators).set({ ...updates, updatedAt: new Date() }).where(eq(creators.id, id)).returning();
    return results[0];
  }

  async deleteCreator(id: string): Promise<boolean> {
    const results = await this.db.delete(creators).where(eq(creators.id, id)).returning();
    return results.length > 0;
  }

  // Creator Contracts
  async getCreatorContracts(creatorId: string): Promise<CreatorContract[]> {
    return await this.db.select().from(creatorContracts).where(eq(creatorContracts.creatorId, creatorId)).orderBy(desc(creatorContracts.createdAt));
  }

  async getAllCreatorContracts(): Promise<CreatorContract[]> {
    return await this.db.select().from(creatorContracts).orderBy(desc(creatorContracts.createdAt));
  }

  async getCreatorContract(id: number): Promise<CreatorContract | undefined> {
    const results = await this.db.select().from(creatorContracts).where(eq(creatorContracts.id, id)).limit(1);
    return results[0];
  }

  async getCreatorContractByToken(token: string): Promise<CreatorContract | undefined> {
    const results = await this.db.select().from(creatorContracts).where(eq(creatorContracts.token, token)).limit(1);
    return results[0];
  }

  async createCreatorContract(contract: InsertCreatorContract): Promise<CreatorContract> {
    const results = await this.db.insert(creatorContracts).values(contract).returning();
    return results[0];
  }

  async updateCreatorContract(id: number, updates: Partial<CreatorContract>): Promise<CreatorContract | undefined> {
    const results = await this.db.update(creatorContracts).set(updates).where(eq(creatorContracts.id, id)).returning();
    return results[0];
  }

  async deleteCreatorContract(id: number): Promise<boolean> {
    const results = await this.db.delete(creatorContracts).where(eq(creatorContracts.id, id)).returning();
    return results.length > 0;
  }

  // Creator Contents
  async getCreatorContents(creatorId: string): Promise<CreatorContent[]> {
    return await this.db.select().from(creatorContents).where(eq(creatorContents.creatorId, creatorId)).orderBy(desc(creatorContents.createdAt));
  }

  async createCreatorContent(content: InsertCreatorContent): Promise<CreatorContent> {
    const results = await this.db.insert(creatorContents).values(content).returning();
    return results[0];
  }

  async deleteCreatorContent(id: number): Promise<boolean> {
    const results = await this.db.delete(creatorContents).where(eq(creatorContents.id, id)).returning();
    return results.length > 0;
  }

  // Creator Invoices
  async getCreatorInvoices(creatorId: string): Promise<CreatorInvoice[]> {
    return await this.db.select().from(creatorInvoices).where(eq(creatorInvoices.creatorId, creatorId)).orderBy(desc(creatorInvoices.createdAt));
  }

  async createCreatorInvoice(invoice: InsertCreatorInvoice): Promise<CreatorInvoice> {
    const results = await this.db.insert(creatorInvoices).values(invoice).returning();
    return results[0];
  }

  async updateCreatorInvoice(id: number, updates: Partial<CreatorInvoice>): Promise<CreatorInvoice | undefined> {
    const results = await this.db.update(creatorInvoices).set(updates).where(eq(creatorInvoices.id, id)).returning();
    return results[0];
  }

  async deleteCreatorInvoice(id: number): Promise<boolean> {
    const results = await this.db.delete(creatorInvoices).where(eq(creatorInvoices.id, id)).returning();
    return results.length > 0;
  }

  // Contract Template Defaults
  async getContractTemplateDefaults(): Promise<ContractTemplateDefaults | undefined> {
    const results = await this.db.select().from(contractTemplateDefaults).limit(1);
    return results[0];
  }

  async upsertContractTemplateDefaults(defaults: InsertContractTemplateDefaults): Promise<ContractTemplateDefaults> {
    const existing = await this.getContractTemplateDefaults();
    if (existing) {
      const results = await this.db.update(contractTemplateDefaults)
        .set({ ...defaults, updatedAt: new Date() })
        .where(eq(contractTemplateDefaults.id, existing.id))
        .returning();
      return results[0];
    } else {
      const results = await this.db.insert(contractTemplateDefaults).values(defaults).returning();
      return results[0];
    }
  }

  // Contract Section Presets
  async getContractSectionPresets(sectionType?: string): Promise<ContractSectionPreset[]> {
    if (sectionType) {
      return await this.db.select().from(contractSectionPresets)
        .where(eq(contractSectionPresets.sectionType, sectionType))
        .orderBy(contractSectionPresets.sortOrder);
    }
    return await this.db.select().from(contractSectionPresets).orderBy(contractSectionPresets.sortOrder);
  }

  async getContractSectionPreset(id: string): Promise<ContractSectionPreset | undefined> {
    const results = await this.db.select().from(contractSectionPresets)
      .where(eq(contractSectionPresets.id, id));
    return results[0];
  }

  async createContractSectionPreset(preset: InsertContractSectionPreset): Promise<ContractSectionPreset> {
    const results = await this.db.insert(contractSectionPresets).values(preset).returning();
    return results[0];
  }

  async updateContractSectionPreset(id: string, updates: Partial<ContractSectionPreset>): Promise<ContractSectionPreset | undefined> {
    const results = await this.db.update(contractSectionPresets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(contractSectionPresets.id, id))
      .returning();
    return results[0];
  }

  async deleteContractSectionPreset(id: string): Promise<boolean> {
    const result = await this.db.delete(contractSectionPresets)
      .where(eq(contractSectionPresets.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async setDefaultContractSectionPreset(id: string, sectionType: string): Promise<ContractSectionPreset | undefined> {
    // Clear all defaults for this section type
    await this.db.update(contractSectionPresets)
      .set({ isDefault: false })
      .where(eq(contractSectionPresets.sectionType, sectionType));
    
    // Set new default
    const results = await this.db.update(contractSectionPresets)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(contractSectionPresets.id, id))
      .returning();
    return results[0];
  }

  // AR Size Mappings
  async getArSizeMappings(): Promise<ArSizeMapping[]> {
    return this.db.select().from(arSizeMappings);
  }

  async getArSizeMapping(id: string): Promise<ArSizeMapping | undefined> {
    const results = await this.db.select().from(arSizeMappings).where(eq(arSizeMappings.id, id));
    return results[0];
  }

  async getArSizeMappingBySize(websiteSize: string): Promise<ArSizeMapping | undefined> {
    const results = await this.db.select().from(arSizeMappings).where(eq(arSizeMappings.websiteSize, websiteSize));
    return results[0];
  }

  async createArSizeMapping(mapping: InsertArSizeMapping): Promise<ArSizeMapping> {
    const results = await this.db.insert(arSizeMappings).values(mapping).returning();
    return results[0];
  }

  async updateArSizeMapping(id: string, updates: Partial<ArSizeMapping>): Promise<ArSizeMapping | undefined> {
    const results = await this.db.update(arSizeMappings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(arSizeMappings.id, id))
      .returning();
    return results[0];
  }

  async deleteArSizeMapping(id: string): Promise<boolean> {
    const result = await this.db.delete(arSizeMappings).where(eq(arSizeMappings.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // AR Analytics
  async createArAnalyticsEvent(event: InsertArAnalytics): Promise<ArAnalytics> {
    const results = await this.db.insert(arAnalytics).values(event).returning();
    return results[0];
  }

  async getArAnalytics(days: number): Promise<ArAnalytics[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return this.db.select().from(arAnalytics)
      .where(gte(arAnalytics.createdAt, cutoff))
      .orderBy(desc(arAnalytics.createdAt));
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
    let cutoff: Date;
    let endDate: Date | null = null;
    
    if (dateFilter) {
      cutoff = dateFilter.start;
      endDate = dateFilter.end;
    } else {
      cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
    }

    // Build date range filter
    const dateRangeFilter = endDate
      ? and(gte(arAnalytics.createdAt, cutoff), sql`${arAnalytics.createdAt} < ${endDate}`)
      : gte(arAnalytics.createdAt, cutoff);

    // Only count actual AR launches (not button clicks) to avoid double counting
    const launchFilter = and(
      dateRangeFilter,
      like(arAnalytics.eventType, 'ar_launch_%')
    );

    // Total AR views (launches only)
    const totalResult = await this.db.select({ count: count() })
      .from(arAnalytics)
      .where(launchFilter);
    const totalEvents = totalResult[0]?.count || 0;

    // Unique sessions (launches only)
    const sessionsResult = await this.db.select({ count: countDistinct(arAnalytics.sessionId) })
      .from(arAnalytics)
      .where(launchFilter);
    const uniqueSessions = sessionsResult[0]?.count || 0;

    // By platform (launches only)
    const platformResult = await this.db.select({
      platform: arAnalytics.platform,
      count: count(),
    })
      .from(arAnalytics)
      .where(launchFilter)
      .groupBy(arAnalytics.platform);
    const byPlatform = platformResult
      .filter(r => r.platform)
      .map(r => ({ platform: r.platform!, count: r.count }));

    // By event type
    const eventTypeResult = await this.db.select({
      eventType: arAnalytics.eventType,
      count: count(),
    })
      .from(arAnalytics)
      .where(dateRangeFilter)
      .groupBy(arAnalytics.eventType);
    const byEventType = eventTypeResult.map(r => ({ eventType: r.eventType, count: r.count }));

    // All products (launches only) - no limit for full visibility
    const productResult = await this.db.select({
      productTitle: arAnalytics.productTitle,
      count: count(),
    })
      .from(arAnalytics)
      .where(launchFilter)
      .groupBy(arAnalytics.productTitle)
      .orderBy(desc(count()));
    const topProducts = productResult
      .filter(r => r.productTitle)
      .map(r => ({ productTitle: r.productTitle!, count: r.count }));

    // Daily trend (launches only)
    const dailyResult = await this.db.select({
      date: sql<string>`DATE(${arAnalytics.createdAt})`.as('date'),
      count: count(),
    })
      .from(arAnalytics)
      .where(launchFilter)
      .groupBy(sql`DATE(${arAnalytics.createdAt})`)
      .orderBy(sql`DATE(${arAnalytics.createdAt})`);
    const dailyTrend = dailyResult.map(r => ({ date: r.date, count: r.count }));

    // Geographic distribution (by country, launches only)
    const countryResult = await this.db.select({
      country: arAnalytics.country,
      countryCode: arAnalytics.countryCode,
      count: count(),
    })
      .from(arAnalytics)
      .where(launchFilter)
      .groupBy(arAnalytics.country, arAnalytics.countryCode)
      .orderBy(desc(count()))
      .limit(15);
    const byCountry = countryResult
      .filter(r => r.country)
      .map(r => ({ country: r.country!, countryCode: r.countryCode || '', count: r.count }));

    // QR code scans (both page loads and launches with isQrScan = true)
    const qrPageLoadsResult = await this.db.select({ count: count() })
      .from(arAnalytics)
      .where(and(
        dateRangeFilter,
        eq(arAnalytics.eventType, 'qr_scan_page_load')
      ));
    const qrScans = qrPageLoadsResult[0]?.count || 0;

    // AR Completion Rate: button clicks vs successful launches
    const buttonClicksResult = await this.db.select({ count: count() })
      .from(arAnalytics)
      .where(and(
        dateRangeFilter,
        eq(arAnalytics.eventType, 'ar_button_click')
      ));
    const buttonClicks = buttonClicksResult[0]?.count || 0;
    const completionRate = buttonClicks > 0 ? Math.round((totalEvents / buttonClicks) * 100) : 0;

    // Average generation time (for launches with generation time recorded)
    const genTimeResult = await this.db.select({ 
      avg: sql<number>`AVG(${arAnalytics.generationTimeMs})`.as('avg')
    })
      .from(arAnalytics)
      .where(and(
        launchFilter,
        sql`${arAnalytics.generationTimeMs} IS NOT NULL`
      ));
    const avgGenerationTimeMs = genTimeResult[0]?.avg ? Math.round(genTimeResult[0].avg) : null;

    // By frame style (launches only)
    const frameResult = await this.db.select({
      frame: arAnalytics.frame,
      frameType: arAnalytics.frameType,
      count: count(),
    })
      .from(arAnalytics)
      .where(and(launchFilter, sql`${arAnalytics.frame} IS NOT NULL`))
      .groupBy(arAnalytics.frame, arAnalytics.frameType)
      .orderBy(desc(count()))
      .limit(10);
    const byFrame = frameResult.map(r => ({ 
      frame: r.frame!, 
      frameType: r.frameType || 'standard', 
      count: r.count 
    }));

    // By size (launches only)
    const sizeResult = await this.db.select({
      size: arAnalytics.size,
      count: count(),
    })
      .from(arAnalytics)
      .where(and(launchFilter, sql`${arAnalytics.size} IS NOT NULL`))
      .groupBy(arAnalytics.size)
      .orderBy(desc(count()))
      .limit(10);
    const bySize = sizeResult
      .filter(r => r.size)
      .map(r => ({ size: r.size!, count: r.count }));

    return {
      totalEvents,
      uniqueSessions,
      byPlatform,
      byEventType,
      topProducts,
      dailyTrend,
      byCountry,
      byFrame,
      bySize,
      qrScans,
      completionRate,
      avgGenerationTimeMs,
    };
  }

  // AR Conversions
  async createArConversion(conversion: InsertArConversion): Promise<ArConversion> {
    const results = await this.db.insert(arConversions).values(conversion).returning();
    return results[0];
  }

  async getArConversions(days: number): Promise<ArConversion[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return this.db.select()
      .from(arConversions)
      .where(gte(arConversions.createdAt, cutoff))
      .orderBy(desc(arConversions.createdAt));
  }

  async findArSessionForProduct(productHandle: string, lookbackMinutes: number = 60): Promise<ArAnalytics | null> {
    const cutoff = new Date();
    cutoff.setMinutes(cutoff.getMinutes() - lookbackMinutes);
    
    const results = await this.db.select()
      .from(arAnalytics)
      .where(and(
        eq(arAnalytics.productHandle, productHandle),
        gte(arAnalytics.createdAt, cutoff)
      ))
      .orderBy(desc(arAnalytics.createdAt))
      .limit(1);
    
    return results[0] || null;
  }

  async findArSessionBySessionId(sessionId: string, productHandle: string): Promise<ArAnalytics | null> {
    const results = await this.db.select()
      .from(arAnalytics)
      .where(and(
        eq(arAnalytics.sessionId, sessionId),
        eq(arAnalytics.productHandle, productHandle),
        like(arAnalytics.eventType, 'ar_launch_%')
      ))
      .orderBy(desc(arAnalytics.createdAt))
      .limit(1);
    
    return results[0] || null;
  }

  async getArConversionStats(days: number, dateFilter?: { start: Date; end: Date } | null): Promise<{
    totalConversions: number;
    totalRevenue: number;
    conversionRate: number;
    avgTimeToPurchase: number;
    byPlatform: { platform: string; conversions: number; revenue: number }[];
    topConvertingProducts: { productHandle: string; productTitle: string; conversions: number; revenue: number }[];
  }> {
    let cutoff: Date;
    let endDate: Date | null = null;
    
    if (dateFilter) {
      cutoff = dateFilter.start;
      endDate = dateFilter.end;
    } else {
      cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
    }
    
    // Build date range filter for conversions
    const convDateFilter = endDate
      ? and(gte(arConversions.createdAt, cutoff), sql`${arConversions.createdAt} < ${endDate}`)
      : gte(arConversions.createdAt, cutoff);
    
    // Build date range filter for analytics
    const analyticsDateFilter = endDate
      ? and(gte(arAnalytics.createdAt, cutoff), sql`${arAnalytics.createdAt} < ${endDate}`)
      : gte(arAnalytics.createdAt, cutoff);

    // Total conversions
    const totalResult = await this.db.select({ count: count() })
      .from(arConversions)
      .where(convDateFilter);
    const totalConversions = totalResult[0]?.count || 0;

    // Total revenue
    const revenueResult = await this.db.select({ 
      total: sql<string>`COALESCE(SUM(CAST(${arConversions.lineItemPrice} AS DECIMAL)), 0)` 
    })
      .from(arConversions)
      .where(convDateFilter);
    const totalRevenue = parseFloat(revenueResult[0]?.total || '0');

    // Total AR launches for conversion rate
    const arLaunchResult = await this.db.select({ count: count() })
      .from(arAnalytics)
      .where(and(
        analyticsDateFilter,
        sql`${arAnalytics.eventType} LIKE 'ar_launch_%'`
      ));
    const totalArLaunches = arLaunchResult[0]?.count || 0;
    const conversionRate = totalArLaunches > 0 ? (totalConversions / totalArLaunches) * 100 : 0;

    // Average time to purchase
    const avgTimeResult = await this.db.select({ 
      avg: sql<string>`COALESCE(AVG(${arConversions.timeBetweenArAndPurchase}), 0)` 
    })
      .from(arConversions)
      .where(and(
        convDateFilter,
        sql`${arConversions.timeBetweenArAndPurchase} IS NOT NULL`
      ));
    const avgTimeToPurchase = parseFloat(avgTimeResult[0]?.avg || '0');

    // By platform
    const platformResult = await this.db.select({
      platform: arConversions.platform,
      conversions: count(),
      revenue: sql<string>`COALESCE(SUM(CAST(${arConversions.lineItemPrice} AS DECIMAL)), 0)`,
    })
      .from(arConversions)
      .where(convDateFilter)
      .groupBy(arConversions.platform);
    const byPlatform = platformResult
      .filter(r => r.platform)
      .map(r => ({ 
        platform: r.platform!, 
        conversions: r.conversions, 
        revenue: parseFloat(r.revenue || '0') 
      }));

    // All converting products (no limit for full visibility)
    const productResult = await this.db.select({
      productHandle: arConversions.productHandle,
      productTitle: arConversions.productTitle,
      conversions: count(),
      revenue: sql<string>`COALESCE(SUM(CAST(${arConversions.lineItemPrice} AS DECIMAL)), 0)`,
    })
      .from(arConversions)
      .where(convDateFilter)
      .groupBy(arConversions.productHandle, arConversions.productTitle)
      .orderBy(desc(sql`COALESCE(SUM(CAST(${arConversions.lineItemPrice} AS DECIMAL)), 0)`));
    const topConvertingProducts = productResult.map(r => ({
      productHandle: r.productHandle,
      productTitle: r.productTitle || r.productHandle,
      conversions: r.conversions,
      revenue: parseFloat(r.revenue || '0'),
    }));

    return {
      totalConversions,
      totalRevenue,
      conversionRate,
      avgTimeToPurchase,
      byPlatform,
      topConvertingProducts,
    };
  }

  // Product Add-ons
  async getAllProductAddons(): Promise<ProductAddon[]> {
    return this.db.select().from(productAddons).where(eq(productAddons.isActive, true));
  }

  async getProductAddon(id: string): Promise<ProductAddon | undefined> {
    const results = await this.db.select().from(productAddons).where(eq(productAddons.id, id));
    return results[0];
  }

  async getProductAddonBySlug(slug: string): Promise<ProductAddon | undefined> {
    const results = await this.db.select().from(productAddons).where(eq(productAddons.slug, slug));
    return results[0];
  }

  async getProductAddonWithVariants(id: string): Promise<(ProductAddon & { variants: AddonVariant[] }) | undefined> {
    const addon = await this.getProductAddon(id);
    if (!addon) return undefined;
    const variants = await this.getAddonVariants(id);
    return { ...addon, variants };
  }

  async createProductAddon(addon: InsertProductAddon): Promise<ProductAddon> {
    const results = await this.db.insert(productAddons).values(addon).returning();
    return results[0];
  }

  async updateProductAddon(id: string, updates: Partial<ProductAddon>): Promise<ProductAddon | undefined> {
    const results = await this.db.update(productAddons)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(productAddons.id, id))
      .returning();
    return results[0];
  }

  async deleteProductAddon(id: string): Promise<boolean> {
    const result = await this.db.delete(productAddons).where(eq(productAddons.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Addon Variants
  async getAddonVariants(addonId: string): Promise<AddonVariant[]> {
    return this.db.select().from(addonVariants)
      .where(and(eq(addonVariants.addonId, addonId), eq(addonVariants.isActive, true)));
  }

  async getAllAddonVariants(): Promise<AddonVariant[]> {
    return this.db.select().from(addonVariants).where(eq(addonVariants.isActive, true));
  }

  async getAddonVariant(id: string): Promise<AddonVariant | undefined> {
    const results = await this.db.select().from(addonVariants).where(eq(addonVariants.id, id));
    return results[0];
  }

  async createAddonVariant(variant: InsertAddonVariant): Promise<AddonVariant> {
    const results = await this.db.insert(addonVariants).values(variant).returning();
    return results[0];
  }

  async updateAddonVariant(id: string, updates: Partial<AddonVariant>): Promise<AddonVariant | undefined> {
    const results = await this.db.update(addonVariants)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(addonVariants.id, id))
      .returning();
    return results[0];
  }

  async deleteAddonVariant(id: string): Promise<boolean> {
    const result = await this.db.delete(addonVariants).where(eq(addonVariants.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Addon Variant Images
  async getAddonVariantImages(variantId: string): Promise<AddonVariantImage[]> {
    return this.db.select().from(addonVariantImages)
      .where(eq(addonVariantImages.variantId, variantId))
      .orderBy(addonVariantImages.displayOrder);
  }

  async getAddonVariantImage(variantId: string, frameType: string | null): Promise<AddonVariantImage | undefined> {
    const results = await this.db.select().from(addonVariantImages)
      .where(and(
        eq(addonVariantImages.variantId, variantId),
        frameType === null ? isNull(addonVariantImages.frameType) : eq(addonVariantImages.frameType, frameType)
      ));
    return results[0];
  }

  async createAddonVariantImage(image: InsertAddonVariantImage): Promise<AddonVariantImage> {
    const results = await this.db.insert(addonVariantImages).values(image).returning();
    return results[0];
  }

  async updateAddonVariantImage(id: string, updates: Partial<AddonVariantImage>): Promise<AddonVariantImage | undefined> {
    const results = await this.db.update(addonVariantImages)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(addonVariantImages.id, id))
      .returning();
    return results[0];
  }

  async deleteAddonVariantImage(id: string): Promise<boolean> {
    const result = await this.db.delete(addonVariantImages).where(eq(addonVariantImages.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async upsertAddonVariantImage(image: InsertAddonVariantImage): Promise<AddonVariantImage> {
    const existing = await this.getAddonVariantImage(image.variantId, image.frameType ?? null);
    if (existing) {
      return this.updateAddonVariantImage(existing.id, image) as Promise<AddonVariantImage>;
    }
    return this.createAddonVariantImage(image);
  }

  // NEW: Addon Option Sets (Level 1 - Globo-style hierarchy)
  async getAllAddonOptionSets(): Promise<AddonOptionSet[]> {
    return this.db.select().from(addonOptionSets).where(eq(addonOptionSets.isActive, true));
  }

  async getAddonOptionSet(id: string): Promise<AddonOptionSet | undefined> {
    const results = await this.db.select().from(addonOptionSets).where(eq(addonOptionSets.id, id));
    return results[0];
  }

  async getAddonOptionSetsByCountry(country: string): Promise<AddonOptionSet[]> {
    return this.db.select().from(addonOptionSets)
      .where(and(
        eq(addonOptionSets.isActive, true),
        sql`(cardinality(${addonOptionSets.allowedCountries}) = 0 OR ${country} = ANY(${addonOptionSets.allowedCountries}))`
      ));
  }

  // NEW: Addon Groups (Level 2 - Globo-style hierarchy)
  async getAllAddonGroups(): Promise<AddonGroup[]> {
    return this.db.select().from(addonGroups).where(eq(addonGroups.isActive, true));
  }

  async getAddonGroup(id: string): Promise<AddonGroup | undefined> {
    const results = await this.db.select().from(addonGroups).where(eq(addonGroups.id, id));
    return results[0];
  }

  async getAddonGroupsByOptionSet(optionSetId: string): Promise<AddonGroup[]> {
    return this.db.select().from(addonGroups)
      .where(and(eq(addonGroups.optionSetId, optionSetId), eq(addonGroups.isActive, true)))
      .orderBy(addonGroups.displayOrder);
  }

  async getAddonVariantsByGroup(groupId: string): Promise<AddonVariant[]> {
    return this.db.select().from(addonVariants)
      .where(and(eq(addonVariants.groupId, groupId), eq(addonVariants.isActive, true)))
      .orderBy(addonVariants.displayOrder);
  }

  async createAddonOptionSet(optionSet: InsertAddonOptionSet): Promise<AddonOptionSet> {
    const results = await this.db.insert(addonOptionSets).values(optionSet).returning();
    return results[0];
  }

  async updateAddonOptionSet(id: string, updates: Partial<AddonOptionSet>): Promise<AddonOptionSet | undefined> {
    const results = await this.db.update(addonOptionSets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(addonOptionSets.id, id))
      .returning();
    return results[0];
  }

  async deleteAddonOptionSet(id: string): Promise<boolean> {
    const result = await this.db.delete(addonOptionSets).where(eq(addonOptionSets.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async createAddonGroup(group: InsertAddonGroup): Promise<AddonGroup> {
    const results = await this.db.insert(addonGroups).values(group).returning();
    return results[0];
  }

  async updateAddonGroup(id: string, updates: Partial<AddonGroup>): Promise<AddonGroup | undefined> {
    const results = await this.db.update(addonGroups)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(addonGroups.id, id))
      .returning();
    return results[0];
  }

  async deleteAddonGroup(id: string): Promise<boolean> {
    const result = await this.db.delete(addonGroups).where(eq(addonGroups.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}
