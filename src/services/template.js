import * as cheerio from 'cheerio';
import DOMPurify from 'isomorphic-dompurify';

const UNIT_PROPS = new Set([
  'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'fontSize', 'borderRadius',
]);

const UNITLESS_PROPS = new Set(['lineHeight', 'opacity']);

const CSS_PROP_MAP = {
  marginTop: 'margin-top', marginBottom: 'margin-bottom',
  marginLeft: 'margin-left', marginRight: 'margin-right',
  paddingTop: 'padding-top', paddingBottom: 'padding-bottom',
  paddingLeft: 'padding-left', paddingRight: 'padding-right',
  fontSize: 'font-size', lineHeight: 'line-height',
  letterSpacing: 'letter-spacing', textAlign: 'text-align',
  backgroundColor: 'background-color', fontWeight: 'font-weight',
  fontStyle: 'font-style', borderRadius: 'border-radius',
};

function buildInlineStyle(overrides) {
  const parts = [];
  for (const [prop, value] of Object.entries(overrides)) {
    const cssProp = CSS_PROP_MAP[prop] || prop;
    if (UNIT_PROPS.has(prop)) {
      parts.push(`${cssProp}:${value}px`);
    } else if (prop === 'letterSpacing') {
      parts.push(`${cssProp}:${value}px`);
    } else if (UNITLESS_PROPS.has(prop)) {
      parts.push(`${cssProp}:${value}`);
    } else {
      parts.push(`${cssProp}:${value}`);
    }
  }
  return parts.join(';');
}

export function renderTemplate(frozenTemplate, contentMap, styles) {
  const $ = cheerio.load(frozenTemplate, { decodeEntities: false });

  for (const [slotId, slot] of Object.entries(contentMap)) {
    // Handle multi-slot elements (links, images with comma-separated IDs)
    const els = $(`[data-slot-id="${slotId}"]`);
    // Also find elements where slotId is part of a comma-separated list
    const multiEls = $('[data-slot-id]').filter((_, el) => {
      const attr = $(el).attr('data-slot-id');
      return attr && attr.split(',').includes(slotId);
    });

    const allEls = els.length > 0 ? els : multiEls;

    allEls.each((_, el) => {
      const $el = $(el);

      if (slot.type === 'text' || slot.type === 'richtext') {
        if (slot.tag === 'img') {
          $el.attr('alt', slot.value);
        } else if (slot.tag === 'input') {
          $el.attr('value', slot.value);
        } else {
          const safeValue = slot.type === 'richtext'
            ? DOMPurify.sanitize(slot.value)
            : slot.value;
          $el.html(safeValue);
        }
      } else if (slot.type === 'image') {
        $el.attr('src', slot.value);
      } else if (slot.type === 'link') {
        $el.attr('href', slot.value);
      }
    });
  }

  // Apply style overrides
  if (styles && Object.keys(styles).length > 0) {
    for (const [slotId, overrides] of Object.entries(styles)) {
      if (!overrides || Object.keys(overrides).length === 0) continue;
      const inlineStyle = buildInlineStyle(overrides);

      const els = $(`[data-slot-id="${slotId}"]`);
      const multiEls = $('[data-slot-id]').filter((_, el) => {
        const attr = $(el).attr('data-slot-id');
        return attr && attr.split(',').includes(slotId);
      });
      const allEls = els.length > 0 ? els : multiEls;

      allEls.each((_, el) => {
        const $el = $(el);
        const existing = $el.attr('style') || '';
        const separator = existing && !existing.endsWith(';') ? ';' : '';
        $el.attr('style', existing + separator + inlineStyle);
      });
    }
  }

  return $.html();
}
