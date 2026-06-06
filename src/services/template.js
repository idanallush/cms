export function renderTemplate(frozenTemplate, contentMap) {
  let html = frozenTemplate;

  for (const [slotId, slot] of Object.entries(contentMap)) {
    const placeholder = `{{${slotId}}}`;
    html = html.replaceAll(placeholder, slot.value);
  }

  return html;
}
