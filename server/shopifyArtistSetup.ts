import type { ArtistAccount } from '@shared/schema';
import { ObjectStorageService } from './objectStorage';
import { clearArtistMetaobjectCache } from './shopifyService';

const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const objectStorageService = new ObjectStorageService();
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

interface SetupResult {
  success: boolean;
  metaobjectId?: string;
  collectionId?: string;
  error?: string;
}

interface StepResult {
  success: boolean;
  id?: string;
  fileId?: string;  // Photo file ID for passing to collection step
  error?: string;
}

async function shopifyGraphQL(query: string, variables?: any): Promise<any> {
  if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    throw new Error('Shopify credentials not configured');
  }

  const url = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-07/graphql.json`;
  
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

async function uploadImageToShopify(imageUrl: string, filename: string): Promise<string | null> {
  try {
    console.log(`[Shopify Setup] Uploading image: ${filename} from ${imageUrl}`);
    
    let imageBuffer: ArrayBuffer;
    let mimeType = 'image/jpeg';
    
    // Check if it's a relative object storage path
    if (imageUrl.startsWith('/objects/')) {
      console.log(`[Shopify Setup] Downloading from object storage: ${imageUrl}`);
      const buffer = await objectStorageService.downloadFileAsBuffer(imageUrl);
      if (!buffer) {
        console.error(`[Shopify Setup] Failed to download from object storage`);
        return null;
      }
      imageBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      // Detect mime type from extension
      if (imageUrl.toLowerCase().endsWith('.png')) {
        mimeType = 'image/png';
      } else if (imageUrl.toLowerCase().endsWith('.webp')) {
        mimeType = 'image/webp';
      }
    } else {
      // Fetch from external URL
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        console.error(`[Shopify Setup] Failed to fetch image: ${imageResponse.status}`);
        return null;
      }
      imageBuffer = await imageResponse.arrayBuffer();
      mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
    }
    
    // Step 2: Create staged upload target
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
    
    const stagedResponse = await shopifyGraphQL(stagedUploadMutation, {
      input: [{
        filename: filename,
        mimeType: mimeType,
        resource: "IMAGE",
        httpMethod: "POST",
        fileSize: String(imageBuffer.byteLength),
      }]
    });
    
    if (stagedResponse.data?.stagedUploadsCreate?.userErrors?.length > 0) {
      console.error('[Shopify Setup] Staged upload error:', stagedResponse.data.stagedUploadsCreate.userErrors);
      return null;
    }
    
    const stagedTarget = stagedResponse.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!stagedTarget) {
      console.error('[Shopify Setup] No staged target returned');
      return null;
    }
    
    // Step 3: Upload file to staged URL using multipart form
    const formData = new FormData();
    for (const param of stagedTarget.parameters) {
      formData.append(param.name, param.value);
    }
    formData.append('file', new Blob([imageBuffer], { type: mimeType }), filename);
    
    const uploadResponse = await fetch(stagedTarget.url, {
      method: 'POST',
      body: formData,
    });
    
    if (!uploadResponse.ok) {
      console.error(`[Shopify Setup] File upload failed: ${uploadResponse.status}`);
      return null;
    }
    
    console.log(`[Shopify Setup] File uploaded to staged URL, creating file record...`);
    
    // Step 4: Create file record in Shopify
    const fileCreateMutation = `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            alt
            ... on MediaImage {
              id
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const fileCreateResponse = await shopifyGraphQL(fileCreateMutation, {
      files: [{
        alt: filename.replace(/\.[^.]+$/, ''),
        contentType: "IMAGE",
        originalSource: stagedTarget.resourceUrl,
      }]
    });
    
    if (fileCreateResponse.data?.fileCreate?.userErrors?.length > 0) {
      console.error('[Shopify Setup] File create error:', fileCreateResponse.data.fileCreate.userErrors);
      return null;
    }
    
    const createdFile = fileCreateResponse.data?.fileCreate?.files?.[0];
    if (createdFile?.id) {
      console.log(`[Shopify Setup] Created Shopify file: ${createdFile.id}`);
      return createdFile.id;
    }
    
    return null;
  } catch (error) {
    console.error('[Shopify Setup] Error uploading image:', error);
    return null;
  }
}

interface MetaobjectResult {
  metaobjectId: string | null;
  photoFileId?: string | null;
}

function getArtistDisplayName(account: ArtistAccount): string {
  // Priority: artistAlias > firstName+lastName > vendorName
  if (account.artistAlias) return account.artistAlias;
  if (account.firstName && account.lastName) return `${account.firstName} ${account.lastName}`;
  if (account.firstName) return account.firstName;
  return account.vendorName;
}

async function createArtistMetaobject(account: ArtistAccount, selectedPhotoUrl?: string): Promise<MetaobjectResult> {
  const artistName = getArtistDisplayName(account);
  const handle = slugify(artistName);
  
  console.log(`[Shopify Setup] Creating metaobject for artist: ${artistName}`);
  
  // Fields matching the Shopify "artists" metaobject definition
  // Field keys: name, artist_photo (Shopify file reference), artist_bio (text)
  const fields: Array<{ key: string; value: string }> = [
    { key: "name", value: artistName },
  ];
  
  if (account.bio) {
    fields.push({ key: "artist_bio", value: account.bio });
  }
  
  // Upload artist photo to Shopify if available
  // Use selected photo URL if provided, otherwise fall back to first photo
  const photoUrl = selectedPhotoUrl || (account.photoUrls && account.photoUrls.length > 0 ? account.photoUrls[0] : null);
  let uploadedFileId: string | null = null;
  
  if (photoUrl) {
    const filename = `${handle}-artist-photo.jpg`;
    uploadedFileId = await uploadImageToShopify(photoUrl, filename);
    if (uploadedFileId) {
      fields.push({ key: "artist_photo", value: uploadedFileId });
    } else {
      console.log(`[Shopify Setup] Could not upload artist photo, continuing without it`);
    }
  }
  
  const mutation = `
    mutation CreateArtistMetaobject($metaobject: MetaobjectCreateInput!) {
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

  const variables = {
    metaobject: {
      type: "artists",
      handle: handle,
      fields: fields,
      capabilities: {
        publishable: {
          status: "ACTIVE",
        },
      },
    },
  };

  try {
    const response = await shopifyGraphQL(mutation, variables);
    
    if (response.data?.metaobjectCreate?.userErrors?.length > 0) {
      const errors = response.data.metaobjectCreate.userErrors;
      console.error('[Shopify Setup] Failed to create artist metaobject:', errors);
      
      if (errors.some((e: any) => e.message?.includes('Handle has already been taken'))) {
        console.log('[Shopify Setup] Metaobject already exists, trying to find it...');
        const existingId = await findExistingMetaobject(handle);
        return { metaobjectId: existingId, photoFileId: uploadedFileId };
      }
      return { metaobjectId: null };
    }
    
    const newArtist = response.data?.metaobjectCreate?.metaobject;
    if (newArtist) {
      console.log(`[Shopify Setup] Created artist metaobject: ${newArtist.id}`);
      return { metaobjectId: newArtist.id, photoFileId: uploadedFileId };
    }
    
    return { metaobjectId: null };
  } catch (error) {
    console.error('[Shopify Setup] Error creating artist metaobject:', error);
    return { metaobjectId: null };
  }
}

async function findExistingMetaobject(handle: string): Promise<string | null> {
  const query = `
    query FindMetaobject($handle: MetaobjectHandleInput!) {
      metaobjectByHandle(handle: $handle) {
        id
        handle
      }
    }
  `;

  try {
    const response = await shopifyGraphQL(query, {
      handle: { type: "artists", handle: handle }
    });
    
    return response.data?.metaobjectByHandle?.id || null;
  } catch (error) {
    console.error('[Shopify Setup] Error finding metaobject:', error);
    return null;
  }
}

interface CollectionResult {
  collectionId: string | null;
  fileId?: string | null;
}

async function createArtistCollection(account: ArtistAccount, photoFileId?: string | null): Promise<CollectionResult> {
  const artistName = getArtistDisplayName(account);
  const handle = slugify(artistName);
  
  console.log(`[Shopify Setup] Creating collection for artist: ${artistName}`);
  
  // SEO settings matching user requirements
  const seoTitle = `${artistName} Wall Art Prints | East Side Studio London`;
  const seoDescription = `Shop wall art by ${artistName} at East Side Studio London. Your go-to destination for high-quality, affordable, framed & unframed prints. Global shipping.`;
  
  const mutation = `
    mutation CreateCollection($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection {
          id
          handle
          title
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
      title: artistName,
      handle: handle,
      descriptionHtml: account.bio || `Explore artwork by ${artistName}`,
      templateSuffix: "artist-collection-page",
      ruleSet: {
        appliedDisjunctively: false,
        rules: [
          {
            column: "VENDOR",
            relation: "EQUALS",
            condition: account.vendorName,
          }
        ]
      },
      sortOrder: "BEST_SELLING",
      seo: {
        title: seoTitle,
        description: seoDescription,
      },
    },
  };

  try {
    const response = await shopifyGraphQL(mutation, variables);
    
    if (response.data?.collectionCreate?.userErrors?.length > 0) {
      const errors = response.data.collectionCreate.userErrors;
      console.error('[Shopify Setup] Failed to create collection:', errors);
      
      if (errors.some((e: any) => e.message?.includes('Handle has already been taken'))) {
        console.log('[Shopify Setup] Collection already exists, trying to find it...');
        const existingId = await findExistingCollection(handle);
        if (existingId) {
          // Update existing collection with new settings
          await updateCollectionSettings(existingId, artistName, account.bio, seoTitle, seoDescription);
          // Also set metafields and publish for existing collections
          await setCollectionMetafields(existingId, artistName, account.bio, photoFileId);
          await publishCollectionToAllChannels(existingId);
          return { collectionId: existingId, fileId: photoFileId };
        }
        return { collectionId: null };
      }
      return { collectionId: null };
    }
    
    const collection = response.data?.collectionCreate?.collection;
    if (collection) {
      console.log(`[Shopify Setup] Created collection: ${collection.id}`);
      
      // Set collection metafields
      await setCollectionMetafields(collection.id, artistName, account.bio, photoFileId);
      
      // Publish to all sales channels
      await publishCollectionToAllChannels(collection.id);
      
      return { collectionId: collection.id, fileId: photoFileId };
    }
    
    return { collectionId: null };
  } catch (error) {
    console.error('[Shopify Setup] Error creating collection:', error);
    return { collectionId: null };
  }
}

async function updateCollectionSettings(
  collectionId: string, 
  artistName: string, 
  bio: string | null | undefined,
  seoTitle: string,
  seoDescription: string
): Promise<boolean> {
  console.log(`[Shopify Setup] Updating collection settings: ${collectionId}`);
  
  const mutation = `
    mutation UpdateCollection($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection {
          id
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
      id: collectionId,
      templateSuffix: "artist-collection-page",
      sortOrder: "BEST_SELLING",
      seo: {
        title: seoTitle,
        description: seoDescription,
      },
    },
  };

  try {
    const response = await shopifyGraphQL(mutation, variables);
    if (response.data?.collectionUpdate?.userErrors?.length > 0) {
      console.error('[Shopify Setup] Failed to update collection:', response.data.collectionUpdate.userErrors);
      return false;
    }
    console.log(`[Shopify Setup] Updated collection settings`);
    return true;
  } catch (error) {
    console.error('[Shopify Setup] Error updating collection:', error);
    return false;
  }
}

async function setCollectionMetafields(
  collectionId: string, 
  artistName: string, 
  bio: string | null | undefined,
  photoFileId?: string | null
): Promise<boolean> {
  console.log(`[Shopify Setup] Setting collection metafields for: ${collectionId}`);
  
  const metafields: Array<{ ownerId: string; namespace: string; key: string; value: string; type: string }> = [
    {
      ownerId: collectionId,
      namespace: "custom",
      key: "artist_name",
      value: artistName,
      type: "single_line_text_field",
    },
  ];
  
  if (bio) {
    metafields.push({
      ownerId: collectionId,
      namespace: "custom",
      key: "artist_profile",
      value: bio,
      type: "multi_line_text_field",
    });
  }
  
  if (photoFileId) {
    metafields.push({
      ownerId: collectionId,
      namespace: "custom",
      key: "artist_photo",
      value: photoFileId,
      type: "file_reference",
    });
  }
  
  const mutation = `
    mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
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

  try {
    const response = await shopifyGraphQL(mutation, { metafields });
    
    if (response.data?.metafieldsSet?.userErrors?.length > 0) {
      console.error('[Shopify Setup] Failed to set metafields:', response.data.metafieldsSet.userErrors);
      return false;
    }
    
    console.log(`[Shopify Setup] Set ${metafields.length} metafields on collection`);
    return true;
  } catch (error) {
    console.error('[Shopify Setup] Error setting metafields:', error);
    return false;
  }
}

async function getPublications(): Promise<Array<{ id: string; name: string }>> {
  const query = `
    query GetPublications {
      publications(first: 20) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `;

  try {
    const response = await shopifyGraphQL(query);
    const edges = response.data?.publications?.edges || [];
    return edges.map((edge: any) => ({
      id: edge.node.id,
      name: edge.node.name,
    }));
  } catch (error) {
    console.error('[Shopify Setup] Error getting publications:', error);
    return [];
  }
}

async function publishCollectionToAllChannels(collectionId: string): Promise<boolean> {
  console.log(`[Shopify Setup] Publishing collection to all channels: ${collectionId}`);
  
  const publications = await getPublications();
  if (publications.length === 0) {
    console.log('[Shopify Setup] No publications found');
    return false;
  }
  
  console.log(`[Shopify Setup] Found ${publications.length} publications: ${publications.map(p => p.name).join(', ')}`);
  
  const mutation = `
    mutation PublishCollection($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        publishable {
          ... on Collection {
            id
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
    input: publications.map(pub => ({ publicationId: pub.id })),
  };

  try {
    const response = await shopifyGraphQL(mutation, variables);
    
    if (response.data?.publishablePublish?.userErrors?.length > 0) {
      console.error('[Shopify Setup] Failed to publish collection:', response.data.publishablePublish.userErrors);
      return false;
    }
    
    console.log(`[Shopify Setup] Published collection to ${publications.length} channels`);
    return true;
  } catch (error) {
    console.error('[Shopify Setup] Error publishing collection:', error);
    return false;
  }
}

async function findExistingCollection(handle: string): Promise<string | null> {
  const query = `
    query FindCollection($handle: String!) {
      collectionByHandle(handle: $handle) {
        id
        handle
      }
    }
  `;

  try {
    const response = await shopifyGraphQL(query, { handle });
    return response.data?.collectionByHandle?.id || null;
  } catch (error) {
    console.error('[Shopify Setup] Error finding collection:', error);
    return null;
  }
}

async function findMenuByHandle(handle: string): Promise<{ id: string; title: string; items: any[] } | null> {
  // Shopify menu query requires ID, not handle. We need to list all menus and find by handle.
  const query = `
    query ListMenus {
      menus(first: 50) {
        nodes {
          id
          handle
          title
          items {
            id
            title
            type
            url
            resourceId
            items {
              id
              title
              type
              url
              resourceId
              items {
                id
                title
                type
                url
                resourceId
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await shopifyGraphQL(query, {});
    const menus = response.data?.menus?.nodes || [];
    
    console.log(`[Shopify Setup] Found ${menus.length} menus:`, menus.map((m: any) => `${m.title} (${m.handle})`).join(', '));
    
    // Find menu by handle (case-insensitive)
    const menu = menus.find((m: any) => m.handle?.toLowerCase() === handle.toLowerCase());
    
    if (menu) {
      console.log(`[Shopify Setup] Found menu "${menu.title}" with handle "${menu.handle}", ID: ${menu.id}`);
      return { id: menu.id, title: menu.title, items: menu.items || [] };
    }
    
    console.error(`[Shopify Setup] Menu with handle "${handle}" not found. Available handles: ${menus.map((m: any) => m.handle).join(', ')}`);
    return null;
  } catch (error) {
    console.error('[Shopify Setup] Error finding menu:', error);
    return null;
  }
}

// Find a nested menu item by title within a menu
function findNestedMenuItem(items: any[], targetTitle: string): { parentItem: any; children: any[] } | null {
  for (const item of items) {
    // Check if this item matches
    if (item.title?.toLowerCase() === targetTitle.toLowerCase()) {
      return { parentItem: item, children: item.items || [] };
    }
    // Check nested items
    if (item.items && item.items.length > 0) {
      const found = findNestedMenuItem(item.items, targetTitle);
      if (found) return found;
    }
  }
  return null;
}

function convertMenuItemToUpdateInput(item: any): any {
  const updateItem: any = {
    id: item.id,
    title: item.title,
    type: item.type || "HTTP",
  };
  
  if (item.url) {
    updateItem.url = item.url;
  }
  
  if (item.resourceId) {
    updateItem.resourceId = item.resourceId;
  }
  
  if (item.items && item.items.length > 0) {
    updateItem.items = item.items.map(convertMenuItemToUpdateInput);
  } else {
    updateItem.items = [];
  }
  
  return updateItem;
}

function convertMenuItemWithNewChild(item: any, targetParentId: string, newChild: any): any {
  const updateItem: any = {
    id: item.id,
    title: item.title,
    type: item.type || "HTTP",
  };
  
  if (item.url) {
    updateItem.url = item.url;
  }
  
  if (item.resourceId) {
    updateItem.resourceId = item.resourceId;
  }
  
  if (item.id === targetParentId) {
    const existingChildren = item.items ? item.items.map(convertMenuItemToUpdateInput) : [];
    updateItem.items = [...existingChildren, newChild];
  } else if (item.items && item.items.length > 0) {
    updateItem.items = item.items.map((child: any) => convertMenuItemWithNewChild(child, targetParentId, newChild));
  } else {
    updateItem.items = [];
  }
  
  return updateItem;
}

async function addToMenu(menuHandle: string, title: string, collectionId: string, parentItemTitle?: string): Promise<boolean> {
  console.log(`[Shopify Setup] Adding "${title}" to menu "${menuHandle}"${parentItemTitle ? ` under "${parentItemTitle}"` : ''}`);
  console.log(`[Shopify Setup] Menu handle: "${menuHandle}", Collection GID: "${collectionId}"`);
  
  const menu = await findMenuByHandle(menuHandle);
  if (!menu) {
    console.error(`[Shopify Setup] Menu "${menuHandle}" not found - please ensure this menu exists in Shopify Admin > Online Store > Navigation`);
    return false;
  }
  
  console.log(`[Shopify Setup] Found menu "${menuHandle}" with ID: ${menu.id}, ${menu.items.length} existing items`);
  
  if (parentItemTitle) {
    const nestedItem = findNestedMenuItem(menu.items, parentItemTitle);
    if (!nestedItem) {
      console.error(`[Shopify Setup] Parent item "${parentItemTitle}" not found in menu "${menuHandle}"`);
      return false;
    }
    
    const existingChild = nestedItem.children.find((item: any) => 
      item.resourceId === collectionId || item.title === title
    );
    
    if (existingChild) {
      console.log(`[Shopify Setup] "${title}" already exists in "${parentItemTitle}"`);
      return true;
    }
    
    console.log(`[Shopify Setup] Adding "${title}" as child of "${parentItemTitle}" (${nestedItem.parentItem.id})`);
    
    const newChildItem = {
      title: title,
      resourceId: collectionId,
      type: "COLLECTION",
      items: [],
    };
    
    const updatedItems = menu.items.map((item: any) => {
      return convertMenuItemWithNewChild(item, nestedItem.parentItem.id, newChildItem);
    });
    
    return await updateMenuWithItems(menu.id, menuHandle, updatedItems, menu.title);
  } else {
    const existingItem = menu.items.find((item: any) => 
      item.resourceId === collectionId || item.title === title
    );
    
    if (existingItem) {
      console.log(`[Shopify Setup] "${title}" already exists in menu`);
      return true;
    }
    
    console.log(`[Shopify Setup] Adding "${title}" as top-level item to menu`);
    
    const updatedItems = menu.items.map(convertMenuItemToUpdateInput);
    
    updatedItems.push({
      title: title,
      resourceId: collectionId,
      type: "COLLECTION",
      items: [],
    });
    
    return await updateMenuWithItems(menu.id, menuHandle, updatedItems, menu.title);
  }
}

async function updateMenuWithItems(menuId: string, handle: string, items: any[], menuTitle?: string): Promise<boolean> {
  const mutation = `
    mutation MenuUpdate($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
        menu {
          id
          handle
          items {
            id
            title
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const variables = {
    id: menuId,
    title: menuTitle || handle,
    handle: handle,
    items: items,
  };

  console.log(`[Shopify Setup] Updating menu with ${items.length} items...`);

  try {
    const response = await shopifyGraphQL(mutation, variables);
    
    if (response.errors) {
      console.error('[Shopify Setup] GraphQL errors:', JSON.stringify(response.errors, null, 2));
      return false;
    }
    
    if (response.data?.menuUpdate?.userErrors?.length > 0) {
      const errors = response.data.menuUpdate.userErrors;
      console.error('[Shopify Setup] Failed to update menu:', JSON.stringify(errors, null, 2));
      return false;
    }
    
    const updatedMenu = response.data?.menuUpdate?.menu;
    if (updatedMenu) {
      console.log(`[Shopify Setup] Menu updated successfully, now has ${updatedMenu.items?.length || 0} items`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('[Shopify Setup] Error updating menu:', error);
    return false;
  }
}

export async function setupArtistInShopify(account: ArtistAccount): Promise<SetupResult> {
  const artistName = getArtistDisplayName(account);
  console.log(`[Shopify Setup] Starting setup for artist: ${artistName}`);
  
  if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    return { success: false, error: "Shopify credentials not configured" };
  }
  
  const metaobjectResult = await createArtistMetaobject(account);
  if (!metaobjectResult.metaobjectId) {
    console.log('[Shopify Setup] Continuing without metaobject (may not be critical)');
  }
  
  const collectionResult = await createArtistCollection(account, metaobjectResult.photoFileId);
  if (!collectionResult.collectionId) {
    return { success: false, error: "Failed to create artist collection" };
  }
  
  const menuErrors: string[] = [];
  
  // Add artist to "All Artists" menu (separate menu)
  const allArtistsResult = await addToMenu("all-artists", artistName, collectionResult.collectionId);
  if (!allArtistsResult) {
    menuErrors.push("'All Artists' menu");
  }
  
  // Also add to "Shop by Artist" submenu within "Main menu"
  const shopByArtistResult = await addToMenu("main-menu", artistName, collectionResult.collectionId, "Shop by Artist");
  if (!shopByArtistResult) {
    menuErrors.push("'Shop by Artist' menu");
  }
  
  if (menuErrors.length > 0) {
    const errorMessage = `Failed to add artist to menus: ${menuErrors.join(", ")}`;
    console.error(`[Shopify Setup] ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
  
  console.log(`[Shopify Setup] Setup complete for artist: ${account.vendorName}`);
  
  return {
    success: true,
    metaobjectId: metaobjectResult.metaobjectId || undefined,
    collectionId: collectionResult.collectionId,
  };
}

// Individual step functions for granular control
export async function setupMetaobjectStep(account: ArtistAccount, photoUrl?: string): Promise<StepResult> {
  console.log(`[Shopify Setup] Creating metaobject for: ${account.vendorName}`);
  
  if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    return { success: false, error: "Shopify credentials not configured" };
  }
  
  try {
    const result = await createArtistMetaobject(account, photoUrl);
    if (!result.metaobjectId) {
      return { success: false, error: "Failed to create artist metaobject" };
    }
    
    clearArtistMetaobjectCache();
    
    return { success: true, id: result.metaobjectId, fileId: result.photoFileId || undefined };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Shopify Setup] Metaobject step failed:`, error);
    return { success: false, error: errorMessage };
  }
}

export async function setupCollectionStep(account: ArtistAccount, photoFileId?: string): Promise<StepResult> {
  console.log(`[Shopify Setup] Creating collection for: ${account.vendorName}`);
  
  if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    return { success: false, error: "Shopify credentials not configured" };
  }
  
  try {
    const result = await createArtistCollection(account, photoFileId);
    if (!result.collectionId) {
      return { success: false, error: "Failed to create artist collection" };
    }
    
    return { success: true, id: result.collectionId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Shopify Setup] Collection step failed:`, error);
    return { success: false, error: errorMessage };
  }
}

export async function setupMenusStep(account: ArtistAccount, collectionId: string): Promise<StepResult> {
  const artistName = getArtistDisplayName(account);
  console.log(`[Shopify Setup] Adding to menus for: ${artistName}`);
  
  if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    return { success: false, error: "Shopify credentials not configured" };
  }
  
  if (!collectionId) {
    return { success: false, error: "Collection ID required - create collection first" };
  }
  const menuErrors: string[] = [];
  
  try {
    // Add artist to "All Artists" menu (separate menu)
    const allArtistsResult = await addToMenu("all-artists", artistName, collectionId);
    if (!allArtistsResult) {
      menuErrors.push("'All Artists' menu");
    }
    
    // Also add to "Shop by Artist" submenu within "Main menu"
    const shopByArtistResult = await addToMenu("main-menu", artistName, collectionId, "Shop by Artist");
    if (!shopByArtistResult) {
      menuErrors.push("'Shop by Artist' menu");
    }
    
    if (menuErrors.length > 0) {
      return { success: false, error: `Failed to add to: ${menuErrors.join(", ")}` };
    }
    
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Shopify Setup] Menus step failed:`, error);
    return { success: false, error: errorMessage };
  }
}
