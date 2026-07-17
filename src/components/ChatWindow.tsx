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
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

export default function ChatWindow({
  messages,
  activeRoom,
  username,
  callActive,
  onCall,
  hasMore,
  loadingMore,
  onLoadMore,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // 加载更早消息前记录的滚动位置，用于加载后还原，避免视图跳动
  const pendingScroll = useRef<{ height: number; top: number } | null>(null);

  useEffect(() => {
    const pending = pendingScroll.current;
    const el = containerRef.current;
    if (pending && el) {
      // 还原加载前的滚动位置
      el.scrollTop = el.scrollHeight - pending.height + pending.top;
      pendingScroll.current = null;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLoadMore = () => {
    const el = containerRef.current;
    if (el) {
      pendingScroll.current = { height: el.scrollHeight, top: el.scrollTop };
    }
    onLoadMore();
  };

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
      <div className="messages-container" ref={containerRef}>
        {hasMore && (
          <div className="load-more-wrap">
            <button className="load-more-btn" onClick={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? '加载中…' : '加载更早的消息'}
            </button>
          </div>
        )}
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
