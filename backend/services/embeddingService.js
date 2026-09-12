import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger.js';
import { cache } from '../utils/cache.js';

class EmbeddingService {
  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      logger.warn('GOOGLE_API_KEY / GEMINI_API_KEY not found in process.env for EmbeddingService');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.embeddingModel = 'embedding-001';
    this.embeddingDimension = 768;
    this.batchSize = 100;
  }

  async generateEmbedding(text) {
    try {
      if (!text || typeof text !== 'string') {
        throw new Error('Invalid text input for embedding generation');
      }

      const cacheKey = `embedding:${Buffer.from(text).toString('base64').slice(0, 50)}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const cleanText = this.preprocessText(text);
      if (cleanText.length === 0) {
        throw new Error('Text is empty after preprocessing');
      }

      const model = this.genAI.getGenerativeModel({ model: this.embeddingModel });
      const result = await model.embedContent(cleanText);
      const embedding = result.embedding?.values;

      if (!embedding || embedding.length !== this.embeddingDimension) {
        throw new Error(`Invalid embedding dimensions: expected ${this.embeddingDimension}, got ${embedding?.length}`);
      }

      await cache.set(cacheKey, embedding, 86400);
      logger.debug(`Generated embedding for text: ${text.substring(0, 50)}...`);
      return embedding;
    } catch (error) {
      logger.error('Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  async generateBatchEmbeddings(texts) {
    try {
      if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('Invalid texts array for batch embedding generation');
      }

      const results = [];
      for (let i = 0; i < texts.length; i += this.batchSize) {
        const batch = texts.slice(i, i + this.batchSize);
        const batchResults = await Promise.all(
          batch.map(text => this.generateEmbedding(text))
        );
        results.push(...batchResults);
        if (i + this.batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      logger.info(`Generated ${results.length} embeddings in batches`);
      return results;
    } catch (error) {
      logger.error('Error generating batch embeddings:', error);
      throw new Error(`Failed to generate batch embeddings: ${error.message}`);
    }
  }

  async generateProductEmbedding(product) {
    try {
      const productText = this.buildProductText(product);
      return await this.generateEmbedding(productText);
    } catch (error) {
      logger.error('Error generating product embedding:', error);
      throw new Error(`Failed to generate product embedding: ${error.message}`);
    }
  }

  async generateSearchEmbedding(query, context = {}) {
    try {
      let enhancedQuery = query;
      if (context.userPreferences) {
        const preferences = context.userPreferences;
        if (preferences.categories && preferences.categories.length > 0) {
          enhancedQuery += ` ${preferences.categories.join(' ')}`;
        }
        if (preferences.style) {
          enhancedQuery += ` ${preferences.style}`;
        }
      }
      return await this.generateEmbedding(enhancedQuery);
    } catch (error) {
      logger.error('Error generating search embedding:', error);
      throw new Error(`Failed to generate search embedding: ${error.message}`);
    }
  }

  calculateSimilarity(embedding1, embedding2) {
    try {
      if (
        !embedding1 ||
        !embedding2 ||
        embedding1.length !== embedding2.length ||
        embedding1.length !== this.embeddingDimension
      ) {
        throw new Error('Invalid embeddings for similarity calculation');
      }

      let dotProduct = 0;
      let norm1 = 0;
      let norm2 = 0;

      for (let i = 0; i < embedding1.length; i++) {
        dotProduct += embedding1[i] * embedding2[i];
        norm1 += embedding1[i] * embedding1[i];
        norm2 += embedding2[i] * embedding2[i];
      }

      const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
      return Math.max(-1, Math.min(1, similarity));
    } catch (error) {
      logger.error('Error calculating similarity:', error);
      return 0;
    }
  }

  findMostSimilar(queryEmbedding, candidateEmbeddings, topK = 10) {
    try {
      if (!queryEmbedding || !candidateEmbeddings || candidateEmbeddings.length === 0) {
        return [];
      }

      const similarities = candidateEmbeddings.map((embedding, index) => ({
        index,
        similarity: this.calculateSimilarity(queryEmbedding, embedding.vector || embedding),
        metadata: embedding.metadata || {}
      }));

      return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
    } catch (error) {
      logger.error('Error finding most similar embeddings:', error);
      return [];
    }
  }

  preprocessText(text) {
    if (!text) return '';
    return text
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  buildProductText(product) {
    const textParts = [];
    if (product.name) textParts.push(product.name);
    if (product.description) textParts.push(product.description);
    if (product.shortDescription) textParts.push(product.shortDescription);
    if (product.category) textParts.push(product.category);
    if (product.subcategory) textParts.push(product.subcategory);
    if (product.brand) textParts.push(product.brand);
    if (product.specifications) {
      const specs = product.specifications;
      if (specs.material) textParts.push(specs.material);
      if (specs.color) textParts.push(specs.color);
      if (specs.features && Array.isArray(specs.features)) {
        textParts.push(...specs.features);
      }
    }
    if (product.aiMetadata) {
      const ai = product.aiMetadata;
      if (ai.tags && Array.isArray(ai.tags)) {
        textParts.push(...ai.tags);
      }
      if (ai.style) textParts.push(ai.style);
      if (ai.occasion && Array.isArray(ai.occasion)) {
        textParts.push(...ai.occasion);
      }
      if (ai.target_demographic) textParts.push(ai.target_demographic);
    }
    if (product.seo && product.seo.keywords && Array.isArray(product.seo.keywords)) {
      textParts.push(...product.seo.keywords);
    }
    return textParts
      .filter(part => part && typeof part === 'string')
      .join(' ');
  }

  validateEmbedding(embedding) {
    return (
      Array.isArray(embedding) &&
      embedding.length === this.embeddingDimension &&
      embedding.every(val => typeof val === 'number' && !isNaN(val))
    );
  }

  getStats() {
    return {
      embeddingDimension: this.embeddingDimension,
      batchSize: this.batchSize,
      modelName: 'embedding-001',
      provider: 'Google Gemini'
    };
  }
}

export const embeddingService = new EmbeddingService();