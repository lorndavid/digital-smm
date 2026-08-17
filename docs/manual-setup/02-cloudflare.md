# 02 — Cloudflare

> ⚠️ **Manual step.** These actions happen in the Cloudflare dashboard — the AI
> agent cannot perform them for you. Nothing here has been configured.

## Goal

Put the domain behind Cloudflare for DNS, CDN, SSL and DDoS protection.

## Steps

1. **Create a Cloudflare account** → https://dash.cloudflare.com/sign-up
2. **Add the site**: dashboard → "Add a site" → enter `digitalsmm.shop` →
   choose a plan (Free is fine to start).
3. **Change nameservers**: Cloudflare shows two nameservers (e.g.
   `amy.ns.cloudflare.com`, `bob.ns.cloudflare.com`). Go to your registrar and
   replace the existing nameservers with Cloudflare's.
4. **Wait** until Cloudflare shows the site as "Active" (can take up to 24h,
   usually minutes).
5. **Add DNS records** (see 01-domain-and-dns.md for the exact table).
6. **SSL/TLS → Overview** → set mode to **Full (strict)** once your Vercel/VPS
   certificates exist.
7. (Recommended) **SSL/TLS → Edge Certificates** → enable "Always Use HTTPS".

## Expected result

- The site is served via Cloudflare with HTTPS.
- DNS changes propagate automatically; no more manual registrar DNS edits.

## Verify

- https://dash.cloudflare.com → your site shows **Active**.
- `curl -sI https://digitalsmm.shop | head -20` shows a Cloudflare `cf-ray`
  response header.

## Gotchas

- With **Full (strict)** SSL, the origin (Vercel/VPS) must have a valid cert.
- Do NOT set Cloudflare to proxy `api.digitalsmm.shop` before the VPS has an SSL
  cert, or proxied HTTPS to the origin will fail (use DNS-only until then).
- Cloudflare Universal SSL covers `digitalsmm.shop` and `*.digitalsmm.shop` —
  no paid cert needed.
