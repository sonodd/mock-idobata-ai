import { useRef, useState } from 'react';
import { createAgent } from '../api/agents';

interface Props {
  onComplete: () => void;
  onCancel: () => void;
}

const VALID_PERSONALITIES = ['共感型', '分析型', '実践型', '理想型'] as const;

const JSON_SAMPLE = `{
  "nickname": "田中太郎",
  "is_self": false,
  "personality": "共感型",
  "background": "マーケティング部門10年・3児のパパ",
  "expertise": ["マーケティング", "データ分析", "チームマネジメント"],
  "tone": {
    "characteristics": "穏やかで共感的な口調。相手の気持ちに寄り添いながら話す。",
    "samples": ["そうですね、まずは状況を整理してみましょう", "なるほど、その視点は大切ですね"]
  },
  "episodes": [
    "プロジェクトXで失敗から学び、チームをまとめた経験がある",
    "育休取得後、仕事と家庭のバランスに向き合った"
  ]
}`;

const CHATGPT_PROMPT = `以下のJSON形式で、私の「分身AI」のプロフィールを作成してください。

【条件】
- nickname: 架空の日本人名（本名でなくてよい）
- personality: "共感型" / "分析型" / "実践型" / "理想型" のいずれか1つのみ
- background: 職歴・家族構成など（1〜2文）
- expertise: 得意分野のリスト（2〜4件）
- tone.characteristics: 口調の特徴（1文）
- tone.samples: 実際の発言例（2〜3件）
- episodes: 印象的な経験エピソード（2〜3件）
- is_self: false

【出力形式（JSONのみ出力してください）】
${JSON_SAMPLE}

私の情報:
（秘密情報や個人を特定できる情報を除き、抽象化した属性や架空の設定を書いてください）`;

export default function AgentRegistrationScreen({ onComplete, onCancel }: Props) {
  const [jsonText, setJsonText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showSample, setShowSample] = useState(true);
  const [isSelf, setIsSelf] = useState(false);
  const [copied, setCopied] = useState(false);
  const submitLockRef = useRef(false);

  const handleCopyPrompt = () => {
    const doCopy = () => {
      const textarea = document.createElement('textarea');
      textarea.value = CHATGPT_PROMPT;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // コピー失敗（フォールバックも不可）
      }
      document.body.removeChild(textarea);
    };

    if (navigator.clipboard) {
      navigator.clipboard.writeText(CHATGPT_PROMPT).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(doCopy);
    } else {
      doCopy();
    }
  };

  const handleSubmit = async () => {
    if (submitLockRef.current || isSubmitting) return;
    setError('');

    // JSON parse（スマートクォート正規化）
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
      setError('JSONの形式が正しくありません。構文エラーを確認してください。');
      return;
    }

    // nickname
    if (typeof parsed.nickname !== 'string' || !parsed.nickname.trim()) {
      setError('nickname は必須の文字列です。');
      return;
    }

    // personality
    if (
      typeof parsed.personality !== 'string' ||
      !(VALID_PERSONALITIES as readonly string[]).includes(parsed.personality)
    ) {
      setError(`personality は "${VALID_PERSONALITIES.join('" / "')}" のいずれかのみ有効です。`);
      return;
    }

    // tone
    const tone = parsed.tone as Record<string, unknown> | undefined;
    if (!tone || typeof tone !== 'object') {
      setError('tone フィールドが必要です（characteristics と samples を含むオブジェクト）。');
      return;
    }
    if (typeof tone.characteristics !== 'string' || !tone.characteristics.trim()) {
      setError('tone.characteristics は必須の文字列です（口調の説明を入力してください）。');
      return;
    }
    const toneSamples = tone.samples;
    if (!Array.isArray(toneSamples) || toneSamples.length === 0) {
      setError('tone.samples は文字列の配列（最低1件）が必要です。');
      return;
    }

    // expertise
    let expertise: string[];
    if (typeof parsed.expertise === 'string') {
      expertise = parsed.expertise.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (Array.isArray(parsed.expertise)) {
      expertise = (parsed.expertise as unknown[]).map(String).filter(Boolean);
    } else {
      setError('expertise は文字列またはリストが必要です。');
      return;
    }
    if (expertise.length === 0) {
      setError('expertise は1件以上入力してください。');
      return;
    }

    // episodes
    let episodes: string[];
    if (typeof parsed.episodes === 'string') {
      episodes = parsed.episodes.split('\n').filter(Boolean);
    } else if (Array.isArray(parsed.episodes)) {
      episodes = (parsed.episodes as unknown[]).map(String).filter(Boolean);
    } else {
      setError('episodes は文字列またはリストが必要です。');
      return;
    }
    if (episodes.length === 0) {
      setError('episodes は1件以上入力してください。');
      return;
    }

    // background: string → { label: string }
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

    submitLockRef.current = true;
    setIsSubmitting(true);
    try {
      await createAgent({
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
      });
      onComplete();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : '登録に失敗しました。');
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const isReady = jsonText.trim().length > 0 && !isSubmitting;

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
        {/* タイトル */}
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#4a3f35',
            fontFamily: "'Zen Maru Gothic', sans-serif",
          }}
        >
          🤖 代理AIを登録する
        </div>

        {/* JSONサンプル（折りたたみ） */}
        <div
          style={{
            background: '#faf7f4',
            borderRadius: 12,
            border: '1px solid #e8e0d8',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => setShowSample((v) => !v)}
          >
            <span
              style={{
                fontSize: 11,
                color: '#8a7e72',
                fontWeight: 700,
                fontFamily: "'Zen Maru Gothic', sans-serif",
                letterSpacing: 0.4,
              }}
            >
              💬 ChatGPT用プロンプト（コピーして貼り付けるだけ）
            </span>
            <span style={{ fontSize: 11, color: '#b0a595' }}>{showSample ? '▲' : '▼'}</span>
          </div>

          {showSample && (
            <div style={{ padding: '0 14px 12px' }}>
              <div
                style={{
                  fontSize: 11,
                  color: '#9a8e82',
                  fontFamily: "'Zen Maru Gothic', sans-serif",
                  lineHeight: 1.7,
                  marginBottom: 8,
                }}
              >
                下のプロンプトをコピーしてChatGPTに貼り付け、最後の「私の情報」欄に匿名化した設定を書いてください。外部サービスに貼り付けた内容はそのサービスへ送信されます。
                <br />
                生成されたJSONを下のテキストエリアに貼り付けると登録できます。
              </div>
              <pre
                style={{
                  background: '#f0ebe5',
                  borderRadius: 10,
                  padding: '10px 12px',
                  fontSize: 10.5,
                  color: '#4a3f35',
                  overflowX: 'auto',
                  margin: 0,
                  fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 200,
                  overflow: 'auto',
                }}
              >
                {CHATGPT_PROMPT}
              </pre>
              <button
                onClick={handleCopyPrompt}
                style={{
                  marginTop: 8,
                  padding: '7px 16px',
                  borderRadius: 8,
                  border: '1px solid #e8e0d8',
                  background: copied ? '#e8f5e9' : 'white',
                  color: copied ? '#2e7d32' : '#8a7e72',
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: "'Zen Maru Gothic', sans-serif",
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  width: '100%',
                }}
              >
                {copied ? '✅ コピーしました' : '📋 ChatGPTプロンプトをコピー'}
              </button>
            </div>
          )}
        </div>

        {/* JSON textarea */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              fontSize: 11,
              color: '#b0a595',
              fontWeight: 700,
              letterSpacing: 0.8,
              fontFamily: "'Zen Maru Gothic', sans-serif",
            }}
          >
            JSONをここに貼り付けてください *
          </div>
          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setError('');
            }}
            placeholder={'{\n  "nickname": "...",\n  "personality": "共感型",\n  ...\n}'}
            rows={18}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              border: error ? '1.5px solid #e74c3c' : '1.5px solid #e8e0d8',
              fontSize: 12,
              color: '#3a3530',
              fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
              lineHeight: 1.6,
              resize: 'vertical',
              outline: 'none',
              background: 'white',
              boxSizing: 'border-box',
              transition: 'border-color 0.2s',
            }}
          />
          {error && (
            <div
              style={{
                fontSize: 12,
                color: '#e74c3c',
                fontFamily: "'Zen Maru Gothic', sans-serif",
                lineHeight: 1.5,
              }}
            >
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* is_self チェックボックス */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            userSelect: 'none',
            fontFamily: "'Zen Maru Gothic', sans-serif",
            fontSize: 13,
            color: '#4a3f35',
          }}
        >
          <input
            type="checkbox"
            checked={isSelf}
            onChange={(e) => setIsSelf(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: '#E8654A', cursor: 'pointer' }}
          />
          これは自分の分身（is_self）です
        </label>

        {/* ボタン */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            style={{
              flex: 1,
              padding: '11px',
              borderRadius: 14,
              border: '1px solid #e8e0d8',
              background: 'white',
              color: '#9a8e82',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "'Zen Maru Gothic', sans-serif",
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isReady}
            style={{
              flex: 2,
              padding: '11px',
              borderRadius: 14,
              border: '2px solid #E8654A',
              background: isReady ? '#E8654A' : '#E8654A44',
              color: 'white',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "'Zen Maru Gothic', sans-serif",
              cursor: isReady ? 'pointer' : 'not-allowed',
            }}
          >
            {isSubmitting ? '登録中…' : '🤖 登録する'}
          </button>
        </div>
      </div>
    </div>
  );
}
