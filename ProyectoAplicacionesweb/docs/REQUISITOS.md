# Requisitos

Cada requisito indica su fuente: **Briefing** (descripción inicial del proyecto), **PDF** (`Tarea_Interfaces_proyecto.pdf`), **Código** (archivos existentes) o **Propuesta** (derivado del diagnóstico, pendiente de confirmar).

## Requisitos funcionales

| ID | Requisito | Fuente | Estado |
|---|---|---|---|
| RF-01 | Iniciar sesión con correo y contraseña y ser dirigido al panel de su rol | Briefing, PDF 4.2 | Implementado y probado (servidor + navegador) |
| RF-02 | Cerrar sesión con confirmación | Código | Implementado y probado (servidor + navegador) |
| RF-03 | El estudiante ve el estado de su trámite en una barra de progreso | Briefing | Implementado y probado (servidor + navegador) |
| RF-04 | El estudiante sube cédula y certificado de notas (PDF, máx. 2 MB), de forma simulada | Briefing, Código | Implementado y probado (servidor + navegador) |
| RF-05 | El estudiante recibe notificaciones de los cambios de estado | Briefing | Implementado y probado (servidor + navegador) |
| RF-06 | El estudiante corrige y reenvía documentos tras una observación | Propuesta | Implementado y probado (servidor + navegador) |
| RF-07 | El verificador ve las solicitudes en verificación | Briefing | Implementado y probado (servidor + navegador) |
| RF-08 | El verificador solo puede marcar "Documentación válida" o "Con novedades" (observación obligatoria) | Briefing | Implementado y probado (servidor + navegador) |
| RF-09 | El administrador ve una tabla dinámica de solicitudes | Briefing | Implementado y probado (servidor + navegador) |
| RF-10 | El administrador aprueba o rechaza con confirmación, el rechazo exige motivo y el cambio persiste | Briefing, Código | Implementado y probado (servidor + navegador) |
| RF-11 | El administrador puede editar | Briefing | Implementado (cambia la beca de la solicitud entre las habilitadas); confirmar si debe editar algo más |
| RF-12 | El administrador solo resuelve solicitudes con documentación válida | Propuesta | Implementado y probado (servidor + navegador) |
| RF-13 | Gestión de becas: creación y prerrequisitos (CU-22, CU-16) | PDF 4.7 | Pendiente |
| RF-14 | Filtrado de postulaciones por beca, estado y fechas (CU-17) | PDF 4.8 | Pendiente |
| RF-15 | Portal institucional informativo | PDF 4.1 | Implementado (datos institucionales provisionales) |
| RF-16 | Preguntas frecuentes y envío de consultas | PDF 4.4 | Por confirmar alcance |
| RF-18 | Registro de cuentas desde la interfaz | Solicitud posterior | Implementado y probado (servidor + navegador) |
| RF-19 | Recuperación de contraseña por correo | Solicitud posterior | Pendiente |
| RF-20 | Preguntas y respuestas con búsqueda, categorías y moderación | Solicitud posterior | Pendiente (fases 4 a 6) |
| RF-21 | El estudiante explora las becas habilitadas (tarjetas, búsqueda) y ve el detalle y los requisitos de cada una | Solicitud posterior | Implementado y probado |
| RF-22 | "Mis postulaciones": detalle de la solicitud con estado En progreso / Aceptada / Rechazada, etapas, historial y notificaciones | Solicitud posterior | Implementado y probado |
| RF-23 | Botón "Retroceder" en las pantallas de detalle y de formulario del estudiante | Solicitud posterior | Implementado y probado |
| RF-24 | El administrador ve reportes generales (postulantes, becas más solicitadas, estados) y los descarga en CSV | Solicitud posterior | Implementado y probado |
| RF-25 | El administrador crea, edita, habilita y deshabilita becas y configura sus requisitos | Solicitud posterior | Implementado y probado |
| RF-17 | Reportes, usuarios y control de acceso | PDF 4.6 | Por confirmar alcance |

## Requisitos no funcionales

| ID | Requisito | Fuente |
|---|---|---|
| RNF-01 | Frontend en HTML, CSS y JavaScript puro; servidor Node.js sin dependencias externas | Solicitud posterior |
| RNF-02 | Datos persistentes en SQLite en el servidor; sin datos sensibles en el navegador | Solicitud posterior |
| RNF-03 | Diseño institucional, limpio y responsivo | Briefing |
| RNF-04 | Navegación entre carpetas por enlaces relativos | Briefing |
| RNF-05 | Accesibilidad básica: etiquetas en formularios, foco visible, mensajes con `aria-live`, respeto de `prefers-reduced-motion` | Propuesta |
| RNF-06 | Todo dato mostrado en la interfaz se escapa para evitar inyección de HTML | Propuesta |
| RNF-07 | Navegadores actuales (se usa el elemento `<dialog>`) | Propuesta |

## Decisiones abiertas

1. ~~¿Backend?~~ Resuelta: se implementó servidor y base de datos.
2. ¿Verificador y revisor son el mismo rol? ¿Queda fuera el secretario? (se asume que sí a ambas)
3. Lista oficial de documentos por beca. El PDF, el código y los prerrequisitos del PDF tienen listas distintas.
4. Estudiante en web responsiva o en app móvil (se asume web).
5. Qué atributo edita el administrador (RF-11).
