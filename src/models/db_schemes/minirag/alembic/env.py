from logging.config import fileConfig
import os
import sys
from pathlib import Path

from alembic import context

# Make both the `schemes` package (this directory's parent) and the
# application `src` package importable regardless of the current working dir.
# This must happen before importing `schemes`.
_HERE = Path(__file__).resolve()
_MINIRAG_DIR = _HERE.parents[1]
_SRC_DIR = _HERE.parents[4]
for _p in (str(_SRC_DIR), str(_MINIRAG_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from sqlalchemy import engine_from_config
from sqlalchemy import pool
from sqlalchemy.engine import URL
from schemes import SQLAlchemyBase

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Load src/.env so POSTGRES_* values are available when running the CLI
# from any working directory.
try:
    from dotenv import load_dotenv
    load_dotenv(_SRC_DIR / ".env")
except Exception:
    pass


_PLACEHOLDER_URLS = {
    "",
    "driver://user:pass@localhost/dbname",
    "postgresql+psycopg2://localhost/postgres",
}


def _database_url() -> str:
    """Resolve the database URL for Alembic.

    Precedence:
      1. ALEMBIC_DATABASE_URL / DATABASE_URL explicit override
      2. ``sqlalchemy.url`` supplied by ``helpers.migrations`` (setup wizard)
      3. POSTGRES_* variables (developer CLI)
    """
    explicit = os.environ.get("ALEMBIC_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if explicit:
        return explicit

    configured = (config.get_main_option("sqlalchemy.url") or "").strip()
    if configured not in _PLACEHOLDER_URLS:
        return configured

    return URL.create(
        "postgresql+psycopg2",
        username=os.environ.get("POSTGRES_USERNAME", "postgres"),
        password=os.environ.get("POSTGRES_PASSWORD", ""),
        host=os.environ.get("POSTGRES_HOST", "127.0.0.1"),
        port=int(os.environ.get("POSTGRES_PORT", "5432") or 5432),
        database=os.environ.get("POSTGRES_MAIN_DATABASE", "ai_study_assistant"),
    ).render_as_string(hide_password=False)


# Always override the hardcoded URL from alembic.ini with environment settings.
config.set_main_option("sqlalchemy.url", _database_url().replace("%", "%%"))

# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
target_metadata = SQLAlchemyBase.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
