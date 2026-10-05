import { describe, it, expect } from 'vitest';
import { TAB_LABELS, TAB_VIEW_GAP_MS, isTabName, shouldSendTabView, tabForPath, tabLabel } from './portal-tabs';

describe('tabForPath', () => {
  it('names each app tab by a fixed short name', () => {
    expect(tabForPath('/app')).toBe('home');
    expect(tabForPath('/app/')).toBe('home');
    expect(tabForPath('/app/practice')).toBe('practice');
    expect(tabForPath('/app/practice/timed')).toBe('practice-timed');
    expect(tabForPath('/app/practice/methods')).toBe('jc-methods');
    expect(tabForPath('/app/practice/sketch/abc')).toBe('jc-sketch');
    expect(tabForPath('/app/marking')).toBe('papers');
    expect(tabForPath('/app/marking/7f3a')).toBe('paper');
    expect(tabForPath('/app/marking/7f3a/explain/3')).toBe('explain');
    expect(tabForPath('/app/my-notes')).toBe('notebook');
    expect(tabForPath('/app/notebook')).toBe('re-attempt');
    expect(tabForPath('/app/science')).toBe('science-home');
    expect(tabForPath('/app/science/practice')).toBe('science-practice');
    expect(tabForPath('/app/science/practice/run')).toBe('science-practice-run');
    expect(tabForPath('/app/science/submit')).toBe('science-submit');
    expect(tabForPath('/app/science/papers')).toBe('science-papers');
    expect(tabForPath('/app/science/marking/abc')).toBe('science-paper');
    expect(tabForPath('/app/science/my-notes')).toBe('science-notebook');
    expect(tabForPath('/app/science/qa')).toBe('science-study');
    expect(tabForPath('/app/humanities/q/x')).toBe('humanities');
    expect(tabForPath('/app/languages/essays')).toBe('languages');
  });
  it('ignores the query string and never matches look-alike paths', () => {
    expect(tabForPath('/app/practice?qid=123')).toBe('practice');
    expect(tabForPath('/app/practicex')).toBe('other');
    expect(tabForPath('/application')).toBeNull();
  });
  it('unknown under /app → other; outside /app → null', () => {
    expect(tabForPath('/app/something-new')).toBe('other');
    expect(tabForPath('/admin')).toBeNull();
    expect(tabForPath(null)).toBeNull();
  });
  it('every name the mapper returns is on the allow-list', () => {
    for (const p of ['/app', '/app/ask', '/app/find', '/app/print', '/app/settings', '/app/suggestions', '/app/x']) {
      expect(isTabName(tabForPath(p))).toBe(true);
    }
  });
});

describe('allow-list', () => {
  it('accepts only the fixed names, never a URL', () => {
    expect(isTabName('practice')).toBe(true);
    expect(isTabName('/app/practice')).toBe(false);
    expect(isTabName('toString')).toBe(false);
    expect(isTabName(3)).toBe(false);
  });
  it('labels', () => {
    expect(tabLabel('papers')).toBe(TAB_LABELS.papers);
    expect(tabLabel('weird')).toBe('weird');
  });
});

describe('shouldSendTabView — once per tab per 30 minutes', () => {
  const now = 1_000_000_000;
  it('sends the first time and after the gap', () => {
    expect(shouldSendTabView(null, now)).toBe(true);
    expect(shouldSendTabView(now - TAB_VIEW_GAP_MS, now)).toBe(true);
    expect(shouldSendTabView(NaN, now)).toBe(true);
  });
  it('holds inside the gap; a clock that went back sends', () => {
    expect(shouldSendTabView(now - TAB_VIEW_GAP_MS + 1, now)).toBe(false);
    expect(shouldSendTabView(now + 5000, now)).toBe(true);
  });
});
