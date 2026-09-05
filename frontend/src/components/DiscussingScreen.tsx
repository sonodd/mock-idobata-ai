import { useRef, useEffect } from 'react';
import SpiritBlob from './SpiritBlob';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import type { Message } from '../types/message';
import type { Agent } from '../types/agent';

interface Props {
  messages: Message[];
  typingAgentNickname: string | null;
  agents: Agent[];
  totalMessages: number;
  isReturning?: boolean;
  onResetToIdle?: () => void;
}

export default function DiscussingScreen({
  messages,
  typingAgentNickname,
  agents,
  totalMessages,
  isReturning = false,
  onResetToIdle,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, typingAgentNickname]);

  const selfAgent = agents.find((a) => a.is_self);
  const typingAgent = typingAgentNickname
    ? agents.find((a) => a.nickname === typingAgentNickname) ?? null
    : null;

  return (
    <div>
      <div
        ref={scrollRef}
        style={{
          background: 'white',
          borderRadius: 18,
          padding: 14,
          boxShadow: '0 2px 16px rgba(90,77,63,0.07)',
          border: '1px solid #e8e0d8',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          maxHeight: '58vh',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: '#b0a595',
            textAlign: 'center',
            fontWeight: 500,
            padding: '2px 0 8px',
            borderBottom: '1px dashed #e8e0d8',
            fontFamily: "'Zen Maru Gothic', sans-serif",
          }}
        >
          🫧 あなたの分身が井戸端会議に参加中
        </div>

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} agents={agents} />
        ))}

        {typingAgent && (
          <TypingIndicator
            agentName={typingAgent.nickname}
            color={typingAgent.color ?? '#8b7355'}
            bgColor={typingAgent.bgColor ?? '#f5f0eb'}
            emoji={typingAgent.emoji ?? '💬'}
            isMe={typingAgent.is_self}
          />
        )}

        {isReturning && selfAgent && (
          <div
            style={{
              textAlign: 'center',
              padding: '16px 0',
              animation: 'fadeIn 0.5s ease',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: '#FFF0ED',
                borderRadius: 20,
                padding: '8px 16px',
              }}
            >
              <SpiritBlob
                color={selfAgent.color ?? '#E8654A'}
                size={22}
                isMe
                emoji={selfAgent.emoji ?? '🔥'}
                style={{ animation: 'float 1.5s ease-in-out infinite' }}
              />
              <span style={{ fontSize: 13, color: '#E8654A', fontWeight: 600, fontFamily: "'Zen Maru Gothic', sans-serif" }}>
                分身が帰ってきます…
              </span>
            </div>
          </div>
        )}
      </div>

      {!isReturning && (
        <div
          style={{
            marginTop: 10,
            textAlign: 'center',
            fontSize: 11,
            color: '#b0a595',
            fontWeight: 500,
            fontFamily: "'Zen Maru Gothic', sans-serif",
          }}
        >
          💬 {messages.length} / {totalMessages || '?'} やりとり
        </div>
      )}

      {onResetToIdle && (
        <div style={{ marginTop: 12 }}>
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
        </div>
      )}
    </div>
  );
}
