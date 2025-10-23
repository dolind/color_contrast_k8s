#!/usr/bin/env bash
set -euo pipefail

APP=cpu-demo
PORT=5000
REG_HOST=controlplane
REGISTRY="${REG_HOST}:${PORT}"
IMAGE="${REGISTRY}/${APP}:latest"

echo "🚀 Setting up local registry on ${REGISTRY}"

# --- 1. Start registry on controlplane --------------------------------------
if ! docker ps --format '{{.Names}}' | grep -q '^registry$'; then
  docker run -d -p ${PORT}:5000 --restart=always --name registry registry:2
else
  echo "Registry already running."
fi

# --- 2. Configure node01 to trust the registry ------------------------------
echo "🔧 Configuring worker node to trust registry..."
ssh node01 "sudo mkdir -p /etc/containerd/certs.d/${REGISTRY}"
cat <<EOF | ssh node01 "sudo tee /etc/containerd/certs.d/${REGISTRY}/hosts.toml >/dev/null"
server = "http://${REGISTRY}"
[host."http://${REGISTRY}"]
  capabilities = ["pull", "resolve"]
EOF
ssh node01 "sudo systemctl restart containerd"

# --- 3. Build and push image ------------------------------------------------
echo "🛠️  Building and pushing ${IMAGE}..."
docker build -t ${IMAGE} .
docker push ${IMAGE}

echo
echo "✅ Local registry ready: ${REGISTRY}"
echo "✅ Image pushed: ${IMAGE}"
echo
echo "Next step: set image: ${IMAGE} in your k8s.yaml and apply it."
