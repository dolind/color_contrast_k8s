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
        std::lock_guard<std::mutex> lk(mtx);
        CpuSample now = read_cpu();
        auto ts = steady_clock::now();
        double pct = compute_cpu_pct(last, now);
        double uptime = duration_cast<seconds>(ts - last_ts).count();
        last = now;
        last_ts = ts;

        std::ostringstream json;
        json << "{";
        json << "\"cpu_pct\":" << pct << ",";
        json << "\"uptime\":" << uptime << ",";
        json << "\"timestamp\":" << duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();
        json << "}";
        res.set_content(json.str(), "application/json");
    });

    std::cout << "Listening on 0.0.0.0:8080" << std::endl;
    svr.listen("0.0.0.0", 8080);
}
