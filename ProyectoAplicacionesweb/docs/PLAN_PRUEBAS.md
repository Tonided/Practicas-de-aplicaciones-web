# Plan de pruebas

## Automáticas (ejecutadas)

| Comando | Qué prueba | Resultado verificado |
|---|---|---|
| `npm test` | Servidor y SQLite reales: registro, hash, duplicados, validaciones, escalada de rol, login, logout, persistencia tras reiniciar, permisos por rol, transiciones, historial, notificaciones privadas, **becas (crear, editar, habilitar, deshabilitar, requisitos, nombres duplicados), documentos según requisitos, reportes y migración 002 con datos**, cabeceras y archivos no servidos, límite de intentos | **37 de 37 correctas** |
| `python3 tests/e2e_navegador.py` | Chromium real contra el servidor: portal, registro, configuración de becas, explorador, búsqueda, detalle, **Retroceder**, postulación, seguimiento, notificaciones, verificador, administrador, reportes y CSV, permisos de rutas, reinicio del servidor y móvil | **41 de 41 correctas** (3 ejecuciones seguidas), sin errores de consola ni recursos fallidos con la CSP activa |

El recorrido en navegador requiere `pip install playwright` y `playwright install chromium`.

## Pendientes de ejecutar por ti

| ID | Prueba | Resultado esperado |
|---|---|---|
| M-01 | Seguir la guía de Windows del README | El servidor arranca y se crea `data\becas.db` |
| M-02 | Crear la cuenta de administrador con el comando y entrar | Llega a `/admin/` |
| M-03 | Probar en Firefox, Safari y desde un teléfono real | Mismo comportamiento que en Chromium |
| M-04 | Abrir el CSV descargado en Excel | Se ven bien las tildes y los datos |
| M-05 | Con HTTPS y `COOKIE_SECURE=true` | La sesión funciona y la cookie lleva `Secure` |
| M-06 | Actualizar una base de datos que ya uses con la versión anterior | Se aplica la migración 002 sin perder cuentas ni solicitudes (haz una copia de `data/` antes) |

## No probado porque no existe todavía
Preguntas y respuestas, recuperación de contraseña. El enlace «Preguntas y respuestas» de los menús da 404.
