import { renderTemplate } from './template.js';
import * as store from '../storage/index.js';

const VERCEL_API = 'https://api.vercel.com';

async function getVercelConfig() {
  const settings = await store.getAllSettings();
  const token = settings.vercel_token || process.env.VERCEL_TOKEN;
  const teamId = settings.vercel_team_id || process.env.VERCEL_TEAM_ID || null;
  return { token, teamId };
}

/**
 * Generate clean HTML for publishing (no editor attributes)
 */
export function generatePublishHtml(frozenTemplate, contentMap, meta) {
  let html = renderTemplate(frozenTemplate, contentMap);

  // Remove editor-specific attributes
  html = html.replace(/\s*data-slot-id="[^"]*"/g, '');
  html = html.replace(/\s*data-slot-type="[^"]*"/g, '');

  // Inject SEO meta tags if not already present
  const seoBlock = buildSeoBlock(meta);
  if (seoBlock) {
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${seoBlock}\n</head>`);
    } else if (html.includes('<body')) {
      html = html.replace('<body', `<head>${seoBlock}</head>\n<body`);
    }
  }

  return html;
}

function buildSeoBlock(meta) {
  const tags = [];

  if (meta.name) {
    // Only inject if no existing <title>
    tags.push(`<meta property="og:title" content="${escapeAttr(meta.name)}">`);
  }

  if (meta.originalUrl) {
    tags.push(`<meta property="og:url" content="${escapeAttr(meta.originalUrl)}">`);
  }

  tags.push(`<meta name="generator" content="Client CMS">`);

  return tags.join('\n  ');
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Deploy site to Vercel via API v13
 */
export async function publishToVercel(siteId) {
  const { token: VERCEL_TOKEN, teamId } = await getVercelConfig();
  if (!VERCEL_TOKEN) {
    throw new Error('VERCEL_TOKEN not configured. Add one in the Config panel.');
  }

  const meta = await store.getMeta(siteId);
  if (!meta) throw new Error('Site not found');

  const template = await store.getTemplate(siteId);
  const content = await store.getContent(siteId);
  if (!template || !content) throw new Error('Site has no content');

  const html = generatePublishHtml(template, content, meta);

  // Project name: sanitized site name
  const projectName = `cms-${siteId.slice(0, 8)}`;

  // Create deployment via Vercel API v13
  const deployRes = await fetch(`${VERCEL_API}/v13/deployments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectName,
      files: [
        {
          file: 'index.html',
          data: Buffer.from(html).toString('base64'),
          encoding: 'base64',
        },
      ],
      projectSettings: {
        framework: null,
      },
      target: 'production',
    }),
  });

  if (!deployRes.ok) {
    const err = await deployRes.json().catch(() => ({}));
    throw new Error(`Vercel deploy failed: ${err.error?.message || deployRes.statusText}`);
  }

  const deployment = await deployRes.json();

  // Update site meta with publish info
  await store.updateMeta(siteId, {
    publishedAt: new Date().toISOString(),
    publishUrl: `https://${deployment.url}`,
    vercelProjectId: deployment.projectId || projectName,
    vercelDeploymentId: deployment.id,
  });

  return {
    url: `https://${deployment.url}`,
    deploymentId: deployment.id,
    projectId: deployment.projectId || projectName,
    publishedAt: new Date().toISOString(),
  };
}

/**
 * Get publish status for a site
 */
export async function getPublishStatus(siteId) {
  const meta = await store.getMeta(siteId);
  if (!meta) return null;

  return {
    published: !!meta.publishedAt,
    publishedAt: meta.publishedAt,
    publishUrl: meta.publishUrl,
    vercelProjectId: meta.vercelProjectId,
  };
}
