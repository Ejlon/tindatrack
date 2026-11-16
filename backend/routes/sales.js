// routes/sales.js
const express  = require('express');
const { body } = require('express-validator');
const router   = express.Router();

const { createSale, listSales, getSale } = require('../controllers/salesController');
const { verifyToken } = require('../middleware/auth');

const saleRules = [
  body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
  body('items.*.product_id').isInt({ min: 1 }).withMessage('Each item needs a valid product_id'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Each item needs a positive quantity'),
  body('branch_id').optional().isInt({ min: 1 }),
];

router.use(verifyToken);

// All authenticated users can create a sale and view sales history
router.post('/',    saleRules, createSale);
router.get ('/',    listSales);
router.get ('/:id', getSale);

module.exports = router;
