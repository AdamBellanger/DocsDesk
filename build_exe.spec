# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules

block_cipher = None

added_files = [
    ("config/.env.example", "config"),
    ("docdesk.ico",         "."),
    ("frontend_dist",       "frontend_dist"),
]

hidden = [
    "dotenv",
    "requests",
    "PIL", "PIL.Image",
    "flask", "flask.json", "werkzeug", "werkzeug.serving",
    "jinja2", "blinker", "click", "itsdangerous",
    "webview", "webview.platforms.winforms",
    "clr", "pythonnet",
    # modules locaux
    "bobdesk_client", "converter", "server",
]
hidden += collect_submodules("flask")
hidden += collect_submodules("webview")

a = Analysis(
    ["gui_app.py"],
    pathex=[str(Path(".").resolve())],
    binaries=[],
    datas=added_files,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["customtkinter", "tkinterdnd2", "pandas", "numpy"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="DocsDesk",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon="docdesk.ico",
)
