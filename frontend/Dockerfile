# Etapa 1: Construcción (Build)
FROM node:18-alpine as build-step
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Etapa 2: Ejecución (Runtime)
FROM node:18-alpine
WORKDIR /app
# Copiamos lo compilado y el servidor mínimo
COPY --from=build-step /app/dist ./dist
COPY server.js ./
COPY package*.json ./
RUN npm install --only=production
EXPOSE 4200
CMD ["npm", "start"]