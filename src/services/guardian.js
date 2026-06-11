import sanitizeHtml from 'sanitize-html';

const URL_REGEX = /^https?:\/\/.+/i;
const DANGEROUS_HREF = /^javascript:/i;
const HTML_TAG_REGEX = /<[^>]+>/g;

const STRUCTURAL_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button', 'label']);

export function validateChanges(changes, currentContentMap) {
  const errors = [];
  const sanitizedChanges = {};

  for (const [slotId, newValue] of Object.entries(changes)) {
    const slot = currentContentMap[slotId];

    if (!slot) {
      errors.push(`Slot "${slotId}" does not exist in the template`);
      continue;
    }

    if (newValue === null || newValue === undefined) {
      if (STRUCTURAL_TAGS.has(slot.tag)) {
        errors.push(`Slot "${slotId}" (${slot.tag}) is a structural element and cannot be empty`);
        continue;
      }
    }

    const valueStr = String(newValue ?? '');

    if (slot.type === 'text') {
      if (HTML_TAG_REGEX.test(valueStr)) {
        errors.push(`Slot "${slotId}": HTML tags are not allowed in text slots`);
        continue;
      }
      if (STRUCTURAL_TAGS.has(slot.tag) && valueStr.trim() === '') {
        errors.push(`Slot "${slotId}" (${slot.tag}) is a structural element and cannot be empty`);
        continue;
      }
      sanitizedChanges[slotId] = { ...slot, value: valueStr };
    } else if (slot.type === 'richtext') {
      if (STRUCTURAL_TAGS.has(slot.tag) && valueStr.trim() === '') {
        errors.push(`Slot "${slotId}" (${slot.tag}) is a structural element and cannot be empty`);
        continue;
      }
      const cleanValue = sanitizeHtml(valueStr, {
        allowedTags: ['b', 'i', 'u', 'em', 'strong', 'a', 'br', 'span', 'sub', 'sup', 'p', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'],
        allowedAttributes: { '*': ['class', 'style'], 'a': ['href', 'target', 'rel'] },
      });
      sanitizedChanges[slotId] = { ...slot, value: cleanValue };
    } else if (slot.type === 'image') {
      if (!URL_REGEX.test(valueStr)) {
        errors.push(`Slot "${slotId}": image URL must be a valid http/https URL`);
        continue;
      }
      sanitizedChanges[slotId] = { ...slot, value: valueStr };
    } else if (slot.type === 'link') {
      if (DANGEROUS_HREF.test(valueStr)) {
        errors.push(`Slot "${slotId}": javascript: URLs are not allowed`);
        continue;
      }
      if (valueStr && !valueStr.startsWith('/') && !valueStr.startsWith('#') && !URL_REGEX.test(valueStr)) {
        errors.push(`Slot "${slotId}": link must be a valid URL, relative path, or anchor`);
        continue;
      }
      sanitizedChanges[slotId] = { ...slot, value: valueStr };
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitizedChanges,
  };
}

// ── Style override validation ──

const ALLOWED_STYLE_PROPS = new Set([
  'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'fontSize', 'lineHeight', 'letterSpacing', 'textAlign',
  'color', 'backgroundColor', 'fontWeight', 'fontStyle',
  'borderRadius', 'opacity',
]);

const NUMERIC_PROPS = new Set([
  'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'fontSize', 'lineHeight', 'letterSpacing', 'borderRadius',
]);

const BOUNDS = {
  marginTop: [-200, 200], marginBottom: [-200, 200],
  marginLeft: [-200, 200], marginRight: [-200, 200],
  paddingTop: [0, 200], paddingBottom: [0, 200],
  paddingLeft: [0, 200], paddingRight: [0, 200],
  fontSize: [8, 120], lineHeight: [0.5, 4],
  letterSpacing: [-5, 20], borderRadius: [0, 100],
  opacity: [0, 1],
};

const TEXT_ALIGN_VALUES = new Set(['left', 'center', 'right', 'justify']);
const FONT_WEIGHT_VALUES = new Set(['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900']);
const FONT_STYLE_VALUES = new Set(['normal', 'italic']);
const COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function validateStyleOverrides(styles) {
  const errors = [];
  const sanitizedStyles = {};

  for (const [slotId, overrides] of Object.entries(styles)) {
    if (!overrides || typeof overrides !== 'object') {
      errors.push(`Style for "${slotId}" must be an object`);
      continue;
    }

    const sanitized = {};
    for (const [prop, value] of Object.entries(overrides)) {
      if (!ALLOWED_STYLE_PROPS.has(prop)) {
        errors.push(`Style property "${prop}" is not allowed for slot "${slotId}"`);
        continue;
      }

      if (NUMERIC_PROPS.has(prop)) {
        const num = Number(value);
        if (isNaN(num)) {
          errors.push(`"${prop}" must be a number for slot "${slotId}"`);
          continue;
        }
        const [min, max] = BOUNDS[prop] || [-Infinity, Infinity];
        if (num < min || num > max) {
          errors.push(`"${prop}" must be between ${min} and ${max} for slot "${slotId}"`);
          continue;
        }
        sanitized[prop] = num;
      } else if (prop === 'textAlign') {
        if (!TEXT_ALIGN_VALUES.has(value)) {
          errors.push(`"textAlign" must be left/center/right/justify for slot "${slotId}"`);
          continue;
        }
        sanitized[prop] = value;
      } else if (prop === 'fontWeight') {
        if (!FONT_WEIGHT_VALUES.has(String(value))) {
          errors.push(`Invalid fontWeight for slot "${slotId}"`);
          continue;
        }
        sanitized[prop] = String(value);
      } else if (prop === 'fontStyle') {
        if (!FONT_STYLE_VALUES.has(value)) {
          errors.push(`Invalid fontStyle for slot "${slotId}"`);
          continue;
        }
        sanitized[prop] = value;
      } else if (prop === 'color' || prop === 'backgroundColor') {
        if (!COLOR_REGEX.test(value)) {
          errors.push(`"${prop}" must be a hex color for slot "${slotId}"`);
          continue;
        }
        sanitized[prop] = value;
      } else if (prop === 'opacity') {
        const num = Number(value);
        if (isNaN(num) || num < 0 || num > 1) {
          errors.push(`"opacity" must be between 0 and 1 for slot "${slotId}"`);
          continue;
        }
        sanitized[prop] = num;
      }
    }

    if (Object.keys(sanitized).length > 0) {
      sanitizedStyles[slotId] = sanitized;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitizedStyles,
  };
}
