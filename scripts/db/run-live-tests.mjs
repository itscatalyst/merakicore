import { spawnSync } from "node:child_process";
import process from "node:process";

const required = ["DATABASE_URL", "MERAKI_APP_DATABASE_PASSWORD", "MERAKI_WORKER_DATABASE_PASSWORD"];
const missing = required.filter((name) => !process.env[name]);

if (process.env.MERAKI_DISPOSABLE_DATABASE !== "1") {
  console.error(
    "db:test-live is destructive and requires MERAKI_DISPOSABLE_DATABASE=1 for an explicitly disposable PostgreSQL 16 database."
  );
  process.exitCode = 2;
} else if (missing.length > 0) {
  console.error(`db:test-live requires environment variables: ${missing.join(", ")}`);
  process.exitCode = 2;
} else {
  const vitest = process.platform === "win32" ? "node_modules\\.bin\\vitest.cmd" : "node_modules/.bin/vitest";
  const result = spawnSync(
    vitest,
    ["run", "packages/db/src/live-postgres.test.ts", "--pool=threads", "--maxWorkers=1", "--reporter=verbose"],
    {
      env: { ...process.env, MERAKI_REQUIRE_LIVE_DB: "1" },
      shell: process.platform === "win32",
      stdio: "inherit"
    }
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
