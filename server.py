"""
Backend Flask — sert l'API consommée par le frontend React de DocsDesk.
Tourne sur localhost:7422, lancé par gui_app.py via threading.

Rôle : convertir des fichiers (Word, Excel, images, PDF) en PDF puis les
uploader dans la section « documents » d'un client Bob! Desk.
"""

import logging
import os
import queue
import shutil
import subprocess
import sys
import threading
import uuid
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

sys.path.insert(0, str(Path(__file__).parent))
from bobdesk_client import BobDeskClient, BobDeskAPIError
from converter import convert_to_pdf, is_supported, ConversionError, warmup_libreoffice

# ── Chemins ───────────────────────────────────────────────────────────────
_BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))

_APPDATA = Path(os.environ.get("APPDATA", Path.home())) / "DocsDesk"
_APPDATA.mkdir(parents=True, exist_ok=True)
ENV_PATH = _APPDATA / ".env"

TMP_DIR = _APPDATA / "tmp"
TMP_DIR.mkdir(parents=True, exist_ok=True)
INCOMING_DIR = TMP_DIR / "incoming"   # fichiers reçus du frontend, avant conversion
INCOMING_DIR.mkdir(parents=True, exist_ok=True)

# Copie le template .env.example au premier lancement
_template = _BASE / "config" / ".env.example"
if not ENV_PATH.exists() and _template.exists():
    shutil.copy(_template, ENV_PATH)

load_dotenv(dotenv_path=ENV_PATH, override=True)

# ── État global de l'upload ───────────────────────────────────────────────
_log_queue: queue.Queue = queue.Queue()
_upload_done = False
_upload_error = ""
_upload_progress: dict = {"current": 0, "total": 0}

DIST = _BASE / "frontend_dist"
app = Flask(__name__, static_folder=str(DIST), static_url_path="")
log = logging.getLogger("werkzeug")
log.setLevel(logging.ERROR)


# ── Logging vers la queue ─────────────────────────────────────────────────
class _QueueHandler(logging.Handler):
    def emit(self, record):
        fmt = logging.Formatter("%(asctime)s  %(levelname)-8s  %(message)s",
                                datefmt="%H:%M:%S").format(record)
        _log_queue.put(fmt)


_qh = _QueueHandler()
logging.getLogger().setLevel(logging.INFO)
logging.getLogger().addHandler(_qh)
logger = logging.getLogger("docsdesk")

# Préchauffe LibreOffice en arrière-plan dès le démarrage : la 1re conversion
# après une mise à jour ne plantera pas (régénération du profil déjà absorbée).
threading.Thread(target=warmup_libreoffice, daemon=True).start()


def _make_client(dry_run: bool = False, timeout: int | None = None) -> BobDeskClient:
    return BobDeskClient(
        base_url=os.getenv("BOBDESK_BASE_URL", "https://prod-api.bob-desk.com/api"),
        email=os.getenv("BOBDESK_EMAIL", ""),
        password=os.getenv("BOBDESK_PASSWORD", ""),
        interface_id=os.getenv("BOBDESK_INTERFACE_ID", ""),
        timeout=timeout if timeout is not None else int(os.getenv("HTTP_TIMEOUT", "30")),
        dry_run=dry_run,
    )


# ── Routes statiques ──────────────────────────────────────────────────────

@app.get("/")
def index():
    return send_from_directory(str(DIST), "index.html")


# ── Init / credentials ────────────────────────────────────────────────────

@app.get("/api/init")
def api_init():
    return jsonify({
        "email": os.getenv("BOBDESK_EMAIL", ""),
        "appdata_dir": str(_APPDATA),
    })


@app.get("/api/credentials")
def api_credentials():
    return jsonify({
        "email": os.getenv("BOBDESK_EMAIL", ""),
        "password": os.getenv("BOBDESK_PASSWORD", ""),
        "interface_id": os.getenv("BOBDESK_INTERFACE_ID", ""),
    })


@app.post("/api/save_credentials")
def api_save_credentials():
    data = request.json
    email = data.get("email", "").strip()
    password = data.get("password", "").strip()
    # L'interface_id est facultatif : résolu automatiquement après login.
    iface = data.get("interface_id", "").strip()

    try:
        bob = BobDeskClient(
            base_url=os.getenv("BOBDESK_BASE_URL", "https://prod-api.bob-desk.com/api"),
            email=email, password=password, interface_id=iface, timeout=10,
        )
        # interface_id réellement utilisé (résolu via /auth/me si non fourni)
        iface = bob.interface_id
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)})

    # Crée le .env s'il n'existe pas encore
    if not ENV_PATH.exists():
        ENV_PATH.write_text(
            "BOBDESK_BASE_URL=https://prod-api.bob-desk.com/api\n"
            "BOBDESK_EMAIL=\nBOBDESK_PASSWORD=\nBOBDESK_INTERFACE_ID=\n"
            "HTTP_TIMEOUT=30\nLOG_LEVEL=INFO\n",
            encoding="utf-8",
        )

    env_lines = ENV_PATH.read_text(encoding="utf-8").splitlines()
    updates = {
        "BOBDESK_EMAIL": email,
        "BOBDESK_PASSWORD": password,
        "BOBDESK_INTERFACE_ID": iface,
    }
    new_lines, written = [], set()
    for line in env_lines:
        key = line.split("=")[0].strip()
        if key in updates:
            new_lines.append(f"{key}={updates[key]}")
            written.add(key)
        else:
            new_lines.append(line)
    for k, v in updates.items():
        if k not in written:
            new_lines.append(f"{k}={v}")
    ENV_PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    os.environ["BOBDESK_EMAIL"] = email
    os.environ["BOBDESK_PASSWORD"] = password
    os.environ["BOBDESK_INTERFACE_ID"] = iface
    return jsonify({"ok": True})


# ── Clients ───────────────────────────────────────────────────────────────

@app.post("/api/search_clients")
def api_search_clients():
    query = (request.json or {}).get("query", "").strip()
    try:
        client = _make_client(timeout=15)
        results = client.search_clients(query)
        return jsonify(results[:25])
    except BobDeskAPIError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        logger.error("search_clients: %s", exc)
        return jsonify({"error": str(exc)}), 500


# ── Documents existants ───────────────────────────────────────────────────

@app.post("/api/list_documents")
def api_list_documents():
    data = request.json or {}
    client_id = data.get("client_id", "").strip()
    tab_id = data.get("tab_id", "").strip()
    if not client_id:
        return jsonify([])
    try:
        client = _make_client(timeout=20)
        docs = client.get_client_documents(client_id, tab_id)
        return jsonify(docs)
    except Exception as exc:
        logger.error("list_documents: %s", exc)
        return jsonify({"error": str(exc)}), 500


@app.post("/api/delete_document")
def api_delete_document():
    data = request.json or {}
    client_id = data.get("client_id", "").strip()
    document_id = data.get("document_id", "").strip()
    permanent = data.get("permanent", False)
    dry_run = data.get("dry_run", False)
    if not client_id or not document_id:
        return jsonify({"ok": False, "error": "client_id ou document_id manquant"}), 400
    try:
        client = _make_client(dry_run=dry_run, timeout=20)
        ok = client.delete_document(client_id, document_id, permanent=permanent)
        return jsonify({"ok": ok})
    except Exception as exc:
        logger.error("delete_document: %s", exc)
        return jsonify({"ok": False, "error": str(exc)}), 500


# ── Upload (worker thread) ────────────────────────────────────────────────

@app.post("/api/upload")
def api_upload():
    global _upload_done, _upload_error, _upload_progress
    _upload_done = False
    _upload_error = ""
    _upload_progress = {"current": 0, "total": 0}
    while not _log_queue.empty():
        try:
            _log_queue.get_nowait()
        except queue.Empty:
            break

    # Le frontend envoie les fichiers en multipart (contenu, pas chemin disque).
    client_id = request.form.get("client_id", "").strip()
    tab_id = request.form.get("tab_id", "").strip()
    dry_run = request.form.get("dry_run", "false").lower() == "true"
    uploaded = request.files.getlist("files")

    if not client_id:
        return jsonify({"ok": False, "error": "Aucun client sélectionné."}), 400
    if not uploaded:
        return jsonify({"ok": False, "error": "Aucun fichier à traiter."}), 400

    # Enregistre chaque fichier reçu dans un dossier temp avec un nom unique.
    staged = []
    for fs in uploaded:
        orig_name = Path(fs.filename or "fichier").name
        dest = INCOMING_DIR / f"{uuid.uuid4().hex}_{orig_name}"
        fs.save(str(dest))
        staged.append({"path": str(dest), "name": orig_name})

    threading.Thread(
        target=_worker, args=(client_id, tab_id, staged, dry_run), daemon=True,
    ).start()
    return jsonify({"ok": True})


@app.get("/api/logs")
def api_logs():
    lines = []
    while True:
        try:
            lines.append(_log_queue.get_nowait())
        except queue.Empty:
            break
    return jsonify({
        "lines": lines,
        "done": _upload_done,
        "error": _upload_error or None,
        "progress": _upload_progress,
    })


@app.get("/api/open_appdata")
def api_open_appdata():
    _APPDATA.mkdir(parents=True, exist_ok=True)
    subprocess.Popen(["explorer", str(_APPDATA)])
    return jsonify({"ok": True})


# ── Worker upload ─────────────────────────────────────────────────────────

def _worker(client_id, tab_id, files, dry_run):
    global _upload_done, _upload_error, _upload_progress
    try:
        bob = _make_client(dry_run=dry_run)

        if dry_run:
            logger.info("━" * 50)
            logger.info("MODE DRY-RUN — aucun document écrit dans Bob! Desk")
            logger.info("━" * 50)

        # Résout le documents_tab_id si le frontend ne l'a pas transmis
        if not tab_id and not dry_run:
            tab_id = bob.get_client_tab_id(client_id)

        _upload_progress["total"] = len(files)
        _upload_progress["current"] = 0

        for f in files:
            src_path = f.get("path", "")
            name = f.get("name") or Path(src_path).name
            _upload_progress["current"] += 1
            idx = _upload_progress["current"]
            total = _upload_progress["total"]

            if not src_path or not Path(src_path).is_file():
                logger.error("✗ [%d/%d] Fichier introuvable : %s", idx, total, name)
                continue
            if not is_supported(name):
                logger.error("✗ [%d/%d] Format non pris en charge : %s", idx, total, name)
                continue

            pdf_path = None
            try:
                logger.info("⏳ [%d/%d] Conversion : %s", idx, total, name)
                pdf_path = convert_to_pdf(src_path, TMP_DIR)

                pdf_display = Path(name).stem + ".pdf"
                logger.info("⬆ [%d/%d] Upload : %s", idx, total, pdf_display)
                bob.upload_document(client_id, tab_id, pdf_path, pdf_display, dry_run=dry_run)
                logger.info("✓ [%d/%d] Terminé : %s", idx, total, pdf_display)

            except ConversionError as exc:
                logger.error("✗ [%d/%d] Conversion %s : %s", idx, total, name, exc)
            except BobDeskAPIError as exc:
                logger.error("✗ [%d/%d] Upload %s : %s", idx, total, name, exc)
            except Exception as exc:
                logger.error("✗ [%d/%d] Erreur %s : %s", idx, total, name, exc)
            finally:
                # Nettoyage : PDF converti + fichier source reçu (dossier incoming).
                # On ne supprime que ce qui se trouve sous notre dossier temp.
                for tmp in {pdf_path, src_path}:
                    if not tmp:
                        continue
                    try:
                        p = Path(tmp)
                        if p.is_file() and TMP_DIR in p.parents:
                            p.unlink(missing_ok=True)
                    except Exception:
                        pass

        logger.info("Terminé — %d fichier(s) traité(s).", len(files))
        _upload_done = True

    except Exception as exc:
        logger.error("Erreur : %s", exc, exc_info=True)
        _upload_error = str(exc)
        _upload_done = True


def run(port=7422):
    app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False)
