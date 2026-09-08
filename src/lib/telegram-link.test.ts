import { describe, it, expect } from 'vitest';
import { signTelegramLinkToken, verifyTelegramLinkToken, telegramDeepLink, parseStartPayload, TELEGRAM_LINK_TTL_SECONDS } from './telegram-link';

const UID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const SECRET = 'test-secret';
const NOW = Date.UTC(2026, 8, 8, 4, 0, 0);

describe('Telegram link token', () => {
  it('round-trips the account uuid and fits Telegram start-parameter rules', () => {
    const t = signTelegramLinkToken(UID, SECRET, NOW);
    expect(t.length).toBeLessThanOrEqual(64);
    expect(t).toMatch(/^tg_[A-Za-z0-9_-]+$/);
    expect(verifyTelegramLinkToken(t, SECRET, NOW + 1000)).toEqual({ uid: UID });
    expect(telegramDeepLink(t)).toBe(`https://t.me/AdrianMathBot?start=${t}`);
  });

  it('expires after the TTL and rejects a wrong secret or a tampered byte', () => {
    const t = signTelegramLinkToken(UID, SECRET, NOW);
    expect(verifyTelegramLinkToken(t, SECRET, NOW + (TELEGRAM_LINK_TTL_SECONDS + 1) * 1000)).toBeNull();
    expect(verifyTelegramLinkToken(t, 'other', NOW)).toBeNull();
    const flipped = t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A');
    expect(verifyTelegramLinkToken(flipped, SECRET, NOW)).toBeNull();
  });

  it('survives a uid whose base64url contains _ or -', () => {
    // 0xff / 0xfb runs encode to '-' and '_' in base64url; parsing is positional.
    const uid = 'ffffffff-fbfb-fbfb-ffff-fbfbfbfbfbfb';
    const t = signTelegramLinkToken(uid, SECRET, NOW);
    expect(t.slice(3, 25)).toMatch(/[-_]/);
    expect(verifyTelegramLinkToken(t, SECRET, NOW)).toEqual({ uid });
  });

  it('is null on junk, never a throw', () => {
    for (const junk of [null, 42, '', 'tg_', 'tg_short_1_x', 'x'.repeat(65), 'tg_' + 'a'.repeat(22) + '_zz_' + 'b'.repeat(16)]) {
      expect(verifyTelegramLinkToken(junk, SECRET, NOW)).toBeNull();
    }
    expect(() => signTelegramLinkToken('not-a-uuid', SECRET, NOW)).toThrow();
  });

  it('parseStartPayload reads the bot-side /start payload and nothing else', () => {
    const t = signTelegramLinkToken(UID, SECRET, NOW);
    expect(parseStartPayload(`/start ${t}`)).toBe(t);
    expect(parseStartPayload(`/start@AdrianMathBot ${t} `)).toBe(t);
    expect(parseStartPayload('/start')).toBeNull();
    expect(parseStartPayload('/start register')).toBeNull();
    expect(parseStartPayload(`hello ${t}`)).toBeNull();
    expect(parseStartPayload(undefined)).toBeNull();
  });
});
