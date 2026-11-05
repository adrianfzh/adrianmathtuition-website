# Side-by-side on the slate (#2a3631) and on paper, at board size and at phone corner size (150 px).
import os
from PIL import Image, ImageDraw, ImageFont
here = os.path.dirname(os.path.abspath(__file__))
POSES = ['idle', 'point', 'think', 'oops', 'nod', 'cheer']
ROWS = [('Boy — Seedream', 'boy-seedream'), ('Boy — GPT Image 2', 'boy-gpt'), ('Girl — Seedream', 'girl-seedream'), ('Girl — GPT Image 2', 'girl-gpt')]
try: font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 28); small = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)
except Exception: font = small = ImageFont.load_default()
cell, lab = 220, 260
W, H = lab + cell * 6 + 40 + 150 * 2, 60 + len(ROWS) * (cell + 20)
c = Image.new('RGB', (W, H), (42, 54, 49)); d = ImageDraw.Draw(c)
for i, p in enumerate(POSES): d.text((lab + i * cell + cell // 2 - 30, 20), p, fill=(220, 220, 210), font=small)
d.text((lab + cell * 6 + 50, 20), 'phone corner (150 px)', fill=(220, 220, 210), font=small)
for r, (title, name) in enumerate(ROWS):
    y = 60 + r * (cell + 20)
    d.text((16, y + cell // 2 - 16), title, fill=(240, 240, 230), font=font)
    for i, p in enumerate(POSES):
        im = Image.open(f'{here}/cut/{name}/{p}.png').resize((cell, cell), Image.LANCZOS)
        c.paste(im, (lab + i * cell, y), im)
    x0 = lab + cell * 6 + 40
    paper = Image.new('RGB', (150, 150), (250, 248, 240)); im = Image.open(f'{here}/cut/{name}/cheer.png').resize((150, 150), Image.LANCZOS)
    c.paste(Image.open(f'{here}/cut/{name}/point.png').resize((150, 150), Image.LANCZOS), (x0, y + 35), Image.open(f'{here}/cut/{name}/point.png').resize((150, 150), Image.LANCZOS))
    paper.paste(im, (0, 0), im); c.paste(paper, (x0 + 150 + 10, y + 35))
c.save(f'{here}/compare.png'); c.convert('RGB').resize((W * 2 // 3, H * 2 // 3)).save(f'{here}/compare-small.jpg', quality=88)
print(c.size)
