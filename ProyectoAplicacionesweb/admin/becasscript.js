document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await Becas.exigirRol('admin');   // protege la vista
    if (!sesion) return;

    const { esc } = Becas;
    const MAX_REQUISITOS = 10;
    const cuerpo = document.getElementById('tabla-body');
    const modal = document.getElementById('modal');
    let cache = [];

    document.getElementById('usuario-nombre').textContent = sesion.nombre;

    const buscar = (id) => cache.find(b => String(b.id) === id);
    const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
    const errorDe = (r) => (r.campos ? Object.values(r.campos).join(' ') : r.error);

    /* ---------- Tabla ---------- */
    function fila(b) {
        const docs = b.requisitos.filter(r => r.es_documento).length;
        return `
            <tr data-id="${b.id}">
                <td><strong>${esc(b.nombre)}</strong><br><small class="suave">${esc(b.descripcion || 'Sin descripción')}</small></td>
                <td>${plural(b.requisitos.length, 'requisito', 'requisitos')} (${plural(docs, 'documento', 'documentos')})</td>
                <td>${b.solicitudes}</td>
                <td><span class="badge badge--${b.activa ? 'ok' : 'neutro'}">${b.activa ? 'Habilitada' : 'Deshabilitada'}</span></td>
                <td class="acciones">
                    <button type="button" class="btn btn--secundario btn--sm" data-accion="editar">Editar</button>
                    <button type="button" class="btn ${b.activa ? 'btn--aviso' : 'btn--exito'} btn--sm" data-accion="alternar">${b.activa ? 'Deshabilitar' : 'Habilitar'}</button>
                </td>
            </tr>`;
    }

    async function pintar() {
        cache = await Becas.listarBecas();
        const activas = cache.filter(b => b.activa).length;
        document.getElementById('resumen').textContent = `${plural(cache.length, 'beca', 'becas')}, ${plural(activas, 'habilitada', 'habilitadas')}`;
        cuerpo.innerHTML = cache.length ? cache.map(fila).join('') : '<tr><td colspan="5" class="vacio">Aún no hay becas. Crea la primera con «Nueva beca».</td></tr>';
    }

    function cargar() {
        cuerpo.innerHTML = '<tr><td colspan="5" class="vacio"><span class="spinner" aria-hidden="true"></span>Cargando becas…</td></tr>';
        setTimeout(async () => {
            try { await pintar(); }
            catch (err) {
                console.error(err);
                document.getElementById('resumen').textContent = 'No se pudieron cargar los datos';
                cuerpo.innerHTML = '<tr><td colspan="5" class="vacio">No se pudieron cargar las becas. <button type="button" class="btn btn--secundario btn--sm" data-accion="reintentar">Reintentar</button></td></tr>';
            }
        }, 250);
    }

    /* ---------- Formulario de beca (crear y editar) ---------- */
    const filaRequisito = (r) => `
        <div class="req-fila" data-id="${r.id ?? ''}">
            <input type="text" class="req-desc" maxlength="150" placeholder="Descripción del requisito" aria-label="Descripción del requisito" value="${esc(r.descripcion)}">
            <label class="check"><input type="checkbox" class="req-doc"${r.es_documento ? ' checked' : ''}> Documento PDF</label>
            <button type="button" class="btn btn--secundario btn--sm" data-del-req aria-label="Quitar requisito">Quitar</button>
        </div>`;

    function formulario(b) {
        const requisitos = b ? b.requisitos : [{ descripcion: '', es_documento: true }];
        return `
            <div class="campo"><label for="f-nombre">Nombre de la beca</label><input type="text" id="f-nombre" maxlength="80" value="${esc(b ? b.nombre : '')}"></div>
            <div class="campo"><label for="f-desc">Descripción</label><textarea id="f-desc" maxlength="500">${esc(b ? b.descripcion : '')}</textarea></div>
            ${b ? '' : '<label class="check"><input type="checkbox" id="f-activa" checked> Habilitada (visible para los estudiantes)</label>'}
            <fieldset class="reqs">
                <legend>Requisitos</legend>
                <div id="f-reqs">${requisitos.map(filaRequisito).join('')}</div>
                <button type="button" class="btn btn--secundario btn--sm" data-add-req>Agregar requisito</button>
                <p class="nota">Los marcados como documento se piden al estudiante como PDF. Los demás son condiciones que revisa el personal. Mínimo un documento, máximo ${MAX_REQUISITOS} requisitos.</p>
            </fieldset>`;
    }

    function leerFormulario() {
        return {
            nombre: modal.querySelector('#f-nombre').value,
            descripcion: modal.querySelector('#f-desc').value,
            requisitos: [...modal.querySelectorAll('.req-fila')].map(f => ({
                id: f.dataset.id ? Number(f.dataset.id) : undefined,
                descripcion: f.querySelector('.req-desc').value,
                es_documento: f.querySelector('.req-doc').checked
            }))
        };
    }

    function abrirFormulario(b) {
        Becas.abrirModal(modal, {
            titulo: b ? 'Editar beca' : 'Nueva beca',
            cuerpoHtml: formulario(b),
            textoOk: b ? 'Guardar cambios' : 'Crear beca',
            ancho: true,
            alConfirmar: async () => {
                const datos = leerFormulario();
                const r = b
                    ? await Becas.editarBeca(b.id, datos)
                    : await Becas.crearBeca({ ...datos, activa: modal.querySelector('#f-activa').checked });
                if (!r.ok) return errorDe(r);
                Becas.toast(b ? 'Beca actualizada.' : 'Beca creada.', 'ok');
                await pintar();
                return null;
            }
        });
    }

    /* Agregar y quitar requisitos dentro de la ventana (delegado: el contenido se dibuja cada vez) */
    modal.addEventListener('click', (e) => {
        const lista = modal.querySelector('#f-reqs');
        if (!lista) return;
        if (e.target.closest('[data-add-req]')) {
            if (lista.children.length >= MAX_REQUISITOS) return Becas.toast(`Máximo ${MAX_REQUISITOS} requisitos.`);
            lista.insertAdjacentHTML('beforeend', filaRequisito({ descripcion: '', es_documento: false }));
            lista.lastElementChild.querySelector('.req-desc').focus();
        }
        const quitar = e.target.closest('[data-del-req]');
        if (quitar) quitar.closest('.req-fila').remove();
    });

    function alternar(b) {
        const habilitar = !b.activa;
        Becas.abrirModal(modal, {
            titulo: habilitar ? 'Habilitar beca' : 'Deshabilitar beca',
            cuerpoHtml: habilitar
                ? `<p>¿Habilitar <strong>${esc(b.nombre)}</strong>? Los estudiantes volverán a verla y podrán postular.</p>`
                : `<p>¿Deshabilitar <strong>${esc(b.nombre)}</strong>? Los estudiantes dejarán de verla y no podrán postular. Las postulaciones ya registradas se conservan.</p>`,
            textoOk: habilitar ? 'Habilitar' : 'Deshabilitar',
            claseOk: habilitar ? 'btn--exito' : 'btn--aviso',
            alConfirmar: async () => {
                const r = await Becas.editarBeca(b.id, { activa: habilitar });
                if (!r.ok) return errorDe(r);
                Becas.toast(habilitar ? 'Beca habilitada.' : 'Beca deshabilitada.', 'ok');
                await pintar();
                return null;
            }
        });
    }

    cuerpo.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-accion]');
        if (!btn) return;
        if (btn.dataset.accion === 'reintentar') return cargar();
        const b = buscar(btn.closest('tr').dataset.id);
        if (!b) return;
        if (btn.dataset.accion === 'editar') abrirFormulario(b);
        else if (btn.dataset.accion === 'alternar') alternar(b);
    });

    document.getElementById('btn-nueva').addEventListener('click', () => abrirFormulario(null));
    document.querySelector('.logout').addEventListener('click', () => {
        if (confirm('¿Deseas cerrar sesión de forma segura?')) Becas.cerrarSesion();
    });

    cargar();
});
