document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await Becas.exigirRol('verificador');   // protege la vista
    if (!sesion) return;

    const { esc, ESTADOS } = Becas;
    const cuerpo = document.getElementById('tabla-body');
    const modal = document.getElementById('modal');
    const selFiltro = document.getElementById('filtro');

    document.getElementById('usuario-nombre').textContent = sesion.nombre;

    let cache = [];   // última lista descargada del servidor
    const buscar = (id) => cache.find(s => String(s.id) === id);

    /* ---------- Tabla ---------- */
    function fila(s) {
        const estado = ESTADOS[s.estado];
        const pendiente = s.estado === 'en_verificacion';
        return `
            <tr data-id="${esc(s.id)}">
                <td>${esc(s.cedula)}</td>
                <td>${esc(s.estudiante)}</td>
                <td>${esc(s.beca)}</td>
                <td><span class="badge badge--${estado.clase}">${estado.texto}</span></td>
                <td class="acciones">
                    <button type="button" class="btn btn--secundario btn--sm" data-accion="ver">Ver documentos</button>
                    <button type="button" class="btn btn--exito btn--sm" data-accion="valida" ${pendiente ? '' : 'disabled'}>Documentación válida</button>
                    <button type="button" class="btn btn--aviso btn--sm" data-accion="novedades" ${pendiente ? '' : 'disabled'}>Con novedades</button>
                </td>
            </tr>`;
    }

    async function pintar() {
        let todas;
        try { todas = await Becas.listarSolicitudes(); }
        catch (err) {
            document.getElementById('resumen').textContent = 'No se pudieron cargar los datos';
            cuerpo.innerHTML = '<tr><td colspan="5" class="vacio">No se pudieron cargar las solicitudes. <button type="button" class="btn btn--secundario btn--sm" data-accion="reintentar">Reintentar</button></td></tr>';
            return;
        }
        cache = todas;
        const porVerificar = todas.filter(s => s.estado === 'en_verificacion');
        const lista = selFiltro.value === 'todas' ? todas : porVerificar;
        document.getElementById('resumen').textContent =
            porVerificar.length === 1 ? '1 solicitud por verificar' : `${porVerificar.length} solicitudes por verificar`;
        cuerpo.innerHTML = lista.length
            ? lista.map(fila).join('')
            : '<tr><td colspan="5" class="vacio">No hay solicitudes para mostrar.</td></tr>';
    }

    /* ---------- Acciones ---------- */
    function verDocumentos(sol) {
        Becas.abrirModal(modal, { titulo: `Documentos de ${sol.estudiante}`, cuerpoHtml: Becas.documentosHtml(sol) });
    }

    function marcarValida(sol) {
        Becas.abrirModal(modal, {
            titulo: 'Documentación válida',
            cuerpoHtml: `<p>¿Confirmas que los documentos de <strong>${esc(sol.estudiante)}</strong> están completos y son legibles? La solicitud pasará a la administración.</p>`,
            textoOk: 'Confirmar',
            claseOk: 'btn--exito',
            alConfirmar: async () => {
                const r = await Becas.cambiarEstado(sol.id, 'documentacion_valida');
                if (!r.ok) return r.error;
                Becas.toast('Documentación marcada como válida.', 'ok');
                await await pintar();
                return null;
            }
        });
    }

    function marcarNovedades(sol) {
        Becas.abrirModal(modal, {
            titulo: 'Documentación con novedades',
            cuerpoHtml: `<p style="margin-bottom:.6rem">Indica qué debe corregir <strong>${esc(sol.estudiante)}</strong> (obligatorio):</p><textarea id="motivo" aria-label="Observación para el estudiante"></textarea>`,
            textoOk: 'Enviar observación',
            claseOk: 'btn--aviso',
            alConfirmar: async () => {
                const motivo = modal.querySelector('#motivo').value.trim();
                if (!motivo) return 'Escribe la observación para el estudiante.';
                const r = await Becas.cambiarEstado(sol.id, 'con_novedades', { detalle: motivo });
                if (!r.ok) return r.error;
                Becas.toast('Observación enviada al estudiante.', 'ok');
                await await pintar();
                return null;
            }
        });
    }

    cuerpo.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-accion]');
        if (!btn) return;
        if (btn.dataset.accion === 'reintentar') return pintar();
        const sol = buscar(btn.closest('tr').dataset.id);
        if (!sol) return;
        if (btn.dataset.accion === 'ver') verDocumentos(sol);
        else if (btn.dataset.accion === 'valida') marcarValida(sol);
        else if (btn.dataset.accion === 'novedades') marcarNovedades(sol);
    });

    selFiltro.addEventListener('change', pintar);
    document.querySelector('.btn-logout').addEventListener('click', () => {
        if (confirm('¿Deseas cerrar tu sesión?')) Becas.cerrarSesion();
    });

    await pintar();
});
