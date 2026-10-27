'use strict';
/* Pruebas de integración del servidor (HTTP real + SQLite real en archivos temporales).
   Ejecutar:  npm test   (o   node --test tests/api.test.js) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { abrir } = require('../server/db');
const { crearApp } = require('../server/app');
const { crearUsuario } = require('../server/usuarios');
const { verificarClave } = require('../server/seguridad');
const { DatabaseSync } = require('node:sqlite');

const RAIZ = path.resolve(__dirname, '..');
const clave = () => crypto.randomBytes(6).toString('hex') + 'Aa1';   // contraseñas de prueba aleatorias: nada fijo en el código
const PDF = (n) => ({ nombre: n, bytes: 1500 });
const DOCS = { cedula: PDF('cedula.pdf'), notas: PDF('notas.pdf') };
const tmpBd = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'becas-')), 'test.db');

async function iniciar(rutaBd, limites = { login: 1000, registro: 1000 }) {
  const db = abrir(rutaBd);
  const srv = crearApp({ db, raiz: RAIZ, limites });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { db, base, cerrar: async () => { srv.closeAllConnections(); await new Promise(r => srv.close(r)); db.close(); } };
}
/* Cliente HTTP con su propia cookie de sesión */
function cliente(base) {
  let cookie = '';
  const llamar = async (metodo, ruta, cuerpo, cabeceras = {}) => {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: { ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...cabeceras },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined
    });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let datos = {}; try { datos = await r.json(); } catch { /* respuesta no JSON */ }
    return { status: r.status, datos, cabeceras: r.headers };
  };
  return { get: (u) => llamar('GET', u), post: (u, c = {}, h) => llamar('POST', u, c, h), patch: (u, c) => llamar('PATCH', u, c), llamar, get cookie() { return cookie; }, set cookie(v) { cookie = v; } };
}
const registro = (o = {}) => { const c = clave(); return { nombres: 'Ana María', apellidos: 'Loor Zambrano', email: `ana${crypto.randomBytes(3).toString('hex')}@correo.ec`, cedula: String(1300000000 + Math.floor(Math.random() * 99999999)), clave: c, confirmacion: c, acepta: true, ...o }; };
async function crearEstudiante(app) { const d = registro(); const c = cliente(app.base); assert.equal((await c.post('/api/registro', d)).status, 201); assert.equal((await c.post('/api/login', { email: d.email, clave: d.clave })).status, 200); return { c, d }; }
async function crearPersonal(app, rol) { const p = clave(), email = `${rol}${crypto.randomBytes(3).toString('hex')}@uleam.test`; await crearUsuario(app.db, { nombres: 'Personal', apellidos: rol, email, clave: p, rol }); const c = cliente(app.base); assert.equal((await c.post('/api/login', { email, clave: p })).status, 200); return c; }

test('Registro y autenticación', async (t) => {
  const ruta = tmpBd();
  let app = await iniciar(ruta);
  const d = registro();

  await t.test('un estudiante puede crear una cuenta y queda guardada en la base de datos', async () => {
    const r = await cliente(app.base).post('/api/registro', d);
    assert.equal(r.status, 201);
    const fila = app.db.prepare('SELECT * FROM usuarios WHERE email = ?').get(d.email);
    assert.equal(fila.rol, 'estudiante');
    assert.equal(fila.cedula, d.cedula);
  });
  await t.test('la contraseña se guarda con hash scrypt, nunca en texto plano', async () => {
    const fila = app.db.prepare('SELECT clave_hash FROM usuarios WHERE email = ?').get(d.email);
    assert.match(fila.clave_hash, /^scrypt\$/);
    assert.ok(!fila.clave_hash.includes(d.clave));
    assert.equal(await verificarClave(d.clave, fila.clave_hash), true);
    assert.equal(await verificarClave(d.clave + 'x', fila.clave_hash), false);
  });
  await t.test('no se permite repetir correo (sin distinguir mayúsculas) ni cédula', async () => {
    const a = await cliente(app.base).post('/api/registro', registro({ email: d.email.toUpperCase() }));
    assert.equal(a.status, 409); assert.ok(a.datos.campos.email);
    const b = await cliente(app.base).post('/api/registro', registro({ cedula: d.cedula }));
    assert.equal(b.status, 409); assert.ok(b.datos.campos.cedula);
  });
  await t.test('el servidor valida los campos (no confía en el navegador)', async () => {
    const malos = [{ clave: 'corta1', confirmacion: 'corta1' }, { clave: 'soloLetrasAqui', confirmacion: 'soloLetrasAqui' }, { confirmacion: 'otra-Distinta1' },
      { email: 'no-es-correo' }, { cedula: '12345' }, { cedula: '13ABC45678' }, { acepta: false }, { nombres: '' }];
    for (const m of malos) {
      const r = await cliente(app.base).post('/api/registro', registro(m));
      assert.equal(r.status, 400, JSON.stringify(m)); assert.ok(Object.keys(r.datos.campos).length >= 1);
    }
  });
  await t.test('el rol no se puede elevar desde el formulario ni con una petición manipulada', async () => {
    for (const rol of ['admin', 'verificador']) {
      const r = registro(); r.rol = rol; r.activo = 1; r.id = 1;
      assert.equal((await cliente(app.base).post('/api/registro', r)).status, 201);
      assert.equal(app.db.prepare('SELECT rol FROM usuarios WHERE email = ?').get(r.email).rol, 'estudiante');
    }
  });
  await t.test('un usuario registrado inicia sesión; la cookie es HttpOnly y SameSite', async () => {
    const c = cliente(app.base);
    const r = await c.post('/api/login', { email: d.email, clave: d.clave });
    assert.equal(r.status, 200); assert.equal(r.datos.usuario.rol, 'estudiante');
    const sc = r.cabeceras.get('set-cookie'); assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Lax/);
    assert.ok(!JSON.stringify(r.datos).includes(d.clave) && !JSON.stringify(r.datos).includes('scrypt'));
  });
  await t.test('credenciales incorrectas no dan acceso y no revelan si el correo existe', async () => {
    const a = await cliente(app.base).post('/api/login', { email: d.email, clave: 'Incorrecta123' });
    const b = await cliente(app.base).post('/api/login', { email: 'nadie@correo.ec', clave: 'Incorrecta123' });
    assert.equal(a.status, 401); assert.equal(b.status, 401); assert.equal(a.datos.error, b.datos.error);
  });
  await t.test('cerrar sesión invalida la sesión en el servidor (aunque se reutilice la cookie)', async () => {
    const c = cliente(app.base); await c.post('/api/login', { email: d.email, clave: d.clave });
    const vieja = c.cookie;
    assert.equal((await c.get('/api/sesion')).datos.usuario.email, d.email);
    await c.post('/api/logout');
    c.cookie = vieja;
    assert.equal((await c.get('/api/sesion')).datos.usuario, null);
    assert.equal((await c.get('/api/solicitudes')).status, 401);
  });
  await t.test('la cuenta sigue existiendo tras reiniciar el servidor', async () => {
    await app.cerrar();
    app = await iniciar(ruta);   // mismo archivo de base de datos
    const r = await cliente(app.base).post('/api/login', { email: d.email, clave: d.clave });
    assert.equal(r.status, 200);
  });
  await t.test('las migraciones se aplican una sola vez', () => {
    const archivos = fs.readdirSync(path.join(RAIZ, 'database/migrations')).filter(f => f.endsWith('.sql')).length;
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM migraciones').get().n, archivos);
  });
  await app.cerrar();
});

test('Solicitudes, estados y permisos en el servidor', async (t) => {
  const app = await iniciar(tmpBd());
  const { c: est } = await crearEstudiante(app);
  const { c: otro } = await crearEstudiante(app);
  const ver = await crearPersonal(app, 'verificador');
  const adm = await crearPersonal(app, 'admin');

  await t.test('sin sesión no se puede operar', async () => {
    const anon = cliente(app.base);
    assert.equal((await anon.get('/api/solicitudes')).status, 401);
    assert.equal((await anon.post('/api/solicitudes/1/estado', { estado: 'aprobada' })).status, 401);
    assert.equal((await anon.get('/api/notificaciones')).status, 401);
  });
  let B = [];
  await t.test('un estudiante nuevo no tiene solicitudes y puede postular una sola vez', async () => {
    B = (await est.get('/api/becas')).datos.becas.map(b => b.id);
    assert.equal(B.length, 3, 'las 3 becas iniciales de la migración');
    assert.deepEqual((await est.get('/api/solicitudes')).datos.solicitudes, []);
    assert.equal((await est.post('/api/solicitudes', { beca_id: 9999 })).status, 400);
    const r = await est.post('/api/solicitudes', { beca_id: B[0] });
    assert.equal(r.status, 201); assert.equal(r.datos.solicitud.estado, 'sin_documentos'); assert.equal(r.datos.solicitud.beca, 'Beca Académica');
    assert.equal((await est.post('/api/solicitudes', { beca_id: B[1] })).status, 409);
    await otro.post('/api/solicitudes', { beca_id: B[1] });
  });
  await t.test('verificador y administrador no pueden postular', async () => {
    assert.equal((await ver.post('/api/solicitudes', { beca_id: B[0] })).status, 403);
    assert.equal((await adm.post('/api/solicitudes', { beca_id: B[0] })).status, 403);
  });
  const miId = async () => (await est.get('/api/solicitudes')).datos.solicitudes[0].id;
  await t.test('el estudiante solo ve y toca su solicitud', async () => {
    const id = await miId();
    assert.equal((await est.get('/api/solicitudes')).datos.solicitudes.length, 1);
    assert.equal((await otro.post(`/api/solicitudes/${id}/estado`, { estado: 'en_verificacion', documentos: DOCS })).status, 403);
  });
  await t.test('subir documentos exige PDF de hasta 2 MB (validado en el servidor)', async () => {
    const id = await miId();
    assert.equal((await est.post(`/api/solicitudes/${id}/estado`, { estado: 'en_verificacion' })).status, 400);
    assert.equal((await est.post(`/api/solicitudes/${id}/estado`, { estado: 'en_verificacion', documentos: { cedula: PDF('c.png'), notas: PDF('n.pdf') } })).status, 400);
    assert.equal((await est.post(`/api/solicitudes/${id}/estado`, { estado: 'en_verificacion', documentos: { cedula: { nombre: 'c.pdf', bytes: 3 * 1024 * 1024 }, notas: PDF('n.pdf') } })).status, 400);
    const r = await est.post(`/api/solicitudes/${id}/estado`, { estado: 'en_verificacion', documentos: DOCS });
    assert.equal(r.status, 200); assert.equal(r.datos.solicitud.estado, 'en_verificacion');
  });
  await t.test('cada rol solo puede hacer sus transiciones', async () => {
    const id = await miId();
    assert.equal((await est.post(`/api/solicitudes/${id}/estado`, { estado: 'aprobada' })).status, 403);
    assert.equal((await ver.post(`/api/solicitudes/${id}/estado`, { estado: 'aprobada' })).status, 403);
    assert.equal((await adm.post(`/api/solicitudes/${id}/estado`, { estado: 'aprobada' })).status, 403, 'el admin no resuelve lo no verificado');
    assert.equal((await ver.post(`/api/solicitudes/${id}/estado`, { estado: 'con_novedades' })).status, 400, 'exige motivo');
    assert.equal((await ver.post(`/api/solicitudes/${id}/estado`, { estado: 'con_novedades', detalle: 'Cédula ilegible' })).status, 200);
    assert.equal((await est.post(`/api/solicitudes/${id}/estado`, { estado: 'en_verificacion', documentos: DOCS })).status, 200, 'el estudiante reenvía');
    assert.equal((await ver.post(`/api/solicitudes/${id}/estado`, { estado: 'documentacion_valida' })).status, 200);
  });
  await t.test('editar es exclusivo del administrador y solo si no está resuelta', async () => {
    const id = await miId();
    assert.equal((await est.patch(`/api/solicitudes/${id}`, { beca_id: B[1] })).status, 403);
    assert.equal((await ver.patch(`/api/solicitudes/${id}`, { beca_id: B[1] })).status, 403);
    assert.equal((await adm.patch(`/api/solicitudes/${id}`, { beca_id: 9999 })).status, 400);
    assert.equal((await adm.patch(`/api/solicitudes/${id}`, { beca_id: B[0] })).status, 400, 'sin cambios');
    assert.equal((await adm.patch(`/api/solicitudes/${id}`, { beca_id: B[1] })).status, 200);
  });
  await t.test('el administrador rechaza con motivo y aprueba; lo resuelto no cambia más', async () => {
    const id = await miId();
    assert.equal((await adm.post(`/api/solicitudes/${id}/estado`, { estado: 'rechazada' })).status, 400);
    const r = await adm.post(`/api/solicitudes/${id}/estado`, { estado: 'aprobada' });
    assert.equal(r.status, 200); assert.equal(r.datos.solicitud.estado, 'aprobada');
    assert.equal((await adm.post(`/api/solicitudes/${id}/estado`, { estado: 'rechazada', detalle: 'x' })).status, 403);
    assert.equal((await adm.patch(`/api/solicitudes/${id}`, { beca_id: B[0] })).status, 409);
  });
  await t.test('el historial conserva cada paso y las observaciones del verificador', async () => {
    const s = (await est.get('/api/solicitudes')).datos.solicitudes[0];
    assert.ok(s.historial.some(h => h.estado === 'con_novedades' && h.detalle === 'Cédula ilegible'));
    assert.ok(s.historial.some(h => h.accion === 'edicion'));
    assert.ok(Array.isArray(s.requisitos) && s.requisitos.some(r => r.es_documento), 'la solicitud trae los requisitos de su beca');
    assert.ok(!JSON.stringify(s).includes('@'), 'no se exponen correos del personal');
  });
  await t.test('las notificaciones son privadas y se marcan como leídas', async () => {
    const mias = (await est.get('/api/notificaciones')).datos.notificaciones;
    assert.ok(mias.length >= 5 && mias.some(n => !n.leida));
    assert.equal((await ver.get('/api/notificaciones')).datos.notificaciones.length, 0);
    await est.post('/api/notificaciones/leidas');
    assert.ok((await est.get('/api/notificaciones')).datos.notificaciones.every(n => n.leida));
  });
  await t.test('el administrador y el verificador ven todas las solicitudes', async () => {
    assert.equal((await adm.get('/api/solicitudes')).datos.solicitudes.length, 2);
    assert.equal((await ver.get('/api/solicitudes')).datos.solicitudes.length, 2);
  });
  await app.cerrar();
});

test('Seguridad del servidor', async (t) => {
  const app = await iniciar(tmpBd());
  await t.test('rechaza cuerpos que no son JSON y orígenes ajenos', async () => {
    const c = cliente(app.base);
    assert.equal((await c.llamar('POST', '/api/login', undefined, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await c.post('/api/login', { email: 'a@b.ec', clave: 'x' }, { Origin: 'http://sitio-malicioso.example' })).status, 403);
  });
  await t.test('no sirve código del servidor, la base de datos ni configuración', async () => {
    for (const ruta of ['/server/app.js', '/database/migrations/001_inicial.sql', '/data/becas.db', '/.env', '/.env.example', '/package.json', '/tests/api.test.js', '/docs/README.md', '/assets/../server/app.js', '/%2e%2e/server/app.js', '/assets/%2e%2e/server/db.js']) {
      const r = await fetch(app.base + ruta); assert.equal(r.status, 404, ruta);
    }
  });
  await t.test('sirve el frontend con cabeceras de seguridad', async () => {
    const r = await fetch(app.base + '/login/');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal((await fetch(app.base + '/')).status, 200);
  });
  await t.test('limita los intentos fallidos de inicio de sesión', async () => {
    const limitado = await iniciar(tmpBd(), { login: 3, registro: 1000 });
    const c = cliente(limitado.base);
    for (let i = 0; i < 3; i++) assert.equal((await c.post('/api/login', { email: 'a@b.ec', clave: 'Mala12345' })).status, 401);
    assert.equal((await c.post('/api/login', { email: 'a@b.ec', clave: 'Mala12345' })).status, 429);
    await limitado.cerrar();
  });
  await app.cerrar();
});

test('Becas, requisitos y reportes', async (t) => {
  const app = await iniciar(tmpBd());
  const adm = await crearPersonal(app, 'admin');
  const ver = await crearPersonal(app, 'verificador');
  const { c: est } = await crearEstudiante(app);
  const nueva = (o = {}) => ({ nombre: 'Beca de Investigación ' + crypto.randomBytes(2).toString('hex'), descripcion: 'Apoyo a proyectos.', requisitos: [{ descripcion: 'Carta de motivación', es_documento: true }, { descripcion: 'Promedio mínimo de 8', es_documento: false }], ...o });
  let beca;

  await t.test('solo el administrador configura becas; el estudiante solo ve las habilitadas', async () => {
    assert.equal((await cliente(app.base).get('/api/becas')).status, 401);
    assert.equal((await est.post('/api/becas', nueva())).status, 403);
    assert.equal((await ver.post('/api/becas', nueva())).status, 403);
    assert.equal((await est.patch('/api/becas/1', { activa: false })).status, 403);
    const lista = (await adm.get('/api/becas')).datos.becas;
    assert.equal(lista.length, 3); assert.ok(lista.every(b => typeof b.solicitudes === 'number' && b.requisitos.length === 2));
    assert.ok((await est.get('/api/becas')).datos.becas.every(b => b.solicitudes === undefined), 'el estudiante no ve conteos');
  });
  await t.test('validación de becas en el servidor', async () => {
    const malas = [{ nombre: 'ab' }, { descripcion: 'x'.repeat(501) }, { requisitos: [] }, { requisitos: [{ descripcion: 'Solo texto', es_documento: false }] },
      { requisitos: [{ descripcion: 'ab', es_documento: true }] }, { requisitos: Array.from({ length: 11 }, () => ({ descripcion: 'Requisito válido', es_documento: true })) }, { activa: 'si' }];
    for (const m of malas) { const r = await adm.post('/api/becas', nueva(m)); assert.equal(r.status, 400, JSON.stringify(m).slice(0, 60)); assert.ok(Object.keys(r.datos.campos).length); }
  });
  await t.test('el administrador crea una beca; el nombre no se repite', async () => {
    const d = nueva(); const r = await adm.post('/api/becas', d);
    assert.equal(r.status, 201); beca = r.datos.beca;
    assert.equal(beca.activa, true); assert.equal(beca.requisitos.length, 2);
    assert.equal(new Set(beca.requisitos.map(x => x.clave)).size, 2);
    assert.equal((await adm.post('/api/becas', nueva({ nombre: d.nombre.toUpperCase() }))).status, 409, 'mayúsculas y tildes');
    assert.equal((await adm.post('/api/becas', nueva({ nombre: 'BECA ACADEMICA' }))).status, 409, 'sin tilde frente a la beca inicial');
  });
  await t.test('los documentos que pide el sistema salen de los requisitos de la beca', async () => {
    const solic = await est.post('/api/solicitudes', { beca_id: beca.id });
    assert.equal(solic.status, 201);
    const claveDoc = beca.requisitos.find(r => r.es_documento).clave;
    const url = `/api/solicitudes/${solic.datos.solicitud.id}/estado`;
    assert.equal((await est.post(url, { estado: 'en_verificacion', documentos: DOCS })).status, 400, 'documentos de otra beca');
    assert.equal((await est.post(url, { estado: 'en_verificacion', documentos: { [claveDoc]: PDF('motivacion.pdf'), extra: PDF('x.pdf') } })).status, 400, 'documento sobrante');
    const ok = await est.post(url, { estado: 'en_verificacion', documentos: { [claveDoc]: PDF('motivacion.pdf') } });
    assert.equal(ok.status, 200); assert.equal(ok.datos.solicitud.documentos[claveDoc].etiqueta, 'Carta de motivación');
  });
  await t.test('editar requisitos conserva la clave de los existentes y agrega o quita los demás', async () => {
    const [a, b] = beca.requisitos;
    const r = await adm.patch(`/api/becas/${beca.id}`, { nombre: beca.nombre + ' II', requisitos: [{ id: a.id, descripcion: 'Carta de motivación firmada', es_documento: true }, { descripcion: 'Certificado de matrícula', es_documento: true }] });
    assert.equal(r.status, 200);
    const reqs = r.datos.beca.requisitos;
    assert.equal(reqs.length, 2); assert.equal(reqs[0].clave, a.clave); assert.equal(reqs[0].descripcion, 'Carta de motivación firmada');
    assert.ok(!reqs.some(x => x.id === b.id), 'el requisito omitido se elimina'); assert.notEqual(reqs[1].clave, b.clave);
    assert.equal((await adm.patch(`/api/becas/${beca.id}`, {})).status, 400);
    assert.equal((await adm.patch('/api/becas/99999', { activa: false })).status, 404);
  });
  await t.test('deshabilitar oculta la beca a los estudiantes y bloquea nuevas postulaciones', async () => {
    assert.equal((await adm.patch(`/api/becas/${beca.id}`, { activa: false })).datos.beca.activa, false);
    assert.ok(!(await est.get('/api/becas')).datos.becas.some(b => b.id === beca.id));
    const { c: otro } = await crearEstudiante(app);
    assert.equal((await otro.post('/api/solicitudes', { beca_id: beca.id })).status, 400);
    const s = (await est.get('/api/solicitudes')).datos.solicitudes[0];
    assert.equal(s.beca_id, beca.id, 'la solicitud ya existente sigue visible');
    assert.equal((await adm.patch(`/api/solicitudes/${s.id}`, { beca_id: beca.id + 0 })).status, 400);
    assert.equal((await adm.patch(`/api/becas/${beca.id}`, { activa: true })).datos.beca.activa, true);
    assert.ok((await est.get('/api/becas')).datos.becas.some(b => b.id === beca.id));
  });
  await t.test('los reportes son solo del administrador y reflejan los datos reales', async () => {
    assert.equal((await est.get('/api/reportes')).status, 403);
    assert.equal((await ver.get('/api/reportes')).status, 403);
    assert.equal((await cliente(app.base).get('/api/reportes')).status, 401);
    const r = (await adm.get('/api/reportes')).datos;
    assert.equal(r.totales.estudiantes, 2); assert.equal(r.totales.solicitudes, 1); assert.equal(r.totales.becas_total, 4);
    assert.equal(r.por_estado.en_verificacion, 1); assert.equal(r.por_estado.aprobada, 0);
    assert.equal(r.por_beca[0].id, beca.id); assert.equal(r.por_beca[0].solicitudes, 1);
    assert.equal(r.tasa_aprobacion, null, 'sin solicitudes resueltas no hay tasa');
  });
  await app.cerrar();
});

test('Migración 002 sobre una base con datos de la versión anterior', async () => {
  const ruta = tmpBd();
  const v1 = new DatabaseSync(ruta);
  v1.exec('PRAGMA foreign_keys = ON;');
  v1.exec(fs.readFileSync(path.join(RAIZ, 'database/migrations/001_inicial.sql'), 'utf8'));
  v1.exec("CREATE TABLE migraciones (nombre TEXT PRIMARY KEY, aplicada_en TEXT NOT NULL DEFAULT (datetime('now'))); INSERT INTO migraciones (nombre) VALUES ('001_inicial.sql');");
  v1.exec("INSERT INTO usuarios (nombres, apellidos, email, cedula, clave_hash, rol) VALUES ('Ana', 'Loor', 'a@x.ec', '1300000001', 'h', 'estudiante');");
  v1.exec("INSERT INTO solicitudes (usuario_id, tipo_beca, estado) VALUES (1, 'Beca Deportiva', 'en_verificacion');");
  v1.exec("INSERT INTO solicitud_documentos (solicitud_id, tipo, nombre, bytes) VALUES (1, 'cedula', 'c.pdf', 1000), (1, 'notas', 'n.pdf', 2000);");
  v1.close();
  const db = abrir(ruta);
  assert.equal(db.prepare('SELECT b.nombre FROM solicitudes s JOIN becas b ON b.id = s.beca_id').get().nombre, 'Beca Deportiva');
  assert.deepEqual(db.prepare('SELECT tipo, etiqueta FROM solicitud_documentos ORDER BY id').all().map(d => ({ ...d })),
    [{ tipo: 'cedula', etiqueta: 'Copia de cédula' }, { tipo: 'notas', etiqueta: 'Certificado de notas' }]);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM migraciones').get().n, 2);
  db.close();
});
