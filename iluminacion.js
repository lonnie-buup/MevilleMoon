const siteSelect = document.getElementById("iluminacion-site");
const dateInput = document.getElementById("iluminacion-fecha");
const calculateButton = document.getElementById("calcular-iluminacion");
const exportButton = document.getElementById("exportar-iluminacion-pdf");
const resultPanel = document.getElementById("iluminacion-resultado");
const graph = document.getElementById("grafica-solar");
const tableBody = document.getElementById("tabla-iluminacion");
const tableSummary = document.getElementById("tabla-iluminacion-resumen");
const tableDetails = document.querySelector(".iluminacion-registros");
let currentSamples = [];
let tableRendered = false;

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    })[character]);
}

function formatUtc(value) {
    return new Intl.DateTimeFormat("es", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC"
    }).format(new Date(value));
}

function renderChart(samples, durationHours) {
    const width = 900;
    const height = 320;
    const margin = { top: 20, right: 24, bottom: 48, left: 60 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const points = samples.map(sample => ({
        x: margin.left + sample.elapsedHours / durationHours * plotWidth,
        y: margin.top + (sample.sunlit ? 0 : plotHeight),
        sample
    }));
    const linePath = points.map((point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    ).join(" ");
    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(margin.top + plotHeight).toFixed(1)} L ${points[0].x.toFixed(1)} ${(margin.top + plotHeight).toFixed(1)} Z`;
    const grid = [0, 50, 100].map(value => {
        const y = margin.top + (1 - value / 100) * plotHeight;
        return `
            <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" class="grafica-grid" />
            <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" class="grafica-etiqueta">${value}%</text>
        `;
    }).join("");
    const dayLabels = [0, 7, 14, 21, 29.5].map(day => {
        const x = margin.left + (day * 24) / durationHours * plotWidth;
        return `
            <text x="${x}" y="${height - 16}" text-anchor="middle" class="grafica-etiqueta">Día ${day}</text>
        `;
    }).join("");
    graph.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" role="img"
             aria-label="Sol directo o sombra en muestras cada 30 minutos durante un ciclo lunar">
            <title>Distribución temporal de luz solar directa</title>
            ${grid}
            <path d="${areaPath}" class="grafica-area"></path>
            <path d="${linePath}" class="grafica-linea"></path>
            ${dayLabels}
        </svg>
    `;
}

function renderHourlyTable() {
    if (tableRendered) return;
    tableBody.innerHTML = currentSamples.map(sample => `
        <tr>
            <td>${escapeHtml(formatUtc(sample.time))}</td>
            <td>${sample.sunElevationDeg.toFixed(3)}°</td>
            <td>${sample.terrainHorizonDeg.toFixed(3)}°</td>
            <td>${sample.sunAzimuthDeg.toFixed(3)}°</td>
            <td>${sample.sunlit ? "Sol directo" : "Sombra por horizonte"}</td>
        </tr>
    `).join("");
    tableRendered = true;
}

function renderResult(data) {
    const durationHours = data.durationDays * 24;
    document.getElementById("porcentaje-iluminacion").textContent =
        `${data.sunlitPercent}%`;
    document.getElementById("tiempo-iluminado").textContent =
        `${data.sunlitHours} h`;
    document.getElementById("tiempo-sombra").textContent =
        `${data.shadowHours} h`;

    resultPanel.innerHTML = `
        <p><strong>Región:</strong> ${escapeHtml(data.site)}
            (${data.latitude.toFixed(4)}°, ${data.longitude.toFixed(4)}°)</p>
        <p><strong>DEM:</strong> elevación del punto ${data.groundElevationMeters} m.
            El horizonte se calcula en un radio de 7,5 km.</p>
        <p><strong>Periodo UTC:</strong> ${escapeHtml(formatUtc(data.startUtc))}
            – ${escapeHtml(formatUtc(data.endUtc))} (${data.durationDays.toFixed(2)} días).</p>
        <p><strong>Criterio de iluminación:</strong>
            ${escapeHtml(data.illuminationDefinition)}.</p>
    `;

    renderChart(data.samples, durationHours);
    tableSummary.textContent =
        `Ver detalle de las ${data.sampleCount} muestras cada ${data.sampleMinutes} min`;
    exportButton.disabled = false;
    currentSamples = data.samples;
    tableRendered = false;
    tableBody.replaceChildren();
    if (tableDetails.open) renderHourlyTable();
    document.getElementById("fuente-iluminacion").innerHTML = `
        <p><strong>Fuentes:</strong> ${escapeHtml(data.ephemeris)} / SPICE en el marco
            ${escapeHtml(data.lunarFrame)}; ${escapeHtml(data.terrainModel)}.
            ${escapeHtml(data.illuminationDefinition)}. Las transiciones se interpolan
            entre muestras de ${data.sampleMinutes} min.</p>
    `;
}

async function ejecutarSimulacion() {
    if (!siteSelect || !dateInput || !calculateButton || !resultPanel) return;
    if (!dateInput.value) {
        clearResults();
        resultPanel.textContent = "Selecciona la fecha UTC de inicio del análisis.";
        return;
    }

    calculateButton.disabled = true;
    clearResults();
    resultPanel.textContent = "Calculando iluminación con SPICE y DEM NASA/LOLA…";
    try {
        const response = await fetch("/api/illumination/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                site: siteSelect.value,
                startUtc: `${dateInput.value}T00:00:00Z`
            })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "No se pudo calcular la iluminación.");
        }
        renderResult(data);
    } catch (error) {
        clearResults();
        resultPanel.textContent =
            `No se pudo calcular la iluminación: ${error.message}`;
    } finally {
        calculateButton.disabled = false;
    }
}

function clearResults() {
    document.getElementById("porcentaje-iluminacion").textContent = "--";
    document.getElementById("tiempo-iluminado").textContent = "--";
    document.getElementById("tiempo-sombra").textContent = "--";
    exportButton.disabled = true;
    graph.replaceChildren();
    tableBody.replaceChildren();
    currentSamples = [];
    tableRendered = false;
}

function exportarResultadosPDF() {
    if (exportButton.disabled) return;
    const previousTitle = document.title;
    const selectedSite = siteSelect.selectedOptions[0].textContent.trim();
    document.title =
        `Meville Moon - Iluminacion solar - ${selectedSite} - ${dateInput.value}`;
    document.body.classList.add("imprimir-iluminacion");

    window.addEventListener("afterprint", () => {
        document.body.classList.remove("imprimir-iluminacion");
        document.title = previousTitle;
    }, { once: true });

    window.print();
}

if (calculateButton) {
    calculateButton.addEventListener("click", ejecutarSimulacion);
}

if (exportButton) {
    exportButton.addEventListener("click", exportarResultadosPDF);
}

if (tableDetails) {
    tableDetails.addEventListener("toggle", () => {
        if (tableDetails.open) renderHourlyTable();
    });
}

document.querySelectorAll("[data-site]").forEach(button => {
    button.addEventListener("click", () => {
        const siteKey = {
            "Shackleton": "shackleton",
            "Malapert": "malapert",
            "De Gerlache": "degerlache"
        }[button.dataset.site];
        if (siteKey && siteSelect) {
            siteSelect.value = siteKey;
            ejecutarSimulacion();
        }
    });
});

window.addEventListener("DOMContentLoaded", ejecutarSimulacion);
