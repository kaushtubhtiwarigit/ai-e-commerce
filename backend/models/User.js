import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 8,
    select: false
  },
  phone: String,
  role: {
    type: String,
    enum: ['user', 'admin', 'moderator'],
    default: 'user'
  },
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  avatar: String,
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  preferences: {
    newsletter: { type: Boolean, default: true },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true }
    },
    language: { type: String, default: 'en' },
    currency: { type: String, default: 'USD' },
    categories: [String]
  },
  searchHistory: [{
    query: String,
    timestamp: { type: Date, default: Date.now },
    results: Number
  }],
  viewHistory: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    timestamp: { type: Date, default: Date.now },
    duration: Number
  }],
  purchaseHistory: [{
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    amount: Number,
    timestamp: { type: Date, default: Date.now }
  }],
  recommendations: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    score: Number,
    reason: String,
    timestamp: { type: Date, default: Date.now }
  }],
  lastLogin: Date,
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  passwordChangedAt: Date
}, {
  timestamps: true
});


userSchema.index({ email: 1 });
userSchema.index({ role: 1, isActive: 1 });

userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  
  if (!this.isNew) this.passwordChangedAt = new Date();
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.changedPasswordAfter = function(jwtTimestamp) {
  if (!this.passwordChangedAt) return false;
  const changedTime = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
  return jwtTimestamp < changedTime;
};

userSchema.methods.incLoginAttempts = function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
  }
  
  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

export const User = mongoose.model('User', userSchema);