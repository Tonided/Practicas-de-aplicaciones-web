'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { hashClave, verificarClave, nuevoToken, hashToken } = require('./seguridad');
const { validarRegistro, crearUsuario, limpio } = require('./usuarios');

const TEXTO = { sin_documentos: 'Sin documentos', en_verificacion: 'En verificación', documentacion_valida: 'Documentación válida', con_novedades: 'Con novedades', aprobada: 'Aprobada', rechazada: 'Rechazada' };
/* Quién puede mover una solicitud de qué estado a cuál (se verifica SIEMPRE aquí, en el servidor) */
const TRANSICIONES = {
  estudiante:  { sin_documentos: ['en_verificacion'], con_novedades: ['en_verificacion'] },
  verificador: { en_verificacion: ['documentacion_valida', 'con_novedades'] },
  admin:       { documentacion_valida: ['aprobada', 'rechazada'] }
};
const AVISOS = {
  en_verificacion: 'Recibimos tus documentos. Están en revisión.',
  documentacion_valida: 'Tu documentación fue validada. Falta la resolución final.',
  con_novedades: 'Tu documentación tiene novedades. Corrígela y vuelve a subirla.',
  aprobada: 'Tu solicitud de beca fue aprobada.',
  rechazada: 'Tu solicitud de beca fue rechazada.'
};
const TODOS = ['estudiante', 'verificador', 'admin'];
const SESION_MS = 8 * 3600 * 1000;
const MAX_PDF = 2 * 1024 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const CARPETAS_PUBLICAS = ['assets', 'inicio', 'login', 'registro', 'estudiante', 'verificador', 'admin', 'preguntas'];
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

class ErrorHttp extends Error {
  constructor(estado, mensaje, extra = {}) { super(mensaje); this.estado = estado; this.extra = extra; }
}
const ahora = () => new Date().toISOString();
const publico = (u) => ({ id: u.id, nombre: `${u.nombres} ${u.apellidos}`, email: u.email, cedula: u.cedula, rol: u.rol });

function crearApp({ db, raiz, cookieSegura = false, limites = {} }) {
  const maxFallosLogin = limites.login ?? 10, maxRegistros = limites.registro ?? 20;
  const eventos = new Map();   // limitador en memoria: clave -> marcas de tiempo
  const marcas = (clave, ventana) => { const t = Date.now(); const l = (eventos.get(clave) || []).filter(x => t - x < ventana); eventos.set(clave, l); return l; };
  const excede = (clave, max, ventana) => marcas(clave, ventana).length >= max;
  const anotar = (clave, ventana) => marcas(clave, ventana).push(Date.now());
  let hashFalso;   // para que el tiempo de respuesta no revele si el correo existe

  /* ---------- Utilidades HTTP ---------- */
  function enviar(res, estado, datos, cabeceras = []) {
    res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...Object.fromEntries(cabeceras) });
    res.end(JSON.stringify(datos));
  }
  async function leerJson(req) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new ErrorHttp(415, 'La solicitud debe enviarse como JSON.');
    const partes = []; let total = 0;
    for await (const p of req) { total += p.length; if (total > 100_000) throw new ErrorHttp(413, 'La solicitud es demasiado grande.'); partes.push(p); }
    try {
      const d = JSON.parse(Buffer.concat(partes).toString('utf8') || '{}');
      if (d === null || typeof d !== 'object' || Array.isArray(d)) throw new Error();
      return d;
    } catch { throw new ErrorHttp(400, 'El cuerpo de la solicitud no es un JSON válido.'); }
  }
  function leerCookie(req, nombre) {
    for (const par of (req.headers.cookie || '').split(';')) {
      const i = par.indexOf('=');
      if (i > 0 && par.slice(0, i).trim() === nombre) { try { return decodeURIComponent(par.slice(i + 1).trim()); } catch { return null; } }
    }
    return null;
  }
  const cookieSesion = (valor, maxAge) => ['Set-Cookie', `becas_sid=${valor}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${cookieSegura ? '; Secure' : ''}`];
  function usuarioDeSesion(req) {
    const token = leerCookie(req, 'becas_sid');
    if (!token) return null;
    return db.prepare(`SELECT u.id, u.nombres, u.apellidos, u.email, u.cedula, u.rol FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
                       WHERE s.token_hash = ? AND s.expira_en > ? AND u.activo = 1`).get(hashToken(token), ahora()) || null;
  }

  /* ---------- Autenticación ---------- */
  async function registro({ cuerpo, ip }) {
    if (excede('reg:' + ip, maxRegistros, 3600_000)) throw new ErrorHttp(429, 'Demasiados intentos de registro. Inténtalo más tarde.');
    anotar('reg:' + ip, 3600_000);
    const { datos, errores } = validarRegistro(cuerpo);
    if (Object.keys(errores).length) throw new ErrorHttp(400, 'Revisa los campos marcados.', { campos: errores });
    try { await crearUsuario(db, { ...datos, rol: 'estudiante' }); }   // el rol NUNCA se toma de la petición
    catch (e) { if (e.campo) throw new ErrorHttp(409, e.message, { campos: { [e.campo]: e.message } }); throw e; }
    return [201, { ok: true }];
  }
  async function login({ cuerpo, ip }) {
    if (excede('log:' + ip, maxFallosLogin, 15 * 60_000)) throw new ErrorHttp(429, 'Demasiados intentos fallidos. Espera unos minutos.');
    const email = limpio(cuerpo.email).toLowerCase();
    const clave = typeof cuerpo.clave === 'string' ? cuerpo.clave : '';
    const u = db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(email);
    hashFalso ??= await hashClave(crypto.randomUUID());
    const valida = await verificarClave(clave, u ? u.clave_hash : hashFalso);
    if (!u || !valida) { anotar('log:' + ip, 15 * 60_000); throw new ErrorHttp(401, 'Correo o contraseña incorrectos.'); }
    db.prepare('DELETE FROM sesiones WHERE expira_en <= ?').run(ahora());
    const token = nuevoToken();
    db.prepare('INSERT INTO sesiones (token_hash, usuario_id, expira_en) VALUES (?, ?, ?)').run(hashToken(token), u.id, new Date(Date.now() + SESION_MS).toISOString());
    return { usuario: publico(u), _cabeceras: [cookieSesion(token, SESION_MS / 1000)] };
  }
  function logout({ req }) {
    const token = leerCookie(req, 'becas_sid');
    if (token) db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(hashToken(token));
    return { ok: true, _cabeceras: [cookieSesion('', 0)] };
  }

  /* ---------- Solicitudes ---------- */
  const SQL_SOL = `SELECT s.id, s.usuario_id, s.beca_id, b.nombre AS beca, s.estado, u.nombres || ' ' || u.apellidos AS estudiante, u.cedula
                   FROM solicitudes s JOIN usuarios u ON u.id = s.usuario_id JOIN becas b ON b.id = s.beca_id`;
  function armar(f) {
    const docs = db.prepare('SELECT tipo, etiqueta, nombre, bytes FROM solicitud_documentos WHERE solicitud_id = ?').all(f.id);
    const historial = db.prepare('SELECT creado_en AS fecha, rol, estado, accion, detalle FROM solicitud_historial WHERE solicitud_id = ? ORDER BY id').all(f.id);
    return {
      id: f.id, codigo: `SOL-${String(f.id).padStart(3, '0')}`, cedula: f.cedula, estudiante: f.estudiante, beca_id: f.beca_id, beca: f.beca, estado: f.estado,
      requisitos: db.prepare('SELECT id, clave, descripcion, es_documento FROM beca_requisitos WHERE beca_id = ? ORDER BY orden, id').all(f.beca_id).map(r => ({ ...r, es_documento: !!r.es_documento })),
      documentos: docs.length ? Object.fromEntries(docs.map(d => [d.tipo, { etiqueta: d.etiqueta, nombre: d.nombre, bytes: d.bytes }])) : undefined,
      historial: historial.map(h => ({ ...h }))
    };
  }
  const notificar = (usuarioId, texto) => db.prepare('INSERT INTO notificaciones (usuario_id, texto) VALUES (?, ?)').run(usuarioId, texto);
  const anotarHistorial = (id, u, campos) => db.prepare('INSERT INTO solicitud_historial (solicitud_id, usuario_id, rol, estado, accion, detalle) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, u.id, u.rol, campos.estado ?? null, campos.accion ?? null, campos.detalle ?? '');
  const enTransaccion = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const becaDisponible = (id) => { const b = db.prepare('SELECT id, nombre, activa FROM becas WHERE id = ?').get(Number(id)); return b && b.activa ? b : null; };

  function listarSolicitudes({ usuario }) {
    const filas = usuario.rol === 'estudiante'
      ? db.prepare(SQL_SOL + ' WHERE s.usuario_id = ? ORDER BY s.id').all(usuario.id)
      : db.prepare(SQL_SOL + ' ORDER BY s.id').all();
    return { solicitudes: filas.map(armar) };
  }
  function crearSolicitud({ usuario, cuerpo }) {
    const beca = becaDisponible(cuerpo.beca_id);
    if (!beca) throw new ErrorHttp(400, 'Selecciona una beca disponible.');
    if (db.prepare('SELECT 1 FROM solicitudes WHERE usuario_id = ?').get(usuario.id)) throw new ErrorHttp(409, 'Ya tienes una postulación registrada.');
    const id = enTransaccion(() => {
      const r = db.prepare('INSERT INTO solicitudes (usuario_id, beca_id) VALUES (?, ?)').run(usuario.id, beca.id);
      anotarHistorial(Number(r.lastInsertRowid), usuario, { accion: 'creacion', detalle: beca.nombre });
      return Number(r.lastInsertRowid);
    });
    return [201, { solicitud: armar(db.prepare(SQL_SOL + ' WHERE s.id = ?').get(id)) }];
  }
  /* Los documentos exigidos salen de los requisitos de la beca (los que son documento) */
  function validarDocumentos(d, requisitos) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    const claves = Object.keys(d);
    if (claves.length !== requisitos.length || !claves.every(k => requisitos.some(r => r.clave === k))) return null;
    const salida = [];
    for (const r of requisitos) {
      const x = d[r.clave];
      if (!x || typeof x.nombre !== 'string' || x.nombre.length > 150 || !/\.pdf$/i.test(x.nombre) || !Number.isInteger(x.bytes) || x.bytes < 1 || x.bytes > MAX_PDF) return null;
      salida.push([r.clave, r.descripcion, x.nombre, x.bytes]);
    }
    return salida;
  }
  function cambiarEstado({ usuario, cuerpo, params }) {
    const f = db.prepare(SQL_SOL + ' WHERE s.id = ?').get(Number(params[0]));
    if (!f) throw new ErrorHttp(404, 'No se encontró la solicitud.');
    if (usuario.rol === 'estudiante' && f.usuario_id !== usuario.id) throw new ErrorHttp(403, 'No puedes modificar la solicitud de otra persona.');
    const nuevo = String(cuerpo.estado ?? '');
    if (!((TRANSICIONES[usuario.rol] || {})[f.estado] || []).includes(nuevo)) {
      throw new ErrorHttp(403, `Tu rol no puede pasar la solicitud de "${TEXTO[f.estado]}" a "${TEXTO[nuevo] || nuevo}".`);
    }
    const detalle = String(cuerpo.detalle ?? '').trim();
    if (detalle.length > 500) throw new ErrorHttp(400, 'El motivo no puede superar los 500 caracteres.');
    if ((nuevo === 'rechazada' || nuevo === 'con_novedades') && !detalle) throw new ErrorHttp(400, 'Debes indicar el motivo.');
    let docs = null;
    if (usuario.rol === 'estudiante') {
      const requisitos = db.prepare('SELECT clave, descripcion FROM beca_requisitos WHERE beca_id = ? AND es_documento = 1 ORDER BY orden, id').all(f.beca_id);
      docs = validarDocumentos(cuerpo.documentos, requisitos);
      if (!docs) throw new ErrorHttp(400, 'Sube todos los documentos requeridos en PDF de hasta 2 MB.');
    }
    enTransaccion(() => {
      db.prepare('UPDATE solicitudes SET estado = ?, actualizado_en = ? WHERE id = ?').run(nuevo, ahora(), f.id);
      for (const [tipo, etiqueta, nombre, bytes] of docs || []) {
        db.prepare(`INSERT INTO solicitud_documentos (solicitud_id, tipo, etiqueta, nombre, bytes) VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT (solicitud_id, tipo) DO UPDATE SET etiqueta = excluded.etiqueta, nombre = excluded.nombre, bytes = excluded.bytes, subido_en = ?`).run(f.id, tipo, etiqueta, nombre, bytes, ahora());
      }
      anotarHistorial(f.id, usuario, { estado: nuevo, detalle });
      notificar(f.usuario_id, AVISOS[nuevo] + (detalle ? ` Motivo: ${detalle}` : ''));
    });
    return { ok: true, solicitud: armar(db.prepare(SQL_SOL + ' WHERE s.id = ?').get(f.id)) };
  }
  function editarSolicitud({ usuario, cuerpo, params }) {
    const f = db.prepare(SQL_SOL + ' WHERE s.id = ?').get(Number(params[0]));
    if (!f) throw new ErrorHttp(404, 'No se encontró la solicitud.');
    if (f.estado === 'aprobada' || f.estado === 'rechazada') throw new ErrorHttp(409, 'No se puede editar una solicitud ya resuelta.');
    const beca = becaDisponible(cuerpo.beca_id);
    if (!beca) throw new ErrorHttp(400, 'Selecciona una beca disponible.');
    if (beca.id === f.beca_id) throw new ErrorHttp(400, 'La beca no cambió.');
    enTransaccion(() => {
      db.prepare('UPDATE solicitudes SET beca_id = ?, actualizado_en = ? WHERE id = ?').run(beca.id, ahora(), f.id);
      anotarHistorial(f.id, usuario, { accion: 'edicion', detalle: `Beca: de "${f.beca}" a "${beca.nombre}".` });
      notificar(f.usuario_id, `Tu tipo de beca fue actualizado a ${beca.nombre}.`);
    });
    return { ok: true, solicitud: armar(db.prepare(SQL_SOL + ' WHERE s.id = ?').get(f.id)) };
  }

  /* ---------- Becas y requisitos (el administrador las configura; los estudiantes solo ven las habilitadas) ---------- */
  function armarBeca(b, conConteo) {
    return {
      id: b.id, nombre: b.nombre, descripcion: b.descripcion, activa: !!b.activa,
      requisitos: db.prepare('SELECT id, clave, descripcion, es_documento FROM beca_requisitos WHERE beca_id = ? ORDER BY orden, id').all(b.id).map(r => ({ ...r, es_documento: !!r.es_documento })),
      ...(conConteo ? { solicitudes: db.prepare('SELECT COUNT(*) n FROM solicitudes WHERE beca_id = ?').get(b.id).n } : {})
    };
  }
  function validarBeca(c, parcial = false) {
    const e = {}, datos = {};
    if (!parcial || 'nombre' in c) {
      datos.nombre = limpio(c.nombre);
      if (datos.nombre.length < 3 || datos.nombre.length > 80) e.nombre = 'El nombre debe tener entre 3 y 80 caracteres.';
    }
    if (!parcial || 'descripcion' in c) {
      datos.descripcion = String(c.descripcion ?? '').trim();
      if (datos.descripcion.length > 500) e.descripcion = 'La descripción no puede superar los 500 caracteres.';
    }
    if (!parcial || 'activa' in c) {
      datos.activa = c.activa === undefined && !parcial ? true : c.activa;
      if (typeof datos.activa !== 'boolean') e.activa = 'Indica si la beca está habilitada.';
    }
    if (!parcial || 'requisitos' in c) {
      const r = c.requisitos;
      if (!Array.isArray(r) || r.length < 1 || r.length > 10) e.requisitos = 'Agrega entre 1 y 10 requisitos.';
      else {
        datos.requisitos = r.map(x => ({ id: Number.isInteger(x && x.id) ? x.id : null, descripcion: limpio(x && x.descripcion), es_documento: !!x && x.es_documento === true }));
        if (datos.requisitos.some(x => x.descripcion.length < 3 || x.descripcion.length > 150)) e.requisitos = 'Cada requisito debe tener entre 3 y 150 caracteres.';
        else if (!datos.requisitos.some(x => x.es_documento)) e.requisitos = 'Al menos un requisito debe ser un documento en PDF.';
      }
    }
    return { datos, errores: e };
  }
  /* Reemplaza la lista de requisitos conservando la clave de los que ya existían (así no se pierden documentos ya subidos) */
  function guardarRequisitos(becaId, items) {
    const actuales = db.prepare('SELECT id FROM beca_requisitos WHERE beca_id = ?').all(becaId).map(a => a.id);
    const conservar = new Set(items.map(i => i.id).filter(id => actuales.includes(id)));
    for (const id of actuales) if (!conservar.has(id)) db.prepare('DELETE FROM beca_requisitos WHERE id = ?').run(id);
    items.forEach((it, orden) => {
      if (conservar.has(it.id)) db.prepare('UPDATE beca_requisitos SET descripcion = ?, es_documento = ?, orden = ? WHERE id = ?').run(it.descripcion, it.es_documento ? 1 : 0, orden, it.id);
      else db.prepare('INSERT INTO beca_requisitos (beca_id, clave, descripcion, es_documento, orden) VALUES (?, ?, ?, ?, ?)')
        .run(becaId, 'r' + crypto.randomBytes(4).toString('hex'), it.descripcion, it.es_documento ? 1 : 0, orden);
    });
  }
  /* SQLite solo ignora mayúsculas en ASCII: se compara sin tildes ni mayúsculas para detectar "Académica" = "ACADEMICA" */
  const canonico = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function exigirNombreLibre(nombre, idPropio = 0) {
    if (db.prepare('SELECT id, nombre FROM becas').all().some(b => b.id !== idPropio && canonico(b.nombre) === canonico(nombre))) {
      throw new ErrorHttp(409, 'Ya existe una beca con ese nombre.', { campos: { nombre: 'Ya existe una beca con ese nombre.' } });
    }
  }
  const nombreRepetido = (e) => { if (/UNIQUE/.test(e.message)) throw new ErrorHttp(409, 'Ya existe una beca con ese nombre.', { campos: { nombre: 'Ya existe una beca con ese nombre.' } }); throw e; };

  function listarBecas({ usuario }) {
    const admin = usuario.rol === 'admin';
    const filas = db.prepare(`SELECT * FROM becas ${admin ? '' : 'WHERE activa = 1'} ORDER BY nombre COLLATE NOCASE`).all();
    return { becas: filas.map(b => armarBeca(b, admin)) };
  }
  function crearBeca({ cuerpo }) {
    const { datos, errores } = validarBeca(cuerpo);
    if (Object.keys(errores).length) throw new ErrorHttp(400, 'Revisa los campos marcados.', { campos: errores });
    exigirNombreLibre(datos.nombre);
    try {
      const id = enTransaccion(() => {
        const r = db.prepare('INSERT INTO becas (nombre, descripcion, activa) VALUES (?, ?, ?)').run(datos.nombre, datos.descripcion, datos.activa ? 1 : 0);
        guardarRequisitos(Number(r.lastInsertRowid), datos.requisitos);
        return Number(r.lastInsertRowid);
      });
      return [201, { ok: true, beca: armarBeca(db.prepare('SELECT * FROM becas WHERE id = ?').get(id), true) }];
    } catch (e) { return nombreRepetido(e); }
  }
  function editarBeca({ cuerpo, params }) {
    const b = db.prepare('SELECT * FROM becas WHERE id = ?').get(Number(params[0]));
    if (!b) throw new ErrorHttp(404, 'No se encontró la beca.');
    if (!['nombre', 'descripcion', 'activa', 'requisitos'].some(k => k in cuerpo)) throw new ErrorHttp(400, 'No hay cambios que guardar.');
    const { datos, errores } = validarBeca(cuerpo, true);
    if (Object.keys(errores).length) throw new ErrorHttp(400, 'Revisa los campos marcados.', { campos: errores });
    if (datos.nombre !== undefined) exigirNombreLibre(datos.nombre, b.id);
    if (datos.activa === true && !datos.requisitos && !db.prepare('SELECT 1 FROM beca_requisitos WHERE beca_id = ? AND es_documento = 1').get(b.id)) {
      throw new ErrorHttp(400, 'No se puede habilitar una beca sin al menos un requisito de documento.');
    }
    try {
      enTransaccion(() => {
        db.prepare('UPDATE becas SET nombre = ?, descripcion = ?, activa = ?, actualizado_en = ? WHERE id = ?')
          .run(datos.nombre ?? b.nombre, datos.descripcion ?? b.descripcion, typeof datos.activa === 'boolean' ? (datos.activa ? 1 : 0) : b.activa, ahora(), b.id);
        if (datos.requisitos) guardarRequisitos(b.id, datos.requisitos);
      });
    } catch (e) { nombreRepetido(e); }
    return { ok: true, beca: armarBeca(db.prepare('SELECT * FROM becas WHERE id = ?').get(b.id), true) };
  }

  /* ---------- Reportes (solo administración) ---------- */
  function reportes() {
    const por_estado = Object.fromEntries(Object.keys(TEXTO).map(k => [k, 0]));
    for (const f of db.prepare('SELECT estado, COUNT(*) n FROM solicitudes GROUP BY estado').all()) por_estado[f.estado] = f.n;
    const por_beca = db.prepare(`SELECT b.id, b.nombre, b.activa, COUNT(s.id) AS solicitudes,
        COALESCE(SUM(s.estado = 'aprobada'), 0) AS aprobadas, COALESCE(SUM(s.estado = 'rechazada'), 0) AS rechazadas
        FROM becas b LEFT JOIN solicitudes s ON s.beca_id = b.id GROUP BY b.id ORDER BY solicitudes DESC, b.nombre COLLATE NOCASE`).all()
      .map(b => ({ ...b, activa: !!b.activa }));
    const resueltas = por_estado.aprobada + por_estado.rechazada;
    return {
      totales: {
        estudiantes: db.prepare("SELECT COUNT(*) n FROM usuarios WHERE rol = 'estudiante' AND activo = 1").get().n,
        solicitudes: Object.values(por_estado).reduce((a, b) => a + b, 0),
        becas_activas: db.prepare('SELECT COUNT(*) n FROM becas WHERE activa = 1').get().n,
        becas_total: db.prepare('SELECT COUNT(*) n FROM becas').get().n
      },
      por_estado, por_beca,
      tasa_aprobacion: resueltas ? Math.round((por_estado.aprobada / resueltas) * 100) : null
    };
  }

  /* ---------- Notificaciones (cada usuario solo ve las suyas) ---------- */
  const listarNotificaciones = ({ usuario }) => ({
    notificaciones: db.prepare('SELECT id, texto, creado_en AS fecha, leida FROM notificaciones WHERE usuario_id = ? ORDER BY id DESC LIMIT 50').all(usuario.id).map(n => ({ ...n, leida: !!n.leida }))
  });
  const marcarLeidas = ({ usuario }) => { db.prepare('UPDATE notificaciones SET leida = 1 WHERE usuario_id = ?').run(usuario.id); return { ok: true }; };

  /* ---------- Tabla de rutas: [método, patrón, roles permitidos (null = público), manejador] ---------- */
  const rutas = [
    ['GET', /^\/api\/salud$/, null, () => ({ ok: true })],
    ['GET', /^\/api\/sesion$/, null, ({ usuario }) => ({ usuario: usuario ? publico(usuario) : null })],
    ['POST', /^\/api\/registro$/, null, registro],
    ['POST', /^\/api\/login$/, null, login],
    ['POST', /^\/api\/logout$/, null, logout],
    ['GET', /^\/api\/solicitudes$/, TODOS, listarSolicitudes],
    ['POST', /^\/api\/solicitudes$/, ['estudiante'], crearSolicitud],
    ['POST', /^\/api\/solicitudes\/(\d+)\/estado$/, TODOS, cambiarEstado],
    ['PATCH', /^\/api\/solicitudes\/(\d+)$/, ['admin'], editarSolicitud],
    ['GET', /^\/api\/notificaciones$/, TODOS, listarNotificaciones],
    ['POST', /^\/api\/notificaciones\/leidas$/, TODOS, marcarLeidas],
    ['GET', /^\/api\/becas$/, TODOS, listarBecas],
    ['POST', /^\/api\/becas$/, ['admin'], crearBeca],
    ['PATCH', /^\/api\/becas\/(\d+)$/, ['admin'], editarBeca],
    ['GET', /^\/api\/reportes$/, ['admin'], reportes]
  ];

  async function manejarApi(req, res, ruta) {
    const candidatas = rutas.map(r => [r, r[1].exec(ruta)]).filter(([, m]) => m);
    if (!candidatas.length) throw new ErrorHttp(404, 'Recurso no encontrado.');
    const encontrada = candidatas.find(([r]) => r[0] === req.method);
    if (!encontrada) throw new ErrorHttp(405, 'Método no permitido.');
    const [[, , roles, manejador], m] = encontrada;
    const usuario = usuarioDeSesion(req);
    if (roles) {
      if (!usuario) throw new ErrorHttp(401, 'Debes iniciar sesión.');
      if (!roles.includes(usuario.rol)) throw new ErrorHttp(403, 'No tienes permiso para esta operación.');
    }
    let cuerpo = {};
    if (req.method !== 'GET') {
      const origen = req.headers.origin;   // defensa CSRF adicional a SameSite
      if (origen && new URL(origen).host !== req.headers.host) throw new ErrorHttp(403, 'Origen no permitido.');
      cuerpo = await leerJson(req);
    }
    const r = await manejador({ req, usuario, cuerpo, params: m.slice(1), ip: req.socket.remoteAddress });
    if (Array.isArray(r)) return enviar(res, r[0], r[1]);
    const { _cabeceras, ...datos } = r;
    enviar(res, 200, datos, _cabeceras || []);
  }

  /* ---------- Archivos estáticos (solo las carpetas públicas del frontend) ---------- */
  function servirEstatico(req, res, ruta) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new ErrorHttp(405, 'Método no permitido.');
    const partes = ruta.split('/').filter(Boolean);
    if (partes.some(p => p === '..' || p.includes('\0'))) throw new ErrorHttp(404, 'No encontrado.');
    const permitido = partes.length === 0 || CARPETAS_PUBLICAS.includes(partes[0]) || (partes.length === 1 && partes[0] === 'index.html');
    let absoluta = path.join(raiz, ...partes);
    if (!permitido || !absoluta.startsWith(raiz)) throw new ErrorHttp(404, 'No encontrado.');
    if (fs.existsSync(absoluta) && fs.statSync(absoluta).isDirectory()) {
      if (!ruta.endsWith('/')) { res.writeHead(301, { Location: ruta + '/' }); return res.end(); }
      absoluta = path.join(absoluta, 'index.html');
    }
    const tipo = MIME[path.extname(absoluta).toLowerCase()];
    if (!tipo || !fs.existsSync(absoluta)) throw new ErrorHttp(404, 'No encontrado.');
    res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(absoluta));
  }

  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', CSP);
    try {
      let ruta;
      try { ruta = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { throw new ErrorHttp(400, 'Dirección no válida.'); }
      if (ruta.startsWith('/api/')) await manejarApi(req, res, ruta);
      else servirEstatico(req, res, ruta);
    } catch (e) {
      if (e instanceof ErrorHttp) {
        if (req.url.startsWith('/api/')) enviar(res, e.estado, { error: e.message, ...e.extra });
        else { res.writeHead(e.estado, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(e.message); }
      } else {
        console.error('Error interno:', e.message);   // sin datos del usuario ni contraseñas
        if (!res.headersSent) enviar(res, 500, { error: 'Ocurrió un error interno. Inténtalo de nuevo.' });
      }
    }
  });
}
module.exports = { crearApp };
