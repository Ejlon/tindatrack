// routes/branches.js
const express  = require('express');
const { body } = require('express-validator');
const router   = express.Router();

const { listBranches, getBranch, createBranch, updateBranch } = require('../controllers/branchesController');
const { verifyToken, requireRole } = require('../middleware/auth');

const branchRules = [
  body('branch_name').trim().notEmpty().withMessage('Branch name is required')
    .isLength({ max: 100 }).withMessage('Max 100 characters'),
  body('location').trim().notEmpty().withMessage('Location is required'),
];

router.get ('/',    verifyToken,                           listBranches);
router.get ('/:id', verifyToken,                           getBranch);
router.post('/',    verifyToken, requireRole('owner'), branchRules, createBranch);
router.put ('/:id', verifyToken, requireRole('owner'), branchRules, updateBranch);

module.exports = router;
