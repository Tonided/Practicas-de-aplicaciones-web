document.addEventListener('DOMContentLoaded', async () => {
    if (await Becas.sesionActual()) { location.replace(Becas.DASHBOARD[(await Becas.sesionActual()).rol]); return; }

    const form = document.getElementById('registro-form');
    const btn = document.getElementById('btn-registrar');
    const errorGeneral = document.getElementById('error-general');
    const CAMPOS = ['nombres', 'apellidos', 'email', 'cedula', 'clave', 'confirmacion', 'acepta'];
    const el = (id) => document.getElementById(id);

    const marcar = (id, mensaje) => {
        el(id).closest('.campo').classList.toggle('campo--error', Boolean(mensaje));
        el(`error-${id}`).textContent = mensaje || '';
        el(id).setAttribute('aria-invalid', mensaje ? 'true' : 'false');
    };

    /* Misma política que el servidor (el servidor vuelve a validar todo) */
    function validar(d) {
        const e = {};
        if (d.nombres.length < 2) e.nombres = 'Ingresa tus nombres.';
        if (d.apellidos.length < 2) e.apellidos = 'Ingresa tus apellidos.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = 'Ingresa un correo electrónico válido.';
        if (!/^\d{10}$/.test(d.cedula)) e.cedula = 'La cédula debe tener 10 dígitos numéricos.';
        if (d.clave.length < 8) e.clave = 'Debe tener al menos 8 caracteres.';
        else if (!/[A-Za-z]/.test(d.clave) || !/\d/.test(d.clave)) e.clave = 'Debe incluir letras y números.';
        else if (d.clave !== d.confirmacion) e.confirmacion = 'Las contraseñas no coinciden.';
        if (!d.acepta) e.acepta = 'Debes aceptar el tratamiento de tus datos para continuar.';
        return e;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorGeneral.hidden = true;
        const datos = {
            nombres: el('nombres').value.trim(), apellidos: el('apellidos').value.trim(), email: el('email').value.trim(),
            cedula: el('cedula').value.trim(), clave: el('clave').value, confirmacion: el('confirmacion').value, acepta: el('acepta').checked
        };
        const errores = validar(datos);
        CAMPOS.forEach(c => marcar(c, errores[c]));
        const primero = CAMPOS.find(c => errores[c]);
        if (primero) { el(primero).focus(); return; }

        btn.disabled = true;
        btn.textContent = 'Creando cuenta...';
        const r = await Becas.registrar(datos);
        if (r.ok) { location.href = '../login/index.html?registrado=1'; return; }

        // Errores del servidor (duplicados, validaciones): se muestran junto al campo correspondiente
        CAMPOS.forEach(c => marcar(c, r.campos && r.campos[c]));
        if (!r.campos) { errorGeneral.textContent = r.error; errorGeneral.hidden = false; }
        else { const c = CAMPOS.find(x => r.campos[x]); if (c) el(c).focus(); }
        btn.disabled = false;
        btn.textContent = 'Crear cuenta';
    });
});
