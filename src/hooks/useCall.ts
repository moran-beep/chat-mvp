import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected';

interface SignalPayload {
  type: 'call-invite' | 'call-accepted' | 'call-declined' | 'call-ended' | 'webrtc-offer' | 'webrtc-answer' | 'webrtc-ice';
  from: string;
  to: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  caller: string;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export function useCall(roomId: string | null, username: string) {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [callerName, setCallerName] = useState('');
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState('');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<CallStatus>('idle');
  const usernameRef = useRef(username);

  // Keep refs in sync
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { usernameRef.current = username; }, [username]);

  // Create a hidden audio element for remote audio
  useEffect(() => {
    const audio = new Audio();
    audio.autoplay = true;
    audio.style.display = 'none';
    document.body.appendChild(audio);
    remoteAudioRef.current = audio;
    return () => { audio.remove(); };
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

  // Full cleanup
  const cleanup = useCallback(() => {
    stopTimer();
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    setStatus('idle');
    setCallerName('');
    setDuration(0);
    setIsMuted(false);
    setError('');
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
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
        // Play might need user interaction
        remoteAudioRef.current.play().catch(() => {});
      }
    };

    // Connection state
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        if (statusRef.current === 'connected' || statusRef.current === 'calling') {
          cleanup();
        }
      }
    };

    // ICE candidates → broadcast
    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            type: 'webrtc-ice',
            from: usernameRef.current,
            candidate: event.candidate.toJSON(),
          } as SignalPayload,
        });
      }
    };

    pcRef.current = pc;

    if (isCaller) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      channelRef.current?.send({
        type: 'broadcast',
        event: 'signal',
        payload: {
          type: 'webrtc-offer',
          from: usernameRef.current,
          sdp: offer,
        } as SignalPayload,
      });
    }
  }, [cleanup]);

  // Set up signaling channel for the room
  useEffect(() => {
    if (!roomId || !username) return;

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

      switch (payload.type) {
        case 'call-invite': {
          // Incoming call notification
          if (statusRef.current === 'idle') {
            setCallerName(payload.caller || payload.from);
            setStatus('ringing');
          }
          break;
        }

        case 'call-accepted': {
          // My call was accepted, start WebRTC as caller
          if (statusRef.current === 'calling') {
            try {
              await createPeerConnection(true);
            } catch (err) {
              console.error('Failed to create peer connection:', err);
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
            cleanup();
          }
          break;
        }

        case 'webrtc-offer': {
          // Incoming WebRTC offer — I'm the callee
          if (statusRef.current === 'ringing' || statusRef.current === 'idle') {
            try {
              // Need local stream (was already requested on accept)
              await createPeerConnection(false);
              const pc = pcRef.current;
              if (pc && payload.sdp) {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                channel.send({
                  type: 'broadcast',
                  event: 'signal',
                  payload: {
                    type: 'webrtc-answer',
                    from: usernameRef.current,
                    sdp: answer,
                  } as SignalPayload,
                });
                setStatus('connected');
                startTimer();
              }
            } catch (err) {
              console.error('Failed to handle offer:', err);
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
              setStatus('connected');
              startTimer();
            } catch (err) {
              console.error('Failed to set remote description:', err);
              setError('连接失败');
              cleanup();
            }
          }
          break;
        }

        case 'webrtc-ice': {
          // ICE candidate exchange
          if (pcRef.current && payload.candidate) {
            try {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } catch (err) {
              // ICE errors are non-fatal during negotiation
            }
          }
          break;
        }
      }
    });

    channel.subscribe();
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
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, username]);

  // Start an outgoing call
  const startCall = useCallback(async () => {
    if (!roomId || statusRef.current !== 'idle') return;
    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setStatus('calling');
      setCallerName(username);

      // Broadcast call invite to the room
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
      }

      // Auto-cancel after 30s if no answer
      setTimeout(() => {
        if (statusRef.current === 'calling') {
          setError('无人接听');
          setTimeout(() => cleanup(), 1500);
        }
      }, 30000);
    } catch (err: any) {
      console.error('Failed to start call:', err);
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

      // Notify caller that we accepted
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            type: 'call-accepted',
            from: username,
          } as SignalPayload,
        });
      }
      // WebRTC connection will be set up when we receive the offer
    } catch (err: any) {
      console.error('Failed to accept call:', err);
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
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
  };
}
