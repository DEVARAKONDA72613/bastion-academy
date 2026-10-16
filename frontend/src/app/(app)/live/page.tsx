'use client';
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';
type Participant = {
  userId: string; name: string; role: string; micState: string; cameraState: string;
  handRaised: boolean; speaking: boolean; quality: 'good' | 'fair' | 'poor' | 'unknown';
  canShareScreen: boolean; canChat: boolean; isMutedByHost: boolean;
};
type ChatMessage = { id: string; fromUserId: string; content: string; sentAt?: string };
type SharedFile = { id: string; name: string; size: number; url: string; fromUserId: string; sentAt: string };
type FileTransfer = { name: string; type: string; size: number; chunks: ArrayBuffer[] };

function shortName(value: string) { return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value; }
function elapsed(seconds: number) { const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = Math.floor(seconds % 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }
function formatBytes(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`; }
function mediaErrorMessage(err: unknown) {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Camera/microphone access was denied. Allow permissions in your browser to send audio or video.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No matching camera or microphone was found on this device.';
  if (name === 'NotReadableError') return 'Your camera or microphone may be in use by another app.';
  return err instanceof Error ? err.message : 'Media devices could not be started.';
}

export default function LiveRoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [meeting, setMeeting] = useState<any>(null);
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [recordingIntent, setRecordingIntent] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [tab, setTab] = useState<'chat' | 'people'>('chat');
  const [notice, setNotice] = useState('');
  const [fatalError, setFatalError] = useState('');
  const [ended, setEnded] = useState(false);
  const [multipleCameras, setMultipleCameras] = useState(false);
  const [meCanShare, setMeCanShare] = useState(true);
  const [meCanChat, setMeCanChat] = useState(true);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<Record<string, HTMLVideoElement | null>>({});
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const socketRef = useRef<Socket | null>(null);
  const meetingRef = useRef<any>(null);
  const filesRef = useRef<SharedFile[]>([]);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const dataChannelsRef = useRef<Record<string, RTCDataChannel>>({});
  const receivingFilesRef = useRef<Record<string, FileTransfer>>({});
  const analysersRef = useRef<Record<string, AnalyserNode>>({});
  const audioContextsRef = useRef<AudioContext[]>([]);
  const callStartRef = useRef<number>(Date.now());
  const currentParticipantsRef = useRef<Record<string, Participant>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const screenPermissionRef = useRef(true);

  const myId = user?.id;
  const hostId = meeting?.host_id as string | undefined;
  const myParticipant = myId ? participants[myId] : undefined;
  const isHost = !!myId && (hostId === myId || myParticipant?.role === 'host');
  const isCoHost = myParticipant?.role === 'co_host';
  const canModerate = isHost || isCoHost;
  const isLocked = !!meeting?.is_locked;
  const participantCount = Object.keys(participants).length;
  const startDate = useMemo(() => meeting?.started_at || meeting?.created_at || null, [meeting?.started_at, meeting?.created_at]);

  useEffect(() => { currentParticipantsRef.current = participants; }, [participants]);
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => () => { filesRef.current.forEach((file) => URL.revokeObjectURL(file.url)); }, []);
  useEffect(() => { screenPermissionRef.current = meCanShare; }, [meCanShare]);

  const refreshSnapshot = useCallback(async (meetingId: string) => {
    const snapshot = await api.getMeeting(meetingId);
    meetingRef.current = snapshot.meeting;
    setMeeting(snapshot.meeting);
    setParticipants((current) => {
      const next: Record<string, Participant> = {};
      for (const p of snapshot.participants || []) {
        const prior = current[p.user_id];
        next[p.user_id] = {
          userId: p.user_id,
          name: p.display_name || `User ${shortName(p.user_id)}`,
          role: p.participant_role,
          micState: p.mic_state || 'off',
          cameraState: p.camera_state || 'off',
          handRaised: prior?.handRaised ?? false,
          speaking: prior?.speaking ?? false,
          quality: prior?.quality ?? 'unknown',
          canShareScreen: p.can_share_screen !== false,
          canChat: p.can_chat !== false,
          isMutedByHost: !!p.is_muted_by_host,
        };
      }
      return next;
    });
    const mine = snapshot.participants?.find((p) => p.user_id === myId);
    setMeCanShare(mine?.can_share_screen !== false);
    setMeCanChat(mine?.can_chat !== false);
    return snapshot;
  }, [myId]);

  const updateParticipant = useCallback((id: string, patch: Partial<Participant>) => {
    setParticipants((current) => {
      if (!current[id]) return current;
      return { ...current, [id]: { ...current[id], ...patch } };
    });
  }, []);

  const setupAnalyser = useCallback((stream: MediaStream, id: string) => {
    if (analysersRef.current[id] || !stream.getAudioTracks().length) return;
    try {
      const AudioContextCtor = window.AudioContext;
      const context = new AudioContextCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      analysersRef.current[id] = analyser;
      audioContextsRef.current.push(context);
      void context.resume().catch(() => {});
    } catch { /* Speaking indicator is an enhancement; call audio can still work. */ }
  }, []);

  const bindFileChannel = useCallback((peerId: string, channel: RTCDataChannel) => {
    dataChannelsRef.current[peerId] = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = 256 * 1024;
    channel.onclose = () => { if (dataChannelsRef.current[peerId] === channel) delete dataChannelsRef.current[peerId]; };
    channel.onmessage = (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data) as { kind: string; id?: string; name?: string; type?: string; size?: number };
          if (msg.kind === 'file-start' && msg.id && msg.name) {
            receivingFilesRef.current[`${peerId}:${msg.id}`] = { name: msg.name, type: msg.type || 'application/octet-stream', size: msg.size || 0, chunks: [] };
          } else if (msg.kind === 'file-end' && msg.id) {
            const key = `${peerId}:${msg.id}`;
            const incoming = receivingFilesRef.current[key];
            if (!incoming) return;
            const blob = new Blob(incoming.chunks, { type: incoming.type });
            const url = URL.createObjectURL(blob);
            setFiles((current) => [...current, { id: `${peerId}-${msg.id}`, name: incoming.name, size: incoming.size, url, fromUserId: peerId, sentAt: new Date().toISOString() }]);
            delete receivingFilesRef.current[key];
            setNotice(`Received ${incoming.name} from ${currentParticipantsRef.current[peerId]?.name || shortName(peerId)}.`);
          }
        } catch { /* Ignore malformed data-channel messages. */ }
      } else if (event.data instanceof ArrayBuffer) {
        const transfer = Object.entries(receivingFilesRef.current).find(([key]) => key.startsWith(`${peerId}:`));
        if (transfer) transfer[1].chunks.push(event.data);
      } else if (event.data instanceof Blob) {
        void event.data.arrayBuffer().then((buffer) => {
          const transfer = Object.entries(receivingFilesRef.current).find(([key]) => key.startsWith(`${peerId}:`));
          if (transfer) transfer[1].chunks.push(buffer);
        });
      }
    };
  }, []);

  async function renegotiatePeer(peerId: string, pc: RTCPeerConnection) {
    const socket = socketRef.current;
    const activeMeeting = meetingRef.current;
    if (!socket?.connected || !activeMeeting || pc.signalingState !== 'stable') return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('meeting:offer', { meetingId: activeMeeting.id, toUserId: peerId, sdp: offer });
    } catch (err) {
      setNotice(err instanceof Error ? `Could not renegotiate media with ${shortName(peerId)}.` : 'Could not renegotiate media.');
    }
  }

  const createPeerConnection = useCallback((peerId: string, createFileChannel: boolean) => {
    const existing = peersRef.current[peerId];
    if (existing && existing.connectionState !== 'closed' && existing.connectionState !== 'failed') return existing;
    const socket = socketRef.current;
    const activeMeeting = meetingRef.current;
    if (!socket || !activeMeeting) throw new Error('Signalling connection is not ready.')
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peersRef.current[peerId] = pc;

    const local = localStreamRef.current;
    const screenTrack = screenStreamRef.current?.getVideoTracks()[0];
    if (local) {
      local.getTracks().filter((track) => !(screenTrack && track.kind === 'video')).forEach((track) => pc.addTrack(track, local));
    }
    if (screenTrack) pc.addTrack(screenTrack, screenStreamRef.current!);

    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit('meeting:ice-candidate', { meetingId: activeMeeting.id, toUserId: peerId, candidate: event.candidate });
    };
    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      remoteStreamsRef.current[peerId] = stream;
      setRemoteStreams((current) => ({ ...current, [peerId]: stream }));
      setupAnalyser(stream, peerId);
      const element = remoteVideosRef.current[peerId];
      if (element && element.srcObject !== stream) element.srcObject = stream;
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'failed') updateParticipant(peerId, { quality: 'poor' });
      if (state === 'connected') updateParticipant(peerId, { quality: 'fair' });
    };
    pc.ondatachannel = (event) => bindFileChannel(peerId, event.channel);
    if (createFileChannel) bindFileChannel(peerId, pc.createDataChannel('bastion-files'));
    return pc;
  }, [bindFileChannel, setupAnalyser, updateParticipant]);

  useEffect(() => {
    let active = true;
    let activeMeetingId = '';
    let statsTimer: number | undefined;
    let speakingTimer: number | undefined;
    let timerTimer: number | undefined;

    async function setup() {
      let joined: any;
      try {
        joined = await api.joinMeeting(roomCode);
        if (!active) return;
        activeMeetingId = joined.meeting.id;
        const snapshot = await api.getMeeting(activeMeetingId);
        if (!active) return;
        meetingRef.current = snapshot.meeting;
        setMeeting(snapshot.meeting);
        callStartRef.current = new Date(snapshot.meeting.started_at || snapshot.meeting.created_at || Date.now()).getTime();
        const initial: Record<string, Participant> = {};
        for (const p of snapshot.participants || []) initial[p.user_id] = {
          userId: p.user_id, name: p.display_name || `User ${shortName(p.user_id)}`, role: p.participant_role,
          micState: p.mic_state || 'off', cameraState: p.camera_state || 'off', handRaised: false, speaking: false,
          quality: 'unknown', canShareScreen: p.can_share_screen !== false, canChat: p.can_chat !== false, isMutedByHost: !!p.is_muted_by_host,
        };
        setParticipants(initial);
        const mine = snapshot.participants?.find((p) => p.user_id === myId);
        setMeCanShare(mine?.can_share_screen !== false); setMeCanChat(mine?.can_chat !== false);

        let stream: MediaStream | null = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
        } catch (fullError) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
            setNotice(`${mediaErrorMessage(fullError)} Audio-only mode is enabled.`);
            setCamOn(false);
          } catch (audioError) {
            setNotice(`${mediaErrorMessage(audioError)} You can still listen or chat if the browser allows it.`);
            setCamOn(false); setMicOn(false);
          }
        }
        if (!active) { stream?.getTracks().forEach((track) => track.stop()); return; }
        localStreamRef.current = stream;
        if (localVideoRef.current && stream) localVideoRef.current.srcObject = stream;
        setCamOn(!!stream?.getVideoTracks().length);
        setMicOn(!!stream?.getAudioTracks().length);
        if (stream && myId) setupAnalyser(stream, myId);
        if (navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
          setMultipleCameras(devices.filter((device) => device.kind === 'videoinput').length > 1);
        }

        const socket = io(SOCKET_URL, { withCredentials: true, transports: ['websocket', 'polling'] });
        socketRef.current = socket;
        socket.on('connect', () => { socket.emit('meeting:join', { meetingId: activeMeetingId }); window.setTimeout(() => { void refreshSnapshot(activeMeetingId).catch(() => {}); }, 250); });

        socket.on('meeting:participant-joined', async ({ userId: peerId }: { userId: string }) => {
          if (peerId === myId) return;
          void refreshSnapshot(activeMeetingId).catch(() => {});
          try {
            const pc = createPeerConnection(peerId, true);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('meeting:offer', { meetingId: activeMeetingId, toUserId: peerId, sdp: offer });
          } catch (err) { setNotice(err instanceof Error ? err.message : 'Could not connect to a participant.'); }
        });

        socket.on('meeting:offer', async ({ fromUserId, sdp }: any) => {
          try {
            const pc = createPeerConnection(fromUserId, false);
            await pc.setRemoteDescription(sdp);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('meeting:answer', { meetingId: activeMeetingId, toUserId: fromUserId, sdp: answer });
          } catch (err) { setNotice(err instanceof Error ? err.message : 'Could not answer the call.'); }
        });
        socket.on('meeting:answer', async ({ fromUserId, sdp }: any) => {
          try { await peersRef.current[fromUserId]?.setRemoteDescription(sdp); } catch { /* stale answer after reconnect */ }
        });
        socket.on('meeting:ice-candidate', async ({ fromUserId, candidate }: any) => {
          try { await peersRef.current[fromUserId]?.addIceCandidate(candidate); } catch { /* stale candidate after renegotiation */ }
        });
        const onParticipantLeft = ({ userId: peerId }: { userId: string }) => {
          peersRef.current[peerId]?.close(); delete peersRef.current[peerId];
          dataChannelsRef.current[peerId]?.close(); delete dataChannelsRef.current[peerId];
          delete remoteStreamsRef.current[peerId]; delete analysersRef.current[peerId];
          setRemoteStreams((current) => { const next = { ...current }; delete next[peerId]; return next; });
          setParticipants((current) => { const next = { ...current }; delete next[peerId]; return next; });
          void refreshSnapshot(activeMeetingId).catch(() => {});
        };
        socket.on('meeting:participant-left', onParticipantLeft);
        socket.on('participant-left', onParticipantLeft);
        socket.on('meeting:chat', (message: ChatMessage) => setChat((current) => [...current, { ...message, id: `${Date.now()}-${Math.random()}` }]));
        socket.on('meeting:hand-raised', ({ userId, raised }: { userId: string; raised: boolean }) => updateParticipant(userId, { handRaised: raised !== false }));
        socket.on('meeting:media-state', ({ userId, micState, cameraState, isMutedByHost }: { userId: string; micState?: string; cameraState?: string; isMutedByHost?: boolean }) => updateParticipant(userId, { ...(micState ? { micState } : {}), ...(cameraState ? { cameraState } : {}), ...(typeof isMutedByHost === 'boolean' ? { isMutedByHost } : {}) }));
        socket.on('meeting:force-mute', () => { localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; }); setMicOn(false); setNotice('The host muted your microphone.'); });
        socket.on('meeting:host-unmuted', () => setNotice('The host has allowed you to unmute. Use the microphone control when ready.'));
        socket.on('meeting:removed', (payload: { message?: string }) => { setFatalError(payload?.message || 'The host removed you from this meeting.'); setEnded(true); localStreamRef.current?.getTracks().forEach((track) => track.stop()); screenStreamRef.current?.getTracks().forEach((track) => track.stop()); Object.values(peersRef.current).forEach((pc) => pc.close()); socket.disconnect(); });
        socket.on('meeting:lock-state', ({ locked }: { locked: boolean }) => setMeeting((current: any) => { if (!current) return current; const next = { ...current, is_locked: locked }; meetingRef.current = next; return next; }));
        socket.on('meeting:roles-changed', () => void refreshSnapshot(activeMeetingId).catch(() => {}));
        socket.on('meeting:permissions-changed', ({ userId, can_share_screen, can_chat }: { userId: string; can_share_screen: boolean; can_chat: boolean }) => {
          updateParticipant(userId, { canShareScreen: can_share_screen, canChat: can_chat });
          if (userId === myId) { setMeCanShare(can_share_screen); setMeCanChat(can_chat); if (!can_share_screen && screenStreamRef.current) stopScreenShare(); }
        });
        socket.on('meeting:permissions-updated', ({ userId, can_share_screen, can_chat }: { userId: string; can_share_screen: boolean; can_chat: boolean }) => updateParticipant(userId, { canShareScreen: can_share_screen, canChat: can_chat }));
        socket.on('meeting:recording', ({ active: isActive }: { active: boolean }) => { setRecordingIntent(isActive); setNotice(isActive ? 'Recording intent enabled. Media capture is not connected in this build.' : 'Recording stopped.'); });
        socket.on('meeting:ended', () => { setEnded(true); setNotice('The host ended this meeting.'); localStreamRef.current?.getTracks().forEach((track) => track.stop()); screenStreamRef.current?.getTracks().forEach((track) => track.stop()); Object.values(peersRef.current).forEach((pc) => pc.close()); });
        socket.on('meeting:error', (event: { message: string }) => setNotice(event.message));
        socket.on('disconnect', () => setNotice('Signalling disconnected. The app will try to reconnect automatically.'));
        socket.on('connect_error', () => setNotice('Unable to connect to the live-room signalling server.'));

        const sendMediaState = (mic: boolean, camera: boolean) => socket.emit('meeting:media-state', { meetingId: activeMeetingId, micState: mic ? 'on' : 'off', cameraState: camera ? 'on' : 'off' });
        sendMediaState(!!stream?.getAudioTracks().length, !!stream?.getVideoTracks().length);

        statsTimer = window.setInterval(async () => {
          for (const [peerId, pc] of Object.entries(peersRef.current)) {
            if (pc.connectionState !== 'connected') continue;
            try {
              const stats = await pc.getStats();
              let rtt: number | null = null;
              stats.forEach((report) => {
                if (report.type === 'candidate-pair' && (report.selected || (report.nominated && report.state === 'succeeded')) && typeof report.currentRoundTripTime === 'number') rtt = report.currentRoundTripTime;
              });
              const quality = rtt === null ? 'fair' : rtt < 0.15 ? 'good' : rtt < 0.4 ? 'fair' : 'poor';
              updateParticipant(peerId, { quality });
            } catch { /* getStats may fail during renegotiation */ }
          }
        }, 3000);
        speakingTimer = window.setInterval(() => {
          const ids = Object.keys(analysersRef.current);
          for (const id of ids) {
            const analyser = analysersRef.current[id];
            const samples = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteTimeDomainData(samples);
            const power = samples.reduce((sum, item) => sum + Math.abs(item - 128), 0) / Math.max(samples.length, 1);
            const speaking = power > 8;
            const previous = currentParticipantsRef.current[id];
            if (previous && previous.speaking !== speaking) updateParticipant(id, { speaking });
          }
        }, 250);
        timerTimer = window.setInterval(() => {
          setCallSeconds(Math.max(0, Math.floor((Date.now() - callStartRef.current) / 1000)));
        }, 1000);
      } catch (err) {
        if (active) setFatalError(err instanceof Error ? err.message : 'Could not join this meeting.');
      }
    }

    void setup();
    return () => {
      active = false;
      if (statsTimer) window.clearInterval(statsTimer);
      if (speakingTimer) window.clearInterval(speakingTimer);
      if (timerTimer) window.clearInterval(timerTimer);
      socketRef.current?.disconnect(); socketRef.current = null;
      Object.values(peersRef.current).forEach((pc) => pc.close()); peersRef.current = {};
      Object.values(dataChannelsRef.current).forEach((channel) => channel.close()); dataChannelsRef.current = {};
      localStreamRef.current?.getTracks().forEach((track) => track.stop()); localStreamRef.current = null;
      screenStreamRef.current?.getTracks().forEach((track) => track.stop()); screenStreamRef.current = null;
      audioContextsRef.current.forEach((context) => { void context.close().catch(() => {}); }); audioContextsRef.current = [];
      if (activeMeetingId) void api.getMeeting(activeMeetingId).catch(() => {});
    };
    // State used by signal handlers is read through refs or stable callbacks where needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, myId, createPeerConnection, refreshSnapshot, setupAnalyser, updateParticipant, bindFileChannel]);

  // Bind newly rendered remote video elements to their latest remote streams.
  useEffect(() => {
    Object.entries(remoteStreams).forEach(([id, stream]) => {
      const element = remoteVideosRef.current[id];
      if (element && element.srcObject !== stream) element.srcObject = stream;
    });
  }, [remoteStreams, participants]);

  // Browser APIs are created only in the effect; this timer reflects the meeting's start timestamp.
  useEffect(() => {
    if (!startDate) return;
    const start = new Date(startDate).getTime();
    if (Number.isFinite(start)) setCallSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
  }, [startDate]);

  function emit(event: string, payload: Record<string, unknown>) {
    if (!meeting || !socketRef.current?.connected) { setNotice('Not connected to the signalling server.'); return; }
    socketRef.current.emit(event, { meetingId: meeting.id, ...payload });
  }

  function toggleMic() {
    if (!micOn && myParticipant?.isMutedByHost) {
      setNotice('The host has muted your microphone. Wait until they allow you to unmute.');
      return;
    }
    const next = !micOn;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = next; });
    setMicOn(next);
    if (myId) updateParticipant(myId, { micState: next ? 'on' : 'off' });
    emit('meeting:media-state', { micState: next ? 'on' : 'off' });
  }

  async function toggleCamera() {
    const currentTrack = localStreamRef.current?.getVideoTracks()[0];
    const next = !camOn;
    // If initial camera permission was denied, let the participant retry after changing
    // browser permissions instead of showing a camera-on state with no video track.
    if (next && (!currentTrack || currentTrack.readyState === 'ended')) {
      try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
        const replacement = cameraStream.getVideoTracks()[0];
        if (!replacement) throw new Error('No camera track was returned.');
        const local = localStreamRef.current ?? new MediaStream();
        localStreamRef.current = local;
        local.getTracks().filter((track) => track.kind === 'video').forEach((track) => { local.removeTrack(track); track.stop(); });
        local.addTrack(replacement);
        if (localVideoRef.current) localVideoRef.current.srcObject = local;
        for (const [peerId, pc] of Object.entries(peersRef.current)) {
          const sender = pc.getSenders().find((item) => item.track?.kind === 'video');
          if (sender) await sender.replaceTrack(replacement);
          else {
            pc.addTransceiver(replacement, { direction: 'sendrecv' });
            await renegotiatePeer(peerId, pc);
          }
        }
        setCamOn(true);
        if (myId) updateParticipant(myId, { cameraState: 'on' });
        emit('meeting:media-state', { cameraState: 'on' });
        setNotice('Camera enabled.');
      } catch (err) { setNotice(mediaErrorMessage(err)); }
      return;
    }
    if (!currentTrack) { setNotice('No active camera track. Allow camera access and try again.'); return; }
    currentTrack.enabled = next;
    setCamOn(next);
    if (myId) updateParticipant(myId, { cameraState: next ? 'on' : 'off' });
    emit('meeting:media-state', { cameraState: next ? 'on' : 'off' });
  }

  async function switchCamera() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
      if (devices.length < 2) { setNotice('A second camera is not available.'); return; }
      const currentTrack = localStreamRef.current?.getVideoTracks()[0];
      const currentId = currentTrack?.getSettings().deviceId;
      const index = Math.max(0, devices.findIndex((device) => device.deviceId === currentId));
      const nextDevice = devices[(index + 1) % devices.length];
      let replacement: MediaStreamTrack;
      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: nextDevice.deviceId } }, audio: false });
        replacement = nextStream.getVideoTracks()[0];
      } catch {
        const nextStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: index === 0 ? 'environment' : 'user' }, audio: false });
        replacement = nextStream.getVideoTracks()[0];
      }
      if (!replacement) throw new Error('Could not open the selected camera.');
      replacement.enabled = camOn;
      if (currentTrack) { localStreamRef.current?.removeTrack(currentTrack); currentTrack.stop(); }
      localStreamRef.current?.addTrack(replacement);
      for (const pc of Object.values(peersRef.current)) {
        const sender = pc.getSenders().find((item) => item.track?.kind === 'video');
        if (sender) await sender.replaceTrack(replacement);
        else await pc.addTransceiver('video', { direction: 'sendrecv' }).sender.replaceTrack(replacement);
      }
      if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      setNotice(`Camera switched to ${nextDevice.label || 'the next available camera'}.`);
      emit('meeting:media-state', { cameraState: camOn ? 'on' : 'off' });
    } catch (err) { setNotice(mediaErrorMessage(err)); }
  }

  async function startScreenShare() {
    if (!meCanShare) { setNotice('The host has disabled screen sharing for your account in this room.'); return; }
    if (!navigator.mediaDevices?.getDisplayMedia) { setNotice('Screen sharing requires a supported browser and a secure (HTTPS) page.'); return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
      const track = stream.getVideoTracks()[0];
      if (!track) { stream.getTracks().forEach((item) => item.stop()); return; }
      screenStreamRef.current = stream;
      for (const [peerId, pc] of Object.entries(peersRef.current)) {
        const sender = pc.getSenders().find((item) => item.track?.kind === 'video');
        if (sender) await sender.replaceTrack(track);
        else {
          pc.addTransceiver(track, { direction: 'sendrecv' });
          await renegotiatePeer(peerId, pc);
        }
      }
      track.onended = () => { void stopScreenShare(); };
      setScreenSharing(true);
      emit('meeting:media-state', { cameraState: 'screen' });
      if (myId) updateParticipant(myId, { cameraState: 'screen' });
      setNotice('You are sharing your screen.');
    } catch (err) { setNotice(mediaErrorMessage(err)); }
  }

  async function stopScreenShare() {
    const currentScreen = screenStreamRef.current;
    if (!currentScreen) return;
    currentScreen.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    screenStreamRef.current = null;
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null;
    for (const pc of Object.values(peersRef.current)) {
      const sender = pc.getSenders().find((item) => item.track?.kind === 'video');
      if (sender) await sender.replaceTrack(cameraTrack).catch(() => {});
    }
    setScreenSharing(false);
    emit('meeting:media-state', { cameraState: camOn ? 'on' : 'off' });
    if (myId) updateParticipant(myId, { cameraState: camOn ? 'on' : 'off' });
    setNotice('Screen sharing stopped.');
  }

  function raiseHand() {
    const next = !myParticipant?.handRaised;
    if (myId) updateParticipant(myId, { handRaised: next });
    emit('meeting:raise-hand', { raised: next });
  }

  function sendChat(event: React.FormEvent) {
    event.preventDefault();
    if (!chatInput.trim() || !meCanChat) return;
    emit('meeting:chat', { content: chatInput.trim().slice(0, 2000) });
    setChatInput('');
  }

  async function shareSelectedFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setNotice('For this peer-to-peer demo, file sharing is limited to 5 MB per file.'); return; }
    const channels = Object.entries(dataChannelsRef.current).filter(([, channel]) => channel.readyState === 'open');
    if (!channels.length) { setNotice('No connected peer data channel is ready yet. Try again when another participant is connected.'); return; }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const buffer = await file.arrayBuffer();
    for (const [peerId, channel] of channels) {
      try {
        channel.send(JSON.stringify({ kind: 'file-start', id, name: file.name, type: file.type || 'application/octet-stream', size: file.size }));
        for (let offset = 0; offset < buffer.byteLength; offset += 32 * 1024) {
          if (channel.readyState !== 'open') break;
          while (channel.bufferedAmount > 512 * 1024 && channel.readyState === 'open') await new Promise<void>((resolve) => {
            const done = () => { channel.removeEventListener('bufferedamountlow', done); resolve(); };
            channel.addEventListener('bufferedamountlow', done, { once: true });
          });
          channel.send(buffer.slice(offset, Math.min(offset + 32 * 1024, buffer.byteLength)));
        }
        channel.send(JSON.stringify({ kind: 'file-end', id }));
      } catch { setNotice(`File transfer to ${currentParticipantsRef.current[peerId]?.name || shortName(peerId)} failed.`); }
    }
    const url = URL.createObjectURL(file);
    setFiles((current) => [...current, { id: `local-${id}`, name: file.name, size: file.size, url, fromUserId: myId || '', sentAt: new Date().toISOString() }]);
    setNotice(`Shared ${file.name} peer-to-peer. Files are not stored on the server.`);
  }

  function hostMute(targetUserId: string) { emit('host-mute', { targetUserId }); }
  function hostRemove(targetUserId: string) {
    if (window.confirm(`Remove ${participants[targetUserId]?.name || 'this participant'} from the room?`)) emit('host-remove', { targetUserId });
  }
  function hostCoHost(targetUserId: string, grant: boolean) { emit('host-cohost', { targetUserId, grant }); }
  function hostPermission(targetUserId: string, key: 'canShareScreen' | 'canChat', value: boolean) {
    emit('host-permissions', key === 'canShareScreen' ? { targetUserId, canShareScreen: value } : { targetUserId, canChat: value });
  }
  function toggleLock() { emit('host-lock', { locked: !isLocked }); }
  function startRecordingIntent() {
    const ok = window.confirm('Confirm that every participant has consented. This demo records consent and a recording status only; it does not capture or store meeting audio/video. Continue?');
    if (ok) emit('host-record', { consentConfirmed: true });
  }
  function endCall() {
    if (isHost) {
      if (window.confirm('End this meeting for everyone?')) emit('host-end', {});
    } else router.push('/live');
  }

  const qualityLabel = (quality: Participant['quality']) => quality === 'good' ? 'Good' : quality === 'fair' ? 'Fair' : quality === 'poor' ? 'Poor' : 'Connecting';
  const qualityColor = (quality: Participant['quality']) => quality === 'good' ? 'text-success' : quality === 'fair' ? 'text-warning' : quality === 'poor' ? 'text-error' : 'text-text-dim';

  if (fatalError) return <div className="mx-auto max-w-xl rounded-lg border border-border bg-elevated p-6"><p className="font-mono text-xs uppercase tracking-widest text-error">Unable to join</p><h1 className="mt-2 text-xl font-semibold">Live room unavailable</h1><p className="mt-2 text-sm text-text-dim">{fatalError}</p><button onClick={() => router.push('/live')} className="mt-5 rounded bg-primary px-4 py-2 text-sm font-semibold text-bg">Back to live rooms</button></div>;

  if (ended) return <div className="mx-auto max-w-xl rounded-lg border border-border bg-elevated p-6"><p className="font-mono text-xs uppercase tracking-widest text-primary">Session ended</p><h1 className="mt-2 text-xl font-semibold">{fatalError ? 'You left the room' : 'The meeting has ended'}</h1><p className="mt-2 text-sm text-text-dim">{fatalError || 'The host ended this meeting for all participants.'}</p><button onClick={() => router.push('/live')} className="mt-5 rounded bg-primary px-4 py-2 text-sm font-semibold text-bg">Return to Live</button></div>;

  return <div className="space-y-4">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Live session · {roomCode}</p><h1 className="mt-1 break-words text-xl font-semibold sm:text-2xl">{meeting?.title ?? 'Connecting to live room…'}</h1><div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-dim"><span>● {participantCount} participant{participantCount === 1 ? '' : 's'}</span><span className="font-mono">{elapsed(callSeconds)}</span><span className={isLocked ? 'text-warning' : 'text-success'}>{isLocked ? 'Room locked' : 'Room open'}</span>{recordingIntent && <span className="rounded bg-error/10 px-2 py-1 text-error">● REC FLAG · no capture</span>}</div></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => { void navigator.clipboard.writeText(window.location.href).then(() => setNotice('Room link copied.')).catch(() => setNotice(window.location.href)); }} className="rounded border border-border px-3 py-2 text-xs hover:border-primary">Copy invite link</button>{isHost && <button onClick={toggleLock} className="rounded border border-border px-3 py-2 text-xs hover:border-primary">{isLocked ? 'Unlock room' : 'Lock room'}</button>}{isHost && <button disabled={recordingIntent} onClick={startRecordingIntent} className="rounded border border-border px-3 py-2 text-xs hover:border-primary disabled:opacity-50">Record intent</button>}<button onClick={endCall} className="rounded bg-error px-3 py-2 text-xs font-semibold text-white">{isHost ? 'End for all' : 'Leave call'}</button></div>
    </header>

    {(notice || !socketRef.current?.connected) && <div role="status" className="break-words rounded border border-border bg-surface px-3 py-2 text-xs text-text-dim">{notice || 'Connecting to signalling…'}</div>}
    {meeting?.max_participants && participantCount >= meeting.max_participants && <div className="rounded border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">This room is at its participant limit.</div>}

    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <div className={`grid gap-3 ${participantCount > 2 ? 'sm:grid-cols-2 2xl:grid-cols-3' : 'sm:grid-cols-2'}`}>
          {myId && <article className={`relative aspect-video overflow-hidden rounded-lg border bg-elevated ${participants[myId]?.speaking ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}>
            <video ref={localVideoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            {!camOn && <div className="absolute inset-0 flex items-center justify-center bg-surface/90"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-elevated text-2xl text-primary">{(user?.display_name || 'Y').slice(0, 1).toUpperCase()}</div></div>}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-3 pt-8 text-xs text-white"><span className="flex min-w-0 items-center gap-2 truncate">{user?.display_name || 'You'} <span className="rounded bg-white/15 px-1.5 py-0.5 text-[9px]">You{isHost ? ' · Host' : ''}</span>{participants[myId]?.handRaised && <span title="Hand raised">✋</span>}</span><span>{micOn ? '🎙' : '🔇'} {camOn ? '▣' : '▧'}</span></div>
          </article>}
          {Object.values(participants).filter((p) => p.userId !== myId).map((p) => <article key={p.userId} className={`relative aspect-video overflow-hidden rounded-lg border bg-elevated ${p.speaking ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}>
            <video ref={(element) => { remoteVideosRef.current[p.userId] = element; if (element && remoteStreamsRef.current[p.userId] && element.srcObject !== remoteStreamsRef.current[p.userId]) element.srcObject = remoteStreamsRef.current[p.userId]; }} autoPlay playsInline className="h-full w-full object-cover" />
            {(!remoteStreams[p.userId] || p.cameraState === 'off') && <div className="absolute inset-0 flex items-center justify-center bg-surface/90"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-elevated text-2xl text-primary">{p.name.slice(0, 1).toUpperCase()}</div></div>}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-3 pt-8 text-xs text-white"><span className="flex min-w-0 items-center gap-2 truncate">{p.name}{p.role !== 'participant' && <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] text-primary">{p.role.replace('_', ' ')}</span>}{p.handRaised && <span title="Hand raised">✋</span>}</span><span>{p.micState === 'off' ? '🔇' : '🎙'} {p.cameraState === 'screen' ? '▱ Screen' : p.cameraState === 'off' ? '▧' : '▣'}</span></div>
            <span className={`absolute right-2 top-2 rounded bg-black/65 px-2 py-1 text-[9px] ${qualityColor(p.quality)}`}>{qualityLabel(p.quality)}</span>
          </article>)}
          {participantCount <= 1 && <div className="flex aspect-video flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface p-4 text-center"><span className="text-2xl text-primary">◌</span><p className="mt-2 text-sm">Waiting for others to join</p><p className="mt-1 break-all text-xs text-text-dim">Share room code {meeting?.room_code || roomCode} to invite participants.</p></div>}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 rounded-lg border border-border bg-surface p-3">
          <button onClick={toggleMic} disabled={!!myParticipant?.isMutedByHost && !micOn} title={myParticipant?.isMutedByHost ? 'Muted by host' : micOn ? 'Mute microphone' : 'Unmute microphone'} className={`h-11 min-w-12 rounded px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${micOn ? 'bg-elevated' : 'bg-error text-white'}`}>{myParticipant?.isMutedByHost && !micOn ? '🔒 Muted by host' : micOn ? '🎙 Mic on' : '🔇 Mic off'}</button>
          <button onClick={() => void toggleCamera()} title={camOn ? 'Turn camera off' : 'Turn camera on'} className={`h-11 min-w-12 rounded px-3 text-xs font-medium ${camOn ? 'bg-elevated' : 'bg-error text-white'}`}>{screenSharing ? '▱ Sharing screen' : camOn ? '▣ Camera on' : '▧ Camera off'}</button>
          <button onClick={() => void switchCamera()} disabled={!multipleCameras || screenSharing} title="Switch front/rear camera" className="h-11 rounded border border-border px-3 text-xs disabled:opacity-40">⇄ Switch cam</button>
          <button onClick={() => screenSharing ? void stopScreenShare() : void startScreenShare()} disabled={!meCanShare} className={`h-11 rounded border border-border px-3 text-xs disabled:opacity-40 ${screenSharing ? 'border-primary text-primary' : ''}`}>{screenSharing ? 'Stop share' : '▱ Share screen'}</button>
          <button onClick={raiseHand} className={`h-11 rounded border border-border px-3 text-xs ${myParticipant?.handRaised ? 'border-primary text-primary' : ''}`}>{myParticipant?.handRaised ? '✋ Lower hand' : '✋ Raise hand'}</button>
          <button onClick={() => setTab('people')} className="h-11 rounded border border-border px-3 text-xs">People ({participantCount})</button>
        </div>
        <p className="mt-2 text-[10px] leading-5 text-text-dim">Audio uses browser echo cancellation/noise suppression where supported. This is a peer-to-peer mesh demo; call quality and participant capacity depend on device and network.</p>
      </div>

      <aside className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-elevated">
        <div className="flex border-b border-border"><button onClick={() => setTab('chat')} className={`flex-1 px-4 py-3 text-xs font-medium ${tab === 'chat' ? 'border-b-2 border-primary text-primary' : 'text-text-dim'}`}>Chat</button><button onClick={() => setTab('people')} className={`flex-1 px-4 py-3 text-xs font-medium ${tab === 'people' ? 'border-b-2 border-primary text-primary' : 'text-text-dim'}`}>People ({participantCount})</button></div>
        {tab === 'chat' ? <>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {chat.map((message) => <div key={message.id} className="break-words text-xs"><p className="mb-0.5 text-[10px] text-text-dim">{participants[message.fromUserId]?.name || (message.fromUserId === myId ? 'You' : shortName(message.fromUserId))} · {message.sentAt ? new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</p><p className="whitespace-pre-wrap leading-5">{message.content}</p></div>)}
            {files.map((file) => <div key={file.id} className="rounded border border-border bg-surface p-3 text-xs"><div className="flex items-start gap-2"><span className="text-lg text-primary">↳</span><div className="min-w-0 flex-1"><p className="break-words font-medium">{file.name}</p><p className="mt-1 text-[10px] text-text-dim">{formatBytes(file.size)} · {file.fromUserId === myId ? 'You' : participants[file.fromUserId]?.name || shortName(file.fromUserId)}</p><a href={file.url} download={file.name} className="mt-2 inline-block text-primary hover:underline">Download shared file</a></div></div></div>)}
            {chat.length === 0 && files.length === 0 && <p className="pt-10 text-center text-xs text-text-dim">No messages yet. Say hello 👋</p>}
          </div>
          <div className="border-t border-border p-3">
            <div className="mb-2 flex gap-1"><button type="button" onClick={() => setChatInput((v) => `${v} 👋`)} className="rounded border border-border px-2 py-1 text-xs">👋</button><button type="button" onClick={() => setChatInput((v) => `${v} ✅`)} className="rounded border border-border px-2 py-1 text-xs">✅</button><button type="button" onClick={() => setChatInput((v) => `${v} 😂`)} className="rounded border border-border px-2 py-1 text-xs">😂</button><button type="button" onClick={() => setChatInput((v) => `${v} 🔥`)} className="rounded border border-border px-2 py-1 text-xs">🔥</button><button type="button" disabled={!dataChannelsRef.current || !participantCount || participantCount < 2} onClick={() => fileInputRef.current?.click()} title="Share a file peer-to-peer (5 MB max)" className="ml-auto rounded border border-border px-2 py-1 text-xs disabled:opacity-40">Attach file</button><input ref={fileInputRef} type="file" className="hidden" onChange={(e) => void shareSelectedFile(e)} /></div>
            <form onSubmit={sendChat} className="flex gap-2"><input value={chatInput} onChange={(e) => setChatInput(e.target.value)} disabled={!meCanChat} placeholder={meCanChat ? 'Message everyone…' : 'Chat disabled by host'} maxLength={2000} className="min-w-0 flex-1 rounded border border-border bg-surface px-3 py-2 text-xs disabled:opacity-50" /><button disabled={!chatInput.trim() || !meCanChat} className="rounded bg-primary px-3 py-2 text-xs font-semibold text-bg disabled:opacity-40">Send</button></form>
            <p className="mt-2 text-[10px] text-text-dim">File sharing is peer-to-peer and temporary; files are not stored server-side.</p>
          </div>
        </> : <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {Object.values(participants).map((p) => <div key={p.userId} className="rounded border border-border bg-surface p-3">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-xs font-medium">{p.name}{p.userId === myId ? ' (You)' : ''}</p><p className="mt-1 text-[10px] capitalize text-text-dim">{p.role.replace('_', ' ')} · {p.micState === 'off' ? 'Mic off' : 'Mic on'} · {p.cameraState === 'off' ? 'Camera off' : 'Camera on'}</p>{p.handRaised && <p className="mt-1 text-[10px] text-primary">✋ Hand raised</p>}</div><span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${p.speaking ? 'animate-pulse bg-primary' : 'bg-border'}`} title={p.speaking ? 'Speaking' : 'Not speaking'} /> </div>
            {canModerate && p.userId !== myId && <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => hostMute(p.userId)} className="rounded border border-border px-2 py-1.5 text-[10px] hover:border-primary">{p.isMutedByHost ? 'Allow unmute' : 'Mute'}</button><button onClick={() => hostRemove(p.userId)} className="rounded border border-error/40 px-2 py-1.5 text-[10px] text-error">Remove</button>{isHost && <button onClick={() => hostCoHost(p.userId, p.role !== 'co_host')} className="rounded border border-border px-2 py-1.5 text-[10px]">{p.role === 'co_host' ? 'Remove co-host' : 'Make co-host'}</button>}{isHost && <><button onClick={() => hostPermission(p.userId, 'canShareScreen', !p.canShareScreen)} className="rounded border border-border px-2 py-1.5 text-[10px]">Screen {p.canShareScreen ? 'allowed' : 'blocked'}</button><button onClick={() => hostPermission(p.userId, 'canChat', !p.canChat)} className="rounded border border-border px-2 py-1.5 text-[10px]">Chat {p.canChat ? 'allowed' : 'blocked'}</button></>}</div>}
          </div>)}
          <p className="pt-2 text-[10px] leading-5 text-text-dim">Host controls apply to active room participants. Recording capture and server-side storage are not connected.</p>
        </div>}
      </aside>
    </div>
  </div>;
}
