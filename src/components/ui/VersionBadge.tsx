import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/**
 * Small chip (admins only): when this build was published, its commit, and what changed.
 * The commit and build time are stamped in at build time (vite.config.ts), so every
 * deploy updates it by itself. The commit message and the newest commit on GitHub come
 * from the public GitHub API; if they cannot be fetched the chip just shows less.
 */
const REPO = 'VEINNIV/tr_app_web_new';
const { commit, builtAt } = __APP_VERSION__;

interface GithubCommit { sha: string; commit: { message: string } }

const fetchCommit = (ref: string): Promise<GithubCommit | null> =>
  fetch(`https://api.github.com/repos/${REPO}/commits/${ref}`)
    .then((r) => (r.ok ? (r.json() as Promise<GithubCommit>) : null))
    .catch(() => null);

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 45) return 'az önce';
  if (s < 3600) return `${Math.round(s / 60)} dk önce`;
  if (s < 86_400) return `${Math.round(s / 3600)} sa önce`;
  return `${Math.round(s / 86_400)} gün önce`;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function VersionBadge() {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [latest, setLatest] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    if (commit) {
      fetchCommit(commit).then((c) => alive && c && setMessage(c.commit.message.split('\n')[0]));
    }
    fetchCommit('main').then((c) => alive && c && setLatest(c.sha));
    return () => { alive = false; };
  }, [isAdmin]);

  if (!isAdmin) return null;

  const short = commit.slice(0, 7) || 'yerel';
  const behind = Boolean(commit && latest && latest !== commit);

  return (
    <div style={{ position: 'fixed', right: 14, bottom: 14, zIndex: 40, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      {open && (
        <div style={{
          maxWidth: 300, padding: '12px 14px', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 4,
          background: 'var(--color-surface)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-lg)', fontSize: '0.8rem', wordBreak: 'break-word',
        }}>
          <b>{message || 'Bu sürüm için not yok'}</b>
          <span>Sürüm {short}</span>
          <span>Yayınlandı: {formatDate(builtAt)}</span>
          {behind && <span>GitHub'da daha yeni bir sürüm var ({latest.slice(0, 7)}), yayına alınıyor olabilir.</span>}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={message || 'Sürüm bilgisi'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
          background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-lg)', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'var(--font-family)',
        }}
      >
        <RefreshCw size={13} />
        <span>Güncellendi {timeAgo(builtAt)}</span>
        <code>{short}</code>
      </button>
    </div>
  );
}
