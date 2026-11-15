import { fromArrayBuffer } from "https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm";

// ======================================================
// MEVILLE MOON | NASA LOLA
// ANALISIS TOPOGRAFICO Y SELECCION REGIONAL
// ======================================================

const archivosSitios = {
   shackleton: {
    nombre: "Shackleton Rim",
    codigo: "SITE 04",
    elevacion: "Data/Site04_final_adj_5mpp_surf.tif",
    pendiente: "Data/Site04_final_adj_5mpp_slp.tif",
    errorElevacion: "Data/Site04_final_adj_5mpp_toterr.tif",
    errorPendiente: "Data/Site04_final_adj_5mpp_slperr.tif"
},
degerlache: {
    nombre: "De Gerlache Rim",
    codigo: "SITE 11",
    elevacion: "Data/Site11_final_adj_5mpp_surf.tif",
    pendiente: "Data/Site11_final_adj_5mpp_slp.tif",
    errorElevacion: "Data/Site11_final_adj_5mpp_toterr.tif",
    errorPendiente: "Data/Site11_final_adj_5mpp_slperr.tif"
},
malapert: {
    nombre: "Malapert Massif",
    codigo: "SITE 23",
    elevacion: "Data/Site23_final_adj_5mpp_surf.tif",
    pendiente: "Data/Site23_final_adj_5mpp_slp.tif",
    errorElevacion: "Data/Site23_final_adj_5mpp_toterr.tif",
    errorPendiente: "Data/Site23_final_adj_5mpp_slperr.tif"
}
};

const MAX_MAP_SIZE = 1034;

let datosElevacionActual = null;
let datosPendienteActual = null;

// ======================================================
// 1. LECTURA GEOTIFF
// ======================================================

async function leerGeoTIFF(ruta) {
    const respuesta = await fetch(ruta);

    if (!respuesta.ok) {
        throw new Error(`HTTP ${respuesta.status}: ${ruta}`);
    }

    const archivo = await fromArrayBuffer(
        await respuesta.arrayBuffer()
    );

    const imagen = await archivo.getImage();

    const anchoOriginal = imagen.getWidth();
    const altoOriginal = imagen.getHeight();

    const factor = Math.min(
        1,
        MAX_MAP_SIZE / Math.max(anchoOriginal, altoOriginal)
    );

    const ancho = Math.max(1, Math.round(anchoOriginal * factor));
    const alto = Math.max(1, Math.round(altoOriginal * factor));
    const resolucionOriginal = imagen.getResolution();
    const resolucionOriginalXMetros = Math.abs(resolucionOriginal[0]);
    const resolucionOriginalYMetros = Math.abs(resolucionOriginal[1]);

    const valores = await imagen.readRasters({
        samples: [0],
        width: ancho,
        height: alto,
        interleave: true
    });

    const nodata = imagen.getGDALNoData();

    let minimo = Infinity;
    let maximo = -Infinity;
    let suma = 0;
    let muestras = 0;

    for (const dato of valores) {
        const valor = Number(dato);

        if (!pixelValido(valor, nodata)) continue;

        minimo = Math.min(minimo, valor);
        maximo = Math.max(maximo, valor);
        suma += valor;
        muestras++;
    }

    if (!muestras) {
        throw new Error("No existen píxeles válidos en " + ruta);
    }

    return {
        valores,
        ancho,
        alto,
        anchoOriginal,
        altoOriginal,
        resolucionOriginalXMetros,
        resolucionOriginalYMetros,
        resolucionAnalisisXMetros:
            resolucionOriginalXMetros * anchoOriginal / ancho,
        resolucionAnalisisYMetros:
            resolucionOriginalYMetros * altoOriginal / alto,
        minimo,
        maximo,
        promedio: suma / muestras,
        muestras,
        nodata,
        ruta
    };
}

// ======================================================
// 2. VALIDACION
// ======================================================

function pixelValido(valor, nodata) {
    return Number.isFinite(valor) &&
        Math.abs(valor) <= 1000000 &&
        !(nodata !== null &&
          nodata !== undefined &&
          valor === nodata);
}

// ======================================================
// 3. COLORES
// ======================================================

function interpolarColor(a, b, t) {
    return a.map((valor, i) =>
        Math.round(valor + (b[i] - valor) * t)
    );
}

function obtenerColor(valor, minimo, maximo, tipo) {
    const t = maximo === minimo
        ? 0.5
        : Math.max(0, Math.min(1,
            (valor - minimo) / (maximo - minimo)
        ));

    const colores = tipo === "elevacion"
        ? [
            [10,25,80],
            [20,105,170],
            [65,190,195],
            [220,190,120],
            [255,245,220]
        ]
        : [
            [20,145,95],
            [150,190,65],
            [245,190,45],
            [225,90,35],
            [145,35,45]
        ];

    const posicion = t * (colores.length - 1);
    const indice = Math.min(
        Math.floor(posicion),
        colores.length - 2
    );

    return interpolarColor(
        colores[indice],
        colores[indice + 1],
        posicion - indice
    );
}

// ======================================================
// 4. DIBUJAR MAPAS
// ======================================================

function dibujarMapa(canvasId, datos, tipo) {
    const canvas = document.getElementById(canvasId);

    if (!canvas) {
        throw new Error("No se encontró " + canvasId);
    }

    const contexto = canvas.getContext("2d");

    canvas.width = datos.ancho;
    canvas.height = datos.alto;

    const imagen = contexto.createImageData(
        datos.ancho,
        datos.alto
    );

    for (let i = 0; i < datos.valores.length; i++) {
        const valor = Number(datos.valores[i]);
        const p = i * 4;

        if (!pixelValido(valor, datos.nodata)) {
            imagen.data[p + 3] = 0;
            continue;
        }

        const color = obtenerColor(
            valor,
            datos.minimo,
            datos.maximo,
            tipo
        );

        imagen.data[p] = color[0];
        imagen.data[p + 1] = color[1];
        imagen.data[p + 2] = color[2];
        imagen.data[p + 3] = 255;
    }

    contexto.putImageData(imagen, 0, 0);
}

// ======================================================
// 5. FORMATO
// ======================================================

function formato(numero) {
    return numero.toLocaleString("es-MX", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatoPorcentaje(numero) {
    return formato(numero) + "%";
}

// ======================================================
// 6. ESTADISTICAS GENERALES
// ======================================================

function analizarPendientes(datos) {
    const clases = {
        baja: 0,
        intermedia: 0,
        alta: 0
    };

    let total = 0;

    for (const dato of datos.valores) {
        const valor = Number(dato);

        if (!pixelValido(valor, datos.nodata) || valor < 0) {
            continue;
        }

        if (valor < 5) clases.baja++;
        else if (valor <= 15) clases.intermedia++;
        else clases.alta++;

        total++;
    }

    if (!total) {
        throw new Error("No hay muestras válidas de pendiente.");
    }

    return {
        porcentajeBajo: clases.baja / total * 100,
        porcentajeIntermedio: clases.intermedia / total * 100,
        porcentajeAlto: clases.alta / total * 100,
        total
    };
}

function analizarVariabilidad(datos) {
    let suma = 0;
    let muestras = 0;

    for (let y = 1; y < datos.alto - 1; y++) {
        for (let x = 1; x < datos.ancho - 1; x++) {
            const vecinos = [];

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const i = (y + dy) * datos.ancho + x + dx;
                    const valor = Number(datos.valores[i]);

                    if (pixelValido(valor, datos.nodata)) {
                        vecinos.push(valor);
                    }
                }
            }

            if (vecinos.length < 5) continue;

            suma += Math.max(...vecinos) - Math.min(...vecinos);
            muestras++;
        }
    }

    return {
        promedio: muestras ? suma / muestras : null,
        muestras
    };
}
// ======================================================
// ANALISIS DE RUGOSIDAD REGIONAL
// ======================================================

function analizarRugosidadRegional(datos, r) {

    let suma = 0;
    let muestras = 0;

    for (let y = Math.max(1, r.y1);
         y < Math.min(datos.alto - 1, r.y2);
         y++) {

        for (let x = Math.max(1, r.x1);
             x < Math.min(datos.ancho - 1, r.x2);
             x++) {

            const vecinos = [];

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {

                    const i =
                        (y + dy) * datos.ancho + (x + dx);

                    const valor = Number(datos.valores[i]);

                    if (pixelValido(valor, datos.nodata)) {
                        vecinos.push(valor);
                    }
                }
            }

            if (vecinos.length < 5) continue;

            const diferencia =
                Math.max(...vecinos) - Math.min(...vecinos);

            suma += diferencia;
            muestras++;
        }
    }

    return {
        promedio: muestras ? suma / muestras : null,
        muestras
    };
}
// ======================================================
// DETECCION DE POSIBLES OBSTACULOS TOPOGRAFICOS
// ======================================================

function detectarObstaculos(datos, r) {

    const UMBRAL_RELIEVE = 10; // metros, valor exploratorio

    let candidatos = 0;
    let mayorRelieve = 0;
    let sumaRelieve = 0;
    let muestras = 0;
    const marcadores = [];

    const xInicio = Math.max(1, r.x1);
    const yInicio = Math.max(1, r.y1);

    const xFinal = Math.min(datos.ancho - 1, r.x2);
    const yFinal = Math.min(datos.alto - 1, r.y2);

    for (let y = yInicio; y < yFinal; y++) {

        for (let x = xInicio; x < xFinal; x++) {

            const vecinos = [];

            for (let dy = -1; dy <= 1; dy++) {

                for (let dx = -1; dx <= 1; dx++) {

                    const indice =
                        (y + dy) * datos.ancho + (x + dx);

                    const valor = Number(datos.valores[indice]);

                    if (pixelValido(valor, datos.nodata)) {
                        vecinos.push(valor);
                    }
                }
            }

            if (vecinos.length < 9) continue;

            const relieve =
                Math.max(...vecinos) - Math.min(...vecinos);

            sumaRelieve += relieve;
            muestras++;

            if (relieve >= UMBRAL_RELIEVE) {
                candidatos++;
                if (
                    marcadores.length < 250 &&
                    x % 8 === 0 &&
                    y % 8 === 0
                ) {
                    marcadores.push({ x, y });
                }
            }

            mayorRelieve = Math.max(mayorRelieve, relieve);
        }
    }

    return {
        candidatos,
        mayorRelieve,
        promedio: muestras ? sumaRelieve / muestras : null,
        muestras,
        umbral: UMBRAL_RELIEVE,
        marcadores
    };
}

function detectarDepresiones(datos, r, errorElevacionMedio) {
    const RADIO_MUESTRAS = 2;
    const PASO_CENTROS = 3;
    const UMBRAL_PROFUNDIDAD = Math.max(3, errorElevacionMedio * 3);
    const marcadores = [];
    let candidatas = 0;
    let profundidadMaxima = 0;

    for (let y = Math.max(RADIO_MUESTRAS, r.y1);
         y < Math.min(datos.alto - RADIO_MUESTRAS, r.y2);
         y += PASO_CENTROS) {

        for (let x = Math.max(RADIO_MUESTRAS, r.x1);
             x < Math.min(datos.ancho - RADIO_MUESTRAS, r.x2);
             x += PASO_CENTROS) {

            const centro = Number(datos.valores[y * datos.ancho + x]);
            if (!pixelValido(centro, datos.nodata)) continue;

            let sumaAnillo = 0;
            let muestrasAnillo = 0;
            const sectores = Array.from(
                { length: 8 },
                () => ({ suma: 0, muestras: 0 })
            );
            let anilloValido = true;

            for (let dy = -RADIO_MUESTRAS; dy <= RADIO_MUESTRAS; dy++) {
                for (let dx = -RADIO_MUESTRAS; dx <= RADIO_MUESTRAS; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== RADIO_MUESTRAS) {
                        continue;
                    }

                    const valor = Number(
                        datos.valores[(y + dy) * datos.ancho + x + dx]
                    );
                    if (!pixelValido(valor, datos.nodata)) {
                        anilloValido = false;
                        break;
                    }

                    const sector = Math.floor(
                        (Math.atan2(dy, dx) + Math.PI) / (Math.PI / 4)
                    ) % 8;
                    sectores[sector].suma += valor;
                    sectores[sector].muestras++;
                    sumaAnillo += valor;
                    muestrasAnillo++;
                }
                if (!anilloValido) break;
            }

            if (!anilloValido || !muestrasAnillo) continue;

            const mediaAnillo = sumaAnillo / muestrasAnillo;
            const profundidad = mediaAnillo - centro;
            if (profundidad < UMBRAL_PROFUNDIDAD) continue;

            const sectoresElevados = sectores.filter(sector =>
                sector.muestras &&
                sector.suma / sector.muestras - centro >= UMBRAL_PROFUNDIDAD / 2
            ).length;

            if (sectoresElevados < 6) continue;

            candidatas++;
            profundidadMaxima = Math.max(profundidadMaxima, profundidad);
            if (marcadores.length < 120) {
                marcadores.push({ x, y });
            }
        }
    }

    return {
        candidatas,
        profundidadMaxima,
        umbral: UMBRAL_PROFUNDIDAD,
        diametroMinimoAproximado:
            RADIO_MUESTRAS * 2 * datos.resolucionAnalisisXMetros,
        marcadores
    };
}
// ======================================================
// 7. SELECCION DE REGION RECTANGULAR
// ======================================================

function activarSeleccionRegional(
    elevacion,
    pendiente,
    errorElevacion,
    errorPendiente
) {
    const mapa = document.getElementById("mapa-elevacion");
    const capa = document.getElementById("seleccion-capa");
    const panel = document.getElementById("resultado-region");

    if (!mapa || !capa || !panel) return;

    const ctx = capa.getContext("2d");

    capa.width = elevacion.ancho;
    capa.height = elevacion.alto;

    let dibujando = false;
    let inicio = null;
    let final = null;
    let marcadoresObstaculos = [];
    let marcadoresDepresiones = [];

    function posicion(event) {
        const rect = capa.getBoundingClientRect();

        return {
            x: Math.max(0, Math.min(
                capa.width,
                (event.clientX - rect.left) *
                capa.width / rect.width
            )),
            y: Math.max(0, Math.min(
                capa.height,
                (event.clientY - rect.top) *
                capa.height / rect.height
            ))
        };
    }

    function rectangulo(a, b) {
        return {
            x1: Math.floor(Math.min(a.x, b.x)),
            y1: Math.floor(Math.min(a.y, b.y)),
            x2: Math.ceil(Math.max(a.x, b.x)),
            y2: Math.ceil(Math.max(a.y, b.y))
        };
    }

    function dibujarSeleccion() {
        ctx.clearRect(0, 0, capa.width, capa.height);

        if (!inicio || !final) return;

        const r = rectangulo(inicio, final);

        ctx.fillStyle = "rgba(53,201,255,0.18)";
        ctx.fillRect(r.x1, r.y1, r.x2-r.x1, r.y2-r.y1);

        ctx.strokeStyle = "#35c9ff";
        ctx.lineWidth = Math.max(
            2,
            capa.width / 500
        );

        ctx.strokeRect(
            r.x1, r.y1,
            r.x2-r.x1, r.y2-r.y1
        );

        function dibujarMarcadores(marcadores, color) {
            ctx.fillStyle = color;
            ctx.strokeStyle = "#071321";
            ctx.lineWidth = Math.max(1, capa.width / 1000);
            for (const marcador of marcadores) {
                ctx.beginPath();
                ctx.arc(
                    marcador.x,
                    marcador.y,
                    Math.max(3, capa.width / 300),
                    0,
                    Math.PI * 2
                );
                ctx.fill();
                ctx.stroke();
            }
        }

        dibujarMarcadores(marcadoresDepresiones, "#35c9ff");
        dibujarMarcadores(marcadoresObstaculos, "#ff8178");
    }

    function calcularRegion(r) {
        const estadisticas = {
    elevacion: { min: Infinity, max: -Infinity, suma: 0, n: 0 },
    pendiente: { min: Infinity, max: -Infinity, suma: 0, n: 0 },

    errorElevacion: {
        min: Infinity,
        max: -Infinity,
        suma: 0,
        n: 0
    },

    errorPendiente: {
        min: Infinity,
        max: -Infinity,
        suma: 0,
        n: 0
    },

    clases: { baja: 0, intermedia: 0, alta: 0 }
};

        const x1 = Math.max(0, r.x1);
        const y1 = Math.max(0, r.y1);
        const x2 = Math.min(elevacion.ancho, r.x2);
        const y2 = Math.min(elevacion.alto, r.y2);
// Cobertura total de la región seleccionada
estadisticas.totalPixelesRegion =
    (x2 - x1) * (y2 - y1);
        for (let y = y1; y < y2; y++) {
            for (let x = x1; x < x2; x++) {
                const i = y * elevacion.ancho + x;
                const z = Number(elevacion.valores[i]);

                if (pixelValido(z, elevacion.nodata)) {
                    const e = estadisticas.elevacion;
                    e.min = Math.min(e.min, z);
                    e.max = Math.max(e.max, z);
                    e.suma += z;
                    e.n++;
                }

                // Se transforma la posición a las dimensiones
                // del raster de pendiente si son diferentes.
                const px = Math.min(
                    pendiente.ancho - 1,
                    Math.floor(x * pendiente.ancho / elevacion.ancho)
                );

                const py = Math.min(
                    pendiente.alto - 1,
                    Math.floor(y * pendiente.alto / elevacion.alto)
                );

                const p = Number(
                    pendiente.valores[py * pendiente.ancho + px]
                );

                
// Estadísticas de pendiente
if (pixelValido(p, pendiente.nodata) && p >= 0) {

    const s = estadisticas.pendiente;

    s.min = Math.min(s.min, p);
    s.max = Math.max(s.max, p);
    s.suma += p;
    s.n++;

    if (p < 5) {
        estadisticas.clases.baja++;
    } else if (p <= 15) {
        estadisticas.clases.intermedia++;
    } else {
        estadisticas.clases.alta++;
    }
}
                

                // Incertidumbre de elevación
const ex = Math.min(
    errorElevacion.ancho - 1,
    Math.floor(x * errorElevacion.ancho / elevacion.ancho)
);

const ey = Math.min(
    errorElevacion.alto - 1,
    Math.floor(y * errorElevacion.alto / elevacion.alto)
);

const valorErrorE = Number(
    errorElevacion.valores[
        ey * errorElevacion.ancho + ex
    ]
);

if (
    pixelValido(valorErrorE, errorElevacion.nodata) &&
    valorErrorE >= 0
) {
    const e = estadisticas.errorElevacion;

    e.min = Math.min(e.min, valorErrorE);
    e.max = Math.max(e.max, valorErrorE);
    e.suma += valorErrorE;
    e.n++;
}

// Incertidumbre de pendiente
const sx = Math.min(
    errorPendiente.ancho - 1,
    Math.floor(x * errorPendiente.ancho / elevacion.ancho)
);

const sy = Math.min(
    errorPendiente.alto - 1,
    Math.floor(y * errorPendiente.alto / elevacion.alto)
);

const valorErrorP = Number(
    errorPendiente.valores[
        sy * errorPendiente.ancho + sx
    ]
);

if (
    pixelValido(valorErrorP, errorPendiente.nodata) &&
    valorErrorP >= 0
) {
    const p = estadisticas.errorPendiente;

    p.min = Math.min(p.min, valorErrorP);
    p.max = Math.max(p.max, valorErrorP);
    p.suma += valorErrorP;
    p.n++;
}
            }
        }

        const rugosidad = analizarRugosidadRegional(elevacion, r);

        const obstaculos = detectarObstaculos(elevacion, r);
        const errorMedioElevacion = estadisticas.errorElevacion.n
            ? estadisticas.errorElevacion.suma / estadisticas.errorElevacion.n
            : 0;
        const depresiones = detectarDepresiones(
            elevacion,
            r,
            errorMedioElevacion
        );
        marcadoresObstaculos = obstaculos.marcadores;
        marcadoresDepresiones = depresiones.marcadores;
        dibujarSeleccion();

        mostrarEstadisticasRegion(
            estadisticas,
            r,
            rugosidad,
            obstaculos,
            depresiones
        );
    }

    function mostrarEstadisticasRegion(
        d,
        r,
        rugosidad,
        obstaculos,
        depresiones
    ) {

    const e = d.elevacion;
    const p = d.pendiente;
    const ee = d.errorElevacion;
    const ep = d.errorPendiente;

    const total = d.totalPixelesRegion;

    const promedioE = e.n ? e.suma / e.n : null;
    const promedioP = p.n ? p.suma / p.n : null;

    const promedioEE = ee.n ? ee.suma / ee.n : null;
    const promedioEP = ep.n ? ep.suma / ep.n : null;

    const porcentaje = cantidad =>
        p.n ? cantidad / p.n * 100 : 0;

    const cobertura = cantidad =>
        total ? cantidad / total * 100 : 0;

    panel.innerHTML = `
        <div class="region-result">

            <p class="eyebrow">NASA LOLA / REGIONAL ANALYSIS</p>
            <h3>Resultados de la región seleccionada</h3>

            <p>Coordenadas raster:
            X ${r.x1}–${r.x2},
            Y ${r.y1}–${r.y2}</p>

            <h4>01 / Elevación</h4>

            <p>Mínima: ${e.n ? formato(e.min) + " m" : "No disponible"}</p>
            <p>Máxima: ${e.n ? formato(e.max) + " m" : "No disponible"}</p>
            <p>Rango de elevación: ${e.n ? formato(e.max - e.min) + " m" : "No disponible"}</p>
            <p>Promedio: ${promedioE !== null ? formato(promedioE) + " m" : "No disponible"}</p>
            <p>Muestras válidas: ${e.n}</p>
            <p>Área planimétrica aproximada:
            ${formato((r.x2 - r.x1) * elevacion.resolucionAnalisisXMetros)} ×
            ${formato((r.y2 - r.y1) * elevacion.resolucionAnalisisYMetros)} m</p>

            <h4>02 / Pendiente</h4>

            <p>Mínima: ${p.n ? formato(p.min) + "°" : "No disponible"}</p>
            <p>Máxima: ${p.n ? formato(p.max) + "°" : "No disponible"}</p>
            <p>Promedio: ${promedioP !== null ? formato(promedioP) + "°" : "No disponible"}</p>
            <p>Muestras válidas: ${p.n}</p>

            <h4>03 / Distribución de pendientes</h4>

            <div class="metricas-avanzadas">
                <div class="metrica">
                    <span>Pendiente baja</span>
                    <strong>${formatoPorcentaje(porcentaje(d.clases.baja))}</strong>
                    <small>Menor de 5°</small>
                </div>

                <div class="metrica">
                    <span>Pendiente intermedia</span>
                    <strong>${formatoPorcentaje(porcentaje(d.clases.intermedia))}</strong>
                    <small>De 5° a 15°</small>
                </div>

                <div class="metrica">
                    <span>Pendiente alta</span>
                    <strong>${formatoPorcentaje(porcentaje(d.clases.alta))}</strong>
                    <small>Mayor de 15°</small>
                </div>
            </div>

            <h4>04 / Calidad y cobertura</h4>

            <p>Píxeles totales: ${total}</p>

            <p>Cobertura de elevación:
            ${formatoPorcentaje(cobertura(e.n))}</p>

            <p>Cobertura de pendiente:
            ${formatoPorcentaje(cobertura(p.n))}</p>

            <h4>05 / Incertidumbre topográfica</h4>

            <p><strong>Error total de elevación</strong></p>
            <p>Mínimo: ${ee.n ? formato(ee.min) + " m" : "No disponible"}</p>
            <p>Máximo: ${ee.n ? formato(ee.max) + " m" : "No disponible"}</p>
            <p>Promedio: ${promedioEE !== null ? formato(promedioEE) + " m" : "No disponible"}</p>
            <p>Muestras válidas: ${ee.n}</p>

            <p><strong>Error de pendiente</strong></p>
            <p>Mínimo: ${ep.n ? formato(ep.min) + "°" : "No disponible"}</p>
            <p>Máximo: ${ep.n ? formato(ep.max) + "°" : "No disponible"}</p>
            <p>Promedio: ${promedioEP !== null ? formato(promedioEP) + "°" : "No disponible"}</p>
            <p>Muestras válidas: ${ep.n}</p>

            <h4>06 / Rugosidad regional</h4>

            <p>Variabilidad media:
            ${rugosidad.promedio !== null
                ? formato(rugosidad.promedio) + " m"
                : "No disponible"}</p>

            <p>Muestras: ${rugosidad.muestras}</p>

            <h4>07 / Posibles cráteres y obstáculos</h4>

            <p>Depresiones con patrón aproximadamente circular:
            ${depresiones.candidatas} ventanas candidatas</p>
            <p>Profundidad relativa máxima:
            ${formato(depresiones.profundidadMaxima)} m</p>
            <p>Escala mínima aproximada del patrón:
            ${formato(depresiones.diametroMinimoAproximado)} m</p>

            <p>Píxeles candidatos con relieve ≥ ${obstaculos.umbral} m
            en vecindad 3 × 3: ${obstaculos.candidatos}</p>
            <p>Mayor relieve local: ${formato(obstaculos.mayorRelieve)} m</p>
            <p>Relieve medio local:
            ${obstaculos.promedio !== null
                ? formato(obstaculos.promedio) + " m"
                : "No disponible"}</p>

            <small>
                Los marcadores son indicios exploratorios, no objetos únicos.
                El patrón de depresión no confirma un cráter: la resolución,
                la pendiente y la incertidumbre pueden producir falsos positivos.
            </small>

        </div>
    `;
}

    capa.addEventListener("pointerdown", event => {
        event.preventDefault();
        dibujando = true;
        inicio = posicion(event);
        final = inicio;
        capa.setPointerCapture(event.pointerId);
        dibujarSeleccion();
    });

    capa.addEventListener("pointermove", event => {
        if (!dibujando) return;
        final = posicion(event);
        dibujarSeleccion();
    });

    capa.addEventListener("pointerup", event => {
        if (!dibujando) return;

        dibujando = false;
        final = posicion(event);
        dibujarSeleccion();

        const r = rectangulo(inicio, final);

        if (r.x2 - r.x1 < 2 || r.y2 - r.y1 < 2) {
            panel.textContent = "Selecciona una región rectangular más grande.";
            return;
        }

        calcularRegion(r);
    });

    capa.addEventListener("pointercancel", () => {
        dibujando = false;
    });

    document.getElementById("limpiar-region")
        ?.addEventListener("click", () => {
            ctx.clearRect(0, 0, capa.width, capa.height);
            inicio = null;
            final = null;
            marcadoresObstaculos = [];
            marcadoresDepresiones = [];
            panel.textContent = "Selecciona una nueva región sobre el mapa.";
        });
}

// ======================================================
// 8. ELEMENTOS HTML
// ======================================================

const selector = document.getElementById("topografia-site");
const boton = document.getElementById("cargar-topografia");
const resultado = document.getElementById("topografia-result");

function mostrarMensaje(mensaje) {
    if (resultado) resultado.textContent = mensaje;
}

// ======================================================
// 9. ANALISIS DEL SITIO
// ======================================================

async function analizarSitio() {
    if (!selector || !boton || !resultado) return;

    const sitio = archivosSitios[selector.value];

    if (!sitio) {
        mostrarMensaje("Selecciona un sitio válido.");
        return;
    }

    boton.disabled = true;
    boton.textContent = "Procesando...";
    mostrarMensaje("Procesando GeoTIFF regionales NASA/LOLA...");

    try {
        const [
    elevacion,
    pendiente,
    errorElevacion,
    errorPendiente
] = await Promise.all([
    leerGeoTIFF(sitio.elevacion),
    leerGeoTIFF(sitio.pendiente),
    leerGeoTIFF(sitio.errorElevacion),
    leerGeoTIFF(sitio.errorPendiente)
]);

        datosElevacionActual = elevacion;
        datosPendienteActual = pendiente;

        const distribucion = analizarPendientes(pendiente);
        const variabilidad = analizarVariabilidad(elevacion);

        resultado.innerHTML = `
            <div class="topografia-card">
                <h3>${sitio.nombre}</h3>
                <p class="topografia-codigo">${sitio.codigo} | NASA LOLA</p>

                <h4>01 / MAPA DE ELEVACIÓN</h4>
                <div class="mapa-wrapper">
                    <canvas id="mapa-elevacion" class="mapa-raster"></canvas>
                    <canvas id="seleccion-capa" class="seleccion-capa"></canvas>
                </div>

                <p class="instruccion-region">
                        Arrastra sobre el mapa para seleccionar una región rectangular.
                </p>
                    <div class="topografia-feature-legend">
                        <span><i class="feature-depression"></i> Depresión circular candidata</span>
                        <span><i class="feature-obstacle"></i> Relieve abrupto candidato</span>
                    </div>

                <button id="limpiar-region" class="limpiar-region">
                    Limpiar selección
                </button>

                <div id="resultado-region" class="consulta-panel">
                    Selecciona una región para calcular sus estadísticas.
                </div>

                <div class="leyenda elevacion-leyenda">
                    <span>${formato(elevacion.minimo)} m</span>
                    <span>${formato(elevacion.maximo)} m</span>
                </div>

                <p>Elevación mínima: <strong>${formato(elevacion.minimo)} m</strong></p>
                <p>Elevación máxima: <strong>${formato(elevacion.maximo)} m</strong></p>
                <p>Diferencia de elevación (máximo − mínimo):
                    <strong>${formato(elevacion.maximo - elevacion.minimo)} m</strong>
                </p>
                <p>Elevación promedio: <strong>${formato(elevacion.promedio)} m</strong></p>

                <h4>02 / MAPA DE PENDIENTE</h4>
                <canvas id="mapa-pendiente" class="mapa-raster"></canvas>

                <div class="consulta-panel">
                    La pendiente se consulta también al seleccionar una región del mapa de elevación.
                </div>

                <div class="leyenda pendiente-leyenda">
                    <span>${formato(pendiente.minimo)}°</span>
                    <span>${formato(pendiente.maximo)}°</span>
                </div>

                <p>Pendiente mínima: <strong>${formato(pendiente.minimo)}°</strong></p>
                <p>Pendiente máxima: <strong>${formato(pendiente.maximo)}°</strong></p>
                <p>Pendiente promedio: <strong>${formato(pendiente.promedio)}°</strong></p>

                <h4>03 / DISTRIBUCIÓN GENERAL DE PENDIENTES</h4>
                <div class="metricas-avanzadas">
                    <div class="metrica">
                        <span>Pendiente baja</span>
                        <strong>${formatoPorcentaje(distribucion.porcentajeBajo)}</strong>
                        <small>Menor de 5°</small>
                    </div>
                    <div class="metrica">
                        <span>Pendiente intermedia</span>
                        <strong>${formatoPorcentaje(distribucion.porcentajeIntermedio)}</strong>
                        <small>De 5° a 15°</small>
                    </div>
                    <div class="metrica">
                        <span>Pendiente alta</span>
                        <strong>${formatoPorcentaje(distribucion.porcentajeAlto)}</strong>
                        <small>Mayor de 15°</small>
                    </div>
                </div>

                <h4>04 / RUGOSIDAD SUPERFICIAL</h4>
                <p>Rango medio de elevación en vecindades de 3 × 3 muestras
                    (escala de muestra ${formato(elevacion.resolucionAnalisisXMetros)} ×
                    ${formato(elevacion.resolucionAnalisisYMetros)} m):</p>
                <p><strong>${variabilidad.promedio === null ? "No disponible" : formato(variabilidad.promedio) + " m"}</strong></p>
                <p>Muestras analizadas: ${variabilidad.muestras}</p>

                <h4>05 / INCERTIDUMBRE TOPOGRÁFICA</h4>
                <p>Error total de elevación medio:
                    <strong>${formato(errorElevacion.promedio)} m</strong>
                    (rango ${formato(errorElevacion.minimo)}–${formato(errorElevacion.maximo)} m)
                </p>
                <p>Error de pendiente medio:
                    <strong>${formato(errorPendiente.promedio)}°</strong>
                    (rango ${formato(errorPendiente.minimo)}–${formato(errorPendiente.maximo)}°)
                </p>
                <p>Las incertidumbres regionales y su cobertura se calculan
                    al seleccionar una zona del mapa.</p>

                <h4>06 / INFORMACIÓN DE LOS RASTERS</h4>
                <p>Elevación original: ${elevacion.anchoOriginal} × ${elevacion.altoOriginal}</p>
                <p>Pendiente original: ${pendiente.anchoOriginal} × ${pendiente.altoOriginal}</p>
                <p>Resolución visual de elevación: ${elevacion.ancho} × ${elevacion.alto}</p>
                <p>Resolución visual de pendiente: ${pendiente.ancho} × ${pendiente.alto}</p>
                <p>Resolución nativa: ${formato(elevacion.resolucionOriginalXMetros)} ×
                    ${formato(elevacion.resolucionOriginalYMetros)} m/píxel</p>
                <p>Muestras válidas de elevación: ${elevacion.muestras}</p>
                <p>Muestras válidas de pendiente: ${pendiente.muestras}</p>
                <p class="topografia-nota">
                    Las imágenes se remuestrean para su visualización.
                    Las estadísticas generales y de rugosidad usan la retícula
                    remuestreada indicada arriba. Las estadísticas regionales
                    se calculan dentro del rectángulo seleccionado. El análisis
                    de obstáculos es exploratorio y no sustituye una revisión
                    geomorfológica detallada.
                </p>
            </div>
        `;

        dibujarMapa("mapa-elevacion", elevacion, "elevacion");
        dibujarMapa("mapa-pendiente", pendiente, "pendiente");
        activarSeleccionRegional(
    elevacion,
    pendiente,
    errorElevacion,
    errorPendiente
);

        console.log("MEVILLE MOON: análisis completado", sitio.nombre);

    } catch (error) {
        console.error(error);

        mostrarMensaje(
            "No se pudieron generar los mapas. Revisa la carpeta Data y los GeoTIFF. Detalle: " +
            error.message
        );
    } finally {
        boton.disabled = false;
        boton.textContent = "Analizar topografía";
    }
    }

// ======================================================
// 10. EVENTOS
// ======================================================

if (selector && boton && resultado) {
    if (window.location.protocol === "file:") {
        boton.disabled = true;
        mostrarMensaje(
            "Los mapas requieren el servidor local para leer los GeoTIFF. " +
            "Cierra esta página, ejecuta iniciar_programa.bat y abre " +
            "http://127.0.0.1:8000."
        );
    } else {
        boton.addEventListener("click", analizarSitio);
    }
    console.log("MEVILLE MOON: módulo topográfico iniciado.");
} else {
    console.error("Faltan elementos HTML del módulo topográfico.");
}