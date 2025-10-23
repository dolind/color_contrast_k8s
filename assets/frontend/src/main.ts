import * as d3 from "d3";

interface Sample {
    t: number;
    resp: number;
    cpu: number;
}

// UI elements
const usersInput = document.getElementById("users") as HTMLInputElement;
const usersLabel = document.getElementById("usersVal")!;
const workInput = document.getElementById("work") as HTMLInputElement;
const workLabel = document.getElementById("workVal")!;
const inflightEl = document.getElementById("inflight")!;
const rpsEl = document.getElementById("rps")!;
const errsEl = document.getElementById("errs")!;
const podsEl = document.getElementById("pods")!;

// State
let targetUsers = 0, workMs = 10;
let inflight = 0, done = 0, errs = 0;
let respTimes: number[] = [], samples: Sample[] = [];
const start = performance.now();

// D3 setup
const w = 650, h = 220, m = {top: 30, right: 30, bottom: 35, left: 50};
const x = d3.scaleLinear().range([m.left, w - m.right]);
const yResp = d3.scaleLinear().range([h - m.bottom, m.top]);
const yCpu = d3.scaleLinear().range([h - m.bottom, m.top]);
const lineResp = d3.line<Sample>().x((d: { t: any; }) => x(d.t)).y((d: {
    resp: any;
}) => yResp(d.resp)).curve(d3.curveMonotoneX);
const lineCpu = d3.line<Sample>().x((d: { t: any; }) => x(d.t)).y((d: {
    cpu: any;
}) => yCpu(d.cpu)).curve(d3.curveMonotoneX);
const svgResp = d3.select("#respGraph"), svgCpu = d3.select("#cpuGraph");

// --- Slider events ---
usersInput.oninput = e => {
    targetUsers = parseInt((e.target as HTMLInputElement).value);
    usersLabel.textContent = String(targetUsers);
};

workInput.oninput = e => {
    workMs = parseInt((e.target as HTMLInputElement).value);
    workLabel.textContent = String(workMs);
};


// dynamic output (graphs and labels)
function updateGraphs(currentResp: number, currentCpu: number) {
    const now = (performance.now() - start) / 1000;
    x.domain([Math.max(0, now - 60), now]);
    yResp.domain([0, d3.max(samples, (d: { resp: any; }) => d.resp)! * 1.2 || 100]);
    yCpu.domain([0, 100]);

    // Response graph
    svgResp.selectAll("*").remove();
    svgResp.append("path")
        .datum(samples)
        .attr("d", lineResp)
        .attr("fill", "none")
        .attr("stroke", "steelblue")
        .attr("stroke-width", 2);
    svgResp.append("text")
        .attr("x", w - 130)
        .attr("y", m.top + 15)
        .attr("fill", "steelblue")
        .attr("font-size", "13px")
        .attr("font-weight", "bold")
        .text(`Resp: ${currentResp.toFixed(1)} ms`);
    svgResp.append("text")
        .attr("x", 10)
        .attr("y", 15)
        .attr("font-size", "12px")
        .text("Response Time (ms)");

    // CPU graph
    svgCpu.selectAll("*").remove();
    svgCpu.append("path")
        .datum(samples)
        .attr("d", lineCpu)
        .attr("fill", "none")
        .attr("stroke", "tomato")
        .attr("stroke-width", 2);
    svgCpu.append("text")
        .attr("x", w - 120)
        .attr("y", m.top + 15)
        .attr("fill", "tomato")
        .attr("font-size", "13px")
        .attr("font-weight", "bold")
        .text(`CPU: ${currentCpu.toFixed(1)} %`);
    svgCpu.append("text")
        .attr("x", 10)
        .attr("y", 15)
        .attr("font-size", "12px")
        .text("CPU Usage (%)");
}

// --- Fire compute requests ---
// Use 2000ms to simulate
function fireCompute() {
    inflight++;
    const t0 = performance.now();
    fetch(`/compute?ms=${workMs}`)
        .then(r => {
            if (!r.ok) errs++;
            else respTimes.push(performance.now() - t0);
        })
        .catch(() => errs++)
        .finally(() => inflight--);
}

// We keep firing compute requests until we hit the target number of users
// Eventually, this leads to saturation of the server
function loop() {
    while (inflight < targetUsers) fireCompute();
    inflightEl.textContent = String(inflight);
    requestAnimationFrame(loop);
}

// Polling server for metrics, every 500ms for fluent display
async function pollMetrics() {
    try {
        const r = await fetch("/metrics");
        const data = await r.json();
        const now = (performance.now() - start) / 1000;
        const respAvg = d3.mean(respTimes) || 0;
        samples.push({t: now, resp: respAvg, cpu: data.cpu_pct});
        if (samples.length > 600) samples.shift();
        respTimes = [];

        updateGraphs(respAvg, data.cpu_pct);
        rpsEl.textContent = String(done);
        errsEl.textContent = String(errs);
        done = 0;
    } catch (err) {
        console.warn("metrics fetch failed", err);
    }
}

setInterval(pollMetrics, 500);

// Poll K8s API every 5s via kubectl proxy
async function pollPods() {
  try {
    const r = await fetch("/kube-metrics");
    const data = await r.json();
    const pods = data.items || [];
    const backendPods = pods.filter(p => p.metadata.labels?.app === "backend");

    // 🎯 Number of backend pods
    podsEl.textContent = backendPods.length;

    // 🎯 Average CPU across pods
    const cpuVals = backendPods.map(p => {
      const val = p.containers[0].usage.cpu;
      if (val.endsWith("n")) return parseInt(val) / 1e6;
      if (val.endsWith("m")) return parseInt(val);
      return parseInt(val) * 1000;
    });
    const avgCpu = d3.mean(cpuVals) || 0;

    updateGraphs(0, avgCpu);
  } catch (e) {
    podsEl.textContent = "?";
  }
}

setInterval(pollPods, 1000);

pollPods();

loop();
