// controllers/productsController.js
// Full CRUD for the product catalog + stock level reads.
//
// Creating a product also inserts its stock rows:
//   - 1 row in bodega_stock (qty 0)
//   - 1 row in store_stock per branch (qty 0)

const db = require('../config/db');
const { validationResult } = require('express-validator');

// ── GET /api/products ─────────────────────────────────────────────────────────
// Returns every active product with its current bodega qty and an array of
// per-branch store stock, plus a low-stock flag for quick dashboard alerts.
const listProducts = async (req, res, next) => {
  try {
    // All active products with their bodega stock level
    const [products] = await db.query(
      `SELECT p.*,
              bs.quantity        AS bodega_qty,
              bs.low_stock_level AS bodega_low_stock_level,
              (bs.quantity <= bs.low_stock_level) AS bodega_low_stock
         FROM products p
         LEFT JOIN bodega_stock bs ON bs.product_id = p.product_id
        WHERE p.is_active = 1
        ORDER BY p.category, p.name`
    );

    // All branch stock in one query (more efficient than N+1 queries)
    const [storeStock] = await db.query(
      `SELECT ss.product_id, ss.branch_id, ss.quantity, ss.low_stock_level,
              b.branch_name,
              (ss.quantity <= ss.low_stock_level) AS is_low_stock
         FROM store_stock ss
         JOIN branches b ON b.branch_id = ss.branch_id
        ORDER BY ss.branch_id`
    );

    // Group store stock by product_id for easy lookup
    const stockMap = {};
    for (const row of storeStock) {
      if (!stockMap[row.product_id]) stockMap[row.product_id] = [];
      stockMap[row.product_id].push(row);
    }

    // Attach branch stock to each product
    const result = products.map(p => ({
      ...p,
      store_stock: stockMap[p.product_id] || [],
    }));

    res.json({ products: result });
  } catch (err) { next(err); }
};

// ── GET /api/products/low-stock ───────────────────────────────────────────────
// Returns products that are below their low-stock threshold in bodega OR any branch.
const getLowStock = async (req, res, next) => {
  try {
    const [bodegaAlerts] = await db.query(
      `SELECT p.product_id, p.name, p.sku, p.unit, p.category,
              bs.quantity, bs.low_stock_level,
              'bodega' AS location, NULL AS branch_id, 'Bodega' AS branch_name
         FROM bodega_stock bs
         JOIN products p ON p.product_id = bs.product_id
        WHERE p.is_active = 1 AND bs.quantity <= bs.low_stock_level`
    );

    const [storeAlerts] = await db.query(
      `SELECT p.product_id, p.name, p.sku, p.unit, p.category,
              ss.quantity, ss.low_stock_level,
              'store' AS location, ss.branch_id, b.branch_name
         FROM store_stock ss
         JOIN products p ON p.product_id = ss.product_id
         JOIN branches b ON b.branch_id  = ss.branch_id
        WHERE p.is_active = 1 AND ss.quantity <= ss.low_stock_level`
    );

    res.json({
      alerts: [...bodegaAlerts, ...storeAlerts],
      count: bodegaAlerts.length + storeAlerts.length,
    });
  } catch (err) { next(err); }
};

// ── GET /api/products/:id ─────────────────────────────────────────────────────
const getProduct = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*,
              bs.quantity AS bodega_qty, bs.low_stock_level AS bodega_low_stock_level
         FROM products p
         LEFT JOIN bodega_stock bs ON bs.product_id = p.product_id
        WHERE p.product_id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Product not found' });

    const [storeStock] = await db.query(
      `SELECT ss.*, b.branch_name
         FROM store_stock ss
         JOIN branches b ON b.branch_id = ss.branch_id
        WHERE ss.product_id = ?`,
      [req.params.id]
    );

    res.json({ product: { ...rows[0], store_stock: storeStock } });
  } catch (err) { next(err); }
};

// ── POST /api/products ────────────────────────────────────────────────────────
// Creates the product + its stock rows for every existing branch.
const createProduct = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ message: 'Validation failed', errors: errors.array() });

  const { name, category, sku, cost_price, selling_price, unit } = req.body;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Guard against duplicate SKU
    const [existing] = await conn.query('SELECT product_id FROM products WHERE sku = ?', [sku.trim()]);
    if (existing.length) {
      await conn.rollback();
      conn.release();
      return res.status(409).json({ message: `SKU '${sku}' is already in use` });
    }

    // Insert product
    const [result] = await conn.query(
      `INSERT INTO products (name, category, sku, cost_price, selling_price, unit)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name.trim(), category.trim(), sku.trim(), cost_price, selling_price, unit.trim()]
    );
    const productId = result.insertId;

    // Create the bodega_stock row (qty 0)
    await conn.query(
      'INSERT INTO bodega_stock (product_id) VALUES (?)',
      [productId]
    );

    // Create a store_stock row for every branch (qty 0)
    const [branches] = await conn.query('SELECT branch_id FROM branches');
    if (branches.length) {
      const values = branches.map(b => [productId, b.branch_id]);
      await conn.query(
        'INSERT INTO store_stock (product_id, branch_id) VALUES ?',
        [values]
      );
    }

    await conn.commit();

    const [newProduct] = await conn.query(
      'SELECT * FROM products WHERE product_id = ?', [productId]
    );
    res.status(201).json({ message: 'Product created', product: newProduct[0] });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// ── PUT /api/products/:id ─────────────────────────────────────────────────────
const updateProduct = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ message: 'Validation failed', errors: errors.array() });

  const { name, category, sku, cost_price, selling_price, unit } = req.body;
  const productId = req.params.id;

  try {
    const [rows] = await db.query('SELECT * FROM products WHERE product_id = ?', [productId]);
    if (!rows.length) return res.status(404).json({ message: 'Product not found' });

    const p = rows[0];

    // If SKU is changing, make sure it's not already taken
    if (sku && sku.trim() !== p.sku) {
      const [dup] = await db.query(
        'SELECT product_id FROM products WHERE sku = ? AND product_id != ?',
        [sku.trim(), productId]
      );
      if (dup.length) return res.status(409).json({ message: `SKU '${sku}' is already in use` });
    }

    await db.query(
      `UPDATE products
          SET name = ?, category = ?, sku = ?, cost_price = ?,
              selling_price = ?, unit = ?
        WHERE product_id = ?`,
      [
        name?.trim()          || p.name,
        category?.trim()      || p.category,
        sku?.trim()           || p.sku,
        cost_price            ?? p.cost_price,
        selling_price         ?? p.selling_price,
        unit?.trim()          || p.unit,
        productId,
      ]
    );

    const [updated] = await db.query('SELECT * FROM products WHERE product_id = ?', [productId]);
    res.json({ message: 'Product updated', product: updated[0] });
  } catch (err) { next(err); }
};

// ── DELETE /api/products/:id ─────────────────────────────────────────────────
// Soft delete — sets is_active = 0 instead of hard-deleting
// (preserves sales history that references this product).
const deleteProduct = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM products WHERE product_id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Product not found' });

    await db.query('UPDATE products SET is_active = 0 WHERE product_id = ?', [req.params.id]);
    res.json({ message: 'Product archived (soft deleted)' });
  } catch (err) { next(err); }
};

// ── PUT /api/products/:id/stock-level ────────────────────────────────────────
// Update the low-stock alert thresholds for a product.
// Body: { bodega_low_stock_level?, store_low_stock_level?, branch_id? }
const updateStockLevels = async (req, res, next) => {
  const { bodega_low_stock_level, store_low_stock_level, branch_id } = req.body;
  const productId = req.params.id;

  try {
    if (bodega_low_stock_level !== undefined) {
      await db.query(
        'UPDATE bodega_stock SET low_stock_level = ? WHERE product_id = ?',
        [bodega_low_stock_level, productId]
      );
    }
    if (store_low_stock_level !== undefined) {
      const query = branch_id
        ? 'UPDATE store_stock SET low_stock_level = ? WHERE product_id = ? AND branch_id = ?'
        : 'UPDATE store_stock SET low_stock_level = ? WHERE product_id = ?';
      const params = branch_id
        ? [store_low_stock_level, productId, branch_id]
        : [store_low_stock_level, productId];
      await db.query(query, params);
    }
    res.json({ message: 'Stock alert levels updated' });
  } catch (err) { next(err); }
};

module.exports = {
  listProducts, getLowStock, getProduct,
  createProduct, updateProduct, deleteProduct, updateStockLevels,
};
