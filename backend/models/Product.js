import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  shortDescription: {
    type: String,
    maxlength: 200
  },
  category: {
    type: String,
    required: true,
    enum: ['handbags', 'backpacks', 'tote-bags', 'crossbody', 'clutches', 'wallets', 'accessories']
  },
  subcategory: String,
  brand: String,
  price: {
    current: {
      type: Number,
      required: true,
      min: 0
    },
    original: Number,
    currency: {
      type: String,
      default: 'USD'
    }
  },
  inventory: {
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    lowStockThreshold: {
      type: Number,
      default: 10
    },
    sku: {
      type: String,
      unique: true,
      sparse: true
    },
    barcode: {
      type: String,
      unique: true,
      sparse: true
    }
  },
  images: [{
    url: String,
    alt: String,
    isPrimary: { type: Boolean, default: false },
    order: { type: Number, default: 0 }
  }],
  specifications: {
    material: String,
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      unit: { type: String, default: 'cm' }
    },
    weight: {
      value: Number,
      unit: { type: String, default: 'g' }
    },
    color: String,
    features: [String],
    careInstructions: String
  },
  embeddings: {
    text: [Number],
    image: [Number],
    combined: [Number]
  },
  aiMetadata: {
    tags: [String],
    style: String,
    occasion: [String],
    targetDemographic: String,
    seasonality: [String],
    compatibility: [String],
    sentimentScore: Number
  },
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
  status: {
    type: String,
    enum: ['active', 'inactive', 'discontinued', 'coming-soon'],
    default: 'active'
  },
  featured: { type: Boolean, default: false },
  isNew: { type: Boolean, default: false },
  onSale: { type: Boolean, default: false },
  analytics: {
    views: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    purchases: { type: Number, default: 0 },
    wishlistAdds: { type: Number, default: 0 },
    cartAdds: { type: Number, default: 0 },
    rating: {
      average: { type: Number, min: 0, max: 5, default: 0 },
      count: { type: Number, default: 0 }
    },
    conversionRate: { type: Number, default: 0 },
    lastViewedAt: Date,
    lastPurchasedAt: Date
  },
  reviews: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: String,
    comment: String,
    verified: { type: Boolean, default: false },
    helpful: { type: Number, default: 0 },
    images: [String],
    createdAt: { type: Date, default: Date.now }
  }],
  relatedProducts: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    relationship: {
      type: String,
      enum: ['similar', 'complement', 'alternative', 'upgrade', 'bundle']
    },
    score: Number
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});


productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ 'price.current': 1 });
productSchema.index({ 'analytics.rating.average': -1 });
productSchema.index({ 'seo.slug': 1 });

productSchema.virtual('discountPercentage').get(function() {
  if (this.price.original && this.price.original > this.price.current) {
    return Math.round(((this.price.original - this.price.current) / this.price.original) * 100);
  }
  return 0;
});

productSchema.virtual('availabilityStatus').get(function() {
  if (this.inventory.stock === 0) return 'out-of-stock';
  if (this.inventory.stock <= this.inventory.lowStockThreshold) return 'low-stock';
  return 'in-stock';
});

productSchema.pre('save', function(next) {
  if (!this.seo.slug && this.name) {
    this.seo.slug = this.name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
  }
  
  this.onSale = this.price.original && this.price.original > this.price.current;
  
  if (this.images.length > 0 && !this.images.some(img => img.isPrimary)) {
    this.images[0].isPrimary = true;
  }
  
  next();
});

productSchema.methods.updateAnalytics = function(type, value = 1) {
  if (this.analytics[type] !== undefined) {
    this.analytics[type] += value;
    this.analytics.lastViewedAt = new Date();
    return this.save();
  }
};

productSchema.methods.addReview = function(userId, rating, comment, title) {
  this.reviews.push({ userId, rating, comment, title });
  
  this.analytics.rating.count = this.reviews.length;
  this.analytics.rating.average = this.reviews.reduce((sum, r) => sum + r.rating, 0) / this.reviews.length;
  
  return this.save();
};

productSchema.methods.updateStock = function(quantity) {
  this.inventory.stock = Math.max(0, this.inventory.stock + quantity);
  return this.save();
};

export const Product = mongoose.model('Product', productSchema);