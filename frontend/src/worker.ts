// State
let targetUsers = 0;
let workMs = 10;
let inflight = 0;
let done = 0;
let errs = 0;

// We use user ids, to avoid issues scaling down and cleanly terminating active users if number of users decreased
let nextUserId = 1;
const activeUsers = new Set<number>();

// One simulated user loop (runs forever)
function fireUser(id: number) {
    if (!activeUsers.has(id)) {
        return;
    }
    inflight++;
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

            const duration = performance.now() - startRequest;

            // Realistic user: wait before next action
            const thinkTime = 200 + Math.random() * 300; // 200–500ms
            //console.log(`think=${thinkTime.toFixed(0)}ms, request=${duration.toFixed(0)}ms`);

            // Send response latency to UI thread (so graph can show RespTime)
            postMessage({type: "resp", duration});
            // Call method again, if not saturated
            // This simulates real user behavior
            setTimeout(() => {
                inflight--;
                if (activeUsers.has(id) && inflight < targetUsers) {
                    fireUser(id);
                }

            }, thinkTime);
        });
}

// We keep firing compute requests until we hit the target number of users.
// But every new fireUser stays alive, forever as it keeps calling itself.
// Eventually, this leads to saturation of the server.
setInterval(() => {
    while (activeUsers.size < targetUsers) {
        const id = nextUserId++;
        activeUsers.add(id);
        fireUser(id);
    }

    // REMOVE extra users if target went down
    while (activeUsers.size > targetUsers) {
        // pick any user id to deactivate
        const idToStop = activeUsers.values().next().value;
        activeUsers.delete(idToStop);
        // user loop will exit on next check
    }

    // periodically send stats to UI
    postMessage({type: "stats", inflight, done, errs});


    // Done counter should reset every interval
    done = 0;
}, 1000);

// === Receive updates from the frontend ===
self.onmessage = (e: MessageEvent) => {
    if (e.data.targetUsers !== undefined) targetUsers = e.data.targetUsers;
    if (e.data.workMs !== undefined) workMs = e.data.workMs;
};
