from pathlib import Path
import base64

import pypdfium2 as pdfium
from PIL import ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".tasks" / "clone-mkidh" / "Test-results-24825511301.pdf"
OUTPUT = ROOT / "public" / "images" / "pdf-template-base.jpg"
JS_OUTPUT = ROOT / "src" / "pdf-template.js"

pdf = pdfium.PdfDocument(str(SOURCE))
image = pdf[0].render(scale=2).to_pil().convert("RGB")
draw = ImageDraw.Draw(image)

# Keep the original PDF as the base image, and clear only the user-editable
# report data block plus the QR block. Coordinates are for the 2x A4 render.
for box in (
    (0, 170, 1190, 684),
    (60, 1360, 290, 1618),
):
    draw.rectangle(box, fill="white")

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
image.save(OUTPUT, quality=88, optimize=True)

data = base64.b64encode(OUTPUT.read_bytes()).decode("ascii")
JS_OUTPUT.write_text(
    f'window.PDF_TEMPLATE_IMAGE = "data:image/jpeg;base64,{data}";\n',
    encoding="utf-8",
)

print(f"Wrote {OUTPUT}")
print(f"Wrote {JS_OUTPUT}")
