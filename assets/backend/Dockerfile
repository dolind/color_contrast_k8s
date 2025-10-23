FROM debian:bookworm-slim AS build
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates curl cmake g++ make && \
    curl -Lo /usr/local/bin/kubectl \
        https://dl.k8s.io/release/$(curl -Ls https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl && \
    chmod +x /usr/local/bin/kubectl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY backend/CMakeLists.txt backend/main.cpp backend/httplib.h ./
RUN cmake -S . -B build -DBUILD_STATIC=ON -DENABLE_LTO=ON && \
    cmake --build build -j "$(nproc)"

FROM scratch
COPY --from=build /src/build/cpu-demo /cpu-demo
ENTRYPOINT ["/cpu-demo"]
