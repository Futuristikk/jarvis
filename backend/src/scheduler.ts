import { CronExpressionParser } from "cron-parser";
import { db, type ScheduleRow } from "./db.js";

const TZ = "Europe/Madrid";

export function nextFire(cron: string, after: Date = new Date()): Date {
  const it = CronExpressionParser.parse(cron, { currentDate: after, tz: TZ });
  return it.next().toDate();
}

export function validateCron(cron: string): string | null {
  try {
    CronExpressionParser.parse(cron, { tz: TZ });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Fire any due schedules: create a queued task for each, advance nextRunAt
 * past now (skip-overdue policy — never replay missed fires).
 */
export async function fireDueSchedules(): Promise<number> {
  const now = Date.now();
  const due = await db.schedules.due(now);
  if (due.length === 0) return 0;

  for (const sched of due) {
    try {
      await fireOne(sched, now);
    } catch (err) {
      console.error(
        `[scheduler] failed to fire ${sched.slug}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return due.length;
}

async function fireOne(sched: ScheduleRow, now: number) {
  const taskId = await db.tasks.create({
    type: "research",
    spec: sched.spec,
    contextScope: sched.contextScope,
    scheduleId: sched._id,
  });
  const next = nextFire(sched.cron, new Date(now)).getTime();
  await db.schedules.advance({
    id: sched._id,
    lastRunAt: now,
    nextRunAt: next,
    lastTaskId: taskId,
  });
  console.log(
    `[scheduler] fired ${sched.slug} → task ${taskId}; next at ${new Date(next).toISOString()}`,
  );
}
