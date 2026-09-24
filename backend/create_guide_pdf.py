"""Generate the PDF guide with only Python's standard library."""
from pathlib import Path

lines = [
    "SMARTROAD BACKEND GUIDE", "", "Purpose", "The backend stores road issue reports centrally and serves the site.", "", "Run", "1. Install Python 3.10 or newer.", "2. In the project folder: python backend/server.py", "3. Open http://127.0.0.1:8000", "", "Data", "Reports persist in backend/data/reports.json.", "The frontend loads from the API and saves changes to it automatically.", "If the API is unavailable, browser localStorage remains a fallback.", "", "Endpoints", "GET /api/health - health check", "GET /api/reports - list reports; supports problemType, severity, status", "POST /api/reports - create a report", "PUT /api/reports - replace collection (used by current UI)", "GET, PATCH, DELETE /api/reports/{id} - manage one report", "DELETE /api/reports - clear all reports", "GET /api/stats - dashboard totals", "", "Safety", "The API validates issue values, required text, coordinate types and images.", "Images are capped at 2 MB. For production use a database, object storage,", "authentication, restricted CORS, and HTTPS."
]

def escape(text):
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

commands = ["BT", "/F1 18 Tf", "72 760 Td", f"({escape(lines[0])}) Tj", "/F1 11 Tf"]
for line in lines[1:]:
    commands += ["0 -21 Td", f"({escape(line)}) Tj"]
commands += ["ET"]
stream = "\n".join(commands)
objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [5 0 R] /Count 1 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    f"<< /Length {len(stream.encode('latin-1'))} >>\nstream\n{stream}\nendstream",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>",
]
pdf, offsets = "%PDF-1.4\n", [0]
for number, obj in enumerate(objects, 1):
    offsets.append(len(pdf.encode("latin-1")))
    pdf += f"{number} 0 obj\n{obj}\nendobj\n"
xref = len(pdf.encode("latin-1"))
pdf += "xref\n0 6\n0000000000 65535 f \n" + "".join(f"{n:010} 00000 n \n" for n in offsets[1:])
pdf += f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
Path(__file__).with_name("SmartRoad-Backend-Guide.pdf").write_bytes(pdf.encode("latin-1"))
