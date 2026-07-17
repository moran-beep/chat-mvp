import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import './MessageInput.css';
import { formatDuration } from '../utils/voice';

interface MessageInputProps {
  onSend: (content: string) => void;
  onSendVoice: (audio: string, duration: number, mime: string) => void;
  placeholder?: string;
}

// 上滑超过该距离(px)进入“取消发送”模式
const CANCEL_THRESHOLD = 60;

// 选择当前浏览器支持的录音 MIME（iOS Safari 用 audio/mp4，桌面 Chrome 用 webm/opus）
function pickMime(): string {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return '';
}

export default function MessageInput({ onSend, onSendVoice, placeholder }: MessageInputProps) {
  const [content, setContent] = useState('');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [cancelMode, setCancelMode] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<{ mr: MediaRecorder; stream: MediaStream; start: number } | null>(null);
  const timerRef = useRef<number | null>(null);
  const cancelRef = useRef(false);
  const pendingReleaseRef = useRef(false);
  const pendingCancelRef = useRef(false);
  const startYRef = useRef(0);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [content]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
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
  };

  const beginRecord = async () => {
    if (recording) return;
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMime();
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      const start = Date.now();
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      mr.onstop = () => {
        const duration = (Date.now() - start) / 1000;
        stream.getTracks().forEach((t) => t.stop());
        if (!cancelRef.current && duration >= 1 && chunks.length > 0) {
          const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            if (base64) onSendVoice(base64, Math.round(duration), mr.mimeType || 'audio/webm');
          };
          reader.readAsDataURL(blob);
        } else if (!cancelRef.current) {
          setError('说话时间太短');
          setTimeout(() => setError(''), 1500);
        }
        recRef.current = null;
        setRecording(false);
        setSeconds(0);
        setCancelMode(false);
      };
      mr.start();
      recRef.current = { mr, stream, start };
      cancelRef.current = false;
      setRecording(true);
      setSeconds(0);
      setCancelMode(false);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
      if (pendingReleaseRef.current) {
        pendingReleaseRef.current = false;
        endRecord(pendingCancelRef.current);
      }
    } catch {
      setError('麦克风权限被拒绝，无法录音');
      setTimeout(() => setError(''), 2500);
    }
  };

  const onMicDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    startYRef.current = e.clientY;
    setCancelMode(false);
    pendingReleaseRef.current = false;
    pendingCancelRef.current = false;
    beginRecord();
  };

  const onMicMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!recording) return;
    const dy = e.clientY - startYRef.current;
    setCancelMode(dy < -CANCEL_THRESHOLD);
  };

  const onMicUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    if (!recRef.current) {
      // 录音尚未真正建立（典型：iOS 麦克风权限弹窗期间用户已松手）
      // 不立即中止，等 getUserMedia 完成、mr.start 后再按用户意图结束
      pendingReleaseRef.current = true;
      pendingCancelRef.current = cancelMode;
      return;
    }
    const cancel = cancelMode;
    setCancelMode(false);
    endRecord(cancel);
  };

  return (
    <div className="message-input-container">
      {error && <div className="rec-error">{error}</div>}
      <button
        className={`mic-btn ${recording ? 'recording' : ''} ${cancelMode ? 'cancel' : ''}`}
        title={recording ? (cancelMode ? '松开取消' : '上滑取消 · 松开发送') : '按住说话'}
        onPointerDown={onMicDown}
        onPointerMove={onMicMove}
        onPointerUp={onMicUp}
        onPointerCancel={onMicUp}
      >
        {recording ? (
          cancelMode ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : (
            <span className="mic-rec-dot" />
          )
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" fill="currentColor" />
            <path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {recording ? (
        <div className={`rec-indicator ${cancelMode ? 'cancel' : ''}`}>
          {cancelMode ? (
            '松开手指，取消发送'
          ) : (
            <>
              <span className="rec-dot" />
              录音中 {formatDuration(seconds)} · 松开发送
            </>
          )}
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
