
# Jaybird Connect – System Overview & README

Jaybird Connect is a full-stack application for tracking food cost, recipes, ingredients, and menu items in a restaurant setting. It is designed for reliability, security, and ease of use, with a modern architecture leveraging Google Cloud and robust authentication.

---

## Major Functions

- **Food Cost Tracking:** Calculate and display real-time food costs for recipes and menu items, including nested prep items and ingredient conversions.
- **Inventory & Ingredients:** Manage inventory, add/edit ingredients, and track price quotes from vendors.
- **Recipe Management:** Build recipes from ingredients and prep items, supporting recursive nesting and yield calculations.
- **Menu Items:** Organize and manage menu items, including pricing, categories, and process notes.
- **User Management:** Admins can register new users, assign roles, and manage departments.
- **Shift & Task Management:** Track employee shifts, assign tasks, and manage department schedules.

## Architecture

- **Frontend:** React (Vite) app hosted on [Firebase Hosting](https://jaybird-connect.web.app).
- **Backend:** Flask API deployed on **Google App Engine**.
- **Database:** Google Cloud SQL (PostgreSQL).
- **Migrations:** Database updates are performed via the Google Cloud Console SQL Editor using raw SQL files in `/migrations`.
- **External Systems:**
  - Google Cloud SQL (Postgres)
  - Firebase Hosting
  - SMTP (for password reset emails)

## Authentication (AUTH)

- **JWT-based Auth:** All API endpoints (except login, password reset, and public item listing) require a valid JWT in the `Authorization` header.
- **Password Security:** Passwords are hashed with bcrypt.
- **Admin Registration:** Only authenticated admins can register new users.
- **Password Reset:** Users can request password resets; reset tokens are emailed via SMTP and expire after 1 hour.
- **No SSO:** All authentication is handled in-house; no Google OAuth or third-party providers.

## CORS

- **Production Only:** CORS is strictly configured to allow requests from `https://jaybird-connect.web.app`.
- **Headers:** Supports credentials, exposes `Authorization` and `Content-Type`, and allows standard HTTP methods.
- **Preflight:** OPTIONS requests are handled with appropriate CORS headers and a 200 response.

## Axios Usage

- **Frontend API Calls:** All frontend communication with the backend uses [Axios](https://axios-http.com/) for HTTP requests.
- **Auth Handling:** Axios interceptors are used to attach JWT tokens to requests and handle 401/403 errors globally.
- **Error Handling:** API errors are surfaced in the UI, with warnings for missing conversions or prices.

## Common API Endpoints

- `POST /auth/login` – Authenticate and receive JWT
- `POST /auth/register` – Register new user (admin only)
- `POST /auth/forgot-password` – Request password reset
- `POST /auth/reset-password` – Reset password with token
- `GET /auth/check` – Validate JWT and get user info
- `GET /api/items` – List menu/prep items
- `POST /api/items` – Add new item
- `PUT /api/items/:id` – Update item
- `GET /api/ingredients` – List ingredients
- `POST /api/ingredients` – Add new ingredient
- `GET /api/ingredient_cost/:id` – Get cost for ingredient
- `GET /api/item_cost/:id` – Get cost for item

## Database & Migrations

- **Schema:** PostgreSQL tables for items, ingredients, recipes, price quotes, conversions, employees, departments, shifts, and tasks.
- **Updates:** All database changes are made via the Google Cloud Console SQL Editor using migration files in `/migrations`.

## Contact & Support

- For questions, support, or contributions, email [info@byjaybird.com](mailto:info@byjaybird.com).

---

© 2025 byjaybird. All rights reserved.
