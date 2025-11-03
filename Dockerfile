FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --omit=dev=false

# Build stage
FROM deps AS build
COPY . .
# Ensure Prisma schema is available and client is generated before build
RUN npx prisma generate
RUN npm run build

# Production image, copy necessary files
FROM node:20-alpine AS prod
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./package.json
COPY prisma ./prisma
COPY --from=build /app/dist ./dist

EXPOSE 6543
CMD ["node", "dist/main.js"]


