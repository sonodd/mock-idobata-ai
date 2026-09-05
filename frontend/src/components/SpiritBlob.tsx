import React from 'react';

interface Props {
  color: string;
  size?: number;
  isMe?: boolean;
  style?: React.CSSProperties;
  emoji?: string;
}

export default function SpiritBlob({ color, size = 40, isMe = false, style = {}, emoji = '' }: Props) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50% 45% 55% 48% / 48% 52% 45% 55%',
        background: isMe
          ? `radial-gradient(circle at 35% 35%, ${color}cc, ${color})`
          : `radial-gradient(circle at 35% 35%, ${color}88, ${color})`,
        boxShadow: isMe
          ? `0 0 ${size * 0.6}px ${color}55, 0 0 ${size * 0.2}px ${color}88`
          : `0 0 ${size * 0.4}px ${color}33`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        flexShrink: 0,
        border: isMe ? `2px solid ${color}` : 'none',
        ...style,
      }}
    >
      <span style={{ filter: 'brightness(1.2)' }}>{emoji}</span>
    </div>
  );
}
