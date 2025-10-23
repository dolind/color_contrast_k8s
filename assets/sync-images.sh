#!/usr/bin/env bash
set -euo pipefail

# ----------------------------------------------------------------------
# CONFIG
# ----------------------------------------------------------------------
NODES=("node01")   # add more worker nodes here if needed
IMAGES=("frontend" "backend")
TAG="latest"

# ----------------------------------------------------------------------
# BUILD IMAGES
# ----------------------------------------------------------------------
for APP in "${IMAGES[@]}"; do
  echo "🛠️  Building local image: ${APP}:${TAG}"
  docker build -f "${APP}/Dockerfile" -t "${APP}:${TAG}" .
done

# ----------------------------------------------------------------------
# SYNC IMAGES TO CONTAINERD ON ALL NODES
# ----------------------------------------------------------------------
for APP in "${IMAGES[@]}"; do
  TAR="/tmp/${APP}.tar"
  IMAGE="${APP}:${TAG}"

  echo "💾 Saving ${IMAGE} to ${TAR}"
  docker save "${IMAGE}" -o "${TAR}"

  echo "📦 Importing ${IMAGE} into containerd on controlplane..."
  sudo ctr -n k8s.io images import "${TAR}" || true
  sudo ctr -n k8s.io images tag "docker.io/library/${IMAGE}" "${IMAGE}" || true

  for node in "${NODES[@]}"; do
    echo "📤 Copying ${IMAGE} to ${node}..."
    scp -q "${TAR}" "${node}:${TAR}"

    echo "📦 Importing ${IMAGE} into containerd on ${node}..."
    ssh "${node}" "sudo ctr -n k8s.io images import ${TAR} && \
                   sudo ctr -n k8s.io images tag docker.io/library/${IMAGE} ${IMAGE} && \
                   rm -f ${TAR}"
  done

  echo "✅ Verified images for ${APP}:"
  sudo ctr -n k8s.io images ls | grep "${APP}" || echo "❌ Missing on controlplane"
  for node in "${NODES[@]}"
