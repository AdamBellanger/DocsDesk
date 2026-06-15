"""
Client HTTP pour l'API Bob! Desk — variante DocsDesk (gestion des documents).
Auth : POST /auth/login -> cookie HttpOnly auth-production + header x-auth: ok + header client: interface_id
"""

import time
import logging
import mimetypes
import requests
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class BobDeskAPIError(Exception):
    def __init__(self, message: str, status_code: int = 0, response_body: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class BobDeskClient:
    def __init__(
        self,
        base_url: str,
        email: str,
        password: str,
        interface_id: str,
        timeout: int = 30,
        dry_run: bool = False,
    ):
        self.base_url = base_url.rstrip("/")
        self.email = email
        self.password = password
        self.interface_id = interface_id
        self.timeout = timeout
        self.dry_run = dry_run
        self.session = requests.Session()
        self.session.headers.update({
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json",
            "Origin": "https://app.bob-desk.com",
            "Referer": "https://app.bob-desk.com/",
        })
        self._login()

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------

    def _login(self):
        url = f"{self.base_url}/auth/login"
        payload = {
            "email": self.email,
            "password": self.password,
            "interface_id": self.interface_id,
        }
        logger.info("Connexion Bob! Desk (%s)...", self.email)
        try:
            resp = self.session.post(url, json=payload, timeout=self.timeout)
        except requests.RequestException as exc:
            raise BobDeskAPIError(f"Erreur réseau login: {exc}") from exc

        if resp.status_code == 401:
            raise BobDeskAPIError(
                "Login échoué (401) — vérifier BOBDESK_EMAIL / BOBDESK_PASSWORD",
                401, resp.text[:300],
            )
        if resp.status_code >= 400:
            raise BobDeskAPIError(
                f"Login échoué HTTP {resp.status_code}", resp.status_code, resp.text[:300]
            )

        # cookie auth-production stocké automatiquement dans self.session
        self.session.headers.update({
            "x-auth": "ok",
            "client": self.interface_id,
        })
        logger.info("Connecté.")

    # ------------------------------------------------------------------
    # HTTP interne
    # ------------------------------------------------------------------

    def _request(self, method: str, endpoint: str, **kwargs) -> dict:
        url = f"{self.base_url}{endpoint}"
        for attempt in range(1, 4):
            try:
                resp = self.session.request(method, url, timeout=self.timeout, **kwargs)
                if resp.status_code == 401 and attempt == 1:
                    logger.warning("Session expirée, reconnexion...")
                    self._login()
                    continue
                if resp.status_code == 429:
                    wait = int(resp.headers.get("Retry-After", 2 ** attempt))
                    logger.warning("Rate-limit, attente %ss", wait)
                    time.sleep(wait)
                    continue
                if resp.status_code >= 500:
                    logger.debug("Erreur serveur %s (tentative %s/3)", resp.status_code, attempt)
                    time.sleep(2 ** attempt)
                    continue
                if resp.status_code >= 400:
                    raise BobDeskAPIError(
                        f"HTTP {resp.status_code} {method} {url}",
                        resp.status_code, resp.text[:500],
                    )
                # Certaines routes (DELETE…) répondent en texte brut ("OK").
                if not resp.content:
                    return {}
                try:
                    return resp.json()
                except ValueError:
                    return {"ok": True, "raw": resp.text[:200]}
            except requests.RequestException as exc:
                if attempt == 3:
                    raise BobDeskAPIError(f"Erreur réseau: {exc}") from exc
                time.sleep(2 ** attempt)
        raise BobDeskAPIError(f"Échec après 3 tentatives: {url}")

    def _request_multipart(self, method: str, endpoint: str, files=None, data=None, params=None) -> dict:
        """Requête multipart/form-data.

        IMPORTANT : on force ``Content-Type: None`` dans les en-têtes de la requête.
        Mettre la valeur à None demande à *requests* de SUPPRIMER l'en-tête hérité
        de la session (``application/json``), sinon le merge session+requête le
        conserverait et le serveur tenterait un ``JSON.parse`` du corps multipart.
        requests régénère alors lui-même le boundary ``multipart/form-data``.
        """
        url = f"{self.base_url}{endpoint}"

        def _rewind():
            # En cas de réessai, on remet les flux de fichiers au début.
            for v in (files or {}).values():
                fh = v[1] if isinstance(v, (tuple, list)) else v
                if hasattr(fh, "seek"):
                    fh.seek(0)

        for attempt in range(1, 4):
            try:
                _rewind()
                resp = self.session.request(
                    method, url, headers={"Content-Type": None},
                    files=files, data=data, params=params, timeout=self.timeout,
                )
                if resp.status_code == 401 and attempt == 1:
                    logger.warning("Session expirée, reconnexion...")
                    self._login()
                    continue
                if resp.status_code == 429:
                    wait = int(resp.headers.get("Retry-After", 2 ** attempt))
                    logger.warning("Rate-limit, attente %ss", wait)
                    time.sleep(wait)
                    continue
                if resp.status_code >= 500:
                    logger.debug("Erreur serveur %s (tentative %s/3)", resp.status_code, attempt)
                    time.sleep(2 ** attempt)
                    continue
                if resp.status_code >= 400:
                    raise BobDeskAPIError(
                        f"HTTP {resp.status_code} {method} {url}",
                        resp.status_code, resp.text[:500],
                    )
                # Certaines routes (DELETE…) répondent en texte brut ("OK").
                if not resp.content:
                    return {}
                try:
                    return resp.json()
                except ValueError:
                    return {"ok": True, "raw": resp.text[:200]}
            except requests.RequestException as exc:
                if attempt == 3:
                    raise BobDeskAPIError(f"Erreur réseau: {exc}") from exc
                time.sleep(2 ** attempt)
        raise BobDeskAPIError(f"Échec après 3 tentatives: {url}")

    def _get_all_post(self, endpoint: str, body: Optional[dict] = None) -> list:
        """Pagination via POST (pattern Bob! Desk /xxx/list)."""
        results, page = [], 1
        while True:
            data = self._request("POST", endpoint, json={**(body or {}), "page": page, "per_page": 100})
            items = data.get("elements", data.get("data", data.get("items", [])))
            if not items:
                logger.debug("_get_all_post %s page %d: 0 éléments, clés disponibles: %s", endpoint, page, list(data.keys()) if isinstance(data, dict) else type(data))
                break
            results.extend(items)
            if len(items) < 100:
                break
            page += 1
        return results

    # ------------------------------------------------------------------
    # Clients
    # ------------------------------------------------------------------

    def search_clients(self, query: str) -> list[dict]:
        """Recherche de clients par nom (POST /clients/list {"search": ...}).
        Retourne [{_id, name, documents_tab_id}, ...].
        ``documents_tab_id`` est l'identifiant de l'onglet GED, requis pour
        lister/uploader les documents du client."""
        body = {"search": query} if query else {}
        elements = self._get_all_post("/clients/list", body)
        out = []
        for c in elements:
            out.append({
                "_id": c.get("_id") or c.get("id", ""),
                "name": c.get("name") or c.get("label") or c.get("company") or "(sans nom)",
                "documents_tab_id": c.get("documents_tab_id", ""),
            })
        return out

    def get_client_tab_id(self, client_id: str) -> str:
        """Récupère le documents_tab_id d'un client via GET /clients/{id}.
        Sert de repli si le frontend ne l'a pas transmis."""
        data = self._request("GET", f"/clients/{client_id}")
        el = data.get("element", data) if isinstance(data, dict) else {}
        return el.get("documents_tab_id", "") if isinstance(el, dict) else ""

    # ------------------------------------------------------------------
    # Documents (GED Bob! Desk)
    #
    # Contrat réel (préfixe = client_documents/{client_id}, tab = documents_tab_id) :
    #   Liste     GET    /client_documents/{cid}/tab/{tab_id}?search=&trash=
    #   Upload    POST   /client_documents/{cid}/upload/{tab_id}   multipart: file
    #   Corbeille DELETE /client_documents/{cid}/trash/{doc_id}
    #   Définitif DELETE /client_documents/{cid}/delete/{doc_id}
    #   Restaurer PUT    /client_documents/{cid}/restore/{doc_id}
    # ------------------------------------------------------------------

    def _client_prefix(self, client_id: str) -> str:
        return f"/client_documents/{client_id}"

    def get_client_documents(self, client_id: str, tab_id: str = "") -> list[dict]:
        """Liste les documents (non corbeille) de l'onglet GED du client.
        Retourne [{_id, name, created_at, size, mimetype}, ...]."""
        tab_id = tab_id or self.get_client_tab_id(client_id)
        if not tab_id:
            logger.warning("documents_tab_id introuvable pour le client %s.", client_id)
            return []
        data = self._request("GET", f"{self._client_prefix(client_id)}/tab/{tab_id}",
                             params={"search": ""})
        docs = data.get("documents", []) if isinstance(data, dict) else []
        return [self._doc_summary(d) for d in docs]

    @staticmethod
    def _doc_summary(d: dict) -> dict:
        return {
            "_id": d.get("_id", ""),
            "name": d.get("name") or d.get("s3_key") or "(document)",
            "created_at": d.get("created_at", ""),
            "size": d.get("size", 0),
            "mimetype": d.get("mimetype", ""),
        }

    def upload_document(self, client_id: str, tab_id: str, pdf_path, original_name: str,
                        dry_run: Optional[bool] = None) -> dict:
        """Upload un PDF dans l'onglet GED du client.
        POST multipart /client_documents/{cid}/upload/{tab_id} (champ ``file``).
        Retourne le document créé {_id, name, ...}, ou un stub en dry-run."""
        dry = self.dry_run if dry_run is None else dry_run
        path = Path(pdf_path)
        name = original_name or path.name
        if dry:
            logger.info("[DRY-RUN] upload %s (client %s, tab %s)", name, client_id, tab_id)
            return {"_id": "DRY_RUN", "name": name}

        tab_id = tab_id or self.get_client_tab_id(client_id)
        if not tab_id:
            raise BobDeskAPIError(f"documents_tab_id introuvable pour le client {client_id}")

        mime = mimetypes.guess_type(name)[0] or "application/pdf"
        endpoint = f"{self._client_prefix(client_id)}/upload/{tab_id}"
        with open(path, "rb") as f:
            files = {"file": (name, f, mime)}
            res = self._request_multipart("POST", endpoint, files=files)

        docs = res.get("documents", []) if isinstance(res, dict) else []
        doc = docs[0] if docs else (res if isinstance(res, dict) else {})
        logger.info("✓ Upload : %s", name)
        return self._doc_summary(doc) if doc else {"_id": "", "name": name}

    def delete_document(self, client_id: str, document_id: str,
                        permanent: bool = False, dry_run: Optional[bool] = None) -> bool:
        """Supprime un document. Par défaut → corbeille (récupérable).
        permanent=True → suppression définitive."""
        dry = self.dry_run if dry_run is None else dry_run
        action = "delete" if permanent else "trash"
        if dry:
            logger.info("[DRY-RUN] %s document %s", action, document_id)
            return True
        try:
            self._request("DELETE", f"{self._client_prefix(client_id)}/{action}/{document_id}")
            return True
        except BobDeskAPIError as exc:
            logger.warning("Suppression document échouée %s : %s", document_id, exc)
            return False
