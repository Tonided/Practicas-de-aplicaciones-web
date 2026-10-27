-- 001_inicial: usuarios, sesiones, solicitudes, historial, documentos y notificaciones
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  cedula TEXT UNIQUE,
  clave_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('estudiante', 'verificador', 'admin')),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sesiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expira_en TEXT NOT NULL
);
CREATE INDEX idx_sesiones_usuario ON sesiones(usuario_id);

CREATE TABLE solicitudes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo_beca TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'sin_documentos'
    CHECK (estado IN ('sin_documentos', 'en_verificacion', 'documentacion_valida', 'con_novedades', 'aprobada', 'rechazada')),
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_solicitudes_estado ON solicitudes(estado);

CREATE TABLE solicitud_documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitud_id INTEGER NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('cedula', 'notas')),
  nombre TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  subido_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (solicitud_id, tipo)
);

CREATE TABLE solicitud_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitud_id INTEGER NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  rol TEXT NOT NULL,
  estado TEXT,
  accion TEXT,
  detalle TEXT NOT NULL DEFAULT '',
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_historial_solicitud ON solicitud_historial(solicitud_id);

CREATE TABLE notificaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  leida INTEGER NOT NULL DEFAULT 0 CHECK (leida IN (0, 1)),
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_notificaciones_usuario ON notificaciones(usuario_id, leida);
