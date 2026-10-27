# Modelo de datos (SQLite)

Esquema en `database/migrations/001_inicial.sql`. Claves foráneas activas (`PRAGMA foreign_keys = ON`). Fechas en ISO 8601 UTC.

| Tabla | Campos principales | Relaciones y reglas |
|---|---|---|
| `usuarios` | `id`, `nombres`, `apellidos`, `email` (único, sin distinguir mayúsculas), `cedula` (única, opcional), `clave_hash` (scrypt), `rol` (`estudiante`/`verificador`/`admin`), `activo`, `creado_en`, `actualizado_en` | El rol tiene una restricción `CHECK` |
| `sesiones` | `id`, `token_hash` (único), `usuario_id`, `creada_en`, `expira_en` | `usuario_id` → `usuarios`, **borrado en cascada** |
| `solicitudes` | `id`, `usuario_id` (único: una por estudiante), `beca_id`, `estado` (6 valores con `CHECK`), `creado_en`, `actualizado_en` | → `usuarios`, borrado en cascada |
| `becas` | `id`, `nombre` (único, sin distinguir mayúsculas ni tildes), `descripcion`, `activa`, fechas | No se borran: se deshabilitan |
| `beca_requisitos` | `id`, `beca_id`, `clave`, `descripcion`, `es_documento`, `orden` | Único por (`beca_id`, `clave`); cascada. La `clave` identifica el documento que sube el estudiante y se conserva al editar |
| `solicitud_documentos` | `id`, `solicitud_id`, `tipo` (clave del requisito), `etiqueta`, `nombre`, `bytes`, `subido_en` | Único por (`solicitud_id`, `tipo`); cascada. `etiqueta` guarda el nombre del documento tal como lo vio el estudiante |
| `solicitud_historial` | `id`, `solicitud_id`, `usuario_id`, `rol`, `estado`, `accion`, `detalle`, `creado_en` | `usuario_id` → `SET NULL` al borrar el usuario, para conservar la trazabilidad. Las ediciones llevan `accion = 'edicion'` y `estado` nulo |
| `notificaciones` | `id`, `usuario_id`, `texto`, `leida`, `creado_en` | → `usuarios`, cascada |
| `migraciones` | `nombre`, `aplicada_en` | Control de versiones del esquema |

El hash tiene el formato `scrypt$N$r$p$sal$hash`, así que los parámetros pueden endurecerse más adelante sin invalidar cuentas existentes.

## Migraciones futuras
Crea `database/migrations/002_<descripcion>.sql`. Se aplicará al iniciar el servidor, en orden, una sola vez y dentro de una transacción. Nunca modifiques una migración ya aplicada.

## Migración 002 (`002_becas.sql`)
Crea `becas` y `beca_requisitos`, inserta las 3 becas iniciales con sus 2 documentos, convierte `solicitudes.tipo_beca` (texto) en `beca_id` y elimina esa columna, y reconstruye `solicitud_documentos` sin la restricción a dos tipos. **Conserva los datos existentes** (probado con una base de la versión 001 con datos).

## Pendiente de modelar
Preguntas, respuestas y categorías del Q&A (próxima fase) y recuperación de contraseña (tokens de un solo uso).
