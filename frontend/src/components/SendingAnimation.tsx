import SpiritBlob from './SpiritBlob';

interface Props {
  selfColor: string;
  selfEmoji: string;
}

export default function SendingAnimation({ selfColor, selfEmoji }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '50px 20px',
        gap: 20,
        animation: 'fadeIn 0.5s ease',
      }}
    >
      <div style={{ position: 'relative', width: 120, height: 120 }}>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            animation: 'sendPulse 2s ease-in-out infinite',
          }}
        >
          <SpiritBlob color={selfColor} size={48} isMe emoji={selfEmoji} />
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <p
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#4a3f35',
            marginBottom: 6,
            fontFamily: "'Zen Maru Gothic', sans-serif",
          }}
        >
          あなたの分身を送り出しています…
        </p>
        <p
          style={{
            fontSize: 13,
            color: '#9a8e82',
            fontFamily: "'Zen Maru Gothic', sans-serif",
          }}
        >
          井戸端会議で相談してきます
        </p>
      </div>
    </div>
  );
}
