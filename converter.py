"""
Conversion de fichiers vers PDF.
- .docx / .doc / .xlsx / .xls : LibreOffice en mode headless (subprocess)
- images (jpg/jpeg/png/gif/bmp) : Pillow
- .pdf : copie directe

LibreOffice doit être installé sur le poste (non embarqué dans l'exe).
"""

import os
import shutil
import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

OFFICE_EXT = {".docx", ".doc", ".xlsx", ".xls", ".odt", ".ods", ".ppt", ".pptx"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".tif", ".webp"}
PDF_EXT = {".pdf"}
SUPPORTED_EXT = OFFICE_EXT | IMAGE_EXT | PDF_EXT

# Emplacements usuels de soffice.exe sous Windows
_SOFFICE_CANDIDATES = [
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
]

# Profil LibreOffice dédié à DocsDesk : isolé de l'installation de l'utilisateur.
# Évite les conflits de verrou (« soffice déjà lancé ») si LibreOffice est ouvert,
# et permet de régénérer proprement le profil après une mise à jour.
_LO_PROFILE_DIR = Path(os.environ.get("APPDATA", Path.home())) / "DocsDesk" / "lo_profile"

_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


class ConversionError(Exception):
    pass


def _user_install_arg() -> str:
    """Argument -env:UserInstallation pointant vers le profil dédié (URL file://)."""
    _LO_PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    uri = _LO_PROFILE_DIR.resolve().as_uri()
    return f"-env:UserInstallation={uri}"


def _registry_libreoffice() -> str | None:
    """Cherche soffice.exe via le registre Windows (installation standard)."""
    try:
        import winreg
    except ImportError:
        return None
    candidates = [
        # App Paths : valeur par défaut = chemin complet de soffice.exe
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\soffice.exe", None),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\soffice.exe", None),
        # InstallPath de LibreOffice : dossier program\
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\LibreOffice\UNO\InstallPath", None),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\LibreOffice\UNO\InstallPath", None),
    ]
    for hive, subkey, name in candidates:
        for view in (0, getattr(winreg, "KEY_WOW64_64KEY", 0), getattr(winreg, "KEY_WOW64_32KEY", 0)):
            try:
                with winreg.OpenKey(hive, subkey, 0, winreg.KEY_READ | view) as k:
                    val, _ = winreg.QueryValueEx(k, name)
                if not val:
                    continue
                p = Path(val)
                # InstallPath pointe vers le dossier program\ → on ajoute soffice.exe
                if p.is_dir():
                    p = p / "soffice.exe"
                if p.is_file():
                    return str(p)
            except OSError:
                continue
    return None


def _glob_program_files() -> str | None:
    """Parcourt Program Files à la recherche de LibreOffice*\\program\\soffice.exe."""
    roots = [
        os.environ.get("ProgramFiles", r"C:\Program Files"),
        os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
    ]
    for root in roots:
        if not root:
            continue
        try:
            for match in Path(root).glob("LibreOffice*/program/soffice.exe"):
                if match.is_file():
                    return str(match)
        except OSError:
            continue
    return None


def find_libreoffice() -> str | None:
    """Retourne le chemin de soffice(.exe) ou None si introuvable.
    Recherche : variable LIBREOFFICE_PATH, PATH, chemins usuels, registre Windows,
    puis balayage de Program Files."""
    env = os.environ.get("LIBREOFFICE_PATH")
    if env and Path(env).is_file():
        return env
    for name in ("soffice", "soffice.exe", "soffice.bin"):
        found = shutil.which(name)
        if found:
            return found
    for cand in _SOFFICE_CANDIDATES:
        if Path(cand).is_file():
            return cand
    found = _registry_libreoffice()
    if found:
        return found
    return _glob_program_files()


def is_supported(filename: str) -> bool:
    return Path(filename).suffix.lower() in SUPPORTED_EXT


def convert_to_pdf(input_path, output_dir) -> str:
    """Convertit `input_path` en PDF dans `output_dir`. Retourne le chemin du PDF.
    Lève ConversionError en cas d'échec."""
    src = Path(input_path)
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not src.is_file():
        raise ConversionError(f"Fichier introuvable : {src}")

    ext = src.suffix.lower()

    if ext in PDF_EXT:
        return _passthrough_pdf(src, out_dir)
    if ext in IMAGE_EXT:
        return _image_to_pdf(src, out_dir)
    if ext in OFFICE_EXT:
        return _office_to_pdf(src, out_dir)

    raise ConversionError(f"Format non pris en charge : {ext}")


# ── PDF : copie directe ───────────────────────────────────────────────────

def _passthrough_pdf(src: Path, out_dir: Path) -> str:
    dest = out_dir / src.name
    if dest.resolve() != src.resolve():
        shutil.copy(src, dest)
    logger.info("PDF copié : %s", src.name)
    return str(dest)


# ── Images : Pillow ───────────────────────────────────────────────────────

def _image_to_pdf(src: Path, out_dir: Path) -> str:
    try:
        from PIL import Image
    except ImportError as exc:
        raise ConversionError("Pillow n'est pas installé (pip install Pillow).") from exc

    dest = out_dir / (src.stem + ".pdf")
    try:
        img = Image.open(src)
        # PDF n'accepte pas l'alpha : on aplatit sur fond blanc
        if img.mode in ("RGBA", "LA", "P"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            rgba = img.convert("RGBA")
            background.paste(rgba, mask=rgba.split()[-1])
            img = background
        else:
            img = img.convert("RGB")
        img.save(dest, "PDF", resolution=150.0)
    except Exception as exc:
        raise ConversionError(f"Échec conversion image {src.name} : {exc}") from exc

    logger.info("Image convertie : %s → %s", src.name, dest.name)
    return str(dest)


# ── Office : LibreOffice headless ─────────────────────────────────────────

def warmup_libreoffice(timeout: int = 90) -> bool:
    """Préchauffe LibreOffice : initialise le profil dédié et termine.
    À appeler au démarrage de l'app (en arrière-plan) pour absorber la
    régénération du profil après une mise à jour, afin que la première vraie
    conversion ne plante pas. Retourne True si OK."""
    soffice = find_libreoffice()
    if not soffice:
        logger.warning(
            "LibreOffice non détecté — la conversion Word/Excel sera indisponible. "
            "Installez-le depuis libreoffice.org/download (images et PDF fonctionnent sans)."
        )
        return False
    cmd = [
        soffice, "--headless", "--invisible", "--nodefault", "--norestore",
        "--nolockcheck", "--nologo", _user_install_arg(), "--terminate_after_init",
    ]
    logger.info("LibreOffice détecté : %s", soffice)
    logger.info("Préchauffage de LibreOffice…")
    try:
        subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                       creationflags=_NO_WINDOW)
        logger.info("LibreOffice prêt.")
        return True
    except Exception as exc:
        logger.warning("Préchauffage LibreOffice : %s", exc)
        return False


def _run_soffice_convert(soffice: str, src: Path, out_dir: Path, timeout: int = 120):
    cmd = [
        soffice, "--headless", "--invisible", "--nodefault", "--norestore",
        "--nolockcheck", "--nologo", _user_install_arg(),
        "--convert-to", "pdf", "--outdir", str(out_dir), str(src),
    ]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                          creationflags=_NO_WINDOW)


def _office_to_pdf(src: Path, out_dir: Path) -> str:
    soffice = find_libreoffice()
    if not soffice:
        raise ConversionError(
            "LibreOffice n'est pas installé sur ce PC — requis pour convertir Word/Excel. "
            "Installez-le gratuitement depuis libreoffice.org/download puis relancez DocsDesk. "
            "(Les images et PDF fonctionnent sans LibreOffice.)"
        )

    dest = out_dir / (src.stem + ".pdf")
    last_detail = ""
    # 2 tentatives : la 1re peut échouer juste après une mise à jour
    # (régénération du profil) — la 2e aboutit alors sans réimport manuel.
    for attempt in (1, 2):
        logger.info("LibreOffice : conversion de %s… (tentative %d)", src.name, attempt)
        try:
            proc = _run_soffice_convert(soffice, src, out_dir)
        except subprocess.TimeoutExpired as exc:
            last_detail = "délai dépassé"
            logger.warning("Conversion %s : délai dépassé (tentative %d)", src.name, attempt)
            continue
        except Exception as exc:
            raise ConversionError(f"Échec lancement LibreOffice : {exc}") from exc

        if dest.is_file():
            logger.info("Document converti : %s → %s", src.name, dest.name)
            return str(dest)
        last_detail = (proc.stderr or proc.stdout or "").strip()[:300]
        logger.warning("Conversion %s échouée (tentative %d) : %s", src.name, attempt, last_detail)

    raise ConversionError(f"Conversion échouée pour {src.name}. {last_detail}")
