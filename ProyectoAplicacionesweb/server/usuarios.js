'use strict';
const { hashClave, validarClave } = require('./seguridad');
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const limpio = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

/* Valida los datos del formulario público de registro */
function validarRegistro(c) {
  const e = {};
  const nombres = limpio(c.nombres), apellidos = limpio(c.apellidos);
  const email = limpio(c.email).toLowerCase(), cedula = String(c.cedula ?? '').trim();
  if (nombres.length < 2 || nombres.length > 80) e.nombres = 'Ingresa tus nombres (de 2 a 80 caracteres).';
  if (apellidos.length < 2 || apellidos.length > 80) e.apellidos = 'Ingresa tus apellidos (de 2 a 80 caracteres).';
  if (!RE_EMAIL.test(email) || email.length > 120) e.email = 'Ingresa un correo electrónico válido.';
  if (!/^\d{10}$/.test(cedula)) e.cedula = 'La cédula debe tener 10 dígitos numéricos.';
  const errClave = validarClave(c.clave);
  if (errClave) e.clave = errClave;
  else if (c.clave !== c.confirmacion) e.confirmacion = 'Las contraseñas no coinciden.';
  if (c.acepta !== true) e.acepta = 'Debes aceptar el tratamiento de tus datos para continuar.';
  return { datos: { nombres, apellidos, email, cedula, clave: c.clave }, errores: e };
}

/* Inserta un usuario con la contraseña hasheada. El rol lo decide quien llama, nunca el cliente */
async function crearUsuario(db, { nombres, apellidos, email, cedula = null, clave, rol }) {
  const hash = await hashClave(clave);
  try {
    const r = db.prepare('INSERT INTO usuarios (nombres, apellidos, email, cedula, clave_hash, rol) VALUES (?, ?, ?, ?, ?, ?)')
      .run(nombres, apellidos, email, cedula, hash, rol);
    return Number(r.lastInsertRowid);
  } catch (err) {
    if (/UNIQUE/.test(err.message)) {
      const campo = /usuarios\.cedula/.test(err.message) ? 'cedula' : 'email';
      const e = new Error(campo === 'cedula' ? 'Esa cédula ya está registrada.' : 'Ese correo ya está registrado.');
      e.campo = campo;
      throw e;
    }
    throw err;
  }
}
module.exports = { validarRegistro, crearUsuario, RE_EMAIL, limpio };
