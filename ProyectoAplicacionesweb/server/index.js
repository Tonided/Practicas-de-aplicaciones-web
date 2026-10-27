'use strict';
const path = require('node:path');
const { abrir } = require('./db');
const { crearApp } = require('./app');

const raiz = path.resolve(__dirname, '..');
try { process.loadEnvFile(path.join(raiz, '.env')); } catch { /* sin .env: se usan los valores por defecto */ }

const puerto = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const db = abrir(path.resolve(raiz, process.env.DB_PATH || 'data/becas.db'));
const servidor = crearApp({ db, raiz, cookieSegura: process.env.COOKIE_SECURE === 'true' });
servidor.listen(puerto, host, () => console.log(`Servidor listo en http://localhost:${puerto}`));
process.on('SIGINT', () => { servidor.close(); db.close(); process.exit(0); });
