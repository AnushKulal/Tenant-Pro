#!/usr/bin/env python3.13
"""Build the TenantPro research paper.

The layout follows a reference paper supplied by the authors, matched by
reading that file's own structure rather than by eye:

  · Letter page, one inch margins, single column
  · Times New Roman 12pt throughout
  · Heading 1 for the title, centred, upper case
  · a centred author block, name in bold
  · Heading 2 for section headings, upper case, justified
  · Heading 3 for sub-headings, title case, justified
  · justified body text
  · numbered list items, some with a bold lead-in before the colon
  · tables as "Table N. Caption" in bold, a Table Grid, then a "Source:" line

Only the formatting is taken from the reference. Every word of content here is
about this project.
"""
import os
import subprocess
import sys

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

HERE = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(HERE, "paper.txt")
OUT_DOCX = os.path.join(HERE, "TenantPro Research Paper.docx")

FONT = "Times New Roman"
SIZE = Pt(12)


def set_base(doc):
    st = doc.styles["Normal"]
    st.font.name = FONT
    st.font.size = SIZE
    st.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    pf = st.paragraph_format
    pf.space_after = Pt(8)
    pf.line_spacing = 1.15
    # Headings in the reference are the same face and colour as the body, not
    # Word's blue sans-serif defaults.
    for name, size, bold in (("Heading 1", 14, True), ("Heading 2", 12, True), ("Heading 3", 12, True)):
        s = doc.styles[name]
        s.font.name = FONT
        s.font.size = Pt(size)
        s.font.bold = bold
        s.font.color.rgb = RGBColor(0, 0, 0)
        s.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
        s.paragraph_format.space_before = Pt(12)
        s.paragraph_format.space_after = Pt(6)


def para(doc, text="", *, style=None, align=None, bold=False, italic=False, size=None, space_after=None):
    p = doc.add_paragraph(style=style) if style else doc.add_paragraph()
    if align is not None:
        p.alignment = align
    if space_after is not None:
        p.paragraph_format.space_after = space_after
    if text:
        r = p.add_run(text)
        r.font.name = FONT
        r.font.size = size or SIZE
        r.bold = bold
        r.italic = italic
        r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    return p


def lead_in(doc, text, *, bullet=False):
    """A list item whose lead-in, up to the first colon, is bold."""
    p = doc.add_paragraph(style="List Paragraph")
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p.paragraph_format.left_indent = Inches(0.25)
    p.paragraph_format.space_after = Pt(6)
    head, sep, tail = text.partition(": ")
    if sep and len(head) < 90:
        r = p.add_run(head + ": ")
        r.bold = True
    else:
        head, tail = "", text
    r2 = p.add_run(tail if sep else text)
    for r in p.runs:
        r.font.name = FONT
        r.font.size = SIZE
        r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    return p


def numbered(doc, text):
    p = doc.add_paragraph(style="List Paragraph")
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p.paragraph_format.left_indent = Inches(0.25)
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run(text)
    r.font.name = FONT
    r.font.size = SIZE
    r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    return p


def table(doc, rows):
    t = doc.add_table(rows=len(rows), cols=len(rows[0]))
    t.style = "Table Grid"
    for i, row in enumerate(rows):
        for j, cell in enumerate(row):
            c = t.cell(i, j)
            c.text = ""
            p = c.paragraphs[0]
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(cell)
            r.font.name = FONT
            r.font.size = Pt(11)
            r.bold = (i == 0)
            r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    return t


def build():
    doc = Document()
    set_base(doc)
    for s in doc.sections:
        s.left_margin = s.right_margin = Inches(1)
        s.top_margin = s.bottom_margin = Inches(1)

    lines = open(CONTENT, encoding="utf-8").read().split("\n")
    i = 0
    pending_rows = None

    def flush_table():
        nonlocal pending_rows
        if pending_rows:
            table(doc, pending_rows)
            pending_rows = None

    while i < len(lines):
        line = lines[i].rstrip()
        i += 1
        if not line:
            continue

        if line.startswith("#TITLE "):
            flush_table()
            p = para(doc, line[7:].strip(), style="Heading 1", align=WD_ALIGN_PARAGRAPH.CENTER)
            continue

        if line.startswith("#AUTHORS"):
            flush_table()
            while i < len(lines) and lines[i].strip() and not lines[i].startswith("#"):
                name, roll, desig = (lines[i].strip().split("|") + ["", ""])[:3]
                i += 1
                para(doc, name, align=WD_ALIGN_PARAGRAPH.CENTER, bold=True, space_after=Pt(0))
                para(doc, roll, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=Pt(0))
                para(doc, desig, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=Pt(0))
                para(doc, "JAIN (DEEMED-TO-BE UNIVERSITY), BENGALURU",
                     align=WD_ALIGN_PARAGRAPH.CENTER, space_after=Pt(8))
            continue

        if line.startswith("#GUIDE "):
            flush_table()
            parts = line[7:].strip().split("|")
            para(doc, parts[0], align=WD_ALIGN_PARAGRAPH.CENTER, bold=True, space_after=Pt(0))
            for extra in parts[1:]:
                para(doc, extra, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=Pt(0))
            doc.paragraphs[-1].paragraph_format.space_after = Pt(10)
            continue

        if line.startswith("#H "):
            flush_table()
            para(doc, line[3:].strip().upper(), style="Heading 2", align=WD_ALIGN_PARAGRAPH.JUSTIFY)
            continue

        if line.startswith("#B "):
            flush_table()
            para(doc, line[3:].strip(), style="Heading 3", align=WD_ALIGN_PARAGRAPH.JUSTIFY)
            continue

        if line.startswith("#P "):
            flush_table()
            para(doc, line[3:].strip(), align=WD_ALIGN_PARAGRAPH.JUSTIFY)
            continue

        if line.startswith("#L "):
            flush_table()
            lead_in(doc, line[3:].strip())
            continue

        if line.startswith("#N "):
            flush_table()
            numbered(doc, line[3:].strip())
            continue

        if line.startswith("#FIG "):
            flush_table()
            # "#FIG file.png|Figure N. Caption|width_in"
            parts = [p.strip() for p in line[5:].split("|")]
            path = os.path.join(HERE, parts[0])
            caption = parts[1] if len(parts) > 1 else ""
            width = float(parts[2]) if len(parts) > 2 else 5.9
            if not os.path.exists(path):
                raise SystemExit(f"figure not found: {path}")
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_after = Pt(4)
            p.add_run().add_picture(path, width=Inches(width))
            if caption:
                # Captions sit below a figure and above a table, which is the
                # convention the reference follows and most style guides state.
                para(doc, caption, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER,
                     space_after=Pt(4))
            continue

        if line.startswith("#T "):
            flush_table()
            para(doc, line[3:].strip(), bold=True, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_after=Pt(4))
            pending_rows = []
            continue

        if line.startswith("|"):
            if pending_rows is None:
                pending_rows = []
            pending_rows.append([c.strip() for c in line[1:].split("|")])
            continue

        if line.startswith("#S "):
            flush_table()
            # Italic at the inherited body size, as in the reference — not a
            # smaller caption face.
            para(doc, line[3:].strip(), italic=True,
                 align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_after=Pt(10))
            continue

    flush_table()
    doc.save(OUT_DOCX)
    print("wrote", OUT_DOCX)
    return OUT_DOCX


def to_pdf(path):
    subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir",
                    os.path.dirname(path), path], check=False,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return os.path.splitext(path)[0] + ".pdf"


if __name__ == "__main__":
    d = build()
    p = to_pdf(d)
    print("wrote", p if os.path.exists(p) else "(pdf conversion failed)")
