import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import './MessageInput.css';

interface MessageInputProps {
  onSend: (content: string) => void;
  placeholder?: string;
}

export default function MessageInput({ onSend, placeholder }: MessageInputProps) {
  const [content, setContent] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [content]);

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

  return (
    <div className="message-input-container">
      <textarea
        ref={inputRef}
        className="message-input"
        placeholder={placeholder || '输入消息...'}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
      />
      <button
        className="send-btn"
        onClick={handleSend}
        disabled={!content.trim()}
      >
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
    </div>
  );
}
