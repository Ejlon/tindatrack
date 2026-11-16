// controllers/bodegaController.js
// Manages the central warehouse (bodega):
//   - Receive deliveries from suppliers (stock IN)
//   - View current stock levels
//   - View the full audit log (in / out)
//
// Stock can ONLY leave the bodega via a Transfer — see transfersController.js.

const db = require('../config/db');
const { validationResult } = require('express-validator');

// ── GET /api/bodega/stock ─────────────────────────────────────────────────────
// Returns every product's bodega quantity + low-stock flag.
const getBodegaStock = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT p.product_id, p.name, p.category, p.sku, p.unit,
              p.cost_price, p.selling_price,
              bs.quantity, bs.low_stock_level, bs.updated_at,
              (bs.quantity <= bs.low_stock_level) AS is_low_stock
         FROM bodega_stock bs
         JOIN products p ON p.product_id = bs.product_id
        WHERE p.is_active = 1
        ORDER BY p.category, p.name`
    );
    res.json({ stock: rows });
  } catch (err) { next(err); }
};

// ── POST /api/bodega/receive ──────────────────────────────────────────────────
// Records an incoming delivery from a supplier.
// Body: { product_id, quantity, reference?, supplier? }
//
// What happens inside the transaction:
//   1. Add quantity to bodega_stock
//   2. Write a 'in' row to bodega_logs
const receiveStock = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ message: 'Validation failed', errors: errors.array() });

  const { product_id, quantity, reference, supplier } = req.body;
  const recordedBy = req.user.userId;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Verify the product exists and is active
    const [products] = await conn.query(
      'SELECT product_id, name FROM products WHERE product_id = ? AND is_active = 1',
      [product_id]
    );
    if (!products.length) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ message: 'Product not found or archived' });
    }

    // 2. Ensure bodega_stock row exists (it should, but be safe)
    const [existing] = await conn.query(
      'SELECT product_id FROM bodega_stock WHERE product_id = ?',
      [product_id]
    );
    if (!existing.length) {
      await conn.query('INSERT INTO bodega_stock (product_id, quantity) VALUES (?, ?)', [product_id, 0]);
    }

    // 3. Add the quantity
    await conn.query(
      'UPDATE bodega_stock SET quantity = quantity + ? WHERE product_id = ?',
      [quantity, product_id]
    );

    // 4. Write the audit log entry
    await conn.query(
      `INSERT INTO bodega_logs (product_id, quantity, type, reference, supplier, recorded_by)
       VALUES (?, ?, 'in', ?, ?, ?)`,
      [product_id, quantity, reference || null, supplier || null, recordedBy]
    );

    await conn.commit();

    // Fetch updated stock level to return
    const [updated] = await conn.query(
      'SELECT quantity FROM bodega_stock WHERE product_id = ?', [product_id]
    );

    res.status(201).json({
      message: `Received ${quantity} unit(s) of "${products[0].name}" into bodega`,
      new_quantity: updated[0].quantity,
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// ── GET /api/bodega/logs ──────────────────────────────────────────────────────
// Full audit log with optional filters:  ?product_id=&type=in|out&from=&to=&limit=
const getBodegaLogs = async (req, res, next) => {
  const { product_id, type, from, to, limit = 100, offset = 0 } = req.query;

  // Build a dynamic WHERE clause from whatever filters were passed
  const conditions = [];
  const params     = [];

  if (product_id) { conditions.push('bl.product_id = ?');  params.push(product_id); }
  if (type)       { conditions.push("bl.type = ?");         params.push(type); }
  if (from)       { conditions.push('bl.date >= ?');        params.push(from); }
  if (to)         { conditions.push('bl.date <= ?');        params.push(to + ' 23:59:59'); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const [rows] = await db.query(
      `SELECT bl.log_id, bl.type, bl.quantity, bl.reference, bl.supplier, bl.date,
              p.product_id, p.name AS product_name, p.sku, p.unit,
              u.name AS recorded_by_name
         FROM bodega_logs bl
         JOIN products p ON p.product_id = bl.product_id
         LEFT JOIN users u ON u.user_id  = bl.recorded_by
         ${where}
        ORDER BY bl.date DESC
        LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), parseInt(offset, 10)]
    );

    // Count total for pagination
    const [countResult] = await db.query(
      `SELECT COUNT(*) AS total FROM bodega_logs bl ${where}`,
      params
    );

    res.json({ logs: rows, total: countResult[0].total });
  } catch (err) { next(err); }
};

module.exports = { getBodegaStock, receiveStock, getBodegaLogs };
