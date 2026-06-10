/**
 * Phase 4 tests: Style controls + Image upload validation
 * Run: node test/test-phase4.js
 */

import { validateStyleOverrides } from '../src/services/guardian.js';
import { renderTemplate } from '../src/services/template.js';
import { ingestHtml } from '../src/services/ingest.js';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

// ─── Style validation tests ───

console.log('\n── Guardian: style validation ──');

// T1: New style properties accepted
{
  const result = validateStyleOverrides({
    'slot-1': {
      color: '#ff0000',
      backgroundColor: '#00ff00',
      borderRadius: 12,
      opacity: 0.5,
      fontStyle: 'italic',
    },
  });
  assert(result.valid === true, 'Accepts color, backgroundColor, borderRadius, opacity, fontStyle');
  assert(result.sanitizedStyles['slot-1'].color === '#ff0000', 'Color value preserved');
  assert(result.sanitizedStyles['slot-1'].backgroundColor === '#00ff00', 'BG color value preserved');
  assert(result.sanitizedStyles['slot-1'].borderRadius === 12, 'Border radius value preserved');
  assert(result.sanitizedStyles['slot-1'].opacity === 0.5, 'Opacity value preserved');
  assert(result.sanitizedStyles['slot-1'].fontStyle === 'italic', 'Font style value preserved');
}

// T2: Color hex validation
{
  const result = validateStyleOverrides({
    'slot-1': { color: 'red' },
  });
  assert(result.valid === false, 'Rejects non-hex color "red"');
  assert(result.errors[0].includes('hex color'), 'Error message mentions hex');
}

{
  const result = validateStyleOverrides({
    'slot-1': { color: '#fff' },
  });
  assert(result.valid === true, 'Accepts 3-char hex color #fff');
}

{
  const result = validateStyleOverrides({
    'slot-1': { color: '#ff00ff80' },
  });
  assert(result.valid === true, 'Accepts 8-char hex color with alpha');
}

// T3: Opacity bounds
{
  const result = validateStyleOverrides({
    'slot-1': { opacity: 1.5 },
  });
  assert(result.valid === false, 'Rejects opacity > 1');
}

{
  const result = validateStyleOverrides({
    'slot-1': { opacity: -0.1 },
  });
  assert(result.valid === false, 'Rejects opacity < 0');
}

{
  const result = validateStyleOverrides({
    'slot-1': { opacity: 0 },
  });
  assert(result.valid === true, 'Accepts opacity = 0');
  assert(result.sanitizedStyles['slot-1'].opacity === 0, 'Opacity 0 preserved (not falsy-dropped)');
}

// T4: Border radius bounds
{
  const result = validateStyleOverrides({
    'slot-1': { borderRadius: 101 },
  });
  assert(result.valid === false, 'Rejects borderRadius > 100');
}

{
  const result = validateStyleOverrides({
    'slot-1': { borderRadius: -1 },
  });
  assert(result.valid === false, 'Rejects borderRadius < 0');
}

// T5: Font style validation
{
  const result = validateStyleOverrides({
    'slot-1': { fontStyle: 'oblique' },
  });
  assert(result.valid === false, 'Rejects fontStyle "oblique" (only normal/italic allowed)');
}

// T6: Disallowed property still rejected
{
  const result = validateStyleOverrides({
    'slot-1': { display: 'none' },
  });
  assert(result.valid === false, 'Rejects disallowed property "display"');
}

// T7: Mixed valid + invalid
{
  const result = validateStyleOverrides({
    'slot-1': { color: '#333', opacity: 2 },
  });
  assert(result.valid === false, 'Rejects when any property is invalid');
}

// T8: Empty overrides produce no sanitized output
{
  const result = validateStyleOverrides({
    'slot-1': {},
  });
  assert(result.valid === true, 'Empty overrides are valid');
  assert(!result.sanitizedStyles['slot-1'], 'Empty overrides produce no output');
}

// ─── Template rendering with new styles ───

console.log('\n── Template: rendering new style props ──');

{
  const html = `<html><body><h1 data-slot-id="s1">Hello</h1></body></html>`;
  const { frozenTemplate, contentMap } = await ingestHtml(html);

  const styles = {
    s1: {
      color: '#ff0000',
      backgroundColor: '#000000',
      borderRadius: 8,
      opacity: 0.9,
      fontStyle: 'italic',
    },
  };

  const rendered = renderTemplate(frozenTemplate, contentMap, styles);
  assert(rendered.includes('color:#ff0000'), 'Rendered HTML contains color inline style');
  assert(rendered.includes('background-color:#000000'), 'Rendered HTML contains background-color');
  assert(rendered.includes('border-radius:8px'), 'Rendered HTML contains border-radius with px');
  assert(rendered.includes('opacity:0.9'), 'Rendered HTML contains opacity (unitless)');
  assert(rendered.includes('font-style:italic'), 'Rendered HTML contains font-style');
}

// ─── Existing style props still work ───

console.log('\n── Template: existing style props still render ──');

{
  const html = `<html><body><p data-slot-id="s1">Text</p></body></html>`;
  const { frozenTemplate, contentMap } = await ingestHtml(html);

  const styles = {
    s1: {
      marginTop: 20,
      fontSize: 24,
      lineHeight: 1.8,
      textAlign: 'center',
      fontWeight: '700',
    },
  };

  const rendered = renderTemplate(frozenTemplate, contentMap, styles);
  assert(rendered.includes('margin-top:20px'), 'margin-top rendered with px');
  assert(rendered.includes('font-size:24px'), 'font-size rendered with px');
  assert(rendered.includes('line-height:1.8'), 'line-height rendered unitless');
  assert(rendered.includes('text-align:center'), 'text-align rendered');
  assert(rendered.includes('font-weight:700'), 'font-weight rendered');
}

// ─── Summary ───

console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!\n');
}
