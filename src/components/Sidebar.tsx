import type { Conversation } from '../types/chat';
import { formatTime } from '../utils/time';
import './Sidebar.css';

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string;
  onSelect: (id: string) => void;
}

export function Sidebar({ conversations, activeConversationId, onSelect }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">消息</h1>
        <div className="sidebar-actions">
          <button className="icon-btn" title="新建会话">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="search-bar">
        <input type="text" placeholder="搜索聊天记录..." />
      </div>

      <div className="conversation-list">
        {conversations.map((conv) => {
          const lastMessage = conv.messages[conv.messages.length - 1];
          const isActive = conv.id === activeConversationId;
          const isMyLastMessage = lastMessage?.senderId === 'me';

          return (
            <div
              key={conv.id}
              className={`conversation-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(conv.id)}
            >
              <div className="avatar" style={{ background: conv.avatarColor }}>
                {conv.avatar}
                {conv.online && <span className="avatar-online" />}
              </div>
              <div className="conv-info">
                <div className="conv-top">
                  <span className="conv-name">{conv.name}</span>
                  <span className="conv-time">
                    {lastMessage ? formatTime(lastMessage.timestamp) : ''}
                  </span>
                </div>
                <div className="conv-preview">
                  {isMyLastMessage && lastMessage ? `我: ${lastMessage.content}` : lastMessage?.content || ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
