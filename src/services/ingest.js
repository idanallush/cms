import axios from 'axios';
import * as cheerio from 'cheerio';

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const TEXT_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'li', 'td', 'th', 'label',
]);
const BUTTON_TAGS = new Set(['button']);
const LINK_TAG = 'a';
const IMAGE_TAG = 'img';
const SUBMIT_SELECTOR = 'input[type="submit"]';

const INLINE_TAGS = new Set(['span', 'strong', 'em', 'b', 'i', 'u', 'mark', 'small', 'sub', 'sup', 'a', 'br']);
const BLOCK_TAGS = new Set(['div', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main', 'ul', 'ol', 'table', 'form', 'fieldset', 'figure', 'blockquote', 'pre', 'hr']);

function generateSlotId(tagName, path, index) {
  const sanitized = path.replace(/[^a-z0-9]/gi, '_').slice(0, 60);
  return `${tagName}_${sanitized}_${index}`;
}

function buildElementPath(el, $) {
  const parts = [];
  let current = el;
  while (current && current.type === 'tag') {
    const tag = current.tagName;
    const siblings = $(current).parent().children(tag);
    const idx = siblings.index(current);
    parts.unshift(`${tag}[${idx}]`);
    current = current.parent;
  }
  return parts.join('>');
}

function hasChildBlockElements($el) {
  return $el.children().toArray().some(child => {
    const tag = child.tagName?.toLowerCase();
    return tag && (BLOCK_TAGS.has(tag) || TEXT_TAGS.has(tag) || HEADING_TAGS.has(tag));
  });
}

function hasOnlyInlineChildren($el) {
  const children = $el.children().toArray();
  return children.every(child => {
    const tag = child.tagName?.toLowerCase();
    return tag && INLINE_TAGS.has(tag);
  });
}

function isAlreadyTagged($el) {
  return $el.attr('data-slot-id') !== undefined;
}

// ── URL absolutization ──

function makeAbsolute(relativeUrl, pageUrl) {
  if (!relativeUrl) return relativeUrl;
  if (relativeUrl.startsWith('data:')) return relativeUrl;
  if (relativeUrl.startsWith('mailto:')) return relativeUrl;
  if (relativeUrl.startsWith('tel:')) return relativeUrl;
  if (relativeUrl.startsWith('#')) return relativeUrl;
  if (relativeUrl.startsWith('javascript:')) return relativeUrl;
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) return relativeUrl;
  if (relativeUrl.startsWith('//')) return 'https:' + relativeUrl;
  try {
    return new URL(relativeUrl, pageUrl).href;
  } catch {
    return relativeUrl;
  }
}

function convertAllUrlsToAbsolute($, pageUrl) {
  if (!pageUrl || pageUrl === 'pasted-html') return;

  // Images: src, srcset
  $('img').each((i, el) => {
    const src = $(el).attr('src');
    if (src) $(el).attr('src', makeAbsolute(src, pageUrl));
    const srcset = $(el).attr('srcset');
    if (srcset) {
      $(el).attr('srcset', srcset.split(',').map(s => {
        const parts = s.trim().split(/\s+/);
        parts[0] = makeAbsolute(parts[0], pageUrl);
        return parts.join(' ');
      }).join(', '));
    }
  });

  // Stylesheets
  $('link[href]').each((i, el) => {
    $(el).attr('href', makeAbsolute($(el).attr('href'), pageUrl));
  });

  // Scripts
  $('script[src]').each((i, el) => {
    $(el).attr('src', makeAbsolute($(el).attr('src'), pageUrl));
  });

  // Video, audio, source elements
  $('video, audio, source').each((i, el) => {
    const src = $(el).attr('src');
    if (src) $(el).attr('src', makeAbsolute(src, pageUrl));
    const poster = $(el).attr('poster');
    if (poster) $(el).attr('poster', makeAbsolute(poster, pageUrl));
  });

  // Links (a href) — keep #anchor links as-is
  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
    if (href && !href.startsWith('#')) {
      $(el).attr('href', makeAbsolute(href, pageUrl));
    }
  });

  // Object/embed elements
  $('object[data], embed[src]').each((i, el) => {
    const data = $(el).attr('data');
    if (data) $(el).attr('data', makeAbsolute(data, pageUrl));
    const src = $(el).attr('src');
    if (src) $(el).attr('src', makeAbsolute(src, pageUrl));
  });

  // Background images in inline style="" attributes
  $('[style]').each((i, el) => {
    let style = $(el).attr('style');
    if (style && style.includes('url(')) {
      style = style.replace(/url\(\s*['"]?([^'")]+?)['"]?\s*\)/g, (match, url) => {
        return `url('${makeAbsolute(url.trim(), pageUrl)}')`;
      });
      $(el).attr('style', style);
    }
  });

  // Background images in embedded <style> tags
  $('style').each((i, el) => {
    let css = $(el).html();
    if (css && css.includes('url(')) {
      css = css.replace(/url\(\s*['"]?([^'")]+?)['"]?\s*\)/g, (match, url) => {
        return `url('${makeAbsolute(url.trim(), pageUrl)}')`;
      });
      $(el).html(css);
    }
  });

  // Meta tags with URLs (og:image, etc)
  $('meta[content]').each((i, el) => {
    const property = $(el).attr('property') || $(el).attr('name') || '';
    if (property.includes('image') || property.includes('url') || property.includes('icon')) {
      const content = $(el).attr('content');
      if (content && (content.startsWith('/') || content.startsWith('./'))) {
        $(el).attr('content', makeAbsolute(content, pageUrl));
      }
    }
  });

  // Form actions
  $('form[action]').each((i, el) => {
    const action = $(el).attr('action');
    if (action) $(el).attr('action', makeAbsolute(action, pageUrl));
  });

  // iframes
  $('iframe[src]').each((i, el) => {
    $(el).attr('src', makeAbsolute($(el).attr('src'), pageUrl));
  });
}

// ── Force visibility (targeted, not global) ──

function forceAllVisible($) {
  const forceVisibleCSS = `
<style data-cms-override="true">
  /* Target ONLY animation-related hidden elements */
  [data-aos],
  [data-animate],
  [data-animation],
  [data-scroll],
  [data-sr],
  .aos-init,
  .aos-animate,
  .wow,
  .animated,
  .elementor-invisible,
  .elementor-widget,
  [class*="aos-"],
  [class*="fade-"],
  [class*="slide-"],
  [class*="zoom-"],
  [class*="reveal"],
  section,
  article,
  div[class*="section"],
  div[class*="block"],
  div[class*="row"],
  div[class*="col"],
  div[class*="container"],
  div[class*="wrapper"],
  div[class*="hero"],
  div[class*="feature"],
  div[class*="content"],
  div[class*="about"],
  div[class*="service"],
  div[class*="testimonial"],
  div[class*="pricing"],
  div[class*="contact"],
  div[class*="footer"],
  div[class*="header"],
  div[class*="banner"],
  div[class*="card"],
  div[class*="grid"],
  div[class*="gallery"],
  div[class*="team"],
  div[class*="faq"],
  div[class*="cta"],
  main, header, footer, nav,
  h1, h2, h3, h4, h5, h6,
  p, img, a, button, ul, ol, li,
  figure, figcaption, picture {
    opacity: 1 !important;
    visibility: visible !important;
    transform: none !important;
  }

  /* Disable all animations and transitions globally */
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }

  /* HIDE common overlays, modals, popups, cookie banners */
  [class*="cookie"],
  [class*="consent"],
  [class*="gdpr"],
  [class*="popup"],
  [class*="modal"],
  [class*="lightbox"],
  [class*="overlay"][class*="fixed"],
  [class*="loading-screen"],
  [class*="preloader"],
  [class*="loader"],
  [class*="splash"],
  [id*="cookie"],
  [id*="consent"],
  [id*="gdpr"],
  [id*="popup"],
  [id*="modal"],
  [id*="overlay"],
  [id*="preloader"],
  [id*="loader"],
  .modal-backdrop,
  .overlay-backdrop,
  .cookie-banner,
  .cookie-notice,
  .cc-window,
  .cc-banner,
  #onetrust-banner-sdk,
  #onetrust-consent-sdk,
  .osano-cm-window,
  [aria-modal="true"],
  dialog[open],
  div[role="dialog"],
  div[role="alertdialog"] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  /* Hide fixed-position overlays that cover the whole page */
  body > div[style*="position: fixed"][style*="z-index"],
  body > div[style*="position:fixed"][style*="z-index"] {
    display: none !important;
  }
</style>`;

  if ($('head').length) {
    $('head').append(forceVisibleCSS);
  } else if ($('body').length) {
    $('body').append(forceVisibleCSS);
  }
}

function forceExpandHiddenContent($) {
  const forceExpandCSS = `
<style data-cms-expand="true">
  /* Force accordion/collapse/FAQ content open — exclude nav/menu elements */
  details:not(nav details) > summary ~ * { display: block !important; }

  [class*="collapse"]:not(.navbar-collapse):not([class*="carousel"]):not(nav *):not([class*="nav-"]):not([class*="menu-"]),
  [class*="accordion-body"]:not(nav *),
  [class*="accordion-content"]:not(nav *),
  [class*="accordion-panel"]:not(nav *),
  [class*="faq-answer"],
  [class*="faq-content"],
  [class*="read-more-content"],
  [class*="expandable"]:not(nav *):not([class*="nav-"]):not([class*="menu-"]),
  [class*="toggled-content"]:not(nav *):not([class*="nav-"]):not([class*="menu-"]),
  .collapse:not(.show):not(.navbar-collapse):not([class*="carousel"]):not(nav *),
  .collapsing:not([class*="carousel"]):not(nav *) {
    display: block !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    opacity: 1 !important;
    visibility: visible !important;
  }

  /* Preserve navbar/menu toggle behavior */
  nav [class*="collapse"],
  [class*="navbar"] [class*="collapse"],
  [class*="nav-menu"],
  [class*="mobile-menu"],
  [class*="hamburger-menu"] {
    /* Don't override — let original CSS control these */
  }

  /* Ensure editable elements are always clickable */
  [data-slot-id] {
    pointer-events: auto !important;
    cursor: pointer !important;
  }

  /* Neutralize click-blocking overlay elements */
  a[class*="overlay"],
  div[class*="overlay"]:not([class*="cookie"]):not([class*="modal"]):not([class*="popup"]),
  [class*="elementor-element-overlay"],
  [class*="click-overlay"],
  [class*="link-overlay"] {
    pointer-events: none !important;
  }
</style>`;

  if ($('head').length) {
    $('head').append(forceExpandCSS);
  } else if ($('body').length) {
    $('body').append(forceExpandCSS);
  }

  // Set all <details> elements to open
  $('details').attr('open', '');

  // Expand "read more" / "show more" hidden content
  $('a, button, span').each((i, el) => {
    const text = ($(el).text().trim() || '').toLowerCase();
    if (text.includes('read more') || text.includes('קרא עוד') || text.includes('show more') || text.includes('הצג עוד')) {
      const parent = $(el).parent();
      parent.find('[style*="display: none"], [style*="display:none"]').css('display', 'block');
      if ($(el).attr('aria-expanded') === 'false') {
        $(el).attr('aria-expanded', 'true');
      }
    }
  });
}

function removeOverlaysAndPopups($) {
  // Cookie consent elements
  $('[class*="cookie-consent"], [class*="cookie-banner"], [class*="cookie-notice"]').remove();
  $('[id*="cookie-consent"], [id*="cookie-banner"], [id*="gdpr"]').remove();
  $('.cc-window, .cc-banner, #onetrust-banner-sdk, #onetrust-consent-sdk').remove();
  $('.osano-cm-window').remove();

  // Modal backdrops
  $('.modal-backdrop, .overlay-backdrop').remove();

  // Preloaders/loading screens
  $('[class*="preloader"], [class*="loading-screen"], [id*="preloader"]').remove();
}

function removeAnimationScripts($) {
  $('script').each((i, el) => {
    const src = ($(el).attr('src') || '').toLowerCase();
    const content = $(el).html() || '';
    // AOS
    if (src.includes('aos.js') || src.includes('aos.min.js') || content.includes('AOS.init')) {
      $(el).remove();
      return;
    }
    // WOW.js
    if (src.includes('wow.js') || src.includes('wow.min.js') || content.includes('new WOW')) {
      $(el).remove();
      return;
    }
    // Cookie/consent scripts
    if (src.includes('cookie') || src.includes('consent') || src.includes('gdpr') ||
        src.includes('onetrust') || src.includes('osano') || src.includes('cookiebot')) {
      $(el).remove();
      return;
    }
  });

  // Remove AOS stylesheet
  $('link[href*="aos"]').remove();
}

function fixLazyLoadedImages($, pageUrl) {
  $('img').each((i, el) => {
    const $el = $(el);
    // Convert data-src / data-lazy-src to src
    const dataSrc = $el.attr('data-src') || $el.attr('data-lazy-src');
    if (dataSrc && !$el.attr('src')) {
      $el.attr('src', makeAbsolute(dataSrc, pageUrl));
    }
    // Remove lazy loading attribute
    $el.removeAttr('loading');
    $el.removeAttr('data-src');
    $el.removeAttr('data-lazy-src');
    // Remove lazy classes
    const cls = $el.attr('class') || '';
    if (cls.includes('lazy')) {
      $el.attr('class', cls.replace(/\blazy\b/g, '').replace(/\blazyload\b/g, '').trim());
    }
  });

  // Convert data-bg to inline background-image
  $('[data-bg]').each((i, el) => {
    const $el = $(el);
    const bg = $el.attr('data-bg');
    if (bg) {
      const currentStyle = $el.attr('style') || '';
      const separator = currentStyle && !currentStyle.endsWith(';') ? ';' : '';
      $el.attr('style', currentStyle + separator + ` background-image: url('${makeAbsolute(bg, pageUrl)}') !important;`);
    }
  });
}

const MAX_HTML_SIZE = 10 * 1024 * 1024; // 10MB

export async function ingestHtml(rawHtml, sourceUrl) {
  try {
    if (typeof rawHtml === 'string' && rawHtml.length > MAX_HTML_SIZE) {
      throw new Error(`HTML too large (${(rawHtml.length / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`);
    }
    return parseHtml(rawHtml, sourceUrl || 'pasted-html');
  } catch (err) {
    console.error('[ingest.ingestHtml] Error:', err.message);
    throw err;
  }
}

export async function ingestUrl(url) {
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'ClientCMS-Ingest/1.0' },
      timeout: 30000,
      maxRedirects: 5,
      maxContentLength: MAX_HTML_SIZE,
    });

    const html = response.data;
    if (typeof html === 'string' && html.length > MAX_HTML_SIZE) {
      throw new Error(`Page too large (${(html.length / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`);
    }
    return parseHtml(html, url);
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      console.error('[ingest.ingestUrl] Timeout fetching URL:', url);
      throw new Error('Page took too long to load (30s timeout). Try again or paste the HTML directly.');
    }
    if (err.response) {
      console.error(`[ingest.ingestUrl] HTTP ${err.response.status} for URL:`, url);
      throw new Error(`Failed to fetch page: HTTP ${err.response.status}`);
    }
    console.error('[ingest.ingestUrl] Error:', err.message);
    throw err;
  }
}

function parseHtml(html, pageUrl) {
  let $;
  try {
    $ = cheerio.load(html, { decodeEntities: false });
  } catch (err) {
    console.error('[ingest.parseHtml] Cheerio parsing failed:', err.message);
    throw new Error('Failed to parse HTML. The page may contain malformed markup.');
  }

  try {
    convertAllUrlsToAbsolute($, pageUrl);
  } catch (err) {
    console.error('[ingest.parseHtml] URL absolutization failed (continuing):', err.message);
  }

  try { removeOverlaysAndPopups($); } catch (err) {
    console.error('[ingest.parseHtml] removeOverlaysAndPopups failed (continuing):', err.message);
  }

  try { forceAllVisible($); } catch (err) {
    console.error('[ingest.parseHtml] forceAllVisible failed (continuing):', err.message);
  }

  try { forceExpandHiddenContent($); } catch (err) {
    console.error('[ingest.parseHtml] forceExpandHiddenContent failed (continuing):', err.message);
  }

  try { removeAnimationScripts($); } catch (err) {
    console.error('[ingest.parseHtml] removeAnimationScripts failed (continuing):', err.message);
  }

  try { fixLazyLoadedImages($, pageUrl); } catch (err) {
    console.error('[ingest.parseHtml] fixLazyLoadedImages failed (continuing):', err.message);
  }

  const contentMap = {};
  let slotCounter = 0;
  const taggedElements = new Set();

  function tagElement(el, $el, tag, slotType, value, extra) {
    if (taggedElements.has(el)) return;
    taggedElements.add(el);

    const elPath = buildElementPath(el, $);
    const slotId = generateSlotId(tag, elPath, slotCounter++);

    $el.attr('data-slot-id', slotId);
    $el.attr('data-slot-type', slotType);

    contentMap[slotId] = {
      type: slotType,
      value,
      tag,
      path: elPath,
      ...extra,
    };

    return slotId;
  }

  // Process text elements (h1-h6, p, li, td, th, label)
  TEXT_TAGS.forEach(tag => {
    $(tag).each((i, el) => {
      const $el = $(el);
      if (isAlreadyTagged($el)) return;

      const text = $el.text().trim();
      if (!text) return;

      const hasInline = $el.children().length > 0 && hasOnlyInlineChildren($el);

      if (hasInline) {
        const innerHTML = $el.html();
        tagElement(el, $el, tag, 'richtext', innerHTML);
      } else if ($el.children().filter((_, child) => TEXT_TAGS.has(child.tagName?.toLowerCase())).length > 0) {
        return;
      } else {
        tagElement(el, $el, tag, 'text', text);
      }
    });
  });

  // Process links
  $(LINK_TAG).each((i, el) => {
    const $el = $(el);
    if (isAlreadyTagged($el)) return;

    const href = $el.attr('href');
    const text = $el.text().trim();
    if (!href && !text) return;

    const elPath = buildElementPath(el, $);
    const slotIds = [];

    if (text) {
      const hasInline = $el.children().length > 0 && hasOnlyInlineChildren($el);
      const textSlotId = generateSlotId('a_text', elPath, slotCounter++);
      contentMap[textSlotId] = {
        type: hasInline ? 'richtext' : 'text',
        value: hasInline ? $el.html() : text,
        tag: 'a',
        path: elPath,
      };
      slotIds.push(textSlotId);
    }

    if (href) {
      const hrefSlotId = generateSlotId('a_href', elPath, slotCounter++);
      contentMap[hrefSlotId] = {
        type: 'link',
        value: href,
        tag: 'a',
        path: elPath,
      };
      slotIds.push(hrefSlotId);
    }

    if (slotIds.length) {
      $el.attr('data-slot-id', slotIds.join(','));
      $el.attr('data-slot-type', 'link');
      taggedElements.add(el);
    }
  });

  // Process images
  $(IMAGE_TAG).each((i, el) => {
    const $el = $(el);
    if (isAlreadyTagged($el)) return;

    const src = $el.attr('src');
    if (!src) return;

    const alt = $el.attr('alt') || '';
    const elPath = buildElementPath(el, $);

    const srcSlotId = generateSlotId('img_src', elPath, slotCounter++);
    contentMap[srcSlotId] = {
      type: 'image',
      value: src,
      tag: 'img',
      path: elPath,
    };

    const altSlotId = generateSlotId('img_alt', elPath, slotCounter++);
    contentMap[altSlotId] = {
      type: 'text',
      value: alt,
      tag: 'img',
      path: elPath,
    };

    $el.attr('data-slot-id', [srcSlotId, altSlotId].join(','));
    $el.attr('data-slot-type', 'image');
    taggedElements.add(el);
  });

  // Process buttons
  BUTTON_TAGS.forEach(tag => {
    $(tag).each((i, el) => {
      const $el = $(el);
      if (isAlreadyTagged($el)) return;

      const text = $el.text().trim();
      if (!text) return;

      const hasInline = $el.children().length > 0 && hasOnlyInlineChildren($el);
      tagElement(el, $el, 'button', hasInline ? 'richtext' : 'text', hasInline ? $el.html() : text);
    });
  });

  // Process submit inputs
  $(SUBMIT_SELECTOR).each((i, el) => {
    const $el = $(el);
    if (isAlreadyTagged($el)) return;

    const value = $el.attr('value') || '';
    if (!value) return;

    tagElement(el, $el, 'submit', 'text', value);
  });

  // Process span and div that contain only text (no child block elements)
  $('span').each((i, el) => {
    const $el = $(el);
    if (isAlreadyTagged($el)) return;
    if ($el.children().length > 0) return;
    const text = $el.text().trim();
    if (!text) return;
    if ($el.closest('[data-slot-id]').length > 0) return;

    tagElement(el, $el, 'span', 'text', text);
  });

  $('div').each((i, el) => {
    const $el = $(el);
    if (isAlreadyTagged($el)) return;
    if (hasChildBlockElements($el)) return;
    if ($el.children().length > 0) return;
    const text = $el.text().trim();
    if (!text) return;
    if ($el.closest('[data-slot-id]').length > 0) return;

    tagElement(el, $el, 'div', 'text', text);
  });

  const frozenTemplate = $.html();

  console.log(`Ingest complete: ${Object.keys(contentMap).length} editable slots found`);

  return { frozenTemplate, contentMap };
}
