import * as d3 from "d3";
// We use a web worker, so requests stay alive if window focus changes
const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
});


interface Sample {
    t: number;
    resp: number;
    cpu: number;
    scaleEvent?: "up" | "down";
}

function getWidth() {
    return (document.getElementById("respGraph") as SVGSVGElement).clientWidth;
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
let uitargetUsers = 0;
let uiworkMs = 10;

let respTimes: number[] = [];
let samples: Sample[] = [];
let lastPodCount = 1;
let userEvents: { t: number; users: number }[] = [];

const start = performance.now();
const WINDOW_SECONDS = 900;
const k8sRequestCPU = 250;
// Graph setup
const w = getWidth();
const h = 220, m = {top: 30, right: 30, bottom: 35, left: 50};
const x = d3.scaleLinear().range([m.left, w - m.right]);
const yResp = d3.scaleLinear().range([h - m.bottom, m.top]);
const yCpu = d3.scaleLinear().range([h - m.bottom, m.top]);

const lineResp = d3.line<Sample>().x((d: { t: any; }) => x(d.t)).y((d: {
    resp: any;
}) => yResp(d.resp)).curve(d3.curveMonotoneX);

const lineCpu = d3.line<Sample>().x((d: { t: any; }) => x(d.t)).y((d: {
    cpu: any;
}) => yCpu(d.cpu)).curve(d3.curveMonotoneX);

function setupGraph(svgId: string, color: string, title: string) {
    const svg = d3.select(svgId);
    svg.append("g").attr("class", "x-axis")
        .attr("transform", `translate(0, ${h - m.bottom})`);

    svg.append("path")
        .attr("class", "graph-line")
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 2);

    svg.append("text")
        .attr("class", "graph-label")
        .attr("x", 10)
        .attr("y", 15)
        .text(title);

    svg.append("text")
        .attr("class", "value-label")
        .attr("x", w - 150)
        .attr("y", m.top + 15)
        .attr("font-weight", "bold")
        .attr("font-size", "13px");

    if (svgId === "#cpuGraph") {
        svg.append("line")
            .attr("class", "hpa-target-line")
            .attr("stroke", "orange")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "6 3");
    }

    return svg;
}


const svgResp = d3.select("#respGraph");
const svgCpu = d3.select("#cpuGraph");
setupGraph("#respGraph", "steelblue", "Response Time (ms)");
setupGraph("#cpuGraph", "tomato", "Mean CPU Usage Relative to 250m (%)");

function updateGraphs(resp: number, cpu: number) {
    const now = (performance.now() - start) / 1000;
    const w = getWidth();
    x.range([m.left, w - m.right])
    x.domain([Math.max(0, now - WINDOW_SECONDS), now]);
    yResp.domain([0, d3.max(samples, (d: { resp: any; }) => d.resp)! * 1.2 || 100]);
    yCpu.domain([0, 300]);
    svgCpu.select<SVGLineElement>(".hpa-target-line")
        .attr("x1", m.left)
        .attr("x2", w - m.right)
        .attr("y1", yCpu(80))
        .attr("y2", yCpu(80));
    const xAxis = d3.axisBottom(x)
        .ticks(6)
        .tickFormat(d => d + "s");

    for (const svg of [svgResp, svgCpu]) {
        svg.selectAll(".x-axis").remove();
        svg.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0, ${h - m.bottom})`)
            .call(xAxis);
    }

    // Response graph
    for (const [svg, line, value] of [
        [svgResp, lineResp, resp],
        [svgCpu, lineCpu, cpu],
    ] as const) {
        svg.select<SVGGElement>(".x-axis").call(xAxis);
        svg.select<SVGPathElement>(".graph-line").datum(samples).attr("d", line);
        svg.select<SVGTextElement>(".value-label").text(value.toFixed(1));
    }

    svgResp.selectAll(".scale-marker")
        .data(samples.filter(s => s.scaleEvent))
        .join("line")
        .attr("class", "scale-marker")
        .attr("x1", d => x(d.t))
        .attr("x2", d => x(d.t))
        .attr("y1", m.top)
        .attr("y2", h - m.bottom)
        .attr("stroke", d => d.scaleEvent === "up" ? "green" : "red")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "4 2");

    svgResp.selectAll(".user-marker")
        .data(userEvents)
        .join("line")
        .attr("class", "user-marker")
        .attr("x1", d => x(d.t))
        .attr("x2", d => x(d.t))
        .attr("y1", m.top)
        .attr("y2", h - m.bottom)
        .attr("stroke", "orange")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "3 3");

    svgResp.selectAll(".user-label")
        .data(userEvents)
        .join("text")
        .attr("class", "user-label")
        .attr("x", d => x(d.t) + 4)
        .attr("y", m.top + 12)
        .attr("font-size", "11px")
        .attr("fill", "orange")
        .text(d => `${d.users}`);
}

// Slider events
usersInput.oninput = e => {
    uitargetUsers = parseInt((e.target as HTMLInputElement).value);
    usersLabel.textContent = String(uitargetUsers);
    const now = (performance.now() - start) / 1000;
    userEvents.push({t: now, users: uitargetUsers});
    worker.postMessage({targetUsers: uitargetUsers});
};

workInput.oninput = e => {
    uiworkMs = parseInt((e.target as HTMLInputElement).value);
    workLabel.textContent = String(uiworkMs);
    worker.postMessage({workMs: uiworkMs});
};

worker.onmessage = e => {
    if (e.data.type === "stats") {
        const {inflight, done, errs} = e.data;
        inflightEl.textContent = String(inflight);
        rpsEl.textContent = String(done);
        errsEl.textContent = String(errs);
        return;
    }

    if (e.data.type === "resp") {
        respTimes.push(e.data.duration);
    }
};


// Polling server for metrics
async function pollMetrics() {
    try {
        const r = await fetch("/metrics");
        if (!r.ok) return;

        const data = await r.json();
        const backendPods = (data.pods || []).filter(p => p.podRef?.name?.includes("backend"));
        podsEl.textContent = String(backendPods.length);

        const avgCpu_mcpu = d3.mean(
            backendPods.flatMap(p => p.containers.map(c => c.cpu.usageNanoCores / 1e6))
        ) || 0;

        const cpuPct = (avgCpu_mcpu / k8sRequestCPU) * 100;

        const now = (performance.now() - start) / 1000;
        const respAvg = d3.mean(respTimes) || 0;
        respTimes = [];

        samples.push({
            t: now,
            resp: respAvg,
            cpu: cpuPct,
            scaleEvent: backendPods.length !== lastPodCount
                ? (backendPods.length > lastPodCount ? "up" : "down")
                : undefined
        });
        lastPodCount = backendPods.length;
        samples = samples.slice(-2000);

        updateGraphs(respAvg, cpuPct);

    } catch {
        /* silent */
    }
}


setInterval(pollMetrics, 500);

