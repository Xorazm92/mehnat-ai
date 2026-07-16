import { defineConfig } from "vitest/config";
import path from "node:path";
import dotenv from "dotenv";

// next dev/build load these automatically; vitest does not.
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Integration tests share one Postgres; parallel files would race on fixtures.
    fileParallelism: false,
    testTimeout: 30_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
