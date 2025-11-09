// State
let targetUsers = 0;
let workMs = 10;
let inflight = 0;
let done = 0;
let errs = 0;

// One simulated user loop (runs forever)
function fireUser() {
    const startRequest = performance.now();

    fetch(`/compute?ms=${workMs}`)
        .then(r => {
            if (r.ok) {
                done++;
            } else {
                errs++;
            }
        })
        .catch(() => errs++)
        .finally(() => {
            inflight--;
            const duration = performance.now() - startRequest;

            // Realistic user: wait before next action
            const thinkTime = 200 + Math.random() * 300; // 200–500ms
            //console.log(`think=${thinkTime.toFixed(0)}ms, request=${duration.toFixed(0)}ms`);

            // Send response latency to UI thread (so graph can show RespTime)
            postMessage({type: "resp", duration});
            // Call method again, if not saturated
            // This simulates real user behavior
            setTimeout(() => {
                if (inflight < targetUsers) {
                    inflight++;
                    fireUser();
                }
            }, thinkTime);
        });
}

// We keep firing compute requests until we hit the target number of users.
// But every new fireUser stays alive, forever as it keeps calling itself.
// Eventually, this leads to saturation of the server.
setInterval(() => {
    while (inflight < targetUsers) {
        inflight++;
        fireUser();
    }

    // Send metrics back to main thread for UI
    // inside fetch().then() handling


// periodically send stats to UI
    postMessage({type: "stats", inflight, done, errs});


    // Done counter should reset every interval (same behavior as before)
    done = 0;
}, 500);

// === Receive updates from the frontend ===
onmessage = (e: MessageEvent) => {
    if (e.data.targetUsers !== undefined) targetUsers = e.data.targetUsers;
    if (e.data.workMs !== undefined) workMs = e.data.workMs;
};
