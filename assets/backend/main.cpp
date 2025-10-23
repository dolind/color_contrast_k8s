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
    FILE* pipe = popen("kubectl top nodes --no-headers", "r");
    if (!pipe) {
        res.status = 500;
        res.set_content("{\"error\": \"kubectl failed\"}", "application/json");
        return;
    }

    double totalUsed = 0;
    double totalCap = 0;
    char node[128], cpu[32], mem[32];

    while (fscanf(pipe, "%127s %31s %31s", node, cpu, mem) == 3) {
        double used = atof(cpu);
        if (strchr(cpu, 'm')) used = used; else used *= 1000.0;
        totalUsed += used;
        // hardcode capacity (example: 4000m per node)
        totalCap += 4000.0;
    }
    pclose(pipe);

    double pct = totalCap > 0 ? (totalUsed / totalCap) * 100.0 : 0.0;
    char buf[128];
    snprintf(buf, sizeof(buf), "{\"cpu_pct\":%.1f}", pct);
    res.set_content(buf, "application/json");
});

svr.Get("/pods", [&](const httplib::Request&, httplib::Response& res) {
    FILE* pipe = popen("kubectl get pods -n demo-autoscale -l app=backend --no-headers | wc -l", "r");
    if (!pipe) {
        res.status = 500;
        res.set_content("{\"count\":0}", "application/json");
        return;
    }

    int count = 0;
    fscanf(pipe, "%d", &count);
    pclose(pipe);

    char buf[64];
    snprintf(buf, sizeof(buf), "{\"count\":%d}", count);
    res.set_content(buf, "application/json");
});


    std::cout << "Listening on 0.0.0.0:8080" << std::endl;
    svr.listen("0.0.0.0", 8080);
}
