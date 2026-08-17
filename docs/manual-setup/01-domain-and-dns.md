# 01 — Domain & DNS

> ⚠️ **Manual step.** These actions happen in your domain registrar's dashboard
> and DNS provider — the AI agent cannot perform them for you. Nothing here has
> been configured.

## Goal

Point `digitalsmm.shop` (apex) and `www.digitalsmm.shop` at Vercel, and
`api.digitalsmm.shop` + `admin.digitalsmm.shop` at the right places.

## Steps

1. **Buy the domain** (if you don't own it) at any registrar (Namecheap, GoDaddy,
   Cloudflare Registrar, …). You already use `digitalsmm.shop` in the codebase —
   keep that exact domain.

2. **Choose DNS hosting.** Recommended: Cloudflare (see 02-cloudflare.md). If
   you skip Cloudflare, use the registrar's default DNS.

3. **Add records.** With Cloudflare proxying (orange cloud ON for `digitalsmm.shop`
   and `www`):

   | Type | Name            | Value                                      | Proxy |
   |------|-----------------|--------------------------------------------|-------|
   | A    | `@`             | `76.76.21.21` (Vercel's anycast IP)        | ON    |
   | A    | `www`           | `76.76.21.21`                              | ON    |
   | A    | `api`           | `<your VPS public IP>`                     | OFF or ON |
   | A    | `admin`         | `76.76.21.21`                              | ON    |

   > Vercel recommends its anycast IP `76.76.21.21` for apex domains. The exact
   > IP is shown in Vercel → your project → Domains → Add domain. Verify it
   > before entering.

4. **Wait for propagation** (minutes to a few hours).

## Expected result

- `digitalsmm.shop` and `www.digitalsmm.shop` resolve and (after Vercel setup,
   see 03-vercel.md) serve the customer app.
- `api.digitalsmm.shop` resolves to your VPS.
- `admin.digitalsmm.shop` resolves to Vercel (admin project).

## Verify

```bash
nslookup digitalsmm.shop
nslookup api.digitalsmm.shop
# or
dig +short digitalsmm.shop
```

## Gotchas

- The **CORS allowlist** in `backend/.env` must include BOTH apex and `www`
  (a browser on `www.digitalsmm.shop` sends `Origin: https://www.digitalsmm.shop`).
- Keep `digitalsmm.shop` (apex) as the canonical domain — the SEO layer uses it
  for canonical URLs (see docs/seo.md).
