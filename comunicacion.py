from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
import math
import threading

import numpy as np
import rasterio
import spiceypy as spice


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "Data"
KERNEL_DIR = DATA_DIR / "SPICE"
MOON_RADIUS_METERS = 1_737_400.0
HORIZON_DISTANCE_METERS = 7_500.0
HORIZON_SAMPLE_METERS = 5.0
SPICE_FRAME = "MOON_ME"
LUNAR_SYNODIC_PERIOD_DAYS = 29.530588853
SOLAR_SAMPLE_MINUTES = 30

KERNEL_FILES = (
    "naif0012.tls",
    "pck00011.tpc",
    "moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf",
    "de440s.bsp",
)

SITES = {
    "shackleton": {
        "name": "Shackleton Rim",
        "latitude": -89.7668,
        "longitude": -171.87,
        "raster": "Site04_final_adj_5mpp_surf.tif",
    },
    "degerlache": {
        "name": "De Gerlache Rim",
        "latitude": -88.6834,
        "longitude": -67.9321,
        "raster": "Site11_final_adj_5mpp_surf.tif",
    },
    "malapert": {
        "name": "Malapert Massif",
        "latitude": -85.9948,
        "longitude": -0.23578,
        "raster": "Site23_final_adj_5mpp_surf.tif",
    },
}

_spice_lock = threading.RLock()
_kernels_loaded = False


def _missing_kernels() -> list[str]:
    return [name for name in KERNEL_FILES if not (KERNEL_DIR / name).is_file()]


def kernel_status() -> dict:
    missing = _missing_kernels()
    return {
        "ready": not missing,
        "engine": "NAIF SPICE / CSPICE via SpiceyPy",
        "frame": SPICE_FRAME,
        "kernels": [name for name in KERNEL_FILES if name not in missing],
        "missingKernels": missing,
        "message": (
            "Kernels SPICE listos."
            if not missing
            else "Faltan kernels NAIF. Ejecuta python download_spice_kernels.py."
        ),
    }


def _ensure_kernels_loaded() -> None:
    global _kernels_loaded
    with _spice_lock:
        if _kernels_loaded:
            return
        missing = _missing_kernels()
        if missing:
            raise RuntimeError(
                "Faltan kernels SPICE: "
                + ", ".join(missing)
                + ". Ejecuta python download_spice_kernels.py."
            )
        try:
            for name in KERNEL_FILES:
                spice.furnsh(str(KERNEL_DIR / name))
            spice.pxform(
                SPICE_FRAME,
                "J2000",
                spice.str2et("2026 NOV 14 00:00:00 UTC"),
            )
        except spice.SpiceyError as error:
            spice.kclear()
            raise RuntimeError(f"No se pudieron cargar los kernels NAIF: {error}") from error
        _kernels_loaded = True


def _validate_point(site_key: str, latitude: float, longitude: float) -> None:
    if site_key not in SITES:
        raise ValueError("Selecciona una región de análisis válida.")
    if not math.isfinite(latitude) or not -90 <= latitude <= 90:
        raise ValueError("La latitud debe estar entre -90° y 90°.")
    if not math.isfinite(longitude) or not -180 <= longitude <= 180:
        raise ValueError("La longitud debe estar entre -180° y 180°.")


def _stereographic_xy(latitude: float, longitude: float) -> tuple[float, float]:
    latitude_rad = math.radians(latitude)
    longitude_rad = math.radians(longitude)
    radius = 2 * MOON_RADIUS_METERS * math.tan((math.pi / 2 + latitude_rad) / 2)
    return radius * math.sin(longitude_rad), radius * math.cos(longitude_rad)


@lru_cache(maxsize=3)
def _load_dem(site_key: str) -> tuple[np.ndarray, tuple[float, ...], float]:
    dataset_path = DATA_DIR / SITES[site_key]["raster"]
    with rasterio.open(dataset_path) as dataset:
        elevation = dataset.read(1, masked=False).astype(np.float32, copy=False)
        transform = dataset.transform
        return (
            elevation,
            (transform.a, transform.c, transform.e, transform.f),
            float(dataset.nodata) if dataset.nodata is not None else math.nan,
        )


def _point_pixel(
    site_key: str, latitude: float, longitude: float
) -> tuple[np.ndarray, float, float, int, int]:
    elevation, transform, nodata = _load_dem(site_key)
    pixel_width, left, pixel_height, top = transform
    x, y = _stereographic_xy(latitude, longitude)
    col = math.floor((x - left) / pixel_width)
    row = math.floor((y - top) / pixel_height)
    if row < 0 or col < 0 or row >= elevation.shape[0] or col >= elevation.shape[1]:
        raise ValueError(
            "El punto queda fuera del DEM local del sitio seleccionado. "
            "Elige coordenadas dentro de la cobertura local."
        )
    ground_m = float(elevation[row, col])
    if not math.isfinite(ground_m) or (math.isfinite(nodata) and ground_m == nodata):
        raise ValueError("El DEM local no tiene elevación válida en ese punto.")
    return elevation, transform, ground_m, row, col


@lru_cache(maxsize=18)
def _terrain_horizon(
    site_key: str,
    latitude: float,
    longitude: float,
    antenna_height_m: float,
) -> tuple[tuple[float, ...], float]:
    elevation, transform, ground_m, _, _ = _point_pixel(site_key, latitude, longitude)
    pixel_width, left, pixel_height, top = transform
    x0, y0 = _stereographic_xy(latitude, longitude)
    distances = np.arange(
        HORIZON_SAMPLE_METERS,
        HORIZON_DISTANCE_METERS + HORIZON_SAMPLE_METERS / 2,
        HORIZON_SAMPLE_METERS,
        dtype=np.float64,
    )
    lon_rad = math.radians(longitude)
    sin_lon, cos_lon = math.sin(lon_rad), math.cos(lon_rad)
    observer_height = ground_m + antenna_height_m
    profile = np.zeros(360, dtype=np.float64)

    for azimuth_deg in range(360):
        azimuth = math.radians(azimuth_deg)
        north = math.cos(azimuth)
        east = math.sin(azimuth)
        dx_per_meter = north * sin_lon + east * cos_lon
        dy_per_meter = north * cos_lon - east * sin_lon
        cols = np.floor((x0 + distances * dx_per_meter - left) / pixel_width).astype(np.int32)
        rows = np.floor((y0 + distances * dy_per_meter - top) / pixel_height).astype(np.int32)
        if (
            np.any(rows < 0)
            or np.any(cols < 0)
            or np.any(rows >= elevation.shape[0])
            or np.any(cols >= elevation.shape[1])
        ):
            raise ValueError(
                "El punto no tiene cobertura de DEM completa hasta 7,5 km en todas "
                "las direcciones; no se puede certificar el horizonte topográfico."
            )

        terrain = elevation[rows, cols]
        if not np.all(np.isfinite(terrain)):
            raise ValueError(
                "El DEM local contiene vacíos dentro del horizonte; no se puede "
                "certificar la línea de visión."
            )
        curvature_drop = distances**2 / (2 * MOON_RADIUS_METERS)
        obstacle_angles = np.degrees(
            np.arctan2(terrain - observer_height - curvature_drop, distances)
        )
        profile[azimuth_deg] = max(0.0, float(np.max(obstacle_angles)))

    return tuple(float(value) for value in profile), ground_m


def _topographic_limit(profile: tuple[float, ...], azimuth_deg: float) -> float:
    azimuth = azimuth_deg % 360
    lower = math.floor(azimuth)
    fraction = azimuth - lower
    upper = (lower + 1) % 360
    return profile[lower] * (1 - fraction) + profile[upper] * fraction


def _utc_datetime(value: object) -> datetime:
    if not isinstance(value, str) or not value:
        raise ValueError("Indica la fecha y hora UTC de inicio.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("La fecha/hora de inicio no es válida.") from error
    if parsed.tzinfo is None:
        raise ValueError("La fecha/hora debe incluir zona UTC.")
    return parsed.astimezone(timezone.utc)


def _iso_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _visibility_periods(samples: list[dict]) -> list[dict]:
    periods = []
    start = samples[0]["_datetime"] if samples[0]["visible"] else None

    for index in range(1, len(samples)):
        previous = samples[index - 1]
        current = samples[index]
        if previous["visible"] == current["visible"]:
            continue

        previous_margin = previous["elevation"] - previous["horizon"]
        current_margin = current["elevation"] - current["horizon"]
        denominator = abs(previous_margin) + abs(current_margin)
        fraction = abs(previous_margin) / denominator if denominator else 0.5
        crossing = previous["_datetime"] + (
            current["_datetime"] - previous["_datetime"]
        ) * fraction

        if current["visible"]:
            start = crossing
        elif start is not None:
            periods.append({"startUtc": _iso_utc(start), "endUtc": _iso_utc(crossing)})
            start = None

    if start is not None:
        periods.append({"startUtc": _iso_utc(start), "endUtc": samples[-1]["time"]})

    for period in periods:
        start_time = datetime.fromisoformat(period["startUtc"].replace("Z", "+00:00"))
        end_time = datetime.fromisoformat(period["endUtc"].replace("Z", "+00:00"))
        period["durationHours"] = round((end_time - start_time).total_seconds() / 3600, 2)
    return periods


def _calculate_site(
    site_key: str,
    latitude: float,
    longitude: float,
    antenna_height_m: float,
    start: datetime,
    duration_days: int,
    step_minutes: int,
) -> dict:
    _validate_point(site_key, latitude, longitude)
    if not math.isfinite(antenna_height_m) or not 0 <= antenna_height_m <= 1000:
        raise ValueError("La altura de antena debe estar entre 0 y 1000 m.")

    point_key = (site_key, round(latitude, 6), round(longitude, 6), round(antenna_height_m, 2))
    profile, ground_m = _terrain_horizon(*point_key)
    radii_km = np.asarray(spice.bodvrd("MOON", "RADII", 3)[1], dtype=np.float64)
    flattening = (radii_km[0] - radii_km[2]) / radii_km[0]
    site_position = spice.georec(
        math.radians(longitude),
        math.radians(latitude),
        (ground_m + antenna_height_m) / 1000,
        float(radii_km[0]),
        float(flattening),
    )

    step = timedelta(minutes=step_minutes)
    end = start + timedelta(days=duration_days)
    sample_times = []
    current = start
    while current <= end:
        sample_times.append(current)
        current += step
    if sample_times[-1] != end:
        sample_times.append(end)

    samples = []
    for sample_time in sample_times:
        et = spice.str2et(sample_time.strftime("%Y %b %d %H:%M:%S UTC").upper())
        earth_from_moon_j2000, _ = spice.spkpos(
            "EARTH", et, "J2000", "NONE", "MOON"
        )
        moon_to_j2000 = spice.pxform(SPICE_FRAME, "J2000", et)
        site_to_j2000 = moon_to_j2000 @ site_position
        earth_from_site = spice.pxform(
            "J2000", SPICE_FRAME, et
        ) @ (earth_from_moon_j2000 - site_to_j2000)

        lon_rad = math.radians(longitude)
        lat_rad = math.radians(latitude)
        east_axis = np.array([-math.sin(lon_rad), math.cos(lon_rad), 0.0])
        north_axis = np.array(
            [
                -math.sin(lat_rad) * math.cos(lon_rad),
                -math.sin(lat_rad) * math.sin(lon_rad),
                math.cos(lat_rad),
            ]
        )
        up_axis = np.array(
            [
                math.cos(lat_rad) * math.cos(lon_rad),
                math.cos(lat_rad) * math.sin(lon_rad),
                math.sin(lat_rad),
            ]
        )
        east = float(np.dot(earth_from_site, east_axis))
        north = float(np.dot(earth_from_site, north_axis))
        up = float(np.dot(earth_from_site, up_axis))
        elevation_deg = math.degrees(math.atan2(up, math.hypot(east, north)))
        azimuth_deg = math.degrees(math.atan2(east, north)) % 360
        horizon_deg = _topographic_limit(profile, azimuth_deg)
        margin = elevation_deg - horizon_deg
        samples.append(
            {
                "time": _iso_utc(sample_time),
                "_datetime": sample_time,
                "elevation": elevation_deg,
                "horizon": horizon_deg,
                "azimuth": azimuth_deg,
                "geometricVisible": elevation_deg > 0,
                "visible": margin > 0,
            }
        )

    periods = _visibility_periods(samples)
    geometric_samples = [
        {
            **sample,
            "horizon": 0.0,
            "visible": sample["geometricVisible"],
        }
        for sample in samples
    ]
    geometric_periods = _visibility_periods(geometric_samples)
    total_hours = sum(period["durationHours"] for period in periods)
    geometric_hours = sum(period["durationHours"] for period in geometric_periods)
    max_elevation = max(sample["elevation"] for sample in samples)
    max_horizon = max(sample["horizon"] for sample in samples)
    public_samples = [
        {
            "time": sample["time"],
            "earthElevationDeg": round(sample["elevation"], 3),
            "terrainHorizonDeg": round(sample["horizon"], 3),
            "azimuthDeg": round(sample["azimuth"], 3),
            "geometricVisible": sample["geometricVisible"],
            "visible": sample["visible"],
        }
        for sample in samples
    ]

    return {
        "site": SITES[site_key]["name"],
        "siteKey": site_key,
        "latitude": latitude,
        "longitude": longitude,
        "groundElevationMeters": round(ground_m, 2),
        "antennaHeightMeters": antenna_height_m,
        "maxEarthElevationDeg": round(max_elevation, 3),
        "maxTerrainHorizonDeg": round(max_horizon, 3),
        "visibleHours": round(total_hours, 2),
        "visiblePercent": round(100 * total_hours / (duration_days * 24), 1),
        "geometricVisibleHours": round(geometric_hours, 2),
        "geometricPeriods": geometric_periods,
        "periodCount": len(periods),
        "longestWindowHours": max(
            (period["durationHours"] for period in periods), default=0
        ),
        "periods": periods,
        "samples": public_samples,
    }


def analyze_solar_illumination(payload: dict) -> dict:
    try:
        site_key = str(payload["site"])
    except (KeyError, TypeError) as error:
        raise ValueError("Selecciona un sitio válido.") from error

    if site_key not in SITES:
        raise ValueError("Selecciona un sitio válido.")

    start = _utc_datetime(payload.get("startUtc"))
    end = start + timedelta(days=LUNAR_SYNODIC_PERIOD_DAYS)
    site = SITES[site_key]
    latitude = site["latitude"]
    longitude = site["longitude"]

    _ensure_kernels_loaded()
    with _spice_lock:
        profile, ground_m = _terrain_horizon(
            site_key, latitude, longitude, 0.0
        )
        radii_km = np.asarray(spice.bodvrd("MOON", "RADII", 3)[1], dtype=np.float64)
        flattening = (radii_km[0] - radii_km[2]) / radii_km[0]
        site_position = spice.georec(
            math.radians(longitude),
            math.radians(latitude),
            ground_m / 1000,
            float(radii_km[0]),
            float(flattening),
        )
        latitude_rad = math.radians(latitude)
        longitude_rad = math.radians(longitude)
        east_axis = np.array([-math.sin(longitude_rad), math.cos(longitude_rad), 0.0])
        north_axis = np.array(
            [
                -math.sin(latitude_rad) * math.cos(longitude_rad),
                -math.sin(latitude_rad) * math.sin(longitude_rad),
                math.cos(latitude_rad),
            ]
        )
        up_axis = np.array(
            [
                math.cos(latitude_rad) * math.cos(longitude_rad),
                math.cos(latitude_rad) * math.sin(longitude_rad),
                math.sin(latitude_rad),
            ]
        )

        sample_times = []
        index = 0
        while True:
            sample_time = start + timedelta(minutes=index * SOLAR_SAMPLE_MINUTES)
            if sample_time >= end:
                break
            sample_times.append(sample_time)
            index += 1
        sample_times.append(end)

        samples = []
        for sample_time in sample_times:
            et = spice.str2et(
                sample_time.strftime("%Y %b %d %H:%M:%S UTC").upper()
            )
            sun_from_moon_j2000, _ = spice.spkpos(
                "SUN", et, "J2000", "NONE", "MOON"
            )
            moon_to_j2000 = spice.pxform(SPICE_FRAME, "J2000", et)
            site_to_j2000 = moon_to_j2000 @ site_position
            sun_from_site = spice.pxform(
                "J2000", SPICE_FRAME, et
            ) @ (sun_from_moon_j2000 - site_to_j2000)

            east = float(np.dot(sun_from_site, east_axis))
            north = float(np.dot(sun_from_site, north_axis))
            up = float(np.dot(sun_from_site, up_axis))
            elevation_deg = math.degrees(math.atan2(up, math.hypot(east, north)))
            azimuth_deg = math.degrees(math.atan2(east, north)) % 360
            horizon_deg = _topographic_limit(profile, azimuth_deg)
            samples.append(
                {
                    "time": _iso_utc(sample_time),
                    "_datetime": sample_time,
                    "elevation": elevation_deg,
                    "horizon": horizon_deg,
                    "azimuth": azimuth_deg,
                    "geometricVisible": elevation_deg > 0,
                    "visible": elevation_deg > horizon_deg,
                }
            )

    periods = _visibility_periods(samples)
    sunlit_hours = sum(period["durationHours"] for period in periods)
    period_hours = (end - start).total_seconds() / 3600
    public_samples = [
        {
            "time": sample["time"],
            "elapsedHours": round(
                (sample["_datetime"] - start).total_seconds() / 3600, 3
            ),
            "sunElevationDeg": round(sample["elevation"], 3),
            "terrainHorizonDeg": round(sample["horizon"], 3),
            "sunAzimuthDeg": round(sample["azimuth"], 3),
            "geometricSunVisible": sample["geometricVisible"],
            "sunlit": sample["visible"],
        }
        for sample in samples
    ]

    return {
        "engine": "NAIF SPICE / CSPICE via SpiceyPy",
        "ephemeris": "DE440s",
        "lunarFrame": SPICE_FRAME,
        "terrainModel": (
            "DEM regional NASA/LOLA, 5 m/píxel; horizonte hasta 7,5 km "
            "con muestreo cada 5 m"
        ),
        "illuminationDefinition": (
            "Centro geométrico del Sol por encima del horizonte topográfico; "
            "sin modelar el disco solar"
        ),
        "site": site["name"],
        "siteKey": site_key,
        "latitude": latitude,
        "longitude": longitude,
        "groundElevationMeters": round(ground_m, 2),
        "startUtc": _iso_utc(start),
        "endUtc": _iso_utc(end),
        "durationDays": LUNAR_SYNODIC_PERIOD_DAYS,
        "sampleMinutes": SOLAR_SAMPLE_MINUTES,
        "sampleCount": len(public_samples),
        "sunlitHours": round(sunlit_hours, 2),
        "shadowHours": round(period_hours - sunlit_hours, 2),
        "sunlitPercent": round(100 * sunlit_hours / period_hours, 2),
        "periods": periods,
        "samples": public_samples,
    }


def analyze_request(payload: dict) -> dict:
    try:
        site_key = str(payload["site"])
        latitude = float(payload["latitude"])
        longitude = float(payload["longitude"])
        antenna_height_m = float(payload.get("antennaHeight", 2))
        duration_days = int(payload.get("durationDays", 7))
        step_minutes = int(payload.get("stepMinutes", 30))
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError("Completa sitio, coordenadas y parámetros de análisis.") from error

    _validate_point(site_key, latitude, longitude)
    if not 1 <= duration_days <= 30:
        raise ValueError("La duración debe estar entre 1 y 30 días.")
    if step_minutes not in (10, 30, 60, 120):
        raise ValueError("El paso temporal debe ser 10, 30, 60 o 120 minutos.")
    start = _utc_datetime(payload.get("startUtc"))
    if not math.isfinite(antenna_height_m) or not 0 <= antenna_height_m <= 1000:
        raise ValueError("La altura de antena debe estar entre 0 y 1000 m.")

    _ensure_kernels_loaded()
    with _spice_lock:
        selected = _calculate_site(
            site_key,
            latitude,
            longitude,
            antenna_height_m,
            start,
            duration_days,
            step_minutes,
        )
        comparison = []
        for candidate_key, candidate in SITES.items():
            candidate_result = _calculate_site(
                candidate_key,
                candidate["latitude"],
                candidate["longitude"],
                antenna_height_m,
                start,
                duration_days,
                step_minutes,
            )
            comparison.append(
                {
                    "site": candidate_result["site"],
                    "siteKey": candidate_key,
                    "visibleHours": candidate_result["visibleHours"],
                    "visiblePercent": candidate_result["visiblePercent"],
                    "geometricVisibleHours": candidate_result["geometricVisibleHours"],
                    "periodCount": candidate_result["periodCount"],
                    "longestWindowHours": candidate_result["longestWindowHours"],
                }
            )

    return {
        "engine": "NAIF SPICE / CSPICE via SpiceyPy",
        "ephemeris": "DE440s",
        "lunarFrame": SPICE_FRAME,
        "terrainModel": (
            "DEM regional NASA/LOLA, 5 m/píxel; horizonte de 7,5 km"
        ),
        "startUtc": _iso_utc(start),
        "durationDays": duration_days,
        "stepMinutes": step_minutes,
        "selected": selected,
        "comparison": comparison,
    }
