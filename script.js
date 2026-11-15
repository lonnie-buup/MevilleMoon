import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

// ======================================================
// MEVILLE MOON | LUNAR SITE EXPLORER
// VISUALIZADOR LUNAR 3D
// ======================================================

// ==========================================
// 1. INFORMACIÓN DE LOS SITIOS
// ==========================================

const NASA_2022_SOURCE =
    "https://www.nasa.gov/news-release/la-nasa-identifica-regiones-candidatas-para-un-alunizaje-humano/";
const NASA_2024_SOURCE =
    "https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/";
const NASA_SELECTION_FACTORS =
    "NASA evaluó estas regiones con datos del Lunar Reconnaissance Orbiter y consideró valor científico, ventanas de lanzamiento, terreno, comunicación con la Tierra e iluminación.";

const sitios = {
    "Shackleton": {
        numero: "SITE 01",
        descripcion: "Shackleton Rim",
        regionNASA: "Pico cerca de Shackleton (Peak near Shackleton)",
        estadoNASA: "Fue una de las 13 regiones candidatas anunciadas en 2022. No figura entre las nueve regiones potenciales de la actualización NASA de 2024.",
        lat: -89.7668,
        lon: -171.87,
        color: 0x35c9ff
    },

    "Malapert": {
        numero: "SITE 02",
        descripcion: "Malapert Massif",
        regionNASA: "Macizo de Malapert (Malapert Massif)",
        estadoNASA: "Figura en la lista original de 13 regiones candidatas de 2022 y en la lista refinada de nueve regiones potenciales publicada por NASA en 2024.",
        lat: -85.9948,
        lon: -0.23578,
        color: 0xffc857
    },

    "De Gerlache": {
        numero: "SITE 03",
        descripcion: "De Gerlache Rim 1",
        regionNASA: "Borde de Gerlache 1 (de Gerlache Rim 1)",
        estadoNASA: "Fue una de las 13 regiones candidatas anunciadas en 2022. No figura entre las nueve regiones potenciales de la actualización NASA de 2024.",
        lat: -88.6834,
        lon: -67.9321,
        color: 0xff7b72
    }
};

// ==========================================
// 2. SELECCIÓN DE SITIOS
// ==========================================

function selectSite(site) {

    const selection = document.getElementById("selection");
    const datos = sitios[site];

    if (!selection || !datos) return;

    selection.innerHTML = `
        <div class="analysis-result">

            <p class="eyebrow">
                ${datos.numero} / SITE SELECTED
            </p>

            <h2>${site}</h2>

            <p>${datos.descripcion}</p>

            <h3>Región candidata según NASA</h3>
            <p>${datos.regionNASA}</p>
            <p>${datos.estadoNASA}</p>

            <div class="result-grid">

                <div class="result-card">
                    <h4>Punto del modelo</h4>
                    <p>Latitud: ${datos.lat}°</p>
                    <p>Longitud: ${datos.lon}°</p>
                    <p>Estas coordenadas son el punto de referencia de esta aplicación; NASA no las identifica aquí como un lugar de aterrizaje seleccionado.</p>
                </div>

                <div class="result-card">
                    <h4>Criterios publicados por NASA</h4>
                    <p>${NASA_SELECTION_FACTORS}</p>
                </div>

                <div class="result-card">
                    <h4>Alcance de la selección</h4>
                    <p>Las regiones son áreas candidatas, no una selección final de sitio. NASA indicó que las áreas del polo sur seguirán estudiándose para Artemis III y misiones posteriores.</p>
                </div>

            </div>

            <p class="site-nasa-sources">
                Fuentes:
                <a href="${NASA_2022_SOURCE}" target="_blank" rel="noopener noreferrer">NASA, anuncio de 2022</a>
                ·
                <a href="${NASA_2024_SOURCE}" target="_blank" rel="noopener noreferrer">NASA, actualización de 2024</a>
            </p>

        </div>
    `;

    // Sincronizar selección con el módulo topográfico.
    const equivalencias = {
        "Shackleton": "shackleton",
        "Malapert": "malapert",
        "De Gerlache": "degerlache"
    };

    const selector = document.getElementById("topografia-site");

    if (selector) {
        selector.value = equivalencias[site];
    }

    selection.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
}

// Botones de selección.
document.querySelectorAll("[data-site]").forEach(button => {
    button.addEventListener("click", () => {
        selectSite(button.dataset.site);
    });
});

// ==========================================
// 3. INICIALIZAR VISOR 3D
// ==========================================

const container = document.getElementById("moon-viewer");

if (!container) {
    throw new Error("No se encontró moon-viewer.");
}

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    100
);

camera.position.set(0, 0, 4.5);

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
});

renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, 2)
);

renderer.setSize(
    container.clientWidth,
    container.clientHeight
);

renderer.outputColorSpace = THREE.SRGBColorSpace;

renderer.domElement.style.touchAction = "none";

container.appendChild(renderer.domElement);

// ==========================================
// 4. ILUMINACIÓN
// ==========================================

scene.add(
    new THREE.AmbientLight(0xffffff, 0.8)
);

const sunLight = new THREE.DirectionalLight(
    0xffffff,
    2
);

sunLight.position.set(-4, 2, 5);
scene.add(sunLight);

// ==========================================
// 5. CREAR LUNA
// ==========================================

const radius = 1.25;

const geometry = new THREE.SphereGeometry(
    radius,
    128,
    128
);

const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1
});

const moon = new THREE.Mesh(geometry, material);

moon.rotation.set(-Math.PI / 2, 0, 0);

scene.add(moon);

// ==========================================
// 6. TEXTURA LUNAR
// ==========================================

const loader = new THREE.TextureLoader();

loader.load(
    "https://threejs.org/examples/textures/planets/moon_1024.jpg",

    texture => {
        texture.colorSpace = THREE.SRGBColorSpace;
        material.map = texture;
        material.needsUpdate = true;
        console.log("MEVILLE MOON: textura lunar cargada.");
    },

    undefined,

    error => {
        console.warn("No se pudo cargar la textura lunar.", error);
    }
);

// ==========================================
// 7. COORDENADAS LUNARES
// ==========================================

function coordinatesToPosition(lat, lon) {

    const latitude = THREE.MathUtils.degToRad(lat);
    const longitude = THREE.MathUtils.degToRad(lon);

    const r = radius * 1.025;

    return new THREE.Vector3(
        -r * Math.cos(latitude) * Math.sin(longitude),
        r * Math.sin(latitude),
        r * Math.cos(latitude) * Math.cos(longitude)
    );
}

// ==========================================
// 8. MARCADORES
// ==========================================

const markers = new THREE.Group();
moon.add(markers);

const markerObjects = [];

function createLabel(text, color) {

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;

    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#0b1b2e";
    ctx.fillRect(0, 0, 512, 128);

    ctx.strokeStyle =
        "#" + color.toString(16).padStart(6, "0");

    ctx.lineWidth = 7;
    ctx.strokeRect(4, 4, 504, 120);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 38px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);

    const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        })
    );

    sprite.scale.set(0.85, 0.21, 1);
    sprite.renderOrder = 10;

    return sprite;
}

// ==========================================
// 9. CREAR SITIOS Y ETIQUETAS
// ==========================================

Object.entries(sitios).forEach(([nombre, datos]) => {

    const position = coordinatesToPosition(
        datos.lat,
        datos.lon
    );

    const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 20, 20),
        new THREE.MeshBasicMaterial({
            color: datos.color,
            depthTest: false
        })
    );

    marker.position.copy(position);
    marker.renderOrder = 5;
    marker.userData.siteName = nombre;

    markers.add(marker);
    markerObjects.push(marker);

    const label = createLabel(
        nombre,
        datos.color
    );

    // Las etiquetas se separan visualmente del punto.
    const direction = position.clone().normalize();

    const offsets = {
        "Shackleton": new THREE.Vector3(-0.50, 0.16, 0),
        "Malapert": new THREE.Vector3(0.10, 0.40, 0),
        "De Gerlache": new THREE.Vector3(0.48, 0.16, 0)
    };

    label.position.copy(
        position.clone().multiplyScalar(1.03)
            .add(offsets[nombre])
    );

    markers.add(label);
});

// ==========================================
// 10. ROTACIÓN CON RATÓN O PANTALLA
// ==========================================

let dragging = false;
let moved = false;

let previousX = 0;
let previousY = 0;

let startX = 0;
let startY = 0;

const canvas = renderer.domElement;

canvas.addEventListener("pointerdown", event => {

    dragging = true;
    moved = false;

    previousX = event.clientX;
    previousY = event.clientY;

    startX = event.clientX;
    startY = event.clientY;

    canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", event => {

    if (!dragging) return;

    const dx = event.clientX - previousX;
    const dy = event.clientY - previousY;

    if (
        Math.abs(event.clientX - startX) > 4 ||
        Math.abs(event.clientY - startY) > 4
    ) {
        moved = true;
    }

    moon.rotation.y += dx * 0.005;
    moon.rotation.x += dy * 0.005;

    previousX = event.clientX;
    previousY = event.clientY;
});

canvas.addEventListener("pointerup", event => {

    dragging = false;

    if (moved) return;

    const rect = canvas.getBoundingClientRect();

    const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();

    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObjects(markerObjects);

    if (hits.length > 0) {
        selectSite(hits[0].object.userData.siteName);
    }
});

canvas.addEventListener("pointercancel", () => {
    dragging = false;
});

// ==========================================
// 11. ZOOM
// ==========================================

document.getElementById("zoom-in").addEventListener("click", () => {

    camera.position.z = Math.max(
        2.2,
        camera.position.z - 0.35
    );
});

document.getElementById("zoom-out").addEventListener("click", () => {

    camera.position.z = Math.min(
        7,
        camera.position.z + 0.35
    );
});

document.getElementById("reset-moon").addEventListener("click", () => {

    moon.rotation.set(-Math.PI / 2, 0, 0);
    camera.position.set(0, 0, 4.5);
});

// ==========================================
// 12. REDIMENSIONAR
// ==========================================

const resizeObserver = new ResizeObserver(() => {

    const width = container.clientWidth;
    const height = container.clientHeight;

    if (!width || !height) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
});

resizeObserver.observe(container);

// ==========================================
// 13. ANIMACIÓN
// ==========================================

function animate() {

    requestAnimationFrame(animate);

    if (!dragging) {
        moon.rotation.y += 0.0005;
    }

    renderer.render(scene, camera);
}

animate();

console.log("MEVILLE MOON: visor 3D iniciado correctamente.");