IMAGES=("frontend" "backend")
TAG="latest"
for APP in "${IMAGES[@]}"; do
  echo "Building local image: ${APP}:${TAG}"
  docker build -f "${APP}/Dockerfile" -t "${APP}:${TAG}" .
done

echo "Starting Demo"
kubectl apply -f k8s.yaml
kubectl -n demo-autoscale get pods -o wide