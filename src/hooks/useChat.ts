import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/supabase';
import { parseVoice } from '../utils/voice';
import { parseImage } from '../utils/image';

type Room = Database['public']['Tables']['rooms']['Row'];
type Message = Database['public']['Tables']['messages']['Row'];

interface ChatRoom extends Room {
  lastMessage?: string;
  lastTime?: string;
}

// 每次加载的消息数量（分页）
const PAGE_SIZE = 50;

export function useChat(username: string) {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // 已加载消息中最早一条的时间戳，用于分页加载更早历史
  const oldestCreatedAt = useRef<string | null>(null);

  // Fetch rooms on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchRooms() {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .order('created_at', { ascending: true });

      if (!cancelled && !error && data) {
        const roomList = data as Room[];
        setRooms(roomList);
        if (roomList.length > 0 && !activeRoomId) {
          setActiveRoomId(roomList[0].id);
        }
      }
      setLoading(false);
    }
    fetchRooms();

    // Subscribe to new rooms
    const roomsChannel = supabase
      .channel('rooms-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rooms' },
        (payload) => {
          setRooms((prev) => [...prev, payload.new as Room]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(roomsChannel);
    };
  }, []);

  // Fetch messages (newest page) and subscribe when active room changes
  useEffect(() => {
    if (!activeRoomId) return;
    const roomId = activeRoomId; // narrowed to string

    let cancelled = false;
    oldestCreatedAt.current = null;
    setHasMore(true);
    setLoadingMore(false);

    // Unsubscribe from previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    async function fetchMessages() {
      setMessages([]);
      // 取最近一页（倒序后取前 PAGE_SIZE 条），再反转成由旧到新展示
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (!cancelled && !error && data) {
        const ordered = (data as Message[]).reverse();
        setMessages(ordered);
        oldestCreatedAt.current = ordered[0]?.created_at ?? null;
        setHasMore(ordered.length === PAGE_SIZE);
      }
    }
    fetchMessages();

    // Subscribe to new messages in this room
    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => [...prev, newMsg]);
          // Update last message for room
          setRooms((prev) =>
            prev.map((r) =>
              r.id === roomId
                ? {
                    ...r,
                    lastMessage: parseImage(newMsg.content)
                      ? '[图片]'
                      : parseVoice(newMsg.content)
                      ? '[语音]'
                      : newMsg.content,
                    lastTime: newMsg.created_at,
                  }
                : r
            )
          );
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      cancelled = true;
    };
  }, [activeRoomId]);

  // Send message
  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeRoomId || !content.trim()) return;
      const roomId = activeRoomId;
      await supabase.from('messages').insert({
        room_id: roomId,
        username,
        content: content.trim(),
      } as any);
    },
    [activeRoomId, username]
  );

  // Send voice message (audio encoded as base64 inside content JSON)
  const sendVoice = useCallback(
    async (audioBase64: string, duration: number, mime: string) => {
      if (!activeRoomId) return;
      const roomId = activeRoomId;
      const payload = JSON.stringify({ _voice: true, dur: duration, mime, audio: audioBase64 });
      await supabase.from('messages').insert({
        room_id: roomId,
        username,
        content: payload,
      } as any);
    },
    [activeRoomId, username]
  );

  // Send image message (compressed image as base64 inside content JSON)
  const sendImage = useCallback(
    async (dataBase64: string, mime: string, w: number, h: number) => {
      if (!activeRoomId) return;
      const roomId = activeRoomId;
      const payload = JSON.stringify({ _image: true, mime, w, h, data: dataBase64 });
      await supabase.from('messages').insert({
        room_id: roomId,
        username,
        content: payload,
      } as any);
    },
    [activeRoomId, username]
  );

  // Create a new room
  const createRoom = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const { data, error } = await supabase
        .from('rooms')
        .insert({ name: trimmed } as any)
        .select()
        .single();

      if (!error && data) {
        setActiveRoomId((data as Room).id);
      }
    },
    []
  );

  // 加载更早的历史消息（分页向上翻）
  const loadMore = useCallback(async () => {
    if (!activeRoomId || loadingMore || !hasMore || !oldestCreatedAt.current) return;
    setLoadingMore(true);
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', activeRoomId)
      .lt('created_at', oldestCreatedAt.current)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (!error && data) {
      const older = (data as Message[]).reverse();
      setMessages((prev) => [...older, ...prev]);
      if (older.length > 0) oldestCreatedAt.current = older[0].created_at;
      setHasMore(older.length === PAGE_SIZE);
    }
    setLoadingMore(false);
  }, [activeRoomId, loadingMore, hasMore]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || null;

  return {
    rooms,
    messages,
    activeRoom,
    activeRoomId,
    loading,
    hasMore,
    loadingMore,
    loadMore,
    sendMessage,
    sendVoice,
    sendImage,
    createRoom,
    setActiveRoomId,
  };
}
