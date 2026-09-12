import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { Order } from '../models/Order.js';
import { vectorService } from './vectorService.js';
import { embeddingService } from './embeddingService.js';
import { logger } from '../utils/logger.js';
import { cache } from '../utils/cache.js';

class RecommendationService {
  constructor() {
    this.algorithms = {
      COLLABORATIVE_FILTERING: 'collaborative_filtering',
      CONTENT_BASED: 'content_based',
      HYBRID: 'hybrid',
      TRENDING: 'trending',
      SIMILAR_USERS: 'similar_users',
      FREQUENTLY_BOUGHT_TOGETHER: 'frequently_bought_together',
      SEASONAL: 'seasonal',
      PRICE_BASED: 'price_based'
    };
    this.contexts = {
      HOMEPAGE: 'homepage',
      PRODUCT_DETAIL: 'product_detail',
      CART: 'cart',
      CHECKOUT: 'checkout',
      POST_PURCHASE: 'post_purchase',
      SEARCH_RESULTS: 'search_results',
      CATEGORY_BROWSE: 'category_browse',
      WISHLIST: 'wishlist',
      REORDER: 'reorder'
    };
  }

  async getPersonalizedRecommendations(userId, options = {}) {
    try {
      const {
        limit = 10,
        context = this.contexts.HOMEPAGE,
        algorithm = this.algorithms.HYBRID,
        excludeProducts = [],
        categoryFilter = null,
        priceRange = null,
        diversityFactor = 0.3
      } = options;

      const cacheKey = `recommendations:${userId}:${context}:${algorithm}:${JSON.stringify(options)}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const userProfile = await this.buildUserProfile(userId);
      let recommendations = [];

      switch (algorithm) {
        case this.algorithms.HYBRID:
          recommendations = await this.generateHybridRecommendations(
            userProfile, context, limit * 2, excludeProducts
          );
          break;
        case this.algorithms.COLLABORATIVE_FILTERING:
          recommendations = await this.generateCollaborativeRecommendations(
            userProfile, limit * 2, excludeProducts
          );
          break;
        case this.algorithms.CONTENT_BASED:
          recommendations = await this.generateContentBasedRecommendations(
            userProfile, limit * 2, excludeProducts
          );
          break;
        case this.algorithms.TRENDING:
          recommendations = await this.getTrendingRecommendations(limit * 2, excludeProducts);
          break;
        default:
          recommendations = await this.generateHybridRecommendations(
            userProfile, context, limit * 2, excludeProducts
          );
      }

      if (categoryFilter) {
        recommendations = recommendations.filter(rec => rec.category === categoryFilter);
      }
      if (priceRange) {
        recommendations = recommendations.filter(
          rec =>
            rec.price >= (priceRange.min || 0) &&
            rec.price <= (priceRange.max || Infinity)
        );
      }

      const diversifiedRecommendations = this.applyDiversityFiltering(
        recommendations,
        diversityFactor
      );

      const finalRecommendations = await this.rankRecommendations(
        diversifiedRecommendations,
        userProfile,
        context
      );

      const result = finalRecommendations.slice(0, limit).map(rec => ({
        ...rec,
        recommendationScore: rec.score,
        algorithm,
        context,
        generatedAt: new Date()
      }));

      await cache.set(cacheKey, result, 1800);
      logger.info(`Generated ${result.length} ${algorithm} recommendations for user ${userId} in ${context} context`);
      return result;
    } catch (error) {
      logger.error('Error generating personalized recommendations:', error);
      throw error;
    }
  }

  async getProductSimilarities(productId, options = {}) {
    try {
      const {
        limit = 6,
        algorithm = this.algorithms.CONTENT_BASED,
        excludeProducts = [],
        threshold = 0.7
      } = options;

      const cacheKey = `similar:${productId}:${algorithm}:${limit}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const product = await Product.findById(productId).lean();
      if (!product) {
        throw new Error('Product not found');
      }

      let similarProducts = [];
      switch (algorithm) {
        case this.algorithms.CONTENT_BASED:
          similarProducts = await this.getContentBasedSimilarProducts(
            product, limit + excludeProducts.length, threshold
          );
          break;
        case this.algorithms.COLLABORATIVE_FILTERING:
          similarProducts = await this.getCollaborativeSimilarProducts(
            productId, limit + excludeProducts.length
          );
          break;
        case this.algorithms.FREQUENTLY_BOUGHT_TOGETHER:
          similarProducts = await this.getFrequentlyBoughtTogether(
            productId, limit + excludeProducts.length
          );
          break;
        default: {
          const contentBased = await this.getContentBasedSimilarProducts(
            product, Math.ceil(limit / 2), threshold
          );
          const collaborative = await this.getCollaborativeSimilarProducts(
            productId, Math.ceil(limit / 2)
          );
          similarProducts = [...contentBased, ...collaborative];
        }
      }

      const filtered = similarProducts
        .filter(
          prod =>
            !excludeProducts.includes(prod._id?.toString()) &&
            prod._id?.toString() !== productId.toString()
        )
        .filter(
          (prod, index, self) =>
            index === self.findIndex(p => p._id?.toString() === prod._id?.toString())
        );

      const result = filtered.slice(0, limit).map(prod => ({
        ...prod,
        algorithm,
        generatedAt: new Date()
      }));

      await cache.set(cacheKey, result, 3600);
      return result;
    } catch (error) {
      logger.error('Error getting product similarities:', error);
      throw error;
    }
  }

  async getContextualRecommendations(userId, context, contextData = {}) {
    try {
      const { limit = 8 } = contextData;
      switch (context) {
        case this.contexts.CART:
          return await this.getCartBasedRecommendations(userId, contextData);
        case this.contexts.PRODUCT_DETAIL:
          return await this.getProductDetailRecommendations(
            contextData.productId,
            userId,
            contextData
          );
        case this.contexts.SEARCH_RESULTS:
          return await this.getSearchBasedRecommendations(
            contextData.searchQuery,
            userId,
            contextData
          );
        case this.contexts.CATEGORY_BROWSE:
          return await this.getCategoryBasedRecommendations(
            contextData.category,
            userId,
            contextData
          );
        case this.contexts.POST_PURCHASE:
          return await this.getPostPurchaseRecommendations(
            contextData.orderId,
            userId,
            contextData
          );
        default:
          return await this.getPersonalizedRecommendations(userId, {
            context,
            limit,
            ...contextData
          });
      }
    } catch (error) {
      logger.error('Error getting contextual recommendations:', error);
      return [];
    }
  }

  async getTrendingProducts(options = {}) {
    try {
      const {
        limit = 10,
        timeframe = '7d',
        category = null,
        includeNewProducts = true
      } = options;

      const cacheKey = `trending:${timeframe}:${category}:${limit}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const days = parseInt(timeframe) || 7;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const pipeline = [
        {
          $match: {
            status: 'active',
            ...(category && { category }),
            $or: [
              { 'analytics.lastViewedAt': { $gte: startDate } },
              { 'analytics.lastPurchasedAt': { $gte: startDate } },
              ...(includeNewProducts ? [{ createdAt: { $gte: startDate } }] : [])
            ]
          }
        },
        {
          $addFields: {
            trendingScore: {
              $add: [
                {
                  $multiply: [
                    { $ifNull: ['$analytics.views', 0] },
                    {
                      $cond: [
                        { $gte: ['$analytics.lastViewedAt', startDate] },
                        0.3,
                        0.1
                      ]
                    }
                  ]
                },
                { $multiply: [{ $ifNull: ['$analytics.purchases', 0] }, 2.0] },
                { $multiply: [{ $ifNull: ['$analytics.cartAdds', 0] }, 0.8] },
                { $multiply: [{ $ifNull: ['$analytics.rating.average', 0] }, 5] },
                {
                  $cond: [
                    { $gte: ['$createdAt', startDate] },
                    10,
                    0
                  ]
                },
                {
                  $cond: [
                    { $gt: ['$inventory.stock', 0] },
                    5,
                    -10
                  ]
                }
              ]
            }
          }
        },
        { $sort: { trendingScore: -1 } },
        { $limit: limit }
      ];

      const trendingProducts = await Product.aggregate(pipeline);
      const result = trendingProducts.map(product => ({
        ...product,
        trending: true,
        algorithm: this.algorithms.TRENDING,
        generatedAt: new Date()
      }));

      await cache.set(cacheKey, result, 7200);
      return result;
    } catch (error) {
      logger.error('Error getting trending products:', error);
      return [];
    }
  }

  async getSeasonalRecommendations(userId, options = {}) {
    try {
      const { limit = 8, season = this.getCurrentSeason() } = options;
      const seasonalTags = this.getSeasonalTags(season);

      const products = await Product.find({
        status: 'active',
        $or: [
          { 'aiMetadata.seasonality': { $in: seasonalTags } },
          { 'aiMetadata.tags': { $in: seasonalTags } },
          { 'specifications.features': { $in: seasonalTags } }
        ]
      })
        .sort({ 'analytics.rating.average': -1, 'analytics.views': -1 })
        .limit(limit)
        .lean();

      return products.map(product => ({
        ...product,
        algorithm: this.algorithms.SEASONAL,
        season,
        generatedAt: new Date()
      }));
    } catch (error) {
      logger.error('Error getting seasonal recommendations:', error);
      return [];
    }
  }

  async buildUserProfile(userId) {
    try {
      const user = await User.findById(userId)
        .populate('viewHistory.productId')
        .populate('purchaseHistory.orderId')
        .lean();

      if (!user) {
        return { isNew: true, preferences: {} };
      }

      return {
        userId,
        isNew: !user.purchaseHistory || user.purchaseHistory.length === 0,
        preferences: user.preferences || {},
        viewHistory: user.viewHistory || [],
        purchaseHistory: user.purchaseHistory || [],
        searchHistory: user.searchHistory || [],
        preferredCategories: this.extractPreferredCategories(user),
        averageOrderValue: this.calculateAverageOrderValue(user),
        purchaseFrequency: this.calculatePurchaseFrequency(user),
        priceRange: this.inferPriceRange(user),
        brandAffinity: this.extractBrandPreferences(user),
        seasonalPatterns: this.analyzeSeasonalPatterns(user),
        engagementScore: this.calculateEngagementScore(user),
        lifetimeValue: this.calculateLifetimeValue(user)
      };
    } catch (error) {
      logger.error('Error building user profile:', error);
      return { isNew: true, preferences: {} };
    }
  }

  async generateHybridRecommendations(userProfile, context, limit, excludeProducts) {
    try {
      const recommendations = [];
      const weights = this.getAlgorithmWeights(userProfile, context);

      if (!userProfile.isNew && weights.collaborative > 0) {
        const collaborative = await this.generateCollaborativeRecommendations(
          userProfile,
          Math.ceil(limit * weights.collaborative),
          excludeProducts
        );
        recommendations.push(
          ...collaborative.map(rec => ({
            ...rec,
            algorithm: this.algorithms.COLLABORATIVE_FILTERING,
            weight: weights.collaborative
          }))
        );
      }

      if (weights.contentBased > 0) {
        const contentBased = await this.generateContentBasedRecommendations(
          userProfile,
          Math.ceil(limit * weights.contentBased),
          excludeProducts
        );
        recommendations.push(
          ...contentBased.map(rec => ({
            ...rec,
            algorithm: this.algorithms.CONTENT_BASED,
            weight: weights.contentBased
          }))
        );
      }

      if (weights.trending > 0) {
        const trending = await this.getTrendingRecommendations(
          Math.ceil(limit * weights.trending),
          excludeProducts
        );
        recommendations.push(
          ...trending.map(rec => ({
            ...rec,
            algorithm: this.algorithms.TRENDING,
            weight: weights.trending
          }))
        );
      }

      return recommendations;
    } catch (error) {
      logger.error('Error generating hybrid recommendations:', error);
      return [];
    }
  }

  async generateCollaborativeRecommendations(userProfile, limit, excludeProducts) {
    try {
      const similarUsers = await this.findSimilarUsers(userProfile.userId, 10);
      if (similarUsers.length === 0) {
        return [];
      }

      const userPurchasedProducts = new Set(
        userProfile.purchaseHistory.map(p => p.orderId?.toString())
      );

      const recommendations = await User.aggregate([
        { $match: { _id: { $in: similarUsers.map(u => u.userId) } } },
        { $unwind: '$purchaseHistory' },
        {
          $lookup: {
            from: 'orders',
            localField: 'purchaseHistory.orderId',
            foreignField: '_id',
            as: 'order'
          }
        },
        { $unwind: '$order' },
        { $unwind: '$order.items' },
        {
          $match: {
            'order.items.product': {
              $nin: [...userPurchasedProducts, ...excludeProducts].map(id =>
                typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
              )
            }
          }
        },
        {
          $group: {
            _id: '$order.items.product',
            purchaseCount: { $sum: 1 },
            avgRating: { $avg: '$order.rating' }
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
        { $match: { 'product.status': 'active' } },
        { $sort: { purchaseCount: -1 } },
        { $limit: limit }
      ]);

      return recommendations.map(rec => ({
        ...rec.product,
        score: rec.purchaseCount * 0.1 + (rec.avgRating || 0) * 0.1,
        reason: 'Users with similar taste also bought this'
      }));
    } catch (error) {
      logger.error('Error generating collaborative recommendations:', error);
      return [];
    }
  }

  async generateContentBasedRecommendations(userProfile, limit, excludeProducts) {
    try {
      const userPreferences = this.buildPreferenceVector(userProfile);
      const similarProducts = await vectorService.searchSimilarProducts(
        userPreferences.queryString,
        {
          limit: limit * 2,
          filters: {
            category: userPreferences.preferredCategories,
            priceRange: userProfile.priceRange
          },
          threshold: 0.6
        }
      );

      const recommendations = [];
      for (const result of similarProducts) {
        if (excludeProducts.includes(result.productId)) continue;
        const product = await Product.findById(result.productId).lean();
        if (product && product.status === 'active') {
          recommendations.push({
            ...product,
            score: result.similarity,
            reason: this.getRecommendationReason(product, userProfile)
          });
        }
      }
      return recommendations.slice(0, limit);
    } catch (error) {
      logger.error('Error generating content-based recommendations:', error);
      return [];
    }
  }

  async getCartBasedRecommendations(userId, contextData) {
    try {
      const { cartItems, limit = 6 } = contextData;
      if (!cartItems || cartItems.length === 0) {
        return await this.getPersonalizedRecommendations(userId, { limit });
      }

      const recommendations = [];
      for (const item of cartItems.slice(0, 3)) {
        const complementary = await this.getComplementaryProducts(
          item.productId || item.product,
          Math.ceil(limit / cartItems.length)
        );
        recommendations.push(...complementary);
      }

      const frequentlyBought = await this.getFrequentlyBoughtTogether(
        cartItems.map(item => item.productId || item.product),
        limit
      );
      recommendations.push(...frequentlyBought);

      const cartProductIds = new Set(
        cartItems.map(item => (item.productId || item.product)?.toString())
      );

      const unique = recommendations
        .filter(rec => !cartProductIds.has(rec._id?.toString()))
        .filter(
          (rec, index, self) =>
            index === self.findIndex(r => r._id?.toString() === rec._id?.toString())
        );

      return unique.slice(0, limit).map(rec => ({
        ...rec,
        context: this.contexts.CART,
        reason: 'Great addition to your cart'
      }));
    } catch (error) {
      logger.error('Error getting cart-based recommendations:', error);
      return [];
    }
  }

  getAlgorithmWeights(userProfile, context) {
    const weights = {
      collaborative: 0.4,
      contentBased: 0.4,
      trending: 0.2
    };

    if (userProfile.isNew) {
      weights.trending = 0.6;
      weights.contentBased = 0.3;
      weights.collaborative = 0.1;
    } else if (userProfile.purchaseHistory.length > 5) {
      weights.collaborative = 0.5;
      weights.contentBased = 0.3;
      weights.trending = 0.2;
    }

    switch (context) {
      case this.contexts.HOMEPAGE:
        weights.trending += 0.1;
        break;
      case this.contexts.PRODUCT_DETAIL:
        weights.contentBased += 0.2;
        break;
      case this.contexts.CART:
        weights.collaborative += 0.2;
        break;
    }

    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    Object.keys(weights).forEach(key => {
      weights[key] = weights[key] / total;
    });
    return weights;
  }

  extractPreferredCategories(user) {
    const categoryCount = {};
    user.viewHistory?.forEach(view => {
      const category = view.productId?.category;
      if (category) {
        categoryCount[category] = (categoryCount[category] || 0) + 1;
      }
    });

    return Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0]);
  }

  calculateAverageOrderValue(user) {
    if (!user.purchaseHistory || user.purchaseHistory.length === 0) {
      return 0;
    }
    const total = user.purchaseHistory.reduce((sum, purchase) => sum + purchase.amount, 0);
    return total / user.purchaseHistory.length;
  }

  getCurrentSeason() {
    const month = new Date().getMonth() + 1;
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'fall';
    return 'winter';
  }

  getSeasonalTags(season) {
    const seasonalMap = {
      spring: ['light', 'colorful', 'fresh', 'pastel', 'floral'],
      summer: ['bright', 'beach', 'vacation', 'lightweight', 'canvas'],
      fall: ['warm', 'cozy', 'leather', 'brown', 'burgundy'],
      winter: ['dark', 'formal', 'structured', 'black', 'elegant']
    };
    return seasonalMap[season] || [];
  }

  applyDiversityFiltering(recommendations, diversityFactor) {
    if (diversityFactor <= 0) return recommendations;
    const diversified = [];
    const seenCategories = new Set();
    const seenBrands = new Set();

    for (const rec of recommendations) {
      const category = rec.category;
      const brand = rec.brand;

      const categoryDiversity = !seenCategories.has(category);
      const brandDiversity = !seenBrands.has(brand);

      if (categoryDiversity || brandDiversity || Math.random() < 1 - diversityFactor) {
        diversified.push(rec);
        if (category) seenCategories.add(category);
        if (brand) seenBrands.add(brand);
      }
    }
    return diversified;
  }

  async rankRecommendations(recommendations, userProfile, context) {
    return recommendations
      .map(rec => ({
        ...rec,
        finalScore: this.calculateFinalScore(rec, userProfile, context)
      }))
      .sort((a, b) => b.finalScore - a.finalScore);
  }

  calculateFinalScore(recommendation, userProfile, context) {
    let score = recommendation.score || 0.5;
    if (userProfile.preferredCategories?.includes(recommendation.category)) {
      score += 0.2;
    }
    if (userProfile.priceRange && recommendation.price) {
      const inRange =
        recommendation.price >= userProfile.priceRange.min &&
        recommendation.price <= userProfile.priceRange.max;
      if (inRange) score += 0.1;
    }
    if (recommendation.analytics?.rating?.average >= 4.0) {
      score += 0.1;
    }
    if (recommendation.inventory?.stock > 0) {
      score += 0.05;
    }
    return Math.min(score, 1.0);
  }

  async getContentBasedSimilarProducts(product, limit, threshold) {
    return [];
  }

  async getCollaborativeSimilarProducts(productId, limit) {
    return [];
  }

  async getTrendingRecommendations(limit, excludeProducts) {
    return await this.getTrendingProducts({ limit });
  }

  async getProductDetailRecommendations(productId, userId, contextData) {
    return await this.getProductSimilarities(productId, contextData);
  }

  async getSearchBasedRecommendations(query, userId, contextData) {
    return await this.getTrendingProducts(contextData);
  }

  async getCategoryBasedRecommendations(category, userId, contextData) {
    return await this.getTrendingProducts({ ...contextData, category });
  }

  async getPostPurchaseRecommendations(orderId, userId, contextData) {
    return await this.getPersonalizedRecommendations(userId, contextData);
  }

  async findSimilarUsers(userId, limit) {
    return [];
  }

  async getComplementaryProducts(productId, limit) {
    return [];
  }

  async getFrequentlyBoughtTogether(productIds, limit) {
    return [];
  }

  buildPreferenceVector(userProfile) {
    return {
      queryString: userProfile.preferredCategories?.join(' ') || 'bags accessories',
      preferredCategories: userProfile.preferredCategories || []
    };
  }

  getRecommendationReason(product, userProfile) {
    return 'Recommended for you based on your preferences';
  }

  calculatePurchaseFrequency(user) {
    return 0;
  }

  inferPriceRange(user) {
    return { min: 0, max: 1000 };
  }

  extractBrandPreferences(user) {
    return [];
  }

  analyzeSeasonalPatterns(user) {
    return {};
  }

  calculateEngagementScore(user) {
    return 0.5;
  }

  calculateLifetimeValue(user) {
    return 0;
  }
}

export const recommendationService = new RecommendationService();