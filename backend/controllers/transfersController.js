// controllers/transfersController.js
// Handles stock transfers from the bodega to a branch store.
//
// The createTransfer handler wraps everything in a single DB transaction:
//   Step 1 — Validate inputs & check the bodega has enough stock
//   Step 2 — Deduct qty from bodega_stock
//   Step 3 — Add qty to store_stock  (upsert — row may already exist)
//   Step 4 — Insert into stock_transfers (the permanent record)
//   Step 5 — Insert an 'out' row in bodega_logs (the audit trail)
//
// If anything fails, the transaction is rolled back and nothing changes.

const db = require('../config/db');
const { validationResult } = require('express-validator');

// ── POST /api/transfers ───────────────────────────────────────────────────────
const createTransfer = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ message: 'Validation failed', errors: errors.array() });

  const { product_id, branch_id, quantity, notes } = req.body;
  const transferredBy = req.user.userId;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // ── 1. Verify the product exists ─────────────────────────────────────────
    const [products] = await conn.query(
      'SELECT product_id, name FROM products WHERE product_id = ? AND is_active = 1',
      [product_id]
    );
    if (!products.length) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ message: 'Product not found or archived' });
    }

    // ── 2. Verify the branch exists ───────────────────────────────────────────
    const [branches] = await conn.query(
      'SELECT branch_id, branch_name FROM branches WHERE branch_id = ?',
      [branch_id]
    );
    if (!branches.length) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ message: 'Branch not found' });
    }

    // ── 3. Lock the bodega_stock row and check availability ───────────────────
    // SELECT ... FOR UPDATE locks the row for the duration of this transaction,
    // preventing a race condition if two transfers run at the exact same time.
    const [bodegaRows] = await conn.query(
      'SELECT quantity FROM bodega_stock WHERE product_id = ? FOR UPDATE',
      [product_id]
    );
    if (!bodegaRows.length || bodegaRows[0].quantity < quantity) {
      await conn.rollback(); conn.release();
      const available = bodegaRows.length ? bodegaRows[0].quantity : 0;
      return res.status(400).json({
        message: `Insufficient bodega stock. Available: ${available}, Requested: ${quantity}`,
        available,
      });
    }

    // ── 4. Deduct from bodega ─────────────────────────────────────────────────
    await conn.query(
      'UPDATE bodega_stock SET quantity = quantity - ? WHERE product_id = ?',
      [quantity, product_id]
    );

    // ── 5. Add to store stock (upsert) ────────────────────────────────────────
    // INSERT ... ON DUPLICATE KEY UPDATE handles the case where the row already
    // exists (the unique key is (branch_id, product_id)).
    await conn.query(
      `INSERT INTO store_stock (product_id, branch_id, quantity)
            VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
      [product_id, branch_id, quantity]
    );

    // ── 6. Record the transfer ────────────────────────────────────────────────
    const [transferResult] = await conn.query(
      `INSERT INTO stock_transfers (product_id, branch_id, quantity, transferred_by)
       VALUES (?, ?, ?, ?)`,
      [product_id, branch_id, quantity, transferredBy]
    );
    const transferId = transferResult.insertId;

    // ── 7. Write bodega 'out' log ─────────────────────────────────────────────
    await conn.query(
      `INSERT INTO bodega_logs (product_id, quantity, type, reference, recorded_by)
       VALUES (?, ?, 'out', ?, ?)`,
      [
        product_id,
        quantity,
        `TRANSFER #${transferId} → ${branches[0].branch_name}`,
        transferredBy,
      ]
    );

    await conn.commit();

    // Fetch new stock levels to return in the response
    const [newBodega] = await conn.query(
      'SELECT quantity FROM bodega_stock WHERE product_id = ?', [product_id]
    );
    const [newStore] = await conn.query(
      'SELECT quantity FROM store_stock WHERE product_id = ? AND branch_id = ?',
      [product_id, branch_id]
    );

    res.status(201).json({
      message: `Transferred ${quantity} unit(s) of "${products[0].name}" to ${branches[0].branch_name}`,
      transfer_id:         transferId,
      new_bodega_quantity: newBodega[0].quantity,
      new_store_quantity:  newStore[0].quantity,
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// ── GET /api/transfers ────────────────────────────────────────────────────────
// Owners see all transfers.
// Managers/cashiers only see their branch's transfers.
// Optional query params: ?branch_id=&product_id=&from=&to=&limit=&offset=
const listTransfers = async (req, res, next) => {
  const { role, branchId: userBranch } = req.user;
  const { product_id, from, to, limit = 50, offset = 0 } = req.query;

  // Non-owners are locked to their branch
  const branch_id = role === 'owner' ? req.query.branch_id : userBranch;

  const conditions = [];
  const params     = [];

  if (branch_id)  { conditions.push('t.branch_id = ?');   params.push(branch_id); }
  if (product_id) { conditions.push('t.product_id = ?');  params.push(product_id); }
  if (from)       { conditions.push('t.date >= ?');        params.push(from); }
  if (to)         { conditions.push('t.date <= ?');        params.push(to + ' 23:59:59'); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const [rows] = await db.query(
      `SELECT t.transfer_id, t.quantity, t.date,
              p.product_id, p.name AS product_name, p.sku, p.unit,
              b.branch_id,  b.branch_name,
              u.name AS transferred_by_name
         FROM stock_transfers t
         JOIN products  p ON p.product_id = t.product_id
         JOIN branches  b ON b.branch_id  = t.branch_id
         LEFT JOIN users u ON u.user_id   = t.transferred_by
         ${where}
        ORDER BY t.date DESC
        LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), parseInt(offset, 10)]
    );

    const [countResult] = await db.query(
      `SELECT COUNT(*) AS total FROM stock_transfers t ${where}`,
      params
    );

    res.json({ transfers: rows, total: countResult[0].total });
  } catch (err) { next(err); }
};

// ── GET /api/transfers/:id ────────────────────────────────────────────────────
const getTransfer = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT t.*, p.name AS product_name, p.sku, p.unit,
              b.branch_name, u.name AS transferred_by_name
         FROM stock_transfers t
         JOIN products  p ON p.product_id = t.product_id
         JOIN branches  b ON b.branch_id  = t.branch_id
         LEFT JOIN users u ON u.user_id   = t.transferred_by
        WHERE t.transfer_id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Transfer not found' });

    // Non-owners can only see their own branch's transfer
    const { role, branchId } = req.user;
    if (role !== 'owner' && rows[0].branch_id !== branchId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ transfer: rows[0] });
  } catch (err) { next(err); }
};

module.exports = { createTransfer, listTransfers, getTransfer };
