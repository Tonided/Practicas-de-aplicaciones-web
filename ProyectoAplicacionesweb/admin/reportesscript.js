document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await Becas.exigirRol('admin');   // protege la vista
    if (!sesion) return;

    const { esc, ESTADOS } = Becas;
    const COLOR_RELLENO = { ok: 'ok', warn: 'warn', info: 'info', neutro: 'neutro', danger: 'danger' };
    const btnCsv = document.getElementById('btn-csv');
    let datos = null;

    document.getElementById('usuario-nombre').textContent = sesion.nombre;

    const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
    const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

    /* ---------- Bloques del reporte ---------- */
    function pintarKpis(d) {
        const t = d.totales;
        const lista = [
            [t.estudiantes, 'Estudiantes registrados'],
            [t.solicitudes, 'Postulaciones recibidas'],
            [`${t.becas_activas} de ${t.becas_total}`, 'Becas habilitadas'],
            [d.tasa_aprobacion === null ? 'Sin datos' : `${d.tasa_aprobacion}%`, 'Tasa de aceptación']
        ];
        document.getElementById('kpis').innerHTML = lista.map(([v, e]) => `<div class="kpi"><b>${v}</b><span>${e}</span></div>`).join('');
    }

    function pintarResultado(d) {
        const total = d.totales.solicitudes;
        const cont = document.getElementById('resultado');
        if (!total) { cont.innerHTML = '<p class="vacio">Aún no hay postulaciones para mostrar.</p>'; return; }
        const { aprobada, rechazada } = d.por_estado;
        const partes = [['Aceptadas', aprobada, 'ok', 'var(--ok)'], ['Rechazadas', rechazada, 'danger', 'var(--peligro)'], ['En progreso', total - aprobada - rechazada, 'warn', 'var(--dorado)']];
        let acum = 0;
        const tramos = partes.filter(p => p[1] > 0).map(([, n, , color]) => { const ini = acum; acum += (n / total) * 100; return `${color} ${ini}% ${acum}%`; }).join(', ');
        cont.innerHTML = `
            <div class="donut-fila">
                <div class="donut" data-fondo="${tramos}" role="img" aria-label="${partes.map(([n, v]) => `${n}: ${v}`).join(', ')}"><span><b>${total}</b>postulaciones</span></div>
                <ul class="leyenda">${partes.map(([n, v, c]) => `<li><i class="c-${c}"></i>${n}: <strong>${v}</strong> (${pct(v, total)}%)</li>`).join('')}</ul>
            </div>`;
        cont.querySelector('.donut').style.background = `conic-gradient(${tramos})`;
    }

    function pintarRanking(d) {
        const cont = document.getElementById('ranking');
        if (!d.totales.solicitudes) { cont.innerHTML = '<p class="vacio">Aún no hay postulaciones para mostrar.</p>'; return; }
        const max = Math.max(...d.por_beca.map(b => b.solicitudes), 1);
        cont.innerHTML = `<ol class="barras">${d.por_beca.map(b => `
            <li class="barra-fila">
                <div class="barra-fila__cab"><span>${esc(b.nombre)}${b.activa ? '' : ' <span class="badge badge--neutro">Deshabilitada</span>'}</span><strong>${plural(b.solicitudes, 'postulación', 'postulaciones')}</strong></div>
                <div class="pista"><div class="relleno" data-ancho="${pct(b.solicitudes, max)}"></div></div>
                <small>${plural(b.aprobadas, 'aceptada', 'aceptadas')}, ${plural(b.rechazadas, 'rechazada', 'rechazadas')}</small>
            </li>`).join('')}</ol>`;
    }

    function pintarEtapas(d) {
        const cont = document.getElementById('etapas');
        const total = d.totales.solicitudes;
        if (!total) { cont.innerHTML = '<p class="vacio">Aún no hay postulaciones para mostrar.</p>'; return; }
        cont.innerHTML = `<ul class="barras">${Object.entries(ESTADOS).map(([estado, e]) => `
            <li class="barra-fila">
                <div class="barra-fila__cab"><span>${e.texto}</span><strong>${d.por_estado[estado]} (${pct(d.por_estado[estado], total)}%)</strong></div>
                <div class="pista"><div class="relleno relleno--${COLOR_RELLENO[e.clase]}" data-ancho="${pct(d.por_estado[estado], total)}"></div></div>
            </li>`).join('')}</ul>`;
    }

    async function cargar() {
        document.getElementById('resumen').textContent = 'Cargando…';
        btnCsv.disabled = true;
        const zona = document.getElementById('contenido-reportes');
        try {
            datos = await Becas.reportes();
        } catch (err) {
            console.error(err);
            document.getElementById('resumen').textContent = 'No se pudieron cargar los reportes';
            zona.innerHTML = '<div class="card panel-rep"><p class="vacio">No se pudieron cargar los reportes. Usa «Actualizar» para reintentar.</p></div>';
            return;
        }
        if (!document.getElementById('kpis')) location.reload();   // se había reemplazado el contenido por el mensaje de error
        pintarKpis(datos); pintarResultado(datos); pintarRanking(datos); pintarEtapas(datos);
        document.querySelectorAll('[data-ancho]').forEach(el => { el.style.width = `${el.dataset.ancho}%`; });
        document.getElementById('resumen').textContent = `${plural(datos.totales.solicitudes, 'postulación registrada', 'postulaciones registradas')}. Actualizado a las ${new Date().toLocaleTimeString('es-EC', { timeStyle: 'short' })}`;
        btnCsv.disabled = false;
    }

    /* ---------- Exportar CSV (neutraliza celdas que Excel interpretaría como fórmulas) ---------- */
    const celda = (v) => {
        let s = String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
        return `"${s.replace(/"/g, '""')}"`;
    };
    function descargarCsv() {
        const filas = [
            ['Beca', 'Habilitada', 'Postulaciones', 'Aceptadas', 'Rechazadas'],
            ...datos.por_beca.map(b => [b.nombre, b.activa ? 'Sí' : 'No', b.solicitudes, b.aprobadas, b.rechazadas]),
            [],
            ['Etapa', 'Postulaciones'],
            ...Object.entries(ESTADOS).map(([k, e]) => [e.texto, datos.por_estado[k]])
        ];
        const csv = '\ufeff' + filas.map(f => f.map(celda).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte-becas-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    document.getElementById('btn-actualizar').addEventListener('click', cargar);
    btnCsv.addEventListener('click', descargarCsv);
    document.querySelector('.logout').addEventListener('click', () => {
        if (confirm('¿Deseas cerrar sesión de forma segura?')) Becas.cerrarSesion();
    });

    await cargar();
});
