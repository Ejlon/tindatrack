// controllers/branchesController.js
// CRUD for branches. Only owners can create/update branches.

const db = require('../config/db');
const { validationResult } = require('express-validator');

// GET /api/branches  — list all branches
const listBranches = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT branch_id, branch_name, location, created_at
         FROM branches
        ORDER BY branch_id`
    );
    res.json({ branches: rows });
  } catch (err) { next(err); }
};

// GET /api/branches/:id  — single branch
const getBranch = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM branches WHERE branch_id = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Branch not found' });
    res.json({ branch: rows[0] });
  } catch (err) { next(err); }
};

// POST /api/branches  — create branch (owner only)
const createBranch = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ message: 'Validation failed', errors: errors.array() });

  const { branch_name, location } = req.body;
  try {
    // Check for duplicate name
    const [existing] = await db.query(
      'SELECT branch_id FROM branches WHERE branch_name = ?', [branch_name.trim()]
    );
    if (existing.length) return res.status(409).json({ message: 'A branch with that name already exists' });

    const [result] = await db.query(
      'INSERT INTO branches (branch_name, location) VALUES (?, ?)',
      [branch_name.trim(), location.trim()]
    );
    const newBranchId = result.insertId;

    // Auto-create a store_stock row for every existing product in the new branch
    await db.query(
      `INSERT INTO store_stock (product_id, branch_id)
       SELECT product_id, ? FROM products WHERE is_active = 1`,
      [newBranchId]
    );

    const [rows] = await db.query('SELECT * FROM branches WHERE branch_id = ?', [newBranchId]);
    res.status(201).json({ message: 'Branch created', branch: rows[0] });
  } catch (err) { next(err); }
};

// PUT /api/branches/:id  — update branch (owner only)
const updateBranch = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ message: 'Validation failed', errors: errors.array() });

  const { branch_name, location } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM branches WHERE branch_id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Branch not found' });

    await db.query(
      'UPDATE branches SET branch_name = ?, location = ? WHERE branch_id = ?',
      [branch_name?.trim() || rows[0].branch_name, location?.trim() || rows[0].location, req.params.id]
    );
    const [updated] = await db.query('SELECT * FROM branches WHERE branch_id = ?', [req.params.id]);
    res.json({ message: 'Branch updated', branch: updated[0] });
  } catch (err) { next(err); }
};

module.exports = { listBranches, getBranch, createBranch, updateBranch };
