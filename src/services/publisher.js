import * as cheerio from 'cheerio';
import { renderTemplate } from './template.js';
import * as store from '../storage/index.js';

const VERCEL_API = 'https://api.vercel.com';

async function getVercelConfig() {
  const settings = await store.getAllSettings();
  const token = settings.vercel_token || process.env.VERCEL_TOKEN;
  const teamId = settings.vercel_team_id || process.env.VERCEL_TEAM_ID || null;
  return { token, teamId };
}

export function generatePublishHtml(frozenTemplate, contentMap, meta, styles) {
  let html = renderTemplate(frozenTemplate, contentMap, styles);

  // Use Cheerio to cleanly remove editor attributes
  const $ = cheerio.load(html, { decodeEntities: false });
  $('[data-slot-id]').removeAttr('data-slot-id');
  $('[data-slot-type]').removeAttr('data-slot-type');

  // Remove CMS override styles (restore original animations for published site)
  $('style[data-cms-override="true"]').remove();
  $('style[data-cms-expand="true"]').remove();
  $('style[data-cms-editor="true"]').remove();

  // Inject SEO meta tags
  const seoBlock = buildSeoBlock(meta);
  if (seoBlock) {
    if ($('head').length) {
      $('head').append(seoBlock);
    } else if ($('body').length) {
      $('body').before(`<head>${seoBlock}</head>`);
    }
  }

  return $.html();
}

function buildSeoBlock(meta) {
  const tags = [];
  const seo = meta.seo || {};

  const seoTitle = seo.title || meta.name;
  if (seoTitle) {
    tags.push(`<title>${escapeAttr(seoTitle)}</title>`);
    tags.push(`<meta property="og:title" content="${escapeAttr(seoTitle)}">`);
  }

  if (seo.description) {
    tags.push(`<meta name="description" content="${escapeAttr(seo.description)}">`);
    tags.push(`<meta property="og:description" content="${escapeAttr(seo.description)}">`);
  }

  if (seo.ogImage) {
    tags.push(`<meta property="og:image" content="${escapeAttr(seo.ogImage)}">`);
  }

  if (seo.canonicalUrl) {
    tags.push(`<link rel="canonical" href="${escapeAttr(seo.canonicalUrl)}">`);
  }

  if (seo.noIndex) {
    tags.push(`<meta name="robots" content="noindex, nofollow">`);
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

export async function publishToVercel(siteId) {
  const { token: VERCEL_TOKEN, teamId } = await getVercelConfig();
  if (!VERCEL_TOKEN) {
    throw new Error('VERCEL_TOKEN not configured. Add one in the Config panel.');
  }

  const meta = await store.getMeta(siteId);
  if (!meta) throw new Error('Site not found');

  const pages = await store.getPages(siteId);
  const files = [];

  if (pages && pages.length > 0) {
    for (const pageSummary of pages) {
      const page = await store.getPage(siteId, pageSummary.pageId);
      if (!page || !page.frozenTemplate) continue;

      const pageMeta = { ...meta, seo: page.seo || {} };
      const html = generatePublishHtml(page.frozenTemplate, page.contentMap, pageMeta, page.styles);

      const filePath = page.isIndex || page.slug === 'index'
        ? 'index.html'
        : `${page.slug}/index.html`;

      files.push({
        file: filePath,
        data: Buffer.from(html).toString('base64'),
        encoding: 'base64',
      });
    }
  }

  if (files.length === 0) {
    const template = await store.getTemplate(siteId);
    const content = await store.getContent(siteId);
    if (!template || !content) throw new Error('Site has no content');
    const styles = await store.getStyles(siteId);
    const html = generatePublishHtml(template, content, meta, styles);
    files.push({
      file: 'index.html',
      data: Buffer.from(html).toString('base64'),
      encoding: 'base64',
    });
  }

  const deployPayload = {
    files,
    projectSettings: {
      framework: null,
    },
    target: 'production',
  };

  if (meta.vercelProjectName) {
    deployPayload.name = meta.vercelProjectName;
  } else {
    deployPayload.name = `cms-${siteId.slice(0, 8)}`;
    if (meta.vercelProjectId) {
      deployPayload.project = meta.vercelProjectId;
    }
  }

  console.log('[publish] siteId:', siteId);
  console.log('[publish] meta.vercelProjectName:', meta.vercelProjectName);
  console.log('[publish] meta.vercelProjectId:', meta.vercelProjectId);
  console.log('[publish] payload name:', deployPayload.name, 'project:', deployPayload.project);
  console.log('[publish] teamId:', teamId);

  const deployUrl = teamId
    ? `${VERCEL_API}/v13/deployments?teamId=${teamId}`
    : `${VERCEL_API}/v13/deployments`;

  console.log('[publish] deploy URL:', deployUrl);
  console.log('[publish] deploy payload name:', deployPayload.name, 'project:', deployPayload.project);

  const deployRes = await fetch(deployUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(deployPayload),
  });

  if (!deployRes.ok) {
    const err = await deployRes.json().catch(() => ({}));
    throw new Error(`Vercel deploy failed: ${err.error?.message || deployRes.statusText}`);
  }

  const deployment = await deployRes.json();

  await store.updateMeta(siteId, {
    publishedAt: new Date().toISOString(),
    publishUrl: `https://${deployment.url}`,
    ...(deployment.projectId ? { vercelProjectId: deployment.projectId } : {}),
    vercelDeploymentId: deployment.id,
  });

  return {
    url: `https://${deployment.url}`,
    deploymentId: deployment.id,
    projectId: deployment.projectId || deployPayload.name,
    publishedAt: new Date().toISOString(),
  };
}

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
