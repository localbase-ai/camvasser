// Serve a proposal as a public HTML page.
// Looks up Proposal by `id` (DB id) or `slug` (Proposal.proposalId, the short
// human-shareable id like "cmv-mb1k3-x7y9z"). Returns the stored html.
//
// URL shapes (configured via netlify.toml redirect):
//   /p/:slug           -> /.netlify/functions/serve-proposal?slug=:slug
//   /.netlify/functions/serve-proposal?id=:id
//   /.netlify/functions/serve-proposal?slug=:slug

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function handler(event) {
  try {
    const id = event.queryStringParameters?.id;
    // Slug comes from ?slug= or from the URL path /p/{slug}. When Netlify
    // rewrites /p/{slug} to this function, event.path becomes the resolved
    // function path, so check rawUrl + the original-path header too.
    let slug = event.queryStringParameters?.slug;
    if (!slug) {
      const candidates = [
        event.rawUrl,
        event.headers?.['x-nf-original-path'],
        event.headers?.['x-original-path'],
        event.path,
      ].filter(Boolean);
      for (const c of candidates) {
        const m = c.match(/\/p\/([A-Za-z0-9_-]+)/);
        if (m) { slug = m[1]; break; }
      }
    }

    if (!id && !slug) {
      return notFound();
    }

    const where = id ? { id } : { proposalId: slug };
    const proposal = await prisma.proposal.findUnique({
      where,
      select: { id: true, html: true, customerName: true, status: true }
    });

    if (!proposal || !proposal.html) {
      return notFound();
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // No-cache while we iterate — proposals can be edited frequently and
        // a 5-min CDN cache made every change feel broken to the user.
        'Cache-Control': 'no-cache, must-revalidate',
        'X-Robots-Tag': 'noindex, nofollow',
      },
      body: proposal.html,
    };
  } catch (error) {
    console.error('serve-proposal error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/plain' },
      body: 'Internal error'
    };
  }
}

function notFound() {
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!doctype html><meta charset=utf-8><title>Proposal not found</title>
<style>body{font-family:system-ui,sans-serif;max-width:520px;margin:80px auto;padding:0 20px;color:#333}</style>
<h1>Proposal not found</h1>
<p>This proposal link is invalid or has been removed.</p>`
  };
}
