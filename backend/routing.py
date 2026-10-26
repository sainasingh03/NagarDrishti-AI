import json
import math
import os
from datetime import datetime, timezone
from urllib.error import URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from fastapi import HTTPException

SEVERITY = {"pothole": 3, "damaged_surface": 3, "waterlogging": 3, "road_crack": 2, "other": 1}
SEVERITY_MULTIPLIER = {"unrated": 1.0, "low": 1.0, "moderate": 1.15, "high": 1.35, "urgent": 1.6}
ACTIVE_NAVIGATION_STATUSES = {"submitted", "under_review", "verified", "in_progress"}

def _point_segment_distance_m(lat, lon, a, b):
    scale_x = 111320 * math.cos(math.radians(lat))
    px, py = lon * scale_x, lat * 110540
    ax, ay = a[0] * scale_x, a[1] * 110540
    bx, by = b[0] * scale_x, b[1] * 110540
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    t = 0 if denom == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / denom))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

def route_hazard_summary(route, reports, radius_m=75):
    """Return transparent, active-hazard information for a provider route.

    Resolved and rejected records are intentionally kept in the database but are
    excluded from navigation warnings. The response retains the report id,
    coordinates, timestamp and distance used for the score so clients can show
    exactly which reports informed a route comparison.
    """
    coords = route.get("geometry", {}).get("coordinates", [])
    if not coords:
        raise ValueError("Route geometry is missing")
    stride = max(1, math.ceil(len(coords) / 400))
    line = coords[::stride]
    if line[-1] != coords[-1]:
        line.append(coords[-1])
    nearby, weighted = [], 0.0
    now = datetime.now(timezone.utc)
    for report in reports:
        if getattr(report, "status", "submitted") not in ACTIVE_NAVIGATION_STATUSES:
            continue
        point = (report.longitude, report.latitude)
        distance = min((_point_segment_distance_m(report.latitude, report.longitude, a, b)
                        for a, b in zip(line, line[1:])), default=math.inf)
        if distance > radius_m:
            continue
        nearby.append((report, distance))
        created = report.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        age_days = max(0, (now - created).total_seconds() / 86400)
        freshness = max(0.15, 1 - age_days / 180)
        weighted += (SEVERITY.get(report.category, 1)
                     * SEVERITY_MULTIPLIER.get(getattr(report, "severity", "unrated"), 1.0)
                     * freshness
                     * (1.25 if report.status == "verified" else 1))
    nearby.sort(key=lambda entry: entry[1])
    hazard_details = [{
        "id": getattr(report, "public_id", str(getattr(report, "id", ""))),
        "category": report.category,
        "status": report.status,
        "severity": getattr(report, "severity", "unrated"),
        "latitude": report.latitude,
        "longitude": report.longitude,
        "created_at": report.created_at.isoformat(),
        "distance_to_route_m": round(distance),
    } for report, distance in nearby[:25]]
    return {"hazard_count": len(nearby), "verified_hazard_count": sum(report.status == "verified" for report, _distance in nearby),
            "hazard_score": round(weighted, 2), "hazards": hazard_details, "limited_coverage": True}

def route_rank(routes):
    if not routes:
        return []
    max_duration = max(max(float(r.get("duration", 0)), 1) for r in routes)
    max_score = max(max(float(r.get("hazard_score", 0)), 1) for r in routes)
    ranked = []
    for route in routes:
        time_ratio = float(route.get("duration", 0)) / max_duration
        hazard_ratio = float(route.get("hazard_score", 0)) / max_score
        route["ranking_score"] = round(0.65 * time_ratio + 0.35 * hazard_ratio, 4)
        ranked.append(route)
    ranked.sort(key=lambda r: r["ranking_score"])
    ranked[0]["recommended"] = True
    return ranked

def fetch_osrm_routes(origin_lat, origin_lon, destination_lat, destination_lon, base_url=None):
    base = (base_url if base_url is not None else os.getenv("OSRM_BASE_URL", "")).strip().rstrip("/")
    if not base:
        raise HTTPException(503, "Routing provider is not configured")
    if not base.startswith(("https://", "http://")):
        raise HTTPException(500, "Routing provider URL must use HTTP or HTTPS")
    coords = f"{origin_lon},{origin_lat};{destination_lon},{destination_lat}"
    url = f"{base}/route/v1/driving/{quote(coords, safe=',.;')}?alternatives=true&steps=false&geometries=geojson&overview=simplified"
    request = Request(url, headers={"User-Agent": "NagarDrishtiAI/0.1 route-planner"})
    try:
        with urlopen(request, timeout=8) as response:
            payload = json.loads(response.read(4_000_000))
    except (URLError, TimeoutError, ValueError, OSError):
        raise HTTPException(502, "Routing provider could not be reached")
    if payload.get("code") != "Ok" or not payload.get("routes"):
        raise HTTPException(404, "No route was returned for these coordinates")
    return payload["routes"][:3]
