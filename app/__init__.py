import os
from urllib.parse import urlparse
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_mail import Mail

db = SQLAlchemy()
mail = Mail()


def create_app():
    app = Flask(__name__, static_folder='static', template_folder='templates')
    app.secret_key = os.environ.get('SECRET_KEY', 'SUPER_SECRET_KEY')

    # Choose database from environment, robustly handle Render's DATABASE_URL,
    # and use a sensible sqlite fallback stored under instance/database.db.
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        # SQLAlchemy prefers the 'postgresql://' scheme; Render sometimes provides 'postgres://'
        if db_url.startswith("postgres://"):
            # Convert to SQLAlchemy-compatible scheme
            app.logger.warning(
                "Converting DATABASE_URL scheme from 'postgres://' to 'postgresql://'.")
            db_url = db_url.replace("postgres://", "postgresql://", 1)

        # Parse for safe logging (don't print credentials)
        try:
            parsed = urlparse(db_url)
            host = parsed.hostname or ""
            port = parsed.port or ""
            dbname = parsed.path.lstrip("/") if parsed.path else ""
            app.logger.info(
                f"Using DATABASE_URL (host={host}, port={port}, db={dbname})")
        except Exception:
            app.logger.info(
                "Using DATABASE_URL from environment (unable to parse host details)")

        app.config["SQLALCHEMY_DATABASE_URI"] = db_url
        # Keep connections healthy for long-running processes
        app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True}
    else:
        # fallback to local sqlite file inside the instance/ folder (recommended path)
        sqlite_path = os.environ.get("SQLITE_PATH", "instance/database.db")
        app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{sqlite_path}"
        # For sqlite, allow multi-threaded access via SQLAlchemy
        app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
            "connect_args": {"check_same_thread": False}}
        app.logger.info(
            f"No DATABASE_URL provided; falling back to sqlite at: {sqlite_path}")

    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # Flask-Mail configuration (use environment variables in production)
    app.config['MAIL_SERVER'] = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
    app.config['MAIL_PORT'] = int(os.environ.get('MAIL_PORT', 587))
    app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME', '')
    app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD', '')
    app.config['MAIL_USE_TLS'] = os.environ.get(
        'MAIL_USE_TLS', 'True') == 'True'
    app.config['MAIL_USE_SSL'] = os.environ.get(
        'MAIL_USE_SSL', 'False') == 'True'

    db.init_app(app)
    mail.init_app(app)
    CORS(app, supports_credentials=True)

    # Register routes and blueprints after app is created
    with app.app_context():
        # Import models first so db metadata exists
        try:
            from . import models  # noqa: F401
        except Exception:
            # If models fails to import, we still want the error to surface during startup
            raise

        # Import main routes (routes.py should use the app from create_app pattern or blueprints)
        try:
            from . import routes  # noqa: F401
        except Exception:
            # Surface the error so you see what's wrong with routes.py at startup
            raise

        # Register optional blueprints for settings and top-picks if they exist.
        # These files should define Blueprints named settings_bp and top_picks_bp respectively.
        try:
            from .routes_additions import settings_bp
            app.register_blueprint(settings_bp)
        except ImportError:
            # file may not exist yet — that's okay in dev
            pass
        except Exception:
            # If file exists but raises during import, surface the traceback
            raise

        try:
            from .routes_top_picks_stub import top_picks_bp
            app.register_blueprint(top_picks_bp)
        except ImportError:
            pass
        except Exception:
            raise

        # Create tables and optionally seed data
        db.create_all()
        try:
            if hasattr(models, 'seed_data'):
                models.seed_data()
        except Exception:
            # Ignore seeding errors for now (inspect logs if needed)
            pass

    return app
