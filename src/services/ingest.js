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

export async function ingestHtml(rawHtml, sourceUrl) {
  return parseHtml(rawHtml, sourceUrl || 'pasted-html');
}

export async function ingestUrl(url) {
  const response = await axios.get(url, {
    headers: { 'User-Agent': 'ClientCMS-Ingest/1.0' },
    timeout: 15000,
    maxRedirects: 5,
  });

  const html = response.data;
  return parseHtml(html, url);
}

function parseHtml(html, pageUrl) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // Step 1: Convert all relative URLs to absolute
  convertAllUrlsToAbsolute($, pageUrl);

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
