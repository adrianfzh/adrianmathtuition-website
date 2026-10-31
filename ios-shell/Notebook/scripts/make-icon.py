"""Draws the placeholder app icon (1024x1024, no transparency).
Run with the system python (has Pillow):  /usr/bin/python3 scripts/make-icon.py
"""
import os
from PIL import Image, ImageDraw

S = 4096  # draw 4x, then shrink for smooth edges
BLUE = (40, 112, 240)
LINE = (190, 210, 245)
img = Image.new("RGB", (S, S), BLUE)
d = ImageDraw.Draw(img)

# The page
pw, ph = int(S * 0.50), int(S * 0.64)
px, py = (S - pw) // 2, int(S * 0.18)
d.rounded_rectangle([px + 40, py + 70, px + pw + 40, py + ph + 70], radius=150, fill=(28, 88, 205))  # soft drop
d.rounded_rectangle([px, py, px + pw, py + ph], radius=150, fill=(255, 255, 255))
# Ruled lines
for i in range(5):
    y = py + int(ph * 0.22) + i * int(ph * 0.14)
    d.rounded_rectangle([px + int(pw * 0.14), y, px + int(pw * 0.86), y + 44], radius=22, fill=LINE)
# The check mark
w = 250
pts = [(px + int(pw * 0.24), py + int(ph * 0.55)),
       (px + int(pw * 0.44), py + int(ph * 0.73)),
       (px + int(pw * 0.80), py + int(ph * 0.33))]
d.line(pts, fill=BLUE, width=w, joint="curve")
for x, y in (pts[0], pts[2]):
    d.ellipse([x - w // 2, y - w // 2, x + w // 2, y + w // 2], fill=BLUE)

out = os.path.join(os.path.dirname(__file__), "..", "NotebookApp", "Resources", "Assets.xcassets", "AppIcon.appiconset", "AppIcon.png")
img.resize((1024, 1024), Image.LANCZOS).save(out)
print("wrote", os.path.abspath(out))
