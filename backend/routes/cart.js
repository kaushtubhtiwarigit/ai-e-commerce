import express from 'express';
import { body, param, query } from 'express-validator';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  applyCoupon,
  getCartRecommendations
} from '../controllers/cartController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Validation middleware
const addToCartValidation = [
  body('productId')
    .isMongoId()
    .withMessage('Invalid product ID'),
  body('quantity')
    .optional()
    .isInt({ min: 1, max: 99 })
    .withMessage('Quantity must be between 1 and 99')
];

const updateCartValidation = [
  param('productId')
    .isMongoId()
    .withMessage('Invalid product ID'),
  body('quantity')
    .isInt({ min: 0, max: 99 })
    .withMessage('Quantity must be between 0 and 99')
];

const removeFromCartValidation = [
  param('productId')
    .isMongoId()
    .withMessage('Invalid product ID')
];

const applyCouponValidation = [
  body('couponCode')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Coupon code is required and must not exceed 50 characters')
];

const recommendationsValidation = [
  query('type')
    .optional()
    .isIn(['all', 'complementary', 'frequently-bought', 'upgrade'])
    .withMessage('Invalid recommendation type'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Limit must be between 1 and 20')
];

// All cart routes require authentication
router.use(protect);

// Cart CRUD operations
router.get('/', getCart);
router.post('/items', addToCartValidation, addToCart);
router.put('/items/:productId', updateCartValidation, updateCartItem);
router.delete('/items/:productId', removeFromCartValidation, removeFromCart);
router.delete('/', clearCart);

// Cart enhancements
router.post('/coupon', applyCouponValidation, applyCoupon);
router.get('/recommendations', recommendationsValidation, getCartRecommendations);

export default router;