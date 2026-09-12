import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1'],
    max: [99, 'Quantity cannot exceed 99']
  },
  price: {
    type: Number,
    required: true,
    min: [0, 'Price cannot be negative']
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  // Store some product data for quick access and price comparison
  productSnapshot: {
    name: String,
    image: String,
    category: String,
    currentPrice: Number,
    inStock: Boolean,
    stockQuantity: Number
  }
});

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [cartItemSchema],
  
  // Cart metadata
  sessionId: String, // For guest carts (future enhancement)
  
  // Pricing calculations
  subtotal: {
    type: Number,
    default: 0,
    min: [0, 'Subtotal cannot be negative']
  },
  
  // Applied discounts
  appliedCoupons: [{
    code: String,
    discount: {
      type: {
        type: String,
        enum: ['percentage', 'fixed']
      },
      value: Number
    },
    appliedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Shipping estimation
  estimatedShipping: {
    cost: {
      type: Number,
      default: 0
    },
    method: String,
    estimatedDays: Number
  },
  
  // Tax estimation
  estimatedTax: {
    amount: {
      type: Number,
      default: 0
    },
    rate: Number
  },
  
  // Total calculation
  estimatedTotal: {
    type: Number,
    default: 0
  },
  
  // Cart state
  isAbandoned: {
    type: Boolean,
    default: false
  },
  abandonedAt: Date,
  
  // Recovery tracking
  recoveryEmails: [{
    sentAt: Date,
    type: String, // 'first-reminder', 'second-reminder', 'final-offer'
    opened: Boolean,
    clicked: Boolean
  }],
  
  // AI and personalization
  aiMetadata: {
    recommendedItems: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      },
      score: Number,
      reason: String, // 'frequently-bought-together', 'similar-style', 'trending'
      addedAt: Date
    }],
    userSegment: String,
    cartValue: String, // 'low', 'medium', 'high'
    conversionProbability: {
      type: Number,
      min: 0,
      max: 1
    },
    abandonmentRisk: {
      type: Number,
      min: 0,
      max: 1
    }
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
cartSchema.index({ user: 1 });
cartSchema.index({ sessionId: 1 });
cartSchema.index({ updatedAt: -1 });
cartSchema.index({ isAbandoned: 1, abandonedAt: -1 });
cartSchema.index({ lastActivity: -1 });

// Virtual for total items count
cartSchema.virtual('itemCount').get(function() {
  return this.items.reduce((total, item) => total + item.quantity, 0);
});

// Virtual for unique items count
cartSchema.virtual('uniqueItemCount').get(function() {
  return this.items.length;
});

// Virtual for cart age
cartSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt.getTime();
});

// Virtual for abandonment duration
cartSchema.virtual('abandonedDuration').get(function() {
  return this.abandonedAt ? Date.now() - this.abandonedAt.getTime() : 0;
});

// Pre-save middleware
cartSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  this.lastActivity = new Date();
  
  // Calculate subtotal
  this.subtotal = this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  // Calculate estimated total
  const couponDiscount = this.appliedCoupons.reduce((total, coupon) => {
    if (coupon.discount.type === 'percentage') {
      return total + (this.subtotal * coupon.discount.value / 100);
    } else {
      return total + coupon.discount.value;
    }
  }, 0);
  
  this.estimatedTotal = Math.max(0, this.subtotal - couponDiscount + this.estimatedShipping.cost + this.estimatedTax.amount);
  
  // Check for abandonment (cart not updated for 24 hours and has items)
  const abandonmentThreshold = 24 * 60 * 60 * 1000; // 24 hours
  if (!this.isAbandoned && this.items.length > 0 && (Date.now() - this.lastActivity.getTime()) > abandonmentThreshold) {
    this.isAbandoned = true;
    this.abandonedAt = new Date();
  }
  
  next();
});

// Static methods
cartSchema.statics.findByUser = function(userId) {
  return this.findOne({ user: userId })
    .populate({
      path: 'items.product',
      select: 'name price images category inventory.stock status'
    });
};

cartSchema.statics.findAbandonedCarts = function(hours = 24) {
  const threshold = new Date(Date.now() - (hours * 60 * 60 * 1000));
  return this.find({
    isAbandoned: true,
    abandonedAt: { $gte: threshold },
    'items.0': { $exists: true } // Has at least one item
  }).populate('user', 'name email preferences.notifications');
};

cartSchema.statics.getCartAnalytics = function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalCarts: { $sum: 1 },
        averageCartValue: { $avg: '$subtotal' },
        abandonedCarts: {
          $sum: { $cond: ['$isAbandoned', 1, 0] }
        },
        averageItems: { $avg: { $size: '$items' } },
        totalValue: { $sum: '$subtotal' }
      }
    }
  ]);
};

// Instance methods
cartSchema.methods.addItem = function(productId, quantity = 1, price) {
  const existingItem = this.items.find(item => item.product.toString() === productId.toString());
  
  if (existingItem) {
    existingItem.quantity += quantity;
    existingItem.addedAt = new Date();
  } else {
    this.items.push({
      product: productId,
      quantity,
      price,
      addedAt: new Date()
    });
  }
  
  return this.save();
};

cartSchema.methods.updateItem = function(productId, quantity) {
  const item = this.items.find(item => item.product.toString() === productId.toString());
  
  if (item) {
    if (quantity <= 0) {
      this.items.pull({ _id: item._id });
    } else {
      item.quantity = quantity;
    }
  }
  
  return this.save();
};

cartSchema.methods.removeItem = function(productId) {
  this.items.pull({ product: productId });
  return this.save();
};

cartSchema.methods.clear = function() {
  this.items = [];
  this.appliedCoupons = [];
  this.estimatedShipping = { cost: 0 };
  this.estimatedTax = { amount: 0 };
  return this.save();
};

cartSchema.methods.applyCoupon = function(couponCode, discountType, discountValue) {
  // Remove existing coupon with same code
  this.appliedCoupons = this.appliedCoupons.filter(coupon => coupon.code !== couponCode);
  
  // Add new coupon
  this.appliedCoupons.push({
    code: couponCode,
    discount: {
      type: discountType,
      value: discountValue
    },
    appliedAt: new Date()
  });
  
  return this.save();
};

cartSchema.methods.removeCoupon = function(couponCode) {
  this.appliedCoupons = this.appliedCoupons.filter(coupon => coupon.code !== couponCode);
  return this.save();
};

cartSchema.methods.validateItems = async function() {
  const Product = mongoose.model('Product');
  const issues = [];
  
  for (let i = 0; i < this.items.length; i++) {
    const item = this.items[i];
    const product = await Product.findById(item.product);
    
    if (!product) {
      issues.push({
        itemId: item._id,
        type: 'product-not-found',
        message: 'Product no longer exists'
      });
      continue;
    }
    
    if (product.status !== 'active') {
      issues.push({
        itemId: item._id,
        type: 'product-inactive',
        message: 'Product is no longer available'
      });
    }
    
    if (product.inventory.stock < item.quantity) {
      issues.push({
        itemId: item._id,
        type: 'insufficient-stock',
        message: `Only ${product.inventory.stock} items available`,
        availableQuantity: product.inventory.stock
      });
    }
    
    if (product.price.current !== item.price) {
      issues.push({
        itemId: item._id,
        type: 'price-changed',
        message: 'Product price has changed',
        oldPrice: item.price,
        newPrice: product.price.current
      });
    }
  }
  
  return issues;
};

cartSchema.methods.syncPrices = async function() {
  const Product = mongoose.model('Product');
  let updated = false;
  
  for (let item of this.items) {
    const product = await Product.findById(item.product);
    if (product && product.price.current !== item.price) {
      item.price = product.price.current;
      updated = true;
    }
  }
  
  if (updated) {
    await this.save();
  }
  
  return updated;
};

cartSchema.methods.markAsAbandoned = function() {
  this.isAbandoned = true;
  this.abandonedAt = new Date();
  return this.save();
};

cartSchema.methods.recover = function() {
  this.isAbandoned = false;
  this.abandonedAt = null;
  return this.save();
};

cartSchema.methods.addRecommendation = function(productId, score, reason) {
  // Remove existing recommendation for same product
  this.aiMetadata.recommendedItems = this.aiMetadata.recommendedItems.filter(
    item => item.product.toString() !== productId.toString()
  );
  
  // Add new recommendation
  this.aiMetadata.recommendedItems.push({
    product: productId,
    score,
    reason,
    addedAt: new Date()
  });
  
  // Keep only top 10 recommendations
  this.aiMetadata.recommendedItems.sort((a, b) => b.score - a.score);
  this.aiMetadata.recommendedItems = this.aiMetadata.recommendedItems.slice(0, 10);
  
  return this.save();
};

export const Cart = mongoose.model('Cart', cartSchema);