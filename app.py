from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory

import rasterio
import spiceypy as spice

from comunicacion import analyze_request, analyze_solar_illumination, kernel_status
from seleccion import terrain_comparison


ROOT = Path(__file__).resolve().parent
STATIC_FILES = {
    "index.html",
    "styles.css",
    "comunicacion.css",
    "seleccion.css",
    "script.js",
    "topografia.js",
    "iluminacion.js",
    "comunicacion.js",
    "seleccion.js",
}
DATA_FILES = {
    path.name for path in (ROOT / "Data").glob("*.tif")
}

app = Flask(__name__, static_folder=None)


@app.get("/")
def home():
    return send_from_directory(ROOT, "index.html")


@app.get("/api/communications/health")
def communications_health():
    status = kernel_status()
    return jsonify(status), 200 if status["ready"] else 503


@app.post("/api/communications/analyze")
def communications_analyze():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Se esperaba un objeto JSON."}), 400
    try:
        return jsonify(analyze_request(payload))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 503
    except spice.SpiceyError as error:
        return jsonify({"error": f"Error de cálculo SPICE: {error}"}), 503
    except rasterio.errors.RasterioError as error:
        return jsonify({"error": f"No se pudo leer el DEM NASA/LOLA: {error}"}), 503


@app.post("/api/illumination/analyze")
def illumination_analyze():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Se esperaba un objeto JSON."}), 400
    try:
        return jsonify(analyze_solar_illumination(payload))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 503
    except spice.SpiceyError as error:
        return jsonify({"error": f"Error de cálculo SPICE: {error}"}), 503
    except rasterio.errors.RasterioError as error:
        return jsonify({"error": f"No se pudo leer el DEM NASA/LOLA: {error}"}), 503


@app.get("/api/selection/terrain")
def selection_terrain():
    try:
        return jsonify({"sites": terrain_comparison()})
    except (OSError, rasterio.errors.RasterioError, ValueError) as error:
        return jsonify({"error": f"No se pudieron calcular las métricas de terreno: {error}"}), 503


@app.get("/<path:asset>")
def static_asset(asset: str):
    normalized = asset.replace("\\", "/")
    if normalized in STATIC_FILES:
        return send_from_directory(ROOT, normalized)
    if normalized.startswith("Data/") and normalized[5:] in DATA_FILES:
        return send_from_directory(ROOT, normalized)
    abort(404)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=False)
