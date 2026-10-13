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

## Destination: Vercel (decided 13 Oct 2026)

Adrian: "we need not use that email address" → no inbound mail at the domain, so no
forwarding needed and Cloudflare's one advantage is gone. Vercel .com = US$11.25/yr
(`vercel domains price`), Cloudflare ~US$10.46. Site footer, /signup, the JSON-LD and
`public/llms.txt` now show `adrianmathtuition@gmail.com` instead of adrian@ (13 Oct 2026).
Vercel's own records for the site (apex + www) are automatic once its nameservers are in;
only the mail/Google rows below need adding. The CLI `vercel dns add` is blocked by the
session's permission classifier — Adrian adds them in the dashboard or approves the CLI.

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

Drop: root MX `mailspamprotection.com` + root SPF (no inbound mail any more), `mail`/`ftp`/
`webmail` A `35.213.156.147`, `default._domainkey` (SiteGround DKIM).

## Steps (Adrian clicks; the session checks after each)

1. **Vercel** → Domains → adrianmathtuition.com → DNS Records: add the six rows above that
   are not A records (send MX, send TXT, resend._domainkey, _dmarc, two google TXT).
2. **SiteGround** → Services → Domains → adrianmathtuition.com → Nameservers →
   `ns1.vercel-dns.com`, `ns2.vercel-dns.com`.
3. Session checks: website + `/api/health-check` open, a test Resend email still sends.
4. **SiteGround** → domain → unlock + get the transfer (EPP) code. **Vercel** → Domains →
   Transfer In → paste code, pay US$11.25. Approve SiteGround's e-mail if it comes (≤5 days).
5. Session checks `vercel domains inspect`: registrar Vercel, expiry 2027.
6. Then turn off SiteGround auto-renew and let the plan lapse. Not before step 5.

Deadline: steps 2–7 done before **12 Nov 2026**; aim to finish by 1 Nov.

## Progress

- 13 Oct 2026 — plan agreed, records snapshotted, reply_to fixed; Vercel chosen, site shows Gmail. Next: step 1.
