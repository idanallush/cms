import { ingestHtml } from '../src/services/ingest.js';
import { renderTemplate } from '../src/services/template.js';
import { generatePublishHtml } from '../src/services/publisher.js';

const COMPLEX_HTML = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Landing Page Test</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; color: #333; }
    .hero { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 80px 40px; text-align: center; min-height: 600px; }
    .hero h1 { font-size: 3em; margin-bottom: 20px; }
    .hero p { font-size: 1.2em; max-width: 600px; margin: 0 auto 30px; }
    .btn-cta { background: #ff6b35; color: white; padding: 15px 40px; border: none; border-radius: 30px; font-size: 1.1em; cursor: pointer; }
    .cards { display: flex; gap: 30px; padding: 60px 40px; max-width: 1200px; margin: 0 auto; }
    .card { flex: 1; background: #f8f9fa; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .card img { width: 100%; height: 200px; object-fit: cover; border-radius: 8px; }
    .card h3 { margin: 15px 0 10px; }
    .features { background: #1a1a2e; color: white; padding: 80px 40px; }
    .features h2 { text-align: center; margin-bottom: 40px; }
    .feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; max-width: 1200px; margin: 0 auto; }
    .feature-item { text-align: center; padding: 20px; }
    .testimonial { background: url('https://example.com/bg-pattern.png') center/cover; padding: 80px 40px; }
    .testimonial blockquote { max-width: 800px; margin: 0 auto; font-size: 1.3em; font-style: italic; }
    footer { background: #111; color: #999; padding: 40px; }
    footer a { color: #667eea; text-decoration: none; }
    .cta-section { background: #ff6b35; color: white; padding: 60px 40px; text-align: center; }
  </style>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap">
</head>
<body>
  <header>
    <nav style="display: flex; justify-content: space-between; padding: 20px 40px; background: rgba(0,0,0,0.1);">
      <a href="/" class="logo">BrandName</a>
      <div>
        <a href="#features">Features</a>
        <a href="#pricing">Pricing</a>
        <a href="#contact">Contact</a>
      </div>
    </nav>
  </header>

  <section class="hero">
    <h1><span class="highlight">Transform</span> Your Business</h1>
    <p>The all-in-one platform that helps you grow faster with less effort. Join thousands of satisfied customers.</p>
    <button class="btn-cta">Get Started Free</button>
    <p style="margin-top: 10px; font-size: 0.9em;">No credit card required</p>
  </section>

  <section class="cards" id="features">
    <div class="card">
      <img src="https://example.com/card1.jpg" alt="Analytics Dashboard">
      <h3>Smart Analytics</h3>
      <p>Track your performance with real-time dashboards and AI-powered insights.</p>
      <a href="/analytics">Learn more</a>
    </div>
    <div class="card">
      <img src="https://example.com/card2.jpg" alt="Automation Tools">
      <h3>Automation</h3>
      <p>Automate repetitive tasks and focus on what matters most.</p>
      <a href="/automation">Learn more</a>
    </div>
    <div class="card">
      <img src="https://example.com/card3.jpg" alt="Team Collaboration">
      <h3>Collaboration</h3>
      <p>Work together seamlessly with built-in team features.</p>
      <a href="/collaboration">Learn more</a>
    </div>
  </section>

  <section class="features">
    <h2>Why Choose Us</h2>
    <div class="feature-grid">
      <div class="feature-item">
        <h4>Lightning Fast</h4>
        <p>Our platform loads in under 100ms, keeping your visitors engaged.</p>
      </div>
      <div class="feature-item">
        <h4>Secure by Default</h4>
        <p>Enterprise-grade security with SOC2 compliance built in.</p>
      </div>
      <div class="feature-item">
        <h4>24/7 Support</h4>
        <p>Our team is always available to help you succeed.</p>
      </div>
    </div>
  </section>

  <section class="testimonial">
    <blockquote>
      <p>"This platform completely changed how we operate. Revenue is up 300% since we switched."</p>
    </blockquote>
    <p style="text-align: center; margin-top: 20px;">— Sarah Johnson, CEO of TechCorp</p>
  </section>

  <section class="cta-section">
    <h2>Ready to Get Started?</h2>
    <p>Join 10,000+ businesses that trust our platform.</p>
    <button class="btn-cta" style="background: white; color: #ff6b35;">Start Free Trial</button>
  </section>

  <footer>
    <div style="display: flex; justify-content: space-between; max-width: 1200px; margin: 0 auto;">
      <div>
        <p>© 2024 BrandName. All rights reserved.</p>
      </div>
      <div>
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
        <a href="/contact">Contact Us</a>
      </div>
    </div>
  </footer>
</body>
</html>`;

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      passed++;
      console.log(`  ✓ ${message}`);
    } else {
      failed++;
      console.error(`  ✗ ${message}`);
    }
  }

  // ── Test 1: Ingest ──
  console.log('\n=== Test 1: Ingest ===');
  const { frozenTemplate, contentMap } = await ingestHtml(COMPLEX_HTML);

  assert(Object.keys(contentMap).length > 0, `Found ${Object.keys(contentMap).length} editable slots`);

  // Check that template preserves ALL original structure
  assert(frozenTemplate.includes('linear-gradient(135deg, #667eea, #764ba2)'), 'CSS gradient preserved');
  assert(frozenTemplate.includes('background: url(\'https://example.com/bg-pattern.png\')'), 'CSS background-image preserved');
  assert(frozenTemplate.includes('display: flex'), 'Flexbox layout preserved');
  assert(frozenTemplate.includes('grid-template-columns'), 'Grid layout preserved');
  assert(frozenTemplate.includes('font-family: \'Segoe UI\''), 'Font-family preserved');
  assert(frozenTemplate.includes('fonts.googleapis.com'), 'Google Fonts link preserved');
  assert(frozenTemplate.includes('<style>'), 'Style tag preserved');
  assert(frozenTemplate.includes('<meta charset="UTF-8">'), 'Meta tags preserved');
  assert(frozenTemplate.includes('lang="he"'), 'HTML lang attribute preserved');
  assert(frozenTemplate.includes('dir="rtl"'), 'RTL direction preserved');

  // Check data-slot-id attributes are present
  assert(frozenTemplate.includes('data-slot-id='), 'data-slot-id attributes added');
  assert(frozenTemplate.includes('data-slot-type='), 'data-slot-type attributes added');

  // Check that NO content was replaced with placeholders
  assert(!frozenTemplate.includes('{{'), 'No {{placeholder}} strings in template');
  assert(frozenTemplate.includes('Transform'), 'Original h1 text preserved in template');
  assert(frozenTemplate.includes('Smart Analytics'), 'Original h3 text preserved in template');
  assert(frozenTemplate.includes('Get Started Free'), 'Original button text preserved in template');

  // Check slot types
  const slotTypes = new Set(Object.values(contentMap).map(s => s.type));
  assert(slotTypes.has('text'), 'Has text slots');
  assert(slotTypes.has('image'), 'Has image slots');
  assert(slotTypes.has('link'), 'Has link slots');

  // Check specific elements were found
  const tags = Object.values(contentMap).map(s => s.tag);
  assert(tags.includes('h1'), 'Found h1 elements');
  assert(tags.includes('h2'), 'Found h2 elements');
  assert(tags.includes('p'), 'Found p elements');
  assert(tags.includes('img'), 'Found img elements');
  assert(tags.includes('a'), 'Found a (link) elements');
  assert(tags.includes('button'), 'Found button elements');

  // Check richtext for h1 with nested span
  const richtextSlots = Object.entries(contentMap).filter(([, s]) => s.type === 'richtext');
  assert(richtextSlots.length > 0, `Found ${richtextSlots.length} richtext slots (nested inline markup)`);

  // Check images have src values
  const imgSlots = Object.entries(contentMap).filter(([, s]) => s.type === 'image');
  assert(imgSlots.length >= 3, `Found ${imgSlots.length} image slots (expected >= 3)`);
  assert(imgSlots.every(([, s]) => s.value.startsWith('https://')), 'All image slots have valid URLs');

  // ── Test 2: Render (identity) ──
  console.log('\n=== Test 2: Render (should be identical to original) ===');
  const rendered = renderTemplate(frozenTemplate, contentMap);

  assert(rendered.includes('linear-gradient(135deg, #667eea, #764ba2)'), 'Rendered: CSS gradient intact');
  assert(rendered.includes('display: flex'), 'Rendered: Flexbox intact');
  assert(rendered.includes('grid-template-columns'), 'Rendered: Grid intact');
  assert(rendered.includes('Transform'), 'Rendered: h1 text intact');
  assert(rendered.includes('Smart Analytics'), 'Rendered: h3 text intact');
  assert(rendered.includes('https://example.com/card1.jpg'), 'Rendered: Image src intact');
  assert(rendered.includes('Analytics Dashboard'), 'Rendered: Image alt intact');
  assert(rendered.includes('href="/analytics"'), 'Rendered: Link href intact');
  assert(rendered.includes('Get Started Free'), 'Rendered: Button text intact');

  // ── Test 3: Modify a slot and re-render ──
  console.log('\n=== Test 3: Modify slot values ===');
  const modifiedContent = JSON.parse(JSON.stringify(contentMap));

  // Find the h1 slot and change it
  const h1Slot = Object.entries(modifiedContent).find(([, s]) => s.tag === 'h1');
  if (h1Slot) {
    modifiedContent[h1Slot[0]].value = 'New Headline';
    const modRendered = renderTemplate(frozenTemplate, modifiedContent);
    assert(modRendered.includes('New Headline'), 'Modified h1 appears in render');
    assert(!modRendered.includes('Transform'), 'Old h1 text replaced');
    assert(modRendered.includes('Smart Analytics'), 'Other content unchanged');
    assert(modRendered.includes('linear-gradient(135deg, #667eea, #764ba2)'), 'CSS still intact after modification');
  } else {
    assert(false, 'Could not find h1 slot to modify');
  }

  // Modify an image
  const imgSlot = Object.entries(modifiedContent).find(([, s]) => s.type === 'image');
  if (imgSlot) {
    modifiedContent[imgSlot[0]].value = 'https://newcdn.com/new-image.jpg';
    const modRendered = renderTemplate(frozenTemplate, modifiedContent);
    assert(modRendered.includes('https://newcdn.com/new-image.jpg'), 'Modified image src appears');
  }

  // ── Test 4: Style overrides ──
  console.log('\n=== Test 4: Style overrides ===');
  if (h1Slot) {
    const styles = { [h1Slot[0]]: { fontSize: 48, textAlign: 'center' } };
    const styledRendered = renderTemplate(frozenTemplate, contentMap, styles);
    assert(styledRendered.includes('font-size:48px'), 'Style override: fontSize applied');
    assert(styledRendered.includes('text-align:center'), 'Style override: textAlign applied');
  }

  // ── Test 5: Publish (clean output) ──
  console.log('\n=== Test 5: Publish (clean HTML) ===');
  const meta = { name: 'Test Site', originalUrl: 'https://example.com', seo: { title: 'Test Title', description: 'Test desc' } };
  const publishedHtml = generatePublishHtml(frozenTemplate, contentMap, meta);

  assert(!publishedHtml.includes('data-slot-id'), 'Published: No data-slot-id attributes');
  assert(!publishedHtml.includes('data-slot-type'), 'Published: No data-slot-type attributes');
  assert(publishedHtml.includes('<title>Test Title</title>'), 'Published: SEO title injected');
  assert(publishedHtml.includes('content="Test desc"'), 'Published: SEO description injected');
  assert(publishedHtml.includes('content="Client CMS"'), 'Published: Generator meta tag added');
  assert(publishedHtml.includes('linear-gradient(135deg, #667eea, #764ba2)'), 'Published: CSS preserved');
  assert(publishedHtml.includes('Transform'), 'Published: Content preserved');

  // ── Test 6: Template size ──
  console.log('\n=== Test 6: Template size ===');
  const templateSize = Buffer.byteLength(frozenTemplate, 'utf8');
  assert(templateSize > 1000, `Template is ${templateSize} bytes (large enough for full HTML)`);
  assert(templateSize > COMPLEX_HTML.length * 0.9, 'Template is similar size to original (not stripped)');

  // ── Test 7: URL absolutization ──
  console.log('\n=== Test 7: URL absolutization ===');
  const HTML_WITH_RELATIVE = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/css/main.css">
  <link rel="icon" href="/favicon.ico">
  <script src="/js/app.js"></script>
  <style>.hero { background: url('/images/bg.jpg'); }</style>
</head>
<body>
  <img src="/images/logo.png" alt="Logo">
  <img srcset="/images/small.jpg 480w, /images/large.jpg 1024w" src="/images/default.jpg" alt="Responsive">
  <a href="/about">About</a>
  <a href="#contact">Contact</a>
  <a href="https://external.com">External</a>
  <video src="/video/intro.mp4" poster="/images/poster.jpg"></video>
  <div style="background-image: url('/images/pattern.png');">Content</div>
  <form action="/submit">
    <input type="submit" value="Send">
  </form>
  <iframe src="/embed/widget"></iframe>
</body>
</html>`;

  const { frozenTemplate: absTemplate } = await ingestHtml(HTML_WITH_RELATIVE, 'https://mysite.com/landing/page');

  // CSS/JS/links should be absolute
  assert(absTemplate.includes('href="https://mysite.com/css/main.css"'), 'Stylesheet href absolutized');
  assert(absTemplate.includes('href="https://mysite.com/favicon.ico"'), 'Favicon href absolutized');
  assert(absTemplate.includes('src="https://mysite.com/js/app.js"'), 'Script src absolutized');

  // Images
  assert(absTemplate.includes('src="https://mysite.com/images/logo.png"'), 'Image src absolutized');
  assert(absTemplate.includes('https://mysite.com/images/small.jpg 480w'), 'Srcset absolutized');

  // Links
  assert(absTemplate.includes('href="https://mysite.com/about"'), 'Relative link absolutized');
  assert(absTemplate.includes('href="#contact"'), 'Anchor link kept as-is');
  assert(absTemplate.includes('href="https://external.com"'), 'Absolute link untouched');

  // Video/poster
  assert(absTemplate.includes('src="https://mysite.com/video/intro.mp4"'), 'Video src absolutized');
  assert(absTemplate.includes('poster="https://mysite.com/images/poster.jpg"'), 'Video poster absolutized');

  // Inline style bg
  assert(absTemplate.includes("url('https://mysite.com/images/pattern.png')"), 'Inline style bg absolutized');

  // Embedded <style> bg
  assert(absTemplate.includes("url('https://mysite.com/images/bg.jpg')"), 'Embedded style bg absolutized');

  // Form action
  assert(absTemplate.includes('action="https://mysite.com/submit"'), 'Form action absolutized');

  // iframe
  assert(absTemplate.includes('src="https://mysite.com/embed/widget"'), 'Iframe src absolutized');

  // ── Test 8: No absolutization for pasted HTML ──
  console.log('\n=== Test 8: Pasted HTML (no source URL) ===');
  const { frozenTemplate: pastedTemplate } = await ingestHtml(HTML_WITH_RELATIVE);
  assert(pastedTemplate.includes('href="/css/main.css"'), 'Pasted HTML: relative URLs kept as-is');

  // ── Summary ──
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});
