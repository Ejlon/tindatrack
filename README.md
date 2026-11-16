# TindaTrack 🏪

**Multi-branch inventory and sales management system for retail grocery stores (tindahan).**

Built with React + Vite, Node.js + Express, MySQL, and Tailwind CSS.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Prerequisites](#prerequisites)
5. [Database Setup](#database-setup)
6. [Backend Setup](#backend-setup)
7. [Frontend Setup](#frontend-setup)
8. [Demo Accounts](#demo-accounts)
9. [API Reference](#api-reference)
10. [Screenshots](#screenshots)
11. [Deployment Notes](#deployment-notes)

---

## Features

| Feature | Description |
|---|---|
| **Multi-Branch** | Owner sees all branches; manager/cashier see only their branch |
| **Bodega Management** | Central warehouse stock — only leaves via a Transfer |
| **Stock Transfers** | Atomic bodega → branch transfers with duplicate-protection locking |
| **Point of Sale** | Cart-based POS that blocks sales when stock is insufficient |
| **Low-Stock Alerts** | Per-product thresholds for both bodega and each branch |
| **Sales History** | Full receipt view with per-item profit calculation |
| **Reports & Charts** | Sales trend, best sellers, stock snapshot, branch comparison |
| **Role-Based Access** | JWT auth with `owner`, `manager`, and `cashier` roles |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 + Tailwind CSS 3 |
| Charts | Recharts 2 |
| Backend | Node.js + Express 4 |
| Database | MySQL 8 / MariaDB 10.4 (XAMPP) |
| Auth | JSON Web Tokens (JWT) + bcrypt |
| HTTP Client | Axios |

---

## Project Structure

```
tindatrack/
├── database/
│   ├── schema.sql          ← All CREATE TABLE statements
│   └── seed.sql            ← Sample data (2 branches, 10 products, 5 users, 16 sales)
├── backend/
│   ├── server.js           ← Express entry point
│   ├── .env.example        ← Environment variable template
│   ├── config/
│   │   └── db.js           ← MySQL connection pool
│   ├── middleware/
│   │   └── auth.js         ← verifyToken, requireRole, requireSameBranch
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── productsController.js
│   │   ├── bodegaController.js
│   │   ├── transfersController.js
│   │   ├── salesController.js
│   │   ├── reportsController.js
│   │   └── branchesController.js
│   └── routes/
│       ├── auth.js
│       ├── products.js
│       ├── bodega.js
│       ├── transfers.js
│       ├── sales.js
│       ├── reports.js
│       └── branches.js
└── frontend/
    ├── index.html
    ├── vite.config.js      ← Dev proxy: /api → localhost:5000
    ├── tailwind.config.js
    └── src/
        ├── App.jsx         ← Route tree
        ├── main.jsx        ← React root
        ├── index.css       ← Tailwind + component classes
        ├── context/
        │   └── AuthContext.jsx
        ├── api/            ← One module per resource (axios-based)
        ├── components/
        │   ├── layout/     ← Layout, Sidebar, Navbar, ProtectedRoute
        │   └── ui/         ← Alert, Modal, Spinner, StatCard
        ├── pages/          ← Login, Dashboard, Inventory, Bodega,
        │                      Transfers, Sales, Reports, NotFound
        └── utils/
            └── formatters.js
```

---

## Prerequisites

- **Node.js** v18 or later — [nodejs.org](https://nodejs.org)
- **MySQL 8** or **MariaDB 10.4+** — easiest via [XAMPP](https://www.apachefriends.org) on Windows/macOS
- **npm** (comes with Node)

Verify your versions:

```bash
node  --version   # v18+
npm   --version   # 9+
mysql --version   # 8+ or mariadb 10.4+
```

---

## Database Setup

### 1. Start MySQL

- **XAMPP**: open the XAMPP control panel and click **Start** next to MySQL.
- **Command line**: `sudo service mysql start` (Linux)

### 2. Create the schema

```bash
mysql -u root -p < database/schema.sql
```

> Leave the password blank if you're using XAMPP defaults (no root password).

### 3. Load the seed data

```bash
mysql -u root -p < database/seed.sql
```

When the import finishes, you'll see a row-count table confirming everything loaded:

```
table_name       | row_count
-----------------+-----------
branches         | 2
users            | 5
products         | 10
bodega_stock     | 10
store_stock      | 20
bodega_logs      | 33
stock_transfers  | 26
sales            | 16
sale_items       | 51
```

---

## Backend Setup

```bash
cd tindatrack/backend

# 1. Install dependencies
npm install

# 2. Create your .env file from the template
cp .env.example .env
```

Open `.env` and set your values:

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=          # blank for XAMPP default
DB_NAME=tindatrack

# Generate a real secret: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=replace_this_with_a_long_random_string
JWT_EXPIRES_IN=8h

FRONTEND_URL=http://localhost:5173
```

```bash
# 3. Start the development server (auto-restarts on save)
npm run dev
```

Expected output:

```
✅  MySQL connected — database: tindatrack
🚀  TindaTrack API running on http://localhost:5000
    Environment: development
```

### Quick health check

```bash
curl http://localhost:5000/api/health
# → {"status":"ok","service":"TindaTrack API","time":"..."}
```

---

## Frontend Setup

```bash
cd tindatrack/frontend

# 1. Install dependencies
npm install

# 2. Start the Vite dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

> The Vite dev server automatically proxies all `/api/...` requests to `http://localhost:5000`, so no CORS configuration is needed during development.

---

## Demo Accounts

All demo accounts use the password: **`Password123!`**

| Email | Role | Branch | Access |
|---|---|---|---|
| `owner@tindatrack.test` | Owner | — | Everything: all branches + bodega + reports |
| `manager.poblacion@tindatrack.test` | Manager | Poblacion Branch | Their branch + bodega + transfers |
| `cashier.poblacion@tindatrack.test` | Cashier | Poblacion Branch | POS + inventory view |
| `manager.sanroque@tindatrack.test` | Manager | San Roque Branch | Their branch + bodega + transfers |
| `cashier.sanroque@tindatrack.test` | Cashier | San Roque Branch | POS + inventory view |

---

## API Reference

All protected routes require `Authorization: Bearer <token>` header.

### Auth

| Method | Endpoint | Access | Body |
|---|---|---|---|
| POST | `/api/auth/login` | Public | `{ email, password }` |
| POST | `/api/auth/register` | Public | `{ name, email, password, role, branch_id? }` |
| GET | `/api/auth/me` | Authenticated | — |
| GET | `/api/auth/users` | Owner | — |
| PUT | `/api/auth/users/:id/toggle` | Owner | — |

### Branches

| Method | Endpoint | Access | Body |
|---|---|---|---|
| GET | `/api/branches` | Authenticated | — |
| GET | `/api/branches/:id` | Authenticated | — |
| POST | `/api/branches` | Owner | `{ branch_name, location }` |
| PUT | `/api/branches/:id` | Owner | `{ branch_name?, location? }` |

### Products

| Method | Endpoint | Access | Body / Params |
|---|---|---|---|
| GET | `/api/products` | Authenticated | — |
| GET | `/api/products/low-stock` | Authenticated | — |
| GET | `/api/products/:id` | Authenticated | — |
| POST | `/api/products` | Owner, Manager | `{ name, category, sku, cost_price, selling_price, unit }` |
| PUT | `/api/products/:id` | Owner, Manager | same fields (all optional) |
| DELETE | `/api/products/:id` | Owner, Manager | — (soft archive) |
| PUT | `/api/products/:id/stock-level` | Owner, Manager | `{ bodega_low_stock_level?, store_low_stock_level?, branch_id? }` |

### Bodega

| Method | Endpoint | Access | Body / Params |
|---|---|---|---|
| GET | `/api/bodega/stock` | Owner, Manager | — |
| GET | `/api/bodega/logs` | Owner, Manager | `?product_id&type=in\|out&from&to&limit&offset` |
| POST | `/api/bodega/receive` | Owner, Manager | `{ product_id, quantity, reference?, supplier? }` |

### Transfers

| Method | Endpoint | Access | Body / Params |
|---|---|---|---|
| POST | `/api/transfers` | Owner, Manager | `{ product_id, branch_id, quantity, notes? }` |
| GET | `/api/transfers` | Authenticated | `?branch_id&product_id&from&to&limit&offset` |
| GET | `/api/transfers/:id` | Authenticated | — |

### Sales

| Method | Endpoint | Access | Body / Params |
|---|---|---|---|
| POST | `/api/sales` | Authenticated | `{ items: [{ product_id, quantity }], branch_id? }` |
| GET | `/api/sales` | Authenticated | `?from&to&branch_id&limit&offset` |
| GET | `/api/sales/:id` | Authenticated | — |

### Reports

| Method | Endpoint | Access | Params |
|---|---|---|---|
| GET | `/api/reports/dashboard` | Authenticated | `?branch_id` |
| GET | `/api/reports/sales-trend` | Authenticated | `?days=30&branch_id` |
| GET | `/api/reports/best-sellers` | Authenticated | `?days=30&limit=10&branch_id` |
| GET | `/api/reports/stock-levels` | Authenticated | — |
| GET | `/api/reports/branch-comparison` | Owner only | `?days=30` |

---

## Screenshots

> _Replace these placeholders with real screenshots after running the app._

### Login Page
![Login](screenshots/login.png)

### Dashboard (Owner view)
![Dashboard](screenshots/dashboard.png)

### Inventory Management
![Inventory](screenshots/inventory.png)

### Bodega Stock & Audit Log
![Bodega](screenshots/bodega.png)

### Stock Transfer
![Transfers](screenshots/transfers.png)

### Point of Sale
![POS](screenshots/sales-pos.png)

### Reports — Sales Trend Chart
![Reports](screenshots/reports.png)

---

## Deployment Notes

### Environment variables to change for production

```env
NODE_ENV=production
JWT_SECRET=<64-character random hex string>
JWT_EXPIRES_IN=8h
FRONTEND_URL=https://your-frontend-domain.com
DB_PASSWORD=<strong password>
```

### Build the frontend for production

```bash
cd frontend
npm run build        # outputs to frontend/dist/
```

Serve `dist/` with Nginx, Vercel, Netlify, or any static host.

### Serve the backend

```bash
cd backend
npm start            # uses node server.js (no nodemon)
```

For long-running production processes, use **PM2**:

```bash
npm install -g pm2
pm2 start server.js --name tindatrack-api
pm2 save
```

### CORS in production

Update `FRONTEND_URL` in backend `.env` to your actual frontend URL so the browser does not get CORS errors.

---

## Common Issues

| Problem | Fix |
|---|---|
| `MySQL connection failed` | Check XAMPP is running. Verify `.env` DB_* values match your MySQL setup. |
| `Cannot find module` | Run `npm install` in both `backend/` and `frontend/`. |
| Login returns 401 with seed data | The seed hash is for `Password123!` — use that exact password with capital P. |
| Port 5000 already in use | Change `PORT=5001` in `.env` and update `vite.config.js` proxy target. |
| Vite shows blank page | Make sure the backend is running on port 5000 before opening the frontend. |

---

Made with ❤️ for Filipino tindahan owners.
