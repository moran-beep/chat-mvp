import type { Message } from '../types/chat';
import { formatTime } from '../utils/time';

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
}

export function MessageBubble({ message, isMine }: MessageBubbleProps) {
  return (
    <div className={`message-row ${isMine ? 'sent' : 'received'}`}>
      <div className={`message-bubble ${isMine ? 'sent' : 'received'}`}>
        {message.content}
        <div className={`message-meta ${isMine ? 'sent' : 'received'}`}>
          {formatTime(message.timestamp)}
          {isMine && (
            <span className="message-status">
              {message.status === 'read' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                  <polyline points="12 6 9 9" opacity="0.6" />
                </svg>
              ) : message.status === 'delivered' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
