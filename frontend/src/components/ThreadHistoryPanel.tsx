import { useEffect, useState } from 'react';
import type { ThreadSummary } from '../types/thread';
import { listThreads } from '../api/threads';

interface Props {
  onSelectThread: (threadId: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  completed: '完了',
  in_progress: '進行中',
  error: 'エラー',
  failed: '失敗',
};

const STATUS_COLOR: Record<string, string> = {
  completed: '#2dcc71',
  in_progress: '#4a90e2',
  error: '#e74c3c',
  failed: '#e74c3c',
};

export default function ThreadHistoryPanel({ onSelectThread }: Props) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listThreads()
      .then((res) => setThreads(res.threads))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <div style={{ marginTop: 20, borderTop: '1px solid rgba(160,140,120,0.15)', paddingTop: 12 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: '#4a3f35',
          fontSize: 16,
          fontFamily: "'Zen Maru Gothic', sans-serif",
          padding: '4px 0',
          width: '100%',
        }}
      >
        <span style={{ fontSize: 14 }}>{open ? '▾' : '▸'}</span>
        <span>過去の会議履歴</span>
        {threads.length > 0 && open && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9a8e82' }}>
            {threads.length}件
          </span>
        )}
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          {loading && (
            <div style={{ color: '#9a8e82', fontSize: 12, padding: '8px 0', textAlign: 'center' }}>
              読み込み中...
            </div>
          )}
          {!loading && threads.length === 0 && (
            <div style={{ color: '#9a8e82', fontSize: 12, padding: '8px 0', textAlign: 'center' }}>
              履歴がありません
            </div>
          )}
          {!loading && threads.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectThread(t.id)}
              style={{
                display: 'block',
                width: '100%',
                background: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(160,140,120,0.2)',
                borderRadius: 8,
                padding: '9px 12px',
                marginBottom: 6,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span
                  style={{
                    fontSize: 10,
                    color: STATUS_COLOR[t.status] ?? '#9a8e82',
                    fontWeight: 600,
                    background: `${STATUS_COLOR[t.status] ?? '#9a8e82'}18`,
                    borderRadius: 4,
                    padding: '1px 6px',
                  }}
                >
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
                <span style={{ fontSize: 10, color: '#9a8e82', marginLeft: 'auto' }}>
                  {t.created_at.slice(0, 16).replace('T', ' ')}
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: '#4a3f35',
                  fontFamily: "'Zen Maru Gothic', sans-serif",
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.question}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
