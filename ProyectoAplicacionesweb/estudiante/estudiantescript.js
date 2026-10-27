document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await Becas.exigirRol('estudiante');   // protege la vista
    if (!sesion) return;

    const { esc, ESTADOS, estadoPublico } = Becas;
    const MAX_BYTES = 2 * 1024 * 1024;               // 2 MB
    const PASO_ACTIVO = { sin_documentos: 1, en_verificacion: 2, documentacion_valida: 3, con_novedades: 1, aprobada: 4, rechazada: 3 };
    const QUIEN = { estudiante: 'Tú', verificador: 'Verificación', admin: 'Administración' };
    const ICONO_VOLVER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
    const vista = document.getElementById('vista');
    const modal = document.getElementById('modal');
    let solicitud = null;   // postulación mostrada en "Mis postulaciones"

    document.getElementById('usuario-nombre').textContent = sesion.nombre;

    /* ---------- Utilidades ---------- */
    const fecha = (iso) => new Date(iso).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' });
    const esPdf = (f) => f.name.toLowerCase().endsWith('.pdf') && (f.type === 'application/pdf' || f.type === '');
    const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
    const botonVolver = () => `<button type="button" class="btn-volver" data-volver>${ICONO_VOLVER}Retroceder</button>`;
    const detalleDe = (estado) => {
        const h = [...solicitud.historial].reverse().find(x => x.estado === estado);
        return h ? h.detalle : '';
    };

    /* ====================== PANTALLA 1: Explorador de becas ====================== */
    async function vistaBecas() {
        const [becas, sol] = await Promise.all([Becas.listarBecas(), Becas.miSolicitud()]);
        const aviso = sol
            ? `<div class="aviso-info"><span>Ya tienes una postulación en curso: <strong>${esc(sol.beca)}</strong>.</span><a class="btn btn--secundario btn--sm" href="#/postulaciones">Ver mis postulaciones</a></div>` : '';
        const tarjeta = (b) => {
            const docs = b.requisitos.filter(r => r.es_documento).length;
            const actual = sol && sol.beca_id === b.id;
            return `
                <article class="card beca-card${actual ? ' beca-card--actual' : ''}" data-texto="${esc(`${b.nombre} ${b.descripcion}`.toLowerCase())}">
                    <div class="beca-card__cab"><h2>${esc(b.nombre)}</h2>${actual ? '<span class="badge badge--info">Tu postulación</span>' : ''}</div>
                    <p class="beca-card__desc">${esc(b.descripcion || 'Consulta los requisitos en el detalle de la beca.')}</p>
                    <p class="beca-card__meta">${plural(b.requisitos.length, 'requisito', 'requisitos')}, ${plural(docs, 'documento', 'documentos')} en PDF</p>
                    <a class="btn btn--primario btn--sm" href="#/beca/${b.id}">Ver detalle</a>
                </article>`;
        };
        const cuerpo = becas.length
            ? `<div class="rejilla-becas" id="rejilla">${becas.map(tarjeta).join('')}</div><p class="vacio" id="sin-resultados" hidden>Ninguna beca coincide con tu búsqueda.</p>`
            : '<div class="card bloque"><p class="vacio">Por ahora no hay becas habilitadas. Vuelve a revisar más adelante.</p></div>';
        return {
            html: `
                <div class="vista-cab">
                    <div><h1>Becas disponibles</h1><p class="sub">Explora las becas habilitadas y revisa sus requisitos antes de postular.</p></div>
                    ${becas.length ? '<div class="buscador"><label class="sr-only" for="buscar">Buscar becas</label><input type="search" id="buscar" placeholder="Buscar una beca"></div>' : ''}
                </div>${aviso}${cuerpo}`,
            montar() {
                const campo = document.getElementById('buscar');
                if (!campo) return;
                campo.addEventListener('input', () => {
                    const q = campo.value.trim().toLowerCase();
                    let visibles = 0;
                    document.querySelectorAll('#rejilla .beca-card').forEach(c => { const ok = c.dataset.texto.includes(q); c.hidden = !ok; if (ok) visibles++; });
                    document.getElementById('sin-resultados').hidden = visibles > 0;
                });
            }
        };
    }

    /* ====================== PANTALLA 2: Detalle de una beca ====================== */
    async function vistaDetalle(id) {
        const [becas, sol] = await Promise.all([Becas.listarBecas(), Becas.miSolicitud()]);
        const b = becas.find(x => x.id === Number(id));
        if (!b) {
            return { html: `${botonVolver()}<div class="card bloque"><h1>Beca no disponible</h1><p class="nota">Esta beca no existe o ya no está habilitada.</p><p><a class="btn btn--primario" href="#/becas">Ver becas disponibles</a></p></div>` };
        }
        const requisitos = b.requisitos.map(r => `<li><span>${esc(r.descripcion)}</span><span class="badge ${r.es_documento ? 'badge--info' : 'badge--neutro'}">${r.es_documento ? 'Documento PDF' : 'Condición'}</span></li>`).join('');
        let accion;
        if (!sol) accion = '<button type="button" class="btn btn--primario" id="btn-postular">Postular a esta beca</button>';
        else if (sol.beca_id === b.id) accion = '<p class="nota">Esta es tu postulación actual.</p><a class="btn btn--secundario" href="#/postulaciones">Ver mi postulación</a>';
        else accion = `<button type="button" class="btn btn--primario" disabled>Postular a esta beca</button><p class="nota">Ya tienes una postulación en curso (${esc(sol.beca)}). Solo puedes tener una a la vez.</p>`;
        return {
            html: `
                ${botonVolver()}
                <section class="card detalle" aria-labelledby="t-beca">
                    <h1 id="t-beca">${esc(b.nombre)}</h1>
                    <p class="detalle__desc">${esc(b.descripcion || 'Esta beca aún no tiene una descripción.')}</p>
                    <h2>Requisitos</h2>
                    <ul class="requisitos">${requisitos}</ul>
                    ${accion}
                </section>`,
            montar() {
                const btn = document.getElementById('btn-postular');
                if (!btn) return;
                btn.addEventListener('click', () => Becas.abrirModal(modal, {
                    titulo: 'Postular a la beca',
                    cuerpoHtml: `<p>Vas a postular a <strong>${esc(b.nombre)}</strong>. Después deberás subir ${plural(b.requisitos.filter(r => r.es_documento).length, 'documento', 'documentos')} en PDF. Solo puedes tener una postulación.</p>`,
                    textoOk: 'Postular',
                    alConfirmar: async () => {
                        const r = await Becas.crearSolicitud(b.id);
                        if (!r.ok) return r.error;
                        Becas.toast('Postulación registrada. Ahora sube tus documentos.', 'ok');
                        navegar('/postulaciones', true);
                        return null;
                    }
                }));
            }
        };
    }

    /* ====================== PANTALLA 3: Mis postulaciones ====================== */
    function formularioDocumentos() {
        const docs = solicitud.requisitos.filter(r => r.es_documento);
        const novedad = solicitud.estado === 'con_novedades'
            ? `<p class="alerta alerta--warn">El verificador encontró novedades: ${esc(detalleDe('con_novedades'))}</p>` : '';
        return `
            ${novedad}
            <p>Sube un PDF por cada documento requerido.</p>
            <form id="form-documentos" novalidate>
                ${docs.map(r => `
                <div class="file-upload-group">
                    <label for="doc-${esc(r.clave)}">${esc(r.descripcion)} (PDF, máx. 2 MB)</label>
                    <input type="file" id="doc-${esc(r.clave)}" data-clave="${esc(r.clave)}" data-nombre="${esc(r.descripcion)}" accept=".pdf,application/pdf">
                </div>`).join('')}
                <p class="alerta" id="form-error" role="alert" hidden></p>
                <button type="submit" class="btn btn--primario btn--bloque btn-upload" id="btn-submit-docs">Subir documentos</button>
            </form>`;
    }

    function mensajeEstado() {
        const msg = (titulo, texto, rechazo = false) => `<div class="success-message${rechazo ? ' success-message--rechazo' : ''}"><h3>${esc(titulo)}</h3><p>${esc(texto)}</p></div>`;
        switch (solicitud.estado) {
            case 'en_verificacion': return msg('Tus documentos están en revisión', 'El departamento de bienestar estudiantil está verificando tu información. Te notificaremos cuando haya una resolución.');
            case 'documentacion_valida': return msg('Documentación validada', 'Tus documentos fueron aprobados por el verificador. Falta la resolución final de la administración.');
            case 'aprobada': return msg('Tu solicitud fue aceptada', 'Felicitaciones, tu postulación fue aceptada.');
            case 'rechazada': return msg('Tu solicitud fue rechazada', `Motivo: ${detalleDe('rechazada') || 'no especificado'}`, true);
            default: return '';
        }
    }

    function listaDocumentosSubidos() {
        return solicitud.documentos ? Becas.documentosHtml(solicitud) : '';
    }

    function otrosRequisitos() {
        const otros = solicitud.requisitos.filter(r => !r.es_documento);
        return otros.length ? `<div class="otros-req">Otros requisitos que verifica el personal:<ul>${otros.map(r => `<li>${esc(r.descripcion)}</li>`).join('')}</ul></div>` : '';
    }

    function lineaDeTiempo() {
        return solicitud.historial.map(h => {
            const texto = h.accion === 'creacion' ? `Postulación registrada: ${h.detalle}`
                : h.accion === 'edicion' ? h.detalle
                : `${(ESTADOS[h.estado] || {}).texto || ''}${h.detalle ? `. ${h.detalle}` : ''}`;
            return `<li><time datetime="${esc(h.fecha)}">${fecha(h.fecha)}</time><p>${esc(texto)}</p><span class="quien">${QUIEN[h.rol] || ''}</span></li>`;
        }).join('');
    }

    function listaNotificaciones(lista) {
        return lista.length
            ? lista.map(n => `<li class="${n.leida ? '' : 'nueva'}">${esc(n.texto)}<time datetime="${esc(n.fecha)}">${fecha(n.fecha)}</time></li>`).join('')
            : '<li class="vacio">No tienes notificaciones.</li>';
    }

    async function vistaPostulaciones() {
        const [sol, notifs] = await Promise.all([Becas.miSolicitud(), Becas.notificaciones()]);
        solicitud = sol;
        const aside = `
            <aside class="card bloque" aria-labelledby="t-notif">
                <div class="bloque__cab"><h2 id="t-notif">Notificaciones</h2><button type="button" id="btn-leidas" class="btn btn--secundario btn--sm"${notifs.some(n => !n.leida) ? '' : ' disabled'}>Marcar como leídas</button></div>
                <ul class="notifs" id="lista-notif">${listaNotificaciones(notifs)}</ul>
            </aside>`;
        if (!sol) {
            return { html: `${botonVolver()}<h1>Mis postulaciones</h1><p class="sub">Aquí verás el detalle y el estado de tu solicitud.</p>
                <div class="panel"><div class="card bloque"><p class="vacio">Aún no tienes ninguna postulación.</p><p style="text-align:center"><a class="btn btn--primario" href="#/becas">Explorar becas disponibles</a></p></div>${aside}</div>` };
        }
        const pub = estadoPublico(sol.estado), det = ESTADOS[sol.estado];
        const creacion = sol.historial.find(h => h.accion === 'creacion');
        const puedeSubir = sol.estado === 'sin_documentos' || sol.estado === 'con_novedades';
        return {
            html: `
                ${botonVolver()}
                <h1>Mis postulaciones</h1>
                <p class="sub">Detalle y seguimiento de tu solicitud actual.</p>
                <div class="panel">
                    <div class="columna">
                        <section class="card bloque" aria-labelledby="t-estado">
                            <div class="bloque__cab">
                                <div><h2 id="t-estado">${esc(sol.beca)}</h2><p class="meta">Solicitud ${esc(sol.codigo)}${creacion ? `, registrada el ${fecha(creacion.fecha)}` : ''}</p></div>
                                <div class="estados">
                                    <span id="estado-badge" class="badge badge--${pub.clase}">${pub.texto}</span>
                                    ${sol.estado === 'aprobada' || sol.estado === 'rechazada' ? '' : `<span id="estado-detalle" class="badge badge--${det.clase} badge--suave">${det.texto}</span>`}
                                </div>
                            </div>
                            <ol class="steps" id="steps">
                                <li class="step">Postulación</li><li class="step">Documentos</li><li class="step">Verificación</li><li class="step">Resolución</li>
                            </ol>
                        </section>
                        <section class="card bloque" aria-labelledby="t-docs">
                            <h2 id="t-docs">Documentos</h2>
                            <div class="action-area" id="action-area">${puedeSubir ? formularioDocumentos() : mensajeEstado() + listaDocumentosSubidos()}${otrosRequisitos()}</div>
                        </section>
                        <section class="card bloque" aria-labelledby="t-hist">
                            <h2 id="t-hist" style="margin-bottom:1rem">Historial</h2>
                            <ol class="timeline">${lineaDeTiempo()}</ol>
                        </section>
                    </div>
                    ${aside}
                </div>`,
            montar() {
                const activo = PASO_ACTIVO[sol.estado];
                document.querySelectorAll('#steps .step').forEach((paso, i) => {
                    if (i < activo) paso.classList.add('completed');
                    else if (i === activo) {
                        paso.classList.add(sol.estado === 'rechazada' ? 'rejected' : sol.estado === 'con_novedades' ? 'warn' : 'active');
                        paso.setAttribute('aria-current', 'step');
                    }
                });
            }
        };
    }

    /* ---------- Envío de documentos y notificaciones (delegado: las vistas se vuelven a dibujar) ---------- */
    vista.addEventListener('submit', async (e) => {
        if (e.target.id !== 'form-documentos') return;
        e.preventDefault();
        const error = document.getElementById('form-error');
        const mostrarError = (msg) => { error.textContent = msg; error.hidden = false; };
        error.hidden = true;

        const documentos = {};
        for (const input of e.target.querySelectorAll('input[type="file"]')) {
            const file = input.files[0], nombre = input.dataset.nombre;
            if (!file) return mostrarError(`Selecciona el archivo de ${nombre}.`);
            if (!esPdf(file)) return mostrarError(`El archivo de ${nombre} debe ser un PDF.`);
            if (file.size > MAX_BYTES) return mostrarError(`El archivo de ${nombre} supera los 2 MB permitidos.`);
            documentos[input.dataset.clave] = { nombre: file.name, bytes: file.size };
        }
        const boton = document.getElementById('btn-submit-docs');
        boton.disabled = true;
        const r = await Becas.cambiarEstado(solicitud.id, 'en_verificacion', { documentos });
        if (!r.ok) { boton.disabled = false; return mostrarError(r.error); }
        Becas.toast('Documentos subidos. Tu postulación pasó a revisión.', 'ok');
        render();
    });

    vista.addEventListener('click', async (e) => {
        if (!e.target.closest('#btn-leidas')) return;
        await Becas.marcarLeidas();
        render();
    });

    /* ---------- Navegación: rutas con # y botón Retroceder ---------- */
    const RUTAS = [
        { patron: /^\/becas$/, titulo: 'Becas disponibles', tab: 'becas', pintar: vistaBecas },
        { patron: /^\/beca\/(\d+)$/, titulo: 'Detalle de la beca', tab: 'becas', pintar: vistaDetalle },
        { patron: /^\/postulaciones$/, titulo: 'Mis postulaciones', tab: 'postulaciones', pintar: vistaPostulaciones }
    ];
    let turno = 0;   // evita que una respuesta lenta pise una pantalla más reciente

    function navegar(ruta, reemplazar = false) {
        const n = history.state?.n ?? 0;
        history[reemplazar ? 'replaceState' : 'pushState']({ n: reemplazar ? n : n + 1 }, '', '#' + ruta);
        return render();
    }
    /* Retroceder: vuelve a la pantalla anterior de esta sesión; si se entró directo a una pantalla, va al explorador */
    function volver() {
        if ((history.state?.n ?? 0) > 0) history.back();
        else navegar('/becas', true);
    }

    async function actualizarContador() {
        const sinLeer = (await Becas.notificaciones()).filter(n => !n.leida).length;
        const c = document.getElementById('badge-notif');
        c.textContent = sinLeer;
        c.hidden = sinLeer === 0;
    }

    async function render() {
        const ruta = location.hash.slice(1) || '/becas';
        const def = RUTAS.find(r => r.patron.test(ruta));
        if (!def) return navegar('/becas', true);
        const mio = ++turno;
        document.querySelectorAll('[data-tab]').forEach(a => {
            const activo = a.dataset.tab === def.tab;
            a.classList.toggle('activo', activo);
            if (activo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        });
        document.title = `${def.titulo} - Becas Uleam`;
        vista.innerHTML = '<p class="vacio"><span class="spinner" aria-hidden="true"></span>Cargando…</p>';
        try {
            const { html, montar } = await def.pintar(...ruta.match(def.patron).slice(1));
            if (mio !== turno) return;
            vista.innerHTML = html;
            if (montar) montar();
            window.scrollTo(0, 0);
            const titulo = vista.querySelector('h1');
            if (titulo) { titulo.tabIndex = -1; titulo.focus({ preventScroll: true }); }
        } catch (err) {
            if (mio !== turno) return;
            console.error(err);
            vista.innerHTML = `<div class="card bloque"><p class="alerta">${esc(err.message || 'No se pudo cargar la información.')} <button type="button" class="btn btn--secundario btn--sm" data-reintentar>Reintentar</button></p></div>`;
        }
        actualizarContador();
    }

    document.addEventListener('click', (e) => {
        const enlace = e.target.closest('a[href^="#/"]');
        if (enlace) {
            e.preventDefault();
            const destino = enlace.getAttribute('href');
            if (destino === location.hash) render(); else navegar(destino.slice(1));
        } else if (e.target.closest('[data-volver]')) volver();
        else if (e.target.closest('[data-reintentar]')) render();
    });
    window.addEventListener('popstate', render);

    document.querySelector('.btn-logout').addEventListener('click', () => {
        if (confirm('¿Deseas cerrar tu sesión?')) Becas.cerrarSesion();
    });

    await render();
});
