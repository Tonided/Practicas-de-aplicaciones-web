"""Pruebas de extremo a extremo en un navegador real (Chromium) contra el servidor real.
Requisitos:  Node 22.13+,  pip install playwright  y  playwright install chromium
Ejecutar desde la carpeta del proyecto:   python3 tests/e2e_navegador.py
Usa una base de datos temporal y contraseñas aleatorias; no toca data/becas.db."""
import os, secrets, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUERTO = 8765
BASE = f'http://127.0.0.1:{PUERTO}'
BD = os.path.join(tempfile.mkdtemp(), 'e2e.db')
ENTORNO = {**os.environ, 'PORT': str(PUERTO), 'HOST': '127.0.0.1', 'DB_PATH': BD}
errores, resultados = [], []
ESPERADOS = [(401, '/api/login'), (409, '/api/registro'), (400, '/api/becas')]   # errores que la prueba provoca a propósito

def ok(cond, msg):
    resultados.append(bool(cond)); print(('OK    ' if cond else 'FALLA ') + msg)

def clave(): return 'Aa1' + secrets.token_hex(6)

def crear_personal(rol, email):
    c = clave()
    subprocess.run(['node', 'server/crear-usuario.js', '--rol', rol, '--email', email, '--nombres', 'Personal', '--apellidos', rol],
                   cwd=RAIZ, env={**ENTORNO, 'BECAS_CLAVE': c}, check=True, capture_output=True)
    return c

def iniciar_servidor():
    p = subprocess.Popen(['node', 'server/index.js'], cwd=RAIZ, env=ENTORNO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try: urllib.request.urlopen(BASE + '/api/salud', timeout=1); return p
        except Exception: time.sleep(0.2)
    raise RuntimeError('el servidor no arrancó')

def contexto(b, **kw):
    ctx = b.new_context(accept_downloads=True, **kw); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errores.append(f'excepción: {e}'))
    pg.on('console', lambda m: errores.append(f'consola: {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    def resp(r):
        if r.status >= 400 and not any(r.status == s and u in r.url for s, u in ESPERADOS):
            try: cuerpo = r.text()[:120]
            except Exception: cuerpo = '?'
            errores.append(f'HTTP {r.status} {r.url} (desde {pg.url}) {cuerpo}')
    pg.on('response', resp)
    return ctx, pg

def entrar(pg, correo, c, destino):
    pg.goto(f'{BASE}/login/index.html'); pg.fill('#email', correo); pg.fill('#clave', c); pg.click('#btn-ingresar')
    pg.wait_for_url(f'**/{destino}/index.html')

def sin_desborde(pg): return pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
def titulo(pg): return pg.locator('h1').first.inner_text()
PDF = lambda n: {'name': n, 'mimeType': 'application/pdf', 'buffer': b'%PDF-1.4 prueba'}

servidor = iniciar_servidor()
adm_mail, ver_mail = 'admin@uleam.test', 'verificador@uleam.test'
adm_clave, ver_clave = crear_personal('admin', adm_mail), crear_personal('verificador', ver_mail)
est_mail, est_clave = f'estudiante{secrets.token_hex(2)}@correo.ec', clave()
try:
    with sync_playwright() as p:
        b = p.chromium.launch()

        # --- Admin sin datos: verificación y reportes vacíos ---
        ctx, pg = contexto(b)
        entrar(pg, adm_mail, adm_clave, 'admin'); pg.wait_for_selector('#tabla-body .vacio:not(:has(.spinner))')
        ok(titulo(pg) == 'Solicitudes', 'admin: entra y ve el panel de verificación vacío (no queda en blanco)')
        pg.click('.sidebar a[href="reportes.html"]'); pg.wait_for_url('**/admin/reportes.html'); pg.wait_for_selector('#btn-csv:not([disabled])')
        ok(titulo(pg) == 'Reportes generales' and pg.locator('#kpis .kpi').count() == 4 and 'Aún no hay postulaciones' in pg.locator('#resultado').inner_text(), 'reportes: sin datos muestra indicadores y mensajes vacíos (sin NaN)')
        ok('NaN' not in pg.locator('body').inner_text(), 'reportes: no aparece NaN ni undefined')
        ctx.close()

        # --- Registro de la estudiante ---
        ctx, pg = contexto(b)
        pg.goto(f'{BASE}/registro/index.html')
        for k, v in [('nombres', 'Juan Carlos'), ('apellidos', 'Pérez Mero'), ('email', est_mail), ('cedula', '1312345678'), ('clave', est_clave), ('confirmacion', est_clave)]: pg.fill(f'#{k}', v)
        pg.check('#acepta'); pg.click('#btn-registrar'); pg.wait_for_url('**/login/index.html?registrado=1')
        ok(True, 'registro: cuenta creada por la interfaz')
        ctx.close()

        # --- Admin: configuración de becas ---
        ctx, pg = contexto(b)
        entrar(pg, adm_mail, adm_clave, 'admin'); pg.goto(f'{BASE}/admin/becas.html'); pg.wait_for_selector('#tabla-body tr[data-id]')
        ok(titulo(pg) == 'Configuración de becas' and pg.locator('#tabla-body tr[data-id]').count() == 3, 'config: lista las 3 becas iniciales')
        pg.click('#btn-nueva'); pg.click('#modal-ok'); pg.wait_for_selector('#modal-error:not([hidden])')
        ok(pg.locator('#modal-error').is_visible(), 'config: crear beca vacía muestra error de validación')
        pg.fill('#f-nombre', 'Beca de Investigación'); pg.fill('#f-desc', 'Apoyo a proyectos de investigación.')
        pg.fill('.req-fila:nth-child(1) .req-desc', 'Carta de motivación')
        pg.click('[data-add-req]'); pg.fill('.req-fila:nth-child(2) .req-desc', 'Promedio mínimo de 8'); pg.uncheck('.req-fila:nth-child(2) .req-doc')
        pg.click('#modal-ok'); pg.wait_for_selector("#tabla-body tr:has-text('Beca de Investigación')")
        ok('2 requisitos (1 documento)' in pg.locator("#tabla-body tr:has-text('Beca de Investigación')").inner_text(), 'config: crea una beca con requisitos y aparece en la tabla')
        pg.click('[data-accion="editar"] >> nth=0'); pg.wait_for_selector('#f-nombre')
        ok(pg.locator('.req-fila').count() == 2, 'config: Editar carga los requisitos existentes'); pg.click('[data-cerrar]')
        pg.click("tr:has-text('Beca Deportiva') [data-accion='alternar']"); pg.click('#modal-ok')
        pg.wait_for_selector("tr:has-text('Beca Deportiva') .badge:text-is('Deshabilitada')")
        ok(True, 'config: deshabilitar una beca la marca como "Deshabilitada"')
        ctx.close()

        # --- Estudiante: explorador, detalle, Retroceder y postulación ---
        ctx, pg = contexto(b)
        entrar(pg, est_mail, est_clave, 'estudiante'); pg.wait_for_selector('#rejilla .beca-card')
        ok(titulo(pg) == 'Becas disponibles' and pg.locator('#rejilla .beca-card').count() == 3, 'estudiante: el explorador muestra solo las 3 becas habilitadas (la deshabilitada no aparece)')
        ok('Deportiva' not in pg.locator('#rejilla').inner_text(), 'estudiante: la beca deshabilitada está oculta')
        pg.fill('#buscar', 'invest'); ok(pg.locator('#rejilla .beca-card:visible').count() == 1, 'estudiante: la búsqueda filtra las tarjetas')
        pg.fill('#buscar', 'zzz'); ok(pg.locator('#sin-resultados').is_visible(), 'estudiante: búsqueda sin resultados muestra mensaje')
        pg.fill('#buscar', 'invest')
        pg.click(".beca-card:visible a"); pg.wait_for_selector('.detalle')
        ok('Carta de motivación' in pg.locator('.requisitos').inner_text() and 'Condición' in pg.locator('.requisitos').inner_text(), 'estudiante: el detalle muestra los requisitos (documento y condición)')
        pg.click('[data-volver]'); pg.wait_for_selector('#rejilla')
        ok(titulo(pg) == 'Becas disponibles', 'estudiante: "Retroceder" vuelve al explorador')
        pg.click(".beca-card:has-text('Investigación') a"); pg.wait_for_selector('#btn-postular'); pg.click('#btn-postular'); pg.click('#modal-ok')
        pg.wait_for_selector('#estado-badge')
        ok(pg.locator('#estado-badge').inner_text() == 'En progreso' and pg.locator('#estado-detalle').inner_text() == 'Sin documentos', 'seguimiento: tras postular muestra "En progreso" (Sin documentos)')
        ok(pg.locator('input[type="file"]').count() == 1, 'seguimiento: el formulario pide solo los documentos de esa beca')
        pg.set_input_files('input[type="file"]', {'name': 'x.png', 'mimeType': 'image/png', 'buffer': b'x'}); pg.click('#btn-submit-docs')
        ok(pg.locator('#form-error').is_visible(), 'seguimiento: un archivo que no es PDF muestra error')
        pg.set_input_files('input[type="file"]', PDF('motivacion.pdf')); pg.click('#btn-submit-docs')
        pg.wait_for_selector("#estado-detalle:text-is('En verificación')")
        ok(pg.locator('#estado-badge').inner_text() == 'En progreso', 'seguimiento: documentos enviados, sigue "En progreso" (En verificación)')
        pg.click('[data-volver]'); pg.wait_for_selector('#rejilla')
        ok(titulo(pg) == 'Becas disponibles', 'estudiante: "Retroceder" desde Mis postulaciones vuelve al explorador')
        pg.goto(f'{BASE}/estudiante/index.html#/postulaciones'); pg.wait_for_selector('#estado-badge'); pg.click('[data-volver]'); pg.wait_for_selector('#rejilla')
        ok(titulo(pg) == 'Becas disponibles', 'estudiante: entrando directo a una pantalla, "Retroceder" lleva al explorador')
        pg.click(".beca-card--actual a"); pg.wait_for_selector('.detalle')
        ok('postulación actual' in pg.locator('.detalle').inner_text(), 'estudiante: en su beca el detalle indica que es su postulación actual')
        ok(pg.evaluate("Becas.estadoPublico('rechazada').texto") == 'Rechazada' and pg.evaluate("Becas.estadoPublico('aprobada').texto") == 'Aceptada' and pg.evaluate("Becas.estadoPublico('con_novedades').texto") == 'En progreso', 'estados: Rechazada, Aceptada y En progreso se resumen correctamente')
        pg.goto(f'{BASE}/admin/index.html'); pg.wait_for_url('**/estudiante/index.html')
        ok(True, 'permisos: un estudiante no puede abrir el panel de administrador')
        for ruta in ('reportes', 'becas'):
            pg.goto(f'{BASE}/admin/{ruta}.html'); pg.wait_for_url('**/estudiante/index.html')
        ok(True, 'permisos: ni Reportes ni Configuración de becas')
        ctx.close()

        # --- Verificador: novedades -> estudiante corrige -> válida ---
        ctx, pg = contexto(b)
        entrar(pg, ver_mail, ver_clave, 'verificador'); pg.wait_for_selector('[data-accion="novedades"]')
        pg.click('[data-accion="novedades"]'); pg.fill('#motivo', 'Carta ilegible'); pg.click('#modal-ok')
        pg.select_option('#filtro', 'todas'); pg.wait_for_selector("#tabla-body .badge:text-is('Con novedades')")
        ok(True, 'verificador: marca "Con novedades"')
        ctx.close()
        ctx, pg = contexto(b)
        entrar(pg, est_mail, est_clave, 'estudiante'); pg.wait_for_selector('#badge-notif:not([hidden])')
        ok(int(pg.locator('#badge-notif').inner_text()) >= 1, 'estudiante: el contador de notificaciones sin leer aparece en la pestaña')
        pg.click('[data-tab="postulaciones"]'); pg.wait_for_selector('.alerta--warn')
        ok('Carta ilegible' in pg.locator('.alerta--warn').inner_text() and 'Carta ilegible' in pg.locator('.timeline').inner_text(), 'seguimiento: ve la observación y queda en el historial')
        pg.set_input_files('input[type="file"]', PDF('motivacion2.pdf')); pg.click('#btn-submit-docs'); pg.wait_for_selector("#estado-detalle:text-is('En verificación')")
        pg.click('#btn-leidas'); pg.wait_for_selector('#badge-notif[hidden]', state='attached')
        ok(True, 'seguimiento: "Marcar como leídas" quita el contador')
        ctx.close()
        ctx, pg = contexto(b)
        entrar(pg, ver_mail, ver_clave, 'verificador'); pg.wait_for_selector('[data-accion="valida"]'); pg.click('[data-accion="valida"]'); pg.click('#modal-ok')
        pg.select_option('#filtro', 'todas'); pg.wait_for_selector("#tabla-body .badge:text-is('Documentación válida')")
        ok(True, 'verificador: marca "Documentación válida"')
        ctx.close()

        # --- Admin: editar solicitud, aprobar, reportes con datos ---
        ctx, pg = contexto(b)
        entrar(pg, adm_mail, adm_clave, 'admin'); pg.wait_for_selector('#tabla-body tr[data-id]')
        pg.click('[data-accion="editar"]'); pg.wait_for_selector('#tipo-beca')
        opciones = pg.locator('#tipo-beca option').all_inner_texts()
        ok(len(opciones) == 3 and not any('Deportiva' in o for o in opciones), 'admin: Editar ofrece solo becas habilitadas'); pg.click('[data-cerrar]')
        pg.click('[data-accion="aprobar"]'); pg.click('#modal-ok'); pg.select_option('#filtro', 'todas'); pg.wait_for_selector("#tabla-body .badge:text-is('Aprobada')")
        ok(True, 'admin: Aprobar -> "Aprobada"')
        pg.goto(f'{BASE}/admin/reportes.html'); pg.wait_for_selector('.donut')
        ok(pg.locator('#ranking .barras li').count() == 4 and 'Beca de Investigación' in pg.locator('#ranking').inner_text(), 'reportes: la beca más solicitada aparece en el ranking')
        ok('1' in pg.locator('#kpis').inner_text() and '100%' in pg.locator('#kpis').inner_text(), 'reportes: la tasa de aceptación refleja la aprobación (100%)')
        with pg.expect_download() as d: pg.click('#btn-csv')
        ok(d.value.suggested_filename.startswith('reporte-becas-') and d.value.suggested_filename.endswith('.csv'), 'reportes: Descargar CSV genera el archivo')
        csv = open(d.value.path(), encoding='utf-8-sig').read()
        ok('Beca de Investigación' in csv and 'Aceptadas' in csv, 'reportes: el CSV contiene los datos de las becas')
        ctx.close()

        # --- Estudiante ve "Aceptada"; el servidor se reinicia ---
        servidor.terminate(); servidor.wait(); servidor = iniciar_servidor()
        ctx, pg = contexto(b)
        entrar(pg, est_mail, est_clave, 'estudiante'); pg.click('[data-tab="postulaciones"]'); pg.wait_for_selector('#estado-badge')
        ok(pg.locator('#estado-badge').inner_text() == 'Aceptada', 'persistencia: tras reiniciar el servidor, el estudiante ve su postulación "Aceptada"')
        ctx.close()

        # --- Móvil + capturas ---
        ctx, pg = contexto(b, viewport={'width': 390, 'height': 800})
        pg.goto(f'{BASE}/login/index.html'); entrar(pg, est_mail, est_clave, 'estudiante'); pg.wait_for_selector('#rejilla')
        ok(sin_desborde(pg), 'móvil: explorador de becas sin desborde horizontal')
        pg.screenshot(path='/tmp/est_movil.png', full_page=True)
        pg.click('[data-tab="postulaciones"]'); pg.wait_for_selector('#estado-badge'); ok(sin_desborde(pg), 'móvil: Mis postulaciones sin desborde horizontal')
        pg.screenshot(path='/tmp/post_movil.png', full_page=True)
        ctx.close()
        ctx, pg = contexto(b, viewport={'width': 390, 'height': 800})
        entrar(pg, adm_mail, adm_clave, 'admin')
        for ruta in ('reportes', 'becas'):
            pg.goto(f'{BASE}/admin/{ruta}.html'); pg.wait_for_selector('#kpis .kpi' if ruta == 'reportes' else '#tabla-body tr[data-id]'); ok(sin_desborde(pg), f'móvil: admin/{ruta} sin desborde horizontal')
        ctx.close()
        ctx, pg = contexto(b, viewport={'width': 1280, 'height': 860})
        entrar(pg, est_mail, est_clave, 'estudiante'); pg.wait_for_selector('#rejilla'); pg.screenshot(path='/tmp/est_becas.png')
        pg.click('[data-tab="postulaciones"]'); pg.wait_for_selector('.timeline'); pg.screenshot(path='/tmp/est_post.png', full_page=True)
        ctx.close()
        ctx, pg = contexto(b, viewport={'width': 1280, 'height': 900})
        entrar(pg, adm_mail, adm_clave, 'admin'); pg.goto(f'{BASE}/admin/reportes.html'); pg.wait_for_selector('.donut'); pg.wait_for_timeout(700); pg.screenshot(path='/tmp/adm_rep.png', full_page=True)
        pg.goto(f'{BASE}/admin/becas.html'); pg.wait_for_selector('#tabla-body tr[data-id]'); pg.click("tr:has-text('Investigación') [data-accion='editar']"); pg.wait_for_selector('#f-nombre'); pg.screenshot(path='/tmp/adm_conf.png')
        ctx.close(); b.close()
finally:
    servidor.terminate()

print('\nErrores de consola / recursos inesperados:', errores or 'ninguno')
fallos = resultados.count(False)
print(f'\n{len(resultados) - fallos} de {len(resultados)} comprobaciones correctas' + (f' - {fallos} FALLO(S)' if fallos else ''))
sys.exit(1 if fallos or errores else 0)
