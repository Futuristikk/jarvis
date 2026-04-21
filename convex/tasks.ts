import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    type: v.union(
      v.literal("research"),
      v.literal("email"),
      v.literal("code"),
      v.literal("plan"),
    ),
    priority: v.optional(v.number()),
    spec: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tasks", {
      projectId: args.projectId,
      type: args.type,
      status: "queued",
      priority: args.priority ?? 0,
      spec: args.spec,
    });
  },
});

export const queued = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .order("desc")
      .take(50);
  },
});

export const byProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(200);
  },
});

export const markRunning = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { status: "running" });
  },
});

export const markDone = mutation({
  args: { id: v.id("tasks"), result: v.string() },
  handler: async (ctx, { id, result }) => {
    await ctx.db.patch(id, {
      status: "done",
      result,
      completedAt: Date.now(),
    });
  },
});

export const markFailed = mutation({
  args: { id: v.id("tasks"), error: v.string() },
  handler: async (ctx, { id, error }) => {
    await ctx.db.patch(id, {
      status: "failed",
      result: error,
      completedAt: Date.now(),
    });
  },
});
