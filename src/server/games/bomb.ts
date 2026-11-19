// 폭탄 피하기: 선물/폭탄이 하나씩 나타남. 선물은 터치, 폭탄은 피하기. 시간이 갈수록 빨라짐.
import { clamp, rand } from '../util';
import type { GameModule } from './types';

const DURATION = 15_000;
const MIN_TAP_MS = 150;
const BOMB_RATE = 0.35;

interface Item {
  id: number;
  kind: 'gift' | 'bomb';
  x: number;
  y: number;
  lifeMs: number;
  issuedAt: number;
}
interface PState {
  seq: number;
  cur: Item | null;
  gifts: number;
  bombs: number;
  points: number;
  startedAt: number;
}

function issue(p: PState, now: number) {
  const progress = clamp((now - p.startedAt) / DURATION, 0, 1);
  const base = Math.round(1500 - progress * 900); // 1.5초 → 0.6초
  const kind = Math.random() < BOMB_RATE ? 'bomb' : 'gift';
  p.seq += 1;
  p.cur = { id: p.seq, kind, x: rand(12, 88), y: rand(12, 88), lifeMs: kind === 'bomb' ? Math.round(base * 0.75) : base, issuedAt: now };
}

const view = (p: PState) => ({
  item: p.cur ? { id: p.cur.id, kind: p.cur.kind, x: p.cur.x, y: p.cur.y, lifeMs: p.cur.lifeMs } : null,
  gifts: p.gifts,
  bombs: p.bombs,
  points: Math.max(0, p.points),
});

export const bombGame: GameModule<{}, PState> = {
  id: 'bomb',
  pausable: false,
  scoring: 'relative',
  create() {
    return { data: {}, steps: [{ kind: 'play', durationMs: DURATION }] };
  },
  initPlayer() {
    return { seq: 0, cur: null, gifts: 0, bombs: 0, points: 0, startedAt: 0 };
  },
  onStepStart(round, env) {
    for (const pid of round.participants) {
      const p = round.players[pid];
      if (p && !p.cur) {
        p.startedAt = env.now;
        issue(p, env.now);
      }
    }
  },
  publicPayload() {
    return {};
  },
  playerView(round, pid) {
    const p = round.players[pid];
    return p ? view(p) : null;
  },
  onAction(round, pid, action, env) {
    const p = round.players[pid];
    if (!p) return { ok: false, error: '이번 라운드 참가자가 아닙니다' };
    if (!env.active) return { ok: false, error: '시간 종료' };
    const cur = p.cur;
    if (!cur || action?.id !== cur.id) return { ok: true, data: view(p) };
    const elapsed = env.now - cur.issuedAt;
    if (action.type === 'tap') {
      if (elapsed < MIN_TAP_MS) return { ok: false, error: '너무 빨라요' };
      let kind: 'gift' | 'bomb' | 'late' = 'late';
      if (elapsed <= cur.lifeMs + 300) {
        kind = cur.kind;
        if (cur.kind === 'gift') {
          p.gifts += 1;
          p.points += 100 + Math.round(50 * clamp(1 - elapsed / cur.lifeMs, 0, 1));
        } else {
          p.bombs += 1;
          p.points -= 150;
        }
      }
      issue(p, env.now);
      return { ok: true, data: { ...view(p), tapped: kind } };
    }
    if (action.type === 'expire') {
      if (elapsed >= cur.lifeMs - 200) issue(p, env.now);
      return { ok: true, data: view(p) };
    }
    return { ok: false, error: 'bad action' };
  },
  submittedCount(round) {
    return Object.values(round.players).filter((p) => p.gifts + p.bombs > 0).length;
  },
  liveBoard(round, nick) {
    return Object.entries(round.players)
      .filter(([, p]) => p.gifts + p.bombs > 0)
      .sort((a, b) => b[1].points - a[1].points)
      .slice(0, 5)
      .map(([id, p]) => ({ nickname: nick(id), value: `🎁${p.gifts} 💣${p.bombs}` }));
  },
  finalize(round) {
    const out: Record<string, { perf: number; metric: string }> = {};
    for (const pid of round.participants) {
      const p = round.players[pid];
      if (p) out[pid] = { perf: Math.max(0, p.points), metric: p.gifts + p.bombs ? `선물 ${p.gifts} · 폭탄 ${p.bombs}` : '미참여' };
    }
    return out;
  },
};
