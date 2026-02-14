import { spawnSync } from "node:child_process";

const CONVEX = "npx";
const CLAW = "openclaw";
const POLL_MS = 2000;

// Session IDs reais do seu squad
const AGENTS = [
    "agent:main:main",
    "agent:developer:main",
    "agent:customer-researcher:main",
    // adicione outros quando quiser
];

function runCmd(cmd, args, inputObj) {
    const fullArgs = [...args];
    if (inputObj) {
        fullArgs.push(JSON.stringify(inputObj));
    }

    const res = spawnSync(cmd, fullArgs, { encoding: "utf-8" });

    if (res.status !== 0) {
        const err = (res.stderr || res.stdout || "").trim();
        throw new Error(err || `Command failed: ${cmd} ${fullArgs.join(" ")}`);
    }

    const out = (res.stdout || "").trim();
    if (!out) return null;

    try {
        return JSON.parse(out);
    } catch {
        return out;
    }
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Convex: lista notificações não entregues
 */
function convexListUndelivered(mentionedSessionKey, limit = 10) {
    return runCmd(
        CONVEX,
        ["convex", "run", "notifications:listUndeliveredBySessionKey", "--"],
        { mentionedSessionKey, limit }
    );
}

/**
 * Convex: marca como entregue
 */
function convexMarkDelivered(notificationId) {
    return runCmd(
        CONVEX,
        ["convex", "run", "notifications:markDelivered", "--"],
        { notificationId }
    );
}

/**
 * Envio CORRETO via OpenClaw 2026 (ACP)
 */
function clawSend(sessionId, message) {
    const res = spawnSync(
        "openclaw",
        ["agent", "--session-id", sessionId, "--message", message],
        { encoding: "utf-8" }
    );

    if (res.status !== 0) {
        const err = (res.stderr || res.stdout || "").trim();
        throw new Error(err || "openclaw agent send failed");
    }

    return true;
}


async function tickForAgent(sessionId) {
    const rows = convexListUndelivered(sessionId, 10);
    if (!Array.isArray(rows) || rows.length === 0) return;

    for (const n of rows) {
        if (!n?._id || typeof n?.content !== "string") continue;

        try {
            const payload = n.taskId
                ? `[Plug and Say]\nVocê foi mencionado na task ${n.taskId}\n\n${n.content}`
                : `[Plug and Say]\nVocê foi mencionado\n\n${n.content}`;

            clawSend(sessionId, payload);
            convexMarkDelivered(n._id);

            console.log(`Delivered -> ${sessionId} | ${n._id}`);
        } catch (e) {
            // NÃO marca como entregue se falhar
            console.warn(
                `Delivery failed -> ${sessionId} | ${n._id}: ${e.message}`
            );
        }
    }
}

async function main() {
    console.log("Notification delivery loop started.");

    while (true) {
        for (const sessionId of AGENTS) {
            try {
                await tickForAgent(sessionId);
            } catch (e) {
                console.warn(`Tick error for ${sessionId}: ${e.message}`);
            }
        }
        await sleep(POLL_MS);
    }
}

main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
});
