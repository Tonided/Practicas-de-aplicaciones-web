# Registro de progreso y hoja de ruta

Actualizado: 26 de octubre de 2026.

| Fase | Tarea | Estado | Archivos | Siguiente paso |
|---|---|---|---|---|
| 1 | Inspección y arquitectura | Hecha | `docs/ARQUITECTURA.md` | — |
| 2 | Backend, base de datos y autenticación | **Probado** | `server/*`, `database/*` | — |
| 3 | Registro de cuentas y acceso por rol | **Probado** | `registro/*`, `login/*` | Probar en tu equipo (M-01 a M-05) |
| 3b | Becas configurables (migración 002) | **Probado** (37 pruebas + migración con datos) | `database/migrations/002_becas.sql`, `server/app.js` | M-06 |
| 3c | Estudiante: explorador, detalle, Mis postulaciones, Retroceder | **Probado en navegador** | `estudiante/*` | — |
| 3d | Administrador: reportes y configuración de becas | **Probado en navegador** | `admin/reportes*`, `admin/becas*` | — |
| 4 | Q&A: servidor y base de datos | **Pendiente** | migración `003`, rutas `/api/preguntas` | Ver diseño abajo |
| 5 | Q&A: interfaz y enlaces en paneles y portal | **Pendiente** | `preguntas/*` | Depende de la fase 4 |
| — | Recuperación de contraseña | Pendiente | — | Requiere definir el envío de correo |

## Diseño propuesto para el Q&A (a confirmar)
- **Tablas** (migración `003`): `categorias`, `preguntas` (autor, categoría, título, contenido, `resuelta`, borrado lógico, fechas), `respuestas` (pregunta, autor, contenido, `oficial`, borrado lógico), `auditoria` de moderación.
- **Permisos en el servidor:** lectura pública; publicar y responder con sesión; editar o eliminar solo lo propio; el administrador modera; marcar respuesta oficial, solo verificador y administrador. Solo se muestra el nombre del autor.
- **Interfaz:** `preguntas/` con búsqueda, filtros, paginación y detalle; los enlaces de los menús del estudiante y del administrador ya apuntan a `preguntas/index.html`.

## Decisiones abiertas
1. Lista oficial de becas, descripciones y documentos requeridos (hoy: 3 becas iniciales con "Copia de cédula" y "Certificado de notas", tomadas del sistema original; el administrador puede cambiarlas).
2. ¿Puede un estudiante rechazado volver a postular? Hoy no (una postulación por estudiante).
3. Texto oficial del aviso de privacidad del registro.
