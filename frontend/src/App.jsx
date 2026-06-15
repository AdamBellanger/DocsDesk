import { useState, useEffect, useRef, useCallback } from 'react'
import './index.css'

const api = async (path, body) => {
  const r = await fetch(`/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  return r.json()
}

const ACCEPT = '.docx,.xlsx,.jpg,.jpeg,.png,.gif,.bmp,.pdf'
const ACCEPT_RE = /\.(docx|xlsx|jpe?g|png|gif|bmp|pdf)$/i

// ── Theme ─────────────────────────────────────────────────────────────────
function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') !== 'light')
  useEffect(() => {
    document.documentElement.classList.toggle('light', !dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])
  return [dark, setDark]
}

// ── StatCard ──────────────────────────────────────────────────────────────
function StatCard({ value, label, color }) {
  const bars = { green: 'bg-emerald-500', amber: 'bg-amber-500', slate: 'bg-slate-400', red: 'bg-red-500' }
  const nums = { green: 'text-emerald-500', amber: 'text-amber-500', slate: 'text-slate-400', red: 'text-red-500' }
  return (
    <div className="flex-1 min-w-0 rounded-lg overflow-hidden border transition-colors duration-200"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <div className={`h-[2px] ${bars[color]}`} />
      <div className="px-4 py-3">
        <div className={`text-2xl font-bold tabular-nums ${nums[color]}`}>{value}</div>
        <div className="text-[10px] font-semibold mt-1 uppercase tracking-widest" style={{ color: 'var(--text3)' }}>{label}</div>
      </div>
    </div>
  )
}

// ── Toggle ────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)}
      className="relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none cursor-pointer shrink-0"
      style={{ background: checked ? 'var(--accent)' : 'var(--border2)' }}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`}
        style={{ background: 'white' }} />
    </button>
  )
}

// ── LogLine ───────────────────────────────────────────────────────────────
function LogLine({ line }) {
  let style = { color: 'var(--text2)' }
  if (/ERROR|Erreur|✗/i.test(line))        style = { color: '#f87171' }
  else if (/WARN/i.test(line))             style = { color: '#fbbf24' }
  else if (/Terminé|✓/i.test(line))        style = { color: '#34d399' }
  return <div className="font-mono text-[11px] leading-5 whitespace-pre-wrap break-all" style={style}>{line}</div>
}

// ── File status icon ──────────────────────────────────────────────────────
const STATUS = {
  pending:    { label: 'En attente', color: 'var(--text3)', icon: '•' },
  converting: { label: 'Conversion', color: '#fbbf24',      icon: '⏳' },
  uploading:  { label: 'Upload',     color: '#60a5fa',      icon: '⬆' },
  success:    { label: 'Succès',     color: '#34d399',      icon: '✓' },
  error:      { label: 'Erreur',     color: '#f87171',      icon: '✗' },
}

function FileRow({ f, onRemove }) {
  const st = STATUS[f.status] || STATUS.pending
  const ext = (f.name.split('.').pop() || '').toUpperCase()
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors duration-150"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border tracking-wider shrink-0"
        style={{ color: 'var(--text3)', borderColor: 'var(--border2)' }}>{ext}</span>
      <span className="flex-1 min-w-0 truncate text-sm" style={{ color: 'var(--text)' }}>{f.name}</span>
      <span className="text-[11px] flex items-center gap-1.5 shrink-0" style={{ color: st.color }}>
        {f.status === 'converting' || f.status === 'uploading' ? (
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        ) : <span>{st.icon}</span>}
        {st.label}
      </span>
      {f.status === 'pending' && (
        <button onClick={onRemove} className="shrink-0 text-xs cursor-pointer transition-colors"
          style={{ color: 'var(--text3)' }}
          onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}>✕</button>
      )}
    </div>
  )
}

// ── DropZone ──────────────────────────────────────────────────────────────
// On transmet directement les objets File (leur CONTENU est accessible en JS),
// sans dépendre du chemin disque — ce qui rend le glisser-déposer fiable dans
// la webview comme dans un navigateur.
function DropZone({ disabled, onFiles }) {
  const [drag, setDrag] = useState(false)

  const handleBrowse = () => {
    if (disabled) return
    document.getElementById('file-input').click()
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDrag(false)
    if (disabled) return
    const list = Array.from(e.dataTransfer.files || [])
    if (list.length) onFiles(list)
  }, [disabled, onFiles])

  return (
    <>
      <input id="file-input" type="file" accept={ACCEPT} multiple className="hidden"
        onChange={e => {
          const list = Array.from(e.target.files || [])
          if (list.length) onFiles(list)
          e.target.value = ''
        }} />
      <div
        onDragOver={e => { e.preventDefault(); if (!disabled) setDrag(true) }}
        onDragLeave={e => { e.preventDefault(); setDrag(false) }}
        onDrop={handleDrop}
        onClick={handleBrowse}
        className="flex flex-col items-center justify-center h-32 rounded-xl border transition-all duration-150 select-none"
        style={{
          background: drag ? 'color-mix(in srgb, var(--accent) 6%, var(--bg))' : 'var(--bg)',
          borderColor: drag ? 'var(--accent)' : 'var(--border)',
          borderStyle: drag ? 'solid' : 'dashed',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <div className="flex flex-col items-center gap-2 pointer-events-none">
          <svg className="w-7 h-7 transition-colors" style={{ color: drag ? 'var(--accent)' : 'var(--muted)' }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <div className="text-sm" style={{ color: 'var(--text2)' }}>Glissez vos fichiers ici ou cliquez pour parcourir</div>
          <div className="text-xs" style={{ color: 'var(--text3)' }}>Word · Excel · Images · PDF → convertis en PDF</div>
        </div>
      </div>
    </>
  )
}

// ── ClientSearch ──────────────────────────────────────────────────────────
function ClientSearch({ selected, onSelect }) {
  const [query, setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen]     = useState(false)
  const [loading, setLoading] = useState(false)
  const timer = useRef()

  useEffect(() => {
    if (selected || query.trim().length < 2) { setResults([]); return }
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setLoading(true)
      const res = await api('/search_clients', { query: query.trim() })
      setLoading(false)
      setResults(Array.isArray(res) ? res : [])
      setOpen(true)
    }, 350)
    return () => clearTimeout(timer.current)
  }, [query, selected])

  if (selected) {
    return (
      <div className="px-3 py-2 rounded-lg border flex items-center justify-between gap-2"
        style={{ background: 'var(--card)', borderColor: 'var(--accent)' }}>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{selected.name}</div>
          <div className="text-[10px] truncate" style={{ color: 'var(--text3)' }}>{selected._id}</div>
        </div>
        <button onClick={() => { onSelect(null); setQuery('') }}
          className="shrink-0 text-xs cursor-pointer" style={{ color: 'var(--text3)' }}
          onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}>✕</button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input value={query} onChange={e => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        placeholder="Rechercher un client…"
        className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none transition-colors"
        style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text)' }} />
      {open && (query.trim().length >= 2) && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border overflow-hidden shadow-xl max-h-60 overflow-y-auto"
          style={{ background: 'var(--card)', borderColor: 'var(--border2)' }}>
          {loading ? (
            <div className="px-3 py-2 text-xs" style={{ color: 'var(--text3)' }}>Recherche…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs" style={{ color: 'var(--text3)' }}>Aucun client trouvé</div>
          ) : results.map(c => (
            <button key={c._id} onClick={() => { onSelect(c); setOpen(false) }}
              className="w-full text-left px-3 py-2 transition-colors cursor-pointer block"
              onMouseEnter={e => e.currentTarget.style.background = 'var(--card2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div className="text-sm truncate" style={{ color: 'var(--text)' }}>{c.name}</div>
              <div className="text-[10px] truncate" style={{ color: 'var(--text3)' }}>{c._id}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── SettingsModal ─────────────────────────────────────────────────────────
function SettingsModal({ onClose, dryRun, setDryRun, appdataDir, dark, setDark }) {
  const rows = [
    { title: 'Mode test (dry-run)', desc: 'Simule sans écrire dans Bob! Desk', val: dryRun, set: setDryRun },
    { title: dark ? 'Thème sombre' : 'Thème clair',
      desc: dark ? 'Basculer vers le thème clair olive' : 'Basculer vers le thème sombre',
      val: dark, set: setDark, icon: dark ? '🌙' : '☀️' },
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div className="relative w-[400px] rounded-2xl overflow-hidden shadow-2xl border"
        style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <div className="h-px" style={{ background: `linear-gradient(to right, transparent, var(--grad), transparent)` }} />
        <div className="px-6 pt-5 pb-1">
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Paramètres</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>Configuration DocsDesk</div>
        </div>
        <div className="px-6 pb-5 mt-4 space-y-2">
          {rows.map(row => (
            <div key={row.title} className="flex items-center justify-between rounded-xl px-4 py-3.5 border transition-colors duration-200"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <div>
                <div className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text)' }}>
                  {row.icon && <span>{row.icon}</span>}{row.title}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>{row.desc}</div>
              </div>
              <Toggle checked={row.val} onChange={row.set} />
            </div>
          ))}
          <div className="flex items-center justify-between rounded-xl px-4 py-3.5 border transition-colors duration-200"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="min-w-0 mr-3">
              <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>Dossier de l'application</div>
              <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text3)' }}>{appdataDir}</div>
            </div>
            <button onClick={() => api('/open_appdata')}
              className="shrink-0 text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer border"
              style={{ background: 'var(--card2)', borderColor: 'var(--border2)', color: 'var(--text2)' }}>
              📁 Ouvrir
            </button>
          </div>
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm transition-all cursor-pointer border"
            style={{ borderColor: 'var(--border)', color: 'var(--text2)', background: 'transparent' }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

// ── LoginModal ────────────────────────────────────────────────────────────
function LoginModal({ onClose, onSaved }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    api('/credentials').then(d => { setEmail(d.email || ''); setPassword(d.password || '') })
  }, [])

  const save = async () => {
    if (!email || !password) { setError('E-mail et mot de passe sont obligatoires.'); return }
    if (!email.includes('@')) { setError('Adresse e-mail invalide.'); return }
    setLoading(true); setError('')
    const res = await api('/save_credentials', { email, password })
    setLoading(false)
    if (res.ok) { onSaved(email); onClose() }
    else setError(res.error || 'Connexion échouée.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div className="relative w-[360px] rounded-2xl overflow-hidden shadow-2xl border"
        style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <div className="h-px" style={{ background: `linear-gradient(to right, transparent, var(--grad), transparent)` }} />
        <div className="px-6 pt-5 pb-1">
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Connexion</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>Identifiants Bob! Desk</div>
        </div>
        <div className="px-6 pb-5 mt-4 space-y-3">
          {[
            ['E-mail', email, setEmail, 'email', false, 'vous@exemple.fr'],
            ['Mot de passe', password, setPassword, 'password', true, '••••••••'],
          ].map(([lbl, val, set, type, secret, ph]) => (
            <div key={lbl}>
              <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text3)' }}>{lbl}</label>
              <input type={secret ? 'password' : type} value={val} placeholder={ph}
                onChange={e => set(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
                className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm border focus:outline-none transition-colors"
                style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text)' }} />
            </div>
          ))}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button onClick={save} disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
            style={{ background: loading ? 'var(--accent-h)' : 'var(--accent)' }}>
            {loading ? 'Vérification…' : 'Enregistrer et continuer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [dark, setDark]           = useTheme()
  const [client, setClient]       = useState(null)
  const [files, setFiles]         = useState([])   // {path, name, status}
  const [docs, setDocs]           = useState([])   // documents existants
  const [docsLoading, setDocsLoading] = useState(false)
  const [dryRun, setDryRun]       = useState(false)
  const [running, setRunning]     = useState(false)
  const [logs, setLogs]           = useState([])
  const [showLog, setShowLog]     = useState(true)
  const [status, setStatus]       = useState({ text: '', type: 'muted' })
  const [showSettings, setShowSettings] = useState(false)
  const [showLogin, setShowLogin]       = useState(false)
  const [email, setEmail]         = useState('')
  const [appdataDir, setAppdataDir] = useState('')
  const [progress, setProgress]   = useState({ current: 0, total: 0 })
  const [lo, setLo]               = useState({ installed: true, can_autoinstall: false, installing: false })
  const logRef  = useRef()
  const pollRef = useRef()
  const loPollRef = useRef()

  const checkLibre = useCallback(async () => {
    const s = await api('/libreoffice_status')
    setLo(s)
    return s
  }, [])

  useEffect(() => {
    api('/init').then(d => {
      setEmail(d.email || '')
      setAppdataDir(d.appdata_dir || '')
      if (!d.email) setShowLogin(true)
    })
    checkLibre()
  }, [checkLibre])

  const installLibre = async () => {
    if (lo.installing) return
    if (!lo.can_autoinstall) { window.open('https://www.libreoffice.org/download/download-libreoffice/', '_blank'); return }
    setLo(s => ({ ...s, installing: true }))
    setShowLog(true)
    setLogs(prev => [...prev, "Installation de LibreOffice demandée — acceptez l'invite Windows si elle apparaît…"])
    await api('/install_libreoffice', {})
    clearInterval(loPollRef.current)
    loPollRef.current = setInterval(async () => {
      const lg = await api('/logs')
      if (lg.lines?.length) {
        setLogs(prev => [...prev, ...lg.lines])
        setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, 50)
      }
      const s = await api('/libreoffice_status')
      if (s.install_done || !s.installing) {
        clearInterval(loPollRef.current)
        setLo(s)
        setStatus(s.installed
          ? { text: 'LibreOffice installé ✓', type: 'success' }
          : { text: 'Installation LibreOffice non aboutie.', type: 'error' })
      }
    }, 1500)
  }

  // Charge les documents existants à la sélection d'un client
  const loadDocs = useCallback(async (c) => {
    if (!c?._id) { setDocs([]); return }
    setDocsLoading(true)
    const res = await api('/list_documents', { client_id: c._id, tab_id: c.documents_tab_id || '' })
    setDocsLoading(false)
    setDocs(Array.isArray(res) ? res : [])
  }, [])

  useEffect(() => { loadDocs(client) }, [client, loadDocs])

  const addFiles = useCallback((list) => {
    // `list` = tableau d'objets File (drag-drop ou sélecteur).
    setFiles(prev => {
      const seen = new Set(prev.map(f => f.id))
      const accepted = list.filter(f => ACCEPT_RE.test(f.name))
      const fresh = accepted
        .map(f => ({ id: `${f.name}::${f.size}`, name: f.name, size: f.size, file: f, status: 'pending' }))
        .filter(f => !seen.has(f.id))
      if (accepted.length < list.length) {
        setStatus({ text: 'Certains fichiers ont été ignorés (format non pris en charge).', type: 'warn' })
      }
      return [...prev, ...fresh]
    })
  }, [])

  const removeFile = (id) => setFiles(prev => prev.filter(f => f.id !== id))
  const clearFiles = () => { if (!running) { setFiles([]); setStatus({ text: '', type: 'muted' }) } }

  const setFileStatus = (idx, st) => setFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: st } : f))

  // Met à jour le statut des fichiers d'après les lignes de log [i/total]
  const applyLogToFiles = useCallback((line) => {
    const m = line.match(/\[(\d+)\/(\d+)\]/)
    if (!m) return
    const idx = parseInt(m[1], 10) - 1
    if (/Conversion/i.test(line))      setFileStatus(idx, 'converting')
    else if (/Upload/i.test(line))     setFileStatus(idx, 'uploading')
    else if (/✓|Terminé/i.test(line))  setFileStatus(idx, 'success')
    else if (/✗|Erreur|introuvable|non pris/i.test(line)) setFileStatus(idx, 'error')
  }, [])

  const pollLogs = useCallback(() => {
    pollRef.current = setInterval(async () => {
      const res = await api('/logs')
      if (res.lines?.length) {
        setLogs(prev => [...prev, ...res.lines])
        res.lines.forEach(applyLogToFiles)
        setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, 50)
        if (res.progress) setProgress(res.progress)
      }
      if (res.done) {
        clearInterval(pollRef.current)
        setRunning(false)
        setStatus({ text: `Terminé${dryRun ? ' [DRY-RUN]' : ''}`, type: 'success' })
        // L'indexation GED est asynchrone (~2 s) : on recharge avec un léger délai.
        loadDocs(client)
        setTimeout(() => loadDocs(client), 2500)
      }
      if (res.error) {
        clearInterval(pollRef.current)
        setRunning(false)
        setStatus({ text: res.error, type: 'error' })
      }
    }, 300)
  }, [dryRun, client, loadDocs, applyLogToFiles])

  const launch = async () => {
    if (running) return
    if (!client)         { setStatus({ text: 'Sélectionnez un client.', type: 'warn' }); return }
    if (files.length === 0) { setStatus({ text: 'Ajoutez au moins un fichier.', type: 'warn' }); return }
    setRunning(true)
    setProgress({ current: 0, total: files.length })
    setFiles(prev => prev.map(f => ({ ...f, status: 'pending' })))
    setStatus({ text: 'Connexion à Bob! Desk…', type: 'muted' })
    // Envoi du CONTENU des fichiers en multipart (indépendant du chemin disque).
    const fd = new FormData()
    fd.append('client_id', client._id)
    fd.append('tab_id', client.documents_tab_id || '')
    fd.append('dry_run', dryRun ? 'true' : 'false')
    files.forEach(f => fd.append('files', f.file, f.name))
    try {
      const r = await fetch('/api/upload', { method: 'POST', body: fd })
      const j = await r.json()
      if (!j.ok) { setRunning(false); setStatus({ text: j.error || 'Échec de l\'envoi.', type: 'error' }); return }
    } catch (e) {
      setRunning(false); setStatus({ text: 'Échec de l\'envoi des fichiers.', type: 'error' }); return
    }
    pollLogs()
  }

  const deleteDoc = async (doc) => {
    if (!client) return
    if (!confirm(`Mettre le document « ${doc.name} » à la corbeille ?`)) return
    const res = await api('/delete_document', { client_id: client._id, document_id: doc._id, dry_run: dryRun })
    if (res.ok) { setDocs(prev => prev.filter(d => d._id !== doc._id)) }
    else setStatus({ text: res.error || 'Suppression échouée.', type: 'error' })
  }

  const counts = files.reduce((a, f) => { a[f.status] = (a[f.status] || 0) + 1; return a }, {})
  const statusColor = { muted: 'var(--text3)', success: '#34d399', error: '#f87171', warn: '#fbbf24' }

  return (
    <div className="flex h-screen w-screen overflow-hidden transition-colors duration-200"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}>

      {/* ── SIDEBAR ─────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col overflow-hidden border-r transition-colors duration-200"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="h-px" style={{ background: `linear-gradient(to right, transparent, var(--grad), transparent)` }} />

        <div className="px-5 pt-4 pb-3">
          <div className="text-base font-bold tracking-tight" style={{ color: 'var(--text)' }}>DocsDesk</div>
          <div className="text-[10px] mt-0.5 uppercase tracking-widest font-medium" style={{ color: 'var(--accent)' }}>
            Documents Bob! Desk
          </div>
        </div>

        <div className="mx-4 h-px" style={{ background: 'var(--border)' }} />

        {/* Client */}
        <div className="px-4 mt-3 space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Client</label>
          <ClientSearch selected={client} onSelect={setClient} />
        </div>

        <div className="mx-4 mt-3 h-px" style={{ background: 'var(--border)' }} />

        {/* Paramètres */}
        <button onClick={() => setShowSettings(true)}
          className="mx-4 mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-transparent transition-all cursor-pointer text-left"
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0 transition-colors"
            style={{ background: dryRun ? '#fbbf24' : 'var(--border2)' }} />
          <span className="text-sm flex-1" style={{ color: 'var(--text2)' }}>Paramètres</span>
          <svg className="w-3.5 h-3.5" style={{ color: 'var(--text3)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <div className="mx-4 mt-2 h-px" style={{ background: 'var(--border)' }} />

        {/* Bouton lancer */}
        <div className="px-4 mt-2">
          <button onClick={launch} disabled={running}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: 'var(--accent)' }}
            onMouseEnter={e => !running && (e.currentTarget.style.background = 'var(--accent-h)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}>
            {running ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                En cours…
              </>
            ) : `⬆  Envoyer ${files.length || ''} document${files.length > 1 ? 's' : ''}`.trim()}
          </button>

          {running && (
            <div className="mt-2 h-px rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div className="h-full transition-all duration-300"
                style={{
                  width: progress.total > 0 ? `${Math.round((progress.current / progress.total) * 100)}%` : '60%',
                  background: 'var(--accent)',
                }} />
            </div>
          )}
          {running && progress.total > 0 && (
            <p className="mt-1 text-[10px] text-center tabular-nums" style={{ color: 'var(--text3)' }}>
              {progress.current}/{progress.total} fichiers
            </p>
          )}
          {status.text && (
            <p className="mt-1 text-[11px] text-center" style={{ color: statusColor[status.type] }}>{status.text}</p>
          )}
        </div>

        <div className="flex-1" />

        <div className="mx-4 h-px" style={{ background: 'var(--border)' }} />

        {/* Compte */}
        <button onClick={() => setShowLogin(true)}
          className="mx-4 my-3 flex items-center gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer"
          onMouseEnter={e => e.currentTarget.style.background = 'var(--card)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: email ? '#34d399' : '#fbbf24' }} />
          <div className="flex-1 min-w-0 text-left">
            <div className="text-xs truncate" style={{ color: 'var(--text2)' }}>{email || 'Non connecté'}</div>
            <div className="text-[10px]" style={{ color: 'var(--text3)' }}>Changer de compte</div>
          </div>
        </button>

        <div className="text-center text-[10px] pb-2" style={{ color: 'var(--muted)' }}>socacom.fr · DocsDesk v1.0</div>
      </aside>

      {/* ── MAIN ────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden p-5 min-w-0">
        {!lo.installed && (
          <div className="mb-3 rounded-xl border px-4 py-3 flex items-center gap-3"
            style={{ background: 'color-mix(in srgb, #fbbf24 10%, var(--card))', borderColor: '#fbbf2455' }}>
            <span className="text-lg">⚠️</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                LibreOffice non détecté
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>
                Requis pour convertir Word/Excel. {lo.can_autoinstall
                  ? 'Installation automatique disponible (~340 Mo, une invite Windows s\'affichera).'
                  : 'Téléchargez-le depuis libreoffice.org.'} Les images et PDF fonctionnent sans.
              </div>
            </div>
            <button onClick={installLibre} disabled={lo.installing}
              className="shrink-0 text-xs font-semibold px-3 py-2 rounded-lg text-white transition-colors cursor-pointer disabled:opacity-60 flex items-center gap-2"
              style={{ background: 'var(--accent)' }}>
              {lo.installing ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Installation…
                </>
              ) : (lo.can_autoinstall ? 'Installer automatiquement' : 'Télécharger')}
            </button>
          </div>
        )}
        <DropZone disabled={running} onFiles={addFiles} />

        {/* Stats */}
        <div className="flex gap-3 mt-4">
          <StatCard value={files.length}            label="À envoyer" color="slate" />
          <StatCard value={counts.success || 0}     label="Réussis"   color="green" />
          <StatCard value={counts.error || 0}       label="Erreurs"   color="red"   />
          <StatCard value={docs.length}             label="Existants" color="amber" />
        </div>

        {/* Liste de fichiers à envoyer */}
        <div className="flex items-center justify-between mt-4 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
            Fichiers à envoyer
          </span>
          {files.length > 0 && (
            <button onClick={clearFiles} disabled={running}
              className="text-xs transition-colors cursor-pointer disabled:opacity-40"
              style={{ color: 'var(--text3)' }}
              onMouseEnter={e => !running && (e.currentTarget.style.color = 'var(--text2)')}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}>Vider la liste</button>
          )}
        </div>
        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {files.length === 0
            ? <div className="text-[11px] px-1" style={{ color: 'var(--muted)' }}>Aucun fichier sélectionné.</div>
            : files.map(f => <FileRow key={f.id} f={f} onRemove={() => removeFile(f.id)} />)
          }
        </div>

        {/* Documents existants */}
        <div className="flex items-center justify-between mt-4 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
            Documents du client {client ? `· ${docs.length}` : ''}
          </span>
          {client && (
            <button onClick={() => loadDocs(client._id)}
              className="text-xs transition-colors cursor-pointer" style={{ color: 'var(--text3)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text2)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}>Actualiser</button>
          )}
        </div>
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {!client ? (
            <div className="text-[11px] px-1" style={{ color: 'var(--muted)' }}>Sélectionnez un client pour voir ses documents.</div>
          ) : docsLoading ? (
            <div className="text-[11px] px-1" style={{ color: 'var(--text3)' }}>Chargement…</div>
          ) : docs.length === 0 ? (
            <div className="text-[11px] px-1" style={{ color: 'var(--muted)' }}>Aucun document existant.</div>
          ) : docs.map(d => (
            <div key={d._id} className="flex items-center gap-3 px-3 py-2 rounded-lg border"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <span className="flex-1 min-w-0 truncate text-sm" style={{ color: 'var(--text)' }}>{d.name}</span>
              {d.created_at && <span className="text-[10px] shrink-0" style={{ color: 'var(--text3)' }}>{String(d.created_at).slice(0, 10)}</span>}
              <button onClick={() => deleteDoc(d)}
                className="shrink-0 text-xs cursor-pointer transition-colors" style={{ color: 'var(--text3)' }}
                onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}>🗑</button>
            </div>
          ))}
        </div>

        {/* Journal */}
        <div className="flex items-center justify-between mt-4 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Journal</span>
          <div className="flex gap-4">
            <button onClick={() => setLogs([])}
              className="text-xs transition-colors cursor-pointer" style={{ color: 'var(--text3)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text2)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}>Effacer</button>
            <button onClick={() => setShowLog(v => !v)}
              className="text-xs transition-colors cursor-pointer" style={{ color: 'var(--text3)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text2)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}>
              {showLog ? 'Masquer' : 'Afficher'}
            </button>
          </div>
        </div>

        {showLog && (
          <div ref={logRef} className="flex-1 rounded-xl overflow-y-auto p-4 min-h-24 border transition-colors duration-200"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            {logs.length === 0
              ? <div className="font-mono text-[11px]" style={{ color: 'var(--muted)' }}>En attente d'un envoi…</div>
              : logs.map((l, i) => <LogLine key={i} line={l} />)
            }
          </div>
        )}
      </main>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)}
          dryRun={dryRun} setDryRun={setDryRun}
          appdataDir={appdataDir} dark={dark} setDark={setDark} />
      )}
      {showLogin && (
        <LoginModal onClose={() => setShowLogin(false)} onSaved={e => setEmail(e)} />
      )}
    </div>
  )
}
