'use strict';
/* Alta controlada de cuentas (administrador, verificador o estudiante).
   Uso:  node server/crear-usuario.js --rol admin --email correo@dominio --nombres "Ana" --apellidos "Pérez"
   La contraseña se pide por teclado (no queda en el historial). Para automatizar, usa la variable BECAS_CLAVE. */
const path = require('node:path');
const readline = require('node:readline');
const { abrir } = require('./db');
const { crearUsuario, RE_EMAIL, limpio } = require('./usuarios');
const { validarClave } = require('./seguridad');

const raiz = path.resolve(__dirname, '..');
try { process.loadEnvFile(path.join(raiz, '.env')); } catch { /* opcional */ }

function pedir(texto) {
  return new Promise((resolver) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(texto)) process.stdout.write(s); };   // no muestra lo que se escribe
    rl.question(texto, (r) => { rl.close(); process.stdout.write('\n'); resolver(r); });
  });
}

async function main() {
  const a = process.argv.slice(2);
  const arg = (n) => { const i = a.indexOf('--' + n); return i >= 0 ? a[i + 1] : undefined; };
  const rol = arg('rol'), email = limpio(arg('email')).toLowerCase(), nombres = limpio(arg('nombres')), apellidos = limpio(arg('apellidos')), cedula = arg('cedula') || null;
  if (!['admin', 'verificador', 'estudiante'].includes(rol) || !RE_EMAIL.test(email) || !nombres || !apellidos) {
    console.error('Uso: node server/crear-usuario.js --rol <admin|verificador|estudiante> --email <correo> --nombres "<texto>" --apellidos "<texto>" [--cedula <10 dígitos>]');
    process.exit(1);
  }
  let clave = process.env.BECAS_CLAVE;
  if (!clave) {
    clave = await pedir('Contraseña: ');
    if (clave !== await pedir('Repite la contraseña: ')) { console.error('Las contraseñas no coinciden.'); process.exit(1); }
  }
  const error = validarClave(clave);
  if (error) { console.error(error); process.exit(1); }
  const db = abrir(path.resolve(raiz, process.env.DB_PATH || 'data/becas.db'));
  try { await crearUsuario(db, { nombres, apellidos, email, cedula, clave, rol }); console.log(`Cuenta de ${rol} creada: ${email}`); }
  catch (e) { console.error(e.campo ? e.message : 'No se pudo crear la cuenta.'); process.exit(1); }
  finally { db.close(); }
}
main();
