import 'dotenv/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { vectorService } from './vectorService.js';
import { embeddingService } from './embeddingService.js';
import { Product } from '../models/Product.js';
import { ChatSession } from '../models/ChatSession.js';
import { logger } from '../utils/logger.js';
import { cache } from '../utils/cache.js';

class RAGService {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    if (!apiKey) {
      logger.warn('Neither GEMINI_API_KEY nor GOOGLE_API_KEY is defined in process.env');
    }

    this.llm = new ChatGoogleGenerativeAI({
      apiKey: apiKey,
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      temperature: 0.3,
      maxOutputTokens: 1000
    });

    this.embeddingModel = embeddingService;
    this.vectorStore = vectorService;

    this.initializePrompts();
  }

  initializePrompts() {
    this.productRecommendationPrompt = PromptTemplate.fromTemplate(`
You are an AI shopping assistant for an upscale bag store. You help customers find the perfect bags based on their needs, preferences, and style.

Customer Query: {query}
Relevant Products Found: {products}
Customer Context:
- Previous searches: {searchHistory}
- Viewed products: {viewHistory}
- Preferences: {preferences}
- Cart items: {cartItems}

Instructions:
1. Provide personalized product recommendations based on the customer's query and context
2. Explain why each recommendation fits their needs
3. Mention key features, materials, and styling options
4. Suggest complementary items when appropriate
5. Be conversational, helpful, and enthusiastic about fashion
6. If no perfect matches, suggest similar alternatives and explain the differences
7. Always include product names and key details
8. Keep responses concise but informative (2-3 paragraphs max)

Response:
    `);

    this.productComparisonPrompt = PromptTemplate.fromTemplate(`
You are helping a customer compare different bag options. Provide a clear, helpful comparison.

Products to Compare: {products}
Customer Query: {query}

Instructions:
1. Create a structured comparison highlighting key differences
2. Focus on materials, size, functionality, style, and price
3. Suggest which product might be better for different use cases
4. Be objective but helpful in guiding their decision
5. Mention any standout features or unique selling points

Comparison:
    `);

    this.generalAssistantPrompt = PromptTemplate.fromTemplate(`
You are a knowledgeable and friendly AI shopping assistant for a premium bag store.

Customer Message: {query}
Conversation History: {conversationHistory}
Customer Context: {customerContext}
Available Products (if relevant): {relevantProducts}

Instructions:
1. Provide helpful, accurate information about bags, fashion, and styling
2. Be conversational and engaging while maintaining professionalism
3. If the customer asks about products, use the available product information
4. Offer styling advice, care instructions, or usage suggestions when appropriate
5. Guide customers toward making informed purchasing decisions
6. If you don't have specific information, be honest and offer to help find it
7. Keep responses natural and conversational (1-2 paragraphs typically)

Response:
    `);

    this.queryEnhancementPrompt = PromptTemplate.fromTemplate(`
Analyze this search query and extract key information for better product matching.

Original Query: {query}
User Context: {context}

Extract and return a JSON object with:
- intent: (product-search, comparison, styling-advice, general-question)
- categories: [list of relevant bag categories]
- features: [desired features mentioned]
- style: (casual, formal, trendy, classic, etc.)
- occasion: [occasions mentioned]
- price_sensitivity: (budget, mid-range, luxury, not-specified)
- color_preferences: [colors mentioned]
- size_preferences: [size requirements]
- enhanced_query: (improved search terms for vector search)

JSON Response:
    `);
  }

  async processChat(message, sessionId, userId = null) {
    try {
      const startTime = Date.now();
      let session = await ChatSession.findOne({ sessionId });
      if (!session) {
        session = await ChatSession.createSession(userId);
      }

      const queryAnalysis = await this.analyzeQuery(message, session.context);

      await session.updateContext({
        currentTopic: queryAnalysis.intent,
        userPreferences: {
          ...session.context.userPreferences,
          ...queryAnalysis.preferences
        }
      });

      let response;
      let relevantProducts = [];

      switch (queryAnalysis.intent) {
        case 'product-search':
          relevantProducts = await this.findRelevantProducts(queryAnalysis);
          response = await this.generateProductRecommendation(
            message,
            relevantProducts,
            session.context
          );
          break;
        case 'comparison':
          relevantProducts = await this.findProductsForComparison(queryAnalysis);
          response = await this.generateProductComparison(message, relevantProducts);
          break;
        case 'styling-advice':
        case 'general-question':
        default:
          relevantProducts = await this.findContextualProducts(session.context);
          response = await this.generateGeneralResponse(
            message,
            session.messages.slice(-5),
            session.context,
            relevantProducts
          );
          break;
      }

      const responseTime = Date.now() - startTime;

      await session.addMessage('user', message);
      await session.addMessage('assistant', response, {
        intent: queryAnalysis.intent,
        confidence: queryAnalysis.confidence,
        responseTime,
        relevantProducts: relevantProducts.map(p => p._id),
        vectorSimilarity: queryAnalysis.vectorSimilarity
      });

      if (relevantProducts.length > 0) {
        session.analytics.productRecommendations += relevantProducts.length;
      }
      await session.save();

      logger.info(`RAG chat processed in ${responseTime}ms for session ${sessionId}`);
      return {
        response,
        products: relevantProducts,
        intent: queryAnalysis.intent,
        sessionId: session.sessionId,
        responseTime
      };
    } catch (error) {
      logger.error('Error processing RAG chat:', error);
      return {
        response: "I apologize, but I'm having trouble processing your request right now. Please try again or contact our customer service for assistance.",
        products: [],
        intent: 'error',
        sessionId,
        error: error.message
      };
    }
  }

  async analyzeQuery(query, sessionContext = {}) {
    try {
      const analysisChain = RunnableSequence.from([
        this.queryEnhancementPrompt,
        this.llm,
        new StringOutputParser()
      ]);

      const analysisResult = await analysisChain.invoke({
        query,
        context: JSON.stringify(sessionContext, null, 2)
      });

      let analysis;
      try {
        analysis = JSON.parse(analysisResult);
      } catch (parseError) {
        logger.warn('Failed to parse query analysis JSON, using fallback');
        analysis = this.fallbackQueryAnalysis(query);
      }

      const queryEmbedding = await this.embeddingModel.generateSearchEmbedding(
        analysis.enhanced_query || query,
        sessionContext
      );

      return {
        ...analysis,
        originalQuery: query,
        confidence: this.calculateConfidence(analysis),
        queryEmbedding
      };
    } catch (error) {
      logger.error('Error analyzing query:', error);
      return this.fallbackQueryAnalysis(query);
    }
  }

  async findRelevantProducts(queryAnalysis, limit = 10) {
    try {
      const cacheKey = `rag:products:${Buffer.from(queryAnalysis.enhanced_query || queryAnalysis.originalQuery).toString('base64').slice(0, 50)}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const filters = {};
      if (queryAnalysis.categories && queryAnalysis.categories.length > 0) {
        filters.category = queryAnalysis.categories[0];
      }

      if (queryAnalysis.price_sensitivity) {
        const priceRanges = {
          budget: { max: 100 },
          'mid-range': { min: 100, max: 500 },
          luxury: { min: 500 }
        };
        filters.priceRange = priceRanges[queryAnalysis.price_sensitivity];
      }

      let vectorResults = [];
      if (queryAnalysis.queryEmbedding) {
        vectorResults = await this.vectorStore.searchSimilarProducts(
          queryAnalysis.enhanced_query || queryAnalysis.originalQuery,
          { limit, filters, threshold: 0.7 }
        );
      }

      const productIds = vectorResults.map(r => r.productId);
      let products = [];
      if (productIds.length > 0) {
        products = await Product.find({
          _id: { $in: productIds },
          status: 'active'
        }).limit(limit);

        products = productIds
          .map(id => products.find(p => p._id.toString() === id))
          .filter(Boolean);
      }

      if (products.length < limit) {
        const textSearchResults = await Product.searchProducts(
          queryAnalysis.originalQuery,
          filters
        ).limit(limit - products.length);

        const existingIds = new Set(products.map(p => p._id.toString()));
        for (const product of textSearchResults) {
          if (!existingIds.has(product._id.toString())) {
            products.push(product);
          }
        }
      }

      await cache.set(cacheKey, products, 300);
      return products;
    } catch (error) {
      logger.error('Error finding relevant products:', error);
      return [];
    }
  }

  async generateProductRecommendation(query, products, sessionContext) {
    try {
      const recommendationChain = RunnableSequence.from([
        this.productRecommendationPrompt,
        this.llm,
        new StringOutputParser()
      ]);

      const productInfo = products.map(product => ({
        name: product.name,
        price: product.price?.current,
        category: product.category,
        description: product.description?.substring(0, 200),
        features: product.specifications?.features?.slice(0, 3),
        material: product.specifications?.material,
        inStock: product.inventory?.stock > 0,
        rating: product.analytics?.rating?.average
      }));

      return await recommendationChain.invoke({
        query,
        products: JSON.stringify(productInfo, null, 2),
        searchHistory: JSON.stringify(sessionContext.searchQueries || []),
        viewHistory: JSON.stringify(sessionContext.viewedProducts?.slice(-5) || []),
        preferences: JSON.stringify(sessionContext.userPreferences || {}),
        cartItems: JSON.stringify(sessionContext.cartItems || [])
      });
    } catch (error) {
      logger.error('Error generating product recommendation:', error);
      return "I found some great products for you, but I'm having trouble formatting my response. Please check out the products I've found!";
    }
  }

  async generateProductComparison(query, products) {
    try {
      const comparisonChain = RunnableSequence.from([
        this.productComparisonPrompt,
        this.llm,
        new StringOutputParser()
      ]);

      const productInfo = products.map(product => ({
        name: product.name,
        price: product.price?.current,
        category: product.category,
        material: product.specifications?.material,
        dimensions: product.specifications?.dimensions,
        features: product.specifications?.features,
        description: product.description?.substring(0, 150)
      }));

      return await comparisonChain.invoke({
        query,
        products: JSON.stringify(productInfo, null, 2)
      });
    } catch (error) {
      logger.error('Error generating product comparison:', error);
      return "I can help you compare these products, but I'm having trouble formatting the comparison right now.";
    }
  }

  async generateGeneralResponse(query, conversationHistory, sessionContext, relevantProducts = []) {
    try {
      const generalChain = RunnableSequence.from([
        this.generalAssistantPrompt,
        this.llm,
        new StringOutputParser()
      ]);

      const productInfo = relevantProducts.slice(0, 5).map(product => ({
        name: product.name,
        category: product.category,
        price: product.price?.current,
        description: product.description?.substring(0, 100)
      }));

      return await generalChain.invoke({
        query,
        conversationHistory: JSON.stringify(
          conversationHistory.map(m => ({
            role: m.role,
            content: m.content?.substring(0, 200)
          }))
        ),
        customerContext: JSON.stringify(sessionContext),
        relevantProducts: JSON.stringify(productInfo, null, 2)
      });
    } catch (error) {
      logger.error('Error generating general response:', error);
      return "I'm here to help you find the perfect bag! Could you tell me more about what you're looking for?";
    }
  }

  async findProductsForComparison(queryAnalysis) {
    return await this.findRelevantProducts(queryAnalysis, 4);
  }

  async findContextualProducts(sessionContext) {
    try {
      const filters = {};
      if (sessionContext.userPreferences?.categories?.length > 0) {
        filters.category = sessionContext.userPreferences.categories[0];
      }
      return await Product.findFeatured(6);
    } catch (error) {
      logger.error('Error finding contextual products:', error);
      return [];
    }
  }

  fallbackQueryAnalysis(query) {
    const keywords = query.toLowerCase();
    return {
      intent: keywords.includes('compare') ? 'comparison' : 'product-search',
      categories: this.extractCategories(keywords),
      enhanced_query: query,
      confidence: 0.5,
      originalQuery: query
    };
  }

  extractCategories(keywords) {
    const categoryMap = {
      handbag: 'handbags',
      purse: 'handbags',
      backpack: 'backpacks',
      tote: 'tote-bags',
      crossbody: 'crossbody',
      clutch: 'clutches',
      wallet: 'wallets'
    };
    const categories = [];
    for (const [keyword, category] of Object.entries(categoryMap)) {
      if (keywords.includes(keyword)) {
        categories.push(category);
      }
    }
    return categories;
  }

  calculateConfidence(analysis) {
    let confidence = 0.5;
    if (analysis.intent && analysis.intent !== 'general-question') confidence += 0.2;
    if (analysis.categories && analysis.categories.length > 0) confidence += 0.2;
    if (analysis.enhanced_query && analysis.enhanced_query !== analysis.originalQuery) confidence += 0.1;
    return Math.min(confidence, 1.0);
  }

  async getStats() {
    try {
      const vectorStats = await this.vectorStore.getStats();
      return {
        llmModel: 'gemini-1.5-flash',
        embeddingModel: 'embedding-001',
        vectorStore: vectorStats,
        prompts: {
          productRecommendation: 'active',
          productComparison: 'active',
          generalAssistant: 'active',
          queryEnhancement: 'active'
        }
      };
    } catch (error) {
      logger.error('Error getting RAG stats:', error);
      return { status: 'error', error: error.message };
    }
  }
}

export const ragService = new RAGService();