import mongoose from 'mongoose';

const searchAnalyticsSchema = new mongoose.Schema({
  // Search query details
  query: {
    original: {
      type: String,
      required: true,
      trim: true
    },
    processed: {
      type: String, // Cleaned/normalized query
      trim: true
    },
    tokens: [String], // Tokenized query terms
    intent: {
      type: String,
      enum: ['product-search', 'category-browse', 'brand-search', 'price-inquiry', 'comparison', 'general'],
      default: 'product-search'
    },
    language: {
      type: String,
      default: 'en'
    }
  },
  
  // User context
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Allow anonymous searches
  },
  sessionId: String,
  isAuthenticated: {
    type: Boolean,
    default: false
  },
  
  // Search filters applied
  filters: {
    category: [String],
    priceRange: {
      min: Number,
      max: Number
    },
    brand: [String],
    color: [String],
    material: [String],
    inStock: Boolean,
    onSale: Boolean,
    rating: Number,
    sortBy: String,
    sortOrder: {
      type: String,
      enum: ['asc', 'desc'],
      default: 'desc'
    }
  },
  
  // Search results
  results: {
    totalFound: {
      type: Number,
      default: 0
    },
    returned: {
      type: Number,
      default: 0
    },
    page: {
      type: Number,
      default: 1
    },
    pageSize: {
      type: Number,
      default: 20
    },
    // Store product IDs for analysis
    productIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }],
    // Search method used
    method: {
      type: String,
      enum: ['text-search', 'vector-search', 'hybrid', 'filter-only'],
      default: 'text-search'
    },
    // Performance metrics
    responseTime: {
      type: Number, // milliseconds
      default: 0
    },
    // Relevance scores (for vector search)
    relevanceScores: [Number]
  },
  
  // AI-powered search enhancements
  aiEnhancements: {
    // Query understanding
    entities: [{
      type: String, // 'product', 'brand', 'color', 'material', etc.
      value: String,
      confidence: Number,
      source: String // 'ner', 'keyword-matching', 'embedding'
    }],
    
    // Query expansion
    expandedTerms: [String],
    synonyms: [String],
    
    // Semantic search
    vectorQuery: [{
      type: Number // Query embedding
    }],
    semanticMatches: [{
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      },
      similarity: Number,
      matchType: String // 'semantic', 'visual', 'hybrid'
    }],
    
    // Auto-corrections and suggestions
    correctedQuery: String,
    suggestions: [String],
    didYouMean: String
  },
  
  // User interaction tracking
  interactions: {
    // Products clicked from search results
    clicks: [{
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      },
      position: Number, // Position in search results
      timestamp: Date,
      clickType: String // 'product-card', 'quick-view', 'add-to-cart'
    }],
    
    // Products added to cart from search
    cartAdditions: [{
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      },
      position: Number,
      timestamp: Date,
      quantity: Number
    }],
    
    // Products added to wishlist
    wishlistAdditions: [{
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      },
      position: Number,
      timestamp: Date
    }],
    
    // Search refinements
    refinements: [{
      type: String, // 'filter-added', 'filter-removed', 'sort-changed', 'query-modified'
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
      timestamp: Date
    }],
    
    // Time spent on search results page
    timeOnPage: Number, // seconds
    scrollDepth: Number, // percentage of page scrolled
    
    // Exit actions
    exitAction: {
      type: String,
      enum: ['product-click', 'new-search', 'navigation', 'cart', 'checkout', 'close'],
      timestamp: Date
    }
  },
  
  // Business metrics
  business: {
    // Conversion tracking
    converted: {
      type: Boolean,
      default: false
    },
    conversionValue: {
      type: Number,
      default: 0
    },
    conversionProducts: [{
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      },
      quantity: Number,
      price: Number
    }],
    
    // Revenue attribution
    revenue: {
      immediate: Number, // Revenue from same session
      attributed: Number, // Revenue attributed within attribution window
      attributionWindow: Number // Days
    }
  },
  
  // Technical details
  technical: {
    searchEngine: {
      type: String,
      enum: ['mongodb-text', 'elasticsearch', 'pinecone', 'hybrid'],
      default: 'mongodb-text'
    },
    userAgent: String,
    ipAddress: String,
    location: {
      country: String,
      city: String,
      coordinates: [Number] // [longitude, latitude]
    },
    device: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet'],
      default: 'desktop'
    },
    referrer: String
  },
  
  // Quality metrics
  quality: {
    // Search satisfaction (if user provides feedback)
    satisfaction: {
      type: Number,
      min: 1,
      max: 5
    },
    
    // Implicit satisfaction signals
    bounceRate: Boolean, // True if user left immediately
    refinementCount: {
      type: Number,
      default: 0
    },
    
    // Search effectiveness
    clickThroughRate: Number,
    conversionRate: Number,
    
    // Result relevance (based on user behavior)
    avgClickPosition: Number,
    topResultClicked: Boolean
  },
  
  // Timestamps
  searchedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date, // When user finished interacting with results
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for analytics and performance
searchAnalyticsSchema.index({ 'query.original': 'text' });
searchAnalyticsSchema.index({ user: 1, searchedAt: -1 });
searchAnalyticsSchema.index({ sessionId: 1 });
searchAnalyticsSchema.index({ searchedAt: -1 });
searchAnalyticsSchema.index({ 'query.intent': 1 });
searchAnalyticsSchema.index({ 'results.method': 1 });
searchAnalyticsSchema.index({ 'business.converted': 1 });
searchAnalyticsSchema.index({ 'technical.device': 1 });
searchAnalyticsSchema.index({ 'results.totalFound': 1 });

// Virtual for search success
searchAnalyticsSchema.virtual('isSuccessful').get(function() {
  return this.results.totalFound > 0 && (
    this.interactions.clicks.length > 0 || 
    this.interactions.cartAdditions.length > 0 ||
    this.business.converted
  );
});

// Virtual for engagement score
searchAnalyticsSchema.virtual('engagementScore').get(function() {
  let score = 0;
  
  // Base points for having results
  if (this.results.totalFound > 0) score += 10;
  
  // Points for interactions
  score += this.interactions.clicks.length * 5;
  score += this.interactions.cartAdditions.length * 15;
  score += this.interactions.wishlistAdditions.length * 10;
  
  // Points for time spent
  if (this.interactions.timeOnPage > 30) score += 10;
  if (this.interactions.timeOnPage > 120) score += 20;
  
  // Points for conversion
  if (this.business.converted) score += 50;
  
  return Math.min(score, 100);
});

// Pre-save middleware
searchAnalyticsSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Calculate quality metrics
  if (this.interactions.clicks.length > 0) {
    const positions = this.interactions.clicks.map(click => click.position);
    this.quality.avgClickPosition = positions.reduce((sum, pos) => sum + pos, 0) / positions.length;
    this.quality.topResultClicked = positions.some(pos => pos <= 3);
    this.quality.clickThroughRate = this.interactions.clicks.length / Math.max(this.results.returned, 1);
  }
  
  // Check bounce rate
  this.quality.bounceRate = this.interactions.timeOnPage < 5 && this.interactions.clicks.length === 0;
  
  // Count refinements
  this.quality.refinementCount = this.interactions.refinements.length;
  
  // Calculate conversion rate
  if (this.business.converted) {
    this.quality.conversionRate = 1;
  }
  
  next();
});

// Static methods
searchAnalyticsSchema.statics.getSearchTrends = function(days = 30) {
  const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
  
  return this.aggregate([
    { $match: { searchedAt: { $gte: startDate } } },
    {
      $group: {
        _id: '$query.original',
        searchCount: { $sum: 1 },
        uniqueUsers: { $addToSet: '$user' },
        avgResults: { $avg: '$results.totalFound' },
        totalClicks: { $sum: { $size: '$interactions.clicks' } },
        totalConversions: { $sum: { $cond: ['$business.converted', 1, 0] } },
        avgResponseTime: { $avg: '$results.responseTime' }
      }
    },
    { $sort: { searchCount: -1 } },
    { $limit: 50 }
  ]);
};

searchAnalyticsSchema.statics.getConversionFunnel = function(startDate, endDate) {
  return this.aggregate([
    { $match: { searchedAt: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: null,
        totalSearches: { $sum: 1 },
        searchesWithResults: {
          $sum: { $cond: [{ $gt: ['$results.totalFound', 0] }, 1, 0] }
        },
        searchesWithClicks: {
          $sum: { $cond: [{ $gt: [{ $size: '$interactions.clicks' }, 0] }, 1, 0] }
        },
        searchesWithCartAdds: {
          $sum: { $cond: [{ $gt: [{ $size: '$interactions.cartAdditions' }, 0] }, 1, 0] }
        },
        searchesWithConversions: {
          $sum: { $cond: ['$business.converted', 1, 0] }
        },
        totalRevenue: { $sum: '$business.revenue.immediate' }
      }
    }
  ]);
};

// Instance methods
searchAnalyticsSchema.methods.recordClick = function(productId, position, clickType = 'product-card') {
  this.interactions.clicks.push({
    productId,
    position,
    clickType,
    timestamp: new Date()
  });
  return this.save();
};

searchAnalyticsSchema.methods.recordCartAddition = function(productId, position, quantity = 1) {
  this.interactions.cartAdditions.push({
    productId,
    position,
    quantity,
    timestamp: new Date()
  });
  return this.save();
};

searchAnalyticsSchema.methods.recordConversion = function(products, totalValue) {
  this.business.converted = true;
  this.business.conversionValue = totalValue;
  this.business.conversionProducts = products;
  this.business.revenue.immediate = totalValue;
  return this.save();
};

searchAnalyticsSchema.methods.addRefinement = function(type, field, oldValue, newValue) {
  this.interactions.refinements.push({
    type,
    field,
    oldValue,
    newValue,
    timestamp: new Date()
  });
  return this.save();
};

searchAnalyticsSchema.methods.complete = function(exitAction, timeOnPage = 0, scrollDepth = 0) {
  this.completedAt = new Date();
  this.interactions.timeOnPage = timeOnPage;
  this.interactions.scrollDepth = scrollDepth;
  this.interactions.exitAction = {
    type: exitAction,
    timestamp: new Date()
  };
  return this.save();
};

export const SearchAnalytics = mongoose.model('SearchAnalytics', searchAnalyticsSchema);