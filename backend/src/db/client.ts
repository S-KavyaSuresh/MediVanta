import { createRequire } from "node:module";

import { env } from "../config/env.js";

type QueryResultRow = Record<string, unknown>;

type QueryResult<T extends QueryResultRow = QueryResultRow> = {
  rows: T[];
};

type Queryable = {
  query: <T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => Promise<QueryResult<T>>;
  release?: () => void;
};

type PoolLike = Queryable & {
  connect: () => Promise<Queryable>;
  end: () => Promise<void>;
};

const runtimeRequire = createRequire(__filename);

let poolPromise: Promise<PoolLike> | null = null;

function getPoolFactory() {
  return runtimeRequire("pg") as {
    Pool: new (config: { connectionString: string }) => PoolLike;
  };
}

export function isDatabaseConfigured() {
  return Boolean(env.DATABASE_URL);
}

export function assertDatabaseConfigured() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured. Add it to backend/.env before starting the backend.");
  }
}

export async function getPool() {
  assertDatabaseConfigured();

  if (!poolPromise) {
    poolPromise = Promise.resolve().then(() => {
      const { Pool } = getPoolFactory();
      return new Pool({
        connectionString: env.DATABASE_URL!,
      });
    });
  }

  return poolPromise;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
) {
  const pool = await getPool();
  return pool.query<T>(sql, params);
}

export async function withTransaction<T>(callback: (client: Queryable) => Promise<T>) {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release?.();
  }
}

export async function getDatabaseHealth() {
  if (!isDatabaseConfigured()) {
    return {
      configured: false,
      status: "not configured" as const,
    };
  }

  try {
    await query("select 1 as ok");
    return {
      configured: true,
      status: "connected" as const,
    };
  } catch {
    return {
      configured: true,
      status: "unavailable" as const,
    };
  }
}
