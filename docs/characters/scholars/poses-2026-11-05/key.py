# Key the green out of each sheet, split the 3x2 grid, trim, save 512px cut-outs.
# /usr/bin/python3 out/chibi-poses/key.py  (from the side-project root, or run in this folder)
import os, numpy as np
from PIL import Image, ImageFilter
here = os.path.dirname(os.path.abspath(__file__))
POSES = ['idle', 'point', 'think', 'oops', 'nod', 'cheer']
for name in ['boy-seedream', 'boy-gpt', 'girl-seedream', 'girl-gpt']:
    im = Image.open(f'{here}/gen/{name}.png').convert('RGB')
    a = np.asarray(im).astype(np.float32)
    h, w, _ = a.shape
    corners = np.concatenate([a[:20, :20].reshape(-1, 3), a[:20, -20:].reshape(-1, 3), a[-20:, :20].reshape(-1, 3), a[-20:, -20:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    d = np.sqrt(((a - bg) ** 2).sum(axis=2))
    # green-dominance test too, so soft green fringes go
    g_dom = a[:, :, 1] - np.maximum(a[:, :, 0], a[:, :, 2])
    alpha = np.clip((d - 40) / 60, 0, 1)
    alpha = np.where((g_dom > 60) & (d < 140), np.minimum(alpha, 0.0), alpha)
    # despill: pull green down to max(r,b) on the edges
    rgb = a.copy()
    spill = rgb[:, :, 1] > np.maximum(rgb[:, :, 0], rgb[:, :, 2])
    rgb[:, :, 1] = np.where(spill & (alpha < 1), np.maximum(rgb[:, :, 0], rgb[:, :, 2]), rgb[:, :, 1])
    rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    out = Image.fromarray(rgba, 'RGBA')
    out = Image.fromarray(np.dstack([rgba[:, :, :3], np.asarray(out.getchannel('A').filter(ImageFilter.MinFilter(3)))]), 'RGBA')
    cw, ch = w // 3, h // 2
    for i, pose in enumerate(POSES):
        cell = out.crop(((i % 3) * cw, (i // 3) * ch, (i % 3 + 1) * cw, (i // 3 + 1) * ch))
        bb = cell.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox()
        cell = cell.crop(bb)
        s = 480 / max(cell.size)
        cell = cell.resize((max(1, int(cell.size[0] * s)), max(1, int(cell.size[1] * s))), Image.LANCZOS)
        sq = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
        sq.alpha_composite(cell, ((512 - cell.size[0]) // 2, 512 - cell.size[1] - 8))  # bottom-aligned like the tutor set
        os.makedirs(f'{here}/cut/{name}', exist_ok=True)
        sq.save(f'{here}/cut/{name}/{pose}.png')
print('cut done')
