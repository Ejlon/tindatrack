// routes/products.js
const express  = require('express');
const { body } = require('express-validator');
const router   = express.Router();

const {
  listProducts, getLowStock, getProduct,
  createProduct, updateProduct, deleteProduct, updateStockLevels,
} = require('../controllers/productsController');
const { verifyToken, requireRole } = require('../middleware/auth');

const productRules = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 150 }),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('sku').trim().notEmpty().withMessage('SKU is required'),
  body('cost_price').isFloat({ min: 0 }).withMessage('cost_price must be a non-negative number'),
  body('selling_price').isFloat({ min: 0 }).withMessage('selling_price must be a non-negative number'),
  body('unit').trim().notEmpty().withMessage('Unit is required'),
];

// All product routes require authentication
router.use(verifyToken);

router.get('/low-stock', getLowStock);            // specific before /:id
router.get('/',          listProducts);
router.get('/:id',       getProduct);

// Only owners and managers can create / edit / delete products
router.post('/',                requireRole('owner', 'manager'), productRules, createProduct);
router.put ('/:id',             requireRole('owner', 'manager'), productRules, updateProduct);
router.delete('/:id',           requireRole('owner', 'manager'), deleteProduct);
router.put ('/:id/stock-level', requireRole('owner', 'manager'), updateStockLevels);

module.exports = router;
