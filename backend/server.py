"""SmartRoad's dependency-free REST API and static development server."""

from __future__ import annotations

import json
import os
import re
import secrets
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent / "frontend"
DATA_FILE = ROOT / "data" / "reports.json"
HOST = os.getenv("SMARTROAD_HOST", "127.0.0.1")
PORT = int(os.getenv("SMARTROAD_PORT", "8000"))
ALLOWED_TYPES = {"Pothole", "Broken Streetlight", "Traffic Signal", "Road Damage", "Flooding", "Debris", "Other"}
ALLOWED_SEVERITIES = {"Low", "Medium", "High", "Critical"}
ALLOWED_STATUSES = {"Open", "In Progress", "Fixed"}


def read_reports():
    if not DATA_FILE.exists():
        return []
    try:
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def write_reports(reports):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = DATA_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(reports, indent=2, ensure_ascii=False), encoding="utf-8")
    temporary.replace(DATA_FILE)


def priority(report):
    score = {"Low": 20, "Medium": 45, "High": 70, "Critical": 100}[report["severity"]]
    if report["problemType"] in {"Traffic Signal", "Road Damage", "Flooding"}:
        score += 10
    score = min(score, 100)
    return score, "Critical" if score >= 90 else "High" if score >= 65 else "Medium" if score >= 40 else "Low"


def validate_report(payload, existing=None):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")
    result = dict(existing or {})
    required = ("problemType", "severity", "area", "city", "description")
    for key in required:
        value = payload.get(key, result.get(key))
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{key} is required.")
        result[key] = value.strip()
    if result["problemType"] not in ALLOWED_TYPES:
        raise ValueError("Unsupported problemType.")
    if result["severity"] not in ALLOWED_SEVERITIES:
        raise ValueError("Unsupported severity.")
    if len(result["area"]) > 120 or len(result["city"]) > 120 or len(result["description"]) > 500:
        raise ValueError("One or more text fields exceed their maximum length.")
    status = payload.get("status", result.get("status", "Open"))
    if status not in ALLOWED_STATUSES:
        raise ValueError("Unsupported status.")
    result["status"] = status
    pending_until = payload.get("resolutionPendingUntil", result.get("resolutionPendingUntil"))
    if pending_until in (None, ""):
        result.pop("resolutionPendingUntil", None)
    elif isinstance(pending_until, (int, float)) and not isinstance(pending_until, bool):
        result["resolutionPendingUntil"] = float(pending_until)
    else:
        raise ValueError("resolutionPendingUntil must be a timestamp or null.")
    for key in ("latitude", "longitude"):
        value = payload.get(key, result.get(key))
        if value in (None, ""):
            result[key] = None
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            result[key] = float(value)
        else:
            raise ValueError(f"{key} must be a number or null.")
    image = payload.get("image", result.get("image"))
    if image is not None and (not isinstance(image, str) or len(image) > 2_000_000 or not image.startswith("data:image/")):
        raise ValueError("image must be an image data URL smaller than 2 MB.")
    result["image"] = image
    result["priorityScore"], result["priorityCategory"] = priority(result)
    return result


class SmartRoadHandler(SimpleHTTPRequestHandler):
    """Handles API requests and serves the existing static site."""

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def translate_path(self, path):
        parsed = urlparse(path).path
        return str(PROJECT_ROOT / parsed.lstrip("/"))

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def send_json(self, status, body):
        encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 2_100_000:
            raise ValueError("Request is too large.")
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError("Body must contain valid JSON.")

    def do_GET(self):
        parsed = urlparse(self.path)
        # Inject the API bridge into the legacy browser-only script at serve time.
        # This keeps the supplied frontend files usable as a static/offline demo too.
        if parsed.path == "/script.js":
            source = (PROJECT_ROOT / "script.js").read_text(encoding="utf-8")
            bridge = '''
/* SmartRoad server persistence bridge. */
(function () {
    const api = "http://127.0.0.1:8000/api";
    const originalSaveReports = saveReports;
    saveReports = function (reports) {
        originalSaveReports(reports);
        fetch(api + "/reports", {method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify({reports})}).catch(() => {});
    };
    document.addEventListener("DOMContentLoaded", function () {
        fetch(api + "/reports").then(r => r.ok ? r.json() : Promise.reject()).then(data => {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data.reports));
            resolveExpiredReports(); updateStatistics(); renderIssueCards();
            if (window.refreshSmartRoadMap) window.refreshSmartRoadMap();
        }).catch(() => {});
    });
}());
'''
            encoded = (source + bridge).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
            return
        if parsed.path == "/api/health":
            return self.send_json(200, {"status": "ok", "service": "smartroad-api"})
        if parsed.path == "/api/reports":
            reports = read_reports()
            filters = parse_qs(parsed.query)
            for field in ("problemType", "severity", "status"):
                if filters.get(field):
                    reports = [item for item in reports if item.get(field) == filters[field][0]]
            return self.send_json(200, {"reports": reports, "count": len(reports)})
        if parsed.path == "/api/stats":
            reports = read_reports()
            return self.send_json(200, {"total": len(reports), "open": sum(r.get("status") != "Fixed" for r in reports), "fixed": sum(r.get("status") == "Fixed" for r in reports), "critical": sum(r.get("priorityCategory") == "Critical" for r in reports)})
        match = re.fullmatch(r"/api/reports/([^/]+)", parsed.path)
        if match:
            report = next((r for r in read_reports() if r.get("id") == match.group(1)), None)
            return self.send_json(200, {"report": report}) if report else self.send_json(404, {"error": "Report not found."})
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/reports":
            return self.send_json(404, {"error": "Not found."})
        try:
            report = validate_report(self.body())
            report["id"] = f"r_{secrets.token_urlsafe(10)}"
            report["createdAt"] = datetime.now(timezone.utc).isoformat()
            reports = read_reports()
            reports.insert(0, report)
            write_reports(reports)
            self.send_json(201, {"report": report})
        except ValueError as error:
            self.send_json(400, {"error": str(error)})

    def do_PUT(self):
        if self.path != "/api/reports":
            return self.send_json(404, {"error": "Not found."})
        try:
            payload = self.body()
            if not isinstance(payload, dict) or not isinstance(payload.get("reports"), list):
                raise ValueError("reports must be an array.")
            validated = []
            for item in payload["reports"]:
                report = validate_report(item)
                report["id"] = item.get("id") if isinstance(item.get("id"), str) else f"r_{secrets.token_urlsafe(10)}"
                report["createdAt"] = item.get("createdAt") if isinstance(item.get("createdAt"), str) else datetime.now(timezone.utc).isoformat()
                validated.append(report)
            write_reports(validated)
            self.send_json(200, {"reports": validated, "count": len(validated)})
        except ValueError as error:
            self.send_json(400, {"error": str(error)})

    def do_PATCH(self):
        match = re.fullmatch(r"/api/reports/([^/]+)", urlparse(self.path).path)
        if not match:
            return self.send_json(404, {"error": "Not found."})
        try:
            payload = self.body()
            reports = read_reports()
            index = next((i for i, item in enumerate(reports) if item.get("id") == match.group(1)), None)
            if index is None:
                return self.send_json(404, {"error": "Report not found."})
            reports[index] = validate_report(payload, reports[index])
            write_reports(reports)
            self.send_json(200, {"report": reports[index]})
        except ValueError as error:
            self.send_json(400, {"error": str(error)})

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path == "/api/reports":
            write_reports([])
            return self.send_json(200, {"message": "All reports deleted."})
        match = re.fullmatch(r"/api/reports/([^/]+)", path)
        if match:
            reports = read_reports()
            remaining = [item for item in reports if item.get("id") != match.group(1)]
            if len(remaining) == len(reports):
                return self.send_json(404, {"error": "Report not found."})
            write_reports(remaining)
            return self.send_json(200, {"message": "Report deleted."})
        self.send_json(404, {"error": "Not found."})


if __name__ == "__main__":
    print(f"SmartRoad is running at http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), SmartRoadHandler).serve_forever()
