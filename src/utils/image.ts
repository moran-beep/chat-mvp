// 图片消息工具：拍照/上传图片后压缩为 base64 存进 messages.content
// 与语音消息完全一致的模式（JSON 标记 + base64），不改表结构、不依赖 Storage

export interface ImagePayload {
  // 标记为图片消息，文字消息不会含此字段
  _image: true;
  // 图片 MIME，统一为 image/jpeg
  mime: string;
  // 原始像素宽高（用于气泡占位，避免布局抖动）
  w: number;
  h: number;
  // base64 编码的图片数据（不含 data: 前缀）
  data: string;
}

export interface CompressedImage {
  base64: string;
  mime: string;
  w: number;
  h: number;
}

// 判断一条 content 是否为图片消息；文字消息若无 _image 字段会返回 null
export function parseImage(content?: string): ImagePayload | null {
  if (!content) return null;
  if (content.charCodeAt(0) !== 123) return null; // 文字消息极少以 { 开头
  try {
    const obj = JSON.parse(content);
    if (obj && obj._image === true) return obj as ImagePayload;
  } catch {
    /* 不是合法 JSON，视为文字 */
  }
  return null;
}

// 把图片文件压缩为 base64（最长边 maxSize，JPEG quality）
// 统一输出 JPEG：聊天图片多为照片/截图，体积小；透明 PNG 转 JPEG 会变为黑底，可接受
export function compressImage(
  file: File,
  maxSize = 1280,
  quality = 0.82
): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片解析失败'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法创建画布'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const comma = dataUrl.indexOf(',');
        const base64 = dataUrl.slice(comma + 1);
        resolve({ base64, mime: 'image/jpeg', w, h });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
