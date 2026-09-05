import React, { useEffect, useState } from 'react';
import SpiritBlob from './SpiritBlob';
import type { Agent } from '../types/agent';

interface Props {
  question: string;
  onQuestionChange: (q: string) => void;
  onSubmit: () => void;
  agents: Agent[];
  onRegisterAgent: () => void;
  onViewAgent: (agent: Agent) => void;
  threadHistorySlot?: React.ReactNode;
}

const GUIDE_STEPS = [
  { label: '代理AIを登録' },
  { label: '質問を入力' },
  { label: '会議開始' },
  { label: 'レポート確認' },
];

export default function IdleScreen({ question, onQuestionChange, onSubmit, agents, onRegisterAgent, onViewAgent, threadHistorySlot }: Props) {
  const selfAgent = agents.find((a) => a.is_self);
  const otherAgents = agents.filter((a) => !a.is_self);

  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissed(window.localStorage.getItem('guideDismissed') === '1');
    }
  }, []);

  const isGuideExpanded = agents.length === 0 || !dismissed;

  const toggleGuide = () => {
    if (agents.length === 0) return;
    const next = !dismissed;
    setDismissed(next);
    if (typeof window !== 'undefined') {
      if (next) window.localStorage.setItem('guideDismissed', '1');
      else window.localStorage.removeItem('guideDismissed');
    }
  };

  const noAgents = agents.length === 0;

  return (
    <div style={{ animation: 'fadeIn 0.5s ease' }}>
      {/* 操作手順ガイド */}
      <div
        style={{
          background: noAgents ? '#fff5f3' : 'white',
          borderRadius: 18,
          padding: '12px 18px',
          marginBottom: 12,
          boxShadow: '0 2px 16px rgba(90,77,63,0.07)',
          border: noAgents ? '1.5px solid #E8654A' : '1px solid #e8e0d8',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: noAgents ? 'default' : 'pointer',
            userSelect: 'none',
          }}
          onClick={toggleGuide}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: noAgents ? '#E8654A' : '#b0a595',
              fontWeight: 700,
              letterSpacing: 0.8,
              fontFamily: "'Zen Maru Gothic', sans-serif",
            }}
          >
            <span style={{ fontSize: 13 }}>📋</span>
            使い方ガイド
            {noAgents && (
              <span
                style={{
                  marginLeft: 4,
                  fontSize: 10,
                  background: '#E8654A',
                  color: 'white',
                  borderRadius: 8,
                  padding: '1px 6px',
                  fontWeight: 700,
                }}
              >
                まずここから！
              </span>
            )}
          </div>
          {!noAgents && (
            <span style={{ fontSize: 11, color: '#b0a595', lineHeight: 1 }}>
              {isGuideExpanded ? '▲' : '▼'}
            </span>
          )}
        </div>

        {isGuideExpanded && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {GUIDE_STEPS.map((step, idx) => {
              const isDone = idx === 0 && agents.length > 0;
              const isCurrent = (idx === 0 && agents.length === 0) || (idx === 1 && agents.length > 0);
              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: isDone ? '#E8654A' : isCurrent ? '#fff0ed' : '#f0ebe5',
                      border: isCurrent ? '1.5px solid #E8654A' : isDone ? 'none' : '1px solid #ddd5cc',
                      color: isDone ? 'white' : isCurrent ? '#E8654A' : '#c0b5aa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {isDone ? '✓' : `${idx + 1}`}
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      color: isDone ? '#E8654A' : isCurrent ? '#4a3f35' : '#b0a595',
                      fontWeight: isCurrent || isDone ? 700 : 400,
                      fontFamily: "'Zen Maru Gothic', sans-serif",
                    }}
                  >
                    {step.label}
                  </span>
                  {isCurrent && !isDone && (
                    <span
                      style={{
                        fontSize: 10,
                        color: '#E8654A',
                        background: '#fff0ed',
                        border: '1px solid #E8654A44',
                        borderRadius: 6,
                        padding: '1px 5px',
                        fontWeight: 700,
                        fontFamily: "'Zen Maru Gothic', sans-serif",
                      }}
                    >
                      ← 今ここ
                    </span>
                  )}
                </div>
              );
            })}
            {noAgents && (
              <button
                onClick={(e) => { e.stopPropagation(); onRegisterAgent(); }}
                style={{
                  marginTop: 6,
                  padding: '9px 16px',
                  background: '#E8654A',
                  border: 'none',
                  borderRadius: 12,
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: "'Zen Maru Gothic', sans-serif",
                  width: '100%',
                }}
              >
                🤖 代理AIを登録する
              </button>
            )}
          </div>
        )}
      </div>

      {/* 過去の会議履歴スロット（使い方ガイドと質問入力の間） */}
      {threadHistorySlot}

      {/* 質問入力 */}
      <div
        style={{
          background: 'white',
          borderRadius: 18,
          padding: '16px 18px',
          marginBottom: 12,
          boxShadow: '0 2px 16px rgba(90,77,63,0.07)',
          border: '1px solid #e8e0d8',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 10,
            fontSize: 10,
            color: '#b0a595',
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          <span style={{ fontSize: 13 }}>📮</span> YOUR QUESTION
        </div>
        <textarea
          value={question}
          onChange={(e) => onQuestionChange(e.target.value)}
          placeholder="何か相談したいことはありますか？"
          style={{
            width: '100%',
            minHeight: 80,
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontSize: 15,
            fontWeight: 500,
            color: '#3a3530',
            lineHeight: 1.6,
            fontFamily: "'Zen Maru Gothic', sans-serif",
            background: 'transparent',
          }}
        />
      </div>

      {/* 自分の分身 */}
      {selfAgent && (
        <div
          style={{
            background: 'white',
            borderRadius: 18,
            padding: '16px 18px',
            marginBottom: 10,
            boxShadow: '0 2px 16px rgba(90,77,63,0.07)',
            border: `2px solid ${selfAgent.color ?? '#E8654A'}22`,
          }}
        >
          <p style={{ fontSize: 12, color: selfAgent.color ?? '#E8654A', fontWeight: 700, marginBottom: 10, fontFamily: "'Zen Maru Gothic', sans-serif" }}>
            🔥 あなたの分身（代理AI）
          </p>
          <div
            onClick={() => onViewAgent(selfAgent)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              borderRadius: 14,
              background: selfAgent.bgColor ?? '#FFF0ED',
              cursor: 'pointer',
            }}
          >
            <SpiritBlob color={selfAgent.color ?? '#E8654A'} size={42} isMe emoji={selfAgent.emoji ?? '🔥'} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: selfAgent.color ?? '#E8654A', fontFamily: "'Zen Maru Gothic', sans-serif" }}>
                {selfAgent.nickname}
              </div>
              <div style={{ fontSize: 11, color: '#9a8e82', marginTop: 2, fontFamily: "'Zen Maru Gothic', sans-serif" }}>
                {selfAgent.personality}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 参加者一覧 */}
      {otherAgents.length > 0 && (
        <div
          style={{
            background: 'white',
            borderRadius: 18,
            padding: '16px 18px',
            marginBottom: 10,
            boxShadow: '0 2px 16px rgba(90,77,63,0.07)',
            border: '1px solid #e8e0d8',
          }}
        >
          <p style={{ fontSize: 12, color: '#8a7e72', fontWeight: 700, marginBottom: 10, fontFamily: "'Zen Maru Gothic', sans-serif" }}>
            🫧 井戸端会議に集まった隣人たち
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {otherAgents.map((a) => (
              <div
                key={a.id}
                onClick={() => onViewAgent(a)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 12,
                  background: a.bgColor ?? '#f5f0eb',
                  cursor: 'pointer',
                }}
              >
                <SpiritBlob color={a.color ?? '#8b7355'} size={32} emoji={a.emoji ?? '💬'} />
                <div>
                  <span style={{ fontWeight: 700, fontSize: 13, color: a.color ?? '#8b7355', fontFamily: "'Zen Maru Gothic', sans-serif" }}>
                    {a.nickname}
                  </span>
                  <span style={{ fontSize: 11, color: '#9a8e82', marginLeft: 6, fontFamily: "'Zen Maru Gothic', sans-serif" }}>
                    {a.personality}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 代理AI登録ボタン（常時表示） */}
      <button
        onClick={onRegisterAgent}
        style={{
          marginBottom: 14,
          padding: '8px 18px',
          background: 'transparent',
          border: '1.5px dashed #E8654A',
          borderRadius: 12,
          color: '#E8654A',
          fontWeight: 700,
          cursor: 'pointer',
          fontSize: 13,
          fontFamily: "'Zen Maru Gothic', sans-serif",
          width: '100%',
        }}
      >
        ＋ 代理AIを登録する
      </button>

      {/* 送出ボタン */}
      <button
        onClick={onSubmit}
        disabled={!question.trim() || agents.length === 0}
        style={{
          width: '100%',
          padding: '15px',
          borderRadius: 16,
          border: 'none',
          background: question.trim() && agents.length > 0
            ? 'linear-gradient(135deg, #E8654A, #d4563d)'
            : '#e0d8d0',
          color: 'white',
          fontSize: 15,
          fontWeight: 700,
          fontFamily: "'Zen Maru Gothic', sans-serif",
          cursor: question.trim() && agents.length > 0 ? 'pointer' : 'not-allowed',
          boxShadow: question.trim() && agents.length > 0
            ? '0 4px 20px rgba(232,101,74,0.3)'
            : 'none',
          animation: question.trim() && agents.length > 0
            ? 'pulse 2.5s ease-in-out infinite'
            : 'none',
          letterSpacing: 0.5,
          transition: 'background 0.3s',
        }}
      >
        🫧 分身を井戸端会議に送り出す
      </button>
    </div>
  );
}
