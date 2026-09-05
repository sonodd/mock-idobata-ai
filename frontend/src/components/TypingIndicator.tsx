import SpiritBlob from './SpiritBlob';

interface Props {
  agentName: string;
  color: string;
  bgColor: string;
  emoji?: string;
  isMe?: boolean;
}

export default function TypingIndicator({ agentName, color, bgColor, emoji = '', isMe = false }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexDirection: isMe ? 'row-reverse' : 'row',
        gap: 8,
        padding: '8px 0',
        opacity: 0.8,
        animation: 'fadeIn 0.3s ease',
      }}
    >
      <SpiritBlob color={color} size={30} isMe={isMe} emoji={emoji} />
      <div
        style={{
          background: bgColor,
          borderRadius: 14,
          padding: '8px 14px',
          display: 'flex',
          gap: 4,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: color,
              opacity: 0.6,
              animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 11, color: '#b0a595', fontFamily: "'Zen Maru Gothic', sans-serif" }}>
        {isMe ? 'あなたの分身' : agentName}が入力中…
      </span>
    </div>
  );
}
