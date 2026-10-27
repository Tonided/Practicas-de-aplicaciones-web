document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await Becas.exigirRol('admin');   // protege la vista: sin sesión de admin, redirige
    if (!sesion) return;

    const { esc, ESTADOS } = Becas;
    const cuerpo = document.getElementById('tabla-body');
    const modal = document.getElementById('modal');
    const selFiltro = document.getElementById('filtro');

    document.getElementById('usuario-nombre').textContent = sesion.nombre;

    let cache = [];   // última lista descargada del servidor
    const buscar = (id) => cache.find(s => String(s.id) === id);

    /* ---------- Indicadores ---------- */
    function pintarKpis(todas) {
        const n = (...estados) => todas.filter(s => estados.includes(s.estado)).length;
        const datos = [
            [todas.length, 'Solicitudes recibidas'],
            [n('en_verificacion'), 'Por verificar'],
            [n('documentacion_valida'), 'Listas para resolver'],
            [n('aprobada', 'rechazada'), 'Resueltas']
        ];
        document.getElementById('kpis').innerHTML = datos.map(([v, t]) => `<div class="kpi"><b>${v}</b><span>${t}</span></div>`).join('');
    }

    /* ---------- Tabla ---------- */
    function fila(s) {
        const e = ESTADOS[s.estado];
        const listo = s.estado === 'documentacion_valida';
        const resuelta = s.estado === 'aprobada' || s.estado === 'rechazada';
        const nota = listo ? '' : ' title="Disponible cuando el verificador marque la documentación como válida"';
        return `
            <tr data-id="${esc(s.id)}">
                <td>${esc(s.cedula ?? '')}</td>
                <td>${esc(s.estudiante)}</td>
                <td>${esc(s.beca)}</td>
                <td><span class="badge badge--${e.clase}">${e.texto}</span></td>
                <td class="acciones">
                    <button type="button" class="btn btn--secundario btn--sm" data-accion="ver">Ver Documentos</button>
                    <button type="button" class="btn btn--exito btn--sm" data-accion="aprobar" ${listo ? '' : 'disabled'}${nota}>Aprobar</button>
                    <button type="button" class="btn btn--peligro btn--sm" data-accion="rechazar" ${listo ? '' : 'disabled'}${nota}>Rechazar</button>
                    <button type="button" class="btn btn--secundario btn--sm" data-accion="editar" ${resuelta ? 'disabled' : ''}>Editar</button>
                </td>
            </tr>`;
    }

    async function pintar() {
        const todas = await Becas.listarSolicitudes();
        cache = todas;
        const porResolver = todas.filter(s => s.estado === 'documentacion_valida');
        const verTodas = selFiltro.value === 'todas';
        const lista = verTodas ? todas : porResolver;
        pintarKpis(todas);
        document.getElementById('resumen').textContent = porResolver.length === 1 ? '1 solicitud lista para resolver' : `${porResolver.length} solicitudes listas para resolver`;
        cuerpo.innerHTML = lista.length
            ? lista.map(fila).join('')
            : `<tr><td colspan="5" class="vacio">${verTodas ? 'Aún no hay solicitudes registradas.' : 'No hay solicitudes listas para resolver.'}</td></tr>`;
    }

    /* Carga con indicador y manejo de error (nunca deja la pantalla en blanco) */
    function cargar() {
        cuerpo.innerHTML = '<tr><td colspan="5" class="vacio"><span class="spinner" aria-hidden="true"></span>Cargando solicitudes…</td></tr>';
        setTimeout(async () => {
            try { await pintar(); }
            catch (err) {
                console.error('Error al cargar las solicitudes:', err);
                document.getElementById('resumen').textContent = 'No se pudieron cargar los datos';
                cuerpo.innerHTML = '<tr><td colspan="5" class="vacio">No se pudieron cargar las solicitudes. <button type="button" class="btn btn--secundario btn--sm" data-accion="reintentar">Reintentar</button></td></tr>';
            }
        }, 250);
    }

    /* ---------- Acciones ---------- */
    async function resolver(sol, estado, detalle, mensaje) {
        const r = await Becas.cambiarEstado(sol.id, estado, { detalle });
        if (!r.ok) return r.error;
        Becas.toast(mensaje, 'ok');
        await pintar();
        return null;
    }

    function aprobar(sol) {
        Becas.abrirModal(modal, {
            titulo: 'Aprobar solicitud',
            cuerpoHtml: `<p>¿Aprobar la solicitud de <strong>${esc(sol.estudiante)}</strong> (${esc(sol.beca)})? El estudiante será notificado.</p>`,
            textoOk: 'Aprobar', claseOk: 'btn--exito',
            alConfirmar: () => resolver(sol, 'aprobada', '', 'Solicitud aprobada.')
        });
    }

    function rechazar(sol) {
        Becas.abrirModal(modal, {
            titulo: 'Rechazar solicitud',
            cuerpoHtml: `<p style="margin-bottom:.6rem">Estás a punto de rechazar la solicitud de <strong>${esc(sol.estudiante)}</strong>. Indica el motivo (obligatorio):</p><textarea id="motivo" aria-label="Motivo del rechazo"></textarea>`,
            textoOk: 'Rechazar', claseOk: 'btn--peligro',
            alConfirmar: async () => {
                const motivo = modal.querySelector('#motivo').value.trim();
                if (!motivo) return 'No puedes rechazar una solicitud sin especificar el motivo.';
                return resolver(sol, 'rechazada', motivo, 'Solicitud rechazada.');
            }
        });
    }

    async function editar(sol) {
        let becas;
        try { becas = (await Becas.listarBecas()).filter(b => b.activa || b.id === sol.beca_id); }
        catch { return Becas.toast('No se pudieron cargar las becas.', 'error'); }
        Becas.abrirModal(modal, {
            titulo: 'Editar solicitud',
            cuerpoHtml: `<label for="tipo-beca">Beca de <strong>${esc(sol.estudiante)}</strong></label><select id="tipo-beca">${becas.map(b => `<option value="${b.id}"${b.id === sol.beca_id ? ' selected' : ''}>${esc(b.nombre)}${b.activa ? '' : ' (deshabilitada)'}</option>`).join('')}</select>`,
            textoOk: 'Guardar cambios',
            alConfirmar: async () => {
                const r = await Becas.editarSolicitud(sol.id, { becaId: Number(modal.querySelector('#tipo-beca').value) });
                if (!r.ok) return r.error;
                Becas.toast('Solicitud actualizada.', 'ok');
                await pintar();
                return null;
            }
        });
    }

    cuerpo.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-accion]');
        if (!btn) return;
        if (btn.dataset.accion === 'reintentar') return cargar();
        const sol = buscar(btn.closest('tr').dataset.id);
        if (!sol) return;
        const acciones = {
            ver: () => Becas.abrirModal(modal, { titulo: `Documentos de ${sol.estudiante}`, cuerpoHtml: Becas.documentosHtml(sol) }),
            aprobar: () => aprobar(sol), rechazar: () => rechazar(sol), editar: () => editar(sol)
        };
        acciones[btn.dataset.accion]?.();
    });

    selFiltro.addEventListener('change', pintar);
    document.querySelector('.logout').addEventListener('click', () => {
        if (confirm('¿Deseas cerrar sesión de forma segura?')) Becas.cerrarSesion();
    });

    cargar();
});
