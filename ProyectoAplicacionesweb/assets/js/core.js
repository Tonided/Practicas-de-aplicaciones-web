/* core.js — cliente de la API del servidor y utilidades compartidas por todas las vistas.
   Los datos y la sesión viven en el servidor (SQLite + cookie HttpOnly). Aquí no se guarda nada sensible. */
const Becas = (() => {
  const LOGIN = '../login/index.html';
  const DASHBOARD = {
    admin: '../admin/index.html',
    verificador: '../verificador/index.html',
    estudiante: '../estudiante/index.html'
  };
  const ESTADOS = {
    sin_documentos:       { texto: 'Sin documentos',       clase: 'neutro' },
    en_verificacion:      { texto: 'En verificación',      clase: 'warn' },
    documentacion_valida: { texto: 'Documentación válida', clase: 'info' },
    con_novedades:        { texto: 'Con novedades',        clase: 'warn' },
    aprobada:             { texto: 'Aprobada',             clase: 'ok' },
    rechazada:            { texto: 'Rechazada',            clase: 'danger' }
  };
  /* Lo que ve el estudiante: las etapas internas se resumen en 3 estados claros */
  const estadoPublico = (estado) =>
    estado === 'aprobada' ? { texto: 'Aceptada', clase: 'ok' }
    : estado === 'rechazada' ? { texto: 'Rechazada', clase: 'danger' }
    : { texto: 'En progreso', clase: 'warn' };

  /* ---------- Llamadas a la API ---------- */
  let saliendo = false;   // la página se está cerrando o cambiando: las peticiones en vuelo se cancelan y no son un error
  addEventListener('beforeunload', () => { saliendo = true; });
  addEventListener('pagehide', () => { saliendo = true; });
  async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
    try {
      const r = await fetch(`/api${ruta}`, {
        method: metodo,
        credentials: 'same-origin',
        headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
      });
      const datos = await r.json().catch(() => ({}));
      return { ...datos, ok: r.ok, status: r.status };
    } catch {
      if (saliendo) return new Promise(() => {});   // no mostrar errores de una página que ya se está descargando
      return { ok: false, status: 0, error: 'No se pudo conectar con el servidor. Verifica que esté en ejecución.' };
    }
  }

  /* ---------- Sesión (la autoridad es el servidor; aquí solo se consulta) ---------- */
  let usuario;   // undefined = aún no consultado
  async function sesionActual() {
    if (usuario === undefined) { const r = await api('/sesion'); usuario = r.ok ? r.usuario : null; }
    return usuario;
  }
  async function iniciarSesion(email, clave) {
    const r = await api('/login', { metodo: 'POST', cuerpo: { email, clave } });
    if (r.ok) usuario = r.usuario;
    return r;
  }
  const registrar = (datos) => api('/registro', { metodo: 'POST', cuerpo: datos });
  async function cerrarSesion() {
    await api('/logout', { metodo: 'POST', cuerpo: {} });
    usuario = null;
    location.href = LOGIN;
  }
  /* Guardia de vista: redirige si no hay sesión o el rol no corresponde. El servidor vuelve a comprobarlo en cada operación */
  async function exigirRol(rol) {
    const u = await sesionActual();
    if (!u || u.rol !== rol) { location.replace(u ? DASHBOARD[u.rol] : LOGIN); return null; }
    return u;
  }

  /* ---------- Solicitudes y notificaciones ---------- */
  async function listarSolicitudes() {
    const r = await api('/solicitudes');
    if (!r.ok) throw new Error(r.error || 'No se pudieron cargar las solicitudes.');
    return r.solicitudes;
  }
  const miSolicitud = async () => (await listarSolicitudes())[0] || null;
  const crearSolicitud = (becaId) => api('/solicitudes', { metodo: 'POST', cuerpo: { beca_id: becaId } });
  const cambiarEstado = (id, estado, { detalle = '', documentos } = {}) =>
    api(`/solicitudes/${id}/estado`, { metodo: 'POST', cuerpo: { estado, detalle, documentos } });
  const editarSolicitud = (id, { becaId }) => api(`/solicitudes/${id}`, { metodo: 'PATCH', cuerpo: { beca_id: becaId } });
  /* ---------- Becas y reportes ---------- */
  async function listarBecas() {
    const r = await api('/becas');
    if (!r.ok) throw new Error(r.error || 'No se pudieron cargar las becas.');
    return r.becas;
  }
  const crearBeca = (datos) => api('/becas', { metodo: 'POST', cuerpo: datos });
  const editarBeca = (id, cambios) => api(`/becas/${id}`, { metodo: 'PATCH', cuerpo: cambios });
  async function reportes() {
    const r = await api('/reportes');
    if (!r.ok) throw new Error(r.error || 'No se pudieron cargar los reportes.');
    return r;
  }
  const notificaciones = async () => { const r = await api('/notificaciones'); return r.ok ? r.notificaciones : []; };
  const marcarLeidas = () => api('/notificaciones/leidas', { metodo: 'POST', cuerpo: {} });

  /* ---------- Utilidades de interfaz ---------- */
  const esc = (texto) => String(texto).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(mensaje, tipo = 'info') {
    let cont = document.getElementById('toasts');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'toasts';
      cont.setAttribute('aria-live', 'polite');
      document.body.appendChild(cont);
    }
    const t = document.createElement('div');
    t.className = `toast toast--${tipo}`;
    t.textContent = mensaje;
    cont.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  /* Ventana modal sobre un <dialog>. alConfirmar() puede ser asíncrono y devuelve un texto de error, o null si todo salió bien */
  function abrirModal(modal, { titulo, cuerpoHtml, textoOk, claseOk = 'btn--primario', alConfirmar, ancho = false }) {
    modal.classList.toggle('modal--ancho', ancho);
    modal.innerHTML = `
      <h2 id="modal-titulo">${esc(titulo)}</h2>
      <div class="modal__cuerpo">${cuerpoHtml}</div>
      <p class="alerta" id="modal-error" role="alert" hidden></p>
      <div class="modal__acciones">
        <button type="button" class="btn btn--secundario" data-cerrar>${alConfirmar ? 'Cancelar' : 'Cerrar'}</button>
        ${alConfirmar ? `<button type="button" class="btn ${claseOk}" id="modal-ok">${esc(textoOk)}</button>` : ''}
      </div>`;
    modal.querySelector('[data-cerrar]').addEventListener('click', () => modal.close());
    if (alConfirmar) {
      const ok = modal.querySelector('#modal-ok');
      ok.addEventListener('click', async () => {
        ok.disabled = true;   // evita envíos dobles
        const error = await alConfirmar();
        const caja = modal.querySelector('#modal-error');
        if (error) { caja.textContent = error; caja.hidden = false; ok.disabled = false; }
        else modal.close();
      });
    }
    modal.showModal();
  }

  /* Lista de documentos de una solicitud, lista para insertar en un modal */
  function documentosHtml(sol) {
    const etiquetas = { cedula: 'Copia de Cédula', notas: 'Certificado de Notas' };
    const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;
    const docs = sol.documentos ? Object.entries(sol.documentos) : [];
    const lista = docs.length
      ? `<ul class="lista-docs">${docs.map(([k, d]) => `<li><strong>${esc(d.etiqueta || etiquetas[k] || k)}:</strong> ${esc(d.nombre)} (${kb(d.bytes)})</li>`).join('')}</ul>`
      : '<p>Esta solicitud no tiene archivos registrados.</p>';
    return `${lista}<p class="sub" style="margin:0">El sistema guarda el nombre y el tamaño de cada archivo, no su contenido.</p>`;
  }

  return {
    DASHBOARD, ESTADOS, estadoPublico, api,
    sesionActual, iniciarSesion, registrar, cerrarSesion, exigirRol,
    listarSolicitudes, miSolicitud, crearSolicitud, cambiarEstado, editarSolicitud, listarBecas, crearBeca, editarBeca, reportes, notificaciones, marcarLeidas,
    esc, toast, abrirModal, documentosHtml
  };
})();
