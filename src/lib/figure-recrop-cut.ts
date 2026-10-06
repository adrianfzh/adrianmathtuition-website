// The cut itself (sharp): the judge's boxes → the new picture. Shared by the batch script
// (scripts/figure-recrop) and the cloud door (/api/agent/recrop/cut), so both cut alike.
// Server-only. The rules it applies are in lib/figure-recrop.ts.
import sharp from 'sharp';
import { toPx, snapOutward, pad, planCrop, keptShare, type RecropVerdict, type CropPlan, type PxBox } from './figure-recrop';

/** White-flattened PNG of whatever was stored. */
export const flatPng = (b: Buffer) => sharp(b).flatten({ background: '#fff' }).png().toBuffer();
/** The picture small enough for a model to read: at most 1568 px on the long side. */
export const forModel = (b: Buffer) => sharp(b).flatten({ background: '#fff' }).resize({ width: 1568, height: 1568, fit: 'inside', withoutEnlargement: true }).png().toBuffer();

export async function cutRegions(src: Buffer, plan: CropPlan): Promise<Buffer> {
  const parts = await Promise.all(plan.regions.map((r) => sharp(src).flatten({ background: '#fff' })
    .extract({ left: r.x0, top: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0 }).png().toBuffer()));
  if (parts.length === 1) return parts[0];
  const metas = await Promise.all(parts.map((p) => sharp(p).metadata()));
  const gap = 18, W = Math.max(...metas.map((m) => m.width!)), H = metas.reduce((a, m) => a + m.height!, 0) + gap * (parts.length - 1);
  let y = 0;
  const layers = parts.map((p, i) => { const l = { input: p, left: 0, top: y }; y += metas[i].height! + gap; return l; });
  return sharp({ create: { width: W, height: H, channels: 3, background: '#fff' } }).composite(layers).png().toBuffer();
}

export type CutResult = { plan: CropPlan | null; crop: Buffer | null; share: number | null; sliced: boolean; keepPx: PxBox[]; dropPx: PxBox[]; w: number; h: number };

/** Boxes → snapped, padded, planned and cut. No plan when the verdict refuses or names a school mark. */
export async function cutFromVerdict(src: Buffer, verdict: RecropVerdict): Promise<CutResult> {
  const meta = await sharp(src).metadata(); const w = meta.width!, h = meta.height!;
  const grey = await sharp(src).greyscale().raw().toBuffer();
  let sliced = false;
  const keepPx = verdict.keep.map((k) => { const s = snapOutward(grey, w, h, toPx(k.box, w, h)); sliced ||= s.sliced; return pad(s.box, w, h); });
  const dropPx = verdict.drop.map((d) => toPx(d, w, h));
  const plan = verdict.schoolMark || verdict.refuse ? null : planCrop(keepPx, dropPx);
  if (!plan) return { plan: null, crop: null, share: null, sliced, keepPx, dropPx, w, h };
  return { plan, crop: await cutRegions(src, plan), share: keptShare(plan, w, h), sliced, keepPx, dropPx, w, h };
}
