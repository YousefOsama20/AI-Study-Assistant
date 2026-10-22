"""Alembic migration helpers for the Mini-RAG backend.

Provides:
- ``run_migrations(target="head")``: bootstrap (stamp) + upgrade in one call.
- ``stamp_head()``: mark the current schema as fully migrated.
- ``current_revision()``: return the applied revision (or None).

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

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

_BASE_DIR = Path(__file__).resolve().parent.parent  # src/
_MINIRAG_DIR = _BASE_DIR / "models" / "db_schemes" / "minirag"
_ALEMBIC_DIR = _MINIRAG_DIR / "alembic"
_ALEMBIC_INI = _MINIRAG_DIR / "alembic.ini"

BASELINE_REVISION = "a599361d0859"
MATERIALIZED_REVISION = "001_add_material_fields"


def _load_env() -> None:
    try:
        from dotenv import load_dotenv
        load_dotenv(_BASE_DIR / ".env")
    except Exception:
        pass


def _database_url() -> str:
    explicit = os.environ.get("ALEMBIC_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if explicit:
        return explicit

    username = os.environ.get("POSTGRES_USERNAME", "")
    password = os.environ.get("POSTGRES_PASSWORD", "")
    host = os.environ.get("POSTGRES_HOST", "localhost")
    port = os.environ.get("POSTGRES_PORT", "5432")
    database = os.environ.get("POSTGRES_MAIN_DATABASE", "minirag")
    return f"postgresql+psycopg2://{username}:{password}@{host}:{port}/{database}"


def get_alembic_config() -> Config:
    _load_env()
    cfg = Config(str(_ALEMBIC_INI))
    cfg.set_main_option("script_location", str(_ALEMBIC_DIR))
    cfg.set_main_option("prepend_sys_path", f"{_BASE_DIR}{os.pathsep}{_MINIRAG_DIR}")
    cfg.set_main_option("sqlalchemy.url", _database_url().replace("%", "%%"))
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


def bootstrap_stamp(cfg: Config) -> None:
    """Stamp history for databases whose schema was created outside Alembic."""
    engine = create_engine(_database_url())
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


def run_migrations(target: str = "head") -> None:
    """Bootstrap if needed, then upgrade to ``target`` (default: head)."""
    cfg = get_alembic_config()
    bootstrap_stamp(cfg)
    command.upgrade(cfg, target)


def stamp_head() -> None:
    cfg = get_alembic_config()
    command.stamp(cfg, "head")


def current_revision() -> str | None:
    engine = create_engine(_database_url())
    try:
        if not _alembic_version_present(engine):
            return None
        with engine.connect() as conn:
            return conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
    finally:
        engine.dispose()


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
