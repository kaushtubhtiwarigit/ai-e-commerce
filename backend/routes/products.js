import express from 'express';
import { body, param, query } from 'express-validator';
import {
  getProducts,
  searchProductsWithAI,
  getProduct,
  getTrendingProducts,
  getRecommendations,
  createProduct,
  updateProduct,
  deleteProduct
} from '../controllers/productController.js';
import { protect, admin, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Validation middleware
const productValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Product name must be between 2 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters'),
  body('category')
    .isIn(['handbags', 'backpacks', 'tote-bags', 'crossbody', 'clutches', 'wallets', 'accessories'])
    .withMessage('Invalid category'),
  body('price.current')
    .isFloat({ min: 0 })
    .withMessage('Current price must be a positive number'),
  body('price.original')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Original price must be a positive number'),
  body('inventory.stock')
    .isInt({ min: 0 })
    .withMessage('Stock must be a non-negative integer'),
  body('brand')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Brand name cannot exceed 50 characters'),
  body('images')
    .isArray({ min: 1 })
    .withMessage('At least one image is required'),
  body('images.*.url')
    .isURL()
    .withMessage('Invalid image URL'),
  body('specifications.material')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Material description cannot exceed 100 characters'),
  body('specifications.color')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Color description cannot exceed 50 characters')
];

const updateProductValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Product name must be between 2 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters'),
  body('category')
    .optional()
    .isIn(['handbags', 'backpacks', 'tote-bags', 'crossbody', 'clutches', 'wallets', 'accessories'])
    .withMessage('Invalid category'),
  body('price.current')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Current price must be a positive number'),
  body('price.original')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Original price must be a positive number'),
  body('inventory.stock')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Stock must be a non-negative integer')
];

const searchValidation = [
  query('q')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search query must be between 1 and 200 characters'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('minPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum price must be positive'),
  query('maxPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum price must be positive')
];

const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid product ID')
];

// Public routes
router.get('/', optionalAuth, getProducts);
router.get('/search', optionalAuth, searchValidation, searchProductsWithAI);
router.get('/trending', getTrendingProducts);
router.get('/recommendations', protect, getRecommendations);
router.get('/:id', optionalAuth, idValidation, getProduct);

// Admin routes
router.post('/', protect, admin, productValidation, createProduct);
router.put('/:id', protect, admin, idValidation, updateProductValidation, updateProduct);
router.delete('/:id', protect, admin, idValidation, deleteProduct);

export default router;