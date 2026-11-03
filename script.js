// Registro de estudiantes: validación con expresiones regulares y almacenamiento
// local en formato JSON usando localStorage.

const CLAVE = "estudiantes"; // nombre con el que se guarda el arreglo JSON

// Cada campo tiene su expresión regular y el mensaje que se muestra si no coincide
const reglas = {
  cedula:    { regex: /^(0[1-9]|1\d|2[0-4]|30)[0-5]\d{7}$/,
               mensaje: "10 dígitos: provincia 01-24 o 30 y tercer dígito de 0 a 5." },
  apellidos: { regex: /^\p{L}{2,}( \p{L}{2,}){0,3}$/u,
               mensaje: "Solo letras, de 1 a 4 palabras. Ejemplo: Mendoza Zambrano." },
  nombres:   { regex: /^\p{L}{2,}( \p{L}{2,}){0,2}$/u,
               mensaje: "Solo letras, de 1 a 3 palabras. Ejemplo: María José." },
  direccion: { regex: /^[\p{L}\d][\p{L}\d .,#°º\/-]{4,99}$/u,
               mensaje: "Entre 5 y 100 caracteres: letras, números y . , # ° / -" },
  telefono:  { regex: /^(09\d{8}|0[2-7]\d{7})$/,
               mensaje: "Celular: 09 y 8 dígitos. Convencional: 0, código de área (2-7) y 7 dígitos." },
  correo:    { regex: /^[\w+%-]+(\.[\w+%-]+)*@[\w-]+(\.[\w-]+)*\.[A-Za-z]{2,}$/,
               mensaje: "Correo no válido. Ejemplo: nombre@dominio.com" },
  facultad:  { regex: /^\p{L}[\p{L} ,.-]{4,79}$/u,
               mensaje: "Solo letras, entre 5 y 80 caracteres." },
  nivel:     { regex: /^(10|[1-9])$/,
               mensaje: "Escribe un número del 1 al 10." },
  paralelo:  { regex: /^[A-Za-z]$/,
               mensaje: "Escribe una sola letra (A-Z)." },
};

const formulario = document.getElementById("formulario");
const mensaje = document.getElementById("mensaje");

// Leer y guardar en localStorage (JSON.parse / JSON.stringify)
function leerEstudiantes() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE)) || [];
  } catch {
    return []; // si el texto guardado está dañado, se empieza con una lista vacía
  }
}

function guardarEstudiantes(lista) {
  localStorage.setItem(CLAVE, JSON.stringify(lista));
}

// Valida un campo y muestra su error. Devuelve el valor limpio o null si no es válido.
function validar(campo) {
  const entrada = formulario.elements[campo];
  const valor = entrada.value.trim().replace(/\s+/g, " ");
  const correcto = reglas[campo].regex.test(valor);
  entrada.nextElementSibling.textContent = correcto ? "" : reglas[campo].mensaje;
  entrada.classList.toggle("invalido", !correcto);
  return correcto ? valor : null;
}

// Dibuja la tabla y el JSON a partir de lo que hay en localStorage
function mostrar() {
  const lista = leerEstudiantes();
  const cuerpo = document.getElementById("tabla");
  cuerpo.innerHTML = "";

  lista.forEach((estudiante, i) => {
    const fila = cuerpo.insertRow();
    for (const campo in reglas) fila.insertCell().textContent = estudiante[campo];

    const boton = document.createElement("button");
    boton.textContent = "Eliminar";
    boton.onclick = () => {
      lista.splice(i, 1);
      guardarEstudiantes(lista);
      mostrar();
    };
    fila.insertCell().append(boton);
  });

  document.getElementById("json").textContent = JSON.stringify(lista, null, 2);
}

// Validar cada campo al salir de él
formulario.addEventListener("focusout", (e) => {
  if (e.target.name in reglas) validar(e.target.name);
});

formulario.addEventListener("submit", (e) => {
  e.preventDefault();

  const estudiante = {};
  let todoCorrecto = true;
  for (const campo in reglas) {
    const valor = validar(campo);
    if (valor === null) todoCorrecto = false;
    else estudiante[campo] = valor;
  }
  if (!todoCorrecto) {
    mensaje.textContent = "Corrige los campos marcados.";
    return;
  }

  estudiante.nivel = Number(estudiante.nivel);
  estudiante.paralelo = estudiante.paralelo.toUpperCase();

  const lista = leerEstudiantes();
  if (lista.some((x) => x.cedula === estudiante.cedula)) {
    mensaje.textContent = "Ya existe un estudiante con esa cédula.";
    return;
  }

  lista.push(estudiante);
  guardarEstudiantes(lista);
  formulario.reset();
  mensaje.textContent = "Estudiante guardado.";
  mostrar();
});

mostrar();
