import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    optimizeDeps: {
      exclude: [
        "@tanstack/react-start",
        "@tanstack/react-start/server",
        "@tanstack/react-start/server-entry",
        "@tanstack/start-client-core",
        "@tanstack/start-plugin-core",
        "@tanstack/start-server-core",
      ],
    },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
