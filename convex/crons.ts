import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * The "Uprising" Heartbeat
 * Wakes up agents every 15 minutes to check for active tasks.
 * Usage:
 * - Iterates all departments
 * - Staggers checks to avoid rate limits
 * - Only wakes up agents with current tasks (for now)
 */
crons.interval(
    "agent-heartbeat",
    { minutes: 15 },
    internal.uprising.dispatchGlobal,
);

export default crons;
