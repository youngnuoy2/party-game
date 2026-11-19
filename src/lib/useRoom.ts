'use client';
import { useEffect, useState } from 'react';
import type { HostState, LiveBoardRow, MeState, PublicState } from '@/shared/types';
import { getSocket, startClockSync } from './socket';

/** 방 공개 상태 + (참가자) 개인 상태 + (관리자) 관리 상태 구독 */
export function useRoomStreams() {
  const [state, setState] = useState<PublicState | null>(null);
  const [me, setMe] = useState<MeState | null>(null);
  const [host, setHost] = useState<HostState | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = getSocket();
    startClockSync();
    const onState = (st: PublicState) => setState(st);
    const onMe = (m: MeState) => setMe(m);
    const onHost = (h: HostState) => setHost(h);
    const onLive = (l: { liveBoard: LiveBoardRow[]; submitted: number }) =>
      setState((prev) => (prev ? { ...prev, liveBoard: l.liveBoard, submitted: l.submitted } : prev));
    const onConn = () => setConnected(true);
    const onDisc = () => setConnected(false);
    s.on('state', onState);
    s.on('me', onMe);
    s.on('host:state', onHost);
    s.on('live', onLive);
    s.on('connect', onConn);
    s.on('disconnect', onDisc);
    setConnected(s.connected);
    return () => {
      s.off('state', onState);
      s.off('me', onMe);
      s.off('host:state', onHost);
      s.off('live', onLive);
      s.off('connect', onConn);
      s.off('disconnect', onDisc);
    };
  }, []);

  return { state, me, setMe, host, connected };
}

/** 연결될 때마다(최초 + 재연결) 실행: 재접속 시 resume/attach 재전송 */
export function useOnConnect(fn: () => void, deps: unknown[]) {
  useEffect(() => {
    const s = getSocket();
    if (s.connected) fn();
    s.on('connect', fn);
    return () => {
      s.off('connect', fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
