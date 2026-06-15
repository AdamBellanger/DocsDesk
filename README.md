# DocsDesk

Application locale de dépôt de documents dans **Bob! Desk**.
Glissez des fichiers (Word, Excel, images, PDF), DocsDesk les convertit en PDF
et les téléverse dans la section *documents* d'un client.

Même stack et même charte graphique que [TéléDesk](https://github.com/AdamBellanger/TeleDesk).

## Stack

- **Backend** : Python 3.11+, Flask (localhost:**7422**)
- **Conversion PDF** : LibreOffice (subprocess) pour `.docx` / `.xlsx`, Pillow pour les images, PDF passés directement
- **Frontend** : React + Tailwind CSS (Vite)
- **Fenêtre native** : pywebview
- **Packaging** : PyInstaller (`.exe` Windows autonome)

## Prérequis

- **LibreOffice** installé sur le poste (non embarqué dans l'exe).
  Au besoin, définir la variable `LIBREOFFICE_PATH` vers `soffice.exe`.
- Python 3.11+ et Node 18+ pour le développement.

## Développement

```bash
# Backend
pip install -r requirements.txt

# Frontend
cd frontend
npm install
npm run build      # génère ../frontend_dist consommé par Flask

# Lancer l'application (Flask + pywebview)
cd ..
python gui_app.py
```

En mode dev frontend (`npm run dev`), Vite proxifie `/api` vers `localhost:7422`.

## Build de l'exécutable

```bash
cd frontend && npm run build && cd ..
pyinstaller build_exe.spec
# → dist/DocsDesk.exe
```

## Configuration

Au premier lancement, un formulaire de connexion demande simplement **l'e-mail**
et le **mot de passe** Bob! Desk. L'interface est résolue automatiquement après
la connexion (via `/auth/me`). Les identifiants sont stockés localement (hors
dépôt Git) dans :

```
%APPDATA%\DocsDesk\.env
```

Les PDF convertis transitent par `%APPDATA%\DocsDesk\tmp\` puis sont supprimés
après l'upload. LibreOffice utilise un profil dédié dans
`%APPDATA%\DocsDesk\lo_profile` (isolé de votre installation).

## Reprendre le projet sur un autre PC

Rien de sensible n'est versionné (ni `.env`, ni `frontend_dist`, ni
`node_modules`). Après un `git clone` / `git pull` :

```bash
# 1. Dépendances Python
pip install -r requirements.txt

# 2. Frontend (génère frontend_dist/ requis par Flask)
cd frontend
npm install
npm run build
cd ..

# 3. Lancer
python gui_app.py
```

Au premier démarrage, saisissez e-mail + mot de passe dans le formulaire.
Assurez-vous que **LibreOffice** est installé sur ce poste.

## Formats acceptés

`.docx` · `.xlsx` · `.pdf` · `.jpg` · `.jpeg` · `.png` · `.gif` · `.bmp`

## API Flask

| Méthode | Endpoint | Rôle |
|---------|----------|------|
| GET  | `/api/init` | `{email, appdata_dir}` |
| GET  | `/api/credentials` | `{email, password}` |
| POST | `/api/save_credentials` | test connexion + sauvegarde `.env` |
| POST | `/api/search_clients` | `{query}` → `[{_id, name}]` |
| POST | `/api/upload` | `{client_id, files, dry_run}` → démarre le worker |
| GET  | `/api/logs` | `{lines, done, error, progress}` |
| POST | `/api/list_documents` | `{client_id}` → `[{_id, name, created_at}]` |
| POST | `/api/delete_document` | `{document_id}` → `{ok}` |
| GET  | `/api/open_appdata` | ouvre `%APPDATA%\DocsDesk` |

## Mode test (dry-run)

Le toggle **Mode test** simule l'ensemble du flux (conversion + appels) sans
rien écrire dans Bob! Desk.
