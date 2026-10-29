"""Alembic migration helpers for the AI-Study-Assistant backend.

Provides:
- ``run_migrations(target="head", database_url=None)``: bootstrap (stamp) +
  upgrade in one call.
- ``stamp_head()``: mark the current schema as fully migrated.
- ``current_revision()``: return the applied revision (or None).

The committed ``alembic.ini`` contains no credentials. The database URL is
always supplied at runtime, either from application settings or from an
explicit URL passed by the first-run setup flow.

Bootstrap logic (see docs before running against a live database — take a
backup first):

- Fresh database (no ``projects`` table): plain ``upgrade head`` creates
  ``projects``/``assets``/``chunks`` via the baseline revision and then applies
  ``001_add_material_fields``.
- Pre-existing database (tables already created manually, no alembic history):
  the baseline revision is stamped automatically, then ``001_add_material_fields``
  is stamped too when the material columns already exist. Only missing
  migrations are applied afterwards.
"""
import os
import sys
from pathlib import Path
from typing import Optional

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url

_BASE_DIR = Path(__file__).resolve().parent.parent  # src/ (or _MEIPASS when frozen)
_MINIRAG_DIR = _BASE_DIR / "models" / "db_schemes" / "minirag"
_ALEMBIC_DIR = _MINIRAG_DIR / "alembic"
_ALEMBIC_INI = _MINIRAG_DIR / "alembic.ini"

BASELINE_REVISION = "a599361d0859"
MATERIALIZED_REVISION = "001_add_material_fields"


def _load_env() -> None:
    try:
        from dotenv import load_dotenv
        load_dotenv(_BASE_DIR / ".env")
        load_dotenv()
    except Exception:
        pass


def _database_url(explicit: Optional[str] = None) -> str:
    """Resolve the SQLAlchemy URL used by Alembic.

    Precedence: explicit argument, ALEMBIC_DATABASE_URL/DATABASE_URL, then
    application settings (which read ``AISTUDY_*``/``MINIRAG_*`` env vars).
    """
    if explicit:
        return explicit

    _load_env()
    override = os.environ.get("ALEMBIC_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if override:
        return override

    from helpers.config import get_settings

    settings = get_settings()
    return URL.create(
        "postgresql+psycopg2",
        username=settings.POSTGRES_USERNAME,
        password=settings.POSTGRES_PASSWORD,
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        database=settings.POSTGRES_MAIN_DATABASE,
    ).render_as_string(hide_password=False)


def get_alembic_config(database_url: Optional[str] = None) -> Config:
    _load_env()
    cfg = Config(str(_ALEMBIC_INI))
    cfg.set_main_option("script_location", str(_ALEMBIC_DIR))
    cfg.set_main_option("prepend_sys_path", f"{_BASE_DIR}{os.pathsep}{_MINIRAG_DIR}")
    # Alembic's ConfigParser treats ``%`` specially.
    cfg.set_main_option("sqlalchemy.url", _database_url(database_url).replace("%", "%%"))
    return cfg


def _table_exists(engine, table_name: str) -> bool:
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT to_regclass(:name)"), {"name": table_name}
        ).scalar()
    return row is not None


def _column_exists(engine, table_name: str, column_name: str) -> bool:
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = :table AND column_name = :column"
            ),
            {"table": table_name, "column": column_name},
        ).scalar()
    return row is not None


def _alembic_version_present(engine) -> bool:
    return _table_exists(engine, "alembic_version")


def bootstrap_stamp(cfg: Config, database_url: Optional[str] = None) -> None:
    """Stamp history for databases whose schema was created outside Alembic."""
    engine = create_engine(_database_url(database_url))
    try:
        if not _table_exists(engine, "projects"):
            # Fresh database: nothing to stamp, upgrade will create everything.
            return

        if not _alembic_version_present(engine):
            command.stamp(cfg, BASELINE_REVISION)
            print(f"[migrations] Existing schema detected: stamped {BASELINE_REVISION}")

        if _column_exists(engine, "projects", "name") and \
           _column_exists(engine, "assets", "content_hash") and \
           _column_exists(engine, "chunks", "chunk_index"):
            # Material fields already present: ensure 001 is recorded.
            command.stamp(cfg, MATERIALIZED_REVISION)
            print(f"[migrations] Material fields detected: stamped {MATERIALIZED_REVISION}")
    finally:
        engine.dispose()


def run_migrations(target: str = "head", database_url: Optional[str] = None) -> None:
    """Bootstrap if needed, then upgrade to ``target`` (default: head)."""
    cfg = get_alembic_config(database_url)
    bootstrap_stamp(cfg, database_url)
    command.upgrade(cfg, target)


def stamp_head(database_url: Optional[str] = None) -> None:
    cfg = get_alembic_config(database_url)
    command.stamp(cfg, "head")


def current_revision(database_url: Optional[str] = None) -> Optional[str]:
    engine = create_engine(_database_url(database_url))
    try:
        if not _alembic_version_present(engine):
            return None
        with engine.connect() as conn:
            return conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
    finally:
        engine.dispose()


def verify_database_url(database_url: str) -> None:
    """Raise a ValueError for URLs that do not look like PostgreSQL URLs."""
    url = make_url(database_url)
    if not url.drivername.startswith("postgresql"):
        raise ValueError("Database URL must use a PostgreSQL driver.")


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "upgrade"
    if action == "upgrade":
        run_migrations(sys.argv[2] if len(sys.argv) > 2 else "head")
    elif action == "stamp":
        stamp_head()
    elif action == "current":
        print(current_revision())
    else:
        print(f"Unknown action: {action}")
        sys.exit(1)
