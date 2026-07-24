import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ch.jarvis.assistant",
  appName: "Jarvis",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
