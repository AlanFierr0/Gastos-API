/**
 * Script para ejecutar comandos de Prisma usando DATABASE_URL
 * 
 * Uso: node scripts/prisma-prod.js <comando>
 * Ejemplo: node scripts/prisma-prod.js migrate deploy
 */

const { execSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const command = process.argv.slice(2).join(' ');

if (!command) {
  console.error('❌ Error: Debes proporcionar un comando de Prisma');
  console.log('Ejemplo: node scripts/prisma-prod.js migrate deploy');
  process.exit(1);
}

const prodUrl = process.env.DATABASE_URL;

if (!prodUrl) {
  console.error('❌ Error: DATABASE_URL no está definida en .env');
  console.log('Agrega DATABASE_URL a tu archivo .env');
  process.exit(1);
}

console.log('☁️  Usando base de datos:', prodUrl.replace(/:[^:@]+@/, ':****@'));
console.log('📝 Ejecutando:', `prisma ${command}\n`);

try {
  process.env.DATABASE_URL = prodUrl;
  execSync(`npx prisma ${command}`, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
} catch (error) {
  process.exit(1);
}


