#include "httplib.h"
#include <fstream>
#include <iostream>
#include <thread>

using namespace std::chrono;
int CORES = std::thread::hardware_concurrency();

std::string read_file(const char* path) {
    std::ifstream f(path);
    return std::string((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
}

/// Core function: CPU Burner
void burn_cpu(int ms) {
    auto end = high_resolution_clock::now() + milliseconds(ms);
    volatile double x = 0.0001;
    while (high_resolution_clock::now() < end) {
        x = std::sin(x) * std::cos(x) * std::tan(x + 1e-6);
    }
}


int main() {
    httplib::Server svr;
    std::cout << "Starting server" << std::endl;
    std::cout << "CPU cores: " << CORES << std::endl;

    svr.set_mount_point("/", "/app/public");

    // the backend only offers a single function: /compute
    // it takes a single parameter: ms, which is the number of milliseconds to burn the CPU for
    // the response is always "ok"
    svr.Get("/compute", [](const httplib::Request &req, httplib::Response &res) {
        int ms = 2000;
        if (req.has_param("ms")) ms = std::stoi(req.get_param_value("ms"));
        ms = std::clamp(ms, 1, 10000);
        burn_cpu(ms);
        res.set_content("ok", "text/plain");
    });

    // the backend also offers two health checks: /healthz and /metrics
    // /healthz is for k8s only
    svr.Get("/healthz", [](const httplib::Request &, httplib::Response &res) {
        res.set_content("ok", "text/plain");
    });



    // Metrics is for dashboard graphs
    // Kubernetes metadata — read once
    static const std::string token = read_file("/var/run/secrets/kubernetes.io/serviceaccount/token");
    static const std::string node = std::getenv("NODE_NAME");
    static httplib::SSLClient cli(node.c_str(), 10250);
    svr.Get("/metrics", [&](const httplib::Request &, httplib::Response &res) {
    // demo with weak security
        cli.enable_server_certificate_verification(false);

        httplib::Headers headers = {
            {"Authorization", "Bearer " + token}
        };

        auto r = cli.Get("/stats/summary", headers);


        if (auto r = cli.Get("/stats/summary", headers); r && r->status == 200) {
            res.set_content(r->body, "application/json");
        } else {
            res.status = 500;
            res.set_content(R"({"error":"kubelet unavailable"})", "application/json");
        }
    });


    std::cout << "Listening on 0.0.0.0:8080" << std::endl;
    svr.listen("0.0.0.0", 8080);
}
