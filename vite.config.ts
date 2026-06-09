import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { 
      entry: "server",
      preset: "vercel",
      middleware: [],
    },
  },
  vite: {
    ssr: {
      external: ["@tanstack/react-start"],
    },
    build: {
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
  },
});
