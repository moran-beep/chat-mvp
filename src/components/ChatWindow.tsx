import { useEffect, useRef } from 'react';
import type { Conversation } from '../types/chat';
import { MessageBubble } from './MessageBubble';
import { shouldShowDateSeparator, formatDateSeparator } from '../utils/time';

interface ChatWindowProps {
  conversation: Conversation;
  isTyping: boolean;
}

export function ChatWindow({ conversation, isTyping }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation.messages.length, isTyping]);

  let lastTimestamp: number | null = null;

  return (
    <div className="messages-container">
      {conversation.messages.map((msg) => {
        const showDate = shouldShowDateSeparator(msg.timestamp, lastTimestamp);
        lastTimestamp = msg.timestamp;
        const isMine = msg.senderId === 'me';

        return (
          <div key={msg.id}>
            {showDate && (
              <div className="date-separator">
                <span>{formatDateSeparator(msg.timestamp)}</span>
              </div>
            )}
            <MessageBubble message={msg} isMine={isMine} />
          </div>
        );
      })}

      {isTyping && (
        <div className="typing-indicator">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
