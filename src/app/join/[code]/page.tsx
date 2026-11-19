'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { PLAYER_GAMES } from '@/components/games';
import {
  ConnDot,
  Countdown,
  cx,
  fireConfetti,
  GameBadge,
  Podium,
  RankChange,
  RankRow,
  RoundEntryList,
  SoundToggle,
  TotalRankingList,
} from '@/components/ui';
import { emitAck, getSocket } from '@/lib/socket';
import { sfx, unlockAudio } from '@/lib/sound';
import { useOnConnect, useRoomStreams } from '@/lib/useRoom';
import { GAME_META, TIE_RULE } from '@/shared/gameMeta';
import type { MeState, PublicState } from '@/shared/types';

const keyOf = (code: string) => `party:player:${code}`;

export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const code = use(params).code.toUpperCase();
  const { state, me, setMe, connected } = useRoomStreams();
  const [stage, setStage] = useState<'checking' | 'form' | 'joined' | 'kicked' | 'missing'>('checking');
  const [roomInfo, setRoomInfo] = useState<{ title: string; playerCount: number; canJoin: boolean } | null>(null);
  const [nick, setNick] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [kickReason, setKickReason] = useState('');
  const [busy, setBusy] = useState(false);

  // 접속(재접속) 시: 저장된 참가 정보가 있으면 자동 복귀
  useOnConnect(() => {
    (async () => {
      let saved: { playerId: string; token: string } | null = null;
      try {
        saved = JSON.parse(localStorage.getItem(keyOf(code)) || 'null');
      } catch {}
      if (saved) {
        const r = await emitAck('player:resume', { code, ...saved });
        if (r.ok) {
          setStage('joined');
          return;
        }
        localStorage.removeItem(keyOf(code));
        if (r.error) setError(r.error);
      }
      const info = await emitAck<{ title: string; playerCount: number; canJoin: boolean }>('room:check', { code });
      if (!info.ok) {
        setStage('missing');
        setError(info.error ?? null);
        return;
      }
      setRoomInfo(info.data!);
      setStage((s) => (s === 'joined' ? s : 'form'));
    })();
  }, [code]);

  useEffect(() => {
    const s = getSocket();
    const onKick = (p: { reason: string }) => {
      localStorage.removeItem(keyOf(code));
      setKickReason(p.reason);
      setStage('kicked');
    };
    s.on('kicked', onKick);
    return () => {
      s.off('kicked', onKick);
    };
  }, [code]);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    unlockAudio();
    setBusy(true);
    setError(null);
    const r = await emitAck<{ playerId: string; token: string }>('player:join', { code, nickname: nick });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? '입장 실패');
      return;
    }
    localStorage.setItem(keyOf(code), JSON.stringify(r.data));
    sfx.join();
    setStage('joined');
  };

  if (stage === 'checking') return <Center>연결 중...</Center>;
  if (stage === 'missing')
    return (
      <Center>
        <div className="text-5xl">😵</div>
        <div className="mt-3 text-lg">{error ?? '게임방을 찾을 수 없습니다'}</div>
      </Center>
    );
  if (stage === 'kicked')
    return (
      <Center>
        <div className="text-5xl">👋</div>
        <div className="mt-3 text-lg">{kickReason}</div>
        <button className="btn-ghost mt-6" onClick={() => location.reload()}>
          다시 입장하기
        </button>
      </Center>
    );

  if (stage === 'form')
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-8">
        <div className="text-center">
          <div className="text-5xl floaty">🎉</div>
          <h1 className="mt-3 font-display text-3xl neon-text">{roomInfo?.title}</h1>
          <p className="mt-2 text-white/60">현재 {roomInfo?.playerCount ?? 0}명 입장</p>
        </div>
        {roomInfo && !roomInfo.canJoin ? (
          <div className="card p-5 text-center text-white/80">지금은 입장할 수 없어요 (게임 진행 중 / 종료)</div>
        ) : (
          <form onSubmit={join} className="card space-y-4 p-5">
            <label className="block text-sm text-white/60">닉네임 (1~12자)</label>
            <input
              className="input text-center text-2xl"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              maxLength={12}
              placeholder="예: 김대리"
              autoFocus
              enterKeyHint="go"
            />
            {error && <div className="text-center text-sm text-rose-300">{error}</div>}
            <button className="btn-primary w-full py-4 text-xl" disabled={busy || !nick.trim()}>
              {busy ? '입장 중...' : '입장하기 🚀'}
            </button>
          </form>
        )}
      </main>
    );

  if (!state || !me) return <Center>게임 정보를 불러오는 중...</Center>;
  return <PlayerApp state={state} me={me} setMe={setMe} connected={connected} />;
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center text-white/80">{children}</main>;
}

function PlayerApp({ state, me, setMe, connected }: { state: PublicState; me: MeState; setMe: (m: MeState) => void; connected: boolean }) {
  const act = useCallback((a: Record<string, unknown>) => emitAck('game:action', a, 5000), []);
  const setView = useCallback((view: unknown) => setMe({ ...me, view }), [me, setMe]);
  const phase = state.phase;

  // 단계 전환 효과음
  const prevPhase = useRef(phase);
  useEffect(() => {
    if (prevPhase.current === phase) return;
    prevPhase.current = phase;
    if (phase === 'PLAYING') sfx.go();
    if (phase === 'CALCULATING') sfx.end();
    if (phase === 'ROUND_RESULT' && me.lastRound?.rank === 1) fireConfetti();
    if (phase === 'FINISHED') {
      sfx.fanfare();
      fireConfetti(true);
    }
  }, [phase, me.lastRound?.rank]);

  const Game = state.gameId ? PLAYER_GAMES[state.gameId] : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-4 pt-[max(env(safe-area-inset-top),12px)]" onPointerDown={unlockAudio}>
      {/* 상단 바: 내 정보는 항상 스크롤 없이 확인 */}
      <header className="mb-3 flex items-center gap-2">
        <ConnDot connected={connected} />
        <span className="truncate font-bold">{me.nickname}</span>
        <span className="chip ml-auto tabular-nums">
          {me.rank ? `${me.rank}위` : '-'} · {me.total.toLocaleString()}점
        </span>
        <SoundToggle />
      </header>
      {!connected && <div className="mb-2 rounded-xl bg-red-500/20 p-2 text-center text-xs text-red-200">연결이 끊겼어요. 자동으로 다시 연결 중... (점수는 안전하게 저장됩니다)</div>}

      <AnimatePresence mode="wait">
        <motion.main
          key={phase + (phase === 'PLAYING' ? '' : state.roundNo)}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.25 }}
          className="flex flex-1 flex-col"
        >
          {phase === 'LOBBY' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
              <div className="text-6xl floaty">🎟️</div>
              <h2 className="font-display text-3xl neon-text">입장 완료!</h2>
              <p className="text-lg text-white/80">게임 시작을 기다려 주세요</p>
              <div className="card px-8 py-5">
                <div className="text-sm text-white/50">현재 참가자</div>
                <motion.div key={state.playerCount} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="font-display text-6xl gold-text">
                  {state.playerCount}명
                </motion.div>
              </div>
              <p className="text-sm text-white/40">화면을 켜 둔 채로 기다리면 자동으로 게임이 시작돼요</p>
            </div>
          )}

          {phase === 'GAME_INTRO' && state.gameId && (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
              <div className="chip">ROUND {state.roundNo} / {state.settings.totalRounds}</div>
              <motion.div initial={{ scale: 0.3, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring' }} className="text-8xl">
                {GAME_META[state.gameId].emoji}
              </motion.div>
              <GameBadge gameId={state.gameId} size="lg" />
              <p className="text-lg">{GAME_META[state.gameId].short}</p>
              <ul className="card w-full space-y-2 p-4 text-left">
                {GAME_META[state.gameId].howTo.map((h) => (
                  <li key={h}>👉 {h}</li>
                ))}
              </ul>
              <p className="text-sm text-white/40">곧 시작합니다! 준비하세요</p>
            </div>
          )}

          {phase === 'COUNTDOWN' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-6">
              {state.gameId && <GameBadge gameId={state.gameId} />}
              <Countdown endsAt={state.phaseEndsAt} paused={state.paused} pausedRemain={state.pausedRemainMs} />
            </div>
          )}

          {phase === 'PLAYING' && Game && state.game && (
            me.participating ? (
              <Game key={state.gameId} state={state} me={me} act={act} setView={setView} />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <div className="text-5xl">⏳</div>
                <div className="text-lg">이번 라운드가 진행 중이에요</div>
                <div className="text-white/60">다음 라운드부터 참여할 수 있어요!</div>
              </div>
            )
          )}

          {phase === 'CALCULATING' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }} className="text-6xl">
                🎲
              </motion.div>
              <div className="font-display text-3xl">결과 집계 완료!</div>
              <div className="text-white/60">두근두근... 사회자가 곧 결과를 발표합니다</div>
            </div>
          )}

          {phase === 'ROUND_RESULT' && state.roundResult && <RoundResultView state={state} me={me} />}
          {phase === 'TOTAL_RANKING' && <TotalView state={state} me={me} />}
          {phase === 'FINISHED' && <FinalView state={state} me={me} />}
        </motion.main>
      </AnimatePresence>
    </div>
  );
}

function RoundResultView({ state, me }: { state: PublicState; me: MeState }) {
  const rr = state.roundResult!;
  const mine = me.lastRound;
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="text-center">
        <div className="chip">ROUND {rr.roundNo} 결과</div>
        <div className="mt-2">
          <GameBadge gameId={rr.gameId} />
        </div>
      </div>
      {mine ? (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card grid grid-cols-3 gap-2 p-4 text-center">
          <div>
            <div className="text-xs text-white/50">이번 순위</div>
            <div className="font-display text-4xl gold-text">{mine.rank}위</div>
          </div>
          <div>
            <div className="text-xs text-white/50">획득 점수</div>
            <div className="font-display text-4xl text-neon-cyan">+{mine.score}</div>
          </div>
          <div>
            <div className="text-xs text-white/50">누적 순위</div>
            <div className="font-display text-4xl">{mine.totalRank}위</div>
            <RankChange prev={mine.prevTotalRank} now={mine.totalRank} className="text-sm" />
          </div>
          <div className="col-span-3 text-sm text-white/60">
            내 기록: {mine.metric} · 누적 {mine.total.toLocaleString()}점
          </div>
        </motion.div>
      ) : (
        <div className="card p-4 text-center text-white/60">이번 라운드에는 참여하지 않았어요</div>
      )}
      <div>
        <h3 className="mb-2 font-display text-xl">🏆 TOP 3</h3>
        <div className="space-y-2">
          {rr.entries.slice(0, 3).map((e) => (
            <RankRow key={e.playerId} rank={e.rank} name={e.nickname} sub={e.metric} right={`+${e.score}`} highlight={e.playerId === me.playerId} />
          ))}
        </div>
      </div>
      <details className="card p-3">
        <summary className="cursor-pointer text-white/70">전체 순위 보기 ({rr.entries.length}명)</summary>
        <div className="mt-3 max-h-[50vh] overflow-y-auto scrollbar-thin">
          <RoundEntryList entries={rr.entries} meId={me.playerId} />
        </div>
      </details>
    </div>
  );
}

function TotalView({ state, me }: { state: PublicState; me: MeState }) {
  const mine = state.ranking.find((e) => e.playerId === me.playerId);
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="text-center">
        <div className="chip">
          {state.roundNo} / {state.settings.totalRounds} 라운드 종료
        </div>
        <h2 className="mt-2 font-display text-3xl neon-text">누적 종합 순위</h2>
      </div>
      {mine && (
        <div className="sticky top-2 z-10">
          <RankRow rank={mine.rank} name={`${mine.nickname} (나)`} right={`${mine.total.toLocaleString()}점`} highlight change={<RankChange prev={mine.prevRank} now={mine.rank} />} />
        </div>
      )}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <TotalRankingList ranking={state.ranking} meId={me.playerId} />
      </div>
      <p className="text-center text-xs text-white/40">{TIE_RULE}</p>
    </div>
  );
}

function FinalView({ state, me }: { state: PublicState; me: MeState }) {
  const mine = state.ranking.find((e) => e.playerId === me.playerId);
  return (
    <div className="flex flex-1 flex-col gap-4">
      <h2 className="text-center font-display text-4xl gold-text">🏆 최종 결과</h2>
      <Podium ranking={state.ranking} />
      {mine && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3 }} className={cx('card p-4 text-center', mine.rank <= 3 && 'border-amber-300/50 shadow-gold')}>
          <div className="text-sm text-white/60">나의 최종 순위</div>
          <div className="font-display text-5xl gold-text">{mine.rank}위</div>
          <div className="text-white/70">
            {mine.total.toLocaleString()}점 · 라운드 1위 {mine.wins}회
          </div>
          {mine.rank === 1 && <div className="mt-2 text-xl">🎉 축하합니다! 오늘의 우승자! 🎉</div>}
        </motion.div>
      )}
      <div className="max-h-[40vh] overflow-y-auto scrollbar-thin">
        <TotalRankingList ranking={state.ranking} meId={me.playerId} />
      </div>
    </div>
  );
}
