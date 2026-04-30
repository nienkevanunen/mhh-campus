import fs from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const defaultBasePath = process.env.NODE_ENV === 'production' ? '/mhh-campus/' : '/';
const basePathRaw = process.env.VITE_BASE_PATH ?? defaultBasePath;
const siteUrlRaw = process.env.VITE_SITE_URL ?? process.env.SITE_URL ?? '';

const normalizeBasePath = (value) => {
  if (!value || value === '/') {
    return '/';
  }

  const trimmed = value.replace(/^\/+|\/+$/g, '');
  return `/${trimmed}/`;
};

const normalizeSiteUrl = (value) => {
  if (!value) {
    return '';
  }
  return value.replace(/\/+$/, '');
};

const basePath = normalizeBasePath(basePathRaw);
const siteUrl = normalizeSiteUrl(siteUrlRaw);

if (!siteUrl) {
  console.warn(
    'Skipping sitemap/robots generation: set VITE_SITE_URL (for example https://example.com) to enable SEO files.',
  );
  process.exit(0);
}

const homeUrl = `${siteUrl}${basePath === '/' ? '/' : basePath}`;
const today = new Date().toISOString().split('T')[0];

const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${homeUrl}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;

await fs.mkdir(distDir, { recursive: true });
await fs.writeFile(path.join(distDir, 'robots.txt'), robotsTxt, 'utf8');
await fs.writeFile(path.join(distDir, 'sitemap.xml'), sitemapXml, 'utf8');

console.log(`Generated SEO files for ${homeUrl}`);
