import { describe, expect, it } from 'vitest';
import { scienceImageBase, withScienceImageUrls } from './science-images';
import { questionMarkdown, solutionMarkdown } from './bank-question-markdown';

const BASE = scienceImageBase('https://eaxnstsecxmqdobfvmjh.supabase.co/');
const SCI = 'https://eaxnstsecxmqdobfvmjh.supabase.co/storage/v1/object/public/question_images/';

describe('withScienceImageUrls', () => {
  it('builds the science bucket base', () => {
    expect(BASE).toBe(SCI);
    expect(scienceImageBase('')).toBe('');
  });

  it('points a bare stem image at the science bucket, not the maths one (the 5 Oct 2026 broken-figure bug)', () => {
    const row = withScienceImageUrls({ question_text: 'Which fuse melts?', image_url: 'phys_vs_2023_p1_q25_e6b84af2.png' }, BASE);
    const md = questionMarkdown(row);
    expect(md).toContain(`${SCI}phys_vs_2023_p1_q25_e6b84af2.png`);
    expect(md).not.toContain('nempslbewxtlikfzachi');
  });

  it('handles JSON-array image_url, images[], parts, subparts, {{IMG:}} and solution_images', () => {
    const row = withScienceImageUrls({
      question_text: 'See {{IMG:question_images/a_fig.png}} here',
      image_url: JSON.stringify([{ url: 'b_fig.png', pos: 'before' }]),
      images: [{ filename: 'c_fig.png' }],
      solution: 'Working ![d](d_fig.png) done',
      solution_images: '["e_fig.png"]',
      parts: [{ label: 'a', text: 'x', image_url: 'f_fig.png', subparts: [{ label: 'i', text: 'y', image_url_after: '["g_fig.png"]', solution_image: 'h_fig.png' }] }],
    }, BASE);
    expect(row.question_text).toBe(`See {{IMG:${SCI}a_fig.png}} here`);
    expect(JSON.parse(row.image_url as string)).toEqual([{ url: `${SCI}b_fig.png`, pos: 'before' }]);
    expect(row.images).toEqual([{ filename: `${SCI}c_fig.png` }]);
    expect(row.solution).toBe(`Working ![d](${SCI}d_fig.png) done`);
    expect(JSON.parse(row.solution_images as string)).toEqual([`${SCI}e_fig.png`]);
    const p = (row.parts as { image_url: string; subparts: { image_url_after: string; solution_image: string }[] }[])[0];
    expect(p.image_url).toBe(`${SCI}f_fig.png`);
    expect(JSON.parse(p.subparts[0].image_url_after)).toEqual([`${SCI}g_fig.png`]);
    expect(p.subparts[0].solution_image).toBe(`${SCI}h_fig.png`);
    expect(solutionMarkdown(row)).toContain(`${SCI}e_fig.png`);
  });

  it('leaves absolute urls, empty slots and a missing base alone', () => {
    const row = { question_text: 'q', image_url: 'https://x.test/a.png', images: [] as { filename: string }[] };
    expect(withScienceImageUrls(row, BASE)).toEqual(row);
    expect(withScienceImageUrls({ image_url: '[]' }, BASE)).toEqual({ image_url: '[]' });
    const rel = { image_url: 'a_fig.png' };
    expect(withScienceImageUrls(rel, '')).toBe(rel);
  });

  it('does not mutate the row it was given', () => {
    const row = { image_url: 'a_fig.png', parts: [{ label: 'a', image_url: 'b_fig.png' }] };
    withScienceImageUrls(row, BASE);
    expect(row).toEqual({ image_url: 'a_fig.png', parts: [{ label: 'a', image_url: 'b_fig.png' }] });
  });
});
