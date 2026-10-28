from datetime import date, datetime, timedelta, timezone
from statistics import mean
from math import sqrt
import random

import requests
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Wind Signal API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"


def rows(dataset, start, end):
    if dataset == "FUELHH":
        # FUELHH filters by delivery/settlement date.
        params = {"settlementDateFrom": start, "settlementDateTo": end, "fuelType": "WIND"}
    else:
        # WINDFOR filters by forecast publication time. Include the day before
        # the selected period because those forecasts are used for Jan 1.
        params = {"publishDateTimeFrom": f"{start}T00:00:00Z", "publishDateTimeTo": f"{end}T23:59:59Z"}
    try:
        r = requests.get(f"{BASE}/{dataset}/stream", params=params, timeout=12)
        r.raise_for_status()
        data = r.json()
        return data.get("data", data) if isinstance(data, dict) else data
    except (requests.RequestException, ValueError):
        return []


def value(row, *keys):
    for key in keys:
        if row.get(key) is not None:
            return row[key]
    return None


def dt(text):
    return datetime.fromisoformat(str(text).replace("Z", "+00:00"))


def sample_data():
    random.seed(42)
    start = datetime(2026, 1, 15)
    actual = []
    forecast = []
    for i in range(48):
        t = start + timedelta(minutes=30 * i)
        base = 9000 + 2800 * (0.5 + 0.5 * __import__('math').sin(i / 7))
        actual_mw = round(max(1000, base + random.randint(-500, 500)))
        forecast_mw = round(max(1000, actual_mw + random.randint(-900, 900)))
        actual.append({"startTime": t.isoformat() + "Z", "generation": actual_mw})
        forecast.append({"startTime": t.isoformat() + "Z", "publishTime": (t - timedelta(hours=36)).isoformat() + "Z", "generation": forecast_mw})
    return actual, forecast, True


def build(start, end):
    actual_raw = rows("FUELHH", start, end)
    forecast_start = (date.fromisoformat(start) - timedelta(days=2)).isoformat()
    forecast_raw = rows("WINDFOR", forecast_start, end)
    actual = [r for r in actual_raw if str(value(r, "fuelType", "fueltype")).upper() == "WIND" and start <= str(value(r, "settlementDate") or value(r, "startTime", "starttime"))[:10] <= end]
    forecast = forecast_raw
    used_sample = False
    if not actual or not forecast:
        actual, forecast, used_sample = sample_data()

    # Keep the latest revision for an actual interval.
    actual_map = {}
    for r in actual:
        ts = value(r, "startTime", "starttime")
        if ts not in actual_map or str(value(r, "publishTime")) > str(actual_map[ts]["publishTime"]):
            actual_map[ts] = {"value": float(value(r, "generation") or 0), "publishTime": value(r, "publishTime") or ""}

    # Day-ahead decision rule: for delivery day D, choose the latest forecast
    # published strictly before 08:00 UTC on D-1.
    eligible = {}
    for r in forecast:
        delivery = value(r, "startTime", "starttime")
        published = value(r, "publishTime", "publishtime")
        if not delivery or not published:
            continue
        cutoff = dt(delivery).date() - timedelta(days=1)
        cutoff_time = datetime.combine(cutoff, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=8)
        if dt(published) < cutoff_time and dt(delivery).date().isoformat() >= start and dt(delivery).date().isoformat() <= end:
            if delivery not in eligible or dt(published) > dt(eligible[delivery]["publishTime"]):
                eligible[delivery] = {"row": r, "publishTime": published}
    points = []
    for ts, chosen in eligible.items():
        r = chosen["row"]
        if ts in actual_map:
            f = float(value(r, "generation") or 0)
            a = actual_map[ts]["value"]
            points.append({"time": ts, "publishTime": chosen["publishTime"], "actual": round(a), "forecast": round(f), "error": round(f - a)})
    if not points and actual:
        points = [{"time": value(r, "startTime", "starttime"), "publishTime": None, "actual": round(float(value(r, "generation") or 0)), "forecast": None, "error": None} for r in actual[:48]]

    errors = [abs(p["error"]) for p in points if p["error"] is not None]
    signed = [p["error"] for p in points if p["error"] is not None]
    actual_values = [p["actual"] for p in points if p["error"] is not None]
    rmse = sqrt(mean([p["error"] ** 2 for p in points if p["error"] is not None])) if errors else None
    wape = (sum(errors) / sum(abs(v) for v in actual_values) * 100) if actual_values and sum(abs(v) for v in actual_values) else None
    latest = points[-1] if points else None
    expected = (date.fromisoformat(end) - date.fromisoformat(start)).days * 48 + 48
    return {"period": {"from": start, "to": end}, "source": "sample fallback" if used_sample else "Elexon BMRS", "decisionCutoff": "08:00 UTC on the day before delivery", "points": sorted(points, key=lambda p: p["time"]), "metrics": {"count": len(errors), "mae": round(mean(errors)) if errors else None, "rmse": round(rmse) if rmse is not None else None, "bias": round(mean(signed)) if signed else None, "wape": round(wape, 1) if wape is not None else None, "maxError": max(errors) if errors else None}, "quality": {"actualRows": len(actual), "forecastRows": len(forecast), "eligibleForecasts": len(eligible), "matched": len(errors), "missingActuals": sum(1 for ts in eligible if ts not in actual_map), "missingForecasts": max(0, len(actual_map) - len(eligible)), "expectedHalfHours": expected}, "latest": latest}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"service": "Wind Signal API", "status": "ok", "docs": "/docs", "health": "/api/health"}


@app.get("/api/wind")
def wind(start: date = Query(date(2026, 1, 1)), end: date = Query(date(2026, 1, 31))):
    return build(start.isoformat(), end.isoformat())
