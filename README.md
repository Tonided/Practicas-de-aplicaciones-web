# Registro de estudiantes

Página web con HTML, CSS y JavaScript para registrar estudiantes. Cada campo se valida con expresiones regulares y los datos se guardan en el navegador como JSON usando `localStorage`.

## Archivos

- `index.html`: formulario, tabla de estudiantes y JSON guardado.
- `style.css`: estilos.
- `script.js`: validaciones con expresiones regulares y lectura/escritura en `localStorage`.
- `docs/`: documento en PDF y capturas de pantalla.

## Cómo usarlo

Abre `index.html` en el navegador. No necesita instalación.

## Validaciones

| Campo | Expresión regular | Ejemplo válido |
|---|---|---|
| Cédula | `/^(0[1-9]\|1\d\|2[0-4]\|30)[0-5]\d{7}$/` | 1304567892 |
| Apellidos | `/^\p{L}{2,}( \p{L}{2,}){0,3}$/u` | Mendoza Zambrano |
| Nombres | `/^\p{L}{2,}( \p{L}{2,}){0,2}$/u` | María José |
| Dirección | `/^[\p{L}\d][\p{L}\d .,#°º\/-]{4,99}$/u` | Av. 4 de Noviembre y Calle 12 |
| Teléfono | `/^(09\d{8}\|0[2-7]\d{7})$/` | 0991234567 |
| Correo electrónico | `/^[\w+%-]+(\.[\w+%-]+)*@[\w-]+(\.[\w-]+)*\.[A-Za-z]{2,}$/` | ana@correo.com |
| Facultad | `/^\p{L}[\p{L} ,.-]{4,79}$/u` | Ciencias de la Vida y la Tecnología |
| Nivel | `/^(10\|[1-9])$/` | 3 |
| Paralelo | `/^[A-Za-z]$/` | A |

## Formato JSON

Los estudiantes se guardan en `localStorage["estudiantes"]` como un arreglo de objetos:

```json
[
  {
    "cedula": "1304567892",
    "apellidos": "Mendoza Zambrano",
    "nombres": "María José",
    "direccion": "Av. 4 de Noviembre y Calle 12",
    "telefono": "0991234567",
    "correo": "maria.mendoza@example.com",
    "facultad": "Ciencias de la Vida y la Tecnología",
    "nivel": 3,
    "paralelo": "A"
  },
  {
    "cedula": "1309234159",
    "apellidos": "Cedeño Párraga",
    "nombres": "Luis Fernando",
    "direccion": "Calle Rocafuerte 215 y Ricaurte",
    "telefono": "052611234",
    "correo": "luis.cedeno@example.com",
    "facultad": "Ciencias de la Vida y la Tecnología",
    "nivel": 5,
    "paralelo": "B"
  }
]
```

## Subir a Git

```bash
git init
git add .
git commit -m "Registro de estudiantes con validaciones regex y localStorage"
git branch -M main
git remote add origin <URL-del-repositorio>
git push -u origin main
```
