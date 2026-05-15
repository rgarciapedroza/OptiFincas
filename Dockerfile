# Stage 1: Build Angular
FROM node:18-alpine as build-step
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Runtime
FROM node:18-alpine
WORKDIR /app
COPY --from=build-step /app/dist ./dist
COPY frontend/server.js ./
COPY frontend/package*.json ./
RUN npm install --only=production
EXPOSE 8000
CMD ["npm", "start"]