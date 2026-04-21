import { storagePromise } from "./storage.js";
import { ObjectStorageService } from "./objectStorage.js";
import { generateMockup } from "./mockupGenerator.js";
import type { Job, Artwork, Template } from "@shared/schema";

const POLL_INTERVAL = 5000; // 5 seconds
const objectStorageService = new ObjectStorageService();

async function processJob(job: Job, storage: any) {
  try {
    console.log(`[Worker] Processing job ${job.id} (type: ${job.type})`);

    if (job.type === "mockup_generation") {
      await processMockupGenerationJob(job, storage);
    } else {
      throw new Error(`Unknown job type: ${job.type}`);
    }

    console.log(`[Worker] Job ${job.id} completed successfully`);
  } catch (error) {
    console.error(`[Worker] Job ${job.id} failed:`, error);
    
    try {
      await storage.updateJobStatus(job.id, "failed", 0);
      await storage.updateJobResult(job.id, {
        error: error instanceof Error ? error.message : String(error),
        mockupIds: [],
      });
    } catch (updateError) {
      console.error(`[Worker] Failed to update job ${job.id} status to failed:`, updateError);
    }
  }
}

async function processMockupGenerationJob(job: Job, storage: any) {
  const { artworkIds, templateIds } = job;
  
  if (!artworkIds || !templateIds) {
    throw new Error("Missing artworkIds or templateIds in job");
  }

  // Fetch artworks and templates
  const artworks: (Artwork | undefined)[] = await Promise.all(
    artworkIds.map(id => storage.getArtwork(id))
  );
  
  const templates: (Template | undefined)[] = await Promise.all(
    templateIds.map(id => storage.getTemplate(id))
  );

  // Filter out undefined
  const validArtworks = artworks.filter(a => a !== undefined) as Artwork[];
  const validTemplates = templates.filter(t => t !== undefined) as Template[];

  if (validArtworks.length === 0 || validTemplates.length === 0) {
    throw new Error("No valid artworks or templates found");
  }

  // Calculate total mockups to generate
  // One mockup per artwork+template (applies to all sizes)
  const totalMockups = validArtworks.length * validTemplates.length;

  console.log(`[Worker] Generating ${totalMockups} mockups for job ${job.id}`);

  const mockupIds: string[] = [];
  let completed = 0;

  // Download file helper
  const getFileBuffer = async (url: string): Promise<Buffer> => {
    if (url.startsWith("http")) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.statusText}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } else {
      return await objectStorageService.downloadFileAsBuffer(url);
    }
  };

  // Process each artwork × template combination
  // Note: One mockup per frame type applies to all sizes, so we don't loop through sizes
  for (const artwork of validArtworks) {
    for (const template of validTemplates) {
      try {
        console.log(`[Worker] Generating mockup: ${artwork.title} + ${template.name}`);

        // Find the frame zone that will be used for this artwork (same logic as generateMockup)
        const printSize = artwork.availableSizes[0];
        const zones = template.frameZones || [];
        const matchingZoneIndex = zones.findIndex(zone => {
          const zoneSizes = zone.supportedSizes || template.supportedSizes;
          return zoneSizes && zoneSizes.includes(printSize);
        });
        const matchingZone = matchingZoneIndex >= 0 ? zones[matchingZoneIndex] : zones[0];
        const zoneId = matchingZone?.id || `zone-${Math.max(0, matchingZoneIndex)}`;

        // Look up custom positioning settings
        let positioning;
        try {
          const mockupSetting = await storage.getMockupSetting(artwork.id, template.id, zoneId);
          if (mockupSetting?.enabled === false) {
            console.log(`[Worker] Skipping disabled template ${template.name} for ${artwork.title}`);
            completed++;
            const progress = Math.round((completed / totalMockups) * 100);
            await storage.updateJobStatus(job.id, "processing", progress);
            continue;
          }
          positioning = mockupSetting?.positioning;
        } catch (settingsError) {
          console.log(`[Worker] No custom settings found for ${artwork.title} + ${template.name}`);
        }

        // Download images
        const [artworkBuffer, templateBuffer] = await Promise.all([
          getFileBuffer(artwork.originalFileUrl),
          getFileBuffer(template.templateImageUrl),
        ]);

        // Generate mockup using the first available size (mockup applies to all sizes)
        const mockupBuffer = await generateMockup(artworkBuffer, templateBuffer, {
          artwork,
          template,
          printSize,
          positioning, // Apply custom positioning if set
        });

        // Upload mockup
        const mockupFilename = `mockup-${artwork.id}-${template.id}-${Date.now()}.jpg`;
        const mockupUrl = await objectStorageService.uploadFile(
          mockupBuffer,
          mockupFilename,
          "image/jpeg"
        );

        // Create mockup record
        // Note: Auto-generated mockups default to "Unframed" frameType
        // Manual mockups from Dropbox can specify different frame types
        // One mockup per frame type applies to all sizes
        const mockup = await storage.createMockup({
          artworkId: artwork.id,
          templateId: template.id,
          frameType: "Unframed", // Default for auto-generated mockups
          isLifestyle: false,
          mockupImageUrl: mockupUrl,
        });

        mockupIds.push(mockup.id);
        completed++;

        // Update progress
        const progress = Math.round((completed / totalMockups) * 100);
        await storage.updateJobStatus(job.id, "processing", progress);

        console.log(`[Worker] Progress: ${completed}/${totalMockups} (${progress}%)`);
      } catch (error) {
        console.error(`[Worker] Failed to generate mockup for ${artwork.title} + ${template.name}:`, error);
        // Continue with next mockup instead of failing the entire job
      }
    }
  }

  // Mark job as completed
  await storage.updateJobStatus(job.id, "completed", 100);
  await storage.updateJobResult(job.id, { mockupIds });
}

async function workerLoop() {
  console.log("[Worker] Starting worker loop...");
  
  const storage = await storagePromise;
  console.log("[Worker] Storage initialized");

  while (true) {
    try {
      // Atomically claim next pending job (marks as processing)
      const job = await storage.claimNextPendingJob();

      if (job) {
        console.log(`[Worker] Claimed job ${job.id} for processing`);
        await processJob(job, storage);
      }
    } catch (error) {
      console.error("[Worker] Error in worker loop:", error);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
}

// Start worker if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  workerLoop().catch(error => {
    console.error("[Worker] Fatal error:", error);
    process.exit(1);
  });
}

export { workerLoop, processJob };
