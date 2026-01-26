import type { ServerConfig } from "../types";
import { KEYS, migrationVersion } from "./localStorage";

interface Migration {
  version: number;
  name: string;
  run: () => void;
}

function v1_addServerTimestamps(): void {
  const servers = JSON.parse(localStorage.getItem(KEYS.SERVERS) || "[]");
  let needsMigration = false;

  const baseTimestamp = Date.now() - servers.length * 1000;

  const migrated = servers.map((server: ServerConfig, index: number) => {
    if (!server.addedAt) {
      needsMigration = true;
      return {
        ...server,
        addedAt: baseTimestamp + index * 1000,
      };
    }
    return server;
  });

  if (needsMigration) {
    localStorage.setItem(KEYS.SERVERS, JSON.stringify(migrated));
  }
}

const migrations: Migration[] = [
  {
    version: 1,
    name: "addServerTimestamps",
    run: v1_addServerTimestamps,
  },
];

const CURRENT_VERSION = 1;

export function runPendingMigrations(): void {
  const current = migrationVersion.get();
  const pending = migrations.filter((m) => m.version > current);

  if (pending.length === 0) {
    return;
  }

  for (const migration of pending) {
    try {
      migration.run();
    } catch (error) {
      console.error(`Migration ${migration.name} failed:`, error);
      throw error;
    }
  }

  migrationVersion.set(CURRENT_VERSION);
}
