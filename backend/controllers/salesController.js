// controllers/salesController.js
// Records sales at the POS (Point of Sale) and retrieves sales history.
//
// createSale transaction steps:
//   1. Validate inputs
//   2. For each item: lock its store_stock row, check sufficient qty
//   3. For each item: deduct from store_stock
//   4. Insert the sales header row
//   5. Insert all sale_items rows (with price/cost snapshots)
//   6. Update the sale's total_amount
//
// If any item is out of stock, the whole transaction rolls back.

const db = require('../config/db');
const { validationResult } = require('express-validator');

// ── POST /api/sales ───────────────────────────────────────────────────────────
// Body: { branch_id, items: [{ product_id, quantity }] }
// branch_id is taken from the body for owners; cashiers use their own.
const createSale = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ message: 'Validation failed', errors: errors.array() });

  const { role, branchId: userBranch, userId: cashierId } = req.user;
  // Owners can specify a branch; everyone else uses their own branch
  const branch_id = (role === 'owner' && req.body.branch_id) ? req.body.branch_id : userBranch;
  const { items } = req.body; // [{ product_id, quantity }]

  if (!items || !items.length) {
    return res.status(422).json({ message: 'Sale must have at least one item' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // ── 1. Verify branch ──────────────────────────────────────────────────────
    const [branches] = await conn.query(
      'SELECT branch_id FROM branches WHERE branch_id = ?', [branch_id]
    );
    if (!branches.length) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ message: 'Branch not found' });
    }

    // ── 2. For each item, fetch product + lock store_stock ───────────────────
    const enrichedItems = [];
    const insufficientItems = [];

    for (const item of items) {
      const { product_id, quantity } = item;

      // Get current selling price and cost price (we'll snapshot them)
      const [products] = await conn.query(
        'SELECT product_id, name, selling_price, cost_price FROM products WHERE product_id = ? AND is_active = 1',
        [product_id]
      );
      if (!products.length) {
        await conn.rollback(); conn.release();
        return res.status(404).json({ message: `Product ${product_id} not found or archived` });
      }

      // Lock the store_stock row to prevent concurrent sales from overselling
      const [stockRows] = await conn.query(
        'SELECT quantity FROM store_stock WHERE product_id = ? AND branch_id = ? FOR UPDATE',
        [product_id, branch_id]
      );
      const available = stockRows.length ? stockRows[0].quantity : 0;

      if (available < quantity) {
        insufficientItems.push({
          product_id,
          name: products[0].name,
          available,
          requested: quantity,
        });
      }

      enrichedItems.push({
        product_id,
        quantity,
        price:      products[0].selling_price,
        cost_price: products[0].cost_price,
        name:       products[0].name,
      });
    }

    // ── 3. Reject the whole sale if anything is out of stock ─────────────────
    if (insufficientItems.length) {
      await conn.rollback(); conn.release();
      return res.status(400).json({
        message: 'Insufficient stock for some items',
        insufficient_items: insufficientItems,
      });
    }

    // ── 4. Deduct stock for each item ─────────────────────────────────────────
    for (const item of enrichedItems) {
      await conn.query(
        'UPDATE store_stock SET quantity = quantity - ? WHERE product_id = ? AND branch_id = ?',
        [item.quantity, item.product_id, branch_id]
      );
    }

    // ── 5. Create the sale header (total_amount computed next) ────────────────
    const [saleResult] = await conn.query(
      'INSERT INTO sales (branch_id, cashier_id, total_amount) VALUES (?, ?, 0)',
      [branch_id, cashierId]
    );
    const saleId = saleResult.insertId;

    // ── 6. Insert line items ──────────────────────────────────────────────────
    const lineValues = enrichedItems.map(item => [
      saleId, item.product_id, item.quantity, item.price, item.cost_price
    ]);
    await conn.query(
      'INSERT INTO sale_items (sale_id, product_id, quantity, price, cost_price) VALUES ?',
      [lineValues]
    );

    // ── 7. Compute and store the total ────────────────────────────────────────
    const total = enrichedItems.reduce((sum, i) => sum + i.quantity * i.price, 0);
    await conn.query('UPDATE sales SET total_amount = ? WHERE sale_id = ?', [total, saleId]);

    await conn.commit();

    res.status(201).json({
      message: 'Sale recorded successfully',
      sale_id:      saleId,
      branch_id,
      total_amount: total,
      items:        enrichedItems,
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// ── GET /api/sales ────────────────────────────────────────────────────────────
// Owners see all branches. Manager/cashier see only their branch.
// ?from=YYYY-MM-DD&to=YYYY-MM-DD&branch_id=&limit=&offset=
const listSales = async (req, res, next) => {
  const { role, branchId: userBranch } = req.user;
  const { from, to, limit = 50, offset = 0 } = req.query;
  const branch_id = role === 'owner' ? req.query.branch_id : userBranch;

  const conditions = [];
  const params     = [];

  if (branch_id) { conditions.push('s.branch_id = ?'); params.push(branch_id); }
  if (from)      { conditions.push('s.date >= ?');      params.push(from); }
  if (to)        { conditions.push('s.date <= ?');      params.push(to + ' 23:59:59'); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const [rows] = await db.query(
      `SELECT s.sale_id, s.total_amount, s.date,
              b.branch_name,
              u.name AS cashier_name,
              COUNT(si.sale_item_id) AS item_count
         FROM sales s
         JOIN branches b   ON b.branch_id = s.branch_id
         LEFT JOIN users u ON u.user_id   = s.cashier_id
         LEFT JOIN sale_items si ON si.sale_id = s.sale_id
         ${where}
        GROUP BY s.sale_id
        ORDER BY s.date DESC
        LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), parseInt(offset, 10)]
    );

    const [countResult] = await db.query(
      `SELECT COUNT(*) AS total FROM sales s ${where}`, params
    );

    res.json({ sales: rows, total: countResult[0].total });
  } catch (err) { next(err); }
};

// ── GET /api/sales/:id ────────────────────────────────────────────────────────
// Returns the sale header + all its line items.
const getSale = async (req, res, next) => {
  try {
    const [saleRows] = await db.query(
      `SELECT s.*, b.branch_name, u.name AS cashier_name
         FROM sales s
         JOIN branches b   ON b.branch_id = s.branch_id
         LEFT JOIN users u ON u.user_id   = s.cashier_id
        WHERE s.sale_id = ?`,
      [req.params.id]
    );
    if (!saleRows.length) return res.status(404).json({ message: 'Sale not found' });

    // Non-owners can only view their own branch's sales
    const { role, branchId } = req.user;
    if (role !== 'owner' && saleRows[0].branch_id !== branchId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const [items] = await db.query(
      `SELECT si.*, p.name AS product_name, p.sku, p.unit,
              (si.quantity * si.price)      AS line_revenue,
              (si.quantity * si.cost_price) AS line_cogs,
              (si.quantity * (si.price - si.cost_price)) AS line_profit
         FROM sale_items si
         JOIN products p ON p.product_id = si.product_id
        WHERE si.sale_id = ?`,
      [req.params.id]
    );

    res.json({ sale: { ...saleRows[0], items } });
  } catch (err) { next(err); }
};

module.exports = { createSale, listSales, getSale };
