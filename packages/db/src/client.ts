import { Pool, PoolClient, QueryResultRow } from "pg";

export class Db {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = []
  ): Promise<T[]> {
    const result = await this.pool.query<T>(text, values);
    return result.rows;
  }

  async queryTenant<T extends QueryResultRow = QueryResultRow>(
    tenantId: string,
    text: string,
    values: unknown[] = []
  ): Promise<T[]> {
    return this.tx(async (client) => {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await client.query<T>(text, values);
      return result.rows;
    });
  }

  async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const value = await fn(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
