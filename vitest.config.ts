import { defineConfig } from "vitest/config";
import path from "node:path";
import dotenv from "dotenv";

// next dev/build load these automatically; vitest does not.
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

export default defineConfig({
  test: {
    environment: "node",
    // test/**/*.test.ts  → integration tests that share one Postgres.
    // bot/**/*.spec.ts    → pure, DB-free domain unit tests (DDD domain layer).
    // lib/**/*.spec.ts    → pure, DB-free helpers shared by the app and the bot.
    include: ["test/**/*.test.ts", "bot/**/*.spec.ts", "lib/**/*.spec.ts"],
    // Integration tests share one Postgres; parallel files would race on fixtures.
    fileParallelism: false,
    testTimeout: 30_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
