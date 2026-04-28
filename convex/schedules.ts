import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    cron: v.string(),
    spec: v.string(),
    contextScope: v.optional(v.string()),
    nextRunAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("schedules")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existing) {
      throw new Error(`schedule slug "${args.slug}" already exists`);
    }
    return await ctx.db.insert("schedules", {
      name: args.name,
      slug: args.slug,
      cron: args.cron,
      type: "research",
      spec: args.spec,
      contextScope: args.contextScope,
      active: true,
      nextRunAt: args.nextRunAt,
    });
  },
});

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("schedules").order("desc").take(200);
  },
});

export const get = query({
  args: { id: v.id("schedules") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const due = query({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    return await ctx.db
      .query("schedules")
      .withIndex("by_active_nextRun", (q) =>
        q.eq("active", true).lte("nextRunAt", now),
      )
      .take(50);
  },
});

export const advance = mutation({
  args: {
    id: v.id("schedules"),
    lastRunAt: v.number(),
    nextRunAt: v.number(),
    lastTaskId: v.id("tasks"),
  },
  handler: async (ctx, { id, lastRunAt, nextRunAt, lastTaskId }) => {
    await ctx.db.patch(id, { lastRunAt, nextRunAt, lastTaskId });
  },
});

export const setActive = mutation({
  args: { id: v.id("schedules"), active: v.boolean() },
  handler: async (ctx, { id, active }) => {
    await ctx.db.patch(id, { active });
  },
});

export const setNextRunAt = mutation({
  args: { id: v.id("schedules"), nextRunAt: v.number() },
  handler: async (ctx, { id, nextRunAt }) => {
    await ctx.db.patch(id, { nextRunAt });
  },
});

export const remove = mutation({
  args: { id: v.id("schedules") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
