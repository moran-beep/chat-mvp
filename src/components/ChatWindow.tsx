import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import ChatHeader from './ChatHeader';
import type { Database } from '../types/supabase';

type Message = Database['public']['Tables']['messages']['Row'];
type Room = Database['public']['Tables']['rooms']['Row'];

interface ChatWindowProps {
  messages: Message[];
  activeRoom: Room;
  username: string;
  callActive: boolean;
  onCall: () => void;
}

export default function ChatWindow({ messages, activeRoom, username, callActive, onCall }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Group messages by date
  const grouped: { date: string; msgs: Message[] }[] = [];
  let currentDate = '';
  for (const msg of messages) {
    const date = new Date(msg.created_at).toLocaleDateString('zh-CN', {
      month: 'long',
      day: 'numeric',
    });
    if (date !== currentDate) {
      currentDate = date;
      grouped.push({ date, msgs: [] });
    }
    grouped[grouped.length - 1].msgs.push(msg);
  }

  return (
    <div className="chat-window">
      <ChatHeader roomName={activeRoom.name} callActive={callActive} onCall={onCall} />
      <div className="messages-container">
        {grouped.map((group, gi) => (
          <div key={gi}>
            <div className="date-separator">{group.date}</div>
            {group.msgs.map((msg, mi) => {
              const isOwn = msg.username === username;
              const showAvatar =
                mi === 0 || group.msgs[mi - 1].username !== msg.username;
              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOwn={isOwn}
                  showAvatar={showAvatar}
                />
              );
            })}
          </div>
        ))}
        {messages.length === 0 && (
          <div className="empty-chat">
            <p>还没有消息，说点什么吧！</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
