export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: number;
  status: 'sent' | 'delivered' | 'read';
}

export interface Conversation {
  id: string;
  name: string;
  avatar: string;
  avatarColor: string;
  online: boolean;
  lastSeen?: string;
  messages: Message[];
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  avatarColor: string;
}
