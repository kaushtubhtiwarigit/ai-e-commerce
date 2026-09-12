import { validationResult } from 'express-validator';
import { Product } from '../models/Product.js';
import { SearchAnalytics } from '../models/SearchAnalytics.js';
import { aiService } from '../services/aiService.js';
import { vectorService } from '../services/vectorService.js';
import { logger } from '../utils/logger.js';
import { cache } from '../utils/cache.js';

// @desc    Get all products with AI-powered search and filtering
// @route   GET /api/products
// @access  Public
export const getProducts = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      category, 
      minPrice, 
      maxPrice, 
      brand, 
      inStock, 
      featured, 
      onSale,
      sort = 'createdAt',
      order = 'desc',
      q: searchQuery
    } = req.query;

    // If there's a search query, use AI-powered search
    if (searchQuery) {
      return await searchProductsWithAI(req, res);
    }

    // Build filter object
    const filter = { status: 'active' };
    
    if (category) filter.category = category;
    if (brand) filter.brand = new RegExp(brand, 'i');
    if (inStock === 'true') filter['inventory.stock'] = { $gt: 0 };
    if (featured === 'true') filter.featured = true;
    if (onSale === 'true') filter.onSale = true;

    // Price range filter
    if (minPrice || maxPrice) {
      filter['price.current'] = {};
      if (minPrice) filter['price.current'].$gte = parseFloat(minPrice);
      if (maxPrice) filter['price.current'].$lte = parseFloat(maxPrice);
    }

    // Build sort object
    const sortObj = {};
    if (sort === 'price') {
      sortObj['price.current'] = order === 'asc' ? 1 : -1;
    } else if (sort === 'rating') {
      sortObj['analytics.rating.average'] = order === 'asc' ? 1 : -1;
    } else if (sort === 'popularity') {
      sortObj['analytics.views'] = order === 'asc' ? 1 : -1;
    } else {
      sortObj[sort] = order === 'asc' ? 1 : -1;
    }

    // Check cache first
    const cacheKey = `products:${JSON.stringify({ filter, sortObj, page, limit })}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // Execute query
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('reviews.userId', 'name')
        .lean(),
      Product.countDocuments(filter)
    ]);

    // Add virtual fields and analytics
    const enhancedProducts = products.map(product => ({
      ...product,
      availabilityStatus: getAvailabilityStatus(product),
      discountPercentage: getDiscountPercentage(product),
      primaryImage: getPrimaryImage(product)
    }));

    const result = {
      success: true,
      data: {
        products: enhancedProducts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        },
        filters: {
          category,
          minPrice,
          maxPrice,
          brand,
          inStock,
          featured,
          onSale
        }
      }
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, result, 300);

    res.status(200).json(result);

  } catch (error) {
    logger.error('Error getting products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve products'
    });
  }
};

// @desc    AI-powered product search
// @route   GET /api/products/search
// @access  Public
export const searchProductsWithAI = async (req, res) => {
  try {
    const { q: query } = req.query;
    
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const userId = req.user?._id;
    const sessionId = req.headers['x-session-id'] || `search_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Use AI service for search
    const results = await aiService.searchProducts(query, req.query, userId, sessionId);

    res.status(200).json({
      success: true,
      data: {
        ...results,
        searchQuery: query,
        aiPowered: true
      }
    });

  } catch (error) {
    logger.error('Error in AI product search:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed'
    });
  }
};

// @desc    Get single product with AI-enhanced recommendations
// @route   GET /api/products/:id
// @access  Public
export const getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;

    // Get product
    const product = await Product.findById(id)
      .populate('reviews.userId', 'name avatar')
      .populate('relatedProducts.productId', 'name price images category')
      .lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Update view analytics
    await Product.findByIdAndUpdate(id, {
      $inc: { 'analytics.views': 1 },
      'analytics.lastViewedAt': new Date()
    });

    // Track user view history if authenticated
    if (userId) {
      await trackUserView(userId, id);
    }

    // Get AI-powered similar products
    let similarProducts = [];
    try {
      const aiSimilar = await vectorService.findSimilarProducts(id, {
        limit: 8,
        threshold: 0.7
      });

      if (aiSimilar.length > 0) {
        const similarIds = aiSimilar.map(s => s.productId);
        const similarProductsData = await Product.find({
          _id: { $in: similarIds },
          status: 'active'
        }).select('name price images category inventory analytics').lean();

        similarProducts = aiSimilar.map(similar => {
          const productData = similarProductsData.find(p => p._id.toString() === similar.productId);
          return productData ? {
            ...productData,
            similarity: similar.similarity,
            aiRecommended: true
          } : null;
        }).filter(Boolean);
      }
    } catch (error) {
      logger.warn('Failed to get AI similar products, falling back to category-based:', error);
      // Fallback to category-based similar products
      similarProducts = await Product.find({
        category: product.category,
        _id: { $ne: id },
        status: 'active'
      }).limit(6).select('name price images category inventory analytics').lean();
    }

    // Get personalized recommendations if user is authenticated
    let personalizedRecommendations = [];
    if (userId) {
      try {
        const recommendations = await aiService.getPersonalizedRecommendations(userId, {
          limit: 4,
          exclude: [id]
        });
        personalizedRecommendations = recommendations;
      } catch (error) {
        logger.warn('Failed to get personalized recommendations:', error);
      }
    }

    const result = {
      success: true,
      data: {
        product: {
          ...product,
          availabilityStatus: getAvailabilityStatus(product),
          discountPercentage: getDiscountPercentage(product),
          primaryImage: getPrimaryImage(product)
        },
        similarProducts,
        personalizedRecommendations,
        analytics: {
          viewsIncremented: true,
          totalViews: product.analytics?.views + 1
        }
      }
    };

    res.status(200).json(result);

  } catch (error) {
    logger.error('Error getting product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve product'
    });
  }
};

// @desc    Get trending products using AI analytics
// @route   GET /api/products/trending
// @access  Public
export const getTrendingProducts = async (req, res) => {
  try {
    const { limit = 10, timeframe = '7d' } = req.query;

    const cacheKey = `trending:${timeframe}:${limit}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // Calculate trending based on recent views, purchases, and AI interactions
    const days = parseInt(timeframe) || 7;
    const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));

    const trendingProducts = await Product.aggregate([
      {
        $match: {
          status: 'active',
          'analytics.lastViewedAt': { $gte: startDate }
        }
      },
      {
        $addFields: {
          trendingScore: {
            $add: [
              { $multiply: ['$analytics.views', 0.3] },
              { $multiply: ['$analytics.purchases', 2.0] },
              { $multiply: ['$analytics.cartAdds', 0.8] },
              { $multiply: ['$analytics.wishlistAdds', 0.5] },
              { $multiply: [{ $ifNull: ['$analytics.rating.average', 0] }, 10] }
            ]
          }
        }
      },
      {
        $sort: { trendingScore: -1 }
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    const result = {
      success: true,
      data: {
        products: trendingProducts.map(product => ({
          ...product,
          availabilityStatus: getAvailabilityStatus(product),
          discountPercentage: getDiscountPercentage(product),
          primaryImage: getPrimaryImage(product),
          trending: true
        })),
        timeframe,
        generatedAt: new Date()
      }
    };

    // Cache for 1 hour
    await cache.set(cacheKey, result, 3600);

    res.status(200).json(result);

  } catch (error) {
    logger.error('Error getting trending products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve trending products'
    });
  }
};

// @desc    Get product recommendations based on AI
// @route   GET /api/products/recommendations
// @access  Private
export const getRecommendations = async (req, res) => {
  try {
    const { limit = 10, type = 'personal', category, excludeViewed = false } = req.query;
    const userId = req.user._id;

    let recommendations = [];

    switch (type) {
      case 'personal':
        recommendations = await aiService.getPersonalizedRecommendations(userId, {
          limit: parseInt(limit),
          category
        });
        break;

      case 'similar':
        // Get recommendations based on recently viewed products
        const user = await User.findById(userId);
        const recentViews = user.viewHistory?.slice(-3) || [];
        
        for (const view of recentViews) {
          const similar = await vectorService.findSimilarProducts(view.productId, {
            limit: Math.ceil(parseInt(limit) / recentViews.length)
          });
          recommendations.push(...similar);
        }
        break;

      case 'trending':
        const trending = await getTrendingProducts({ query: { limit } }, { status: () => {}, json: (data) => data });
        recommendations = trending.data.products;
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid recommendation type'
        });
    }

    // Filter out viewed products if requested
    if (excludeViewed && recommendations.length > 0) {
      const user = await User.findById(userId);
      const viewedIds = new Set(user.viewHistory?.map(v => v.productId?.toString()) || []);
      recommendations = recommendations.filter(rec => !viewedIds.has(rec._id?.toString()));
    }

    res.status(200).json({
      success: true,
      data: {
        recommendations: recommendations.slice(0, parseInt(limit)),
        type,
        userId,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Error getting recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate recommendations'
    });
  }
};

// @desc    Create new product (Admin only)
// @route   POST /api/products
// @access  Private/Admin
export const createProduct = async (req, res) => {
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

    const productData = {
      ...req.body,
      createdBy: req.user._id,
      updatedBy: req.user._id
    };

    const product = await Product.create(productData);

    // Process product for AI (generate embeddings, etc.)
    try {
      await aiService.processProductForAI(product);
      logger.info(`Product ${product._id} processed for AI successfully`);
    } catch (aiError) {
      logger.warn(`Failed to process product ${product._id} for AI:`, aiError);
      // Don't fail the product creation if AI processing fails
    }

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: { product }
    });

  } catch (error) {
    logger.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create product'
    });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Update product
    Object.assign(product, req.body);
    product.updatedBy = req.user._id;
    await product.save();

    // Update AI embeddings if content changed
    const contentFields = ['name', 'description', 'category', 'brand', 'specifications'];
    const contentChanged = contentFields.some(field => req.body[field] !== undefined);

    if (contentChanged) {
      try {
        await aiService.processProductForAI(product);
        logger.info(`Product ${id} AI embeddings updated`);
      } catch (aiError) {
        logger.warn(`Failed to update AI embeddings for product ${id}:`, aiError);
      }
    }

    // Clear related caches
    await cache.deletePattern('products:*');
    await cache.deletePattern(`product:${id}:*`);

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: { product }
    });

  } catch (error) {
    logger.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update product'
    });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Soft delete by updating status
    product.status = 'discontinued';
    product.updatedBy = req.user._id;
    await product.save();

    // Remove from vector database
    try {
      await vectorService.deleteProductVector(id);
      logger.info(`Product ${id} removed from vector database`);
    } catch (vectorError) {
      logger.warn(`Failed to remove product ${id} from vector database:`, vectorError);
    }

    // Clear caches
    await cache.deletePattern('products:*');
    await cache.deletePattern(`product:${id}:*`);

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete product'
    });
  }
};

// Helper functions
const getAvailabilityStatus = (product) => {
  if (product.inventory?.stock === 0) return 'out-of-stock';
  if (product.inventory?.stock <= (product.inventory?.lowStockThreshold || 10)) return 'low-stock';
  return 'in-stock';
};

const getDiscountPercentage = (product) => {
  if (product.price?.original && product.price.original > product.price.current) {
    return Math.round(((product.price.original - product.price.current) / product.price.original) * 100);
  }
  return 0;
};

const getPrimaryImage = (product) => {
  if (!product.images || product.images.length === 0) return null;
  const primary = product.images.find(img => img.isPrimary);
  return primary || product.images[0];
};

const trackUserView = async (userId, productId) => {
  try {
    await User.findByIdAndUpdate(userId, {
      $push: {
        viewHistory: {
          $each: [{
            productId,
            timestamp: new Date()
          }],
          $slice: -50 // Keep only last 50 views
        }
      }
    });
  } catch (error) {
    logger.warn('Failed to track user view:', error);
  }
};