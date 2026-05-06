import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const dbPath = isDev
  ? path.join(process.cwd(), 'local.db')
  : path.join(app.getPath('userData'), 'pos.db');

// Ensure directory exists if not in dev
if (!isDev) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Copy local.db from resources if it doesn't exist OR is essentially empty (less than 50KB)
  const exists = fs.existsSync(dbPath);
  const size = exists ? fs.statSync(dbPath).size : 0;

  if (!exists || size < 50000) {
    const bundledDbPath = path.join(process.resourcesPath, 'local.db');
    if (fs.existsSync(bundledDbPath)) {
      console.log('Copying bundled database to:', dbPath);
      // If it exists but is too small, we might want to backup or delete first
      if (exists) fs.unlinkSync(dbPath);
      fs.copyFileSync(bundledDbPath, dbPath);
    } else {
      console.error('Bundled local.db not found at:', bundledDbPath);
    }
  }
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

/**
 * Initialize local database tables mirroring the Prisma schema
 */
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS Category (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      icon TEXT,
      sortOrder INTEGER DEFAULT 0,
      isActive INTEGER DEFAULT 1,
      syncStatus TEXT DEFAULT 'PENDING',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS Product (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      barcode TEXT UNIQUE,
      categoryId TEXT NOT NULL,
      price REAL NOT NULL,
      cost REAL DEFAULT 0,
      unit TEXT DEFAULT 'UNIDAD',
      stockQty REAL DEFAULT 0,
      minStock REAL DEFAULT 0,
      isActive INTEGER DEFAULT 1,
      isInfinite INTEGER DEFAULT 0,
      imageUrl TEXT,
      syncStatus TEXT DEFAULT 'PENDING',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (categoryId) REFERENCES Category(id)
    );

    CREATE TABLE IF NOT EXISTS Client (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      type TEXT DEFAULT 'TRABAJADOR',
      company TEXT,
      notes TEXT,
      code TEXT,
      isActive INTEGER DEFAULT 1,
      syncStatus TEXT DEFAULT 'PENDING',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS CashRegister (
      id TEXT PRIMARY KEY,
      openedAt TEXT NOT NULL,
      closedAt TEXT,
      initialAmount REAL NOT NULL,
      finalAmount REAL,
      salesCash REAL,
      salesCard REAL,
      salesSinpe REAL,
      salesTransfer REAL,
      salesCredit REAL,
      expensesTotal REAL,
      notes TEXT,
      status TEXT DEFAULT 'OPEN',
      syncStatus TEXT DEFAULT 'PENDING',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS Sale (
      id TEXT PRIMARY KEY,
      saleNumber INTEGER UNIQUE,
      date TEXT DEFAULT (datetime('now')),
      subtotal REAL NOT NULL,
      discount REAL DEFAULT 0,
      total REAL NOT NULL,
      paymentMethod TEXT NOT NULL,
      amountReceived REAL,
      change REAL,
      cashRegisterId TEXT,
      isCredit INTEGER DEFAULT 0,
      clientId TEXT,
      status TEXT DEFAULT 'COMPLETADA',
      notes TEXT,
      syncStatus TEXT DEFAULT 'PENDING',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (cashRegisterId) REFERENCES CashRegister(id),
      FOREIGN KEY (clientId) REFERENCES Client(id)
    );

    CREATE TABLE IF NOT EXISTS SaleItem (
      id TEXT PRIMARY KEY,
      saleId TEXT NOT NULL,
      productId TEXT NOT NULL,
      quantity REAL NOT NULL,
      unitPrice REAL NOT NULL,
      subtotal REAL NOT NULL,
      notes TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (saleId) REFERENCES Sale(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES Product(id)
    );

    CREATE TABLE IF NOT EXISTS Payment (
      id TEXT PRIMARY KEY,
      clientId TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL,
      reference TEXT,
      notes TEXT,
      date TEXT DEFAULT (datetime('now')),
      syncStatus TEXT DEFAULT 'PENDING',
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (clientId) REFERENCES Client(id)
    );

    CREATE TABLE IF NOT EXISTS ExpenseCategory (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS Expense (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      categoryId TEXT NOT NULL,
      supplier TEXT,
      date TEXT DEFAULT (datetime('now')),
      notes TEXT,
      cashRegisterId TEXT,
      syncStatus TEXT DEFAULT 'PENDING',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (categoryId) REFERENCES ExpenseCategory(id),
      FOREIGN KEY (cashRegisterId) REFERENCES CashRegister(id)
    );

    CREATE TABLE IF NOT EXISTS InventoryMovement (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity REAL NOT NULL,
      cost REAL,
      reference TEXT,
      notes TEXT,
      date TEXT DEFAULT (datetime('now')),
      syncStatus TEXT DEFAULT 'PENDING',
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (productId) REFERENCES Product(id)
    );

    CREATE TABLE IF NOT EXISTS BusinessConfig (
      id TEXT PRIMARY KEY DEFAULT 'default',
      name TEXT DEFAULT 'Mi Soda',
      address TEXT,
      phone TEXT,
      ticketHeader TEXT,
      ticketFooter TEXT DEFAULT '¡Gracias por su compra!',
      printerPort TEXT,
      printerModel TEXT,
      drawerEnabled INTEGER DEFAULT 1,
      modalsKeyboardEnabled INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS SyncQueue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tableName TEXT NOT NULL,
      operation TEXT NOT NULL,
      recordId TEXT NOT NULL,
      data TEXT,
      priority INTEGER DEFAULT 1,
      attempts INTEGER DEFAULT 0,
      lastAttempt TEXT,
      error TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS Employee (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'CAJERO',
      pin TEXT,
      isActive INTEGER DEFAULT 1,
      monthlySales INTEGER DEFAULT 0,
      lastResetMonth TEXT,
      syncStatus TEXT DEFAULT 'PENDING',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS EmailQueue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      attempts INTEGER DEFAULT 0,
      lastError TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `);

  // ===== Migrations for existing databases =====
  // Add email column to Client if it doesn't exist yet
  try {
    db.exec(`ALTER TABLE Client ADD COLUMN email TEXT`);
  } catch {
    // Column already exists — ignore
  }

  // Add code column to Client if it doesn't exist yet
  try {
    db.exec(`ALTER TABLE Client ADD COLUMN code TEXT`);
  } catch {
    // Column already exists — ignore
  }

  // Add gamification columns to Employee if they don't exist
  try {
    db.exec(`ALTER TABLE Employee ADD COLUMN monthlySales INTEGER DEFAULT 0`);
  } catch {
    // Already exists
  }

  try {
    db.exec(`ALTER TABLE Employee ADD COLUMN lastResetMonth TEXT`);
  } catch {
    // Already exists
  }

  try {
    db.exec(`ALTER TABLE Employee ADD COLUMN syncStatus TEXT DEFAULT 'SYNCED'`);
  } catch {
    // Already exists
  }

  try {
    db.exec(`ALTER TABLE Category ADD COLUMN syncStatus TEXT DEFAULT 'SYNCED'`);
  } catch {
    // Already exists
  }

  try {
    db.exec(`ALTER TABLE Product ADD COLUMN isInfinite INTEGER DEFAULT 0`);
  } catch {
    // Already exists
  }

  try {
    db.exec(`ALTER TABLE BusinessConfig ADD COLUMN modalsKeyboardEnabled INTEGER DEFAULT 1`);
  } catch {
    // Already exists
  }

  try {
    db.exec(`ALTER TABLE Employee ADD COLUMN activeFrom TEXT`);
  } catch {
    // Already exists
  }

  try {
    db.exec(`ALTER TABLE Employee ADD COLUMN activeTo TEXT`);
  } catch {
    // Already exists
  }
}

/**
 * Generic query function
 */
export function query(sql: string, params: any[] = []) {
  return db.prepare(sql).all(params);
}

/**
 * Generic execute function (INSERT, UPDATE, DELETE)
 */
export function execute(sql: string, params: any[] = []) {
  return db.prepare(sql).run(params);
}

/**
 * Get a single record
 */
export function get(sql: string, params: any[] = []) {
  return db.prepare(sql).get(params);
}

/**
 * Transaction wrapper
 */
export function transaction(fn: () => void) {
  return db.transaction(fn)();
}

export default db;
