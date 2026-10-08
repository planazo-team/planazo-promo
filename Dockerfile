# --- Etapa 1: compilar -------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Primero solo los manifiestos para aprovechar la caché de capas de Docker.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
 && npm prune --omit=dev

# --- Etapa 2: imagen final ---------------------------------------------------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# La imagen oficial trae el usuario `node` sin privilegios.
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node
EXPOSE 3002
CMD ["node", "dist/main.js"]
