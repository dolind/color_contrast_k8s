FROM debian:bookworm-slim AS build

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates curl cmake g++ make libssl-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY backend/CMakeLists.txt backend/main.cpp backend/httplib.h ./

RUN cmake -S . -B build && \
    cmake --build build -j "$(nproc)"

# Minimal runtime as we used a static build
FROM scratch
COPY --from=build /src/build/cpu-demo /cpu-demo
ENTRYPOINT ["/cpu-demo"]
