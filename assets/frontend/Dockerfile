FROM node:20-slim AS frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --silent
COPY frontend/ ./
RUN npm run build

FROM nginx:stable-alpine
COPY --from=frontend /app/dist /usr/share/nginx/html
EXPOSE 80