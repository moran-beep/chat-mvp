import TRTC from 'trtc-sdk-v5';

// 凭证读取优先级：运行时 localStorage > 构建期环境变量
// 这样公开仓库(含 GitHub Pages)不会泄露 SecretKey，用户注册后可自助填入。
const LS_APP_ID = 'trtc_sdk_app_id';
const LS_SECRET = 'trtc_secret_key';

function readConfig(): { sdkAppId: number; secretKey: string } {
  const env = (import.meta as any).env || {};
  const lsAppId = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_APP_ID) : null;
  const lsSecret = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_SECRET) : null;
  const sdkAppId = Number(lsAppId || env.VITE_TRTC_SDK_APP_ID || '0');
  const secretKey = String(lsSecret || env.VITE_TRTC_SECRET_KEY || '');
  return { sdkAppId, secretKey };
}

export function saveTrtcConfig(sdkAppId: number, secretKey: string): void {
  if (typeof localStorage === 'undefined') return;
  if (sdkAppId > 0) localStorage.setItem(LS_APP_ID, String(sdkAppId));
  if (secretKey) localStorage.setItem(LS_SECRET, secretKey);
}

export function getTrtcConfig(): { sdkAppId: number; secretKey: string } {
  return readConfig();
}

export function isTrtcConfigured(): boolean {
  const { sdkAppId, secretKey } = readConfig();
  return sdkAppId > 0 && secretKey.length > 0;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// 生成 UserSig（腾讯云 HMAC-SHA256 算法，与官方 GenerateTestUserSig 完全一致）
// 说明：客户端生成 UserSig 仅适合 MVP 测试；生产环境应在服务端用 SecretKey 生成，避免密钥下发到前端。
export async function genUserSig(userId: string, expire = 604800): Promise<string> {
  const { sdkAppId, secretKey } = readConfig();
  const currTime = Math.floor(Date.now() / 1000);
  const data = `TLS.identifier:${userId}\nTLS.sdkappid:${sdkAppId}\nTLS.time:${currTime}\nTLS.expire:${expire}\n`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const sig = arrayBufferToBase64(sigBuf);
  const json = {
    'TLS.ver': '2.0',
    'TLS.identifier': userId,
    'TLS.sdkappid': sdkAppId,
    'TLS.expire': expire,
    'TLS.time': currTime,
    'TLS.sig': sig,
  };
  return utf8ToBase64(JSON.stringify(json));
}

export { TRTC };
