'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { GAME_META } from '@/shared/gameMeta';
import type { GameId, RankingEntry, RoundEntry } from '@/shared/types';
import { isSoundOn, setSound, sfx, unlockAudio } from '@/lib/sound';
import { useRemaining } from '@/lib/useNow';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function GameBadge({ gameId, size = 'md' }: { gameId: GameId; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const m = GAME_META[gameId];
  const s = {
    sm: 'text-sm px-3 py-1 gap-1',
    md: 'text-lg px-4 py-2 gap-2',
    lg: 'text-3xl px-6 py-3 gap-3',
    xl: 'text-6xl px-10 py-5 gap-5',
  }[size];
  return (
    <span
      className={cx('inline-flex items-center rounded-full font-display text-white shadow-lg', s)}
      style={{ background: `linear-gradient(135deg, ${m.color[0]}, ${m.color[1]})` }}
    >
      <span>{m.emoji}</span>
      <span>{m.name}</span>
    </span>
  );
}

/** 전원 동시 표시되는 3-2-1 카운트다운 (서버 시각 기준) */
export function Countdown({ endsAt, paused, pausedRemain, big = false }: { endsAt: number | null; paused?: boolean; pausedRemain?: number | null; big?: boolean }) {
  const remain = useRemaining(endsAt, paused ? pausedRemain : null, 50);
  const n = Math.ceil(remain / 1000);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (n !== last.current) {
      last.current = n;
      if (n > 0 && n <= 3) sfx.tick();
    }
  }, [n]);
  const label = n > 3 ? '준비' : n > 0 ? String(n) : 'GO!';
  return (
    <div className="flex flex-col items-center justify-center">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={label}
          initial={{ scale: 2.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.3, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          className={cx('font-display gold-text drop-shadow-[0_0_40px_rgba(251,191,36,.6)]', big ? 'text-[22rem] leading-none' : 'text-[9rem] leading-none')}
        >
          {label}
        </motion.div>
      </AnimatePresence>
      {paused && <div className="mt-4 chip text-amber-200">⏸ 일시정지</div>}
    </div>
  );
}

export function TimerBar({ startedAt, endsAt, paused, pausedRemain, className }: { startedAt: number; endsAt: number; paused?: boolean; pausedRemain?: number | null; className?: string }) {
  const remain = useRemaining(endsAt, paused ? pausedRemain : null, 100);
  const total = Math.max(1, endsAt - startedAt);
  const ratio = Math.max(0, Math.min(1, remain / total));
  const color = ratio > 0.5 ? 'from-neon-cyan to-neon-blue' : ratio > 0.2 ? 'from-amber-300 to-orange-500' : 'from-red-400 to-pink-600';
  return (
    <div className={cx('h-3 w-full overflow-hidden rounded-full bg-white/10', className)}>
      <div className={cx('h-full rounded-full bg-gradient-to-r transition-[width] duration-100 ease-linear', color)} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

export function SecondsLeft({ endsAt, paused, pausedRemain, className }: { endsAt: number; paused?: boolean; pausedRemain?: number | null; className?: string }) {
  const remain = useRemaining(endsAt, paused ? pausedRemain : null, 100);
  return <span className={cx('tabular-nums', remain < 3000 && 'text-red-400', className)}>{(remain / 1000).toFixed(remain < 10_000 ? 1 : 0)}초</span>;
}

export function RankChange({ prev, now, className }: { prev: number | null | undefined; now: number; className?: string }) {
  if (prev == null) return <span className={cx('text-white/40', className)}>NEW</span>;
  const d = prev - now;
  if (d > 0) return <span className={cx('text-emerald-400', className)}>▲{d}</span>;
  if (d < 0) return <span className={cx('text-rose-400', className)}>▼{-d}</span>;
  return <span className={cx('text-white/40', className)}>–</span>;
}

export const MEDAL = ['🥇', '🥈', '🥉'];
export const rankLabel = (r: number) => (r <= 3 ? MEDAL[r - 1] : `${r}`);

export function SoundToggle({ className }: { className?: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(isSoundOn()), []);
  return (
    <button
      className={cx('chip active:scale-95', className)}
      onClick={() => {
        unlockAudio();
        setSound(!on);
        setOn(!on);
      }}
      aria-label="효과음 켜기/끄기"
    >
      {on ? '🔊' : '🔇'}
    </button>
  );
}

export function ConnDot({ connected }: { connected: boolean }) {
  return (
    <span className={cx('inline-block h-2.5 w-2.5 rounded-full', connected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'animate-pulse bg-red-500')} title={connected ? '연결됨' : '연결 끊김 - 재연결 중'} />
  );
}

export function RankRow({
  rank,
  name,
  right,
  sub,
  highlight,
  change,
  size = 'md',
}: {
  rank: number;
  name: string;
  right: React.ReactNode;
  sub?: React.ReactNode;
  highlight?: boolean;
  change?: React.ReactNode;
  size?: 'md' | 'xl';
}) {
  const top = rank <= 3;
  const big = size === 'xl';
  return (
    <div
      className={cx(
        'flex items-center gap-3 rounded-2xl border px-4',
        big ? 'py-3 text-4xl' : 'py-2.5 text-base',
        highlight ? 'border-neon-blue bg-neon-blue/15 shadow-neon' : top ? 'border-amber-300/40 bg-amber-300/10' : 'border-white/5 bg-white/[0.03]',
      )}
    >
      <span className={cx('shrink-0 text-center font-display', big ? 'w-24 text-5xl' : 'w-9 text-xl', top && 'drop-shadow-[0_0_8px_rgba(251,191,36,.7)]')}>{rankLabel(rank)}</span>
      <div className="min-w-0 flex-1">
        <div className={cx('truncate font-bold', top && 'text-amber-100')}>{name}</div>
        {sub && <div className={cx('truncate text-white/50', big ? 'text-2xl' : 'text-xs')}>{sub}</div>}
      </div>
      {change && <span className={cx('shrink-0 font-bold', big ? 'text-3xl' : 'text-xs')}>{change}</span>}
      <span className="shrink-0 font-display tabular-nums">{right}</span>
    </div>
  );
}

export function TotalRankingList({ ranking, meId, limit }: { ranking: RankingEntry[]; meId?: string; limit?: number }) {
  const list = limit ? ranking.slice(0, limit) : ranking;
  return (
    <div className="space-y-2">
      {list.map((e, i) => (
        <motion.div key={e.playerId} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 20) * 0.03 }}>
          <RankRow rank={e.rank} name={e.nickname} right={`${e.total.toLocaleString()}점`} highlight={e.playerId === meId} change={<RankChange prev={e.prevRank} now={e.rank} />} />
        </motion.div>
      ))}
    </div>
  );
}

export function RoundEntryList({ entries, meId }: { entries: RoundEntry[]; meId?: string }) {
  return (
    <div className="space-y-2">
      {entries.map((e, i) => (
        <motion.div key={e.playerId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.03 }}>
          <RankRow rank={e.rank} name={e.nickname} sub={e.metric} right={`+${e.score}`} highlight={e.playerId === meId} />
        </motion.div>
      ))}
    </div>
  );
}

/** 시상대 (1~3등) */
export function Podium({ ranking, big = false }: { ranking: RankingEntry[]; big?: boolean }) {
  const by = (r: number) => ranking.filter((e) => e.rank === r);
  // 공동 순위 고려: 1등 그룹, 2등 그룹, 3등 그룹
  const first = by(1);
  const second = by(2);
  const third = by(3);
  const cols = [
    { list: second, h: big ? 'h-64' : 'h-28', label: '2', delay: 1.2, color: 'from-slate-300 to-slate-500' },
    { list: first, h: big ? 'h-96' : 'h-40', label: '1', delay: 2.4, color: 'from-yellow-300 to-amber-600' },
    { list: third, h: big ? 'h-44' : 'h-20', label: '3', delay: 0.2, color: 'from-orange-300 to-orange-700' },
  ];
  return (
    <div className="flex items-end justify-center gap-3">
      {cols.map((c) => (
        <motion.div
          key={c.label}
          className="flex flex-1 flex-col items-center"
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: c.delay, type: 'spring', stiffness: 120, damping: 14 }}
        >
          <div className={cx('mb-2 text-center', big ? 'space-y-1' : '')}>
            {c.list.length ? (
              c.list.map((e) => (
                <div key={e.playerId} className={cx('font-bold', big ? 'text-5xl' : 'text-base', c.label === '1' && 'gold-text font-display')}>
                  {e.nickname}
                </div>
              ))
            ) : (
              <div className="text-white/30">-</div>
            )}
            {c.list[0] && <div className={cx('text-white/60 tabular-nums', big ? 'text-3xl' : 'text-xs')}>{c.list[0].total.toLocaleString()}점</div>}
          </div>
          <div className={cx('flex w-full items-start justify-center rounded-t-2xl bg-gradient-to-b pt-2 font-display text-ink-950 shadow-2xl', c.h, c.color, big ? 'text-8xl' : 'text-4xl')}>
            {c.label}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export async function fireConfetti(intense = false) {
  const confetti = (await import('canvas-confetti')).default;
  const colors = ['#38bdf8', '#a855f7', '#fbbf24', '#ec4899', '#ffffff'];
  confetti({ particleCount: intense ? 200 : 120, spread: 100, origin: { y: 0.6 }, colors });
  if (intense) {
    const end = Date.now() + 3500;
    const frame = () => {
      confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0 }, colors });
      confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
    setTimeout(() => confetti({ particleCount: 150, spread: 360, startVelocity: 45, origin: { x: 0.5, y: 0.35 }, colors, shapes: ['star'] }), 1200);
  }
}

export function Toast({ msg }: { msg: string | null }) {
  return (
    <AnimatePresence>
      {msg && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-white/10 bg-ink-800/95 px-5 py-3 text-sm shadow-xl"
        >
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (m: string) => {
    setMsg(m);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 2500);
  };
  return { msg, show };
}
