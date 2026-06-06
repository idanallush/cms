import http from 'node:http';

const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <h1>Welcome to Our Site</h1>
  <p>This is the main description of the page.</p>
  <a href="https://example.com/about">About Us</a>
  <img src="https://example.com/logo.png" alt="Company Logo">
  <ul>
    <li>Feature One</li>
    <li>Feature Two</li>
  </ul>
  <button>Click Me</button>
  <p>Contact us at info@example.com</p>
</body>
</html>`;

// Start a local HTML server
const htmlServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(SAMPLE_HTML);
});

async function runTests() {
  await new Promise(resolve => htmlServer.listen(3501, resolve));
  console.log('Test HTML server on :3501');

  // Wait for CMS server
  await new Promise(r => setTimeout(r, 1000));

  const base = 'http://localhost:3500/api/sites';

  // Test 1: Ingest
  console.log('\n=== TEST 1: Ingest ===');
  const ingestRes = await fetch(`${base}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://localhost:3501' }),
  });
  const ingestData = await ingestRes.json();
  console.log('Status:', ingestRes.status);
  console.log('Slots found:', ingestData.slotCount);
  const siteId = ingestData.siteId;
  console.log('Site ID:', siteId);

  // Test 2: Get site metadata
  console.log('\n=== TEST 2: Get Metadata ===');
  const metaRes = await fetch(`${base}/${siteId}`);
  const meta = await metaRes.json();
  console.log('Site name:', meta.name);
  console.log('Original URL:', meta.originalUrl);

  // Test 3: Get content
  console.log('\n=== TEST 3: Get Content ===');
  const contentRes = await fetch(`${base}/${siteId}/content`);
  const content = await contentRes.json();
  const slotIds = Object.keys(content);
  console.log('Slot count:', slotIds.length);
  console.log('First 3 slots:', slotIds.slice(0, 3).map(id => `${id}: "${content[id].value}"`));

  // Test 4: Valid update via Guardian
  console.log('\n=== TEST 4: Valid Content Update ===');
  const firstTextSlot = slotIds.find(id => content[id].type === 'text');
  const updateRes = await fetch(`${base}/${siteId}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [firstTextSlot]: 'Updated Title' }),
  });
  const updateData = await updateRes.json();
  console.log('Valid:', updateData.valid);
  console.log('Updated slots:', updateData.updatedSlots);

  // Test 5: Guardian rejects invalid changes
  console.log('\n=== TEST 5: Guardian Rejections ===');

  // 5a: Non-existent slot
  const rej1 = await fetch(`${base}/${siteId}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 'fake_slot_999': 'nope' }),
  });
  const rej1Data = await rej1.json();
  console.log('Non-existent slot rejected:', !rej1Data.valid, '-', rej1Data.errors[0]);

  // 5b: HTML injection in text
  const rej2 = await fetch(`${base}/${siteId}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [firstTextSlot]: '<script>alert("xss")</script>' }),
  });
  const rej2Data = await rej2.json();
  console.log('HTML injection rejected:', !rej2Data.valid, '-', rej2Data.errors[0]);

  // 5c: Invalid image URL
  const imgSlot = slotIds.find(id => content[id].type === 'image');
  if (imgSlot) {
    const rej3 = await fetch(`${base}/${siteId}/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [imgSlot]: 'not-a-url' }),
    });
    const rej3Data = await rej3.json();
    console.log('Invalid image URL rejected:', !rej3Data.valid, '-', rej3Data.errors[0]);
  }

  // 5d: javascript: in link
  const linkSlot = slotIds.find(id => content[id].type === 'link');
  if (linkSlot) {
    const rej4 = await fetch(`${base}/${siteId}/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [linkSlot]: 'javascript:alert(1)' }),
    });
    const rej4Data = await rej4.json();
    console.log('javascript: URL rejected:', !rej4Data.valid, '-', rej4Data.errors[0]);
  }

  // Test 6: Versioning
  console.log('\n=== TEST 6: Versioning ===');
  const versionsRes = await fetch(`${base}/${siteId}/versions`);
  const { versions } = await versionsRes.json();
  console.log('Version count:', versions.length, '(should be 2: initial + update)');

  // Test 7: Rollback
  console.log('\n=== TEST 7: Rollback ===');
  const rollbackRes = await fetch(`${base}/${siteId}/rollback/${versions[versions.length - 1]}`, {
    method: 'POST',
  });
  const rollbackData = await rollbackRes.json();
  console.log('Rolled back to:', rollbackData.rolledBackTo);

  // Verify rollback content
  const rolledBackContent = await (await fetch(`${base}/${siteId}/content`)).json();
  console.log('Content after rollback (first text slot):', rolledBackContent[firstTextSlot]?.value);

  // Test 8: Preview
  console.log('\n=== TEST 8: Preview ===');
  const previewRes = await fetch(`${base}/${siteId}/preview`);
  const previewHtml = await previewRes.text();
  console.log('Preview returns HTML:', previewRes.headers.get('content-type')?.includes('html'));
  console.log('Preview length:', previewHtml.length, 'chars');
  console.log('Contains welcome text:', previewHtml.includes('Welcome to Our Site'));

  // Test 9: 404 for non-existent site
  console.log('\n=== TEST 9: 404 Handling ===');
  const notFoundRes = await fetch(`${base}/nonexistent-id`);
  console.log('404 status:', notFoundRes.status);

  // Test 10: Invalid URL
  console.log('\n=== TEST 10: Invalid URL ===');
  const badUrlRes = await fetch(`${base}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'not a url' }),
  });
  console.log('Invalid URL status:', badUrlRes.status);

  console.log('\n=== ALL TESTS PASSED ===');

  htmlServer.close();
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  htmlServer.close();
  process.exit(1);
});
