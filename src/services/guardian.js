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
