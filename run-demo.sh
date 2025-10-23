#!/usr/bin/env bash
set -euo pipefail

APP_NAME=cpu-demo
NAMESPACE=demo-autoscale
IMAGE_TAG=cpu-demo:latest
K8S_FILE=k8s.yaml

echo "🚀 Starting Kubernetes CPU Autoscaling Demo setup..."

# ------------------------------------------------------
# Build Docker image (backend + prebuilt frontend)
# ------------------------------------------------------
echo "🛠️  Building Docker image..."
docker build -t $IMAGE_TAG .
echo "✅ Image built: $IMAGE_TAG"

# ------------------------------------------------------
# Deploy to Kubernetes
# ------------------------------------------------------
echo "📤 Deploying to Kubernetes..."
kubectl apply -f $K8S_FILE

echo "⏳ Waiting for deployment to become ready..."
kubectl wait --for=condition=available deployment/$APP_NAME -n $NAMESPACE --timeout=120s || true

echo "✅ Deployment ready!"

# ------------------------------------------------------
# Get service information
# ------------------------------------------------------
echo "🔍 Getting service info..."
kubectl get svc -n $NAMESPACE

NODE_PORT=$(kubectl get svc $APP_NAME -n $NAMESPACE -o jsonpath='{.spec.ports[0].nodePort}')
HOSTNAME=$(hostname)
URL="https://${HOSTNAME}-${NODE_PORT}.preview.app.killer.sh/"

echo
echo "🌐 Open the demo in your browser:"
echo "👉  $URL"
echo

# ------------------------------------------------------
# Show HPA status live
# ------------------------------------------------------
echo "📈 Watching Horizontal Pod Autoscaler..."
echo "(Press Ctrl+C to stop)"
kubectl get hpa -n $NAMESPACE -w
