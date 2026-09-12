import express from 'express';
import { query, param } from 'express-validator';
import { protect, admin } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { SearchAnalytics } from '../models/SearchAnalytics.js';
import { ChatSession } from '../models/ChatSession.js';
import { aiService } from '../services/aiService.js';
import { vectorService } from '../services/vectorService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// All routes require admin authentication
router.use(protect, admin);

// @desc    Get dashboard analytics
// @route   GET /api/admin/analytics/dashboard
// @access  Private/Admin
router.get('/analytics/dashboard', async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    const days = parseInt(timeframe) || 30;
    const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
    const endDate = new Date();

    // Get basic metrics
    const [
      totalUsers,
      totalProducts,
      totalOrders,
      totalRevenue,
      newUsers,
      activeProducts,
      recentOrders,
      searchAnalytics,
      chatAnalytics
    ] = await Promise.all([
      User.countDocuments(),
      Product.countDocuments({ status: 'active' }),
      Order.countDocuments({ status: { $nin: ['cancelled', 'failed'] } }),
      Order.aggregate([
        { $match: { status: { $nin: ['cancelled', 'failed'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      User.countDocuments({ createdAt: { $gte: startDate } }),
      Product.countDocuments({ 
        status: 'active',
        'inventory.stock': { $gt: 0 }
      }),
      Order.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $nin: ['cancelled', 'failed'] }
      }),
      SearchAnalytics.aggregate([
        { $match: { searchedAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: null,
            totalSearches: { $sum: 1 },
            avgResponseTime: { $avg: '$results.responseTime' },
            conversionRate: { $avg: { $cond: ['$business.converted', 1, 0] } }
          }
        }
      ]),
      ChatSession.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: null,
            totalSessions: { $sum: 1 },
            avgDuration: { $avg: '$analytics.sessionDuration' },
            satisfactionScore: { $avg: '$analytics.satisfactionScore' }
          }
        }
      ])
    ]);

    const revenue = totalRevenue[0]?.total || 0;
    const searchStats = searchAnalytics[0] || {};
    const chatStats = chatAnalytics[0] || {};

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalUsers,
          newUsers,
          totalProducts,
          activeProducts,
          totalOrders,
          recentOrders,
          totalRevenue: revenue
        },
        ai: {
          totalSearches: searchStats.totalSearches || 0,
          avgSearchResponseTime: searchStats.avgResponseTime || 0,
          searchConversionRate: (searchStats.conversionRate || 0) * 100,
          totalChatSessions: chatStats.totalSessions || 0,
          avgChatDuration: chatStats.avgDuration || 0,
          chatSatisfactionScore: chatStats.satisfactionScore || 0
        },
        timeframe: `${days}d`,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Error getting dashboard analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard analytics'
    });
  }
});

// @desc    Get sales analytics
// @route   GET /api/admin/analytics/sales
// @access  Private/Admin
router.get('/analytics/sales', async (req, res) => {
  try {
    const { timeframe = '30d', groupBy = 'day' } = req.query;
    const days = parseInt(timeframe) || 30;
    const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));

    // Group by format
    const dateFormats = {
      'hour': { $dateToString: { format: '%Y-%m-%d %H:00', date: '$createdAt' } },
      'day': { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
      'week': { 
        $dateToString: { 
          format: '%Y-%U', 
          date: '$createdAt' 
        } 
      },
      'month': { $dateToString: { format: '%Y-%m', date: '$createdAt' } }
    };

    const salesData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: { $nin: ['cancelled', 'failed'] }
        }
      },
      {
        $group: {
          _id: dateFormats[groupBy],
          orders: { $sum: 1 },
          revenue: { $sum: '$total' },
          avgOrderValue: { $avg: '$total' },
          items: { $sum: { $sum: '$items.quantity' } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get top products
    const topProducts = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: { $nin: ['cancelled', 'failed'] }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          totalSold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' },
          orders: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          name: '$product.name',
          category: '$product.category',
          totalSold: 1,
          revenue: 1,
          orders: 1
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        salesTrend: salesData,
        topProducts,
        timeframe: `${days}d`,
        groupBy
      }
    });

  } catch (error) {
    logger.error('Error getting sales analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sales analytics'
    });
  }
});

// @desc    Get AI analytics
// @route   GET /api/admin/analytics/ai
// @access  Private/Admin
router.get('/analytics/ai', async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    const aiInsights = await aiService.getAIInsights(timeframe);

    res.status(200).json({
      success: true,
      data: aiInsights
    });

  } catch (error) {
    logger.error('Error getting AI analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AI analytics'
    });
  }
});

// @desc    Get user analytics
// @route   GET /api/admin/analytics/users
// @access  Private/Admin
router.get('/analytics/users', async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    const days = parseInt(timeframe) || 30;
    const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));

    const [userStats, topUsers, userGrowth] = await Promise.all([
      // User statistics
      User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: {
              $sum: { $cond: ['$isActive', 1, 0] }
            },
            newUsers: {
              $sum: { 
                $cond: [
                  { $gte: ['$createdAt', startDate] },
                  1,
                  0
                ]
              }
            },
            avgOrderValue: { $avg: { $avg: '$purchaseHistory.amount' } }
          }
        }
      ]),
      // Top users by purchase value
      User.aggregate([
        {
          $match: {
            'purchaseHistory.0': { $exists: true }
          }
        },
        {
          $project: {
            name: 1,
            email: 1,
            totalSpent: { $sum: '$purchaseHistory.amount' },
            orderCount: { $size: '$purchaseHistory' },
            lastPurchase: { $max: '$purchaseHistory.timestamp' }
          }
        },
        { $sort: { totalSpent: -1 } },
        { $limit: 10 }
      ]),
      // User growth over time
      User.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            newUsers: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview: userStats[0] || {},
        topUsers,
        userGrowth,
        timeframe: `${days}d`
      }
    });

  } catch (error) {
    logger.error('Error getting user analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user analytics'
    });
  }
});

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, role } = req.query;

    // Build filter
    const filter = {};
    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') }
      ];
    }
    if (status) filter.isActive = status === 'active';
    if (role) filter.role = role;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    logger.error('Error getting users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get users'
    });
  }
});

// @desc    Update user status
// @route   PUT /api/admin/users/:id/status
// @access  Private/Admin
router.put('/users/:id/status', 
  [param('id').isMongoId().withMessage('Invalid user ID')],
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      const user = await User.findByIdAndUpdate(
        id,
        { isActive: Boolean(isActive) },
        { new: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      res.status(200).json({
        success: true,
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: { user }
      });

    } catch (error) {
      logger.error('Error updating user status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update user status'
      });
    }
  }
);

// @desc    Get all orders for admin
// @route   GET /api/admin/orders
// @access  Private/Admin
router.get('/orders', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      dateFrom, 
      dateTo,
      search 
    } = req.query;

    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }
    if (search) {
      filter.$or = [
        { orderNumber: new RegExp(search, 'i') },
        { 'user.email': new RegExp(search, 'i') }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('user', 'name email')
        .populate('items.product', 'name category')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Order.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    logger.error('Error getting admin orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get orders'
    });
  }
});

// @desc    Update order status
// @route   PUT /api/admin/orders/:id/status
// @access  Private/Admin
router.put('/orders/:id/status',
  [param('id').isMongoId().withMessage('Invalid order ID')],
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, note } = req.body;

      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      await order.updateStatus(status, note, req.user._id);

      res.status(200).json({
        success: true,
        message: 'Order status updated successfully',
        data: { order }
      });

    } catch (error) {
      logger.error('Error updating order status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update order status'
      });
    }
  }
);

// @desc    Get vector database status
// @route   GET /api/admin/ai/vector-status
// @access  Private/Admin
router.get('/ai/vector-status', async (req, res) => {
  try {
    const vectorStats = await vectorService.getStats();
    
    res.status(200).json({
      success: true,
      data: vectorStats
    });

  } catch (error) {
    logger.error('Error getting vector status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get vector database status'
    });
  }
});

// @desc    Reprocess products for AI
// @route   POST /api/admin/ai/reprocess-products
// @access  Private/Admin
router.post('/ai/reprocess-products', async (req, res) => {
  try {
    const { productIds, batchSize = 50 } = req.body;

    // Start reprocessing in background
    aiService.batchProcessProducts(productIds, batchSize)
      .then(result => {
        logger.info('AI reprocessing completed:', result);
      })
      .catch(error => {
        logger.error('AI reprocessing failed:', error);
      });

    res.status(202).json({
      success: true,
      message: 'AI reprocessing started',
      data: {
        productIds: productIds?.length || 'all',
        batchSize,
        status: 'processing'
      }
    });

  } catch (error) {
    logger.error('Error starting AI reprocessing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start AI reprocessing'
    });
  }
});

export default router;