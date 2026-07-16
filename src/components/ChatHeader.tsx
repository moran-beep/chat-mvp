import type { Conversation } from '../types/chat';

interface ChatHeaderProps {
  conversation: Conversation;
  isTyping: boolean;
}

export function ChatHeader({ conversation, isTyping }: ChatHeaderProps) {
  return (
    <div className="chat-header">
      <div className="avatar" style={{ background: conversation.avatarColor }}>
        {conversation.avatar}
      </div>
      <div className="chat-header-info">
        <div className="chat-header-name">{conversation.name}</div>
        <div className={`chat-header-status ${conversation.online ? 'online' : ''}`}>
          {isTyping ? (
            <>
              正在输入
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </>
          ) : conversation.online ? (
            '在线'
          ) : (
            conversation.lastSeen || '离线'
          )}
        </div>
      </div>
      <button className="icon-btn" title="更多">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
          <circle cx="5" cy="12" r="1" />
        </svg>
      </button>
    </div>
  );
}
