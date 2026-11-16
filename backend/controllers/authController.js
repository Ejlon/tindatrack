// controllers/authController.js
// Handles user registration, login, and profile retrieval.
//
// Flow:
//   POST /api/auth/register  → validate → hash password → insert → return JWT
//   POST /api/auth/login     → validate → find user → compare hash → return JWT
//   GET  /api/auth/me        → read req.user set by verifyToken middleware

const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');
const { validationResult } = require('express-validator');

// How many bcrypt rounds to use. 10 is the industry standard default.
// Higher = slower to hash (and harder to brute-force), but also slower at login.
const BCRYPT_ROUNDS = 10;

// ── Helper: build a signed JWT for a user row ──────────────────────────────
function signToken(user) {
  const payload = {
    userId:   user.user_id,
    role:     user.role,
    branchId: user.branch_id,  // null for owners
  };
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

// ── Helper: return a safe user object (never send password_hash) ──────────
function safeUser(user) {
  return {
    userId:    user.user_id,
    name:      user.name,
    email:     user.email,
    role:      user.role,
    branchId:  user.branch_id,
    isActive:  user.is_active,
    createdAt: user.created_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// Body: { name, email, password, role, branch_id? }
// Only an owner should call this in production — the frontend will gate it.
// ─────────────────────────────────────────────────────────────────────────────
const register = async (req, res, next) => {
  // 1. Check express-validator results
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ message: 'Validation failed', errors: errors.array() });
  }

  const { name, email, password, role, branch_id } = req.body;

  try {
    // 2. Manager and cashier must be assigned a branch
    if ((role === 'manager' || role === 'cashier') && !branch_id) {
      return res.status(422).json({
        message: `A branch_id is required for role '${role}'`,
      });
    }

    // 3. If branch_id was given, make sure it actually exists
    if (branch_id) {
      const [branches] = await db.query(
        'SELECT branch_id FROM branches WHERE branch_id = ?',
        [branch_id]
      );
      if (branches.length === 0) {
        return res.status(422).json({ message: `Branch ${branch_id} does not exist` });
      }
    }

    // 4. Reject duplicate emails
    const [existing] = await db.query(
      'SELECT user_id FROM users WHERE email = ?',
      [email.toLowerCase()]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    // 5. Hash the password — bcrypt handles the salt automatically
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // 6. Insert the new user
    const [result] = await db.query(
      `INSERT INTO users (name, email, password_hash, role, branch_id)
       VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), email.toLowerCase(), hash, role, branch_id || null]
    );

    // 7. Fetch the full row to include in the response
    const [rows] = await db.query(
      'SELECT * FROM users WHERE user_id = ?',
      [result.insertId]
    );

    // 8. Sign a token and respond
    const token = signToken(rows[0]);
    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user: safeUser(rows[0]),
    });

  } catch (err) {
    next(err); // passes to the global error handler in server.js
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Body: { email, password }
// ─────────────────────────────────────────────────────────────────────────────
const login = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ message: 'Validation failed', errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    // 1. Look up the user (case-insensitive email)
    const [rows] = await db.query(
      'SELECT * FROM users WHERE email = ?',
      [email.toLowerCase()]
    );

    if (rows.length === 0) {
      // Use a generic message — don't reveal whether the email exists
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = rows[0];

    // 2. Check if the account is active
    if (!user.is_active) {
      return res.status(403).json({ message: 'Your account has been deactivated. Contact the owner.' });
    }

    // 3. Compare the submitted password with the stored bcrypt hash
    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // 4. If branch-based, fetch the branch name so the frontend can display it
    let branchName = null;
    if (user.branch_id) {
      const [branches] = await db.query(
        'SELECT branch_name FROM branches WHERE branch_id = ?',
        [user.branch_id]
      );
      if (branches.length > 0) branchName = branches[0].branch_name;
    }

    // 5. Sign and return the token
    const token = signToken(user);
    return res.json({
      message: 'Login successful',
      token,
      user: { ...safeUser(user), branchName },
    });

  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me        (requires verifyToken middleware)
// Returns the currently logged-in user's profile.
// ─────────────────────────────────────────────────────────────────────────────
const me = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT u.*, b.branch_name
         FROM users u
         LEFT JOIN branches b ON b.branch_id = u.branch_id
        WHERE u.user_id = ?`,
      [req.user.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = rows[0];
    return res.json({ user: { ...safeUser(user), branchName: user.branch_name || null } });

  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/auth/users          owner only — list all users
// POST /api/auth/users/:id/deactivate  owner only — soft-delete
// ─────────────────────────────────────────────────────────────────────────────
const listUsers = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT u.user_id, u.name, u.email, u.role, u.is_active, u.created_at,
              u.branch_id, b.branch_name
         FROM users u
         LEFT JOIN branches b ON b.branch_id = u.branch_id
        ORDER BY u.created_at DESC`
    );
    return res.json({ users: rows.map(u => ({ ...safeUser(u), branchName: u.branch_name })) });
  } catch (err) {
    next(err);
  }
};

const toggleUserActive = async (req, res, next) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE user_id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });

    // Prevent an owner from deactivating themselves
    if (rows[0].user_id === req.user.userId) {
      return res.status(400).json({ message: 'You cannot deactivate your own account' });
    }

    const newStatus = rows[0].is_active ? 0 : 1;
    await db.query('UPDATE users SET is_active = ? WHERE user_id = ?', [newStatus, id]);

    return res.json({
      message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`,
      isActive: Boolean(newStatus),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, me, listUsers, toggleUserActive };
