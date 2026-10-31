#!/usr/bin/env python3.13
"""Draw the UML and DFD figures for Chapter 4 as SVG.

Rendered to PNG by render_diagrams.js. Plain shapes and one sans face, so the
figures stay legible when the report is printed in black and white.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "diagrams")
os.makedirs(OUT, exist_ok=True)

INK = "#16202e"
LINE = "#2b3a4f"
SOFT = "#f2f4f7"
BAND = "#e7ecf3"
FONT = "DejaVu Sans, Verdana, sans-serif"

# Type scale. The canvases are ~1500 px wide and land in a 6-inch column, so a
# 16 px label would print at about 4 pt. Everything is scaled up against that.
FS = 1.0

HEAD = """<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"
     viewBox="0 0 {w} {h}" font-family="{font}">
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="5" markerHeight="5" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="{line}"/>
  </marker>
  <marker id="arrowopen" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="{line}" stroke-width="1.4"/>
  </marker>
</defs>
<rect width="{w}" height="{h}" fill="#ffffff"/>
"""


def txt(x, y, lines, size=17, anchor="middle", weight="normal", fill=INK, lh=1.25, style=""):
    size = size * FS
    if isinstance(lines, str):
        lines = [lines]
    dy = -(len(lines) - 1) * size * lh / 2
    out = []
    for i, ln in enumerate(lines):
        out.append(
            f'<text x="{x}" y="{y + dy + i * size * lh + size * 0.35:.1f}" font-size="{size}" '
            f'text-anchor="{anchor}" font-weight="{weight}" fill="{fill}" {style}>'
            f'{ln}</text>'
        )
    return "\n".join(out)


def box(x, y, w, h, lines, size=17, fill="#ffffff", rx=4, weight="normal", sw=3):
    return (f'<rect x="{x - w/2}" y="{y - h/2}" width="{w}" height="{h}" rx="{rx}" '
            f'fill="{fill}" stroke="{LINE}" stroke-width="{sw}"/>\n'
            + txt(x, y, lines, size=size, weight=weight))


def rounded(x, y, w, h, lines, size=17, fill=SOFT):
    return box(x, y, w, h, lines, size=size, fill=fill, rx=h / 2)


def ellipse(x, y, rx, ry, lines, size=16, fill="#ffffff"):
    return (f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{fill}" '
            f'stroke="{LINE}" stroke-width="3"/>\n' + txt(x, y, lines, size=size))


def store(x, y, w, h, tag, lines, size=16):
    """Open-ended data store, as in a Gane-Sarson data flow diagram."""
    s = [f'<rect x="{x - w/2}" y="{y - h/2}" width="{w}" height="{h}" fill="{SOFT}" '
         f'stroke="{LINE}" stroke-width="3"/>']
    s.append(f'<line x1="{x - w/2 + 42}" y1="{y - h/2}" x2="{x - w/2 + 42}" y2="{y + h/2}" '
             f'stroke="{LINE}" stroke-width="3"/>')
    s.append(txt(x - w / 2 + 21, y, tag, size=size, weight="bold"))
    s.append(txt(x + 21, y, lines, size=size))
    return "\n".join(s)


def line(x1, y1, x2, y2, arrow=True, dash=None, width=2.6, both=False):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    m = ' marker-end="url(#arrow)"' if arrow else ""
    m += ' marker-start="url(#arrow)"' if both else ""
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{LINE}" '
            f'stroke-width="{width}"{d}{m}/>')


def poly(points, arrow=True, dash=None, width=2.6):
    pts = " ".join(f"{a},{b}" for a, b in points)
    d = f' stroke-dasharray="{dash}"' if dash else ""
    m = ' marker-end="url(#arrow)"' if arrow else ""
    return (f'<polyline points="{pts}" fill="none" stroke="{LINE}" '
            f'stroke-width="{width}"{d}{m}/>')


def diamond(x, y, w, h, lines, size=16):
    pts = f"{x},{y - h/2} {x + w/2},{y} {x},{y + h/2} {x - w/2},{y}"
    return (f'<polygon points="{pts}" fill="#ffffff" stroke="{LINE}" stroke-width="3"/>\n'
            + txt(x, y, lines, size=size))


def actor(x, y, lines, size=16):
    """Stick figure with its name underneath."""
    s = [f'<circle cx="{x}" cy="{y - 46}" r="15" fill="#ffffff" stroke="{LINE}" stroke-width="3"/>',
         f'<line x1="{x}" y1="{y - 31}" x2="{x}" y2="{y + 10}" stroke="{LINE}" stroke-width="3"/>',
         f'<line x1="{x - 24}" y1="{y - 16}" x2="{x + 24}" y2="{y - 16}" stroke="{LINE}" stroke-width="3"/>',
         f'<line x1="{x}" y1="{y + 10}" x2="{x - 20}" y2="{y + 44}" stroke="{LINE}" stroke-width="3"/>',
         f'<line x1="{x}" y1="{y + 10}" x2="{x + 20}" y2="{y + 44}" stroke="{LINE}" stroke-width="3"/>',
         txt(x, y + 68, lines, size=size, weight="bold")]
    return "\n".join(s)


def label(x, y, text, size=13, anchor="middle", italic=False):
    size = size * FS
    st = ' font-style="italic"' if italic else ""
    return (f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" '
            f'fill="{INK}"{st}>{text}</text>')


def flow_label(x, y, text, size=13, anchor="middle"):
    """Flow caption on a white plate so it stays readable where lines cross."""
    size = size * FS
    width = max(len(text) * size * 0.56, 20)
    pad = 5
    dx = {"middle": -width / 2, "start": -pad, "end": -width + pad}[anchor]
    return (f'<rect x="{x + dx}" y="{y - size * 0.82}" width="{width}" height="{size * 1.3}" '
            f'fill="#ffffff" opacity="0.92"/>\n'
            + f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" '
              f'fill="{INK}">{text}</text>')


def write(name, w, h, body):
    svg = HEAD.format(w=w, h=h, font=FONT, line=LINE) + body + "\n</svg>\n"
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as fh:
        fh.write(svg)
    print("wrote", name, w, "x", h)


