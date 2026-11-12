'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { use, useEffect, useRef, useState } from 'react';
import { Countdown, cx, fireConfetti, GameBadge, Podium, RankChange, RankRow, SecondsLeft, TimerBar } from '@/components/ui';
import { emitAck } from '@/lib/socket';
import { isSoundOn, setSound, sfx, unlockAudio } from '@/lib/sound';
import { useJoinUrl } from '@/lib/useJoinUrl';
import { useOnConnect, useRoomStreams } from '@/lib/useRoom';
import { useServerNow } from '@/lib/useNow';
import { CupsBoard, cupsCaption, RhythmLane, type CupsPayload, type RhythmPayload } from '@/components/games/visuals';
import { GAME_META, TIE_RULE } from '@/shared/gameMeta';
import type { PublicState } from '@/shared/types';

const W = 1920;
const H = 1080;

/** 1920x1080 고정 무대를 화면 크기에 맞춰 확대/축소 (16:9 유지) */
function Stage({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-ink-950">
      <div
        style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'center' }}
        className="relative shrink-0 overflow-hidden bg-[radial-gradient(1200px_700px_at_15%_0%,rgba(168,85,247,.28),transparent_60%),radial-gradient(1000px_600px_at_100%_20%,rgba(56,189,248,.22),transparent_60%),radial-gradient(900px_500px_at_50%_120%,rgba(251,191,36,.14),transparent_60%)]"
      >
        {children}
      </div>
    </div>
  );
}

export default function ScreenPage({ params }: { params: Promise<{ code: string }> }) {
  const code = use(params).code.toUpperCase();
  const { state } = useRoomStreams();
  const [err, setErr] = useState<string | null>(null);
  const [soundReady, setSoundReady] = useState(false);
  const join = useJoinUrl(code);

  useOnConnect(() => {
    emitAck('screen:watch', { code }).then((r) => setErr(r.ok ? null : r.error ?? '오류'));
  }, [code]);

  // 단계 전환 효과음/연출
  const prev = useRef<string>('');
  useEffect(() => {
    if (!state) return;
    const key = state.phase;
    if (prev.current === key) return;
    prev.current = key;
    if (key === 'GAME_INTRO') sfx.fanfare();
    if (key === 'PLAYING') sfx.go();
    if (key === 'CALCULATING') sfx.end();
    if (key === 'FINISHED') {
      sfx.drum();
      setTimeout(() => {
        sfx.fanfare();
        fireConfetti(true);
      }, 2600);
    }
  }, [state]);

  if (err) return <div className="flex min-h-dvh items-center justify-center text-3xl text-white/70">{err}</div>;
  if (!state) return <div className="flex min-h-dvh items-center justify-center text-3xl text-white/50">연결 중...</div>;

  return (
    <Stage>
      {/* 상단 타이틀 바 */}
      <header className="absolute left-0 right-0 top-0 flex items-center gap-6 px-14 py-8">
        <div className="text-5xl">🎉</div>
        <h1 className="font-display text-5xl neon-text">{state.settings.title}</h1>
        <div className="ml-auto flex items-center gap-4">
          {state.phase !== 'LOBBY' && state.phase !== 'FINISHED' && (
            <div className="rounded-full border border-white/15 bg-white/5 px-6 py-2 font-display text-4xl">
              ROUND <span className="gold-text">{state.roundNo}</span>
              <span className="text-white/40"> / {state.settings.totalRounds}</span>
            </div>
          )}
          <div className="rounded-full border border-white/15 bg-white/5 px-6 py-2 text-3xl">👥 {state.playerCount}명</div>
          <button
            className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-3xl"
            title="효과음"
            onClick={() => {
              unlockAudio();
              const on = soundReady ? !isSoundOn() : true;
              setSound(on);
              setSoundReady(on);
              if (on) sfx.click();
            }}
          >
            {soundReady && isSoundOn() ? '🔊' : '🔇'}
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.section
          key={state.phase + state.roundNo}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.03 }}
          transition={{ duration: 0.4 }}
          className="absolute inset-0 px-14 pb-12 pt-36"
        >
          {state.phase === 'LOBBY' && <Lobby state={state} qr={join.qr} url={join.url} />}
          {state.phase === 'GAME_INTRO' && <Intro state={state} />}
          {state.phase === 'COUNTDOWN' && (
            <div className="flex h-full flex-col items-center justify-center gap-6">
              {state.gameId && <GameBadge gameId={state.gameId} size="xl" />}
              <Countdown endsAt={state.phaseEndsAt} paused={state.paused} pausedRemain={state.pausedRemainMs} big />
            </div>
          )}
          {state.phase === 'PLAYING' && <Playing state={state} />}
          {state.phase === 'CALCULATING' && <Calculating />}
          {state.phase === 'ROUND_RESULT' && <RoundResult state={state} />}
          {state.phase === 'TOTAL_RANKING' && <TotalRanking state={state} />}
          {state.phase === 'FINISHED' && <Final state={state} />}
        </motion.section>
      </AnimatePresence>

      {/* 진행 중 입장용 작은 QR */}
      {['GAME_INTRO', 'CALCULATING', 'ROUND_RESULT', 'TOTAL_RANKING'].includes(state.phase) && state.settings.allowLateJoin && join.qr && (
        <div className="absolute bottom-6 right-6 flex items-center gap-3 rounded-2xl bg-black/40 p-3">
          <img src={join.qr} alt="" className="h-28 w-28 rounded-lg bg-white p-1" />
          <div className="text-xl text-white/70">
            입장 코드
            <div className="font-display text-4xl tracking-widest text-neon-cyan">{state.code}</div>
          </div>
        </div>
      )}

    </Stage>
  );
}

function Lobby({ state, qr, url }: { state: PublicState; qr: string; url: string }) {
  return (
    <div className="grid h-full grid-cols-[640px_1fr] gap-14">
      <div className="flex flex-col items-center justify-center gap-6">
        {qr && <img src={qr} alt="QR" className="w-[560px] rounded-[2rem] bg-white p-5 shadow-[0_0_80px_rgba(56,189,248,.45)]" />}
        <div className="text-center">
          <div className="text-3xl text-white/60">QR코드를 스캔하거나 접속하세요</div>
          <div className="mt-2 break-all font-display text-4xl text-neon-cyan">{url.replace(/^https?:\/\//, '')}</div>
        </div>
      </div>
      <div className="flex flex-col">
        <div className="flex items-end gap-6">
          <div className="font-display text-[10rem] leading-none gold-text">{state.playerCount}</div>
          <div className="pb-6 text-5xl text-white/80">명 입장 완료!</div>
        </div>
        <div className="mt-2 text-3xl text-white/50">게임이 곧 시작됩니다 · 휴대폰 화면을 켜 두세요 📱</div>
        <div className="mt-8 flex flex-1 flex-wrap content-start gap-3 overflow-hidden">
          <AnimatePresence>
            {state.players.slice(-80).map((p) => (
              <motion.span
                key={p.id}
                initial={{ opacity: 0, scale: 0.3, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cx('rounded-full border px-5 py-2 text-3xl', p.connected ? 'border-neon-blue/40 bg-neon-blue/10' : 'border-white/10 text-white/40')}
              >
                {p.nickname}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Intro({ state }: { state: PublicState }) {
  const m = GAME_META[state.gameId!];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 text-center">
      <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 12 }} className="text-[14rem] leading-none">
        {m.emoji}
      </motion.div>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
        <div className="font-display text-[8rem] leading-none" style={{ background: `linear-gradient(135deg, ${m.color[0]}, ${m.color[1]})`, WebkitBackgroundClip: 'text', color: 'transparent' }}>
          {m.name}
        </div>
        <div className="mt-4 text-5xl text-white/90">{m.short}</div>
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="flex gap-6">
        {m.howTo.map((h, i) => (
          <div key={h} className="rounded-3xl border border-white/10 bg-white/5 px-8 py-5 text-3xl">
            <span className="mr-3 font-display text-amber-300">{i + 1}</span>
            {h}
          </div>
        ))}
      </motion.div>
      <div className="text-2xl text-white/40">점수: {m.scoring}</div>
    </div>
  );
}

function Calculating() {
  useEffect(() => {
    sfx.drum();
  }, []);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8">
      <motion.div animate={{ scale: [1, 1.15, 1], rotate: [0, -6, 6, 0] }} transition={{ repeat: Infinity, duration: 0.6 }} className="text-[12rem]">
        🥁
      </motion.div>
      <div className="font-display text-8xl neon-text">결과 집계 완료!</div>
      <div className="text-5xl text-white/60">과연 이번 라운드의 1등은...?</div>
    </div>
  );
}

function Playing({ state }: { state: PublicState }) {
  const g = state.game!;
  const isQuiz = ['nonsense', 'chosung', 'ox'].includes(g.gameId);
  // 10초 게임은 남은 시간이 힌트가 되므로, 컵 게임은 섞는 중에는 타이머 숨김
  const showTimer = g.stepKind !== 'reveal' && g.gameId !== 'stop10' && !(g.gameId === 'cups' && g.stepKind !== 'question');
  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center gap-6">
        <GameBadge gameId={g.gameId} size="lg" />
        {state.paused && <span className="rounded-full bg-amber-400/20 px-6 py-2 text-4xl text-amber-200">⏸ 일시정지</span>}
        {showTimer && (
          <div className="ml-auto font-display text-7xl">
            <SecondsLeft endsAt={g.stepEndsAt} paused={state.paused} pausedRemain={state.pausedRemainMs} />
          </div>
        )}
      </div>
      {showTimer && <TimerBar startedAt={g.stepStartedAt} endsAt={g.stepEndsAt} paused={state.paused} pausedRemain={state.pausedRemainMs} className="h-6" />}
      {isQuiz ? (
        <QuizBoard state={state} />
      ) : g.gameId === 'cups' ? (
        <CupsScreen state={state} />
      ) : g.gameId === 'rhythm' ? (
        <RhythmScreen state={state} />
      ) : g.gameId === 'stop10' ? (
        <Stop10Screen state={state} />
      ) : (
        <LiveBoard state={state} />
      )}
    </div>
  );
}

function QuizBoard({ state }: { state: PublicState }) {
  const g = state.game!;
  const p = g.payload as {
    index: number;
    total: number;
    prompt: string;
    hint?: string;
    big?: string;
    choices: string[] | null;
    reveal?: { correctIndex: number | null; answerText: string; explain: string; dist: number[]; correctCount: number; answered: number };
  };
  const reveal = g.stepKind === 'reveal' ? p.reveal : undefined;
  const isOX = g.gameId === 'ox';
  const maxDist = Math.max(1, ...(reveal?.dist ?? [1]));
  useEffect(() => {
    if (reveal) sfx.correct();
  }, [reveal]);
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center gap-4 text-4xl text-white/70">
        <span className="rounded-full bg-white/10 px-5 py-1">
          Q{p.index + 1} / {p.total}
        </span>
        {p.hint && <span className="rounded-full bg-white/10 px-5 py-1">🏷️ {p.hint}</span>}
        <span className="ml-auto">
          제출 {state.submitted} / {state.participantCount}명
        </span>
      </div>
      <motion.div key={p.index} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="rounded-[2rem] border border-white/10 bg-white/5 px-12 py-10 text-center">
        {p.big ? (
          <>
            {p.hint && (
              <div className="mb-4 inline-flex items-center rounded-full border-2 border-amber-300/60 bg-amber-300/15 px-10 py-3 font-display text-6xl text-amber-200">
                분야: {p.hint}
              </div>
            )}
            <div className="text-4xl text-white/60">
              {p.prompt} · {p.big.length}글자
            </div>
            <div className="mt-3 font-display text-[10rem] leading-none tracking-[0.3em] text-emerald-300 drop-shadow-[0_0_30px_rgba(52,211,153,.5)]">{p.big}</div>
          </>
        ) : (
          <div className="text-7xl font-bold leading-tight">{p.prompt}</div>
        )}
      </motion.div>
      {p.choices ? (
        <div className={cx('grid flex-1 gap-5', isOX ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2')}>
          {p.choices.map((c, i) => {
            const correct = reveal && reveal.correctIndex === i;
            return (
              <div
                key={i}
                className={cx(
                  'relative flex items-center overflow-hidden rounded-[2rem] border-4 px-10',
                  isOX ? 'justify-center font-display text-[11rem]' : 'text-6xl font-bold',
                  correct ? 'border-emerald-400 bg-emerald-500/25 shadow-[0_0_60px_rgba(52,211,153,.5)]' : reveal ? 'border-white/5 bg-white/[0.02] opacity-50' : 'border-white/10 bg-white/5',
                  isOX && i === 0 && !reveal && 'text-sky-300',
                  isOX && i === 1 && !reveal && 'text-rose-300',
                )}
              >
                {reveal && (
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${((reveal.dist[i] ?? 0) / maxDist) * 100}%` }}
                    transition={{ duration: 0.8 }}
                    className={cx('absolute inset-y-0 left-0', correct ? 'bg-emerald-400/20' : 'bg-white/5')}
                  />
                )}
                {!isOX && <span className="relative mr-6 font-display text-white/40">{i + 1}</span>}
                <span className="relative">{c}</span>
                {reveal && <span className="absolute bottom-4 right-8 text-4xl text-white/70">{reveal.dist[i] ?? 0}명</span>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-5xl text-white/60">{reveal ? '' : '📱 휴대폰에 정답을 입력하세요!'}</div>
      )}
      {reveal && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-8 rounded-[2rem] border border-emerald-400/40 bg-emerald-500/10 px-10 py-6">
          <span className="font-display text-6xl text-emerald-300">정답: {reveal.answerText}</span>
          <span className="flex-1 text-4xl text-white/80">{reveal.explain}</span>
          <span className="text-4xl text-white/60">
            정답자 {reveal.correctCount}명
          </span>
        </motion.div>
      )}
    </div>
  );
}

function CupsScreen({ state }: { state: PublicState }) {
  const g = state.game!;
  const p = g.payload as CupsPayload;
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center gap-6 text-4xl">
        <span className="rounded-full bg-white/10 px-5 py-1">
          문제 {p.index + 1} / {p.total} · 컵 {p.n}개
        </span>
        <span className="font-display text-5xl">{cupsCaption(g.stepKind)}</span>
        <span className="ml-auto text-white/70">
          선택 {state.submitted} / {state.participantCount}명
        </span>
      </div>
      <div className="flex flex-1 items-center px-24">
        <CupsBoard p={p} stepKind={g.stepKind} stepStartedAt={g.stepStartedAt} big />
      </div>
      {g.stepKind === 'reveal' && p.reveal && (
        <div className="rounded-[2rem] border border-emerald-400/40 bg-emerald-500/10 px-10 py-5 text-center font-display text-6xl text-emerald-300">
          정답: {p.reveal.answer + 1}번 컵 · 정답자 {p.reveal.correctCount}명
        </div>
      )}
    </div>
  );
}

function RhythmScreen({ state }: { state: PublicState }) {
  const g = state.game!;
  return (
    <div className="grid flex-1 grid-cols-[1fr_760px] gap-10">
      <RhythmLane p={g.payload as RhythmPayload} stepStartedAt={g.stepStartedAt} big metronome />
      <LiveTop5 state={state} />
    </div>
  );
}

function Stop10Screen({ state }: { state: PublicState }) {
  const g = state.game!;
  const pl = g.payload as { visibleMs: number };
  const now = useServerNow(30);
  const elapsed = Math.max(0, now - g.stepStartedAt);
  const visible = elapsed < pl.visibleMs;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10">
      <div className="text-5xl text-white/80">
        정확히 <b className="text-amber-200">10.00초</b>에 STOP!
      </div>
      <div className={cx('font-display tabular-nums leading-none', visible ? 'text-[16rem] text-white' : 'text-[16rem] text-white/30')}>
        {visible ? (elapsed / 1000).toFixed(2) : '??.??'}
      </div>
      <div className="text-5xl">
        STOP 누른 사람 <span className="font-display text-7xl gold-text">{state.submitted}</span> / {state.participantCount}명
      </div>
    </div>
  );
}

function LiveTop5({ state }: { state: PublicState }) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8">
      <div className="mb-6 font-display text-5xl">🔥 실시간 TOP 5</div>
      <div className="space-y-4">
        {state.liveBoard.map((r, i) => (
          <div key={r.nickname + i} className="flex items-center gap-6 rounded-2xl bg-white/5 px-6 py-4 text-5xl">
            <span className="w-16 font-display text-amber-300">{i + 1}</span>
            <span className="flex-1 truncate font-bold">{r.nickname}</span>
            <span className="font-display tabular-nums text-neon-cyan">{r.value}</span>
          </div>
        ))}
        {!state.liveBoard.length && <div className="text-4xl text-white/40">기록 집계 중...</div>}
      </div>
    </div>
  );
}

function LiveBoard({ state }: { state: PublicState }) {
  const g = state.game!;
  const m = GAME_META[g.gameId];
  return (
    <div className="grid flex-1 grid-cols-[1fr_900px] gap-10">
      <div className="flex flex-col justify-center gap-6">
        <div className="text-[9rem] leading-none">{m.emoji}</div>
        <div className="text-6xl font-bold">{m.short}</div>
        <div className="space-y-3 text-4xl text-white/70">
          {m.howTo.map((h) => (
            <div key={h}>👉 {h}</div>
          ))}
        </div>
        <div className="mt-4 text-4xl">
          진행 완료 <span className="font-display text-6xl gold-text">{state.submitted}</span> / {state.participantCount}명
        </div>
      </div>
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8">
        <div className="mb-6 font-display text-5xl">🔥 실시간 TOP 5</div>
        <div className="space-y-4">
          <AnimatePresence>
            {state.liveBoard.map((r, i) => (
              <motion.div key={r.nickname} layout initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-6 rounded-2xl bg-white/5 px-6 py-4 text-5xl">
                <span className="w-16 font-display text-amber-300">{i + 1}</span>
                <span className="flex-1 truncate font-bold">{r.nickname}</span>
                <span className="font-display tabular-nums text-neon-cyan">{r.value}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          {!state.liveBoard.length && <div className="text-4xl text-white/40">기록 집계 중...</div>}
        </div>
      </div>
    </div>
  );
}

/** 라운드 결과: 10위 → 1위 순서로 긴장감 있게 공개 */
function RoundResult({ state }: { state: PublicState }) {
  const rr = state.roundResult!;
  const top = rr.entries.slice(0, 10);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    let n = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // 아래 순위부터 하나씩, 1위는 더 긴 뜸 들이기
    for (let i = top.length - 1; i >= 0; i--) {
      const delay = (top.length - 1 - i) * 550 + (i === 0 ? 1600 : 0);
      timers.push(
        setTimeout(() => {
          n += 1;
          setShown(n);
          if (i === 0) {
            sfx.fanfare();
            fireConfetti();
          } else if (i === 1) sfx.drum();
          else sfx.tick();
        }, delay + 600),
      );
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rr.roundNo]);
  const visibleFrom = top.length - shown;
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-center gap-6">
        <span className="font-display text-6xl">ROUND {rr.roundNo} 결과</span>
        <GameBadge gameId={rr.gameId} size="lg" />
      </div>
      <div className="grid flex-1 grid-cols-2 grid-rows-5 gap-x-8 gap-y-3" style={{ gridAutoFlow: 'column' }}>
        {top.map((e, i) => (
          <div key={e.playerId} className="min-h-0">
            {i >= visibleFrom ? (
              <motion.div initial={{ opacity: 0, x: -60, scale: i === 0 ? 1.3 : 1 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }}>
                <RankRow rank={e.rank} name={e.nickname} sub={e.metric} right={`+${e.score}`} size="xl" />
              </motion.div>
            ) : (
              <div className="flex h-full items-center rounded-2xl border border-dashed border-white/10 px-6 text-4xl text-white/20">
                {e.rank}위 · ???
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TotalRanking({ state }: { state: PublicState }) {
  const top = state.ranking.slice(0, 10);
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-end gap-6">
        <span className="font-display text-7xl neon-text">누적 종합 순위</span>
        <span className="pb-2 text-3xl text-white/50">
          {state.roundNo} / {state.settings.totalRounds} 라운드 종료
        </span>
      </div>
      <div className="grid flex-1 grid-cols-2 grid-rows-5 gap-x-8 gap-y-3" style={{ gridAutoFlow: 'column' }}>
        {top.map((e, i) => (
          <motion.div key={e.playerId} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }} className="min-h-0">
            <RankRow rank={e.rank} name={e.nickname} right={`${e.total.toLocaleString()}점`} size="xl" change={<RankChange prev={e.prevRank} now={e.rank} />} />
          </motion.div>
        ))}
      </div>
      <div className="text-2xl text-white/40">{TIE_RULE}</div>
    </div>
  );
}

function Final({ state }: { state: PublicState }) {
  const winners = state.ranking.filter((e) => e.rank === 1);
  return (
    <div className="grid h-full grid-cols-[1fr_620px] gap-10">
      <div className="flex flex-col">
        <motion.div initial={{ opacity: 0, y: -40 }} animate={{ opacity: 1, y: 0 }} className="text-center font-display text-8xl gold-text">
          🏆 최종 우승 🏆
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 2.6, type: 'spring' }} className="mt-4 text-center font-display text-9xl text-white drop-shadow-[0_0_40px_rgba(251,191,36,.8)]">
          {winners.map((w) => w.nickname).join(', ') || '-'}
        </motion.div>
        <div className="mt-auto">
          <Podium ranking={state.ranking} big />
        </div>
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3.5 }} className="space-y-2 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6">
        <div className="mb-3 font-display text-4xl">전체 순위</div>
        {state.ranking.slice(0, 14).map((e) => (
          <div key={e.playerId} className="flex items-center gap-4 text-3xl">
            <span className="w-12 text-right font-display text-amber-300">{e.rank}</span>
            <span className="flex-1 truncate">{e.nickname}</span>
            <span className="tabular-nums text-white/80">{e.total.toLocaleString()}</span>
          </div>
        ))}
        {state.ranking.length > 14 && <div className="text-2xl text-white/40">외 {state.ranking.length - 14}명</div>}
      </motion.div>
    </div>
  );
}
