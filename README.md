# FLAME CORE TECHNOLOGIES LTD

A full-stack ecommerce platform with real-time admin dashboard, payment processing, and advanced order management.

## 🚀 Features

- **Complete Authentication System**
  - Email/password registration and login
  - Google OAuth 2.0 integration
  - JWT-based session management (HttpOnly cookies)
  - Secure password hashing (bcrypt)

- **Ecommerce Platform**
  - Product catalog with detailed descriptions
  - Shopping cart management
  - Stripe payment integration
  - Order tracking and history
  - Sequential order numbering for business tracking

- **Admin Dashboard**
  - Real-time order monitoring via Socket.io
  - User management and analytics
  - Admin chat system
  - Dashboard statistics (orders, revenue, customers)
  - Secure admin authentication

- **Security**
  - CORS restriction to whitelisted domains
  - Rate limiting on auth endpoints (30/15min), admin (60/15min), API (240/1min)
  - HTTPS-ready with security headers (helmet)
  - Timing-safe admin key comparison
  - Environment secret protection (.gitignore)

## 📋 Tech Stack

### Frontend
- HTML5, CSS3, JavaScript (ES6+)
- Responsive design with mobile/tablet support
- Real-time updates via Socket.io
- Static pages with admin SPA (Single Page Application)

### Backend
- **Node.js** with Express.js (ES modules)
- **PostgreSQL** with Prisma ORM
- **Real-time**: Socket.io for admin dashboard
- **Payments**: Stripe API integration
- **Authentication**: JWT (HS256), bcrypt, Google Auth Library
- **Rate Limiting**: express-rate-limit v7.5.1

### Database
- PostgreSQL with sequential numbering (customerNumber, orderNumber)
- Prisma v5.18 for migrations and schema management
- Automatic backup recommendations for production

### Infrastructure
- **Deployment Target**: Railway
- **Domain**: flamecoretechltd.com
- **API**: RESTful endpoints with JSON request/response

## 📁 Project Structure

```
FLAME-CORE-TECHNOLOGIES-LTD/
├── frontend/
│   ├── index.html              # Homepage
│   ├── products.html           # Product catalog
│   ├── login.html              # Login page
│   ├── signup.html             # User registration
│   ├── dashboard.html          # User dashboard
│   ├── about.html              # About page
│   ├── services.html           # Services page
│   ├── contact.html            # Contact page
│   ├── start-project.html      # Project inquiry form
│   ├── admin/                  # Admin dashboard (SPA)
│   ├── assets/css/             # Stylesheets
│   └── assets/js/              # Client-side scripts
├── backend/
│   ├── src/
│   │   ├── server.js           # Express app setup & Socket.io
│   │   ├── middleware/         # Auth, error handling, logging
│   │   └── modules/
│   │       ├── auth/           # Authentication routes
│   │       ├── products/       # Product management
│   │       ├── orders/         # Order management
│   │       ├── payments/       # Stripe integration
│   │       ├── admin/          # Admin operations
│   │       └── users/          # User profile management
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema
│   │   └── migrations/         # Database migrations
│   ├── .env.example            # Environment template
│   ├── package.json            # Dependencies
│   └── requirements.txt        # Python/system requirements (if any)
├── .gitignore
└── README.md                   # This file
```

## 🛠️ Getting Started

### Prerequisites
- Node.js v18+ and npm
- PostgreSQL 12+
- Stripe account (with API keys)
- Google OAuth credentials (for social login)

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Emperorgeneral/FLAME-CORE-TECHONOLOGIES-LTD.git
   cd FLAME-CORE-TECHONOLOGIES-LTD
   ```

2. **Backend setup**
   ```bash
   cd backend
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Fill in `.env` with your actual values (see [Environment Variables](#environment-variables) section)

4. **Initialize database**
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

5. **Start the backend server**
   ```bash
   npm start
   ```
   Backend runs on `http://localhost:5000`

6. **Serve frontend** (in another terminal)
   ```bash
   # Option 1: Python (v3.x)
   python -m http.server 8000
   
   # Option 2: Node.js (http-server)
   npx http-server
   ```
   Frontend runs on `http://localhost:8000`

7. **Access the application**
   - Frontend: http://localhost:8000
   - Admin: http://localhost:8000/admin/
   - API: http://localhost:5000/api/

## 🔐 Environment Variables

Create a `.env` file in the `backend/` directory with these variables:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/flamecore

# JWT Configuration
JWT_SECRET=your-super-secret-key-min-32-chars-recommended
JWT_ISSUER=flamecore
JWT_AUDIENCE=flamecore-auth

# Frontend URLs (CORS allowlist)
FRONTEND_URLS=https://flamecoretechltd.com,https://www.flamecoretechltd.com

# Stripe Payment Integration
STRIPE_SECRET_KEY=sk_live_xxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx

# Google OAuth
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx

# Admin Security
ADMIN_SECRET_KEY=your-admin-key-for-authorization

# Optional: Bot API Webhook Secret
FLAMEBOT_BOT_API_WEBHOOK_SECRET=your-secret-key

# Server Configuration
NODE_ENV=production
PORT=5000
```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Create new user account
- `POST /api/auth/login` - User login
- `POST /api/auth/google` - Google OAuth login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user profile

### Products
- `GET /api/products` - List all products
- `GET /api/products/:id` - Get product details

### Orders
- `POST /api/orders` - Create order
- `GET /api/orders` - Get user's orders
- `GET /api/orders/:id` - Get order details

### Payments
- `POST /api/payments/create-checkout` - Create Stripe checkout session
- `POST /api/payments/webhook` - Stripe webhook handler

### Admin
- `GET /api/admin/users` - List all users (admin only)
- `GET /api/admin/orders` - List all orders (admin only)
- `GET /api/admin/stats` - Dashboard statistics (admin only)

## 🌐 Deployment

### Prerequisites for Railway
Create a Railway account and project.

### Steps

1. **Connect GitHub repository**
   - Link your Railway project to this GitHub repo

2. **Set environment variables on Railway**
   - Copy all values from `.env.example` to Railway environment
   - Replace placeholders with production secrets

3. **Configure PostgreSQL database**
   - Add PostgreSQL plugin to Railway project
   - Update `DATABASE_URL` in environment variables

4. **Deploy**
   ```bash
   # Railway auto-deploys on git push
   git push origin main
   ```

5. **Run migrations**
   - After first deployment, run:
   ```bash
   npx prisma migrate deploy
   ```

6. **Configure DNS**
   - Point `flamecoretechltd.com` and `www.flamecoretechltd.com` to Railway's deployment URL:
     - Add CNAME records to your domain provider
     - Update Google OAuth redirect URIs

7. **Test production**
   - Visit https://flamecoretechltd.com
   - Sign up with email/Google OAuth
   - Test order creation and Stripe payment

## 🔄 Real-time Features

The admin dashboard uses Socket.io for real-time updates:
- **Admin namespace** (`/admin`) - For admin users only
- **User namespace** (`/user`) - For regular users
- Events: new orders, user activity, chat messages

Connections restricted to whitelisted frontend origins in `FRONTEND_URLS`.

## 🛡️ Security Notes

- **Secrets**: Never commit `.env` file or sensitive keys to GitHub
- **Cookies**: Authentication tokens stored in HttpOnly cookies (CSRF-safe)
- **CORS**: Restricted to whitelisted domains—update for your deployment
- **Rate Limiting**: Auth endpoints limited to 30 requests per 15 minutes per IP
- **Admin Key**: Use strong, unique admin secret; rotate regularly
- **Password**: Minimum 8 characters, bcrypt hashed with 12 salt rounds

## 📦 Dependencies

### Backend
- `express` - Web framework
- `prisma` - ORM for database
- `jsonwebtoken` - JWT authentication
- `bcryptjs` - Password hashing
- `stripe` - Payment processing
- `socket.io` - Real-time communication
- `helmet` - Security headers
- `cors` - Cross-origin resource sharing
- `zod` - Schema validation
- `dotenv` - Environment configuration

See `backend/package.json` for full list.

## 🧪 Testing

Currently, testing setup is in progress. Recommended tools:
- **Unit tests**: Jest
- **API tests**: Postman or automated tests
- **Integration tests**: Prisma with test database

## 📝 License

Private project for Flame Core Technologies Ltd.

## 👥 Contact

For questions or issues, contact the development team.

---

**Status**: Deployed to production  
**Last Updated**: April 4, 2026  
**Domain**: https://flamecoretechltd.com