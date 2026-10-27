# Arquitectura

```
Navegador (HTML/CSS/JS)                 Servidor Node.js (server/)                 SQLite
 login, registro, estudiante,   ──fetch──▶ app.js: rutas /api/*, sesiones,   ──▶  data/becas.db
 verificador, admin, inicio      cookie    permisos, validación, estático          (migraciones)
        │ assets/js/core.js (cliente API)
```

## Estructura

| Carpeta | Contenido |
|---|---|
| `server/` | `index.js` (arranque), `app.js` (rutas, sesiones, permisos, archivos estáticos), `db.js` (SQLite y migraciones), `seguridad.js` (hash, política de contraseñas, tokens), `usuarios.js` (validación y alta), `crear-usuario.js` (CLI) |
| `database/migrations/` | Esquema versionado en archivos `.sql` |
| `assets/`, `inicio/`, `login/`, `registro/`, `estudiante/`, `verificador/`, `admin/` | Frontend. Una carpeta por rol, con enlaces relativos |
| `tests/` | `api.test.js` (Node) y `e2e_navegador.py` (Chromium) |

El servidor entrega solo el frontend; `server/`, `database/`, `data/`, `tests/`, `docs/` y `.env` nunca se sirven.

## Autenticación y sesiones

- `POST /api/login` verifica la contraseña con `scrypt` (también cuando el correo no existe, para no revelarlo) y crea una sesión de 8 horas. El navegador recibe un token aleatorio en una cookie `HttpOnly; SameSite=Lax`; en la base solo se guarda su hash SHA-256.
- `POST /api/logout` borra la sesión en el servidor.
- `core.js` consulta `/api/sesion` y `exigirRol()` redirige las vistas, **pero eso es solo comodidad**: cada operación vuelve a comprobar sesión y rol en el servidor.

## Rutas de la API

| Ruta | Quién puede |
|---|---|
| `GET /api/salud`, `GET /api/sesion`, `POST /api/registro`, `POST /api/login`, `POST /api/logout` | Público |
| `GET /api/becas` | Estudiante: solo las habilitadas. Administrador: todas, con conteo de postulaciones |
| `POST /api/becas`, `PATCH /api/becas/:id` (editar, requisitos, habilitar o deshabilitar) | Administrador |
| `GET /api/reportes` | Administrador |
| `GET /api/solicitudes` | Cualquier usuario con sesión. El estudiante solo ve la suya |
| `POST /api/solicitudes` (postular) | Estudiante, una sola vez |
| `POST /api/solicitudes/:id/estado` | Según la tabla de transiciones |
| `PATCH /api/solicitudes/:id` (cambiar la beca, solo a una habilitada) | Administrador |
| `GET /api/notificaciones`, `POST /api/notificaciones/leidas` | Cada usuario, solo las suyas |

## Transiciones de estado (verificadas en el servidor)

| Rol | Estado actual | Puede pasar a |
|---|---|---|
| Estudiante (solo la suya) | `sin_documentos`, `con_novedades` | `en_verificacion` (con un PDF de hasta 2 MB por cada documento que pide su beca) |
| Verificador | `en_verificacion` | `documentacion_valida`, `con_novedades` (con motivo) |
| Administrador | `documentacion_valida` | `aprobada`, `rechazada` (con motivo) |

Cada cambio guarda una entrada de historial y una notificación al estudiante, en una sola transacción.

## Defensas aplicadas

Consultas parametrizadas (sin concatenar SQL) · validación en servidor de todos los campos · cuerpos solo JSON y verificación de `Origin` en operaciones que modifican datos · límite de tamaño de petición (100 KB) · CSP con `script-src 'self'` y el frontend escapa todo dato antes de insertarlo en la página (`Becas.esc`) · errores internos sin datos del usuario.

## Cómo añadir una vista o una ruta

1. Ruta: añade una fila a la tabla `rutas` de `server/app.js` con sus roles permitidos y su manejador, y una prueba en `tests/api.test.js`.
2. Vista: carpeta con `index.html` que cargue `../assets/css/base.css` y `../assets/js/core.js`; su script empieza con `const sesion = await Becas.exigirRol('<rol>'); if (!sesion) return;`.
3. Cambios de esquema: una migración nueva en `database/migrations/`.

## Interfaz del estudiante (una sola página)
`estudiante/index.html` carga `estudiantescript.js`, que dibuja tres pantallas según el `#` de la dirección: `#/becas`, `#/beca/ID` y `#/postulaciones`. Cada navegación guarda un contador en el historial del navegador: **Retroceder** usa `history.back()` si hay una pantalla anterior de la sesión y, si no (entrada directa), va al explorador. Los datos se piden al servidor en cada pantalla. Si el usuario cambia de página mientras hay peticiones en vuelo, `core.js` las ignora en silencio.

## Interfaz del administrador (varias páginas)
`admin/index.html` (verificación), `reportes.html` y `becas.html` comparten la barra lateral y `styleadmin.css`; cada una tiene su script. Los gráficos de Reportes son CSS puro (sin librerías) y los anchos se asignan desde JavaScript para no depender de estilos en línea.
