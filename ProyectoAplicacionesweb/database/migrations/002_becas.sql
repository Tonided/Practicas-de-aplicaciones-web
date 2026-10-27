-- 002_becas: catálogo de becas configurable, requisitos por beca y documentos según requisito.
-- Conserva los datos existentes: las solicitudes pasan a apuntar a la beca por id y los documentos ya subidos se mantienen.
CREATE TABLE becas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE COLLATE NOCASE,
  descripcion TEXT NOT NULL DEFAULT '',
  activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE beca_requisitos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  beca_id INTEGER NOT NULL REFERENCES becas(id) ON DELETE CASCADE,
  clave TEXT NOT NULL,                       -- identifica el documento subido por el estudiante
  descripcion TEXT NOT NULL,
  es_documento INTEGER NOT NULL DEFAULT 0 CHECK (es_documento IN (0, 1)),
  orden INTEGER NOT NULL DEFAULT 0,
  UNIQUE (beca_id, clave)
);

-- Becas iniciales: los tres tipos del sistema original (el administrador puede renombrarlas o deshabilitarlas)
INSERT INTO becas (nombre) VALUES ('Beca Académica'), ('Beca Deportiva'), ('Beca Socioeconómica');
-- Requisitos iniciales: los dos documentos que el sistema ya pedía a todos los estudiantes
INSERT INTO beca_requisitos (beca_id, clave, descripcion, es_documento, orden)
  SELECT b.id, r.clave, r.descripcion, 1, r.orden FROM becas b
  CROSS JOIN (SELECT 'cedula' AS clave, 'Copia de cédula' AS descripcion, 0 AS orden
              UNION ALL SELECT 'notas', 'Certificado de notas', 1) r;

-- Solicitudes: de texto libre a clave foránea
ALTER TABLE solicitudes ADD COLUMN beca_id INTEGER REFERENCES becas(id);
UPDATE solicitudes SET beca_id = (SELECT id FROM becas WHERE nombre = solicitudes.tipo_beca);
ALTER TABLE solicitudes DROP COLUMN tipo_beca;
CREATE INDEX idx_solicitudes_beca ON solicitudes(beca_id);

-- Documentos: la clave ya no está limitada a 'cedula' y 'notas', y guarda la etiqueta que vio el estudiante
CREATE TABLE solicitud_documentos_nueva (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitud_id INTEGER NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  etiqueta TEXT NOT NULL,
  nombre TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  subido_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (solicitud_id, tipo)
);
INSERT INTO solicitud_documentos_nueva (id, solicitud_id, tipo, etiqueta, nombre, bytes, subido_en)
  SELECT id, solicitud_id, tipo, CASE tipo WHEN 'cedula' THEN 'Copia de cédula' ELSE 'Certificado de notas' END, nombre, bytes, subido_en
  FROM solicitud_documentos;
DROP TABLE solicitud_documentos;
ALTER TABLE solicitud_documentos_nueva RENAME TO solicitud_documentos;
