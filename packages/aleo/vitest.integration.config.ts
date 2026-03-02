import { defineConfig, loadEnv } from "vitest/config";

export default defineConfig(({ mode }) => ({
  test: {
    env: loadEnv(mode, process.cwd(), ""),
    include: ["test/**/*.integration.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
}));
