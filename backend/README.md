# Flame Core Backend

Backend API for account registration, login, product templates, orders, payments, and user dashboard.

## Quick Start

1. Copy `.env.example` to `.env`
2. Install dependencies:
   - `npm install`
3. Generate client and migrate:
   - `npm run prisma:generate`
   - `npm run prisma:migrate`
4. Seed templates:
   - `npm run prisma:seed`
5. Start backend:
   - `npm run dev`

API base URL: `http://localhost:5000/api`
