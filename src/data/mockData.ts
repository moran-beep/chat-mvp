import type { Conversation, User } from '../types/chat';

export const currentUser: User = {
  id: 'me',
  name: '我',
  avatar: '我',
  avatarColor: '#4f6df5',
};

export const initialConversations: Conversation[] = [
  {
    id: 'conv-1',
    name: '林晓',
    avatar: '林',
    avatarColor: '#e8703a',
    online: true,
    messages: [
      {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'conv-1',
        content: '嗨！在吗？周末那个项目方案你看了吗？',
        timestamp: Date.now() - 3600000 * 2,
        status: 'read',
      },
      {
        id: 'msg-2',
        conversationId: 'conv-1',
        senderId: 'me',
        content: '看了看了，整体思路很清晰，有几个细节想跟你讨论一下',
        timestamp: Date.now() - 3600000 * 1.8,
        status: 'read',
      },
      {
        id: 'msg-3',
        conversationId: 'conv-1',
        senderId: 'conv-1',
        content: '好啊，你说！',
        timestamp: Date.now() - 3600000 * 1.7,
        status: 'read',
      },
      {
        id: 'msg-4',
        conversationId: 'conv-1',
        senderId: 'me',
        content: '第三部分的用户调研数据，样本量是不是偏少了？建议补充到 200+',
        timestamp: Date.now() - 3600000 * 1.5,
        status: 'read',
      },
      {
        id: 'msg-5',
        conversationId: 'conv-1',
        senderId: 'conv-1',
        content: '有道理，我下周一补上。到时候一起对一下吧？',
        timestamp: Date.now() - 1800000,
        status: 'read',
      },
    ],
  },
  {
    id: 'conv-2',
    name: '产品讨论组',
    avatar: '组',
    avatarColor: '#2bb673',
    online: false,
    lastSeen: '3 人',
    messages: [
      {
        id: 'msg-6',
        conversationId: 'conv-2',
        senderId: 'conv-2',
        content: '大家看下新版本的交互稿，提提意见',
        timestamp: Date.now() - 86400000,
        status: 'read',
      },
      {
        id: 'msg-7',
        conversationId: 'conv-2',
        senderId: 'me',
        content: '整体不错，首页的信息层级可以再梳理一下',
        timestamp: Date.now() - 86000000,
        status: 'read',
      },
      {
        id: 'msg-8',
        conversationId: 'conv-2',
        senderId: 'conv-2',
        content: '收到，我改一版再发出来',
        timestamp: Date.now() - 85000000,
        status: 'read',
      },
    ],
  },
  {
    id: 'conv-3',
    name: '张明',
    avatar: '张',
    avatarColor: '#8b5cf6',
    online: true,
    messages: [
      {
        id: 'msg-9',
        conversationId: 'conv-3',
        senderId: 'conv-3',
        content: '今天的会议改到下午 3 点了，别忘了',
        timestamp: Date.now() - 7200000,
        status: 'read',
      },
      {
        id: 'msg-10',
        conversationId: 'conv-3',
        senderId: 'me',
        content: '收到，已更新日历',
        timestamp: Date.now() - 7000000,
        status: 'read',
      },
    ],
  },
  {
    id: 'conv-4',
    name: '王芳',
    avatar: '王',
    avatarColor: '#ec4899',
    online: false,
    lastSeen: '2 小时前',
    messages: [
      {
        id: 'msg-11',
        conversationId: 'conv-4',
        senderId: 'conv-4',
        content: '设计稿已经上传到共享文件夹了，麻烦验收一下',
        timestamp: Date.now() - 86400000 * 2,
        status: 'read',
      },
      {
        id: 'msg-12',
        conversationId: 'conv-4',
        senderId: 'me',
        content: '好的，我今天看完反馈给你',
        timestamp: Date.now() - 86400000 * 2 + 3600000,
        status: 'read',
      },
    ],
  },
  {
    id: 'conv-5',
    name: '技术分享群',
    avatar: '技',
    avatarColor: '#0ea5e9',
    online: false,
    lastSeen: '12 人',
    messages: [
      {
        id: 'msg-13',
        conversationId: 'conv-5',
        senderId: 'conv-5',
        content: '有人试过 Tauri 2.0 吗？比 Electron 轻好多',
        timestamp: Date.now() - 86400000 * 3,
        status: 'read',
      },
    ],
  },
];

// 模拟自动回复
const autoReplies = [
  '收到，我看看',
  '好的没问题',
  '这个想法不错，我想想',
  '哈哈，有意思',
  '稍等我处理一下',
  '了解了，谢谢提醒',
  '嗯，有道理',
  '我这边也遇到了类似的情况',
  '可以的，按你说的来',
  '好的，晚点同步进展',
];

export function getRandomReply(): string {
  return autoReplies[Math.floor(Math.random() * autoReplies.length)];
}

export function getReplyDelay(): number {
  return 800 + Math.random() * 1500;
}
