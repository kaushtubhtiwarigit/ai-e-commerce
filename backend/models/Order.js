import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productSnapshot: {
    // Store product details at time of order to handle price changes
    name: String,
    description: String,
    price: Number,
    currency: String,
    image: String,
    sku: String,
    category: String
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1']
  },
  price: {
    type: Number,
    required: true,
    min: [0, 'Price cannot be negative']
  },
  discount: {
    amount: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative']
    },
    type: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'fixed'
    },
    reason: String // coupon code, bulk discount, etc.
  },
  total: {
    type: Number,
    required: true,
    min: [0, 'Total cannot be negative']
  }
});

const addressSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  company: {
    type: String,
    trim: true
  },
  address1: {
    type: String,
    required: true,
    trim: true
  },
  address2: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    required: true,
    trim: true
  },
  state: {
    type: String,
    required: true,
    trim: true
  },
  zipCode: {
    type: String,
    required: true,
    trim: true
  },
  country: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  }
});

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [orderItemSchema],
  
  // Pricing breakdown
  subtotal: {
    type: Number,
    required: true,
    min: [0, 'Subtotal cannot be negative']
  },
  tax: {
    amount: {
      type: Number,
      default: 0,
      min: [0, 'Tax cannot be negative']
    },
    rate: {
      type: Number,
      default: 0,
      min: [0, 'Tax rate cannot be negative']
    }
  },
  shipping: {
    cost: {
      type: Number,
      default: 0,
      min: [0, 'Shipping cost cannot be negative']
    },
    method: {
      type: String,
      enum: ['standard', 'express', 'overnight', 'pickup'],
      default: 'standard'
    },
    carrier: String,
    trackingNumber: String,
    estimatedDelivery: Date,
    actualDelivery: Date
  },
  discount: {
    amount: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative']
    },
    couponCode: String,
    reason: String
  },
  total: {
    type: Number,
    required: true,
    min: [0, 'Total cannot be negative']
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD']
  },

  // Addresses
  shippingAddress: {
    type: addressSchema,
    required: true
  },
  billingAddress: {
    type: addressSchema,
    required: true
  },

  // Order status and tracking
  status: {
    type: String,
    enum: [
      'pending',           // Order created, awaiting payment
      'payment-pending',   // Payment initiated
      'paid',             // Payment successful
      'processing',       // Order being prepared
      'shipped',          // Order shipped
      'delivered',        // Order delivered
      'cancelled',        // Order cancelled
      'returned',         // Order returned
      'refunded',         // Order refunded
      'failed'            // Payment failed
    ],
    default: 'pending'
  },
  
  statusHistory: [{
    status: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],

  // Payment information
  payment: {
    method: {
      type: String,
      enum: ['credit-card', 'debit-card', 'paypal', 'apple-pay', 'google-pay', 'bank-transfer'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'partially-refunded'],
      default: 'pending'
    },
    transactionId: String,
    paymentIntentId: String, // Stripe payment intent ID
    last4: String, // Last 4 digits of card
    brand: String, // Card brand (Visa, MasterCard, etc.)
    refunds: [{
      amount: Number,
      reason: String,
      refundId: String,
      processedAt: Date,
      processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }]
  },

  // AI and analytics
  aiMetadata: {
    recommendationSource: String, // How user discovered the products
    sessionId: String,
    userSegment: String,
    predictedDeliveryDate: Date,
    riskScore: {
      type: Number,
      min: 0,
      max: 1
    }, // Fraud risk score
    conversionPath: [String], // User journey leading to purchase
    abandoned: {
      type: Boolean,
      default: false
    },
    recoveredAt: Date // If order was recovered from abandonment
  },

  // Customer service
  notes: [{
    text: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    type: {
      type: String,
      enum: ['internal', 'customer', 'system'],
      default: 'internal'
    }
  }],

  // Special flags
  isGift: {
    type: Boolean,
    default: false
  },
  giftMessage: String,
  
  expedited: {
    type: Boolean,
    default: false
  },
  
  fraudulent: {
    type: Boolean,
    default: false
  },

  // Timestamps
  placedAt: {
    type: Date,
    default: Date.now
  },
  paidAt: Date,
  shippedAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  
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

// Indexes for performance
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'payment.status': 1 });
orderSchema.index({ placedAt: -1 });
orderSchema.index({ total: -1 });
orderSchema.index({ 'shipping.trackingNumber': 1 });
orderSchema.index({ 'payment.transactionId': 1 });

// Virtual for formatted order number
orderSchema.virtual('formattedOrderNumber').get(function() {
  return `#${this.orderNumber}`;
});

// Virtual for order age
orderSchema.virtual('orderAge').get(function() {
  return Date.now() - this.placedAt.getTime();
});

// Virtual for estimated delivery status
orderSchema.virtual('deliveryStatus').get(function() {
  if (this.status === 'delivered') return 'delivered';
  if (this.shipping.estimatedDelivery) {
    const now = new Date();
    if (now > this.shipping.estimatedDelivery) return 'overdue';
    const daysUntil = Math.ceil((this.shipping.estimatedDelivery - now) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 1) return 'arriving-soon';
    return 'on-track';
  }
  return 'unknown';
});

// Pre-save middleware
orderSchema.pre('save', async function(next) {
  this.updatedAt = new Date();
  
  // Generate order number if new
  if (this.isNew && !this.orderNumber) {
    this.orderNumber = await this.constructor.generateOrderNumber();
  }
  
  // Calculate totals
  this.subtotal = this.items.reduce((sum, item) => sum + item.total, 0);
  this.total = this.subtotal + this.tax.amount + this.shipping.cost - this.discount.amount;
  
  // Add status change to history
  if (this.isModified('status') && !this.isNew) {
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date()
    });
  }
  
  // Set timestamp based on status
  if (this.isModified('status')) {
    switch (this.status) {
      case 'paid':
        if (!this.paidAt) this.paidAt = new Date();
        break;
      case 'shipped':
        if (!this.shippedAt) this.shippedAt = new Date();
        break;
      case 'delivered':
        if (!this.deliveredAt) this.deliveredAt = new Date();
        break;
      case 'cancelled':
        if (!this.cancelledAt) this.cancelledAt = new Date();
        break;
    }
  }
  
  next();
});

// Static methods
orderSchema.statics.generateOrderNumber = async function() {
  const prefix = 'ORD';
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

orderSchema.statics.findByUser = function(userId, filters = {}) {
  return this.find({ user: userId, ...filters })
    .populate('items.product', 'name images category')
    .sort({ createdAt: -1 });
};

orderSchema.statics.findByStatus = function(status) {
  return this.find({ status })
    .populate('user', 'name email')
    .populate('items.product', 'name images category')
    .sort({ createdAt: -1 });
};

orderSchema.statics.getOrderAnalytics = function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $nin: ['cancelled', 'failed'] }
      }
    },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$total' },
        avgOrderValue: { $avg: '$total' },
        totalItems: { $sum: { $sum: '$items.quantity' } }
      }
    }
  ]);
};

// Instance methods
orderSchema.methods.canCancel = function() {
  return ['pending', 'payment-pending', 'paid'].includes(this.status);
};

orderSchema.methods.canRefund = function() {
  return ['paid', 'processing', 'shipped', 'delivered'].includes(this.status);
};

orderSchema.methods.updateStatus = function(newStatus, note, updatedBy) {
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    timestamp: new Date(),
    note,
    updatedBy
  });
  return this.save();
};

orderSchema.methods.addNote = function(text, createdBy, type = 'internal') {
  this.notes.push({
    text,
    createdBy,
    type,
    createdAt: new Date()
  });
  return this.save();
};

orderSchema.methods.calculateRefund = function(itemsToRefund = null) {
  let refundAmount = 0;
  
  if (itemsToRefund) {
    // Partial refund
    itemsToRefund.forEach(item => {
      const orderItem = this.items.id(item.itemId);
      if (orderItem) {
        refundAmount += (orderItem.price * item.quantity);
      }
    });
  } else {
    // Full refund
    refundAmount = this.total;
  }
  
  return Math.min(refundAmount, this.total);
};

export const Order = mongoose.model('Order', orderSchema);