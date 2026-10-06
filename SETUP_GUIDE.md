# AI E-Commerce Setup Guide - Next.js Version

Complete setup instructions for the AI-powered e-commerce platform with Next.js frontend.

---

## 🎯 Prerequisites

### Required
- **Node.js** 18+ ([Download](https://nodejs.org/))
- **MongoDB** 6+ ([Download](https://www.mongodb.com/try/download/community))
- **Redis** (Optional, for caching)
- **npm** or **yarn**

### Recommended
- **MongoDB Compass** (GUI for MongoDB)
- **Postman** (API testing)
- **VS Code** with extensions:
  - ES7+ React/Redux/React-Native snippets
  - Tailwind CSS IntelliSense
  - ESLint

---

## 📥 Installation

### 1. Clone Repository

\`\`\`bash
git clone <repository-url>
cd ai-e-commerce
\`\`\`

### 2. Backend Setup

\`\`\`bash
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env with your configuration
# Minimum required:
# - MONGODB_URI
# - JWT_SECRET
# - GEMINI_API_KEY (for AI features)
# - PINECONE_API_KEY (for recommendations)

# Start MongoDB (if not running)
# Windows: mongod
# Mac/Linux: sudo systemctl start mongod

# Run database seed (optional)
npm run seed

# Start backend server
npm run dev
\`\`\`

Backend will run on **http://localhost:5000**

### 3. Frontend Setup (Next.js)

\`\`\`bash
cd frontend

# Install dependencies
npm install

# Create environment file
cp .env.local.example .env.local

# Edit .env.local
# NEXT_PUBLIC_API_URL=http://localhost:5000/api

# Start development server
npm run dev
\`\`\`

Frontend will run on **http://localhost:3000**

---

## 🔧 Environment Configuration

### Backend (.env)

\`\`\`env
# Server
NODE_ENV=development
PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/ai-ecommerce

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRE=7d

# Google Gemini AI
GEMINI_API_KEY=your-gemini-api-key

# Pinecone Vector DB
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_ENVIRONMENT=your-environment
PINECONE_INDEX_NAME=products

# Redis (Optional)
REDIS_URL=redis://localhost:6379

# CORS
CLIENT_URL=http://localhost:3000

# Upload
MAX_FILE_SIZE=5242880
UPLOAD_DIR=./uploads
\`\`\`

### Frontend (.env.local)

\`\`\`env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
\`\`\`

---

## 🚀 Running the Application

### Development Mode

**Terminal 1 - Backend:**
\`\`\`bash
cd backend
npm run dev
\`\`\`

**Terminal 2 - Frontend:**
\`\`\`bash
cd frontend
npm run dev
\`\`\`

**Access:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000/api
- MongoDB: mongodb://localhost:27017

### Production Mode

**Backend:**
\`\`\`bash
cd backend
npm run build
npm start
\`\`\`

**Frontend:**
\`\`\`bash
cd frontend
npm run build
npm start
\`\`\`

---

## 📊 Database Setup

### Option 1: Seed Data (Recommended)

\`\`\`bash
cd backend
npm run seed
\`\`\`

This creates:
- Admin user: `admin@bagstore.com` / `admin123`
- Sample user: `user@bagstore.com` / `user123`
- 20+ sample products
- Categories and brands

### Option 2: Manual Setup

1. Start MongoDB
2. Create database: `ai-ecommerce`
3. Backend will auto-create collections on first run

---

## 🧪 Testing the Setup

### 1. Backend Health Check
\`\`\`bash
curl http://localhost:5000/health
# Should return: {"status":"ok","timestamp":"..."}
\`\`\`

### 2. API Test
\`\`\`bash
curl http://localhost:5000/api/products
# Should return products array
\`\`\`

### 3. Frontend Test
- Open http://localhost:3000
- Should see home page with featured products

### 4. Full Flow Test
1. Register new account
2. Browse products
3. Add to cart
4. Proceed to checkout
5. View orders

---

## 🔑 API Keys Setup

### Google Gemini API

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create API key
3. Add to backend `.env`: `GEMINI_API_KEY=your-key`

### Pinecone API

1. Sign up at [Pinecone](https://www.pinecone.io/)
2. Create new index:
   - Name: `products`
   - Dimensions: `1536`
   - Metric: `cosine`
3. Get API key from dashboard
4. Add to backend `.env`:
   \`\`\`
   PINECONE_API_KEY=your-key
   PINECONE_ENVIRONMENT=your-env
   PINECONE_INDEX_NAME=products
   \`\`\`

---

## 🐳 Docker Setup (Alternative)

### Using Docker Compose

\`\`\`bash
# Create docker-compose.yml in project root
docker-compose up -d

# Access
# Frontend: http://localhost:3000
# Backend: http://localhost:5000
# MongoDB: localhost:27017
\`\`\`

### docker-compose.yml Example

\`\`\`yaml
version: '3.8'

services:
  mongodb:
    image: mongo:6
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

  backend:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/ai-ecommerce
    depends_on:
      - mongodb

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:5000/api
    depends_on:
      - backend

volumes:
  mongo-data:
\`\`\`

---

## ⚠️ Common Issues & Solutions

### Port Already in Use

**Problem**: `Error: listen EADDRINUSE: address already in use :::3000`

**Solution**:
\`\`\`bash
# Find process using port
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:3000 | xargs kill -9

# Or use different port
npm run dev -- -p 3001
\`\`\`

### MongoDB Connection Failed

**Problem**: `MongoServerError: connect ECONNREFUSED`

**Solution**:
1. Check MongoDB is running
2. Verify `MONGODB_URI` in `.env`
3. Test connection: `mongosh mongodb://localhost:27017`

### API Not Responding

**Problem**: Frontend can't reach backend

**Solution**:
1. Check backend is running on port 5000
2. Verify `.env.local` has correct `NEXT_PUBLIC_API_URL`
3. Check CORS settings in backend
4. Disable browser extensions (AdBlock, etc.)

### Module Not Found

**Problem**: `Error: Cannot find module '...'`

**Solution**:
\`\`\`bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Next.js cache
rm -rf .next
npm run dev
\`\`\`

### Images Not Loading

**Problem**: Product images showing placeholder

**Solution**:
1. Check `UPLOAD_DIR` in backend `.env`
2. Ensure uploads folder exists and has permissions
3. Verify image URLs in database
4. Check Next.js image domains in `next.config.js`

---

## 📁 Project Structure

\`\`\`
ai-e-commerce/
├── backend/
│   ├── config/              # Configuration files
│   ├── controllers/         # Request handlers
│   ├── models/             # MongoDB schemas
│   ├── routes/             # API routes
│   ├── middleware/         # Auth, validation
│   ├── services/           # Business logic
│   ├── utils/              # Helper functions
│   └── server.js           # Entry point
├── frontend/
│   ├── src/
│   │   ├── app/            # Next.js pages
│   │   ├── components/     # React components
│   │   ├── context/        # State management
│   │   ├── services/       # API layer
│   │   └── styles/         # CSS files
│   ├── public/             # Static assets
│   └── next.config.js      # Next.js config
└── README.md
\`\`\`

---

## 🎓 Default Credentials

After running seed:

### Admin Account
- Email: `admin@bagstore.com`
- Password: `admin123`
- Access: Full admin dashboard

### Test User
- Email: `user@bagstore.com`
- Password: `user123`
- Access: Regular customer

---

## 📚 Available Scripts

### Backend
- `npm run dev` - Development server with nodemon
- `npm start` - Production server
- `npm run seed` - Seed database with sample data
- `npm test` - Run tests

### Frontend
- `npm run dev` - Next.js development server
- `npm run build` - Create production build
- `npm start` - Start production server
- `npm run lint` - Run ESLint

---

## 🔍 Verification Checklist

After setup, verify:

- [ ] Backend running on port 5000
- [ ] Frontend running on port 3000
- [ ] MongoDB connected successfully
- [ ] Can register new user
- [ ] Can login with credentials
- [ ] Products display on home page
- [ ] Can add products to cart
- [ ] Can view cart
- [ ] AI assistant responds
- [ ] Product search works
- [ ] Images load correctly

---

## 🆘 Getting Help

1. Check documentation in `/docs`
2. Review error logs
3. Search issues on GitHub
4. Check Next.js docs: https://nextjs.org/docs
5. MongoDB docs: https://docs.mongodb.com

---

## 🎉 Next Steps

After successful setup:

1. **Customize branding** - Update colors, logo, content
2. **Add products** - Via admin dashboard or seed script
3. **Configure AI** - Add your API keys for full AI features
4. **Set up payments** - Integrate Stripe/PayPal
5. **Deploy** - Vercel (frontend) + Railway/Render (backend)

---

**Happy Coding!** 🚀
