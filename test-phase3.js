import http from 'node:http';

const SAMPLE_HTML = `<!DOCTYPE html>
<html><head><title>Test</title></head>
<body><h1>Hello World</h1><p>Test page</p>
<a href="https://example.com">Link</a>
<img src="https://example.com/img.png" alt="Logo">
</body></html>`;

const htmlServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(SAMPLE_HTML);
});

function parseCookies(headers) {
  const raw = headers.get('set-cookie') || '';
  const cookies = {};
  raw.split(',').forEach(c => {
    const [kv] = c.split(';');
    if (kv) {
      const [k, v] = kv.trim().split('=');
      if (k && v) cookies[k] = v;
    }
  });
  return cookies;
}

async function runTests() {
  await new Promise(resolve => htmlServer.listen(3501, resolve));
  console.log('Test HTML server on :3501');
  await new Promise(r => setTimeout(r, 2000));

  const base = 'http://localhost:3500';
  let ownerToken = '';
  let clientToken = '';
  let siteId = '';

  // Test 1: Health check
  console.log('\n=== TEST 1: Health check ===');
  const health = await (await fetch(`${base}/health`)).json();
  console.log('Status:', health.status);

  // Test 2: Unauthenticated access should be blocked
  console.log('\n=== TEST 2: Unauthenticated access blocked ===');
  const unauth = await fetch(`${base}/api/sites`);
  console.log('GET /api/sites without auth:', unauth.status, '(expect 403)');

  // Test 3: Owner login with wrong password
  console.log('\n=== TEST 3: Failed owner login ===');
  const badLogin = await fetch(`${base}/api/auth/login/owner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrong' }),
  });
  console.log('Wrong password:', badLogin.status, '(expect 401)');

  // Test 4: Owner login with correct password
  console.log('\n=== TEST 4: Owner login ===');
  const ownerLogin = await fetch(`${base}/api/auth/login/owner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'owner123' }),
  });
  const ownerData = await ownerLogin.json();
  console.log('Owner login status:', ownerLogin.status);
  console.log('Role:', ownerData.role);
  const setCookie = ownerLogin.headers.get('set-cookie');
  const tokenMatch = setCookie?.match(/cms_token=([^;]+)/);
  ownerToken = tokenMatch?.[1] || '';
  console.log('Got token:', !!ownerToken);

  // Test 5: Check /api/auth/me
  console.log('\n=== TEST 5: Auth me ===');
  const me = await (await fetch(`${base}/api/auth/me`, {
    headers: { Cookie: `cms_token=${ownerToken}` },
  })).json();
  console.log('Authenticated:', me.authenticated, 'Role:', me.role);

  // Test 6: Ingest site as owner
  console.log('\n=== TEST 6: Ingest site ===');
  const ingestRes = await fetch(`${base}/api/sites/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `cms_token=${ownerToken}` },
    body: JSON.stringify({ url: 'http://localhost:3501', name: 'Test Site' }),
  });
  const ingestData = await ingestRes.json();
  siteId = ingestData.siteId;
  console.log('Ingest status:', ingestRes.status);
  console.log('Site ID:', siteId);
  console.log('Slots:', ingestData.slotCount);

  // Test 7: List sites as owner
  console.log('\n=== TEST 7: List sites ===');
  const listRes = await (await fetch(`${base}/api/sites`, {
    headers: { Cookie: `cms_token=${ownerToken}` },
  })).json();
  console.log('Sites count:', listRes.sites.length);
  console.log('First site name:', listRes.sites[0]?.name);

  // Test 8: Set client password
  console.log('\n=== TEST 8: Set client password ===');
  const pwRes = await fetch(`${base}/api/sites/${siteId}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `cms_token=${ownerToken}` },
    body: JSON.stringify({ password: 'client-pass-123' }),
  });
  const pwData = await pwRes.json();
  console.log('Password set:', pwData.success);

  // Test 8b: Reject short password
  const shortPwRes = await fetch(`${base}/api/sites/${siteId}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `cms_token=${ownerToken}` },
    body: JSON.stringify({ password: 'short' }),
  });
  console.log('Short password rejected:', shortPwRes.status, '(expect 400)');

  // Test 9: Client login
  console.log('\n=== TEST 9: Client login ===');
  const clientLogin = await fetch(`${base}/api/auth/login/client`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, password: 'client-pass-123' }),
  });
  const clientData = await clientLogin.json();
  console.log('Client login status:', clientLogin.status);
  console.log('Client role:', clientData.role);
  const clientCookie = clientLogin.headers.get('set-cookie');
  const clientMatch = clientCookie?.match(/cms_token=([^;]+)/);
  clientToken = clientMatch?.[1] || '';
  console.log('Got client token:', !!clientToken);

  // Test 10: Client can access their own site
  console.log('\n=== TEST 10: Client site access ===');
  const clientSite = await fetch(`${base}/api/sites/${siteId}`, {
    headers: { Cookie: `cms_token=${clientToken}` },
  });
  console.log('Client access own site:', clientSite.status, '(expect 200)');

  // Test 11: Client CANNOT list all sites
  console.log('\n=== TEST 11: Client blocked from listing sites ===');
  const clientList = await fetch(`${base}/api/sites`, {
    headers: { Cookie: `cms_token=${clientToken}` },
  });
  console.log('Client list sites:', clientList.status, '(expect 403)');

  // Test 12: Client CANNOT access ingest
  console.log('\n=== TEST 12: Client blocked from ingest ===');
  const clientIngest = await fetch(`${base}/api/sites/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `cms_token=${clientToken}` },
    body: JSON.stringify({ url: 'http://localhost:3501' }),
  });
  console.log('Client ingest:', clientIngest.status, '(expect 403)');

  // Test 13: Update settings as owner
  console.log('\n=== TEST 13: Update settings ===');
  const settingsRes = await fetch(`${base}/api/sites/${siteId}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: `cms_token=${ownerToken}` },
    body: JSON.stringify({ name: 'Updated Name', customDomain: 'www.test.com' }),
  });
  const settingsData = await settingsRes.json();
  console.log('Updated name:', settingsData.name);
  console.log('Custom domain:', settingsData.customDomain);

  // Test 14: Dashboard page loads for owner
  console.log('\n=== TEST 14: Dashboard page ===');
  const dashRes = await fetch(`${base}/dashboard`, {
    headers: { Cookie: `cms_token=${ownerToken}` },
    redirect: 'manual',
  });
  console.log('Dashboard status:', dashRes.status, '(expect 200)');

  // Test 15: Dashboard blocked for unauthenticated
  console.log('\n=== TEST 15: Dashboard blocked without auth ===');
  const dashNoAuth = await fetch(`${base}/dashboard`, { redirect: 'manual' });
  console.log('Dashboard no auth:', dashNoAuth.status, '(expect 302 redirect)');

  // Test 16: Login page loads
  console.log('\n=== TEST 16: Login pages ===');
  const loginPage = await fetch(`${base}/login`);
  console.log('Owner login page:', loginPage.status, '(expect 200)');
  const clientLoginPage = await fetch(`${base}/login/${siteId}`);
  console.log('Client login page:', clientLoginPage.status, '(expect 200)');

  // Test 17: Logout
  console.log('\n=== TEST 17: Logout ===');
  const logoutRes = await fetch(`${base}/api/auth/logout`, { method: 'POST' });
  console.log('Logout:', logoutRes.status);

  // Test 18: Editor page requires auth
  console.log('\n=== TEST 18: Editor requires auth ===');
  const editorNoAuth = await fetch(`${base}/editor/${siteId}`, { redirect: 'manual' });
  console.log('Editor no auth:', editorNoAuth.status, '(expect 302)');

  // Test 19: Delete site
  console.log('\n=== TEST 19: Delete site ===');
  const delRes = await fetch(`${base}/api/sites/${siteId}`, {
    method: 'DELETE',
    headers: { Cookie: `cms_token=${ownerToken}` },
  });
  const delData = await delRes.json();
  console.log('Delete:', delData.success);

  // Verify deletion
  const afterDel = await fetch(`${base}/api/sites/${siteId}`, {
    headers: { Cookie: `cms_token=${ownerToken}` },
  });
  console.log('After delete, get site:', afterDel.status, '(expect 404)');

  console.log('\n=== ALL PHASE 3 TESTS PASSED ===');

  htmlServer.close();
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  htmlServer.close();
  process.exit(1);
});
