import { Db } from "mongodb";
import fs from "node:fs";
import find from "lodash/find";
import url from "url";

export interface MigrationConfig {
  migrationsFolder: string;
  journalCollectionName: string;
}

interface JournalFile {
  migrations: string[];
}

interface JournalEntry {
  fileName: string;
  appliedAt: string;
}

interface StatusEntry {
  fileName: string;
  appliedAt: string;
}

export class Migrator {
  private config: MigrationConfig;

  constructor(
    private db: Db,
    config?: Partial<MigrationConfig>,
  ) {
    this.config = {
      migrationsFolder: config?.migrationsFolder ?? "./migrations",
      journalCollectionName: config?.journalCollectionName ?? "migrations",
    };
  }

  async migrate() {
    const statusItems = await this.status();
    const pendingItems = statusItems.filter((i) => i.appliedAt === "PENDING");
    const migrated: string[] = [];

    const migrateItem = async (item: JournalEntry) => {
      try {
        const migration = await this.loadMigrationFile(item.fileName);
        await migration.up(this.db);
      } catch (err) {
        const error = new Error(
          `Could not migrate up ${item.fileName}: ${err.message}`,
        );
        error.stack = err.stack;
        // @ts-ignore
        error.migrated = migrated;
        throw error;
      }

      const journalCollection = this.db.collection(
        this.config.journalCollectionName,
      );
      const { fileName } = item;
      const appliedAt = new Date().toISOString();

      try {
        await journalCollection.insertOne({ fileName, appliedAt });
      } catch (err) {
        throw new Error(
          `Could not update "${this.config.journalCollectionName}" collection: ${err.message}`,
        );
      }
      migrated.push(item.fileName);
    };

    for (let i = 0; i < pendingItems.length; i++) {
      await migrateItem(pendingItems[i]);
    }

    return migrated;
  }

  async status(): Promise<StatusEntry[]> {
    const journal = this.getJournalFile();
    const journalCollection = this.db.collection(
      this.config.journalCollectionName,
    );
    const journalData = await journalCollection.find({}).toArray();

    const statusTable = await Promise.all(
      journal.migrations.map(async (fileName) => {
        let findTest = { fileName };
        const itemInLog = find(journalData, findTest);
        const appliedAt = itemInLog ? itemInLog.appliedAt : "PENDING";
        return { fileName, appliedAt };
      }),
    );

    return statusTable;
  }

  private getJournalFile() {
    const journalFile = fs.readFileSync(
      `${this.config.migrationsFolder}/meta/journal.json`,
    );
    const journal: JournalFile = JSON.parse(journalFile.toString());
    return journal;
  }

  private async loadMigrationFile(fileName: string) {
    return import(
      /* @vite-ignore */
      url.pathToFileURL(`${this.config.migrationsFolder}/${fileName}`).pathname
    );
  }
}
