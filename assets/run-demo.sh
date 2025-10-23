./sync-images.sh
kubectl apply -f k8s.yaml
kubectl -n demo-autoscale get pods -o wide