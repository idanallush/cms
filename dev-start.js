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

async function main() {
  await new Promise(resolve => htmlServer.listen(3501, resolve));
  console.log('Mock site running on :3501');

  // Dynamic import of server (starts on 3500)
  await import('./src/server.js');

  // Wait for server
  await new Promise(r => setTimeout(r, 1000));

  // Ingest the test site
  const res = await fetch('http://localhost:3500/api/sites/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://localhost:3501' }),
  });
  const data = await res.json();
  console.log(`\nEditor ready: http://localhost:3500/editor/${data.siteId}`);
  console.log('Press Ctrl+C to stop.\n');
}

main().catch(console.error);
