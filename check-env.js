#!/usr/bin/env node

/**
 * Script para verificar que el archivo .env existe y tiene todas las variables necesarias
 * Ejecutar desde el directorio Gastos-API: node check-env.js
 */

const fs = require('fs');
const path = require('path');

const requiredVars = [
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'DB_PORT',
  'API_PORT',
  'APP_PORT',
  'OPENAI_API_KEY',
  'CORS_ORIGINS',
];

const envPath = path.join(__dirname, '.env');

console.log('🔍 Verificando configuración de variables de entorno...\n');

// Verificar que el archivo .env existe
if (!fs.existsSync(envPath)) {
  console.error('❌ ERROR: No se encontró el archivo .env');
  console.error(`   Buscado en: ${envPath}`);
  console.error('\n📝 Solución:');
  console.error('   1. Crea un archivo .env en el directorio Gastos-API/');
  console.error('   2. Copia el contenido de .env.example (si existe)');
  console.error('   3. Completa todas las variables requeridas\n');
  process.exit(1);
}

console.log('✅ Archivo .env encontrado\n');

// Leer el archivo .env
const envContent = fs.readFileSync(envPath, 'utf-8');
const envLines = envContent.split('\n');

// Parsear variables (solo las que tienen =)
const envVars = {};
envLines.forEach(line => {
  const trimmed = line.trim();
  // Ignorar comentarios y líneas vacías
  if (trimmed && !trimmed.startsWith('#')) {
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      envVars[key] = value;
    }
  }
});

console.log('📋 Variables encontradas en .env:\n');

let hasErrors = false;
const missingVars = [];
const emptyVars = [];

requiredVars.forEach(varName => {
  if (!(varName in envVars)) {
    missingVars.push(varName);
    console.log(`   ❌ ${varName}: NO ENCONTRADA`);
    hasErrors = true;
  } else if (!envVars[varName] || envVars[varName] === '') {
    emptyVars.push(varName);
    console.log(`   ⚠️  ${varName}: VACÍA`);
    hasErrors = true;
  } else {
    // Ocultar valores sensibles
    const displayValue = varName.includes('PASSWORD') || varName.includes('KEY')
      ? '****' 
      : envVars[varName];
    console.log(`   ✅ ${varName}: ${displayValue}`);
  }
});

console.log('');

if (hasErrors) {
  console.error('❌ ERROR: Faltan variables requeridas o están vacías\n');
  
  if (missingVars.length > 0) {
    console.error('   Variables faltantes:');
    missingVars.forEach(v => console.error(`     - ${v}`));
    console.error('');
  }
  
  if (emptyVars.length > 0) {
    console.error('   Variables vacías:');
    emptyVars.forEach(v => console.error(`     - ${v}`));
    console.error('');
  }
  
  console.error('📝 Solución:');
  console.error('   Agrega o completa estas variables en tu archivo .env\n');
  process.exit(1);
}

console.log('✅ Todas las variables requeridas están presentes y tienen valores\n');
console.log('💡 Tip: Ejecuta "docker-compose config" para verificar que Docker Compose puede leer las variables\n');

