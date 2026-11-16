// controllers/reportsController.js
// All aggregated data for the Dashboard and Reports pages.
//
// Endpoints:
//   GET /api/reports/dashboard        — summary cards (revenue, profit, low-stock, etc.)
//   GET /api/reports/sales-trend      — daily revenue/profit for the last N days
//   GET /api/reports/best-sellers     — top products by qty sold
//   GET /api/reports/stock-levels     — bodega + per-branch stock snapshot
//   GET /api/reports/branch-comparison — side-by-side revenue per branch (owner only)

const db = require('../config/db');

// ── Helper: branch filter ─────────────────────────────────────────────────────
// Returns { condition, params } based on the caller's role.
// Owners can optionally filter by branch; everyone else is locked to their branch.
function branchFilter(req) {
  const { role, branchId } = req.user;
  const requestedBranch     = req.query.branch_id;

  if (role === 'owner' && requestedBranch) {
    return { condition: 'AND s.branch_id = ?', params: [requestedBranch] };
  }
  if (role !== 'owner') {
    return { condition: 'AND s.branch_id = ?', params: [branchId] };
  }
  return { condition: '', params: [] }; // owner, no filter — all branches
}

// ── GET /api/reports/dashboard ────────────────────────────────────────────────
const getDashboard = async (req, res, next) => {
  const { condition, params } = branchFilter(req);

  try {
    // --- Today's revenue & profit ---
    const [todayRows] = await db.query(
      `SELECT
         COALESCE(SUM(si.quantity * si.price),                       0) AS revenue,
         COALESCE(SUM(si.quantity * (si.price - si.cost_price)),     0) AS profit,
         COUNT(DISTINCT s.sale_id)                                      AS transaction_count
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.sale_id
       WHERE DATE(s.date) = CURDATE() ${condition}`,
      params
    );

    // --- This month's revenue & profit ---
    const [monthRows] = await db.query(
      `SELECT
         COALESCE(SUM(si.quantity * si.price),                   0) AS revenue,
         COALESCE(SUM(si.quantity * (si.price - si.cost_price)), 0) AS profit
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.sale_id
       WHERE YEAR(s.date) = YEAR(CURDATE())
         AND MONTH(s.date) = MONTH(CURDATE()) ${condition}`,
      params
    );

    // --- Low-stock counts ---
    const [bodegaLow] = await db.query(
      `SELECT COUNT(*) AS count FROM bodega_stock bs
        JOIN products p ON p.product_id = bs.product_id
       WHERE p.is_active = 1 AND bs.quantity <= bs.low_stock_level`
    );

    // For owners: all branches. For managers: their branch.
    const storeLowCondition = req.user.role === 'owner' ? '' : 'AND ss.branch_id = ?';
    const storeLowParams    = req.user.role === 'owner' ? [] : [req.user.branchId];
    const [storeLow] = await db.query(
      `SELECT COUNT(*) AS count FROM store_stock ss
        JOIN products p ON p.product_id = ss.product_id
       WHERE p.is_active = 1 AND ss.quantity <= ss.low_stock_level ${storeLowCondition}`,
      storeLowParams
    );

    // --- Total active products ---
    const [productCount] = await db.query(
      'SELECT COUNT(*) AS count FROM products WHERE is_active = 1'
    );

    // --- Recent sales (last 5) ---
    const [recentSales] = await db.query(
      `SELECT s.sale_id, s.total_amount, s.date, b.branch_name, u.name AS cashier_name
         FROM sales s
         JOIN branches b   ON b.branch_id = s.branch_id
         LEFT JOIN users u ON u.user_id   = s.cashier_id
       ${condition ? 'WHERE ' + condition.replace(/^AND\s+/i, '') : ''}
        ORDER BY s.date DESC
        LIMIT 5`,
      params
    );

    res.json({
      today: todayRows[0],
      this_month: monthRows[0],
      low_stock: {
        bodega: bodegaLow[0].count,
        store:  storeLow[0].count,
      },
      total_products: productCount[0].count,
      recent_sales: recentSales,
    });
  } catch (err) { next(err); }
};

// ── GET /api/reports/sales-trend ──────────────────────────────────────────────
// ?days=30  (default 30)   returns one row per day
const getSalesTrend = async (req, res, next) => {
  const days = parseInt(req.query.days || 30, 10);
  const { condition, params } = branchFilter(req);

  try {
    const [rows] = await db.query(
      `SELECT
         DATE(s.date)                                              AS sale_date,
         COALESCE(SUM(si.quantity * si.price),                 0) AS revenue,
         COALESCE(SUM(si.quantity * si.cost_price),            0) AS cogs,
         COALESCE(SUM(si.quantity * (si.price - si.cost_price)), 0) AS profit,
         COUNT(DISTINCT s.sale_id)                                 AS transactions
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.sale_id
       WHERE s.date >= CURDATE() - INTERVAL ? DAY ${condition}
       GROUP BY DATE(s.date)
       ORDER BY sale_date ASC`,
      [days, ...params]
    );
    res.json({ trend: rows, days });
  } catch (err) { next(err); }
};

// ── GET /api/reports/best-sellers ─────────────────────────────────────────────
// ?days=30&limit=10
const getBestSellers = async (req, res, next) => {
  const days  = parseInt(req.query.days  || 30, 10);
  const limit = parseInt(req.query.limit || 10, 10);
  const { condition, params } = branchFilter(req);

  try {
    const [rows] = await db.query(
      `SELECT
         p.product_id, p.name, p.category, p.sku, p.unit,
         SUM(si.quantity)                                            AS total_qty_sold,
         SUM(si.quantity * si.price)                                AS total_revenue,
         SUM(si.quantity * (si.price - si.cost_price))              AS total_profit
       FROM sale_items si
       JOIN sales     s ON s.sale_id    = si.sale_id
       JOIN products  p ON p.product_id = si.product_id
       WHERE s.date >= CURDATE() - INTERVAL ? DAY ${condition}
       GROUP BY p.product_id
       ORDER BY total_qty_sold DESC
       LIMIT ?`,
      [days, ...params, limit]
    );
    res.json({ best_sellers: rows, days, limit });
  } catch (err) { next(err); }
};

// ── GET /api/reports/stock-levels ─────────────────────────────────────────────
// Full snapshot of bodega + all branches for every product.
const getStockLevels = async (req, res, next) => {
  try {
    const [products] = await db.query(
      `SELECT p.product_id, p.name, p.category, p.sku, p.unit,
              bs.quantity        AS bodega_qty,
              bs.low_stock_level AS bodega_threshold,
              (bs.quantity <= bs.low_stock_level) AS bodega_low
         FROM products p
         JOIN bodega_stock bs ON bs.product_id = p.product_id
        WHERE p.is_active = 1
        ORDER BY p.category, p.name`
    );

    const [storeRows] = await db.query(
      `SELECT ss.product_id, ss.branch_id, ss.quantity, ss.low_stock_level,
              b.branch_name,
              (ss.quantity <= ss.low_stock_level) AS is_low_stock
         FROM store_stock ss
         JOIN branches b ON b.branch_id = ss.branch_id`
    );

    // Attach branch stock arrays to each product
    const storeMap = {};
    for (const r of storeRows) {
      (storeMap[r.product_id] = storeMap[r.product_id] || []).push(r);
    }

    const result = products.map(p => ({
      ...p,
      branches: storeMap[p.product_id] || [],
    }));

    res.json({ stock_levels: result });
  } catch (err) { next(err); }
};

// ── GET /api/reports/branch-comparison ────────────────────────────────────────
// Owner only — revenue & profit per branch for the selected period.
// ?days=30
const getBranchComparison = async (req, res, next) => {
  const days = parseInt(req.query.days || 30, 10);

  try {
    const [rows] = await db.query(
      `SELECT
         b.branch_id, b.branch_name,
         COALESCE(SUM(si.quantity * si.price),                 0) AS revenue,
         COALESCE(SUM(si.quantity * si.cost_price),            0) AS cogs,
         COALESCE(SUM(si.quantity * (si.price - si.cost_price)), 0) AS profit,
         COUNT(DISTINCT s.sale_id)                                  AS transactions
       FROM branches b
       LEFT JOIN sales      s  ON s.branch_id  = b.branch_id
                               AND s.date >= CURDATE() - INTERVAL ? DAY
       LEFT JOIN sale_items si ON si.sale_id  = s.sale_id
       GROUP BY b.branch_id
       ORDER BY revenue DESC`,
      [days]
    );
    res.json({ comparison: rows, days });
  } catch (err) { next(err); }
};

module.exports = {
  getDashboard, getSalesTrend, getBestSellers, getStockLevels, getBranchComparison,
};
