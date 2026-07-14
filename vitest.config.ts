import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: { reporter: ["text", "json", "html"] },
    passWithNoTests: true,
    // Fastify readiness stays below the normal hook limit with bounded parallelism;
    // files are serialized to avoid Windows host worker starvation and Tinypool
    // teardown races; each file still uses the bounded two-worker pool.
    maxWorkers: 2,
    minWorkers: 1,
    fileParallelism: false
  }
});
