# AI-Powered E-Commerce Platform

A full-stack AI-enhanced e-commerce platform built with React, Node.js, Express, MongoDB, Redis, Google Gemini, LangChain, and Pinecone.

The application combines core e-commerce functionality with AI-powered product search, conversational shopping assistance, personalized recommendations, and semantic similarity search.

## Features

### E-Commerce
- User registration and authentication
- Product browsing and search
- Category and price filtering
- Shopping cart
- Checkout and order management
- User profiles
- Admin dashboard
- Product and inventory management

### AI Features
- AI-powered shopping assistant
- Natural-language product search
- Semantic vector search
- Personalized product recommendations
- Context-aware recommendations
- Similar product discovery
- Retrieval-Augmented Generation (RAG)
- Product embeddings and AI metadata

### Analytics
- Search analytics
- Product click tracking
- Cart-add tracking
- Conversion tracking
- Search refinement tracking
- Recommendation analytics
- AI/search performance insights

### Backend
- JWT authentication
- Role-based authorization
- Request validation
- Redis caching
- Rate limiting
- Security headers with Helmet
- Structured logging
- Centralized error handling
- MongoDB indexing
- Response compression

## Tech Stack

### Frontend
- React
- Vite
- React Router
- Axios
- Tailwind CSS
- React Query
- React Hook Form
- Framer Motion

### Backend
- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT
- bcryptjs
- Redis

### AI / ML
- Google Gemini
- LangChain
- Embeddings
- Pinecone
- Vector similarity search
- RAG
- Recommendation algorithms

## Architecture

```text
                         ┌──────────────────────┐
                         │     React + Vite     │
                         │      Frontend        │
                         └──────────┬───────────┘
                                    │
                              REST / HTTP
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │    Express API       │
                         │       Backend        │
                         └──────────┬───────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
       E-Commerce APIs        AI / RAG Services    Recommendation
       Auth / Products        Chat / Search         Services
       Cart / Orders
              │                     │                     │
              ▼                     ▼                     ▼
          MongoDB              Gemini API            Pinecone
                                  │                  Vector Store
                                  │
                                  ▼
                             Redis Cache
