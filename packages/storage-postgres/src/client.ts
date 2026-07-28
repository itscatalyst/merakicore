import postgres from "postgres";

export type SqlRow = Readonly<Record<string, unknown>>;

/**
 * Deliberately small SQL seam. Tests inject a transactional implementation;
 * production wraps postgres.js without leaking its large generic surface into
 * the storage contract.
 */
export interface SqlExecutor {
  query<Row extends SqlRow = SqlRow>(statement: string, parameters?: readonly unknown[]): Promise<readonly Row[]>;
}

export interface TransactionalSqlClient extends SqlExecutor {
  transaction<T>(operation: (transaction: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export type PostgresClientOptions = Readonly<{
  maxConnections?: number;
  idleTimeoutSeconds?: number;
  connectTimeoutSeconds?: number;
  /**
   * Hosted connections require TLS by default. `false` exists only for
   * explicitly selected local/in-process Postgres test servers.
   */
  ssl?: "require" | false;
}>;

type UnsafePostgresClient = Readonly<{
  unsafe(statement: string, parameters?: readonly unknown[]): Promise<unknown>;
}>;

const executorFor = (sql: UnsafePostgresClient): SqlExecutor => ({
  async query<Row extends SqlRow = SqlRow>(
    statement: string,
    parameters: readonly unknown[] = []
  ): Promise<readonly Row[]> {
    return (await sql.unsafe(statement, parameters)) as readonly Row[];
  }
});

/**
 * Creates a server-runtime Postgres client.
 *
 * `prepare: false` is non-negotiable: Supabase transaction-mode poolers do not
 * preserve connection-local prepared statements between transactions.
 * One connection per serverless instance avoids multiplying the database
 * connection budget as instances scale; persistent callers can opt in higher.
 */
export const createPostgresClient = (
  connectionString: string,
  options: PostgresClientOptions = {}
): TransactionalSqlClient => {
  if (!connectionString.trim()) throw new Error("DATABASE_URL_REQUIRED");
  const sql = postgres(connectionString, {
    prepare: false,
    max: options.maxConnections ?? 1,
    idle_timeout: options.idleTimeoutSeconds ?? 20,
    connect_timeout: options.connectTimeoutSeconds ?? 10,
    ssl: options.ssl ?? "require"
  });
  const root = executorFor(sql);
  return {
    query: <Row extends SqlRow = SqlRow>(statement: string, parameters?: readonly unknown[]): Promise<readonly Row[]> =>
      root.query<Row>(statement, parameters),
    transaction: async <T>(operation: (transaction: SqlExecutor) => Promise<T>): Promise<T> =>
      (await sql.begin(async (transaction) =>
        operation(executorFor(transaction as unknown as UnsafePostgresClient))
      )) as unknown as T,
    close: async (): Promise<void> => {
      await sql.end({ timeout: 5 });
    }
  };
};
