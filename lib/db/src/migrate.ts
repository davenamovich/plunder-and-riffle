import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "path";
import fs from "fs";

function findMigrationsFolder(): string {
  // Walk up from cwd to find the project root (contains pnpm-workspace.yaml)
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const marker = path.join(dir, "pnpm-workspace.yaml");
    if (fs.existsSync(marker)) {
      return path.join(dir, "lib/db/drizzle");
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: assume cwd is project root
  return path.join(process.cwd(), "lib/db/drizzle");
}

export async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for migrations");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  const migrationsFolder = findMigrationsFolder();

  console.log("[db] running migrations from", migrationsFolder);
  await migrate(db, { migrationsFolder });
  console.log("[db] migrations complete");

  await pool.end();
}
