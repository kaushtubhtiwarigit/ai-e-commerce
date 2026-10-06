# 🛍️ AI E-Commerce Platform

A modern full-stack shopping application that combines traditional e-commerce with intelligent AI features. Built with Next.js 14, Express.js, and MongoDB, it leverages Google Gemini AI, LangChain, and Pinecone to offer natural language product search, conversational shopping assistance, and personalized recommendations.

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![React](https://img.shields.io/badge/React-18-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![Express](https://img.shields.io/badge/Express-4.18-lightgrey)
![MongoDB](https://img.shields.io/badge/MongoDB-6.0-green)
![AI Powered](https://img.shields.io/badge/AI-Powered-purple)

## ✨ Features

### 🛒 E-Commerce Core
- **User Authentication** - Secure JWT-based registration and login
- **Product Catalog** - Browse products with category and price filtering
- **Smart Shopping Cart** - Real-time cart management with persistent storage
- **Secure Checkout** - Complete order processing and payment integration ready
- **Order Tracking** - View order history and current order status
- **User Profiles** - Manage account details and preferences
- **Admin Dashboard** - Product, inventory, and order management

### 🤖 AI-Powered Features
- **Conversational Shopping Assistant** - Natural language chat interface powered by Google Gemini
- **Semantic Search** - Find products using everyday language, not just keywords
- **Smart Recommendations** - Context-aware product suggestions based on browsing history
- **Similar Products** - Vector similarity search using Pinecone embeddings
- **RAG (Retrieval-Augmented Generation)** - Accurate AI responses grounded in product data
- **Product Embeddings** - AI-generated metadata for enhanced discoverability

### 📊 Analytics & Insights
- Search analytics and refinement tracking
- Product click and cart-add tracking
- Conversion funnel analysis
- AI performance metrics
- Recommendation effectiveness tracking
- User behavior insights

## 🏗️ Tech Stack

### Frontend
- **Framework:** Next.js 14 (App Router)
- **UI Library:** React 18
- **Styling:** Tailwind CSS
- **HTTP Client:** Axios
- **State Management:** React Context API
- **Routing:** Next.js App Router

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose ODM
- **Caching:** Redis
- **Authentication:** JWT (jsonwebtoken)
- **Security:** bcryptjs, Helmet, CORS, Rate Limiting
- **Validation:** express-validator
- **Logging:** Winston

### AI/ML Stack
- **LLM:** Google Gemini AI
- **Framework:** LangChain
- **Vector Database:** Pinecone
- **Embeddings:** OpenAI / Google embeddings
- **Search:** Semantic similarity search
- **Techniques:** RAG, Vector search, Recommendation algorithms

## 📁 Project Structure

```
ai-e-commerce/
├── frontend/                 # Next.js 14 Frontend
│   ├── src/
│   │   ├── app/             # Next.js App Router pages
│   │   │   ├── layout.jsx   # Root layout
│   │   │   ├── page.jsx     # Home page
│   │   │   ├── login/       # Login page
│   │   │   ├── register/    # Registration page
│   │   │   ├── products/    # Products listing
│   │   │   └── cart/        # Shopping cart
│   │   ├── components/      # React components
│   │   │   ├── Navbar.jsx
│   │   │   ├── Footer.jsx
│   │   │   ├── ProductCard.jsx
│   │   │   └── AIAssistant.jsx
│   │   ├── context/         # React contexts
│   │   │   ├── AuthContext.jsx
│   │   │   └── CartContext.jsx
│   │   └── services/        # API service layer
│   │       └── api.js
│   ├── public/              # Static assets
│   ├── next.config.js       # Next.js configuration
│   ├── tailwind.config.js   # Tailwind CSS config
│   └── package.json
│
├── backend/                 # Express.js Backend
│   ├── config/             # Configuration files
│   │   └── database.js     # MongoDB connection
│   ├── models/             # Mongoose models
│   │   ├── User.js
│   │   ├── Product.js
│   │   └── Order.js
│   ├── controllers/        # Request handlers
│   │   ├── authController.js
│   │   ├── productController.js
│   │   └── orderController.js
│   ├── routes/             # API routes
│   │   ├── auth.js
│   │   ├── products.js
│   │   └── orders.js
│   ├── middleware/         # Express middleware
│   │   ├── auth.js
│   │   └── errorHandler.js
│   ├── services/           # Business logic
│   │   ├── aiService.js    # AI/LangChain integration
│   │   ├── searchService.js
│   │   └── recommendationService.js
│   ├── utils/              # Utility functions
│   ├── server.js           # Entry point
│   └── package.json
│
├── logs/                   # Application logs
└── README.md              # This file
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- MongoDB (local or MongoDB Atlas)
- Redis (local or Redis Cloud)
- Google Gemini API key
- Pinecone API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd ai-e-commerce
   ```

2. **Install Backend Dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Install Frontend Dependencies**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Configure Environment Variables**

   **Backend** - Create `backend/.env`:
   ```env
   # Server
   PORT=5000
   NODE_ENV=development

   # Database
   MONGODB_URI=mongodb://localhost:27017/ai-ecommerce
   REDIS_URL=redis://localhost:6379

   # Authentication
   JWT_SECRET=your_jwt_secret_key_here
   JWT_EXPIRE=7d

   # AI Services
   GOOGLE_API_KEY=your_google_gemini_api_key
   PINECONE_API_KEY=your_pinecone_api_key
   PINECONE_ENVIRONMENT=your_pinecone_environment
   PINECONE_INDEX_NAME=ecommerce-products

   # OpenAI (if using OpenAI embeddings)
   OPENAI_API_KEY=your_openai_api_key
   ```

   **Frontend** - Create `frontend/.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:5000/api
   ```

5. **Start MongoDB and Redis**
   ```bash
   # MongoDB
   mongod

   # Redis
   redis-server
   ```

6. **Run the Application**

   **Terminal 1 - Backend:**
   ```bash
   cd backend
   npm run dev
   ```

   **Terminal 2 - Frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

7. **Access the Application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000/api

## 📖 API Documentation

### Authentication Endpoints
```
POST   /api/auth/register      # Register new user
POST   /api/auth/login         # Login user
GET    /api/auth/me            # Get current user
```

### Product Endpoints
```
GET    /api/products           # Get all products
GET    /api/products/:id       # Get single product
POST   /api/products           # Create product (Admin)
PUT    /api/products/:id       # Update product (Admin)
DELETE /api/products/:id       # Delete product (Admin)
GET    /api/products/search    # Search products
```

### Cart & Order Endpoints
```
GET    /api/cart               # Get user cart
POST   /api/cart/add           # Add item to cart
PUT    /api/cart/update/:id    # Update cart item
DELETE /api/cart/remove/:id    # Remove from cart
POST   /api/orders             # Create order
GET    /api/orders             # Get user orders
GET    /api/orders/:id         # Get single order
```

### AI Endpoints
```
POST   /api/ai/chat            # Chat with AI assistant
POST   /api/ai/search          # AI-powered semantic search
GET    /api/ai/recommendations # Get personalized recommendations
GET    /api/ai/similar/:id     # Get similar products
```

## 🎨 Key Features Explained

### Conversational AI Assistant
The AI assistant uses Google Gemini and LangChain to provide intelligent shopping help. It can:
- Answer product questions in natural language
- Suggest products based on descriptions
- Compare products and features
- Guide users through the shopping process

### Semantic Search
Unlike traditional keyword search, semantic search understands intent:
- "comfortable shoes for running" → finds athletic shoes
- "budget laptop for students" → filters by price and specs
- "gifts for tech enthusiasts" → suggests trending tech products

### Smart Recommendations
The recommendation engine uses multiple signals:
- Browsing history and click patterns
- Cart composition
- Vector similarity from Pinecone
- Collaborative filtering
- Popular and trending items

## 🔒 Security Features

- **JWT Authentication** - Secure token-based auth
- **Password Hashing** - bcryptjs with salt rounds
- **Rate Limiting** - Prevent brute force attacks
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing control
- **Input Validation** - express-validator for request validation
- **SQL Injection Protection** - Mongoose ODM

## 📊 Performance Optimizations

- **Redis Caching** - Cache frequently accessed data
- **MongoDB Indexing** - Optimized database queries
- **Next.js SSR** - Server-side rendering for faster loads
- **Image Optimization** - Next.js automatic image optimization
- **API Response Compression** - Reduce bandwidth usage
- **Vector Search** - Fast similarity search with Pinecone

## 🧪 Testing

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

## 📦 Deployment

### Frontend (Vercel)
1. Push code to GitHub
2. Import project in Vercel
3. Set environment variable: `NEXT_PUBLIC_API_URL`
4. Deploy

### Backend (Railway/Render/AWS)
1. Set all environment variables
2. Ensure MongoDB and Redis are accessible
3. Deploy with `npm start`

### Environment-specific configs
- Update CORS origins in backend
- Set production API URLs
- Configure MongoDB Atlas connection
- Set up Redis Cloud if needed

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 👥 Authors

Your Name / Team Name

## 🙏 Acknowledgments

- Google Gemini AI for LLM capabilities
- Pinecone for vector database
- LangChain for AI orchestration
- Next.js team for the amazing framework
- Open source community

## 📞 Support

For support, email your-email@example.com or open an issue in the repository.

---

**Built with ❤️ using Next.js, Express, and AI**
