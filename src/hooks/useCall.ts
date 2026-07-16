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
    // China-accessible STUN servers (more reliable than Google in mainland China)
    { urls: 'stun:stun.miwifi.com:3478' },
    { urls: 'stun:stun.qq.com:3478' },
    // Google STUN as fallback
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Free public TURN servers (for NAT traversal — STUN alone fails on symmetric NAT)
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

// Wait for ICE gathering to complete (non-trickle ICE — more reliable)
// Returns the local description with all candidates gathered
function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const checkState = () => {
      if (pc.iceGatheringState === 'complete') {
        if (timer) clearTimeout(timer);
        pc.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', checkState);
    // Timeout — resolve anyway with whatever candidates we have
    timer = setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', checkState);
      console.log('[Call] ICE gathering timeout, proceeding with partial candidates');
      resolve();
    }, timeoutMs);
  });
}

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

  // Keep refs in sync
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { usernameRef.current = username; }, [username]);

  // Create a hidden audio element for remote audio — use position:absolute instead of display:none
  // (some browsers won't play audio from display:none elements)
  useEffect(() => {
    const audio = document.createElement('audio');
    audio.setAttribute('playsinline', '');
    audio.setAttribute('autoplay', '');
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
    remoteAudioRef.current = audio;
    return () => {
      audio.remove();
      remoteAudioRef.current = null;
    };
  }, []);

  // Try to play remote audio — retry on user interaction if blocked by autoplay policy
  const ensureAudioPlaying = useCallback(() => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    if (!audio.srcObject) {
      console.log('[Call] ensureAudioPlaying: no srcObject yet');
      return;
    }
    audio.muted = false;
    audio.volume = 1;
    const playPromise = audio.play();
    if (playPromise) {
      playPromise
        .then(() => {
          setAudioBlocked(false);
          console.log('[Call] ✅ Remote audio playing successfully');
        })
        .catch((err) => {
          console.warn('[Call] ❌ Audio autoplay blocked:', err.message);
          setAudioBlocked(true);
        });
    }
  }, []);

  // Timer for call duration
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setDuration(0);
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Flush buffered ICE candidates after remote description is set
  const flushPendingCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const candidates = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        // Non-fatal
      }
    }
  }, []);

  // Full cleanup
  const cleanup = useCallback(() => {
    stopTimer();
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    if (iceTimeoutRef.current) {
      clearTimeout(iceTimeoutRef.current);
      iceTimeoutRef.current = null;
    }
    if (audioRetryRef.current) {
      clearInterval(audioRetryRef.current);
      audioRetryRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    pendingCandidatesRef.current = [];
    remoteUsernameRef.current = '';
    setStatus('idle');
    setCallerName('');
    setDuration(0);
    setIsMuted(false);
    setError('');
    setAudioBlocked(false);
    setIceState('');
  }, [stopTimer]);

  // Create peer connection and wire up signaling
  const createPeerConnection = useCallback(async (isCaller: boolean) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
        console.log('[Call] Added local track:', track.kind, 'enabled:', track.enabled);
      });
    } else {
      console.warn('[Call] No local stream when creating peer connection!');
    }

    // Remote audio — handle both stream and track events
    pc.ontrack = (event) => {
      console.log('[Call] 📡 ontrack fired! streams:', event.streams.length, 'track:', event.track.kind, 'enabled:', event.track.enabled, 'readyState:', event.track.readyState);
      const audio = remoteAudioRef.current;
      if (!audio) {
        console.error('[Call] No audio element available!');
        return;
      }
      // Use the stream from the event, or create one from the track
      const stream = event.streams[0] || new MediaStream([event.track]);
      audio.srcObject = stream;
      console.log('[Call] Set remote audio srcObject, tracks:', stream.getTracks().length);

      // Try to play immediately
      ensureAudioPlaying();

      // Also listen for track ended/muted events
      event.track.onunmute = () => {
        console.log('[Call] Remote track unmuted!');
        ensureAudioPlaying();
      };
      event.track.onmute = () => {
        console.log('[Call] Remote track muted');
      };
    };

    // ICE connection state — THIS is what determines if audio actually flows
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log('[Call] 🧊 ICE connection state:', state);
      setIceState(state);

      if (state === 'connected' || state === 'completed') {
        // ✅ ICE connected — NOW we're truly connected
        if (statusRef.current === 'connecting') {
          console.log('[Call] ✅ ICE connected! Setting status to connected');
          setStatus('connected');
          startTimer();
          // Clear ICE timeout
          if (iceTimeoutRef.current) {
            clearTimeout(iceTimeoutRef.current);
            iceTimeoutRef.current = null;
          }
          // Ensure audio plays
          setTimeout(() => ensureAudioPlaying(), 500);
          // Start periodic audio retry
          if (audioRetryRef.current) clearInterval(audioRetryRef.current);
          audioRetryRef.current = setInterval(() => {
            ensureAudioPlaying();
          }, 2000);
        }
      } else if (state === 'failed') {
        console.error('[Call] ❌ ICE connection failed!');
        setError('网络连接失败，请检查网络或尝试更换网络环境');
        setTimeout(() => cleanup(), 3000);
      } else if (state === 'disconnected') {
        console.warn('[Call] ⚠️ ICE disconnected, may reconnect...');
        // Don't cleanup immediately — ICE might reconnect
        // But set a timeout
        if (iceTimeoutRef.current) clearTimeout(iceTimeoutRef.current);
        iceTimeoutRef.current = setTimeout(() => {
          if (statusRef.current !== 'idle') {
            setError('连接断开');
            setTimeout(() => cleanup(), 2000);
          }
        }, 10000);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[Call] Connection state:', pc.connectionState);
    };

    // ICE candidates → broadcast (with target user)
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

    // Log ICE gathering state
    pc.onicegatheringstatechange = () => {
      console.log('[Call] ICE gathering state:', pc.iceGatheringState);
    };

    pcRef.current = pc;

    if (isCaller) {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      console.log('[Call] Created offer, waiting for ICE gathering...');

      // Wait for ICE gathering to complete (non-trickle ICE — more reliable)
      await waitForIceGathering(pc, 3000);

      // Send the offer (now with all ICE candidates embedded if gathering completed)
      const finalOffer = pc.localDescription;
      channelRef.current?.send({
        type: 'broadcast',
        event: 'signal',
        payload: {
          type: 'webrtc-offer',
          from: usernameRef.current,
          to: remoteUsernameRef.current || undefined,
          sdp: finalOffer,
        } as SignalPayload,
      });
      console.log('[Call] Sent WebRTC offer to', remoteUsernameRef.current || 'all');

      // Set status to connecting (waiting for answer + ICE)
      setStatus('connecting');
    }
  }, [cleanup, ensureAudioPlaying, startTimer]);

  // Set up signaling channel for the room
  useEffect(() => {
    if (!roomId || !username) return;

    channelReadyRef.current = false;
    const channel = supabase.channel(`call-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on('broadcast', { event: 'signal' }, async (msg) => {
      const payload = msg.payload as SignalPayload;
      if (!payload) return;

      // Only handle messages addressed to me (or broadcast to all)
      if (payload.to && payload.to !== usernameRef.current) return;
      // Ignore my own messages
      if (payload.from === usernameRef.current) return;

      console.log('[Call] Received signal:', payload.type, 'from:', payload.from);

      switch (payload.type) {
        case 'call-invite': {
          if (statusRef.current === 'idle') {
            remoteUsernameRef.current = payload.from;
            setCallerName(payload.caller || payload.from);
            setStatus('ringing');
            console.log('[Call] Incoming call from', payload.from);
          }
          break;
        }

        case 'call-accepted': {
          if (statusRef.current === 'calling') {
            remoteUsernameRef.current = payload.from;
            console.log('[Call] Call accepted by', payload.from);
            try {
              await createPeerConnection(true);
            } catch (err) {
              console.error('[Call] Failed to create peer connection:', err);
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
          if (statusRef.current !== 'idle') {
            console.log('[Call] Remote party ended the call');
            cleanup();
          }
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
                console.log('[Call] Remote description set (offer)');

                await flushPendingCandidates();

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                console.log('[Call] Created answer, waiting for ICE gathering...');

                // Wait for ICE gathering
                await waitForIceGathering(pc, 3000);

                const finalAnswer = pc.localDescription;
                channel.send({
                  type: 'broadcast',
                  event: 'signal',
                  payload: {
                    type: 'webrtc-answer',
                    from: usernameRef.current,
                    to: remoteUsernameRef.current,
                    sdp: finalAnswer,
                  } as SignalPayload,
                });
                console.log('[Call] Sent WebRTC answer to', remoteUsernameRef.current);

                // Set status to connecting (waiting for ICE to connect)
                setStatus('connecting');

                // Set ICE timeout — if ICE doesn't connect in 20s, show error
                iceTimeoutRef.current = setTimeout(() => {
                  if (statusRef.current === 'connecting') {
                    console.error('[Call] ICE connection timeout!');
                    setError('连接超时，请检查网络环境或尝试更换网络');
                    setTimeout(() => cleanup(), 3000);
                  }
                }, 20000);
              }
            } catch (err) {
              console.error('[Call] Failed to handle offer:', err);
              setError('连接失败');
              cleanup();
            }
          }
          break;
        }

        case 'webrtc-answer': {
          if (statusRef.current === 'connecting' && pcRef.current && payload.sdp) {
            try {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              console.log('[Call] Remote description set (answer)');

              await flushPendingCandidates();

              // Set ICE timeout for caller too
              iceTimeoutRef.current = setTimeout(() => {
                if (statusRef.current === 'connecting') {
                  console.error('[Call] ICE connection timeout (caller)!');
                  setError('连接超时，请检查网络环境或尝试更换网络');
                  setTimeout(() => cleanup(), 3000);
                }
              }, 20000);

              console.log('[Call] Waiting for ICE to connect...');
            } catch (err) {
              console.error('[Call] Failed to set remote description:', err);
              setError('连接失败');
              cleanup();
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
              } catch (err) {
                console.warn('[Call] Failed to add ICE candidate:', err);
              }
            } else {
              pendingCandidatesRef.current.push(payload.candidate);
              console.log('[Call] Buffered ICE candidate, total:', pendingCandidatesRef.current.length);
            }
          }
          break;
        }
      }
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channelReadyRef.current = true;
        console.log('[Call] Channel subscribed for room:', roomId);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[Call] Channel subscription failed:', status);
        channelReadyRef.current = false;
      }
    });
    channelRef.current = channel;

    return () => {
      if (statusRef.current === 'connected' || statusRef.current === 'connecting' || statusRef.current === 'calling') {
        channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            type: 'call-ended',
            from: usernameRef.current,
          } as SignalPayload,
        });
      }
      channelReadyRef.current = false;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, username]);

  // Start an outgoing call
  const startCall = useCallback(async () => {
    if (!roomId || statusRef.current !== 'idle') return;

    if (!channelReadyRef.current) {
      setError('连接未就绪，请稍后再试');
      setTimeout(() => setError(''), 2000);
      return;
    }

    setError('');

    try {
      console.log('[Call] Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      console.log('[Call] ✅ Got local audio stream, tracks:', stream.getTracks().length);
      stream.getTracks().forEach((t, i) => {
        console.log(`[Call] Local track ${i}: kind=${t.kind}, enabled=${t.enabled}, readyState=${t.readyState}`);
      });

      setStatus('calling');
      setCallerName(username);

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            type: 'call-invite',
            from: username,
            caller: username,
          } as SignalPayload,
        });
        console.log('[Call] Sent call-invite to room:', roomId);
      }

      callTimeoutRef.current = setTimeout(() => {
        if (statusRef.current === 'calling') {
          setError('无人接听');
          setTimeout(() => cleanup(), 1500);
        }
      }, 30000);
    } catch (err: any) {
      console.error('[Call] Failed to start call:', err);
      if (err.name === 'NotAllowedError') {
        setError('请允许麦克风权限');
      } else if (err.name === 'NotFoundError') {
        setError('未找到麦克风设备');
      } else {
        setError('无法启动通话');
      }
      cleanup();
    }
  }, [roomId, username, status, cleanup]);

  // Accept an incoming call
  const acceptCall = useCallback(async () => {
    if (statusRef.current !== 'ringing') return;
    setError('');

    try {
      console.log('[Call] Accepting call, requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      console.log('[Call] ✅ Got local audio stream for accepting call');

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            type: 'call-accepted',
            from: username,
            to: remoteUsernameRef.current,
          } as SignalPayload,
        });
        console.log('[Call] Accepted call, notified', remoteUsernameRef.current);
      }
    } catch (err: any) {
      console.error('[Call] Failed to accept call:', err);
      if (err.name === 'NotAllowedError') {
        setError('请允许麦克风权限');
      } else {
        setError('无法接听通话');
      }
      cleanup();
    }
  }, [username, cleanup]);

  // Decline an incoming call
  const declineCall = useCallback(() => {
    if (statusRef.current !== 'ringing') return;
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'signal',
        payload: {
          type: 'call-declined',
          from: username,
          to: remoteUsernameRef.current,
        } as SignalPayload,
      });
    }
    cleanup();
  }, [username, cleanup]);

  // End the current call
  const endCall = useCallback(() => {
    if (channelRef.current && statusRef.current !== 'idle' && statusRef.current !== 'ringing') {
      channelRef.current.send({
        type: 'broadcast',
        event: 'signal',
        payload: {
          type: 'call-ended',
          from: username,
          to: remoteUsernameRef.current || undefined,
        } as SignalPayload,
      });
    }
    cleanup();
  }, [username, status, cleanup]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        console.log('[Call] Mute toggled:', !audioTrack.enabled);
      }
    }
  }, []);

  // Retry audio playback on any user interaction during call
  useEffect(() => {
    if (status !== 'connected') return;
    const unlock = () => {
      ensureAudioPlaying();
    };
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, [status, ensureAudioPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current && (statusRef.current === 'connected' || statusRef.current === 'connecting' || statusRef.current === 'calling')) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            type: 'call-ended',
            from: usernameRef.current,
          } as SignalPayload,
        });
      }
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    callerName,
    duration,
    isMuted,
    error,
    audioBlocked,
    iceState,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    unlockAudio: ensureAudioPlaying,
  };
}
