import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const insert = mutation({
  args: {
    taskId: v.id("tasks"),
    source: v.string(),
    summary: v.string(),
    raw: v.optional(v.string()),
    citations: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("research", args);
  },
});

export const byTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    return await ctx.db
      .query("research")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .order("desc")
      .take(50);
  },
});
