# AI E-Commerce Frontend - Next.js

This is the frontend for the AI-Powered E-Commerce Platform, built with **Next.js 14**, **React**, **Tailwind CSS**, and integrated with AI features.

## Tech Stack

- **Next.js 14** - React framework with App Router
- **React 18** - UI library
- **Tailwind CSS** - Utility-first CSS framework
- **React Query** - Data fetching and caching
- **Framer Motion** - Animation library
- **Axios** - HTTP client
- **React Hot Toast** - Toast notifications
- **Lucide React** - Icon library
- **js-cookie** - Cookie management

## Features

- ✅ Server-side rendering (SSR) with Next.js
- ✅ App Router for file-based routing
- ✅ AI-powered product recommendations
- ✅ Real-time cart management
- ✅ JWT authentication with secure cookies
- ✅ Responsive design with Tailwind CSS
- ✅ Image optimization with Next.js Image
- ✅ SEO-friendly pages
- ✅ Progressive Web App (PWA) ready

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Install dependencies:

\`\`\`bash
npm install
# or
yarn install
\`\`\`

2. Create environment file:

\`\`\`bash
cp .env.local.example .env.local
\`\`\`

3. Update `.env.local` with your backend API URL:

\`\`\`
NEXT_PUBLIC_API_URL=http://localhost:5000/api
\`\`\`

### Development

Run the development server:

\`\`\`bash
npm run dev
# or
yarn dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

Create a production build:

\`\`\`bash
npm run build
# or
yarn build
\`\`\`

### Start Production Server

\`\`\`bash
npm start
# or
yarn start
\`\`\`

## Project Structure

\`\`\`
frontend/
├── src/
│   ├── app/                  # Next.js App Router pages
│   │   ├── layout.jsx        # Root layout
│   │   ├── page.jsx          # Home page
│   │   ├── login/            # Login page
│   │   ├── register/         # Register page
│   │   ├── products/         # Products listing
│   │   └── cart/             # Shopping cart
│   ├── components/           # Reusable components
│   │   ├── Navbar.jsx
│   │   ├── Footer.jsx
│   │   ├── ProductCard.jsx
│   │   └── AIAssistant.jsx
│   ├── context/              # React Context providers
│   │   ├── AuthContext.jsx
│   │   └── CartContext.jsx
│   ├── services/             # API service layer
│   │   └── api.js
│   └── styles/               # Global styles
│       └── globals.css
├── public/                   # Static assets
├── next.config.js            # Next.js configuration
├── tailwind.config.js        # Tailwind CSS configuration
└── package.json
\`\`\`

## Key Pages

- **/** - Home page with featured products
- **/products** - All products with filtering
- **/products/[id]** - Product detail page
- **/cart** - Shopping cart
- **/checkout** - Checkout process
- **/login** - User login
- **/register** - User registration
- **/profile** - User profile
- **/orders** - Order history
- **/admin** - Admin dashboard (role-based)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| NEXT_PUBLIC_API_URL | Backend API URL | http://localhost:5000/api |

## API Integration

The frontend communicates with the backend API using Axios. All API calls are configured in `src/services/api.js`.

### Authentication

JWT tokens are stored in HTTP-only cookies and automatically attached to requests via Axios interceptors.

### Data Fetching

React Query is used for server state management with automatic caching and background refetching.

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in Vercel
3. Configure environment variables
4. Deploy

### Docker

Build and run with Docker:

\`\`\`bash
docker build -t ai-ecommerce-frontend .
docker run -p 3000:3000 ai-ecommerce-frontend
\`\`\`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT
