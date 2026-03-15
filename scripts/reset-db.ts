import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "jobs", "gemlink.db");

if (fs.existsSync(DB_PATH)) {
  const db = new Database(DB_PATH);
  
  // Clear all relevant tables for the library
  db.exec(`
    DELETE FROM media_jobs;
    DELETE FROM compose_jobs;
    DELETE FROM collection_items;
    DELETE FROM collections;
    DELETE FROM strategy_artifacts;
  `);
  
  console.log("Database cleared successfully.");
} else {
  console.log("No database found at", DB_PATH);
}
