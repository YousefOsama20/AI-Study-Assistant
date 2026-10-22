# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the bundled Windows backend.

Build from the frontend directory with:

    python -m PyInstaller --noconfirm --clean ^
      --distpath build/backend --workpath build/pyinstaller scripts/backend.spec
"""
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

FRONTEND = Path(SPECPATH).resolve().parent
REPO = FRONTEND.parent
SRC = REPO / "src"

hiddenimports = [
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
    "asyncpg",
    "psycopg2",
    "greenlet",
    "alembic",
    "pgvector",
    "sqlalchemy.dialects.postgresql.asyncpg",
    "sqlalchemy.dialects.postgresql.psycopg2",
    "stores.llm.templates.locales.en.rag",
    "stores.llm.templates.locales.ar.rag",
]
for package in (
    "uvicorn",
    "stores",
    "controllers",
    "routes",
    "models",
    "helpers",
    "alembic",
):
    hiddenimports += collect_submodules(package)

datas = [
    (
        str(SRC / "models" / "db_schemes" / "minirag" / "alembic"),
        "models/db_schemes/minirag/alembic",
    ),
    (
        str(SRC / "models" / "db_schemes" / "minirag" / "alembic.ini"),
        "models/db_schemes/minirag",
    ),
    # TemplateParser checks the locale directory on disk before importing,
    # so the locale packages must exist outside the PYZ archive.
    (
        str(SRC / "stores" / "llm" / "templates" / "locales"),
        "stores/llm/templates/locales",
    ),
]

a = Analysis(
    [str(SRC / "main.py")],
    pathex=[str(SRC)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="MiniRAGBackend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(FRONTEND / "assets" / "icon.ico"),
)
