# WPerfumes E-Commerce Flask Application

This is an e-commerce backend built with Flask, SQLAlchemy, and PostgreSQL (compatible with SQLite for local development). It provides RESTful API endpoints for managing brands, products, homepage sections, orders, coupons, and more. The project is structured for easy deployment to [Render](https://render.com/) and supports email notifications for orders.

---

## Features

- User authentication (admin-only)
- Product and brand CRUD operations
- Homepage featured products
- Shopping cart logic
- Order placement and status tracking
- Coupon management
- Email notifications via Gmail SMTP
- CORS enabled for frontend integration

---

## Project Structure

```
WPerfumes/
├── app/
│   ├── __init__.py        # App factory, initialization
│   ├── models.py          # Database models & seed data
│   ├── routes.py          # API endpoints
│   ├── templates/         # (Your HTML files here)
│   └── static/            # CSS, JS, images, audio, etc.
├── run.py                 # App entry point
├── requirements.txt       # Python dependencies
├── Procfile               # For deployment (Render)
├── .gitignore             # Files to ignore in Git
└── README.md              # Project documentation
```

---

## Local Development

1. **Clone the repository:**
   ```sh
   git clone https://github.com/yourusername/WPerfumes.git
   cd WPerfumes
   ```

2. **Create a virtual environment and activate it:**
   ```sh
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies:**
   ```sh
   pip install -r requirements.txt
   ```

4. **Run the app locally:**
   ```sh
   python run.py
   ```
   The API will be available at `http://localhost:5000/`.

---

## Deployment (Render)

1. **Provision a PostgreSQL database** in Render.
2. **Add the `DATABASE_URL` environment variable** (Render does this if you link the database).
3. **Deploy the app** (Render will use `Procfile` and `requirements.txt`).
4. **App will automatically use PostgreSQL in production.**

---

## Configuration

- Edit `app/__init__.py` or use environment variables for:
  - `SECRET_KEY`
  - `MAIL_USERNAME` and `MAIL_PASSWORD` (use [App Passwords](https://support.google.com/accounts/answer/185833) if using Gmail)
- For local overrides, you can add an `instance/config.py` and load it if needed.

---

## Database

- **Local:** Uses SQLite by default for convenience (`database.db` in project root).
- **Production (Render):** Uses PostgreSQL via the `DATABASE_URL` environment variable.

---

## Important Endpoints

| Endpoint                       | Method | Description                          |
|---------------------------------|--------|--------------------------------------|
| `/api/auth/login`               | POST   | Admin login                          |
| `/api/brands`                   | GET    | List all brands                      |
| `/api/products`                 | GET    | List all products                    |
| `/api/orders`                   | GET    | List all orders (admin)              |
| `/api/orders`                   | POST   | Place a new order                    |
| `/api/coupons`                  | GET    | List all coupons                     |
| ...                             | ...    | ...                                  |

---

## Notes

- **Static files** (CSS, JS, images, audio) go in `app/static/`.
- **HTML templates** go in `app/templates/`.
- **Seed data** is auto-inserted on first run if the database is empty.
- Do **not commit** sensitive info (passwords, etc.) to the repo.

---

## License

MIT License

---

## Author

- [Makori](https://github.com/cyrussimba)