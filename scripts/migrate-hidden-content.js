/**
 * Migration: Re-tag frozen templates with improved ingest rules.
 * Preserves existing content edits by matching old slots to new slots.
 *
 * Usage: node scripts/migrate-hidden-content.js [siteId]
 *   If siteId is provided, only migrates that site.
 *   Otherwise, migrates all sites.
 */
import mongoose from 'mongoose';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
dotenv.config();

const SiteSchema = new mongoose.Schema({}, { strict: false, collection: 'sites' });
const Site = mongoose.model('Site', SiteSchema);

// ── Ingest logic (duplicated from ingest.js to run standalone) ──

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'th', 'label']);
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
    return tag && (INLINE_TAGS.has(tag) || tag === 'svg');
  });
}

function isAlreadyTagged($el) {
  return $el.attr('data-slot-id') !== undefined;
}

function retagTemplate($) {
  // Remove ALL existing data-slot-id and data-slot-type attributes
  $('[data-slot-id]').each((_, el) => {
    $(el).removeAttr('data-slot-id');
    $(el).removeAttr('data-slot-type');
  });

  const contentMap = {};
  let slotCounter = 0;
  const taggedElements = new Set();

  function tagElement(el, $el, tag, slotType, value) {
    if (taggedElements.has(el)) return null;
    taggedElements.add(el);
    const elPath = buildElementPath(el, $);
    const slotId = generateSlotId(tag, elPath, slotCounter++);
    $el.attr('data-slot-id', slotId);
    $el.attr('data-slot-type', slotType);
    contentMap[slotId] = { type: slotType, value, tag, path: elPath };
    return slotId;
  }

  // Process text elements
  TEXT_TAGS.forEach(tag => {
    $(tag).each((i, el) => {
      const $el = $(el);
      if (isAlreadyTagged($el)) return;
      const text = $el.text().trim();
      if (!text) return;
      const hasInline = $el.children().length > 0 && hasOnlyInlineChildren($el);
      if (hasInline) {
        tagElement(el, $el, tag, 'richtext', $el.html());
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
      contentMap[textSlotId] = { type: hasInline ? 'richtext' : 'text', value: hasInline ? $el.html() : text, tag: 'a', path: elPath };
      slotIds.push(textSlotId);
    }
    if (href) {
      const hrefSlotId = generateSlotId('a_href', elPath, slotCounter++);
      contentMap[hrefSlotId] = { type: 'link', value: href, tag: 'a', path: elPath };
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
    contentMap[srcSlotId] = { type: 'image', value: src, tag: 'img', path: elPath };
    const altSlotId = generateSlotId('img_alt', elPath, slotCounter++);
    contentMap[altSlotId] = { type: 'text', value: alt, tag: 'img', path: elPath };
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

  // Process spans: text-only OR inline-only children
  $('span').each((i, el) => {
    const $el = $(el);
    if (isAlreadyTagged($el)) return;
    const text = $el.text().trim();
    if (!text) return;
    if ($el.closest('[data-slot-id]').length > 0) return;
    if ($el.children().length === 0) {
      tagElement(el, $el, 'span', 'text', text);
    } else if (hasOnlyInlineChildren($el)) {
      tagElement(el, $el, 'span', 'richtext', $el.html());
    }
  });

  // Process divs: text-only, inline-only children, or mixed text+inline
  $('div').each((i, el) => {
    const $el = $(el);
    if (isAlreadyTagged($el)) return;
    if (hasChildBlockElements($el)) return;
    const text = $el.text().trim();
    if (!text) return;
    if ($el.closest('[data-slot-id]').length > 0) return;
    if ($el.children().length === 0) {
      tagElement(el, $el, 'div', 'text', text);
    } else if (hasOnlyInlineChildren($el)) {
      tagElement(el, $el, 'div', 'richtext', $el.html());
    }
  });

  return contentMap;
}

function normalizeText(val) {
  if (!val) return '';
  return val.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().substring(0, 100);
}

function mergeContentMaps(oldMap, newMap) {
  const merged = {};
  const matchedOld = new Set();

  // Build lookup index from old slots by normalized text value
  const oldByText = new Map();
  for (const [slotId, slot] of Object.entries(oldMap)) {
    const key = `${slot.tag}:${slot.type}:${normalizeText(slot.value)}`;
    if (!oldByText.has(key)) oldByText.set(key, []);
    oldByText.get(key).push({ slotId, slot });
  }

  // Also build lookup by path
  const oldByPath = new Map();
  for (const [slotId, slot] of Object.entries(oldMap)) {
    if (slot.path) oldByPath.set(slot.path + ':' + slot.type, { slotId, slot });
  }

  for (const [newSlotId, newSlot] of Object.entries(newMap)) {
    // Try to match by path first (most reliable)
    const pathKey = newSlot.path + ':' + newSlot.type;
    const pathMatch = oldByPath.get(pathKey);
    if (pathMatch && !matchedOld.has(pathMatch.slotId)) {
      // Use old value (preserves user edits) but new slot ID
      merged[newSlotId] = { ...newSlot, value: pathMatch.slot.value };
      matchedOld.add(pathMatch.slotId);
      continue;
    }

    // Try to match by tag + type + text content
    const textKey = `${newSlot.tag}:${newSlot.type}:${normalizeText(newSlot.value)}`;
    const textMatches = oldByText.get(textKey);
    if (textMatches) {
      const unmatched = textMatches.find(m => !matchedOld.has(m.slotId));
      if (unmatched) {
        merged[newSlotId] = { ...newSlot, value: unmatched.slot.value };
        matchedOld.add(unmatched.slotId);
        continue;
      }
    }

    // New slot — use the freshly-parsed value
    merged[newSlotId] = newSlot;
  }

  return { merged, newSlotCount: Object.keys(newMap).length - matchedOld.size, preservedCount: matchedOld.size };
}

async function migrateSite(site) {
  console.log(`\n═══ Migrating: "${site.name}" (${site.siteId}) ═══`);

  if (!site.pages || site.pages.length === 0) {
    console.log('  No pages found, skipping');
    return { name: site.name, skipped: true };
  }

  const results = [];

  for (const page of site.pages) {
    console.log(`  Page: ${page.slug} (${page.pageId})`);
    const template = page.frozenTemplate;
    if (!template) {
      console.log('    No template, skipping');
      continue;
    }

    const oldMap = page.contentMap || {};
    const oldSlotCount = Object.keys(oldMap).length;

    // Re-parse the frozen template with new tagging rules
    const $ = cheerio.load(template, { decodeEntities: false });
    const newMap = retagTemplate($);
    const newTemplate = $.html();
    const newSlotCount = Object.keys(newMap).length;

    // Merge: preserve user edits, add new slots
    const { merged, newSlotCount: addedCount, preservedCount } = mergeContentMaps(oldMap, newMap);

    console.log(`    Old slots: ${oldSlotCount}`);
    console.log(`    New slots: ${newSlotCount}`);
    console.log(`    Preserved edits: ${preservedCount}`);
    console.log(`    New (added): ${addedCount}`);

    // Update in DB
    await Site.updateOne(
      { siteId: site.siteId, 'pages.pageId': page.pageId },
      {
        $set: {
          'pages.$.frozenTemplate': newTemplate,
          'pages.$.contentMap': merged,
          'pages.$.slotCount': Object.keys(merged).length,
        }
      }
    );

    // Also update top-level contentMap if this is the index page
    if (page.isIndex) {
      await Site.updateOne(
        { siteId: site.siteId },
        { $set: { frozenTemplate: newTemplate, contentMap: merged, slotCount: Object.keys(merged).length } }
      );
    }

    results.push({
      page: page.slug,
      oldSlots: oldSlotCount,
      newSlots: Object.keys(merged).length,
      preserved: preservedCount,
      added: addedCount,
    });
  }

  return { name: site.name, results };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const targetSiteId = process.argv[2];
  let sites;

  if (targetSiteId) {
    const site = await Site.findOne({ siteId: targetSiteId }).lean();
    if (!site) {
      console.error(`Site not found: ${targetSiteId}`);
      process.exit(1);
    }
    sites = [site];
  } else {
    sites = await Site.find({}).lean();
  }

  console.log(`Found ${sites.length} site(s) to migrate`);

  const allResults = [];
  for (const site of sites) {
    const result = await migrateSite(site);
    allResults.push(result);
  }

  console.log('\n\n═══════════════════════════════════════');
  console.log('MIGRATION SUMMARY');
  console.log('═══════════════════════════════════════');
  for (const r of allResults) {
    if (r.skipped) {
      console.log(`  ${r.name}: SKIPPED`);
    } else {
      console.log(`  ${r.name}:`);
      for (const p of r.results) {
        console.log(`    ${p.page}: ${p.oldSlots} → ${p.newSlots} slots (${p.preserved} preserved, ${p.added} new)`);
      }
    }
  }

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
