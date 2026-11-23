import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productSnapshot: {
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
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  discount: {
    amount: { type: Number, default: 0, min: 0 },
    type: { type: String, enum: ['percentage', 'fixed'], default: 'fixed' },
    reason: String
  },
  total: {
    type: Number,
    required: true,
    min: 0
  }
});

const addressSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  company: String,
  address1: { type: String, required: true, trim: true },
  address2: String,
  city: { type: String, required: true, trim: true },
  state: { type: String, required: true, trim: true },
  zipCode: { type: String, required: true, trim: true },
  country: { type: String, required: true, trim: true },
  phone: String
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
  
  subtotal: { type: Number, required: true, min: 0 },
  tax: {
    amount: { type: Number, default: 0, min: 0 },
    rate: { type: Number, default: 0, min: 0 }
  },
  shipping: {
    cost: { type: Number, default: 0, min: 0 },
    method: { type: String, enum: ['standard', 'express', 'overnight', 'pickup'], default: 'standard' },
    carrier: String,
    trackingNumber: String,
    estimatedDelivery: Date,
    actualDelivery: Date
  },
  discount: {
    amount: { type: Number, default: 0, min: 0 },
    couponCode: String,
    reason: String
  },
  total: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'USD' },
  
  shippingAddress: { type: addressSchema, required: true },
  billingAddress: { type: addressSchema, required: true },
  
  status: {
    type: String,
    enum: ['pending', 'payment-pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'returned', 'refunded', 'failed'],
    default: 'pending'
  },
  
  statusHistory: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    note: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  
  payment: {
    method: { type: String, enum: ['credit-card', 'debit-card', 'paypal', 'apple-pay', 'google-pay', 'bank-transfer'], required: true },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'partially-refunded'], default: 'pending' },
    transactionId: String,
    paymentIntentId: String,
    last4: String,
    brand: String,
    refunds: [{
      amount: Number,
      reason: String,
      refundId: String,
      processedAt: Date,
      processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }]
  },
  
  aiMetadata: {
    recommendationSource: String,
    sessionId: String,
    userSegment: String,
    predictedDeliveryDate: Date,
    riskScore: { type: Number, min: 0, max: 1 },
    conversionPath: [String],
    abandoned: { type: Boolean, default: false },
    recoveredAt: Date
  },
  
  notes: [{
    text: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    type: { type: String, enum: ['internal', 'customer', 'system'], default: 'internal' }
  }],
  
  isGift: { type: Boolean, default: false },
  giftMessage: String,
  expedited: { type: Boolean, default: false },
  fraudulent: { type: Boolean, default: false },
  
  placedAt: { type: Date, default: Date.now },
  paidAt: Date,
  shippedAt: Date,
  deliveredAt: Date,
  cancelledAt: Date
}, {
  timestamps: true
});

orderSchema.index({ orderNumber: 1 });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'payment.transactionId': 1 });

orderSchema.pre('save', async function(next) {
  if (this.isNew && !this.orderNumber) {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.orderNumber = `ORD${timestamp}${random}`;
  }
  
  this.subtotal = this.items.reduce((sum, item) => sum + item.total, 0);
  this.total = this.subtotal + this.tax.amount + this.shipping.cost - this.discount.amount;
  
  if (this.isModified('status')) {
    if (!this.isNew) {
      this.statusHistory.push({ status: this.status, timestamp: new Date() });
    }
    
    if (this.status === 'paid' && !this.paidAt) this.paidAt = new Date();
    if (this.status === 'shipped' && !this.shippedAt) this.shippedAt = new Date();
    if (this.status === 'delivered' && !this.deliveredAt) this.deliveredAt = new Date();
    if (this.status === 'cancelled' && !this.cancelledAt) this.cancelledAt = new Date();
  }
  
  next();
});

orderSchema.methods.canCancel = function() {
  return ['pending', 'payment-pending', 'paid'].includes(this.status);
};

orderSchema.methods.canRefund = function() {
  return ['paid', 'processing', 'shipped', 'delivered'].includes(this.status);
};

orderSchema.methods.updateStatus = function(newStatus, note, updatedBy) {
  this.status = newStatus;
  this.statusHistory.push({ status: newStatus, timestamp: new Date(), note, updatedBy });
  return this.save();
};

orderSchema.methods.addNote = function(text, createdBy, type = 'internal') {
  this.notes.push({ text, createdBy, type, createdAt: new Date() });
  return this.save();
};

export const Order = mongoose.model('Order', orderSchema);