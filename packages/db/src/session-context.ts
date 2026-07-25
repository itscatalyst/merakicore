export interface DatabaseSessionContext {
  readonly tenantId: string;
  readonly subjectId: string;
  readonly actorId: string;
  readonly sessionId: string;
  readonly scopes: readonly string[];
}

export interface QueryResult<Row extends object = Record<string, unknown>> {
  readonly rows: readonly Row[];
  readonly rowCount: number | null;
}

export interface TransactionClient {
  query<Row extends object = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<Row>>;
  release(): void;
}

export interface TransactionPool {
  connect(): Promise<TransactionClient>;
}

export interface DatabaseSession {
  transaction<Result>(
    context: DatabaseSessionContext,
    operation: (client: TransactionClient) => Promise<Result>
  ): Promise<Result>;
}

export type RuntimeDatabaseRole = "meraki_app" | "meraki_worker";

/**
 * Establishes authority as transaction-local PostgreSQL settings before any
 * tenant-owned query executes. Request payloads never participate in this step.
 */
export class PostgresDatabaseSession implements DatabaseSession {
  public constructor(
    private readonly pool: TransactionPool,
    private readonly role: RuntimeDatabaseRole = "meraki_app"
  ) {
    if (role !== "meraki_app" && role !== "meraki_worker") {
      throw new Error("Unsupported runtime database role");
    }
  }

  public async transaction<Result>(
    context: DatabaseSessionContext,
    operation: (client: TransactionClient) => Promise<Result>
  ): Promise<Result> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL ROLE ${this.role}`);
      await client.query(
        `SELECT
           set_config('meraki.tenant_id', $1, true),
           set_config('meraki.subject_id', $2, true),
           set_config('meraki.actor_id', $3, true),
           set_config('meraki.session_id', $4, true),
           set_config('meraki.scopes', $5, true)`,
        [context.tenantId, context.subjectId, context.actorId, context.sessionId, JSON.stringify([...context.scopes])]
      );
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
