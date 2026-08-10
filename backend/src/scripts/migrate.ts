import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { assertDatabaseConfigured, query } from "../db/client.js";

const migrationsDirectory = resolve(__dirname, "../../migrations");

async function runMigrations() {
  assertDatabaseConfigured();

  await query(`
    create table if not exists schema_migrations (
      id text primary key,
      executed_at timestamptz not null default now()
    )
  `);

  const executedResult = await query<{ id: string }>("select id from schema_migrations");
  const executedIds = new Set(executedResult.rows.map((row) => row.id));
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  for (const migrationFile of migrationFiles) {
    if (executedIds.has(migrationFile)) {
      continue;
    }

    const sql = await readFile(resolve(migrationsDirectory, migrationFile), "utf8");
    await query(sql);
    await query("insert into schema_migrations (id) values ($1)", [migrationFile]);
    console.log(`Applied migration ${migrationFile}`);
  }

  console.log("Database migrations are up to date.");
}

void runMigrations();
