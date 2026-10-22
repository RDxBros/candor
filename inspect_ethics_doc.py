from docx import Document
from zipfile import ZipFile
import json
import re

p = r"C:\Users\todee\OneDrive\Desktop\Ethics HW.docx"
d = Document(p)
info = []
for i, para in enumerate(d.paragraphs):
    pf = para.paragraph_format
    info.append({
        "i": i,
        "text": para.text,
        "style": para.style.name,
        "sizes": [round(run.font.size.pt, 1) for run in para.runs if run.font.size],
        "fonts": [run.font.name for run in para.runs if run.font.name],
        "bold": [run.bold for run in para.runs],
        "line_spacing": str(pf.line_spacing),
        "space_after_pt": pf.space_after.pt if pf.space_after else None,
        "first_line_indent_in": pf.first_line_indent.inches if pf.first_line_indent else None,
    })

with ZipFile(p) as z:
    app = z.read("docProps/app.xml").decode("utf-8")
    core = z.read("docProps/core.xml").decode("utf-8")
    styles = z.read("word/styles.xml").decode("utf-8")

style_blocks = re.findall(
    r'<w:style[^>]+w:styleId="(?:Normal|Title|Heading1)"[\s\S]*?</w:style>',
    styles,
)
print(json.dumps({
    "paragraphs": info,
    "app": app,
    "core": core,
    "styles_snippets": style_blocks,
}, ensure_ascii=True, indent=2))
