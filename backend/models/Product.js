import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  shortDescription: {
    type: String,
    maxlength: [200, 'Short description cannot exceed 200 characters']
  },
  category: {
    type: String,
    required: [true, 'Product category is required'],
    enum: {
      values: ['handbags', 'backpacks', 'tote-bags', 'crossbody', 'clutches', 'wallets', 'accessories'],
      message: 'Category must be one of: handbags, backpacks, tote-bags, crossbody, clutches, wallets, accessories'
    }
  },
  subcategory: {
    type: String,
    trim: true
  },
  brand: {
    type: String,
    trim: true,
    maxlength: [50, 'Brand name cannot exceed 50 characters']
  },
  price: {
    current: {
      type: Number,
      required: [true, 'Current price is required'],
      min: [0, 'Price cannot be negative']
    },
    original: {
      type: Number,
      min: [0, 'Original price cannot be negative']
    },
    currency: {
      type: String,
      default: 'USD',
      enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD']
    }
  },
  inventory: {
    stock: {
      type: Number,
      required: [true, 'Stock quantity is required'],
      min: [0, 'Stock cannot be negative'],
      default: 0
    },
    lowStockThreshold: {
      type: Number,
      default: 10
    },
    sku: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true
    },
    barcode: {
      type: String,
      unique: true,
      sparse: true
    }
  },
  images: [{
    url: {
      type: String,
      required: true
    },
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    },
    order: {
      type: Number,
      default: 0
    }
  }],
  specifications: {
    material: String,
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      unit: {
        type: String,
        enum: ['cm', 'in'],
        default: 'cm'
      }
    },
    weight: {
      value: Number,
      unit: {
        type: String,
        enum: ['g', 'kg', 'oz', 'lb'],
        default: 'g'
      }
    },
    color: String,
    features: [String],
    careInstructions: String
  },
  // AI and ML fields for enhanced search and recommendations
  embeddings: {
    text: [{
      type: Number // Vector embedding for text content (name + description)
    }],
    image: [{
      type: Number // Vector embedding for primary image
    }],
    combined: [{
      type: Number // Combined text + image embedding
    }]
  },
  aiMetadata: {
    tags: [String], // AI-generated tags
    style: String, // AI-determined style (casual, formal, trendy, classic, etc.)
    occasion: [String], // Suitable occasions (work, travel, evening, casual, etc.)
    target_demographic: String, // Target customer segment
    seasonality: [String], // Seasonal appropriateness
    compatibility: [String], // Compatible categories/styles
    sentiment_score: {
      type: Number,
      min: -1,
      max: 1
    }
  },
  // SEO and discoverability
  seo: {
    title: String,
    metaDescription: String,
    keywords: [String],
    slug: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true
    }
  },
  // Status and visibility
  status: {
    type: String,
    enum: ['active', 'inactive', 'discontinued', 'coming-soon'],
    default: 'active'
  },
  featured: {
    type: Boolean,
    default: false
  },
  isNew: {
    type: Boolean,
    default: false
  },
  onSale: {
    type: Boolean,
    default: false
  },
  // Analytics and tracking
  analytics: {
    views: {
      type: Number,
      default: 0
    },
    clicks: {
      type: Number,
      default: 0
    },
    purchases: {
      type: Number,
      default: 0
    },
    wishlistAdds: {
      type: Number,
      default: 0
    },
    cartAdds: {
      type: Number,
      default: 0
    },
    rating: {
      average: {
        type: Number,
        min: 0,
        max: 5,
        default: 0
      },
      count: {
        type: Number,
        default: 0
      }
    },
    conversionRate: {
      type: Number,
      default: 0
    },
    lastViewedAt: Date,
    lastPurchasedAt: Date
  },
  // User-generated content
  reviews: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    title: String,
    comment: String,
    verified: {
      type: Boolean,
      default: false
    },
    helpful: {
      type: Number,
      default: 0
    },
    images: [String],
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Related products and recommendations
  relatedProducts: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    relationship: {
      type: String,
      enum: ['similar', 'complement', 'alternative', 'upgrade', 'bundle']
    },
    score: {
      type: Number,
      min: 0,
      max: 1
    }
  }],
  // Admin and system fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Timestamps
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

// Indexes for performance and search
productSchema.index({ name: 'text', description: 'text', 'specifications.material': 'text' });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ 'price.current': 1 });
productSchema.index({ featured: 1, status: 1 });
productSchema.index({ 'analytics.rating.average': -1 });
productSchema.index({ 'analytics.views': -1 });
productSchema.index({ 'analytics.purchases': -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ 'inventory.stock': 1 });
productSchema.index({ 'seo.slug': 1 });
productSchema.index({ 'aiMetadata.tags': 1 });
productSchema.index({ 'aiMetadata.style': 1 });
productSchema.index({ 'aiMetadata.occasion': 1 });

// Virtual for discount percentage
productSchema.virtual('discountPercentage').get(function() {
  if (this.price.original && this.price.original > this.price.current) {
    return Math.round(((this.price.original - this.price.current) / this.price.original) * 100);
  }
  return 0;
});

// Virtual for availability status
productSchema.virtual('availabilityStatus').get(function() {
  if (this.inventory.stock === 0) return 'out-of-stock';
  if (this.inventory.stock <= this.inventory.lowStockThreshold) return 'low-stock';
  return 'in-stock';
});

// Virtual for primary image
productSchema.virtual('primaryImage').get(function() {
  const primary = this.images.find(img => img.isPrimary);
  return primary || this.images[0] || null;
});

// Virtual for average rating
productSchema.virtual('averageRating').get(function() {
  if (this.reviews.length === 0) return 0;
  const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
  return (sum / this.reviews.length).toFixed(1);
});

// Pre-save middleware
productSchema.pre('save', function(next) {
  // Update timestamps
  this.updatedAt = new Date();
  
  // Generate slug from name if not provided
  if (!this.seo.slug && this.name) {
    this.seo.slug = this.name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();
  }
  
  // Set onSale flag based on price comparison
  this.onSale = this.price.original && this.price.original > this.price.current;
  
  // Ensure primary image is set
  if (this.images.length > 0 && !this.images.some(img => img.isPrimary)) {
    this.images[0].isPrimary = true;
  }
  
  next();
});

// Static methods
productSchema.statics.findByCategory = function(category, filters = {}) {
  const query = { category, status: 'active', ...filters };
  return this.find(query).sort({ 'analytics.rating.average': -1, createdAt: -1 });
};

productSchema.statics.findFeatured = function(limit = 10) {
  return this.find({ featured: true, status: 'active' })
    .sort({ 'analytics.rating.average': -1, 'analytics.views': -1 })
    .limit(limit);
};

productSchema.statics.findSimilar = function(productId, limit = 6) {
  return this.aggregate([
    { $match: { _id: productId } },
    {
      $lookup: {
        from: 'products',
        let: { category: '$category', tags: '$aiMetadata.tags' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $ne: ['$_id', productId] },
                  { $eq: ['$status', 'active'] },
                  {
                    $or: [
                      { $eq: ['$category', '$$category'] },
                      { $gt: [{ $size: { $setIntersection: ['$aiMetadata.tags', '$$tags'] } }, 0] }
                    ]
                  }
                ]
              }
            }
          },
          { $limit: limit }
        ],
        as: 'similar'
      }
    },
    { $unwind: '$similar' },
    { $replaceRoot: { newRoot: '$similar' } }
  ]);
};

productSchema.statics.getTopRated = function(limit = 10) {
  return this.find({ status: 'active', 'analytics.rating.count': { $gte: 5 } })
    .sort({ 'analytics.rating.average': -1, 'analytics.rating.count': -1 })
    .limit(limit);
};

productSchema.statics.searchProducts = function(query, filters = {}) {
  const searchQuery = {
    $text: { $search: query },
    status: 'active',
    ...filters
  };
  
  return this.find(searchQuery, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' }, 'analytics.rating.average': -1 });
};

// Instance methods
productSchema.methods.updateAnalytics = function(type, value = 1) {
  if (this.analytics[type] !== undefined) {
    this.analytics[type] += value;
    this.analytics.lastViewedAt = new Date();
    return this.save();
  }
};

productSchema.methods.addReview = function(userId, rating, comment, title) {
  this.reviews.push({
    userId,
    rating,
    comment,
    title
  });
  
  // Update rating statistics
  this.analytics.rating.count = this.reviews.length;
  this.analytics.rating.average = this.reviews.reduce((sum, review) => sum + review.rating, 0) / this.reviews.length;
  
  return this.save();
};

productSchema.methods.updateStock = function(quantity) {
  this.inventory.stock += quantity;
  if (this.inventory.stock < 0) {
    this.inventory.stock = 0;
  }
  return this.save();
};

export const Product = mongoose.model('Product', productSchema);