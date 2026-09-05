import { useState, useEffect } from 'react';
import SpiritBlob from './SpiritBlob';
import type { Message } from '../types/message';
import type { Agent } from '../types/agent';

interface Props {
  message: Message;
  agents: Agent[];
}

export default function MessageBubble({ message, agents }: Props) {
  const agent = agents.find((a) => a.nickname === message.agent_nickname);
  const isMe = agent?.is_self ?? false;
  const color = agent?.color ?? '#8b7355';
  const bgColor = agent?.bgColor ?? '#f5f0eb';
  const emoji = agent?.emoji ?? '💬';

  const [showReactions, setShowReactions] = useState(false);

  useEffect(() => {
    if (message.reactions && message.reactions.length > 0) {
      const t = setTimeout(() => setShowReactions(true), 800);
      return () => clearTimeout(t);
    }
  }, [message.reactions]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isMe ? 'row-reverse' : 'row',
        gap: 8,
        animation: 'slideUp 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
        marginBottom: 4,
      }}
    >
      <SpiritBlob
        color={color}
        size={34}
        isMe={isMe}
        emoji={emoji}
        style={{ marginTop: 4 }}
      />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          maxWidth: '80%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: isMe ? 'flex-end' : 'flex-start',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            marginBottom: 3,
            flexDirection: isMe ? 'row-reverse' : 'row',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 12, color, fontFamily: "'Zen Maru Gothic', sans-serif" }}>
            {isMe ? 'あなたの分身' : message.agent_nickname}
          </span>
          {!isMe && agent?.personality && (
            <span style={{ fontSize: 10, color: '#b0a595', fontFamily: "'Zen Maru Gothic', sans-serif" }}>
              {agent.personality}
            </span>
          )}
        </div>

        {message.reply_to && (
          <div
            style={{
              fontSize: 10,
              color: '#b0a595',
              marginBottom: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontFamily: "'Zen Maru Gothic', sans-serif",
            }}
          >
            ↩ {message.reply_to}に返信
          </div>
        )}

        <div
          style={{
            background: isMe
              ? 'linear-gradient(135deg, #E8654A, #d4563d)'
              : bgColor,
            borderRadius: isMe ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
            padding: '11px 15px',
            fontSize: 13.5,
            lineHeight: 1.75,
            color: isMe ? 'white' : '#3a3530',
            fontFamily: "'Zen Maru Gothic', sans-serif",
          }}
        >
          {message.content}
        </div>

        {showReactions && message.reactions && message.reactions.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginTop: 4,
              animation: 'popIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {message.reactions.map((r, i) => (
              <span
                key={i}
                title={r.agent_nickname}
                style={{
                  background: 'white',
                  borderRadius: 20,
                  padding: '2px 8px',
                  fontSize: 12,
                  border: '1px solid #e8e0d8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}
              >
                {r.emoji}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
