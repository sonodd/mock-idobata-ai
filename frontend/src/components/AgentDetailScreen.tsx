import { useState } from 'react';
import { updateAgent, type AgentDetail, type CreateAgentInput } from '../api/agents';

interface Props {
  agent: AgentDetail;
  onSave: (updated: AgentDetail) => void;
  onClose: () => void;
}

const VALID_PERSONALITIES = ['共感型', '分析型', '実践型', '理想型'] as const;

export default function AgentDetailScreen({ agent, onSave, onClose }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [validationError, setValidationError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSelf, setIsSelf] = useState(agent.is_self ?? false);

  const profileForDisplay = {
    id: agent.id,
    nickname: agent.nickname,
    personality: agent.personality,
    background: agent.background,
    expertise: agent.expertise,
    values: agent.values,
    tone: agent.tone,
    episodes: agent.episodes,
    is_self: agent.is_self,
  };

  const handleEditStart = () => {
    const editTarget = {
      nickname: agent.nickname,
      personality: agent.personality,
      background: agent.background,
      expertise: agent.expertise,
      values: agent.values,
      tone: agent.tone,
      episodes: agent.episodes,
      is_self: agent.is_self,
    };
    setJsonText(JSON.stringify(editTarget, null, 2));
    setValidationError('');
    setIsSelf(agent.is_self ?? false);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setValidationError('');
  };

  const handleSave = async () => {
    // スマートクォート正規化 + JSON parse
    let parsed: Record<string, unknown>;
    try {
      const normalized = jsonText
        .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
        .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
      parsed = JSON.parse(normalized) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('JSON object required');
      }
    } catch {
      setValidationError('JSONの形式が正しくありません。構文エラーを確認してください。');
      return;
    }

    // nickname
    if (typeof parsed.nickname !== 'string' || !parsed.nickname.trim()) {
      setValidationError('nickname は必須の文字列です。');
      return;
    }

    // personality 4択
    if (
      typeof parsed.personality !== 'string' ||
      !(VALID_PERSONALITIES as readonly string[]).includes(parsed.personality)
    ) {
      setValidationError(`personality は "${VALID_PERSONALITIES.join('" / "')}" のいずれかのみ有効です。`);
      return;
    }

    // tone 検証
    const tone = parsed.tone as Record<string, unknown> | undefined;
    if (!tone || typeof tone !== 'object') {
      setValidationError('tone フィールドが必要です（characteristics と samples を含むオブジェクト）。');
      return;
    }
    if (typeof tone.characteristics !== 'string' || !tone.characteristics.trim()) {
      setValidationError('tone.characteristics は必須の文字列です。');
      return;
    }
    const toneSamples = tone.samples;
    if (!Array.isArray(toneSamples) || toneSamples.length === 0) {
      setValidationError('tone.samples は文字列の配列（最低1件）が必要です。');
      return;
    }

    // expertise: string → array 変換
    let expertise: string[];
    if (typeof parsed.expertise === 'string') {
      expertise = parsed.expertise.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (Array.isArray(parsed.expertise)) {
      expertise = (parsed.expertise as unknown[]).map(String).filter(Boolean);
    } else {
      setValidationError('expertise は文字列またはリストが必要です。');
      return;
    }
    if (expertise.length === 0) {
      setValidationError('expertise は1件以上入力してください。');
      return;
    }

    // episodes: string → array 変換
    let episodes: string[];
    if (typeof parsed.episodes === 'string') {
      episodes = parsed.episodes.split('\n').filter(Boolean);
    } else if (Array.isArray(parsed.episodes)) {
      episodes = (parsed.episodes as unknown[]).map(String).filter(Boolean);
    } else {
      setValidationError('episodes は文字列またはリストが必要です。');
      return;
    }
    if (episodes.length === 0) {
      setValidationError('episodes は1件以上入力してください。');
      return;
    }

    // background: string → { label } 変換
    let background: { label: string } | undefined;
    if (typeof parsed.background === 'string' && parsed.background.trim()) {
      background = { label: parsed.background.trim() };
    } else if (
      parsed.background &&
      typeof parsed.background === 'object' &&
      'label' in parsed.background
    ) {
      background = { label: String((parsed.background as { label: unknown }).label) };
    }

    // 余分なフィールドを除去して必要フィールドのみ抽出
    const input: CreateAgentInput = {
      nickname: (parsed.nickname as string).trim(),
      personality: parsed.personality as string,
      expertise,
      tone: {
        characteristics: (tone.characteristics as string).trim(),
        samples: (toneSamples as unknown[]).map(String),
      },
      episodes,
      background,
      is_self: isSelf,
      values: Array.isArray(parsed.values)
        ? (parsed.values as unknown[]).map(String).filter(Boolean)
        : undefined,
    };

    setIsSaving(true);
    setValidationError('');
    try {
      const updated = await updateAgent(agent.id, input);
      updated.color = agent.color;
      onSave(updated);
    } catch (e) {
      console.error(e);
      setValidationError('保存に失敗しました。バックエンドとの通信を確認してください。');
    } finally {
      setIsSaving(false);
    }
  };

  const baseFont = "'Zen Maru Gothic', sans-serif";
  const accent = '#E8654A';

  return (
    <div style={{ animation: 'fadeIn 0.5s ease' }}>
      <div
        style={{
          background: 'white',
          borderRadius: 18,
          padding: '16px 18px',
          boxShadow: '0 2px 16px rgba(90,77,63,0.07)',
          border: '1px solid #e8e0d8',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#4a3f35', fontFamily: baseFont }}>
            🤖 {agent.nickname}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              color: '#9a8e82',
              padding: '0 4px',
            }}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        {!isEditing ? (
          <>
            {/* 閲覧モード */}
            <pre
              style={{
                margin: 0,
                padding: '12px 14px',
                borderRadius: 10,
                background: '#f9f5f0',
                border: '1px solid #e8e0d8',
                fontSize: 12,
                color: '#3a3530',
                fontFamily: 'monospace',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.6,
              }}
            >
              {JSON.stringify(profileForDisplay, null, 2)}
            </pre>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: 14,
                  border: '1px solid #e8e0d8',
                  background: 'white',
                  color: '#9a8e82',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: baseFont,
                  cursor: 'pointer',
                }}
              >
                閉じる
              </button>
              <button
                onClick={handleEditStart}
                style={{
                  flex: 2,
                  padding: '11px',
                  borderRadius: 14,
                  border: `2px solid ${accent}`,
                  background: accent,
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: baseFont,
                  cursor: 'pointer',
                }}
              >
                ✏️ 編集する
              </button>
            </div>
          </>
        ) : (
          <>
            {/* 編集モード */}
            <div style={{ fontSize: 11, color: '#b0a595', fontWeight: 700, fontFamily: baseFont, letterSpacing: 0.8 }}>
              JSON を編集して「保存する」を押してください
            </div>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              style={{
                width: '100%',
                minHeight: 280,
                padding: '10px 12px',
                borderRadius: 10,
                border: `1.5px solid ${validationError ? '#e74c3c' : '#e8e0d8'}`,
                fontSize: 12,
                color: '#3a3530',
                fontFamily: 'monospace',
                background: 'white',
                outline: 'none',
                boxSizing: 'border-box',
                resize: 'vertical',
                lineHeight: 1.6,
              }}
            />

            {validationError && (
              <div style={{ fontSize: 13, color: '#e74c3c', fontFamily: baseFont }}>
                {validationError}
              </div>
            )}

            {/* is_self チェックボックス */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                userSelect: 'none',
                fontFamily: baseFont,
                fontSize: 13,
                color: '#4a3f35',
              }}
            >
              <input
                type="checkbox"
                checked={isSelf}
                onChange={(e) => setIsSelf(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: accent, cursor: 'pointer' }}
              />
              これは自分の分身（is_self）です
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleCancel}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: 14,
                  border: '1px solid #e8e0d8',
                  background: 'white',
                  color: '#9a8e82',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: baseFont,
                  cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{
                  flex: 2,
                  padding: '11px',
                  borderRadius: 14,
                  border: `2px solid ${accent}`,
                  background: isSaving ? `${accent}88` : accent,
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: baseFont,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                }}
              >
                {isSaving ? '保存中…' : '💾 保存する'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
