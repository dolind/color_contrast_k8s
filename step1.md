# Step 1 — Build and Deploy

### 1. Build the demo image
```bash
docker build -t cpu-demo:latest assets/backend
```

### 2. Deploy to Kubernetes
```
kubectl apply -f assets/k8s.yaml
```


### 3. Wait for pods to start

kubectl get pods -n demo-autoscale -w


### 4. Find the exposed port


kubectl get svc -n demo-autoscale

Then open the NodePort using Killercoda’s “Open Port” feature — you’ll see the web UI.


