# Stage 1: build backend
FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates cmake g++ make && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY backend/CMakeLists.txt backend/main.cpp backend/httplib.h ./
RUN cmake -S . -B build -DBUILD_STATIC=ON -DENABLE_LTO=ON && \
    cmake --build build -j "$(nproc)"



# Stage 2 Frontend build
FROM node:20-slim AS frontend
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci --silent

COPY frontend/ ./
RUN npm run build


# Stage 3 Frontend copy & Runtime
FROM scratch
COPY --from=build /src/build/cpu-demo /cpu-demo
WORKDIR /app
# frontend/dist should already exist before docker build (compile TS -> JS)
COPY frontend/dist ./public
EXPOSE 8080
ENTRYPOINT ["/cpu-demo"]