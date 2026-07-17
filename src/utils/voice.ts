// 语音消息工具：把录音编码进 messages.content（JSON 标记），与文字消息共存

export interface VoicePayload {
  // 标记为语音消息，文字消息不会含此字段
  _voice: true;
  // 录音时长（秒）
  dur: number;
  // 音频 MIME，如 audio/webm;codecs=opus 或 audio/mp4
  mime: string;
  // base64 编码的音频数据（不含 data: 前缀）
  audio: string;
}

// 判断一条 content 是否为语音消息；文字消息（即使恰好以 { 开头）若无 _voice 字段会返回 null
export function parseVoice(content?: string): VoicePayload | null {
  if (!content) return null;
  // 快速排除：文字消息极少以 { 开头
  if (content.charCodeAt(0) !== 123) return null;
  try {
    const obj = JSON.parse(content);
    if (obj && obj._voice === true) return obj as VoicePayload;
  } catch {
    /* 不是合法 JSON，视为文字 */
  }
  return null;
}

// 秒 -> m:ss
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
