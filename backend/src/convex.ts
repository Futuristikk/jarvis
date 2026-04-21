import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL;
if (!url) {
  throw new Error("CONVEX_URL env var is required");
}

export const convex = new ConvexHttpClient(url);
