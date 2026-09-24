# SmartRoad backend

This is a dependency-free Python REST API. It persists reports to `data/reports.json` and also serves the static SmartRoad pages from the project root.

## Run

1. Install Python 3.10+.
2. From the project root, run `python backend/server.py`.
3. Open `http://127.0.0.1:8000`.

The browser automatically loads server data. If the server is stopped, the UI falls back to its existing browser storage.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/reports` | List reports; accepts `problemType`, `severity`, and `status` filters |
| POST | `/api/reports` | Create a report |
| PUT | `/api/reports` | Replace the report collection (used by this UI) |
| GET | `/api/reports/:id` | Get one report |
| PATCH | `/api/reports/:id` | Update a report or its status |
| DELETE | `/api/reports/:id` | Delete one report |
| DELETE | `/api/reports` | Delete all reports |
| GET | `/api/stats` | Get dashboard totals |

The server validates problem type, severity, status, text limits, coordinates, and image data URLs. Images are capped at 2 MB for this demo. For production, replace JSON persistence with a database, store images in object storage, and restrict CORS.
