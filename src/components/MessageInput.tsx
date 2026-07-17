import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import './MessageInput.css';
import { formatDuration } from '../utils/voice';

interface MessageInputProps {
  onSend: (content: string) => void;
  onSendVoice: (audio: string, duration: number, mime: string) => void;
  placeholder?: string;
}

export default function MessageInput({ onSend, onSendVoice, placeholder }: MessageInputProps) {
  const [content, setContent] = useState('');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<{ mr: MediaRecorder; stream: MediaStream; start: number } | null>(null);
  const timerRef = useRef<number | null>(null);
  const cancelRef = useRef(false);
  const leftRef = useRef(false);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [content]);

  // 组件卸载时释放资源
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setContent('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const beginRecord = async () => {
    if (recording) return;
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      mr.onstop = () => {
        const duration = (Date.now() - recRef.current!.start) / 1000;
        stream.getTracks().forEach((t) => t.stop());
        // 时长过短（误触）或上滑取消则不发送
        if (!cancelRef.current && duration >= 1 && chunks.length > 0) {
          const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            onSendVoice(base64, Math.round(duration), mr.mimeType || 'audio/webm');
          };
          reader.readAsDataURL(blob);
        }
        setRecording(false);
        setSeconds(0);
      };
      mr.start();
      recRef.current = { mr, stream, start: Date.now() };
      cancelRef.current = false;
      leftRef.current = false;
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError('麦克风权限被拒绝，无法录音');
      setTimeout(() => setError(''), 2500);
    }
  };

  const endRecord = (cancel: boolean) => {
    const m = recRef.current;
    if (!m) return;
    cancelRef.current = cancel;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      if (m.mr.state !== 'inactive') m.mr.stop();
    } catch {
      /* noop */
    }
    recRef.current = null;
  };

  return (
    <div className="message-input-container">
      {error && <div className="rec-error">{error}</div>}

      <button
        className={`mic-btn ${recording ? 'recording' : ''}`}
        title={recording ? '松开发送，移出按钮取消' : '按住说话'}
        onPointerDown={(e) => {
          e.preventDefault();
          beginRecord();
        }}
        onPointerUp={() => {
          if (leftRef.current) endRecord(true);
          else endRecord(false);
        }}
        onPointerLeave={() => {
          leftRef.current = true;
          if (recording) endRecord(true);
        }}
        onPointerEnter={() => {
          leftRef.current = false;
        }}
      >
        {recording ? (
          <span className="mic-rec-dot" />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" fill="currentColor" />
            <path
              d="M19 11a7 7 0 0 1-14 0M12 18v3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>

      {recording ? (
        <div className="rec-indicator">
          <span className="rec-dot" />
          录音中 {formatDuration(seconds)} · 松开发送
        </div>
      ) : (
        <textarea
          ref={inputRef}
          className="message-input"
          placeholder={placeholder || '输入消息...'}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
      )}

      {!recording && (
        <button className="send-btn" onClick={handleSend} disabled={!content.trim()}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M2 10l16-8-8 16-2-6-6-2z"
              fill={content.trim() ? '#667eea' : '#ccc'}
              stroke={content.trim() ? '#667eea' : '#ccc'}
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
