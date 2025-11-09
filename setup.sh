# Start Minikube
minikube start --cpus=6 --memory=8g

# We need metrics, therefore we use the metrics server
minikube addons enable metrics-server

# We need to use the k8s docker registry, which is different from your standard local one
eval "$(minikube docker-env)"

kubectl -n kube-system patch deployment metrics-server \
  --type='json' \
  -p='[
    {
      "op": "replace",
      "path": "/spec/template/spec/containers/0/args/4",
      "value": "--metric-resolution=15s"
    }
  ]'


kubectl rollout restart deployment metrics-server -n kube-system
