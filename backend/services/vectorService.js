import { getPineconeIndex } from '../config/pinecone.js';
import { embeddingService } from './embeddingService.js';
import { logger } from '../utils/logger.js';
import { cache } from '../utils/cache.js';

class VectorService {
  constructor() {
    this.pineconeIndex = null;
    this.namespace = {
      PRODUCTS: 'products',
      USERS: 'users',
      CONTENT: 'content'
    };
  }

  async initialize() {
    try {
      this.pineconeIndex = getPineconeIndex();
      if (this.pineconeIndex) {
        logger.info('VectorService initialized with Pinecone');
        return true;
      } else {
        logger.warn('VectorService initialized without Pinecone (will use fallback)');
        return false;
      }
    } catch (error) {
      logger.error('Failed to initialize VectorService:', error);
      return false;
    }
  }

  async storeProductVector(productId, productData) {
    try {
      if (!this.pineconeIndex) {
        logger.warn('Pinecone not available, skipping vector storage');
        return false;
      }

      const embedding = await embeddingService.generateProductEmbedding(productData);
      if (!embedding) {
        throw new Error('Failed to generate product embedding');
      }

      const metadata = {
        productId: productId.toString(),
        name: productData.name?.substring(0, 100) || '',
        category: productData.category || '',
        brand: productData.brand?.substring(0, 50) || '',
        price: productData.price?.current || 0,
        inStock: productData.inventory?.stock > 0,
        featured: productData.featured || false,
        rating: productData.analytics?.rating?.average || 0,
        createdAt: productData.createdAt?.toISOString() || new Date().toISOString(),
        style: productData.aiMetadata?.style?.substring(0, 30) || '',
        occasion: Array.isArray(productData.aiMetadata?.occasion)
          ? productData.aiMetadata.occasion.slice(0, 3).join(',')
          : '',
        tags: Array.isArray(productData.aiMetadata?.tags)
          ? productData.aiMetadata.tags.slice(0, 5).join(',')
          : ''
      };

      await this.pineconeIndex.upsert([
        {
          id: `product_${productId}`,
          values: embedding,
          metadata
        }
      ], {
        namespace: this.namespace.PRODUCTS
      });

      logger.debug(`Stored product vector for ${productId}`);
      return true;
    } catch (error) {
      logger.error(`Error storing product vector for ${productId}:`, error);
      return false;
    }
  }

  async searchSimilarProducts(query, options = {}) {
    try {
      const {
        limit = 20,
        threshold = 0.7,
        filters = {},
        includeMetadata = true,
        userContext = null
      } = options;

      if (!this.pineconeIndex) {
        logger.warn('Pinecone not available, falling back to text search');
        return this.fallbackSearch(query, options);
      }

      const queryEmbedding = await embeddingService.generateSearchEmbedding(query, userContext);
      if (!queryEmbedding) {
        throw new Error('Failed to generate query embedding');
      }

      const pineconeFilter = this.buildPineconeFilter(filters);
      const searchResults = await this.pineconeIndex.query({
        vector: queryEmbedding,
        topK: Math.min(limit * 2, 100),
        includeMetadata,
        filter: pineconeFilter,
        namespace: this.namespace.PRODUCTS
      });

      const processedResults = this.processSearchResults(
        searchResults.matches || [],
        threshold,
        limit
      );

      logger.info(`Vector search returned ${processedResults.length} results for query: "${query}"`);
      return processedResults;
    } catch (error) {
      logger.error('Error in vector search:', error);
      return this.fallbackSearch(query, options);
    }
  }

  async getProductRecommendations(userId, options = {}) {
    try {
      const {
        limit = 10,
        baseProducts = [],
        excludeProducts = [],
        diversityFactor = 0.3
      } = options;

      if (!this.pineconeIndex) {
        return this.fallbackRecommendations(userId, options);
      }

      let recommendations = [];
      if (baseProducts.length > 0) {
        for (const productId of baseProducts.slice(0, 3)) {
          const similarProducts = await this.findSimilarProducts(productId, {
            limit: Math.ceil(limit / baseProducts.length) + 2,
            exclude: [...excludeProducts, ...baseProducts]
          });
          recommendations.push(...similarProducts);
        }
      } else {
        recommendations = await this.getTrendingProducts(limit * 2);
      }

      recommendations = this.diversifyRecommendations(recommendations, diversityFactor);
      return recommendations.slice(0, limit);
    } catch (error) {
      logger.error('Error getting product recommendations:', error);
      return this.fallbackRecommendations(userId, options);
    }
  }

  async findSimilarProducts(productId, options = {}) {
    try {
      const { limit = 10, threshold = 0.8, exclude = [] } = options;

      if (!this.pineconeIndex) {
        return this.fallbackSimilarProducts(productId, options);
      }

      const productVector = await this.getProductVector(productId);
      if (!productVector) {
        throw new Error(`Product vector not found for ${productId}`);
      }

      const searchResults = await this.pineconeIndex.query({
        vector: productVector,
        topK: limit + exclude.length + 1,
        includeMetadata: true,
        filter: {
          productId: { $ne: productId.toString() }
        },
        namespace: this.namespace.PRODUCTS
      });

      const similarProducts = this.processSearchResults(
        searchResults.matches || [],
        threshold,
        limit
      ).filter(result => !exclude.includes(result.productId));

      return similarProducts.slice(0, limit);
    } catch (error) {
      logger.error(`Error finding similar products for ${productId}:`, error);
      return this.fallbackSimilarProducts(productId, options);
    }
  }

  async updateProductVector(productId, productData) {
    return await this.storeProductVector(productId, productData);
  }

  async deleteProductVector(productId) {
    try {
      if (!this.pineconeIndex) {
        return true;
      }
      await this.pineconeIndex.delete({
        ids: [`product_${productId}`],
        namespace: this.namespace.PRODUCTS
      });
      logger.debug(`Deleted product vector for ${productId}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting product vector for ${productId}:`, error);
      return false;
    }
  }

  async batchStoreProducts(products) {
    try {
      if (!this.pineconeIndex || !Array.isArray(products) || products.length === 0) {
        return false;
      }

      const batchSize = 100;
      const results = [];

      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        const vectors = [];

        for (const product of batch) {
          try {
            const embedding = await embeddingService.generateProductEmbedding(product);
            if (embedding) {
              vectors.push({
                id: `product_${product._id}`,
                values: embedding,
                metadata: this.buildProductMetadata(product)
              });
            }
          } catch (error) {
            logger.warn(`Failed to process product ${product._id} in batch:`, error.message);
          }
        }

        if (vectors.length > 0) {
          await this.pineconeIndex.upsert(vectors, {
            namespace: this.namespace.PRODUCTS
          });
          results.push(...vectors);
        }

        if (i + batchSize < products.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info(`Batch stored ${results.length} product vectors`);
      return true;
    } catch (error) {
      logger.error('Error in batch store products:', error);
      return false;
    }
  }

  async getStats() {
    try {
      if (!this.pineconeIndex) {
        return { status: 'disabled' };
      }
      const stats = await this.pineconeIndex.describeIndexStats();
      return {
        status: 'connected',
        totalVectors: stats.totalVectorCount || 0,
        dimension: stats.dimension || 1536,
        namespaces: stats.namespaces || {},
        indexName: process.env.PINECONE_INDEX_NAME
      };
    } catch (error) {
      logger.error('Error getting vector stats:', error);
      return { status: 'error', error: error.message };
    }
  }

  async getProductVector(productId) {
    try {
      if (!this.pineconeIndex) return null;
      const result = await this.pineconeIndex.fetch({
        ids: [`product_${productId}`],
        namespace: this.namespace.PRODUCTS
      });
      return result.vectors[`product_${productId}`]?.values || null;
    } catch (error) {
      logger.error(`Error fetching product vector ${productId}:`, error);
      return null;
    }
  }

  buildPineconeFilter(filters) {
    const pineconeFilter = {};
    if (filters.category) {
      pineconeFilter.category = { $eq: filters.category };
    }
    if (filters.priceRange) {
      if (filters.priceRange.min !== undefined) {
        pineconeFilter.price = { $gte: filters.priceRange.min };
      }
      if (filters.priceRange.max !== undefined) {
        pineconeFilter.price = { ...pineconeFilter.price, $lte: filters.priceRange.max };
      }
    }
    if (filters.inStock) {
      pineconeFilter.inStock = { $eq: true };
    }
    if (filters.featured) {
      pineconeFilter.featured = { $eq: true };
    }
    if (filters.minRating) {
      pineconeFilter.rating = { $gte: filters.minRating };
    }
    return pineconeFilter;
  }

  buildProductMetadata(product) {
    return {
      productId: product._id.toString(),
      name: product.name?.substring(0, 100) || '',
      category: product.category || '',
      brand: product.brand?.substring(0, 50) || '',
      price: product.price?.current || 0,
      inStock: product.inventory?.stock > 0,
      featured: product.featured || false,
      rating: product.analytics?.rating?.average || 0,
      createdAt: product.createdAt?.toISOString() || new Date().toISOString(),
      style: product.aiMetadata?.style?.substring(0, 30) || '',
      occasion: Array.isArray(product.aiMetadata?.occasion)
        ? product.aiMetadata.occasion.slice(0, 3).join(',')
        : '',
      tags: Array.isArray(product.aiMetadata?.tags)
        ? product.aiMetadata.tags.slice(0, 5).join(',')
        : ''
    };
  }

  processSearchResults(matches, threshold, limit) {
    return matches
      .filter(match => match.score >= threshold)
      .map(match => ({
        productId: match.metadata?.productId || match.id.replace('product_', ''),
        similarity: match.score,
        metadata: match.metadata || {}
      }))
      .slice(0, limit);
  }

  diversifyRecommendations(recommendations, diversityFactor) {
    if (diversityFactor <= 0) return recommendations;
    const diversified = [];
    const seen = new Set();
    const categories = new Set();

    for (const rec of recommendations) {
      if (seen.has(rec.productId)) continue;
      const category = rec.metadata?.category;
      const isDiverse = !category || !categories.has(category) || Math.random() < diversityFactor;

      if (isDiverse) {
        diversified.push(rec);
        seen.add(rec.productId);
        if (category) categories.add(category);
      }
    }
    return diversified;
  }

  async fallbackSearch(query, options) {
    logger.info('Using fallback search (Pinecone unavailable)');
    return [];
  }

  async fallbackRecommendations(userId, options) {
    logger.info('Using fallback recommendations (Pinecone unavailable)');
    return [];
  }

  async fallbackSimilarProducts(productId, options) {
    logger.info('Using fallback similar products (Pinecone unavailable)');
    return [];
  }

  async getTrendingProducts(limit) {
    return [];
  }
}

export const vectorService = new VectorService();