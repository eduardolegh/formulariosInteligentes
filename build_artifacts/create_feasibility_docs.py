from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path('/Users/eduardolegh/Documents/galileo/formulariosInteligentes')
OUT = ROOT / 'outputs'
OUT.mkdir(exist_ok=True)
LOGO = OUT / 'logo_word.png'
TEAL = '247F95'
NAVY = '111936'
PALE = 'EAF5F6'
GRAY = 'F3F5F7'
BORDER = 'D9D9D9'
WHITE = 'FFFFFF'
BLACK = '000000'


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn('w:shd'))
    if shd is None:
        shd = OxmlElement('w:shd')
        tc_pr.append(shd)
    shd.set(qn('w:fill'), fill)


def set_cell_border(cell, color=BORDER, size='4'):
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in('w:tcBorders')
    if borders is None:
        borders = OxmlElement('w:tcBorders')
        tc_pr.append(borders)
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        tag = 'w:' + edge
        node = borders.find(qn(tag))
        if node is None:
            node = OxmlElement(tag)
            borders.append(node)
        node.set(qn('w:val'), 'single')
        node.set(qn('w:sz'), size)
        node.set(qn('w:color'), color)


def set_cell_margins(cell, top=110, start=110, bottom=110, end=110):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in('w:tcMar')
    if tc_mar is None:
        tc_mar = OxmlElement('w:tcMar')
        tc_pr.append(tc_mar)
    for m, v in (('top', top), ('start', start), ('bottom', bottom), ('end', end)):
        node = tc_mar.find(qn(f'w:{m}'))
        if node is None:
            node = OxmlElement(f'w:{m}')
            tc_mar.append(node)
        node.set(qn('w:w'), str(v))
        node.set(qn('w:type'), 'dxa')


def add_page_field(paragraph):
    run = paragraph.add_run()
    begin = OxmlElement('w:fldChar'); begin.set(qn('w:fldCharType'), 'begin')
    instr = OxmlElement('w:instrText'); instr.set(qn('xml:space'), 'preserve'); instr.text = ' PAGE '
    separate = OxmlElement('w:fldChar'); separate.set(qn('w:fldCharType'), 'separate')
    text = OxmlElement('w:t'); text.text = '1'
    end = OxmlElement('w:fldChar'); end.set(qn('w:fldCharType'), 'end')
    run._r.extend([begin, instr, separate, text, end])


def base_document(short_title):
    doc = Document()
    sec = doc.sections[0]
    sec.top_margin = Inches(.75); sec.bottom_margin = Inches(.72)
    sec.left_margin = Inches(.85); sec.right_margin = Inches(.85)
    sec.header_distance = Inches(.3); sec.footer_distance = Inches(.32)
    styles = doc.styles
    styles['Normal'].font.name = 'Aptos'; styles['Normal'].font.size = Pt(10.5)
    styles['Normal'].paragraph_format.space_after = Pt(7)
    styles['Normal'].paragraph_format.line_spacing = 1.12
    for name, size in [('Title', 27), ('Heading 1', 18), ('Heading 2', 13), ('Heading 3', 11)]:
        style = styles[name]
        style.font.name = 'Aptos Display'; style.font.size = Pt(size)
        style.font.bold = True; style.font.color.rgb = RGBColor(0, 0, 0)
        style.paragraph_format.space_before = Pt(13 if name != 'Title' else 0)
        style.paragraph_format.space_after = Pt(6)
        style.paragraph_format.keep_with_next = True
    title_ppr = styles['Title'].element.get_or_add_pPr()
    title_border = title_ppr.find(qn('w:pBdr'))
    if title_border is not None:
        title_ppr.remove(title_border)
    header = sec.header
    hp = header.paragraphs[0]
    hp.text = 'FORMULARIOS INTELIGENTES   |   ' + short_title.upper()
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    for r in hp.runs:
        r.font.name = 'Aptos'; r.font.size = Pt(8); r.font.bold = True; r.font.color.rgb = RGBColor(80, 105, 112)
    footer = sec.footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = fp.add_run('Proyecto final universitario   •   Octubre de 2026   •   Página ')
    r.font.name = 'Aptos'; r.font.size = Pt(8); r.font.color.rgb = RGBColor(100, 110, 115)
    add_page_field(fp)
    return doc


def cover(doc, title, subtitle, code):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(65)
    if LOGO.exists():
        logo_shape = p.add_run().add_picture(str(LOGO), width=Inches(3.6))
        logo_shape._inline.docPr.set('descr', 'Logotipo de Formularios Inteligentes')
    p = doc.add_paragraph(style='Title')
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(32)
    p.add_run(title)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(subtitle); r.font.name = 'Aptos'; r.font.size = Pt(13); r.font.color.rgb = RGBColor(72, 90, 96)
    p.paragraph_format.space_before = Pt(8)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(145)
    r = p.add_run(f'Código del documento: {code}\nVersión 1.0\nFecha de elaboración: 3 de octubre de 2026')
    r.font.name = 'Aptos'; r.font.size = Pt(10); r.font.color.rgb = RGBColor(65, 75, 80)
    doc.add_page_break()


def add_control(doc, purpose):
    doc.add_heading('Control del documento', level=1)
    table(doc, ['Elemento', 'Detalle'], [
        ['Proyecto', 'Formularios Inteligentes'],
        ['Documento', purpose],
        ['Versión', '1.0'],
        ['Fecha de corte', '3 de octubre de 2026'],
        ['Estado', 'Primera estimación para la fase de factibilidad'],
        ['Alcance', 'MVP web con React, Supabase y análisis mediante OpenAI'],
    ], widths=[1.7, 5.0])


def add_contents(doc, items):
    doc.add_heading('Contenido', level=1)
    for item in items:
        p = doc.add_paragraph(style='List Number')
        p.add_run(item)
    doc.add_paragraph('Las cifras, precios y conclusiones corresponden a la fecha de corte indicada. Los valores de proveedores pueden cambiar y deben confirmarse antes de contratar servicios.', style=None)
    doc.add_page_break()


def table(doc, headers, rows, widths=None, font_size=8.6, header_fill=NAVY):
    t = doc.add_table(rows=1, cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    for i, h in enumerate(headers):
        cell = t.rows[0].cells[i]
        cell.text = h; set_cell_shading(cell, header_fill); set_cell_border(cell); set_cell_margins(cell)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        for p in cell.paragraphs:
            p.paragraph_format.space_after = Pt(0)
            for r in p.runs:
                r.font.name = 'Aptos'; r.font.size = Pt(font_size); r.font.bold = True; r.font.color.rgb = RGBColor(255,255,255)
    header_props = t.rows[0]._tr.get_or_add_trPr()
    repeat = OxmlElement('w:tblHeader'); repeat.set(qn('w:val'), 'true'); header_props.append(repeat)
    no_split = OxmlElement('w:cantSplit'); no_split.set(qn('w:val'), 'true'); header_props.append(no_split)
    for ri, row in enumerate(rows):
        cells = t.add_row().cells
        row_props = t.rows[-1]._tr.get_or_add_trPr()
        cant_split = OxmlElement('w:cantSplit'); cant_split.set(qn('w:val'), 'true'); row_props.append(cant_split)
        for i, value in enumerate(row):
            cell = cells[i]; cell.text = str(value); set_cell_border(cell); set_cell_margins(cell)
            if ri % 2 == 1: set_cell_shading(cell, 'F5F9FA')
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            for p in cell.paragraphs:
                p.paragraph_format.space_after = Pt(0); p.paragraph_format.line_spacing = 1.05
                for r in p.runs:
                    r.font.name = 'Aptos'; r.font.size = Pt(font_size); r.font.color.rgb = RGBColor(25,35,40)
    if widths:
        for row in t.rows:
            for i, width in enumerate(widths): row.cells[i].width = Inches(width)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return t


def bullet(doc, text, level=0):
    p = doc.add_paragraph(style='List Bullet' if level == 0 else 'List Bullet 2')
    p.add_run(text)


def source(doc, label, url, accessed='3 de octubre de 2026'):
    source.counter = getattr(source, 'counter', 0) + 1
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(.25)
    p.paragraph_format.first_line_indent = Inches(-.25)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(f'[{source.counter}] {label}. {url} (consulta: {accessed}).')
    r.font.size = Pt(9)


def build_preliminary():
    doc = base_document('Investigación preliminar')
    cover(doc, 'Investigación Preliminar', 'Contexto, problema, motivación y análisis competitivo de Formularios Inteligentes', 'FI IP 01')
    add_control(doc, 'Investigación preliminar')
    add_contents(doc, ['Resumen ejecutivo', 'Situación actual y contexto', 'Problema identificado', 'Motivaciones del proyecto', 'Usuarios y necesidades', 'Solución propuesta y alcance', 'Investigación de soluciones existentes', 'Análisis competitivo', 'Oportunidad y riesgos preliminares', 'Conclusiones', 'Fuentes consultadas'])

    doc.add_heading('1 Resumen ejecutivo', level=1)
    doc.add_paragraph('La investigación preliminar confirma que la creación digital de formularios es un mercado maduro, con alternativas gratuitas y comerciales capaces de recopilar información, aplicar lógica condicional y generar reportes. Sin embargo, el problema abordado por Formularios Inteligentes no se limita a sustituir formularios en papel. El proyecto busca centralizar la definición del contexto de negocio, la generación asistida por inteligencia artificial, el control de acceso por roles y departamentos, la recepción de evidencias, la revisión de cada solicitud y la trazabilidad de una decisión.')
    doc.add_paragraph('La oportunidad se encuentra en organizaciones que hoy combinan formularios genéricos, hojas de cálculo, correo electrónico y revisiones manuales. Las soluciones existentes reducen el esfuerzo de captura, pero las configuraciones orientadas a procesos internos, aprobaciones departamentales, reglas propias y análisis de IA suelen requerir planes avanzados, integraciones adicionales o desarrollo complementario. Por ello, el proyecto es pertinente como plataforma adaptable y como demostración de una arquitectura de bajo costo basada en React, Supabase y servicios de IA por consumo.')

    doc.add_heading('2 Situación actual y contexto', level=1)
    doc.add_heading('2.1 Contexto organizacional', level=2)
    doc.add_paragraph('En áreas como Recursos Humanos, administración, compras, soporte y operaciones, los formularios constituyen el punto de entrada de solicitudes, candidatos, incidentes y evidencias. En un escenario habitual, un responsable diseña las preguntas, comparte un enlace, recibe respuestas y posteriormente traslada la información a otra herramienta para revisarla. Cuando participan varias áreas, aparecen tareas adicionales: determinar quién puede ver cada envío, verificar que la información cumpla reglas, solicitar correcciones, registrar observaciones y comunicar una aprobación o rechazo.')
    doc.add_paragraph('El caso demostrativo del proyecto es el reclutamiento de personal. Un administrador describe mediante lenguaje natural el formulario que necesita; la IA propone secciones y preguntas; el formulario se publica; el candidato responde; y un usuario BackOffice revisa la solicitud según el departamento y el contexto establecido. El mismo patrón puede reutilizarse en inscripciones, solicitudes internas, evaluación de proveedores, control de visitas o levantamiento de incidencias.')
    doc.add_heading('2.2 Prácticas actuales y sus limitaciones', level=2)
    table(doc, ['Práctica actual', 'Consecuencia'], [
        ['Construcción manual de cada formulario', 'Tiempo repetitivo, estructura inconsistente y posibilidad de omitir preguntas relevantes.'],
        ['Respuestas almacenadas en hojas de cálculo', 'La captura se resuelve, pero la revisión, los permisos y los estados quedan fuera del flujo.'],
        ['Coordinación mediante correo o mensajería', 'Las observaciones se dispersan y es difícil reconstruir quién tomó una decisión.'],
        ['Revisión basada únicamente en criterio humano', 'Aumenta el tiempo de atención y puede producir resultados inconsistentes en solicitudes similares.'],
        ['Herramientas separadas por departamento', 'Duplicación de formularios, usuarios, datos y costos de administración.'],
        ['Integraciones desarrolladas caso por caso', 'Mayor dependencia técnica y dificultad para reutilizar reglas o conexiones.'],
    ], widths=[2.35, 4.35])

    doc.add_heading('3 Problema identificado', level=1)
    doc.add_paragraph('Las organizaciones necesitan recopilar información estructurada y convertirla en decisiones trazables. Las herramientas de formularios tradicionales atienden bien la captura, pero no siempre incorporan el contexto del proceso, la segmentación departamental, un flujo de revisión y la asistencia inteligente bajo una misma administración. Como resultado, el proceso completo requiere intervención manual y múltiples aplicaciones.')
    doc.add_heading('3.1 Causas principales', level=2)
    for text in [
        'Los formularios se diseñan desde cero y dependen de la experiencia individual del creador.',
        'La información de negocio que explica el objetivo, las reglas y el resultado esperado no queda vinculada al formulario.',
        'Los permisos de una herramienta genérica no representan necesariamente los roles internos de la organización.',
        'La revisión ocurre después de exportar los datos o mediante comunicaciones externas.',
        'La automatización y la IA se agregan como servicios separados, lo que incrementa costo y complejidad.',
    ]: bullet(doc, text)
    doc.add_heading('3.2 Efectos observables', level=2)
    for text in [
        'Mayor tiempo entre la recepción de una respuesta y la decisión.',
        'Inconsistencias en formularios que deberían seguir un mismo estándar.',
        'Poca visibilidad del estado de una solicitud y de la observación que fundamentó la decisión.',
        'Riesgo de acceso excesivo a información personal o departamental.',
        'Dificultad para convertir las respuestas en indicadores o acciones posteriores.',
    ]: bullet(doc, text)
    doc.add_heading('3.3 Pregunta orientadora', level=2)
    doc.add_paragraph('¿Es posible desarrollar una plataforma web de bajo costo que permita crear formularios mediante lenguaje natural, publicarlos de forma pública o privada, controlar el acceso por rol y departamento, analizar respuestas con IA y registrar decisiones con trazabilidad?')

    doc.add_heading('4 Motivaciones del proyecto', level=1)
    doc.add_paragraph('El equipo decidió emprender el proyecto por la necesidad de demostrar que la inteligencia artificial puede utilizarse como apoyo controlado dentro de un proceso administrativo, y no solamente como un chat independiente. La propuesta mantiene al usuario responsable de revisar y confirmar lo generado, mientras la plataforma conserva reglas, permisos, respuestas y estados en una base de datos estructurada.')
    table(doc, ['Motivación', 'Aplicación en el proyecto'], [
        ['Reducir esfuerzo de configuración', 'Generación de formularios desde instrucciones en lenguaje natural y estructura validada mediante JSON Schema.'],
        ['Mejorar consistencia', 'Contexto del formulario con objetivo, instrucciones, reglas, restricciones y resultado esperado.'],
        ['Proteger la información', 'Autenticación, roles, permisos y políticas Row Level Security en Supabase.'],
        ['Agilizar la revisión', 'Análisis IA que propone estado y observación, con confirmación humana antes de guardar.'],
        ['Aumentar trazabilidad', 'Estados Ingresado, En revisión, Aprobado y Rechazado, junto con observaciones persistentes.'],
        ['Facilitar evolución', 'Arquitectura web modular, migraciones SQL y Edge Functions para operaciones privilegiadas.'],
    ], widths=[1.75, 4.95])

    doc.add_heading('5 Usuarios y necesidades', level=1)
    table(doc, ['Usuario', 'Necesidad principal', 'Respuesta de la solución'], [
        ['Administrador', 'Controlar usuarios, roles, departamentos y operación general.', 'Directorio de usuarios, asignación de roles y permisos administrativos.'],
        ['Diseñador de formularios', 'Crear y modificar formularios sin repetir trabajo.', 'Editor visual y generación asistida por IA.'],
        ['Configurador de contexto', 'Definir criterios de negocio que orienten el análisis.', 'Contexto versionable con reglas, restricciones e instrucciones.'],
        ['Participante o candidato', 'Responder desde cualquier dispositivo con una experiencia clara.', 'Enlace público o privado, validación de campos y captura de imágenes.'],
        ['BackOffice', 'Revisar únicamente los envíos de su departamento.', 'Bandeja filtrada, detalle, análisis IA, observación y decisión.'],
        ['Analista', 'Observar volumen, estados y resultados.', 'Base preparada para dashboards e indicadores posteriores.'],
    ], widths=[1.25, 2.35, 3.1])

    doc.add_heading('6 Solución propuesta y alcance', level=1)
    doc.add_paragraph('Formularios Inteligentes es una aplicación web low-code compuesta por una interfaz React y un backend administrado en Supabase. La plataforma permite diseñar formularios por secciones, asignarlos a departamentos, publicarlos, recopilar respuestas y administrar su revisión. Las funciones de IA utilizan OpenAI desde Edge Functions, por lo que las claves privadas no se exponen al navegador.')
    doc.add_heading('6.1 Capacidades incluidas en el MVP', level=2)
    for text in [
        'Inicio de sesión, perfiles, roles y permisos.',
        'Constructor de formularios con preguntas de texto, selección, fechas, números, booleanos y fotografías.',
        'Generación y edición de formularios mediante IA.',
        'Publicación pública o privada mediante enlace estable.',
        'Asignación de formularios por departamento.',
        'Registro de envíos, respuestas y estados de revisión.',
        'Análisis de respuestas según el contexto del formulario.',
        'Recomendación de aprobación o rechazo con observación editable y confirmación humana.',
    ]: bullet(doc, text)
    doc.add_heading('6.2 Límites de la primera versión', level=2)
    doc.add_paragraph('El MVP no pretende reemplazar plataformas empresariales completas ni automatizar decisiones sin supervisión. Los dashboards avanzados, la integración REST genérica, las notificaciones, la auditoría detallada, la conservación de conversaciones y el almacenamiento optimizado de archivos deben completarse en fases posteriores. Asimismo, cualquier uso con datos sensibles requerirá revisar políticas de privacidad, retención, respaldo y cumplimiento aplicables a la organización.')

    doc.add_heading('7 Investigación de soluciones existentes', level=1)
    doc.add_heading('7.1 Google Forms', level=2)
    doc.add_paragraph('Google Forms permite crear formularios y cuestionarios con distintos tipos de pregunta, plantillas, personalización básica, lógica de navegación y análisis en tiempo real. Las respuestas pueden exportarse a Google Sheets y los formularios funcionan en dispositivos móviles. Su principal ventaja es la facilidad de adopción dentro de Google Workspace. Para el problema estudiado, la limitación es que el flujo departamental, la revisión con estados propios y el análisis contextual requieren procesos o desarrollos adicionales.')
    doc.add_heading('7.2 Microsoft Forms', level=2)
    doc.add_paragraph('Microsoft Forms permite crear encuestas, cuestionarios y registros, recibir respuestas desde navegadores y exportar resultados a Excel. Su integración con Microsoft 365 lo hace atractivo para organizaciones que ya utilizan ese ecosistema. La documentación oficial indica límites amplios para clientes empresariales y educativos. No obstante, un proceso especializado de revisión por departamentos y decisiones asistidas por un contexto propio normalmente depende de Power Automate, Power Apps u otras configuraciones.')
    doc.add_heading('7.3 Typeform', level=2)
    doc.add_paragraph('Typeform compite mediante una experiencia visual conversacional, lógica condicional, integraciones, marca personalizada y funciones de IA. Sus planes comerciales incrementan respuestas, usuarios y capacidades de análisis. Es una referencia fuerte en experiencia del participante; sin embargo, su enfoque principal es la captura y conversión. La adaptación a reglas internas, permisos específicos y una bandeja BackOffice propia puede requerir planes superiores e integraciones.')
    doc.add_heading('7.4 Jotform', level=2)
    doc.add_paragraph('Jotform ofrece un catálogo amplio de campos, plantillas, pagos, documentos, aprobaciones y agentes de IA. El plan Starter es gratuito con límites de formularios y envíos; los planes pagados amplían capacidad y eliminan la marca. Es uno de los competidores más cercanos por amplitud funcional. La oportunidad del proyecto reside en controlar el modelo de datos, el flujo por departamento y la lógica del análisis sin depender de límites por formulario o de un ecosistema cerrado.')
    doc.add_heading('7.5 Zoho Forms', level=2)
    doc.add_paragraph('Zoho Forms incluye formularios adaptables, reglas, aprobaciones multinivel, permisos, auditoría, integraciones y creación con IA según el plan. Resulta competitivo para organizaciones que ya utilizan aplicaciones Zoho. Su fortaleza confirma que existe demanda por flujos de aprobación; al mismo tiempo, la propuesta propia puede enfocarse en una experiencia simplificada, integración directa con sistemas internos y control de costos según el uso real.')
    doc.add_heading('7.6 Formstack', level=2)
    doc.add_paragraph('Formstack se orienta a formularios seguros y automatización empresarial, con opciones de documentos, firma electrónica, Salesforce, SSO y soluciones reguladas. Su precio inicial es superior al de herramientas generalistas, lo cual refleja su enfoque empresarial. Formularios Inteligentes no iguala todavía ese nivel de cumplimiento e integraciones, pero puede ser una alternativa específica y más económica para procesos internos de alcance controlado.')

    doc.add_heading('8 Análisis competitivo', level=1)
    table(doc, ['Solución', 'Fortalezas principales', 'Limitación frente al caso', 'Precio de referencia'], [
        ['Google Forms', 'Facilidad, colaboración, Sheets, lógica y acceso móvil.', 'Flujo especializado y revisión departamental requieren componentes adicionales.', 'Disponible sin costo individual; también integrado en Google Workspace.'],
        ['Microsoft Forms', 'Integración con Microsoft 365, Excel y administración empresarial.', 'Automatización avanzada suele depender del ecosistema Power Platform.', 'Incluido en cuentas y planes Microsoft compatibles.'],
        ['Typeform', 'Experiencia visual, marca, lógica, integraciones y funciones IA.', 'Costo por capacidad y menor control sobre un flujo interno personalizado.', 'Basic desde USD 29 al mes; niveles superiores según respuestas y usuarios.'],
        ['Jotform', 'Gran variedad de campos, aprobaciones, documentos y agentes IA.', 'Límites de formularios, envíos y usuarios según el plan.', 'Starter gratuito; Bronze USD 34 al mes con pago anual.'],
        ['Zoho Forms', 'Reglas, permisos, aprobaciones, auditoría e integración Zoho.', 'Mayor dependencia del ecosistema y configuración del proveedor.', 'Plan gratuito y planes pagados según capacidad.'],
        ['Formstack', 'Seguridad empresarial, automatización, documentos y firma.', 'Precio alto para un equipo pequeño y personalización ligada al proveedor.', 'Forms desde USD 83 al mes con pago anual.'],
        ['Formularios Inteligentes', 'Contexto propio, roles y RLS, departamentos, BackOffice y análisis IA controlado.', 'MVP en evolución; faltan SLA, integraciones amplias y madurez operativa.', 'Infraestructura base estimada desde USD 51.25 al mes en producción.'],
    ], widths=[1.05, 2.05, 2.25, 1.35], font_size=7.4)
    doc.add_heading('8.1 Posicionamiento propuesto', level=2)
    doc.add_paragraph('La solución no debe posicionarse como un constructor genérico con más plantillas que los líderes del mercado. Su propuesta de valor es convertir una respuesta en un caso de negocio trazable: el formulario conserva su contexto, cada usuario observa solamente lo autorizado, la IA analiza bajo reglas explícitas y la decisión final permanece bajo control humano. Esta especialización es relevante cuando el proceso importa tanto como la captura.')

    doc.add_heading('9 Oportunidad y riesgos preliminares', level=1)
    table(doc, ['Factor', 'Hallazgo preliminar', 'Respuesta recomendada'], [
        ['Oportunidad funcional', 'Unificar captura, revisión, contexto y decisión en una sola plataforma.', 'Priorizar flujos departamentales y trazabilidad antes que ampliar plantillas.'],
        ['Oportunidad económica', 'Servicios administrados y modelos por consumo reducen la inversión inicial.', 'Mantener límites, alertas de gasto y métricas por análisis.'],
        ['Competencia', 'Existen soluciones maduras y algunas ya incorporan IA y aprobaciones.', 'Diferenciar mediante personalización, propiedad de datos e integración específica.'],
        ['Seguridad', 'Se procesan datos personales y posiblemente imágenes.', 'Fortalecer autenticación en Edge Functions, Storage, auditoría y políticas de retención.'],
        ['Calidad de IA', 'Una recomendación puede ser incompleta o incorrecta.', 'Conservar revisión humana, mostrar criterios y evitar decisiones automáticas irreversibles.'],
        ['Adopción', 'Los usuarios pueden preferir herramientas conocidas.', 'Validar el flujo con un departamento piloto y medir tiempo, errores y satisfacción.'],
    ], widths=[1.25, 2.75, 2.7], font_size=8.0)

    doc.add_heading('10 Conclusiones', level=1)
    doc.add_paragraph('La investigación confirma que el problema tiene soluciones parciales y competidores importantes, pero también que existe espacio para una plataforma enfocada en procesos internos con contexto, permisos, revisión y decisiones trazables. El proyecto es pertinente si se orienta a organizaciones que necesitan adaptar el flujo a sus reglas y conservar control sobre la aplicación y los datos.')
    doc.add_paragraph('La ventaja competitiva no proviene únicamente de generar preguntas con IA, porque esa función ya aparece en varias plataformas. La diferenciación sostenible debe construirse alrededor del contexto de negocio, la seguridad por departamento, la trazabilidad de observaciones, la integración con sistemas propios y la capacidad de medir el efecto operativo. La siguiente fase debe validar estos supuestos con usuarios reales y un proceso piloto.')

    doc.add_heading('11 Fuentes consultadas', level=1)
    source.counter = 0
    source(doc, 'Google Workspace, Google Forms', 'https://workspace.google.com/products/forms/')
    source(doc, 'Microsoft Learn, configuración y capacidades de Microsoft Forms', 'https://learn.microsoft.com/en-us/microsoft-forms/set-up-microsoft-forms')
    source(doc, 'Typeform, planes y precios', 'https://www.typeform.com/pricing')
    source(doc, 'Jotform, características y precios', 'https://www.jotform.com/pricing/')
    source(doc, 'Zoho Forms, planes y características', 'https://www.zoho.com/forms/pricing.html')
    source(doc, 'Formstack, precios de Forms', 'https://forms.formstack.com/pricing')
    source(doc, 'Documentación interna del proyecto', 'docs/PLANTEAMIENTO.md y docs/IMPLEMENTACION.md')
    path = OUT / 'Formularios_Inteligentes_Investigacion_Preliminar.docx'
    doc.save(path)
    return path


def build_economic():
    doc = base_document('Factibilidad económica')
    cover(doc, 'Factibilidad Económica', 'Primera estimación de inversión, operación, escenarios y sostenibilidad', 'FI FE 01')
    add_control(doc, 'Factibilidad económica')
    add_contents(doc, ['Resumen ejecutivo', 'Objetivo y metodología', 'Supuestos de estimación', 'Recursos necesarios', 'Costos de desarrollo', 'Costos de infraestructura y operación', 'Costo de inteligencia artificial', 'Escenarios presupuestarios', 'Beneficios y retorno estimado', 'Comparación económica con alternativas', 'Riesgos económicos y medidas de control', 'Conclusión de factibilidad', 'Fuentes consultadas'])

    doc.add_heading('1 Resumen ejecutivo', level=1)
    doc.add_paragraph('La aplicación es económicamente factible para un prototipo académico y para un piloto organizacional de alcance controlado. La arquitectura utiliza tecnologías de código abierto y servicios administrados con niveles gratuitos, por lo que el desembolso inicial puede mantenerse bajo. En una operación profesional básica, la infraestructura recurrente se estima en USD 51.25 mensuales, antes de impuestos y excedentes de consumo.')
    doc.add_paragraph('El costo económico completo cambia al reconocer el tiempo del equipo. Para un MVP de 16 semanas se estiman 800 horas de trabajo, valoradas a una tarifa académica o interna de USD 10 por hora, equivalentes a USD 8,000. Al sumar infraestructura del primer año y una reserva de contingencia, la inversión económica estimada asciende a USD 9,430. El desembolso de caja puede ser mucho menor cuando el trabajo forma parte del curso y se utilizan planes gratuitos; sin embargo, las horas deben conservarse en el estudio para representar el costo real de construir el producto.')

    doc.add_heading('2 Objetivo y metodología', level=1)
    doc.add_paragraph('El objetivo es identificar los recursos necesarios para completar, desplegar y operar la primera versión de Formularios Inteligentes. La estimación considera recursos humanos, infraestructura, servicios de IA, dominio, herramientas, pruebas, mantenimiento y contingencia. Los valores se expresan en dólares estadounidenses porque los proveedores cotizan en esa moneda.')
    doc.add_heading('2.1 Criterios utilizados', level=2)
    for text in [
        'Horizonte de desarrollo: 16 semanas.',
        'Equipo base: dos integrantes con responsabilidades compartidas de análisis, frontend, backend, IA, pruebas y documentación.',
        'Horas totales estimadas: 800 horas, equivalentes a 25 horas semanales combinadas durante 16 semanas más actividades de cierre.',
        'Tarifa de valoración: USD 10 por hora como costo interno de referencia, no como cotización comercial.',
        'Escenario de producción: un proyecto Supabase Pro, un despliegue Vercel Pro y consumo moderado de OpenAI.',
        'Los precios de proveedores son referencias vigentes a la fecha de corte y no incluyen impuestos.',
    ]: bullet(doc, text)
    doc.add_heading('2.2 Alcance de la estimación', level=2)
    doc.add_paragraph('La estimación cubre el MVP descrito en la documentación del repositorio: autenticación, roles, usuarios, departamentos, editor, publicación pública o privada, respuestas, fotografías, bandeja BackOffice, estados, observaciones, creación de formularios con IA y análisis de respuestas. No incluye aplicaciones móviles nativas, soporte 24 horas, certificaciones, asesoría legal, campañas comerciales, integración masiva con sistemas heredados ni infraestructura empresarial de alta disponibilidad.')

    doc.add_heading('3 Supuestos de estimación', level=1)
    table(doc, ['Variable', 'Supuesto base', 'Justificación'], [
        ['Usuarios internos', 'Hasta 25 usuarios', 'Piloto con administradores, diseñadores y BackOffice.'],
        ['Participantes', 'Hasta 2,000 usuarios activos al mes', 'Muy por debajo de los 100,000 MAU incluidos en Supabase Pro.'],
        ['Respuestas', '1,000 envíos al mes', 'Volumen suficiente para validar operación departamental.'],
        ['Análisis IA', '1,000 análisis al mes', 'Un análisis potencial por envío; la interfaz evita repetir casos cerrados.'],
        ['Archivos', 'Hasta 10 GB', 'Las imágenes deben migrarse a Storage y no mantenerse como Base64 en la base.'],
        ['Disponibilidad', 'Servicio web de producción básica', 'Sin SLA empresarial ni redundancia multirregión en el MVP.'],
        ['Crecimiento', 'Revisión trimestral', 'Permite ajustar almacenamiento, cómputo y límites de gasto.'],
    ], widths=[1.4, 2.0, 3.3], font_size=8.2)

    doc.add_heading('4 Recursos necesarios', level=1)
    doc.add_heading('4.1 Recursos humanos', level=2)
    doc.add_paragraph('El recurso principal es el tiempo especializado. Aunque el equipo no reciba un pago directo durante el curso, las horas representan costo de oportunidad y permiten comparar el desarrollo propio con una contratación externa o con una suscripción SaaS.')
    table(doc, ['Actividad', 'Horas', 'Tarifa USD', 'Subtotal USD'], [
        ['Investigación, alcance y análisis', '80', '10.00', '800.00'],
        ['Diseño de experiencia e interfaz', '60', '10.00', '600.00'],
        ['Desarrollo frontend', '220', '10.00', '2,200.00'],
        ['Backend, base de datos y seguridad', '220', '10.00', '2,200.00'],
        ['Funciones de IA e integraciones', '100', '10.00', '1,000.00'],
        ['Pruebas, despliegue y documentación', '120', '10.00', '1,200.00'],
        ['Total', '800', '', '8,000.00'],
    ], widths=[3.15, .8, 1.15, 1.25])
    doc.add_heading('4.2 Recursos tecnológicos', level=2)
    table(doc, ['Recurso', 'Función', 'Modalidad'], [
        ['Equipo de desarrollo', 'Programación, pruebas y documentación.', 'Computadoras existentes; sin compra incremental en el escenario base.'],
        ['React, TypeScript y Vite', 'Interfaz web.', 'Código abierto, costo de licencia USD 0.'],
        ['Supabase', 'Autenticación, PostgreSQL, RLS, Storage y Edge Functions.', 'Nivel gratuito para prototipo; Pro para producción.'],
        ['Vercel', 'Alojamiento y distribución del frontend.', 'Hobby para uso personal; Pro para operación profesional.'],
        ['OpenAI API', 'Generación de formularios y análisis de respuestas.', 'Pago según tokens consumidos.'],
        ['Git y repositorio', 'Control de versiones y colaboración.', 'Costo incremental USD 0 en el escenario base.'],
        ['Dominio', 'Dirección pública de la aplicación.', 'Renovación anual estimada.'],
    ], widths=[1.45, 3.1, 2.3], font_size=8.2)

    doc.add_heading('5 Costos de desarrollo', level=1)
    doc.add_paragraph('La inversión de desarrollo estimada es de USD 8,000. Esta cifra utiliza una tarifa conservadora de USD 10 por hora; una contratación profesional puede ser considerablemente mayor. El cálculo sirve como base para evaluar retorno, priorizar alcance y registrar el valor del trabajo ya realizado.')
    doc.add_heading('5.1 Distribución porcentual', level=2)
    table(doc, ['Componente', 'Costo USD', 'Participación'], [
        ['Análisis y diseño', '1,400.00', '17.5 %'],
        ['Frontend', '2,200.00', '27.5 %'],
        ['Backend y seguridad', '2,200.00', '27.5 %'],
        ['IA e integraciones', '1,000.00', '12.5 %'],
        ['Pruebas, despliegue y documentación', '1,200.00', '15.0 %'],
        ['Total', '8,000.00', '100.0 %'],
    ], widths=[3.5, 1.5, 1.4])
    doc.add_heading('5.2 Costos no incluidos', level=2)
    doc.add_paragraph('No se incluyen salarios administrativos permanentes, compra de computadoras, internet residencial, energía eléctrica, consultoría legal, auditoría de seguridad independiente, certificaciones, soporte fuera de horario, capacitación masiva ni migración desde sistemas existentes. Si el proyecto pasa a uso institucional, estos rubros deben cotizarse durante análisis y diseño.')

    doc.add_heading('6 Costos de infraestructura y operación', level=1)
    table(doc, ['Concepto', 'Prototipo USD mes', 'Producción base USD mes', 'Base de cálculo'], [
        ['Supabase', '0.00', '25.00', 'Plan Free para pruebas; Pro desde USD 25 al mes.'],
        ['Vercel', '0.00', '20.00', 'Hobby para uso personal; Pro USD 20 al mes.'],
        ['OpenAI API', '2.00', '5.00', 'Reserva por consumo moderado de GPT-5 nano.'],
        ['Dominio', '0.00', '1.25', 'Supuesto de USD 15 al año prorrateado.'],
        ['Monitoreo y correo', '0.00', '0.00', 'Niveles gratuitos durante el piloto; revisar al crecer.'],
        ['Total mensual', '2.00', '51.25', 'No incluye impuestos ni excedentes.'],
        ['Total anual', '24.00', '615.00', 'Doce meses de operación.'],
    ], widths=[1.5, 1.05, 1.25, 3.0], font_size=7.9)
    doc.add_paragraph('Supabase Pro incluye, entre otros recursos, 100,000 usuarios activos mensuales, 8 GB de base de datos, 250 GB de transferencia y 100 GB de almacenamiento antes de cargos excedentes. Vercel indica que Hobby es para uso personal no comercial, mientras Pro está orientado a desarrolladores profesionales y empresas. Por esa razón, el presupuesto de producción utiliza ambos planes pagados aunque el prototipo pueda funcionar con costo casi nulo.')

    doc.add_heading('7 Costo de inteligencia artificial', level=1)
    doc.add_paragraph('El código actual utiliza GPT-5 nano. La tarifa oficial consultada es de USD 0.05 por millón de tokens de entrada y USD 0.40 por millón de tokens de salida. El costo unitario es bajo, pero debe controlarse el número de invocaciones y evitar análisis repetidos de respuestas ya aprobadas o rechazadas.')
    doc.add_heading('7.1 Estimación por operación', level=2)
    table(doc, ['Supuesto por análisis', 'Tokens', 'Tarifa por millón', 'Costo USD'], [
        ['Entrada con formulario, contexto y respuestas', '2,500', '0.05', '0.000125'],
        ['Salida con estado y observación', '500', '0.40', '0.000200'],
        ['Costo estimado por análisis', '3,000', '', '0.000325'],
    ], widths=[3.05, 1.0, 1.35, 1.2])
    table(doc, ['Volumen mensual', 'Costo teórico USD', 'Reserva recomendada USD'], [
        ['1,000 análisis', '0.33', '2.00'],
        ['5,000 análisis', '1.63', '5.00'],
        ['10,000 análisis', '3.25', '10.00'],
    ], widths=[2.4, 2.0, 2.2])
    doc.add_paragraph('La reserva supera el costo teórico para cubrir variación de prompts, reintentos, generación de formularios y cambios de precio. Deben configurarse alertas, límites de gasto y registros por función. La estimación no incluye herramientas adicionales ni modelos futuros con tarifas distintas.')

    doc.add_heading('8 Escenarios presupuestarios', level=1)
    table(doc, ['Escenario', 'Desarrollo USD', 'Operación año 1 USD', 'Contingencia USD', 'Total año 1 USD'], [
        ['Académico con planes gratuitos', '8,000.00', '24.00', '800.00', '8,824.00'],
        ['Piloto profesional base', '8,000.00', '615.00', '800.00', '9,415.00'],
        ['Piloto base más dominio anual', '8,000.00', '630.00', '800.00', '9,430.00'],
        ['Sin valorar horas del equipo', '0.00', '630.00', '0.00', '630.00'],
    ], widths=[2.2, 1.15, 1.35, 1.25, 1.25], font_size=8.0)
    doc.add_paragraph('El último escenario representa desembolso de caja cuando las horas forman parte del proyecto académico. No debe utilizarse como costo total de una implementación comercial, ya que excluye el recurso más significativo: el trabajo del equipo.')
    doc.add_heading('8.1 Flujo mensual después del lanzamiento', level=2)
    table(doc, ['Mes', 'Infraestructura USD', 'Mantenimiento estimado', 'Total operativo'], [
        ['1 a 3', '51.25', '20 h mensuales × USD 10 = 200.00', '251.25'],
        ['4 a 12', '51.25', '10 h mensuales × USD 10 = 100.00', '151.25'],
        ['Después del año 1', 'Revisar consumo', 'Según incidencias y mejoras', 'Presupuesto trimestral'],
    ], widths=[1.2, 1.7, 2.8, 1.5])

    doc.add_heading('9 Beneficios y retorno estimado', level=1)
    doc.add_paragraph('Los beneficios principales son reducción del tiempo de creación, revisión y seguimiento; menor duplicidad de herramientas; mejor control de acceso; y trazabilidad de decisiones. Debido a que todavía no existen mediciones del piloto, el retorno se presenta como simulación y no como beneficio garantizado.')
    doc.add_heading('9.1 Escenario de beneficio', level=2)
    doc.add_paragraph('Supuesto esperado: 500 envíos mensuales; ahorro promedio de tres minutos de revisión por envío; 15 horas mensuales adicionales evitadas en creación, consolidación y seguimiento; costo del tiempo administrativo de USD 8 por hora.')
    table(doc, ['Concepto', 'Cálculo', 'Beneficio mensual USD'], [
        ['Revisión asistida', '500 × 3 min = 25 h × USD 8', '200.00'],
        ['Creación y seguimiento', '15 h × USD 8', '120.00'],
        ['Beneficio bruto', '', '320.00'],
        ['Infraestructura recurrente', '', '-51.25'],
        ['Beneficio neto estimado', '', '268.75'],
    ], widths=[2.15, 3.0, 1.55])
    doc.add_paragraph('Con una inversión de desarrollo de USD 8,000 y un beneficio neto de USD 268.75 mensuales, el período simple de recuperación sería aproximadamente 29.8 meses. Si las horas de desarrollo ya fueron absorbidas por el proyecto académico, el desembolso operativo anual se recuperaría en cerca de 2.3 meses. Estas cifras deben reemplazarse con datos del piloto.')
    doc.add_heading('9.2 Sensibilidad', level=2)
    table(doc, ['Escenario', 'Envíos mes', 'Beneficio neto mes USD', 'Recuperación de USD 8,000'], [
        ['Conservador', '250', '128.75', '62.1 meses'],
        ['Esperado', '500', '268.75', '29.8 meses'],
        ['Favorable', '1,000', '508.75', '15.7 meses'],
    ], widths=[1.35, 1.25, 2.0, 2.1])

    doc.add_heading('10 Comparación económica con alternativas', level=1)
    table(doc, ['Alternativa', 'Referencia mensual USD', 'Consideración económica'], [
        ['Jotform Bronze', '34', 'Menor costo mensual que la operación propia, pero con límites y menor control del producto.'],
        ['Typeform Business', '99', 'Mayor costo mensual; ofrece madurez, analítica y soporte sin inversión de desarrollo propia.'],
        ['Formstack Forms', '83 anualizado', 'Orientación empresarial y segura; el costo crece con suite, usuarios y complementos.'],
        ['Formularios Inteligentes', '51.25 + mantenimiento', 'Requiere inversión inicial, pero permite adaptar datos, roles, reglas e integraciones.'],
    ], widths=[1.6, 1.35, 3.75], font_size=8.2)
    doc.add_paragraph('Para una necesidad pequeña y genérica, adquirir una solución existente es económicamente más conveniente. El desarrollo propio se justifica cuando la organización necesita reglas particulares, integración con sistemas internos, control del modelo de datos, segmentación departamental o reutilización del producto en varios procesos. La decisión no debe basarse solamente en la mensualidad.')

    doc.add_heading('11 Riesgos económicos y medidas de control', level=1)
    table(doc, ['Riesgo', 'Impacto', 'Medida de control'], [
        ['Crecimiento de alcance', 'Más horas y retraso del lanzamiento.', 'Congelar el MVP y aprobar cambios mediante prioridades y estimación.'],
        ['Consumo inesperado de IA', 'Facturación variable.', 'Bloquear análisis repetidos, registrar tokens y establecer límites de gasto.'],
        ['Almacenamiento de imágenes en base de datos', 'Mayor tamaño y transferencia.', 'Migrar fotografías a Supabase Storage y guardar solo rutas.'],
        ['Dependencia de proveedores', 'Cambios de precio o servicio.', 'Separar adaptadores, exportar datos y mantener alternativas documentadas.'],
        ['Fallas de seguridad', 'Costos operativos y reputacionales.', 'Revisar RLS, autenticar Edge Functions y ejecutar pruebas antes del piloto.'],
        ['Baja adopción', 'El ahorro esperado no se materializa.', 'Piloto medible, capacitación breve y ajustes según retroalimentación.'],
        ['Mantenimiento subestimado', 'Acumulación de defectos y deuda técnica.', 'Reservar horas mensuales y revisar indicadores trimestralmente.'],
    ], widths=[1.5, 2.05, 3.2], font_size=8.0)

    doc.add_heading('12 Conclusión de factibilidad', level=1)
    doc.add_paragraph('La factibilidad económica es favorable para continuar el MVP y ejecutar un piloto. El desembolso de infraestructura es bajo y predecible frente al valor potencial de automatizar procesos repetitivos. La mayor inversión corresponde al desarrollo, por lo que la viabilidad depende de reutilizar la plataforma en varios formularios o departamentos y de demostrar ahorro real de tiempo.')
    doc.add_paragraph('La recomendación es iniciar con planes gratuitos durante desarrollo, pasar a Supabase Pro y Vercel Pro al utilizar la aplicación profesionalmente, mantener una reserva mensual de IA y medir durante el piloto: número de envíos, tiempo medio de creación, tiempo de revisión, porcentaje de recomendaciones aceptadas, almacenamiento y costo por solicitud. Con esos datos podrá elaborarse una segunda estimación posterior al análisis y diseño.')

    doc.add_heading('13 Fuentes consultadas', level=1)
    source.counter = 0
    source(doc, 'Supabase, precios y recursos incluidos', 'https://supabase.com/pricing')
    source(doc, 'Vercel, planes Hobby y Pro', 'https://vercel.com/pricing')
    source(doc, 'OpenAI, GPT-5 nano y precios por token', 'https://developers.openai.com/api/docs/models/gpt-5-nano')
    source(doc, 'Typeform, planes y precios', 'https://www.typeform.com/pricing')
    source(doc, 'Jotform, características y precios', 'https://www.jotform.com/pricing/')
    source(doc, 'Formstack, precios de Forms', 'https://forms.formstack.com/pricing')
    source(doc, 'Documentación interna del proyecto', 'docs/PLANTEAMIENTO.md y docs/IMPLEMENTACION.md')
    doc.add_heading('Nota sobre la estimación', level=2)
    doc.add_paragraph('Los precios corresponden a referencias públicas consultadas en la fecha de corte. No constituyen cotizaciones vinculantes. Los supuestos de horas, volumen, dominio, mantenimiento y ahorro deben sustituirse por datos reales en la siguiente revisión del estudio.')
    path = OUT / 'Formularios_Inteligentes_Factibilidad_Economica.docx'
    doc.save(path)
    return path


if __name__ == '__main__':
    print(build_preliminary())
    print(build_economic())
