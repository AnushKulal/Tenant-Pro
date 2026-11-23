#!/usr/bin/env python3.13
"""Build the research paper's figures from the paper's own measured data.

Every number here is transcribed from a table in paper.txt, which is in turn
taken from the repository: the assertion counts from the suites that produce
them, the defect classification from the defect log, the latency figures from the
cross-portal suite's own measurement, the route counts from the server's
declarations. Nothing is estimated and nothing is illustrative. The one
approximate figure, routes driven by no suite, is drawn and labelled as
approximate because that is how the suite reports it.

Design decisions, and why each is what it is:

  · One hue, not many. Each figure shows magnitude, so bar length carries the
    data and colour carries nothing. Eight hues on a six-bar chart would imply
    the classes differ in kind rather than in count.
  · Ranked, largest first. Bars on a shared baseline are compared exactly;
    segments laid end to end are not.
  · No value axis on the bar charts. With six bars the direct labels are more
    precise than ticks and leave the figure quieter.
  · Hairline axes one shade off the surface, no gridlines, no frame. The data is
    the only heavy thing on the page.
  · Liberation Serif, which is metrically compatible with the Times New Roman
    the document is set in, so the figures do not read as imported from
    elsewhere.
  · Rounded data-ends at the value, square at the baseline: the end that means
    something is the end that is shaped.
  · Readable in grayscale. These will be printed. Length survives a photocopier;
    hue does not.
"""
from __future__ import annotations

import os

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
from matplotlib.path import Path
from matplotlib.patches import PathPatch

HERE = os.path.dirname(os.path.abspath(__file__))

# From the data-viz reference palette: sequential blue, step 450 for the fill and
# step 100 for a meter's unfilled track.
FILL = "#2a78d6"
TRACK = "#cde2fb"
INK = "#0b0b0b"
INK_SOFT = "#52514e"
RULE = "#d8d7d3"          # hairline, one shade off the surface
SURFACE = "#ffffff"

SERIF = "Liberation Serif"  # metric-compatible with Times New Roman

plt.rcParams.update({
    "font.family": "serif",
    "font.serif": [SERIF, "DejaVu Serif"],
    "font.size": 9.5,
    "text.color": INK,
    "axes.edgecolor": RULE,
    "axes.labelcolor": INK,
    "xtick.color": INK_SOFT,
    "ytick.color": INK,
    "figure.facecolor": SURFACE,
    "axes.facecolor": SURFACE,
    "savefig.facecolor": SURFACE,
})

WIDTH_IN = 6.0   # fits inside one-inch margins on Letter with room to spare
DPI = 300


def _radii(ax, points):
    """Convert a radius in typographic points to x and y data units.

    Done through the axes transform so the corner is visually circular even
    though the two axes are in different units.
    """
    px = points * DPI / 72.0
    inv = ax.transData.inverted()
    x0, y0 = inv.transform((0.0, 0.0))
    x1, y1 = inv.transform((px, px))
    return abs(x1 - x0), abs(y1 - y0)


def rounded_bar(ax, y, value, height, *, color, radius_pt=2.0, x0=0.0):
    """A horizontal bar: square at the baseline, rounded at the value end."""
    rx, ry = _radii(ax, radius_pt)
    span = abs(value - x0)
    rx = min(rx, span / 2.0) if span else 0.0
    ry = min(ry, height / 2.0)
    r = min(rx, ry) if (rx and ry) else 0.0

    top, bot = y + height / 2.0, y - height / 2.0
    if r <= 0:
        verts = [(x0, bot), (value, bot), (value, top), (x0, top), (x0, bot)]
        codes = [Path.MOVETO] + [Path.LINETO] * 3 + [Path.CLOSEPOLY]
    else:
        # Up the square baseline edge, across the top, round the two value-end
        # corners with quadratic Beziers, back along the bottom.
        verts = [
            (x0, bot), (x0, top),
            (value - rx, top), (value, top), (value, top - ry),
            (value, bot + ry), (value, bot), (value - rx, bot),
            (x0, bot),
        ]
        codes = [
            Path.MOVETO, Path.LINETO,
            Path.LINETO, Path.CURVE3, Path.CURVE3,
            Path.LINETO, Path.CURVE3, Path.CURVE3,
            Path.CLOSEPOLY,
        ]
    patch = PathPatch(Path(verts, codes), facecolor=color, edgecolor="none", zorder=3)
    ax.add_patch(patch)
    return patch


def strip_axes(ax, *, keep_left=True):
    for side in ("top", "right", "bottom"):
        ax.spines[side].set_visible(False)
    if keep_left:
        ax.spines["left"].set_visible(True)
        ax.spines["left"].set_linewidth(0.6)
        ax.spines["left"].set_color(RULE)
    else:
        ax.spines["left"].set_visible(False)
    ax.tick_params(axis="both", length=0, pad=6)
    ax.set_xticks([])
    ax.grid(False)


# --------------------------------------------------------------- ranked bar set
def ranked_bars(rows, outfile, *, title=None, note=None, bar_h=0.42, label_fmt=None):
    """rows: [(label, value, annotation)] — drawn largest first."""
    rows = sorted(rows, key=lambda r: r[1], reverse=True)
    n = len(rows)
    fig_h = 0.42 * n + (1.05 if note else 0.45)
    fig, ax = plt.subplots(figsize=(WIDTH_IN, fig_h), dpi=DPI)

    vmax = max(v for _, v, _ in rows)
    ax.set_xlim(0, vmax * 1.30)
    ax.set_ylim(-0.6, n - 0.4)
    ax.set_yticks(range(n))
    ax.set_yticklabels([r[0] for r in rows][::-1], fontsize=9.5)
    strip_axes(ax)

    for i, (_, value, annot) in enumerate(rows):
        y = n - 1 - i
        rounded_bar(ax, y, value, bar_h, color=FILL)
        text = annot if annot else (label_fmt(value) if label_fmt else f"{value:,}")
        ax.text(value + vmax * 0.022, y, text, va="center", ha="left",
                fontsize=9.5, color=INK)

    if title:
        ax.set_title(title, loc="left", fontsize=10, color=INK, pad=10, fontweight="bold")
    if note:
        fig.text(0.013, 0.015, note, fontsize=8, color=INK_SOFT, ha="left", va="bottom")
    fig.tight_layout(rect=(0, 0.05 if note else 0.0, 1, 1))
    fig.savefig(outfile, dpi=DPI, bbox_inches="tight", pad_inches=0.04)
    plt.close(fig)
    print("wrote", outfile)


# ------------------------------------------------------------------ meter list
def meter_list(rows, outfile, *, limit, limit_label, title=None, note=None):
    """rows: [(label, value, annotation)] — each value against a shared limit."""
    n = len(rows)
    fig_h = 0.56 * n + (1.25 if note else 0.75)
    fig, ax = plt.subplots(figsize=(WIDTH_IN, fig_h), dpi=DPI)

    ax.set_xlim(0, limit * 1.02)
    ax.set_ylim(-0.7, n - 0.3)
    ax.set_yticks(range(n))
    ax.set_yticklabels([r[0] for r in rows][::-1], fontsize=9.5)
    strip_axes(ax, keep_left=False)

    bar_h = 0.22
    texts = []
    for i, (_, value, annot) in enumerate(rows):
        y = n - 1 - i
        rounded_bar(ax, y, limit, bar_h, color=TRACK, radius_pt=2.0)
        rounded_bar(ax, y, value, bar_h, color=FILL, radius_pt=2.0)
        # A surface-coloured gap so the fill's end stays legible where it meets
        # the track, instead of the two blues touching.
        gap = limit * 0.004
        rounded_bar(ax, y, value + gap, bar_h, color=SURFACE, radius_pt=0.0, x0=value)
        rounded_bar(ax, y, value, bar_h, color=FILL, radius_pt=2.0)
        texts.append((ax.text(value + limit * 0.016, y, annot, va="center", ha="left",
                              fontsize=9.5, color=INK, zorder=4), value))

    # A label long enough to run past the limit is re-hung to the left of it,
    # rather than being allowed to overflow the figure.
    fig.canvas.draw()
    inv = ax.transData.inverted()
    for text, value in texts:
        bb = text.get_window_extent(renderer=fig.canvas.get_renderer())
        x_end = inv.transform((bb.x1, bb.y0))[0]
        if x_end > limit:
            text.set_ha("right")
            text.set_x(limit - limit * 0.016)
            text.set_color(INK)

    # The limit is the thing each row is measured against, so it is named once,
    # at the end of the track, rather than as a scale the reader must decode.
    ax.annotate(limit_label, xy=(limit, -0.52), xytext=(limit, -0.52),
                ha="right", va="center", fontsize=8.5, color=INK_SOFT)
    ax.plot([limit, limit], [-0.40, n - 0.55], color=RULE, linewidth=0.8,
            solid_capstyle="butt", zorder=2)

    if title:
        ax.set_title(title, loc="left", fontsize=10, color=INK, pad=10, fontweight="bold")
    if note:
        fig.text(0.013, 0.015, note, fontsize=8, color=INK_SOFT, ha="left", va="bottom")
    fig.tight_layout(rect=(0, 0.06 if note else 0.0, 1, 1))
    fig.savefig(outfile, dpi=DPI, bbox_inches="tight", pad_inches=0.04)
    plt.close(fig)
    print("wrote", outfile)


def main():
    # Table 2. 750 assertions across three verification layers.
    ranked_bars(
        [
            ("Pure and stubbed", 305, "305   40.7%"),
            ("Live server", 185, "185   24.7%"),
            ("Browser-driven", 260, "260   34.7%"),
        ],
        os.path.join(HERE, "fig_assertions.png"),
    )

    # Table 3. The 16 defects located during verification, by class.
    ranked_bars(
        [
            ("Correctness", 6, "6"),
            ("Accessibility", 3, "3"),
            ("Robustness", 3, "3"),
            ("User-facing", 2, "2"),
            ("Authorisation", 1, "1"),
            ("Security", 1, "1"),
        ],
        os.path.join(HERE, "fig_defects.png"),
    )

    # Table 4. Measured propagation latency against the polling interval.
    meter_list(
        [
            ("Landlord interacting\nwith the interface", 2.3, "2.3 s"),
            ("Landlord's screen\nuntouched", 9.1, "9.1 s"),
        ],
        os.path.join(HERE, "fig_latency.png"),
        limit=25.0,
        limit_label="25 s polling interval",
    )

    # Table 5. Endpoint coverage. The second row is approximate at source.
    meter_list(
        [
            ("Driven by the principal\nAPI suite", 50, "50 of 96   52.1%"),
            ("Driven by some suite\n(approximate)", 64, "64 of 96   66.7%"),
        ],
        os.path.join(HERE, "fig_coverage.png"),
        limit=96,
        limit_label="96 routes declared",
    )


if __name__ == "__main__":
    main()
