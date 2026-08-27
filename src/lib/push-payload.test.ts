import { describe, expect, it } from 'vitest';
import { buildPushPayload, urlBase64ToUint8Array } from './push-payload';

describe('buildPushPayload', () => {
  it('serialises title/body/url', () => {
    expect(JSON.parse(buildPushPayload({
      title: 'Your marked paper is ready ✅',
      body: 'SJC Prelim P2',
      url: '/app/marking',
    }))).toEqual({
      title: 'Your marked paper is ready ✅',
      body: 'SJC Prelim P2',
      url: '/app/marking',
    });
  });

  it('defaults body to empty and url to /app', () => {
    expect(JSON.parse(buildPushPayload({ title: 'Hi' }))).toEqual({
      title: 'Hi', body: '', url: '/app',
    });
  });

  it('truncates an over-long body', () => {
    const parsed = JSON.parse(buildPushPayload({ title: 't', body: 'x'.repeat(1000) }));
    expect(parsed.body).toHaveLength(240);
  });

  it('rejects off-site urls — absolute and protocol-relative both fall back to /app', () => {
    expect(JSON.parse(buildPushPayload({ title: 't', url: 'https://evil.example/phish' })).url).toBe('/app');
    expect(JSON.parse(buildPushPayload({ title: 't', url: '//evil.example/phish' })).url).toBe('/app');
    expect(JSON.parse(buildPushPayload({ title: 't', url: '/app/marking' })).url).toBe('/app/marking');
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodes plain base64', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3]);
  });

  it('restores missing padding', () => {
    expect(Array.from(urlBase64ToUint8Array('AA'))).toEqual([0]);
  });

  it('maps the url-safe alphabet (- and _)', () => {
    expect(Array.from(urlBase64ToUint8Array('-w'))).toEqual([251]);
    expect(Array.from(urlBase64ToUint8Array('_w'))).toEqual([255]);
  });

  it('decodes a VAPID-shaped key (87 chars → 65 bytes, uncompressed-point 0x04 lead)', () => {
    const bytes = urlBase64ToUint8Array('B' + 'A'.repeat(86));
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
  });
});
