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
  let html = frozenTemplate;

  for (const [slotId, slot] of Object.entries(contentMap)) {
    const placeholder = `{{${slotId}}}`;
    html = html.replaceAll(placeholder, slot.value);
  }

  // Apply style overrides if present
  if (styles && Object.keys(styles).length > 0) {
    for (const [slotId, overrides] of Object.entries(styles)) {
      if (!overrides || Object.keys(overrides).length === 0) continue;
      const inlineStyle = buildInlineStyle(overrides);
      // Find elements with this slot ID and inject inline styles
      const slotAttr = `data-slot-id="${slotId}"`;
      const slotAttrComma = `data-slot-id="${slotId},`;

      // Handle exact match
      html = html.replace(
        new RegExp(`(${escapeRegex(slotAttr)}[^>]*?)style="([^"]*)"`, 'g'),
        `$1style="$2;${inlineStyle}"`
      );
      // Handle comma-separated (multi-slot)
      html = html.replace(
        new RegExp(`(${escapeRegex(slotAttrComma)}[^>]*?)style="([^"]*)"`, 'g'),
        `$1style="$2;${inlineStyle}"`
      );

      // If no existing style attribute, add one
      if (!html.includes(`${slotAttr}`) || true) {
        html = html.replace(
          new RegExp(`(${escapeRegex(slotAttr)})(?![^>]*style=)`, 'g'),
          `$1 style="${inlineStyle}"`
        );
      }
    }
  }

  return html;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
