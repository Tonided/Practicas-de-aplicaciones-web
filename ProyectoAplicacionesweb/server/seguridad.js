'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const PARAMS = { N: 16384, r: 8, p: 1 };

/* Hash de contraseñas con scrypt y sal aleatoria. Formato: scrypt$N$r$p$sal$hash */
async function hashClave(clave) {
  const sal = crypto.randomBytes(16);
  const h = await scrypt(clave, sal, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${sal.toString('base64')}$${h.toString('base64')}`;
}
async function verificarClave(clave, guardado) {
  const [alg, N, r, p, sal, hash] = String(guardado).split('$');
  if (alg !== 'scrypt') return false;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = await scrypt(clave, Buffer.from(sal, 'base64'), esperado.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(calculado, esperado);
}

/* Devuelve un texto de error, o null si la contraseña cumple la política */
function validarClave(clave) {
  if (typeof clave !== 'string') return 'Ingresa una contraseña.';
  if (clave.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (clave.length > 128) return 'La contraseña no puede superar los 128 caracteres.';
  if (!/[A-Za-z]/.test(clave) || !/\d/.test(clave)) return 'La contraseña debe incluir letras y números.';
  return null;
}

const nuevoToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
module.exports = { hashClave, verificarClave, validarClave, nuevoToken, hashToken };
