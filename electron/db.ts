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
db.pragma('foreign_keys = ON');

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

    -- Ensure system category exists
    INSERT OR IGNORE INTO Category (id, name, type, isActive, syncStatus) 
    VALUES ('system', 'Sistema', 'PRODUCTO', 1, 'SYNCED');

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

    -- Ensure credit-charge system product exists (categoryId NULL — no FK needed)
    INSERT OR IGNORE INTO Product (id, name, categoryId, price, isActive, isInfinite, syncStatus)
    VALUES ('credit-charge', 'Cargo a cuenta', NULL, 0, 1, 1, 'SYNCED');

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
      syncStatus TEXT DEFAULT 'SYNCED',
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

    CREATE TABLE IF NOT EXISTS Subcategory (
      id TEXT PRIMARY KEY,
      categoryId TEXT NOT NULL,
      name TEXT NOT NULL,
      showDays TEXT DEFAULT NULL,
      sortOrder INTEGER DEFAULT 0,
      isActive INTEGER DEFAULT 1,
      syncStatus TEXT DEFAULT 'PENDING',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (categoryId) REFERENCES Category(id)
    );

    CREATE TABLE IF NOT EXISTS ProductSubcategory (
      productId TEXT NOT NULL,
      subcategoryId TEXT NOT NULL,
      PRIMARY KEY (productId, subcategoryId)
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

    CREATE TABLE IF NOT EXISTS Sorteo (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'RULETA',
      status TEXT DEFAULT 'DRAFT',
      startAt TEXT,
      endAt TEXT,
      minSpinsBetweenPrizes INTEGER DEFAULT 8,
      syncStatus TEXT DEFAULT 'PENDING',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS SorteoOption (
      id TEXT PRIMARY KEY,
      sorteoId TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      quantity INTEGER,
      quantityRemaining INTEGER,
      baseProbability REAL NOT NULL,
      isFiller INTEGER DEFAULT 0,
      color TEXT,
      sortOrder INTEGER DEFAULT 0,
      syncStatus TEXT DEFAULT 'PENDING',
      FOREIGN KEY (sorteoId) REFERENCES Sorteo(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS SorteoParticipant (
      id TEXT PRIMARY KEY,
      sorteoId TEXT NOT NULL,
      type TEXT NOT NULL,
      refId TEXT NOT NULL,
      syncStatus TEXT DEFAULT 'PENDING',
      FOREIGN KEY (sorteoId) REFERENCES Sorteo(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS SorteoEntry (
      id TEXT PRIMARY KEY,
      sorteoId TEXT NOT NULL,
      saleId TEXT,
      participatedAt TEXT DEFAULT (datetime('now')),
      didParticipate INTEGER DEFAULT 0,
      unitCount INTEGER DEFAULT 1,
      resultOptionId TEXT,
      syncStatus TEXT DEFAULT 'PENDING',
      FOREIGN KEY (sorteoId) REFERENCES Sorteo(id)
    );

    CREATE TABLE IF NOT EXISTS "Return" (
      id TEXT PRIMARY KEY,
      returnNumber INTEGER,
      originalSaleId TEXT,
      type TEXT DEFAULT 'DEVOLUCION',
      cashRegisterId TEXT,
      netCash REAL NOT NULL DEFAULT 0,
      employeeName TEXT,
      notes TEXT,
      date TEXT DEFAULT (datetime('now')),
      syncStatus TEXT DEFAULT 'PENDING',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (originalSaleId) REFERENCES Sale(id),
      FOREIGN KEY (cashRegisterId) REFERENCES CashRegister(id)
    );

    CREATE TABLE IF NOT EXISTS ReturnItem (
      id TEXT PRIMARY KEY,
      returnId TEXT NOT NULL,
      direction TEXT NOT NULL,
      productId TEXT NOT NULL,
      quantity REAL NOT NULL,
      unitPrice REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (returnId) REFERENCES "Return"(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES Product(id)
    );

    CREATE TABLE IF NOT EXISTS CashAdjustment (
      id TEXT PRIMARY KEY,
      cashRegisterId TEXT NOT NULL,
      direction TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT,
      employeeName TEXT,
      date TEXT DEFAULT (datetime('now')),
      syncStatus TEXT DEFAULT 'PENDING',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (cashRegisterId) REFERENCES CashRegister(id)
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

  try {
    db.exec(`ALTER TABLE Product ADD COLUMN isDeleted INTEGER DEFAULT 0`);
  } catch {
    // Already exists
  }

  try {
    db.exec(`ALTER TABLE Sale ADD COLUMN paymentMethod2 TEXT`);
  } catch {}

  // Cleanup: Fix broken SaleItems from mixed payments that used temp UUIDs
  try {
    db.exec(`
      UPDATE SaleItem 
      SET productId = 'credit-charge' 
      WHERE productId LIKE 'credit-ref-%'
    `);
  } catch (err) {
    console.error('[Migration] Failed to cleanup SaleItems:', err);
  }

  try {
    db.exec(`ALTER TABLE Sale ADD COLUMN amount2 REAL`);
  } catch {}

  try {
    db.exec(`ALTER TABLE Product ADD COLUMN subcategoryId TEXT`);
  } catch {
    // Already exists
  }

  // Migrate existing subcategoryId → ProductSubcategory junction table
  try {
    db.exec(`
      INSERT OR IGNORE INTO ProductSubcategory (productId, subcategoryId)
      SELECT id, subcategoryId FROM Product
      WHERE subcategoryId IS NOT NULL AND subcategoryId != ''
    `);
  } catch {
    // Already migrated or table missing
  }

  // Migrate Sale.date from UTC ISO (with Z) to local ISO (no Z)
  try {
    const tzOffset = new Date().getTimezoneOffset()
    const rows = db.prepare(
      "SELECT id, date FROM Sale WHERE date LIKE '%Z' OR date LIKE '%+00:00%'"
    ).all() as { id: string; date: string }[]
    const stmt = db.prepare('UPDATE Sale SET date = ? WHERE id = ?')
    for (const row of rows) {
      try {
        const d = new Date(row.date)
        const localMs = d.getTime() - tzOffset * 60000
        const localISO = new Date(localMs).toISOString().replace('Z', '')
        stmt.run(localISO, row.id)
      } catch {}
    }
  } catch {}

  try {
    db.exec(`ALTER TABLE Sorteo ADD COLUMN minSpinsBetweenPrizes INTEGER DEFAULT 8`);
  } catch {
    // Already exists
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS SyncError (
        id TEXT PRIMARY KEY,
        tableName TEXT NOT NULL,
        recordId TEXT NOT NULL,
        errorMsg TEXT NOT NULL,
        attempts INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT (datetime('now')),
        lastAttemptAt TEXT DEFAULT (datetime('now'))
      )
    `);
  } catch {}

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS SorteoWinner (
        id TEXT PRIMARY KEY,
        sorteoId TEXT NOT NULL,
        optionId TEXT NOT NULL,
        optionLabel TEXT NOT NULL,
        optionColor TEXT,
        wonAt TEXT DEFAULT (datetime('now')),
        syncStatus TEXT DEFAULT 'PENDING',
        FOREIGN KEY (sorteoId) REFERENCES Sorteo(id)
      )
    `);
  } catch {}

  // Corrective migration: normalize CashRegister timestamps to UTC ISO with Z
  // Handles: no-Z ISO strings ("...T...") and SQLite format ("YYYY-MM-DD HH:MM:SS" with space)
  try {
    const cols = ['openedAt', 'closedAt', 'updatedAt'] as const
    for (const col of cols) {
      // ISO format with T but no Z → append Z
      db.prepare(
        `UPDATE CashRegister SET ${col} = ${col} || 'Z'
         WHERE ${col} IS NOT NULL
           AND ${col} NOT LIKE '%Z'
           AND ${col} NOT LIKE '%+%'
           AND ${col} LIKE '%T%'`
      ).run()
      // SQLite space format "YYYY-MM-DD HH:MM:SS" → convert to ISO UTC with Z
      db.prepare(
        `UPDATE CashRegister SET ${col} = SUBSTR(${col}, 1, 10) || 'T' || SUBSTR(${col}, 12) || 'Z'
         WHERE ${col} IS NOT NULL
           AND ${col} NOT LIKE '%T%'
           AND ${col} NOT LIKE '%Z'
           AND ${col} NOT LIKE '%+%'
           AND LENGTH(${col}) >= 19`
      ).run()
    }
  } catch {}

  try {
    db.exec(`ALTER TABLE Sale ADD COLUMN paidAt TEXT`);
  } catch {}

  try {
    db.exec(`ALTER TABLE Client ADD COLUMN cedula TEXT`);
  } catch {}

  try {
    db.exec(`ALTER TABLE Sale ADD COLUMN modifiedFromSaleId TEXT`);
  } catch {}

  try {
    db.exec(`ALTER TABLE SaleItem ADD COLUMN notes TEXT`);
  } catch {}

  // Fix credit-charge: remove invalid categoryId='system' so it won't block category deletes or fail FK on sync
  try {
    db.exec(`UPDATE Product SET categoryId = NULL, syncStatus = 'SYNCED' WHERE id = 'credit-charge' AND categoryId IS NOT NULL`);
  } catch {}

  try {
    db.exec(`ALTER TABLE BusinessConfig ADD COLUMN syncStatus TEXT DEFAULT 'SYNCED'`);
  } catch {}

  try {
    db.exec(`ALTER TABLE Category ADD COLUMN isDeleted INTEGER DEFAULT 0`);
  } catch {}

  try {
    db.exec(`ALTER TABLE BusinessConfig ADD COLUMN emailLogoUrl TEXT`);
  } catch {}

  try {
    db.exec(`ALTER TABLE BusinessConfig ADD COLUMN ticketLogoUrl TEXT`);
  } catch {}

  // ===== Performance Indexes =====
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sale_cash_register ON Sale(cashRegisterId);
    CREATE INDEX IF NOT EXISTS idx_sale_date ON Sale(date);
    CREATE INDEX IF NOT EXISTS idx_sale_payment_method ON Sale(paymentMethod);
    CREATE INDEX IF NOT EXISTS idx_sale_item_sale_id ON SaleItem(saleId);
    CREATE INDEX IF NOT EXISTS idx_sale_item_product_id ON SaleItem(productId);
    CREATE INDEX IF NOT EXISTS idx_inventory_movement_product_id ON InventoryMovement(productId);
    CREATE INDEX IF NOT EXISTS idx_cash_adjustment_register ON CashAdjustment(cashRegisterId);
    CREATE INDEX IF NOT EXISTS idx_expense_register ON Expense(cashRegisterId);
  `);
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

/**
 * Execute multiple SQL operations atomically in a single transaction.
 * If any operation fails the whole batch is rolled back.
 */
export function executeMany(ops: Array<{ sql: string; params: any[] }>) {
  return db.transaction(() => {
    for (const op of ops) {
      db.prepare(op.sql).run(op.params);
    }
  })();
}

export default db;
