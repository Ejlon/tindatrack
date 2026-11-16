// routes/bodega.js
const express  = require('express');
const { body } = require('express-validator');
const router   = express.Router();

const { getBodegaStock, receiveStock, getBodegaLogs } = require('../controllers/bodegaController');
const { verifyToken, requireRole } = require('../middleware/auth');

const receiveRules = [
  body('product_id').isInt({ min: 1 }).withMessage('Valid product_id required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
  body('reference').optional().isLength({ max: 255 }),
  body('supplier').optional().isLength({ max: 150 }),
];

router.use(verifyToken);

router.get('/stock',   requireRole('owner', 'manager'),          getBodegaStock);
router.get('/logs',    requireRole('owner', 'manager'),          getBodegaLogs);
router.post('/receive', requireRole('owner', 'manager'), receiveRules, receiveStock);

module.exports = router;
