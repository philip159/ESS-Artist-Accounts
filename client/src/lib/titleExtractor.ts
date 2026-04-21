/**
 * Artwork title extraction from filenames
 * Handles patterns like:
 * - 'Arty Guava_A-Ratio_Under The Shade.jpg' → 'Under The Shade' (with artistName="Arty Guava")
 * - 'FinalFinal_Bloom.jpg' → 'Bloom'
 * - 'Urban-Dreams_Final.jpg' → 'Urban Dreams'
 * - 'A4 Urban Dreams A-RATIO.jpg' → 'Urban Dreams'
 * 
 * Uses the provided artistName to remove the artist's name from the filename.
 * No guessing based on capitalization - just uses the name you provide.
 */

/**
 * Fix UTF-8 encoding for filenames that were incorrectly decoded as latin1
 * This handles cases where Japanese/Unicode characters appear as garbled text
 * e.g., "Å æ° (light Source)" → "光源 (Light Source)"
 */
export function fixFilenameEncoding(filename: string): string {
  try {
    // Check if the filename contains characters that suggest it's misencoded
    // Latin1 misencoding typically produces characters in the 0x80-0xFF range
    const hasHighBytes = /[\u0080-\u00FF]/.test(filename);
    
    if (!hasHighBytes) {
      // Filename appears to be ASCII-only or already correct UTF-8
      return filename;
    }
    
    // Convert string to bytes (treating each char code as a byte - latin1 encoding)
    const bytes = new Uint8Array(filename.length);
    for (let i = 0; i < filename.length; i++) {
      bytes[i] = filename.charCodeAt(i);
    }
    
    // Decode bytes as UTF-8
    const decoder = new TextDecoder('utf-8');
    const fixed = decoder.decode(bytes);
    
    // Verify the result looks reasonable (contains non-replacement characters)
    if (fixed.includes('\uFFFD')) {
      // Decoding failed, return original
      return filename;
    }
    
    return fixed;
  } catch {
    // If anything goes wrong, return the original
    return filename;
  }
}

export function extractArtworkTitle(filename: string, artistName?: string): string {
  // First, try to fix any encoding issues
  filename = fixFilenameEncoding(filename);
  // Remove file extension
  let title = filename.replace(/\.[^.]+$/, '');
  
  // Replace underscores, hyphens, and multiple spaces with single space
  title = title.replace(/[_-]/g, ' ').replace(/\s+/g, ' ');
  
  // Remove commas
  title = title.replace(/,/g, '');
  
  // Add spaces around & and between concatenated words (e.g., 'Palms&porsche' → 'Palms & Porsche')
  title = title.replace(/&/g, ' & ');
  
  // Add space between lowercase and uppercase letters (camelCase/concatenated words)
  // e.g., 'PalmsPorsche' → 'Palms Porsche'
  title = title.replace(/([a-z])([A-Z])/g, '$1 $2');
  
  // Remove common "Final" prefixes/suffixes (case insensitive)
  title = title.replace(/^(final)+\s*/i, '');
  title = title.replace(/\s*(final)+$/i, '');
  
  // Remove ratio patterns at the beginning (1:1, 3:4, 4:5, 2:3, 5:8, 16:9, etc.)
  title = title.replace(/^(\d+:\d+)[\s_-]+/i, '');
  
  // Remove ratio patterns anywhere in the title (e.g., "-3:4", " 4:5", "-1:1", "-5:7")
  title = title.replace(/[\s_-]+\d+:\d+\b/g, '');
  
  // Remove A-series paper sizes and ratio markers (A4, A3, A2, A1, A0, A-RATIO, A_Ratio, etc.)
  title = title.replace(/\bA[0-5]\b/gi, '');
  title = title.replace(/\bA[\s_-]?ratio\b/gi, '');
  
  // Remove dimension patterns (e.g., 30x40, 20x30, 16x20)
  title = title.replace(/\b\d+\s*[xX×]\s*\d+\b/g, '');
  
  // Remove standalone numbers at the end (version numbers like " 2", " v2", " copy 1")
  title = title.replace(/\s+(v?\d+|copy\s*\d+)$/i, '');
  
  // If artist name is provided, remove it from the title
  if (artistName && artistName.trim()) {
    const nameParts = artistName.trim().split(/\s+/);
    
    // Try removing exact full name match (case insensitive)
    const fullNameRegex = new RegExp(
      `\\b${nameParts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}\\b`,
      'gi'
    );
    title = title.replace(fullNameRegex, '');
    
    // Also try removing each name part individually (for cases like "Arty Guava" where parts might be separated)
    for (const part of nameParts) {
      if (part.length >= 2) {
        const partRegex = new RegExp(
          `\\b${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
          'gi'
        );
        title = title.replace(partRegex, '');
      }
    }
  }
  
  // Clean up whitespace after removals
  title = title.replace(/\s+/g, ' ').trim();
  
  // Remove common words that might be artifacts
  title = title.replace(/\b(artwork|painting|print|photo|image)\b/gi, '');
  
  // Clean up extra whitespace and trim
  title = title.replace(/\s+/g, ' ').trim();
  
  // Capitalize first letter of each word for better presentation
  title = title
    .split(' ')
    .map(word => {
      // Keep all-caps words as is (might be acronyms)
      if (word === word.toUpperCase() && word.length > 1) return word;
      // Capitalize first letter, lowercase rest
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
  
  // If we ended up with nothing or just punctuation/symbols, use a fallback
  const meaningfulContent = title.replace(/[^a-zA-Z0-9]/g, '');
  if (!title || title.length === 0 || meaningfulContent.length === 0) {
    return 'Untitled Artwork';
  }
  
  return title;
}

/**
 * Format artwork for display on website
 * E.g., "The Swimmers - Seba Cestaro"
 */
export function formatArtworkDisplay(title: string, artistName: string): string {
  return `${title} - ${artistName}`;
}
