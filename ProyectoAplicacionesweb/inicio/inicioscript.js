document.addEventListener('DOMContentLoaded', async () => {
    // Menú móvil
    const btn = document.getElementById('menu-btn');
    const menu = document.getElementById('menu');
    btn.addEventListener('click', () => {
        const abierto = menu.classList.toggle('abierto');
        btn.setAttribute('aria-expanded', String(abierto));
    });
    menu.addEventListener('click', (e) => {
        if (e.target.closest('a')) { menu.classList.remove('abierto'); btn.setAttribute('aria-expanded', 'false'); }
    });

    // Si ya hay sesión, el acceso lleva directo al panel del rol
    const sesion = await Becas.sesionActual();
    if (sesion) {
        document.querySelectorAll('.js-acceso').forEach(a => {
            a.textContent = 'Ir a mi panel';
            a.href = Becas.DASHBOARD[sesion.rol];
        });
    }

    // Funciones aún no disponibles
    document.querySelectorAll('[data-proximamente]').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            Becas.toast('La creación de cuentas estará disponible próximamente.');
        });
    });
});
