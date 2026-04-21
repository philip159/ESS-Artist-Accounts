import {
  instantiate,
  INTENT_RELATIVE_COLORIMETRIC,
  cmsFLAGS_NOCACHE,
  cmsFLAGS_HIGHRESPRECALC,
  cmsFLAGS_BLACKPOINTCOMPENSATION,
  cmsInfoDescription,
  type LCMS
} from "lcms-wasm";

let lcmsInstance: LCMS | null = null;
let initPromise: Promise<LCMS> | null = null;

export async function getLCMS(): Promise<LCMS> {
  if (lcmsInstance) return lcmsInstance;
  
  if (!initPromise) {
    initPromise = instantiate().then(lcms => {
      lcmsInstance = lcms;
      console.log('[ColorConverter] LittleCMS WASM initialized');
      return lcms;
    });
  }
  
  return initPromise;
}

export interface ColorConversionResult {
  rgbData: Uint8ClampedArray;
  width: number;
  height: number;
}

export async function convertCMYKtoSRGB(
  cmykPixelData: Uint8ClampedArray,
  width: number,
  height: number,
  embeddedIccProfile?: Buffer
): Promise<Uint8ClampedArray> {
  const lcms = await getLCMS();
  
  let inputProfile;
  let outputProfile;
  let transform;
  
  try {
    if (embeddedIccProfile && embeddedIccProfile.length > 0) {
      const iccBuffer = new Uint8Array(embeddedIccProfile.buffer, embeddedIccProfile.byteOffset, embeddedIccProfile.byteLength);
      inputProfile = lcms.cmsOpenProfileFromMem(iccBuffer, iccBuffer.length);
      
      if (inputProfile) {
        const profileName = lcms.cmsGetProfileInfoASCII(inputProfile, cmsInfoDescription, "en", "US");
        const colorSpace = lcms.cmsGetColorSpaceASCII(inputProfile);
        console.log(`[ColorConverter] Using embedded ICC profile: ${profileName} (${colorSpace})`);
      }
    }
    
    if (!inputProfile) {
      console.log('[ColorConverter] No valid embedded profile, using built-in CMYK profile');
      inputProfile = lcms.cmsCreateLab4Profile(null);
      if (!inputProfile) {
        throw new Error('Failed to create fallback CMYK profile');
      }
    }
    
    outputProfile = lcms.cmsCreate_sRGBProfile();
    if (!outputProfile) {
      throw new Error('Failed to create sRGB profile');
    }
    
    const IS_FLOAT = false;
    const intent = INTENT_RELATIVE_COLORIMETRIC;
    const flags = cmsFLAGS_NOCACHE | cmsFLAGS_HIGHRESPRECALC | cmsFLAGS_BLACKPOINTCOMPENSATION;
    
    const inputFormat = lcms.cmsFormatterForColorspaceOfProfile(
      inputProfile,
      IS_FLOAT ? 4 : 1,
      IS_FLOAT
    );
    
    const outputFormat = lcms.cmsFormatterForColorspaceOfProfile(
      outputProfile,
      IS_FLOAT ? 4 : 1,
      IS_FLOAT
    );
    
    transform = lcms.cmsCreateTransform(
      inputProfile,
      inputFormat,
      outputProfile,
      outputFormat,
      intent,
      flags
    );
    
    if (!transform) {
      throw new Error('Failed to create color transform');
    }
    
    const nPixels = width * height;
    const rgbData = lcms.cmsDoTransform(transform, cmykPixelData, nPixels);
    
    return new Uint8ClampedArray(rgbData);
    
  } finally {
    if (transform) lcms.cmsDeleteTransform(transform);
    if (inputProfile) lcms.cmsCloseProfile(inputProfile);
    if (outputProfile) lcms.cmsCloseProfile(outputProfile);
  }
}

export async function convertWithEmbeddedProfile(
  rawPixelData: Uint8ClampedArray,
  width: number,
  height: number,
  embeddedIccProfile: Buffer,
  inputChannels: number
): Promise<Uint8ClampedArray> {
  const lcms = await getLCMS();
  
  let inputProfile;
  let outputProfile;
  let transform;
  
  try {
    const iccBuffer = new Uint8Array(embeddedIccProfile.buffer, embeddedIccProfile.byteOffset, embeddedIccProfile.byteLength);
    inputProfile = lcms.cmsOpenProfileFromMem(iccBuffer, iccBuffer.length);
    
    if (!inputProfile) {
      throw new Error('Failed to load embedded ICC profile');
    }
    
    const profileName = lcms.cmsGetProfileInfoASCII(inputProfile, cmsInfoDescription, "en", "US");
    const colorSpace = lcms.cmsGetColorSpaceASCII(inputProfile);
    console.log(`[ColorConverter] Converting from profile: ${profileName} (${colorSpace})`);
    
    outputProfile = lcms.cmsCreate_sRGBProfile();
    if (!outputProfile) {
      throw new Error('Failed to create sRGB profile');
    }
    
    const IS_FLOAT = false;
    const intent = INTENT_RELATIVE_COLORIMETRIC;
    const flags = cmsFLAGS_NOCACHE | cmsFLAGS_HIGHRESPRECALC | cmsFLAGS_BLACKPOINTCOMPENSATION;
    
    const inputFormat = lcms.cmsFormatterForColorspaceOfProfile(
      inputProfile,
      IS_FLOAT ? 4 : 1,
      IS_FLOAT
    );
    
    const outputFormat = lcms.cmsFormatterForColorspaceOfProfile(
      outputProfile,
      IS_FLOAT ? 4 : 1,
      IS_FLOAT
    );
    
    transform = lcms.cmsCreateTransform(
      inputProfile,
      inputFormat,
      outputProfile,
      outputFormat,
      intent,
      flags
    );
    
    if (!transform) {
      throw new Error('Failed to create color transform');
    }
    
    const nPixels = width * height;
    const rgbData = lcms.cmsDoTransform(transform, rawPixelData, nPixels);
    
    return new Uint8ClampedArray(rgbData);
    
  } finally {
    if (transform) lcms.cmsDeleteTransform(transform);
    if (inputProfile) lcms.cmsCloseProfile(inputProfile);
    if (outputProfile) lcms.cmsCloseProfile(outputProfile);
  }
}
