import * as d3 from "d3";

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
let targetUsers = 0;
let workMs = 10;
let inflight = 0, done = 0, errs = 0;
let respTimes: number[] = [];
let samples: Sample[] = [];
let lastPodCount = 1;

const start = performance.now();
const WINDOW_SECONDS = 900;

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

    return svg;
}


const svgResp = d3.select("#respGraph");
const svgCpu = d3.select("#cpuGraph");
setupGraph("#respGraph", "steelblue", "Response Time (ms)");
setupGraph("#cpuGraph", "tomato", "CPU Usage (%)");

function updateGraphs(resp: number, cpu: number) {
    const now = (performance.now() - start) / 1000;
    const w = getWidth();
    x.range([m.left, w - m.right])
    x.domain([Math.max(0, now - WINDOW_SECONDS), now]);
    yResp.domain([0, d3.max(samples, (d: { resp: any; }) => d.resp)! * 1.2 || 100]);
    yCpu.domain([0, 100]);

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
}

// Slider events
usersInput.oninput = e => {
    targetUsers = parseInt((e.target as HTMLInputElement).value);
    usersLabel.textContent = String(targetUsers);
};

workInput.oninput = e => {
    workMs = parseInt((e.target as HTMLInputElement).value);
    workLabel.textContent = String(workMs);
};


function fireUser() {
    //let lastRequestFinished = performance.now();
    function loop() {
        const startRequest = performance.now();
        fetch(`/compute?ms=${workMs}`)
            .then(r => {
                if (r.ok) {
                    respTimes.push(performance.now() - startRequest);
                    done++;
                } else {
                    errs++;
                }
            })
            .catch(() => errs++)
            .finally(() => {
                inflight--;

                // Realistic user: wait before next action
                const thinkTime = 200 + Math.random() * 300;  // 200–500ms

                // Call method again, if not saturated
                // This simulates real user behavior
                setTimeout(() => {
                    //const now = performance.now();
                    //const timeSinceLast = now - lastRequestFinished;
                    //console.log(`user think time: ${timeSinceLast.toFixed(0)} ms`);

                    // lastRequestFinished = now;

                    if (inflight < targetUsers) {
                        inflight++;
                        fireUser();
                    }
                }, thinkTime);
            });
    }

    loop();
}

// We keep firing compute requests until we hit the target number of users.
// But every new fireUser stays alive, forever as it keeps calling itself.
// Eventually, this leads to saturation of the server.
setInterval(() => {
    while (inflight < targetUsers) {
        inflight++;
        fireUser();
    }
    inflightEl.textContent = String(inflight);
}, 500);


// Polling server for metrics
async function pollMetrics() {
    try {
        const r = await fetch("/metrics");
        if (!r.ok) return;

        const data = await r.json();
        const backendPods = (data.pods || []).filter(p => p.podRef?.name?.includes("backend"));
        podsEl.textContent = String(backendPods.length);

        const cpuPct = d3.mean(
            backendPods.flatMap(p => p.containers.map(c => c.cpu.usageNanoCores / 1e6))
        )! / 10 || 0; // mCPU → percent

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

        rpsEl.textContent = String(done);
        errsEl.textContent = String(errs);
        done = 0;
    } catch {
        /* silent */
    }
}


setInterval(pollMetrics, 500);

