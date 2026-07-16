export function formatTime(timestamp: string | number): string {
  const ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  const date = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - ts;
  const isToday = date.toDateString() === now.toDateString();
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString();

  if (diff < 60000) return '刚刚';
  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  if (isYesterday) return '昨天';
  if (diff < 86400000 * 7) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[date.getDay()];
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

export function formatDateSeparator(timestamp: string | number): string {
  const ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString();

  if (isToday) return '今天';
  if (isYesterday) return '昨天';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function shouldShowDateSeparator(current: string | number, previous: string | number | null): boolean {
  if (previous === null) return true;
  const curTs = typeof current === 'string' ? new Date(current).getTime() : current;
  const prevTs = typeof previous === 'string' ? new Date(previous).getTime() : previous;
  const currentDate = new Date(curTs).toDateString();
  const previousDate = new Date(prevTs).toDateString();
  return currentDate !== previousDate;
}
