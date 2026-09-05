import { useState, useEffect } from 'react';
import SpiritBlob from './SpiritBlob';
import type { ReturnReportData } from '../types/report';
import type { Message } from '../types/message';
import type { Agent } from '../types/agent';
import MessageBubble from './MessageBubble';

interface Props {
  report: ReturnReportData | null;
  messages: Message[];
  agents: Agent[];
  selfColor: string;
  selfEmoji: string;
  onReset: () => void;
  onResetToIdle?: () => void;
  onFollowUp?: (question: string) => void;
  question?: string;
}

export default function ReturnReport({ report, messages, agents, selfColor, selfEmoji, onReset, onResetToIdle, onFollowUp, question }: Props) {
  const [step, setStep] = useState(0);
  const [viewMode, setViewMode] = useState<'report' | 'log'>('report');
  const [followUpText, setFollowUpText] = useState('');
  const [showFollowUp, setShowFollowUp] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 600),
      setTimeout(() => setStep(2), 1200),
      setTimeout(() => setStep(3), 1800),
      setTimeout(() => setStep(4), 2400),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const highlightAgent = report ? agents.find((a) => a.nickname === report.highlight_agent) : null;
  const highlightAgentDetail = highlightAgent
    ? [
        highlightAgent.expertise.length > 0 ? `専門: ${highlightAgent.expertise.join('・')}` : null,
        highlightAgent.background?.label ? `背景: ${highlightAgent.background.label}` : null,
      ].filter(Boolean).join(' / ') || 'あなたの相談が誰かの心に響きました'
    : 'あなたの相談が誰かの心に響きました';

  const items = report
    ? [
        {
          icon: '💬',
          label: '会話ターン',
          value: `${report.total_turns}回のやりとり`,
          detail: `${agents.filter((a) => !a.is_self).length}人の代理AIと議論しました`,
        },
        {
          icon: '❤️',
          label: 'もらったリアクション',
          value: `${report.total_reactions}件`,
          detail: agents.filter((a) => !a.is_self).map((a) => a.nickname).join('・') + 'から',
        },
        {
          icon: '🌟',
          label: `あなた（送り出した人）にとって最も心に響いた発言（${report.highlight_agent}より）`,
          value: `「${report.highlight_quote}」`,
          detail: highlightAgentDetail,
        },
        {
          icon: '🗺️',
          label: 'あなたが得られたヒント',
          value: report.hints[0] ?? 'まとめ中…',
          detail: report.hints.slice(1).join(' / '),
        },
      ]
    : [
        { icon: '💬', label: '会話ターン', value: `${messages.length}回のやりとり`, detail: '議論が完了しました' },
        { icon: '❤️', label: 'リアクション', value: `${messages.reduce((s, m) => s + (m.reactions?.length ?? 0), 0)}件`, detail: '感想が届きました' },
        { icon: '🌟', label: '印象的な発言', value: (messages[messages.length - 1]?.content ?? '').slice(0, 30) + '…', detail: '' },
        { icon: '🗺️', label: '会話完了', value: '会話ログをご確認ください', detail: '' },
      ];

  return (
    <div style={{ padding: '0 0 20px' }}>
      {/* タブ */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, padding: '0 14px' }}>
        {([
          { id: 'report', label: '📋 帰還レポート' },
          { id: 'log', label: '💬 会話ログ' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setViewMode(tab.id)}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 12,
              border: viewMode === tab.id ? '2px solid #E8654A' : '1px solid #e8e0d8',
              background: viewMode === tab.id ? '#FFF0ED' : 'white',
              color: viewMode === tab.id ? '#E8654A' : '#8a7e72',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "'Zen Maru Gothic', sans-serif",
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {viewMode === 'report' && (
        <div style={{ padding: '0 14px', animation: 'fadeIn 0.6s ease' }}>
          {/* ヘッダー */}
          <div style={{ textAlign: 'center', marginBottom: 24, animation: 'slideUp 0.5s ease' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'linear-gradient(135deg, #FFF0ED, #fdf8f3)',
                borderRadius: 20,
                padding: '10px 20px',
                border: '2px solid #E8654A33',
                marginBottom: 14,
              }}
            >
              <SpiritBlob color={selfColor} size={32} isMe emoji={selfEmoji} />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#E8654A',
                  fontFamily: "'Zen Maru Gothic', sans-serif",
                }}
              >
                分身が帰ってきました！
              </span>
            </div>
            {question && (
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#4a3f35',
                  fontFamily: "'Zen Maru Gothic', sans-serif",
                  background: '#f9f5f0',
                  borderRadius: 10,
                  padding: '7px 14px',
                  marginBottom: 8,
                  border: '1px solid #e8e0d8',
                }}
              >
                📌 {question}
              </div>
            )}
            <p
              style={{
                fontSize: 13,
                color: '#8a7e72',
                lineHeight: 1.6,
                fontFamily: "'Zen Maru Gothic', sans-serif",
              }}
            >
              あなたの代理AIが井戸端会議で相談して、
              <br />
              たくさんのアドバイスと承認をもらって帰ってきました。
            </p>
          </div>

          {/* レポートカード */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((item, i) => (
              <div
                key={i}
                style={{
                  background: 'white',
                  borderRadius: 16,
                  padding: '14px 16px',
                  border: '1px solid #e8e0d8',
                  boxShadow: '0 2px 10px rgba(90,77,63,0.06)',
                  opacity: step > i ? 1 : 0,
                  transform: step > i ? 'translateY(0)' : 'translateY(10px)',
                  transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{item.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#b0a595', fontWeight: 600, marginBottom: 2, fontFamily: "'Zen Maru Gothic', sans-serif" }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#4a3f35', fontFamily: "'Zen Maru Gothic', sans-serif" }}>
                      {item.value}
                    </div>
                    {item.detail && (
                      <div style={{ fontSize: 12, color: '#9a8e82', marginTop: 2, fontFamily: "'Zen Maru Gothic', sans-serif" }}>
                        {item.detail}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {step >= 4 && (
            <div
              style={{
                marginTop: 10,
                background: 'white',
                borderRadius: 16,
                padding: '14px 16px',
                border: '1px solid #e8e0d8',
                boxShadow: '0 2px 10px rgba(90,77,63,0.06)',
                animation: 'fadeIn 0.5s ease',
              }}
            >
              <div style={{ fontSize: 11, color: '#b0a595', fontWeight: 600, marginBottom: 10, fontFamily: "'Zen Maru Gothic', sans-serif" }}>
                👥 参加者
              </div>
              {agents.filter((a) => !a.is_self).map((agent) => {
                const speakCount = messages.filter((m) => m.agent_nickname === agent.nickname).length;
                const reactionCount = messages.reduce(
                  (s, m) => s + (m.reactions?.filter((r) => r.agent_nickname === agent.nickname).length ?? 0),
                  0
                );
                return (
                  <div
                    key={agent.nickname}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px dashed #f0e8e0' }}
                  >
                    <SpiritBlob color={agent.color ?? '#8B7355'} size={28} emoji={agent.emoji ?? '🌿'} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#4a3f35', fontFamily: "'Zen Maru Gothic', sans-serif" }}>
                        {agent.nickname}
                      </div>
                      <div style={{ fontSize: 11, color: '#9a8e82', fontFamily: "'Zen Maru Gothic', sans-serif" }}>
                        発言 {speakCount}回 / リアクション {reactionCount}件
                      </div>
                    </div>
                    {speakCount === 0 && (
                      <span style={{ fontSize: 11, color: '#E8654A', fontWeight: 700 }}>⚠️ 未参加</span>
                    )}
                  </div>
                );
              })}
              {(() => {
                const expectedCount = agents.filter((a) => !a.is_self).length;
                const actualParticipants = new Set(
                  messages
                    .filter((m) => agents.some((a) => a.nickname === m.agent_nickname && !a.is_self))
                    .map((m) => m.agent_nickname)
                ).size;
                return expectedCount !== actualParticipants ? (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '6px 10px',
                      background: '#FFF0ED',
                      borderRadius: 8,
                      fontSize: 11,
                      color: '#E8654A',
                      fontFamily: "'Zen Maru Gothic', sans-serif",
                    }}
                  >
                    ⚠️ 参加者数の差異: 登録{expectedCount}名のうち{actualParticipants}名が発言しました
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {step >= 4 && (
            <div style={{ marginTop: 20, textAlign: 'center', animation: 'popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
              <div
                style={{
                  display: 'inline-block',
                  background: 'linear-gradient(135deg, #E8654A15, #C4922A15)',
                  borderRadius: 20,
                  padding: '14px 24px',
                  border: '2px dashed #E8654A44',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 4 }}>🏅</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#4a3f35', fontFamily: "'Zen Maru Gothic', sans-serif" }}>
                  あなたの経験が、{agents.filter((a) => !a.is_self).length}人の隣人に届きました
                </div>
                <div style={{ fontSize: 11, color: '#9a8e82', marginTop: 4, fontFamily: "'Zen Maru Gothic', sans-serif" }}>
                  自分が話さなくても、分身が誰かの役に立つ。
                  <br />
                  それが井戸端会議 AI。
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {viewMode === 'log' && (
        <div
          style={{
            background: 'white',
            borderRadius: 18,
            padding: 14,
            margin: '0 14px',
            boxShadow: '0 2px 16px rgba(90,77,63,0.07)',
            border: '1px solid #e8e0d8',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            maxHeight: '55vh',
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: 11, color: '#b0a595', textAlign: 'center', fontWeight: 500, padding: '2px 0 8px', borderBottom: '1px dashed #e8e0d8' }}>
            🫧 井戸端会議の全会話ログ
          </div>
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} agents={agents} />
          ))}
        </div>
      )}

      {/* 新しい相談ボタン */}
      {step >= 4 && (
        <div style={{ padding: '20px 14px 0', animation: 'fadeIn 0.5s ease', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {onFollowUp && (
            <>
              {showFollowUp ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    value={followUpText}
                    onChange={(e) => setFollowUpText(e.target.value)}
                    placeholder="追加で聞きたいことを入力してください…"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 12,
                      border: '2px solid #E8654A66',
                      background: '#FFF0ED',
                      color: '#4a3f35',
                      fontSize: 14,
                      fontFamily: "'Zen Maru Gothic', sans-serif",
                      resize: 'none',
                      minHeight: 80,
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setShowFollowUp(false)}
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
                        cursor: 'pointer',
                      }}
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={() => {
                        if (followUpText.trim()) {
                          onFollowUp(followUpText.trim());
                          setFollowUpText('');
                          setShowFollowUp(false);
                        }
                      }}
                      disabled={!followUpText.trim()}
                      style={{
                        flex: 2,
                        padding: '11px',
                        borderRadius: 14,
                        border: '2px solid #E8654A',
                        background: followUpText.trim() ? '#E8654A' : '#E8654A44',
                        color: 'white',
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: "'Zen Maru Gothic', sans-serif",
                        cursor: followUpText.trim() ? 'pointer' : 'not-allowed',
                      }}
                    >
                      💬 送信する
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setShowFollowUp(true)}
                    style={{
                      width: '100%',
                      padding: '13px',
                      borderRadius: 16,
                      border: '2px solid #E8654A',
                      background: '#E8654A',
                      color: 'white',
                      fontSize: 14,
                      fontWeight: 700,
                      fontFamily: "'Zen Maru Gothic', sans-serif",
                      cursor: 'pointer',
                    }}
                  >
                    💬 追加で聞く
                  </button>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#9a8e82',
                      textAlign: 'center',
                      fontFamily: "'Zen Maru Gothic', sans-serif",
                    }}
                  >
                    ※ 追加の会話ログは上の「💬 会話ログ」タブで確認できます
                  </div>
                </>
              )}
            </>
          )}
          <button
            onClick={onReset}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: 16,
              border: '2px solid #E8654A44',
              background: 'white',
              color: '#E8654A',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "'Zen Maru Gothic', sans-serif",
              cursor: 'pointer',
            }}
          >
            🔄 新しい相談をする
          </button>
          {onResetToIdle && (
            <button
              onClick={onResetToIdle}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: 14,
                border: '1px solid #e8e0d8',
                background: 'white',
                color: '#9a8e82',
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "'Zen Maru Gothic', sans-serif",
                cursor: 'pointer',
              }}
            >
              ← トップに戻る
            </button>
          )}
        </div>
      )}
    </div>
  );
}
