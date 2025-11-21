FROM node:20-alpine AS base
WORKDIR /app

# ============================================
# Stage 1: Dependencias de la API
# ============================================
FROM base AS api-deps
RUN apk add --no-cache python3 make g++
COPY Gastos-API/package.json Gastos-API/package-lock.json ./Gastos-API/
WORKDIR /app/Gastos-API
RUN npm ci --omit=dev=false

# ============================================
# Stage 2: Dependencias del Frontend
# ============================================
FROM base AS app-deps
COPY Gastos-APP/package.json Gastos-APP/package-lock.json ./Gastos-APP/
WORKDIR /app/Gastos-APP
RUN npm ci

# ============================================
# Stage 3: Build de la API
# ============================================
FROM api-deps AS api-build
WORKDIR /app/Gastos-API
# Recibir variables del .env como build args
ARG DB_USER=postgres
ARG DB_PASSWORD=postgres
ARG DB_NAME=gastos
# Construir DATABASE_URL con las variables (usando localhost durante build)
ENV DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}?schema=public"
COPY Gastos-API/ .
RUN npx prisma generate
RUN npm run build

# ============================================
# Stage 4: Build del Frontend
# ============================================
FROM app-deps AS app-build
WORKDIR /app/Gastos-APP
ARG VITE_API_URL=http://localhost:6543
ENV VITE_API_URL=$VITE_API_URL
COPY Gastos-APP/ .
RUN npm run build

# ============================================
# Stage 5: Imagen de producción
# ============================================
FROM node:20-alpine AS prod
RUN apk add --no-cache python3 make g++

# Instalar dependencias de producción de la API
WORKDIR /app/api
COPY --from=api-deps /app/Gastos-API/node_modules ./node_modules
COPY --from=api-build /app/Gastos-API/package.json ./package.json
COPY --from=api-build /app/Gastos-API/prisma ./prisma
COPY --from=api-build /app/Gastos-API/dist ./dist

# Copiar frontend construido
WORKDIR /app
COPY --from=app-build /app/Gastos-APP/dist ./app/dist

# Instalar servidor estático simple para el frontend
RUN npm install -g serve

# Copiar script de inicio
COPY Gastos-API/start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 6543 5173
CMD ["/app/start.sh"]
