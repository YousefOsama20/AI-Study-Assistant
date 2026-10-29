"""Database provisioning helpers for the first-run setup wizard.

All functions are synchronous and are called from FastAPI routes through
``asyncio.to_thread``. Errors are translated into actionable, credential-free
messages before they reach the renderer.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

import psycopg2
from psycopg2 import sql
from sqlalchemy.engine import URL

_DB_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,62}$")
_USERNAME_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}$")
_HOST_RE = re.compile(r"^[A-Za-z0-9._:-]{1,255}$")
_MAINTENANCE_DATABASES = ("postgres", "template1")


class DatabaseSetupError(ValueError):
    """Validation or provisioning failure with a safe, user-facing message."""

    def __init__(self, message: str, *, code: str = "database_error"):
        super().__init__(message)
        self.message = message
        self.code = code


@dataclass(frozen=True)
class DatabaseConfig:
    host: str = "127.0.0.1"
    port: int = 5432
    database: str = "ai_study_assistant"
    username: str = "postgres"
    password: str = ""

    def validated(self) -> "DatabaseConfig":
        host = (self.host or "").strip()
        username = (self.username or "").strip()
        database = (self.database or "").strip()

        if not _HOST_RE.match(host):
            raise DatabaseSetupError(
                "Enter a valid host name or IP address (no spaces or slashes).",
                code="invalid_host",
            )
        try:
            port = int(self.port)
        except (TypeError, ValueError):
            raise DatabaseSetupError("Port must be a number.", code="invalid_port")
        if not 1 <= port <= 65535:
            raise DatabaseSetupError(
                "Port must be between 1 and 65535.", code="invalid_port"
            )
        if not _USERNAME_RE.match(username):
            raise DatabaseSetupError(
                "Enter a valid PostgreSQL user name.", code="invalid_username"
            )
        if not _DB_NAME_RE.match(database):
            raise DatabaseSetupError(
                "Database name must start with a letter or underscore and contain "
                "only letters, numbers, and underscores.",
                code="invalid_database",
            )

        return DatabaseConfig(
            host=host,
            port=port,
            database=database,
            username=username,
            password=self.password or "",
        )


def build_url(config: DatabaseConfig, driver: str = "postgresql+psycopg2") -> str:
    return URL.create(
        driver,
        username=config.username,
        password=config.password,
        host=config.host,
        port=config.port,
        database=config.database,
        query={"connect_timeout": "10"},
    ).render_as_string(hide_password=False)


def _connect(config: DatabaseConfig, database: Optional[str] = None):
    return psycopg2.connect(
        host=config.host,
        port=config.port,
        dbname=database or config.database,
        user=config.username,
        password=config.password,
        connect_timeout=5,
        application_name="AI-Study-Assistant setup",
    )


def _friendly_error(exc: BaseException) -> tuple[str, str]:
    """Map database exceptions to (code, message) without leaking credentials."""
    text = str(exc).lower()

    if "password authentication failed" in text or "authentication failed" in text:
        return (
            "auth_failed",
            "Authentication failed. Check the user name and password.",
        )
    if "could not translate host name" in text or "name or service not known" in text:
        return (
            "host_not_found",
            "The database host could not be resolved. Check the host name.",
        )
    if "connection refused" in text or "could not connect" in text:
        return (
            "connection_refused",
            "Could not connect to PostgreSQL. Make sure the database is running "
            "and the host and port are correct.",
        )
    if "timeout" in text or "timed out" in text:
        return (
            "timeout",
            "The connection timed out. Make sure the database is running and reachable.",
        )
    if "does not exist" in text and "database" in text:
        return ("database_missing", "The database does not exist yet.")
    if "permission denied" in text:
        return (
            "permission_denied",
            "The database user does not have permission for this operation. "
            "Use a role that can create the database and the vector extension.",
        )
    if "extension" in text and "vector" in text:
        return (
            "vector_extension_failed",
            "The pgvector extension could not be enabled. Install pgvector or use "
            "a PostgreSQL image that includes it.",
        )
    if "no such file or directory" in text:
        return (
            "database_unavailable",
            "The database server could not be reached. Is the container running?",
        )
    return ("database_error", f"Database error ({exc.__class__.__name__}).")


def _vector_status(conn) -> tuple[bool, bool, Optional[str]]:
    available = False
    installed = False
    version = None
    with conn.cursor() as cur:
        cur.execute(
            "SELECT default_version FROM pg_available_extensions WHERE name = 'vector'"
        )
        row = cur.fetchone()
        if row is not None:
            available = True
            version = row[0]
        cur.execute("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
        installed = cur.fetchone() is not None
    return available, installed, version


def test_connection(config: DatabaseConfig) -> dict:
    """Test reachability and pgvector availability without changing anything."""
    config = config.validated()

    server_reachable = False
    database_exists = False
    vector_available = False
    vector_installed = False
    vector_version = None
    server_version = None
    message = "Connection successful."

    try:
        with _connect(config) as conn:
            conn.autocommit = True
            server_reachable = True
            database_exists = True
            with conn.cursor() as cur:
                cur.execute("SHOW server_version")
                row = cur.fetchone()
                server_version = row[0] if row else None
            vector_available, vector_installed, vector_version = _vector_status(conn)
    except Exception as exc:
        code, message = _friendly_error(exc)
        if code == "database_missing":
            # The server responded, but the selected database is absent.
            server_reachable, database_exists, vector_available = _probe_maintenance(config)

    return {
        "ok": database_exists and server_reachable,
        "server_reachable": server_reachable,
        "database_exists": database_exists,
        "vector_available": vector_available,
        "vector_installed": vector_installed,
        "vector_version": vector_version,
        "server_version": server_version,
        "message": message,
    }


def _probe_maintenance(config: DatabaseConfig) -> tuple[bool, bool, bool]:
    """Check server reachability and pgvector availability via another database."""
    for maintenance_db in _MAINTENANCE_DATABASES:
        try:
            with _connect(config, maintenance_db) as conn:
                conn.autocommit = True
                available, _, _ = _vector_status(conn)
                return True, False, available
        except Exception:
            continue
    return False, False, False


def initialize_database(
    config: DatabaseConfig,
    *,
    create_database: bool = True,
    run_migrations: bool = True,
) -> dict:
    """Create the database if needed, enable pgvector, and apply migrations."""
    config = config.validated()

    created_database = False
    database_existed = False
    extension_created = False
    migrations_applied = False
    revision = None
    message = "Database initialized."

    try:
        with _connect(config) as conn:
            conn.autocommit = True
            database_existed = True
    except Exception as exc:
        code, failure = _friendly_error(exc)
        if code != "database_missing":
            raise DatabaseSetupError(failure, code=code)

        if not create_database:
            raise DatabaseSetupError(
                "The database does not exist. Enable database creation or create it manually.",
                code="database_missing",
            )

        created_database = _create_database(config)

    try:
        with _connect(config) as conn:
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
            extension_created = True
    except Exception as exc:
        code, failure = _friendly_error(exc)
        raise DatabaseSetupError(failure, code=code)

    if run_migrations:
        try:
            from helpers.migrations import current_revision, run_migrations as apply_migrations

            apply_migrations("head", build_url(config))
            migrations_applied = True
            revision = current_revision(build_url(config))
        except Exception as exc:
            code, failure = _friendly_error(exc)
            raise DatabaseSetupError(
                f"The database is reachable but schema migration failed: {failure}",
                code="migration_failed",
            )

    return {
        "ok": True,
        "created_database": created_database,
        "database_existed": database_existed,
        "extension_created": extension_created,
        "migrations_applied": migrations_applied,
        "revision": revision,
        "message": message,
    }


def _create_database(config: DatabaseConfig) -> bool:
    last_error: Optional[BaseException] = None
    for maintenance_db in _MAINTENANCE_DATABASES:
        try:
            with _connect(config, maintenance_db) as conn:
                conn.autocommit = True
                with conn.cursor() as cur:
                    cur.execute(
                        sql.SQL("CREATE DATABASE {}").format(
                            sql.Identifier(config.database)
                        )
                    )
            return True
        except psycopg2.errors.DuplicateDatabase:
            return False
        except Exception as exc:
            last_error = exc
            text = str(exc).lower()
            # Another maintenance database may be available.
            if "does not exist" in text or "permission denied" in text:
                continue
            break

    if last_error is not None:
        code, failure = _friendly_error(last_error)
        raise DatabaseSetupError(failure, code=code)
    raise DatabaseSetupError(
        "Could not connect to a maintenance database to create the application database.",
        code="database_unavailable",
    )
