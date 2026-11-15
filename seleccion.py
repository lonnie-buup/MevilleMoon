from functools import lru_cache
import math

import numpy as np
import rasterio
from rasterio.enums import Resampling

from comunicacion import DATA_DIR, SITES


MAX_ANALYSIS_SIZE = 1034


def _read_site_raster(path):
    with rasterio.open(path) as dataset:
        scale = min(
            1,
            MAX_ANALYSIS_SIZE / max(dataset.width, dataset.height),
        )
        width = max(1, round(dataset.width * scale))
        height = max(1, round(dataset.height * scale))
        values = dataset.read(
            1,
            out_shape=(height, width),
            resampling=Resampling.nearest,
            masked=True,
        ).astype(np.float32).filled(np.nan)
        values[~np.isfinite(values) | (np.abs(values) > 1_000_000)] = np.nan
        return values


def _mean_valid(values):
    valid = np.isfinite(values)
    if not np.any(valid):
        return None
    return float(np.mean(values[valid]))


def _mean_local_relief(elevation):
    if elevation.shape[0] < 3 or elevation.shape[1] < 3:
        return None

    center_shape = (elevation.shape[0] - 2, elevation.shape[1] - 2)
    local_min = np.full(center_shape, np.inf, dtype=np.float32)
    local_max = np.full(center_shape, -np.inf, dtype=np.float32)
    valid_count = np.zeros(center_shape, dtype=np.uint8)

    for row_offset in range(3):
        for col_offset in range(3):
            neighbor = elevation[
                row_offset:row_offset + center_shape[0],
                col_offset:col_offset + center_shape[1],
            ]
            valid = np.isfinite(neighbor)
            valid_count += valid
            np.minimum(local_min, neighbor, out=local_min, where=valid)
            np.maximum(local_max, neighbor, out=local_max, where=valid)

    usable = valid_count >= 5
    if not np.any(usable):
        return None
    return float(np.mean((local_max - local_min)[usable]))


@lru_cache(maxsize=3)
def _site_terrain_metrics(site_key):
    site = SITES[site_key]
    surface_path = DATA_DIR / site["raster"]
    slope_path = DATA_DIR / site["raster"].replace("_surf.tif", "_slp.tif")
    elevation_error_path = DATA_DIR / site["raster"].replace(
        "_surf.tif", "_toterr.tif"
    )
    elevation = _read_site_raster(surface_path)
    slope = _read_site_raster(slope_path)
    elevation_error = _read_site_raster(elevation_error_path)
    valid_slope = np.isfinite(slope) & (slope >= 0)
    valid_count = int(np.count_nonzero(valid_slope))
    if not valid_count:
        raise ValueError(f"No hay muestras de pendiente válidas para {site['name']}.")

    valid_elevation = elevation[np.isfinite(elevation)]
    roughness = _mean_local_relief(elevation)
    mean_elevation_error = _mean_valid(elevation_error)
    return {
        "site": site["name"],
        "siteKey": site_key,
        "slopeUnder15Percent": round(
            float(np.count_nonzero(valid_slope & (slope <= 15))) * 100 / valid_count,
            2,
        ),
        "slopeCoveragePercent": round(
            valid_count * 100 / slope.size,
            2,
        ),
        "roughnessMeters": round(roughness, 2) if roughness is not None else None,
        "elevationRangeMeters": (
            round(float(np.max(valid_elevation) - np.min(valid_elevation)), 2)
            if valid_elevation.size
            else None
        ),
        "meanElevationErrorMeters": (
            round(mean_elevation_error, 2)
            if mean_elevation_error is not None
            else None
        ),
        "analysisWidth": int(slope.shape[1]),
        "analysisHeight": int(slope.shape[0]),
    }


def terrain_comparison():
    return [_site_terrain_metrics(site_key) for site_key in SITES]
