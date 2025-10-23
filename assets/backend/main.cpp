#include "httplib.h"
#include <cmath>
#include <chrono>
#include <fstream>
#include <iostream>
#include <mutex>
#include <string>
#include <sstream>
#include <thread>

using namespace std::chrono;
int CORES = std::thread::hardware_concurrency();

/// Core function: CPU Burner, core functionality for this demo
void burn_cpu(int ms) {
    auto end = high_resolution_clock::now() + milliseconds(ms);
    volatile double x = 0.0001;
    while (high_resolution_clock::now() < end) {
        x = std::sin(x) * std::cos(x) * std::tan(x + 1e-6);
    }
}

// --- CPU usage helpers ---
struct CpuSample {
    unsigned long long total_jiffies = 0;
    unsigned long long proc_jiffies = 0;
};

CpuSample read_cpu() {
    CpuSample s{};
    std::ifstream stat("/proc/stat");
    std::string line;
    if (std::getline(stat, line)) {
        std::istringstream iss(line);
        std::string cpu;
        unsigned long long user, nice, system, idle, iowait, irq, softirq, steal;
        iss >> cpu >> user >> nice >> system >> idle >> iowait >> irq >> softirq >> steal;
        s.total_jiffies = user + nice + system + idle + iowait + irq + softirq + steal;
    }

    std::ifstream self("/proc/self/stat");
    std::string tmp;
    for (int i = 0; i < 13; ++i) self >> tmp;
    unsigned long long utime, stime;
    self >> utime >> stime;
    s.proc_jiffies = utime + stime;
    return s;
}

double compute_cpu_pct(CpuSample prev, CpuSample now) {
    unsigned long long total_diff = now.total_jiffies - prev.total_jiffies;
    unsigned long long proc_diff = now.proc_jiffies - prev.proc_jiffies;
    if (total_diff == 0) return 0.0;
    return 100.0 * (double(proc_diff) / double(total_diff));
}

double parseCpu(const std::string& s) {
    if (s.ends_with("m")) return std::stod(s.substr(0, s.size()-1)); // millicores
    return std::stod(s) * 1000.0; // cores -> millicores
}

int main() {
    httplib::Server svr;
    std::cout << "Starting server" << std::endl;
    std::cout << "CPU cores: " << CORES << std::endl;

    svr.set_mount_point("/", "/app/public");

    // the backend only offers a single endpoint: /compute
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

    static CpuSample last = read_cpu();
    static auto last_ts = steady_clock::now();
    static std::mutex mtx;

    // Metrics is for dashboard graphs
    // We return a json
   svr.Get("/metrics", [&](const httplib::Request &, httplib::Response &res) {
    std::ifstream token_file("/var/run/secrets/kubernetes.io/serviceaccount/token");
    std::string token((std::istreambuf_iterator<char>(token_file)), {});
    std::string ca_path = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";

    const char* host = std::getenv("KUBERNETES_SERVICE_HOST");
    const char* port = std::getenv("KUBERNETES_SERVICE_PORT");
    httplib::SSLClient cli(host, std::stoi(port));
    cli.set_ca_cert_path(ca_path.c_str());
    cli.enable_server_certificate_verification(true);

    httplib::Headers headers = {{"Authorization", "Bearer " + token}};
    auto r = cli.Get("/apis/metrics.k8s.io/v1beta1/nodes", headers);
    if (!r || r->status != 200) {
        res.status = 500;
        res.set_content("{\"error\":\"failed to query metrics API\"}", "application/json");
        return;
    }

    // parse and aggregate CPU usage
    rapidjson::Document doc;
    doc.Parse(r->body.c_str());
    double totalUsage = 0.0;
    double totalAlloc = 0.0;

    for (auto& node : doc["items"].GetArray()) {
        auto cpuStr = node["usage"]["cpu"].GetString();          // e.g. "123m"
        auto allocStr = node["status"]["allocatable"]["cpu"].GetString(); // e.g. "2000m" or "2"
        totalUsage += parseCpu(cpuStr);
        totalAlloc += parseCpu(allocStr);
    }

    double pct = (totalAlloc > 0) ? (totalUsage / totalAlloc) * 100.0 : 0.0;

    std::ostringstream json;
    json << "{";
    json << "\"cpu_pct\":" << pct;
    json << "}";
    res.set_content(json.str(), "application/json");
});



    std::cout << "Listening on 0.0.0.0:8080" << std::endl;
    svr.listen("0.0.0.0", 8080);
}
