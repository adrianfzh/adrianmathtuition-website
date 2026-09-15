"""The mixed-size watermark carpets that were put in front of Adrian, 15 Sep 2026.

Seven were built (P-V) over the same real page of his own revision book.
HE LIKED **T, U and V** ("i like T, U and V, put them into memory (not using
them yet, but may and iterate later)").  The other four are kept below because
the next iteration will most likely be a tweak of a shape already drawn, not a
new one.

    /usr/bin/python3 designs.py        # writes m-*.png, 200 dpi A4 tiles
    python3 stamp.py book.pdf m-level.png out.pdf 51    # try one over a real page

Nothing here is wired into worksheet_lib.py yet - he has not chosen a final
design or an ink strength, so no sheet carries a watermark.
"""
from mixsize import carpet, seg, PHRASE, CAPS, BOLD, ARIAL, GEORGIA

B = PHRASE          # 'AdrianMath Tuition'   - mixed case, bold
C = CAPS            # 'ADRIANMATH TUITION'   - the small tracked line

# ---------------------------------------------------------------- the three he liked

# T - the same beat, but LEVEL: a grid, the way a school does it.
#     (This is the one closest to the RGS look he started from - RGS is a level
#     grid of the school's short name, ~20% black, 1.15 cm row pitch.)
carpet('m-level.png', [
    [seg(B, 22, 7)],
    [seg(C, 8, 13, track=1.0, font=ARIAL)],
    [seg(B, 13, 9)],
], angle=0)

# U - high contrast: one large row answered by three small ones.
carpet('m-contrast.png', [
    [seg(B, 34, 5)],
    [seg(C, 6.5, 14, track=1.3, font=ARIAL)],
    [seg(C, 6.5, 14, track=1.3, font=ARIAL)],
    [seg(C, 6.5, 14, track=1.3, font=ARIAL)],
], lead=1.35)

# V - the beat set in Georgia, to match the body type on his sheets.
carpet('m-serif.png', [
    [seg(B, 24, 7, font=GEORGIA)],
    [seg(C, 8, 12, track=1.2, font=GEORGIA)],
    [seg(B, 14, 9, font=GEORGIA)],
    [seg(C, 8, 12, track=1.2, font=GEORGIA)],
])

# ---------------------------------------------------------------- the four he passed over

# P - three sizes in a repeating beat, down the page
carpet('m-beat.png', [
    [seg(B, 26, 7)],
    [seg(C, 8.5, 13, track=1.0, font=ARIAL)],
    [seg(B, 15, 9)],
    [seg(C, 8.5, 13, track=1.0, font=ARIAL)],
])

# Q - one big row, then a fine tracked line filling the gap under it
carpet('m-pair.png', [
    [seg(B, 30, 6)],
    [seg(C, 7, 14, track=1.4, font=ARIAL)],
], lead=1.30)

# R - a scale: the phrase steps down through four sizes and starts again
carpet('m-scale.png', [
    [seg(B, 28, 6)],
    [seg(B, 18, 8)],
    [seg(B, 12, 10)],
    [seg(C, 7.5, 13, track=1.2, font=ARIAL)],
], angle=-58)

# S - the sizes change ALONG the line as well as down it
carpet('m-inline.png', [
    [seg(B, 24, 7), seg(C, 8, 13, track=1.1, font=ARIAL), seg(B, 13, 10)],
    [seg(C, 9, 12, track=1.1, font=ARIAL), seg(B, 19, 8), seg(C, 7, 14, track=1.4, font=ARIAL)],
], lead=1.5)

print('ok')
