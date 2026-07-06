import { describe, expect, it } from "vitest";
import { getSchedulePanelItems, type ScheduledTask } from "./task-filter";

function task(id: string, nextFireAt: string | null, enabled = true): ScheduledTask {
  return {
    id,
    title: id,
    prompt: "Run",
    enabled,
    schedule: { kind: "daily", timeOfDay: "08:00" },
    nextFireAt,
  };
}

describe("getSchedulePanelItems", () => {
  it("shows today's remaining tasks first", () => {
    const now = new Date("2026-07-06T10:00:00.000+08:00");
    const result = getSchedulePanelItems([
      task("tomorrow", "2026-07-07T01:00:00.000+08:00"),
      task("today", "2026-07-06T12:00:00.000+08:00"),
    ], now);

    expect(result.mode).toBe("today");
    expect(result.totalCount).toBe(1);
    expect(result.items.map(item => item.id)).toEqual(["today"]);
  });

  it("falls back to upcoming tasks when nothing remains today", () => {
    const now = new Date("2026-07-06T10:00:00.000+08:00");
    const result = getSchedulePanelItems([
      task("past-today", "2026-07-06T08:00:00.000+08:00"),
      task("tomorrow", "2026-07-07T08:00:00.000+08:00"),
    ], now);

    expect(result.mode).toBe("upcoming");
    expect(result.totalCount).toBe(1);
    expect(result.items.map(item => item.id)).toEqual(["tomorrow"]);
  });

  it("ignores disabled tasks and invalid dates", () => {
    const now = new Date("2026-07-06T10:00:00.000+08:00");
    const result = getSchedulePanelItems([
      task("disabled", "2026-07-06T12:00:00.000+08:00", false),
      task("invalid", "not-a-date"),
    ], now);

    expect(result.mode).toBe("empty");
    expect(result.totalCount).toBe(0);
    expect(result.items).toEqual([]);
  });
});
