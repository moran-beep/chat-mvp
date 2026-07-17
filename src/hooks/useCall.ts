import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { TRTC, genUserSig, isTrtcConfigured, getTrtcConfig } from '../lib/trtc';

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected';

// 信令协议：仅用于「来电 / 接听 / 挂断」通知。音视频流本身全部走 TRTC（腾讯云中转，跨网稳定）。
interface SignalPayload {
  type: 'call-invite' | 'call-accepted' | 'call-declined' | 'call-ended';
  from: string;
  to?: string;
  caller?: string;
  callId?: string; // 用作 TRTC 房间号，保证每次通话唯一
}

export function useCall(roomId: string | null, username: string) {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [callerName, setCallerName] = useState('');
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState('');
  // 以下两项仅为兼容现有 UI，TRTC 自动播放远端音频，无需手动解锁音频
  const [audioBlocked] = useState(false);
  const [iceState] = useState('');

  const trtcRef = useRef<any>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const statusRef = useRef<CallStatus>('idle');
  const usernameRef = useRef(username);
  const remoteUsernameRef = useRef('');
  const callIdRef = useRef('');
  const channelReadyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { usernameRef.current = username; }, [username]);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setDuration(0);
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const cleanup = useCallback(() => {
    stopTimer();
    if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
    if (trtcRef.current) {
      try { trtcRef.current.exitRoom(); } catch { /* ignore */ }
      trtcRef.current = null;
    }
    setStatus('idle'); setCallerName(''); setDuration(0);
    setIsMuted(false); setError('');
    remoteUsernameRef.current = '';
    callIdRef.current = '';
  }, [stopTimer]);

  // 进入 TRTC 房间并发布本地麦克风，双方进同一房间即连通（腾讯云负责跨网传输）
  const enterRoom = useCallback(async () => {
    const callId = callIdRef.current;
    if (!callId) { setError('通话参数缺失'); cleanup(); return; }
    if (!isTrtcConfigured()) {
      setError('未配置音视频服务（TRTC），暂无法跨网通话');
      setTimeout(() => cleanup(), 2500);
      return;
    }
    try {
      const trtc = TRTC.create();
      trtcRef.current = trtc;

      trtc.on(TRTC.EVENT.REMOTE_AUDIO_AVAILABLE, (event: any) => {
        console.log('[Call] 📡 收到远端音频:', event?.userId);
      });
      trtc.on(TRTC.EVENT.CONNECTION_STATE_CHANGED, (event: any) => {
        console.log('[Call] 🔗 TRTC 连接状态:', event?.state);
      });
      trtc.on(TRTC.EVENT.KICKED_OUT, () => {
        console.warn('[Call] 被移出房间');
        setError('通话已结束');
        setTimeout(() => cleanup(), 1000);
      });

      const userSig = await genUserSig(usernameRef.current);
      await trtc.enterRoom({
        sdkAppId: getTrtcConfig().sdkAppId,
        userId: usernameRef.current,
        strRoomId: callId,
        userSig,
        scene: TRTC.TYPE.SCENE_RTC,
      });
      await trtc.startLocalAudio();
      console.log('[Call] ✅ 进房并发布音频成功');

      setStatus('connected');
      startTimer();
    } catch (err: any) {
      console.error('[Call] 进房失败:', err);
      setError('通话连接失败：' + (err?.message || '服务未配置'));
      setTimeout(() => cleanup(), 2500);
    }
  }, [cleanup, startTimer]);

  // 信令通道（Supabase broadcast）：来电/接听/挂断
  useEffect(() => {
    if (!roomId || !username) return;
    channelReadyRef.current = false;
    const channel = supabase.channel(`call-${roomId}`, { config: { broadcast: { self: false } } });

    channel.on('broadcast', { event: 'signal' }, async (msg: any) => {
      const payload = msg.payload as SignalPayload;
      if (!payload) return;
      if (payload.to && payload.to !== usernameRef.current) return;
      if (payload.from === usernameRef.current) return;

      console.log('[Call] 信令:', payload.type, '来自', payload.from);

      switch (payload.type) {
        case 'call-invite':
          if (statusRef.current === 'idle') {
            remoteUsernameRef.current = payload.from;
            callIdRef.current = payload.callId || '';
            setCallerName(payload.caller || payload.from);
            setStatus('ringing');
          }
          break;
        case 'call-accepted':
          if (statusRef.current === 'calling') {
            remoteUsernameRef.current = payload.from;
            if (payload.callId) callIdRef.current = payload.callId;
            setStatus('connecting');
            await enterRoom();
          }
          break;
        case 'call-declined':
          if (statusRef.current === 'calling') {
            setError('对方拒绝了通话');
            setTimeout(() => cleanup(), 1500);
          }
          break;
        case 'call-ended':
          if (statusRef.current !== 'idle') cleanup();
          break;
      }
    });

    channel.subscribe((s: string) => {
      if (s === 'SUBSCRIBED') { channelReadyRef.current = true; console.log('[Call] 信令通道就绪:', roomId); }
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { channelReadyRef.current = false; }
    });
    channelRef.current = channel;

    return () => {
      if (statusRef.current !== 'idle' && statusRef.current !== 'ringing') {
        channel.send({ type: 'broadcast', event: 'signal', payload: { type: 'call-ended', from: usernameRef.current } as SignalPayload });
      }
      channelReadyRef.current = false;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, username, enterRoom, cleanup]);

  const startCall = useCallback(async () => {
    if (!roomId || statusRef.current !== 'idle') return;
    if (!channelReadyRef.current) { setError('连接未就绪，请稍后再试'); setTimeout(() => setError(''), 2000); return; }
    if (!isTrtcConfigured()) { setError('未配置音视频服务（TRTC），暂无法跨网通话'); return; }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }); // 预检查麦克风权限
      callIdRef.current = `call-${roomId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      setStatus('calling');
      setCallerName(username);
      channelRef.current?.send({ type: 'broadcast', event: 'signal', payload: { type: 'call-invite', from: username, caller: username, callId: callIdRef.current } as SignalPayload });
      callTimeoutRef.current = setTimeout(() => {
        if (statusRef.current === 'calling') { setError('无人接听'); setTimeout(() => cleanup(), 1500); }
      }, 30000);
    } catch (err: any) {
      console.error('[Call] 启动失败:', err);
      setError(err?.name === 'NotAllowedError' ? '请允许麦克风权限' : '无法发起通话');
      cleanup();
    }
  }, [roomId, username, status, cleanup]);

  const acceptCall = useCallback(async () => {
    if (statusRef.current !== 'ringing') return;
    setError('');
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      channelRef.current?.send({ type: 'broadcast', event: 'signal', payload: { type: 'call-accepted', from: username, to: remoteUsernameRef.current, callId: callIdRef.current } as SignalPayload });
      setStatus('connecting');
      await enterRoom();
    } catch (err: any) {
      setError(err?.name === 'NotAllowedError' ? '请允许麦克风权限' : '无法接听通话');
      cleanup();
    }
  }, [username, cleanup, enterRoom]);

  const declineCall = useCallback(() => {
    if (statusRef.current !== 'ringing') return;
    channelRef.current?.send({ type: 'broadcast', event: 'signal', payload: { type: 'call-declined', from: username, to: remoteUsernameRef.current } as SignalPayload });
    cleanup();
  }, [username, cleanup]);

  const endCall = useCallback(() => {
    if (channelRef.current && statusRef.current !== 'idle' && statusRef.current !== 'ringing') {
      channelRef.current.send({ type: 'broadcast', event: 'signal', payload: { type: 'call-ended', from: username, to: remoteUsernameRef.current || undefined } as SignalPayload });
    }
    cleanup();
  }, [username, status, cleanup]);

  const toggleMute = useCallback(() => {
    const trtc = trtcRef.current;
    if (!trtc) return;
    setIsMuted((m) => {
      const next = !m;
      trtc.updateLocalAudio({ mute: next }).catch(() => {});
      return next;
    });
  }, []);

  const unlockAudio = useCallback(() => {}, []);

  useEffect(() => {
    return () => {
      if (channelRef.current && statusRef.current !== 'idle' && statusRef.current !== 'ringing') {
        channelRef.current.send({ type: 'broadcast', event: 'signal', payload: { type: 'call-ended', from: usernameRef.current } as SignalPayload });
      }
      cleanup();
    };
  }, []);

  return {
    status, callerName, duration, isMuted, error, audioBlocked, iceState,
    startCall, acceptCall, declineCall, endCall, toggleMute,
    unlockAudio,
  };
}
