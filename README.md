# Wind Signal

Small React + Python pilot for UK day-ahead wind procurement decisions. It compares national wind generation actuals (`FUELHH`, filtered to `fuelType=WIND`) with forecasts (`WINDFOR`) for January 2026, then reports the latest forecast and forecast error metrics.

## Run with Docker

```bash
docker compose up --build
```

The compose setup mounts the backend source and runs Uvicorn in reload mode, so code changes are picked up without rebuilding the image. Rebuild only when dependencies or the Dockerfile change.

## Deployment

Recommended split deployment: deploy the backend on Render and the `frontend/` folder on Vercel.

### Backend on Render

1. Push this repository to GitHub.
2. In Render, create a new Blueprint or Web Service from the repository.
3. Use the included `render.yaml`, or choose Docker with the repository root as the Docker context.
4. After deployment, verify `https://YOUR-SERVICE.onrender.com/api/health` returns `{"status":"ok"}`.

### Frontend on Vercel

1. Import the same repository into Vercel.
2. Set the project root directory to `frontend`.
3. Set the environment variable `VITE_API_URL` to the deployed Render backend URL, without a trailing slash.
4. Deploy and verify the dashboard loads January 2026 data.

The frontend already reads `VITE_API_URL`; it falls back to `http://localhost:8000` only for local development. The Vercel configuration is in `frontend/vercel.json` and the environment template is in `frontend/.env.example`.

Open http://localhost:5173. The API is available at http://localhost:8000/docs.

## Run locally

```bash
python -m venv .venv
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
cd frontend
npm install
npm run dev
```

The backend reads the Elexon Insights API using the dataset-specific filters: `FUELHH` uses `settlementDateFrom/settlementDateTo` and `fuelType=WIND`; `WINDFOR` uses `publishDateTimeFrom/publishDateTimeTo`. For each delivery interval, the latest forecast published before the 08:00 UTC day-ahead cutoff is selected. If the upstream API is unavailable, it displays a deterministic sample dataset so the demo remains usable; the UI labels this as `sample fallback`.

## Project map

- `backend/main.py` — API client, filtering, matching, metrics, and fallback data.
- `backend/requirements.txt` — Python dependencies.
- `frontend/src/main.jsx` — single-page dashboard and SVG chart.
- `frontend/src/style.css` — minimal responsive UI.
- `Dockerfile` and `docker-compose.yml` — container setup.

## Metrics

- MAE: mean absolute error in MW.
- Bias: mean forecast minus actual in MW; positive means over-forecasting.
- Max error: largest absolute error in the matched period.

## Deployment and video

This repository is ready for a Docker-based deployment. A hosted URL and unlisted YouTube demo should be added after deployment; they require the owner’s hosting and YouTube accounts. Suggested video split: 4 minutes customer walkthrough, 4 minutes architecture/code/analysis review.

AI tools were used to assist with the initial implementation and documentation. The code was kept intentionally small and reviewed for readability.
