import express from 'express';
import { body, query } from 'express-validator';
import { protect, optionalAuth } from '../middleware/auth.js';
import { aiService } from '../services/aiService.js';
import { ChatSession } from '../models/ChatSession.js';
import { SearchAnalytics } from '../models/SearchAnalytics.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Validation middleware
const chatValidation = [
  body('message')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message must be between 1 and 1000 characters'),
  body('sessionId')
    .optional()
    .isString()
    .withMessage('Session ID must be a string')
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
  query('category')
    .optional()
    .isIn(['handbags', 'backpacks', 'tote-bags', 'crossbody', 'clutches', 'wallets', 'accessories'])
    .withMessage('Invalid category'),
  query('minPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum price must be positive'),
  query('maxPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum price must be positive')
];

// @desc    AI-powered chat
// @route   POST /api/ai/chat
// @access  Public (with optional authentication)
router.post('/chat', optionalAuth, chatValidation, async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    const userId = req.user?._id;

    // Process chat message with RAG
    const result = await aiService.processChat(message, sessionId, userId);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('AI chat error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process chat message'
    });
  }
});

// @desc    AI-powered product search
// @route   GET /api/ai/search
// @access  Public (with optional authentication)
router.get('/search', optionalAuth, searchValidation, async (req, res) => {
  try {
    const { q: query, page = 1, limit = 20, category, minPrice, maxPrice, brand, inStock, sort } = req.query;
    const userId = req.user?._id;
    const sessionId = req.headers['x-session-id'];

    // Build filters
    const filters = {
      page: parseInt(page),
      pageSize: parseInt(limit)
    };

    if (category) filters.category = category;
    if (minPrice || maxPrice) {
      filters.priceRange = {};
      if (minPrice) filters.priceRange.min = parseFloat(minPrice);
      if (maxPrice) filters.priceRange.max = parseFloat(maxPrice);
    }
    if (brand) filters.brand = brand;
    if (inStock === 'true') filters.inStock = true;
    if (sort) filters.sort = sort;

    // Perform AI-powered search
    const results = await aiService.searchProducts(query, filters, userId, sessionId);

    res.status(200).json({
      success: true,
      data: results
    });

  } catch (error) {
    logger.error('AI search error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform search'
    });
  }
});

// @desc    Get personalized product recommendations
// @route   GET /api/ai/recommendations
// @access  Private
router.get('/recommendations', protect, async (req, res) => {
  try {
    const { limit = 10, category, maxPrice } = req.query;
    const userId = req.user._id;

    const options = {
      limit: parseInt(limit),
      category,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined
    };

    const recommendations = await aiService.getPersonalizedRecommendations(userId, options);

    res.status(200).json({
      success: true,
      data: {
        recommendations,
        userId,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('AI recommendations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate recommendations'
    });
  }
});

// @desc    Get similar products
// @route   GET /api/ai/similar/:productId
// @access  Public
router.get('/similar/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 6 } = req.query;

    const similarProducts = await aiService.vectorService.findSimilarProducts(productId, {
      limit: parseInt(limit)
    });

    res.status(200).json({
      success: true,
      data: {
        productId,
        similarProducts
      }
    });

  } catch (error) {
    logger.error('Similar products error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to find similar products'
    });
  }
});

// @desc    Get chat session history
// @route   GET /api/ai/sessions/:sessionId
// @access  Public (with optional authentication)
router.get('/sessions/:sessionId', optionalAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?._id;

    const session = await ChatSession.findOne({ sessionId });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Check if user has access to this session
    if (session.user && userId && session.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        session: {
          sessionId: session.sessionId,
          messages: session.messages,
          context: session.context,
          analytics: session.analytics,
          status: session.status,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity
        }
      }
    });

  } catch (error) {
    logger.error('Get session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve session'
    });
  }
});

// @desc    End chat session
// @route   POST /api/ai/sessions/:sessionId/end
// @access  Public
router.post('/sessions/:sessionId/end', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { reason = 'user-ended' } = req.body;

    const session = await ChatSession.findOne({ sessionId });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    await session.end(reason);

    res.status(200).json({
      success: true,
      message: 'Session ended successfully'
    });

  } catch (error) {
    logger.error('End session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end session'
    });
  }
});

// @desc    Submit chat feedback
// @route   POST /api/ai/sessions/:sessionId/feedback
// @access  Public
router.post('/sessions/:sessionId/feedback', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { rating, comment, categories = [] } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'Rating must be between 1 and 5'
      });
    }

    const session = await ChatSession.findOne({ sessionId });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    await session.submitFeedback(rating, comment, categories);

    res.status(200).json({
      success: true,
      message: 'Feedback submitted successfully'
    });

  } catch (error) {
    logger.error('Submit feedback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit feedback'
    });
  }
});

// @desc    Track search analytics event
// @route   POST /api/ai/analytics/search/:searchId/event
// @access  Public
router.post('/analytics/search/:searchId/event', async (req, res) => {
  try {
    const { searchId } = req.params;
    const { type, productId, position, data = {} } = req.body;

    const searchAnalytics = await SearchAnalytics.findById(searchId);

    if (!searchAnalytics) {
      return res.status(404).json({
        success: false,
        error: 'Search analytics record not found'
      });
    }

    // Record the event based on type
    switch (type) {
      case 'click':
        await searchAnalytics.recordClick(productId, position, data.clickType);
        break;
      case 'cart_add':
        await searchAnalytics.recordCartAddition(productId, position, data.quantity);
        break;
      case 'conversion':
        await searchAnalytics.recordConversion(data.products, data.totalValue);
        break;
      case 'refinement':
        await searchAnalytics.addRefinement(data.refinementType, data.field, data.oldValue, data.newValue);
        break;
      case 'complete':
        await searchAnalytics.complete(data.exitAction, data.timeOnPage, data.scrollDepth);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid event type'
        });
    }

    res.status(200).json({
      success: true,
      message: 'Event recorded successfully'
    });

  } catch (error) {
    logger.error('Track analytics event error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record event'
    });
  }
});

// @desc    Get AI insights and analytics
// @route   GET /api/ai/insights
// @access  Private (Admin only)
router.get('/insights', protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { timeframe = '30d' } = req.query;

    const insights = await aiService.getAIInsights(timeframe);

    res.status(200).json({
      success: true,
      data: insights
    });

  } catch (error) {
    logger.error('AI insights error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate insights'
    });
  }
});

// @desc    Batch process products for AI
// @route   POST /api/ai/process-products
// @access  Private (Admin only)
router.post('/process-products', protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { productIds, batchSize = 50 } = req.body;

    // Start batch processing (run in background)
    aiService.batchProcessProducts(productIds, batchSize)
      .then(result => {
        logger.info('Batch processing completed:', result);
      })
      .catch(error => {
        logger.error('Batch processing failed:', error);
      });

    res.status(202).json({
      success: true,
      message: 'Batch processing started',
      data: {
        productIds: productIds?.length || 'all',
        batchSize,
        status: 'processing'
      }
    });

  } catch (error) {
    logger.error('Batch process products error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start batch processing'
    });
  }
});

// @desc    Get AI service status
// @route   GET /api/ai/status
// @access  Private (Admin only)
router.get('/status', protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const status = await aiService.ragService.getStats();

    res.status(200).json({
      success: true,
      data: {
        aiServiceInitialized: aiService.initialized,
        ragService: status,
        timestamp: new Date()
      }
    });

  } catch (error) {
    logger.error('AI status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AI status'
    });
  }
});

export default router;