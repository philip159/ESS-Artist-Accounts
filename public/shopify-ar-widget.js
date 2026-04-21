(function() {
  'use strict';

  // East Side Studio AR Widget for Shopify
  // This widget adds "View in Your Space" AR functionality to product pages

  const WIDGET_VERSION = '3.5.0';  // Added QR scan tracking, generation time, country geo
  
  // Production URL
  const AR_VIEWER_BASE_URL = 'https://upload.eastsidestudiolondon.co.uk';
  
  // Debug mode: set window.EASTSIDE_AR_DEBUG = true to enable verbose logging
  const DEBUG_MODE = window.EASTSIDE_AR_DEBUG || false;
  
  // Generate or retrieve session ID for analytics
  let sessionId = sessionStorage.getItem('eastside_ar_session');
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    sessionStorage.setItem('eastside_ar_session', sessionId);
  }
  
  // Detect if user arrived via QR code scan
  const isQrScan = new URLSearchParams(window.location.search).get('ar_qr') === '1';
  
  // Track last GLB generation time for analytics
  let lastGenerationTimeMs = null;
  
  // Track QR code scan page load (only once per session)
  if (isQrScan && !sessionStorage.getItem('eastside_qr_tracked')) {
    sessionStorage.setItem('eastside_qr_tracked', '1');
    // Send QR scan event after short delay to ensure page is loaded
    setTimeout(() => {
      const payload = {
        eventType: 'qr_scan_page_load',
        sessionId: sessionId,
        platform: /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 
                  /Android/i.test(navigator.userAgent) ? 'android' : 'desktop',
        pageUrl: window.location.href.substring(0, 500),
        isQrScan: true,
      };
      fetch(`${AR_VIEWER_BASE_URL}/api/ar/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors',
        keepalive: true
      }).catch(() => {});
    }, 500);
  }

  // Update cart attributes to include AR session for conversion tracking
  // This is hidden from customers but included in order data
  async function updateCartWithArSession(productHandle) {
    try {
      // Get current cart
      const cartResponse = await fetch('/cart.js');
      if (!cartResponse.ok) return;
      
      const cart = await cartResponse.json();
      const currentAttributes = cart.attributes || {};
      
      // Store AR session info - underscore prefix keeps it hidden in most themes
      const arData = {
        ...currentAttributes,
        _ar_session_id: sessionId,
        _ar_product: productHandle,
        _ar_timestamp: new Date().toISOString()
      };
      
      // Update cart attributes
      await fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attributes: arData })
      });
      
      if (DEBUG_MODE) console.debug('[EastSide AR] Cart updated with AR session:', sessionId);
    } catch (err) {
      // Silently fail - this is enhancement only
      if (DEBUG_MODE) console.debug('[EastSide AR] Cart attribute update failed:', err);
    }
  }

  // Track analytics event - uses sendBeacon for reliability during navigation
  function trackEvent(eventType, productConfig, additionalData = {}) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/i.test(navigator.userAgent);
    const platform = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';
    
    const payload = {
      eventType: eventType,
      sessionId: sessionId,
      platform: platform,
      productId: productConfig?.productId || null,
      productTitle: productConfig?.title || null,
      productHandle: productConfig?.handle || null,
      variantId: productConfig?.variantId || null,
      frameStyle: productConfig?.frame || null,
      frame: productConfig?.frame || null,
      frameType: productConfig?.frameType || null,
      size: productConfig?.size || null,
      userAgent: navigator.userAgent.substring(0, 500),
      pageUrl: window.location.href.substring(0, 500),
      referrer: document.referrer?.substring(0, 500) || null,
      isQrScan: isQrScan,
      generationTimeMs: lastGenerationTimeMs,
      ...additionalData
    };
    
    const url = `${AR_VIEWER_BASE_URL}/api/ar/analytics`;
    const body = JSON.stringify(payload);
    
    // Use sendBeacon for AR launch events (survives page navigation/redirect)
    // Fall back to fetch with keepalive for broader compatibility
    if (eventType.startsWith('ar_launch_') && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      const sent = navigator.sendBeacon(url, blob);
      if (!sent) {
        // Fallback to fetch if sendBeacon fails
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          mode: 'cors',
          keepalive: true
        }).catch(() => {});
      }
    } else {
      // Regular fetch with keepalive for button clicks
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        mode: 'cors',
        keepalive: true
      }).catch(err => {
        // Silently fail - analytics should never break user experience
        if (DEBUG_MODE) console.debug('[EastSide AR] Analytics error:', err);
      });
    }
  }

  // Load model-viewer script if not already loaded
  let modelViewerLoaded = false;
  function loadModelViewer() {
    if (modelViewerLoaded || document.querySelector('script[src*="model-viewer"]')) {
      modelViewerLoaded = true;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.3.0/model-viewer.min.js';
      script.onload = () => {
        modelViewerLoaded = true;
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // SIZE MAPPING: Shopify variant names → AR dimensions
  // Keys are normalized (lowercase, trimmed) for matching
  // Values should be in format: "WIDTHxHEIGHTunit" (e.g., "30x40cm", "11x14in")
  const SIZE_MAP = window.EASTSIDE_SIZE_MAP || {
    // A-ratio sizes (common UK/EU) - multiple format variants
    'a5': 'A5',
    'a5 - 5.83': 'A5',
    'a5 - 5.83" x 8.27"': 'A5',
    'a4': 'A4',
    'a4 - 8.27': 'A4',
    'a4 - 8.27" x 11.67"': 'A4',
    'a3': 'A3',
    'a3 - 11.69': 'A3',
    'a3 - 11.7': 'A3',
    'a3 - 11.7" x 16.5"': 'A3',
    'a2': 'A2',
    'a2 - 16.54': 'A2',
    'a2 - 16.5': 'A2',
    'a2 - 16.5" x 23.4"': 'A2',
    'a1': 'A1',
    'a1 - 23.39': 'A1',
    'a1 - 23.4': 'A1',
    'a1 - 23.4" x 33.1"': 'A1',
    'a0': 'A0',
    'a0 - 33.1': 'A0',
    'a0 - 33.1" x 46.8"': 'A0',
    
    // Common metric sizes (cm)
    '20x30': '20x30cm',
    '20x30cm': '20x30cm',
    '30x40': '30x40cm',
    '30x40cm': '30x40cm',
    '40x50': '40x50cm',
    '40x50cm': '40x50cm',
    '50x70': '50x70cm',
    '50x70cm': '50x70cm',
    '60x80': '60x80cm',
    '60x80cm': '60x80cm',
    '70x100': '70x100cm',
    '70x100cm': '70x100cm',
    
    // Square sizes (inches)
    '12': '12x12in',
    '12x12': '12x12in',
    '12" x 12"': '12x12in',
    '16': '16x16in',
    '16x16': '16x16in',
    '16" x 16"': '16x16in',
    '20': '20x20in',
    '20x20': '20x20in',
    '20" x 20"': '20x20in',
    '30': '30x30in',
    '30x30': '30x30in',
    '30" x 30"': '30x30in',
    
    // 4:5 ratio sizes (inches)
    '6x8': '6x8in',
    '6" x 8"': '6x8in',
    '8x10': '8x10in',
    '8x10in': '8x10in',
    '8"x10"': '8x10in',
    '8" x 10"': '8x10in',
    '11x14': '11x14in',
    '11x14in': '11x14in',
    '11"x14"': '11x14in',
    '11" x 14"': '11x14in',
    '16x20': '16x20in',
    '16x20in': '16x20in',
    '16" x 20"': '16x20in',
    
    // 3:4 ratio sizes (inches)
    '12x16': '12x16in',
    '12x16in': '12x16in',
    '12" x 16"': '12x16in',
    '18x24': '18x24in',
    '18x24in': '18x24in',
    '18" x 24"': '18x24in',
    '24x32': '24x32in',
    '24" x 32"': '24x32in',
    '30x40': '30x40in',
    '30x40in': '30x40in',
    '30" x 40"': '30x40in',
    
    // 2:3 ratio sizes (inches)
    '8': '8x12in',
    '8x12': '8x12in',
    '8" x 12"': '8x12in',
    '12x18': '12x18in',
    '12" x 18"': '12x18in',
    '16x24': '16x24in',
    '16" x 24"': '16x24in',
    '18': '18x24in',
    '18x24': '18x24in',
    '18x24in': '18x24in',
    '18" x 24"': '18x24in',
    '20x30': '20x30in',
    '20" x 30"': '20x30in',
    '24x36': '24x36in',
    '24x36in': '24x36in',
    '24" x 36"': '24x36in',
    
    // A-ratio variants with cm equivalents
    '20x28': '20x28in',
    '20x28in': '20x28in',
    '20" x 28"': '20x28in',
    '20" x 28" (50cm x 70cm)': '20x28in',
    '28': '28x40in',
    '28x40': '28x40in',
    '28x40in': '28x40in',
    '28" x 40"': '28x40in',
    '28" x 40" (70cm x 100cm)': '28x40in',
  };

  // FRAME MAPPING: Shopify variant names → AR frame styles
  // Keys are normalized (lowercase, trimmed) for matching
  // Values must be one of: 'black', 'white', 'oak', 'natural'
  const FRAME_MAP = window.EASTSIDE_FRAME_MAP || {
    // Black frame variants
    'black': 'black',
    'black frame': 'black',
    'matte black': 'black',
    'ebony': 'black',
    'charcoal': 'black',
    
    // White frame variants
    'white': 'white',
    'white frame': 'white',
    'matte white': 'white',
    'ivory': 'white',
    'cream': 'white',
    
    // Oak frame variants
    'oak': 'oak',
    'oak frame': 'oak',
    'light oak': 'oak',
    'honey oak': 'oak',
    
    // Natural/raw wood variants
    'natural': 'natural',
    'natural frame': 'natural',
    'natural wood': 'natural',
    'raw': 'natural',
    'pine': 'natural',
    'birch': 'natural',
    'maple': 'natural',
    'walnut': 'oak',  // Walnut is darker, closer to oak
    
    // Ash wood (used for box frames)
    'ash': 'ash',
    'ash frame': 'ash',
    'box frame': 'ash',  // Box frames use ash by default
    
    // Unframed (hide widget for these)
    'unframed': 'unframed',
    'no frame': 'unframed',
    'none': 'unframed',
    'print only': 'unframed',
  };

  // ASPECT RATIO MAPPING: Maps size formats to their aspect ratio category
  // Used to select the correct ratio-specific image when available
  const RATIO_MAP = {
    // A-ratio sizes (1:1.414 - ISO standard)
    'A0': 'a-ratio',
    'A1': 'a-ratio',
    'A2': 'a-ratio',
    'A3': 'a-ratio',
    'A4': 'a-ratio',
    'A5': 'a-ratio',
    
    // 2:3 ratio (common photo prints)
    '4x6in': '2x3',
    '6x9in': '2x3',
    '8x12in': '2x3',
    '10x15cm': '2x3',
    '12x18in': '2x3',
    '16x24in': '2x3',
    '20x30cm': '2x3',
    '24x36in': '2x3',
    '40x60cm': '2x3',
    '50x75cm': '2x3',
    '60x90cm': '2x3',
    
    // 3:4 ratio
    '6x8in': '3x4',
    '9x12in': '3x4',
    '12x16in': '3x4',
    '15x20cm': '3x4',
    '18x24in': '3x4',
    '24x32in': '3x4',
    '30x40cm': '3x4',
    '45x60cm': '3x4',
    '60x80cm': '3x4',
    
    // 4:5 ratio
    '4x5in': '4x5',
    '8x10in': '4x5',
    '11x14in': '4x5',
    '16x20in': '4x5',
    '20x25cm': '4x5',
    '24x30cm': '4x5',
    '40x50cm': '4x5',
    '50x60cm': '4x5',  // Close to 4:5
    
    // 1:1 ratio (square)
    '5x5in': '1x1',
    '6x6in': '1x1',
    '8x8in': '1x1',
    '10x10in': '1x1',
    '10x10cm': '1x1',
    '12x12in': '1x1',
    '15x15cm': '1x1',
    '20x20cm': '1x1',
    '30x30cm': '1x1',
    '40x40cm': '1x1',
    '50x50cm': '1x1',
    
    // 5:7 ratio (less common, map to closest)
    '5x7in': '4x5',  // 5:7 is close to 4:5
    '10x14in': '4x5',
    
    // 50x70cm is close to A-ratio (1:1.4)
    '50x70cm': 'a-ratio',
    '70x100cm': 'a-ratio',
  };

  // Detect ratio from numeric dimensions
  function detectRatioFromDimensions(width, height) {
    if (!width || !height) return null;
    
    // Ensure width < height for consistent comparison
    const w = Math.min(width, height);
    const h = Math.max(width, height);
    const ratio = h / w;
    
    // Match to closest standard ratio
    const ratios = {
      '1x1': 1.0,
      '4x5': 1.25,
      '3x4': 1.333,
      'a-ratio': 1.414,
      '2x3': 1.5,
    };
    
    let closestRatio = 'a-ratio';
    let closestDiff = Infinity;
    
    for (const [name, targetRatio] of Object.entries(ratios)) {
      const diff = Math.abs(ratio - targetRatio);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestRatio = name;
      }
    }
    
    log('Detected ratio from dimensions:', width, 'x', height, '=', closestRatio, '(ratio:', ratio.toFixed(3), ')');
    return closestRatio;
  }

  // Parse size string and detect its aspect ratio
  function getSizeRatio(size) {
    if (!size) return null;
    
    // Normalize size for lookup: lowercase, trim, collapse spaces
    const normalizedSize = size.toLowerCase().trim().replace(/\s+/g, '');
    
    // Check direct mapping first (try both original and normalized)
    if (RATIO_MAP[size]) {
      log('Size ratio from map:', size, '→', RATIO_MAP[size]);
      return RATIO_MAP[size];
    }
    
    // Try normalized version in map
    for (const [key, value] of Object.entries(RATIO_MAP)) {
      const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, '');
      if (normalizedSize === normalizedKey || normalizedSize.includes(normalizedKey)) {
        log('Size ratio from normalized map:', size, '→', value);
        return value;
      }
    }
    
    // Check if it's an A-size (handle formats like "A4", "A4 - 8.27", etc.)
    const aMatch = size.match(/\bA(\d)\b/i);
    if (aMatch) {
      log('Size ratio (A-size pattern):', size, '→ a-ratio');
      return 'a-ratio';
    }
    
    // Try to parse dimensions from size string
    // Formats: "30x40cm", "12x18in", "30 x 40 cm", '28" x 40"', '12" x 18"', etc.
    // Note: Allow for optional quote/inch marks after numbers
    const dimMatch = size.match(/(\d+(?:\.\d+)?)\s*["']?\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    if (dimMatch) {
      const w = parseFloat(dimMatch[1]);
      const h = parseFloat(dimMatch[2]);
      log('Parsed dimensions from size string:', w, 'x', h);
      const detectedRatio = detectRatioFromDimensions(w, h);
      if (detectedRatio) {
        log('Size ratio from parsed dimensions:', size, '→', detectedRatio);
        return detectedRatio;
      }
    }
    
    log('Could not determine ratio for size:', size);
    return null;
  }

  // Get the best image URL for the selected ratio
  function getBestImageForRatio(container, targetRatio) {
    if (!container) return { imageUrl: null, matchedRatio: null, isExactMatch: false };
    
    log('=== Finding best image for ratio:', targetRatio, '===');
    
    // Read all available image attributes
    // Priority: ratio-specific > fallback (ar-image)
    const images = {
      'a-ratio': container.getAttribute('data-ar-image-a-ratio') || container.dataset.arImageARatio,
      '3x4': container.getAttribute('data-ar-image-3x4') || container.dataset.arImage3x4,
      '4x5': container.getAttribute('data-ar-image-4x5') || container.dataset.arImage4x5,
      '2x3': container.getAttribute('data-ar-image-2x3') || container.dataset.arImage2x3,
      '1x1': container.getAttribute('data-ar-image-1x1') || container.dataset.arImage1x1,
    };
    
    // Fallback image (AR_image metafield)
    const fallbackImage = container.getAttribute('data-ar-image') || 
                          container.dataset.arImage ||
                          // Legacy support for wav_image
                          container.getAttribute('data-wav-image') || 
                          container.dataset.wavImage ||
                          container.dataset.wav_image;
    
    log('Available images:', {
      'a-ratio': images['a-ratio'] ? 'yes' : 'no',
      '3x4': images['3x4'] ? 'yes' : 'no',
      '4x5': images['4x5'] ? 'yes' : 'no',
      '2x3': images['2x3'] ? 'yes' : 'no',
      '1x1': images['1x1'] ? 'yes' : 'no',
      'fallback': fallbackImage ? 'yes' : 'no',
    });
    
    // If we have an exact match for the target ratio, use it
    if (targetRatio && images[targetRatio]) {
      log('Exact ratio match found:', targetRatio);
      return { 
        imageUrl: images[targetRatio], 
        matchedRatio: targetRatio, 
        isExactMatch: true 
      };
    }
    
    // Otherwise, use the fallback image with scaling mode
    if (fallbackImage) {
      log('Using fallback image with scale-by-width mode');
      return { 
        imageUrl: fallbackImage, 
        matchedRatio: null, 
        isExactMatch: false 
      };
    }
    
    // Last resort: use any available ratio-specific image
    // In this case, don't enable scaleByWidth since we have a proper ratio image
    for (const [ratio, url] of Object.entries(images)) {
      if (url) {
        log('Using available ratio image as fallback:', ratio);
        return { 
          imageUrl: url, 
          matchedRatio: ratio, 
          isExactMatch: true  // Treat ratio-specific images as exact to avoid distortion
        };
      }
    }
    
    log('No image found');
    return { imageUrl: null, matchedRatio: null, isExactMatch: false };
  }

  // Configuration - can be overridden by setting window.EASTSIDE_CONFIG before script loads
  const config = Object.assign({
    buttonSelector: '.eastside-ar-button',
    containerSelector: '.eastside-ar-container',
    autoInit: true,
    debug: false,  // Set to true or use window.EASTSIDE_AR_DEBUG = true for verbose logging
  }, window.EASTSIDE_CONFIG || {});

  function log(...args) {
    if (DEBUG_MODE) {
      console.log('[EastSide AR]', ...args);
    }
  }

  // Normalize string for mapping lookup
  function normalize(str) {
    return (str || '').toLowerCase().trim();
  }

  // Map Shopify size to AR size format
  function mapSize(shopifySize) {
    const normalized = normalize(shopifySize);
    
    // Check direct mapping first
    if (SIZE_MAP[normalized]) {
      log('Size mapped:', shopifySize, '→', SIZE_MAP[normalized]);
      return SIZE_MAP[normalized];
    }
    
    // Try partial matching for variants with extra text
    // Be more strict: require at least 3 chars to match, and avoid single-digit false matches
    for (const [key, value] of Object.entries(SIZE_MAP)) {
      // Skip short keys for partial matching to avoid "18" matching "8"
      if (key.length < 3 && normalized.length < 3) continue;
      
      // For substring matches, require the match to be at a word boundary
      // or be a substantial portion of the string
      if (key.length >= 3 && normalized.includes(key)) {
        log('Size partial match:', shopifySize, '→', value);
        return value;
      }
      if (normalized.length >= 3 && key.includes(normalized)) {
        log('Size partial match:', shopifySize, '→', value);
        return value;
      }
    }
    
    // If no mapping found, return as-is (AR endpoint will try to parse)
    log('Size unmapped, using raw:', shopifySize);
    return shopifySize;
  }

  // Map Shopify frame to AR frame style
  function mapFrame(shopifyFrame) {
    const normalized = normalize(shopifyFrame);
    
    // Check direct mapping first
    if (FRAME_MAP[normalized]) {
      log('Frame mapped:', shopifyFrame, '→', FRAME_MAP[normalized]);
      return FRAME_MAP[normalized];
    }
    
    // Try partial matching
    for (const [key, value] of Object.entries(FRAME_MAP)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        log('Frame partial match:', shopifyFrame, '→', value);
        return value;
      }
    }
    
    // Default to natural if no match
    log('Frame unmapped, defaulting to natural:', shopifyFrame);
    return 'natural';
  }

  // Detect if device supports AR
  function supportsAR() {
    const hasWebXR = navigator.xr && typeof navigator.xr.isSessionSupported === 'function';
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/i.test(navigator.userAgent);
    return hasWebXR || isIOS || isAndroid;
  }

  // Detect Mount selection (Yes/No) - supports ESS Addons widget, variant picker and legacy Globo
  function detectGloboMount() {
    // ESS Addons widget toggle detection (most reliable when widget is present)
    const essToggleGroups = document.querySelectorAll('.ess-toggle-group');
    for (const group of essToggleGroups) {
      const title = (group.querySelector('.ess-toggle-title')?.textContent || '').toLowerCase();
      if (title.includes('mount')) {
        const activeBtn = group.querySelector('.ess-toggle-btn.is-active');
        if (activeBtn) {
          const action = activeBtn.dataset.toggleAction;
          if (action === 'yes') {
            log('MOUNT DETECTED: Yes (ESS Addons widget)');
            return true;
          } else if (action === 'no') {
            log('MOUNT DETECTED: No (ESS Addons widget)');
            return false;
          }
        }
        const valueSpan = group.querySelector('.ess-toggle-value');
        if (valueSpan && valueSpan.textContent.toLowerCase().trim() === 'yes') {
          log('MOUNT DETECTED: Yes (ESS Addons widget value)');
          return true;
        }
      }
    }

    // Direct detection via variant-picker mount class (most reliable)
    const mountSelectedSpan = document.querySelector('.variant-picker__option-selected--mount, [class*="option-selected--mount"]');
    if (mountSelectedSpan) {
      const text = (mountSelectedSpan.textContent || '').toLowerCase().trim();
      if (text === 'yes') {
        log('MOUNT DETECTED: Yes (variant-picker)');
        return true;
      }
    }
    
    // Check for "Mount" labeled sections with "Yes" selected
    const mountContainers = document.querySelectorAll('[data-option-name*="mount" i], [class*="mount" i], .globo-option-group');
    for (const container of mountContainers) {
      const labelText = (container.querySelector('.option-label, .globo-option-label, label')?.textContent || '').toLowerCase();
      const containerText = (container.textContent || '').toLowerCase();
      
      if (labelText.includes('mount') || containerText.startsWith('mount')) {
        const selectedEl = container.querySelector('.selected, .active, [aria-selected="true"], [data-selected="true"], input:checked');
        if (selectedEl) {
          const selectedText = (selectedEl.textContent || selectedEl.value || '').toLowerCase().trim();
          if (selectedText === 'yes' || selectedText.includes('yes')) {
            log('MOUNT DETECTED: Yes (mount section)');
            return true;
          }
        }
      }
    }
    
    // Check all selected elements for "Yes" near "Mount" label
    const allSelected = document.querySelectorAll('.selected, .active, [data-selected="true"], .is-selected, input:checked');
    for (const el of allSelected) {
      const role = el.getAttribute('role');
      if (role === 'tab' || role === 'button') continue;
      
      const text = (el.textContent || el.value || '').toLowerCase().trim();
      if (text === 'yes') {
        const parent = el.closest('.globo-option-group, .option-group, .product-option, [class*="option"]');
        if (parent && (parent.textContent || '').toLowerCase().includes('mount')) {
          log('MOUNT DETECTED: Yes (near Mount label)');
          return true;
        }
      }
    }
    
    // Legacy Globo: swatch/button with "Yes" in mount context
    const globoSwatches = document.querySelectorAll('.globo-swatch.selected, .globo-swatch.active, .globo-option-button.selected, [class*="swatch"].selected');
    for (const swatch of globoSwatches) {
      const title = (swatch.getAttribute('title') || swatch.getAttribute('data-value') || swatch.textContent || '').toLowerCase().trim();
      if (title === 'yes') {
        const optionGroup = swatch.closest('.globo-option-group, [data-option-label*="mount" i]');
        if (optionGroup && (optionGroup.textContent || '').toLowerCase().includes('mount')) {
          log('MOUNT DETECTED: Yes (Globo swatch)');
          return true;
        }
      }
    }
    
    // Legacy: checked radio/checkbox with "yes" in mount container
    const mountRadios = document.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked');
    for (const input of mountRadios) {
      const value = (input.value || '').toLowerCase();
      if (value === 'yes') {
        const label = input.closest('label') || document.querySelector(`label[for="${input.id}"]`);
        const container = input.closest('.option-group, .globo-option-group, [class*="option"]');
        const contextText = (label?.textContent || '') + (container?.textContent || '');
        if (contextText.toLowerCase().includes('mount')) {
          log('MOUNT DETECTED: Yes (radio input)');
          return true;
        }
      }
    }
    
    // Legacy Globo: GloboPreorder storage
    if (window.GloboPreorder?.selectedOptions) {
      for (const [key, value] of Object.entries(window.GloboPreorder.selectedOptions)) {
        if (key.toLowerCase().includes('mount') && String(value).toLowerCase() === 'yes') {
          log('MOUNT DETECTED: Yes (GloboPreorder)');
          return true;
        }
      }
    }
    
    return false;
  }

  // Detect frame upgrades (Box Frame) - supports custom ESS addon widget and legacy Globo
  function detectGloboBoxFrame() {
    log('=== Detecting Box Frame ===');
    
    // PRIORITY: Check ESS custom addon widget (replaces Globo)
    const essSelectedAddons = document.querySelectorAll('.ess-addon-box.is-selected');
    if (essSelectedAddons.length > 0) {
      log('ESS Addons selected:', essSelectedAddons.length);
      for (const addon of essSelectedAddons) {
        const addonName = addon.querySelector('.ess-addon-name')?.textContent?.toLowerCase() || '';
        if (addonName.includes('box frame') || addonName.includes('box-frame') || addonName.includes('boxframe')) {
          log('BOX FRAME DETECTED:', addonName);
          return true;
        }
      }
    }
    
    // Fallback: Check for checked ESS addon checkboxes
    const essCheckedInputs = document.querySelectorAll('.ess-addon-box input[type="checkbox"]:checked');
    for (const input of essCheckedInputs) {
      const addonBox = input.closest('.ess-addon-box');
      const addonName = addonBox?.querySelector('.ess-addon-name')?.textContent?.toLowerCase() || '';
      if (addonName.includes('box frame') || addonName.includes('box-frame')) {
        log('BOX FRAME DETECTED (checkbox):', addonName);
        return true;
      }
    }
    
    // Legacy: Check selected elements containing "box frame" text
    const allSelected = document.querySelectorAll('.selected, .active, [data-selected="true"], .is-selected, .checked');
    for (const el of allSelected) {
      const role = el.getAttribute('role');
      const tagName = el.tagName.toLowerCase();
      if (role === 'tab' || role === 'button' || tagName === 'button' || tagName === 'a' || el.classList.contains('ess-addon-box')) {
        continue;
      }
      const text = (el.textContent || '').toLowerCase();
      if (text.includes('box frame') || text.includes('box-frame') || text.includes('boxframe')) {
        log('BOX FRAME DETECTED (selected element)');
        return true;
      }
    }
    
    // Legacy: Check for checked inputs with box frame labels
    const checkedInputs = document.querySelectorAll('input:checked');
    for (const input of checkedInputs) {
      const value = (input.value || '').toLowerCase();
      if (value.includes('box frame') || value.includes('box-frame')) {
        log('BOX FRAME DETECTED (input value)');
        return true;
      }
      const label = input.closest('label')?.textContent || 
                   document.querySelector(`label[for="${input.id}"]`)?.textContent || '';
      if (label.toLowerCase().includes('box frame')) {
        log('BOX FRAME DETECTED (input label)');
        return true;
      }
      const parent = input.closest('.globo-option-item, .option-item, [data-option]');
      if (parent && (parent.textContent || '').toLowerCase().includes('box frame')) {
        log('BOX FRAME DETECTED (parent container)');
        return true;
      }
    }
    
    // Legacy Globo: Check Globo specific elements
    const globoOptions = document.querySelectorAll('[data-globo-option], .globo-product-option, .globo-option-item, .globo-option');
    for (const option of globoOptions) {
      const text = (option.textContent || '').toLowerCase();
      const isSelected = option.classList.contains('selected') || 
                        option.classList.contains('active') ||
                        option.querySelector('input:checked') !== null ||
                        option.getAttribute('aria-selected') === 'true';
      if (text.includes('box frame') && isSelected) {
        log('BOX FRAME DETECTED (Globo option)');
        return true;
      }
    }
    
    // Legacy Globo: Check swatches
    const globoSwatches = document.querySelectorAll('.globo-swatch.selected, .globo-swatch.active, .globo-option-swatch.selected, .swatch.selected');
    for (const swatch of globoSwatches) {
      const title = swatch.getAttribute('title') || swatch.getAttribute('data-title') || swatch.getAttribute('data-value') || '';
      const label = swatch.closest('[data-option-label]')?.getAttribute('data-option-label') || '';
      if (title.toLowerCase().includes('box frame') || label.toLowerCase().includes('box frame')) {
        log('BOX FRAME DETECTED (Globo swatch)');
        return true;
      }
    }
    
    // Legacy: Check select dropdowns
    const selects = document.querySelectorAll('select');
    for (const select of selects) {
      const selectedOption = select.options[select.selectedIndex];
      if (selectedOption) {
        const text = (selectedOption.text || selectedOption.value || '').toLowerCase();
        if (text.includes('box frame')) {
          log('BOX FRAME DETECTED (dropdown)');
          return true;
        }
      }
    }
    
    // Legacy Globo: Check GloboPreorder storage
    if (window.GloboPreorder?.selectedOptions) {
      const selectedOpts = Object.values(window.GloboPreorder.selectedOptions);
      for (const opt of selectedOpts) {
        if (typeof opt === 'string' && opt.toLowerCase().includes('box frame')) {
          log('BOX FRAME DETECTED (GloboPreorder)');
          return true;
        }
      }
    }
    
    // Legacy: Check upgrade containers
    const upgradeContainers = document.querySelectorAll('[class*="upgrade"], [class*="addon"], [data-option-name*="upgrade" i], [data-option-name*="frame" i]');
    for (const container of upgradeContainers) {
      const containerText = (container.textContent || '').toLowerCase();
      if (containerText.includes('box frame')) {
        const checkedInput = container.querySelector('input:checked');
        if (checkedInput) {
          log('BOX FRAME DETECTED (upgrade container input)');
          return true;
        }
        const selectedSwatch = container.querySelector('.selected, .active, [aria-checked="true"]');
        if (selectedSwatch) {
          log('BOX FRAME DETECTED (upgrade container swatch)');
          return true;
        }
      }
    }
    
    return false;
  }
  
  // Helper: Get full size from buttons/labels when data-size attribute is truncated
  function getFullSizeFromButtons() {
    // Priority 1: Look for "Size:" label text which shows the current selection
    // e.g., "Size: A3 - 11.7" x 16.5"" or "Size: 28" x 40" (70cm x 100cm)"
    const sizeElements = document.querySelectorAll('span, label, div, p');
    for (const el of sizeElements) {
      const text = el.textContent?.trim() || '';
      // Check if this element shows "Size:" followed by a value
      const match = text.match(/^size:\s*(.+)/i);
      if (match && match[1]) {
        const sizeValue = match[1].trim();
        // Make sure it looks like a size (contains a dimension pattern)
        if (sizeValue.match(/\d.*[x×].*\d|^A\d/i)) {
          log('Size from Size: label:', sizeValue);
          return sizeValue;
        }
      }
    }
    
    // Priority 2: Look for checked radio inputs for size
    const sizeRadio = document.querySelector('input[type="radio"][name*="size" i]:checked, input[type="radio"][name*="Size"]:checked');
    if (sizeRadio) {
      const label = document.querySelector(`label[for="${sizeRadio.id}"]`);
      const labelText = label?.textContent?.trim() || sizeRadio.value;
      // Match A-sizes (A3, A4) or dimension patterns
      if (labelText && labelText.match(/\d.*[x×].*\d|^A\d/i)) {
        log('Full size from radio label:', labelText);
        return labelText;
      }
    }
    
    // Priority 3: Look for selected size buttons (pill buttons, etc.)
    const allButtons = document.querySelectorAll('button, [role="button"], .swatch, [data-option-value]');
    for (const btn of allButtons) {
      const text = btn.textContent?.trim() || '';
      // Check if this looks like a size (A-sizes or dimensions with x)
      if (text.match(/\d+["']?\s*[x×]\s*\d+["']?|^A\d/i)) {
        // Check if this button is selected (various methods)
        const isSelected = 
          btn.classList.contains('selected') ||
          btn.classList.contains('active') ||
          btn.getAttribute('aria-checked') === 'true' ||
          btn.getAttribute('data-selected') === 'true';
        
        // Also check by border color (Rio theme uses dark border for selected)
        const style = window.getComputedStyle(btn);
        const borderColor = style.borderColor;
        const rgb = borderColor.match(/\d+/g);
        const isDarkBorder = rgb && parseInt(rgb[0]) < 100;
        
        if (isSelected || isDarkBorder) {
          log('Full size from selected button:', text);
          return text;
        }
      }
    }
    
    return null;
  }

  // Get current product configuration from Shopify page
  function getProductConfig() {
    let imageUrl = null;
    let rawSize = '30x40cm';
    let rawFrame = 'natural';
    let title = document.title;
    let mount = '0';
    let frameType = 'standard';
    let scaleByWidth = false;  // Flag to indicate fallback scaling mode

    // Priority 1: Try to get from data attributes on container
    // NOTE: We skip data-size because HTML attribute quotes cause truncation (e.g. "20" x 30"" becomes "20")
    // Instead, we get size from span labels/buttons which don't have this issue
    const container = document.querySelector(config.containerSelector);
    log('Container found:', container);
    if (container) {
      log('Container dataset:', JSON.stringify(container.dataset));
      
      // Don't use data-size - it's always truncated due to quote issues
      // rawSize will be populated later from span labels/buttons
      rawFrame = container.dataset.frame || rawFrame;
      title = container.dataset.title || title;
      mount = container.dataset.mount || mount;
      frameType = container.dataset.frameType || frameType;
      
      // Get size from buttons/labels first (avoids truncation issues)
      const fullSize = getFullSizeFromButtons();
      if (fullSize) {
        rawSize = fullSize;
        log('Size from buttons/labels:', rawSize);
      }
      
      // Determine target aspect ratio from selected size
      const targetRatio = getSizeRatio(rawSize);
      log('Target ratio for size', rawSize, ':', targetRatio);
      
      // Get the best image for this ratio
      const imageResult = getBestImageForRatio(container, targetRatio);
      imageUrl = imageResult.imageUrl;
      
      // If not an exact ratio match, enable scale-by-width mode
      if (!imageResult.isExactMatch && imageUrl) {
        scaleByWidth = true;
        log('Fallback mode: scale-by-width enabled (image ratio may differ from target)');
      }
      
      log('Raw values - imageUrl:', imageUrl, 'size:', rawSize, 'frame:', rawFrame, 'frameType:', frameType, 'scaleByWidth:', scaleByWidth);
    }

    // Priority 2: Try to get from Shopify's global product object
    if (window.ShopifyAnalytics?.meta?.product?.id) {
      log('Found Shopify product ID:', window.ShopifyAnalytics.meta.product.id);
    }
    
    // Priority 2b: Try to get size from Shopify's variant data (properly encoded, avoids HTML quote issues)
    // This handles cases where data-size gets truncated due to unescaped quotes like 20" x 30"
    try {
      let productData = null;
      
      // Method 1: Look for product JSON script
      const productJsonScript = document.querySelector('script[type="application/json"][data-product-json], script#product-json, [data-product-json]');
      if (productJsonScript) {
        productData = JSON.parse(productJsonScript.textContent);
        log('Found product JSON from script tag');
      }
      
      // Method 2: Check for global product variable (many themes expose this)
      if (!productData && window.product) {
        productData = window.product;
        log('Found global product variable');
      }
      
      // Method 3: Look for product data in meta or theme settings
      if (!productData && window.meta?.product) {
        productData = window.meta.product;
        log('Found product in window.meta');
      }
      
      // Method 4: Parse from inline script containing product JSON
      if (!productData) {
        const scripts = document.querySelectorAll('script:not([src])');
        for (const script of scripts) {
          const content = script.textContent || '';
          // Look for product = {...} or window.product = {...}
          const match = content.match(/(?:window\.)?product\s*=\s*(\{[\s\S]*?"variants"[\s\S]*?\});/);
          if (match) {
            try {
              productData = JSON.parse(match[1]);
              log('Found product from inline script');
              break;
            } catch (e) { /* continue */ }
          }
        }
      }
      
      if (productData) {
        // Get current variant ID from URL or form
        const urlVariantId = new URLSearchParams(window.location.search).get('variant');
        const formVariantId = document.querySelector('input[name="id"], select[name="id"]')?.value;
        const variantId = urlVariantId || formVariantId;
        
        log('Looking for variant ID:', variantId);
        
        if (variantId && productData.variants) {
          const currentVariant = productData.variants.find(v => String(v.id) === String(variantId));
          if (currentVariant) {
            log('Found current variant:', currentVariant.title || currentVariant.option1);
            // option1 is typically Size in this setup
            if (currentVariant.option1 && currentVariant.option1.match(/\d/)) {
              log('Size from Shopify variant:', currentVariant.option1);
              rawSize = currentVariant.option1;
            }
            if (currentVariant.option2) {
              log('Frame from Shopify variant:', currentVariant.option2);
              rawFrame = currentVariant.option2;
            }
          }
        }
      } else {
        log('No product data found in page');
      }
    } catch (e) {
      log('Error reading product data:', e.message);
    }
    
    // Priority 2c: Read size from span labels, radio buttons or size option buttons (properly escaped text)
    // This avoids the HTML attribute truncation issue with quotes
    if (!rawSize || rawSize.length < 4) {  // If size is suspiciously short like "20" or "12"
      log('Size appears truncated, looking for size spans/buttons/radios...');
      
      // Priority 1: Look for "Size:" label text which shows current selection (e.g. "Size: 28" x 40" (70cm x 100cm)")
      // This is the most reliable as it shows what's actually selected
      const sizeLabelElements = document.querySelectorAll('[class*="product-option"] > span, [class*="option-label"], .product__option-label');
      for (const el of sizeLabelElements) {
        const text = el.textContent?.trim() || '';
        if (text.toLowerCase().startsWith('size:') || text.toLowerCase() === 'size') {
          // Get the sibling or next text that contains the size value
          const parent = el.parentElement;
          const fullText = parent?.textContent?.trim() || '';
          const sizeMatch = fullText.match(/size:\s*(.+)/i);
          if (sizeMatch && sizeMatch[1]) {
            const sizeValue = sizeMatch[1].trim();
            if (sizeValue.match(/\d+["']?\s*[x×]\s*\d+/i)) {
              log('Size from Size: label text:', sizeValue);
              rawSize = sizeValue;
              break;
            }
          }
        }
      }
      
      // Priority 2: Look for span elements inside SELECTED buttons
      // Match sizes with optional extra text like "(70cm x 100cm)"
      if (!rawSize || rawSize.length < 4) {
        const sizeSpans = document.querySelectorAll('span, label, div.option-value, [class*="option-value"], [class*="size-value"]');
        for (const span of sizeSpans) {
          const text = span.textContent?.trim() || '';
          // Match size pattern like: 18" x 24", 28" x 40" (70cm x 100cm), A3, etc.
          // Allow extra text after the main size pattern
          if (text.match(/^(?:A\d|[A-Z]\d|\d+["']?\s*[x×]\s*\d+["']?)/i) && text.match(/\d/)) {
            // Check if this span or its parent is in a selected/active state
            const parent = span.closest('button, label, [role="button"], [data-option-value], .swatch, [class*="option"]');
            if (parent) {
              const isSelected = 
                parent.classList.contains('selected') ||
                parent.classList.contains('active') ||
                parent.classList.contains('is-selected') ||
                parent.getAttribute('aria-checked') === 'true' ||
                parent.getAttribute('data-selected') === 'true';
              
              // Also check by border/background color for Rio theme
              const style = window.getComputedStyle(parent);
              const borderColor = style.borderColor;
              const rgb = borderColor?.match(/\d+/g);
              const isDarkBorder = rgb && parseInt(rgb[0]) < 100;
              
              if (isSelected || isDarkBorder) {
                log('Size from selected span label:', text);
                rawSize = text;
                break;
              }
            }
          }
        }
      }
      
      // Priority 3: Look for a "Size:" label followed by the selected value
      if (!rawSize || rawSize.length < 4) {
        const sizeLabels = document.querySelectorAll('[class*="size" i], [data-option-name*="size" i]');
        for (const label of sizeLabels) {
          // Look for the selected value text after the label
          const siblingText = label.nextElementSibling?.textContent?.trim() || 
                             label.querySelector('.selected, .active, [aria-checked="true"]')?.textContent?.trim() ||
                             label.textContent?.trim();
          if (siblingText && siblingText.match(/\d+["']?\s*[x×]\s*\d+["']?/i)) {
            log('Size from size label sibling:', siblingText);
            rawSize = siblingText;
            break;
          }
        }
      }
      
      // Look for checked radio inputs for size
      if (!rawSize || rawSize.length < 4) {
        const sizeRadio = document.querySelector('input[type="radio"][name*="size" i]:checked, input[type="radio"][name*="Size"]:checked');
        if (sizeRadio) {
          // Get the label text for this radio
          const label = document.querySelector(`label[for="${sizeRadio.id}"]`);
          const labelText = label?.textContent?.trim() || sizeRadio.value;
          if (labelText && labelText.match(/\d.*[x×].*\d/i)) {
            log('Size from radio label:', labelText);
            rawSize = labelText;
          }
        }
      }
      
      // Look for selected size buttons (pill buttons, etc.)
      if (!rawSize || rawSize.length < 4) {
        // Find buttons that look like size options
        const allButtons = document.querySelectorAll('button, [role="button"], .swatch, [data-option-value]');
        for (const btn of allButtons) {
          const text = btn.textContent?.trim() || '';
          // Check if this looks like a size (has dimensions with x)
          if (text.match(/\d+["']?\s*[x×]\s*\d+["']?/i)) {
            // Check if this button is selected (various methods)
            const isSelected = 
              btn.classList.contains('selected') ||
              btn.classList.contains('active') ||
              btn.getAttribute('aria-checked') === 'true' ||
              btn.getAttribute('data-selected') === 'true' ||
              btn.hasAttribute('disabled'); // Sometimes selected options are disabled
            
            // Also check by border color (Rio theme uses dark border for selected)
            const style = window.getComputedStyle(btn);
            const borderColor = style.borderColor;
            const rgb = borderColor.match(/\d+/g);
            const isDarkBorder = rgb && parseInt(rgb[0]) < 100;
            
            if (isSelected || isDarkBorder) {
              log('Size from selected button:', text);
              rawSize = text;
              break;
            }
          }
        }
      }
    }

    // Get variant selectors (may override container values)
    const sizeSelect = document.querySelector('[data-option="Size"], select[name*="size" i], [data-variant-option*="size" i]');
    const frameSelect = document.querySelector('[data-option="Frame"], select[name*="frame" i], [data-variant-option*="frame" i]');
    const mountSelect = document.querySelector('[data-option="Mount"], select[name*="mount" i], [data-variant-option*="mount" i]');
    
    // Prefer the full display text over abbreviated value (only if we get a valid value)
    if (sizeSelect) {
      const selectedOption = sizeSelect.options?.[sizeSelect.selectedIndex];
      const selectSize = selectedOption?.text || selectedOption?.textContent || sizeSelect.value || '';
      log('Size from select - text:', selectedOption?.text, 'value:', sizeSelect.value, 'found:', selectSize);
      // Only override if we got a valid size from the select
      if (selectSize && selectSize.match(/\d/)) {
        rawSize = selectSize;
        log('Using size from select:', rawSize);
      }
    }
    
    // Also check for button-style size selectors (some themes use buttons instead of dropdowns)
    if (!sizeSelect || !rawSize || rawSize === '30x40cm') {
      // Look for size buttons - find container with "size" in class/data, then find selected button
      const sizeContainers = document.querySelectorAll('[class*="size" i], [data-option-name*="size" i]');
      for (const container of sizeContainers) {
        // Look for selected button (usually has aria-checked, data-selected, or specific border)
        const selectedBtn = container.querySelector('[aria-checked="true"], [data-selected="true"], .selected, .active');
        if (selectedBtn) {
          const btnText = selectedBtn.textContent?.trim() || selectedBtn.getAttribute('data-option-value') || '';
          if (btnText && btnText.match(/\d/)) { // Has a number, likely a size
            rawSize = btnText;
            log('Size from button selector:', rawSize);
            break;
          }
        }
      }
    }
    
    if (frameSelect) {
      const selectedOption = frameSelect.options?.[frameSelect.selectedIndex];
      const selectFrame = selectedOption?.text || selectedOption?.textContent || frameSelect.value || '';
      log('Frame from select - text:', selectedOption?.text, 'value:', frameSelect.value, 'found:', selectFrame);
      // Only override if we got a valid frame from the select
      if (selectFrame && selectFrame.length > 0) {
        rawFrame = selectFrame;
        log('Using frame from select:', rawFrame);
      }
    }
    
    // Detect mount from Shopify variant selector (primary method)
    if (mountSelect?.value) {
      const mountValue = mountSelect.value.toLowerCase().trim();
      if (mountValue === 'yes' || mountValue === 'with mount' || mountValue === 'mounted') {
        mount = '1';
      } else if (mountValue === 'no' || mountValue === 'without mount' || mountValue === 'unmounted') {
        mount = '0';
      }
    }
    
    // Check for hidden selects in mount-related containers
    if (mount === '0') {
      const allSelects = document.querySelectorAll('select');
      for (const sel of allSelects) {
        const container = sel.closest('[class*="mount" i], [data-option-name*="mount" i]');
        if (container || sel.name?.toLowerCase().includes('mount')) {
          if (sel.value?.toLowerCase() === 'yes') {
            mount = '1';
            break;
          }
        }
      }
    }
    
    // Detect mount from pill buttons (Rio theme style - dark border = selected)
    if (mount === '0') {
      const allOptionButtons = document.querySelectorAll('[data-option-value]');
      const yesNoButtons = Array.from(allOptionButtons).filter(btn => {
        const val = btn.getAttribute('data-option-value')?.toLowerCase();
        return val === 'yes' || val === 'no';
      });
      
      if (yesNoButtons.length >= 2) {
        for (const btn of yesNoButtons) {
          const btnValue = btn.getAttribute('data-option-value')?.toLowerCase();
          const computedStyle = window.getComputedStyle(btn);
          const borderColor = computedStyle.borderColor || computedStyle.borderTopColor || '';
          const borderMatch = borderColor.match(/rgb\s*\(\s*(\d+)/i);
          const borderRed = borderMatch ? parseInt(borderMatch[1]) : 255;
          
          // Dark border (< 100) indicates selected
          if (borderRed < 100 && btnValue === 'yes') {
            mount = '1';
            break;
          }
        }
      }
    }
    
    const titleElement = document.querySelector('.product-title, h1.title, [data-product-title], .product__title');
    if (titleElement) title = titleElement.textContent?.trim() || title;

    // Detect Globo box frame upgrade
    // Box frame uses the same color as the selected main frame
    const boxFrameDetected = detectGloboBoxFrame();
    if (DEBUG_MODE) {
      console.log('[EastSide AR] BOX FRAME CHECK:', boxFrameDetected ? 'DETECTED' : 'Not selected');
    }
    if (frameType === 'standard' && boxFrameDetected) {
      frameType = 'box';
      log('Box frame upgrade applied: frameType=box, using selected frame color:', rawFrame);
      if (DEBUG_MODE) {
        console.log('[EastSide AR] BOX FRAME APPLIED - Frame type changed to "box", color:', rawFrame);
      }
    }
    
    // Normalize mount value from "Yes"/"No" to "1"/"0"
    const mountLower = (mount || '').toLowerCase().trim();
    if (mountLower === 'yes') {
      mount = '1';
    } else if (mountLower === 'no' || mountLower === '') {
      mount = '0';
    }
    
    // Fallback: Detect mount selection if not already set by variant
    if (mount === '0') {
      const mountDetected = detectGloboMount();
      if (mountDetected) {
        mount = '1';
      }
    }

    // Apply mappings
    const size = mapSize(rawSize);
    const frame = mapFrame(rawFrame);

    log('Final config:', { imageUrl, size, frame, title, mount, frameType, scaleByWidth });
    
    // Warn if no image URL found
    if (!imageUrl) {
      log('WARNING: No image URL found! Check data attributes on container.');
      // Try to find any image on the page as fallback
      const productImage = document.querySelector('.product-featured-image img, .product__main-image img, [data-product-image], .product-single__photo img');
      if (productImage) {
        imageUrl = productImage.src || productImage.dataset.src;
        log('Fallback: Using product image from page:', imageUrl);
        scaleByWidth = true;  // Product images likely don't match exact ratio
      }
    }
    
    return { imageUrl, size, frame, title, mount, frameType, scaleByWidth };
  }

  // Open AR viewer - USDZ for iOS Quick Look, Scene Viewer for Android
  // Build Google Scene Viewer intent URL for Android
  function buildSceneViewerIntent(glbUrl, title) {
    // Scene Viewer intent format (same as House of Spoils uses)
    const fallbackUrl = window.location.href;
    const params = new URLSearchParams({
      file: glbUrl,
      mode: 'ar_preferred',
      disable_occlusion: 'true',
      title: title || 'Artwork'
    });
    
    // Build the intent URL
    const intentUrl = `intent://arvr.google.com/scene-viewer/1.2?${params.toString()}#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
    
    return intentUrl;
  }
  
  function openARViewer(productConfig) {
    let imageUrl = productConfig.imageUrl;
    if (imageUrl && imageUrl.startsWith('//')) {
      imageUrl = 'https:' + imageUrl;
    }
    
    // Strip Shopify CDN resize parameters and request original PNG format
    // These params (width, height, crop, etc.) cause Shopify to serve compressed versions
    if (imageUrl) {
      try {
        const url = new URL(imageUrl);
        url.searchParams.delete('width');
        url.searchParams.delete('height');
        url.searchParams.delete('crop');
        // For files ending in .png, explicitly request PNG format to prevent auto-JPEG conversion
        if (url.pathname.toLowerCase().endsWith('.png')) {
          url.searchParams.set('format', 'png');
          log('Requesting PNG format explicitly for PNG source file');
        } else {
          url.searchParams.delete('format');
        }
        imageUrl = url.toString();
        log('Cleaned image URL:', imageUrl);
      } catch (e) {
        log('Could not parse image URL:', e);
      }
    }
    
    const params = new URLSearchParams({
      imageUrl: imageUrl,
      size: productConfig.size,
      frame: productConfig.frame,
      title: productConfig.title,
      mount: productConfig.mount || '0',
      frameType: productConfig.frameType || 'standard',
      scaleByWidth: productConfig.scaleByWidth ? '1' : '0',
      _t: Date.now().toString(), // Cache bust to ensure fresh model generation
    });

    const glbUrl = `${AR_VIEWER_BASE_URL}/api/ar/generate?${params.toString()}`;
    const usdzUrl = `${AR_VIEWER_BASE_URL}/api/ar/model.usdz?${params.toString()}`;
    const launchUrl = `${AR_VIEWER_BASE_URL}/api/ar/launch?${params.toString()}`;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/i.test(navigator.userAgent);
    
    log('Device detection - iOS:', isIOS, 'Android:', isAndroid);
    
    if (isIOS) {
      // iOS: Direct link to USDZ file for native Quick Look
      // For inline Quick Look (no navigation), the link must be VISIBLE with a child <img>
      log('Opening iOS Quick Look with USDZ:', usdzUrl);
      
      // Track AR launch
      trackEvent('ar_launch_ios', productConfig);
      
      // Update cart with AR session for conversion tracking
      updateCartWithArSession(productConfig.handle || window.location.pathname.split('/products/')[1]?.split('?')[0]);
      
      // Create a visible anchor with a transparent image child
      // This triggers iOS Safari's native Quick Look overlay behavior
      const link = document.createElement('a');
      link.rel = 'ar';
      link.href = usdzUrl;
      link.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;';
      
      // Quick Look requires a visible child <img> element to trigger as overlay
      const img = document.createElement('img');
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      img.style.cssText = 'width:1px;height:1px;opacity:0.01;';
      link.appendChild(img);
      
      document.body.appendChild(link);
      
      // Trigger click
      link.click();
      
      // Cleanup after delay
      setTimeout(() => link.remove(), 5000);
      
    } else if (isAndroid) {
      // Android: Use Scene Viewer intent directly (GLB should be pre-generated)
      log('=== Android AR Launch ===');
      log('User Agent:', navigator.userAgent);
      log('Product config:', JSON.stringify(productConfig));
      
      // Track AR launch
      trackEvent('ar_launch_android', productConfig);
      log('Analytics event sent: ar_launch_android');
      
      // Update cart with AR session for conversion tracking
      updateCartWithArSession(productConfig.handle || window.location.pathname.split('/products/')[1]?.split('?')[0]);
      
      // Build Scene Viewer intent URL
      const sceneViewerUrl = buildSceneViewerIntent(glbUrl, productConfig.title);
      log('Scene Viewer Intent URL:', sceneViewerUrl);
      
      // Open Scene Viewer directly
      window.location.href = sceneViewerUrl;
    } else {
      // Desktop: Show modal with 3D viewer and QR code
      log('Opening desktop AR modal');
      
      // Track desktop viewer launch
      trackEvent('ar_launch_desktop', productConfig);
      
      showDesktopARModal(productConfig, glbUrl);
    }
  }

  // Create and show the desktop AR modal with 3D viewer and QR code
  function showDesktopARModal(productConfig, glbUrl) {
    // Remove any existing modal
    const existingModal = document.getElementById('eastside-ar-modal');
    if (existingModal) existingModal.remove();

    // Get the current product page URL for the QR code (add tracking parameter)
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('ar_qr', '1'); // Track QR code scans
    const productPageUrl = currentUrl.toString();
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(productPageUrl)}`;

    // Create modal container
    const modal = document.createElement('div');
    modal.id = 'eastside-ar-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      font-family: inherit;
    `;

    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: #fff;
      border-radius: 16px;
      max-width: 900px;
      width: 90%;
      max-height: 90vh;
      display: flex;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      position: relative;
    `;

    // Left side - 3D Model Viewer
    const modelSection = document.createElement('div');
    modelSection.style.cssText = `
      flex: 1;
      min-width: 400px;
      min-height: 500px;
      background: #e8e8e8;
      position: relative;
    `;

    // Add loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      z-index: 10;
    `;
    loadingIndicator.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" style="animation: spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
        <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
      </svg>
      <span style="color: #666; font-size: 14px; font-weight: 500;">Creating 3D Model...</span>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    `;
    modelSection.appendChild(loadingIndicator);

    // Load model-viewer and create the 3D viewer
    loadModelViewer().then(() => {
      const modelViewer = document.createElement('model-viewer');
      modelViewer.setAttribute('src', glbUrl);
      modelViewer.setAttribute('alt', productConfig.title || 'Framed Artwork');
      modelViewer.setAttribute('camera-controls', '');
      modelViewer.setAttribute('shadow-intensity', '2');
      modelViewer.setAttribute('shadow-softness', '0.5');
      modelViewer.setAttribute('environment-image', 'neutral');
      modelViewer.setAttribute('exposure', '0.9');
      modelViewer.setAttribute('interaction-prompt', 'none');
      modelViewer.setAttribute('camera-orbit', '0deg 75deg auto');
      // Enable high-DPI rendering for sharper edges
      modelViewer.setAttribute('pixel-ratio', String(window.devicePixelRatio || 2));
      modelViewer.style.cssText = `
        width: 100%;
        height: 100%;
        min-height: 500px;
      `;
      modelSection.appendChild(modelViewer);
      
      // Add custom hand icon overlay (hidden until model loads)
      const handIcon = document.createElement('img');
      handIcon.src = AR_VIEWER_BASE_URL + '/hand-icon.png';
      handIcon.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 64px;
        height: 64px;
        opacity: 0;
        pointer-events: none;
        transition: transform 0.4s ease-out, opacity 0.3s;
        z-index: 5;
      `;
      modelSection.appendChild(handIcon);
      
      // Animation: smooth left/right swing, then continuous rotation until user interacts
      let userInteracted = false;
      let rotationAngle = 0;
      let autoRotateInterval = null;
      
      // Phase 1: Smooth left-right swing with hand
      const swingAngles = [0, -25, 25, -15, 15, 0];
      const handOffsets = [0, 35, -35, 20, -20, 0];
      let swingStep = 0;
      
      const animateSwing = () => {
        if (swingStep < swingAngles.length && !userInteracted) {
          modelViewer.setAttribute('camera-orbit', `${swingAngles[swingStep]}deg 75deg auto`);
          handIcon.style.transform = `translate(calc(-50% + ${handOffsets[swingStep]}px), -50%)`;
          swingStep++;
          setTimeout(animateSwing, 400);
        } else if (!userInteracted) {
          // Fade out hand, start continuous rotation
          handIcon.style.opacity = '0';
          setTimeout(() => handIcon.remove(), 300);
          startAutoRotation();
        }
      };
      
      // Phase 2: Continuous slow rotation
      const startAutoRotation = () => {
        if (userInteracted) return;
        autoRotateInterval = setInterval(() => {
          if (userInteracted) {
            clearInterval(autoRotateInterval);
            return;
          }
          rotationAngle += 0.5;
          modelViewer.setAttribute('camera-orbit', `${rotationAngle}deg 75deg auto`);
        }, 50);
      };
      
      // Stop animation on user interaction
      const stopAnimation = () => {
        userInteracted = true;
        if (autoRotateInterval) clearInterval(autoRotateInterval);
        handIcon.style.opacity = '0';
      };
      
      modelViewer.addEventListener('pointerdown', stopAnimation);
      modelViewer.addEventListener('touchstart', stopAnimation);
      modelViewer.addEventListener('wheel', stopAnimation);
      
      // Start animation after model loads
      modelViewer.addEventListener('load', () => {
        // Hide loading indicator
        loadingIndicator.style.display = 'none';
        // Log timing
        if (window._arClickTime) {
          const loadTime = performance.now() - window._arClickTime;
          log(`[TIMING] Model loaded in ${loadTime.toFixed(0)}ms from button click`);
          if (DEBUG_MODE) console.log(`[EastSide AR] PERFORMANCE: Model visible in ${loadTime.toFixed(0)}ms`);
        }
        // Show hand icon and start animation
        handIcon.style.opacity = '0.8';
        setTimeout(animateSwing, 500);
      });
      
      // Add 3D cube icon (bottom left)
      const cubeIcon = document.createElement('img');
      cubeIcon.src = AR_VIEWER_BASE_URL + '/cube-icon.png';
      cubeIcon.style.cssText = `
        position: absolute;
        bottom: 16px;
        left: 16px;
        width: 32px;
        height: 32px;
        opacity: 0.6;
        pointer-events: none;
      `;
      modelSection.appendChild(cubeIcon);
    }).catch(err => {
      log('Failed to load model-viewer:', err);
      modelSection.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #666;">
          <p>Unable to load 3D viewer</p>
        </div>
      `;
    });

    // Right side - QR Code section
    const qrSection = document.createElement('div');
    qrSection.style.cssText = `
      width: 320px;
      padding: 40px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      background: #fff;
    `;

    qrSection.innerHTML = `
      <h2 style="
        font-size: 24px;
        font-weight: 600;
        color: #1a1a1a;
        margin: 0 0 24px 0;
        line-height: 1.3;
      ">See It In Your Space</h2>
      
      <div style="
        padding: 16px;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        margin-bottom: 24px;
      ">
        <img 
          src="${qrCodeUrl}" 
          alt="QR Code to view in AR"
          style="width: 200px; height: 200px; display: block;"
        />
      </div>
      
      <p style="
        font-size: 15px;
        color: #666;
        margin: 0;
        line-height: 1.6;
        max-width: 240px;
      ">Scan the QR code to see how this artwork looks in your space.</p>
    `;

    // Close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    closeButton.style.cssText = `
      position: absolute;
      top: 16px;
      right: 16px;
      background: rgba(255, 255, 255, 0.9);
      border: none;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 10;
      transition: background 0.2s;
    `;
    closeButton.addEventListener('mouseenter', () => {
      closeButton.style.background = '#fff';
    });
    closeButton.addEventListener('mouseleave', () => {
      closeButton.style.background = 'rgba(255, 255, 255, 0.9)';
    });

    // Unified close function to clean up properly
    const handleEscape = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    
    const closeModal = () => {
      document.removeEventListener('keydown', handleEscape);
      modal.remove();
    };
    
    closeButton.addEventListener('click', closeModal);

    // Assemble modal - close button inside modalContent for proper positioning
    modalContent.appendChild(modelSection);
    modalContent.appendChild(qrSection);
    modalContent.appendChild(closeButton);
    modal.appendChild(modalContent);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Close on Escape key
    document.addEventListener('keydown', handleEscape);

    document.body.appendChild(modal);
  }

  // Create and inject AR button
  function createARButton(container) {
    // Create wrapper for centering
    const wrapper = document.createElement('div');
    wrapper.className = 'eastside-ar-wrapper';
    wrapper.style.cssText = `
      display: flex;
      justify-content: center;
      width: 100%;
      padding: 8px 0;
    `;
    
    const button = document.createElement('button');
    button.className = 'eastside-ar-button';
    // Inline cube icon as data URL for reliable loading
    const cubeIconDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGcAAABmCAYAAADWHY9cAAAACXBIWXMAABcRAAAXEQHKJvM/AAAJpUlEQVR4nO1d/5XjuA3+uC//nztYpYJzB6tUEKeC01UQp4J4K4ivgugqOG8F0XbgrSDaCmJXgPxB2qOhQImkCJIzd3hPb8aSTYL8AAgE+EMREWompVQDYG8uALgQ0bUYQxlJ1QaOAaMFcDB/f2C+9mciGnPxVIr+VJoB4AnIAUAH4EePnxwAnAV4aADcatHMouAopTpoQD4F/jRp5ymlWgD/mXz+Bg3+hYhuKesKIiLKegHYATgBGAFQ4HUFcBLgqXfUd4MGqcndT0SUD5wJKDdPIG4ALgCOAFph3s4e/PQAdu8OHGjT5QPKQ1JFwXAIztWTv9O7AAfa/R08Gn0BcMgJyAK/vYcgjTkESLKhJ08taUqDwvDua4IvkqZOSvrWTMQpt/0WBElMi1I35rDSkEuNmuIJ0prTcKwdHNf7JYuNzgDSmlXoU1qED5CnXwDsiWjIUJcoEdGViPYAPju+8hOAQSm1S1Ff0tiaUuqGl1jYHUBHRJdkFVRESqk9tJn+yDz+Bm0pNkUXUoPT4OUFeqbI4KQJpwDAdWsDJcloSA/gr8zjOzRA0aGmqqLSJtZ2wlwav0IDfoV+f42oCDilVA9t0my6QztAUXxWA44xEwP4FMESVQGcEax/M4+iTVwV4BjzcAVvv7dQVuAWAPpMRKfQ8qrI50Db7dTAAC+piFfvBKUUIAAcEfWmbBugt2nWlFInAP9kHv0MPfjbQWdEd/BLxKWgTcAxGvSXmKFEUXCUUgcAvzGP/kFEbKZzkrHcIy9wQUMD43EeoUE+vql3junkK+YOwBciOmwos4EccN+JqElU1ioVAcc4AAPmnZZk8Oaos0Ea4P6Wa2BdCpwe83HB5kHbBn4avAaug9tBidbsYCoQPDyCDxoWT7YZ/hqs53GaHLzkCHw+yQw0/8U8+qWGGJwxtxesD4Q7eW4ymjXT8BHzhn8lojYLEyu0YG5veG3msjgGOTVnwByY79AJuuKklDqCj4910IPkKX00wwBZymTHXVnEfel3jOFv7+DvPHkPzbK64nwtMJuk46Alj2t4VxoUw98OvAMwWN+7MN9psoKD17MfN0mHAZlreF8alAmPXNp5hJVuhja/9vdO2cCBHpglMT1GIkemvGtpQCY8Bplbpj2jJH+2Q9AhHfWYD+TuqMcB6AD8nXn0M7kHwr31+aMpR4YsSbdNUJSUwz2hsC2tLYa/KHML3jEYxPicVNwxFXcRDedsM0FgXlckMJvMLTI6BmuVBs3Bgjv0Ie52BvDItfPm28EO4TtLg2N3alCHwj1T/xoKsiAwScwto3k3MXDAe2ldIMO9QyJrGWgmM7cOkIP6KwQcrrImgNm3GmmOMrdI7BgYwRmMyX0K8+PhYJuigIIXQx+lLylzi0SOAdN/ow2OXUkf0PDV0EdhcETMrcNMBgskeC+5Mc9Yye88C/YKfRQERtTcIoFjAP59fyDSEYIGc1pNFSulzuDz7weqYJpspsReb33+ITRiQPyUqf3jnxMs5CJVUcRjiZToLOYWiRwDzC3Qxdyf2eTRgyFXjn2Edi7OBvQWBVxp8Iu4RgiYWyRwDBh+hwc47IOFgloHMGtXFuCQObGHBI4B5tbr5gKnFwJHHDgUMrfY6Bgw4NADHNtEnSKYkby8gEPBxB7XuSECwQnVAxy7UB9wOGYeHThkBG8KHDvQlAbG9EfD9UfA71vm97tYcLyYMdLcGjBzA+cdaU4EULRj4ACnjVqfQ0SjUuoLXq97+aSUamiyDpReMoqDXYYZh0znLO+hQf8YwxNDB8q7YV6P+drQo7miKVhzDNpieQ1ooA7QGtdDg7s2RTa7OWP4Hi0+vBwDODQnGpwtzGzsgNYTOC+Tkpi3E8NHVwqcKGYEOiVbdnKFj4bhY4gBh0jH1r4jnnrmXrehvCgiHSuz21GCjxHAF+v2J7PEZIla7uYHaNM0pT3zvdTMSFBvfQ4OQgrxAUROB/uAyJW+E+qZe5s8lEjqmXtdTgbMSooT82gtyr+zPj+tgG2vg3MdKOAYOPjIPp/Zqr9n6l8db8EV+Jy8yNrYhoBPanUFwCnmGDj6wEvYMfc2+yc4CRjbMUwNucExvGTXYmyYR+HouxNRomWHpDOfv1q3fxeOwWRluE1ficjn3cs5YAOQdmVbz9wr4RicmXudYH0Dtq3Ya5l72oF46ybFwUePualoBOrZnNjD3BkYH89Srwm1pbamsUZSLY5cQmKXscP8HIfh+V9iSfpdOAZIlNgD7112z+cCndIzFTYFwBFx77EwgzRRXz0noUh0SstUWCIIKaLF2LiExCrL1r5X/El1jJhJCeQjqRYj4Yo98JNRXq14kOqUWiIGybTYUdasQwPKG5ZMmiQ4nEl5U9lJq4yGMUGEtEtIZmVJdgpnUkrM/tykxRBYQuLom1kMTrJTODPQFwBnk2Pg6MjoJSQOrRnZ7wp3zMykxErbRj6itBjuGaTRS0gcvHQlwKnZMehXfpN8xZ5Da5zvQOlOqdoxcGkxhJaQOITE6e2J7rdGfCrhRzOhMDfN4n5wR44vkNkbzp4S8I0cWzQDkNWcBWlZNCkltRjCS0gMwBd4jI98C9xDD5pOiNtyZcTcpLTIHHPDimOAylbs+TbKfrGHLg5y5defEjwB/ygF3JIWo8K94bw2YHVsTOq9+bXJW/zP57sMfYPutAGT8wUo/uCkEa8ny9+hgbmA2YSc9DFgZchT4jg7HDQQc5Sx9QrWOPBaPDral1x7JTTnMYlh0/b2Zgdabvm5BE01bjTXI0Ppo8VRJ3ekJO99pRdOhgo+f8CA/ViP0+Blm/pPvmVspDuWN/aOOowoNQVt+r1wpEqyAyIqAC7fWQUrFLwju8TZZAF1SwMn3oYQitouf+F0v2KNSwBcsVNIXBR9lsEKQF1VjVwHrsoDZzcdNLFyPmZ1jX1rtCnwSUQd5oFNQHtCv5mdpf6gSEpyRMuCkwBUaObeCiU7P8e42T3c44fP0DG5KjyhGDJC2EDndQbxClOGG6BftNxkiGmYpIpNWQPb1TLtGsXrFWjIDutxtAGVbJ3vAcrgaEP/5sCxGjaugFTFDrqBoDwu8e3/pRu5pkVFpuk6eG2gI9ZrAkXQ6QXxWUQ5G85J4lgYkL0BZOk9Wcwc5+6Mqbm4IO8y9J2p/2jq9tGQqSPT5Rae4qe6pyZzYHdrPj7+7rF+9idHX6Hfi0UiHe8KHLN6+78bi7lDj9fOlHe/thlFbYZXMXWRv7tDm7pLKS3h6L2BM3p+7w797hugR/tVhpbelVkDntv4d9BAPUJFw+TvWNpc+dL/ARH4RYoPZwCwAAAAAElFTkSuQmCC';
    
    button.innerHTML = `
      <img src="${cubeIconDataUrl}" alt="AR" width="20" height="20" style="flex-shrink: 0; display: inline-block;" />
      <span style="display: inline-block; margin-left: 5px;">See It In Your Space</span>
    `;

    button.style.cssText = `
      display: inline-flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: 0px;
      padding: 0px 0;
      background: transparent;
      color: #000;
      border: none;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
      text-decoration: none;
      font-family: inherit;
      white-space: nowrap;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.opacity = '0.7';
    });
    button.addEventListener('mouseleave', () => {
      button.style.opacity = '1';
    });

    button.addEventListener('click', (e) => {
      try {
        e.preventDefault();
        e.stopPropagation();
        
        // Start timing
        window._arClickTime = performance.now();
        log(`[TIMING] Button clicked at ${window._arClickTime.toFixed(0)}ms`);
        
        const productConfig = getProductConfig();
        
        log('Button clicked, productConfig:', productConfig);
        
        // Track button click
        trackEvent('ar_button_click', productConfig);
        
        if (!productConfig.imageUrl) {
          if (DEBUG_MODE) console.error('[EastSide AR] No artwork image URL found.');
          alert('AR preview not available for this product.');
          return;
        }

        log('Opening AR viewer...');
        openARViewer(productConfig);
      } catch (err) {
        if (DEBUG_MODE) console.error('[EastSide AR] Button click error:', err);
        log('Button click error:', err.message, err.stack);
      }
    });

    wrapper.appendChild(button);
    container.appendChild(wrapper);
    return button;
  }

  // Track pre-generated GLB URLs for Android Scene Viewer
  const preloadedGLBs = new Map();
  
  // Prefetch GLB for desktop - pre-generates model for faster modal loading
  function prefetchGLBForDesktop(productConfig) {
    if (!productConfig.imageUrl) return;
    
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isIOS || isAndroid) return; // Only for desktop
    
    let imageUrl = productConfig.imageUrl;
    if (imageUrl && imageUrl.startsWith('//')) {
      imageUrl = 'https:' + imageUrl;
    }
    
    const params = new URLSearchParams({
      imageUrl: imageUrl,
      size: productConfig.size,
      frame: productConfig.frame,
      title: productConfig.title,
      mount: productConfig.mount || '0',
      frameType: productConfig.frameType || 'standard',
      scaleByWidth: productConfig.scaleByWidth ? '1' : '0',
    });
    
    const glbUrl = `${AR_VIEWER_BASE_URL}/api/ar/generate?${params.toString()}`;
    
    log('Prefetching GLB for desktop:', glbUrl);
    
    // Use HEAD request to trigger server-side generation and caching
    fetch(glbUrl, { method: 'HEAD' })
      .then(response => {
        if (response.ok) {
          // Capture generation time from server response header
          const genTime = response.headers.get('X-Generation-Time');
          if (genTime) {
            lastGenerationTimeMs = parseInt(genTime) || null;
            log('Desktop GLB prefetch complete - generation time:', genTime + 'ms');
          } else {
            log('Desktop GLB prefetch complete - model cached');
          }
        } else {
          log('Desktop GLB prefetch failed:', response.status);
        }
      })
      .catch(err => {
        log('Desktop GLB prefetch error:', err);
      });
  }
  
  // Prefetch USDZ in background so it's ready when user taps AR button (iOS only)
  function prefetchUSDZ(productConfig) {
    if (!productConfig.imageUrl) return;
    
    // Only prefetch USDZ on iOS - other devices use GLB
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (!isIOS) return;
    
    let imageUrl = productConfig.imageUrl;
    if (imageUrl && imageUrl.startsWith('//')) {
      imageUrl = 'https:' + imageUrl;
    }
    
    const params = new URLSearchParams({
      imageUrl: imageUrl,
      size: productConfig.size,
      frame: productConfig.frame,
      title: productConfig.title,
      mount: productConfig.mount || '0',
      frameType: productConfig.frameType || 'standard',
      scaleByWidth: productConfig.scaleByWidth ? '1' : '0',
    });
    
    const usdzUrl = `${AR_VIEWER_BASE_URL}/api/ar/model.usdz?${params.toString()}`;
    
    log('Prefetching USDZ in background:', usdzUrl);
    
    // Use fetch to trigger server-side generation and caching
    fetch(usdzUrl, { method: 'HEAD' })
      .then(response => {
        if (response.ok) {
          const genTime = response.headers.get('X-Generation-Time');
          if (genTime) {
            lastGenerationTimeMs = parseInt(genTime) || null;
            log('USDZ prefetch complete - generation time:', genTime + 'ms');
          } else {
            log('USDZ prefetch complete - ready for instant AR');
          }
        } else {
          log('USDZ prefetch failed:', response.status);
        }
      })
      .catch(err => {
        log('USDZ prefetch error:', err);
      });
  }
  
  // Prefetch GLB for Android - generates model and marks button as ready
  function prefetchGLB(productConfig, button) {
    if (!productConfig.imageUrl) return;
    
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (!isAndroid) return;
    
    let imageUrl = productConfig.imageUrl;
    if (imageUrl && imageUrl.startsWith('//')) {
      imageUrl = 'https:' + imageUrl;
    }
    
    const params = new URLSearchParams({
      imageUrl: imageUrl,
      size: productConfig.size,
      frame: productConfig.frame,
      title: productConfig.title,
      mount: productConfig.mount || '0',
      frameType: productConfig.frameType || 'standard',
      scaleByWidth: productConfig.scaleByWidth ? '1' : '0',
    });
    
    const glbUrl = `${AR_VIEWER_BASE_URL}/api/ar/generate?${params.toString()}`;
    const cacheKey = params.toString();
    
    // Hide button while loading on Android
    if (button) {
      button.dataset.arReady = 'false';
      button.style.display = 'none';
    }
    
    log('Prefetching GLB for Android:', glbUrl);
    
    // Fetch the GLB to trigger generation and caching
    fetch(glbUrl, { method: 'HEAD' })
      .then(response => {
        if (response.ok) {
          const genTime = response.headers.get('X-Generation-Time');
          if (genTime) {
            lastGenerationTimeMs = parseInt(genTime) || null;
            log('GLB prefetch complete - Android AR ready, generation time:', genTime + 'ms');
          } else {
            log('GLB prefetch complete - Android AR ready');
          }
          preloadedGLBs.set(cacheKey, glbUrl);
          
          // Show button when ready
          if (button) {
            button.dataset.arReady = 'true';
            button.style.display = '';
          }
        } else {
          log('GLB prefetch failed:', response.status);
          // Still show button - will fall back to model-viewer page
          if (button) {
            button.dataset.arReady = 'fallback';
            button.style.display = '';
          }
        }
      })
      .catch(err => {
        log('GLB prefetch error:', err);
        // Still show button - will fall back to model-viewer page
        if (button) {
          button.dataset.arReady = 'fallback';
          button.style.display = '';
        }
      });
  }

  // Update widget visibility based on frame selection and image availability
  function updateWidgetVisibility(container, triggerPrefetch = false) {
    const button = container.querySelector('.eastside-ar-button');
    if (!button) return;
    
    // Get current product config to check frame and image
    const productConfig = getProductConfig(container);
    const isUnframed = productConfig.frame === 'unframed';
    const imageUrl = productConfig.imageUrl || '';
    const hasValidImage = imageUrl.trim() !== '' &&
                          !imageUrl.includes('undefined') &&
                          !imageUrl.includes('null') &&
                          !imageUrl.toLowerCase().includes('liquid error') &&
                          (imageUrl.startsWith('http') || imageUrl.startsWith('//'));
    
    if (!hasValidImage) {
      button.style.display = 'none';
      log('Widget hidden: No valid AR image URL');
    } else if (isUnframed) {
      button.style.display = 'none';
      log('Widget hidden: Unframed product selected');
    } else {
      button.style.display = '';
      log('Widget visible: Frame selected:', productConfig.frame, 'Image:', productConfig.imageUrl?.substring(0, 50) + '...');
      
      // For Android: re-prefetch GLB when variant changes
      if (triggerPrefetch) {
        const isAndroid = /Android/i.test(navigator.userAgent);
        if (isAndroid) {
          prefetchGLB(productConfig, button);
        }
      }
    }
  }

  // Initialize a single container
  function initContainer(container, index) {
    if (container.dataset.eastsideInitialized) {
      return;
    }

    let button = container.querySelector(config.buttonSelector);
    if (!button) {
      button = createARButton(container);
    }

    container.dataset.eastsideInitialized = 'true';
    
    // Check initial visibility (hide for unframed)
    updateWidgetVisibility(container);
    
    // For Android: prefetch GLB in background so Scene Viewer can launch instantly
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isAndroid && button) {
      const productConfig = getProductConfig(container);
      if (productConfig.imageUrl && productConfig.frame !== 'unframed') {
        prefetchGLB(productConfig, button);
      }
    }
    
    log('Initialized container', index !== undefined ? index + 1 : '');
  }

  // Initialize widget
  function init() {
    log('Initializing AR widget v' + WIDGET_VERSION);
    log('Size mappings:', Object.keys(SIZE_MAP).length, 'entries');
    log('Frame mappings:', Object.keys(FRAME_MAP).length, 'entries');

    const containers = document.querySelectorAll(config.containerSelector);
    
    if (containers.length === 0) {
      log('No containers found with selector:', config.containerSelector);
      return;
    }

    containers.forEach((container, index) => {
      initContainer(container, index);
    });

    // Watch for Shopify re-rendering the product section (variant changes)
    // This ensures the AR button is immediately re-added if the container is replaced
    const observer = new MutationObserver((mutations) => {
      // Check if our button still exists
      const existingButton = document.querySelector('.eastside-ar-button');
      if (!existingButton) {
        // Button was removed (likely by Shopify re-render), re-initialize
        const newContainers = document.querySelectorAll(config.containerSelector);
        newContainers.forEach((container, index) => {
          if (!container.dataset.eastsideInitialized) {
            log('Re-initializing container after DOM change');
            initContainer(container, index);
          }
        });
      } else {
        // Button exists, update visibility based on current frame selection
        const container = document.querySelector(config.containerSelector);
        if (container) {
          updateWidgetVisibility(container, true); // Re-prefetch GLB on Android
        }
      }
    });

    // Observe the product form area for changes
    const productForm = document.querySelector('form[action*="/cart/add"], .product-form, .product__form, [data-product-form], .shopify-product-form');
    if (productForm) {
      observer.observe(productForm, { childList: true, subtree: true });
      log('Watching product form for variant changes');
    } else {
      // Fallback: watch the entire body
      observer.observe(document.body, { childList: true, subtree: true });
      log('Watching body for DOM changes');
    }

    // Start prefetching models immediately for the current product config
    const productConfig = getProductConfig();
    if (productConfig.imageUrl) {
      // Small delay to let page finish loading
      setTimeout(() => {
        prefetchUSDZ(productConfig);      // For iOS
        prefetchGLBForDesktop(productConfig); // For desktop - speeds up modal loading
      }, 500);
    }

    // Also prefetch when variant changes and update visibility
    document.addEventListener('change', (e) => {
      if (e.target.matches('[data-option], select[name*="size" i], select[name*="frame" i], select[name*="mount" i], input[type="radio"]')) {
        log('Variant changed - updating visibility and prefetching new config');
        setTimeout(() => {
          const container = document.querySelector(config.containerSelector);
          if (container) {
            updateWidgetVisibility(container, true); // Re-prefetch GLB on Android
          }
          const newConfig = getProductConfig();
          if (newConfig.frame !== 'unframed') {
            prefetchUSDZ(newConfig);
            prefetchGLBForDesktop(newConfig); // For desktop - speeds up modal loading
          }
        }, 100);
      }
      
      // Watch for ESS addon widget checkbox changes (box frame, etc.)
      if (e.target.matches('.ess-addon-box input[type="checkbox"], #ess-addons-container input[type="checkbox"]')) {
        const addonBox = e.target.closest('.ess-addon-box');
        const addonName = addonBox?.querySelector('.ess-addon-name')?.textContent?.trim() || 'addon';
        log('Addon changed:', addonName, '| Checked:', e.target.checked);
        
        // Re-detect box frame and update config
        setTimeout(() => {
          const newConfig = getProductConfig();
          log('Updated config after addon change - frameType:', newConfig.frameType);
          
          // Re-prefetch with new frame type
          if (newConfig.frame !== 'unframed') {
            prefetchUSDZ(newConfig);
            prefetchGLBForDesktop(newConfig);
          }
        }, 100);
      }
    });

    // Watch for ESS addon widget toggle button clicks (mount Yes/No)
    document.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('.ess-toggle-btn');
      if (toggleBtn) {
        const fieldset = toggleBtn.closest('.ess-toggle-group');
        const title = fieldset?.querySelector('.ess-toggle-title')?.textContent?.trim() || '';
        const action = toggleBtn.dataset.toggleAction;
        log('ESS toggle clicked:', title, '| Action:', action);

        setTimeout(() => {
          const newConfig = getProductConfig();
          log('Updated config after toggle - mount:', newConfig.mount);

          if (newConfig.frame !== 'unframed') {
            prefetchUSDZ(newConfig);
            prefetchGLBForDesktop(newConfig);
          }
        }, 100);
      }
    });
  }

  // Listen for variant selection changes (Shopify specific)
  function watchVariantChanges() {
    const updateContainerData = (size, frame) => {
      const container = document.querySelector(config.containerSelector);
      if (container) {
        if (size) container.dataset.size = size;
        if (frame) container.dataset.frame = frame;
      }
    };

    document.addEventListener('variant:changed', (e) => {
      const variant = e.detail?.variant;
      if (variant) {
        log('Shopify variant changed:', variant);
        const options = variant.options || [];
        options.forEach(opt => {
          // Try to detect if it's a size or frame
          const normalizedOpt = normalize(opt);
          if (SIZE_MAP[normalizedOpt] || /^\d+x\d+/.test(normalizedOpt) || /^a\d/.test(normalizedOpt)) {
            updateContainerData(opt, null);
          } else if (FRAME_MAP[normalizedOpt]) {
            updateContainerData(null, opt);
          }
        });
      }
    });
  }

  // Expose API
  window.EastSideAR = {
    version: WIDGET_VERSION,
    init: init,
    openARViewer: openARViewer,
    getProductConfig: getProductConfig,
    supportsAR: supportsAR,
    mapSize: mapSize,
    mapFrame: mapFrame,
    updateWidgetVisibility: updateWidgetVisibility,
    SIZE_MAP: SIZE_MAP,
    FRAME_MAP: FRAME_MAP,
  };

  // Auto-initialize if configured
  if (config.autoInit) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        init();
        watchVariantChanges();
      });
    } else {
      init();
      watchVariantChanges();
    }
  }

  log('Widget loaded');
})();
