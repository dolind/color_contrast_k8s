FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates cmake g++ make && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY backend/CMakeLists.txt backend/main.cpp backend/httplib.h ./
RUN cmake -S . -B build -DBUILD_STATIC=ON -DENABLE_LTO=ON && \
    cmake --build build -j "$(nproc)"

FROM scratch
COPY --from=build /src/build/cpu-demo /cpu-demo
ENTRYPOINT ["/cpu-demo"]
