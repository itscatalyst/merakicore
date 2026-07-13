import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import pg from "pg";

const direction = process.argv[2];
if (direction !== "up" && direction !== "down") {
  throw new Error("Usage: migrate <up|down>");
}

const connectionString = process.env["DATABASE_URL"];
if (connectionString === undefined) {
  throw new Error("DATABASE_URL is required");
}

const migrationsDirectory = resolve(process.cwd(), "migrations");
const suffix = `.${direction}.sql`;
const files = (await readdir(migrationsDirectory))
  .filter((file) => file.endsWith(suffix))
  .sort((left, right) => left.localeCompare(right));
if (direction === "down") files.reverse();

const client = new pg.Client({ connectionString });
await client.connect();
try {
  for (const file of files) {
    const sql = await readFile(resolve(migrationsDirectory, file), "utf8");
    await client.query(sql);
  }
} finally {
  await client.end();
}
