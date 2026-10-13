# Moving adrianmathtuition.com off SiteGround (13 Oct 2026)

Adrian, 13 Oct 2026: SiteGround plan is expiring → "yes" to: check the old inbox, forward all
@adrianmathtuition.com mail to Gmail, move the domain + DNS, let SiteGround lapse.

## Where things stood on 13 Oct 2026

- **Website** = Vercel (A `216.198.79.1`). Not on SiteGround any more.
- **Domain registration** = via SiteGround (registrar Tucows). **Expires 12 Nov 2026.**
- **DNS** = SiteGround (`ns1/ns2.siteground.net`).
- **Inbound mail** = SiteGround (`mx10/20/30.mailspamprotection.com`). The site footer and
  `/signup` print `adrian@adrianmathtuition.com`, so parents may have written there.
- **Outbound mail** = Resend (`send.` subdomain + `resend._domainkey`). Every Resend email sets
  `reply_to: adrianmathtuition@gmail.com` (welcome + discontinue added 13 Oct 2026) — except
  the portal invite, which replies to `ablnon@hotmail.com` (left as is).
- Reminder task `siteground-vercel-migration-reminder` fires 1 Nov 2026 (`docs/OPS.md`).

## Destination: Cloudflare (not Vercel)

Vercel can host DNS but cannot forward email. Cloudflare does DNS, free email forwarding
(Email Routing) and registration at cost, in one account.

## Records to copy (everything else is SiteGround's own and is dropped)

| Type | Name | Value | Note |
|---|---|---|---|
| A | `@` | `216.198.79.1` | DNS only (grey cloud) — Vercel |
| A | `www` | `216.198.79.1` | DNS only (grey cloud) — Vercel |
| MX | `send` | `10 feedback-smtp.ap-northeast-1.amazonses.com` | Resend |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | Resend |
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCgt1PQrZBkN+2UWRdJaTVO90oPRkTT2bbtzwfxFzO8OjT+wmfx3qDzgPrJaWTZEfwmFJUU00MWWGih2uOX0GQok8gsdJ6pO7Qpxgb/OtRNShQquHZXtAxFn/x64bDYdpaziCpnv1ZKEiSh+fKZgVJoSIfUjn7cmnP1Q23gdhBvrwIDAQAB` | Resend DKIM |
| TXT | `_dmarc` | `v=DMARC1; p=none; aspf=r; adkim=r;` | |
| TXT | `@` | `google-site-verification=bqhqJkFiw6s8CYlUDOFAJjEwt3N1fRF494QhSR7IhDo` | Search Console |
| TXT | `@` | `google-site-verification=QN9XvVYohoRNFbHlrbViSEW0SNKzZQILdTHS_wGSZTQ` | Search Console |

Drop: root MX `mailspamprotection.com` + root SPF (Email Routing adds its own), `mail`/`ftp`/
`webmail` A `35.213.156.147`, `default._domainkey` (SiteGround DKIM).

## Steps (Adrian clicks; the session checks after each)

1. **SiteGround** → Site Tools → Email → Accounts: open any adrian@/invoices@/hello@ inbox,
   save anything from parents.
2. **Cloudflare** → Add a site → `adrianmathtuition.com` → Free plan. Check the imported
   records against the table above; set both A records to DNS only.
3. **SiteGround** → Services → Domains → change nameservers to the two Cloudflare gives.
4. Session checks: website + `/api/health-check` open, a test Resend email still sends.
5. **Cloudflare** → Email → Email Routing → catch-all → `adrianmathtuition@gmail.com`
   (confirm the Gmail link). Session sends a test to adrian@ and invoices@.
6. **SiteGround** → domain → unlock + get the transfer (EPP) code.
   **Cloudflare** → Domain Registration → Transfer → paste code, pay ~US$10.
   SiteGround's approval email may arrive — approve to speed it up (up to 5 days).
7. Session checks the registrar shows Cloudflare and the new expiry date (2027).
8. Then let the SiteGround plan lapse (turn off auto-renew). Not before step 7.

Deadline: steps 2–7 done before **12 Nov 2026**; aim to finish by 1 Nov.

## Progress

- 13 Oct 2026 — plan agreed, records snapshotted, reply_to fixed. Next: step 1.
