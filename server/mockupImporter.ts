// Mockup import service for importing manually-created mockups from Dropbox
// Filename format: {number}. {frame-type}_{artwork-name}.jpg
// Examples:
//   1. Black Frame_Orchid.jpg
//   2. White Frame_Horses.jpg
//   3. Natural Frame_Lily.jpg
//   4. Unframed_Orchid.jpg
//   5. Lifestyle Image_Orchid.jpg

import { listFilesInFolder, createSharedLink, convertToRawDropboxUrl } from "./dropboxService.js";
import type { IStorage } from "./storage.js";
import type { Artwork } from "../shared/schema.js";

export interface ParsedMockupFilename {
  artworkName: string;
  frameType: string;
  isLifestyle: boolean;
  filename: string;
  path: string;
}

export interface MockupImportResult {
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{ filename: string; error: string }>;
  imported: Array<{ filename: string; mockupId: string }>;
}

export interface MockupPreviewItem {
  id: string; // Unique identifier for selection
  filename: string;
  path: string;
  artworkName: string;
  artworkId: string;
  artworkTitle: string;
  frameType: string;
  isLifestyle: boolean;
  alreadyExists: boolean; // True if mockup with same artwork+frame already exists
  existingMockupId?: string; // ID of existing mockup if duplicate
}

export interface UnmatchedMockupItem {
  id: string;
  filename: string;
  path: string;
  parsedArtworkName: string;
  parsedArtistName: string;
  frameType: string;
  isLifestyle: boolean;
}

export interface MockupPreviewResult {
  items: MockupPreviewItem[];
  unmatchedItems: UnmatchedMockupItem[];
  errors: Array<{ filename: string; error: string }>;
}

/**
 * Parse mockup filename to extract artwork name and frame type
 * Handles multiple formats:
 *   - Simple: "1. Black Frame_Lily.jpg"
 *   - Complex: "1. Black Frame_ LowRes_Arty-Guava_Lily_A-Ratio-Portrait-1√2.jpg"
 */
export function parseMockupFilename(filename: string, filePath: string): ParsedMockupFilename | null {
  try {
    // Remove file extension
    const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png)$/i, '');
    
    // Remove number prefix (e.g., "1. " or "2. ")
    const withoutNumber = nameWithoutExt.replace(/^\d+\.\s*/, '');
    
    // Protect content inside parentheses by replacing underscores with a placeholder
    // e.g., "(The_underworld)" -> "(The§underworld)"
    let protectedContent = withoutNumber.replace(/\(([^)]+)\)/g, (match, content) => {
      return '(' + content.replace(/_/g, '§') + ')';
    });
    
    // IMPORTANT: Replace aspect ratio underscores BEFORE splitting
    // Convert "3_4" to "3x4" so they don't interfere with underscore splitting
    const withSafeAspectRatios = protectedContent.replace(/(\d+)_(\d+)/g, '$1x$2');
    
    // Split by underscore
    const parts = withSafeAspectRatios.split('_');
    
    // Restore underscores inside parentheses
    const restoredParts = parts.map(p => p.replace(/§/g, '_'));
    
    if (restoredParts.length < 2) {
      console.warn(`[MockupImporter] Invalid filename format (expected frame_artwork): ${filename}`);
      return null;
    }
    
    let frameTypePart = restoredParts[0].trim();
    
    // Clean aspect ratio patterns and orientation from frame type
    // Handles: "Black 3x4 Frame Landscape" -> "Black Frame" (aspect ratios converted to 3x4 above)
    // Handles: "White 2x3 Portrait Frame" -> "White Frame"
    // Handles: "Oak A-Ratio Frame" -> "Oak Frame"
    frameTypePart = frameTypePart
      .replace(/\d+x\d+/g, '') // Remove aspect ratios like 3x4, 2x3, 4x5 (converted from 3_4 above)
      .replace(/A-Ratio/gi, '') // Remove A-Ratio
      .replace(/\b(Landscape|Portrait)\b/gi, '') // Remove orientation words
      .replace(/\bLowRes\b/gi, '') // Remove LowRes
      .replace(/\s+/g, ' ') // Clean up extra spaces
      .trim();
    
    // Extract artwork name from complex filenames
    // Pattern: "Frame Type_ LowRes_Artist-Name_Artwork-Name_Aspect-Ratio"
    // The artwork name is the second-to-last part (before aspect ratio suffix)
    let artworkName = '';
    
    // Filter out empty parts and known non-artwork parts
    const meaningfulParts = restoredParts.slice(1).filter(p => {
      const trimmed = p.trim().toLowerCase();
      return trimmed && !trimmed.includes('lowres');
    });
    
    // The structure is: [Artist-FirstName, Artist-LastName, Artwork-Name-Part1, Artwork-Name-Part2, ..., Aspect-Ratio, Number]
    // We need to find the artwork name which may span multiple underscored parts
    // Strategy: Remove trailing metadata (aspect ratio, orientation, numbers) then extract artwork name
    
    // First, try to find a part with parentheses (Japanese + English title)
    const partWithParentheses = meaningfulParts.find(p => p.includes('(') && p.includes(')'));
    if (partWithParentheses) {
      artworkName = partWithParentheses.trim();
    } else {
      // Remove trailing metadata parts (aspect ratio, orientation, pure numbers)
      // Pattern: [...artist parts, ...artwork parts, aspect-ratio?, number?]
      const trailingMetadata = ['portrait', 'landscape', 'square', 'ratio'];
      
      // Work backwards to find where metadata ends and artwork name begins
      let lastMetadataIndex = meaningfulParts.length;
      for (let i = meaningfulParts.length - 1; i >= 0; i--) {
        const part = meaningfulParts[i].toLowerCase().trim();
        const isPureNumber = /^\d+$/.test(part);
        const isAspectRatio = trailingMetadata.some(m => part.includes(m)) || /^\d+x\d+/.test(part);
        
        if (isPureNumber || isAspectRatio) {
          lastMetadataIndex = i;
        } else {
          break; // Stop when we hit non-metadata
        }
      }
      
      // Extract parts that are not metadata
      const contentParts = meaningfulParts.slice(0, lastMetadataIndex);
      
      if (contentParts.length >= 3) {
        // Format likely: [FirstName, LastName, ArtworkPart1, ArtworkPart2, ...]
        // Assume first 2 parts are artist name, rest is artwork name
        artworkName = contentParts.slice(2).join(' ').trim();
      } else if (contentParts.length === 2) {
        // Could be [Artist, Artwork] or [ArtworkPart1, ArtworkPart2]
        // Use the last part as artwork name
        artworkName = contentParts[contentParts.length - 1].trim();
      } else if (contentParts.length === 1) {
        artworkName = contentParts[0].trim();
      }
    }
    
    // Clean up artwork name - remove aspect ratio suffixes that might be attached
    artworkName = artworkName
      .replace(/_?\d+x\d+.*$/i, '') // Remove aspect ratios like _3x4-Portrait
      .replace(/_?A-Ratio.*$/i, '') // Remove A-Ratio suffix
      .replace(/_?(Portrait|Landscape|Square)$/i, '') // Remove trailing orientation
      .replace(/_+$/, '') // Remove trailing underscores
      .trim();
    
    // Check if this is a lifestyle image
    const isLifestyle = frameTypePart.toLowerCase().includes('lifestyle');
    
    // Normalize frame type to match database values
    // Lifestyle images get numbered frame types (Lifestyle 1, Lifestyle 2, etc.)
    let normalizedFrameType: string;
    if (isLifestyle) {
      // Extract number from various formats: "Lifestyle 1", "Lifestyle Image1", "Lifestyle1"
      const match = frameTypePart.match(/lifestyle\s*(?:image)?\s*(\d+)/i);
      const number = match ? match[1] : '1';
      normalizedFrameType = `Lifestyle ${number}`;
    } else {
      normalizedFrameType = normalizeFrameType(frameTypePart) || '';
      if (!normalizedFrameType) {
        console.warn(`[MockupImporter] Invalid frame type: ${frameTypePart}`);
        return null;
      }
    }
    
    if (!artworkName) {
      console.warn(`[MockupImporter] No artwork name found in: ${filename}`);
      return null;
    }
    
    console.log(`[MockupImporter] Parsed: ${filename} -> artwork: "${artworkName}", frame: "${normalizedFrameType}"`);
    
    return {
      artworkName,
      frameType: normalizedFrameType,
      isLifestyle,
      filename,
      path: filePath,
    };
  } catch (error) {
    console.error(`[MockupImporter] Error parsing filename ${filename}:`, error);
    return null;
  }
}

/**
 * Normalize frame type to match database values
 * 
 * Canonical names: "Unframed", "Black Frame", "White Frame", "Natural Frame"
 * 
 * Accepted aliases:
 * - Natural Frame: "Oak Frame", "Wood Frame", "Natural", "Wood", "Oak"
 * - Black Frame: "Black"
 * - White Frame: "White"
 * - Unframed: "Unframed Print", "No Frame"
 */
function normalizeFrameType(frameType: string): string | null {
  const lower = frameType.toLowerCase().trim();
  
  if (lower === 'unframed' || lower === 'unframed print' || lower === 'no frame') {
    return 'Unframed';
  }
  if (lower === 'black frame' || lower === 'black') {
    return 'Black Frame';
  }
  if (lower === 'white frame' || lower === 'white') {
    return 'White Frame';
  }
  if (lower === 'natural frame' || lower === 'natural' || 
      lower === 'wood frame' || lower === 'wood' ||
      lower === 'oak frame' || lower === 'oak') {
    return 'Natural Frame';
  }
  
  return null;
}

/**
 * Score-based artwork matching system
 * 
 * Scoring criteria:
 * - Exact title match: 100 points
 * - Number suffix match (#1, #2): 50 points
 * - Number mismatch penalty: -100 points
 * - English name in parentheses exact match: 60 points
 * - English name in parentheses partial match: 30 points
 * - Japanese/non-ASCII portion exact match: 40 points
 * - Japanese/non-ASCII portion mismatch penalty: -50 points
 * - Partial title match (only if >80% overlap): 20 points
 * - Artist name match: 10 points
 * 
 * Minimum score threshold: 50 points
 * Ties return null to avoid wrong assignments
 */
interface ScoredArtwork {
  artwork: Artwork;
  score: number;
  matchReasons: string[];
}

function normalizeForMatching(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/^-+|-+$/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNumber(str: string): string | null {
  const match = str.match(/[#nº]?(\d+)$/i);
  return match ? match[1] : null;
}

function extractEnglishFromParentheses(title: string): string | null {
  const match = title.match(/\(([^)]+)\)/);
  return match ? normalizeForMatching(match[1]) : null;
}

// Extract Japanese/CJK characters from a string
function extractNonAscii(str: string): string {
  return str.replace(/[\x00-\x7F]/g, '').trim();
}

// Calculate similarity ratio between two strings
function similarityRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  // Check if shorter is contained in longer
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  return 0;
}

/**
 * Calculate word overlap score between two strings
 * Returns a score from 0 to 1 based on how many words match
 */
function wordOverlapScore(str1: string, str2: string): number {
  const words1 = str1.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const words2 = str2.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  let matchCount = 0;
  for (const word of set1) {
    if (set2.has(word)) matchCount++;
  }
  
  // Jaccard similarity: intersection / union
  const union = new Set([...set1, ...set2]);
  return matchCount / union.size;
}

/**
 * Simple Levenshtein distance for short strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  
  if (m === 0) return n;
  if (n === 0) return m;
  
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return dp[m][n];
}

/**
 * Calculate similarity ratio using Levenshtein distance
 */
function levenshteinSimilarity(s1: string, s2: string): number {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(s1, s2);
  return 1 - (distance / maxLen);
}

interface DirectSearchResult {
  artwork: Artwork;
  score: number;
  matchReason: string;
}

/**
 * Score-based artwork matching by searching for titles within a filename
 * Returns all artworks that score above the threshold, sorted by score
 */
async function findArtworksByDirectSearch(storage: IStorage, filename: string, minScore: number = 35): Promise<DirectSearchResult[]> {
  const allArtworks = await storage.getAllArtworks();
  
  // Normalize filename: replace underscores/hyphens with spaces, lowercase
  const normalizedFilename = filename
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  console.log(`[MockupImporter] Direct search in filename: "${normalizedFilename}"`);
  
  const results: DirectSearchResult[] = [];
  
  for (const artwork of allArtworks) {
    const normalizedTitle = artwork.title.toLowerCase().trim();
    let score = 0;
    let matchReason = '';
    
    // Exact substring match: highest score (120 points)
    if (normalizedFilename.includes(normalizedTitle)) {
      score = 120;
      matchReason = `exact title match in filename`;
    } else {
      // Check word overlap
      const overlap = wordOverlapScore(normalizedFilename, normalizedTitle);
      if (overlap >= 0.8) {
        // High word overlap (80+ points)
        score = Math.round(80 + (overlap - 0.8) * 100);
        matchReason = `high word overlap (${Math.round(overlap * 100)}%)`;
      } else if (overlap >= 0.5) {
        // Partial word overlap (40-79 points)
        score = Math.round(40 + overlap * 60);
        matchReason = `partial word overlap (${Math.round(overlap * 100)}%)`;
      }
      
      // Also check Levenshtein similarity for the title
      const levenSim = levenshteinSimilarity(normalizedFilename, normalizedTitle);
      if (levenSim >= 0.7) {
        const levenScore = Math.round(levenSim * 80);
        if (levenScore > score) {
          score = levenScore;
          matchReason = `similar to title (${Math.round(levenSim * 100)}% similarity)`;
        }
      }
      
      // Check if title words appear consecutively in filename
      const titleWords = normalizedTitle.split(/\s+/).filter(w => w.length > 0);
      if (titleWords.length > 1) {
        const consecutivePattern = titleWords.join(' ');
        if (normalizedFilename.includes(consecutivePattern)) {
          score = 120;
          matchReason = `exact title match in filename`;
        }
      }
    }
    
    if (score >= minScore) {
      results.push({ artwork, score, matchReason });
    }
  }
  
  // Sort by score descending, then by title length (prefer longer/more specific titles)
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.artwork.title.length - a.artwork.title.length;
  });
  
  if (results.length > 0) {
    console.log(`[MockupImporter] Direct search found ${results.length} candidates, best: "${results[0].artwork.title}" (score: ${results[0].score})`);
  } else {
    console.log(`[MockupImporter] No direct title match found in filename`);
  }
  
  return results;
}

/**
 * Find best artwork match by direct filename search
 * Auto-matches if top score is >= 50 and leads by >= 15 points
 */
async function findArtworkByDirectSearch(storage: IStorage, filename: string): Promise<Artwork | null> {
  const results = await findArtworksByDirectSearch(storage, filename, 50);
  
  if (results.length === 0) return null;
  
  const top = results[0];
  const second = results[1];
  
  // Auto-match if score >= 50 AND leads by 15+ points (or no second candidate)
  if (top.score >= 50 && (!second || top.score - second.score >= 15)) {
    console.log(`[MockupImporter] Auto-matched: "${top.artwork.title}" (score: ${top.score}, reason: ${top.matchReason})`);
    return top.artwork;
  }
  
  // Multiple close candidates - return null so it goes to manual assignment
  console.log(`[MockupImporter] Multiple close matches, needs manual assignment`);
  return null;
}

async function findArtworkByName(storage: IStorage, artworkName: string): Promise<Artwork | null> {
  const allArtworks = await storage.getAllArtworks();
  
  const normalizedSearch = normalizeForMatching(artworkName);
  
  if (!normalizedSearch) {
    console.log(`[MockupImporter] Empty search term after normalization: "${artworkName}"`);
    return null;
  }
  
  console.log(`[MockupImporter] Searching for artwork: "${normalizedSearch}" (from "${artworkName}")`);
  
  const searchNumber = extractNumber(normalizedSearch);
  const searchWithoutNumber = normalizedSearch.replace(/[#nº]?\d+$/i, '').trim();
  const searchEnglish = extractEnglishFromParentheses(artworkName);
  const searchNonAscii = extractNonAscii(artworkName);
  
  console.log(`[MockupImporter] Search parts: base="${searchWithoutNumber}", number="${searchNumber || 'none'}", japanese="${searchNonAscii || 'none'}", english="${searchEnglish || 'none'}"`);
  
  const scoredArtworks: ScoredArtwork[] = [];
  const MIN_SCORE_THRESHOLD = 50;
  
  for (const artwork of allArtworks) {
    let score = 0;
    const matchReasons: string[] = [];
    const normalizedTitle = normalizeForMatching(artwork.title);
    const titleNumber = extractNumber(artwork.title);
    const titleEnglish = extractEnglishFromParentheses(artwork.title);
    const titleNonAscii = extractNonAscii(artwork.title);
    
    // Exact title match: 100 points
    if (normalizedTitle === normalizedSearch) {
      score += 100;
      matchReasons.push('exact title match');
    }
    
    // Number suffix match: 50 points (must have same number)
    if (searchNumber && titleNumber) {
      if (searchNumber === titleNumber) {
        score += 50;
        matchReasons.push(`number match (#${searchNumber})`);
      } else {
        // Different numbers - penalize to avoid wrong matches
        score -= 100;
        matchReasons.push(`number mismatch (search: #${searchNumber}, title: #${titleNumber})`);
      }
    }
    
    // Japanese/CJK character comparison (critical for differentiating similar titles)
    if (searchNonAscii && titleNonAscii) {
      if (searchNonAscii === titleNonAscii) {
        score += 40;
        matchReasons.push('exact Japanese match');
      } else if (searchNonAscii !== titleNonAscii) {
        // Different Japanese characters - this is likely a DIFFERENT artwork
        // Only penalize if they share some but not all characters
        const overlap = similarityRatio(searchNonAscii, titleNonAscii);
        if (overlap > 0 && overlap < 1) {
          score -= 50;
          matchReasons.push(`Japanese mismatch: "${searchNonAscii}" vs "${titleNonAscii}" (${Math.round(overlap * 100)}% overlap)`);
        }
      }
    }
    
    // English name in parentheses match
    if (titleEnglish && searchEnglish) {
      if (titleEnglish === searchEnglish) {
        score += 60;
        matchReasons.push('exact English name match');
      } else {
        const overlap = similarityRatio(titleEnglish, searchEnglish);
        if (overlap >= 0.8) {
          score += 30;
          matchReasons.push(`partial English name match (${Math.round(overlap * 100)}%)`);
        }
      }
    } else if (titleEnglish && !searchEnglish) {
      // Search term might just be the English name without parentheses
      if (titleEnglish === searchWithoutNumber) {
        score += 60;
        matchReasons.push('English name matches search term');
      }
    }
    
    // Partial title match: only if high overlap (>80%)
    const titleOverlap = similarityRatio(normalizedTitle, searchWithoutNumber);
    if (titleOverlap >= 0.8 && !matchReasons.some(r => r.includes('exact'))) {
      score += 20;
      matchReasons.push(`high title overlap (${Math.round(titleOverlap * 100)}%)`);
    }
    
    // Artist name bonus: 10 points
    const normalizedArtist = normalizeForMatching(artwork.artistName);
    if (normalizedSearch.includes(normalizedArtist) || normalizedArtist.includes(searchWithoutNumber)) {
      score += 10;
      matchReasons.push('artist name match');
    }
    
    if (score >= MIN_SCORE_THRESHOLD) {
      scoredArtworks.push({ artwork, score, matchReasons });
    }
  }
  
  if (scoredArtworks.length === 0) {
    console.log(`[MockupImporter] No match found for: "${normalizedSearch}" (no artwork scored above ${MIN_SCORE_THRESHOLD})`);
    return null;
  }
  
  // Sort by score descending
  scoredArtworks.sort((a, b) => b.score - a.score);
  
  const topScore = scoredArtworks[0].score;
  const topMatches = scoredArtworks.filter(s => s.score === topScore);
  
  // Log all scored artworks for debugging
  console.log(`[MockupImporter] Scored ${scoredArtworks.length} artworks for "${normalizedSearch}":`);
  for (const scored of scoredArtworks.slice(0, 5)) {
    console.log(`  - "${scored.artwork.title}": ${scored.score} points [${scored.matchReasons.join(', ')}]`);
  }
  
  if (topMatches.length > 1) {
    console.warn(`[MockupImporter] TIE: ${topMatches.length} artworks tied at ${topScore} points for "${normalizedSearch}"`);
    console.warn(`  Tied artworks: ${topMatches.map(m => m.artwork.title).join(', ')}`);
    return null;
  }
  
  console.log(`[MockupImporter] Best match: "${topMatches[0].artwork.title}" with ${topScore} points`);
  return topMatches[0].artwork;
}

/**
 * Scan Dropbox Mockups folders and import mockup files
 */
export async function importMockupsFromDropbox(
  storage: IStorage,
  basePath: string = "/Artist Uploads 2026"
): Promise<MockupImportResult> {
  const result: MockupImportResult = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    imported: [],
  };

  try {
    console.log(`[MockupImporter] Scanning ${basePath} for Mockups folders...`);
    
    // Scan both Pending and Completed subfolders
    const subfolders = ['Pending', 'Completed'];
    let allArtistFolders: Array<{ name: string; path: string; isFolder: boolean }> = [];
    
    for (const subfolder of subfolders) {
      const subfolderPath = `${basePath}/${subfolder}`;
      try {
        const folders = await listFilesInFolder(subfolderPath);
        console.log(`[MockupImporter] Found ${folders.length} items in ${subfolderPath}`);
        allArtistFolders = [...allArtistFolders, ...folders];
      } catch (error) {
        console.log(`[MockupImporter] Could not access ${subfolderPath}, skipping...`);
      }
    }
    
    const artistFolders = allArtistFolders;
    console.log(`[MockupImporter] Total artist folders to scan: ${artistFolders.length}`);
    
    for (const artistFolder of artistFolders) {
      if (!artistFolder.isFolder) {
        console.log(`[MockupImporter] Skipping non-folder: ${artistFolder.name}`);
        continue;
      }
      
      console.log(`[MockupImporter] Checking artist folder: ${artistFolder.name}`);
      
      // Check for Mockups subfolder
      const mockupsPath = `${artistFolder.path}/Mockups`;
      console.log(`[MockupImporter] Looking for Mockups folder at: ${mockupsPath}`);
      
      try {
        const mockupItems = await listFilesInFolder(mockupsPath);
        console.log(`[MockupImporter] Found ${mockupItems.length} items in ${mockupsPath}`);
        
        // Collect all image files (may be in subfolders)
        const allImageFiles: Array<{ name: string; path: string; isFolder: boolean }> = [];
        
        for (const item of mockupItems) {
          if (item.isFolder) {
            // Recursively scan subfolders
            console.log(`[MockupImporter] Scanning subfolder: ${item.name}`);
            try {
              const subfolderFiles = await listFilesInFolder(item.path);
              for (const subfile of subfolderFiles) {
                if (!subfile.isFolder && subfile.name.match(/\.(jpg|jpeg|png)$/i)) {
                  allImageFiles.push(subfile);
                }
              }
            } catch (error) {
              console.error(`[MockupImporter] Error scanning subfolder ${item.path}:`, error);
            }
          } else if (item.name.match(/\.(jpg|jpeg|png)$/i)) {
            // Direct image file in Mockups folder
            allImageFiles.push(item);
          }
        }
        
        console.log(`[MockupImporter] Found ${allImageFiles.length} image files to process`);
        
        for (const file of allImageFiles) {
          console.log(`[MockupImporter] Processing image: ${file.name}`);
          
          // Parse filename
          console.log(`[MockupImporter] Parsing filename: ${file.name}`);
          const parsed = parseMockupFilename(file.name, file.path);
          if (!parsed) {
            console.log(`[MockupImporter] ✗ Failed to parse: ${file.name}`);
            result.failed++;
            result.errors.push({
              filename: file.name,
              error: 'Invalid filename format',
            });
            continue;
          }
          console.log(`[MockupImporter] ✓ Parsed: artwork="${parsed.artworkName}", frame="${parsed.frameType}", lifestyle=${parsed.isLifestyle}`);
          
          // Find artwork - first try direct title search in filename, then fall back to parsed name
          let artwork = await findArtworkByDirectSearch(storage, file.name);
          if (!artwork) {
            artwork = await findArtworkByName(storage, parsed.artworkName);
          }
          if (!artwork) {
            // Save to pending_mockups for manual assignment
            try {
              // Check if already exists in pending
              const existingPending = await storage.getPendingMockupByPath(file.path);
              if (existingPending) {
                console.log(`[MockupImporter] Already in pending: ${file.name}`);
                result.skipped++;
                continue;
              }
              
              // Create preview URL for pending mockup
              let previewUrl: string | null = null;
              try {
                previewUrl = await createSharedLink(file.path);
                previewUrl = convertToRawDropboxUrl(previewUrl);
              } catch (e) {
                console.log(`[MockupImporter] Could not create preview URL for pending mockup`);
              }
              
              await storage.createPendingMockup({
                dropboxPath: file.path,
                filename: file.name,
                previewUrl,
                parsedArtworkName: parsed.artworkName,
                parsedArtistName: null,
                frameType: parsed.frameType,
                isLifestyle: parsed.isLifestyle,
                status: 'unassigned',
              });
              console.log(`[MockupImporter] Saved to pending: ${file.name} (artwork not found: ${parsed.artworkName})`);
              result.failed++;
              result.errors.push({
                filename: file.name,
                error: `Artwork not found (saved to pending): ${parsed.artworkName}`,
              });
            } catch (pendingError: any) {
              console.error(`[MockupImporter] Failed to save pending mockup: ${pendingError.message}`);
              result.failed++;
              result.errors.push({
                filename: file.name,
                error: `Artwork not found: ${parsed.artworkName}`,
              });
            }
            continue;
          }
          
          // For externally-created mockups, template is optional
          // We'll use the first template if available, or null if none exist
          const templates = await storage.getAllTemplates();
          const template = templates.length > 0 
            ? templates.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
            : null;
          
          if (template) {
            console.log(`[MockupImporter] Using template "${template.name}" for mockup`);
          } else {
            console.log(`[MockupImporter] No template available - importing without template link`);
          }
          
          // Create shared link for the mockup image
          let mockupUrl: string;
          try {
            mockupUrl = await createSharedLink(file.path);
            // Convert to raw/direct access URL (publicly accessible)
            mockupUrl = convertToRawDropboxUrl(mockupUrl);
          } catch (error) {
            console.error(`[MockupImporter] Failed to create shared link for ${file.name}:`, error);
            result.failed++;
            result.errors.push({
              filename: file.name,
              error: 'Failed to create Dropbox shared link',
            });
            continue;
          }
          
          // Create mockup record
          try {
            const mockup = await storage.createMockup({
              artworkId: artwork.id,
              templateId: template?.id || null,
              frameType: parsed.frameType,
              isLifestyle: parsed.isLifestyle,
              mockupImageUrl: mockupUrl,
              dropboxPath: file.path,
            });
            
            result.success++;
            result.imported.push({
              filename: file.name,
              mockupId: mockup.id,
            });
            
            console.log(`[MockupImporter] ✓ Imported: ${file.name} -> template "${template?.name || 'none'}" -> ${mockup.id}`);
          } catch (error: any) {
            // Check if duplicate key error - skip silently
            if (error.code === '23505' || error.message?.includes('duplicate key')) {
              console.log(`[MockupImporter] Skipped (already exists): ${file.name}`);
              result.skipped++;
            } else {
              console.error(`[MockupImporter] Failed to create mockup for ${file.name}:`, error);
              result.failed++;
              result.errors.push({
                filename: file.name,
                error: error.message || 'Failed to create mockup record',
              });
            }
          }
        }
      } catch (error: any) {
        // Log the actual error for debugging
        console.error(`[MockupImporter] Error processing ${artistFolder.path}:`, error?.message || error);
        continue;
      }
    }
    
    console.log(`[MockupImporter] Import complete: ${result.success} succeeded, ${result.failed} failed`);
    return result;
  } catch (error) {
    console.error(`[MockupImporter] Failed to scan Dropbox:`, error);
    throw error;
  }
}

/**
 * Preview mockups from Dropbox without importing
 * Returns list of what would be imported with duplicate detection
 * @param artworkIds - Optional filter to only show mockups for specific artworks
 */
export async function previewMockupsFromDropbox(
  storage: IStorage,
  basePath: string = "/Artist Uploads 2026",
  artworkIds?: string[]
): Promise<MockupPreviewResult> {
  const result: MockupPreviewResult = {
    items: [],
    unmatchedItems: [],
    errors: [],
  };

  try {
    console.log(`[MockupImporter] Preview scanning ${basePath} for Mockups folders...`);
    
    // Scan both Pending and Completed subfolders
    const subfolders = ['Pending', 'Completed'];
    let allArtistFolders: Array<{ name: string; path: string; isFolder: boolean }> = [];
    
    for (const subfolder of subfolders) {
      const subfolderPath = `${basePath}/${subfolder}`;
      try {
        const folders = await listFilesInFolder(subfolderPath);
        console.log(`[MockupImporter] Found ${folders.length} items in ${subfolderPath}`);
        allArtistFolders = [...allArtistFolders, ...folders];
      } catch (error) {
        console.log(`[MockupImporter] Could not access ${subfolderPath}, skipping...`);
      }
    }
    
    const artistFolders = allArtistFolders;
    console.log(`[MockupImporter] Total artist folders to scan: ${artistFolders.length}`);
    
    for (const artistFolder of artistFolders) {
      if (!artistFolder.isFolder) continue;
      
      const mockupsPath = `${artistFolder.path}/Mockups`;
      
      try {
        const mockupItems = await listFilesInFolder(mockupsPath);
        
        // Collect all image files (may be in subfolders)
        const allImageFiles: Array<{ name: string; path: string; isFolder: boolean }> = [];
        
        for (const item of mockupItems) {
          if (item.isFolder) {
            try {
              const subfolderFiles = await listFilesInFolder(item.path);
              for (const subfile of subfolderFiles) {
                if (!subfile.isFolder && subfile.name.match(/\.(jpg|jpeg|png)$/i)) {
                  allImageFiles.push(subfile);
                }
              }
            } catch (error) {
              console.error(`[MockupImporter] Error scanning subfolder ${item.path}:`, error);
            }
          } else if (item.name.match(/\.(jpg|jpeg|png)$/i)) {
            allImageFiles.push(item);
          }
        }
        
        for (const file of allImageFiles) {
          const parsed = parseMockupFilename(file.name, file.path);
          if (!parsed) {
            result.errors.push({
              filename: file.name,
              error: 'Invalid filename format',
            });
            continue;
          }
          
          // Find artwork - first try direct title search in filename, then fall back to parsed name
          let artwork = await findArtworkByDirectSearch(storage, file.name);
          if (!artwork) {
            artwork = await findArtworkByName(storage, parsed.artworkName);
          }
          if (!artwork) {
            // Add to unmatched items for manual assignment
            result.unmatchedItems.push({
              id: `unmatched-${file.path}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              filename: file.name,
              path: file.path,
              parsedArtworkName: parsed.artworkName,
              parsedArtistName: '',
              frameType: parsed.frameType,
              isLifestyle: parsed.isLifestyle,
            });
            continue;
          }
          
          // Filter by artwork IDs if specified
          if (artworkIds && artworkIds.length > 0 && !artworkIds.includes(artwork.id)) {
            // Skip this mockup - not in the selected artwork list
            continue;
          }
          
          // Check if mockup already exists for this artwork+frame combo
          const existingMockups = await storage.getMockupsByArtwork(artwork.id);
          const existingMockup = existingMockups.find(m => 
            m.frameType === parsed.frameType && m.isLifestyle === parsed.isLifestyle
          );
          
          result.items.push({
            id: `${file.path}-${Date.now()}`,
            filename: file.name,
            path: file.path,
            artworkName: parsed.artworkName,
            artworkId: artwork.id,
            artworkTitle: artwork.title,
            frameType: parsed.frameType,
            isLifestyle: parsed.isLifestyle,
            alreadyExists: !!existingMockup,
            existingMockupId: existingMockup?.id,
          });
        }
      } catch (error: any) {
        // Mockups folder doesn't exist
        continue;
      }
    }
    
    console.log(`[MockupImporter] Preview complete: ${result.items.length} items found, ${result.errors.length} errors`);
    return result;
  } catch (error) {
    console.error(`[MockupImporter] Failed to preview Dropbox:`, error);
    throw error;
  }
}

/**
 * Import selected mockups by Dropbox path
 * Re-validates everything server-side for security
 * @param artworkAssignments - Map of Dropbox path to artworkId for manually assigned mockups
 */
export async function importSelectedMockups(
  storage: IStorage,
  selectedPaths: string[],
  artworkAssignments?: Record<string, string>
): Promise<MockupImportResult> {
  const result: MockupImportResult = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    imported: [],
  };

  const templates = await storage.getAllTemplates();
  const template = templates.length > 0 
    ? templates.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
    : null;

  for (const dropboxPath of selectedPaths) {
    // Extract filename from path
    const filename = dropboxPath.split('/').pop() || dropboxPath;
    
    // Re-parse filename server-side for security
    const parsed = parseMockupFilename(filename, dropboxPath);
    if (!parsed) {
      console.log(`[MockupImporter] ✗ Failed to parse: ${filename}`);
      result.failed++;
      result.errors.push({
        filename,
        error: 'Invalid filename format',
      });
      continue;
    }

    // Check for manual artwork assignment first, otherwise lookup by name
    let artwork = null;
    const assignedArtworkId = artworkAssignments?.[dropboxPath];
    
    if (assignedArtworkId) {
      // Use manually assigned artwork
      artwork = await storage.getArtwork(assignedArtworkId);
      if (!artwork) {
        result.failed++;
        result.errors.push({
          filename,
          error: `Assigned artwork not found: ${assignedArtworkId}`,
        });
        continue;
      }
      console.log(`[MockupImporter] Using manual assignment: ${filename} -> ${artwork.title}`);
    } else {
      // Re-lookup artwork - first try direct title search in filename, then fall back to parsed name
      artwork = await findArtworkByDirectSearch(storage, filename);
      if (!artwork) {
        artwork = await findArtworkByName(storage, parsed.artworkName);
      }
      if (!artwork) {
        result.failed++;
        result.errors.push({
          filename,
          error: `Artwork not found: ${parsed.artworkName}`,
        });
        continue;
      }
    }

    // Re-check for duplicates server-side
    const existingMockups = await storage.getMockupsByArtwork(artwork.id);
    const existingMockup = existingMockups.find(m => 
      m.frameType === parsed.frameType && m.isLifestyle === parsed.isLifestyle
    );
    
    if (existingMockup) {
      console.log(`[MockupImporter] Skipping duplicate: ${filename} (${artwork.title} - ${parsed.frameType})`);
      result.skipped++;
      continue;
    }

    // Create shared link for the mockup image
    let mockupUrl: string;
    try {
      mockupUrl = await createSharedLink(dropboxPath);
      mockupUrl = convertToRawDropboxUrl(mockupUrl);
    } catch (error) {
      console.error(`[MockupImporter] Failed to create shared link for ${filename}:`, error);
      result.failed++;
      result.errors.push({
        filename,
        error: 'Failed to create Dropbox shared link',
      });
      continue;
    }

    // Create mockup record
    try {
      const mockup = await storage.createMockup({
        artworkId: artwork.id,
        templateId: template?.id || null,
        frameType: parsed.frameType,
        isLifestyle: parsed.isLifestyle,
        mockupImageUrl: mockupUrl,
        dropboxPath: dropboxPath,
      });

      result.success++;
      result.imported.push({
        filename,
        mockupId: mockup.id,
      });

      console.log(`[MockupImporter] ✓ Imported: ${filename} -> ${mockup.id}`);
    } catch (error: any) {
      console.error(`[MockupImporter] Failed to create mockup for ${filename}:`, error);
      result.failed++;
      result.errors.push({
        filename,
        error: error.message || 'Failed to create mockup record',
      });
    }
  }

  console.log(`[MockupImporter] Import complete: ${result.success} succeeded, ${result.failed} failed, ${result.skipped} skipped`);
  return result;
}
