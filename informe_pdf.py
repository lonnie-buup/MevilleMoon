from io import BytesIO
import math
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _text(data: dict, key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError("Los resultados de iluminación no tienen un formato válido.")
    return value


def _number(data: dict, key: str) -> float:
    value = data.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Los resultados de iluminación no tienen un formato válido.")
    if not math.isfinite(value):
        raise ValueError("Los resultados de iluminación no tienen un formato válido.")
    return float(value)


def _paragraph(value: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(value), style)


def build_solar_illumination_pdf(data: dict) -> bytes:
    if not isinstance(data, dict):
        raise ValueError("Los resultados de iluminación no tienen un formato válido.")

    site = _text(data, "site")
    site_key = _text(data, "siteKey")
    start_utc = _text(data, "startUtc")
    end_utc = _text(data, "endUtc")
    ephemeris = _text(data, "ephemeris")
    terrain_model = _text(data, "terrainModel")
    illumination_definition = _text(data, "illuminationDefinition")
    latitude = _number(data, "latitude")
    longitude = _number(data, "longitude")
    elevation = _number(data, "groundElevationMeters")
    duration_days = _number(data, "durationDays")
    sample_minutes = _number(data, "sampleMinutes")
    sunlit_hours = _number(data, "sunlitHours")
    shadow_hours = _number(data, "shadowHours")
    sunlit_percent = _number(data, "sunlitPercent")
    samples = data.get("samples")
    if (
        not isinstance(samples, list)
        or not samples
        or len(samples) > 1500
        or site_key not in {"shackleton", "degerlache", "malapert"}
    ):
        raise ValueError("Los resultados de iluminación no tienen un formato válido.")

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="ReportTitle",
            parent=styles["Title"],
            alignment=TA_CENTER,
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=22,
            textColor=colors.HexColor("#075985"),
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ReportBody",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8,
            leading=11,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ReportCell",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=7,
            leading=9,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ReportHeader",
            parent=styles["ReportCell"],
            fontName="Helvetica-Bold",
            textColor=colors.white,
        )
    )

    output = BytesIO()
    document = SimpleDocTemplate(
        output,
        pagesize=landscape(A4),
        rightMargin=12 * mm,
        leftMargin=12 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title=f"Meville Moon - Iluminacion solar - {site}",
        author="Meville Moon",
    )
    story = [
        _paragraph("Informe de iluminacion solar - Meville Moon", styles["ReportTitle"]),
        _paragraph("Resumen del analisis", styles["Heading2"]),
    ]

    summary = [
        ("Region", site),
        ("Coordenadas lunares", f"{latitude:.4f}°, {longitude:.4f}°"),
        ("Elevacion del sitio", f"{elevation:.2f} m"),
        ("Periodo UTC", f"{start_utc} - {end_utc}"),
        ("Duracion", f"{duration_days:.2f} dias"),
        ("Sol directo", f"{sunlit_hours:.2f} h ({sunlit_percent:.2f}%)"),
        ("Sombra", f"{shadow_hours:.2f} h"),
        ("Muestras", f"{len(samples)} cada {sample_minutes:g} min"),
        ("Efemerides", ephemeris),
        ("Modelo del terreno", terrain_model),
        ("Criterio", illumination_definition),
    ]
    summary_table = Table(
        [
            [_paragraph(label, styles["ReportCell"]), _paragraph(value, styles["ReportCell"])]
            for label, value in summary
        ],
        colWidths=[42 * mm, 225 * mm],
        hAlign="LEFT",
    )
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eaf3f8")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.extend(
        [
            summary_table,
            Spacer(1, 8),
            _paragraph("Distribucion temporal - muestras", styles["Heading2"]),
        ]
    )

    headers = ("Fecha UTC", "Elevacion solar", "Horizonte", "Azimut solar", "Condicion")
    table_rows = [[_paragraph(value, styles["ReportHeader"]) for value in headers]]
    for sample in samples:
        if not isinstance(sample, dict):
            raise ValueError("Los resultados de iluminación no tienen un formato válido.")
        time = _text(sample, "time")
        sun_elevation = _number(sample, "sunElevationDeg")
        terrain_horizon = _number(sample, "terrainHorizonDeg")
        sun_azimuth = _number(sample, "sunAzimuthDeg")
        sunlit = sample.get("sunlit")
        if not isinstance(sunlit, bool):
            raise ValueError("Los resultados de iluminación no tienen un formato válido.")
        table_rows.append(
            [
                _paragraph(time, styles["ReportCell"]),
                f"{sun_elevation:.3f}°",
                f"{terrain_horizon:.3f}°",
                f"{sun_azimuth:.3f}°",
                "Sol directo" if sunlit else "Sombra",
            ]
        )

    samples_table = LongTable(
        table_rows,
        colWidths=[66 * mm, 43 * mm, 43 * mm, 43 * mm, 45 * mm],
        repeatRows=1,
        hAlign="LEFT",
    )
    samples_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#075985")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(samples_table)

    def draw_page_number(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#64748b"))
        canvas.drawRightString(
            doc.pagesize[0] - doc.rightMargin,
            7 * mm,
            f"Pagina {doc.page}",
        )
        canvas.restoreState()

    document.build(story, onFirstPage=draw_page_number, onLaterPages=draw_page_number)
    return output.getvalue()
