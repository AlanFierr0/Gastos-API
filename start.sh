#!/bin/sh
set -e

# Inicializar Prisma y ejecutar migraciones
cd /app/api
npx prisma generate
npx prisma migrate deploy

# Iniciar API en background
node dist/main.js &
API_PID=$!

# Iniciar servidor de frontend en background
cd /app
serve -s app/dist -l 5173 &
APP_PID=$!

# Función para limpiar procesos al salir
cleanup() {
    echo "Deteniendo servicios..."
    kill $API_PID $APP_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGTERM SIGINT

# Esperar a que ambos procesos terminen
wait $API_PID $APP_PID

