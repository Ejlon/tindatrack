-- =====================================================================
-- TindaTrack - Database Schema
-- Multi-branch inventory & sales management for tindahan / grocery stores
--
-- Works on:  MySQL 8.0.16+  and  MariaDB 10.4+ (the one bundled with XAMPP)
-- Run with:  mysql -u root -p < database/schema.sql
--            (or open it in phpMyAdmin / MySQL Workbench and execute)
--
-- WARNING: This script DROPS and recreates every TindaTrack table.
--          Run it only on a fresh install or when you want a full reset.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS tindatrack
  CHARACTER SET utf8mb4             -- full Unicode (ñ, ₱, emoji all safe)
  COLLATE utf8mb4_unicode_ci;       -- works on both MySQL and MariaDB

USE tindatrack;

-- Drop children first, then parents, so foreign keys never block the drop.
DROP TABLE IF EXISTS sale_items;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS stock_transfers;
DROP TABLE IF EXISTS bodega_logs;
DROP TABLE IF EXISTS store_stock;
DROP TABLE IF EXISTS bodega_stock;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS branches;


-- ---------------------------------------------------------------------
-- 1. branches
--    One row per physical store. The bodega is NOT a branch; it has its
--    own table (bodega_stock) because stock there cannot be sold.
-- ---------------------------------------------------------------------
CREATE TABLE branches (
  branch_id    INT           NOT NULL AUTO_INCREMENT,
  branch_name  VARCHAR(100)  NOT NULL,
  location     VARCHAR(255)  NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (branch_id),
  UNIQUE KEY uq_branches_name (branch_name)
) ENGINE=InnoDB;


-- ---------------------------------------------------------------------
-- 2. users
--    role decides what the user can do:
--      owner   -> sees every branch + the bodega (branch_id is NULL)
--      manager -> manages ONE branch (branch_id required)
--      cashier -> sells in ONE branch (branch_id required)
--    The "branch_id required for manager/cashier" rule is enforced in the
--    API (Step 3), because MySQL does not allow a CHECK constraint on a
--    column that also has a foreign key action.
-- ---------------------------------------------------------------------
CREATE TABLE users (
  user_id        INT           NOT NULL AUTO_INCREMENT,
  name           VARCHAR(100)  NOT NULL,
  email          VARCHAR(150)  NOT NULL,
  password_hash  VARCHAR(255)  NOT NULL,             -- bcrypt hash, never the plain password
  role           ENUM('owner', 'manager', 'cashier') NOT NULL DEFAULT 'cashier',
  branch_id      INT           NULL,                 -- NULL only for owners
  is_active      TINYINT(1)    NOT NULL DEFAULT 1,   -- 0 = deactivated (can't log in, history kept)
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_branch (branch_id),

  -- You can't delete a branch that still has staff assigned to it.
  CONSTRAINT fk_users_branch
    FOREIGN KEY (branch_id) REFERENCES branches (branch_id)
    ON DELETE RESTRICT
) ENGINE=InnoDB;


-- ---------------------------------------------------------------------
-- 3. products
--    The master list of items. Prices here are the CURRENT prices;
--    sale_items keeps a copy of the price at the moment of each sale.
--    Products that already have history can't be hard-deleted, so the
--    app "archives" them with is_active = 0 instead.
-- ---------------------------------------------------------------------
CREATE TABLE products (
  product_id     INT            NOT NULL AUTO_INCREMENT,
  name           VARCHAR(150)   NOT NULL,
  category       VARCHAR(80)    NOT NULL,
  sku            VARCHAR(64)    NOT NULL,           -- your SKU code OR the scanned barcode
  cost_price     DECIMAL(10,2)  NOT NULL,           -- what you pay the supplier (per unit)
  selling_price  DECIMAL(10,2)  NOT NULL,           -- what the customer pays (per unit)
  unit           VARCHAR(20)    NOT NULL DEFAULT 'pc',  -- pc, pack, can, bottle, kg, sachet...
  is_active      TINYINT(1)     NOT NULL DEFAULT 1, -- 0 = archived (soft delete)
  created_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (product_id),
  UNIQUE KEY uq_products_sku (sku),               -- no two products share a SKU/barcode
  KEY idx_products_category (category),
  KEY idx_products_name (name),

  CONSTRAINT chk_products_cost_price    CHECK (cost_price >= 0),
  CONSTRAINT chk_products_selling_price CHECK (selling_price >= 0)
) ENGINE=InnoDB;


-- ---------------------------------------------------------------------
-- 4. bodega_stock
--    Central warehouse stock. Exactly ONE row per product.
--    This stock can't be sold; it only leaves through a transfer.
-- ---------------------------------------------------------------------
CREATE TABLE bodega_stock (
  product_id       INT       NOT NULL,
  quantity         INT       NOT NULL DEFAULT 0,
  low_stock_level  INT       NOT NULL DEFAULT 50,   -- alert when quantity <= this
  updated_at       DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (product_id),

  CONSTRAINT fk_bodega_stock_product
    FOREIGN KEY (product_id) REFERENCES products (product_id)
    ON DELETE CASCADE,

  -- Safety net: the database itself refuses to let stock go negative.
  CONSTRAINT chk_bodega_stock_quantity CHECK (quantity >= 0),
  CONSTRAINT chk_bodega_stock_level    CHECK (low_stock_level >= 0)
) ENGINE=InnoDB;


-- ---------------------------------------------------------------------
-- 5. store_stock
--    Sellable stock per branch. ONE row per (branch, product) pair.
--    The primary key starts with branch_id so "show me all stock in
--    branch X" (the most common query) is fast.
-- ---------------------------------------------------------------------
CREATE TABLE store_stock (
  product_id       INT       NOT NULL,
  branch_id        INT       NOT NULL,
  quantity         INT       NOT NULL DEFAULT 0,
  low_stock_level  INT       NOT NULL DEFAULT 10,   -- alert when quantity <= this
  updated_at       DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (branch_id, product_id),
  KEY idx_store_stock_product (product_id),

  CONSTRAINT fk_store_stock_product
    FOREIGN KEY (product_id) REFERENCES products (product_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_store_stock_branch
    FOREIGN KEY (branch_id) REFERENCES branches (branch_id)
    ON DELETE CASCADE,

  CONSTRAINT chk_store_stock_quantity CHECK (quantity >= 0),
  CONSTRAINT chk_store_stock_level    CHECK (low_stock_level >= 0)
) ENGINE=InnoDB;


-- ---------------------------------------------------------------------
-- 6. bodega_logs
--    Every movement in or out of the bodega, like a passbook.
--      type = 'in'  -> delivery from a supplier
--      type = 'out' -> transfer to a branch (the ONLY way stock leaves)
--    quantity is always positive; "type" tells the direction.
-- ---------------------------------------------------------------------
CREATE TABLE bodega_logs (
  log_id       INT            NOT NULL AUTO_INCREMENT,
  product_id   INT            NOT NULL,
  quantity     INT            NOT NULL,
  type         ENUM('in', 'out') NOT NULL,
  reference    VARCHAR(255)   NULL,       -- e.g. "DR-1001" or "TRANSFER #12 -> Poblacion Branch"
  supplier     VARCHAR(150)   NULL,       -- filled in for deliveries ('in') only
  recorded_by  INT            NOT NULL,   -- user who recorded the movement
  date         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (log_id),
  KEY idx_bodega_logs_product_date (product_id, date),
  KEY idx_bodega_logs_date (date),
  KEY idx_bodega_logs_recorded_by (recorded_by),

  -- RESTRICT = history is protected; you can't delete a product/user that has logs.
  CONSTRAINT fk_bodega_logs_product
    FOREIGN KEY (product_id) REFERENCES products (product_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_bodega_logs_user
    FOREIGN KEY (recorded_by) REFERENCES users (user_id)
    ON DELETE RESTRICT,

  CONSTRAINT chk_bodega_logs_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;


-- ---------------------------------------------------------------------
-- 7. stock_transfers
--    Bodega -> branch movements. Each transfer also writes an 'out' row
--    in bodega_logs, all inside ONE transaction (built in Step 4).
-- ---------------------------------------------------------------------
CREATE TABLE stock_transfers (
  transfer_id     INT       NOT NULL AUTO_INCREMENT,
  product_id      INT       NOT NULL,
  branch_id       INT       NOT NULL,
  quantity        INT       NOT NULL,
  transferred_by  INT       NOT NULL,
  date            DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (transfer_id),
  KEY idx_transfers_branch_date (branch_id, date),
  KEY idx_transfers_date (date),
  KEY idx_transfers_product (product_id),
  KEY idx_transfers_user (transferred_by),

  CONSTRAINT fk_transfers_product
    FOREIGN KEY (product_id) REFERENCES products (product_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_transfers_branch
    FOREIGN KEY (branch_id) REFERENCES branches (branch_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_transfers_user
    FOREIGN KEY (transferred_by) REFERENCES users (user_id)
    ON DELETE RESTRICT,

  CONSTRAINT chk_transfers_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;


-- ---------------------------------------------------------------------
-- 8. sales
--    One row per receipt / transaction at the counter.
--    The individual items live in sale_items.
-- ---------------------------------------------------------------------
CREATE TABLE sales (
  sale_id       INT            NOT NULL AUTO_INCREMENT,
  branch_id     INT            NOT NULL,
  cashier_id    INT            NOT NULL,
  total_amount  DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
  date          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (sale_id),
  KEY idx_sales_branch_date (branch_id, date),   -- per-branch daily/weekly/monthly reports
  KEY idx_sales_date (date),                     -- combined (all-branch) reports
  KEY idx_sales_cashier (cashier_id),

  CONSTRAINT fk_sales_branch
    FOREIGN KEY (branch_id) REFERENCES branches (branch_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_sales_cashier
    FOREIGN KEY (cashier_id) REFERENCES users (user_id)
    ON DELETE RESTRICT,

  CONSTRAINT chk_sales_total CHECK (total_amount >= 0)
) ENGINE=InnoDB;


-- ---------------------------------------------------------------------
-- 9. sale_items
--    The lines on a receipt. price and cost_price are SNAPSHOTS taken
--    at the moment of sale, so if you raise prices next month, last
--    month's revenue and profit reports stay correct.
--      revenue per line = quantity * price
--      COGS per line    = quantity * cost_price
--      profit per line  = revenue - COGS
-- ---------------------------------------------------------------------
CREATE TABLE sale_items (
  sale_item_id  INT            NOT NULL AUTO_INCREMENT,
  sale_id       INT            NOT NULL,
  product_id    INT            NOT NULL,
  quantity      INT            NOT NULL,
  price         DECIMAL(10,2)  NOT NULL,   -- selling price at time of sale
  cost_price    DECIMAL(10,2)  NOT NULL,   -- cost price at time of sale

  PRIMARY KEY (sale_item_id),
  KEY idx_sale_items_sale (sale_id),
  KEY idx_sale_items_product (product_id),   -- best-seller reports

  -- Deleting a sale removes its lines too (e.g. voiding a receipt).
  CONSTRAINT fk_sale_items_sale
    FOREIGN KEY (sale_id) REFERENCES sales (sale_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_sale_items_product
    FOREIGN KEY (product_id) REFERENCES products (product_id)
    ON DELETE RESTRICT,

  CONSTRAINT chk_sale_items_quantity   CHECK (quantity > 0),
  CONSTRAINT chk_sale_items_price      CHECK (price >= 0),
  CONSTRAINT chk_sale_items_cost_price CHECK (cost_price >= 0)
) ENGINE=InnoDB;
