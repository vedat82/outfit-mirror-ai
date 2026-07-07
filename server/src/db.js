import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultPath = path.resolve(__dirname, '../data/outfits.db');
const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || defaultPath);
const clothesTypeCheck = "'top', 'tshirt', 'shirt', 'long sleeve', 'jacket', 'bottom', 'pants', 'shoes'";

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

function addColumnIfMissing(tableName, columnName, columnSql) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql};`);
  }
}

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clothes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'legacy-user',
      type TEXT NOT NULL CHECK (type IN (${clothesTypeCheck})),
      color TEXT NOT NULL,
      season TEXT NOT NULL CHECK (season IN ('spring', 'summer', 'fall', 'winter', 'all')),
      style TEXT NOT NULL DEFAULT 'casual',
      image_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const createTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'clothes'").get()?.sql;
  const columns = db.prepare("PRAGMA table_info(clothes)").all();
  const hasUserId = columns.some((column) => column.name === 'user_id');
  const hasStyle = columns.some((column) => column.name === 'style');
  const hasImageUrl = columns.some((column) => column.name === 'image_url');

  if (!hasUserId) {
    db.exec("ALTER TABLE clothes ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy-user';");
  }

  if (!hasStyle) {
    db.exec("ALTER TABLE clothes ADD COLUMN style TEXT NOT NULL DEFAULT 'casual';");
  }

  if (!hasImageUrl) {
    db.exec('ALTER TABLE clothes ADD COLUMN image_url TEXT;');
  }

  if (createTableSql && (!createTableSql.includes("'tshirt'") || !createTableSql.includes("'shirt'") || !createTableSql.includes("'pants'"))) {
    db.exec(`
      ALTER TABLE clothes RENAME TO clothes_old;

      CREATE TABLE clothes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT 'legacy-user',
        type TEXT NOT NULL CHECK (type IN (${clothesTypeCheck})),
        color TEXT NOT NULL,
        season TEXT NOT NULL CHECK (season IN ('spring', 'summer', 'fall', 'winter', 'all')),
        style TEXT NOT NULL DEFAULT 'casual',
        image_url TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO clothes (id, user_id, type, color, season, style, image_url, created_at)
      SELECT id, user_id, type, color, season, style, image_url, created_at
      FROM clothes_old;

      DROP TABLE clothes_old;
    `);
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_clothes_user_id ON clothes (user_id);');

  db.exec(`
    CREATE TABLE IF NOT EXISTS outfit_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      top_id INTEGER,
      top_type TEXT NOT NULL,
      top_color TEXT NOT NULL,
      bottom_id INTEGER,
      bottom_type TEXT NOT NULL,
      bottom_color TEXT NOT NULL,
      shoes_id INTEGER,
      shoes_type TEXT NOT NULL,
      shoes_color TEXT NOT NULL,
      liked INTEGER NOT NULL CHECK (liked IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_outfit_feedback_user_id ON outfit_feedback (user_id, created_at);');

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_access (
      user_id TEXT PRIMARY KEY,
      is_premium INTEGER NOT NULL DEFAULT 0 CHECK (is_premium IN (0, 1)),
      premium_plan TEXT,
      premium_source TEXT,
      platform TEXT,
      premium_started_at TEXT,
      subscription_started_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  addColumnIfMissing('user_access', 'platform', 'platform TEXT');
  addColumnIfMissing('user_access', 'subscription_started_at', 'subscription_started_at TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'web',
      payment_source TEXT NOT NULL DEFAULT 'iyzico',
      token TEXT UNIQUE,
      conversation_id TEXT NOT NULL UNIQUE,
      plan TEXT NOT NULL,
      amount TEXT NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      payment_page_url TEXT,
      raw_result TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  addColumnIfMissing('payment_sessions', 'platform', "platform TEXT NOT NULL DEFAULT 'web'");
  addColumnIfMissing('payment_sessions', 'payment_source', "payment_source TEXT NOT NULL DEFAULT 'iyzico'");

  db.exec('CREATE INDEX IF NOT EXISTS idx_payment_sessions_user_id ON payment_sessions (user_id, created_at);');

  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'web',
      payment_source TEXT NOT NULL DEFAULT 'iyzico',
      token TEXT,
      conversation_id TEXT,
      plan TEXT NOT NULL,
      amount TEXT NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      raw_result TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  addColumnIfMissing('payment_records', 'platform', "platform TEXT NOT NULL DEFAULT 'web'");
  addColumnIfMissing('payment_records', 'payment_source', "payment_source TEXT NOT NULL DEFAULT 'iyzico'");

  db.exec('CREATE INDEX IF NOT EXISTS idx_payment_records_user_id ON payment_records (user_id, created_at);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_payment_records_token ON payment_records (token);');

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      usage_date TEXT NOT NULL,
      access_tier TEXT NOT NULL,
      task_type TEXT NOT NULL,
      model_tier TEXT NOT NULL,
      credits INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON ai_usage (user_id, usage_date);');

  db.exec(`
    CREATE TABLE IF NOT EXISTS see_on_me_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      usage_date TEXT NOT NULL,
      access_tier TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_see_on_me_usage_user_date ON see_on_me_usage (user_id, usage_date);');

  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_looks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      preview_image_url TEXT NOT NULL,
      user_photo_image_url TEXT,
      outfit_json TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_saved_looks_user_id ON saved_looks (user_id, created_at);');

  db.exec(`
    CREATE TABLE IF NOT EXISTS background_removal_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      image_hash TEXT NOT NULL,
      provider TEXT NOT NULL,
      output_image_url TEXT NOT NULL,
      input_bytes INTEGER NOT NULL DEFAULT 0,
      output_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, image_hash)
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_background_removal_cache_user_id ON background_removal_cache (user_id, created_at);');
}

initDb();
