# Sistema de Gestión de Becas y Ayudas Económicas (Uleam)

Frontend en **HTML, CSS y JavaScript puro**, servidor en **Node.js** sin dependencias externas y base de datos **SQLite**. Las cuentas, solicitudes, historial y notificaciones se guardan en el servidor y sobreviven al cierre del navegador y al reinicio del servidor.

## Requisitos

- **Node.js 22.13 o superior** (incluye SQLite y `scrypt`; no hace falta `npm install`).
  - Windows: instala la versión LTS desde nodejs.org y comprueba en PowerShell: `node --version`.
- Un navegador actual.

## Instalación y ejecución (Windows, PowerShell)

```powershell
cd C:\ruta\a\becas
copy .env.example .env
node server\crear-usuario.js --rol admin --email admin@tu-dominio.ec --nombres "Nombre" --apellidos "Apellido"
npm start
```

Abre **http://localhost:3000/**. En Linux o macOS es igual, con `cp` y `/` en las rutas.

La base de datos (`data/becas.db`) se crea sola al iniciar el servidor y aplica las migraciones de `database/migrations/`. No hay que ejecutar nada más.

## Cuentas

| Rol | Cómo se crea |
|---|---|
| **Estudiante** | Desde la interfaz: **Crear cuenta** (portal o login). El rol siempre es estudiante; el servidor ignora cualquier otro valor |
| **Verificador / administrador** | Solo con el comando `node server\crear-usuario.js --rol <verificador\|admin> --email ... --nombres ... --apellidos ...`. La contraseña se pide por teclado y no queda en el historial. No hay cuentas ni contraseñas predefinidas |

Para automatizar, el comando acepta la contraseña en la variable de entorno `BECAS_CLAVE`. Política de contraseñas: de 8 a 128 caracteres, con letras y números.

## Variables de entorno (`.env`)

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `HOST` | `127.0.0.1` | Dirección de escucha. Solo local por defecto |
| `DB_PATH` | `data/becas.db` | Archivo SQLite |
| `COOKIE_SECURE` | `false` | Pon `true` cuando el sitio se sirva por HTTPS |

El archivo `.env` está en `.gitignore`. No contiene secretos obligatorios: las sesiones usan tokens aleatorios guardados con hash en la base de datos.

## Base de datos y migraciones

El esquema está en `database/migrations/001_inicial.sql`. Para cambiarlo en el futuro, crea `002_descripcion.sql` en esa carpeta: al iniciar, el servidor aplica en orden las migraciones que falten, cada una en una transacción y una sola vez (queda registro en la tabla `migraciones`). No edites una migración ya aplicada. Detalle en `docs/MODELO_DATOS.md`.

## Pruebas

```bash
npm test                                     # 37 pruebas de integración del servidor (HTTP + SQLite reales)
pip install playwright && playwright install chromium
python3 tests/e2e_navegador.py               # 41 comprobaciones en Chromium contra el servidor real
```

Ambas usan bases de datos temporales y contraseñas aleatorias; no tocan `data/becas.db`.

## Novedades de esta versión

**Estudiante** (`estudiante/`, una sola página con rutas `#/becas`, `#/beca/ID` y `#/postulaciones`):
- **Becas disponibles:** tarjetas con las becas habilitadas, búsqueda y aviso si ya tienes una postulación.
- **Detalle de beca:** descripción y requisitos (documento PDF o condición) con el botón **Postular**.
- **Mis postulaciones:** detalle de tu solicitud con estado visual **En progreso / Aceptada / Rechazada**, etapa detallada, barra de progreso, formulario de documentos, historial y notificaciones (con contador sin leer en la pestaña).
- **Retroceder** en detalle y seguimiento: vuelve a la pantalla anterior (o al explorador si entraste directo a una pantalla).

**Administrador** (`admin/`):
- **Reportes generales** (`reportes.html`): indicadores, resultado de las postulaciones, becas más solicitadas, postulaciones por etapa y **descarga en CSV**.
- **Configuración de becas** (`becas.html`): crear, editar, habilitar y deshabilitar becas y configurar sus requisitos. Las becas no se borran: se deshabilitan, para conservar las postulaciones.
- "Editar" una solicitud ahora cambia la beca eligiendo entre las habilitadas.

Los documentos que se piden al estudiante salen de los requisitos de cada beca (los marcados como documento). Las 3 becas iniciales conservan los 2 documentos de antes.

## Archivos de esta versión respecto a la anterior

**Nuevos en esta versión:** `database/migrations/002_becas.sql`, `admin/reportes.html`, `admin/reportesscript.js`, `admin/becas.html`, `admin/becasscript.js`. **Modificados en esta versión:** `server/app.js`, `assets/js/core.js`, `assets/css/base.css`, `estudiante/*` (reescrito como explorador), `admin/index.html`, `admin/scriptadmin.js`, `admin/styleadmin.css`, `tests/*`.

**De la versión anterior (servidor y registro):** `server/` (`index.js`, `app.js`, `db.js`, `seguridad.js`, `usuarios.js`, `crear-usuario.js`), `database/migrations/001_inicial.sql`, `package.json`, `.env.example`, `.gitignore`, `registro/` (3 archivos), `tests/api.test.js`.

**Modificados:** `assets/js/core.js` (reescrito: ahora es el cliente de la API; ya no usa `localStorage`), `assets/css/base.css` (+`.alerta--ok`), `login/` (conectado al servidor, enlace a **Crear cuenta**, se quitaron las cuentas de demostración), `estudiante/estudiantescript.js` y `estudiantestyles.css` (API y opción de postular), `verificador/verificadorscript.js`, `admin/scriptadmin.js`, `inicio/` (botón de registro activo).

**Eliminado:** `tests/test_permisos.js` (probaba la lógica de `localStorage`; lo reemplaza `tests/api.test.js`). **Conservados sin tocar:** tus `assets/img/*.svg` y los HTML de `estudiante/`, `verificador/` y `admin/`.

## Seguridad: qué está hecho y qué falta

Hecho: contraseñas con `scrypt` y sal aleatoria · consultas parametrizadas · permisos y transiciones de estado verificados en el servidor · sesiones con cookie `HttpOnly` y `SameSite=Lax` guardadas con hash · cierre de sesión que invalida la sesión en el servidor · límite de intentos fallidos de acceso y de registros · cabeceras de seguridad y CSP estricta (`script-src 'self'`) · el servidor solo entrega las carpetas del frontend (nunca `server/`, `database/`, `data/` ni `.env`) · mensajes de error genéricos en el login.

Pendiente para producción: servir por **HTTPS** y activar `COOKIE_SECURE=true` · copias de seguridad periódicas de `data/` · el límite de intentos vive en memoria (se reinicia con el servidor) · registros de auditoría y rotación de logs.

## Limitaciones conocidas

- **Preguntas y respuestas (Q&A) y recuperación de contraseña no están implementados todavía.** Los menús del estudiante y del administrador ya tienen un enlace a `preguntas/index.html` (lo añadiste tú), pero esa página **aún no existe**: hoy da error 404. Ver `docs/REGISTRO_PROGRESO.md`.
- Cada estudiante puede tener **una sola postulación** (incluso si fue rechazada). Si cambias los requisitos de una beca, las postulaciones ya enviadas conservan los documentos que subieron.
- Los PDF no se suben al servidor: se guarda su nombre y tamaño (validados en el servidor), no su contenido.
- Los datos de demostración que estaban en `localStorage` del navegador no se migran: eran de prueba. Crea cuentas nuevas.
- Node muestra un aviso `ExperimentalWarning` al usar `node:sqlite`; es esperado.
- El logotipo y las imágenes del portal son provisionales; los datos institucionales pendientes están marcados en amarillo.

## Documentación

`docs/REQUISITOS.md`, `ARQUITECTURA.md`, `MODELO_DATOS.md`, `DECISIONES_TECNICAS.md`, `GUIA_USUARIO.md`, `PLAN_PRUEBAS.md` y `REGISTRO_PROGRESO.md`.
