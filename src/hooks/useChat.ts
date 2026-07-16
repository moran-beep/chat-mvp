import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/supabase';

type Room = Database['public']['Tables']['rooms']['Row'];
type Message = Database['public']['Tables']['messages']['Row'];

interface ChatRoom extends Room {
  lastMessage?: string;
  lastTime?: string;
}

export function useChat(username: string) {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Fetch rooms on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchRooms() {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .order('created_at', { ascending: true });

      if (!cancelled && !error && data) {
        setRooms(data);
        if (data.length > 0 && !activeRoomId) {
          setActiveRoomId(data[0].id);
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

  // Fetch messages and subscribe when active room changes
  useEffect(() => {
    if (!activeRoomId) return;

    let cancelled = false;

    // Unsubscribe from previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    async function fetchMessages() {
      setMessages([]);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', activeRoomId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (!cancelled && !error && data) {
        setMessages(data);
      }
    }
    fetchMessages();

    // Subscribe to new messages in this room
    const channel = supabase
      .channel(`room-${activeRoomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${activeRoomId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => [...prev, newMsg]);
          // Update last message for room
          setRooms((prev) =>
            prev.map((r) =>
              r.id === activeRoomId
                ? { ...r, lastMessage: newMsg.content, lastTime: newMsg.created_at }
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
      await supabase.from('messages').insert({
        room_id: activeRoomId,
        username,
        content: content.trim(),
      });
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
        .insert({ name: trimmed })
        .select()
        .single();

      if (!error && data) {
        setActiveRoomId(data.id);
      }
    },
    []
  );

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || null;

  return {
    rooms,
    messages,
    activeRoom,
    activeRoomId,
    loading,
    sendMessage,
    createRoom,
    setActiveRoomId,
  };
}
