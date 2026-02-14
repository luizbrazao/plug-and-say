#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Config
 */
const SESSION_KEY = process.env.SESSION_KEY ?? "agent:main:main";
const POLL_MS = Number(process.env.POLL_MS ?? "2000");
const LIMIT = Number(process.env.LIMIT ?? "10");

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function convexRun(fn, argsObj) {
    // Usa o CLI do Convex para executar queries/mutations sem precisar de API keys.
    // Requer estar no root do projeto (onde roda "npx convex ...")
    const argsJson = JSON.stringify(argsObj);

    try {
        const { stdout, stderr } = await execFileAsync(
            "npx",
            ["convex", "run", fn, argsJson],
            { maxBuffer: 1024 * 1024 }
        );

        // convex às vezes escreve warnings em stderr; não necessariamente erro fatal
        if (stderr && stderr.trim().length > 0) {
            // Mantém discreto para não poluir, mas deixa rastreável
            // console.error("[convex stderr]", stderr.trim());
        }

        const out = stdout.trim();

        // O CLI geralmente retorna JSON válido.
        // Ex: [] ou [{...}] ou {"ok":true}
        return out ? JSON.parse(out) : null;
    } catch (err) {
        // Mostra erro "humano" (muito útil quando convex dev não está rodando)
        const msg =
            err?.stderr?.toString?.() ||
            err?.stdout?.toString?.() ||
            err?.message ||
            String(err);
        throw new Error(`convex run failed (${fn}): ${msg}`);
    }
}

async function listUndeliveredFor(sessionKey, limit) {
    return await convexRun("notifications:listUndeliveredBySessionKey", {
        mentionedSessionKey: sessionKey,
        limit,
    });
}

async function markDelivered(notificationId) {
    return await convexRun("notifications:markDelivered", {
        notificationId,
    });
}

/**
 * "Entrega" atual: imprime no terminal.
 * Depois a gente troca isso por: OpenClaw sessions send / Telegram / etc.
 */
async function deliverToTerminal(notification) {
    const when = new Date(notification.createdAt).toLocaleString();
    const task = notification.taskId ? ` taskId=${notification.taskId}` : "";
    console.log(
        `\n📨 NOTIFICATION → ${notification.mentionedSessionKey}${task}\n` +
        `⏱  ${when}\n` +
        `🧾  ${notification.content}\n`
    );
    return true;
}

async function main() {
    console.log(
        `dispatcher online | session=${SESSION_KEY} | poll=${POLL_MS}ms | limit=${LIMIT}`
    );

    // loop infinito
    while (true) {
        try {
            const rows = await listUndeliveredFor(SESSION_KEY, LIMIT);

            if (Array.isArray(rows) && rows.length > 0) {
                for (const n of rows) {
                    // entrega
                    const ok = await deliverToTerminal(n);

                    // marca delivered apenas se a entrega "ok"
                    if (ok) {
                        await markDelivered(n._id);
                        console.log(`✅ marked delivered: ${n._id}`);
                    } else {
                        console.log(`⚠️ delivery failed, leaving queued: ${n._id}`);
                    }
                }
            }
        } catch (e) {
            console.error(`\n❌ dispatcher error: ${e?.message || e}\n`);
            // se convex dev não estiver rodando, evita spin louco
            await sleep(1500);
        }

        await sleep(POLL_MS);
    }
}

main();
