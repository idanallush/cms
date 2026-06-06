import axios from 'axios';
import * as cheerio from 'cheerio';

const TEXT_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'span', 'li', 'td', 'th', 'label'
]);

const BUTTON_TAGS = new Set(['button']);
const LINK_TAG = 'a';
const IMAGE_TAG = 'img';
const SUBMIT_SELECTOR = 'input[type="submit"]';

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

export async function ingestUrl(url) {
  const response = await axios.get(url, {
    headers: { 'User-Agent': 'ClientCMS-Ingest/1.0' },
    timeout: 15000,
    maxRedirects: 5,
  });

  const html = response.data;
  const $ = cheerio.load(html);

  const contentMap = {};
  let slotCounter = 0;

  // Process text elements
  TEXT_TAGS.forEach(tag => {
    $(tag).each((i, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      if (!text) return;

      // Skip if element contains child elements that are also text tags (avoid duplication)
      if ($el.children().filter((_, child) => TEXT_TAGS.has(child.tagName)).length > 0) return;

      const elPath = buildElementPath(el, $);
      const slotId = generateSlotId(tag, elPath, slotCounter++);

      contentMap[slotId] = {
        type: 'text',
        value: text,
        tag,
        path: elPath,
      };

      $el.attr('data-slot-id', slotId);
      $el.attr('data-slot-type', 'text');
      $el.empty().text(`{{${slotId}}}`);
    });
  });

  // Process links
  $(LINK_TAG).each((i, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    const text = $el.text().trim();
    const elPath = buildElementPath(el, $);

    const slotIds = [];

    if (text) {
      const textSlotId = generateSlotId('a_text', elPath, slotCounter++);
      contentMap[textSlotId] = {
        type: 'text',
        value: text,
        tag: 'a',
        path: elPath,
      };
      $el.empty().text(`{{${textSlotId}}}`);
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
      $el.attr('href', `{{${hrefSlotId}}}`);
      slotIds.push(hrefSlotId);
    }

    if (slotIds.length) {
      $el.attr('data-slot-id', slotIds.join(','));
      $el.attr('data-slot-type', 'link');
    }
  });

  // Process images
  $(IMAGE_TAG).each((i, el) => {
    const $el = $(el);
    const src = $el.attr('src');
    const alt = $el.attr('alt') || '';
    const elPath = buildElementPath(el, $);

    if (src) {
      const srcSlotId = generateSlotId('img_src', elPath, slotCounter++);
      contentMap[srcSlotId] = {
        type: 'image',
        value: src,
        tag: 'img',
        path: elPath,
      };
      $el.attr('src', `{{${srcSlotId}}}`);

      const altSlotId = generateSlotId('img_alt', elPath, slotCounter++);
      contentMap[altSlotId] = {
        type: 'text',
        value: alt,
        tag: 'img',
        path: elPath,
      };
      $el.attr('alt', `{{${altSlotId}}}`);

      $el.attr('data-slot-id', [srcSlotId, altSlotId].join(','));
      $el.attr('data-slot-type', 'image');
    }
  });

  // Process buttons
  BUTTON_TAGS.forEach(tag => {
    $(tag).each((i, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      if (!text) return;

      const elPath = buildElementPath(el, $);
      const slotId = generateSlotId('button', elPath, slotCounter++);

      contentMap[slotId] = {
        type: 'text',
        value: text,
        tag: 'button',
        path: elPath,
      };

      $el.attr('data-slot-id', slotId);
      $el.attr('data-slot-type', 'text');
      $el.empty().text(`{{${slotId}}}`);
    });
  });

  // Process submit inputs
  $(SUBMIT_SELECTOR).each((i, el) => {
    const $el = $(el);
    const value = $el.attr('value') || '';
    if (!value) return;

    const elPath = buildElementPath(el, $);
    const slotId = generateSlotId('submit', elPath, slotCounter++);

    contentMap[slotId] = {
      type: 'text',
      value,
      tag: 'input',
      path: elPath,
    };

    $el.attr('data-slot-id', slotId);
    $el.attr('data-slot-type', 'text');
    $el.attr('value', `{{${slotId}}}`);
  });

  const frozenTemplate = $.html();

  return { frozenTemplate, contentMap };
}
