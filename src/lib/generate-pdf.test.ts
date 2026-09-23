import { describe, it, expect } from 'vitest';
import { localChromePath } from './generate-pdf';

const MAC = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// A fake filesystem: `files` exist, `dirs` maps a directory to its entries.
const fake = (files: string[], dirs: Record<string, string[]> = {}) => ({
  existsSync: (p: string) => files.includes(p),
  readdirSync: (p: string) => {
    if (!(p in dirs)) throw new Error(`ENOENT ${p}`);
    return dirs[p];
  },
});

describe('localChromePath', () => {
  it('uses the Mac Chrome when it is there and nothing overrides it (unchanged behaviour)', () => {
    expect(localChromePath({}, fake([MAC]))).toBe(MAC);
  });

  it('lets CHROME_PATH, then PUPPETEER_EXECUTABLE_PATH, win over the Mac default', () => {
    expect(localChromePath({ CHROME_PATH: '/x/chrome', PUPPETEER_EXECUTABLE_PATH: '/y/chrome' }, fake([MAC]))).toBe('/x/chrome');
    expect(localChromePath({ PUPPETEER_EXECUTABLE_PATH: ' /y/chrome\n' }, fake([MAC]))).toBe('/y/chrome');
  });

  it('finds the newest Playwright Chromium on a cloud container', () => {
    const fs = fake(
      ['/opt/pw-browsers/chromium-1187/chrome-linux/chrome', '/opt/pw-browsers/chromium-1200/chrome-linux/chrome'],
      { '/opt/pw-browsers': ['chromium-1187', 'chromium_headless_shell-1200', 'chromium-1200', 'ffmpeg-1011'] },
    );
    expect(localChromePath({}, fs)).toBe('/opt/pw-browsers/chromium-1200/chrome-linux/chrome');
  });

  it('honours PLAYWRIGHT_BROWSERS_PATH and the chrome-linux64 layout', () => {
    const fs = fake(['/pw/chromium-1300/chrome-linux64/chrome'], { '/pw': ['chromium-1300'] });
    expect(localChromePath({ PLAYWRIGHT_BROWSERS_PATH: '/pw' }, fs)).toBe('/pw/chromium-1300/chrome-linux64/chrome');
  });

  it('answers the Mac path when no Chrome is found, so the launch error reads as before', () => {
    expect(localChromePath({}, fake([]))).toBe(MAC);
    expect(localChromePath({}, fake([], { '/opt/pw-browsers': ['chromium-1187'] }))).toBe(MAC);
  });
});
