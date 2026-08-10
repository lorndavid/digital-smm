/**
 * Zero-dependency gallery server for the dashboard screenshot pass.
 *
 * Serves the PNGs captured by width-pass.spec.ts (frontend/shots/) and
 * renders a clean dark gallery page so the layouts can be eyeballed with
 * one click — no image viewer needed.
 *
 * Usage:  node e2e-screenshots/gallery-server.mjs   (from frontend/)
 * Open:   http://localhost:8787
 */
import { createServer } from 'node:http'
import { readdirSync, createReadStream, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT || 8787)
const SHOTS = fileURLToPath(new URL('../shots/', import.meta.url))

const MIME = {
  '.png': 'image/png',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
}

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    background: #080b16; color: #e7eaf3; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p { color: #8b93a7; margin: 0 0 24px; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 20px; }
  figure { margin: 0; background: #0e1322; border: 1px solid #1c2438; border-radius: 14px;
    overflow: hidden; transition: border-color .15s ease; }
  figure:hover { border-color: #3d4b74; }
  figcaption { display: flex; justify-content: space-between; align-items: center; gap: 8px;
    padding: 10px 14px; font-size: 12.5px; }
  figcaption span { font-weight: 600; color: #d5daf0; }
  figcaption a { color: #6ea8ff; text-decoration: none; }
  figcaption a:hover { text-decoration: underline; }
  img { display: block; width: 100%; height: auto; border-bottom: 1px solid #161d30;
    background: #05070f; }
</style>
</head>
<body>
  <h1>${title}</h1>
  <p>Full-page screenshots at a 1920&times;1080 viewport &mdash; click a filename to open the raw PNG.</p>
  ${body}
</body>
</html>`
}

function gallery() {
  const files = readdirSync(SHOTS).filter((f) => f.endsWith('.png')).sort()
  const cards = files
    .map((f) => {
      const base = f.replace('.png', '')
      const [area] = base.split('-')
      const label = base.replace(/-(0[1-9])/, ' — $1').replace(/user|admin/i, (m) => m.toUpperCase())
      return `<figure>
        <img src="${f}" alt="${label}" loading="lazy" />
        <figcaption><span>${label} <small style="color:#5b6478">(${area} app)</small></span>
        <a href="${f}">open png</a></figcaption>
      </figure>`
    })
    .join('\n')
  return page('VidSMM — Dashboard width screenshot pass', `<div class="grid">${cards}</div>`)
}

createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (urlPath === '/' || urlPath === '/index.html') {
      const html = gallery()
      res.writeHead(200, { 'content-type': MIME['.html'], 'content-length': Buffer.byteLength(html) })
      res.end(html)
      return
    }
    const safe = normalize(join(SHOTS, urlPath))
    if (!safe.startsWith(normalize(SHOTS)) || !statSync(safe).isFile()) {
      res.writeHead(404)
      res.end('Not found')
      return
    }
    const type = MIME[extname(safe).toLowerCase()] || 'application/octet-stream'
    res.writeHead(200, { 'content-type': type })
    createReadStream(safe).pipe(res)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}).listen(PORT, () => console.log(`Screenshot gallery: http://localhost:${PORT}`))
