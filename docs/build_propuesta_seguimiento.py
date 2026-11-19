from pathlib import Path
from textwrap import wrap

from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parent
ASSET_DIR = ROOT / "propuesta_mockups"
ASSET_DIR.mkdir(exist_ok=True)
DOCX_PATH = ROOT / "Propuesta_funcional_seguimiento_reglas_y_asignacion.docx"

NAVY = "14213D"
TEAL = "27879B"
TEAL_DARK = "17677A"
MINT = "EAF7F4"
PALE = "F4F7FA"
LINE = "D9E3E8"
TEXT = "243B45"
MUTED = "70868F"
AMBER = "E3A62F"
RED = "D65D68"
GREEN = "42A77D"
WHITE = "FFFFFF"


def font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


F12 = font(22)
F12B = font(22, True)
F14 = font(26)
F14B = font(26, True)
F18B = font(34, True)
F24B = font(46, True)
F30B = font(58, True)


def rr(draw, xy, radius=18, fill=WHITE, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=f"#{fill}", outline=f"#{outline}" if outline else None, width=width)


def txt(draw, xy, value, fnt=F12, color=TEXT, anchor=None):
    draw.text(xy, value, font=fnt, fill=f"#{color}", anchor=anchor)


def multiline(draw, xy, value, width_chars=55, fnt=F12, color=MUTED, spacing=8):
    lines = []
    for paragraph in value.split("\n"):
        lines.extend(wrap(paragraph, width_chars) or [""])
    draw.multiline_text(xy, "\n".join(lines), font=fnt, fill=f"#{color}", spacing=spacing)


def app_frame(title, subtitle):
    im = Image.new("RGB", (1600, 900), f"#{PALE}")
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 1600, 72), fill=f"#{NAVY}")
    rr(d, (32, 17, 72, 57), 10, TEAL)
    txt(d, (52, 37), "F", F14B, WHITE, "mm")
    txt(d, (92, 36), "Formularios Inteligentes", F14B, WHITE, "lm")
    txt(d, (1540, 36), "Portal de seguimiento", F12, "C8D6E0", "rm")
    txt(d, (74, 120), title, F30B, NAVY)
    txt(d, (76, 185), subtitle, F14, MUTED)
    return im, d


def mockup_tracking_search(path):
    im, d = app_frame("Consulta el estado de tu solicitud", "Ingresa el código recibido al completar el formulario")
    rr(d, (330, 260, 1270, 760), 28, WHITE, LINE, 2)
    rr(d, (735, 310, 865, 440), 30, MINT)
    d.ellipse((778, 353, 814, 389), outline=f"#{TEAL}", width=5)
    d.line((807, 382, 829, 404), fill=f"#{TEAL}", width=5)
    txt(d, (800, 485), "Seguimiento de solicitud", F24B, NAVY, "mm")
    txt(d, (800, 530), "Tu código no contiene información personal", F12, MUTED, "mm")
    txt(d, (485, 600), "CÓDIGO DE SEGUIMIENTO", F12B, MUTED)
    rr(d, (480, 635, 930, 705), 14, "F9FBFC", LINE, 2)
    txt(d, (510, 670), "FI-2026-00158", F14B, TEXT, "lm")
    rr(d, (950, 635, 1120, 705), 14, TEAL)
    txt(d, (1035, 670), "Consultar", F12B, WHITE, "mm")
    im.save(path)


def mockup_tracking_detail(path):
    im, d = app_frame("Seguimiento de solicitud", "Código FI-2026-00158")
    rr(d, (70, 235, 1530, 830), 24, WHITE, LINE, 2)
    txt(d, (115, 285), "Solicitud de instalación", F24B, NAVY)
    rr(d, (1210, 270, 1435, 325), 27, "FFF5DD")
    txt(d, (1322, 298), "En revisión", F12B, "916516", "mm")
    txt(d, (115, 350), "RECIBIDA", F12B, MUTED)
    txt(d, (115, 385), "5 de noviembre de 2026  10:42", F14, TEXT)
    txt(d, (115, 455), "Progreso", F18B, NAVY)
    x = 155
    y = 550
    steps = [
        ("OK", GREEN, "Ingresada", "5 nov  10:42"),
        ("OK", GREEN, "Asignada", "5 nov  11:05"),
        ("2", AMBER, "En revisión", "Responsable asignado"),
        ("", "C9D6DB", "Decisión", "Pendiente"),
        ("", "C9D6DB", "Finalizada", "Pendiente"),
    ]
    for i, (mark, color, label, detail) in enumerate(steps):
        if i < len(steps) - 1:
            d.line((x + 46, y, x + 250, y), fill=f"#{GREEN if i < 2 else 'D7E1E5'}", width=8)
        d.ellipse((x, y - 36, x + 72, y + 36), fill=f"#{color}")
        txt(d, (x + 36, y), mark, F14B, WHITE, "mm")
        txt(d, (x + 36, y + 70), label, F12B, TEXT, "mm")
        txt(d, (x + 36, y + 105), detail, F12, MUTED, "mm")
        x += 290
    rr(d, (110, 720, 1490, 795), 14, MINT)
    txt(d, (145, 757), "Última actualización", F12B, TEAL_DARK, "lm")
    txt(d, (385, 757), "Tu solicitud está siendo revisada por el equipo técnico", F12, TEXT, "lm")
    im.save(path)


def mockup_rule_builder(path):
    im, d = app_frame("Reglas del formulario", "Configura condiciones sin escribir código")
    rr(d, (70, 240, 1530, 820), 24, WHITE, LINE, 2)
    txt(d, (115, 285), "Regla 1", F18B, NAVY)
    rr(d, (1280, 265, 1420, 320), 25, MINT)
    txt(d, (1350, 293), "Activa", F12B, TEAL_DARK, "mm")
    txt(d, (115, 365), "SI", F12B, TEAL)
    rr(d, (175, 335, 650, 405), 12, "F9FBFC", LINE, 2)
    txt(d, (205, 370), "Tipo de instalación", F12B, TEXT, "lm")
    rr(d, (675, 335, 940, 405), 12, "F9FBFC", LINE, 2)
    txt(d, (705, 370), "es igual a", F12B, TEXT, "lm")
    rr(d, (965, 335, 1410, 405), 12, "F9FBFC", LINE, 2)
    txt(d, (995, 370), "Fibra óptica", F12B, TEXT, "lm")
    txt(d, (115, 465), "ENTONCES", F12B, TEAL)
    rr(d, (175, 435, 720, 505), 12, MINT, "B9DDD6", 2)
    txt(d, (205, 470), "Mostrar sección  Factibilidad técnica", F12B, TEAL_DARK, "lm")
    rr(d, (175, 530, 720, 600), 12, MINT, "B9DDD6", 2)
    txt(d, (205, 565), "Asignar departamento  Operaciones", F12B, TEAL_DARK, "lm")
    rr(d, (175, 625, 720, 695), 12, "FFF5DD", "EBD18E", 2)
    txt(d, (205, 660), "Establecer prioridad  Alta", F12B, "8A641B", "lm")
    rr(d, (115, 735, 340, 795), 12, TEAL)
    txt(d, (228, 765), "Guardar regla", F12B, WHITE, "mm")
    txt(d, (770, 545), "Vista previa del efecto", F18B, NAVY)
    rr(d, (770, 590, 1420, 705), 16, PALE, LINE, 2)
    txt(d, (810, 630), "ACTIVA  Sección visible para esta respuesta", F12B, GREEN)
    txt(d, (810, 672), "Operaciones  ·  Prioridad alta", F12, TEXT)
    im.save(path)


def mockup_assignment(path):
    im, d = app_frame("Bandeja de atención", "Responsables, prioridades y tiempos límite")
    rr(d, (70, 230, 1530, 820), 24, WHITE, LINE, 2)
    columns = [(105, "SOLICITUD"), (590, "RESPONSABLE"), (890, "PRIORIDAD"), (1090, "VENCIMIENTO"), (1370, "ESTADO")]
    for x, label in columns:
        txt(d, (x, 285), label, F12B, MUTED)
    d.line((100, 320, 1490, 320), fill=f"#{LINE}", width=2)
    rows = [
        ("FI-2026-00158", "Instalación residencial", "María López", "Alta", RED, "Hoy  16:00", RED, "En revisión"),
        ("FI-2026-00157", "Solicitud de contrato", "Carlos Méndez", "Media", AMBER, "Mañana", AMBER, "Ingresada"),
        ("FI-2026-00156", "Registro de proveedor", "Sin asignar", "Baja", GREEN, "8 nov", GREEN, "Ingresada"),
    ]
    y = 355
    for code, name, owner, priority, pcolor, due, dcolor, status in rows:
        rr(d, (95, y, 1505, y + 125), 14, "FBFCFD", LINE, 1)
        txt(d, (120, y + 40), code, F12B, TEAL)
        txt(d, (120, y + 80), name, F12, TEXT)
        txt(d, (600, y + 62), owner, F12B if owner != "Sin asignar" else F12, TEXT if owner != "Sin asignar" else MUTED)
        rr(d, (900, y + 35, 1030, y + 88), 25, "FFF0F1" if pcolor == RED else "FFF5DD" if pcolor == AMBER else MINT)
        txt(d, (965, y + 62), priority, F12B, pcolor, "mm")
        txt(d, (1100, y + 62), due, F12B, dcolor)
        txt(d, (1380, y + 62), status, F12B, TEXT)
        y += 145
    rr(d, (105, 755, 400, 805), 12, TEAL)
    txt(d, (252, 780), "+ Asignar responsable", F12B, WHITE, "mm")
    im.save(path)


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_border(cell, color=LINE, size="6"):
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = f"w:{edge}"
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:color"), color)


def set_cell_margins(cell, top=120, start=140, bottom=120, end=140):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for m, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{m}"))
        if node is None:
            node = OxmlElement(f"w:{m}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def add_page_number(paragraph):
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = paragraph.add_run("Página ")
    run.font.name = "Aptos"
    run.font.size = Pt(9)
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), "PAGE")
    paragraph._p.append(fld)


def add_bullet(doc, text):
    p = doc.add_paragraph(style="List Bullet")
    p.add_run(text)
    return p


def add_number(doc, text):
    p = doc.add_paragraph(style="List Number")
    p.add_run(text)
    return p


def add_table(doc, headers, rows, widths):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    for idx, header in enumerate(headers):
        cell = table.rows[0].cells[idx]
        cell.width = Inches(widths[idx])
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        set_cell_shading(cell, NAVY)
        set_cell_border(cell)
        set_cell_margins(cell)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(header)
        r.bold = True
        r.font.color.rgb = RGBColor(255, 255, 255)
        r.font.size = Pt(9.5)
    for ridx, row in enumerate(rows):
        cells = table.add_row().cells
        for idx, value in enumerate(row):
            cell = cells[idx]
            cell.width = Inches(widths[idx])
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            set_cell_shading(cell, "F5F8FA" if ridx % 2 else WHITE)
            set_cell_border(cell)
            set_cell_margins(cell)
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT if idx else WD_ALIGN_PARAGRAPH.CENTER
            r = p.add_run(value)
            r.font.size = Pt(9.2)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return table


def add_figure(doc, image_path, caption):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.keep_with_next = True
    p.add_run().add_picture(str(image_path), width=Inches(6.75))
    cap = doc.add_paragraph(caption)
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.paragraph_format.space_after = Pt(8)
    for run in cap.runs:
        run.italic = True
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(92, 111, 120)


def add_heading(doc, text, level=1):
    p = doc.add_heading(text, level=level)
    p.paragraph_format.keep_with_next = True
    return p


def build_document():
    mockups = {
        "search": ASSET_DIR / "01_consulta_codigo.png",
        "detail": ASSET_DIR / "02_detalle_seguimiento.png",
        "rules": ASSET_DIR / "03_constructor_reglas.png",
        "assignment": ASSET_DIR / "04_asignacion_plazos.png",
    }
    mockup_tracking_search(mockups["search"])
    mockup_tracking_detail(mockups["detail"])
    mockup_rule_builder(mockups["rules"])
    mockup_assignment(mockups["assignment"])

    doc = Document()
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.72)
    section.bottom_margin = Inches(0.68)
    section.left_margin = Inches(0.82)
    section.right_margin = Inches(0.82)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Aptos"
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = RGBColor.from_string(TEXT)
    normal.paragraph_format.space_after = Pt(7)
    normal.paragraph_format.line_spacing = 1.12
    title = styles["Title"]
    title.font.name = "Aptos Display"
    title.font.size = Pt(28)
    title.font.bold = True
    title.font.color.rgb = RGBColor(0, 0, 0)
    for style_name, size in (("Heading 1", 17), ("Heading 2", 13), ("Heading 3", 11)):
        style = styles[style_name]
        style.font.name = "Aptos Display"
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.paragraph_format.space_before = Pt(13 if style_name == "Heading 1" else 9)
        style.paragraph_format.space_after = Pt(5)
    for style_name in ("List Bullet", "List Number"):
        styles[style_name].font.name = "Aptos"
        styles[style_name].font.size = Pt(10.5)
        styles[style_name].paragraph_format.space_after = Pt(4)

    header = section.header.paragraphs[0]
    header.text = "FORMULARIOS INTELIGENTES  |  PROPUESTA FUNCIONAL"
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    for run in header.runs:
        run.font.name = "Aptos"
        run.font.size = Pt(8)
        run.font.bold = True
        run.font.color.rgb = RGBColor.from_string(MUTED)
    add_page_number(section.footer.paragraphs[0])

    doc.add_paragraph().paragraph_format.space_after = Pt(32)
    p = doc.add_paragraph("PROPUESTA DE EVOLUCIÓN", style=None)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.runs[0]
    r.bold = True
    r.font.size = Pt(10)
    r.font.color.rgb = RGBColor.from_string(TEAL)
    r.font.letter_spacing = Pt(1.2)
    p = doc.add_paragraph("Portal de seguimiento reglas condicionales y gestión de atención", style="Title")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(14)
    p = doc.add_paragraph("Propuesta funcional y visual para ampliar el alcance del sistema")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.runs[0].font.size = Pt(13)
    p.runs[0].font.color.rgb = RGBColor.from_string(MUTED)
    doc.add_paragraph().paragraph_format.space_after = Pt(65)
    add_table(doc, ["Proyecto", "Equipo", "Fecha"], [["Formularios Inteligentes", "Dos desarrolladores", "Noviembre de 2026"]], [2.6, 2.0, 2.0])
    doc.add_paragraph().paragraph_format.space_after = Pt(72)
    p = doc.add_paragraph("Objetivo del documento")
    p.runs[0].bold = True
    p.runs[0].font.size = Pt(12)
    doc.add_paragraph("Definir una ampliación realizable en un mes que permita al solicitante conocer el avance de su envío, al diseñador configurar reglas sin código y al BackOffice administrar responsables, prioridades y fechas límite.")
    p = doc.add_paragraph("Resultado recomendado")
    p.runs[0].bold = True
    p.runs[0].font.size = Pt(12)
    doc.add_paragraph("Implementar los tres módulos como un mismo flujo operativo. Las reglas deciden qué ocurre al recibir la respuesta, la asignación organiza el trabajo interno y el portal comunica al solicitante únicamente la información pública del proceso.")

    doc.add_page_break()
    add_heading(doc, "Contenido", 1)
    contents = [
        "1 Propuesta general",
        "2 Portal público de seguimiento",
        "3 Motor de reglas condicionales",
        "4 Asignación y tiempos límite",
        "5 Integración entre los módulos",
        "6 Datos y seguridad",
        "7 Criterios de aceptación",
        "8 Plan de implementación",
        "9 Riesgos y decisiones",
    ]
    for item in contents:
        p = doc.add_paragraph(item)
        p.paragraph_format.left_indent = Inches(0.25)
        p.paragraph_format.space_after = Pt(8)

    add_heading(doc, "Propuesta general", 1)
    doc.add_paragraph("La ampliación propuesta cubre el recorrido completo de una solicitud. El usuario recibe un código de seguimiento al enviar el formulario. Las reglas evalúan las respuestas y pueden mostrar campos, asignar un departamento o establecer una prioridad. El BackOffice recibe la solicitud con responsable y plazo, mientras el portal publica los cambios autorizados.")
    add_table(doc, ["Módulo", "Problema que resuelve", "Resultado visible"], [
        ["Seguimiento", "El solicitante desconoce el avance después del envío", "Consulta segura por código y línea de tiempo"],
        ["Reglas", "Todos los formularios siguen el mismo comportamiento", "Campos, asignación y acciones según respuestas"],
        ["Atención", "No existe propiedad clara ni control de vencimientos", "Responsable, prioridad, fecha límite y alertas"],
    ], [1.35, 2.8, 2.45])

    doc.add_page_break()
    add_heading(doc, "Portal público de seguimiento", 1)
    doc.add_paragraph("Al completar un formulario, el sistema presenta un código no predecible y un enlace de consulta. El portal no requiere una cuenta, pero exige el código completo o un token seguro. La pantalla muestra el nombre público del trámite, el estado, la fecha de recepción y una línea de tiempo simplificada.")
    add_heading(doc, "Información pública", 2)
    for item in [
        "Código y nombre público del trámite.",
        "Estado traducido a lenguaje comprensible.",
        "Fecha de ingreso y última actualización.",
        "Pasos completados y paso actual.",
        "Mensaje público preparado por BackOffice.",
    ]:
        add_bullet(doc, item)
    add_heading(doc, "Información reservada", 2)
    doc.add_paragraph("El portal no expone respuestas, documentos, análisis de IA, observaciones internas, nombres del personal ni cargas de trabajo. La separación entre observación interna y mensaje público debe quedar explícita en la base de datos y en la interfaz.")
    add_figure(doc, mockups["search"], "Figura 1  Consulta pública mediante código de seguimiento")

    doc.add_page_break()
    add_heading(doc, "Detalle del seguimiento", 1)
    doc.add_paragraph("La línea de tiempo utiliza estados conocidos por el solicitante. Las transiciones internas pueden agruparse para evitar confusión. Por ejemplo, la asignación y el análisis técnico pueden mostrarse como En revisión, aunque el historial interno conserve cada evento.")
    add_table(doc, ["Estado interno", "Texto público sugerido", "Descripción"], [
        ["submitted", "Ingresada", "La solicitud fue recibida"],
        ["assigned / in_review", "En revisión", "El equipo responsable trabaja en el caso"],
        ["approved", "Aprobada", "La solicitud recibió una decisión favorable"],
        ["rejected", "No aprobada", "Existe una decisión y un mensaje público"],
        ["completed", "Finalizada", "El proceso concluyó"],
    ], [1.55, 1.75, 3.3])
    add_figure(doc, mockups["detail"], "Figura 2  Detalle público con estado y línea de tiempo")

    doc.add_page_break()
    add_heading(doc, "Motor de reglas condicionales", 1)
    doc.add_paragraph("El diseñador configura reglas con una estructura SI y ENTONCES. La primera versión debe limitarse a operadores claros y acciones seguras. Las reglas se validan antes de publicar para evitar referencias a preguntas eliminadas, ciclos o configuraciones incompletas.")
    add_heading(doc, "Condiciones iniciales", 2)
    add_table(doc, ["Tipo de respuesta", "Operadores"], [
        ["Texto", "contiene, no contiene, está vacío"],
        ["Número", "igual, mayor, menor, entre"],
        ["Selección", "es igual, es uno de, no es"],
        ["Sí o no", "es sí, es no"],
        ["Fecha", "antes, después, entre"],
    ], [2.1, 4.5])
    add_heading(doc, "Acciones iniciales", 2)
    for item in [
        "Mostrar u ocultar una pregunta o sección mientras se responde.",
        "Asignar departamento y responsable al recibir la solicitud.",
        "Definir prioridad y fecha límite.",
        "Ejecutar una integración configurada.",
        "Aprobar automáticamente cuando el formulario no requiere atención y la regla lo permite.",
    ]:
        add_bullet(doc, item)
    add_figure(doc, mockups["rules"], "Figura 3  Constructor visual de una regla condicional")

    doc.add_page_break()
    add_heading(doc, "Comportamiento dinámico del formulario", 1)
    doc.add_paragraph("Las reglas de visibilidad se ejecutan en el navegador para que la pantalla responda inmediatamente. El servidor debe repetir las reglas relevantes al recibir el formulario. Esta segunda evaluación impide que una persona altere el navegador para omitir preguntas que se volvieron obligatorias.")
    add_heading(doc, "Ejemplo funcional", 2)
    add_number(doc, "El usuario selecciona Fibra óptica en Tipo de instalación.")
    add_number(doc, "El formulario muestra la sección Factibilidad técnica.")
    add_number(doc, "Las preguntas obligatorias de esa sección se incorporan a la validación.")
    add_number(doc, "Al enviar, el servidor evalúa nuevamente la condición.")
    add_number(doc, "La solicitud se asigna a Operaciones con prioridad alta.")
    doc.add_paragraph("Las respuestas de campos ocultos deben limpiarse cuando una condición deja de cumplirse. Así se evita guardar información que el usuario ya no ve y que podría afectar reglas posteriores.")
    add_heading(doc, "Alcance recomendado", 2)
    doc.add_paragraph("La primera entrega debería utilizar grupos de condiciones con operador Y. El operador O y los grupos anidados pueden añadirse después de estabilizar la evaluación. Esta decisión reduce errores y permite entregar una interfaz comprensible dentro del mes disponible.")

    doc.add_page_break()
    add_heading(doc, "Asignación y tiempos límite", 1)
    doc.add_paragraph("Cada solicitud atendida puede tener departamento, responsable, prioridad y fecha de vencimiento. La asignación manual y automática debe generar un evento de trazabilidad. La fecha límite puede calcularse desde la recepción o desde la asignación, según la configuración del formulario.")
    add_table(doc, ["Dato", "Uso"], [
        ["Departamento", "Define la bandeja y el conjunto de responsables disponibles"],
        ["Responsable", "Identifica quién debe atender la solicitud"],
        ["Prioridad", "Ordena la bandeja y permite alertas diferenciadas"],
        ["Vencimiento", "Mide cumplimiento y detecta solicitudes atrasadas"],
        ["Motivo de reasignación", "Explica cambios de propiedad en el historial"],
    ], [1.65, 4.95])
    add_heading(doc, "Alertas visuales", 2)
    for item in [
        "En plazo con color neutro o verde.",
        "Próxima a vencer cuando resta menos del umbral configurado.",
        "Vencida cuando la fecha límite ya pasó y el proceso sigue abierto.",
        "Sin asignar cuando requiere atención y no tiene responsable.",
    ]:
        add_bullet(doc, item)
    add_figure(doc, mockups["assignment"], "Figura 4  Bandeja con responsable prioridad y vencimiento")

    doc.add_page_break()
    add_heading(doc, "Integración entre los módulos", 1)
    doc.add_paragraph("Los tres módulos comparten eventos. La recepción crea el seguimiento y ejecuta las reglas. Las reglas asignan el trabajo y calculan el vencimiento. Cada cambio de estado genera un evento interno; solo los eventos marcados como públicos aparecen en el portal.")
    add_table(doc, ["Momento", "Acción del sistema", "Efecto público"], [
        ["Envío", "Crea código, evalúa reglas y asigna", "Muestra Ingresada"],
        ["Asignación", "Registra responsable y vencimiento", "Puede mostrar En revisión"],
        ["Atención", "Actualiza estado y observaciones internas", "Publica solo mensaje autorizado"],
        ["Decisión", "Guarda decisión y ejecuta integraciones", "Muestra Aprobada o No aprobada"],
        ["Cierre", "Calcula tiempo total y finaliza", "Muestra Finalizada"],
    ], [1.2, 3.05, 2.35])
    add_heading(doc, "Eventos adicionales", 2)
    doc.add_paragraph("Las integraciones existentes pueden incorporar eventos como submission.assigned, submission.due_soon y submission.overdue. El payload debe conservar la clave de idempotencia y evitar incluir documentos o datos sensibles salvo que el servicio receptor esté autorizado.")

    add_heading(doc, "Datos y seguridad", 1)
    add_table(doc, ["Componente", "Cambio propuesto"], [
        ["form_rules", "Condiciones, acciones, orden, estado y versión"],
        ["form_submissions", "Código de seguimiento, responsable, prioridad y vencimiento"],
        ["submission_events", "Visibilidad pública y mensaje público opcional"],
        ["RLS", "Consulta pública solo mediante token seguro y función controlada"],
        ["Auditoría", "Usuario, fecha y motivo de asignación o cambio de plazo"],
    ], [1.65, 4.95])
    doc.add_paragraph("El código visible puede tener un formato amigable, pero la autorización debe depender de un token aleatorio separado. Los mensajes públicos deben tratarse como un campo distinto de las observaciones internas para evitar filtraciones.")

    doc.add_page_break()
    add_heading(doc, "Criterios de aceptación", 1)
    add_heading(doc, "Portal de seguimiento", 2)
    for item in [
        "El usuario recibe un código y un enlace después del envío.",
        "Un código inválido no confirma si existe una solicitud similar.",
        "La consulta no devuelve respuestas ni archivos.",
        "Los cambios públicos aparecen en orden cronológico.",
        "El portal funciona correctamente en móvil y escritorio.",
    ]:
        add_bullet(doc, item)
    add_heading(doc, "Reglas", 2)
    for item in [
        "El diseñador puede crear, desactivar, ordenar y probar una regla.",
        "Las referencias inválidas impiden publicar el formulario.",
        "La visibilidad cambia sin recargar la página.",
        "El servidor repite las validaciones relevantes.",
        "Cada ejecución conserva regla, versión y resultado.",
    ]:
        add_bullet(doc, item)
    add_heading(doc, "Asignación y plazos", 2)
    for item in [
        "BackOffice puede asignar y reasignar solicitudes permitidas.",
        "La bandeja filtra por responsable, prioridad y vencimiento.",
        "Las solicitudes próximas a vencer y vencidas se distinguen visualmente.",
        "El dashboard calcula tiempo de primera atención y cumplimiento del plazo.",
    ]:
        add_bullet(doc, item)

    add_heading(doc, "Plan de implementación", 1)
    add_table(doc, ["Semana", "Desarrollador 1", "Desarrollador 2", "Resultado"], [
        ["1", "Portal público y diseño responsive", "Modelo de datos, tokens y RLS", "Consulta segura funcional"],
        ["2", "Constructor de condiciones", "Evaluador y validación del servidor", "Reglas de visibilidad"],
        ["3", "Asignación, filtros y alertas", "Plazos, eventos e integraciones", "Bandeja operativa"],
        ["4", "Pruebas de interfaz y presentación", "Pruebas de seguridad y métricas", "Versión demostrable"],
    ], [0.65, 2.05, 2.05, 1.85])
    doc.add_paragraph("Ambos desarrolladores deben reservar tiempo diario para revisar cambios compartidos en migraciones, tipos y contratos de eventos. Las pruebas integrales deben comenzar en la segunda semana y no concentrarse al final.")

    doc.add_page_break()
    add_heading(doc, "Riesgos y decisiones", 1)
    add_table(doc, ["Riesgo", "Decisión de alcance"], [
        ["Constructor demasiado complejo", "Primera versión con operador Y y acciones limitadas"],
        ["Filtración de información", "Token separado y eventos públicos explícitos"],
        ["Reglas manipuladas en el navegador", "Evaluación repetida en el servidor"],
        ["Plazos inconsistentes", "Guardar zona horaria y momento de cálculo"],
        ["Sobrecarga del equipo", "Priorizar flujo completo sobre opciones avanzadas"],
    ], [2.15, 4.45])
    add_heading(doc, "Recomendación final", 1)
    doc.add_paragraph("La implementación debe comenzar por el portal y el modelo de eventos, porque ambos aprovechan la trazabilidad existente y permiten mostrar un resultado temprano. El motor de reglas debe iniciar con visibilidad condicional y asignación. Los operadores anidados, calendarios laborales y notificaciones multicanal pueden quedar como evolución posterior.")
    doc.add_paragraph("Al finalizar el mes, la demostración debe recorrer un caso completo: una persona responde un formulario dinámico, una regla asigna el caso con prioridad y vencimiento, BackOffice actualiza el estado y la persona consulta el avance desde el portal público.")

    props = doc.core_properties
    props.title = "Portal de seguimiento reglas condicionales y gestión de atención"
    props.subject = "Propuesta funcional y mockups para Formularios Inteligentes"
    props.author = "Equipo de Formularios Inteligentes"
    doc.save(DOCX_PATH)
    print(DOCX_PATH)


if __name__ == "__main__":
    build_document()
