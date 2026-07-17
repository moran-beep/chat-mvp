import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected';

interface SignalPayload {
  type: 'call-invite' | 'call-accepted' | 'call-declined' | 'call-ended' | 'webrtc-offer' | 'webrtc-answer' | 'webrtc-ice';
  from: string;
  to?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  caller?: string;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    // Google STUN — 同网直连用不到，仅作 NAT 打洞兜底
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // OpenRelay 免费 TURN — TCP:80 在境内可达（TLS:443 被墙）。用于手机热点/隔离网络的音频中继
    { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

export function useCall(roomId: string | null, username: string) {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [callerName, setCallerName] = useState('');
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState('');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [iceState, setIceState] = useState('');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<CallStatus>('idle');
  const usernameRef = useRef(username);
  const remoteUsernameRef = useRef<string>('');
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const channelReadyRef = useRef(false);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { usernameRef.current = username; }, [username]);

  // Create audio element for remote audio
  useEffect(() => {
    const audio = document.createElement('audio');
    audio.setAttribute('playsinline', '');
    audio.autoplay = true;
    audio.muted = false;
    audio.volume = 1;
    audio.style.position = 'fixed';
    audio.style.top = '-1px';
    audio.style.left = '-1px';
    audio.style.width = '1px';
    audio.style.height = '1px';
    audio.style.opacity = '0';
    audio.style.pointerEvents = 'none';
    document.body.appendChild(audio);

    // Debug: log audio element events
    audio.addEventListener('playing', () => console.log('[Call] 🔊 Audio element: playing'));
    audio.addEventListener('pause', () => console.log('[Call] ⏸️ Audio element: paused'));
    audio.addEventListener('waiting', () => console.log('[Call] ⏳ Audio element: waiting for data'));
    audio.addEventListener('error', (e) => console.error('[Call] ❌ Audio element error:', e));

    remoteAudioRef.current = audio;
    return () => {
      audio.remove();
      remoteAudioRef.current = null;
    };
  }, []);

  // Try to play remote audio
  const ensureAudioPlaying = useCallback(() => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    if (!audio.srcObject) return;
    audio.muted = false;
    audio.volume = 1;
    const p = audio.play();
    if (p) {
      p.then(() => {
        setAudioBlocked(false);
        console.log('[Call] ✅ Audio playing OK');
      })
      .catch((err) => {
        console.warn('[Call] ❌ Audio play blocked:', err.message);
        setAudioBlocked(true);
      });
    }
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setDuration(0);
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const flushPendingCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const candidates = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const c of candidates) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
  }, []);

  const cleanup = useCallback(() => {
    stopTimer();
    if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
    if (iceTimeoutRef.current) { clearTimeout(iceTimeoutRef.current); iceTimeoutRef.current = null; }
    if (audioRetryRef.current) { clearInterval(audioRetryRef.current); audioRetryRef.current = null; }
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = null; }
    pendingCandidatesRef.current = [];
    remoteUsernameRef.current = '';
    setStatus('idle'); setCallerName(''); setDuration(0);
    setIsMuted(false); setError(''); setAudioBlocked(false); setIceState('');
  }, [stopTimer]);

  // Set ICE timeout — if ICE doesn't connect in 45s, show error (TURN relay needs more time)
  const setIceTimeout = useCallback(() => {
    if (iceTimeoutRef.current) clearTimeout(iceTimeoutRef.current);
    iceTimeoutRef.current = setTimeout(() => {
      if (statusRef.current === 'connecting') {
        console.error('[Call] ICE timeout after 45s, state:', pcRef.current?.iceConnectionState);
        setError('连接超时，请确认双方网络通畅');
        setTimeout(() => cleanup(), 3000);
      }
    }, 45000);
  }, [cleanup]);

  const createPeerConnection = useCallback(async (isCaller: boolean) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
        console.log('[Call] Added local track:', track.kind, 'enabled:', track.enabled);
      });
    }

    // Remote audio
    pc.ontrack = (event) => {
      console.log('[Call] 📡 ontrack! streams:', event.streams.length, 'track:', event.track.kind, 'readyState:', event.track.readyState);
      const audio = remoteAudioRef.current;
      if (!audio) return;
      const stream = event.streams[0] || new MediaStream([event.track]);
      audio.srcObject = stream;
      ensureAudioPlaying();
      // Retry when track actually starts receiving data
      event.track.onunmute = () => {
        console.log('[Call] Remote track unmuted — retrying audio');
        ensureAudioPlaying();
      };
    };

    // ICE connection — drives actual 'connected' status
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log('[Call] 🧊 ICE state:', state);
      setIceState(state);

      if (state === 'connected' || state === 'completed') {
        if (statusRef.current === 'connecting') {
          console.log('[Call] ✅ ICE connected!');
          setStatus('connected');
          startTimer();
          if (iceTimeoutRef.current) { clearTimeout(iceTimeoutRef.current); iceTimeoutRef.current = null; }
          // Ensure audio plays after connection
          setTimeout(() => ensureAudioPlaying(), 300);
          if (audioRetryRef.current) clearInterval(audioRetryRef.current);
          audioRetryRef.current = setInterval(() => ensureAudioPlaying(), 2000);
        }
      } else if (state === 'failed') {
        console.error('[Call] ❌ ICE failed!');
        setError('连接失败：手机热点会阻止设备间直连，请改用普通WiFi，或稍后重试');
        setTimeout(() => cleanup(), 4000);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[Call] Peer connection state:', pc.connectionState);
    };

    // Trickle ICE — send candidates immediately as they're gathered
    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            type: 'webrtc-ice',
            from: usernameRef.current,
            to: remoteUsernameRef.current || undefined,
            candidate: event.candidate.toJSON(),
          } as SignalPayload,
        });
      }
    };

    pcRef.current = pc;

    if (isCaller) {
      // Create offer and send IMMEDIATELY (trickle ICE — no waiting)
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      channelRef.current?.send({
        type: 'broadcast',
        event: 'signal',
        payload: {
          type: 'webrtc-offer',
          from: usernameRef.current,
          to: remoteUsernameRef.current || undefined,
          sdp: offer,
        } as SignalPayload,
      });
      console.log('[Call] Sent offer (trickle ICE)');
      setStatus('connecting');
      setIceTimeout();
    }
  }, [cleanup, ensureAudioPlaying, startTimer, setIceTimeout]);

  // Signaling channel
  useEffect(() => {
    if (!roomId || !username) return;

    channelReadyRef.current = false;
    const channel = supabase.channel(`call-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on('broadcast', { event: 'signal' }, async (msg) => {
      const payload = msg.payload as SignalPayload;
      if (!payload) return;
      if (payload.to && payload.to !== usernameRef.current) return;
      if (payload.from === usernameRef.current) return;

      console.log('[Call] Signal:', payload.type, 'from:', payload.from);

      switch (payload.type) {
        case 'call-invite': {
          if (statusRef.current === 'idle') {
            remoteUsernameRef.current = payload.from;
            setCallerName(payload.caller || payload.from);
            setStatus('ringing');
          }
          break;
        }

        case 'call-accepted': {
          if (statusRef.current === 'calling') {
            remoteUsernameRef.current = payload.from;
            try {
              await createPeerConnection(true);
            } catch (err) {
              console.error('[Call] PC create failed:', err);
              setError('连接失败');
              cleanup();
            }
          }
          break;
        }

        case 'call-declined': {
          if (statusRef.current === 'calling') {
            setError('对方拒绝了通话');
            setTimeout(() => cleanup(), 1500);
          }
          break;
        }

        case 'call-ended': {
          if (statusRef.current !== 'idle') cleanup();
          break;
        }

        case 'webrtc-offer': {
          if (statusRef.current === 'ringing' || statusRef.current === 'idle') {
            try {
              if (payload.from) remoteUsernameRef.current = payload.from;
              await createPeerConnection(false);
              const pc = pcRef.current;
              if (pc && payload.sdp) {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                await flushPendingCandidates();
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                // Send answer IMMEDIATELY (trickle ICE)
                channel.send({
                  type: 'broadcast',
                  event: 'signal',
                  payload: {
                    type: 'webrtc-answer',
                    from: usernameRef.current,
                    to: remoteUsernameRef.current,
                    sdp: answer,
                  } as SignalPayload,
                });
                console.log('[Call] Sent answer (trickle ICE)');
                setStatus('connecting');
                setIceTimeout();
              }
            } catch (err) {
              console.error('[Call] Offer handling failed:', err);
              setError('连接失败');
              setStatus('idle');
              setTimeout(() => cleanup(), 2000);
            }
          }
          break;
        }

        case 'webrtc-answer': {
          if (statusRef.current === 'connecting' && pcRef.current && payload.sdp) {
            try {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              await flushPendingCandidates();
              console.log('[Call] Remote description set (answer), waiting for ICE...');
              setIceTimeout();
            } catch (err) {
              console.error('[Call] Answer handling failed:', err);
              setError('连接失败');
              setStatus('idle');
              setTimeout(() => cleanup(), 2000);
            }
          }
          break;
        }

        case 'webrtc-ice': {
          if (payload.candidate) {
            const pc = pcRef.current;
            if (pc && pc.remoteDescription) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
              } catch {}
            } else {
              pendingCandidatesRef.current.push(payload.candidate);
            }
          }
          break;
        }
      }
    });

    channel.subscribe((s) => {
      if (s === 'SUBSCRIBED') {
        channelReadyRef.current = true;
        console.log('[Call] Channel ready:', roomId);
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
        console.error('[Call] Channel error:', s);
        channelReadyRef.current = false;
      }
    });
    channelRef.current = channel;

    return () => {
      if (statusRef.current !== 'idle' && statusRef.current !== 'ringing') {
        channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: { type: 'call-ended', from: usernameRef.current } as SignalPayload,
        });
      }
      channelReadyRef.current = false;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, username]);

  const startCall = useCallback(async () => {
    if (!roomId || statusRef.current !== 'idle') return;
    if (!channelReadyRef.current) {
      setError('连接未就绪，请稍后再试');
      setTimeout(() => setError(''), 2000);
      return;
    }
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      console.log('[Call] Got mic, tracks:', stream.getTracks().length);
      setStatus('calling');
      setCallerName(username);
      channelRef.current?.send({
        type: 'broadcast',
        event: 'signal',
        payload: { type: 'call-invite', from: username, caller: username } as SignalPayload,
      });
      callTimeoutRef.current = setTimeout(() => {
        if (statusRef.current === 'calling') {
          setError('无人接听');
          setTimeout(() => cleanup(), 1500);
        }
      }, 30000);
    } catch (err: any) {
      console.error('[Call] getUserMedia failed:', err);
      setError(err.name === 'NotAllowedError' ? '请允许麦克风权限' : '无法启动通话');
      setStatus('idle');
      setTimeout(() => cleanup(), 2000);
    }
  }, [roomId, username, status, cleanup]);

  const acceptCall = useCallback(async () => {
    if (statusRef.current !== 'ringing') return;
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      channelRef.current?.send({
        type: 'broadcast',
        event: 'signal',
        payload: { type: 'call-accepted', from: username, to: remoteUsernameRef.current } as SignalPayload,
      });
      console.log('[Call] Accepted, waiting for offer...');
    } catch (err: any) {
      console.error('[Call] Callee getUserMedia failed:', err);
      setError(err.name === 'NotAllowedError' ? '请允许麦克风权限后重试' : '无法接听：' + (err.message || '麦克风不可用'));
      setStatus('idle');
      setTimeout(() => cleanup(), 3000);
    }
  }, [username, cleanup]);

  const declineCall = useCallback(() => {
    if (statusRef.current !== 'ringing') return;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'signal',
      payload: { type: 'call-declined', from: username, to: remoteUsernameRef.current } as SignalPayload,
    });
    cleanup();
  }, [username, cleanup]);

  const endCall = useCallback(() => {
    if (channelRef.current && statusRef.current !== 'idle' && statusRef.current !== 'ringing') {
      channelRef.current.send({
        type: 'broadcast',
        event: 'signal',
        payload: { type: 'call-ended', from: username, to: remoteUsernameRef.current || undefined } as SignalPayload,
      });
    }
    cleanup();
  }, [username, status, cleanup]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const t = localStreamRef.current.getAudioTracks()[0];
      if (t) { t.enabled = !t.enabled; setIsMuted(!t.enabled); }
    }
  }, []);

  // Unlock audio on user interaction
  useEffect(() => {
    if (status !== 'connected') return;
    const unlock = () => ensureAudioPlaying();
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, [status, ensureAudioPlaying]);

  useEffect(() => {
    return () => {
      if (channelRef.current && statusRef.current !== 'idle' && statusRef.current !== 'ringing') {
        channelRef.current.send({
          type: 'broadcast',
          event: 'signal',
          payload: { type: 'call-ended', from: usernameRef.current } as SignalPayload,
        });
      }
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status, callerName, duration, isMuted, error, audioBlocked, iceState,
    startCall, acceptCall, declineCall, endCall, toggleMute,
    unlockAudio: ensureAudioPlaying,
  };
}
