"""
Point d'entrée DocsDesk — lance Flask en thread puis ouvre pywebview.
"""

import ctypes
import sys
import threading
import time
from pathlib import Path

try:
    ctypes.windll.shcore.SetProcessDpiAwareness(1)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

_BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))

import server

threading.Thread(target=lambda: server.run(port=7422), daemon=True).start()
time.sleep(0.8)

import webview


class Api:
    def browse_files(self):
        """Ouvre un dialogue de sélection multi-fichiers. Retourne une liste de chemins."""
        result = window.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=True,
            file_types=(
                'Documents (*.docx;*.xlsx;*.pdf;*.jpg;*.jpeg;*.png;*.gif;*.bmp)',
                'All files (*.*)',
            ),
        )
        return list(result) if result else []


api_obj = Api()

window = webview.create_window(
    "DocsDesk — Documents Bob! Desk",
    url="http://127.0.0.1:7422/",
    width=1200,
    height=780,
    min_size=(1000, 680),
    resizable=True,
    js_api=api_obj,
)

webview.start(debug=False)
