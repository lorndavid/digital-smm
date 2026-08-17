#!/usr/bin/env node
/**
 * Sitemap generator for the DigitalSMM customer frontend.
 *
 * Build-time / deploy-time tool: queries the PUBLIC catalogue API for the
 * real active categories + services and writes frontend/public/sitemap.xml.
 * Only valid, public, canonical URLs are emitted — private routes
 * (/dashboard, /admin, /pay, /auth, /sign-in) are never included.
 *
 * Usage:
 *   node scripts/generate-sitemap.mjs                       # uses https://digitalsmm.shop
 *   API_BASE_URL=http://localhost:4000 node scripts/generate-sitemap.mjs
 *   SITEMAP_ORIGIN=https://digitalsmm.shop node scripts/generate-sitemap.mjs
 *
 * Wire into your deploy (e.g. Vercel build): `node scripts/generate-sitemap.mjs`
 * BEFORE `vite build`, so the freshly generated sitemap ships with the build.
 *
 * Failure behaviour: if the catalogue API is unreachable but a previously
 * generated sitemap.xml exists, the script warns and keeps the existing file
 * (exit 0) so deploys never break because the API was briefly down. It only
 * exits non-zero when there is nothing to fall back on.
 */

const API_BASE = (process.env.API_BASE_URL || 'https://digitalsmm.shop').replace(/\/+$/, '')
const ORIGIN = (process.env.SITEMAP_ORIGIN || 'https://digitalsmm.shop').replace(/\/+$/, '')

// Static pages that are always part of the sitemap (public, canonical).
const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/services', changefreq: 'weekly', priority: '0.9' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
  { path: '/refund-policy', changefreq: 'yearly', priority: '0.3' },
  { path: '/cookies', changefreq: 'yearly', priority: '0.3' },
]

const PLATFORMS = ['tiktok', 'facebook', 'instagram', 'youtube', 'telegram']

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function fetchJson(path) {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(
      `GET ${path} returned non-JSON (${text.slice(0, 60).replace(/\s+/g, ' ')}…). ` +
      `Is API_BASE_URL (${API_BASE}) a backend API, not an HTML site?`,
    )
  }
}

async function main() {
  console.log(`[sitemap] fetching catalogue from ${API_BASE} …`)

  const [categories, servicesResult] = await Promise.all([
    fetchJson('/api/categories?curated=true'),
    fetchJson('/api/services?limit=500'),
  ])

  // All services may span several pages.
  const services = [...servicesResult.items]
  const total = servicesResult.total ?? services.length
  const pageSize = servicesResult.limit ?? 500
  const pages = Math.ceil(total / pageSize)
  for (let page = 2; page <= pages; page++) {
    const res = await fetchJson(`/api/services?limit=${pageSize}&page=${page}`)
    services.push(...res.items)
  }

  const platformSet = new Set(PLATFORMS.filter((p) =>
    categories.some((c) => c.platform === p || (c.name || '').toLowerCase().includes(p)),
  ))

  const entries = [...STATIC_PAGES]
  for (const platform of platformSet) {
    entries.push({ path: `/services/${platform}`, changefreq: 'weekly', priority: '0.8' })
  }
  // Only ACTIVE services get pages — real data only, no placeholder URLs.
  for (const service of services) {
    if (service.isActive === false) continue
    entries.push({
      path: `/service/${service._id}`,
      changefreq: 'weekly',
      priority: '0.6',
    })
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((entry) => {
      const url = entry.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${entry.path}/`
      return [
        '  <url>',
        `    <loc>${escapeXml(url)}</loc>`,
        `    <changefreq>${entry.changefreq}</changefreq>`,
        `    <priority>${entry.priority}</priority>`,
        '  </url>',
      ].join('\n')
    }),
    '</urlset>',
    '',
  ].join('\n')

  const { writeFile } = await import('node:fs/promises')
  const { resolve, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/sitemap.xml')
  await writeFile(out, xml, 'utf8')
  console.log(`[sitemap] wrote ${entries.length} URLs → ${out}`)
}

async function run() {
  try {
    await main()
  } catch (err) {
    const { readFile } = await import('node:fs/promises')
    const { resolve, dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/sitemap.xml')
    try {
      const existing = await readFile(out, 'utf8')
      console.error(`[sitemap] generation failed (${err.message})`)
      console.error(`[sitemap] keeping existing ${out} (${existing.length} bytes) — set API_BASE_URL to regenerate`)
      process.exit(0)
    } catch {
      console.error('[sitemap] generation failed:', err.message)
      console.error('[sitemap] no existing sitemap.xml to fall back on — set API_BASE_URL and re-run')
      process.exit(1)
    }
  }
}

run()
