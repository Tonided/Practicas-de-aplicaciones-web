document.getElementById('formCliente').addEventListener('submit', function (e) {
  e.preventDefault();

  const cedula = document.getElementById('cedula');
  const nombre = document.getElementById('nombre');
  const direccion = document.getElementById('direccion');
  const telefono = document.getElementById('telefono');
  const correo = document.getElementById('correo');
  const resultado = document.getElementById('resultado');

  let valido = true;

  // Cédula: exactamente 10 dígitos
  if (!/^\d{10}$/.test(cedula.value)) {
    mostrarError(cedula, 'errorCedula', 'Debe tener 10 dígitos');
    valido = false;
  } else {
    mostrarError(cedula, 'errorCedula', '');
  }

  // Nombre:máximo 30
  if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñ ]{1,30}$/.test(nombre.value)) {
    mostrarError(nombre, 'errorNombre', 'Solo letras, máx. 30 caracteres');
    valido = false;
  } else {
    mostrarError(nombre, 'errorNombre', '');
  }

  // Dirección: máximo 50
  if (direccion.value.trim() === '' || direccion.value.length > 50) {
    mostrarError(direccion, 'errorDireccion', 'Campo obligatorio, máx. 50 caracteres');
    valido = false;
  } else {
    mostrarError(direccion, 'errorDireccion', '');
  }

  // Teléfono: 10 dígitos
  if (!/^\d{10}$/.test(telefono.value)) {
    mostrarError(telefono, 'errorTelefono', 'Debe tener 10 dígitos');
    valido = false;
  } else {
    mostrarError(telefono, 'errorTelefono', '');
  }

  // Correo: formato básico usuario@dominio.com
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.value)) {
    mostrarError(correo, 'errorCorreo', 'Correo no válido');
    valido = false;
  } else {
    mostrarError(correo, 'errorCorreo', '');
  }

  if (valido) {
    resultado.style.color = 'green';
    resultado.textContent = 'Cliente registrado correctamente';
  } else {
    resultado.style.color = 'red';
    resultado.textContent = 'Revise los campos marcados en rojo';
  }
});

function mostrarError(input, spanId, mensaje) {
  document.getElementById(spanId).textContent = mensaje;
  input.classList.toggle('invalido', mensaje !== '');
}
