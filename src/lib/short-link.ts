// A short adrianmathtuition.com/j/<code> in place of a long signed address sent on WhatsApp.
// Same scheme as the bot's lib/short-link.js (13 Oct 2026, Adrian: "yes" to a short sign-up link);
// /j/<code> forwards. The website's own sign-up link maker never used it until 3 Nov 2026 (Adrian,
// on Chantal's link: "I thought we said to shorten links?"). Any failure → the long address, so a
// parent always gets a working link.
import { randomBytes } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';

export const SHORT_BASE = 'https://www.adrianmathtuition.com/j/';
/** Sign-up links read as what they are: adrianmathtuition.com/register/<code> (3 Nov 2026). */
export const shortBaseFor = (purpose: string) => purpose === 'signup' ? 'https://www.adrianmathtuition.com/register/' : SHORT_BASE;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';   // no 0/O/1/l/I

/** An 8-character code. Pure apart from the random bytes. */
export function newShortCode(bytes: Uint8Array = randomBytes(8)): string {
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Only our own site can be shortened (the table checks it too). */
export const shortenable = (url: string) => String(url || '').startsWith('https://www.adrianmathtuition.com/');

export async function shortenUrl(url: string, opts: { expiresAt: Date; purpose?: string }): Promise<string> {
  if (!shortenable(url)) return url;
  try {
    const sb = getSupabaseAdmin();
    for (let i = 0; i < 3; i++) {
      const code = newShortCode();
      const { error } = await sb.from('short_links').insert({
        code, url, purpose: opts.purpose || 'signup', expires_at: opts.expiresAt.toISOString(),
      });
      if (!error) return shortBaseFor(opts.purpose || 'signup') + code;
      if (!/duplicate|unique/i.test(error.message || '')) throw new Error(error.message);
    }
  } catch (e) {
    console.warn('[short-link] kept the long address:', (e as Error).message);
  }
  return url;
}
