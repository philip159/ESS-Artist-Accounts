/**
 * East Side Studio - Product Add-ons Widget for Shopify
 * Version: 1.0.0
 * 
 * This widget displays product add-ons (Box Frame, Paper Upgrade, etc.)
 * and adds them to the cart alongside the main product.
 * 
 * Usage:
 * 1. Add container with optional metafield data attributes:
 *    <div id="ess-addons-container"
 *         data-product-id="{{product.id}}"
 *         data-meta-custom-has-mount="{{ product.metafields.custom.has_mount.value | default: 'No' }}">
 *    </div>
 *    Note: data-meta-{namespace}-{key} maps to metafield:{namespace}.{key} in conditions
 *    The widget also auto-detects metafields from Shopify page JSON data if available.
 * 2. Add script: <script src="https://your-domain.com/shopify-addons-widget.js"></script>
 * 3. Initialize: ESSAddons.init({ productId: '{{product.id}}' });
 */

(function() {
  'use strict';

  // Auto-detect API base from script src, fallback to production
  const ESS_API_BASE = (function() {
    const scripts = document.querySelectorAll('script[src*="shopify-addons-widget"]');
    if (scripts.length > 0) {
      const src = scripts[scripts.length - 1].src;
      const url = new URL(src);
      return url.origin;
    }
    return 'https://east-side-studio-london-ar.replit.app';
  })();
  
  const CONFIG = {
    containerSelector: '#ess-addons-container',
    variantSelector: 'select[name="id"], input[name="id"]:checked, [data-selected-variant]',
    formSelector: 'form[action*="/cart/add"]',
    currencySymbol: '£',
    debug: false
  };

  // Styles designed to match Shopify theme variant-picker patterns
  // Uses --input-height CSS variable for responsive scaling (mobile: 2.625rem/42px, desktop: 3.125rem/50px)
  const styles = `
    /* CSS variable fallbacks for themes that may not define --input-height */
    :root {
      --ess-input-height: var(--input-height, 3.125rem);
      --ess-input-height-mobile: 2.625rem;
      --ess-input-height-desktop: 3.125rem;
    }
    
    /* Container - matches variant-picker__option structure */
    .ess-addons {
      margin: 0;
      padding: 0;
      border: none;
      font-family: inherit;
    }
    
    /* Header - matches variant-picker__option-info */
    .ess-addons-header {
      display: flex;
      gap: 0.5rem;
      margin-block-end: var(--spacing-2);
    }
    
    .ess-addons-title {
      font-size: inherit;
      font-weight: 600;
      color: rgb(var(--text-color, 26 26 26));
      margin: 0;
    }
    
    .ess-addons-selected {
      font-weight: 400;
      color: rgb(var(--text-color, 26 26 26));
    }
    
    /* Accordion wrapper */
    .ess-addons-accordion {
      border: 1px solid rgba(var(--text-color, 26 26 26) / 0.2);
      border-radius: 0.5rem;
      overflow: hidden;
    }
    
    .ess-addons-accordion-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      height: 2.625rem;
      padding: 0 0.875rem;
      background: #fff;
      border: none;
      cursor: pointer;
      font-family: inherit;
      font-size: var(--text-sm, 0.8125rem);
      color: rgba(var(--text-color, 26 26 26) / 0.5);
    }
    
    .ess-addons-accordion-trigger .ess-accordion-left {
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }
    
    .ess-addons-accordion-trigger .ess-accordion-count {
      font-size: 0.625rem;
      font-weight: 600;
      background: rgb(var(--text-color, 26 26 26));
      color: #fff;
      border-radius: 0.5rem;
      padding: 0.0625rem 0.375rem;
    }
    
    .ess-addons-accordion-trigger.has-selection {
      color: rgb(var(--text-color, 26 26 26));
    }
    
    .ess-addons-accordion-trigger .ess-accordion-chevron {
      width: 0.875rem;
      height: 0.875rem;
      opacity: 0.5;
      transition: transform 0.3s ease;
    }
    
    .ess-addons-accordion-trigger.is-open .ess-accordion-chevron {
      transform: rotate(180deg);
    }

    /* Line wipe divider — Design E */
    .ess-accordion-line {
      height: 1px;
      background: rgba(var(--text-color, 26 26 26) / 0.08);
      transform-origin: left;
      transform: scaleX(0);
      transition: transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
    }

    .ess-accordion-line.is-open {
      transform: scaleX(1);
    }
    
    /* Grid-based collapse — GPU-accelerated, no max-height lag */
    .ess-addons-list-wrap {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows 0.35s cubic-bezier(0.25, 0.1, 0.25, 1);
    }

    .ess-addons-list-wrap.is-open {
      grid-template-rows: 1fr;
    }

    .ess-addons-list-wrap > .ess-addons-list {
      overflow: hidden;
    }

    /* Options container inside accordion */
    .ess-addons-list {
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
      padding: 0 0.75rem;
      opacity: 0;
      transition: opacity 0.25s ease, padding 0.35s cubic-bezier(0.25, 0.1, 0.25, 1);
    }

    .ess-addons-list-wrap.is-open > .ess-addons-list {
      padding: 0.75rem;
      opacity: 1;
      transition: opacity 0.25s ease 0.08s, padding 0.35s cubic-bezier(0.25, 0.1, 0.25, 1);
    }

    /* Individual card stagger on open */
    .ess-addons-list .ess-addon-box {
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 0.25s ease, transform 0.25s ease;
    }

    .ess-addons-list-wrap.is-open .ess-addon-box {
      opacity: 1;
      transform: translateY(0);
    }

    .ess-addons-list-wrap.is-open .ess-addon-box:nth-child(1) {
      transition-delay: 0.1s;
    }
    .ess-addons-list-wrap.is-open .ess-addon-box:nth-child(2) {
      transition-delay: 0.18s;
    }
    .ess-addons-list-wrap.is-open .ess-addon-box:nth-child(3) {
      transition-delay: 0.26s;
    }
    
    /* Addon box - outlined card style */
    .ess-addon-box {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 0;
      padding: 0;
      background: #fff;
      cursor: pointer;
      transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
      box-sizing: border-box;
      border: 1.5px solid rgba(var(--text-color, 26 26 26) / 0.12);
      border-radius: 0.5rem;
      overflow: hidden;
    }
    
    .ess-addon-main {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      padding: 0.875rem;
    }
    
    .ess-addon-box:hover {
      border-color: rgba(var(--text-color, 26 26 26) / 0.4);
    }
    
    .ess-addon-box.is-selected {
      border-color: rgb(var(--text-color, 26 26 26));
      background: rgba(var(--text-color, 26 26 26) / 0.02);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }
    
    .ess-addon-box.is-disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    /* Image container - 4:3 ratio (landscape) grey rounded box, image fills it */
    .ess-addon-image {
      width: calc(var(--input-height, 3.125rem) * 1.333);
      height: var(--input-height, 3.125rem);
      border-radius: 0.375rem;
      background: #f5f5f5;
      object-fit: cover;
      flex-shrink: 0;
      border: 1px solid rgba(var(--text-color, 26 26 26) / 0.2);
      box-sizing: border-box;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    
    /* Selected state - matches swatch block border */
    .ess-addon-box.is-selected .ess-addon-image {
      border-color: rgb(var(--text-color, 26 26 26));
      box-shadow: inset 0 0 0 1px rgb(var(--text-color, 26 26 26));
    }
    
    @media screen and (max-width: 699px) {
      .ess-addon-image {
        width: calc(2.625rem * 1.333);
        height: 2.625rem;
      }
      
      .ess-addon-main {
        padding: 0.625rem;
        gap: 0.625rem;
      }
    }
    
    /* Hidden checkbox input */
    .ess-addon-box input[type="checkbox"] {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    
    /* Checkbox indicator */
    .ess-addon-checkbox {
      width: 1.25rem;
      height: 1.25rem;
      border-radius: 0.3125rem;
      border: 1.5px solid rgba(var(--text-color, 26 26 26) / 0.2);
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    
    .ess-addon-box.is-selected .ess-addon-checkbox {
      background: rgb(var(--text-color, 26 26 26));
      border-color: rgb(var(--text-color, 26 26 26));
    }
    
    .ess-addon-checkbox svg {
      width: 12px;
      height: 12px;
      stroke: white;
      stroke-width: 3;
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    
    .ess-addon-box.is-selected .ess-addon-checkbox svg {
      opacity: 1;
    }
    
    /* Content - stacked layout */
    .ess-addon-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.0625rem;
    }
    
    .ess-addon-title-row {
      display: flex;
      align-items: baseline;
      gap: 0.25rem;
      flex-wrap: wrap;
    }
    
    .ess-addon-name {
      font-weight: 600;
      font-size: var(--text-sm);
      color: rgb(var(--text-color, 26 26 26));
      margin: 0;
      line-height: 1.2;
    }
    
    .ess-addon-price {
      font-weight: 400;
      font-size: var(--text-sm);
      color: rgba(var(--text-color, 26 26 26) / 0.5);
      white-space: nowrap;
    }
    
    .ess-addon-description {
      font-size: 0.72rem;
      color: rgba(var(--text-color, 26 26 26) / 0.5);
      margin: 0;
      line-height: 1.45;
    }
    
    /* Spec line — pipe-separated specs beneath addon content */
    .ess-addon-specs {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      padding: 0.5rem 0.875rem 0.625rem;
      border-top: 1px solid rgba(var(--text-color, 26 26 26) / 0.04);
    }
    
    .ess-addon-specs span {
      font-size: 0.625rem;
      color: rgba(var(--text-color, 26 26 26) / 0.4);
    }
    
    .ess-addon-specs .ess-spec-divider {
      color: rgba(var(--text-color, 26 26 26) / 0.15);
    }
    
    /* Loading state */
    .ess-loading {
      text-align: center;
      padding: 1.5rem;
      color: rgba(var(--text-color, 26 26 26) / 0.6);
      font-size: var(--text-sm, 0.875rem);
    }
    
    .ess-loading-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid rgba(var(--text-color, 26 26 26) / 0.2);
      border-top-color: rgb(var(--text-color, 26 26 26));
      border-radius: 50%;
      animation: ess-spin 0.8s linear infinite;
      margin: 0 auto 0.5rem;
    }
    
    @keyframes ess-spin {
      to { transform: rotate(360deg); }
    }
    
    .ess-empty {
      display: none;
    }

    .ess-addon-tag {
      display: inline-block;
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(var(--text-color, 26 26 26) / 0.08);
      color: inherit;
      margin-left: 0.5rem;
      vertical-align: middle;
    }

    /* Toggle (Yes/No) display type - split bar style matching variant picker */
    .ess-toggle-group {
      margin: 0;
      padding: 0;
      border: none;
      font-family: inherit;
    }

    .ess-toggle-header {
      display: flex;
      gap: 0.5rem;
      margin-block-end: var(--spacing-2);
    }

    .ess-toggle-title {
      font-size: inherit;
      font-weight: 600;
      color: rgb(var(--text-color, 26 26 26));
      margin: 0;
    }

    .ess-toggle-value {
      font-weight: 400;
      color: rgb(var(--text-color, 26 26 26));
    }

    .ess-toggle-buttons {
      display: flex;
      gap: 0;
    }

    .ess-toggle-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.75rem 1rem;
      background: white;
      border: 1px solid rgba(var(--text-color, 26 26 26) / 0.2);
      border-radius: 0;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      font-weight: 400;
      color: rgba(var(--text-color, 26 26 26) / 0.7);
      transition: border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease;
      height: var(--input-height, 3.125rem);
      flex: 1;
      box-sizing: border-box;
      text-align: center;
      margin-left: -1px;
      position: relative;
    }

    .ess-toggle-buttons .ess-toggle-btn:first-child {
      border-top-left-radius: var(--rounded-input, 12px);
      border-bottom-left-radius: var(--rounded-input, 12px);
      margin-left: 0;
    }

    .ess-toggle-buttons .ess-toggle-btn:last-child {
      border-top-right-radius: var(--rounded-input, 12px);
      border-bottom-right-radius: var(--rounded-input, 12px);
    }

    .ess-toggle-btn:hover {
      background: white;
      color: rgb(var(--text-color, 26 26 26));
      z-index: 2;
    }

    .ess-toggle-btn.is-active {
      border-color: rgb(var(--text-color, 26 26 26));
      color: rgb(var(--text-color, 26 26 26));
      background: white;
      z-index: 3;
    }

    .ess-toggle-label {
      font-size: var(--text-sm);
      line-height: 1.2;
      font-weight: 400;
    }

    .ess-toggle-price {
      font-weight: 400;
      font-size: 0.8125rem;
      color: rgba(var(--text-color, 26 26 26) / 0.5);
      margin-left: 0.25rem;
    }

    @media screen and (max-width: 699px) {
      .ess-toggle-btn {
        height: 2.625rem;
        padding: 0.5rem 0.75rem;
        font-size: 0.8125rem;
      }
    }

    .ess-addons-stack {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-6, 1.5rem);
    }

    .ess-addons-stack > * {
      margin: 0;
    }

    /* Inline mount: frame + mount on the same row */
    .ess-frame-mount-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--spacing-4, 1rem);
      align-items: end;
    }

    .ess-frame-mount-row .ess-toggle-group.ess-inline-mount {
      min-width: 160px;
    }

    .ess-inline-mount .ess-toggle-buttons {
      display: flex;
      gap: 0;
    }

    .ess-inline-mount .ess-toggle-btn {
      flex: 1;
      height: var(--input-height, 3.125rem);
      padding: 0 0.75rem;
      min-width: 0;
    }

    /* Mobile: hide "No" button, compact "Yes" toggle to match frame swatch size */
    @media screen and (max-width: 699px) {
      .ess-frame-mount-row {
        grid-template-columns: 1fr auto;
        gap: 0.5rem;
      }
      .ess-frame-mount-row .ess-toggle-group.ess-inline-mount {
        min-width: 0;
      }
      .ess-inline-mount .ess-toggle-btn {
        height: 2.625rem;
        padding: 0 0.75rem;
      }
      .ess-inline-mount .ess-toggle-btn[data-toggle-action="no"] {
        display: none;
      }
      .ess-inline-mount .ess-toggle-btn[data-toggle-action="yes"] {
        border-radius: 0.375rem;
      }
    }
  `;

  let state = {
    productId: null,
    currentVariantId: null,
    currentVariantTitle: '',
    currentFrame: null, // Track current frame selection for label
    country: 'GB',
    addons: [],
    selectedAddons: new Map(),
    initialized: false,
    isSubmitting: false,
    addonCache: new Map(), // Cache addons by frame+size key
    pendingUpdate: null, // Debounce timer
    fetchInProgress: null, // Current fetch promise for deduplication
    preloadedGroups: null, // All addon groups preloaded on page load
    preloadPromise: null, // Promise for preload in progress
    renderVersion: 0, // Incremented on each update to discard stale renders
    upgradesAccordionOpen: false, // Whether the upgrades accordion is expanded
    currencyInfo: null, // Detected currency and exchange rate from Shopify
    productMeta: {} // Product metafield values from data-meta-* attributes
  };
  
  let options = {
    redirectToCart: true,
    onCartSuccess: null,
    onCartError: null
  };

  // Only log when debug enabled
  let DEBUG_MODE = window.ESS_ADDONS_DEBUG || false;
  
  function log(...args) {
    if (DEBUG_MODE || CONFIG.debug) {
      console.log('[ESS Addons]', ...args);
    }
  }
  
  // Debug logging (only when debug enabled)
  function debugLog(...args) {
    if (DEBUG_MODE) {
      console.log('[ESS Addons DEBUG]', ...args);
    }
  }

  function detectShopifyMetafields() {
    try {
      const sources = [];

      const productJsonEl = document.querySelector('[data-product-json]');
      if (productJsonEl) {
        try {
          const d = JSON.parse(productJsonEl.textContent);
          if (d && d.metafields) sources.push(d.metafields);
        } catch (e) {}
      }

      const scriptEls = document.querySelectorAll('script[type="application/json"]');
      scriptEls.forEach(el => {
        try {
          const d = JSON.parse(el.textContent);
          if (d && d.product && d.product.metafields) sources.push(d.product.metafields);
          if (d && d.metafields) sources.push(d.metafields);
        } catch (e) {}
      });

      if (window.ShopifyAnalytics?.meta?.product) {
        const p = window.ShopifyAnalytics.meta.product;
        if (p.metafields) sources.push(p.metafields);
      }

      if (window.meta?.product?.metafields) {
        sources.push(window.meta.product.metafields);
      }

      if (window.product?.metafields) {
        sources.push(window.product.metafields);
      }

      for (const metafields of sources) {
        if (Array.isArray(metafields)) {
          for (const mf of metafields) {
            if (mf && mf.namespace && mf.key && mf.value !== undefined) {
              const datasetKey = 'meta' + [mf.namespace, mf.key].map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
              if (!state.productMeta[datasetKey]) {
                state.productMeta[datasetKey] = String(mf.value);
                log('Metafield auto-detected (array):', mf.namespace + '.' + mf.key, '=', mf.value, '-> key:', datasetKey);
              }
            }
          }
        } else if (typeof metafields === 'object') {
          for (const namespace of Object.keys(metafields)) {
            const nsObj = metafields[namespace];
            if (nsObj && typeof nsObj === 'object') {
              for (const key of Object.keys(nsObj)) {
                const val = nsObj[key];
                const resolvedVal = (val && typeof val === 'object' && val.value !== undefined) ? String(val.value) : String(val);
                const datasetKey = 'meta' + [namespace, key].map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
                if (!state.productMeta[datasetKey]) {
                  state.productMeta[datasetKey] = resolvedVal;
                  log('Metafield auto-detected (object):', namespace + '.' + key, '=', resolvedVal, '-> key:', datasetKey);
                }
              }
            }
          }
        }
      }

      const liquidMetaEls = document.querySelectorAll('[data-metafield-namespace]');
      liquidMetaEls.forEach(el => {
        const ns = el.getAttribute('data-metafield-namespace');
        const key = el.getAttribute('data-metafield-key');
        const val = el.getAttribute('data-metafield-value');
        if (ns && key && val !== null) {
          const datasetKey = 'meta' + [ns, key].map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
          if (!state.productMeta[datasetKey]) {
            state.productMeta[datasetKey] = val;
            log('Metafield auto-detected (liquid el):', ns + '.' + key, '=', val, '-> key:', datasetKey);
          }
        }
      });

    } catch (e) {
      log('Error detecting Shopify metafields:', e);
    }
  }

  function injectStyles() {
    if (document.getElementById('ess-addons-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'ess-addons-styles';
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  function detectCountry() {
    if (window.Shopify && window.Shopify.country) {
      return window.Shopify.country;
    }
    const locale = window.Shopify?.locale || navigator.language || 'en-GB';
    const countryMatch = locale.match(/-([A-Z]{2})$/i);
    return countryMatch ? countryMatch[1].toUpperCase() : 'GB';
  }

  // Detect active currency and exchange rate from Shopify Markets
  function detectCurrencyInfo() {
    const info = {
      activeCurrency: 'GBP',
      baseCurrency: 'GBP',
      exchangeRate: 1,
      moneyFormat: '£{{amount}}'
    };
    
    try {
      // Get active currency from Shopify's currency object
      if (window.Shopify?.currency?.active) {
        info.activeCurrency = window.Shopify.currency.active;
      }
      
      // Get base/shop currency
      if (window.Shopify?.currency?.rate) {
        // Shopify provides the rate when using multi-currency
        info.exchangeRate = parseFloat(window.Shopify.currency.rate) || 1;
        info.baseCurrency = window.Shopify.currency.active || 'GBP';
      }
      
      // Try to get money format from theme settings
      if (window.theme?.moneyFormat) {
        info.moneyFormat = window.theme.moneyFormat;
      } else if (window.Shopify?.money_format) {
        info.moneyFormat = window.Shopify.money_format;
      }
      
      // If Shopify doesn't give us the rate, calculate it from displayed prices
      if (info.exchangeRate === 1 && info.activeCurrency !== 'GBP') {
        const calculatedRate = calculateExchangeRateFromPage();
        if (calculatedRate && calculatedRate !== 1) {
          info.exchangeRate = calculatedRate;
          log('Calculated exchange rate from page:', calculatedRate);
        }
      }
      
      log('Currency info detected:', info);
    } catch (e) {
      log('Error detecting currency:', e);
    }
    
    return info;
  }
  
  // Calculate exchange rate by comparing displayed price to base price
  function calculateExchangeRateFromPage() {
    try {
      // Try to find the product JSON data that Shopify injects
      const productJson = document.querySelector('[data-product-json]');
      if (productJson) {
        const productData = JSON.parse(productJson.textContent);
        const basePrice = productData.price / 100; // Shopify stores prices in cents
        
        // Get displayed price
        const priceEl = document.querySelector(CONFIG.priceSelector);
        if (priceEl) {
          const displayedPrice = parseFloat(priceEl.textContent.replace(/[^0-9.]/g, ''));
          if (basePrice > 0 && displayedPrice > 0) {
            return displayedPrice / basePrice;
          }
        }
      }
      
      // Alternative: Check for variant data
      const variantData = window.ShopifyAnalytics?.meta?.product?.variants;
      if (variantData && variantData.length > 0) {
        const firstVariant = variantData[0];
        const basePrice = firstVariant.price / 100;
        
        const priceEl = document.querySelector(CONFIG.priceSelector);
        if (priceEl) {
          const displayedPrice = parseFloat(priceEl.textContent.replace(/[^0-9.]/g, ''));
          if (basePrice > 0 && displayedPrice > 0 && Math.abs(displayedPrice - basePrice) > 0.01) {
            return displayedPrice / basePrice;
          }
        }
      }
    } catch (e) {
      log('Error calculating exchange rate:', e);
    }
    return 1;
  }

  function extractSizeFromVariant(variantTitle) {
    const patterns = [
      /^(A\d)/i,
      /^(\d+\s*[xX×]\s*\d+)/,
      /^(\d+"\s*[xX×]\s*\d+")/,
      /^(\d+\s*cm\s*[xX×]\s*\d+\s*cm)/i
    ];
    
    for (const pattern of patterns) {
      const match = variantTitle.match(pattern);
      if (match) return match[1];
    }
    return '';
  }

  // Helper function to extract variant title from label elements
  function extractVariantTitleFromLabels() {
    const parts = [];
    
    // Look for variant picker option info containers
    const optionInfos = document.querySelectorAll('.variant-picker__option-info');
    optionInfos.forEach(info => {
      // Skip if this is inside our addon container
      if (info.closest('#ess-addons-container, .ess-addons')) return;
      
      // Skip if the legend contains "Upgrade"
      const legend = info.querySelector('legend');
      if (legend && legend.textContent.toLowerCase().includes('upgrade')) return;
      
      const hStack = info.querySelector('.h-stack');
      if (hStack) {
        const spans = hStack.querySelectorAll(':scope > span');
        spans.forEach(span => {
          const text = span.textContent.trim();
          // Skip unwanted text
          if (text && !text.includes('Size chart') && !text.includes('chart') && 
              !text.includes('selected') && !text.includes('Premium') && !text.includes('Box Frame')) {
            parts.push(text);
          }
        });
      }
    });
    
    // Fallback: look for any legend + adjacent span pattern
    if (parts.length === 0) {
      const legends = document.querySelectorAll('legend.text-subdued, legend');
      legends.forEach(legend => {
        // Skip Upgrades section
        if (legend.textContent.toLowerCase().includes('upgrade')) return;
        // Skip if inside addon container
        if (legend.closest('#ess-addons-container, .ess-addons')) return;
        
        const parent = legend.closest('.h-stack, .variant-picker__option-info, div');
        if (parent) {
          const spans = parent.querySelectorAll('span');
          spans.forEach(span => {
            const text = span.textContent.trim();
            if (text && !text.includes('chart') && text.length < 50 && 
                !text.includes('Premium') && !text.includes('Box Frame') && !text.includes('selected')) {
              // Check if it looks like a variant value (Size or Frame types only)
              if (/^\d+["']?\s*[xX×]\s*\d+/.test(text) || // Size like 8" x 12"
                  /^A\d/i.test(text) || // A4, A3, etc
                  /^(Black|White|Natural|Oak)\s*Frame$/i.test(text) || // Standard frame colors only
                  /^Unframed$/i.test(text) || // Unframed
                  /mount/i.test(text) || // With Mount, etc
                  /^\d+\s*cm/i.test(text)) { // 50 cm x 70 cm
                parts.push(text);
              }
            }
          });
        }
      });
    }
    
    return parts.join(' / ');
  }

  function getSelectedVariant() {
    log('getSelectedVariant: searching for variant...');
    
    // Method 1: Standard select dropdown
    const select = document.querySelector('select[name="id"]');
    if (select && select.value) {
      const option = select.options[select.selectedIndex];
      log('getSelectedVariant: Found via select[name="id"]:', select.value);
      return {
        id: select.value,
        title: option ? option.textContent.trim() : ''
      };
    }

    // Method 2: Radio buttons
    const checkedRadio = document.querySelector('input[name="id"]:checked');
    if (checkedRadio && checkedRadio.value) {
      const label = document.querySelector(`label[for="${checkedRadio.id}"]`);
      log('getSelectedVariant: Found via radio input:', checkedRadio.value);
      return {
        id: checkedRadio.value,
        title: label ? label.textContent.trim() : ''
      };
    }

    // Method 3: Hidden input (common in many themes)
    const hiddenInput = document.querySelector('input[name="id"][type="hidden"]');
    if (hiddenInput && hiddenInput.value) {
      log('getSelectedVariant: Found ID via hidden input:', hiddenInput.value);
      // Also try to get title from variant picker labels
      const title = extractVariantTitleFromLabels();
      log('getSelectedVariant: Extracted title from labels:', title);
      return {
        id: hiddenInput.value,
        title: title
      };
    }

    // Method 4: Data attribute on form or container
    const selectedEl = document.querySelector('[data-selected-variant]');
    if (selectedEl && selectedEl.dataset.selectedVariant) {
      log('getSelectedVariant: Found via data-selected-variant:', selectedEl.dataset.selectedVariant);
      return {
        id: selectedEl.dataset.selectedVariant,
        title: selectedEl.dataset.variantTitle || ''
      };
    }

    // Method 5: Product form with variant-id data attribute
    const formWithVariant = document.querySelector('[data-variant-id]');
    if (formWithVariant && formWithVariant.dataset.variantId) {
      log('getSelectedVariant: Found via data-variant-id:', formWithVariant.dataset.variantId);
      return {
        id: formWithVariant.dataset.variantId,
        title: ''
      };
    }

    // Method 6: URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const variantFromUrl = urlParams.get('variant');
    if (variantFromUrl) {
      log('getSelectedVariant: Found via URL param:', variantFromUrl);
      return {
        id: variantFromUrl,
        title: ''
      };
    }

    // Method 7: Look for any input with variant in the name
    const anyVariantInput = document.querySelector('input[name*="variant" i], select[name*="variant" i]');
    if (anyVariantInput && anyVariantInput.value) {
      log('getSelectedVariant: Found via variant input:', anyVariantInput.value);
      return {
        id: anyVariantInput.value,
        title: ''
      };
    }

    // Method 8: Shopify's product JSON
    if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.selectedVariantId) {
      log('getSelectedVariant: Found via ShopifyAnalytics:', window.ShopifyAnalytics.meta.selectedVariantId);
      return {
        id: String(window.ShopifyAnalytics.meta.selectedVariantId),
        title: ''
      };
    }

    // Method 9: Extract from variant picker labels (legend + span pattern)
    // Looks for patterns like: <legend>Size:</legend> <span>8" x 12"</span>
    const variantPickers = document.querySelectorAll('.variant-picker__option-info, [class*="variant-picker"]');
    if (variantPickers.length > 0) {
      const parts = [];
      variantPickers.forEach(picker => {
        const legend = picker.querySelector('legend');
        // Skip the Upgrades section (our add-ons widget)
        const legendText = legend?.textContent?.trim().toLowerCase() || '';
        if (legendText.includes('upgrade')) return;
        
        const valueSpan = picker.querySelector(':scope > .h-stack > span:not(.link), :scope > div > span:last-of-type');
        if (legend && valueSpan) {
          const label = legend.textContent.trim().replace(':', '');
          const value = valueSpan.textContent.trim();
          // Skip "Size chart", "selected" text from add-ons
          if (value && !value.includes('Size chart') && !value.includes('selected')) {
            log(`getSelectedVariant: Found option ${label}: ${value}`);
            parts.push(value);
          }
        }
      });
      if (parts.length > 0) {
        const title = parts.join(' / ');
        log('getSelectedVariant: Built title from variant pickers:', title);
        // We have the title but need an ID - use a placeholder that signals we have options
        return {
          id: 'from-labels',
          title: title
        };
      }
    }

    // Method 10: Direct span values next to legends with common labels
    const sizeLabel = document.querySelector('legend.text-subdued');
    if (sizeLabel) {
      const parent = sizeLabel.closest('.variant-picker__option-info, .h-stack, div');
      if (parent) {
        const spans = parent.querySelectorAll('span');
        for (const span of spans) {
          const text = span.textContent.trim();
          // Check if it looks like a size (e.g., "8" x 12"", "A4", "50 x 70 cm")
          if (/^\d+["']?\s*[xX×]\s*\d+["']?/.test(text) || /^A\d/i.test(text) || /^\d+\s*cm/i.test(text)) {
            log('getSelectedVariant: Found size from legend span:', text);
            return {
              id: 'from-labels',
              title: text
            };
          }
        }
      }
    }

    log('getSelectedVariant: No variant found with any method');
    return { id: null, title: '' };
  }

  function getCurrentFrameFromPage() {
    // Try to read frame directly from page labels (most reliable)
    // Look for "Frame: White Frame" or similar pattern
    const frameLegends = document.querySelectorAll('legend');
    for (const legend of frameLegends) {
      const text = legend.textContent.trim().toLowerCase();
      if (text.includes('frame')) {
        // Found the Frame legend, now find the current value
        const parent = legend.closest('.variant-picker__option-info, .h-stack, fieldset, div');
        if (parent) {
          // Check for value span
          const valueSpan = parent.querySelector(':scope > span:not(.link), :scope > .h-stack > span, :scope > div > span');
          if (valueSpan) {
            const value = valueSpan.textContent.trim().toLowerCase();
            log('getCurrentFrameFromPage: Found frame from span:', value);
            if (value.includes('unframed')) return 'unframed';
            if (value.includes('black')) return 'black';
            if (value.includes('white')) return 'white';
            if (value.includes('natural')) return 'natural';
            if (value.includes('oak')) return 'oak';
          }
        }
      }
    }
    
    // Fallback: check for selected/checked button
    const selectedFrameBtn = document.querySelector('[data-option-value][aria-checked="true"], .variant-picker input:checked + label, .block-swatch input:checked + label');
    if (selectedFrameBtn) {
      const value = selectedFrameBtn.textContent?.trim().toLowerCase() || '';
      log('getCurrentFrameFromPage: Found frame from selected button:', value);
      if (value.includes('unframed')) return 'unframed';
      if (value.includes('black')) return 'black';
      if (value.includes('white')) return 'white';
      if (value.includes('natural')) return 'natural';
      if (value.includes('oak')) return 'oak';
    }
    
    return '';
  }

  // Preload ALL addon groups on page load for instant switching
  async function preloadAllAddons(country) {
    if (state.preloadedGroups) {
      log('Addons already preloaded');
      return state.preloadedGroups;
    }
    
    if (state.preloadPromise) {
      log('Preload already in progress, waiting...');
      return state.preloadPromise;
    }
    
    const url = `${ESS_API_BASE}/api/addons/preload?country=${encodeURIComponent(country)}`;
    log('Preloading all addons from:', url);
    
    state.preloadPromise = (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const groups = await response.json();
        log('Preloaded', groups.length, 'addon groups');
        
        // Preload all images
        groups.forEach(group => {
          if (group.imageUrl) {
            const img = new Image();
            img.src = group.imageUrl.startsWith('http') ? group.imageUrl : `${ESS_API_BASE}${group.imageUrl}`;
          }
          group.variants?.forEach(v => {
            v.images?.forEach(imgData => {
              if (imgData.imageUrl) {
                const img = new Image();
                img.src = imgData.imageUrl.startsWith('http') ? imgData.imageUrl : `${ESS_API_BASE}${imgData.imageUrl}`;
              }
            });
          });
        });
        
        state.preloadedGroups = groups;
        return groups;
      } catch (error) {
        log('ERROR preloading addons:', error.message);
        return null;
      } finally {
        state.preloadPromise = null;
      }
    })();
    
    return state.preloadPromise;
  }
  
  // Filter preloaded groups based on current variant
  function filterPreloadedAddons(groups, variantTitle, size, frame) {
    const result = [];
    
    for (const group of groups) {
      // Check display conditions
      if (group.displayConditions && group.displayConditions.length > 0) {
        const matchAll = group.conditionLogic === 'all';
        const results = group.displayConditions.map(cond => {
          let checkValue;
          if (cond.field === 'shopify_variant') {
            checkValue = variantTitle;
          } else if (cond.field === 'size') {
            checkValue = size;
          } else if (cond.field === 'frame') {
            checkValue = frame || variantTitle;
          } else if (cond.field && cond.field.startsWith('metafield:')) {
            const rawKey = cond.field.replace('metafield:', '');
            const datasetKey = 'meta' + rawKey.split(/[._]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
            checkValue = state.productMeta[datasetKey] || '';
            log('Metafield condition:', cond.field, '-> datasetKey:', datasetKey, '-> value:', checkValue);
          } else {
            checkValue = variantTitle;
          }
          
          if (cond.operator === 'contains') {
            return checkValue.toLowerCase().includes(cond.value.toLowerCase());
          } else if (cond.operator === 'not_contains') {
            return !checkValue.toLowerCase().includes(cond.value.toLowerCase());
          } else if (cond.operator === 'equals') {
            return checkValue.toLowerCase() === cond.value.toLowerCase();
          }
          return false;
        });
        
        if (matchAll) {
          if (!results.every(r => r)) continue;
        } else {
          if (!results.some(r => r)) continue;
        }
      }
      
      // Filter variants by size — prefer exact size-specific matches
      let matchingVariants = group.variants.filter(v => {
        if (!v.sizePatterns || v.sizePatterns.length === 0) return false;
        return v.sizePatterns.some(pattern => {
          const normalizedPattern = pattern.toLowerCase().replace(/["'″""]/g, '').trim();
          const normalizedSize = size.toLowerCase().replace(/["'″""]/g, '').trim();
          const normalizedVariant = variantTitle.toLowerCase().replace(/["'″""]/g, '').trim();
          if (!normalizedSize && !normalizedVariant) return false;
          return (normalizedVariant && normalizedVariant.includes(normalizedPattern)) || 
                 (normalizedSize && normalizedSize.includes(normalizedPattern)) ||
                 (normalizedSize && normalizedPattern.includes(normalizedSize));
        });
      });

      // Only fall back if NO variant in this group has specific patterns (true "one size fits all")
      if (matchingVariants.length === 0) {
        const hasAnyPatterns = group.variants.some(v => v.sizePatterns && v.sizePatterns.length > 0);
        if (!hasAnyPatterns) {
          matchingVariants = group.variants;
        }
      }
      
      if (matchingVariants.length === 0) continue;
      
      // Get correct image for frame type
      const normalizedFrame = frame?.toLowerCase().replace(/\s+frame$/i, '').trim() || '';
      const variantsWithImages = matchingVariants.map(v => {
        const matchingImage = v.images?.find(img => 
          img.frameType?.toLowerCase() === normalizedFrame
        ) || v.images?.find(img => !img.frameType) || v.images?.[0];
        
        return {
          id: v.id,
          name: v.name,
          shopifyVariantId: v.shopifyVariantId,
          price: v.price,
          currency: v.currency,
          imageUrl: matchingImage?.imageUrl || null
        };
      });
      
      result.push({
        id: group.id,
        name: group.name,
        slug: group.slug,
        description: group.description,
        specs: group.specs || null,
        imageUrl: group.imageUrl,
        shopifyProductId: group.shopifyProductId,
        shopifyProductHandle: group.shopifyProductHandle,
        displayType: group.displayType || 'checkbox',
        optionSetId: group.optionSetId || null,
        optionSetDisplayOrder: group.optionSetDisplayOrder || 0,
        variants: variantsWithImages
      });
    }
    
    result.sort((a, b) => (a.optionSetDisplayOrder || 0) - (b.optionSetDisplayOrder || 0));
    return result;
  }

  async function fetchAddons(productId, variantTitle, country) {
    const size = extractSizeFromVariant(variantTitle);
    
    // Get frame directly from page (more reliable than parsing variant title)
    let frame = getCurrentFrameFromPage();
    
    // Fallback: extract from variant title
    if (!frame) {
      const frameLower = variantTitle.toLowerCase();
      if (frameLower.includes('unframed')) {
        frame = 'unframed';
      } else if (frameLower.includes('black frame')) {
        frame = 'black';
      } else if (frameLower.includes('white frame')) {
        frame = 'white';
      } else if (frameLower.includes('natural frame')) {
        frame = 'natural';
      } else if (frameLower.includes('oak frame')) {
        frame = 'oak';
      }
    }
    
    log('Frame type detected:', frame, '(from page or variant)');
    
    // Store current frame in state for label rendering
    state.currentFrame = frame;
    
    // Check cache first for faster loading
    const cacheKey = `${size}|${frame}|${country}`;
    
    // Return cached result immediately
    if (state.addonCache.has(cacheKey)) {
      log('Using cached addons for:', cacheKey);
      return state.addonCache.get(cacheKey);
    }
    
    // USE PRELOADED DATA if available (instant filtering, no network call)
    if (state.preloadedGroups) {
      log('Filtering from preloaded data for:', cacheKey);
      const filtered = filterPreloadedAddons(state.preloadedGroups, variantTitle, size, frame);
      state.addonCache.set(cacheKey, filtered);
      return filtered;
    }
    
    // Wait for preload if in progress
    if (state.preloadPromise) {
      log('Waiting for preload to complete...');
      const groups = await state.preloadPromise;
      if (groups) {
        const filtered = filterPreloadedAddons(groups, variantTitle, size, frame);
        state.addonCache.set(cacheKey, filtered);
        return filtered;
      }
    }
    
    // FALLBACK: Fetch from API if preload failed
    // If a fetch is already in progress for this key, wait for it (deduplication)
    if (state.fetchInProgress && state.fetchInProgress.key === cacheKey) {
      log('Waiting for in-progress fetch:', cacheKey);
      return state.fetchInProgress.promise;
    }
    
    const params = new URLSearchParams({
      productId: productId,
      variant: variantTitle,
      size: size,
      frame: frame,
      country: country
    });

    const url = `${ESS_API_BASE}/api/addons?${params}`;
    log('Fetching addons from API (preload unavailable):', url);

    // Create fetch promise and store for deduplication
    const fetchPromise = (async () => {
      try {
        const response = await fetch(url);
        log('API response status:', response.status);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        log('API returned addons:', data.length, 'items');
        
        // Preload images immediately for faster display
        data.forEach(addon => {
          const variant = addon.variants?.[0];
          if (variant?.imageUrl) {
            const img = new Image();
            img.src = `${ESS_API_BASE}${variant.imageUrl}`;
          } else if (addon.imageUrl) {
            const img = new Image();
            img.src = addon.imageUrl.startsWith('http') ? addon.imageUrl : `${ESS_API_BASE}${addon.imageUrl}`;
          }
        });
        
        // Cache the result
        state.addonCache.set(cacheKey, data);
        
        return data;
      } catch (error) {
        log('ERROR fetching addons:', error.message);
        return [];
      } finally {
        // Clear in-progress state
        if (state.fetchInProgress?.key === cacheKey) {
          state.fetchInProgress = null;
        }
      }
    })();
    
    // Store for deduplication
    state.fetchInProgress = { key: cacheKey, promise: fetchPromise };
    
    return fetchPromise;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatPrice(price, baseCurrency = 'GBP') {
    let num = parseFloat(price);
    
    if (isNaN(num)) {
      log('WARNING: formatPrice received non-numeric price:', price);
      num = 0;
    }
    
    // Apply exchange rate if we have currency info and the addon is in GBP
    // This converts GBP addon prices to the customer's local currency
    if (state.currencyInfo && baseCurrency === 'GBP' && state.currencyInfo.exchangeRate !== 1) {
      num = num * state.currencyInfo.exchangeRate;
      if (isNaN(num)) {
        log('WARNING: exchangeRate produced NaN, rate:', state.currencyInfo.exchangeRate);
        num = 0;
      }
      log('Converted price from', price, 'GBP to', num.toFixed(2), state.currencyInfo.activeCurrency);
    }
    
    // Use the active currency from Shopify if available
    const displayCurrency = state.currencyInfo?.activeCurrency || baseCurrency;
    
    // Map currency codes to symbols
    const currencySymbols = {
      'GBP': '£',
      'USD': '$',
      'EUR': '€',
      'AUD': 'A$',
      'NZD': 'NZ$',
      'CAD': 'C$',
      'JPY': '¥',
      'CHF': 'CHF ',
      'SEK': 'kr ',
      'NOK': 'kr ',
      'DKK': 'kr '
    };
    const symbol = currencySymbols[displayCurrency] || displayCurrency + ' ';
    return `${symbol}${num.toFixed(2)}`;
  }

  function renderAddons(addons) {
    log('renderAddons called with', addons?.length || 0, 'addons');
    const container = document.querySelector(CONFIG.containerSelector);
    if (!container) {
      log('ERROR: Container not found for rendering');
      return;
    }
    log('Container found for rendering');

    if (!addons || addons.length === 0) {
      log('No addons to display - rendering empty state');
      container.innerHTML = '<div class="ess-addons ess-empty"></div>';
      return;
    }
    
    log('Rendering', addons.length, 'addon options');

    const toggleAddons = addons.filter(a => a.displayType === 'toggle');
    const checkboxAddons = addons.filter(a => a.displayType !== 'toggle');

    let html = '<div class="ess-addons-stack">';

    // Separate mount toggles (to be inlined with frame) from other toggles
    const mountToggles = toggleAddons.filter(a => /mount/i.test(a.name));
    const otherToggles = toggleAddons.filter(a => !/mount/i.test(a.name));

    for (const addon of otherToggles) {
      const variant = addon.variants?.[0];
      if (!variant) continue;
      const price = formatPrice(variant.price, variant.currency);
      const isSelected = state.selectedAddons.has(addon.id);
      const valueText = isSelected ? 'Yes' : 'No';

      html += `
        <fieldset class="ess-toggle-group variant-picker__option" data-toggle-addon-id="${addon.id}">
          <div class="ess-toggle-header variant-picker__option-info">
            <div class="h-stack gap-2">
              <legend class="ess-toggle-title">${addon.name}:</legend>
              <span class="ess-toggle-value">${valueText}</span>
            </div>
          </div>
          <div class="ess-toggle-buttons">
            <button type="button"
                    class="ess-toggle-btn ${isSelected ? 'is-active' : ''}"
                    data-toggle-action="yes"
                    data-addon-id="${addon.id}"
                    data-shopify-variant-id="${variant.shopifyVariantId}"
                    data-price="${variant.price}">
              <span class="ess-toggle-label">Yes</span>
            </button>
            <button type="button"
                    class="ess-toggle-btn ${!isSelected ? 'is-active' : ''}"
                    data-toggle-action="no"
                    data-addon-id="${addon.id}">
              <span class="ess-toggle-label">No</span>
            </button>
          </div>
        </fieldset>
      `;
    }

    // Mount toggles rendered separately — will be positioned inline with Frame after DOM insertion
    for (const addon of mountToggles) {
      const variant = addon.variants?.[0];
      if (!variant) continue;
      const isSelected = state.selectedAddons.has(addon.id);
      const valueText = isSelected ? 'Yes' : 'No';

      html += `
        <fieldset class="ess-toggle-group ess-inline-mount variant-picker__option" data-toggle-addon-id="${addon.id}" data-ess-mount-toggle>
          <div class="ess-toggle-header variant-picker__option-info">
            <div class="h-stack gap-2">
              <legend class="ess-toggle-title">${addon.name}:</legend>
              <span class="ess-toggle-value">${valueText}</span>
            </div>
          </div>
          <div class="ess-toggle-buttons">
            <button type="button"
                    class="ess-toggle-btn ${isSelected ? 'is-active' : ''}"
                    data-toggle-action="yes"
                    data-addon-id="${addon.id}"
                    data-shopify-variant-id="${variant.shopifyVariantId}"
                    data-price="${variant.price}">
              <span class="ess-toggle-label">Yes</span>
            </button>
            <button type="button"
                    class="ess-toggle-btn ${!isSelected ? 'is-active' : ''}"
                    data-toggle-action="no"
                    data-addon-id="${addon.id}">
              <span class="ess-toggle-label">No</span>
            </button>
          </div>
        </fieldset>
      `;
    }

    if (checkboxAddons.length > 0) {
      const selectedCheckboxNames = [];
      checkboxAddons.forEach(addon => {
        if (state.selectedAddons.has(addon.id)) {
          selectedCheckboxNames.push(addon.name);
        }
      });
      const selectedText = selectedCheckboxNames.length > 0 ? selectedCheckboxNames.join(', ') : 'None selected';
      
      const upgradeLabel = 'Upgrades:';

      const upgradeCount = selectedCheckboxNames.length;
      const isAccordionOpen = state.upgradesAccordionOpen === true;
      
      html += `
        <fieldset class="ess-addons variant-picker__option">
          <div class="ess-addons-header variant-picker__option-info">
            <div class="h-stack gap-2">
              <legend class="ess-addons-title">${upgradeLabel}</legend>
              <span class="ess-addons-selected">${selectedText}</span>
            </div>
          </div>
          <div class="ess-addons-accordion">
            <button type="button" class="ess-addons-accordion-trigger ${isAccordionOpen ? 'is-open' : ''} ${upgradeCount > 0 ? 'has-selection' : ''}" data-action="toggle-upgrades">
              <span class="ess-accordion-left">
                <span>${upgradeCount > 0 ? upgradeCount + ' upgrade' + (upgradeCount > 1 ? 's' : '') + ' selected' : 'Add premium upgrades'}</span>
                ${upgradeCount > 0 && !isAccordionOpen ? '<span class="ess-accordion-count">' + upgradeCount + '</span>' : ''}
              </span>
              <svg class="ess-accordion-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            <div class="ess-accordion-line ${isAccordionOpen ? 'is-open' : ''}"></div>
            <div class="ess-addons-list-wrap ${isAccordionOpen ? 'is-open' : ''}">
            <div class="ess-addons-list">
            ${checkboxAddons.map(addon => {
              const variant = addon.variants?.[0];
              if (!variant) return '';
              const price = formatPrice(variant.price, variant.currency);
              const isSelected = state.selectedAddons.has(addon.id);
              
              const specsHtml = addon.specs ? `<div class="ess-addon-specs">${addon.specs.split('|').map((s, i, arr) => `<span>${escapeHtml(s.trim())}</span>${i < arr.length - 1 ? '<span class="ess-spec-divider">|</span>' : ''}`).join('')}</div>` : '';
              
              return `
                <label class="ess-addon-box ${isSelected ? 'is-selected' : ''}" 
                       data-addon-id="${addon.id}"
                       data-shopify-variant-id="${variant.shopifyVariantId}"
                       data-price="${variant.price}"
                       for="ess-addon-${addon.id}">
                  <div class="ess-addon-main">
                    <input type="checkbox" 
                           id="ess-addon-${addon.id}"
                           ${isSelected ? 'checked' : ''}>
                    ${variant.imageUrl ? `<img src="${ESS_API_BASE}${variant.imageUrl}" alt="${addon.name}" class="ess-addon-image" loading="eager" fetchpriority="high" onerror="this.style.display='none'">` : (addon.imageUrl ? `<img src="${addon.imageUrl.startsWith('http') ? addon.imageUrl : ESS_API_BASE + addon.imageUrl}" alt="${addon.name}" class="ess-addon-image" loading="eager" fetchpriority="high" onerror="this.style.display='none'">` : '')}
                    <span class="ess-addon-content">
                      <span class="ess-addon-title-row">
                        <span class="ess-addon-name">${addon.name}</span>
                        <span class="ess-addon-price">(+ ${price})</span>
                      </span>
                      ${addon.description ? `<span class="ess-addon-description">${addon.description}</span>` : ''}
                    </span>
                    <span class="ess-addon-checkbox">
                      <svg viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </span>
                  </div>
                  ${specsHtml}
                </label>
              `;
            }).join('')}
            </div>
            </div>
          </div>
        </fieldset>
      `;
    }

    html += '</div>';

    // Clean up any previously inlined mount before replacing container HTML,
    // since the inlined mount lives outside this container in the DOM
    cleanupInlinedMount();

    container.innerHTML = html;
    attachAddonListeners();
    positionMountInlineWithFrame();
  }

  /**
   * Remove any previously inlined mount toggle and restore the Frame fieldset
   * to its original position if it was wrapped.
   */
  function cleanupInlinedMount() {
    // Remove any previously inlined mount toggle from the wrapper
    const prevMount = document.querySelector('.ess-frame-mount-row [data-ess-mount-toggle]');
    if (prevMount) {
      prevMount.remove();
    }

    // If the wrapper is now empty (only has the Frame fieldset), unwrap it
    const wrapper = document.querySelector('.ess-frame-mount-row');
    if (wrapper && wrapper.querySelectorAll('[data-ess-mount-toggle]').length === 0) {
      // Keep the wrapper — Frame is still inside, and we'll re-use it
    }
  }

  /**
   * Position the mount toggle inline (same row) with the Shopify Frame fieldset.
   * Finds the native Frame variant picker fieldset in the DOM, creates a grid wrapper,
   * and moves the mount toggle alongside it.
   */
  function positionMountInlineWithFrame() {
    // Clean up any previously inlined mount from a prior render cycle
    cleanupInlinedMount();

    const mountToggle = document.querySelector('[data-ess-mount-toggle]');
    if (!mountToggle) return;

    // Find the Shopify Frame fieldset by looking for a legend containing "Frame"
    // Check inside an existing wrapper first, then scan the page
    let frameFieldset = null;

    const existingWrapper = document.querySelector('.ess-frame-mount-row');
    if (existingWrapper) {
      // Frame fieldset is already inside the wrapper from a previous render
      frameFieldset = existingWrapper.querySelector('fieldset, .variant-picker__option, .product-form__input');
    }

    if (!frameFieldset) {
      const legends = document.querySelectorAll('legend');
      for (const legend of legends) {
        const text = legend.textContent.trim().toLowerCase();
        if (text.includes('frame') && !legend.closest('#ess-addons-container, .ess-addons, .ess-addons-stack')) {
          frameFieldset = legend.closest('fieldset, .variant-picker__option, .product-form__input');
          break;
        }
      }
    }

    if (!frameFieldset) {
      log('positionMountInlineWithFrame: Frame fieldset not found, mount stays in stack');
      return;
    }

    log('positionMountInlineWithFrame: Found frame fieldset, positioning mount inline');

    // Remove mount from the addons stack
    mountToggle.remove();

    // Check if wrapper already exists
    const wrapper = frameFieldset.parentElement?.classList?.contains('ess-frame-mount-row')
      ? frameFieldset.parentElement
      : null;

    if (wrapper) {
      // Wrapper exists from previous render, just append the new mount toggle
      wrapper.appendChild(mountToggle);
    } else {
      // Create the grid wrapper
      const newWrapper = document.createElement('div');
      newWrapper.className = 'ess-frame-mount-row';

      // Insert wrapper where the frame fieldset currently is
      frameFieldset.parentNode.insertBefore(newWrapper, frameFieldset);

      // Move frame fieldset into wrapper
      newWrapper.appendChild(frameFieldset);

      // Add mount toggle into wrapper
      newWrapper.appendChild(mountToggle);
    }
  }

  function attachAddonListeners() {
    const boxes = document.querySelectorAll('.ess-addon-box');
    boxes.forEach(box => {
      const checkbox = box.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', () => {
        handleAddonToggle(box, checkbox.checked);
      });
    });

    const toggleBtns = document.querySelectorAll('.ess-toggle-btn');
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        handleToggleClick(btn);
      });
    });

    const accordionTrigger = document.querySelector('.ess-addons-accordion-trigger[data-action="toggle-upgrades"]');
    if (accordionTrigger) {
      accordionTrigger.addEventListener('click', () => {
        state.upgradesAccordionOpen = !state.upgradesAccordionOpen;
        const accordion = accordionTrigger.closest('.ess-addons-accordion');
        const wrap = accordion?.querySelector('.ess-addons-list-wrap');
        const line = accordion?.querySelector('.ess-accordion-line');

        if (state.upgradesAccordionOpen) {
          if (line) line.classList.add('is-open');
          if (wrap) wrap.classList.add('is-open');
        } else {
          if (wrap) wrap.classList.remove('is-open');
          if (line) line.classList.remove('is-open');
        }

        accordionTrigger.classList.toggle('is-open', state.upgradesAccordionOpen);
        const countBadge = accordionTrigger.querySelector('.ess-accordion-count');
        if (countBadge && state.upgradesAccordionOpen) countBadge.style.display = 'none';
        else if (countBadge) countBadge.style.display = '';
      });
    }
  }

  function handleAddonToggle(box, isChecked) {
    const addonId = box.dataset.addonId;
    const shopifyVariantId = box.dataset.shopifyVariantId;
    const price = box.dataset.price;
    const addonName = box.querySelector('.ess-addon-name')?.textContent?.trim() || 'Upgrade';

    log('Addon toggled:', addonName, 'checked:', isChecked);
    log('Addon data - addonId:', addonId, 'shopifyVariantId:', shopifyVariantId, 'price:', price);

    if (isChecked) {
      state.selectedAddons.set(addonId, { shopifyVariantId, price, addonName });
      box.classList.add('is-selected');
      log('Stored in selectedAddons:', JSON.stringify(Object.fromEntries(state.selectedAddons)));
    } else {
      state.selectedAddons.delete(addonId);
      box.classList.remove('is-selected');
    }

    // Update header text for checkbox addons only (exclude toggle addons)
    const selectedText = document.querySelector('.ess-addons-selected');
    if (selectedText) {
      const checkboxNames = [];
      state.selectedAddons.forEach((val, key) => {
        const isToggle = document.querySelector(`[data-toggle-addon-id="${key}"]`);
        if (!isToggle) checkboxNames.push(val.addonName);
      });
      selectedText.textContent = checkboxNames.length > 0 ? checkboxNames.join(', ') : 'None selected';
    }

    // Update displayed price
    updateDisplayedPrice();

    log('Selected addons:', Array.from(state.selectedAddons.entries()));
  }

  function handleToggleClick(btn) {
    const action = btn.dataset.toggleAction;
    const addonId = btn.dataset.addonId;
    const fieldset = btn.closest('.ess-toggle-group');
    const allBtns = fieldset.querySelectorAll('.ess-toggle-btn');
    const valueSpan = fieldset.querySelector('.ess-toggle-value');

    log('Toggle click:', action, 'addonId:', addonId);

    const wasAlreadyActive = btn.classList.contains('is-active');

    if (action === 'yes' && wasAlreadyActive) {
      btn.classList.remove('is-active');
      const noBtn = fieldset.querySelector('[data-toggle-action="no"]');
      if (noBtn) noBtn.classList.add('is-active');
      state.selectedAddons.delete(addonId);
      if (valueSpan) valueSpan.textContent = 'No';
      log('Toggle YES (deselect) - removed addon:', addonId);
    } else if (action === 'yes') {
      allBtns.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const shopifyVariantId = btn.dataset.shopifyVariantId;
      const price = btn.dataset.price;
      const addonName = fieldset.querySelector('.ess-toggle-title')?.textContent?.replace(/:$/, '').trim() || 'Mount';
      state.selectedAddons.set(addonId, { shopifyVariantId, price, addonName });
      if (valueSpan) valueSpan.textContent = 'Yes';
      log('Toggle YES - stored addon:', addonId, shopifyVariantId, price);
    } else {
      allBtns.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.selectedAddons.delete(addonId);
      if (valueSpan) valueSpan.textContent = 'No';
      log('Toggle NO - removed addon:', addonId);
    }

    updateDisplayedPrice();
    log('Selected addons:', Array.from(state.selectedAddons.entries()));
  }

  function getBasePrice() {
    // Get the current base price from the page (this changes with variant selection)
    const priceEl = document.querySelector('sale-price, .price-list .money, .product-price .money, [data-product-price], .price__current');
    if (priceEl) {
      const priceText = priceEl.textContent.trim();
      // Extract numeric value from price string
      // Handle both formats: "£280.00" (period decimal) and "€175,00" (comma decimal)
      const match = priceText.match(/[\d,.]+/);
      if (match) {
        let numStr = match[0];
        // Detect format: if comma comes after period, it's European (1.234,56)
        // If period comes after comma, it's US/UK (1,234.56)
        const lastComma = numStr.lastIndexOf(',');
        const lastPeriod = numStr.lastIndexOf('.');
        
        if (lastComma > lastPeriod) {
          // European format: 1.234,56 -> 1234.56
          numStr = numStr.replace(/\./g, '').replace(',', '.');
        } else {
          // US/UK format: 1,234.56 -> 1234.56
          numStr = numStr.replace(/,/g, '');
        }
        
        const price = parseFloat(numStr);
        log('getBasePrice: Found base price:', price, 'from:', priceText);
        return price;
      }
    }
    return 0;
  }

  function updateDisplayedPrice() {
    const priceEl = document.querySelector('sale-price, .price-list .money, .product-price .money, [data-product-price], .price__current, .product__price .money, .price .money, .price-item--regular');
    if (!priceEl) {
      console.warn('[ESS Addons] Price element not found - cannot update total. Add a priceSelector or check your theme\'s price element.');
      return;
    }

    // Store original price if not already stored
    if (!state.originalPriceText) {
      state.originalPriceText = priceEl.textContent.trim();
      state.originalPrice = getBasePrice();
      log('updateDisplayedPrice: Stored original price:', state.originalPrice);
    }

    // Calculate total add-on price (API returns prices in local currency via Storefront API)
    let addonsTotal = 0;
    state.selectedAddons.forEach(addon => {
      let addonPrice = parseFloat(addon.price) || 0;
      // No exchange rate conversion needed - API returns prices in local currency
      addonsTotal += addonPrice;
    });

    // Calculate new total
    const newTotal = state.originalPrice + addonsTotal;
    
    // Use currency symbol from detected currency info, or extract from original price
    let currencySymbol;
    if (state.currencyInfo?.activeCurrency) {
      const currencySymbols = {
        'GBP': '£', 'USD': '$', 'EUR': '€', 
        'AUD': 'A$', 'NZD': 'NZ$', 'CAD': 'C$',
        'JPY': '¥', 'CHF': 'CHF ', 'SEK': 'kr ', 'NOK': 'kr ', 'DKK': 'kr '
      };
      currencySymbol = currencySymbols[state.currencyInfo.activeCurrency] || state.currencyInfo.activeCurrency + ' ';
    } else {
      const currencyMatch = state.originalPriceText.match(/^[£$€A-Z]+\$?/);
      currencySymbol = currencyMatch ? currencyMatch[0] : '£';
    }
    
    // Update displayed price
    const newPriceText = `${currencySymbol}${newTotal.toFixed(2)}`;
    priceEl.textContent = newPriceText;
    log('updateDisplayedPrice: Updated to', newPriceText, '(base:', state.originalPrice, '+ addons:', addonsTotal, ')');
  }

  function renderLoading() {
    const container = document.querySelector(CONFIG.containerSelector);
    if (!container) return;
    
    container.innerHTML = `
      <div class="ess-addons">
        <div class="ess-loading">
          <div class="ess-loading-spinner"></div>
          Loading upgrades...
        </div>
      </div>
    `;
  }

  // Debounced update function - prevents multiple rapid calls
  function updateAddons(force = false) {
    // Clear any pending update
    if (state.pendingUpdate) {
      clearTimeout(state.pendingUpdate);
    }
    
    // Debounce: wait 50ms before actually updating
    state.pendingUpdate = setTimeout(() => {
      doUpdateAddons(force);
    }, 50);
  }
  
  async function doUpdateAddons(force = false) {
    log('doUpdateAddons called, force:', force, 'isSubmitting:', state.isSubmitting);
    
    // Skip updates while form is submitting to preserve selected addons
    if (state.isSubmitting) {
      log('Skipping update - form is submitting');
      return;
    }
    
    const variant = getSelectedVariant();
    log('Selected variant:', JSON.stringify(variant));
    
    if (!variant.id) {
      log('No variant ID found - cannot fetch addons');
      return;
    }
    
    const changed = force || 
                    variant.id !== state.currentVariantId || 
                    variant.title !== state.currentVariantTitle;
    
    log('Variant changed?', changed);
    if (!changed) {
      log('Skipping update - no change');
      return;
    }

    // INCREMENT VERSION - any in-flight requests with old version will be discarded
    state.renderVersion++;
    const thisVersion = state.renderVersion;
    log('Starting update version:', thisVersion);

    state.currentVariantId = variant.id;
    state.currentVariantTitle = variant.title;
    
    // Reset stored price so it gets re-read for new variant
    state.originalPriceText = null;
    state.originalPrice = null;

    // Fetch addons (with deduplication in fetchAddons)
    const addons = await fetchAddons(state.productId, variant.title, state.country);
    
    // CHECK VERSION - discard if a newer update started
    if (thisVersion !== state.renderVersion) {
      log('Discarding stale update version:', thisVersion, 'current:', state.renderVersion);
      return;
    }

    // Preserve selections that still exist in the new addon set,
    // updating their variant data (price/shopifyVariantId may change per size).
    // Match by direct addon ID first, then fall back to matching by optionSetId
    // (e.g., "White Box Frame" -> "Black Box Frame" share the same option set).
    const newAddonIds = new Set();
    addons.forEach(a => newAddonIds.add(a.id));

    // Build option set lookup: map old addon IDs to their option set IDs using previous addons
    const prevAddonOptionSetMap = new Map();
    if (state.addons) {
      state.addons.forEach(a => {
        if (a.optionSetId) prevAddonOptionSetMap.set(a.id, a.optionSetId);
      });
    }

    const prevSelections = new Map(state.selectedAddons);
    state.selectedAddons.clear();
    prevSelections.forEach((data, addonId) => {
      if (newAddonIds.has(addonId)) {
        // Direct match — same addon exists in new set
        const matchedAddon = addons.find(a => a.id === addonId);
        const newVariant = matchedAddon?.variants?.[0];
        if (newVariant) {
          state.selectedAddons.set(addonId, {
            shopifyVariantId: newVariant.shopifyVariantId,
            price: newVariant.price,
            addonName: data.addonName,
          });
          log('Preserved addon selection (direct match):', addonId, 'new price:', newVariant.price);
        }
      } else {
        // Try option set match — find new addon in same option set
        const prevOptionSetId = prevAddonOptionSetMap.get(addonId);
        if (prevOptionSetId) {
          const replacement = addons.find(a => a.optionSetId === prevOptionSetId && !state.selectedAddons.has(a.id));
          if (replacement) {
            const newVariant = replacement.variants?.[0];
            if (newVariant) {
              state.selectedAddons.set(replacement.id, {
                shopifyVariantId: newVariant.shopifyVariantId,
                price: newVariant.price,
                addonName: replacement.name,
              });
              log('Preserved addon selection (option set match):', addonId, '->', replacement.id, replacement.name, 'new price:', newVariant.price);
            }
          } else {
            log('No replacement addon found in option set:', prevOptionSetId, 'for:', addonId);
          }
        } else {
          log('Addon no longer available for new variant, removing:', addonId);
        }
      }
    });
    
    state.addons = addons;
    renderAddons(addons);

    if (state.selectedAddons.size > 0) {
      updateDisplayedPrice();
      log('Updated displayed price after preserving', state.selectedAddons.size, 'addon selections');
    }
  }

  function interceptFormSubmit() {
    const form = document.querySelector(CONFIG.formSelector);
    if (!form) {
      log('ERROR: Add to cart form not found with selector:', CONFIG.formSelector);
      return;
    }
    
    log('Form found, attaching submit listener');

    // Also intercept click on the submit button to prevent any button-level AJAX handlers
    const submitBtn = form.querySelector('[type="submit"], button[name="add"], .product-form__submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', (e) => {
        if (state.selectedAddons.size > 0) {
          log('Submit button clicked with addons - preventing native handlers');
          // Stop propagation to prevent theme's AJAX cart handlers
          e.stopImmediatePropagation();
          // Don't prevent default - let the form submit event fire
        }
      }, true); // Capture phase to run before other handlers
    }

    // Use capture phase to ensure we handle this before any other handlers
    form.addEventListener('submit', async (e) => {
      log('=== FORM SUBMIT TRIGGERED ===');
      log('Selected addons count:', state.selectedAddons.size);
      
      // Prevent double submission
      if (state.isSubmitting) {
        log('Already submitting - preventing duplicate');
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      
      // Set flag to prevent updateAddons from clearing selection during submit
      state.isSubmitting = true;
      
      if (state.selectedAddons.size === 0) {
        log('No addons selected - allowing normal form submit');
        state.isSubmitting = false;
        return;
      }

      e.preventDefault();
      e.stopImmediatePropagation();
      log('Default form submission prevented, handling custom cart add');

      const items = [];

      // Get the main product variant ID from hidden input (not from labels)
      const hiddenInput = form.querySelector('input[name="id"][type="hidden"], input[name="id"]');
      const mainVariantId = hiddenInput ? hiddenInput.value : null;
      log('Main variant input found:', !!hiddenInput, 'value:', mainVariantId);
      
      if (mainVariantId && !isNaN(parseInt(mainVariantId))) {
        const quantityInput = form.querySelector('[name="quantity"]');
        const quantity = quantityInput ? parseInt(quantityInput.value) || 1 : 1;
        items.push({
          id: parseInt(mainVariantId),
          quantity: quantity
        });
        log('Adding main product:', mainVariantId, 'qty:', quantity);
      } else {
        log('ERROR: Could not find valid main variant ID');
        // Let form submit normally as fallback
        form.submit();
        return;
      }

      // Get artwork info for addon properties - get CURRENT values from page
      const artworkTitle = document.querySelector('h1.product__title, h1[class*="title"], .product-single__title, h1')?.textContent?.trim() || 'Artwork';
      
      // Get current variant title fresh from the labels (not cached state)
      const currentVariantTitle = extractVariantTitleFromLabels();
      const currentSize = extractSizeFromVariant(currentVariantTitle) || currentVariantTitle.split('/')[0]?.trim() || currentVariantTitle;
      
      log('Cart properties - Artwork:', artworkTitle, 'Size:', currentSize);
      
      log('Processing', state.selectedAddons.size, 'selected addons:');
      state.selectedAddons.forEach((data, addonId) => {
        log('Addon entry:', addonId, '-> shopifyVariantId:', data.shopifyVariantId, 'parsed:', parseInt(data.shopifyVariantId));
        const addonVariantId = parseInt(data.shopifyVariantId);
        if (isNaN(addonVariantId)) {
          log('ERROR: Invalid addon variant ID!', data.shopifyVariantId);
          return;
        }
        items.push({
          id: addonVariantId,
          quantity: 1,
          properties: {
            'For': artworkTitle,
            'Size': currentSize,
            '_linked_product': state.productId
          }
        });
      });

      log('=== ADDING TO CART ===');
      log('Items to add:', JSON.stringify(items, null, 2));
      
      // TEMP DEBUG: Show items before redirect (remove after debugging)
      if (window.EASTSIDE_ADDONS_DEBUG) {
        alert('DEBUG - Items being added to cart:\n\n' + JSON.stringify(items, null, 2));
      }
      
      try {
        const response = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items })
        });

        log('Cart response status:', response.status);
        
        const responseText = await response.text();
        log('Cart raw response:', responseText);
        
        // TEMP DEBUG: Show Shopify response
        if (window.EASTSIDE_ADDONS_DEBUG) {
          alert('DEBUG - Shopify response (status ' + response.status + '):\n\n' + responseText.substring(0, 1000));
        }
        
        if (!response.ok) {
          log('Cart error response:', responseText);
          throw new Error(`Failed to add to cart: ${response.status}`);
        }
        
        const cartData = JSON.parse(responseText);
        log('Cart add SUCCESS:', cartData);

        // Reset submitting flag
        state.isSubmitting = false;

        if (typeof options.onCartSuccess === 'function') {
          options.onCartSuccess(cartData, items);
          return;
        }

        if (options.redirectToCart) {
          log('Redirecting to cart...');
          if (window.location.href.includes('/cart')) {
            window.location.reload();
          } else {
            window.location.href = '/cart';
          }
        } else {
          document.dispatchEvent(new CustomEvent('ess:cart:added', { detail: { items, cartData } }));
        }
      } catch (error) {
        log('Cart error:', error);
        state.isSubmitting = false;
        if (typeof options.onCartError === 'function') {
          options.onCartError(error, items);
        } else {
          log('Falling back to native form submit');
          form.submit();
        }
      }
    }, true); // Use capture phase to intercept before other handlers
  }

  function observeVariantChanges() {
    const select = document.querySelector('select[name="id"]');
    if (select) {
      select.addEventListener('change', updateAddons);
    }

    const radios = document.querySelectorAll('input[name="id"]');
    radios.forEach(radio => {
      radio.addEventListener('change', updateAddons);
    });

    // Add click listeners to all variant picker buttons/labels
    // These are the clickable elements for Size and Frame options
    const variantButtons = document.querySelectorAll('.variant-picker label, .variant-picker input, .block-swatch label, .block-swatch input, [data-option-value], .product-form__option label');
    log('Found variant buttons to observe:', variantButtons.length);
    variantButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        log('Variant button clicked, scheduling forced refresh');
        // Clear current state to force refresh
        state.currentVariantId = null;
        state.currentVariantTitle = null;
        // updateAddons has built-in debounce (50ms), just call it
        // Small delay for Shopify to update selection state
        setTimeout(() => updateAddons(true), 80);
      });
    });

    const variantContainer = document.querySelector('[data-variant-selector], .product-form__input, .variant-picker');
    if (variantContainer) {
      const observer = new MutationObserver((mutations) => {
        // Ignore mutations within our addon container
        const isAddonMutation = mutations.some(m => 
          m.target.closest && m.target.closest('#ess-addons-container, .ess-addons')
        );
        if (isAddonMutation) {
          log('MutationObserver: Ignoring addon container mutation');
          return;
        }
        log('MutationObserver detected change');
        updateAddons();
      });
      observer.observe(variantContainer, { 
        attributes: true, 
        subtree: true,
        childList: true,
        attributeFilter: ['data-selected-variant', 'aria-checked', 'checked', 'class']
      });
    }
    
    // Also observe the product form for any changes
    const productForm = document.querySelector('form[action*="/cart/add"]');
    if (productForm) {
      const formObserver = new MutationObserver((mutations) => {
        // Ignore mutations within our addon container
        const isAddonMutation = mutations.some(m => 
          m.target.closest && m.target.closest('#ess-addons-container, .ess-addons')
        );
        if (isAddonMutation) {
          log('Form observer: Ignoring addon container mutation');
          return;
        }
        log('Product form mutation detected');
        updateAddons();
      });
      formObserver.observe(productForm, {
        attributes: true,
        subtree: true,
        childList: true
      });
    }
  }

  function init(initOptions = {}) {
    log('=== init() called ===');
    log('initOptions:', JSON.stringify(initOptions));
    log('Already initialized?', state.initialized);
    
    if (state.initialized) {
      log('Skipping - already initialized');
      return;
    }

    injectStyles();
    log('Styles injected');

    const container = document.querySelector(CONFIG.containerSelector);
    log('Container found?', !!container);
    if (container) {
      log('Container element:', container.outerHTML.substring(0, 200));
      log('Container data-product-id:', container.dataset.productId);
    }
    
    if (container && container.dataset.productId) {
      state.productId = container.dataset.productId;
      log('Product ID from container:', state.productId);
    }
    if (initOptions.productId) {
      state.productId = initOptions.productId;
      log('Product ID from initOptions:', state.productId);
    }

    if (container) {
      for (const key of Object.keys(container.dataset)) {
        if (key.startsWith('meta') && key !== 'metaDescription') {
          state.productMeta[key] = container.dataset[key];
          log('Product meta from container data-attr:', key, '=', container.dataset[key]);
        }
      }
    }
    if (initOptions.meta) {
      Object.assign(state.productMeta, initOptions.meta);
      log('Product meta from initOptions:', state.productMeta);
    }
    detectShopifyMetafields();
    log('Final product meta:', JSON.stringify(state.productMeta));

    if (!state.productId) {
      log('ERROR: No product ID provided - widget will not render');
      log('Make sure container has data-product-id attribute or pass productId in init()');
      return;
    }

    if (initOptions.redirectToCart !== undefined) {
      options.redirectToCart = initOptions.redirectToCart;
    }
    if (initOptions.onCartSuccess) {
      options.onCartSuccess = initOptions.onCartSuccess;
    }
    if (initOptions.onCartError) {
      options.onCartError = initOptions.onCartError;
    }

    state.country = detectCountry();
    log('Detected country:', state.country);
    
    // Detect currency info from Shopify Markets
    state.currencyInfo = detectCurrencyInfo();
    log('Detected currency info:', state.currencyInfo);
    
    log('Initialization complete - preloading all addons...');

    // Start preloading ALL addons immediately (non-blocking)
    preloadAllAddons(state.country);
    
    // Initial render (will use preloaded data when ready)
    updateAddons();
    observeVariantChanges();
    interceptFormSubmit();

    state.initialized = true;
    log('=== Widget fully initialized ===');
  }

  window.ESSAddons = {
    init,
    refresh: () => updateAddons(true),
    updateAddons,
    getSelectedAddons: () => Array.from(state.selectedAddons.entries()),
    setDebug: (enabled) => { CONFIG.debug = enabled; },
    setProductId: (id) => { 
      state.productId = id; 
      updateAddons(true); 
    },
    // Refresh currency info (call after user changes currency selector)
    refreshCurrency: () => {
      state.currencyInfo = detectCurrencyInfo();
      log('Currency info refreshed:', state.currencyInfo);
      renderAddons(state.addons); // Re-render with new currency
    },
    // Get current currency info for debugging
    getCurrencyInfo: () => state.currencyInfo
  };

  // Try to find container and init, with retries for late-rendered elements
  // Shopify editor can be very slow to render custom blocks
  function tryAutoInit(attempt = 1, maxAttempts = 30) {
    const container = document.querySelector(CONFIG.containerSelector);
    
    // Only log every 5th attempt to reduce noise
    if (attempt === 1 || attempt % 5 === 0 || container) {
      log(`Auto-init attempt ${attempt}/${maxAttempts}: Container found?`, !!container);
    }
    
    if (container) {
      log('Auto-init: Container has data-product-id?', !!container.dataset.productId);
      if (container.dataset.productId) {
        log('Auto-init: Calling init()');
        init();
        return true;
      } else {
        log('Auto-init: Container found but missing data-product-id');
        // Container exists but no product ID - wait for it to be set
      }
    }
    
    // Retry with delay - longer delays for Shopify editor compatibility
    if (attempt < maxAttempts) {
      const delay = 500; // Check every 500ms for up to 15 seconds
      setTimeout(() => tryAutoInit(attempt + 1, maxAttempts), delay);
    } else {
      log('Auto-init: FAILED - container not found after', maxAttempts, 'attempts (15 seconds)');
      log('Make sure you have: <div id="ess-addons-container" data-product-id="{{ product.id }}"></div>');
    }
    return false;
  }

  log('Document readyState:', document.readyState);
  
  if (document.readyState === 'loading') {
    log('Waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', () => {
      log('DOMContentLoaded fired');
      tryAutoInit();
    });
  } else {
    log('DOM already ready - starting auto-init with retries...');
    tryAutoInit();
  }

})();
