import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  // AI metadata
  metadata: {
    intent: String, // 'product-search', 'recommendation', 'support', 'general'
    confidence: Number,
    entities: [{
      type: String, // 'product', 'category', 'price', 'color', etc.
      value: String,
      confidence: Number
    }],
    sentiment: {
      score: Number, // -1 to 1
      label: String  // 'positive', 'negative', 'neutral'
    },
    responseTime: Number, // milliseconds
    sources: [String], // References to products/documents used
    vectorSimilarity: Number
  }
});

const chatSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Allow guest sessions
  },
  // Session metadata
  isActive: {
    type: Boolean,
    default: true
  },
  isGuest: {
    type: Boolean,
    default: true
  },
  
  // Conversation history
  messages: [messageSchema],
  
  // Session context
  context: {
    currentTopic: String,
    userPreferences: {
      categories: [String],
      priceRange: {
        min: Number,
        max: Number
      },
      style: String,
      occasion: String
    },
    cartItems: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      },
      addedDuringSession: Boolean
    }],
    viewedProducts: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      },
      timestamp: Date,
      duration: Number // seconds spent viewing
    }],
    searchQueries: [String],
    location: {
      country: String,
      city: String,
      timezone: String
    }
  },
  
  // AI behavior settings
  aiSettings: {
    personality: {
      type: String,
      enum: ['friendly', 'professional', 'casual', 'expert'],
      default: 'friendly'
    },
    responseLength: {
      type: String,
      enum: ['concise', 'detailed', 'adaptive'],
      default: 'adaptive'
    },
    proactiveness: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    usePersonalization: {
      type: Boolean,
      default: true
    }
  },
  
  // Session analytics
  analytics: {
    totalMessages: {
      type: Number,
      default: 0
    },
    userMessages: {
      type: Number,
      default: 0
    },
    assistantMessages: {
      type: Number,
      default: 0
    },
    averageResponseTime: {
      type: Number,
      default: 0
    },
    sessionDuration: {
      type: Number,
      default: 0 // milliseconds
    },
    productRecommendations: {
      type: Number,
      default: 0
    },
    productsViewed: {
      type: Number,
      default: 0
    },
    productsAddedToCart: {
      type: Number,
      default: 0
    },
    conversionsFromChat: {
      type: Number,
      default: 0
    },
    satisfactionScore: {
      type: Number,
      min: 1,
      max: 5
    },
    resolved: {
      type: Boolean,
      default: false
    }
  },
  
  // Session status
  status: {
    type: String,
    enum: ['active', 'idle', 'ended', 'escalated'],
    default: 'active'
  },
  
  // Escalation to human support
  escalation: {
    escalated: {
      type: Boolean,
      default: false
    },
    escalatedAt: Date,
    escalatedBy: String, // 'user' or 'system'
    reason: String,
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    resolvedAt: Date,
    resolution: String
  },
  
  // Feedback
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    submittedAt: Date,
    categories: [String] // 'helpful', 'accurate', 'fast', 'friendly'
  },
  
  // Privacy and compliance
  dataRetention: {
    expiresAt: {
      type: Date,
      default: function() {
        return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
      }
    },
    canDelete: {
      type: Boolean,
      default: true
    }
  },
  
  // Timestamps
  startedAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  endedAt: Date,
  
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

// Indexes
chatSessionSchema.index({ sessionId: 1 });
chatSessionSchema.index({ user: 1, createdAt: -1 });
chatSessionSchema.index({ status: 1 });
chatSessionSchema.index({ isActive: 1, lastActivity: -1 });
chatSessionSchema.index({ 'dataRetention.expiresAt': 1 }, { expireAfterSeconds: 0 });

// Virtual for session age
chatSessionSchema.virtual('age').get(function() {
  return Date.now() - this.startedAt.getTime();
});

// Virtual for actual session duration
chatSessionSchema.virtual('actualDuration').get(function() {
  const endTime = this.endedAt || this.lastActivity || new Date();
  return endTime.getTime() - this.startedAt.getTime();
});

// Virtual for message count
chatSessionSchema.virtual('messageCount').get(function() {
  return this.messages.length;
});

// Pre-save middleware
chatSessionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  if (this.messages.length > 0) {
    this.lastActivity = new Date();
    
    // Update analytics
    this.analytics.totalMessages = this.messages.length;
    this.analytics.userMessages = this.messages.filter(m => m.role === 'user').length;
    this.analytics.assistantMessages = this.messages.filter(m => m.role === 'assistant').length;
    
    // Calculate average response time
    const responseTimes = this.messages
      .filter(m => m.metadata && m.metadata.responseTime)
      .map(m => m.metadata.responseTime);
    
    if (responseTimes.length > 0) {
      this.analytics.averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    }
    
    // Update session duration
    this.analytics.sessionDuration = this.actualDuration;
  }
  
  // Auto-end inactive sessions after 30 minutes
  const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
  if (this.isActive && this.lastActivity && (Date.now() - this.lastActivity.getTime()) > inactiveThreshold) {
    this.status = 'idle';
  }
  
  next();
});

// Static methods
chatSessionSchema.statics.createSession = function(userId = null) {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  return this.create({
    sessionId,
    user: userId,
    isGuest: !userId,
    startedAt: new Date()
  });
};

chatSessionSchema.statics.findActiveByUser = function(userId) {
  return this.findOne({
    user: userId,
    status: { $in: ['active', 'idle'] }
  }).sort({ lastActivity: -1 });
};

chatSessionSchema.statics.getAnalytics = function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        averageSessionDuration: { $avg: '$analytics.sessionDuration' },
        averageMessagesPerSession: { $avg: '$analytics.totalMessages' },
        totalMessages: { $sum: '$analytics.totalMessages' },
        averageResponseTime: { $avg: '$analytics.averageResponseTime' },
        conversions: { $sum: '$analytics.conversionsFromChat' },
        escalations: {
          $sum: { $cond: ['$escalation.escalated', 1, 0] }
        },
        satisfactionScore: { $avg: '$analytics.satisfactionScore' }
      }
    }
  ]);
};

// Instance methods
chatSessionSchema.methods.addMessage = function(role, content, metadata = {}) {
  this.messages.push({
    role,
    content,
    timestamp: new Date(),
    metadata
  });
  
  return this.save();
};

chatSessionSchema.methods.updateContext = function(contextUpdate) {
  this.context = { ...this.context, ...contextUpdate };
  return this.save();
};

chatSessionSchema.methods.addProductView = function(productId, duration = 0) {
  this.context.viewedProducts.push({
    product: productId,
    timestamp: new Date(),
    duration
  });
  
  this.analytics.productsViewed += 1;
  return this.save();
};

chatSessionSchema.methods.addCartItem = function(productId) {
  this.context.cartItems.push({
    product: productId,
    addedDuringSession: true
  });
  
  this.analytics.productsAddedToCart += 1;
  return this.save();
};

chatSessionSchema.methods.recordConversion = function() {
  this.analytics.conversionsFromChat += 1;
  return this.save();
};

chatSessionSchema.methods.escalate = function(reason, escalatedBy = 'user') {
  this.escalation = {
    escalated: true,
    escalatedAt: new Date(),
    escalatedBy,
    reason
  };
  this.status = 'escalated';
  return this.save();
};

chatSessionSchema.methods.end = function(reason = 'user-ended') {
  this.status = 'ended';
  this.endedAt = new Date();
  this.isActive = false;
  
  // Add system message about session end
  this.messages.push({
    role: 'system',
    content: `Session ended: ${reason}`,
    timestamp: new Date(),
    metadata: { sessionEnd: true, reason }
  });
  
  return this.save();
};

chatSessionSchema.methods.submitFeedback = function(rating, comment, categories = []) {
  this.feedback = {
    rating,
    comment,
    categories,
    submittedAt: new Date()
  };
  
  this.analytics.satisfactionScore = rating;
  this.analytics.resolved = rating >= 4; // Consider 4+ stars as resolved
  
  return this.save();
};

chatSessionSchema.methods.getRecentContext = function(messageLimit = 10) {
  return {
    recentMessages: this.messages.slice(-messageLimit),
    context: this.context,
    analytics: this.analytics
  };
};

export const ChatSession = mongoose.model('ChatSession', chatSessionSchema);