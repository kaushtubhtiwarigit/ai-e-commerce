import { validationResult } from 'express-validator';
import { Cart } from '../models/Cart.js';
import { Product } from '../models/Product.js';
import { aiService } from '../services/aiService.js';
import { logger } from '../utils/logger.js';
import { cache } from '../utils/cache.js';

// @desc    Get user's cart with AI recommendations
// @route   GET /api/cart
// @access  Private
export const getCart = async (req, res) => {
  try {
    const userId = req.user._id;

    let cart = await Cart.findByUser(userId);
    
    if (!cart) {
      // Create empty cart if it doesn't exist
      cart = await Cart.create({ user: userId, items: [] });
    }

    // Validate cart items (check for price changes, availability)
    const validationIssues = await cart.validateItems();
    
    // Get AI recommendations based on cart contents
    let recommendations = [];
    if (cart.items.length > 0) {
      try {
        const cartProductIds = cart.items.map(item => item.product._id || item.product);
        
        // Get complementary product recommendations
        recommendations = await aiService.getPersonalizedRecommendations(userId, {
          limit: 8,
          exclude: cartProductIds,
          context: 'cart'
        });
      } catch (error) {
        logger.warn('Failed to get cart recommendations:', error);
      }
    }

    // Get frequently bought together recommendations
    let frequentlyBoughtTogether = [];
    if (cart.items.length > 0) {
      try {
        frequentlyBoughtTogether = await getFrequentlyBoughtTogether(cart.items);
      } catch (error) {
        logger.warn('Failed to get frequently bought together:', error);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        cart: {
          ...cart.toObject(),
          validationIssues
        },
        recommendations,
        frequentlyBoughtTogether,
        analytics: {
          abandonmentRisk: cart.aiMetadata?.abandonmentRisk || 0,
          conversionProbability: cart.aiMetadata?.conversionProbability || 0
        }
      }
    });

  } catch (error) {
    logger.error('Error getting cart:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cart'
    });
  }
};

// @desc    Add item to cart with AI-powered recommendations
// @route   POST /api/cart/items
// @access  Private
export const addToCart = async (req, res) => {
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

    const { productId, quantity = 1 } = req.body;
    const userId = req.user._id;

    // Verify product exists and is available
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    if (product.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Product is not available'
      });
    }

    if (product.inventory.stock < quantity) {
      return res.status(400).json({
        success: false,
        error: `Only ${product.inventory.stock} items available in stock`
      });
    }

    // Get or create cart
    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = await Cart.create({ user: userId, items: [] });
    }

    // Add item to cart
    await cart.addItem(productId, quantity, product.price.current);

    // Update product analytics
    await Product.findByIdAndUpdate(productId, {
      $inc: { 'analytics.cartAdds': 1 }
    });

    // Track user behavior for AI
    await trackCartAddBehavior(userId, productId, cart);

    // Generate AI recommendations for cart
    await updateCartRecommendations(cart, userId);

    // Get updated cart with populated items
    const updatedCart = await Cart.findByUser(userId);

    res.status(200).json({
      success: true,
      message: 'Item added to cart successfully',
      data: { cart: updatedCart }
    });

  } catch (error) {
    logger.error('Error adding to cart:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add item to cart'
    });
  }
};

// @desc    Update cart item quantity
// @route   PUT /api/cart/items/:productId
// @access  Private
export const updateCartItem = async (req, res) => {
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

    const { productId } = req.params;
    const { quantity } = req.body;
    const userId = req.user._id;

    // Verify product exists and check availability
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    if (quantity > 0 && product.inventory.stock < quantity) {
      return res.status(400).json({
        success: false,
        error: `Only ${product.inventory.stock} items available in stock`
      });
    }

    // Get cart
    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        error: 'Cart not found'
      });
    }

    // Update item
    await cart.updateItem(productId, quantity);

    // Update AI recommendations if cart changed significantly
    await updateCartRecommendations(cart, userId);

    // Get updated cart
    const updatedCart = await Cart.findByUser(userId);

    res.status(200).json({
      success: true,
      message: 'Cart item updated successfully',
      data: { cart: updatedCart }
    });

  } catch (error) {
    logger.error('Error updating cart item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update cart item'
    });
  }
};

// @desc    Remove item from cart
// @route   DELETE /api/cart/items/:productId
// @access  Private
export const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user._id;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        error: 'Cart not found'
      });
    }

    // Remove item
    await cart.removeItem(productId);

    // Update AI recommendations
    await updateCartRecommendations(cart, userId);

    // Get updated cart
    const updatedCart = await Cart.findByUser(userId);

    res.status(200).json({
      success: true,
      message: 'Item removed from cart successfully',
      data: { cart: updatedCart }
    });

  } catch (error) {
    logger.error('Error removing from cart:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove item from cart'
    });
  }
};

// @desc    Clear cart
// @route   DELETE /api/cart
// @access  Private
export const clearCart = async (req, res) => {
  try {
    const userId = req.user._id;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        error: 'Cart not found'
      });
    }

    await cart.clear();

    res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      data: { cart }
    });

  } catch (error) {
    logger.error('Error clearing cart:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cart'
    });
  }
};

// @desc    Apply coupon to cart
// @route   POST /api/cart/coupon
// @access  Private
export const applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.user._id;

    if (!couponCode || couponCode.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Coupon code is required'
      });
    }

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        error: 'Cart not found'
      });
    }

    if (cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot apply coupon to empty cart'
      });
    }

    // Validate coupon (this is a simplified version)
    const discount = await validateCoupon(couponCode, cart.subtotal);
    if (!discount.valid) {
      return res.status(400).json({
        success: false,
        error: discount.error
      });
    }

    // Apply coupon
    await cart.applyCoupon(couponCode, discount.type, discount.value);

    // Get updated cart
    const updatedCart = await Cart.findByUser(userId);

    res.status(200).json({
      success: true,
      message: 'Coupon applied successfully',
      data: { 
        cart: updatedCart,
        discount: {
          code: couponCode,
          type: discount.type,
          value: discount.value,
          amount: discount.amount
        }
      }
    });

  } catch (error) {
    logger.error('Error applying coupon:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to apply coupon'
    });
  }
};

// @desc    Get cart recommendations
// @route   GET /api/cart/recommendations
// @access  Private
export const getCartRecommendations = async (req, res) => {
  try {
    const userId = req.user._id;
    const { type = 'all', limit = 8 } = req.query;

    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart || cart.items.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          recommendations: [],
          message: 'Add items to cart to see recommendations'
        }
      });
    }

    let recommendations = [];

    if (type === 'all' || type === 'complementary') {
      // Get complementary product recommendations
      const complementary = await getComplementaryProducts(cart.items, userId);
      recommendations.push(...complementary.map(rec => ({ ...rec, type: 'complementary' })));
    }

    if (type === 'all' || type === 'frequently-bought') {
      // Get frequently bought together
      const frequentlyBought = await getFrequentlyBoughtTogether(cart.items);
      recommendations.push(...frequentlyBought.map(rec => ({ ...rec, type: 'frequently-bought' })));
    }

    if (type === 'all' || type === 'upgrade') {
      // Get upgrade recommendations (higher-priced similar products)
      const upgrades = await getUpgradeRecommendations(cart.items);
      recommendations.push(...upgrades.map(rec => ({ ...rec, type: 'upgrade' })));
    }

    // Remove duplicates and limit results
    const uniqueRecommendations = recommendations
      .filter((rec, index, self) => 
        index === self.findIndex(r => r._id?.toString() === rec._id?.toString())
      )
      .slice(0, parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        recommendations: uniqueRecommendations,
        cartValue: cart.subtotal,
        itemCount: cart.itemCount
      }
    });

  } catch (error) {
    logger.error('Error getting cart recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommendations'
    });
  }
};

// Helper functions

async function trackCartAddBehavior(userId, productId, cart) {
  try {
    // Track in user model
    await User.findByIdAndUpdate(userId, {
      $push: {
        'analytics.cartAdds': {
          productId,
          timestamp: new Date()
        }
      }
    });

    // Update cart AI metadata
    const cartValue = cart.subtotal;
    let valueSegment = 'low';
    if (cartValue > 200) valueSegment = 'high';
    else if (cartValue > 100) valueSegment = 'medium';

    cart.aiMetadata.cartValue = valueSegment;
    cart.aiMetadata.conversionProbability = calculateConversionProbability(cart);
    
    await cart.save();
  } catch (error) {
    logger.warn('Failed to track cart behavior:', error);
  }
}

async function updateCartRecommendations(cart, userId) {
  try {
    if (cart.items.length === 0) return;

    // Get AI recommendations based on cart content
    const recommendations = await aiService.getPersonalizedRecommendations(userId, {
      limit: 10,
      context: 'cart',
      exclude: cart.items.map(item => item.product)
    });

    // Update cart with AI recommendations
    for (const rec of recommendations.slice(0, 5)) {
      await cart.addRecommendation(rec.productId || rec._id, rec.similarity || 0.8, 'ai-personalized');
    }
  } catch (error) {
    logger.warn('Failed to update cart recommendations:', error);
  }
}

async function getFrequentlyBoughtTogether(cartItems) {
  try {
    // This would analyze order history to find products frequently bought together
    // For now, return products from same categories
    const categories = [...new Set(cartItems.map(item => item.product?.category).filter(Boolean))];
    
    if (categories.length === 0) return [];

    const products = await Product.find({
      category: { $in: categories },
      status: 'active',
      _id: { $nin: cartItems.map(item => item.product._id || item.product) }
    })
    .sort({ 'analytics.purchases': -1 })
    .limit(4)
    .lean();

    return products;
  } catch (error) {
    logger.warn('Failed to get frequently bought together:', error);
    return [];
  }
}

async function getComplementaryProducts(cartItems, userId) {
  try {
    const recommendations = await aiService.getPersonalizedRecommendations(userId, {
      limit: 4,
      context: 'complementary',
      exclude: cartItems.map(item => item.product._id || item.product)
    });

    return recommendations;
  } catch (error) {
    logger.warn('Failed to get complementary products:', error);
    return [];
  }
}

async function getUpgradeRecommendations(cartItems) {
  try {
    const avgPrice = cartItems.reduce((sum, item) => sum + item.price, 0) / cartItems.length;
    const categories = [...new Set(cartItems.map(item => item.product?.category).filter(Boolean))];

    const upgrades = await Product.find({
      category: { $in: categories },
      'price.current': { $gte: avgPrice * 1.2 }, // At least 20% more expensive
      status: 'active',
      _id: { $nin: cartItems.map(item => item.product._id || item.product) }
    })
    .sort({ 'analytics.rating.average': -1 })
    .limit(3)
    .lean();

    return upgrades;
  } catch (error) {
    logger.warn('Failed to get upgrade recommendations:', error);
    return [];
  }
}

async function validateCoupon(couponCode, subtotal) {
  // Simplified coupon validation
  const coupons = {
    'WELCOME10': { type: 'percentage', value: 10, minAmount: 50 },
    'SAVE20': { type: 'fixed', value: 20, minAmount: 100 },
    'FREESHIP': { type: 'shipping', value: 0, minAmount: 75 }
  };

  const coupon = coupons[couponCode.toUpperCase()];
  if (!coupon) {
    return { valid: false, error: 'Invalid coupon code' };
  }

  if (subtotal < coupon.minAmount) {
    return { valid: false, error: `Minimum order amount of $${coupon.minAmount} required` };
  }

  let amount = 0;
  if (coupon.type === 'percentage') {
    amount = (subtotal * coupon.value) / 100;
  } else if (coupon.type === 'fixed') {
    amount = coupon.value;
  }

  return {
    valid: true,
    type: coupon.type,
    value: coupon.value,
    amount
  };
}

function calculateConversionProbability(cart) {
  let probability = 0.3; // Base probability

  // Increase based on cart value
  if (cart.subtotal > 100) probability += 0.2;
  if (cart.subtotal > 200) probability += 0.2;

  // Increase based on item count
  if (cart.items.length > 2) probability += 0.1;

  // Decrease if cart is old
  const ageHours = (Date.now() - cart.createdAt.getTime()) / (1000 * 60 * 60);
  if (ageHours > 24) probability -= 0.1;
  if (ageHours > 72) probability -= 0.2;

  return Math.max(0, Math.min(1, probability));
}