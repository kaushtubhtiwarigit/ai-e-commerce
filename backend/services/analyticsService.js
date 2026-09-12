import { User } from '../models/User.js';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { SearchAnalytics } from '../models/SearchAnalytics.js';
import { ChatSession } from '../models/ChatSession.js';
import { logger } from '../utils/logger.js';
import { cache } from '../utils/cache.js';

class AnalyticsService {
  constructor() {
    this.metrics = {
      USER_ENGAGEMENT: 'user_engagement',
      USER_RETENTION: 'user_retention',
      USER_LIFETIME_VALUE: 'user_lifetime_value',
      PRODUCT_PERFORMANCE: 'product_performance',
      PRODUCT_POPULARITY: 'product_popularity',
      INVENTORY_INSIGHTS: 'inventory_insights',
      CONVERSION_FUNNEL: 'conversion_funnel',
      SALES_PERFORMANCE: 'sales_performance',
      REVENUE_ANALYSIS: 'revenue_analysis',
      SEARCH_PERFORMANCE: 'search_performance',
      RECOMMENDATION_EFFECTIVENESS: 'recommendation_effectiveness',
      CHAT_ANALYTICS: 'chat_analytics'
    };
  }

  async getDashboardAnalytics(timeframe = '30d') {
    try {
      const cacheKey = `dashboard:analytics:${timeframe}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const days = parseInt(timeframe) || 30;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const endDate = new Date();

      const [userMetrics, salesMetrics, productMetrics, aiMetrics] = await Promise.all([
        this.getUserMetrics(startDate, endDate),
        this.getSalesMetrics(startDate, endDate),
        this.getProductMetrics(startDate, endDate),
        this.getAIMetrics(startDate, endDate)
      ]);

      const dashboard = {
        timeframe,
        period: { startDate, endDate },
        overview: {
          totalRevenue: salesMetrics.totalRevenue || 0,
          totalOrders: salesMetrics.totalOrders || 0,
          totalUsers: userMetrics.totalUsers || 0,
          activeProducts: productMetrics.activeProducts || 0,
          conversionRate: salesMetrics.conversionRate || 0,
          averageOrderValue: salesMetrics.averageOrderValue || 0
        },
        users: userMetrics,
        sales: salesMetrics,
        products: productMetrics,
        ai: aiMetrics,
        generatedAt: new Date()
      };

      await cache.set(cacheKey, dashboard, 1800);
      return dashboard;
    } catch (error) {
      logger.error('Error generating dashboard analytics:', error);
      throw error;
    }
  }

  async getUserMetrics(startDate, endDate) {
    try {
      const [userStats, engagementStats, retentionStats, segmentStats] = await Promise.all([
        User.aggregate([
          {
            $facet: {
              total: [{ $count: 'count' }],
              new: [
                { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
                { $count: 'count' }
              ],
              active: [
                { $match: { isActive: true } },
                { $count: 'count' }
              ],
              withPurchases: [
                { $match: { 'purchaseHistory.0': { $exists: true } } },
                { $count: 'count' }
              ]
            }
          }
        ]),
        User.aggregate([
          {
            $project: {
              viewCount: { $size: { $ifNull: ['$viewHistory', []] } },
              searchCount: { $size: { $ifNull: ['$searchHistory', []] } },
              purchaseCount: { $size: { $ifNull: ['$purchaseHistory', []] } },
              avgSessionTime: { $avg: '$sessionHistory.duration' },
              lastActivity: { $max: '$viewHistory.timestamp' }
            }
          },
          {
            $group: {
              _id: null,
              avgViewsPerUser: { $avg: '$viewCount' },
              avgSearchesPerUser: { $avg: '$searchCount' },
              avgPurchasesPerUser: { $avg: '$purchaseCount' },
              avgSessionTime: { $avg: '$avgSessionTime' },
              activeUsersLastWeek: {
                $sum: {
                  $cond: [
                    { $gte: ['$lastActivity', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] },
                    1,
                    0
                  ]
                }
              }
            }
          }
        ]),
        this.calculateUserRetention(startDate, endDate),
        this.getUserSegmentation()
      ]);

      const stats = userStats[0] || {};
      const engagement = engagementStats[0] || {};

      return {
        totalUsers: stats.total?.[0]?.count || 0,
        newUsers: stats.new?.[0]?.count || 0,
        activeUsers: stats.active?.[0]?.count || 0,
        usersWithPurchases: stats.withPurchases?.[0]?.count || 0,
        engagement: {
          avgViewsPerUser: Math.round(engagement.avgViewsPerUser || 0),
          avgSearchesPerUser: Math.round(engagement.avgSearchesPerUser || 0),
          avgPurchasesPerUser: Math.round((engagement.avgPurchasesPerUser || 0) * 100) / 100,
          avgSessionTime: Math.round(engagement.avgSessionTime || 0),
          activeUsersLastWeek: engagement.activeUsersLastWeek || 0
        },
        retention: retentionStats,
        segmentation: segmentStats
      };
    } catch (error) {
      logger.error('Error calculating user metrics:', error);
      return {};
    }
  }

  async getSalesMetrics(startDate, endDate) {
    try {
      const [salesStats, conversionFunnel, revenueBreakdown, topProducts] = await Promise.all([
        Order.aggregate([
          {
            $facet: {
              total: [
                { $match: { status: { $nin: ['cancelled', 'failed'] } } },
                {
                  $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$total' },
                    avgOrderValue: { $avg: '$total' },
                    totalItems: { $sum: { $sum: '$items.quantity' } }
                  }
                }
              ],
              period: [
                {
                  $match: {
                    createdAt: { $gte: startDate, $lte: endDate },
                    status: { $nin: ['cancelled', 'failed'] }
                  }
                },
                {
                  $group: {
                    _id: null,
                    periodOrders: { $sum: 1 },
                    periodRevenue: { $sum: '$total' },
                    periodAvgOrderValue: { $avg: '$total' }
                  }
                }
              ]
            }
          }
        ]),
        SearchAnalytics.getConversionFunnel ? SearchAnalytics.getConversionFunnel(startDate, endDate) : [{}],
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: startDate, $lte: endDate },
              status: { $nin: ['cancelled', 'failed'] }
            }
          },
          { $unwind: '$items' },
          {
            $lookup: {
              from: 'products',
              localField: 'items.product',
              foreignField: '_id',
              as: 'product'
            }
          },
          { $unwind: '$product' },
          {
            $group: {
              _id: '$product.category',
              revenue: { $sum: '$items.total' },
              orders: { $sum: 1 },
              units: { $sum: '$items.quantity' }
            }
          },
          { $sort: { revenue: -1 } }
        ]),
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: startDate, $lte: endDate },
              status: { $nin: ['cancelled', 'failed'] }
            }
          },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.product',
              revenue: { $sum: '$items.total' },
              unitsSold: { $sum: '$items.quantity' },
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
              revenue: 1,
              unitsSold: 1,
              orders: 1
            }
          },
          { $sort: { revenue: -1 } },
          { $limit: 10 }
        ])
      ]);

      const stats = salesStats[0] || {};
      const funnel = conversionFunnel[0] || {};

      return {
        totalOrders: stats.total?.[0]?.totalOrders || 0,
        totalRevenue: Math.round((stats.total?.[0]?.totalRevenue || 0) * 100) / 100,
        averageOrderValue: Math.round((stats.total?.[0]?.avgOrderValue || 0) * 100) / 100,
        totalItems: stats.total?.[0]?.totalItems || 0,
        periodOrders: stats.period?.[0]?.periodOrders || 0,
        periodRevenue: Math.round((stats.period?.[0]?.periodRevenue || 0) * 100) / 100,
        conversionRate:
          funnel.totalSearches > 0
            ? Math.round((funnel.searchesWithConversions / funnel.totalSearches) * 10000) / 100
            : 0,
        conversionFunnel: {
          searches: funnel.totalSearches || 0,
          searchesWithResults: funnel.searchesWithResults || 0,
          searchesWithClicks: funnel.searchesWithClicks || 0,
          searchesWithCartAdds: funnel.searchesWithCartAdds || 0,
          searchesWithConversions: funnel.searchesWithConversions || 0
        },
        revenueByCategory: revenueBreakdown,
        topProducts
      };
    } catch (error) {
      logger.error('Error calculating sales metrics:', error);
      return {};
    }
  }

  async getProductMetrics(startDate, endDate) {
    try {
      const [productStats, performanceMetrics, inventoryInsights] = await Promise.all([
        Product.aggregate([
          {
            $facet: {
              total: [{ $count: 'count' }],
              active: [
                { $match: { status: 'active' } },
                { $count: 'count' }
              ],
              outOfStock: [
                { $match: { 'inventory.stock': 0 } },
                { $count: 'count' }
              ],
              lowStock: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $gt: ['$inventory.stock', 0] },
                        { $lte: ['$inventory.stock', '$inventory.lowStockThreshold'] }
                      ]
                    }
                  }
                },
                { $count: 'count' }
              ]
            }
          }
        ]),
        Product.aggregate([
          { $match: { status: 'active' } },
          {
            $project: {
              name: 1,
              category: 1,
              price: 1,
              views: '$analytics.views',
              purchases: '$analytics.purchases',
              cartAdds: '$analytics.cartAdds',
              rating: '$analytics.rating.average',
              ratingCount: '$analytics.rating.count',
              conversionRate: {
                $cond: [
                  { $gt: ['$analytics.views', 0] },
                  { $divide: ['$analytics.purchases', '$analytics.views'] },
                  0
                ]
              }
            }
          },
          { $sort: { conversionRate: -1 } },
          { $limit: 20 }
        ]),
        Product.aggregate([
          { $match: { status: 'active' } },
          {
            $group: {
              _id: '$category',
              totalProducts: { $sum: 1 },
              totalStock: { $sum: '$inventory.stock' },
              avgPrice: { $avg: '$price.current' },
              outOfStockCount: {
                $sum: { $cond: [{ $eq: ['$inventory.stock', 0] }, 1, 0] }
              },
              lowStockCount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gt: ['$inventory.stock', 0] },
                        { $lte: ['$inventory.stock', '$inventory.lowStockThreshold'] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              }
            }
          }
        ])
      ]);

      const stats = productStats[0] || {};
      return {
        totalProducts: stats.total?.[0]?.count || 0,
        activeProducts: stats.active?.[0]?.count || 0,
        outOfStockProducts: stats.outOfStock?.[0]?.count || 0,
        lowStockProducts: stats.lowStock?.[0]?.count || 0,
        topPerformers: performanceMetrics,
        inventoryByCategory: inventoryInsights
      };
    } catch (error) {
      logger.error('Error calculating product metrics:', error);
      return {};
    }
  }

  async getAIMetrics(startDate, endDate) {
    try {
      const [searchMetrics, chatMetrics, recommendationMetrics] = await Promise.all([
        SearchAnalytics.aggregate([
          { $match: { searchedAt: { $gte: startDate, $lte: endDate } } },
          {
            $group: {
              _id: null,
              totalSearches: { $sum: 1 },
              avgResponseTime: { $avg: '$results.responseTime' },
              avgResultsReturned: { $avg: '$results.returned' },
              vectorSearches: {
                $sum: { $cond: [{ $eq: ['$results.method', 'vector-search'] }, 1, 0] }
              },
              hybridSearches: {
                $sum: { $cond: [{ $eq: ['$results.method', 'hybrid'] }, 1, 0] }
              },
              conversions: { $sum: { $cond: ['$business.converted', 1, 0] } },
              totalRevenue: { $sum: '$business.revenue.immediate' }
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
              avgMessagesPerSession: { $avg: '$analytics.totalMessages' },
              avgResponseTime: { $avg: '$analytics.averageResponseTime' },
              satisfactionScore: { $avg: '$analytics.satisfactionScore' },
              escalations: { $sum: { $cond: ['$escalation.escalated', 1, 0] } },
              conversions: { $sum: '$analytics.conversionsFromChat' }
            }
          }
        ]),
        this.getRecommendationMetrics(startDate, endDate)
      ]);

      const search = searchMetrics[0] || {};
      const chat = chatMetrics[0] || {};

      return {
        search: {
          totalSearches: search.totalSearches || 0,
          avgResponseTime: Math.round(search.avgResponseTime || 0),
          avgResultsReturned: Math.round(search.avgResultsReturned || 0),
          vectorSearchPercentage:
            search.totalSearches > 0
              ? Math.round((search.vectorSearches / search.totalSearches) * 100)
              : 0,
          hybridSearchPercentage:
            search.totalSearches > 0
              ? Math.round((search.hybridSearches / search.totalSearches) * 100)
              : 0,
          conversionRate:
            search.totalSearches > 0
              ? Math.round((search.conversions / search.totalSearches) * 10000) / 100
              : 0,
          revenueFromSearch: Math.round((search.totalRevenue || 0) * 100) / 100
        },
        chat: {
          totalSessions: chat.totalSessions || 0,
          avgDuration: Math.round((chat.avgDuration || 0) / 1000),
          avgMessagesPerSession: Math.round(chat.avgMessagesPerSession || 0),
          avgResponseTime: Math.round(chat.avgResponseTime || 0),
          satisfactionScore: Math.round((chat.satisfactionScore || 0) * 100) / 100,
          escalationRate:
            chat.totalSessions > 0
              ? Math.round((chat.escalations / chat.totalSessions) * 10000) / 100
              : 0,
          conversions: chat.conversions || 0
        },
        recommendations: recommendationMetrics
      };
    } catch (error) {
      logger.error('Error calculating AI metrics:', error);
      return {};
    }
  }

  async calculateUserRetention(startDate, endDate) {
    try {
      const cohorts = await User.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m', date: '$createdAt' }
            },
            newUsers: { $sum: 1 },
            userIds: { $push: '$_id' }
          }
        }
      ]);

      const retentionRates = {};
      for (const cohort of cohorts) {
        const activeUsers = await User.countDocuments({
          _id: { $in: cohort.userIds },
          lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        });

        retentionRates[cohort._id] = {
          newUsers: cohort.newUsers,
          activeUsers,
          retentionRate: cohort.newUsers > 0 ? (activeUsers / cohort.newUsers) * 100 : 0
        };
      }
      return retentionRates;
    } catch (error) {
      logger.error('Error calculating user retention:', error);
      return {};
    }
  }

  async getUserSegmentation() {
    try {
      const segments = await User.aggregate([
        {
          $addFields: {
            totalSpent: { $sum: '$purchaseHistory.amount' },
            orderCount: { $size: { $ifNull: ['$purchaseHistory', []] } },
            segment: {
              $switch: {
                branches: [
                  {
                    case: { $gt: [{ $sum: '$purchaseHistory.amount' }, 1000] },
                    then: 'VIP'
                  },
                  {
                    case: { $gt: [{ $sum: '$purchaseHistory.amount' }, 500] },
                    then: 'Loyal'
                  },
                  {
                    case: { $gt: [{ $size: { $ifNull: ['$purchaseHistory', []] } }, 0] },
                    then: 'Returning'
                  }
                ],
                default: 'New'
              }
            }
          }
        },
        {
          $group: {
            _id: '$segment',
            count: { $sum: 1 },
            avgSpent: { $avg: '$totalSpent' },
            avgOrders: { $avg: '$orderCount' }
          }
        }
      ]);

      return segments.reduce((acc, segment) => {
        acc[segment._id] = {
          count: segment.count,
          avgSpent: Math.round((segment.avgSpent || 0) * 100) / 100,
          avgOrders: Math.round((segment.avgOrders || 0) * 100) / 100
        };
        return acc;
      }, {});
    } catch (error) {
      logger.error('Error calculating user segmentation:', error);
      return {};
    }
  }

  async getRecommendationMetrics(startDate, endDate) {
    return {
      totalRecommendationsShown: 0,
      clickThroughRate: 0,
      conversionRate: 0,
      revenueFromRecommendations: 0
    };
  }

  async getRealTimeAnalytics() {
    try {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

      const [activeUsers, recentOrders, recentSearches, activeChatSessions] = await Promise.all([
        User.countDocuments({
          lastLogin: { $gte: lastHour }
        }),
        Order.countDocuments({
          createdAt: { $gte: last24Hours },
          status: { $nin: ['cancelled', 'failed'] }
        }),
        SearchAnalytics.countDocuments({
          searchedAt: { $gte: lastHour }
        }),
        ChatSession.countDocuments({
          status: 'active',
          lastActivity: { $gte: new Date(now.getTime() - 10 * 60 * 1000) }
        })
      ]);

      return {
        activeUsersLastHour: activeUsers,
        ordersLast24Hours: recentOrders,
        searchesLastHour: recentSearches,
        activeChatSessions,
        timestamp: now
      };
    } catch (error) {
      logger.error('Error getting real-time analytics:', error);
      return {};
    }
  }
}

export const analyticsService = new AnalyticsService();