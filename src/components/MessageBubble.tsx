import { useState, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { formatTime } from '../utils/time';
import { parseVoice, formatDuration, VoicePayload } from '../utils/voice';
import { parseImage, ImagePayload } from '../utils/image';
import type { Database } from '../types/supabase';

type Message = Database['public']['Tables']['messages']['Row'];

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
}

export default function MessageBubble({ message, isOwn, showAvatar }: MessageBubbleProps) {
  const voice = parseVoice(message.content);
  if (voice) {
    return <VoiceBubble message={message} isOwn={isOwn} showAvatar={showAvatar} voice={voice} />;
  }

  const image = parseImage(message.content);
  if (image) {
    return <ImageBubble message={message} isOwn={isOwn} showAvatar={showAvatar} image={image} />;
  }

  return (
    <div className={`message-wrapper ${isOwn ? 'own' : ''}`}>
      {showAvatar && !isOwn && (
        <div className="message-avatar">{message.username.charAt(0).toUpperCase()}</div>
      )}
      {!showAvatar && !isOwn && <div className="message-avatar-spacer" />}
      <div className={`message-bubble ${isOwn ? 'own' : ''}`}>
        {showAvatar && !isOwn && <div className="message-sender">{message.username}</div>}
        <div className="message-text">{message.content}</div>
        <div className="message-time">{formatTime(message.created_at)}</div>
      </div>
    </div>
  );
}

function VoiceBubble({
  message,
  isOwn,
  showAvatar,
  voice,
}: {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  voice: VoicePayload;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const src = `data:${voice.mime};base64,${voice.audio}`;

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  const seekTo = (clientX: number, el: HTMLElement) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    a.currentTime = ratio * a.duration;
    setProgress(ratio);
  };

  const onWaveDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    seekTo(e.clientX, e.currentTarget);
    const a = audioRef.current;
    if (a && a.paused) a.play().catch(() => {});
  };

  const onWaveMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    seekTo(e.clientX, e.currentTarget);
  };

  const onWaveUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  return (
    <div className={`message-wrapper ${isOwn ? 'own' : ''}`}>
      {showAvatar && !isOwn && (
        <div className="message-avatar">{message.username.charAt(0).toUpperCase()}</div>
      )}
      {!showAvatar && !isOwn && <div className="message-avatar-spacer" />}
      <div className={`message-bubble voice-bubble ${isOwn ? 'own' : ''}`}>
        {showAvatar && !isOwn && <div className="message-sender">{message.username}</div>}
        <div className="voice-row">
          <button className="voice-play" onClick={toggle} aria-label={playing ? '暂停' : '播放'}>
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <div
            className="voice-wave"
            onPointerDown={onWaveDown}
            onPointerMove={onWaveMove}
            onPointerUp={onWaveUp}
            onPointerCancel={onWaveUp}
          >
            <div className="voice-wave-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="voice-duration">{formatDuration(voice.dur)}</span>
        </div>
        <audio
          ref={audioRef}
          src={src}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
          onTimeUpdate={(e) => {
            if (dragging) return;
            const a = e.currentTarget;
            if (a.duration) setProgress(a.currentTime / a.duration);
          }}
        />
        <div className="message-time">{formatTime(message.created_at)}</div>
      </div>
    </div>
  );
}

function ImageBubble({
  message,
  isOwn,
  showAvatar,
  image,
}: {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  image: ImagePayload;
}) {
  const [zoom, setZoom] = useState(false);
  const src = `data:${image.mime};base64,${image.data}`;

  return (
    <div className={`message-wrapper ${isOwn ? 'own' : ''}`}>
      {showAvatar && !isOwn && (
        <div className="message-avatar">{message.username.charAt(0).toUpperCase()}</div>
      )}
      {!showAvatar && !isOwn && <div className="message-avatar-spacer" />}
      <div className={`message-bubble image-bubble ${isOwn ? 'own' : ''}`}>
        {showAvatar && !isOwn && <div className="message-sender">{message.username}</div>}
        <button className="message-image" onClick={() => setZoom(true)}>
          <img src={src} alt="图片" loading="lazy" />
        </button>
        <div className="message-time">{formatTime(message.created_at)}</div>
      </div>
      {zoom && (
        <div className="image-lightbox" onClick={() => setZoom(false)}>
          <img src={src} alt="图片" />
        </div>
      )}
    </div>
  );
}
