document.addEventListener('DOMContentLoaded', async () => {
    // Si ya hay una sesión activa en el servidor, ir directo al panel del rol
    const previa = await Becas.sesionActual();
    if (previa) { location.replace(Becas.DASHBOARD[previa.rol]); return; }

    const form = document.getElementById('login-form');
    const email = document.getElementById('email');
    const clave = document.getElementById('clave');
    const btn = document.getElementById('btn-ingresar');
    const errorGeneral = document.getElementById('error-general');

    if (new URLSearchParams(location.search).get('registrado') === '1') document.getElementById('aviso-registro').hidden = false;

    const marcarError = (input, mensaje) => {
        input.closest('.campo').classList.toggle('campo--error', Boolean(mensaje));
        document.getElementById(`error-${input.id}`).textContent = mensaje || '';
        input.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
    };

    const validar = () => {
        const correo = email.value.trim();
        let primerError = null;
        if (!correo) { marcarError(email, 'Ingresa tu correo institucional.'); primerError = email; }
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { marcarError(email, 'El formato del correo no es válido.'); primerError = email; }
        else marcarError(email, '');
        if (!clave.value) { marcarError(clave, 'Ingresa tu contraseña.'); primerError = primerError || clave; }
        else marcarError(clave, '');
        if (primerError) primerError.focus();
        return !primerError;
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorGeneral.hidden = true;
        if (!validar()) return;

        btn.disabled = true;
        btn.textContent = 'Verificando...';
        const r = await Becas.iniciarSesion(email.value, clave.value);   // el servidor valida y decide el rol
        if (!r.ok) {
            errorGeneral.textContent = r.error || 'No se pudo iniciar sesión.';
            errorGeneral.hidden = false;
            btn.disabled = false;
            btn.textContent = 'Ingresar';
            clave.value = '';
            clave.focus();
            return;
        }
        location.href = Becas.DASHBOARD[r.usuario.rol];
    });

    // Mostrar / ocultar contraseña
    const verClave = document.getElementById('ver-clave');
    verClave.addEventListener('click', () => {
        const oculta = clave.type === 'password';
        clave.type = oculta ? 'text' : 'password';
        verClave.textContent = oculta ? 'Ocultar' : 'Mostrar';
        verClave.setAttribute('aria-label', oculta ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });

    // Funciones aún no disponibles
    document.querySelectorAll('[data-proximamente]').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            Becas.toast('Esta opción estará disponible en una próxima versión.');
        });
    });
});
