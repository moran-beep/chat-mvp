import { formatTime } from '../utils/time';
import type { Database } from '../types/supabase';

type Message = Database['public']['Tables']['messages']['Row'];

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
}

export default function MessageBubble({ message, isOwn, showAvatar }: MessageBubbleProps) {
  return (
    <div className={`message-wrapper ${isOwn ? 'own' : ''}`}>
      {showAvatar && !isOwn && (
        <div className="message-avatar">
          {message.username.charAt(0).toUpperCase()}
        </div>
      )}
      {!showAvatar && !isOwn && <div className="message-avatar-spacer" />}
      <div className={`message-bubble ${isOwn ? 'own' : ''}`}>
        {showAvatar && !isOwn && (
          <div className="message-sender">{message.username}</div>
        )}
        <div className="message-text">{message.content}</div>
        <div className="message-time">
          {formatTime(message.created_at)}
        </div>
      </div>
    </div>
  );
}
