-- =====================================================================
-- TindaTrack - Sample Seed Data
-- Run AFTER schema.sql:   mysql -u root -p < database/seed.sql
-- Safe to re-run: it empties every table first.
--
-- DEMO LOGINS (all accounts use the password:  Password123!)
--   owner@tindatrack.test               Owner   - all branches + bodega
--   manager.poblacion@tindatrack.test   Manager - Poblacion Branch
--   cashier.poblacion@tindatrack.test   Cashier - Poblacion Branch
--   manager.sanroque@tindatrack.test    Manager - San Roque Branch
--   cashier.sanroque@tindatrack.test    Cashier - San Roque Branch
--   Change these passwords before using the system for real.
--
-- HOW THE STORY FITS TOGETHER
--   Suppliers deliver to the bodega  ->  the owner transfers stock to
--   each branch  ->  cashiers sell from their branch's store stock.
--   All dates are RELATIVE to the day you run this file (e.g. "25 days
--   ago"), so the dashboard always has fresh daily/weekly/monthly data.
--   Final stock numbers are CALCULATED from the history at the end,
--   so bodega + transfers + sales always add up exactly.
-- =====================================================================

USE tindatrack;
SET NAMES utf8mb4;   -- make sure special characters (like the é in Nescafé) import correctly

-- ---------------------------------------------------------------------
-- 0. Start clean (TRUNCATE also resets AUTO_INCREMENT counters to 1)
-- ---------------------------------------------------------------------
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE sale_items;
TRUNCATE TABLE sales;
TRUNCATE TABLE stock_transfers;
TRUNCATE TABLE bodega_logs;
TRUNCATE TABLE store_stock;
TRUNCATE TABLE bodega_stock;
TRUNCATE TABLE products;
TRUNCATE TABLE users;
TRUNCATE TABLE branches;
SET FOREIGN_KEY_CHECKS = 1;


-- ---------------------------------------------------------------------
-- 1. Branches
-- ---------------------------------------------------------------------
INSERT INTO branches (branch_id, branch_name, location) VALUES
  (1, 'Poblacion Branch', 'Rizal St., Poblacion'),
  (2, 'San Roque Branch', 'Mabini St., Brgy. San Roque');


-- ---------------------------------------------------------------------
-- 2. Users
--    This is a real bcrypt hash (cost 10) of "Password123!", so these
--    accounts will work with the login endpoint we build in Step 3.
-- ---------------------------------------------------------------------
SET @demo_hash = '$2b$10$eNCiTaOnu3LV2n8AP0.tTuaatqx8m8JzesSDQS7gn.D2.hHwrDT/e';

INSERT INTO users (user_id, name, email, password_hash, role, branch_id) VALUES
  (1, 'Rosa Dela Cruz', 'owner@tindatrack.test',             @demo_hash, 'owner',   NULL),
  (2, 'Jun Reyes',      'manager.poblacion@tindatrack.test', @demo_hash, 'manager', 1),
  (3, 'Ana Villanueva', 'cashier.poblacion@tindatrack.test', @demo_hash, 'cashier', 1),
  (4, 'Carlo Mendoza',  'manager.sanroque@tindatrack.test',  @demo_hash, 'manager', 2),
  (5, 'Liza Bautista',  'cashier.sanroque@tindatrack.test',  @demo_hash, 'cashier', 2);


-- ---------------------------------------------------------------------
-- 3. Products (10 common tindahan items; sample prices in PHP)
-- ---------------------------------------------------------------------
INSERT INTO products (product_id, name, category, sku, cost_price, selling_price, unit) VALUES
  (1,  'Sinandomeng Rice',                      'Rice & Grains',      'TT-RICE-001',  42.00,  50.00, 'kg'),
  (2,  'Lucky Me! Pancit Canton Original 60g',  'Noodles',            'TT-NOOD-001',  13.00,  16.00, 'pack'),
  (3,  'Century Tuna Flakes in Oil 155g',       'Canned Goods',       'TT-CAN-001',   35.00,  42.00, 'can'),
  (4,  'Argentina Corned Beef 150g',            'Canned Goods',       'TT-CAN-002',   38.00,  45.00, 'can'),
  (5,  'Coca-Cola 1.5L',                        'Beverages',          'TT-BEV-001',   68.00,  80.00, 'bottle'),
  (6,  'Nescafé 3in1 Original 20g',             'Beverages',          'TT-BEV-002',    7.00,   9.00, 'sachet'),
  (7,  'Datu Puti Vinegar 1L',                  'Condiments',         'TT-COND-001',  38.00,  45.00, 'bottle'),
  (8,  'Baguio Vegetable Oil 1L',               'Cooking Essentials', 'TT-COOK-001',  98.00, 115.00, 'bottle'),
  (9,  'Safeguard Bar Soap 60g',                'Personal Care',      'TT-CARE-001',  24.00,  30.00, 'pc'),
  (10, 'Surf Powder Detergent 65g',             'Household',          'TT-HOME-001',   8.00,  10.00, 'sachet');


-- ---------------------------------------------------------------------
-- 4. Stock rows
--    Every product gets 1 bodega row and 1 row per branch, starting at 0.
--    (The API will do the same thing whenever a new product is created.)
--    Low-stock levels use the table defaults: bodega 50, store 10.
-- ---------------------------------------------------------------------
INSERT INTO bodega_stock (product_id)
SELECT product_id FROM products;

INSERT INTO store_stock (product_id, branch_id)
SELECT p.product_id, b.branch_id
FROM products p
CROSS JOIN branches b;           -- CROSS JOIN = every product x every branch


-- ---------------------------------------------------------------------
-- 5. Supplier deliveries into the bodega  (bodega_logs, type = 'in')
--    TIMESTAMP(date, 'HH:MM:SS') builds a date + time, e.g. 30 days ago at 7:30 AM.
-- ---------------------------------------------------------------------
INSERT INTO bodega_logs (product_id, quantity, type, reference, supplier, recorded_by, date) VALUES
  -- First big delivery, 30 days ago
  (2,  300, 'in', 'DR-1001', 'JMR Grocery Distributor', 1, TIMESTAMP(CURDATE() - INTERVAL 30 DAY, '07:30:00')),
  (3,  120, 'in', 'DR-1001', 'JMR Grocery Distributor', 1, TIMESTAMP(CURDATE() - INTERVAL 30 DAY, '07:30:00')),
  (4,  100, 'in', 'DR-1001', 'JMR Grocery Distributor', 1, TIMESTAMP(CURDATE() - INTERVAL 30 DAY, '07:30:00')),
  (5,   72, 'in', 'DR-1001', 'JMR Grocery Distributor', 1, TIMESTAMP(CURDATE() - INTERVAL 30 DAY, '07:30:00')),
  (6,  300, 'in', 'DR-1001', 'JMR Grocery Distributor', 1, TIMESTAMP(CURDATE() - INTERVAL 30 DAY, '07:30:00')),
  (7,   60, 'in', 'DR-1001', 'JMR Grocery Distributor', 1, TIMESTAMP(CURDATE() - INTERVAL 30 DAY, '07:30:00')),
  (8,   48, 'in', 'DR-1001', 'JMR Grocery Distributor', 1, TIMESTAMP(CURDATE() - INTERVAL 30 DAY, '07:30:00')),
  (9,  100, 'in', 'DR-1001', 'JMR Grocery Distributor', 1, TIMESTAMP(CURDATE() - INTERVAL 30 DAY, '07:30:00')),
  (10, 200, 'in', 'DR-1001', 'JMR Grocery Distributor', 1, TIMESTAMP(CURDATE() - INTERVAL 30 DAY, '07:30:00')),
  (1,  250, 'in', 'DR-2001', 'Mang Ben Rice Trading',   1, TIMESTAMP(CURDATE() - INTERVAL 30 DAY, '08:15:00')),
  -- Restock of fast movers, 12 days ago
  (1,  150, 'in', 'DR-2002', 'Mang Ben Rice Trading',   1, TIMESTAMP(CURDATE() - INTERVAL 12 DAY, '07:45:00')),
  (2,  200, 'in', 'DR-1002', 'JMR Grocery Distributor', 1, TIMESTAMP(CURDATE() - INTERVAL 12 DAY, '08:30:00')),
  (5,   48, 'in', 'DR-1002', 'JMR Grocery Distributor', 1, TIMESTAMP(CURDATE() - INTERVAL 12 DAY, '08:30:00'));


-- ---------------------------------------------------------------------
-- 6. Transfers from bodega to branches (done by the owner, user 1)
--    Columns: product_id, branch_id, quantity, transferred_by, date
-- ---------------------------------------------------------------------
INSERT INTO stock_transfers (product_id, branch_id, quantity, transferred_by, date) VALUES
  -- Opening stock for Poblacion Branch, 28 days ago
  (1,  1, 60, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '09:00:00')),
  (2,  1, 80, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '09:00:00')),
  (3,  1, 30, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '09:00:00')),
  (4,  1, 24, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '09:00:00')),
  (5,  1, 24, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '09:00:00')),
  (6,  1, 80, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '09:00:00')),
  (7,  1, 15, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '09:00:00')),
  (8,  1, 12, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '09:00:00')),
  (9,  1, 24, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '09:00:00')),
  (10, 1, 50, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '09:00:00')),
  -- Opening stock for San Roque Branch, 28 days ago
  (1,  2, 50, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '10:00:00')),
  (2,  2, 70, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '10:00:00')),
  (3,  2, 24, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '10:00:00')),
  (4,  2, 24, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '10:00:00')),
  (5,  2, 18, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '10:00:00')),
  (6,  2, 70, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '10:00:00')),
  (7,  2, 12, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '10:00:00')),
  (8,  2, 12, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '10:00:00')),
  (9,  2, 20, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '10:00:00')),
  (10, 2, 40, 1, TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '10:00:00')),
  -- Restock of rice, canton, and Coke to both branches, 11 days ago
  (1,  1, 40, 1, TIMESTAMP(CURDATE() - INTERVAL 11 DAY, '09:00:00')),
  (2,  1, 60, 1, TIMESTAMP(CURDATE() - INTERVAL 11 DAY, '09:00:00')),
  (5,  1, 18, 1, TIMESTAMP(CURDATE() - INTERVAL 11 DAY, '09:00:00')),
  (1,  2, 40, 1, TIMESTAMP(CURDATE() - INTERVAL 11 DAY, '10:00:00')),
  (2,  2, 50, 1, TIMESTAMP(CURDATE() - INTERVAL 11 DAY, '10:00:00')),
  (5,  2, 12, 1, TIMESTAMP(CURDATE() - INTERVAL 11 DAY, '10:00:00'));


-- ---------------------------------------------------------------------
-- 7. Matching bodega 'out' logs, one per transfer
--    INSERT ... SELECT copies rows from a query instead of typing them.
-- ---------------------------------------------------------------------
INSERT INTO bodega_logs (product_id, quantity, type, reference, supplier, recorded_by, date)
SELECT t.product_id,
       t.quantity,
       'out',
       CONCAT('TRANSFER #', t.transfer_id, ' -> ', b.branch_name),
       NULL,
       t.transferred_by,
       t.date
FROM stock_transfers t
JOIN branches b ON b.branch_id = t.branch_id
ORDER BY t.transfer_id;


-- ---------------------------------------------------------------------
-- 8. Sales (receipts)
--    total_amount starts at 0 and is computed from sale_items in step 10.
--    "Today" sales use NOW() minus a few minutes so they're never in the future.
-- ---------------------------------------------------------------------
INSERT INTO sales (sale_id, branch_id, cashier_id, total_amount, date) VALUES
  -- Poblacion Branch (cashier: Ana, user 3)
  (1,  1, 3, 0, TIMESTAMP(CURDATE() - INTERVAL 25 DAY, '09:15:00')),
  (2,  1, 3, 0, TIMESTAMP(CURDATE() - INTERVAL 20 DAY, '14:30:00')),
  (3,  1, 3, 0, TIMESTAMP(CURDATE() - INTERVAL 15 DAY, '10:05:00')),
  (4,  1, 3, 0, TIMESTAMP(CURDATE() - INTERVAL 10 DAY, '16:45:00')),
  (5,  1, 3, 0, TIMESTAMP(CURDATE() - INTERVAL  6 DAY, '11:20:00')),
  (6,  1, 3, 0, TIMESTAMP(CURDATE() - INTERVAL  3 DAY, '08:40:00')),
  (7,  1, 3, 0, TIMESTAMP(CURDATE() - INTERVAL  1 DAY, '17:10:00')),
  (8,  1, 3, 0, NOW() - INTERVAL 45 MINUTE),
  -- San Roque Branch (cashier: Liza, user 5)
  (9,  2, 5, 0, TIMESTAMP(CURDATE() - INTERVAL 24 DAY, '10:30:00')),
  (10, 2, 5, 0, TIMESTAMP(CURDATE() - INTERVAL 19 DAY, '15:10:00')),
  (11, 2, 5, 0, TIMESTAMP(CURDATE() - INTERVAL 14 DAY, '09:45:00')),
  (12, 2, 5, 0, TIMESTAMP(CURDATE() - INTERVAL  9 DAY, '13:25:00')),
  (13, 2, 5, 0, TIMESTAMP(CURDATE() - INTERVAL  5 DAY, '18:00:00')),
  (14, 2, 5, 0, TIMESTAMP(CURDATE() - INTERVAL  2 DAY, '11:50:00')),
  (15, 2, 5, 0, TIMESTAMP(CURDATE() - INTERVAL  1 DAY, '09:05:00')),
  (16, 2, 5, 0, NOW() - INTERVAL 20 MINUTE);


-- ---------------------------------------------------------------------
-- 9. Sale items
--    We list only (sale_id, product_id, quantity). The JOIN with products
--    copies the current selling_price and cost_price into each line,
--    exactly like the POS will do at checkout.
-- ---------------------------------------------------------------------
INSERT INTO sale_items (sale_id, product_id, quantity, price, cost_price)
SELECT line.sale_id, p.product_id, line.quantity, p.selling_price, p.cost_price
FROM (
            SELECT 1 AS sale_id, 1 AS product_id, 5 AS quantity
  UNION ALL SELECT 1,  2, 10
  UNION ALL SELECT 1,  3,  2
  UNION ALL SELECT 2,  5,  3
  UNION ALL SELECT 2,  6, 10
  UNION ALL SELECT 2,  9,  2
  UNION ALL SELECT 3,  1,  8
  UNION ALL SELECT 3,  4,  3
  UNION ALL SELECT 3,  8,  2
  UNION ALL SELECT 3,  7,  1
  UNION ALL SELECT 4,  2, 12
  UNION ALL SELECT 4, 10,  6
  UNION ALL SELECT 4,  5,  4
  UNION ALL SELECT 5,  1, 10
  UNION ALL SELECT 5,  3,  3
  UNION ALL SELECT 5,  8,  2
  UNION ALL SELECT 6,  6, 15
  UNION ALL SELECT 6,  2,  8
  UNION ALL SELECT 6,  9,  3
  UNION ALL SELECT 7,  1,  6
  UNION ALL SELECT 7,  5,  5
  UNION ALL SELECT 7,  4,  2
  UNION ALL SELECT 7,  8,  1
  UNION ALL SELECT 8,  2,  6
  UNION ALL SELECT 8,  3,  2
  UNION ALL SELECT 8, 10,  4
  UNION ALL SELECT 9,  1,  4
  UNION ALL SELECT 9,  2,  8
  UNION ALL SELECT 9,  4,  3
  UNION ALL SELECT 10, 5,  4
  UNION ALL SELECT 10, 7,  2
  UNION ALL SELECT 10, 6, 12
  UNION ALL SELECT 11, 1,  6
  UNION ALL SELECT 11, 3,  4
  UNION ALL SELECT 11, 4,  4
  UNION ALL SELECT 11, 9,  2
  UNION ALL SELECT 12, 2, 10
  UNION ALL SELECT 12, 10, 5
  UNION ALL SELECT 12, 7,  1
  UNION ALL SELECT 13, 1,  7
  UNION ALL SELECT 13, 5,  3
  UNION ALL SELECT 13, 4,  5
  UNION ALL SELECT 14, 6, 10
  UNION ALL SELECT 14, 2,  9
  UNION ALL SELECT 14, 8,  1
  UNION ALL SELECT 15, 3,  3
  UNION ALL SELECT 15, 7,  1
  UNION ALL SELECT 15, 10, 3
  UNION ALL SELECT 16, 1,  3
  UNION ALL SELECT 16, 5,  2
  UNION ALL SELECT 16, 4,  2
) AS line
JOIN products p ON p.product_id = line.product_id
ORDER BY line.sale_id, line.product_id;


-- ---------------------------------------------------------------------
-- 10. Compute each receipt's total from its items
-- ---------------------------------------------------------------------
UPDATE sales s
SET s.total_amount = (
  SELECT COALESCE(SUM(si.quantity * si.price), 0)
  FROM sale_items si
  WHERE si.sale_id = s.sale_id
);


-- ---------------------------------------------------------------------
-- 11. Calculate current stock from the history
--     bodega = all deliveries in  - all transfers out
--     store  = all transfers in   - all units sold at that branch
--     If any number went negative, the CHECK constraints would stop
--     this script with an error, which proves the data is consistent.
-- ---------------------------------------------------------------------
UPDATE bodega_stock bs
SET bs.quantity = (
  SELECT COALESCE(SUM(CASE WHEN l.type = 'in' THEN l.quantity ELSE -l.quantity END), 0)
  FROM bodega_logs l
  WHERE l.product_id = bs.product_id
);

UPDATE store_stock ss
SET ss.quantity =
    (SELECT COALESCE(SUM(t.quantity), 0)
       FROM stock_transfers t
      WHERE t.product_id = ss.product_id
        AND t.branch_id  = ss.branch_id)
  - (SELECT COALESCE(SUM(si.quantity), 0)
       FROM sale_items si
       JOIN sales s ON s.sale_id = si.sale_id
      WHERE si.product_id = ss.product_id
        AND s.branch_id   = ss.branch_id);


-- ---------------------------------------------------------------------
-- Done! Quick summary so you can confirm the import worked.
-- ---------------------------------------------------------------------
SELECT 'branches'        AS table_name, COUNT(*) AS row_count FROM branches
UNION ALL SELECT 'users',           COUNT(*) FROM users
UNION ALL SELECT 'products',        COUNT(*) FROM products
UNION ALL SELECT 'bodega_stock',    COUNT(*) FROM bodega_stock
UNION ALL SELECT 'store_stock',     COUNT(*) FROM store_stock
UNION ALL SELECT 'bodega_logs',     COUNT(*) FROM bodega_logs
UNION ALL SELECT 'stock_transfers', COUNT(*) FROM stock_transfers
UNION ALL SELECT 'sales',           COUNT(*) FROM sales
UNION ALL SELECT 'sale_items',      COUNT(*) FROM sale_items;
