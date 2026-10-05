import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    pool: "forks",
    server: { deps: { external: [/^node:/] } },
  },
});
