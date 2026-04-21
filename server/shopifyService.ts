import type { Artwork, Mockup, VariantConfig, FormSettings } from '@shared/schema';
import { FRAME_OPTIONS, getSizeNameFromCode, PRINT_SIZES } from '@shared/schema';
import { generateArtworkMetadataFromFile, generateImageAltText, type ArtworkMetadata, type MetadataOptions } from './openaiService';
import { convertToRawDropboxUrl } from './dropboxService';
import { ObjectStorageService } from './objectStorage';

const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;

interface ShopifyProduct {
  id?: number;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string[];
  status: 'active' | 'draft' | 'archived';
  template_suffix?: string;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  options: ShopifyOption[];
  metafields?: ShopifyMetafield[];
}

interface ShopifyVariant {
  title?: string;
  price: string;
  compare_at_price?: string;
  sku: string;
  weight: number;
  weight_unit: 'g' | 'kg' | 'lb' | 'oz';
  inventory_quantity?: number;
  inventory_management?: string;
  inventory_policy: 'deny' | 'continue';
  fulfillment_service: string;
  requires_shipping: boolean;
  taxable: boolean;
  option1: string;
  option2?: string;
  option3?: string;
  image_id?: number;
}

interface ShopifyImage {
  src?: string;
  attachment?: string;
  alt?: string;
  position?: number;
  filename?: string;
}

interface ShopifyOption {
  name: string;
  values: string[];
}

interface ShopifyMetafield {
  namespace: string;
  key: string;
  value: string;
  type: string;
}

interface ShopifyAPIResponse {
  product?: ShopifyProduct & { id: number };
  errors?: any;
}

interface ProductSyncResult {
  success: boolean;
  productId?: number;
  productUrl?: string;
  error?: string;
  skipped?: boolean;
}

async function shopifyRequest(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
  if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    throw new Error('Shopify credentials not configured');
  }

  const url = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/${endpoint}`;
  
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

function generateHandle(title: string, artistName: string): string {
  const base = `${title}-${artistName}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
  return base.substring(0, 200);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function determineShape(artwork: Artwork): string {
  if (artwork.aspectRatio?.toLowerCase().includes('square') || artwork.aspectRatio === '1:1') {
    return 'Square';
  }
  if (artwork.aspectRatio?.toLowerCase().includes('landscape')) {
    return 'Landscape';
  }
  if (artwork.aspectRatio?.toLowerCase().includes('portrait')) {
    return 'Portrait';
  }
  const ratio = artwork.widthPx && artwork.heightPx
    ? artwork.widthPx / artwork.heightPx
    : parseFloat(artwork.aspectRatio?.split(':')[0] || '1') / 
      parseFloat(artwork.aspectRatio?.split(':')[1] || '1');
  if (isNaN(ratio)) return 'Portrait';
  if (Math.abs(ratio - 1) < 0.05) return 'Square';
  return ratio > 1 ? 'Landscape' : 'Portrait';
}

const RATIO_GROUP_ORDER = ['3:4', '2:3', 'A-Ratio', '4:5', '1:1', 'Other'];

function getRatioGroup(sizeCode: string): string {
  const size = PRINT_SIZES.find(s => s.code === sizeCode);
  if (!size) return 'Other';
  
  const ratio = size.widthIn / size.heightIn;
  const normalizedRatio = Math.min(ratio, 1 / ratio);
  
  if (Math.abs(normalizedRatio - 0.75) < 0.02) return '3:4';
  if (Math.abs(normalizedRatio - 0.667) < 0.02) return '2:3';
  if (Math.abs(normalizedRatio - 0.707) < 0.02) return 'A-Ratio';
  if (Math.abs(normalizedRatio - 0.8) < 0.02) return '4:5';
  if (Math.abs(normalizedRatio - 1.0) < 0.02) return '1:1';
  return 'Other';
}

function sortSizesByRatioAndArea(sizeCodes: string[]): string[] {
  return [...sizeCodes].sort((a, b) => {
    const ratioA = getRatioGroup(a);
    const ratioB = getRatioGroup(b);
    
    const indexA = RATIO_GROUP_ORDER.indexOf(ratioA);
    const indexB = RATIO_GROUP_ORDER.indexOf(ratioB);
    
    if (indexA !== indexB) {
      return indexA - indexB;
    }
    
    const sizeA = PRINT_SIZES.find(s => s.code === a);
    const sizeB = PRINT_SIZES.find(s => s.code === b);
    const areaA = sizeA ? sizeA.widthIn * sizeA.heightIn : 0;
    const areaB = sizeB ? sizeB.widthIn * sizeB.heightIn : 0;
    
    return areaA - areaB;
  });
}

function getConfigForVariant(size: string, frame: string, variantConfigs: VariantConfig[]): VariantConfig | null {
  const config = variantConfigs.find(
    vc => vc.printSize === size && vc.frameOption === frame
  );
  return config || null;
}

// Cache for artist metaobjects (handle -> GID)
const artistMetaobjectCache = new Map<string, string>();
let artistMetaobjectType = "artists"; // Will be updated when fetching definitions

export function clearArtistMetaobjectCache(): void {
  artistMetaobjectCache.clear();
  console.log('[Shopify] Artist metaobject cache cleared');
}

async function resolveImageForShopify(url: string): Promise<{ src?: string; attachment?: string; filename?: string }> {
  if (url.startsWith("/objects/")) {
    const objStorage = new ObjectStorageService();
    const buffer = await objStorage.downloadFileAsBuffer(url);
    const basename = url.split("/").pop() || "image.jpg";
    console.log(`[Shopify] Resolved Object Storage image to base64 (${buffer.length} bytes): ${basename}`);
    return { attachment: buffer.toString("base64"), filename: basename };
  }
  return { src: convertToRawDropboxUrl(url) };
}

// Upload image to Shopify Files and return the file GID for use in metafields
async function uploadToShopifyFiles(imageBuffer: Buffer, filename: string): Promise<string | null> {
  try {
    console.log(`[Shopify Files] Starting upload for: ${filename} (${imageBuffer.length} bytes)`);
    
    // Step 1: Create a staged upload target
    const stagedUploadMutation = `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const ext = filename.toLowerCase().split('.').pop();
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    const stagedVariables = {
      input: [{
        resource: "IMAGE",
        filename: filename,
        mimeType,
        fileSize: imageBuffer.length.toString(),
        httpMethod: "POST"
      }]
    };
    
    const stagedResponse = await shopifyGraphQL(stagedUploadMutation, stagedVariables);
    
    if (stagedResponse.data?.stagedUploadsCreate?.userErrors?.length > 0) {
      console.error('[Shopify Files] Staged upload errors:', stagedResponse.data.stagedUploadsCreate.userErrors);
      return null;
    }
    
    const target = stagedResponse.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) {
      console.error('[Shopify Files] No staged upload target returned');
      return null;
    }
    
    console.log(`[Shopify Files] Got staged upload URL: ${target.url}`);
    
    // Step 2: Upload the file to the staged URL using multipart form
    const formData = new FormData();
    
    // Add all the signed parameters first
    for (const param of target.parameters) {
      formData.append(param.name, param.value);
    }
    
    // Add the file last
    const blob = new Blob([imageBuffer], { type: mimeType });
    formData.append('file', blob, filename);
    
    const uploadResponse = await fetch(target.url, {
      method: 'POST',
      body: formData,
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error(`[Shopify Files] Upload failed (${uploadResponse.status}):`, errorText);
      return null;
    }
    
    console.log(`[Shopify Files] File uploaded successfully to staged URL`);
    
    // Step 3: Create the file in Shopify using the resourceUrl
    const fileCreateMutation = `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            alt
            ... on MediaImage {
              id
              image {
                url
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const fileVariables = {
      files: [{
        alt: filename.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
        contentType: "IMAGE",
        originalSource: target.resourceUrl
      }]
    };
    
    const fileResponse = await shopifyGraphQL(fileCreateMutation, fileVariables);
    
    if (fileResponse.data?.fileCreate?.userErrors?.length > 0) {
      console.error('[Shopify Files] File create errors:', fileResponse.data.fileCreate.userErrors);
      return null;
    }
    
    const file = fileResponse.data?.fileCreate?.files?.[0];
    if (!file?.id) {
      console.error('[Shopify Files] No file ID returned');
      return null;
    }
    
    console.log(`[Shopify Files] File created with ID: ${file.id}`);
    return file.id;
    
  } catch (error) {
    console.error('[Shopify Files] Upload error:', error);
    return null;
  }
}

export async function uploadVideoToShopifyProduct(
  videoBuffer: Buffer,
  filename: string,
  productGID: string,
  altText: string,
): Promise<boolean> {
  try {
    console.log(`[Shopify Video] Starting video upload for product: ${productGID} (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB)`);

    const stagedUploadMutation = `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const stagedVariables = {
      input: [{
        resource: "VIDEO",
        filename: filename,
        mimeType: "video/mp4",
        fileSize: videoBuffer.length.toString(),
        httpMethod: "POST"
      }]
    };

    const stagedResponse = await shopifyGraphQL(stagedUploadMutation, stagedVariables);

    if (stagedResponse.data?.stagedUploadsCreate?.userErrors?.length > 0) {
      console.error('[Shopify Video] Staged upload errors:', stagedResponse.data.stagedUploadsCreate.userErrors);
      return false;
    }

    const target = stagedResponse.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) {
      console.error('[Shopify Video] No staged upload target returned');
      return false;
    }

    console.log(`[Shopify Video] Got staged upload URL: ${target.url}`);

    const formData = new FormData();
    for (const param of target.parameters) {
      formData.append(param.name, param.value);
    }
    const blob = new Blob([videoBuffer], { type: "video/mp4" });
    formData.append('file', blob, filename);

    const uploadResponse = await fetch(target.url, {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error(`[Shopify Video] Upload to staged URL failed (${uploadResponse.status}):`, errorText);
      return false;
    }

    console.log(`[Shopify Video] File uploaded to staged URL successfully`);

    const productCreateMediaMutation = `
      mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media {
            alt
            mediaContentType
            status
            ... on Video {
              id
              sources {
                url
                mimeType
              }
            }
          }
          mediaUserErrors {
            field
            message
            code
          }
          product {
            id
          }
        }
      }
    `;

    const mediaVariables = {
      productId: productGID,
      media: [{
        alt: altText,
        mediaContentType: "VIDEO",
        originalSource: target.resourceUrl,
      }],
    };

    const mediaResponse = await shopifyGraphQL(productCreateMediaMutation, mediaVariables);

    if (mediaResponse.data?.productCreateMedia?.mediaUserErrors?.length > 0) {
      console.error('[Shopify Video] Product media errors:', mediaResponse.data.productCreateMedia.mediaUserErrors);
      return false;
    }

    const createdMedia = mediaResponse.data?.productCreateMedia?.media?.[0];
    if (createdMedia) {
      console.log(`[Shopify Video] Successfully attached video to product (status: ${createdMedia.status})`);
      return true;
    }

    console.error('[Shopify Video] No media returned from productCreateMedia');
    return false;
  } catch (error) {
    console.error('[Shopify Video] Upload error:', error);
    return false;
  }
}

export interface ShopifyFileUploadResult {
  filename: string;
  success: boolean;
  shopifyFileId?: string;
  shopifyUrl?: string;
  error?: string;
}

async function findExistingShopifyFiles(filename: string): Promise<string[]> {
  try {
    const query = `
      query findFile($query: String!) {
        files(first: 20, query: $query) {
          edges {
            node {
              id
              alt
              ... on MediaImage {
                image { url }
              }
              ... on GenericFile {
                url
              }
            }
          }
        }
      }
    `;
    const baseName = filename.replace(/\.[^/.]+$/, "");
    const response = await shopifyGraphQL(query, { query: `filename:${baseName}*` });
    const edges = response.data?.files?.edges || [];
    const ids: string[] = [];
    const exactPattern = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(_[0-9a-f-]{36})?\\.\\w+$`);
    for (const edge of edges) {
      const url = edge.node?.image?.url || edge.node?.url || "";
      const urlFilename = url.split("/").pop()?.split("?")[0] || "";
      if (exactPattern.test(urlFilename) || urlFilename === filename) {
        ids.push(edge.node.id);
      }
    }
    return ids;
  } catch (err) {
    console.log(`[Shopify Files] Could not search for existing file: ${(err as Error).message}`);
    return [];
  }
}

async function deleteShopifyFile(fileId: string): Promise<boolean> {
  try {
    const mutation = `
      mutation fileDelete($input: [ID!]!) {
        fileDelete(fileIds: $input) {
          deletedFileIds
          userErrors { field message }
        }
      }
    `;
    const response = await shopifyGraphQL(mutation, { input: [fileId] });
    const errors = response.data?.fileDelete?.userErrors;
    if (errors?.length > 0) {
      console.log(`[Shopify Files] Delete errors:`, errors);
      return false;
    }
    console.log(`[Shopify Files] Deleted existing file: ${fileId}`);
    return true;
  } catch (err) {
    console.log(`[Shopify Files] Could not delete file: ${(err as Error).message}`);
    return false;
  }
}

export async function uploadOverlayToShopifyFiles(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string = "image/webp"
): Promise<ShopifyFileUploadResult> {
  try {
    console.log(`[Shopify Files] Uploading overlay: ${filename} (${fileBuffer.length} bytes)`);

    const existingIds = await findExistingShopifyFiles(filename);
    if (existingIds.length > 0) {
      console.log(`[Shopify Files] Found ${existingIds.length} existing file(s) matching ${filename}, deleting...`);
      for (const id of existingIds) {
        await deleteShopifyFile(id);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const stagedUploadMutation = `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters { name value }
          }
          userErrors { field message }
        }
      }
    `;

    const resource = mimeType.startsWith("image/") ? "IMAGE" : "FILE";

    const stagedResponse = await shopifyGraphQL(stagedUploadMutation, {
      input: [{
        resource,
        filename,
        mimeType,
        fileSize: fileBuffer.length.toString(),
        httpMethod: "POST",
      }],
    });

    const userErrors = stagedResponse.data?.stagedUploadsCreate?.userErrors;
    if (userErrors?.length > 0) {
      return { filename, success: false, error: userErrors.map((e: any) => e.message).join(", ") };
    }

    const target = stagedResponse.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) {
      return { filename, success: false, error: "No staged upload target returned" };
    }

    const formData = new FormData();
    for (const param of target.parameters) {
      formData.append(param.name, param.value);
    }
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append("file", blob, filename);

    const uploadResponse = await fetch(target.url, { method: "POST", body: formData });
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      return { filename, success: false, error: `Upload failed (${uploadResponse.status}): ${errorText.substring(0, 200)}` };
    }

    const fileCreateMutation = `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            alt
            fileStatus
            ... on MediaImage {
              id
              image { url }
            }
            ... on GenericFile {
              id
              url
            }
          }
          userErrors { field message }
        }
      }
    `;

    const fileResponse = await shopifyGraphQL(fileCreateMutation, {
      files: [{
        alt: filename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
        contentType: resource,
        originalSource: target.resourceUrl,
        filename,
      }],
    });

    const createErrors = fileResponse.data?.fileCreate?.userErrors;
    if (createErrors?.length > 0) {
      return { filename, success: false, error: createErrors.map((e: any) => e.message).join(", ") };
    }

    const file = fileResponse.data?.fileCreate?.files?.[0];
    if (!file?.id) {
      return { filename, success: false, error: "No file ID returned" };
    }

    const imageUrl = file.image?.url || file.url || null;
    console.log(`[Shopify Files] Overlay uploaded: ${filename} -> ${file.id}`);
    return { filename, success: true, shopifyFileId: file.id, shopifyUrl: imageUrl };
  } catch (error: any) {
    console.error(`[Shopify Files] Overlay upload error for ${filename}:`, error);
    return { filename, success: false, error: error.message || "Unknown error" };
  }
}

// Cache for publications (sales channels)
let publicationsCache: Array<{ id: string; name: string }> = [];

async function fetchPublications(): Promise<Array<{ id: string; name: string }>> {
  if (publicationsCache.length > 0) {
    return publicationsCache;
  }

  try {
    // Query all publications (sales channels) available to the app
    const query = `
      query {
        publications(first: 50) {
          edges {
            node {
              id
              name
              supportsFuturePublishing
            }
          }
        }
      }
    `;

    console.log('[Shopify] Fetching publications...');
    const response = await shopifyGraphQL(query);
    
    console.log('[Shopify] Publications response:', JSON.stringify(response, null, 2));
    
    if (response.data?.publications?.edges) {
      publicationsCache = response.data.publications.edges.map((edge: any) => ({
        id: edge.node.id,
        name: edge.node.name,
      }));
      console.log(`[Shopify] Loaded ${publicationsCache.length} sales channels:`, publicationsCache.map(p => p.name).join(', '));
    } else if (response.errors) {
      console.error('[Shopify] Publications query errors:', response.errors);
    }
    
    return publicationsCache;
  } catch (error) {
    console.error('[Shopify] Failed to fetch publications:', error);
    return [];
  }
}

async function publishToAllChannels(productGID: string): Promise<boolean> {
  try {
    const publications = await fetchPublications();
    
    if (publications.length === 0) {
      console.log('[Shopify] No publications found to publish to');
      return false;
    }

    const mutation = `
      mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          publishable {
            availablePublicationsCount {
              count
            }
            resourcePublicationsCount {
              count
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      id: productGID,
      input: publications.map(pub => ({ publicationId: pub.id })),
    };

    const response = await shopifyGraphQL(mutation, variables);
    console.log('[Shopify] Publish response:', JSON.stringify(response, null, 2));

    if (response.errors) {
      console.error('[Shopify] Publish GraphQL errors:', response.errors);
      return false;
    }

    if (response.data?.publishablePublish?.userErrors?.length > 0) {
      console.error('[Shopify] Publish errors:', response.data.publishablePublish.userErrors);
      return false;
    }

    const publishedCount = response.data?.publishablePublish?.publishable?.resourcePublicationsCount?.count || 0;
    console.log(`[Shopify] Successfully published to ${publishedCount} sales channels`);
    return true;
  } catch (error) {
    console.error('[Shopify] Failed to publish to channels:', error);
    return false;
  }
}

// Cache for new-releases collection ID
let newReleasesCollectionId: string | null = null;

/**
 * Find the new-releases collection by handle
 */
async function findNewReleasesCollection(): Promise<string | null> {
  if (newReleasesCollectionId) {
    return newReleasesCollectionId;
  }

  try {
    const query = `
      query {
        collectionByHandle(handle: "new-releases") {
          id
          title
          handle
        }
      }
    `;

    const response = await shopifyGraphQL(query);
    
    if (response.data?.collectionByHandle?.id) {
      newReleasesCollectionId = response.data.collectionByHandle.id;
      console.log(`[Shopify] Found new-releases collection: ${newReleasesCollectionId}`);
      return newReleasesCollectionId;
    }
    
    console.log('[Shopify] new-releases collection not found');
    return null;
  } catch (error) {
    console.error('[Shopify] Error finding new-releases collection:', error);
    return null;
  }
}

/**
 * Add a product to the new-releases collection
 */
async function addProductToNewReleases(productGID: string): Promise<boolean> {
  try {
    const collectionId = await findNewReleasesCollection();
    if (!collectionId) {
      console.log('[Shopify] Skipping new-releases - collection not found');
      return false;
    }

    const mutation = `
      mutation CollectionAddProducts($id: ID!, $productIds: [ID!]!) {
        collectionAddProducts(id: $id, productIds: $productIds) {
          collection {
            id
            title
            productsCount {
              count
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      id: collectionId,
      productIds: [productGID],
    };

    const response = await shopifyGraphQL(mutation, variables);

    // Check for top-level GraphQL errors
    if (response.errors) {
      console.error('[Shopify] GraphQL errors adding to new-releases:', response.errors);
      return false;
    }

    if (response.data?.collectionAddProducts?.userErrors?.length > 0) {
      console.error('[Shopify] Failed to add to new-releases:', response.data.collectionAddProducts.userErrors);
      return false;
    }

    const productsCount = response.data?.collectionAddProducts?.collection?.productsCount?.count;
    console.log(`[Shopify] Added product to new-releases collection (total products: ${productsCount})`);
    return true;
  } catch (error) {
    console.error('[Shopify] Error adding to new-releases:', error);
    return false;
  }
}

async function fetchArtistMetaobjects(): Promise<Map<string, string>> {
  if (artistMetaobjectCache.size > 0) {
    return artistMetaobjectCache;
  }

  try {
    // First, find the correct metaobject definition for artists
    // The custom.artist metafield requires definition: gid://shopify/MetaobjectDefinition/13815087481
    const defQuery = `
      query {
        metaobjectDefinitions(first: 50) {
          edges {
            node {
              id
              type
              name
            }
          }
        }
      }
    `;
    
    const defResponse = await shopifyGraphQL(defQuery);
    let artistType = "artists"; // default
    
    if (defResponse.data?.metaobjectDefinitions?.edges) {
      for (const edge of defResponse.data.metaobjectDefinitions.edges) {
        const def = edge.node;
        // Log all definitions to find the right one
        console.log(`[Shopify] Metaobject definition: ${def.type} (${def.name}) - ${def.id}`);
        
        // Check if this is the artist definition
        if (def.id === 'gid://shopify/MetaobjectDefinition/13815087481') {
          artistType = def.type;
          artistMetaobjectType = def.type; // Store globally for creating new artists
          console.log(`[Shopify] Found artist definition type: ${artistType}`);
        }
      }
    }

    // Use GraphQL to query metaobjects of the correct type
    const query = `
      query($type: String!) {
        metaobjects(type: $type, first: 250) {
          edges {
            node {
              id
              handle
              displayName
              definition {
                id
              }
            }
          }
        }
      }
    `;

    const response = await shopifyGraphQL(query, { type: artistType });
    
    if (response.data?.metaobjects?.edges) {
      for (const edge of response.data.metaobjects.edges) {
        const { id, handle, displayName, definition } = edge.node;
        console.log(`[Shopify] Artist: ${displayName || handle} -> ${id} (def: ${definition?.id})`);
        // Map by handle and displayName for flexible matching
        artistMetaobjectCache.set(handle.toLowerCase(), id);
        if (displayName) {
          artistMetaobjectCache.set(displayName.toLowerCase(), id);
        }
      }
    }
    
    console.log(`[Shopify] Loaded ${artistMetaobjectCache.size} artist metaobjects`);
    return artistMetaobjectCache;
  } catch (error) {
    console.error('[Shopify] Failed to fetch artist metaobjects:', error);
    return artistMetaobjectCache;
  }
}

async function shopifyGraphQL(query: string, variables?: any): Promise<any> {
  if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    throw new Error('Shopify credentials not configured');
  }

  const url = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/graphql.json`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify GraphQL error (${response.status}): ${errorText}`);
  }

  return response.json();
}

function findArtistGID(artistName: string): string | null {
  const normalized = artistName.toLowerCase().trim();
  
  // Try exact match first
  if (artistMetaobjectCache.has(normalized)) {
    return artistMetaobjectCache.get(normalized) || null;
  }
  
  // Try slug match
  const slug = slugify(artistName);
  if (artistMetaobjectCache.has(slug)) {
    return artistMetaobjectCache.get(slug) || null;
  }
  
  // Try partial match
  for (const [key, gid] of Array.from(artistMetaobjectCache.entries())) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return gid;
    }
  }
  
  return null;
}

async function createArtistMetaobject(artistName: string): Promise<string | null> {
  try {
    const handle = slugify(artistName);
    
    const mutation = `
      mutation CreateArtist($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Use the correct metaobject type from the definition
    console.log(`[Shopify] Creating artist with type: ${artistMetaobjectType}`);
    const variables = {
      metaobject: {
        type: artistMetaobjectType,
        handle: handle,
        fields: [
          {
            key: "name",
            value: artistName,
          },
        ],
      },
    };

    const response = await shopifyGraphQL(mutation, variables);
    
    if (response.data?.metaobjectCreate?.userErrors?.length > 0) {
      const errors = response.data.metaobjectCreate.userErrors;
      console.error('[Shopify] Failed to create artist metaobject:', errors);
      return null;
    }
    
    const newArtist = response.data?.metaobjectCreate?.metaobject;
    if (newArtist) {
      console.log(`[Shopify] Created new artist metaobject: ${artistName} (${newArtist.id})`);
      // Add to cache
      artistMetaobjectCache.set(handle.toLowerCase(), newArtist.id);
      artistMetaobjectCache.set(artistName.toLowerCase(), newArtist.id);
      return newArtist.id;
    }
    
    return null;
  } catch (error) {
    console.error('[Shopify] Error creating artist metaobject:', error);
    return null;
  }
}

async function getOrCreateArtistGID(artistName: string): Promise<string | null> {
  let gid = findArtistGID(artistName);
  
  if (gid) {
    return gid;
  }
  
  // Not in cache — refresh from Shopify in case it was created externally (e.g. artist setup)
  console.log(`[Shopify] Artist "${artistName}" not in cache, refreshing from Shopify...`);
  artistMetaobjectCache.clear();
  await fetchArtistMetaobjects();
  
  gid = findArtistGID(artistName);
  if (gid) {
    console.log(`[Shopify] Found artist "${artistName}" after cache refresh: ${gid}`);
    return gid;
  }
  
  // Still not found after fresh fetch — create new artist metaobject
  console.log(`[Shopify] Artist "${artistName}" not found in Shopify, creating new metaobject...`);
  gid = await createArtistMetaobject(artistName);
  
  return gid;
}

function artworkRatioToMetafieldKey(aspectRatio: string): string | null {
  const s = aspectRatio.trim().toLowerCase();
  if (s.includes("a ratio") || s.includes("√2") || s.includes("5:7")) return "ar_image_a_ratio";
  if (s.includes("3:4") || s.includes("4:3")) return "ar_image_3x4";
  if (s.includes("2:3") || s.includes("3:2")) return "ar_image_2x3";
  if (s.includes("4:5") || s.includes("5:4")) return "ar_image_4x5";
  if (s.includes("1:1") || s.includes("square")) return "ar_image_1x1";
  if (s.includes("11:14") || s.includes("14:11")) return "ar_image_11x14";
  return null;
}

export async function syncProductToShopify(
  artwork: Artwork,
  mockups: Mockup[],
  variantConfigs: VariantConfig[],
  aiMetadata?: ArtworkMetadata | null,
  generateAI: boolean = false,
  settings?: FormSettings | null,
  groupedArtworks?: Artwork[]
): Promise<ProductSyncResult> {
  try {
    console.log(`[Shopify] Starting sync for artwork: ${artwork.title}`);

    // Fetch artist metaobjects from Shopify (cached after first call)
    await fetchArtistMetaobjects();
    
    // Log metafield definitions for debugging (first sync only)
    if (artistMetaobjectCache.size > 0) {
      await getProductMetafieldDefinitions();
    }

    const handle = generateHandle(artwork.title, artwork.artistName);
    const isLimitedEdition = artwork.editionType === 'limited';
    
    const searchTitle = `${artwork.title} - ${artwork.artistName}`;
    console.log(`[Shopify] Checking for existing product with handle: "${handle}" or title containing: "${searchTitle}"`);
    
    // Check if product already exists using GraphQL (more reliable than REST for all statuses)
    try {
      const graphqlQuery = `{
        products(first: 5, query: "title:${searchTitle.replace(/"/g, '\\"')}") {
          edges {
            node {
              id
              title
              handle
              status
            }
          }
        }
      }`;
      
      const graphqlResponse = await shopifyGraphQL(graphqlQuery);
      console.log(`[Shopify] GraphQL title search response: ${JSON.stringify(graphqlResponse)}`);
      
      if (graphqlResponse.data?.products?.edges?.length > 0) {
        // Check for exact title match
        const exactMatch = graphqlResponse.data.products.edges.find(
          (edge: any) => edge.node.title === searchTitle
        );
        
        if (exactMatch) {
          const productGid = exactMatch.node.id;
          const productId = productGid.replace('gid://shopify/Product/', '');
          console.log(`[Shopify] Product already exists (by title): "${exactMatch.node.title}" (ID: ${productId}, status: ${exactMatch.node.status}), skipping...`);
          return {
            success: true,
            productId: parseInt(productId),
            productUrl: `https://${SHOPIFY_SHOP_DOMAIN}/admin/products/${productId}`,
            skipped: true,
          };
        }
      }
      
      console.log(`[Shopify] No existing product found, proceeding with creation`);
    } catch (checkError) {
      console.error('[Shopify] Error checking for existing product:', checkError);
      // Continue with creation if check fails
    }
    
    // Generate AI metadata if not provided and generateAI is true
    let generatedAiMetadata: ArtworkMetadata | undefined = aiMetadata || undefined;
    
    if (!generatedAiMetadata && generateAI && artwork.lowResFileUrl) {
      try {
        console.log(`[Shopify] Generating AI metadata for: ${artwork.title}`);
        
        // Prepare AI options from settings
        const aiOptions: MetadataOptions | undefined = settings ? {
          colourOptions: settings.colourOptions || [],
          moodOptions: settings.moodOptions || [],
          styleOptions: settings.styleOptions || [],
          themeOptions: settings.themeOptions || [],
          bodyHTMLPrompt: settings.aiPrompts?.bodyHTMLPrompt,
          titleTagPrompt: settings.aiPrompts?.titleTagPrompt,
          descriptionTagPrompt: settings.aiPrompts?.descriptionTagPrompt,
        } : undefined;
        
        // Download image from object storage and send as base64
        const objectStorageService = new ObjectStorageService();
        const imageBuffer = await objectStorageService.downloadFileAsBuffer(artwork.lowResFileUrl);
        
        console.log(`[Shopify] Downloaded ${imageBuffer.length} bytes, sending to OpenAI for analysis`);
        
        generatedAiMetadata = await generateArtworkMetadataFromFile(
          imageBuffer,
          artwork.title,
          artwork.artistName,
          aiOptions
        );
        
        console.log(`[Shopify] AI metadata generated - colours: ${generatedAiMetadata.colours?.length || 0}, styles: ${generatedAiMetadata.styles?.length || 0}, moods: ${generatedAiMetadata.moods?.length || 0}, themes: ${generatedAiMetadata.themes?.length || 0}`);
      } catch (error) {
        console.error(`[Shopify] Failed to generate AI metadata:`, error);
        // Continue without AI metadata
      }
    }
    
    const bodyHTML = generatedAiMetadata?.bodyHTML || `<p>${artwork.description || ''}</p>`;
    
    const tags: string[] = [
      artwork.artistName,
      isLimitedEdition ? 'Limited Edition' : 'Open Edition',
      ...((artwork.styleTags && artwork.styleTags.length > 0) ? artwork.styleTags : (generatedAiMetadata?.styles || [])),
      ...((artwork.moodTags && artwork.moodTags.length > 0) ? artwork.moodTags : (generatedAiMetadata?.moods || [])),
      ...((artwork.themeTags && artwork.themeTags.length > 0) ? artwork.themeTags : (generatedAiMetadata?.themes || [])),
      ...(artwork.tags || []),
    ].filter(Boolean);

    const images: ShopifyImage[] = [];
    const imageMap = new Map<string, ShopifyImage>();
    const frameOrder = ['Black Frame', 'White Frame', 'Natural Frame'];
    
    // Track frame type by position for reliable matching after Shopify upload
    const frameTypeByPosition = new Map<number, string>();
    
    if (!isLimitedEdition) {
      for (const frameType of frameOrder) {
        const mockup = mockups.find(m => m.frameType === frameType && !m.isLifestyle);
        if (mockup) {
          const baseAltText = generateAI 
            ? await generateImageAltText(artwork.title, artwork.artistName, frameType, false)
            : `${artwork.title} by ${artwork.artistName}, fine art print in ${frameType.toLowerCase()}`;
          const altText = `${baseAltText} |frame=${frameType}|`;
          const position = images.length + 1;
          const resolved = await resolveImageForShopify(mockup.mockupImageUrl);
          const image: ShopifyImage = {
            ...resolved,
            alt: altText,
            position,
          };
          images.push(image);
          imageMap.set(frameType, image);
          frameTypeByPosition.set(position, frameType);
          console.log(`[Shopify] Mapped ${frameType} -> mockup ${mockup.id}, position=${position}, isLifestyle=${mockup.isLifestyle}`);
        } else {
          // Log when no matching mockup is found for debugging
          const availableFrameTypes = mockups.map(m => `${m.frameType}(lifestyle=${m.isLifestyle})`).join(', ');
          console.log(`[Shopify] No mockup found for ${frameType} on artwork ${artwork.id}. Available: ${availableFrameTypes}`);
        }
      }
    }

    const lifestyleMockups = mockups.filter(m => m.isLifestyle);
    for (const lifestyle of lifestyleMockups) {
      const baseAltText = generateAI
        ? await generateImageAltText(artwork.title, artwork.artistName, 'Lifestyle', true)
        : `${artwork.title} by ${artwork.artistName}, fine art print in styled interior`;
      const altText = `${baseAltText} |type=lifestyle|`;
      const resolved = await resolveImageForShopify(lifestyle.mockupImageUrl);
      images.push({
        ...resolved,
        alt: altText,
        position: images.length + 1,
      });
    }

    const unframedMockup = mockups.find(m => m.frameType === 'Unframed' && !m.isLifestyle);
    if (unframedMockup) {
      const baseAltText = generateAI
        ? await generateImageAltText(artwork.title, artwork.artistName, 'Unframed', false)
        : `${artwork.title} by ${artwork.artistName}, unframed fine art print`;
      const altText = `${baseAltText} |frame=Unframed|`;
      const position = images.length + 1;
      const resolved = await resolveImageForShopify(unframedMockup.mockupImageUrl);
      const image: ShopifyImage = {
        ...resolved,
        alt: altText,
        position,
      };
      images.push(image);
      imageMap.set('Unframed', image);
      frameTypeByPosition.set(position, 'Unframed');
    }

    const variants: ShopifyVariant[] = [];
    const sizeValues: string[] = [];
    const frameValues: string[] = [];

    const frameOptions = isLimitedEdition 
      ? ['Unframed'] 
      : ['Black Frame', 'White Frame', 'Natural Frame', 'Unframed'];

    const sortedSizes = sortSizesByRatioAndArea(artwork.availableSizes);

    for (const sizeCode of sortedSizes) {
      const sizeName = getSizeNameFromCode(sizeCode);

      for (const frameOption of frameOptions) {
        const configFrameType = frameOption === 'Unframed' ? 'Unframed' : 'Framed';
        const config = getConfigForVariant(sizeName, configFrameType, variantConfigs);
        
        if (!config) {
          console.log(`[Shopify] Skipping variant ${sizeName} / ${frameOption} - no config found`);
          continue;
        }
        
        if (!sizeValues.includes(sizeName)) {
          sizeValues.push(sizeName);
        }
        if (!frameValues.includes(frameOption)) {
          frameValues.push(frameOption);
        }

        const price = isLimitedEdition && config.limitedEditionPriceGBP 
          ? config.limitedEditionPriceGBP / 100 
          : config.priceGBP / 100;
        
        variants.push({
          option1: sizeName,
          option2: frameOption,
          price: price.toFixed(2),
          sku: `${handle.substring(0, 20).toUpperCase()}-${sizeCode}-${frameOption.replace(/\s+/g, '').substring(0, 3).toUpperCase()}`,
          weight: config.weightGrams,
          weight_unit: 'g',
          inventory_policy: 'continue',
          fulfillment_service: 'manual',
          requires_shipping: true,
          taxable: true,
        });
      }
    }

    if (variants.length === 0) {
      return {
        success: false,
        error: 'No valid variants could be created (missing pricing configurations)',
      };
    }

    const options: ShopifyOption[] = [
      { name: 'Size', values: sizeValues },
    ];
    
    if (frameValues.length > 1) {
      options.push({ name: 'Frame', values: frameValues });
    }

    // Build metafields for the product - we'll add them via GraphQL after product creation
    // to avoid REST API limitations with certain metafield types
    const pendingMetafields: { namespace: string; key: string; value: string; type: string }[] = [
      {
        namespace: 'custom',
        key: 'artist_name',
        value: artwork.artistName,
        type: 'multi_line_text_field',
      },
      {
        namespace: 'custom',
        key: 'shape',
        value: JSON.stringify([determineShape(artwork)]),
        type: 'list.single_line_text_field',
      },
      {
        namespace: 'custom',
        key: 'space',
        value: JSON.stringify(['Living Room', 'Kitchen', 'Office', 'Hallway', 'Bedroom', 'Dining Room', 'Bathroom']),
        type: 'list.single_line_text_field',
      },
      {
        namespace: 'custom',
        key: 'has_mount',
        value: artwork.hasMount ? 'Yes' : 'No',
        type: 'single_line_text_field',
      },
    ];

    // Add artist metaobject reference - find existing or create new
    // NOTE: The metaobject_reference type has constraints that may need special handling
    const artistGID = await getOrCreateArtistGID(artwork.artistName);
    if (artistGID) {
      console.log(`[Shopify] Found artist GID for ${artwork.artistName}: ${artistGID}`);
      // Skip artist metaobject reference for now - has constraint issues
      // Will add via separate metafieldsSet mutation
    } else {
      console.log(`[Shopify] Could not find or create artist metaobject for "${artwork.artistName}"`);
    }

    if (artwork.artworkStory) {
      pendingMetafields.push({
        namespace: 'custom',
        key: 'artwork_story',
        value: artwork.artworkStory,
        type: 'multi_line_text_field',
      });
    }

    const isExclusive = !settings?.nonExclusiveArtists?.includes(artwork.artistName);
    if (isExclusive) {
      pendingMetafields.push({
        namespace: 'custom',
        key: 'exclusivity',
        value: 'Exclusive to East Side Studio London',
        type: 'single_line_text_field',
      });
    }
    
    // Temporarily disable ALL metafields to test basic product creation
    // TODO: Add metafields back via GraphQL mutation after product creation
    const metafields: ShopifyMetafield[] = [];
    console.log(`[Shopify] DEBUG: Skipping ${pendingMetafields.length} metafields for now`);
    
    // Store pending metafields for later - these will be added via GraphQL
    const allPendingMetafields = [...pendingMetafields];
    
    // Log AI metadata for debugging
    console.log(`[Shopify] AI metadata:`, generatedAiMetadata ? {
      colours: generatedAiMetadata.colours?.length || 0,
      moods: generatedAiMetadata.moods?.length || 0,
      styles: generatedAiMetadata.styles?.length || 0,
      themes: generatedAiMetadata.themes?.length || 0,
      titleTag: generatedAiMetadata.titleTag ? 'present' : 'missing',
      descriptionTag: generatedAiMetadata.descriptionTag ? 'present' : 'missing',
    } : 'null');
    
    const finalColours = (artwork.colourTags && artwork.colourTags.length > 0) ? artwork.colourTags : generatedAiMetadata?.colours;
    const finalMoods = (artwork.moodTags && artwork.moodTags.length > 0) ? artwork.moodTags : generatedAiMetadata?.moods;
    const finalStyles = (artwork.styleTags && artwork.styleTags.length > 0) ? artwork.styleTags : generatedAiMetadata?.styles;
    const finalThemes = (artwork.themeTags && artwork.themeTags.length > 0) ? artwork.themeTags : generatedAiMetadata?.themes;

    if (finalColours?.length) {
      allPendingMetafields.push({
        namespace: 'custom',
        key: 'colour',
        value: JSON.stringify(finalColours),
        type: 'list.single_line_text_field',
      });
    }

    if (finalMoods?.length) {
      allPendingMetafields.push({
        namespace: 'custom',
        key: 'mood',
        value: JSON.stringify(finalMoods),
        type: 'list.single_line_text_field',
      });
    }

    if (finalStyles?.length) {
      allPendingMetafields.push({
        namespace: 'custom',
        key: 'style',
        value: JSON.stringify(finalStyles),
        type: 'list.single_line_text_field',
      });
    }

    if (finalThemes?.length) {
      allPendingMetafields.push({
        namespace: 'custom',
        key: 'themes',
        value: JSON.stringify(finalThemes),
        type: 'list.single_line_text_field',
      });
    }

    if (generatedAiMetadata?.titleTag) {
      allPendingMetafields.push({
        namespace: 'global',
        key: 'title_tag',
        value: generatedAiMetadata.titleTag,
        type: 'single_line_text_field',
      });
    }

    if (generatedAiMetadata?.descriptionTag) {
      allPendingMetafields.push({
        namespace: 'global',
        key: 'description_tag',
        value: generatedAiMetadata.descriptionTag,
        type: 'single_line_text_field',
      });
    }
    
    console.log(`[Shopify] Total pending metafields to add after product creation: ${allPendingMetafields.length}`);

    const productTitle = `${artwork.title} - ${artwork.artistName}${isLimitedEdition ? ' - Limited Edition' : ''}`;

    const productData: ShopifyProduct = {
      title: productTitle,
      body_html: bodyHTML,
      vendor: artwork.artistName,
      product_type: 'Posters, Prints, & Visual Artwork',
      tags,
      status: 'draft',
      template_suffix: isLimitedEdition ? 'limitededition-aug25' : 'main-product-template',
      variants,
      images,
      options,
      metafields,
    };

    console.log(`[Shopify] Creating product with ${variants.length} variants and ${images.length} images`);

    const response: ShopifyAPIResponse = await shopifyRequest('products.json', 'POST', { product: productData });

    if (response.errors) {
      console.error('[Shopify] API errors:', response.errors);
      return {
        success: false,
        error: JSON.stringify(response.errors),
      };
    }

    const productId = response.product?.id;
    const productUrl = productId 
      ? `https://${SHOPIFY_SHOP_DOMAIN}/admin/products/${productId}`
      : undefined;

    console.log(`[Shopify] Successfully created product ID: ${productId}`);

    // Link images to variants by frame type
    if (productId && response.product?.images && response.product?.variants) {
      // API response includes `id` fields not in our creation interfaces
      const createdImages = response.product.images as unknown as Array<{ id: number; alt?: string }>;
      const createdVariants = response.product.variants as unknown as Array<{ id: number; option1: string; option2?: string }>;
      
      console.log(`[Shopify] Linking images to variants: ${createdImages.length} images, ${createdVariants.length} variants`);
      
      // Debug: Log all images returned from Shopify with their alt texts
      console.log(`[Shopify] Images returned from Shopify:`);
      for (let i = 0; i < createdImages.length; i++) {
        const img = createdImages[i] as any;
        console.log(`  [${i}] id=${img.id}, position=${img.position}, alt="${img.alt || '(none)'}"`);
      }
      
      // Build a map from frame type to image ID by matching the machine-readable token |frame=XXX|
      const frameToImageId = new Map<string, number>();
      const frameTokenRegex = /\|frame=([^|]+)\|/;
      
      for (const img of createdImages) {
        const alt = img.alt || '';
        const match = alt.match(frameTokenRegex);
        if (match) {
          const frameType = match[1]; // e.g., "Black Frame", "White Frame", "Natural Frame", "Unframed"
          console.log(`[Shopify] Token match: |frame=${frameType}| -> image ID ${img.id}`);
          frameToImageId.set(frameType, img.id);
        } else if (alt.includes('|type=lifestyle|')) {
          console.log(`[Shopify] Lifestyle image (no frame match): image ID ${img.id}`);
        } else {
          console.log(`[Shopify] No token found in alt: "${alt}" (image ID ${img.id})`);
        }
      }
      
      console.log(`[Shopify] Frame to image mapping:`, Object.fromEntries(frameToImageId));
      
      // Update each variant with the correct image_id
      for (const variant of createdVariants) {
        const frameOption = variant.option2; // Frame is option2
        if (!frameOption) continue;
        
        const imageId = frameToImageId.get(frameOption);
        
        if (imageId) {
          try {
            console.log(`[Shopify] Updating variant ${variant.id} with image_id ${imageId}...`);
            const updateResponse = await shopifyRequest(`variants/${variant.id}.json`, 'PUT', {
              variant: { id: variant.id, image_id: imageId }
            });
            console.log(`[Shopify] Variant update response:`, JSON.stringify(updateResponse, null, 2));
            if (updateResponse.variant?.image_id === imageId) {
              console.log(`[Shopify] ✓ Linked variant ${variant.id} (${variant.option1} / ${frameOption}) to image ${imageId}`);
            } else {
              console.log(`[Shopify] ⚠ image_id in response: ${updateResponse.variant?.image_id}, expected: ${imageId}`);
            }
          } catch (linkError) {
            console.error(`[Shopify] ✗ Failed to link variant ${variant.id}:`, linkError);
          }
        }
      }
    }

    // Add metafields via GraphQL after product creation
    if (productId && allPendingMetafields.length > 0) {
      console.log(`[Shopify] Adding ${allPendingMetafields.length} metafields via GraphQL...`);
      
      const productGID = `gid://shopify/Product/${productId}`;
      
      // Convert metafields to GraphQL format
      const metafieldInputs = allPendingMetafields.map(mf => ({
        namespace: mf.namespace,
        key: mf.key,
        value: mf.value,
        type: mf.type,
      }));
      
      // Category: "Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork"
      const ARTWORK_CATEGORY_GID = "gid://shopify/TaxonomyCategory/hg-3-4-2";
      
      const mutation = `
        mutation UpdateProductMetafields($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
              category {
                id
                fullName
              }
              metafields(first: 50) {
                edges {
                  node {
                    namespace
                    key
                    value
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
      
      const variables = {
        input: {
          id: productGID,
          category: ARTWORK_CATEGORY_GID,
          metafields: metafieldInputs,
        },
      };
      
      try {
        const gqlResponse = await shopifyGraphQL(mutation, variables);
        
        if (gqlResponse.data?.productUpdate?.userErrors?.length > 0) {
          console.error('[Shopify] Metafield update errors:', gqlResponse.data.productUpdate.userErrors);
          // Log individual errors but don't fail the whole sync
          for (const err of gqlResponse.data.productUpdate.userErrors) {
            console.error(`  - ${err.field}: ${err.message}`);
          }
        } else {
          const addedCount = gqlResponse.data?.productUpdate?.product?.metafields?.edges?.length || 0;
          const categoryResult = gqlResponse.data?.productUpdate?.product?.category;
          if (categoryResult) {
            console.log(`[Shopify] Category set to: ${categoryResult.fullName} (${categoryResult.id})`);
          } else {
            console.log(`[Shopify] Category not set - check if category field is supported`);
          }
          console.log(`[Shopify] Successfully added ${addedCount} metafields`);
        }
      } catch (gqlError) {
        console.error('[Shopify] GraphQL metafield update failed:', gqlError);
        // Don't fail the whole sync, product was created successfully
      }
      
      // Add artist metaobject reference via metafieldsSet mutation (separate approach)
      if (artistGID) {
        console.log(`[Shopify] Adding artist metaobject reference via metafieldsSet...`);
        
        const metafieldsSetMutation = `
          mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              metafields {
                id
                namespace
                key
                value
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        
        const setVariables = {
          metafields: [{
            ownerId: productGID,
            namespace: 'custom',
            key: 'artist',
            value: artistGID,
            type: 'metaobject_reference',
          }],
        };
        
        try {
          const setResponse = await shopifyGraphQL(metafieldsSetMutation, setVariables);
          
          if (setResponse.data?.metafieldsSet?.userErrors?.length > 0) {
            console.error('[Shopify] Artist metafield errors:', setResponse.data.metafieldsSet.userErrors);
          } else if (setResponse.data?.metafieldsSet?.metafields?.length > 0) {
            console.log(`[Shopify] Successfully added artist reference metafield`);
          }
        } catch (setError) {
          console.error('[Shopify] Artist metafield set failed:', setError);
        }
      }
      
      // Upload low-res image to Shopify Files and set wav_image metafield
      if (artwork.lowResFileUrl) {
        console.log(`[Shopify] Uploading low-res image for wav_image metafield...`);
        try {
          // Download the low-res image from object storage
          const objectStorageService = new ObjectStorageService();
          const lowResBuffer = await objectStorageService.downloadFileAsBuffer(artwork.lowResFileUrl);
          
          // Generate a clean filename for Shopify Files
          const wavImageFilename = `Low_Res_${slugify(artwork.artistName)}_${slugify(artwork.title)}.jpg`;
          
          // Upload to Shopify Files
          const fileGID = await uploadToShopifyFiles(lowResBuffer, wavImageFilename);
          
          if (fileGID) {
            // Set the wav_image metafield with the file reference
            const wavImageMutation = `
              mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                  metafields {
                    id
                    namespace
                    key
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `;
            
            const wavImageVariables = {
              metafields: [{
                ownerId: productGID,
                namespace: 'custom',
                key: 'wav_image',
                value: fileGID,
                type: 'file_reference',
              }],
            };
            
            const wavResponse = await shopifyGraphQL(wavImageMutation, wavImageVariables);
            
            if (wavResponse.data?.metafieldsSet?.userErrors?.length > 0) {
              console.error('[Shopify] wav_image metafield errors:', wavResponse.data.metafieldsSet.userErrors);
            } else if (wavResponse.data?.metafieldsSet?.metafields?.length > 0) {
              console.log(`[Shopify] Successfully set wav_image metafield`);
            }
          } else {
            console.warn('[Shopify] Failed to upload low-res image to Shopify Files');
          }
        } catch (wavError) {
          console.error('[Shopify] wav_image setup failed:', wavError);
          // Don't fail the whole sync for this
        }
      } else {
        console.log('[Shopify] No low-res image available for wav_image metafield');
      }

      if (groupedArtworks && groupedArtworks.length > 1) {
        console.log(`[Shopify] Setting ratio-specific AR images for ${groupedArtworks.length} grouped artworks...`);
        const objectStorageService = new ObjectStorageService();
        const ratioMetafields: Array<{ namespace: string; key: string; value: string; type: string }> = [];

        for (const groupArtwork of groupedArtworks) {
          if (!groupArtwork.lowResFileUrl) continue;
          const metafieldKey = artworkRatioToMetafieldKey(groupArtwork.aspectRatio);
          if (!metafieldKey) {
            console.log(`[Shopify] No AR metafield key for ratio "${groupArtwork.aspectRatio}", skipping`);
            continue;
          }

          try {
            const lowResBuffer = await objectStorageService.downloadFileAsBuffer(groupArtwork.lowResFileUrl);
            const ratioSlug = groupArtwork.aspectRatio.replace(/[^a-zA-Z0-9]+/g, '_');
            const arFilename = `LowRes_${slugify(groupArtwork.artistName)}_${slugify(groupArtwork.title)}_${ratioSlug}.jpg`;
            const fileGID = await uploadToShopifyFiles(lowResBuffer, arFilename);

            if (fileGID) {
              ratioMetafields.push({
                namespace: 'custom',
                key: metafieldKey,
                value: fileGID,
                type: 'file_reference',
              });
              console.log(`[Shopify] Prepared ${metafieldKey} for "${groupArtwork.aspectRatio}" (${groupArtwork.title})`);
            }
          } catch (ratioErr: any) {
            console.error(`[Shopify] Failed to upload AR image for ${metafieldKey}:`, ratioErr?.message);
          }
        }

        if (ratioMetafields.length > 0) {
          try {
            const ratioMutation = `
              mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                  metafields { id namespace key }
                  userErrors { field message }
                }
              }
            `;
            const ratioVariables = {
              metafields: ratioMetafields.map(m => ({ ownerId: productGID, ...m })),
            };
            const ratioResponse = await shopifyGraphQL(ratioMutation, ratioVariables);
            if (ratioResponse.data?.metafieldsSet?.userErrors?.length > 0) {
              console.error('[Shopify] Ratio AR image metafield errors:', ratioResponse.data.metafieldsSet.userErrors);
            } else {
              console.log(`[Shopify] Successfully set ${ratioMetafields.length} ratio-specific AR image metafields`);
            }
          } catch (ratioSetErr: any) {
            console.error('[Shopify] Failed to set ratio AR metafields:', ratioSetErr?.message);
          }
        }
      }
      
      const scanVideoMockup = mockups.find(m => m.frameType === "Scan Video" && !m.isLifestyle);
      if (scanVideoMockup && scanVideoMockup.mockupImageUrl) {
        console.log(`[Shopify Video] Found scan video mockup, uploading to product...`);
        try {
          let videoBuffer: Buffer;
          const videoUrl = scanVideoMockup.mockupImageUrl;
          if (videoUrl.startsWith("/objects/") || videoUrl.startsWith("/objects")) {
            const objectStorageService = new ObjectStorageService();
            videoBuffer = await objectStorageService.downloadFileAsBuffer(videoUrl);
          } else if (videoUrl.startsWith("http")) {
            const videoResponse = await fetch(videoUrl);
            if (!videoResponse.ok) throw new Error(`Failed to fetch video from URL: ${videoResponse.status}`);
            videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
          } else {
            console.warn(`[Shopify Video] Unsupported video URL format: ${videoUrl}`);
            throw new Error(`Unsupported video URL format`);
          }
          const videoFilename = `Scan_Video_${slugify(artwork.artistName)}_${slugify(artwork.title)}.mp4`;
          const videoAltText = `Close-up detail scan of "${artwork.title}" by ${artwork.artistName}`;

          const videoSuccess = await uploadVideoToShopifyProduct(
            videoBuffer,
            videoFilename,
            productGID,
            videoAltText,
          );

          if (videoSuccess) {
            console.log(`[Shopify Video] Scan video attached to product successfully`);
          } else {
            console.warn(`[Shopify Video] Failed to attach scan video to product`);
          }
        } catch (videoError) {
          console.error('[Shopify Video] Scan video upload failed:', videoError);
        }
      } else {
        console.log('[Shopify Video] No scan video mockup found for this artwork');
      }

      // Publish to all sales channels
      console.log('[Shopify] Publishing to all sales channels...');
      await publishToAllChannels(productGID);
      
      // Add to new-releases collection
      console.log('[Shopify] Adding to new-releases collection...');
      await addProductToNewReleases(productGID);
    }

    return {
      success: true,
      productId,
      productUrl,
    };
  } catch (error) {
    console.error('[Shopify] Sync error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function syncBatchToShopify(
  products: Array<{
    artwork: Artwork;
    mockups: Mockup[];
    variantConfigs: VariantConfig[];
    aiMetadata?: ArtworkMetadata | null;
    groupedArtworks?: Artwork[];
  }>,
  generateAI: boolean = false,
  settings?: FormSettings | null
): Promise<{
  successful: number;
  failed: number;
  skipped: number;
  results: ProductSyncResult[];
}> {
  const results: ProductSyncResult[] = [];
  let successful = 0;
  let failed = 0;
  let skipped = 0;

  for (const product of products) {
    await new Promise(resolve => setTimeout(resolve, 500));

    const result = await syncProductToShopify(
      product.artwork,
      product.mockups,
      product.variantConfigs,
      product.aiMetadata,
      generateAI,
      settings,
      product.groupedArtworks
    );

    results.push(result);
    if (result.success) {
      if (result.skipped) {
        skipped++;
      } else {
        successful++;
      }
    } else {
      failed++;
    }
  }

  return { successful, failed, skipped, results };
}

export async function queryTaxonomyCategory(): Promise<any> {
  // Search for artwork-related categories
  const query = `
    query {
      taxonomy {
        categories(first: 100, search: "Posters Prints Visual Artwork") {
          edges {
            node {
              id
              fullName
              name
              level
            }
          }
        }
      }
    }
  `;
  const response = await shopifyGraphQL(query);
  console.log('[Shopify] Taxonomy search:', JSON.stringify(response, null, 2));
  
  return response.data?.taxonomy?.categories?.edges?.map((e: any) => ({
    id: e.node.id,
    fullName: e.node.fullName,
    name: e.node.name,
    level: e.node.level
  })) || [];
}

export async function testShopifyConnection(): Promise<{ success: boolean; shopName?: string; error?: string }> {
  try {
    const response = await shopifyRequest('shop.json');
    return {
      success: true,
      shopName: response.shop?.name,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getProductMetafieldDefinitions(): Promise<any[]> {
  try {
    const query = `
      query {
        metafieldDefinitions(ownerType: PRODUCT, first: 100) {
          edges {
            node {
              id
              name
              namespace
              key
              type {
                name
              }
              validations {
                name
                value
              }
            }
          }
        }
      }
    `;

    const response = await shopifyGraphQL(query);
    const definitions = response.data?.metafieldDefinitions?.edges?.map((e: any) => e.node) || [];
    
    console.log('[Shopify] Product metafield definitions:');
    for (const def of definitions) {
      console.log(`  - ${def.namespace}.${def.key}: ${def.type.name}`, def.validations);
    }
    
    return definitions;
  } catch (error) {
    console.error('[Shopify] Failed to fetch metafield definitions:', error);
    return [];
  }
}

export interface ShopifyProductForImport {
  id: string;
  title: string;
  vendor: string;
  status: string;
  featuredImageUrl: string | null;
  createdAt: string;
}

export async function getProductById(productId: string): Promise<{ id: string; handle: string; title: string } | null> {
  try {
    // Ensure productId is in GID format
    const gid = productId.startsWith('gid://') ? productId : `gid://shopify/Product/${productId}`;
    
    const query = `
      query GetProduct($id: ID!) {
        product(id: $id) {
          id
          handle
          title
        }
      }
    `;
    
    const response = await shopifyGraphQL(query, { id: gid });
    
    if (response?.data?.product) {
      return {
        id: response.data.product.id,
        handle: response.data.product.handle,
        title: response.data.product.title,
      };
    }
    return null;
  } catch (error) {
    console.error(`[Shopify] Error fetching product ${productId}:`, error);
    return null;
  }
}

export async function getProductsByVendor(vendor: string): Promise<ShopifyProductForImport[]> {
  try {
    const products: ShopifyProductForImport[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const query = `
        query GetProductsByVendor($vendor: String!, $cursor: String) {
          products(first: 50, after: $cursor, query: $vendor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                vendor
                status
                createdAt
                featuredImage {
                  url
                }
              }
            }
          }
        }
      `;

      const response = await shopifyGraphQL(query, { vendor: `vendor:"${vendor}"`, cursor });
      
      const productData = response.data?.products;
      if (!productData) break;

      for (const edge of productData.edges) {
        const node = edge.node;
        if (node.vendor === vendor) {
          products.push({
            id: node.id,
            title: node.title,
            vendor: node.vendor,
            status: node.status,
            featuredImageUrl: node.featuredImage?.url || null,
            createdAt: node.createdAt,
          });
        }
      }

      hasNextPage = productData.pageInfo.hasNextPage;
      cursor = productData.pageInfo.endCursor;
    }

    console.log(`[Shopify] Found ${products.length} products for vendor "${vendor}"`);
    return products;
  } catch (error) {
    console.error(`[Shopify] Failed to fetch products for vendor "${vendor}":`, error);
    throw error;
  }
}

export async function getShopifyVendors(): Promise<string[]> {
  try {
    const vendors = new Set<string>();
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const query = `
        query GetVendors($cursor: String) {
          products(first: 250, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                vendor
              }
            }
          }
        }
      `;

      const response = await shopifyGraphQL(query, { cursor });
      
      const products = response.data?.products;
      if (!products) break;

      for (const edge of products.edges) {
        const vendor = edge.node.vendor;
        if (vendor && vendor.trim()) {
          vendors.add(vendor.trim());
        }
      }

      hasNextPage = products.pageInfo.hasNextPage;
      cursor = products.pageInfo.endCursor;
    }

    const vendorList = Array.from(vendors).sort();
    console.log(`[Shopify] Found ${vendorList.length} unique vendors`);
    return vendorList;
  } catch (error) {
    console.error('[Shopify] Failed to fetch vendors:', error);
    throw error;
  }
}

export interface ARImageReportItem {
  productId: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  status: string;
  hasArImage: boolean;
  arImageUrl: string | null;
  salesCount: number;
  createdAt: string;
}

export interface ARImageReport {
  total: number;
  withArImage: number;
  withoutArImage: number;
  products: ARImageReportItem[];
}

/**
 * Fetch product sales counts from recent orders
 */
async function getProductSalesCounts(): Promise<Map<string, number>> {
  const salesCounts = new Map<string, number>();
  
  try {
    console.log('[Shopify] Fetching product sales data...');
    
    let hasNextPage = true;
    let cursor: string | null = null;
    let totalOrders = 0;

    // Fetch orders from the last 12 months for best seller calculation
    while (hasNextPage) {
      const query = `
        query($cursor: String) {
          orders(first: 100, after: $cursor, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                lineItems(first: 50) {
                  edges {
                    node {
                      product {
                        id
                      }
                      quantity
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      const response = await shopifyGraphQL(query, { cursor });
      
      if (response.errors) {
        console.error('[Shopify] Sales count query errors:', response.errors);
        break; // Continue without sales data if this fails
      }

      const orderEdges = response.data?.orders?.edges || [];
      totalOrders += orderEdges.length;
      
      for (const orderEdge of orderEdges) {
        const lineItems = orderEdge.node?.lineItems?.edges || [];
        for (const lineItem of lineItems) {
          const productId = lineItem.node?.product?.id;
          const quantity = lineItem.node?.quantity || 0;
          
          if (productId) {
            const id = productId.replace('gid://shopify/Product/', '');
            salesCounts.set(id, (salesCounts.get(id) || 0) + quantity);
          }
        }
      }

      hasNextPage = response.data?.orders?.pageInfo?.hasNextPage || false;
      cursor = response.data?.orders?.pageInfo?.endCursor || null;
      
      // Limit to ~1000 orders for performance (adjust as needed)
      if (totalOrders >= 1000) {
        console.log('[Shopify] Reached order limit for sales calculation');
        break;
      }
    }
    
    console.log(`[Shopify] Processed ${totalOrders} orders for sales data`);
  } catch (error) {
    console.error('[Shopify] Failed to fetch sales counts:', error);
    // Return empty map - we'll continue without sales data
  }
  
  return salesCounts;
}

/**
 * Fetch all products and check which have AR_Image metafield assigned
 */
export async function getARImageReport(): Promise<ARImageReport> {
  try {
    console.log('[Shopify] Fetching AR Image report...');
    
    // Fetch sales data and products in parallel
    const [salesCounts, productData] = await Promise.all([
      getProductSalesCounts(),
      fetchAllProducts()
    ]);
    
    // Merge sales counts into product data
    const products = productData.map(p => ({
      ...p,
      salesCount: salesCounts.get(p.productId) || 0
    }));
    
    // Sort by sales count (best sellers first)
    products.sort((a, b) => b.salesCount - a.salesCount);

    const withArImage = products.filter(p => p.hasArImage).length;
    
    console.log(`[Shopify] AR Image report: ${withArImage}/${products.length} products have AR_Image`);
    
    return {
      total: products.length,
      withArImage,
      withoutArImage: products.length - withArImage,
      products,
    };
  } catch (error) {
    console.error('[Shopify] Failed to generate AR Image report:', error);
    throw error;
  }
}

/**
 * Fetch all products with AR image metafield
 */
async function fetchAllProducts(): Promise<Omit<ARImageReportItem, 'salesCount'>[]> {
  const products: Omit<ARImageReportItem, 'salesCount'>[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const query = `
      query($cursor: String) {
        products(first: 50, after: $cursor) {
          edges {
            node {
              id
              title
              handle
              vendor
              productType
              status
              createdAt
              metafield(namespace: "custom", key: "wav_image") {
                value
                type
                reference {
                  ... on MediaImage {
                    image {
                      url
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const response = await shopifyGraphQL(query, { cursor });
    
    if (response.errors) {
      console.error('[Shopify] AR Image report query errors:', response.errors);
      throw new Error('Failed to query products');
    }

    const productEdges = response.data?.products?.edges || [];
    
    for (const edge of productEdges) {
      const node = edge.node;
      const metafield = node.metafield;
      
      let arImageUrl: string | null = null;
      if (metafield) {
        // Handle file_reference type (image stored in Shopify Files)
        if (metafield.reference?.image?.url) {
          arImageUrl = metafield.reference.image.url;
        } else if (metafield.value) {
          // Could be a URL string or GID reference
          arImageUrl = metafield.value;
        }
      }

      products.push({
        productId: node.id.replace('gid://shopify/Product/', ''),
        title: node.title,
        handle: node.handle,
        vendor: node.vendor,
        productType: node.productType || '',
        status: node.status,
        createdAt: node.createdAt,
        hasArImage: !!metafield,
        arImageUrl,
      });
    }

    hasNextPage = response.data?.products?.pageInfo?.hasNextPage || false;
    cursor = response.data?.products?.pageInfo?.endCursor || null;
  }

  return products;
}

/**
 * Upload an image to Shopify Files and set it as the wav_image metafield on a product
 */
export async function setProductWavImage(
  productId: string,
  imageBuffer: Buffer,
  filename: string
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  try {
    console.log(`[Shopify] Setting wav_image for product ${productId}`);
    
    // Upload image to Shopify Files
    const fileId = await uploadToShopifyFiles(imageBuffer, filename);
    if (!fileId) {
      return { success: false, error: 'Failed to upload image to Shopify Files' };
    }
    
    // Set the metafield on the product
    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            metafield(namespace: "custom", key: "wav_image") {
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const variables = {
      input: {
        id: `gid://shopify/Product/${productId}`,
        metafields: [{
          namespace: "custom",
          key: "wav_image",
          value: fileId,
          type: "file_reference"
        }]
      }
    };
    
    const response = await shopifyGraphQL(mutation, variables);
    
    if (response.data?.productUpdate?.userErrors?.length > 0) {
      const errors = response.data.productUpdate.userErrors;
      console.error('[Shopify] Failed to set wav_image:', errors);
      return { success: false, error: errors[0].message };
    }
    
    console.log(`[Shopify] Successfully set wav_image for product ${productId}`);
    return { success: true, fileId };
  } catch (error: any) {
    console.error('[Shopify] Error setting wav_image:', error);
    return { success: false, error: error.message };
  }
}

// Get all variants for a product by product ID
export async function getProductVariants(productId: string): Promise<{
  id: string;
  title: string;
  price: string;
}[]> {
  try {
    console.log(`[Shopify] Fetching variants for product: ${productId}`);
    const response = await shopifyRequest(`products/${productId}.json?fields=id,variants`);
    
    if (response?.product?.variants) {
      return response.product.variants.map((v: any) => ({
        id: String(v.id),
        title: v.title || '',
        price: v.price,
      }));
    }
    return [];
  } catch (error: any) {
    console.error('[Shopify] Error fetching product variants:', error);
    return [];
  }
}

export async function addSizeVariantsToProduct(
  productId: string,
  sizeCodes: string[],
  variantConfigs: VariantConfig[]
): Promise<{ success: boolean; addedCount: number; error?: string }> {
  try {
    const existingVariants = await getProductVariants(productId);
    const existingSizeTitles = new Set(existingVariants.map(v => {
      const parts = v.title.split(' / ');
      return parts[0]?.trim();
    }));

    const frameOptions = ['Black Frame', 'White Frame', 'Natural Frame', 'Unframed'];
    let addedCount = 0;

    for (const sizeCode of sizeCodes) {
      const sizeName = getSizeNameFromCode(sizeCode);
      if (existingSizeTitles.has(sizeName)) {
        console.log(`[Shopify] Size "${sizeName}" already exists on product ${productId}, skipping`);
        continue;
      }

      for (const frameOption of frameOptions) {
        const configFrameType = frameOption === 'Unframed' ? 'Unframed' : 'Framed';
        const config = getConfigForVariant(sizeName, configFrameType, variantConfigs);

        if (!config) {
          console.log(`[Shopify] No variant config for ${sizeName} / ${frameOption}, skipping`);
          continue;
        }

        const price = (config.priceGBP / 100).toFixed(2);
        const handle = `${productId}`.substring(0, 20).toUpperCase();
        const sku = `${handle}-${sizeCode}-${frameOption.replace(/\s+/g, '').substring(0, 3).toUpperCase()}`;

        try {
          await shopifyRequest(`products/${productId}/variants.json`, 'POST', {
            variant: {
              option1: sizeName,
              option2: frameOption,
              price,
              sku,
              weight: config.weightGrams,
              weight_unit: 'g',
              inventory_policy: 'continue',
              fulfillment_service: 'manual',
              requires_shipping: true,
              taxable: true,
            }
          });
          addedCount++;
          console.log(`[Shopify] Added variant: ${sizeName} / ${frameOption} at £${price}`);
        } catch (err: any) {
          console.error(`[Shopify] Failed to add variant ${sizeName} / ${frameOption}:`, err.message);
          if (err.message.includes('option1') || err.message.includes('option values')) {
            console.log(`[Shopify] Size option "${sizeName}" may need to be added to the product options first`);
          }
          return { success: false, addedCount, error: `Failed adding ${sizeName} / ${frameOption}: ${err.message}` };
        }
      }
    }

    return { success: true, addedCount };
  } catch (error: any) {
    console.error('[Shopify] Error adding size variants:', error);
    return { success: false, addedCount: 0, error: error.message };
  }
}

// Look up a variant by its ID to get the current price
export async function getVariantById(variantId: string): Promise<{
  id: string;
  title: string;
  price: string;
  compare_at_price: string | null;
  sku: string;
  product_id: string;
  product_title: string;
} | null> {
  try {
    console.log(`[Shopify] Looking up variant: ${variantId}`);
    const response = await shopifyRequest(`variants/${variantId}.json`);
    
    if (response?.variant) {
      const v = response.variant;
      // Also fetch product title
      let productTitle = '';
      try {
        const productRes = await shopifyRequest(`products/${v.product_id}.json?fields=title`);
        productTitle = productRes?.product?.title || '';
      } catch (e) {
        console.log('[Shopify] Could not fetch product title');
      }
      
      return {
        id: String(v.id),
        title: v.title || '',
        price: v.price,
        compare_at_price: v.compare_at_price,
        sku: v.sku || '',
        product_id: String(v.product_id),
        product_title: productTitle,
      };
    }
    return null;
  } catch (error: any) {
    console.error('[Shopify] Error looking up variant:', error);
    return null;
  }
}

// Storefront API - Get localized variant prices using @inContext
interface LocalizedVariantPrice {
  id: string;
  numericId: number;
  title: string;
  price: string;
  currencyCode: string;
  available: boolean;
}

export async function getLocalizedVariantPrices(
  productId: number | string,
  countryCode: string = 'GB'
): Promise<LocalizedVariantPrice[]> {
  if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_STOREFRONT_TOKEN) {
    console.error('[Storefront API] Missing credentials');
    return [];
  }

  const query = `
    query getProduct($id: ID!, $country: CountryCode!) @inContext(country: $country) {
      product(id: $id) {
        variants(first: 250) {
          edges {
            node {
              id
              title
              availableForSale
              price {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    id: `gid://shopify/Product/${productId}`,
    country: countryCode.toUpperCase()
  };

  try {
    const response = await fetch(
      `https://${SHOPIFY_SHOP_DOMAIN}/api/2024-10/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN,
        },
        body: JSON.stringify({ query, variables }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Storefront API] Error:', response.status, errorText);
      return [];
    }

    const data = await response.json();
    
    if (data.errors) {
      console.error('[Storefront API] GraphQL errors:', data.errors);
      return [];
    }

    const variants = data.data?.product?.variants?.edges || [];
    return variants.map((edge: any) => ({
      id: edge.node.id,
      numericId: parseInt(edge.node.id.split('/').pop()),
      title: edge.node.title,
      price: edge.node.price.amount,
      currencyCode: edge.node.price.currencyCode,
      available: edge.node.availableForSale,
    }));
  } catch (error: any) {
    console.error('[Storefront API] Error fetching localized prices:', error);
    return [];
  }
}

// Test Storefront API connection
export async function testStorefrontAPI(countryCode: string = 'AU'): Promise<{
  success: boolean;
  message: string;
  data?: any;
}> {
  if (!SHOPIFY_STOREFRONT_TOKEN) {
    return { success: false, message: 'SHOPIFY_STOREFRONT_TOKEN not configured' };
  }

  // Use a simple shop query to test connection
  const query = `
    query testConnection($country: CountryCode!) @inContext(country: $country) {
      localization {
        country {
          isoCode
          name
          currency {
            isoCode
            name
            symbol
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(
      `https://${SHOPIFY_SHOP_DOMAIN}/api/2024-10/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN,
        },
        body: JSON.stringify({ 
          query, 
          variables: { country: countryCode.toUpperCase() }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, message: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    
    if (data.errors) {
      return { success: false, message: 'GraphQL errors', data: data.errors };
    }

    return { 
      success: true, 
      message: 'Storefront API connected successfully',
      data: data.data?.localization
    };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export interface MountReviewProduct {
  productId: string;
  gid: string;
  title: string;
  handle: string;
  vendor: string;
  status: string;
  wavImageUrl: string | null;
  hasMount: string | null;
  shape: string | null;
  sizes: string[];
  featuredImageUrl: string | null;
}

export const RATIO_METAFIELD_KEYS: Record<string, string> = {
  "5:7 / A-series": "ar_image_a_ratio",
  "3:4": "ar_image_3x4",
  "2:3": "ar_image_2x3",
  "4:5": "ar_image_4x5",
  "1:1": "ar_image_1x1",
};

export interface MultiRatioProduct {
  productId: string;
  gid: string;
  title: string;
  handle: string;
  vendor: string;
  status: string;
  sizes: string[];
  featuredImageUrl: string | null;
  ratioImages: Record<string, { url: string | null; hasImage: boolean; width: number | null; height: number | null }>;
  wavImageRatio: string | null;
  wavImageDimensions: { width: number; height: number } | null;
  totalInventory: number;
  salesCount90d: number;
}

function detectRatioFromDimensions(w: number, h: number): string | null {
  if (w <= 0 || h <= 0) return null;
  const r = Math.min(w, h) / Math.max(w, h);
  if (Math.abs(r - 1) < 0.02) return "1:1";
  if (Math.abs(r - 1 / Math.SQRT2) < 0.02 || Math.abs(r - 5 / 7) < 0.02) return "5:7 / A-series";
  if (Math.abs(r - 3 / 4) < 0.02) return "3:4";
  if (Math.abs(r - 4 / 5) < 0.02 || Math.abs(r - 11 / 14) < 0.02) return "4:5";
  if (Math.abs(r - 2 / 3) < 0.02) return "2:3";
  return null;
}

export async function fetchProductsForMultiRatio(): Promise<MultiRatioProduct[]> {
  const products: MultiRatioProduct[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const query = `
      query($cursor: String) {
        products(first: 50, after: $cursor, query: "status:active") {
          edges {
            node {
              id
              title
              handle
              vendor
              status
              productType
              featuredImage {
                url
              }
              totalInventory
              wavImage: metafield(namespace: "custom", key: "wav_image") {
                value
                reference {
                  ... on MediaImage {
                    image { url width height }
                  }
                }
              }
              arImageARatio: metafield(namespace: "custom", key: "ar_image_a_ratio") {
                value
                reference {
                  ... on MediaImage {
                    image { url width height }
                  }
                }
              }
              arImage3x4: metafield(namespace: "custom", key: "ar_image_3x4") {
                value
                reference {
                  ... on MediaImage {
                    image { url width height }
                  }
                }
              }
              arImage2x3: metafield(namespace: "custom", key: "ar_image_2x3") {
                value
                reference {
                  ... on MediaImage {
                    image { url width height }
                  }
                }
              }
              arImage4x5: metafield(namespace: "custom", key: "ar_image_4x5") {
                value
                reference {
                  ... on MediaImage {
                    image { url width height }
                  }
                }
              }
              arImage1x1: metafield(namespace: "custom", key: "ar_image_1x1") {
                value
                reference {
                  ... on MediaImage {
                    image { url width height }
                  }
                }
              }
              arImage11x14: metafield(namespace: "custom", key: "ar_image_11x14") {
                value
                reference {
                  ... on MediaImage {
                    image { url width height }
                  }
                }
              }
              variants(first: 100) {
                edges {
                  node {
                    selectedOptions {
                      name
                      value
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    let response: any;
    let retries = 0;
    const maxRetries = 5;
    while (retries <= maxRetries) {
      response = await shopifyGraphQL(query, { cursor });
      const isThrottled = response.errors?.some((e: any) => e.extensions?.code === 'THROTTLED');
      if (isThrottled && retries < maxRetries) {
        const delay = Math.min(2000 * Math.pow(2, retries), 15000);
        console.log(`[Shopify] Multi-ratio query throttled, retrying in ${delay}ms (attempt ${retries + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        retries++;
        continue;
      }
      if (response.errors) {
        console.error('[Shopify] Multi-ratio query errors:', response.errors);
        throw new Error('Failed to query products for multi-ratio');
      }
      break;
    }

    const productEdges = response.data?.products?.edges || [];

    for (const edge of productEdges) {
      const node = edge.node;
      const title = (node.title || "").trim();
      const productType = (node.productType || "").trim().toLowerCase();

      if (/limited\s*edition/i.test(title)) continue;

      const nonPrintTypes = ["picture frame", "picture frames", "frame", "frames", "gift card", "gift cards", "accessory", "accessories", "bundle", "bundles"];
      if (nonPrintTypes.some(t => productType === t)) continue;

      const sizes: string[] = [];
      for (const variantEdge of (node.variants?.edges || [])) {
        const opts = variantEdge.node.selectedOptions || [];
        const sizeOpt = opts.find((o: any) => o.name.toLowerCase() === 'size');
        if (sizeOpt && !sizes.includes(sizeOpt.value)) {
          sizes.push(sizeOpt.value);
        }
      }

      const extractInfo = (field: any): { url: string | null; hasImage: boolean; width: number | null; height: number | null } => {
        if (!field) return { url: null, hasImage: false, width: null, height: null };
        const url = field.reference?.image?.url || field.value || null;
        const hasImage = !!(field.value || field.reference?.image?.url);
        const width = field.reference?.image?.width || null;
        const height = field.reference?.image?.height || null;
        return { url, hasImage, width, height };
      };

      let wavImageRatio: string | null = null;
      let wavImageDimensions: { width: number; height: number } | null = null;
      const wavRef = node.wavImage?.reference?.image;
      if (wavRef?.width && wavRef?.height) {
        const w = wavRef.width;
        const h = wavRef.height;
        wavImageDimensions = { width: w, height: h };
        wavImageRatio = detectRatioFromDimensions(w, h);
      }

      const wavInfo = extractInfo(node.wavImage);

      const img4x5 = extractInfo(node.arImage4x5);
      const img11x14 = extractInfo(node.arImage11x14);

      const ratioImages: Record<string, { url: string | null; hasImage: boolean; width: number | null; height: number | null }> = {
        "5:7 / A-series": extractInfo(node.arImageARatio),
        "3:4": extractInfo(node.arImage3x4),
        "2:3": extractInfo(node.arImage2x3),
        "4:5": img4x5.hasImage ? img4x5 : img11x14,
        "1:1": extractInfo(node.arImage1x1),
      };

      if (wavImageRatio && ratioImages[wavImageRatio] !== undefined) {
        if (!ratioImages[wavImageRatio].hasImage) {
          ratioImages[wavImageRatio] = { url: wavInfo.url, hasImage: wavInfo.hasImage };
        }
      }

      products.push({
        productId: node.id.replace('gid://shopify/Product/', ''),
        gid: node.id,
        title: node.title,
        handle: node.handle,
        vendor: node.vendor,
        status: node.status,
        sizes,
        featuredImageUrl: node.featuredImage?.url || null,
        ratioImages,
        wavImageRatio,
        wavImageDimensions,
        totalInventory: node.totalInventory ?? 0,
        salesCount90d: 0,
      });
    }

    hasNextPage = response.data?.products?.pageInfo?.hasNextPage || false;
    cursor = response.data?.products?.pageInfo?.endCursor || null;
  }

  const salesCounts = await fetchProductSalesCounts90Days();
  for (const p of products) {
    p.salesCount90d = salesCounts.get(p.productId) || 0;
  }

  products.sort((a, b) => b.salesCount90d - a.salesCount90d);

  console.log(`[Shopify] Fetched ${products.length} products for multi-ratio analysis`);
  return products;
}

async function fetchProductSalesCounts90Days(): Promise<Map<string, number>> {
  const salesMap = new Map<string, number>();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const query = `
      query($cursor: String) {
        orders(first: 250, after: $cursor, query: "created_at:>='${ninetyDaysAgo}' AND financial_status:paid") {
          edges {
            node {
              lineItems(first: 100) {
                edges {
                  node {
                    product {
                      id
                    }
                    quantity
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    let response: any;
    let retries = 0;
    const maxRetries = 5;
    while (retries <= maxRetries) {
      response = await shopifyGraphQL(query, { cursor });
      const isThrottled = response.errors?.some((e: any) => e.extensions?.code === 'THROTTLED');
      if (isThrottled && retries < maxRetries) {
        const delay = Math.min(2000 * Math.pow(2, retries), 15000);
        console.log(`[Shopify] Sales query throttled, retrying in ${delay}ms (attempt ${retries + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        retries++;
        continue;
      }
      if (response.errors) {
        console.error('[Shopify] Sales query errors:', response.errors);
        return salesMap;
      }
      break;
    }

    const orderEdges = response.data?.orders?.edges || [];
    for (const orderEdge of orderEdges) {
      const lineItemEdges = orderEdge.node?.lineItems?.edges || [];
      for (const liEdge of lineItemEdges) {
        const productId = liEdge.node?.product?.id;
        const quantity = liEdge.node?.quantity || 0;
        if (productId) {
          const numericId = productId.replace('gid://shopify/Product/', '');
          salesMap.set(numericId, (salesMap.get(numericId) || 0) + quantity);
        }
      }
    }

    hasNextPage = response.data?.orders?.pageInfo?.hasNextPage || false;
    cursor = response.data?.orders?.pageInfo?.endCursor || null;
  }

  console.log(`[Shopify] Fetched sales data: ${salesMap.size} products with sales in last 90 days`);
  return salesMap;
}

export interface ScanVideoProduct {
  productId: string;
  gid: string;
  title: string;
  handle: string;
  vendor: string;
  featuredImageUrl: string | null;
  featuredImageWidth: number | null;
  featuredImageHeight: number | null;
  totalInventory: number;
  salesCount90d: number;
  hasVideo: boolean;
  videoCount: number;
}

export async function fetchProductsForScanVideos(): Promise<ScanVideoProduct[]> {
  const products: ScanVideoProduct[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const query = `
      query($cursor: String) {
        products(first: 50, after: $cursor, query: "status:active") {
          edges {
            node {
              id
              title
              handle
              vendor
              productType
              featuredImage {
                url
                width
                height
              }
              totalInventory
              media(first: 30) {
                edges {
                  node {
                    mediaContentType
                    ... on Video {
                      id
                      sources {
                        url
                        mimeType
                      }
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    let response: any;
    let retries = 0;
    const maxRetries = 5;
    while (retries <= maxRetries) {
      response = await shopifyGraphQL(query, { cursor });
      const isThrottled = response.errors?.some((e: any) => e.extensions?.code === 'THROTTLED');
      if (isThrottled && retries < maxRetries) {
        const delay = Math.min(2000 * Math.pow(2, retries), 15000);
        console.log(`[Shopify] Scan video query throttled, retrying in ${delay}ms (attempt ${retries + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        retries++;
        continue;
      }
      if (response.errors) {
        console.error('[Shopify] Scan video query errors:', response.errors);
        throw new Error('Failed to query products for scan videos');
      }
      break;
    }

    const productEdges = response.data?.products?.edges || [];

    for (const edge of productEdges) {
      const node = edge.node;
      const title = (node.title || "").trim();
      const productType = (node.productType || "").trim().toLowerCase();

      if (/limited\s*edition/i.test(title)) continue;
      if (/upgrade/i.test(title)) continue;

      const nonPrintTypes = ["picture frame", "picture frames", "frame", "frames", "gift card", "gift cards", "accessory", "accessories", "bundle", "bundles", "upgrade", "upgrades"];
      if (nonPrintTypes.some((t: string) => productType === t)) continue;

      const mediaEdges = node.media?.edges || [];
      let videoCount = 0;
      for (const mediaEdge of mediaEdges) {
        const contentType = mediaEdge.node.mediaContentType;
        if (contentType === "VIDEO" || contentType === "EXTERNAL_VIDEO") {
          videoCount++;
        }
      }

      products.push({
        productId: node.id.replace('gid://shopify/Product/', ''),
        gid: node.id,
        title: node.title,
        handle: node.handle,
        vendor: node.vendor,
        featuredImageUrl: node.featuredImage?.url || null,
        featuredImageWidth: node.featuredImage?.width ?? null,
        featuredImageHeight: node.featuredImage?.height ?? null,
        totalInventory: node.totalInventory ?? 0,
        salesCount90d: 0,
        hasVideo: videoCount > 0,
        videoCount,
      });
    }

    hasNextPage = response.data?.products?.pageInfo?.hasNextPage || false;
    cursor = response.data?.products?.pageInfo?.endCursor || null;
  }

  const salesCounts = await fetchProductSalesCounts90Days();
  for (const p of products) {
    p.salesCount90d = salesCounts.get(p.productId) || 0;
  }

  products.sort((a, b) => b.salesCount90d - a.salesCount90d);

  console.log(`[Shopify] Fetched ${products.length} products for scan video analysis (${products.filter(p => p.hasVideo).length} with videos)`);
  return products;
}

export async function setProductRatioImage(
  productId: string,
  metafieldKey: string,
  imageBuffer: Buffer,
  filename: string
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  try {
    console.log(`[Shopify] Setting ${metafieldKey} for product ${productId}`);

    const fileId = await uploadToShopifyFiles(imageBuffer, filename);
    if (!fileId) {
      return { success: false, error: 'Failed to upload image to Shopify Files' };
    }

    const mutation = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      metafields: [{
        ownerId: `gid://shopify/Product/${productId}`,
        namespace: "custom",
        key: metafieldKey,
        value: fileId,
        type: "file_reference"
      }]
    };

    const response = await shopifyGraphQL(mutation, variables);

    if (response.data?.metafieldsSet?.userErrors?.length > 0) {
      const errors = response.data.metafieldsSet.userErrors;
      console.error(`[Shopify] Failed to set ${metafieldKey}:`, errors);
      return { success: false, error: errors[0].message };
    }

    console.log(`[Shopify] Successfully set ${metafieldKey} for product ${productId}`);
    return { success: true, fileId };
  } catch (error: any) {
    console.error(`[Shopify] Error setting ${metafieldKey}:`, error);
    return { success: false, error: error.message };
  }
}

export async function fetchProductsForMountReview(): Promise<MountReviewProduct[]> {
  const products: MountReviewProduct[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const query = `
      query($cursor: String) {
        products(first: 50, after: $cursor, query: "status:active") {
          edges {
            node {
              id
              title
              handle
              vendor
              status
              productType
              featuredImage {
                url
              }
              wavImage: metafield(namespace: "custom", key: "wav_image") {
                value
                type
                reference {
                  ... on MediaImage {
                    image {
                      url
                    }
                  }
                }
              }
              hasMount: metafield(namespace: "custom", key: "has_mount") {
                value
              }
              shape: metafield(namespace: "custom", key: "shape") {
                value
              }
              variants(first: 100) {
                edges {
                  node {
                    selectedOptions {
                      name
                      value
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const response = await shopifyGraphQL(query, { cursor });

    if (response.errors) {
      console.error('[Shopify] Mount review query errors:', response.errors);
      throw new Error('Failed to query products for mount review');
    }

    const productEdges = response.data?.products?.edges || [];

    for (const edge of productEdges) {
      const node = edge.node;
      const title = (node.title || "").trim();
      const productType = (node.productType || "").trim().toLowerCase();

      if (/limited\s*edition/i.test(title)) continue;

      const nonPrintTypes = ["picture frame", "picture frames", "frame", "frames", "gift card", "gift cards", "accessory", "accessories"];
      if (nonPrintTypes.some(t => productType === t)) continue;

      let wavImageUrl: string | null = null;
      if (node.wavImage) {
        if (node.wavImage.reference?.image?.url) {
          wavImageUrl = node.wavImage.reference.image.url;
        } else if (node.wavImage.value) {
          wavImageUrl = node.wavImage.value;
        }
      }

      const sizes: string[] = [];
      for (const variantEdge of (node.variants?.edges || [])) {
        const opts = variantEdge.node.selectedOptions || [];
        const sizeOpt = opts.find((o: any) => o.name.toLowerCase() === 'size');
        if (sizeOpt && !sizes.includes(sizeOpt.value)) {
          sizes.push(sizeOpt.value);
        }
      }

      products.push({
        productId: node.id.replace('gid://shopify/Product/', ''),
        gid: node.id,
        title: node.title,
        handle: node.handle,
        vendor: node.vendor,
        status: node.status,
        wavImageUrl,
        shape: node.shape?.value || null,
        hasMount: node.hasMount?.value || null,
        sizes,
        featuredImageUrl: node.featuredImage?.url || null,
      });
    }

    hasNextPage = response.data?.products?.pageInfo?.hasNextPage || false;
    cursor = response.data?.products?.pageInfo?.endCursor || null;
  }

  console.log(`[Shopify] Fetched ${products.length} products for mount review`);
  return products;
}

export async function updateProductHasMount(
  productGid: string,
  hasMount: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const mutation = `
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      metafields: [{
        ownerId: productGid,
        namespace: 'custom',
        key: 'has_mount',
        value: hasMount ? 'Yes' : 'No',
        type: 'single_line_text_field',
      }],
    };

    const response = await shopifyGraphQL(mutation, variables);

    if (response.data?.metafieldsSet?.userErrors?.length > 0) {
      const errors = response.data.metafieldsSet.userErrors;
      console.error('[Shopify] has_mount update errors:', errors);
      return { success: false, error: errors.map((e: any) => e.message).join(', ') };
    }

    console.log(`[Shopify] Updated has_mount for ${productGid} to ${hasMount ? 'Yes' : 'No'}`);
    return { success: true };
  } catch (error: any) {
    console.error(`[Shopify] Failed to update has_mount for ${productGid}:`, error);
    return { success: false, error: error.message };
  }
}

export interface ProductMediaItem {
  id: string;
  alt: string | null;
  url: string;
  width: number | null;
  height: number | null;
}

export interface ProductWithMedia {
  productId: string;
  gid: string;
  title: string;
  vendor: string;
  handle: string;
  media: ProductMediaItem[];
}

export async function fetchProductMedia(productGid: string): Promise<ProductWithMedia> {
  let allMedia: ProductMediaItem[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;
  let productInfo: any = null;

  while (hasNextPage) {
    const query = `
      query($id: ID!, $cursor: String) {
        product(id: $id) {
          id
          title
          vendor
          handle
          media(first: 50, after: $cursor) {
            edges {
              node {
                ... on MediaImage {
                  id
                  alt
                  image {
                    url
                    width
                    height
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;

    const response = await shopifyGraphQL(query, { id: productGid, cursor });
    if (response.errors) {
      throw new Error('Failed to fetch product media: ' + response.errors.map((e: any) => e.message).join(', '));
    }

    const product = response.data?.product;
    if (!product) throw new Error('Product not found');

    if (!productInfo) {
      productInfo = {
        productId: product.id.replace('gid://shopify/Product/', ''),
        gid: product.id,
        title: product.title,
        vendor: product.vendor,
        handle: product.handle,
      };
    }

    for (const edge of product.media.edges) {
      const node = edge.node;
      if (node.image) {
        allMedia.push({
          id: node.id,
          alt: node.alt || null,
          url: node.image.url,
          width: node.image.width || null,
          height: node.image.height || null,
        });
      }
    }

    hasNextPage = product.media.pageInfo.hasNextPage;
    cursor = product.media.pageInfo.endCursor;
  }

  return { ...productInfo!, media: allMedia };
}

async function fetchRecentSalesCounts(): Promise<Map<string, number>> {
  const salesMap = new Map<string, number>();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const query = `
      query($cursor: String, $createdAt: String!) {
        orders(first: 50, after: $cursor, query: $createdAt) {
          edges {
            node {
              lineItems(first: 50) {
                edges {
                  node {
                    product { id }
                    quantity
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    let response: any;
    let retries = 0;
    while (retries <= 5) {
      response = await shopifyGraphQL(query, { cursor, createdAt: `created_at:>=${ninetyDaysAgo}` });
      const isThrottled = response.errors?.some((e: any) => e.extensions?.code === 'THROTTLED');
      if (isThrottled && retries < 5) {
        await new Promise(r => setTimeout(r, Math.min(2000 * Math.pow(2, retries), 15000)));
        retries++;
        continue;
      }
      if (response.errors) {
        console.error('[Shopify] Error fetching orders for sales counts:', response.errors);
        break;
      }
      break;
    }

    for (const edge of response.data?.orders?.edges || []) {
      for (const li of edge.node.lineItems?.edges || []) {
        const productId = li.node.product?.id;
        const qty = li.node.quantity || 1;
        if (productId) {
          salesMap.set(productId, (salesMap.get(productId) || 0) + qty);
        }
      }
    }

    hasNextPage = response.data?.orders?.pageInfo?.hasNextPage || false;
    cursor = response.data?.orders?.pageInfo?.endCursor || null;
  }

  console.log(`[Shopify] Fetched sales data: ${salesMap.size} products with sales in last 90 days`);
  return salesMap;
}

export async function fetchProductsListForMediaEditor(): Promise<{ productId: string; gid: string; title: string; vendor: string; handle: string; featuredImageUrl: string | null; salesCount: number; hasLifestyle: boolean }[]> {
  const products: any[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const query = `
      query($cursor: String) {
        products(first: 50, after: $cursor, query: "status:active") {
          edges {
            node {
              id
              title
              vendor
              handle
              productType
              featuredImage { url }
              media(first: 30) {
                edges {
                  node {
                    ... on MediaImage {
                      alt
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    let response: any;
    let retries = 0;
    while (retries <= 5) {
      response = await shopifyGraphQL(query, { cursor });
      const isThrottled = response.errors?.some((e: any) => e.extensions?.code === 'THROTTLED');
      if (isThrottled && retries < 5) {
        await new Promise(r => setTimeout(r, Math.min(2000 * Math.pow(2, retries), 15000)));
        retries++;
        continue;
      }
      if (response.errors) {
        console.error('[Shopify] Product fetch GraphQL errors:', JSON.stringify(response.errors));
        throw new Error('Failed to fetch products: ' + response.errors.map((e: any) => e.message).join(', '));
      }
      break;
    }

    const nonPrintTypes = ["picture frame", "picture frames", "frame", "frames", "gift card", "gift cards", "accessory", "accessories", "bundle", "bundles", "upgrade", "upgrades"];
    for (const edge of response.data?.products?.edges || []) {
      const node = edge.node;
      const productType = (node.productType || "").trim().toLowerCase();
      if (nonPrintTypes.some(t => productType === t)) continue;
      if (/limited\s*edition/i.test(node.title || "")) continue;

      const hasLifestyle = (node.media?.edges || []).some(
        (me: any) => me.node?.alt && me.node.alt.includes('Style = Lifestyle')
      );
      products.push({
        productId: node.id.replace('gid://shopify/Product/', ''),
        gid: node.id,
        title: node.title,
        vendor: node.vendor,
        handle: node.handle,
        featuredImageUrl: node.featuredImage?.url || null,
        hasLifestyle,
      });
    }

    hasNextPage = response.data?.products?.pageInfo?.hasNextPage || false;
    cursor = response.data?.products?.pageInfo?.endCursor || null;
  }

  let salesMap: Map<string, number>;
  try {
    salesMap = await fetchRecentSalesCounts();
  } catch (err) {
    console.error('[Shopify] Failed to fetch sales counts, continuing without:', err);
    salesMap = new Map();
  }

  const enriched = products.map(p => ({
    ...p,
    salesCount: salesMap.get(p.gid) || 0,
  }));

  enriched.sort((a, b) => b.salesCount - a.salesCount);
  console.log(`[MediaEditor] Fetched ${enriched.length} Poster/Artwork products, ${enriched.filter(p => p.hasLifestyle).length} with lifestyle tags`);
  return enriched;
}

export async function batchUpdateMediaAltText(
  productGid: string,
  updates: { mediaId: string; altText: string }[]
): Promise<{ success: boolean; updated: number; error?: string }> {
  try {
    const mutation = `
      mutation productUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
        productUpdateMedia(productId: $productId, media: $media) {
          media {
            ... on MediaImage {
              id
              alt
            }
          }
          mediaUserErrors {
            field
            message
          }
        }
      }
    `;

    const media = updates.map(u => ({
      id: u.mediaId,
      alt: u.altText,
    }));

    const response = await shopifyGraphQL(mutation, { productId: productGid, media });
    if (response.errors) {
      const msg = response.errors.map((e: any) => e.message).join(', ');
      console.error(`[Shopify] GraphQL errors updating media alt text:`, msg);
      return { success: false, updated: 0, error: msg };
    }
    const errors = response.data?.productUpdateMedia?.mediaUserErrors || [];
    if (errors.length > 0) {
      return { success: false, updated: 0, error: errors.map((e: any) => e.message).join(', ') };
    }

    console.log(`[Shopify] Updated alt text for ${updates.length} media items on product ${productGid}`);
    return { success: true, updated: updates.length };
  } catch (error: any) {
    console.error(`[Shopify] Failed to update media alt text:`, error);
    return { success: false, updated: 0, error: error.message };
  }
}

export interface ProductMediaItem {
  productId: string;
  gid: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  tags: string[];
  featuredImageUrl: string | null;
  totalInventory: number;
  imageCount: number;
  videoCount: number;
  totalMediaCount: number;
  hasLifestyle: boolean;
  salesCount90d: number;
  createdAt: string;
}

export async function fetchProductsForProductMedia(): Promise<ProductMediaItem[]> {
  const products: ProductMediaItem[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const query = `
      query($cursor: String) {
        products(first: 50, after: $cursor, query: "status:active") {
          edges {
            node {
              id
              title
              handle
              vendor
              productType
              tags
              createdAt
              featuredImage { url }
              totalInventory
              media(first: 50) {
                edges {
                  node {
                    mediaContentType
                    ... on MediaImage {
                      alt
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    let response: any;
    let retries = 0;
    while (retries <= 5) {
      response = await shopifyGraphQL(query, { cursor });
      const isThrottled = response.errors?.some((e: any) => e.extensions?.code === 'THROTTLED');
      if (isThrottled && retries < 5) {
        const delay = Math.min(2000 * Math.pow(2, retries), 15000);
        await new Promise(r => setTimeout(r, delay));
        retries++;
        continue;
      }
      if (response.errors) {
        console.error('[ProductMedia] Query errors:', response.errors);
        throw new Error('Failed to query products for product media');
      }
      break;
    }

    const edges = response.data?.products?.edges || [];
    for (const edge of edges) {
      const node = edge.node;
      const mediaEdges = node.media?.edges || [];
      let imageCount = 0;
      let videoCount = 0;
      let hasLifestyle = false;

      for (const me of mediaEdges) {
        const ct = me.node.mediaContentType;
        if (ct === "IMAGE") {
          imageCount++;
          if (me.node.alt && /lifestyle/i.test(me.node.alt)) hasLifestyle = true;
        }
        if (ct === "VIDEO" || ct === "EXTERNAL_VIDEO") videoCount++;
      }

      products.push({
        productId: node.id.replace('gid://shopify/Product/', ''),
        gid: node.id,
        title: node.title,
        handle: node.handle,
        vendor: node.vendor || '',
        productType: node.productType || '',
        tags: node.tags || [],
        featuredImageUrl: node.featuredImage?.url || null,
        totalInventory: node.totalInventory ?? 0,
        imageCount,
        videoCount,
        totalMediaCount: imageCount + videoCount,
        hasLifestyle,
        salesCount90d: 0,
        createdAt: node.createdAt || '',
      });
    }

    hasNextPage = response.data?.products?.pageInfo?.hasNextPage || false;
    cursor = response.data?.products?.pageInfo?.endCursor || null;
  }

  const salesCounts = await fetchProductSalesCounts90Days();
  for (const p of products) {
    p.salesCount90d = salesCounts.get(p.productId) || 0;
  }

  return products;
}

export async function fetchProductMediaDetails(productGid: string): Promise<{
  product: { gid: string; title: string; handle: string; vendor: string };
  media: Array<{ id: string; mediaContentType: string; alt: string | null; url: string | null; width: number | null; height: number | null; position: number; sources?: Array<{ url: string; mimeType: string }> }>;
}> {
  const query = `
    query($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        vendor
        media(first: 50, sortKey: POSITION) {
          edges {
            node {
              mediaContentType
              ... on MediaImage {
                id
                alt
                image {
                  url
                  width
                  height
                }
              }
              ... on Video {
                id
                alt
                sources {
                  url
                  mimeType
                }
                preview {
                  image {
                    url
                    width
                    height
                  }
                }
              }
              ... on ExternalVideo {
                id
                alt
                embeddedUrl
              }
            }
          }
        }
      }
    }
  `;

  const response = await shopifyGraphQL(query, { id: productGid });
  if (response.errors) {
    throw new Error(response.errors.map((e: any) => e.message).join(', '));
  }

  const product = response.data?.product;
  if (!product) throw new Error('Product not found');

  const mediaEdges = product.media?.edges || [];
  const media = mediaEdges.map((edge: any, index: number) => {
    const node = edge.node;
    const ct = node.mediaContentType;
    let url: string | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let sources: Array<{ url: string; mimeType: string }> | undefined;

    if (ct === 'IMAGE') {
      url = node.image?.url || null;
      width = node.image?.width || null;
      height = node.image?.height || null;
    } else if (ct === 'VIDEO') {
      url = node.preview?.image?.url || null;
      width = node.preview?.image?.width || null;
      height = node.preview?.image?.height || null;
      sources = node.sources;
    } else if (ct === 'EXTERNAL_VIDEO') {
      url = node.embeddedUrl || null;
    }

    return {
      id: node.id || '',
      mediaContentType: ct,
      alt: node.alt || null,
      url,
      width,
      height,
      position: index + 1,
      sources,
    };
  });

  return {
    product: {
      gid: product.id,
      title: product.title,
      handle: product.handle,
      vendor: product.vendor,
    },
    media,
  };
}

export async function uploadImageToShopifyProduct(
  imageBuffer: Buffer,
  filename: string,
  productGID: string,
  altText: string,
): Promise<{ success: boolean; mediaId?: string; error?: string }> {
  try {
    const ext = filename.toLowerCase().split('.').pop();
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    const stagedUploadMutation = `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters { name value }
          }
          userErrors { field message }
        }
      }
    `;

    const stagedResponse = await shopifyGraphQL(stagedUploadMutation, {
      input: [{
        resource: "PRODUCT_IMAGE",
        filename,
        mimeType,
        fileSize: imageBuffer.length.toString(),
        httpMethod: "POST",
      }],
    });

    if (stagedResponse.errors) {
      const msg = stagedResponse.errors.map((e: any) => e.message).join(', ');
      console.error('[Shopify] Staged upload GraphQL errors:', msg);
      return { success: false, error: msg };
    }

    if (stagedResponse.data?.stagedUploadsCreate?.userErrors?.length > 0) {
      const errs = stagedResponse.data.stagedUploadsCreate.userErrors;
      return { success: false, error: errs.map((e: any) => e.message).join(', ') };
    }

    const target = stagedResponse.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) return { success: false, error: 'No staged upload target' };

    const formData = new FormData();
    for (const param of target.parameters) {
      formData.append(param.name, param.value);
    }
    const blob = new Blob([imageBuffer], { type: mimeType });
    formData.append('file', blob, filename);

    const uploadRes = await fetch(target.url, { method: 'POST', body: formData });
    if (!uploadRes.ok) {
      return { success: false, error: `Upload failed: ${uploadRes.status}` };
    }

    const createMediaMutation = `
      mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media {
            ... on MediaImage {
              id
              image { url }
            }
          }
          mediaUserErrors { field message }
        }
      }
    `;

    const mediaResponse = await shopifyGraphQL(createMediaMutation, {
      productId: productGID,
      media: [{
        alt: altText,
        mediaContentType: "IMAGE",
        originalSource: target.resourceUrl,
      }],
    });

    if (mediaResponse.errors) {
      const msg = mediaResponse.errors.map((e: any) => e.message).join(', ');
      console.error('[Shopify] Create media GraphQL errors:', msg);
      return { success: false, error: msg };
    }

    const mediaErrors = mediaResponse.data?.productCreateMedia?.mediaUserErrors || [];
    if (mediaErrors.length > 0) {
      return { success: false, error: mediaErrors.map((e: any) => e.message).join(', ') };
    }

    const created = mediaResponse.data?.productCreateMedia?.media?.[0];
    if (!created?.id) {
      return { success: false, error: 'No media returned from Shopify' };
    }
    console.log(`[Shopify] Image uploaded to product: ${created.id}`);
    return { success: true, mediaId: created.id };
  } catch (error: any) {
    console.error('[Shopify] Image upload error:', error);
    return { success: false, error: error.message };
  }
}

export async function deleteProductMedia(
  productGid: string,
  mediaIds: string[],
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  try {
    const mutation = `
      mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
        productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
          deletedMediaIds
          mediaUserErrors { field message }
        }
      }
    `;

    const response = await shopifyGraphQL(mutation, {
      productId: productGid,
      mediaIds,
    });

    if (response.errors) {
      const msg = response.errors.map((e: any) => e.message).join(', ');
      console.error('[Shopify] Delete media GraphQL errors:', msg);
      return { success: false, deletedCount: 0, error: msg };
    }

    const errors = response.data?.productDeleteMedia?.mediaUserErrors || [];
    if (errors.length > 0) {
      return { success: false, deletedCount: 0, error: errors.map((e: any) => e.message).join(', ') };
    }

    const deletedIds = response.data?.productDeleteMedia?.deletedMediaIds || [];
    console.log(`[Shopify] Deleted ${deletedIds.length} media items from product ${productGid}`);
    return { success: true, deletedCount: deletedIds.length };
  } catch (error: any) {
    console.error('[Shopify] Delete media error:', error);
    return { success: false, deletedCount: 0, error: error.message };
  }
}

export async function reorderProductMedia(
  productGid: string,
  mediaIds: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const mutation = `
      mutation productReorderMedia($id: ID!, $moves: [MoveInput!]!) {
        productReorderMedia(id: $id, moves: $moves) {
          job { id }
          userErrors { field message }
        }
      }
    `;

    const moves = mediaIds.map((mediaId, index) => ({
      id: mediaId,
      newPosition: index.toString(),
    }));

    const response = await shopifyGraphQL(mutation, { id: productGid, moves });

    if (response.errors) {
      const msg = response.errors.map((e: any) => e.message).join(', ');
      console.error('[Shopify] Reorder GraphQL errors:', msg);
      return { success: false, error: msg };
    }

    const errors = response.data?.productReorderMedia?.userErrors || [];
    if (errors.length > 0) {
      return { success: false, error: errors.map((e: any) => e.message).join(', ') };
    }

    console.log(`[Shopify] Reordered ${mediaIds.length} media items on product ${productGid}`);
    return { success: true };
  } catch (error: any) {
    console.error('[Shopify] Reorder media error:', error);
    return { success: false, error: error.message };
  }
}
