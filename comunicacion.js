const siteCoordinates = {
    shackleton: { latitude: -89.7668, longitude: -171.87 },
    degerlache: { latitude: -88.6834, longitude: -67.9321 },
    malapert: { latitude: -85.9948, longitude: -0.23578 }
};

const form = document.getElementById("comunicacion-form");
const siteSelect = document.getElementById("comunicacion-site");
const latitudeInput = document.getElementById("comunicacion-lat");
const longitudeInput = document.getElementById("comunicacion-lon");
const statusPanel = document.getElementById("comunicacion-estado");
const resultPanel = document.getElementById("comunicacion-resultado");
const comparisonPanel = document.getElementById("comunicacion-comparacion");
const calculateButton = document.getElementById("calcular-comunicacion");
let currentSamples = [];

function setSiteCoordinates(siteKey) {
    const coordinates = siteCoordinates[siteKey];
    if (!coordinates) return;
    latitudeInput.value = coordinates.latitude;
    longitudeInput.value = coordinates.longitude;
}

function setStatus(message, state) {
    statusPanel.textContent = message;
    statusPanel.dataset.state = state;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    })[character]);
}

function renderPeriods(periods) {
    if (!periods.length) {
        return "<p>No se encontraron ventanas de línea de visión en el intervalo.</p>";
    }
    return `
        <ol class="period-list">
            ${periods.map(period => `
                <li>
                    <time>${escapeHtml(period.startUtc)}</time>
                    <span>→</span>
                    <time>${escapeHtml(period.endUtc)}</time>
                    <strong>${period.durationHours.toFixed(2)} h</strong>
                </li>
            `).join("")}
        </ol>
    `;
}

function drawVisibilityChart(samples) {
    const canvas = document.getElementById("comunicacion-grafica");
    if (!canvas || samples.length < 2) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));

    const context = canvas.getContext("2d");
    context.scale(ratio, ratio);
    const width = rect.width;
    const height = rect.height;
    const margin = { top: 16, right: 12, bottom: 28, left: 44 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const values = samples.flatMap(sample => [
        sample.earthElevationDeg,
        sample.terrainHorizonDeg
    ]);
    const minValue = Math.min(-5, Math.floor(Math.min(...values) - 1));
    const maxValue = Math.max(5, Math.ceil(Math.max(...values) + 1));
    const y = value => margin.top + (maxValue - value) / (maxValue - minValue) * plotHeight;
    const x = index => margin.left + index / (samples.length - 1) * plotWidth;

    context.clearRect(0, 0, width, height);
    context.font = "11px Arial";
    context.fillStyle = "#9fb0c4";
    context.strokeStyle = "rgba(255,255,255,.12)";
    context.lineWidth = 1;

    [minValue, 0, maxValue].forEach(value => {
        const lineY = y(value);
        context.beginPath();
        context.moveTo(margin.left, lineY);
        context.lineTo(width - margin.right, lineY);
        context.stroke();
        context.fillText(`${value}°`, 5, lineY + 4);
    });

    for (let index = 1; index < samples.length; index++) {
        const previous = samples[index - 1];
        const current = samples[index];
        context.beginPath();
        context.moveTo(x(index - 1), y(previous.earthElevationDeg));
        context.lineTo(x(index), y(current.earthElevationDeg));
        context.strokeStyle = current.visible
            ? "#70d8a3"
            : current.geometricVisible ? "#ffc857" : "#ff8178";
        context.lineWidth = 2;
        context.stroke();
    }

    context.beginPath();
    samples.forEach((sample, index) => {
        const pointX = x(index);
        const pointY = y(sample.terrainHorizonDeg);
        if (index === 0) context.moveTo(pointX, pointY);
        else context.lineTo(pointX, pointY);
    });
    context.strokeStyle = "#ffc857";
    context.lineWidth = 1.5;
    context.setLineDash([5, 4]);
    context.stroke();
    context.setLineDash([]);

    context.fillStyle = "#9fb0c4";
    context.fillText("Inicio", margin.left, height - 7);
    context.fillText("Fin", width - margin.right - 20, height - 7);
}

function renderComparison(rows) {
    comparisonPanel.innerHTML = `
        <div class="comunicacion-table-wrap">
            <table class="comunicacion-table">
                <thead>
                    <tr>
                        <th>Sitio</th>
                        <th>Geométrica</th>
                        <th>Con relieve</th>
                        <th>Ventanas</th>
                        <th>Ventana más larga</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            <th scope="row">${escapeHtml(row.site)}</th>
                            <td>${row.geometricVisibleHours.toFixed(2)} h</td>
                            <td>${row.visibleHours.toFixed(2)} h (${row.visiblePercent.toFixed(1)}%)</td>
                            <td>${row.periodCount}</td>
                            <td>${row.longestWindowHours.toFixed(2)} h</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderResult(data) {
    const result = data.selected;
    currentSamples = result.samples;
    resultPanel.innerHTML = `
        <div class="comunicacion-metrics">
            <div><span>Elevación aparente máxima</span><strong>${result.maxEarthElevationDeg.toFixed(2)}°</strong></div>
            <div><span>Horizonte topográfico máximo</span><strong>${result.maxTerrainHorizonDeg.toFixed(2)}°</strong></div>
            <div><span>Visibilidad geométrica</span><strong>${result.geometricVisibleHours.toFixed(2)} h</strong></div>
            <div><span>Línea de mira libre con relieve</span><strong>${result.visibleHours.toFixed(2)} h</strong></div>
            <div><span>Ventana continua más larga</span><strong>${result.longestWindowHours.toFixed(2)} h</strong></div>
        </div>
        <p class="comunicacion-data">
            <strong>${escapeHtml(result.site)}</strong> ·
            ${result.latitude.toFixed(4)}°, ${result.longitude.toFixed(4)}° ·
            terreno ${result.groundElevationMeters.toFixed(1)} m ·
            antena ${result.antennaHeightMeters.toFixed(1)} m
        </p>
        <div class="comunicacion-legend">
            <span><i class="legend-visible"></i> Línea de mira libre con DEM</span>
            <span><i class="legend-obstructed"></i> Centro de la Tierra bajo horizonte</span>
            <span><i class="legend-occluded"></i> Oculta por relieve</span>
            <span><i class="legend-horizon"></i> Horizonte topográfico</span>
        </div>
        <div class="comunicacion-chart-wrap">
            <canvas id="comunicacion-grafica" aria-label="Elevación de la Tierra y horizonte topográfico durante el periodo"></canvas>
        </div>
        <h3>Ventanas geométricas (sin relieve)</h3>
        ${renderPeriods(result.geometricPeriods)}
        <h3>Ventanas tras oclusión del terreno</h3>
        ${renderPeriods(result.periods)}
        <p class="comunicacion-resolution">
            Muestreo: ${data.stepMinutes} min · transiciones estimadas por interpolación
            entre muestras · efemérides ${escapeHtml(data.ephemeris)} (${escapeHtml(data.lunarFrame)}).
        </p>
    `;
    renderComparison(data.comparison);
    drawVisibilityChart(result.samples);
}

async function checkSpiceService() {
    if (window.location.protocol === "file:") {
        calculateButton.disabled = true;
        resultPanel.textContent =
            "El simulador necesita el servidor local para conectarse con SPICE.";
        setStatus(
            "No abras index.html directamente. Ejecuta iniciar_programa.bat y abre http://127.0.0.1:8000.",
            "error"
        );
        return;
    }

    try {
        const response = await fetch("/api/communications/health");
        const status = await response.json();
        setStatus(status.message, status.ready ? "ready" : "error");
    } catch (error) {
        setStatus(
            "Servicio SPICE sin conexión. Ejecuta iniciar_programa.bat y abre http://127.0.0.1:8000.",
            "error"
        );
    }
}

siteSelect.addEventListener("change", () => setSiteCoordinates(siteSelect.value));

document.querySelectorAll("[data-site]").forEach(button => {
    button.addEventListener("click", () => {
        const siteKey = {
            "Shackleton": "shackleton",
            "Malapert": "malapert",
            "De Gerlache": "degerlache"
        }[button.dataset.site];
        if (siteKey) {
            siteSelect.value = siteKey;
            setSiteCoordinates(siteKey);
        }
    });
});

form.addEventListener("submit", async event => {
    event.preventDefault();
    calculateButton.disabled = true;
    calculateButton.textContent = "Calculando…";
    resultPanel.textContent = "Calculando efemérides SPICE y horizonte topográfico…";
    setStatus("Análisis en curso.", "working");

    try {
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());
        payload.latitude = Number(payload.latitude);
        payload.longitude = Number(payload.longitude);
        payload.antennaHeight = Number(payload.antennaHeight);
        payload.durationDays = Number(payload.durationDays);
        payload.stepMinutes = Number(payload.stepMinutes);
        payload.startUtc = `${payload.startUtc}:00Z`;

        const response = await fetch("/api/communications/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
            throw new Error(`El servicio devolvió una respuesta inesperada (HTTP ${response.status}).`);
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        renderResult(data);
        setStatus("Análisis SPICE + NASA/LOLA completado.", "ready");
    } catch (error) {
        resultPanel.textContent = error.message;
        setStatus("No se pudo completar el análisis.", "error");
    } finally {
        calculateButton.disabled = false;
        calculateButton.textContent = "Calcular visibilidad";
    }
});

const nowUtc = new Date();
document.getElementById("comunicacion-inicio").value =
    nowUtc.toISOString().slice(0, 16);
setSiteCoordinates(siteSelect.value);
checkSpiceService();

window.addEventListener("resize", () => {
    if (currentSamples.length) drawVisibilityChart(currentSamples);
});
