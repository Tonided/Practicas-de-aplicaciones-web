# Decisiones técnicas

| Decisión | Motivo |
|---|---|
| Node.js 22 con `node:http`, `node:sqlite` y `crypto`, sin Express ni paquetes | El entorno de trabajo no tenía acceso a npm; así el proyecto no necesita `npm install`, no depende de paquetes de terceros y funciona igual en Windows. Se pierde la comodidad de Express, compensada con una tabla de rutas pequeña y probada |
| SQLite en un archivo | Persistente, sin servidor de base de datos que instalar; adecuado para un entorno académico. Para producción con mucha concurrencia habría que migrar a un servidor de base de datos (el SQL es estándar) |
| `scrypt` para las contraseñas | Algoritmo de hash lento y con sal, incluido en Node; el formato guardado incluye los parámetros |
| Sesiones con token aleatorio en cookie `HttpOnly` y hash en la base | El navegador no puede leer la cookie desde JavaScript y robar la base no entrega sesiones válidas |
| Rol decidido siempre en el servidor | El registro público solo crea estudiantes; verificador y administrador se crean por línea de comandos |
| Sin cuentas ni contraseñas predefinidas | Pedido explícito; se eliminaron las cuentas de demostración del login |
| Transiciones de estado y permisos en el servidor | La interfaz solo ayuda; el servidor es quien autoriza |
| `core.js` convertido en cliente de la API (asíncrono) | Las vistas conservan su estructura y sus nombres; solo pasaron a `await` |
| Una solicitud por estudiante y opción de postular | Sin ella, una cuenta nueva no podría usar el sistema |
| CSP `script-src 'self'` | Mitiga XSS; por eso no hay scripts ni manejadores en línea |
| Migraciones en archivos `.sql` numerados | Esquema versionado y repetible, sin herramientas externas |
| "Editar" limitado al tipo de beca (provisional) | El requisito original no define qué se edita |
| Recuperación de contraseña y Q&A en fases posteriores | Cada una necesita su propio diseño y pruebas; se entregan por fases, como indica el orden de implementación |
| Estudiante como página única con rutas `#`; administrador con varias páginas | La navegación del estudiante es de profundidad (lista, detalle, formulario) y necesita "Retroceder"; la del administrador son secciones de un menú lateral |
| Estados públicos "En progreso / Aceptada / Rechazada" derivados de los internos | Se conservan las 6 etapas internas (las usan verificador y administrador) sin cambiar las transiciones; el estudiante ve un resumen claro más la etapa |
| Becas y requisitos en la base de datos (migración 002) | Para que el administrador pueda configurarlos; los documentos que se piden salen de los requisitos |
| Las becas no se borran, se deshabilitan | Borrarlas dejaría postulaciones sin beca; deshabilitar solo las oculta a los estudiantes |
| Nombre de beca único sin distinguir mayúsculas ni tildes, comprobado en el servidor | `COLLATE NOCASE` de SQLite solo ignora mayúsculas ASCII: "Académica" y "ACADÉMICA" pasaban como distintas (lo detectó una prueba) |
| Una postulación por estudiante (se mantiene) | Regla existente del sistema; permitir reintentar tras un rechazo requiere una decisión de la institución |
| Gráficos de Reportes en CSS | Evita dependencias externas y mantiene la CSP estricta |
| CSV con neutralización de fórmulas | Un nombre de beca que empiece por `=`, `+`, `-` o `@` podría ejecutarse como fórmula al abrirlo en Excel |
