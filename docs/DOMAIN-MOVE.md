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

## ⚠️ What happened on 13 Oct 2026 — nameservers first FAILED

Nameservers were switched to `ns1/ns2.vercel-dns.com` while the domain was still registered at
SiteGround. Vercel's nameservers answered **REFUSED** (no zone: `vercel domains inspect` showed
"Intended Nameservers -", `vercel dns add` → "is not a DNS zone (400)"), so 8.8.8.8 and 1.1.1.1
returned nothing for the apex and www → site down ~15 min for fresh lookups. Reverted to
SiteGround; site back (200). **Never switch nameservers until `dig A adrianmathtuition.com
@ns1.vercel-dns.com` returns `216.198.79.1` (or an ALIAS answer) AND the six mail rows answer
there too.**

## Steps (Adrian clicks; the session checks after each) — transfer FIRST

1. **SiteGround** → Services → Domains → adrianmathtuition.com → ⋮ / Extras → unlock the
   domain + get the transfer (EPP) code. The SiteGround plan must stay alive (its DNS keeps
   the site up during the transfer).
2. **Vercel** → Domains → Transfer In → adrianmathtuition.com → paste code → pay US$11.25.
   Approve the "transfer away" e-mail from SiteGround/Tucows if it comes (≤5 days otherwise).
   Vercel does NOT copy DNS records; once its zone exists, the session adds the six non-A rows
   above (`vercel dns add`, Adrian approved "add them") or `vercel dns import` a zone file.
3. Session checks `dig … @ns1.vercel-dns.com` answers the site + all six rows BEFORE anything
   points at Vercel's nameservers; then the nameservers move to Vercel (Vercel may do this
   itself on transfer completion — check the site at once if it does).
4. Session checks: site 200 via 8.8.8.8, `/api/health-check`, a test Resend e-mail sends,
   `vercel domains inspect` shows registrar Vercel + expiry 2027.
5. Then turn off SiteGround auto-renew and let the plan lapse. Not before step 4.

Deadline: steps 2–7 done before **12 Nov 2026**; aim to finish by 1 Nov.

## Progress

- 14 Oct 2026 — ✅ MOVED. Vercel = registrar + nameservers (switched itself), expiry 12 Nov 2027. Vercel defaults (ALIAS @ + *) serve the site (apex 308 → www 200); the six rows added with `vercel dns add` and answer at ns1.vercel-dns.com and 8.8.8.8; Resend domain `verified`; no Resend email was sent in the gap. The zone file was never needed (do not import its A rows over the ALIAS defaults). Left for Adrian: SiteGround auto-renew off, let the plan lapse.
- 13 Oct 2026 (evening) — transfer DONE at the registry: registrar Name.com (Vercel's partner), expiry 12 Nov 2027, nameservers still SiteGround. Vercel's own list still says "Third Party" and `vercel dns import` still answers "not a DNS zone" after 30 min of retries. Next: import the zone once Vercel catches up, check every row @ns1.vercel-dns.com, then NS → Vercel if Vercel has not done it.
- 13 Oct 2026 — transfer to Vercel STARTED (paid US$11.25). Vercel warns the domain uses Vercel DNS once transferred; `docs/adrianmathtuition.com.zone` (website + the six rows) made for its zone-file upload box — the upload FAILS ("not a DNS zone", same as the CLI) until the transfer completes; import it with `vercel dns import adrianmathtuition.com docs/adrianmathtuition.com.zone` the moment it does (Vercel defaults ALIAS @ + * keep the site up meanwhile). After completion: dig @ns1.vercel-dns.com for every row, health-check, Resend test.
- 13 Oct 2026 — plan agreed, records snapshotted, reply_to fixed; Vercel chosen, site shows Gmail. Nameserver switch tried, site down ~15 min, reverted (see ⚠️). Next: transfer, step 1.
