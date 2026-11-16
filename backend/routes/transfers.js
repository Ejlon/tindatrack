// routes/transfers.js
const express  = require('express');
const { body } = require('express-validator');
const router   = express.Router();

const { createTransfer, listTransfers, getTransfer } = require('../controllers/transfersController');
const { verifyToken, requireRole } = require('../middleware/auth');

const transferRules = [
  body('product_id').isInt({ min: 1 }).withMessage('Valid product_id required'),
  body('branch_id').isInt({ min: 1 }).withMessage('Valid branch_id required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
  body('notes').optional().isLength({ max: 255 }),
];

router.use(verifyToken);

// Only owners and managers can initiate transfers
router.post('/', requireRole('owner', 'manager'), transferRules, createTransfer);
router.get ('/', listTransfers);
router.get ('/:id', getTransfer);

module.exports = router;
