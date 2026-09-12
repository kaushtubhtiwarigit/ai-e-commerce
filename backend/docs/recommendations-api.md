# AI Bag Store - Recommendations API Documentation

## Overview
The AI Bag Store Recommendations API provides intelligent product recommendations using multiple algorithms including collaborative filtering, content-based filtering, vector similarity search, and hybrid approaches.

## Base URL
```
/api/recommendations
```

## Authentication
- Some endpoints require authentication (JWT token in Authorization header)
- Optional authentication enhances recommendations with user data
- Admin-only endpoints require admin role

## Endpoints

### 1. Personal Recommendations

**GET** `/api/recommendations/personal`

Get personalized recommendations for authenticated users.

**Authentication:** Required

**Query Parameters:**
- `limit` (integer, 1-50): Number of recommendations (default: 10)
- `algorithm` (string): Algorithm to use ('hybrid', 'collaborative_filtering', 'content_based', 'trending')
- `context` (string): Usage context ('homepage', 'product_detail', 'cart', etc.)
- `category` (string): Filter by category
- `diversityFactor` (float, 0-1): Diversity vs relevance balance (default: 0.3)

**Response:**
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "_id": "product_id",
        "name": "Product Name",
        "price": { "current": 99.99 },
        "category": "handbags",
        "images": [...],
        "recommendationScore": 0.95,
        "algorithm": "hybrid",
        "reason": "Based on your preferences"
      }
    ],
    "userId": "user_id",
    "algorithm": "hybrid",
    "context": "homepage",
    "generatedAt": "2024-01-01T00:00:00Z"
  }
}
```

### 2. Similar Products

**GET** `/api/recommendations/similar/:productId`

Get products similar to a specific product.

**Authentication:** Optional

**Parameters:**
- `productId` (path): Product ID to find similar items for

**Query Parameters:**
- `limit` (integer): Number of similar products (default: 6)
- `algorithm` (string): Similarity algorithm
- `threshold` (float): Minimum similarity score (default: 0.7)

### 3. Trending Products

**GET** `/api/recommendations/trending`

Get trending products based on AI analytics.

**Authentication:** None

**Query Parameters:**
- `limit` (integer): Number of products (default: 10)
- `timeframe` (string): Time period ('7d', '30d', etc.)
- `category` (string): Filter by category
- `includeNewProducts` (boolean): Include recently added products

### 4. Contextual Recommendations

**POST** `/api/recommendations/contextual`

Get recommendations based on current user activity.

**Authentication:** Required

**Body:**
```json
{
  "context": "cart",
  "contextData": {
    "limit": 8,
    "cartItems": [...]
  }
}
```

### 5. Cart Recommendations

**POST** `/api/recommendations/cart`

Get recommendations based on current cart contents.

**Authentication:** Required

**Body:**
```json
{
  "cartItems": [
    {
      "productId": "product_id",
      "quantity": 2
    }
  ],
  "limit": 6
}
```

### 6. Frequently Bought Together

**GET** `/api/recommendations/frequently-bought/:productId`

Get products frequently bought with a specific product.

**Authentication:** None

### 7. Seasonal Recommendations

**GET** `/api/recommendations/seasonal`

Get recommendations based on current season or specified season.

**Authentication:** Required

**Query Parameters:**
- `limit` (integer): Number of recommendations
- `season` (string): Season ('spring', 'summer', 'fall', 'winter')

### 8. Post-Purchase Recommendations

**GET** `/api/recommendations/post-purchase/:orderId`

Get recommendations after a purchase for cross-selling.

**Authentication:** Required

### 9. Track Interactions

**POST** `/api/recommendations/track`

Track user interactions with recommendations for analytics.

**Authentication:** Optional

**Body:**
```json
{
  "recommendationType": "personal",
  "productId": "product_id",
  "action": "click", // 'view', 'click', 'add_to_cart', 'purchase'
  "context": "homepage",
  "metadata": {}
}
```

### 10. Analytics (Admin)

**GET** `/api/recommendations/analytics`

Get recommendation system analytics and performance metrics.

**Authentication:** Required (Admin only)

## Algorithms

### 1. Hybrid (Default)
Combines multiple algorithms based on user profile and context:
- New users: 60% trending, 30% content-based, 10% collaborative
- Returning users: 50% collaborative, 30% content-based, 20% trending
- Context adjustments for different page types

### 2. Collaborative Filtering
Recommends products based on similar users' behavior:
- Analyzes purchase patterns and preferences
- Finds users with similar taste
- Recommends products they liked
- Works best for users with purchase history

### 3. Content-Based Filtering
Uses AI embeddings and product features:
- Vector similarity search with Pinecone
- Considers product categories, materials, style
- AI-generated tags and metadata
- Works for all users regardless of history

### 4. Trending Algorithm
AI-powered trending analysis:
- Recent view and purchase activity
- Rating and engagement metrics
- New product bonuses
- Stock availability weighting

## Personalization Features

### User Profile Building
- Purchase history analysis
- View and search behavior
- Category preferences
- Price range analysis
- Brand affinity
- Seasonal patterns

### Context Awareness
- Homepage: Balanced mix with trending
- Product detail: Similar and complementary items
- Cart: Complementary and frequently bought together
- Search results: Query-related recommendations
- Post-purchase: Cross-sell and accessories

### Real-time Adaptation
- Updates based on current session activity
- Immediate preference learning
- Dynamic algorithm weighting
- A/B testing support

## Performance Optimizations

### Caching Strategy
- Personal recommendations: 30 minutes
- Similar products: 1 hour
- Trending products: 2 hours
- Seasonal recommendations: 6 hours

### Batch Processing
- Offline model training
- Embedding generation
- Similarity calculations
- Analytics aggregation

### Fallback Systems
- MongoDB text search when vector search fails
- Category-based recommendations as last resort
- Popular products for new users
- Error handling with graceful degradation

## Analytics and Metrics

### Tracked Metrics
- Click-through rates
- Conversion rates
- Revenue attribution
- Algorithm performance
- User engagement
- Response times

### A/B Testing Support
- Algorithm comparison
- Parameter tuning
- User segment analysis
- Performance monitoring

## Rate Limiting
- 100 requests per 15 minutes per IP
- Higher limits for authenticated users
- Premium limits for admin users

## Error Handling
All endpoints return consistent error format:
```json
{
  "success": false,
  "error": "Error message",
  "details": [...] // Optional validation details
}
```

Common HTTP status codes:
- 200: Success
- 400: Bad request/validation error
- 401: Authentication required
- 403: Insufficient permissions
- 404: Resource not found
- 429: Rate limit exceeded
- 500: Internal server error

## Integration Examples

### Frontend Integration
```javascript
// Get personal recommendations
const recommendations = await fetch('/api/recommendations/personal?limit=8', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Track user interaction
await fetch('/api/recommendations/track', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    recommendationType: 'personal',
    productId: 'product_id',
    action: 'click',
    context: 'homepage'
  })
});
```

### Mobile App Integration
```javascript
// Get trending products for mobile home screen
const trending = await fetch('/api/recommendations/trending?limit=10&timeframe=7d');

// Get cart recommendations
const cartRecs = await fetch('/api/recommendations/cart', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    cartItems: cartState.items,
    limit: 6
  })
});
```

## Best Practices

1. **Always track interactions** for continuous improvement
2. **Use appropriate context** for better recommendations
3. **Implement fallbacks** for offline scenarios
4. **Cache aggressively** to reduce API calls
5. **Monitor performance** and adjust parameters
6. **A/B test** different algorithms and parameters
7. **Respect rate limits** and implement exponential backoff
8. **Handle errors gracefully** with fallback content