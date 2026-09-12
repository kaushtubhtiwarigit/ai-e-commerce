import express from 'express';
import { query, param } from 'express-validator';
import { protect, optionalAuth } from '../middleware/auth.js';
import { recommendationService } from '../services/recommendationService.js';
import { aiService } from '../services/aiService.js';
import { analyticsService } from '../services/analyticsService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Validation middleware
const recommendationValidation = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('algorithm')
    .optional()
    .isIn(['collaborative_filtering', 'content_based', 'hybrid', 'trending'])
    .withMessage('Invalid algorithm'),
  query('context')
    .optional()
    .isIn(['homepage', 'product_detail', 'cart', 'checkout', 'post_purchase', 'search_results', 'category_browse'])
    .withMessage('Invalid context'),
  query('category')
    .optional()
    .isIn(['handbags', 'backpacks', 'tote-bags', 'crossbody', 'clutches', 'wallets', 'accessories'])
    .withMessage('Invalid category'),
  query('diversityFactor')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Diversity factor must be between 0 and 1')
];

const productIdValidation = [
  param('productId')
    .isMongoId()
    .withMessage('Invalid product ID')
];

// @desc    Get personalized recommendations for authenticated user
// @route   GET /api/recommendations/personal
// @access  Private
router.get('/personal', protect, recommendationValidation, async (req, res) => {
  try {
    const { 
      limit = 10, 
      algorithm = 'hybrid', 
      context = 'homepage',
      category,
      diversityFactor = 0.3
    } = req.query;

    const userId = req.user._id;

    const recommendations = await recommendationService.getPersonalizedRecommendations(userId, {
      limit: parseInt(limit),
      algorithm,
      context,
      categoryFilter: category,
      diversityFactor: parseFloat(diversityFactor)
    });

    res.status(200).json({
      success: true,
      data: {
        recommendations,
        userId,
        algorithm,
        context,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Error getting personal recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get personalized recommendations'
    });
  }
});

// @desc    Get contextual recommendations based on current user activity
// @route   POST /api/recommendations/contextual
// @access  Private
router.post('/contextual', protect, async (req, res) => {
  try {
    const { context, contextData = {} } = req.body;
    const userId = req.user._id;

    if (!context) {
      return res.status(400).json({
        success: false,
        error: 'Context is required'
      });
    }

    const recommendations = await recommendationService.getContextualRecommendations(
      userId, 
      context, 
      contextData
    );

    res.status(200).json({
      success: true,
      data: {
        recommendations,
        context,
        contextData,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Error getting contextual recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get contextual recommendations'
    });
  }
});

// @desc    Get similar products based on a specific product
// @route   GET /api/recommendations/similar/:productId
// @access  Public
router.get('/similar/:productId', optionalAuth, productIdValidation, recommendationValidation, async (req, res) => {
  try {
    const { productId } = req.params;
    const { 
      limit = 6, 
      algorithm = 'content_based',
      threshold = 0.7
    } = req.query;

    const similarProducts = await recommendationService.getProductSimilarities(productId, {
      limit: parseInt(limit),
      algorithm,
      threshold: parseFloat(threshold)
    });

    res.status(200).json({
      success: true,
      data: {
        productId,
        similarProducts,
        algorithm,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Error getting similar products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get similar products'
    });
  }
});

// @desc    Get trending products with AI analytics
// @route   GET /api/recommendations/trending
// @access  Public
router.get('/trending', recommendationValidation, async (req, res) => {
  try {
    const { 
      limit = 10, 
      timeframe = '7d',
      category,
      includeNewProducts = true
    } = req.query;

    const trendingProducts = await recommendationService.getTrendingProducts({
      limit: parseInt(limit),
      timeframe,
      category,
      includeNewProducts: includeNewProducts === 'true'
    });

    res.status(200).json({
      success: true,
      data: {
        trendingProducts,
        timeframe,
        category,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Error getting trending products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get trending products'
    });
  }
});

// @desc    Get seasonal recommendations
// @route   GET /api/recommendations/seasonal
// @access  Private
router.get('/seasonal', protect, recommendationValidation, async (req, res) => {
  try {
    const { limit = 8, season } = req.query;
    const userId = req.user._id;

    const seasonalRecommendations = await recommendationService.getSeasonalRecommendations(userId, {
      limit: parseInt(limit),
      season
    });

    res.status(200).json({
      success: true,
      data: {
        recommendations: seasonalRecommendations,
        season: season || 'current',
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Error getting seasonal recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get seasonal recommendations'
    });
  }
});

// @desc    Get frequently bought together products
// @route   GET /api/recommendations/frequently-bought/:productId
// @access  Public
router.get('/frequently-bought/:productId', productIdValidation, async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 4 } = req.query;

    const recommendations = await recommendationService.getProductSimilarities(productId, {
      limit: parseInt(limit),
      algorithm: 'frequently_bought_together'
    });

    res.status(200).json({
      success: true,
      data: {
        productId,
        frequentlyBoughtTogether: recommendations,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Error getting frequently bought together:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get frequently bought together products'
    });
  }
});

// @desc    Get cart-based recommendations
// @route   POST /api/recommendations/cart
// @access  Private
router.post('/cart', protect, async (req, res) => {
  try {
    const { cartItems, limit = 6 } = req.body;
    const userId = req.user._id;

    if (!cartItems || !Array.isArray(cartItems)) {
      return res.status(400).json({
        success: false,
        error: 'Cart items array is required'
      });
    }

    const recommendations = await recommendationService.getContextualRecommendations(
      userId,
      'cart',
      { cartItems, limit: parseInt(limit) }
    );

    res.status(200).json({
      success: true,
      data: {
        recommendations,
        cartItemCount: cartItems.length,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Error getting cart recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cart recommendations'
    });
  }
});

// @desc    Get post-purchase recommendations
// @route   GET /api/recommendations/post-purchase/:orderId
// @access  Private
router.get('/post-purchase/:orderId', protect, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { limit = 8 } = req.query;
    const userId = req.user._id;

    const recommendations = await recommendationService.getContextualRecommendations(
      userId,
      'post_purchase',
      { orderId, limit: parseInt(limit) }
    );

    res.status(200).json({
      success: true,
      data: {
        recommendations,
        orderId,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Error getting post-purchase recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get post-purchase recommendations'
    });
  }
});

// @desc    Get recommendation analytics (Admin only)
// @route   GET /api/recommendations/analytics
// @access  Private/Admin
router.get('/analytics', protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { timeframe = '30d' } = req.query;

    // Get recommendation analytics from analytics service
    const analytics = await analyticsService.getDashboardAnalytics(timeframe);

    res.status(200).json({
      success: true,
      data: {
        recommendations: analytics.ai?.recommendations || {},
        timeframe,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Error getting recommendation analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommendation analytics'
    });
  }
});

// @desc    Track recommendation interaction (click, view, purchase)
// @route   POST /api/recommendations/track
// @access  Public
router.post('/track', optionalAuth, async (req, res) => {
  try {
    const { 
      recommendationType, 
      productId, 
      action, // 'view', 'click', 'add_to_cart', 'purchase'
      context,
      metadata = {}
    } = req.body;

    if (!recommendationType || !productId || !action) {
      return res.status(400).json({
        success: false,
        error: 'Recommendation type, product ID, and action are required'
      });
    }

    // Track the interaction (this would typically go to an analytics service)
    logger.info('Recommendation interaction tracked', {
      userId: req.user?._id,
      recommendationType,
      productId,
      action,
      context,
      metadata,
      timestamp: new Date()
    });

    // Here you would typically:
    // 1. Store the interaction in a database
    // 2. Update recommendation effectiveness metrics
    // 3. Use the data for improving future recommendations

    res.status(200).json({
      success: true,
      message: 'Interaction tracked successfully'
    });

  } catch (error) {
    logger.error('Error tracking recommendation interaction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track interaction'
    });
  }
});

export default router;