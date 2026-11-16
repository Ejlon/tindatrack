// routes/reports.js
const express = require('express');
const router  = express.Router();

const {
  getDashboard, getSalesTrend, getBestSellers, getStockLevels, getBranchComparison,
} = require('../controllers/reportsController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

// All authenticated users can view reports for their scope
router.get('/dashboard',         getDashboard);
router.get('/sales-trend',       getSalesTrend);
router.get('/best-sellers',      getBestSellers);
router.get('/stock-levels',      getStockLevels);

// Only the owner sees the cross-branch comparison
router.get('/branch-comparison', requireRole('owner'), getBranchComparison);

module.exports = router;
