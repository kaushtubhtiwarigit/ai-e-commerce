import { validationResult } from 'express-validator';
import { Order } from '../models/Order.js';
import { Cart } from '../models/Cart.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { aiService } from '../services/aiService.js';
import { logger } from '../utils/logger.js';
import { cache } from '../utils/cache.js';

// @desc    Create new order from cart
// @route   POST /api/orders
// @access  Private
export const createOrder = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user._id;
    const {
      shippingAddress,
      billingAddress,
      paymentMethod,
      shippingMethod = 'standard',
      giftMessage,
      isGift = false
    } = req.body;

    // Get user's cart
    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Cart is empty'
      });
    }

    // Validate cart items and check availability
    const validationIssues = await cart.validateItems();
    if (validationIssues.length > 0) {
      const criticalIssues = validationIssues.filter(issue => 
        issue.type === 'product-not-found' || issue.type === 'product-inactive'
      );
      
      if (criticalIssues.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Cart contains unavailable products',
          details: validationIssues
        });
      }

      // Auto-fix quantity issues
      for (const issue of validationIssues) {
        if (issue.type === 'insufficient-stock') {
          await cart.updateItem(issue.productId, issue.availableQuantity);
        }
      }
    }

    // Calculate order totals
    const orderCalculation = await calculateOrderTotals(cart, shippingMethod, shippingAddress);

    // Create order items with product snapshots
    const orderItems = cart.items.map(item => ({
      product: item.product._id,
      productSnapshot: {
        name: item.product.name,
        description: item.product.description,
        price: item.price,
        currency: item.product.price.currency || 'USD',
        image: item.product.images?.[0]?.url,
        sku: item.product.inventory?.sku,
        category: item.product.category
      },
      quantity: item.quantity,
      price: item.price,
      total: item.price * item.quantity
    }));

    // Generate order number
    const orderNumber = await Order.generateOrderNumber();

    // Create order
    const orderData = {
      orderNumber,
      user: userId,
      items: orderItems,
      subtotal: orderCalculation.subtotal,
      tax: orderCalculation.tax,
      shipping: {
        cost: orderCalculation.shipping.cost,
        method: shippingMethod,
        estimatedDelivery: orderCalculation.shipping.estimatedDelivery
      },
      discount: {
        amount: orderCalculation.discount,
        couponCode: cart.appliedCoupons?.[0]?.code
      },
      total: orderCalculation.total,
      shippingAddress,
      billingAddress,
      payment: {
        method: paymentMethod,
        status: 'pending'
      },
      isGift,
      giftMessage,
      // AI metadata
      aiMetadata: {
        recommendationSource: 'cart',
        sessionId: req.headers['x-session-id'],
        userSegment: await getUserSegment(userId),
        conversionPath: await getConversionPath(userId)
      }
    };

    const order = await Order.create(orderData);

    // Reserve inventory
    const reservationResults = await reserveInventory(cart.items);
    if (!reservationResults.success) {
      // Rollback order creation if inventory reservation fails
      await Order.findByIdAndDelete(order._id);
      return res.status(400).json({
        success: false,
        error: 'Failed to reserve inventory',
        details: reservationResults.errors
      });
    }

    // Update product analytics
    await updateProductAnalytics(cart.items);

    // Update user purchase history and AI data
    await updateUserPurchaseHistory(userId, order);

    // Track conversion in AI analytics
    await trackOrderConversion(userId, order, cart);

    // Clear cart after successful order creation
    await cart.clear();

    // Get order with populated data
    const populatedOrder = await Order.findById(order._id)
      .populate('items.product', 'name images category')
      .populate('user', 'name email');

    logger.info(`Order ${orderNumber} created for user ${userId}`);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        order: populatedOrder,
        reservations: reservationResults.details
      }
    });

  } catch (error) {
    logger.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create order'
    });
  }
};

// @desc    Get user's orders
// @route   GET /api/orders
// @access  Private
export const getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, dateFrom, dateTo } = req.query;
    const userId = req.user._id;

    // Build filter
    const filter = { user: userId };
    if (status) filter.status = status;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('items.product', 'name images category inventory.stock')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Order.countDocuments(filter)
    ]);

    // Add computed fields
    const enhancedOrders = orders.map(order => ({
      ...order,
      canCancel: canCancelOrder(order),
      canReturn: canReturnOrder(order),
      deliveryStatus: getDeliveryStatus(order)
    }));

    res.status(200).json({
      success: true,
      data: {
        orders: enhancedOrders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    logger.error('Error getting orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve orders'
    });
  }
};

// @desc    Get single order with AI recommendations
// @route   GET /api/orders/:id
// @access  Private
export const getOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const order = await Order.findOne({ _id: id, user: userId })
      .populate('items.product', 'name images category specifications')
      .populate('user', 'name email phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Get AI-powered reorder recommendations
    let reorderRecommendations = [];
    try {
      const productIds = order.items.map(item => item.product._id);
      
      // Get similar/complementary products for reordering
      reorderRecommendations = await aiService.getPersonalizedRecommendations(userId, {
        limit: 6,
        context: 'reorder',
        baseProducts: productIds
      });
    } catch (error) {
      logger.warn('Failed to get reorder recommendations:', error);
    }

    // Check product availability for reordering
    const reorderAvailability = await Promise.all(
      order.items.map(async (item) => {
        const product = await Product.findById(item.product._id).select('inventory.stock status price');
        return {
          productId: item.product._id,
          available: product?.status === 'active' && product.inventory.stock >= item.quantity,
          currentPrice: product?.price?.current,
          priceChanged: product?.price?.current !== item.price,
          inStock: product?.inventory?.stock || 0
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        order: {
          ...order.toObject(),
          canCancel: canCancelOrder(order),
          canReturn: canReturnOrder(order),
          deliveryStatus: getDeliveryStatus(order)
        },
        reorderRecommendations,
        reorderAvailability
      }
    });

  } catch (error) {
    logger.error('Error getting order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve order'
    });
  }
};

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private
export const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;

    const order = await Order.findOne({ _id: id, user: userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    if (!order.canCancel()) {
      return res.status(400).json({
        success: false,
        error: 'Order cannot be cancelled in current status'
      });
    }

    // Cancel order
    await order.updateStatus('cancelled', reason, userId);

    // Restore inventory
    await restoreInventory(order.items);

    // Add note
    await order.addNote(`Order cancelled by customer. Reason: ${reason}`, userId, 'customer');

    logger.info(`Order ${order.orderNumber} cancelled by user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: { order }
    });

  } catch (error) {
    logger.error('Error cancelling order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel order'
    });
  }
};

// @desc    Reorder items from previous order
// @route   POST /api/orders/:id/reorder
// @access  Private
export const reorderItems = async (req, res) => {
  try {
    const { id } = req.params;
    const { items: selectedItems } = req.body; // Array of {productId, quantity}
    const userId = req.user._id;

    const order = await Order.findOne({ _id: id, user: userId })
      .populate('items.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Get or create cart
    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = await Cart.create({ user: userId, items: [] });
    }

    const reorderResults = [];
    const itemsToReorder = selectedItems || order.items.map(item => ({
      productId: item.product._id,
      quantity: item.quantity
    }));

    // Add items to cart
    for (const item of itemsToReorder) {
      try {
        const product = await Product.findById(item.productId);
        
        if (!product || product.status !== 'active') {
          reorderResults.push({
            productId: item.productId,
            success: false,
            error: 'Product no longer available'
          });
          continue;
        }

        if (product.inventory.stock < item.quantity) {
          reorderResults.push({
            productId: item.productId,
            success: false,
            error: `Only ${product.inventory.stock} items available`
          });
          continue;
        }

        await cart.addItem(item.productId, item.quantity, product.price.current);
        reorderResults.push({
          productId: item.productId,
          success: true,
          quantity: item.quantity
        });

      } catch (error) {
        reorderResults.push({
          productId: item.productId,
          success: false,
          error: error.message
        });
      }
    }

    // Get updated cart
    const updatedCart = await Cart.findByUser(userId);

    const successfulItems = reorderResults.filter(r => r.success).length;
    const failedItems = reorderResults.filter(r => !r.success).length;

    res.status(200).json({
      success: true,
      message: `${successfulItems} items added to cart${failedItems > 0 ? `, ${failedItems} items unavailable` : ''}`,
      data: {
        cart: updatedCart,
        reorderResults
      }
    });

  } catch (error) {
    logger.error('Error reordering items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reorder items'
    });
  }
};

// Helper functions

async function calculateOrderTotals(cart, shippingMethod, shippingAddress) {
  const subtotal = cart.subtotal;
  
  // Calculate shipping
  const shippingRates = {
    'standard': 0,     // Free standard shipping
    'express': 15,     // Express shipping
    'overnight': 30    // Overnight shipping
  };
  const shippingCost = shippingRates[shippingMethod] || 0;

  // Calculate tax (simplified - would use actual tax service)
  const taxRate = getTaxRate(shippingAddress);
  const taxAmount = subtotal * taxRate;

  // Calculate discount from applied coupons
  const discountAmount = cart.appliedCoupons.reduce((total, coupon) => {
    if (coupon.discount.type === 'percentage') {
      return total + (subtotal * coupon.discount.value / 100);
    } else {
      return total + coupon.discount.value;
    }
  }, 0);

  const total = subtotal + taxAmount + shippingCost - discountAmount;

  // Calculate estimated delivery date
  const deliveryDays = {
    'standard': 5,
    'express': 2,
    'overnight': 1
  };
  const estimatedDelivery = new Date();
  estimatedDelivery.setDate(estimatedDelivery.getDate() + (deliveryDays[shippingMethod] || 5));

  return {
    subtotal,
    tax: { amount: taxAmount, rate: taxRate },
    shipping: { cost: shippingCost, estimatedDelivery },
    discount: discountAmount,
    total
  };
}

function getTaxRate(address) {
  // Simplified tax calculation - would use actual tax service
  const taxRates = {
    'CA': 0.08, // California
    'NY': 0.08, // New York
    'TX': 0.0625, // Texas
    'FL': 0.06, // Florida
  };
  return taxRates[address?.state] || 0.07; // Default 7%
}

async function reserveInventory(cartItems) {
  const results = { success: true, details: [], errors: [] };

  for (const item of cartItems) {
    try {
      const product = await Product.findById(item.product._id || item.product);
      
      if (!product) {
        results.errors.push(`Product ${item.product} not found`);
        results.success = false;
        continue;
      }

      if (product.inventory.stock < item.quantity) {
        results.errors.push(`Insufficient stock for ${product.name}`);
        results.success = false;
        continue;
      }

      // Reduce inventory
      await Product.findByIdAndUpdate(product._id, {
        $inc: { 'inventory.stock': -item.quantity }
      });

      results.details.push({
        productId: product._id,
        productName: product.name,
        quantity: item.quantity,
        newStock: product.inventory.stock - item.quantity
      });

    } catch (error) {
      results.errors.push(`Error reserving ${item.product}: ${error.message}`);
      results.success = false;
    }
  }

  return results;
}

async function restoreInventory(orderItems) {
  for (const item of orderItems) {
    try {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { 'inventory.stock': item.quantity }
      });
    } catch (error) {
      logger.warn(`Failed to restore inventory for product ${item.product}:`, error);
    }
  }
}

async function updateProductAnalytics(cartItems) {
  for (const item of cartItems) {
    try {
      await Product.findByIdAndUpdate(item.product._id || item.product, {
        $inc: { 'analytics.purchases': item.quantity },
        'analytics.lastPurchasedAt': new Date()
      });
    } catch (error) {
      logger.warn(`Failed to update analytics for product ${item.product}:`, error);
    }
  }
}

async function updateUserPurchaseHistory(userId, order) {
  try {
    await User.findByIdAndUpdate(userId, {
      $push: {
        purchaseHistory: {
          orderId: order._id,
          amount: order.total,
          timestamp: new Date()
        }
      }
    });
  } catch (error) {
    logger.warn(`Failed to update user purchase history:`, error);
  }
}

async function trackOrderConversion(userId, order, cart) {
  try {
    // Track conversion in search analytics if available
    const sessionId = order.aiMetadata?.sessionId;
    if (sessionId) {
      // Find recent search analytics for this session
      const searchAnalytics = await SearchAnalytics.findOne({
        sessionId,
        searchedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      }).sort({ searchedAt: -1 });

      if (searchAnalytics) {
        const conversionProducts = order.items.map(item => ({
          productId: item.product,
          quantity: item.quantity,
          price: item.price
        }));

        await searchAnalytics.recordConversion(conversionProducts, order.total);
      }
    }
  } catch (error) {
    logger.warn('Failed to track order conversion:', error);
  }
}

async function getUserSegment(userId) {
  try {
    const user = await User.findById(userId);
    const totalSpent = user.purchaseHistory?.reduce((sum, p) => sum + p.amount, 0) || 0;
    const orderCount = user.purchaseHistory?.length || 0;

    if (totalSpent > 1000) return 'vip';
    if (totalSpent > 500) return 'loyal';
    if (orderCount > 0) return 'returning';
    return 'new';
  } catch (error) {
    return 'unknown';
  }
}

async function getConversionPath(userId) {
  try {
    const user = await User.findById(userId);
    const recentSearches = user.searchHistory?.slice(-5).map(s => s.query) || [];
    return recentSearches;
  } catch (error) {
    return [];
  }
}

function canCancelOrder(order) {
  return ['pending', 'payment-pending', 'paid'].includes(order.status);
}

function canReturnOrder(order) {
  if (order.status !== 'delivered') return false;
  
  const deliveryDate = order.deliveredAt || order.createdAt;
  const daysSinceDelivery = (Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24);
  
  return daysSinceDelivery <= 30; // 30-day return window
}

function getDeliveryStatus(order) {
  if (order.status === 'delivered') return 'delivered';
  if (order.shipping?.estimatedDelivery) {
    const now = new Date();
    if (now > order.shipping.estimatedDelivery) return 'overdue';
    const daysUntil = Math.ceil((order.shipping.estimatedDelivery - now) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 1) return 'arriving-soon';
    return 'on-track';
  }
  return 'unknown';
}