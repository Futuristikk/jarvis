import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("done"),
      v.literal("archived"),
    ),
    goal: v.optional(v.string()),
    notes: v.optional(v.string()),
  }).index("by_status", ["status"]),

  tasks: defineTable({
    projectId: v.optional(v.id("projects")),
    type: v.union(
      v.literal("research"),
      v.literal("email"),
      v.literal("code"),
      v.literal("plan"),
    ),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("done"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    priority: v.number(),
    spec: v.string(),
    result: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_project", ["projectId"]),

  research: defineTable({
    taskId: v.id("tasks"),
    source: v.string(),
    summary: v.string(),
    raw: v.optional(v.string()),
    citations: v.array(v.string()),
  }).index("by_task", ["taskId"]),

  messages: defineTable({
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    role: v.union(
      v.literal("agent"),
      v.literal("user"),
      v.literal("system"),
      v.literal("tool"),
    ),
    content: v.string(),
  })
    .index("by_project", ["projectId"])
    .index("by_task", ["taskId"]),

  integrations: defineTable({
    provider: v.union(
      v.literal("google"),
      v.literal("github"),
      v.literal("openai"),
      v.literal("anthropic"),
    ),
    tokens: v.string(),
    scopes: v.array(v.string()),
    expiresAt: v.optional(v.number()),
  }).index("by_provider", ["provider"]),

  coding_jobs: defineTable({
    taskId: v.id("tasks"),
    spec: v.string(),
    repoTarget: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("done"),
      v.literal("failed"),
    ),
    logs: v.string(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_task", ["taskId"])
    .index("by_status", ["status"]),
});
