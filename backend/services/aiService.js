import { ragService } from './ragService.js';
import { vectorService } from './vectorService.js';
import { embeddingService } from './embeddingService.js';
import { recommendationService } from './recommendationService.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { SearchAnalytics } from '../models/SearchAnalytics.js';
import { logger } from '../utils/logger.js';
import { cache } from '../utils/cache.js';

class AIService {
  constructor() {
    this.ragService = ragService;
    this.vectorService = vectorService;
    this.embeddingService = embeddingService;
    this.recommendationService = recommendationService;
    this.initialized = false;
  }

  async initialize() {
    try {
      logger.info('Initializing AI services...');
      await this.vectorService.initialize();
      this.initialized = true;
      logger.info('AI services initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize AI services:', error);
      return false;
    }
  }

  async processChat(message, sessionId, userId = null) {
    try {
      if (!this.initialized) {
        throw new Error('AI services not initialized');
      }
      return await this.ragService.processChat(message, sessionId, userId);
    } catch (error) {
      logger.error('Error processing chat:', error);
      throw error;
    }
  }

  async searchProducts(query, filters = {}, userId = null, sessionId = null) {
    try {
      const searchStart = Date.now();

      const searchAnalytics = new SearchAnalytics({
        query: {
          original: query,
          processed: this.preprocessSearchQuery(query),
          intent: await this.detectSearchIntent(query)
        },
        user: userId,
        sessionId,
        isAuthenticated: !!userId,
        filters: this.normalizeFilters(filters),
        searchedAt: new Date()
      });

      const userContext = userId ? await this.getUserContext(userId) : {};
      const queryAnalysis = await this.ragService.analyzeQuery(query, userContext);

      const vectorResults = await this.vectorService.searchSimilarProducts(query, {
        ...filters,
        limit: 50,
        userContext
      });

      const textResults = await Product.searchProducts(query, filters).limit(20);

      const combinedResults = await this.combineAndRankResults(
        vectorResults,
        textResults,
        queryAnalysis,
        userContext
      );

      const responseTime = Date.now() - searchStart;

      searchAnalytics.results = {
        totalFound: combinedResults.length,
        returned: Math.min(combinedResults.length, filters.limit || 20),
        method: vectorResults.length > 0 ? 'hybrid' : 'text-search',
        responseTime,
        productIds: combinedResults.slice(0, 20).map(p => p._id)
      };

      searchAnalytics.aiEnhancements = {
        entities: queryAnalysis.entities || [],
        expandedTerms: queryAnalysis.expandedTerms || [],
        vectorQuery: queryAnalysis.queryEmbedding || [],
        semanticMatches: vectorResults.map(r => ({
          productId: r.productId,
          similarity: r.similarity,
          matchType: 'semantic'
        }))
      };

      await searchAnalytics.save();

      const page = filters.page || 1;
      const pageSize = filters.pageSize || 20;
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedResults = combinedResults.slice(startIndex, endIndex);

      logger.info(`AI search for "${query}" returned ${paginatedResults.length} results in ${responseTime}ms`);

      return {
        products: paginatedResults,
        total: combinedResults.length,
        page,
        pageSize,
        totalPages: Math.ceil(combinedResults.length / pageSize),
        searchAnalyticsId: searchAnalytics._id,
        responseTime,
        searchMethod: searchAnalytics.results.method
      };
    } catch (error) {
      logger.error('Error in AI product search:', error);
      throw error;
    }
  }

  async getPersonalizedRecommendations(userId, options = {}) {
    try {
      return await this.recommendationService.getPersonalizedRecommendations(userId, options);
    } catch (error) {
      logger.error('Error getting personalized recommendations:', error);
      throw error;
    }
  }

  async getContextualRecommendations(userId, context, contextData = {}) {
    try {
      return await this.recommendationService.getContextualRecommendations(userId, context, contextData);
    } catch (error) {
      logger.error('Error getting contextual recommendations:', error);
      return [];
    }
  }

  async getProductSimilarities(productId, options = {}) {
    try {
      return await this.recommendationService.getProductSimilarities(productId, options);
    } catch (error) {
      logger.error('Error getting product similarities:', error);
      return [];
    }
  }

  async getTrendingProducts(options = {}) {
    try {
      return await this.recommendationService.getTrendingProducts(options);
    } catch (error) {
      logger.error('Error getting trending products:', error);
      return [];
    }
  }

  async processProductForAI(product) {
    try {
      const textEmbedding = await this.embeddingService.generateProductEmbedding(product);
      await this.vectorService.storeProductVector(product._id, product);

      await Product.findByIdAndUpdate(product._id, {
        'embeddings.text': textEmbedding,
        'embeddings.combined': textEmbedding,
        $set: {
          'aiMetadata.lastProcessed': new Date()
        }
      });

      logger.debug(`Processed product ${product._id} for AI`);
      return true;
    } catch (error) {
      logger.error(`Error processing product ${product._id} for AI:`, error);
      return false;
    }
  }

  async batchProcessProducts(productIds = null, batchSize = 50) {
    try {
      logger.info('Starting batch product processing for AI...');
      const query = productIds ? { _id: { $in: productIds } } : { status: 'active' };
      const totalProducts = await Product.countDocuments(query);

      let processed = 0;
      let errors = 0;

      for (let skip = 0; skip < totalProducts; skip += batchSize) {
        const products = await Product.find(query)
          .skip(skip)
          .limit(batchSize);

        const results = await Promise.allSettled(
          products.map(product => this.processProductForAI(product))
        );

        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            processed++;
          } else {
            errors++;
            logger.warn(`Failed to process product ${products[index]._id}:`, result.reason);
          }
        });

        logger.info(`Processed batch: ${skip + products.length}/${totalProducts} products`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      logger.info(`Batch processing completed: ${processed} successful, ${errors} errors`);
      return { processed, errors, total: totalProducts };
    } catch (error) {
      logger.error('Error in batch product processing:', error);
      throw error;
    }
  }

  async getAIInsights(timeframe = '30d') {
    try {
      const startDate = this.getStartDate(timeframe);
      const endDate = new Date();

      const searchInsights = await SearchAnalytics.aggregate([
        { $match: { searchedAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: null,
            totalSearches: { $sum: 1 },
            avgResponseTime: { $avg: '$results.responseTime' },
            vectorSearches: {
              $sum: { $cond: [{ $eq: ['$results.method', 'vector-search'] }, 1, 0] }
            },
            hybridSearches: {
              $sum: { $cond: [{ $eq: ['$results.method', 'hybrid'] }, 1, 0] }
            },
            avgResultsReturned: { $avg: '$results.returned' },
            conversionRate: { $avg: { $cond: ['$business.converted', 1, 0] } }
          }
        }
      ]);

      const trendingQueries = await SearchAnalytics.getSearchTrends(30);
      const recommendationStats = await this.getRecommendationStats(startDate, endDate);
      const vectorStats = await this.vectorService.getStats();

      return {
        timeframe,
        searchInsights: searchInsights[0] || {},
        trendingQueries: trendingQueries.slice(0, 10),
        recommendations: recommendationStats,
        vectorDatabase: vectorStats,
        generatedAt: new Date()
      };
    } catch (error) {
      logger.error('Error generating AI insights:', error);
      throw error;
    }
  }

  async getUserContext(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) return {};
      return {
        preferences: user.preferences,
        searchHistory: user.searchHistory?.slice(-10) || [],
        viewHistory: user.viewHistory?.slice(-10) || [],
        purchaseHistory: user.purchaseHistory?.slice(-5) || []
      };
    } catch (error) {
      logger.error('Error getting user context:', error);
      return {};
    }
  }

  preprocessSearchQuery(query) {
    return query
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  async detectSearchIntent(query) {
    const keywords = query.toLowerCase();
    if (keywords.includes('compare') || keywords.includes('vs') || keywords.includes('versus')) {
      return 'comparison';
    }
    if (keywords.includes('recommend') || keywords.includes('suggest')) {
      return 'recommendation';
    }
    if (keywords.includes('style') || keywords.includes('outfit')) {
      return 'styling-advice';
    }
    return 'product-search';
  }

  normalizeFilters(filters) {
    const normalized = {};
    if (filters.category) normalized.category = [].concat(filters.category);
    if (filters.priceRange) normalized.priceRange = filters.priceRange;
    if (filters.brand) normalized.brand = [].concat(filters.brand);
    if (filters.inStock !== undefined) normalized.inStock = filters.inStock;
    if (filters.onSale !== undefined) normalized.onSale = filters.onSale;
    if (filters.rating) normalized.rating = filters.rating;
    return normalized;
  }

  async combineAndRankResults(vectorResults, textResults, queryAnalysis, userContext) {
    try {
      const productMap = new Map();

      vectorResults.forEach(result => {
        productMap.set(result.productId, {
          ...result,
          source: 'vector',
          relevanceScore: result.similarity
        });
      });

      textResults.forEach(product => {
        if (!productMap.has(product._id.toString())) {
          productMap.set(product._id.toString(), {
            productId: product._id.toString(),
            product,
            source: 'text',
            relevanceScore: 0.5
          });
        }
      });

      const productIds = Array.from(productMap.keys());
      const products = await Product.find({ _id: { $in: productIds } });

      const combinedResults = [];
      products.forEach(product => {
        const resultData = productMap.get(product._id.toString());
        combinedResults.push({
          ...product.toObject(),
          relevanceScore: resultData.relevanceScore,
          source: resultData.source
        });
      });

      const personalizedResults = await this.applyPersonalizationScoring(
        combinedResults,
        userContext
      );

      return personalizedResults.sort((a, b) => b.finalScore - a.finalScore);
    } catch (error) {
      logger.error('Error combining and ranking results:', error);
      return textResults;
    }
  }

  async applyPersonalizationScoring(results, userContext) {
    return results.map(product => {
      let personalizedScore = product.relevanceScore || 0.5;
      if (userContext.preferences?.categories?.includes(product.category)) {
        personalizedScore += 0.2;
      }
      const viewedCategories = userContext.viewHistory?.map(v => v.product?.category) || [];
      if (viewedCategories.includes(product.category)) {
        personalizedScore += 0.1;
      }
      if (product.analytics?.rating?.average >= 4.0) {
        personalizedScore += 0.1;
      }
      if (product.inventory?.stock > 0) {
        personalizedScore += 0.05;
      }
      return {
        ...product,
        finalScore: Math.min(personalizedScore, 1.0)
      };
    });
  }

  async analyzeUserBehavior(user) {
    const behavior = {
      preferredCategories: [],
      priceRange: { min: 0, max: Infinity },
      brandAffinity: [],
      seasonalPreferences: [],
      purchasingPattern: 'occasional'
    };

    if (user.viewHistory?.length > 0) {
      const categories = user.viewHistory.map(v => v.productId?.category).filter(Boolean);
      behavior.preferredCategories = [...new Set(categories)];
    }

    if (user.purchaseHistory?.length > 0) {
      const amounts = user.purchaseHistory.map(p => p.amount).filter(Boolean);
      if (amounts.length > 0) {
        behavior.priceRange = {
          min: Math.min(...amounts),
          max: Math.max(...amounts)
        };
      }

      const daysSinceFirst = user.purchaseHistory[0]?.timestamp
        ? (Date.now() - user.purchaseHistory[0].timestamp.getTime()) / (1000 * 60 * 60 * 24)
        : 0;

      if (daysSinceFirst > 0) {
        const purchaseFrequency = user.purchaseHistory.length / (daysSinceFirst / 30);
        if (purchaseFrequency > 1) behavior.purchasingPattern = 'frequent';
        else if (purchaseFrequency > 0.5) behavior.purchasingPattern = 'regular';
      }
    }

    return behavior;
  }

  async enhanceWithCollaborativeFiltering(recommendations, userBehavior) {
    return recommendations;
  }

  async applyRecommendationFilters(recommendations, userPreferences, options) {
    let filtered = [...recommendations];
    if (userPreferences?.categories?.length > 0) {
      filtered = filtered.filter(rec =>
        userPreferences.categories.includes(rec.metadata?.category)
      );
    }
    if (options.category) {
      filtered = filtered.filter(rec => rec.metadata?.category === options.category);
    }
    if (options.maxPrice) {
      filtered = filtered.filter(rec => (rec.metadata?.price || 0) <= options.maxPrice);
    }
    return filtered.slice(0, options.limit || 10);
  }

  async getRecommendationStats(startDate, endDate) {
    return {
      totalRecommendations: 0,
      clickThroughRate: 0,
      conversionRate: 0
    };
  }

  getStartDate(timeframe) {
    const now = new Date();
    const days = parseInt(timeframe) || 30;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }
}

export const aiService = new AIService();