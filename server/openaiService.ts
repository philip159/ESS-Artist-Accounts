import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}
const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    return (getOpenAI() as any)[prop];
  }
});

export interface SocialMediaCaptions {
  instagram: string;
  linkedin: string;
  threads: string;
}

export interface ArtistPostDetails {
  name: string;
  alias?: string;
  bio: string;
  location?: string;
  isExclusive: boolean;
}

export async function generateArtistLaunchPost(
  artist: ArtistPostDetails,
  postType: "new_artist" | "new_collection"
): Promise<SocialMediaCaptions> {
  const displayName = artist.alias || artist.name;
  const exclusivityLine = artist.isExclusive
    ? "exclusively at eastsidestudiolondon.co.uk"
    : "at eastsidestudiolondon.co.uk";

  const postTypeContext = postType === "new_artist"
    ? `a new artist launch announcement — this artist has just been onboarded to East Side Studio London.`
    : `a new collection announcement — this artist has just uploaded a fresh collection of artworks to East Side Studio London.`;

  const prompt = `You are the social media copywriter for East Side Studio London, a contemporary fine art print studio based in London.

Write three social media post captions for ${postTypeContext}

Artist details:
- Name: ${displayName}
- Bio: ${artist.bio}
${artist.location ? `- Location: ${artist.location}` : ""}
- Available ${exclusivityLine}

Tone and style guidelines:
- Warm, descriptive, conversational British English
- End each post with a call to action directing people to eastsidestudiolondon.co.uk
- Reference the artist's story, style, or themes from their bio
- ${artist.isExclusive ? `Emphasise exclusivity: "exclusively at eastsidestudiolondon.co.uk"` : `Use neutral language: "at eastsidestudiolondon.co.uk"`}

Platform-specific instructions:
1. Instagram: Include 5-8 relevant hashtags at the end (on a separate line). Keep it warm, visual, and descriptive. Use line breaks to separate paragraphs for readability.
2. LinkedIn: Slightly more professional and polished tone. No hashtags. Mention the studio's mission to support emerging artists. Use line breaks between paragraphs.
3. Threads: Concise, conversational, punchy. 2-3 sentences max. No hashtags.

IMPORTANT: Use \\n for line breaks within each caption to create proper paragraph spacing. Do NOT return everything on a single line.

Return ONLY valid JSON in this exact format:
{
  "instagram": "First paragraph.\\n\\nSecond paragraph.\\n\\n#hashtags",
  "linkedin": "First paragraph.\\n\\nSecond paragraph.",
  "threads": "Short punchy text."
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content returned from OpenAI for social post generation");
    }

    const captions = JSON.parse(content) as SocialMediaCaptions;
    if (!captions.instagram || !captions.linkedin || !captions.threads) {
      throw new Error("OpenAI returned incomplete captions — missing one or more platforms");
    }
    console.log(`[AI] Generated ${postType} social media captions for ${displayName}`);
    return captions;
  } catch (error) {
    console.error("[AI] Error generating social media captions:", error);
    throw new Error(`Failed to generate social media captions: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export interface ArtworkMetadata {
  bodyHTML: string;
  titleTag: string;
  descriptionTag: string;
  colours: string[];
  moods: string[];
  styles: string[];
  themes: string[];
}

export interface MetadataOptions {
  colourOptions?: string[];
  moodOptions?: string[];
  styleOptions?: string[];
  themeOptions?: string[];
  bodyHTMLPrompt?: string;
  titleTagPrompt?: string;
  descriptionTagPrompt?: string;
}

export async function generateArtworkMetadata(
  imageUrl: string,
  artworkTitle: string,
  artistName: string,
  options?: MetadataOptions
): Promise<ArtworkMetadata> {
  try {
    const coloursList = options?.colourOptions && options.colourOptions.length > 0
      ? `\n- colours: MUST ONLY use values from this list: [${options.colourOptions.map(c => `"${c}"`).join(', ')}]`
      : `\n- colours: ["color1", "color2", "color3"]  // 3-5 dominant colors in the artwork`;
    
    const moodsList = options?.moodOptions && options.moodOptions.length > 0
      ? `\n- moods: MUST ONLY use values from this list: [${options.moodOptions.map(m => `"${m}"`).join(', ')}]`
      : `\n- moods: ["mood1", "mood2", "mood3"]  // 3-5 moods/emotions the artwork evokes`;
    
    const stylesList = options?.styleOptions && options.styleOptions.length > 0
      ? `\n- styles: MUST ONLY use values from this list: [${options.styleOptions.map(s => `"${s}"`).join(', ')}]`
      : `\n- styles: ["style1", "style2"]  // 2-4 artistic styles`;
    
    const themesList = options?.themeOptions && options.themeOptions.length > 0
      ? `\n- themes: MUST ONLY use values from this list: [${options.themeOptions.map(t => `"${t}"`).join(', ')}]`
      : `\n- themes: ["theme1", "theme2", "theme3"]  // 3-5 themes or subjects`;

    // Use custom prompts if provided, otherwise use defaults
    const bodyHTMLInstruction = options?.bodyHTMLPrompt || 
      "A 2-3 paragraph HTML description for the product page. Include artistic details, mood, potential room placement suggestions, and why customers would love this piece. Use <p> tags. Make it compelling and SEO-friendly. Mention it's printed on archival-quality 200gsm paper with 12 pigment-rich inks.";
    
    const titleTagInstruction = options?.titleTagPrompt || 
      `EXACT FORMAT REQUIRED: [Style] Art Print - ${artworkTitle} by ${artistName} | East Side Studio London. Where [Style] is ONE word from styles (e.g. 'Abstract', 'Illustration', 'Photography'). Max 70 chars.`;
    
    const descriptionTagInstruction = options?.descriptionTagPrompt || 
      `EXACT FORMAT REQUIRED: Shop ${artworkTitle} by ${artistName}, a [mood] art print of [brief description] in [2-3 colours]. Shop now at East Side Studio London. Max 160 chars.`;

    const prompt = `Analyze this artwork titled "${artworkTitle}" by ${artistName}. Generate comprehensive e-commerce product metadata for East Side Studio London, a fine art print store.

IMPORTANT: Write ALL content in British English (use 'colour' not 'color', 'favourite' not 'favorite', etc.).

Provide the following in JSON format:
{
  "bodyHTML": "${bodyHTMLInstruction}",
  "titleTag": "${titleTagInstruction}",
  "descriptionTag": "${descriptionTagInstruction}",${coloursList},${moodsList},${stylesList},${themesList}
}

CRITICAL RULES:
- Write ALL text in British English spelling and style.
- For bodyHTML, titleTag, and descriptionTag: Write naturally and creatively. Use your own descriptive words - do NOT copy values verbatim from the metafield lists below. For example, write "playful and unconventional" instead of "Quirky/Offbeat".
- For colours, moods, styles, and themes ARRAYS ONLY: You MUST select values from the provided lists. These are structured data fields for filtering, not prose.
- If predefined lists are provided, select 3-5 items from each list that best match the artwork.
- Match the exact spelling and capitalization from the predefined lists for the array fields.
- Be specific and accurate based on what you see in the image.

STYLE CLASSIFICATION GUIDANCE:
- To distinguish Photography from Illustration: Look for photographic qualities like natural lighting, lens blur/bokeh, real-world textures, grain, and perspective distortion from camera lenses. Photographs capture real physical scenes, even if the subject matter is whimsical or unusual.
- Illustrations are hand-drawn, digitally created, or have stylized/flat rendering without photographic realism.
- If an image shows a real-world scene (even if the subject is unusual like novelty architecture), classify it as Photography, not Illustration.
- Mixed Media should only be used when there is a clear combination of photographic and illustrated elements.

COLOUR CLASSIFICATION GUIDANCE:
- Select only the top 2-3 KEY dominant colours maximum. Focus on the most prominent colours that define the artwork.
- "Multicolour" should ONLY be assigned when there are many distinctly DIFFERENT vibrant colours (e.g., rainbow, pop art with multiple hues).
- Do NOT assign "Multicolour" when there are varying shades of similar colours (e.g., light blue and dark blue are just "Blue", not multicolour).
- Shades, tints, and tones of the same base colour count as ONE colour, not multiple.`;

    console.log('[AI] Calling OpenAI with model: gpt-4o, response_format: json_object');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: imageUrl }
            }
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000,
    });

    console.log('[AI] OpenAI response received');
    console.log('[AI] Response choices length:', response.choices?.length || 0);
    console.log('[AI] First choice finish_reason:', response.choices?.[0]?.finish_reason);
    console.log('[AI] First choice message:', JSON.stringify(response.choices?.[0]?.message, null, 2));
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log('[AI] ERROR: No content in response');
      console.log('[AI] Full response:', JSON.stringify(response, null, 2));
      throw new Error("No content returned from OpenAI");
    }
    
    console.log('[AI] Content received, length:', content.length);

    const metadata = JSON.parse(content) as ArtworkMetadata;
    
    // Log what we received for debugging
    console.log('[AI] Raw metadata keys:', Object.keys(metadata));
    console.log('[AI] descriptionTag present:', 'descriptionTag' in metadata);
    console.log('[AI] descriptionTag value:', metadata.descriptionTag);
    
    // Filter AI-generated values to only include approved options (case-insensitive match)
    // This ensures the AI can't return values outside the approved lists
    // Note: approved may be an array with a single comma-separated string (legacy format)
    const parseApprovedOptions = (approved: string[] | undefined): string[] => {
      if (!approved || approved.length === 0) return [];
      // Handle legacy format where all options are stored as a single comma-separated string
      if (approved.length === 1 && approved[0].includes(',')) {
        return approved[0].split(',').map(v => v.trim()).filter(Boolean);
      }
      return approved;
    };
    
    const filterToApproved = (values: string[], approved: string[] | undefined): string[] => {
      if (!approved || approved.length === 0) return values;
      const parsedApproved = parseApprovedOptions(approved);
      if (parsedApproved.length === 0) return values;
      const approvedLower = new Map(parsedApproved.map(a => [a.toLowerCase(), a]));
      return values
        .map(v => approvedLower.get(v.toLowerCase()))
        .filter((v): v is string => v !== undefined);
    };
    
    const filteredColours = filterToApproved(
      Array.isArray(metadata.colours) ? metadata.colours : [],
      options?.colourOptions
    );
    const filteredMoods = filterToApproved(
      Array.isArray(metadata.moods) ? metadata.moods : [],
      options?.moodOptions
    );
    const filteredStyles = filterToApproved(
      Array.isArray(metadata.styles) ? metadata.styles : [],
      options?.styleOptions
    );
    const filteredThemes = filterToApproved(
      Array.isArray(metadata.themes) ? metadata.themes : [],
      options?.themeOptions
    );
    
    // Log if any values were filtered out
    if (metadata.colours?.length !== filteredColours.length) {
      console.log(`[AI] Filtered colours from ${metadata.colours?.length} to ${filteredColours.length} (approved list enforcement)`);
    }
    if (metadata.moods?.length !== filteredMoods.length) {
      console.log(`[AI] Filtered moods from ${metadata.moods?.length} to ${filteredMoods.length} (approved list enforcement)`);
    }
    if (metadata.styles?.length !== filteredStyles.length) {
      console.log(`[AI] Filtered styles from ${metadata.styles?.length} to ${filteredStyles.length} (approved list enforcement)`);
    }
    if (metadata.themes?.length !== filteredThemes.length) {
      console.log(`[AI] Filtered themes from ${metadata.themes?.length} to ${filteredThemes.length} (approved list enforcement)`);
    }
    
    // Validate and normalize the response
    return {
      bodyHTML: metadata.bodyHTML || "",
      titleTag: metadata.titleTag || `${artworkTitle} by ${artistName} | Art Print`,
      descriptionTag: metadata.descriptionTag || "",
      colours: filteredColours,
      moods: filteredMoods,
      styles: filteredStyles,
      themes: filteredThemes,
    };
  } catch (error) {
    console.error("Error generating artwork metadata:", error);
    throw new Error(`Failed to generate metadata: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function generateArtworkMetadataFromFile(
  fileBuffer: Buffer,
  artworkTitle: string,
  artistName: string,
  options?: MetadataOptions
): Promise<ArtworkMetadata> {
  // Convert buffer to base64
  const base64Image = fileBuffer.toString('base64');
  const dataUrl = `data:image/jpeg;base64,${base64Image}`;
  
  return generateArtworkMetadata(dataUrl, artworkTitle, artistName, options);
}

/**
 * Generate SEO-optimized ALT text for product images
 * 
 * @param artworkTitle - The title of the artwork
 * @param artistName - The artist's name
 * @param frameType - The frame type (e.g., "Black Frame", "White Frame", "Natural Frame", "Unframed")
 * @param isLifestyle - Whether this is a lifestyle image (vs product mockup)
 * @returns SEO-optimized ALT text string
 */
export async function generateImageAltText(
  artworkTitle: string,
  artistName: string,
  frameType: string,
  isLifestyle: boolean = false
): Promise<string> {
  try {
    const imageContext = isLifestyle 
      ? `lifestyle photo showing the artwork displayed in a styled interior setting`
      : `fine art print "${artworkTitle}" displayed with ${frameType}`;

    const prompt = `Generate a short, SEO-optimized ALT text (max 125 characters) for an e-commerce product image.

Context:
- Artwork: "${artworkTitle}" by ${artistName}
- Image type: ${imageContext}

Requirements:
- Describe what's visually shown: a fine art print with the frame type mentioned
- Include the artwork title and artist name
- Mention the frame type (e.g., "in black frame", "in white frame", "unframed print")
- Be concise, descriptive, and search-engine friendly
- Max 125 characters
- DO NOT use words like "mockup", "product shot", "studio", or any brand names
- DO NOT include decorative words like "beautiful", "stunning", etc.
- Focus on factual description of the artwork and framing

Return ONLY the ALT text string, nothing else.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 50,
    });

    const altText = response.choices[0]?.message?.content?.trim() || 
      `${artworkTitle} by ${artistName}, fine art print - ${frameType}`;

    // Ensure it's under 125 characters
    return altText.length > 125 ? altText.substring(0, 122) + '...' : altText;
  } catch (error) {
    console.error("Error generating ALT text:", error);
    return `${artworkTitle} by ${artistName}, fine art print - ${frameType}`;
  }
}
