"""
app/__init__.py

Application factory and extension initialization for the WPerfumes Flask app.

This file:
- Initializes extensions (SQLAlchemy, Mail, Migrate)
- Normalizes DATABASE_URL (postgres:// -> postgresql://) for SQLAlchemy
- Provides helper to expose unprefixed endpoint aliases for legacy templates
- create_app factory registers available blueprints in a fault-tolerant manner
  (main routes, settings, top-picks stub, content API/admin, search, PayPal payments,
   and price comparison if the blueprint exists).
"""
import os
import logging
from flask import Flask

# Extensions (initialized once and bound to app in create_app)
from flask_sqlalchemy import SQLAlchemy
from flask_mail import Mail
from flask_cors import CORS
from flask_migrate import Migrate

db = SQLAlchemy()
mail = Mail()
migrate = Migrate()


def _normalize_database_url(url: str) -> str:
    """
    Normalize a DATABASE_URL from providers that may provide the legacy
    "postgres://" scheme to "postgresql://" expected by SQLAlchemy.
    """
    if not url:
        return url
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def _expose_unprefixed_endpoints(app: Flask, blueprint_name: str) -> None:
    """
    Create alias rules for blueprint endpoints so templates that call
    url_for('some_endpoint') (without blueprint prefix) continue to work.

    Behavior:
      - For every rule whose endpoint starts with blueprint_name + ".",
        create an alias endpoint with the blueprint prefix stripped,
        unless that alias already exists in app.view_functions.
    This keeps backwards compatibility with templates using unprefixed names.
    """
    created = []
    try:
        for rule in list(app.url_map.iter_rules()):
            ep = rule.endpoint
            if not ep.startswith(blueprint_name + "."):
                continue
            unprefixed = ep.split(".", 1)[1]
            if unprefixed in app.view_functions:
                # alias would collide with existing view function; skip
                continue
            view_func = app.view_functions.get(ep)
            if view_func is None:
                continue
            methods = sorted(
                m for m in rule.methods if m not in ("HEAD", "OPTIONS"))
            try:
                app.add_url_rule(rule.rule, endpoint=unprefixed,
                                 view_func=view_func, methods=methods)
                created.append((rule.rule, ep, unprefixed))
            except Exception as exc:
                app.logger.debug(
                    f"Could not create alias for {ep} -> {unprefixed}: {exc}")
    except Exception as e:
        app.logger.debug(f"Error while exposing unprefixed endpoints: {e}")

    if created:
        for path, src, alias in created:
            app.logger.debug(
                f"Created endpoint alias: {src} -> {alias} (path: {path})")


def create_app(test_config=None) -> Flask:
    """
    Application factory.

    Example usage:
        export DATABASE_URL='postgresql://user:pass@host:5432/dbname'
        flask run

    The function raises RuntimeError if DATABASE_URL is not configured via
    environment variable or instance/config.py.
    """
    app = Flask(__name__, instance_relative_config=True)

    # Basic defaults (can be overridden by instance/config.py or environment)
    app.config.from_mapping(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-secret-key"),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )

    # Helpful session cookie defaults for local development:
    # - SESSION_COOKIE_SAMESITE Lax helps the cookie be sent on top-level navigations.
    # - SESSION_COOKIE_SECURE should be False for local http; set to True in production.
    app.config.setdefault("SESSION_COOKIE_SAMESITE", "Lax")
    app.config.setdefault("SESSION_COOKIE_SECURE", False)

    # Load instance config (local override, kept out of VCS)
    app.config.from_pyfile("config.py", silent=True)

    # Determine DATABASE_URL: prefer environment variable, then instance config
    database_url = os.environ.get(
        "DATABASE_URL") or app.config.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Configure DATABASE_URL in the environment or instance/config.py. "
            "Example: postgresql://user:pass@host:5432/dbname"
        )

    # Normalize provider-provided scheme if necessary
    database_url = _normalize_database_url(database_url)
    app.config["SQLALCHEMY_DATABASE_URI"] = database_url

    # Optional mail settings can be provided via environment or instance config
    if "MAIL_USERNAME" in os.environ:
        app.config["MAIL_USERNAME"] = os.environ.get("MAIL_USERNAME")
    if "MAIL_PASSWORD" in os.environ:
        app.config["MAIL_PASSWORD"] = os.environ.get("MAIL_PASSWORD")
    if "MAIL_SERVER" in os.environ:
        app.config["MAIL_SERVER"] = os.environ.get("MAIL_SERVER")
    if "MAIL_PORT" in os.environ:
        try:
            app.config["MAIL_PORT"] = int(os.environ.get("MAIL_PORT"))
        except Exception:
            pass
    if "MAIL_USE_TLS" in os.environ:
        app.config["MAIL_USE_TLS"] = os.environ.get(
            "MAIL_USE_TLS").lower() in ("1", "true", "yes")
    if "MAIL_USE_SSL" in os.environ:
        app.config["MAIL_USE_SSL"] = os.environ.get(
            "MAIL_USE_SSL").lower() in ("1", "true", "yes")

    # Initialize extensions with the app
    db.init_app(app)
    mail.init_app(app)
    # allow credentials (cookies) for cross-origin if needed; safe for local dev
    CORS(app, supports_credentials=True)
    migrate.init_app(app, db)

    # Import models to ensure they're registered with SQLAlchemy metadata (helps flask-migrate autogenerate)
    try:
        from . import models  # noqa: F401
    except Exception:
        app.logger.debug("Could not import app.models during create_app")

    # Register main routes blueprint
    try:
        from .routes import bp as main_bp
        app.register_blueprint(main_bp)
        # Create unprefixed aliases for endpoints defined in the main blueprint if requested
        if os.environ.get("EXPOSE_LEGACY_ENDPOINTS", "1") != "0":
            try:
                _expose_unprefixed_endpoints(app, blueprint_name=main_bp.name)
            except Exception as e:
                app.logger.debug(
                    f"Failed to create unprefixed endpoint aliases: {e}")
    except Exception as e:
        app.logger.debug(f"Failed to register routes blueprint: {e}")

    # Register settings blueprint (if present)
    try:
        from .routes_settings import settings_bp
        app.register_blueprint(settings_bp)
    except Exception as e:
        app.logger.debug(f"Failed to register settings blueprint: {e}")

    # Register top-picks stub blueprint so /api/top-picks endpoints exist for admin/frontend
    try:
        from .routes_top_picks_stub import top_picks_bp
        app.register_blueprint(top_picks_bp)
    except Exception as e:
        app.logger.debug(f"Failed to register top-picks blueprint: {e}")

    # Register content blueprint (public content API + minimal admin UI)
    try:
        from .routes_content import content_bp
        # Register content API under /content-api (public read endpoints and admin API)
        app.register_blueprint(content_bp, url_prefix="/content-api")

        # Expose a convenient alias for the admin UI at /content-admin that renders the same template.
        @app.route("/content-admin")
        def _content_admin_alias():
            # runtime import to avoid circular import at module load time
            from flask import render_template, session
            signin_required = not (session.get(
                "user") in ("admin", "admin@example.com"))
            return render_template("content_admin.html", signin_required=signin_required)
    except Exception as e:
        app.logger.debug(f"Failed to register content blueprint: {e}")

    # Register search blueprint (simple DB-backed search)
    try:
        from .routes_search import search_bp
        app.register_blueprint(search_bp)
    except Exception as e:
        app.logger.debug(f"Failed to register search blueprint: {e}")

    # Register price comparison blueprint if present (lightweight scraper + page)
    try:
        from .routes_price_comparison import price_cmp_bp
        app.register_blueprint(price_cmp_bp)
    except Exception as e:
        # Not critical if missing; page simply won't exist.
        app.logger.debug(f"Failed to register price comparison blueprint: {e}")

    # Register PayPal payments blueprint if available
    try:
        from .payments_paypal import paypal_bp
        # Register under the /paypal prefix so routes like /paypal/return and /paypal/create-paypal-order exist
        app.register_blueprint(paypal_bp, url_prefix="/paypal")
        app.logger.debug(
            "Registered PayPal payments blueprint (paypal_bp) with prefix /paypal")
    except Exception as e:
        app.logger.debug(f"Failed to register PayPal blueprint: {e}")

    # Expose a runtime snapshot of registered routes to the log for debugging
    with app.app_context():
        app.logger.debug("Database configured at: %s",
                         app.config.get("SQLALCHEMY_DATABASE_URI"))
        try:
            app.logger.debug("Registered routes:")
            for rule in app.url_map.iter_rules():
                app.logger.debug(f"{rule} -> methods={sorted(rule.methods)}")
        except Exception:
            pass

    # If no logging handlers attached (e.g., running via "python -m flask run"), set a basic configuration
    if not app.logger.handlers:
        logging.basicConfig(level=logging.INFO)

    return app
