declare module "node:sqlite" {
  type SQLInputValue = string | number | bigint | null | Uint8Array;

  export class StatementSync {
    all(...params: SQLInputValue[]): Record<string, unknown>[];
    get(...params: SQLInputValue[]): Record<string, unknown> | undefined;
    run(...params: SQLInputValue[]): { changes: number; lastInsertRowid: number | bigint };
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
