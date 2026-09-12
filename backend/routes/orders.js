import express from 'express';
import { body, param, query } from 'express-validator';
import {
  createOrder,
  getOrders,
  getOrder,
  cancelOrder,
  reorderItems
} from '../controllers/orderController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Validation middleware
const createOrderValidation = [
  body('shippingAddress')
    .isObject()
    .withMessage('Shipping address is required'),
  body('shippingAddress.firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name is required and must not exceed 50 characters'),
  body('shippingAddress.lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name is required and must not exceed 50 characters'),
  body('shippingAddress.address1')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Address is required and must not exceed 100 characters'),
  body('shippingAddress.city')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('City is required and must not exceed 50 characters'),
  body('shippingAddress.state')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('State is required and must be between 2 and 50 characters'),
  body('shippingAddress.zipCode')
    .trim()
    .isLength({ min: 5, max: 10 })
    .withMessage('ZIP code is required and must be between 5 and 10 characters'),
  body('shippingAddress.country')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Country is required and must be between 2 and 50 characters'),
  body('billingAddress')
    .isObject()
    .withMessage('Billing address is required'),
  body('paymentMethod')
    .isIn(['credit-card', 'debit-card', 'paypal', 'apple-pay', 'google-pay'])
    .withMessage('Invalid payment method'),
  body('shippingMethod')
    .optional()
    .isIn(['standard', 'express', 'overnight'])
    .withMessage('Invalid shipping method'),
  body('giftMessage')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Gift message cannot exceed 500 characters')
];

const getOrdersValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('status')
    .optional()
    .isIn(['pending', 'payment-pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'returned', 'refunded'])
    .withMessage('Invalid order status'),
  query('dateFrom')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format for dateFrom'),
  query('dateTo')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format for dateTo')
];

const orderIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid order ID')
];

const cancelOrderValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid order ID'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Cancellation reason cannot exceed 500 characters')
];

const reorderValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid order ID'),
  body('items')
    .optional()
    .isArray()
    .withMessage('Items must be an array'),
  body('items.*.productId')
    .isMongoId()
    .withMessage('Invalid product ID in items'),
  body('items.*.quantity')
    .isInt({ min: 1, max: 99 })
    .withMessage('Quantity must be between 1 and 99')
];

// All routes require authentication
router.use(protect);

// Order management routes
router.post('/', createOrderValidation, createOrder);
router.get('/', getOrdersValidation, getOrders);
router.get('/:id', orderIdValidation, getOrder);
router.put('/:id/cancel', cancelOrderValidation, cancelOrder);
router.post('/:id/reorder', reorderValidation, reorderItems);

export default router;