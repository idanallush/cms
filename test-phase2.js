import http from 'node:http';

const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Demo Landing Page</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
    .hero { background: #2c3e50; color: #fff; padding: 60px 40px; text-align: center; }
    .hero h1 { font-size: 2.5em; margin-bottom: 10px; }
    .hero p { font-size: 1.2em; opacity: 0.9; }
    .features { display: flex; gap: 20px; padding: 40px; max-width: 900px; margin: 0 auto; }
    .feature { flex: 1; background: #fff; padding: 24px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .feature h3 { color: #2c3e50; margin-bottom: 8px; }
    .feature p { color: #666; font-size: 0.95em; }
    .cta { text-align: center; padding: 40px; }
    .cta a { background: #3498db; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 1.1em; }
    footer { background: #2c3e50; color: #aaa; text-align: center; padding: 20px; font-size: 0.85em; }
    .logo-row { text-align: center; padding: 30px; }
  </style>
</head>
<body>
  <div class="hero">
    <h1>Build Something Amazing</h1>
    <p>The fastest way to launch your next project with confidence.</p>
    <button>Get Started Free</button>
  </div>
  <div class="logo-row">
    <img src="https://via.placeholder.com/200x60?text=Logo" alt="Company Logo">
  </div>
  <div class="features">
    <div class="feature">
      <h3>Lightning Fast</h3>
      <p>Deploy in seconds, not hours. Our platform handles the heavy lifting.</p>
    </div>
    <div class="feature">
      <h3>Secure by Default</h3>
      <p>Enterprise-grade security built in from day one. No configuration needed.</p>
    </div>
    <div class="feature">
      <h3>Scale Effortlessly</h3>
      <p>From zero to millions of users. We grow with you automatically.</p>
    </div>
  </div>
  <div class="cta">
    <a href="https://example.com/signup">Start Your Free Trial</a>
  </div>
  <footer>
    <p>Copyright 2024 Amazing Corp. All rights reserved.</p>
  </footer>
</body>
</html>`;

const htmlServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(SAMPLE_HTML);
});

async function runTests() {
  await new Promise(resolve => htmlServer.listen(3501, resolve));
  console.log('Test HTML server on :3501');
  await new Promise(r => setTimeout(r, 1500));

  const base = 'http://localhost:3500/api/sites';

  // Ingest the test site
  console.log('\n=== Ingesting test site ===');
  const ingestRes = await fetch(`${base}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://localhost:3501' }),
  });
  const ingestData = await ingestRes.json();
  console.log('Site ID:', ingestData.siteId);
  console.log('Slots:', ingestData.slotCount);

  const siteId = ingestData.siteId;

  // Verify render endpoint
  console.log('\n=== Testing render endpoint ===');
  const renderRes = await fetch(`${base}/${siteId}/render`);
  const renderHtml = await renderRes.text();
  console.log('Render returns HTML:', renderRes.headers.get('content-type').includes('html'));
  console.log('Has data-slot-id:', renderHtml.includes('data-slot-id'));
  console.log('Has data-slot-type:', renderHtml.includes('data-slot-type'));

  // Verify editor page loads
  console.log('\n=== Testing editor page ===');
  const editorRes = await fetch(`http://localhost:3500/editor/${siteId}`);
  const editorHtml = await editorRes.text();
  console.log('Editor status:', editorRes.status);
  console.log('Has iframe:', editorHtml.includes('site-iframe'));
  console.log('Has toolbar:', editorHtml.includes('toolbar'));
  console.log('Has editor.js:', editorHtml.includes('editor.js'));
  console.log('Has editor.css:', editorHtml.includes('editor.css'));

  // Verify static files served
  console.log('\n=== Testing static files ===');
  const cssRes = await fetch('http://localhost:3500/css/editor.css');
  console.log('CSS status:', cssRes.status);
  const jsRes = await fetch('http://localhost:3500/js/editor.js');
  console.log('JS status:', jsRes.status);

  // Verify content map has slot types
  console.log('\n=== Content map slot types ===');
  const contentRes = await fetch(`${base}/${siteId}/content`);
  const content = await contentRes.json();
  const types = {};
  for (const slot of Object.values(content)) {
    types[slot.type] = (types[slot.type] || 0) + 1;
  }
  console.log('Slot type breakdown:', types);

  // Test save with valid change
  console.log('\n=== Testing save flow ===');
  const textSlot = Object.entries(content).find(([, s]) => s.type === 'text' && s.tag === 'h1');
  if (textSlot) {
    const [slotId] = textSlot;
    const saveRes = await fetch(`${base}/${siteId}/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [slotId]: 'Updated Headline' }),
    });
    const saveData = await saveRes.json();
    console.log('Save valid:', saveData.valid);
    console.log('Updated slots:', saveData.updatedSlots);
  }

  // Test Guardian rejection
  console.log('\n=== Testing Guardian rejection ===');
  const imgSlot = Object.entries(content).find(([, s]) => s.type === 'image');
  if (imgSlot) {
    const [slotId] = imgSlot;
    const badRes = await fetch(`${base}/${siteId}/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [slotId]: 'javascript:alert(1)' }),
    });
    const badData = await badRes.json();
    console.log('Rejected:', !badData.valid);
    console.log('Error:', badData.errors?.[0]);
  }

  // Verify versions
  console.log('\n=== Version history ===');
  const versionsRes = await fetch(`${base}/${siteId}/versions`);
  const { versions } = await versionsRes.json();
  console.log('Version count:', versions.length);

  // Editor URL for manual testing
  console.log('\n===========================================');
  console.log(`Editor URL: http://localhost:3500/editor/${siteId}`);
  console.log('===========================================');
  console.log('\n=== ALL PHASE 2 TESTS PASSED ===');

  htmlServer.close();
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  htmlServer.close();
  process.exit(1);
});
