import type { APIRoute } from 'astro';
import { demo } from '../data/site.js';
import { url } from '../lib/url.js';

// Proposal builds (PUBLIC_DEMO=1) stay out of search engines; the real site allows everything.
export const GET: APIRoute = ({ site }) => {
  const body = demo
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\n${site ? `\nSitemap: ${site.origin}${url('sitemap-index.xml')}\n` : ''}`; // no SITE_URL → no sitemap is built
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
