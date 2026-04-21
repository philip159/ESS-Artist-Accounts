/**
 * East Side Studio - Frame Preview Widget for Shopify
 * Version: 1.0.0
 *
 * CSS layer-based frame + mount preview system.
 * Overlays are pre-generated PNGs served from Shopify CDN (theme assets).
 * Switching options only toggles CSS classes and swaps cached image URLs.
 *
 * Layer stack (bottom to top):
 *   1. Shadow (CSS box-shadow)
 *   2. Artwork image (inset via CSS padding)
 *   3. Mount overlay (optional, transparent centre PNG)
 *   4. Frame overlay (transparent centre PNG)
 *
 * Usage:
 *   <div id="ess-frame-preview"
 *        data-product-id="{{ product.id }}"
 *        data-has-mount="{{ product.metafields.custom.has_mount | default: 'false' }}"
 *        data-artwork-url="{{ product.featured_image | image_url: width: 800 }}"
 *        data-sizes="A4,A3,A2,A1,A0"
 *        data-default-size="A3"
 *        data-default-frame="black"
 *        data-overlay-base="{{ 'frame-a3-black.png' | asset_url | split: 'frame-a3-black.png' | first }}">
 *   </div>
 *   <script src="{{ 'shopify-frame-preview.js' | asset_url }}" defer></script>
 */
(function () {
  'use strict';

  var FRAME_WIDTH_MM = 21;

  var SIZE_DATA = {
    A4: { w: 210, h: 297, mountMm: 40 },
    A3: { w: 297, h: 420, mountMm: 50 },
    A2: { w: 420, h: 594, mountMm: 50 },
    A1: { w: 594, h: 841, mountMm: 50 },
    A0: { w: 841, h: 1189, mountMm: 50 }
  };

  function pct(partMm, totalMm) {
    return (partMm / totalMm) * 100;
  }

  function getInsets(sizeId, withMount) {
    var s = SIZE_DATA[sizeId];
    if (!s) return { frame: 8, mount: 0, total: 8 };
    var totalW = s.w + FRAME_WIDTH_MM * 2;
    var totalH = s.h + FRAME_WIDTH_MM * 2;
    var framePctW = pct(FRAME_WIDTH_MM, totalW);
    var framePctH = pct(FRAME_WIDTH_MM, totalH);
    var mountPctW = withMount ? pct(s.mountMm, totalW) : 0;
    var mountPctH = withMount ? pct(s.mountMm, totalH) : 0;
    return {
      framePctW: framePctW,
      framePctH: framePctH,
      mountPctW: mountPctW,
      mountPctH: mountPctH,
      totalW: framePctW + mountPctW,
      totalH: framePctH + mountPctH,
      aspectRatio: totalW / totalH
    };
  }

  function overlayFilename(type, sizeId, style) {
    if (type === 'mount') return 'mount-' + sizeId.toLowerCase() + '.png';
    return 'frame-' + sizeId.toLowerCase() + '-' + style + '.png';
  }

  var CSS = '\n\
.ess-fp { position:relative; width:100%; max-width:600px; margin:0 auto; }\n\
.ess-fp__wrapper { position:relative; width:100%; overflow:hidden; }\n\
.ess-fp__shadow { position:absolute; inset:0; pointer-events:none; }\n\
.ess-fp__artwork { position:absolute; object-fit:cover; z-index:1; transition:all .15s ease; }\n\
.ess-fp__mount { position:absolute; inset:0; z-index:2; pointer-events:none; opacity:0; transition:opacity .15s ease; }\n\
.ess-fp__mount.active { opacity:1; }\n\
.ess-fp__frame { position:absolute; inset:0; z-index:3; pointer-events:none; transition:opacity .1s ease; }\n\
.ess-fp__frame.hidden { opacity:0; }\n\
.ess-fp__controls { display:flex; flex-wrap:wrap; gap:0.75rem; align-items:center; margin-top:0.75rem; }\n\
.ess-fp__swatch { width:28px; height:28px; border-radius:50%; border:2px solid transparent; cursor:pointer; transition:border-color .15s, box-shadow .15s; padding:0; }\n\
.ess-fp__swatch.active { border-color:currentColor; box-shadow:0 0 0 2px currentColor; }\n\
.ess-fp__swatch:focus { outline:2px solid currentColor; outline-offset:2px; }\n\
.ess-fp__mount-toggle { display:flex; align-items:center; gap:0.4rem; font-size:0.85rem; cursor:pointer; user-select:none; }\n\
.ess-fp__mount-toggle input { cursor:pointer; }\n\
';

  function injectStyles() {
    if (document.getElementById('ess-fp-styles')) return;
    var style = document.createElement('style');
    style.id = 'ess-fp-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function create(tag, cls, attrs) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (attrs) {
      for (var k in attrs) {
        if (k === 'style' && typeof attrs[k] === 'object') {
          for (var s in attrs[k]) el.style[s] = attrs[k][s];
        } else {
          el.setAttribute(k, attrs[k]);
        }
      }
    }
    return el;
  }

  function ESSFramePreview(container) {
    this.container = container;
    this.productId = container.dataset.productId || '';
    this.hasMount = container.dataset.hasMount === 'true';
    this.artworkUrl = container.dataset.artworkUrl || '';
    this.sizes = (container.dataset.sizes || 'A4,A3,A2,A1,A0').split(',').map(function (s) { return s.trim(); });
    this.overlayBase = container.dataset.overlayBase || '';
    this.currentSize = container.dataset.defaultSize || this.sizes[0] || 'A3';
    this.currentFrame = container.dataset.defaultFrame || 'black';
    this.mountEnabled = this.hasMount;

    this._preloadCache = {};
    this._build();
    this._update();
    this._preloadAll();
    this._listenExternalEvents();
  }

  ESSFramePreview.prototype._build = function () {
    var self = this;

    this.root = create('div', 'ess-fp');
    this.wrapper = create('div', 'ess-fp__wrapper');
    this.root.appendChild(this.wrapper);

    this.shadowEl = create('div', 'ess-fp__shadow');
    this.wrapper.appendChild(this.shadowEl);

    this.artworkEl = create('img', 'ess-fp__artwork', {
      src: this.artworkUrl,
      alt: 'Artwork preview',
      draggable: 'false'
    });
    this.wrapper.appendChild(this.artworkEl);

    this.mountEl = create('img', 'ess-fp__mount', { alt: 'Mount overlay', draggable: 'false' });
    this.wrapper.appendChild(this.mountEl);

    this.frameEls = {};
    var frames = ['black', 'white', 'natural'];
    for (var i = 0; i < frames.length; i++) {
      var img = create('img', 'ess-fp__frame hidden', {
        alt: frames[i] + ' frame overlay',
        draggable: 'false',
        'data-frame': frames[i]
      });
      this.frameEls[frames[i]] = img;
      this.wrapper.appendChild(img);
    }

    var controls = create('div', 'ess-fp__controls');

    var swatches = [
      { id: 'black', color: '#1a1a1a', label: 'Black frame' },
      { id: 'white', color: '#f5f5f0', label: 'White frame', border: '1px solid #ccc' },
      { id: 'natural', color: '#8B7355', label: 'Natural oak frame' }
    ];

    for (var j = 0; j < swatches.length; j++) {
      (function (sw) {
        var btn = create('button', 'ess-fp__swatch', {
          'aria-label': sw.label,
          'data-testid': 'ess-fp-swatch-' + sw.id,
          style: {
            backgroundColor: sw.color,
            border: sw.border || '2px solid transparent'
          }
        });
        if (sw.id === self.currentFrame) btn.classList.add('active');
        btn.addEventListener('click', function () {
          self.setFrame(sw.id);
        });
        controls.appendChild(btn);
      })(swatches[j]);
    }

    if (this.hasMount) {
      var mountToggle = create('label', 'ess-fp__mount-toggle');
      this.mountCheckbox = document.createElement('input');
      this.mountCheckbox.type = 'checkbox';
      this.mountCheckbox.checked = this.mountEnabled;
      this.mountCheckbox.setAttribute('data-testid', 'ess-fp-mount-toggle');
      var label = document.createTextNode(' Mount');
      mountToggle.appendChild(this.mountCheckbox);
      mountToggle.appendChild(label);
      this.mountCheckbox.addEventListener('change', function () {
        self.setMount(self.mountCheckbox.checked);
      });
      controls.appendChild(mountToggle);
    }

    this.root.appendChild(controls);
    this.container.appendChild(this.root);
  };

  ESSFramePreview.prototype._update = function () {
    var insets = getInsets(this.currentSize, this.mountEnabled && this.hasMount);
    var sizeData = SIZE_DATA[this.currentSize];
    if (!sizeData) return;

    var totalW = sizeData.w + FRAME_WIDTH_MM * 2;
    var totalH = sizeData.h + FRAME_WIDTH_MM * 2;
    this.wrapper.style.paddingBottom = ((totalH / totalW) * 100).toFixed(4) + '%';

    this.artworkEl.style.left = insets.totalW + '%';
    this.artworkEl.style.top = insets.totalH + '%';
    this.artworkEl.style.width = (100 - insets.totalW * 2) + '%';
    this.artworkEl.style.height = (100 - insets.totalH * 2) + '%';

    this.shadowEl.style.boxShadow = '6px 6px 18px rgba(0,0,0,0.3)';

    var base = this.overlayBase;

    for (var f in this.frameEls) {
      var isActive = f === this.currentFrame;
      this.frameEls[f].classList.toggle('hidden', !isActive);
      if (isActive && base) {
        this.frameEls[f].src = base + overlayFilename('frame', this.currentSize, f);
      }
    }

    if (this.hasMount && base) {
      this.mountEl.src = base + overlayFilename('mount', this.currentSize);
    }
    this.mountEl.classList.toggle('active', this.mountEnabled && this.hasMount);

    this.container.dataset.selectedFrame = this.currentFrame;
    this.container.dataset.selectedSize = this.currentSize;
  };

  ESSFramePreview.prototype._preloadAll = function () {
    var self = this;
    if (!this.overlayBase) return;

    var frames = ['black', 'white', 'natural'];
    for (var si = 0; si < this.sizes.length; si++) {
      for (var fi = 0; fi < frames.length; fi++) {
        (function (url) {
          if (self._preloadCache[url]) return;
          var img = new Image();
          img.src = url;
          self._preloadCache[url] = img;
        })(this.overlayBase + overlayFilename('frame', this.sizes[si], frames[fi]));
      }
      if (this.hasMount) {
        (function (url) {
          if (self._preloadCache[url]) return;
          var img = new Image();
          img.src = url;
          self._preloadCache[url] = img;
        })(this.overlayBase + overlayFilename('mount', this.sizes[si]));
      }
    }
  };

  ESSFramePreview.prototype.setFrame = function (style) {
    this.currentFrame = style;
    var swatches = this.root.querySelectorAll('.ess-fp__swatch');
    for (var i = 0; i < swatches.length; i++) {
      swatches[i].classList.toggle('active', swatches[i].getAttribute('aria-label').toLowerCase().indexOf(style) !== -1);
    }
    this._update();
    this._dispatch('ess:frame-change', { frame: style, size: this.currentSize });
  };

  ESSFramePreview.prototype.setSize = function (sizeId) {
    if (!SIZE_DATA[sizeId]) return;
    this.currentSize = sizeId;
    this._update();
    this._dispatch('ess:size-change', { frame: this.currentFrame, size: sizeId });
  };

  ESSFramePreview.prototype.setMount = function (enabled) {
    if (!this.hasMount) return;
    this.mountEnabled = enabled;
    if (this.mountCheckbox) this.mountCheckbox.checked = enabled;
    this._update();
    this._dispatch('ess:mount-change', { mount: enabled, size: this.currentSize });
  };

  ESSFramePreview.prototype.setArtwork = function (url) {
    this.artworkUrl = url;
    this.artworkEl.src = url;
  };

  ESSFramePreview.prototype._dispatch = function (name, detail) {
    detail.productId = this.productId;
    this.container.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail }));
  };

  ESSFramePreview.prototype._listenExternalEvents = function () {
    var self = this;

    document.addEventListener('ess:addon-frame-change', function (e) {
      if (e.detail && e.detail.frame) {
        var map = { 'Box Frame - Black': 'black', 'Box Frame - White': 'white', 'Box Frame - Natural Oak': 'natural', 'black': 'black', 'white': 'white', 'natural': 'natural', 'oak': 'natural' };
        var mapped = map[e.detail.frame] || e.detail.frame;
        if (SIZE_DATA[self.currentSize] || mapped === 'black' || mapped === 'white' || mapped === 'natural') {
          self.setFrame(mapped);
        }
      }
    });

    document.addEventListener('ess:addon-mount-change', function (e) {
      if (e.detail && typeof e.detail.mount === 'boolean') {
        self.setMount(e.detail.mount);
      }
    });

    var variantSelects = document.querySelectorAll('[data-option-name*="ize"], [data-option-name*="Size"], select[name="option1"]');
    for (var i = 0; i < variantSelects.length; i++) {
      variantSelects[i].addEventListener('change', function (e) {
        var val = (e.target.value || '').toUpperCase().trim();
        if (SIZE_DATA[val]) {
          self.setSize(val);
        } else {
          for (var key in SIZE_DATA) {
            if (val.indexOf(key) !== -1) {
              self.setSize(key);
              break;
            }
          }
        }
      });
    }
  };

  function initAll() {
    injectStyles();
    var containers = document.querySelectorAll('[id="ess-frame-preview"], [data-ess-frame-preview]');
    var instances = [];
    for (var i = 0; i < containers.length; i++) {
      if (containers[i]._essFramePreview) continue;
      var instance = new ESSFramePreview(containers[i]);
      containers[i]._essFramePreview = instance;
      instances.push(instance);
    }
    return instances;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  window.ESSFramePreview = {
    init: initAll,
    _constructor: ESSFramePreview,
    sizes: SIZE_DATA
  };

})();
