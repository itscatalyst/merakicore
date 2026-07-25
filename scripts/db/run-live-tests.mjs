import { spawnSync } from "node:child_process";
import process from "node:process";

if (!process.env.DATABASE_URL) {
  console.error(
    "db:test-live requires DATABASE_URL pointing to a disposable PostgreSQL 16 database; the suite performs destructive migration up/down/up checks."
  );
  process.exit(2);
}

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
process.exit(result.status ?? 1);
