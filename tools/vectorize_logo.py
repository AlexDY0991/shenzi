"""Trace the flat two-colour CoolFly logo PNG into a crisp SVG.

Every connected shape becomes its own <path> (sorted left to right) so the
video can animate the logo piece by piece.

    python tools/vectorize_logo.py logo.png assets/logo.svg
"""
import sys

import cv2
import numpy as np

ORANGE = "#FF5A00"
INK = "#000000"


def trace(mask, eps):
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    shapes = []
    for i, c in enumerate(contours):
        if hierarchy[0][i][3] != -1 or cv2.contourArea(c) < 40:
            continue  # holes are emitted with their parent
        rings = [c]
        child = hierarchy[0][i][2]
        while child != -1:
            rings.append(contours[child])
            child = hierarchy[0][child][0]
        d = ""
        for ring in rings:
            pts = cv2.approxPolyDP(ring, eps, True).reshape(-1, 2)
            d += "M" + " L".join(f"{x:.0f} {y:.0f}" for x, y in pts) + " Z "
        x, y, w, h = cv2.boundingRect(c)
        shapes.append((x, d.strip()))
    return shapes


def main(src, dst):
    img = cv2.imread(src, cv2.IMREAD_UNCHANGED)
    if img.shape[2] == 4:
        a = img[:, :, 3:4].astype(np.float32) / 255
        img = (img[:, :, :3] * a + 255 * (1 - a)).astype(np.uint8)
    b, g, r = [img[:, :, i].astype(int) for i in range(3)]
    orange = ((r > 180) & (g < 150) & (b < 90)).astype(np.uint8) * 255
    ink = ((r < 90) & (g < 90) & (b < 90)).astype(np.uint8) * 255

    pieces = [(x, d, INK) for x, d in trace(ink, 1.6)]
    pieces += [(x, d, ORANGE) for x, d in trace(orange, 1.6)]
    pieces.sort()

    ys, xs = np.nonzero(ink | orange)
    pad = 4
    x0, y0 = xs.min() - pad, ys.min() - pad
    w, h = xs.max() - x0 + pad, ys.max() - y0 + pad
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {w} {h}" width="{w}" height="{h}">']
    for i, (_, d, fill) in enumerate(pieces):
        role = "accent" if fill == ORANGE else "ink"
        out.append(f'  <path data-i="{i}" data-role="{role}" fill="{fill}" fill-rule="evenodd" d="{d}"/>')
    out.append("</svg>")
    open(dst, "w").write("\n".join(out) + "\n")
    print(f"{len(pieces)} pieces, viewBox {x0} {y0} {w} {h}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
