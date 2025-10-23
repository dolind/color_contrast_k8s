#!/usr/bin/env bash
set -euo pipefail

APP=cpu-demo
TAG=latest
IMAGE=${APP}:${TAG}
TAR=/tmp/${APP}.tar
NODES=("node01")   # add more if needed

echo "🛠️  Building local image on controlplane..."
docker build -t ${IMAGE} .

echo "💾 Saving image to ${TAR}..."
docker save ${IMAGE} -o ${TAR}

for node in "${NODES[@]}"; do
  echo "📤 Copying image tarball to ${node}..."
  scp ${TAR} ${node}:${TAR}

  echo "📦 Importing image into containerd on ${node}..."
  ssh ${node} "sudo ctr -n k8s.io images import ${TAR} && \
               sudo ctr -n k8s.io images tag docker.io/library/${IMAGE} ${IMAGE} && \
               rm -f ${TAR}"
done

echo "✅ Verifying image presence..."
sudo ctr -n k8s.io images ls | grep ${APP} || true
ssh node01 "sudo ctr -n k8s.io images ls | grep ${APP} || true"

echo "🎉 Both nodes now have ${IMAGE} ready for Kubernetes."
