import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected';

interface SignalPayload {
  type: 'call-invite' | 'call-accepted' | 'call-declined' | 'call-ended' | 'webrtc-offer' | 'webrtc-answer' | 'webrtc-ice';
  from: string;
  to?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  caller: string;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
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

export function useCall(roomId: string | null, username: string) {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [callerName, setCallerName] = useState('');
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState('');
  const [audioBlocked, setAudioBlocked] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<CallStatus>('idle');
  const usernameRef = useRef(username);
  const remoteUsernameRef = useRef<string>(''); // Who we're talking to
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]); // Buffer early ICE candidates
  const channelReadyRef = useRef(false); // Track subscription status
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { usernameRef.current = username; }, [username]);

  // Create a hidden audio element for remote audio
  useEffect(() => {
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute('playsinline', ''); // Required for iOS Safari
    audio.muted = false; // Explicitly not muted
    audio.volume = 1;
    audio.style.display = 'none';
    document.body.appendChild(audio);
    remoteAudioRef.current = audio;
    return () => { audio.remove(); };
  }, []);

  // Try to play remote audio — retry on user interaction if blocked by autoplay policy
  const ensureAudioPlaying = useCallback(() => {
    const audio = remoteAudioRef.current;
    if (!audio || !audio.srcObject) return;
    audio.muted = false;
    audio.play()
      .then(() => {
        setAudioBlocked(false);
        console.log('[Call] Remote audio playing successfully');
      })
      .catch((err) => {
        console.warn('[Call] Audio autoplay blocked:', err.message);
        setAudioBlocked(true);
      });
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
  }, [stopTimer]);

  // Create peer connection and wire up signaling
  const createPeerConnection = useCallback(async (isCaller: boolean) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Remote audio
    pc.ontrack = (event) => {
      console.log('[Call] ontrack fired, streams:', event.streams.length, 'tracks:', event.streams[0]?.getTracks().length);
      if (remoteAudioRef.current && event.streams[0]) {
        const stream = event.streams[0];
        // Log track details for debugging
        stream.getTracks().forEach((track, i) => {
          console.log(`[Call] Remote track ${i}: kind=${track.kind}, enabled=${track.enabled}, readyState=${track.readyState}`);
        });
        remoteAudioRef.current.srcObject = stream;
        // Try to play immediately
        ensureAudioPlaying();
      }
    };

    // Connection state monitoring
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log('[Call] ICE connection state:', state);
      if (state === 'failed') {
        setError('网络连接失败，可能需要VPN');
        setTimeout(() => cleanup(), 2000);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[Call] Connection state:', state);
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        if (statusRef.current === 'connected' || statusRef.current === 'calling') {
          cleanup();
        }
      }
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

    pcRef.current = pc;

    if (isCaller) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      // Wait for ICE gathering to complete (non-trickle) for more reliable connection
      // Actually, use trickle ICE for faster connection — just send the offer now
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
      console.log('[Call] Sent WebRTC offer to', remoteUsernameRef.current || 'all');
    }
  }, [cleanup]);

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
          // Incoming call notification
          if (statusRef.current === 'idle') {
            remoteUsernameRef.current = payload.from; // Remember who's calling
            setCallerName(payload.caller || payload.from);
            setStatus('ringing');
            console.log('[Call] Incoming call from', payload.from);
          }
          break;
        }

        case 'call-accepted': {
          // My call was accepted, start WebRTC as caller
          if (statusRef.current === 'calling') {
            remoteUsernameRef.current = payload.from; // Remember who answered
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
          // My call was declined
          if (statusRef.current === 'calling') {
            setError('对方拒绝了通话');
            setTimeout(() => cleanup(), 1500);
          }
          break;
        }

        case 'call-ended': {
          // Other party ended the call
          if (statusRef.current === 'connected' || statusRef.current === 'ringing') {
            console.log('[Call] Remote party ended the call');
            cleanup();
          }
          break;
        }

        case 'webrtc-offer': {
          // Incoming WebRTC offer — I'm the callee
          if (statusRef.current === 'ringing' || statusRef.current === 'idle') {
            try {
              // Remember who sent the offer (should be the caller)
              if (payload.from) remoteUsernameRef.current = payload.from;

              await createPeerConnection(false);
              const pc = pcRef.current;
              if (pc && payload.sdp) {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                console.log('[Call] Remote description set (offer)');

                // Flush any buffered ICE candidates that arrived before the offer
                await flushPendingCandidates();

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
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
                console.log('[Call] Sent WebRTC answer to', remoteUsernameRef.current);
                setStatus('connected');
                startTimer();
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
          // Callee accepted our offer
          if (statusRef.current === 'calling' && pcRef.current && payload.sdp) {
            try {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              console.log('[Call] Remote description set (answer)');

              // Flush any buffered ICE candidates
              await flushPendingCandidates();

              setStatus('connected');
              startTimer();
              console.log('[Call] Connection established!');
            } catch (err) {
              console.error('[Call] Failed to set remote description:', err);
              setError('连接失败');
              cleanup();
            }
          }
          break;
        }

        case 'webrtc-ice': {
          // ICE candidate exchange — buffer if PC not ready or remote description not set
          if (payload.candidate) {
            const pc = pcRef.current;
            if (pc && pc.remoteDescription) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
              } catch (err) {
                console.warn('[Call] Failed to add ICE candidate:', err);
              }
            } else {
              // Buffer the candidate — will be flushed after remote description is set
              pendingCandidatesRef.current.push(payload.candidate);
              console.log('[Call] Buffered ICE candidate (PC not ready), total buffered:', pendingCandidatesRef.current.length);
            }
          }
          break;
        }
      }
    });

    // Wait for subscription to be confirmed before marking channel as ready
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
      // Notify others before leaving
      if (statusRef.current === 'connected' || statusRef.current === 'calling') {
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

    // Wait for channel to be ready
    if (!channelReadyRef.current) {
      setError('连接未就绪，请稍后再试');
      setTimeout(() => setError(''), 2000);
      return;
    }

    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setStatus('calling');
      setCallerName(username);

      // Broadcast call invite to the room (no specific target — anyone can answer)
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

      // Auto-cancel after 30s if no answer
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      // Notify caller that we accepted (target the caller specifically)
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            type: 'call-accepted',
            from: username,
            to: remoteUsernameRef.current, // Target the caller
          } as SignalPayload,
        });
        console.log('[Call] Accepted call, notified', remoteUsernameRef.current);
      }
      // WebRTC connection will be set up when we receive the offer
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
          to: remoteUsernameRef.current, // Target the caller
        } as SignalPayload,
      });
    }
    cleanup();
  }, [username, cleanup]);

  // End the current call
  const endCall = useCallback(() => {
    if (channelRef.current && (statusRef.current === 'connected' || statusRef.current === 'calling')) {
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
      }
    }
  }, []);

  // Retry audio playback on any user interaction during call (browsers block autoplay)
  useEffect(() => {
    if (status !== 'connected') return;
    const unlock = () => {
      if (audioBlocked) ensureAudioPlaying();
    };
    // Listen for any click/touch — the first one will unlock audio
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
    // Also retry periodically — sometimes the stream isn't ready on first try
    const retryInterval = setInterval(() => {
      ensureAudioPlaying();
    }, 2000);
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
      clearInterval(retryInterval);
    };
  }, [status, audioBlocked, ensureAudioPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current && (statusRef.current === 'connected' || statusRef.current === 'calling')) {
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
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    unlockAudio: ensureAudioPlaying,
  };
}
