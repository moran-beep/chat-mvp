import { useState, useCallback, useRef } from 'react';
import type { Conversation, Message } from '../types/chat';
import { initialConversations, getRandomReply, getReplyDelay, currentUser } from '../data/mockData';

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string>(conversations[0].id);
  const [isTyping, setIsTyping] = useState(false);
  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeConversation = conversations.find((c) => c.id === activeConversationId)!;

  const sendMessage = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      const newMessage: Message = {
        id: `msg-${Date.now()}`,
        conversationId: activeConversationId,
        senderId: currentUser.id,
        content: trimmed,
        timestamp: Date.now(),
        status: 'sent',
      };

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === activeConversationId
            ? { ...conv, messages: [...conv.messages, newMessage] }
            : conv
        )
      );

      // 模拟对方"正在输入" + 自动回复
      if (replyTimerRef.current) clearTimeout(replyTimerRef.current);

      setTimeout(() => setIsTyping(true), 500);

      replyTimerRef.current = setTimeout(() => {
        setIsTyping(false);
        const reply: Message = {
          id: `msg-${Date.now()}-reply`,
          conversationId: activeConversationId,
          senderId: activeConversationId,
          content: getRandomReply(),
          timestamp: Date.now(),
          status: 'delivered',
        };

        // 同时把之前发的消息标记为已读
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === activeConversationId
              ? {
                  ...conv,
                  messages: [
                    ...conv.messages.map((m) =>
                      m.senderId === currentUser.id ? { ...m, status: 'read' as const } : m
                    ),
                    reply,
                  ],
                }
              : conv
          )
        );
      }, getReplyDelay());
    },
    [activeConversationId]
  );

  const selectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setIsTyping(false);
    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
  }, []);

  return {
    conversations,
    activeConversation,
    activeConversationId,
    isTyping,
    currentUser,
    sendMessage,
    selectConversation,
  };
}
