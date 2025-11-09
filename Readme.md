# CPU Autoscaling Demo for Kubernetes

This is a demo to study how the Horizontal Pod Autoscaling reacts to increased loads.


## Architecture
The C++ demo use a simple CPU burn method to simulate load. The Frontend sends request for the number of active users.


## Kubernetes usage
Kubernetes is used for deployment.

Tested with minikube on a local dev PC.

For more details see this Blogpost:
