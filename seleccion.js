const SITE_KEYS = ["shackleton", "degerlache", "malapert"];
const SITE_NAMES = {
    shackleton: "Shackleton Rim",
    degerlache: "De Gerlache Rim",
    malapert: "Malapert Massif"
};
const SITE_COORDINATES = {
    shackleton: { latitude: -89.7668, longitude: -171.87 },
    degerlache: { latitude: -88.6834, longitude: -67.9321 },
    malapert: { latitude: -85.9948, longitude: -0.23578 }
};
const weightValueLabels = {
    solar: document.getElementById("peso-solar-valor"),
    communications: document.getElementById("peso-comunicacion-valor"),
    terrain: document.getElementById("peso-terreno-valor")
};
const weightInputs = {
    solar: document.getElementById("peso-solar"),
    communications: document.getElementById("peso-comunicacion"),
    terrain: document.getElementById("peso-terreno")
};
const normalizedWeightLabels = {
    solar: document.getElementById("peso-solar-normalizado"),
    communications: document.getElementById("peso-comunicacion-normalizado"),
    terrain: document.getElementById("peso-terreno-normalizado")
};
const statePanel = document.getElementById("seleccion-estado");
const resultsPanel = document.getElementById("seleccion-resultados");
const calculateButton = document.getElementById("calcular-seleccion");
let analysisData = null;

const presets = {
    solar: { solar: 75, communications: 15, terrain: 10 },
    communications: { solar: 15, communications: 75, terrain: 10 },
    terrain: { solar: 15, communications: 10, terrain: 75 },
    balanced: { solar: 34, communications: 33, terrain: 33 }
};

function setStatus(message, state) {
    statePanel.textContent = message;
    statePanel.dataset.state = state;
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

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
        throw new Error(`Respuesta inesperada del servicio (HTTP ${response.status}).`);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
}

function normalizeLowerIsBetter(values) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return values.map(() => 100);
    return values.map(value => (max - value) * 100 / (max - min));
}

function collectWeights() {
    return Object.fromEntries(
        Object.entries(weightInputs).map(([key, input]) => [key, Number(input.value)])
    );
}

function updateWeightLabels() {
    for (const [key, input] of Object.entries(weightInputs)) {
        weightValueLabels[key].value = input.value;
    }
    const weights = collectWeights();
    const weightTotal = Object.values(weights).reduce((sum, value) => sum + value, 0);
    for (const [key, label] of Object.entries(normalizedWeightLabels)) {
        label.value = `${weightTotal ? (weights[key] * 100 / weightTotal).toFixed(1) : "0.0"}%`;
    }
    if (analysisData) renderResults();
}

function buildScores() {
    const sites = SITE_KEYS.map(key => analysisData.sites[key]);
    const roughnessScores = normalizeLowerIsBetter(
        sites.map(site => site.terrain.roughnessMeters)
    );
    const weights = collectWeights();
    const weightTotal = Object.values(weights).reduce((sum, value) => sum + value, 0);

    return sites.map((site, index) => {
        const terrainScore =
            site.terrain.slopeUnder15Percent * 0.7 +
            roughnessScores[index] * 0.3;
        const scores = {
            solar: site.solar.sunlitPercent,
            communications: site.communication.visiblePercent,
            terrain: terrainScore
        };
        const contributions = Object.fromEntries(
            Object.entries(scores).map(([key, score]) => [
                key,
                weightTotal ? score * weights[key] / weightTotal : 0
            ])
        );
        const weightShares = Object.fromEntries(
            Object.entries(weights).map(([key, weight]) => [
                key,
                weightTotal ? weight * 100 / weightTotal : 0
            ])
        );
        return {
            ...site,
            scores,
            contributions,
            weightShares,
            total: Object.values(contributions).reduce((sum, value) => sum + value, 0),
            terrainSubscore: {
                slope: site.terrain.slopeUnder15Percent,
                roughness: roughnessScores[index]
            }
        };
    }).sort((a, b) => b.total - a.total);
}

function renderResults() {
    const weights = collectWeights();
    if (!Object.values(weights).some(weight => weight > 0)) {
        resultsPanel.innerHTML = "<p>Asigna un peso mayor que cero para obtener una clasificación.</p>";
        return;
    }

    const ranked = buildScores();
    resultsPanel.innerHTML = ranked.map((site, index) => `
        <article class="seleccion-card">
            <div class="seleccion-card-heading">
                <span>${index === 0 ? "MEJOR PUNTUACIÓN" : `PUESTO ${index + 1}`}</span>
                <h3>${escapeHtml(SITE_NAMES[site.siteKey])}</h3>
                <strong>${site.total.toFixed(1)}<small> / 100</small></strong>
            </div>
            <div class="seleccion-score-grid">
                <div>
                    <span>Energía solar</span>
                    <strong>${site.scores.solar.toFixed(1)} / 100</strong>
                    <small>${site.solar.sunlitHours.toFixed(1)} h con Sol directo de ${site.solar.durationDays.toFixed(1)} días</small>
                    <small>Peso efectivo: ${site.weightShares.solar.toFixed(1)}%</small>
                    <small>Aporte ponderado: ${site.contributions.solar.toFixed(1)} puntos</small>
                </div>
                <div>
                    <span>Comunicación</span>
                    <strong>${site.scores.communications.toFixed(1)} / 100</strong>
                    <small>${site.communication.visibleHours.toFixed(1)} h visibles de 168 h</small>
                    <small>Peso efectivo: ${site.weightShares.communications.toFixed(1)}%</small>
                    <small>Aporte ponderado: ${site.contributions.communications.toFixed(1)} puntos</small>
                </div>
                <div>
                    <span>Terreno</span>
                    <strong>${site.scores.terrain.toFixed(1)} / 100</strong>
                    <small>${site.terrain.slopeUnder15Percent.toFixed(1)}% de muestras con pendiente ≤15°</small>
                    <small>Rugosidad media: ${site.terrain.roughnessMeters.toFixed(1)} m</small>
                    <small>Peso efectivo: ${site.weightShares.terrain.toFixed(1)}%</small>
                    <small>Aporte ponderado: ${site.contributions.terrain.toFixed(1)} puntos</small>
                </div>
            </div>
            <p class="seleccion-reason">
                <strong>Por qué:</strong>
                ${site.contributions.solar >= site.contributions.communications &&
                    site.contributions.solar >= site.contributions.terrain
                    ? `la iluminación aporta más (${site.contributions.solar.toFixed(1)} puntos ponderados).`
                    : site.contributions.communications >= site.contributions.terrain
                        ? `la visibilidad Tierra–Luna aporta más (${site.contributions.communications.toFixed(1)} puntos ponderados).`
                        : `el terreno aporta más (${site.contributions.terrain.toFixed(1)} puntos ponderados).`}
                La nota final es la suma de los tres aportes ponderados
                (${site.contributions.solar.toFixed(1)} + ${site.contributions.communications.toFixed(1)} +
                ${site.contributions.terrain.toFixed(1)} = ${site.total.toFixed(1)} puntos sobre 100).
                El terreno combina en un 70% la proporción de pendiente ≤15° y en un 30%
                la rugosidad relativa entre estos tres sitios. Error DEM medio:
                ${site.terrain.meanElevationErrorMeters === null
                    ? "sin dato"
                    : `${site.terrain.meanElevationErrorMeters.toFixed(1)} m`}.
            </p>
        </article>
    `).join("");
}

async function analyzeSites() {
    calculateButton.disabled = true;
    calculateButton.textContent = "Analizando…";
    resultsPanel.textContent = "Calculando iluminación, comunicaciones y terreno local…";
    setStatus("Análisis en curso.", "working");

    try {
        const date = document.getElementById("seleccion-fecha").value;
        if (!date) throw new Error("Selecciona la fecha de comparación.");

        const solarRequests = SITE_KEYS.map(site => fetchJson(
            "/api/illumination/analyze",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    site,
                    startUtc: `${date}T00:00:00Z`
                })
            }
        ));
        const [terrainData, communicationData, solarResults] = await Promise.all([
            fetchJson("/api/selection/terrain"),
            fetchJson("/api/communications/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    site: "shackleton",
                    ...SITE_COORDINATES.shackleton,
                    antennaHeight: 2,
                    startUtc: `${date}T00:00:00Z`,
                    durationDays: 7,
                    stepMinutes: 120
                })
            }),
            Promise.all(solarRequests)
        ]);
        const terrainByKey = Object.fromEntries(
            terrainData.sites.map(site => [site.siteKey, site])
        );
        const communicationByKey = Object.fromEntries(
            communicationData.comparison.map(site => [site.siteKey, site])
        );
        const solarByKey = Object.fromEntries(
            solarResults.map(site => [site.siteKey, site])
        );
        const sites = {};
        for (const key of SITE_KEYS) {
            const solar = solarByKey[key];
            if (!terrainByKey[key] || !communicationByKey[key] || !solar) {
                throw new Error(`Faltan datos comparativos para ${SITE_NAMES[key]}.`);
            }
            if (
                !Number.isFinite(terrainByKey[key].roughnessMeters) ||
                !Number.isFinite(terrainByKey[key].slopeUnder15Percent) ||
                !Number.isFinite(solar.sunlitPercent) ||
                !Number.isFinite(communicationByKey[key].visiblePercent)
            ) {
                throw new Error(`Los datos de ${SITE_NAMES[key]} están incompletos.`);
            }
            sites[key] = {
                siteKey: key,
                solar,
                terrain: terrainByKey[key],
                communication: communicationByKey[key]
            };
        }
        analysisData = { sites };
        renderResults();
        setStatus(
            `Comparación completada para el ${date}. Iluminación: SPICE + NASA/LOLA, ${solarResults[0].durationDays.toFixed(1)} días; comunicación: SPICE + NASA/LOLA, 7 días.`,
            "ready"
        );
    } catch (error) {
        resultsPanel.textContent = error.message;
        setStatus("No se pudo completar la comparación.", "error");
    } finally {
        calculateButton.disabled = false;
        calculateButton.textContent = "Analizar y comparar sitios";
    }
}

for (const input of Object.values(weightInputs)) {
    input.addEventListener("input", updateWeightLabels);
}

document.querySelectorAll("[data-preset]").forEach(button => {
    button.addEventListener("click", () => {
        const preset = presets[button.dataset.preset];
        if (!preset) return;
        for (const [key, value] of Object.entries(preset)) {
            weightInputs[key].value = value;
        }
        updateWeightLabels();
    });
});

calculateButton.addEventListener("click", analyzeSites);
updateWeightLabels();
