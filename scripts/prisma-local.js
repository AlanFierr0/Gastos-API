/**
 * Script para ejecutar comandos de Prisma usando DATABASE_URL_LOCAL
 * 
 * Uso: node scripts/prisma-local.js <comando>
 * Ejemplo: node scripts/prisma-local.js migrate dev
 */

const { execSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const command = process.argv.slice(2).join(' ');

if (!command) {
  console.error('❌ Error: Debes proporcionar un comando de Prisma');
  console.log('Ejemplo: node scripts/prisma-local.js migrate dev');
  process.exit(1);
}

const localUrl = process.env.DATABASE_URL_LOCAL;

if (!localUrl) {
  console.error('❌ Error: DATABASE_URL_LOCAL no está definida en .env');
  console.log('Agrega DATABASE_URL_LOCAL a tu archivo .env');
  process.exit(1);
}

console.log('🔧 Usando base de datos LOCAL:', localUrl.replace(/:[^:@]+@/, ':****@'));
console.log('📝 Ejecutando:', `prisma ${command}\n`);

try {
  process.env.DATABASE_URL = localUrl;
  execSync(`npx prisma ${command}`, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
} catch (error) {
  process.exit(1);
}

