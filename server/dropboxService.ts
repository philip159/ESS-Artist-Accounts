// Dropbox integration using the Replit Dropbox connection
// Reference: dropbox blueprint

import { getUncachableDropboxClient } from "./dropboxClient";

export interface DropboxUploadResult {
  path: string;
  id: string;
  name: string;
}

export type AspectRatioCategory = "Square" | "Portrait" | "Landscape";

// Extract folder-friendly ratio name from aspect ratio string
// e.g., "3:4 Portrait" -> "3-4", "A Ratio (√2:1)" -> "A-Ratio", "1:1 Square" -> "1-1"
export function getRatioFolderName(aspectRatio: string): string {
  try {
    const lowerAspect = aspectRatio.toLowerCase();
    
    // Handle A-ratio specifically
    if (lowerAspect.includes("a ratio") || lowerAspect.includes("a-ratio") || lowerAspect.includes("√2")) {
      return "A-Ratio";
    }
    
    // Extract the numeric ratio part (e.g., "3:4" from "3:4 Portrait")
    const ratioMatch = aspectRatio.match(/(\d+):(\d+)/);
    if (ratioMatch) {
      return `${ratioMatch[1]}-${ratioMatch[2]}`;
    }
    
    // Fallback: sanitize the entire string
    return aspectRatio.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || "Other";
  } catch (error) {
    console.error(`[Dropbox] Error extracting ratio folder name: ${aspectRatio}`, error);
    return "Other";
  }
}

export function categorizeAspectRatio(aspectRatio: string): AspectRatioCategory {
  try {
    // Handle descriptive aspect ratio strings like "3:4 Portrait", "A Ratio (√2:1)", etc.
    // First check if it contains orientation keywords
    const lowerAspect = aspectRatio.toLowerCase();
    
    if (lowerAspect.includes("square") || aspectRatio === "1:1") {
      return "Square";
    }
    
    if (lowerAspect.includes("portrait")) {
      return "Portrait";
    }
    
    if (lowerAspect.includes("landscape")) {
      return "Landscape";
    }
    
    // If no keyword, try to parse the numeric ratio
    if (!aspectRatio.includes(":")) {
      console.warn(`[Dropbox] Invalid aspect ratio format: ${aspectRatio}, defaulting to Landscape`);
      return "Landscape";
    }
    
    // Extract just the numeric part before any space or parenthesis
    // e.g., "3:4 Portrait" -> "3:4", "A Ratio (√2:1)" would need special handling
    const numericPart = aspectRatio.split(/[\s(]/)[0];
    const parts = numericPart.split(":");
    const width = Number(parts[0]);
    const height = Number(parts[1]);
    
    // Validate parsed numbers
    if (!width || !height || isNaN(width) || isNaN(height) || height === 0) {
      console.warn(`[Dropbox] Invalid aspect ratio values: ${aspectRatio}, defaulting to Landscape`);
      return "Landscape";
    }
    
    const ratio = width / height;
    
    // Square: ratio between 0.95 and 1.05
    if (ratio >= 0.95 && ratio <= 1.05) {
      return "Square";
    }
    
    // Portrait: width < height (ratio < 1)
    if (ratio < 0.95) {
      return "Portrait";
    }
    
    // Landscape: width > height (ratio > 1)
    return "Landscape";
  } catch (error) {
    console.error(`[Dropbox] Error categorizing aspect ratio: ${aspectRatio}`, error);
    return "Landscape";
  }
}

export function createSubmissionFolderStructure(artistName: string, date: Date, uploadBatchId?: string, dropboxBasePath?: string): {
  basePath: string;
  pendingPath: string;
  completedPath: string;
  baseSubfolders: string[];
  highResPath: string;
  getHighResPath: (aspectRatio: string) => string;
  getLowResPath: (aspectRatio: string) => string;
  mockupsPath: string;
  coasPath: string;
} {
  // Format: Artist Name_DD-MM-YYYY or fallback to batch ID if name is empty
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const dateStr = `${day}-${month}-${year}`;
  const sanitizedArtistName = artistName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').trim();
  
  // Use uploadBatchId for consistent folder naming within a batch
  // Only generate random suffix for single uploads without a batch ID
  const suffix = uploadBatchId 
    ? uploadBatchId.substring(0, 8) 
    : String(Math.floor(Math.random() * 900) + 100); // 100-999 for non-batch
  
  // Ensure unique path even for anonymous submissions
  let folderName: string;
  if (sanitizedArtistName && sanitizedArtistName !== '_') {
    folderName = `${sanitizedArtistName}_${dateStr}_${suffix}`;
  } else if (uploadBatchId) {
    folderName = `Submission_${uploadBatchId.substring(0, 8)}_${dateStr}`;
  } else {
    // Ultimate fallback: use timestamp
    folderName = `Anonymous_${Date.now()}_${dateStr}_${suffix}`;
  }
  
  // Use configurable base path from settings, with fallback
  const rootPath = dropboxBasePath || "/Artist Uploads 2026";
  // Artworks go to Pending folder first, then moved to Completed after Shopify sync
  const basePath = `${rootPath}/Pending/${folderName}`;
  const pendingPath = `${rootPath}/Pending/${folderName}`;
  const completedPath = `${rootPath}/Completed/${folderName}`;
  
  return {
    basePath,
    pendingPath,
    completedPath,
    // Only create base folders - ratio subfolders created on-demand during upload
    // COAs folder is created on-demand when limited edition artwork is submitted
    baseSubfolders: [
      "HighRes",
      "Low Res",
      "Mockups"
    ],
    // Legacy flat path (for backward compatibility)
    highResPath: `${basePath}/HighRes`,
    // New ratio-based paths for both High Res and Low Res
    getHighResPath: (aspectRatio: string) => `${basePath}/HighRes/${getRatioFolderName(aspectRatio)}`,
    getLowResPath: (aspectRatio: string) => `${basePath}/Low Res/${getRatioFolderName(aspectRatio)}`,
    mockupsPath: `${basePath}/Mockups`,
    coasPath: `${basePath}/COAs`,
  };
}

export async function uploadToDropbox(
  buffer: Buffer,
  path: string,
  filename: string
): Promise<DropboxUploadResult> {
  const dbx = await getUncachableDropboxClient();
  
  // Ensure the destination folder exists before uploading
  // This creates aspect ratio folders on-demand
  await createFolder(path);
  
  // Ensure path starts with /
  const fullPath = path.startsWith("/") ? `${path}/${filename}` : `/${path}/${filename}`;
  
  const response = await dbx.filesUpload({
    path: fullPath,
    contents: buffer,
    mode: { ".tag": "overwrite" },
  });
  
  return {
    path: response.result.path_display || fullPath,
    id: response.result.id,
    name: response.result.name,
  };
}

export function getMockupsPathFromArtwork(artworkDropboxPath: string): string | null {
  if (!artworkDropboxPath) return null;
  const pendingMatch = artworkDropboxPath.match(/^(.*?\/Pending\/[^/]+)/);
  if (pendingMatch) return `${pendingMatch[1]}/Mockups`;
  const completedMatch = artworkDropboxPath.match(/^(.*?\/Completed\/[^/]+)/);
  if (completedMatch) return `${completedMatch[1]}/Mockups`;
  return null;
}

export async function syncMockupToDropbox(
  buffer: Buffer,
  artworkDropboxPath: string | null | undefined,
  filename: string,
): Promise<string | null> {
  if (!artworkDropboxPath) return null;
  const mockupsPath = getMockupsPathFromArtwork(artworkDropboxPath);
  if (!mockupsPath) {
    console.log(`[DropboxSync] Could not determine Mockups path from artwork dropboxPath: ${artworkDropboxPath}`);
    return null;
  }
  try {
    const result = await uploadToDropbox(buffer, mockupsPath, filename);
    console.log(`[DropboxSync] Uploaded mockup to Dropbox: ${result.path}`);
    return result.path;
  } catch (err) {
    console.error(`[DropboxSync] Failed to upload mockup "${filename}" to Dropbox:`, err);
    return null;
  }
}

export async function downloadFromDropbox(path: string): Promise<Buffer> {
  const dbx = await getUncachableDropboxClient();
  
  const response = await dbx.filesDownload({ path });
  // @ts-ignore - fileBinary is a Buffer
  return response.result.fileBinary as Buffer;
}

export async function getDropboxThumbnail(path: string): Promise<Buffer> {
  const dbx = await getUncachableDropboxClient();
  const response = await dbx.filesGetThumbnailV2({
    resource: { '.tag': 'path', path },
    size: { '.tag': 'w256h256' },
    format: { '.tag': 'jpeg' },
  });
  // @ts-ignore - fileBinary is a Buffer
  return response.result.fileBinary as Buffer;
}

export interface DropboxFileEntry {
  name: string;
  path: string;
  id: string;
  isFolder: boolean;
  size?: number;  // File size in bytes
}

export async function listFilesInFolder(folderPath: string): Promise<DropboxFileEntry[]> {
  const dbx = await getUncachableDropboxClient();
  
  try {
    const response = await dbx.filesListFolder({ path: folderPath });
    
    return response.result.entries.map(entry => ({
      name: entry.name,
      path: entry.path_display || entry.path_lower || '',
      id: entry['.tag'] === 'deleted' ? '' : (entry as any).id,
      isFolder: entry['.tag'] === 'folder',
    }));
  } catch (error: any) {
    console.error(`[Dropbox] Failed to list files in ${folderPath}:`, error);
    throw error;
  }
}

export async function createFolder(path: string): Promise<void> {
  const dbx = await getUncachableDropboxClient();
  
  // Ensure path starts with /
  const folderPath = path.startsWith("/") ? path : `/${path}`;
  
  try {
    await dbx.filesCreateFolderV2({
      path: folderPath,
      autorename: false,
    });
  } catch (error: any) {
    // Ignore if folder already exists
    if (!error?.error?.error_summary?.includes("path/conflict/folder")) {
      throw error;
    }
  }
}

export async function createFolderStructure(basePath: string, subfolders: string[]): Promise<void> {
  // Create base folder first
  try {
    await createFolder(basePath);
  } catch (error) {
    console.error(`[Dropbox] Failed to create base folder ${basePath}:`, error);
    // If base folder fails, no point creating subfolders
    return;
  }
  
  // Create all subfolders, continue even if some fail
  for (const subfolder of subfolders) {
    try {
      const fullPath = `${basePath}/${subfolder}`;
      await createFolder(fullPath);
    } catch (error) {
      console.error(`[Dropbox] Failed to create subfolder ${subfolder}:`, error);
      // Continue with next folder
    }
  }
}

export async function listFolder(path: string): Promise<Array<{ name: string; path: string; isFolder: boolean }>> {
  const dbx = await getUncachableDropboxClient();
  
  const response = await dbx.filesListFolder({
    path: path.startsWith("/") ? path : `/${path}`,
  });
  
  return response.result.entries.map((entry) => ({
    name: entry.name,
    path: entry.path_display || entry.path_lower || "",
    isFolder: entry[".tag"] === "folder",
  }));
}

/**
 * Convert a Dropbox sharing URL to a raw/direct access URL
 * Changes dl=0 to raw=1 for publicly accessible direct image access
 * Handles both ?dl=0 and &dl=0 formats
 */
export function convertToRawDropboxUrl(url: string): string {
  if (!url.includes('dropbox.com')) {
    return url;
  }
  // Handle both ?dl=0 and &dl=0 formats
  return url.replace(/[?&]dl=0/, (match) => match[0] + 'raw=1');
}

export async function createSharedLink(path: string): Promise<string> {
  const dbx = await getUncachableDropboxClient();
  
  try {
    // Try to create a new shared link
    const response = await dbx.sharingCreateSharedLinkWithSettings({
      path,
      settings: {
        requested_visibility: { ".tag": "public" },
      },
    });
    return response.result.url;
  } catch (error: any) {
    // If link already exists, fetch it
    if (error?.error?.error_summary?.includes("shared_link_already_exists")) {
      const links = await dbx.sharingListSharedLinks({ path });
      if (links.result.links.length > 0) {
        return links.result.links[0].url;
      }
    }
    throw error;
  }
}

/**
 * Move a folder from one location to another in Dropbox
 * Used to move artwork folders from Pending to Completed after Shopify sync
 */
export async function moveFolder(fromPath: string, toPath: string): Promise<{ success: boolean; newPath?: string; error?: string }> {
  const dbx = await getUncachableDropboxClient();
  
  // Ensure paths start with /
  const from = fromPath.startsWith("/") ? fromPath : `/${fromPath}`;
  const to = toPath.startsWith("/") ? toPath : `/${toPath}`;
  
  console.log(`[Dropbox] Moving folder from "${from}" to "${to}"`);
  
  try {
    const response = await dbx.filesMoveV2({
      from_path: from,
      to_path: to,
      autorename: false,
      allow_ownership_transfer: false,
    });
    
    const newPath = response.result.metadata.path_display || to;
    console.log(`[Dropbox] Successfully moved folder to "${newPath}"`);
    
    return { success: true, newPath };
  } catch (error: any) {
    // Handle case where destination already exists
    if (error?.error?.error_summary?.includes("to/conflict/folder")) {
      console.log(`[Dropbox] Destination folder already exists at "${to}"`);
      return { success: true, newPath: to };
    }
    
    // Handle case where source doesn't exist (already moved)
    if (error?.error?.error_summary?.includes("from_lookup/not_found")) {
      console.log(`[Dropbox] Source folder not found at "${from}" - may have already been moved`);
      return { success: true, newPath: to };
    }
    
    console.error(`[Dropbox] Failed to move folder: ${error?.error?.error_summary || error.message}`);
    return { 
      success: false, 
      error: error?.error?.error_summary || error.message || 'Unknown error'
    };
  }
}

/**
 * Move an artwork's folder from Pending to Completed
 * Returns the new path if successful
 * 
 * The dropboxPath may be a file path like:
 *   /Artist Uploads 2026/Pending/Artist_Name_01-01-2026/HighRes/3-4/filename.jpg
 * We need to extract the submission folder:
 *   /Artist Uploads 2026/Pending/Artist_Name_01-01-2026
 */
/**
 * Search for low-res artwork files in Dropbox that match a given artwork title
 * Searches recursively through Artist Onboarding folders
 */
export async function searchForLowResArtwork(
  artworkTitle: string,
  searchPath: string = "/Artists/Artist Onboarding"
): Promise<DropboxFileEntry[]> {
  const dbx = await getUncachableDropboxClient();
  const matches: DropboxFileEntry[] = [];
  
  // Extract title and artist from "Title - Artist" format
  const titleParts = artworkTitle.split(' - ');
  const titleOnly = titleParts[0].trim();
  const artistName = titleParts.length > 1 ? titleParts[titleParts.length - 1].trim() : '';
  
  // Artist name aliases - maps Shopify vendor names to Dropbox folder names
  const artistAliases: Record<string, string[]> = {
    'Tom Coolen': ['Mad Lief'],
    'My Sunbeam': ['MySunbeam'],
  };
  
  // Get all possible folder names for this artist
  const artistFolderNames: string[] = [];
  if (artistName) {
    artistFolderNames.push(artistName);
    // Add aliases if they exist
    if (artistAliases[artistName]) {
      artistFolderNames.push(...artistAliases[artistName]);
    }
    // Also try without spaces
    const artistNoSpaces = artistName.replace(/\s+/g, '');
    if (artistNoSpaces !== artistName && !artistFolderNames.includes(artistNoSpaces)) {
      artistFolderNames.push(artistNoSpaces);
    }
  }
  
  // Search paths to check - include artist-specific collab folders
  // Empty string "" means search entire Dropbox (used as fallback)
  const searchPaths = [
    searchPath,
    "/Artist Uploads 2026",
    "/Artists/2025/Artist Uploads 2025",
    "/East Side Studio/Collabs/Artists",  // Artist collab folders
    "/East Side Studio/Collabs/Artists/MySunbeam",  // MySunbeam main folder
    "/East Side Studio/Collabs/Artists/MySunbeam/Artworks",  // MySunbeam Artworks folder
    "/East Side Studio/Collabs/Artists/MySunbeam/2nd Colllection",  // MySunbeam 2nd collection
    "/East Side Studio/Collabs/Artists/MySunbeam/2nd Colllection/1MB",  // MySunbeam 1MB low-res folder
    "/East Side Studio London/NEW",  // NEW folder for newer artwork
    "/East Side Studio London",  // General ESS London folder
    "/A Ratio Artworks",  // A Ratio Artworks folder with ESS Images subfolders
  ];
  
  // Add artist-specific paths for all possible folder names
  for (const folderName of artistFolderNames) {
    searchPaths.push(`/East Side Studio/Collabs/Artists/${folderName}`);
  }
  
  // Add global search as final fallback (searches entire Dropbox)
  searchPaths.push("");
  
  const normalizedTitle = titleOnly
    .toLowerCase()
    .replace(/\s*-\s*(framed|unframed|canvas|print|limited edition|open edition).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Build multiple search queries for better matching
  // Files may have prefixes like "ESS_" or "Low_Res_", or use no spaces
  const titleNoSpaces = normalizedTitle.replace(/\s+/g, '');
  const titleUnderscores = normalizedTitle.replace(/\s+/g, '_');
  const searchQueries = [
    normalizedTitle,
    titleNoSpaces,  // For files like "TryingMyBest" 
    titleUnderscores,  // For files like "trying_my_best"
    `ESS_${normalizedTitle}`,
    `ESS ${normalizedTitle}`,
    `ESS_${titleNoSpaces}`,
  ].filter((q, i, arr) => arr.indexOf(q) === i); // Remove duplicates
  
  console.log(`[Dropbox] Searching for artwork: "${artworkTitle}" (queries: ${searchQueries.join(', ')}, artist: "${artistName}")`);
  
  // Search all paths with all query variations
  for (const currentPath of searchPaths) {
    for (const searchQuery of searchQueries) {
      try {
        // Use Dropbox search API for faster results - search by title only for better matching
        const response = await dbx.filesSearchV2({
          query: searchQuery,
          options: {
            path: currentPath,
            max_results: 50,
            file_extensions: ['jpg', 'jpeg', 'png', 'tif', 'tiff'],
          },
        });
      
      for (const match of response.result.matches) {
        const matchType = match.match_type['.tag'];
        if (matchType === 'filename' || matchType === 'content' || matchType === 'filename_and_content') {
          const metadata = match.metadata;
          if (metadata['.tag'] === 'metadata' && metadata.metadata['.tag'] === 'file') {
            const file = metadata.metadata;
            const fileName = file.name.toLowerCase();
            const filePath = (file.path_display || file.path_lower || '').toLowerCase();
            
            // Match files with Low_Res prefix, 'Large' suffix, 'PREVIEW', OR in Low_Res/Low Res folders
            // Note: 'Large' typically indicates a web-ready/low-res version (e.g., ESS_hahahoohoo Large.jpg)
            // ESS_ prefixed files are HIGH-RES and will be converted if needed
            const isLowResFile = fileName.includes('low_res') || fileName.includes('lowres') || fileName.includes(' large') || fileName.includes('preview');
            const isInLowResFolder = filePath.includes('low_res') || filePath.includes('low res') || filePath.includes('/lowres') || filePath.includes('/new/') || filePath.includes('/1mb');
            
            // Skip mockup files - frames, lifestyle images, and numbered files
            const isMockupFile = 
              fileName.includes('black frame') || 
              fileName.includes('white frame') || 
              fileName.includes('natural frame') || 
              fileName.includes('oak frame') ||
              fileName.includes('lifestyle') ||
              fileName.includes('unframed print') ||
              /^\d+\.\s/.test(file.name); // Starts with number like "1. ", "2. "
            
            // Filter by artist name - only include files from the artist's folder
            let matchesArtist = true;
            if (artistName) {
              // Normalize artist name for matching (remove spaces, lowercase)
              const normalizedArtist = artistName.toLowerCase().replace(/\s+/g, '');
              // Check if path contains artist name (folder structure: /Artists/Artist Onboarding/Artist Name_...)
              const pathArtist = filePath.toLowerCase().replace(/\s+/g, '');
              matchesArtist = pathArtist.includes(normalizedArtist);
            }
            
            // Avoid duplicates
            const alreadyExists = matches.some(m => m.path === (file.path_display || file.path_lower || ''));
            
            if ((isLowResFile || isInLowResFolder) && !isMockupFile && matchesArtist && !alreadyExists) {
              matches.push({
                name: file.name,
                path: file.path_display || file.path_lower || '',
                id: file.id,
                isFolder: false,
                size: file.size || 0,
              });
            }
          }
        }
      }
      } catch (error: any) {
        console.error(`[Dropbox] Search failed in ${currentPath} for "${searchQuery}":`, error);
        // Continue to next query/path
      }
    }
  }
  
  console.log(`[Dropbox] Found ${matches.length} low-res matches for "${artworkTitle}"`);
  
  // Fallback: if no matches found and we had an artist filter, try again without artist restriction
  if (matches.length === 0 && artistName) {
    console.log(`[Dropbox] No matches with artist filter, trying title-only search...`);
    
    for (const currentPath of searchPaths) {
      for (const searchQuery of searchQueries) {
        try {
          const response = await dbx.filesSearchV2({
            query: searchQuery,
          options: {
            path: currentPath,
            max_results: 50,
            file_extensions: ['jpg', 'jpeg', 'png', 'tif', 'tiff'],
          },
        });
        
        for (const match of response.result.matches) {
          const matchType = match.match_type['.tag'];
          if (matchType === 'filename' || matchType === 'content' || matchType === 'filename_and_content') {
            const metadata = match.metadata;
            if (metadata['.tag'] === 'metadata' && metadata.metadata['.tag'] === 'file') {
              const file = metadata.metadata;
              const fileName = file.name.toLowerCase();
              const filePath = (file.path_display || file.path_lower || '').toLowerCase();
              
              const isLowResFile = fileName.includes('low_res') || fileName.includes('lowres') || fileName.includes(' large') || fileName.includes('preview');
              const isInLowResFolder = filePath.includes('low_res') || filePath.includes('low res') || filePath.includes('/lowres') || filePath.includes('/new/') || filePath.includes('/1mb');
              
              const isMockupFile = 
                fileName.includes('black frame') || 
                fileName.includes('white frame') || 
                fileName.includes('natural frame') || 
                fileName.includes('oak frame') ||
                fileName.includes('lifestyle') ||
                fileName.includes('unframed print') ||
                /^\d+\.\s/.test(file.name);
              
              const alreadyExists = matches.some(m => m.path === (file.path_display || file.path_lower || ''));
              
              if ((isLowResFile || isInLowResFolder) && !isMockupFile && !alreadyExists) {
                matches.push({
                  name: file.name,
                  path: file.path_display || file.path_lower || '',
                  id: file.id,
                  isFolder: false,
                  size: file.size || 0,
                });
              }
            }
          }
        }
        } catch (error: any) {
          console.error(`[Dropbox] Fallback search failed in ${currentPath} for "${searchQuery}":`, error);
        }
      }
    }
    
    console.log(`[Dropbox] Fallback search found ${matches.length} matches for "${artworkTitle}"`);
  }
  
  // Final fallback: Browse artist collab folders directly if still no matches
  if (matches.length === 0 && artistFolderNames.length > 0) {
    console.log(`[Dropbox] No search results, browsing artist folders directly...`);
    
    for (const folderName of artistFolderNames) {
      const artistBasePath = `/East Side Studio/Collabs/Artists/${folderName}`;
      
      try {
        // Recursively find all image files in this artist's folder
        const foundFiles = await browseArtistFolder(dbx, artistBasePath, titleOnly.toLowerCase());
        for (const file of foundFiles) {
          // Avoid duplicates
          if (!matches.some(m => m.path === file.path)) {
            matches.push(file);
          }
        }
        
        if (matches.length > 0) {
          console.log(`[Dropbox] Found ${matches.length} files by browsing ${artistBasePath}`);
          break; // Found files, stop looking
        }
      } catch (error: any) {
        // Folder might not exist, continue
        if (error?.error?.error?.['.tag'] !== 'path') {
          console.error(`[Dropbox] Error browsing ${artistBasePath}:`, error);
        }
      }
    }
  }
  
  // NEW FALLBACK: Partial match search for ANY files (high-res or low-res) if nothing found yet
  // This allows finding files like ESS_cornichonlove.jpg when searching for "Cornichon Love"
  if (matches.length === 0) {
    console.log(`[Dropbox] No low-res matches found, trying partial match for ANY files (high-res or low-res)...`);
    
    // Build partial search terms - use title words for fuzzy matching
    const titleWords = normalizedTitle.split(/\s+/).filter(w => w.length > 2);
    const partialQueries = [
      titleNoSpaces,  // "cornichonlove"
      `ESS_${titleNoSpaces}`,  // "ESS_cornichonlove"
      ...titleWords,  // Individual words like "cornichon", "love"
    ].filter((q, i, arr) => arr.indexOf(q) === i);
    
    // Search in main folders where ESS_ files might be located
    const partialSearchPaths = [
      "/East Side Studio London",
      "/East Side Studio London/NEW",
      "/East Side Studio/Collabs/Artists",
      "/A Ratio Artworks",
      "",  // Global fallback
    ];
    
    for (const currentPath of partialSearchPaths) {
      for (const query of partialQueries) {
        if (query.length < 3) continue;  // Skip very short queries
        
        try {
          const response = await dbx.filesSearchV2({
            query,
            options: {
              path: currentPath,
              max_results: 30,
              file_extensions: ['jpg', 'jpeg', 'png', 'tif', 'tiff'],
            },
          });
          
          for (const match of response.result.matches) {
            if (match.metadata?.['.tag'] === 'metadata') {
              const file = (match.metadata as any).metadata;
              if (file['.tag'] !== 'file') continue;
              
              const fileName = file.name.toLowerCase();
              const filePath = (file.path_display || file.path_lower || '').toLowerCase();
              
              // Skip mockup files
              const isMockupFile = 
                fileName.includes('black frame') || 
                fileName.includes('white frame') || 
                fileName.includes('natural frame') || 
                fileName.includes('oak frame') ||
                fileName.includes('lifestyle') ||
                fileName.includes('unframed print') ||
                /^\d+\.\s/.test(file.name);
              
              // Avoid duplicates
              const alreadyExists = matches.some(m => m.path === (file.path_display || file.path_lower || ''));
              
              // Accept ANY image file that matches the title (high-res will be converted later)
              if (!isMockupFile && !alreadyExists) {
                matches.push({
                  name: file.name,
                  path: file.path_display || file.path_lower || '',
                  id: file.id || '',
                  isFolder: false,
                  size: file.size || 0,
                });
                console.log(`[Dropbox] Partial match found: ${file.name} (${((file.size || 0) / 1024 / 1024).toFixed(1)}MB) at ${file.path_display}`);
              }
            }
          }
          
          // If we found matches, stop searching
          if (matches.length > 0) {
            console.log(`[Dropbox] Found ${matches.length} partial matches for "${query}"`);
            break;
          }
        } catch (error: any) {
          // Continue to next query/path
        }
      }
      
      if (matches.length > 0) break;
    }
  }
  
  // If matches found but they're all large files (>5MB), search for smaller versions
  // Also check if all are in high-res folders
  const MAX_PREFERRED_SIZE = 5 * 1024 * 1024; // 5MB - files larger than this are likely high-res
  
  if (matches.length > 0) {
    const allLargeFiles = matches.every(m => {
      const path = m.path.toLowerCase();
      const isInHighResFolder = path.includes('highres') || path.includes('high res') || path.includes('high_res');
      const isLargeFile = (m.size || 0) > MAX_PREFERRED_SIZE;
      return isInHighResFolder || isLargeFile;
    });
    
    if (allLargeFiles) {
      const sizes = matches.map(m => `${m.name}: ${((m.size || 0) / 1024 / 1024).toFixed(1)}MB`).join(', ');
      console.log(`[Dropbox] All ${matches.length} matches are large files (${sizes}), searching for smaller versions...`);
      
      // Do a global search for files with low-res indicators
      const lowResQueries = [
        `${titleNoSpaces} large`,
        `${titleNoSpaces} preview`,
        `low_res ${normalizedTitle}`,
        `lowres ${normalizedTitle}`,
      ];
      
      for (const query of lowResQueries) {
        try {
          const response = await dbx.filesSearchV2({
            query,
            options: {
              path: "",  // Global search
              max_results: 20,
              file_extensions: ['jpg', 'jpeg', 'png'],
            }
          });
          
          for (const match of response.result.matches || []) {
            if (match.metadata?.['.tag'] === 'metadata') {
              const file = (match.metadata as any).metadata;
              const fileName = file.name.toLowerCase();
              const filePath = (file.path_display || file.path_lower || '').toLowerCase();
              
              // Only add if it's not in a high-res folder
              const isHighRes = filePath.includes('highres') || filePath.includes('high res') || filePath.includes('high_res');
              const alreadyExists = matches.some(m => m.path === (file.path_display || file.path_lower || ''));
              
              const fileSize = file.size || 0;
              const isSmallEnough = fileSize < MAX_PREFERRED_SIZE;
              
              if (!isHighRes && !alreadyExists && isSmallEnough) {
                matches.unshift({  // Add to front as preferred
                  name: file.name,
                  path: file.path_display || file.path_lower || '',
                  id: file.id || '',
                  isFolder: false,
                  size: fileSize,
                });
                console.log(`[Dropbox] Found smaller alternative: ${file.name} (${(fileSize / 1024 / 1024).toFixed(1)}MB)`);
              }
            }
          }
          
          // Check if we found a small enough file
          if (matches.some(m => (m.size || Infinity) < MAX_PREFERRED_SIZE)) {
            break; // Found a smaller version, stop searching
          }
        } catch (error) {
          // Continue with next query
        }
      }
    }
  }
  
  return matches;
}

function fileMatchesArtworkTitle(fileName: string, filePath: string, artworkTitle: string, artistName: string): boolean {
  const cleanName = fileName.toLowerCase()
    .replace(/\.(jpg|jpeg|png|tif|tiff)$/i, '')
    .replace(/[_\-\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const cleanPath = (filePath || '').toLowerCase().replace(/[_\-\.\/]/g, ' ').replace(/\s+/g, ' ');
  
  const artNorm = artworkTitle.toLowerCase().replace(/[_\-\.]/g, ' ').replace(/\s+/g, ' ').trim();
  const artNoSpaces = artNorm.replace(/\s+/g, '');
  const nameNoSpaces = cleanName.replace(/\s+/g, '');
  
  if (nameNoSpaces.includes(artNoSpaces) || cleanName.includes(artNorm)) return true;
  
  if (fileName.startsWith('ESS_')) {
    const essBody = fileName.slice(4).toLowerCase()
      .replace(/\.(jpg|jpeg|png|tif|tiff)$/i, '')
      .replace(/[_\-\.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const essNoSpaces = essBody.replace(/\s+/g, '');
    if (essNoSpaces.includes(artNoSpaces) || essBody.includes(artNorm)) return true;
  }
  
  const artWords = artNorm.split(/\s+/).filter(w => w.length >= 2);
  if (artWords.length <= 1) {
    return nameNoSpaces.includes(artNoSpaces) || cleanPath.includes(artNorm);
  }
  
  const matchedWords = artWords.filter(w => cleanName.includes(w) || cleanPath.includes(w));
  const matchRatio = matchedWords.length / artWords.length;
  return matchRatio >= 0.6;
}

export async function searchForAnyArtwork(
  artworkTitle: string,
): Promise<DropboxFileEntry[]> {
  const dbx = await getUncachableDropboxClient();
  const matches: DropboxFileEntry[] = [];

  const titleParts = artworkTitle.split(' - ');
  const artistName = titleParts.length > 1 ? titleParts[titleParts.length - 1].trim() : '';
  const titleOnly = titleParts.length > 1
    ? titleParts.slice(0, -1).join(' - ').trim()
    : titleParts[0].trim();

  const normalizedTitle = titleOnly
    .toLowerCase()
    .replace(/\s*-\s*(framed|unframed|canvas|print|limited edition|open edition).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const titleNoSpaces = normalizedTitle.replace(/\s+/g, '').replace(/-/g, '');
  const titleUnderscores = normalizedTitle.replace(/\s+/g, '_');
  const titlePascalCase = titleOnly
    .split(/[\s-]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
  
  const baseTitle = normalizedTitle.replace(/\s*-\s*\S+\s*$/, '').trim();
  const baseTitleNoSpaces = baseTitle.replace(/\s+/g, '').replace(/-/g, '');
  const baseTitleUnderscores = baseTitle.replace(/\s+/g, '_');
  
  const searchQueries = [
    normalizedTitle,
    titleNoSpaces,
    titleUnderscores,
    `ESS_${titleNoSpaces}`,
    titlePascalCase,
    `ESS_${titlePascalCase}`,
  ];
  
  if (baseTitle !== normalizedTitle && baseTitle.length >= 3) {
    searchQueries.push(baseTitle, baseTitleNoSpaces, baseTitleUnderscores);
  }

  if (titleParts.length > 2) {
    for (let i = 0; i < titleParts.length - 1; i++) {
      const part = titleParts[i].trim().toLowerCase().replace(/\s+/g, ' ');
      if (part.length >= 3) {
        searchQueries.push(part);
        searchQueries.push(part.replace(/\s+/g, ''));
        const partPascal = part.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
        searchQueries.push(partPascal);
      }
    }
  }

  const uniqueQueries = searchQueries.filter((q, i, arr) => q && arr.indexOf(q) === i);

  console.log(`[Dropbox] Multi-ratio search for: "${artworkTitle}" (queries: ${uniqueQueries.join(', ')})`);

  for (const searchQuery of uniqueQueries) {
    try {
      const response = await dbx.filesSearchV2({
        query: searchQuery,
        options: {
          path: "",
          max_results: 50,
          file_extensions: ['jpg', 'jpeg', 'png', 'tif', 'tiff'],
        },
      });

      for (const match of response.result.matches) {
        if (match.metadata?.['.tag'] === 'metadata') {
          const file = (match.metadata as any).metadata;
          if (file['.tag'] !== 'file') continue;

          const fileName = file.name.toLowerCase();

          const isMockupFile =
            fileName.includes('black frame') ||
            fileName.includes('white frame') ||
            fileName.includes('natural frame') ||
            fileName.includes('oak frame') ||
            fileName.includes('lifestyle') ||
            fileName.includes('unframed print') ||
            fileName.includes('mockup') ||
            fileName.includes('frame') ||
            /^\d+\.\s/.test(file.name);

          const filePath = file.path_display || file.path_lower || '';
          const titleRelevant = fileMatchesArtworkTitle(file.name, filePath, normalizedTitle, artistName);

          let matchesArtist = true;
          if (artistName) {
            const fileStartsWithESS = file.name.startsWith('ESS_');
            if (fileStartsWithESS) {
              matchesArtist = true;
            } else {
              const normalizedArtist = artistName.toLowerCase().replace(/\s+/g, '');
              const pathArtist = filePath.toLowerCase().replace(/\s+/g, '');
              const fileNameNorm = fileName.replace(/\s+/g, '');
              const artistParts = artistName.toLowerCase().split(/\s+/).filter(p => p.length >= 3);
              matchesArtist =
                pathArtist.includes(normalizedArtist) ||
                fileNameNorm.includes(normalizedArtist) ||
                artistParts.some(part => pathArtist.includes(part) || fileNameNorm.includes(part));
            }
          }

          const alreadyExists = matches.some(m => m.path === filePath);

          if (!isMockupFile && titleRelevant && matchesArtist && !alreadyExists) {
            matches.push({
              name: file.name,
              path: file.path_display || file.path_lower || '',
              id: file.id || '',
              isFolder: false,
              size: file.size || 0,
            });
          }
        }
      }
    } catch (error: any) {
      console.error(`[Dropbox] Multi-ratio search failed for "${searchQuery}":`, error.message);
    }
  }

  if (matches.length <= 1 && normalizedTitle.length >= 3) {
    console.log(`[Dropbox] Few/no matches with artist filter (${matches.length}), retrying with artwork name only: "${normalizedTitle}"`);
    const artworkOnlyQueries = [normalizedTitle, titleNoSpaces, titlePascalCase, titleUnderscores].filter((q, i, arr) => q && arr.indexOf(q) === i);

    for (const searchQuery of artworkOnlyQueries) {
      try {
        const response = await dbx.filesSearchV2({
          query: searchQuery,
          options: {
            path: "",
            max_results: 50,
            file_extensions: ['jpg', 'jpeg', 'png', 'tif', 'tiff'],
          },
        });

        for (const match of response.result.matches) {
          if (match.metadata?.['.tag'] === 'metadata') {
            const file = (match.metadata as any).metadata;
            if (file['.tag'] !== 'file') continue;

            const fileName = file.name.toLowerCase();
            const isMockupFile =
              fileName.includes('black frame') ||
              fileName.includes('white frame') ||
              fileName.includes('natural frame') ||
              fileName.includes('oak frame') ||
              fileName.includes('lifestyle') ||
              fileName.includes('unframed print') ||
              fileName.includes('mockup') ||
              fileName.includes('frame') ||
              /^\d+\.\s/.test(file.name);

            const fallbackPath = file.path_display || file.path_lower || '';
            const alreadyExists = matches.some(m => m.path === fallbackPath);
            const titleRelevant = fileMatchesArtworkTitle(file.name, fallbackPath, normalizedTitle, artistName);

            if (!isMockupFile && titleRelevant && !alreadyExists) {
              matches.push({
                name: file.name,
                path: fallbackPath,
                id: file.id || '',
                isFolder: false,
                size: file.size || 0,
              });
            }
          }
        }
      } catch (error: any) {
        console.error(`[Dropbox] Artwork-only search failed for "${searchQuery}":`, error.message);
      }
    }
    console.log(`[Dropbox] Artwork-only fallback found ${matches.length} matches for "${normalizedTitle}"`);
  }

  console.log(`[Dropbox] Multi-ratio search found ${matches.length} matches for "${artworkTitle}"`);
  return matches;
}

// Helper function to browse artist folder and find low-res image files
async function browseArtistFolder(
  dbx: any,
  basePath: string,
  titleHint: string,
  depth: number = 0
): Promise<DropboxFileEntry[]> {
  const results: DropboxFileEntry[] = [];
  if (depth > 6) return results; // Prevent too deep recursion
  
  try {
    let hasMore = true;
    let cursor: string | undefined;
    
    while (hasMore) {
      const response = cursor 
        ? await dbx.filesListFolderContinue({ cursor })
        : await dbx.filesListFolder({ path: basePath, recursive: false });
      
      for (const entry of response.result.entries) {
        const name = entry.name.toLowerCase();
        const path = (entry.path_display || entry.path_lower || '').toLowerCase();
        
        if (entry['.tag'] === 'folder') {
          // Look for low-res folders, artwork folders, or folders matching the title
          const shouldDescend = 
            name.includes('low') || 
            name.includes('artwork') || 
            name.includes('poster') ||
            name.includes('highres') ||
            name.includes('high-res') ||
            name.includes(titleHint.split(' ')[0]); // First word of title
          
          if (shouldDescend) {
            const subResults = await browseArtistFolder(dbx, entry.path_display || entry.path_lower || '', titleHint, depth + 1);
            results.push(...subResults);
          }
        } else if (entry['.tag'] === 'file') {
          // Check if it's an image file
          const isImage = /\.(jpg|jpeg|png|tif|tiff)$/i.test(name);
          
          // Skip mockup files
          const isMockup = 
            name.includes('frame') || 
            name.includes('lifestyle') || 
            name.includes('mockup') ||
            /^\d+\.\s/.test(entry.name);
          
          // Prioritize files in low-res folders or with low-res in name
          const isLowRes = path.includes('low') || name.includes('low');
          
          if (isImage && !isMockup) {
            results.push({
              name: entry.name,
              path: entry.path_display || entry.path_lower || '',
              id: entry.id,
              isFolder: false,
            });
          }
        }
      }
      
      hasMore = response.result.has_more;
      cursor = response.result.cursor;
    }
  } catch (error: any) {
    // Folder doesn't exist or access denied
    if (error?.error?.error?.['.tag'] !== 'path') {
      console.error(`[Dropbox] Error listing ${basePath}:`, error);
    }
  }
  
  return results;
}

/**
 * Recursively list all Low Res files in Artist Onboarding folder
 * Returns a map of normalized artwork names to file paths for efficient matching
 */
export async function buildLowResFileIndex(
  basePath: string = "/Artists/Artist Onboarding"
): Promise<Map<string, DropboxFileEntry>> {
  const dbx = await getUncachableDropboxClient();
  const fileIndex = new Map<string, DropboxFileEntry>();
  
  console.log(`[Dropbox] Building low-res file index from ${basePath}...`);
  
  async function scanFolder(folderPath: string, depth: number = 0): Promise<void> {
    if (depth > 5) return; // Prevent too deep recursion
    
    try {
      let hasMore = true;
      let cursor: string | undefined;
      
      while (hasMore) {
        const response = cursor 
          ? await dbx.filesListFolderContinue({ cursor })
          : await dbx.filesListFolder({ path: folderPath, recursive: false });
        
        for (const entry of response.result.entries) {
          if (entry['.tag'] === 'folder') {
            // Check if this is a Low_Res folder - scan it deeply
            const folderName = entry.name.toLowerCase();
            if (folderName.includes('low_res') || folderName.includes('low res') || folderName.includes('lowres')) {
              await scanLowResFolder(entry.path_display || entry.path_lower || '');
            } else {
              // Recurse into subfolders
              await scanFolder(entry.path_display || entry.path_lower || '', depth + 1);
            }
          } else if (entry['.tag'] === 'file') {
            const fileName = entry.name.toLowerCase();
            // Check if file is in low res path or has low_res prefix
            if (fileName.includes('low_res') || fileName.includes('lowres')) {
              const artworkName = extractArtworkName(entry.name);
              if (artworkName) {
                fileIndex.set(artworkName.toLowerCase(), {
                  name: entry.name,
                  path: entry.path_display || entry.path_lower || '',
                  id: (entry as any).id || '',
                  isFolder: false,
                });
              }
            }
          }
        }
        
        hasMore = response.result.has_more;
        cursor = response.result.cursor;
      }
    } catch (error: any) {
      if (!error?.error?.error_summary?.includes('path/not_found')) {
        console.error(`[Dropbox] Failed to scan folder ${folderPath}:`, error?.error?.error_summary || error.message);
      }
    }
  }
  
  async function scanLowResFolder(folderPath: string): Promise<void> {
    try {
      let hasMore = true;
      let cursor: string | undefined;
      
      while (hasMore) {
        const response = cursor 
          ? await dbx.filesListFolderContinue({ cursor })
          : await dbx.filesListFolder({ path: folderPath, recursive: true });
        
        for (const entry of response.result.entries) {
          if (entry['.tag'] === 'file') {
            const artworkName = extractArtworkName(entry.name);
            if (artworkName) {
              fileIndex.set(artworkName.toLowerCase(), {
                name: entry.name,
                path: entry.path_display || entry.path_lower || '',
                id: (entry as any).id || '',
                isFolder: false,
              });
            }
          }
        }
        
        hasMore = response.result.has_more;
        cursor = response.result.cursor;
      }
    } catch (error: any) {
      console.error(`[Dropbox] Failed to scan low res folder ${folderPath}:`, error?.error?.error_summary || error.message);
    }
  }
  
  await scanFolder(basePath);
  console.log(`[Dropbox] Built index with ${fileIndex.size} low-res files`);
  
  return fileIndex;
}

/**
 * Extract artwork name from filename
 * Handles patterns like: Low_ResArtist Name_Title.jpg, Low_Res_Artist Name_Title.jpg
 */
function extractArtworkName(filename: string): string | null {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|tif|tiff)$/i, '');
  
  // Remove Low_Res prefix variations
  let cleaned = nameWithoutExt
    .replace(/^Low_Res_?/i, '')
    .replace(/^LowRes_?/i, '');
  
  // Try to extract just the artwork title (after artist name and number)
  // Pattern: "Artist Name_Number_Title" or "Artist Name_Title"
  const parts = cleaned.split('_');
  if (parts.length >= 2) {
    // Check if second part is a number
    if (/^\d+$/.test(parts[1]) && parts.length > 2) {
      // Return everything after the number
      return parts.slice(2).join('_').trim();
    }
    // Check if last part looks like the title (not a number)
    if (!/^\d+$/.test(parts[parts.length - 1])) {
      return parts[parts.length - 1].trim();
    }
  }
  
  // Fallback: return the cleaned name
  return cleaned.trim() || null;
}

export async function moveArtworkToCompleted(
  dropboxPath: string, 
  dropboxBasePath: string = "/Artist Uploads 2026"
): Promise<{ success: boolean; newPath?: string; error?: string }> {
  // Normalize base path
  const normalizedBase = dropboxBasePath.endsWith('/') ? dropboxBasePath.slice(0, -1) : dropboxBasePath;
  const pendingPrefix = `${normalizedBase}/Pending/`;
  
  // Check if this path is in the Pending folder
  if (!dropboxPath.includes('/Pending/')) {
    console.log(`[Dropbox] Path not in Pending folder, skipping move: ${dropboxPath}`);
    return { success: true, newPath: dropboxPath };
  }
  
  // Extract the submission folder from the path
  // Find the part after /Pending/ and take only the first folder name
  const pendingIndex = dropboxPath.indexOf('/Pending/');
  if (pendingIndex === -1) {
    return { success: false, error: 'Could not find /Pending/ in path' };
  }
  
  const afterPending = dropboxPath.substring(pendingIndex + '/Pending/'.length);
  // Get just the submission folder name (e.g., "Artist_Name_01-01-2026")
  const folderName = afterPending.split('/')[0];
  
  if (!folderName) {
    return { success: false, error: 'Invalid pending path - could not extract folder name' };
  }
  
  const sourcePath = `${normalizedBase}/Pending/${folderName}`;
  const completedPath = `${normalizedBase}/Completed/${folderName}`;
  
  console.log(`[Dropbox] Moving submission folder from "${sourcePath}" to "${completedPath}"`);
  
  return await moveFolder(sourcePath, completedPath);
}
