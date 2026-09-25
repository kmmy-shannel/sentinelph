// Temporary debug script — run inside the app's JS context via a screen.
// Simplest: paste this into ProfileScreen's load() temporarily OR add a
// button that calls it. Output appears in the Metro terminal.

import * as SQLite from 'expo-sqlite';

export async function debugReports() {
  try {
    const db = await SQLite.openDatabaseAsync('sentinelph.db');

    // 1) List all tables
    const tables = await db.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    console.log('[debug] tables:', tables.map(t => t.name));

    // 2) Show the reports table schema
    const cols = await db.getAllAsync('PRAGMA table_info(reports)');
    console.log('[debug] reports columns:', cols.map(c => c.name));

    // 3) Show the row count
    const count = await db.getFirstAsync('SELECT COUNT(*) as n FROM reports');
    console.log('[debug] reports count:', count?.n);

    // 4) Show the first 3 rows, key fields only
    const rows = await db.getAllAsync(
      'SELECT localId, scamType, syncAttempts, synced, createdAt FROM reports LIMIT 3'
    );
    console.log('[debug] first rows:', rows);

    // 5) Try the exact query getAllReports() would run
    const all = await db.getAllAsync('SELECT * FROM reports ORDER BY createdAt DESC');
    console.log('[debug] getAllReports equivalent:', all.length, 'rows');
    if (all.length > 0) {
      console.log('[debug] row 0 keys:', Object.keys(all[0]));
    }
  } catch (err) {
    console.error('[debug] ERROR:', err?.message, err?.stack);
  }
}