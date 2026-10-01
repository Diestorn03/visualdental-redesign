import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// GitHub Pages project site: SITE_URL=https://<user>.github.io  PAGES_BASE=/<repo> (set by .github/workflows/deploy.yml).
// Own domain: SITE_URL=https://<domain> and no PAGES_BASE. The final domain is unknown (docs/BRIEF.md, "confirm with
// client"), so there is no default: without SITE_URL the build emits no absolute canonical / og:url / sitemap rather than
// pointing search engines and share previews at a domain nobody has confirmed.
const site = process.env.SITE_URL || undefined;
const base = process.env.PAGES_BASE || '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  integrations: site ? [sitemap()] : [],
  build: { inlineStylesheets: 'auto' },
  devToolbar: { enabled: false },
  // one cache dir per dev server (VITE_CACHE_DIR=.vite-a1 …) so several can run side by side
  vite: {
    cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
    server: { watch: { ignored: ['**/.shots/**', '**/.vite-*/**'] } }, // QA Chrome profiles and extra Vite caches flood the watcher
  },
});
