// 움직이는 과녁: 참가자별로 과녁이 순서대로 등장. 맞힐수록 작아지고 빨라짐.
// 과녁 등장 시각은 서버가 기록하므로 "등장 직후 즉시 명중" 같은 조작은 차단.
import { clamp, rand } from '../util';
import type { GameModule } from './types';

const DURATION = 15_000;
const MIN_HIT_MS = 150; // 사람이 반응할 수 없는 시간 내 명중은 무효

interface Target {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  size: number; // 영역 너비 대비 %
  lifeMs: number;
  issuedAt: number;
}

interface PState {
  seq: number;
  level: number;
  cur: Target | null;
  hits: number;
  misses: number;
  points: number;
  lastMissAt: number;
}

function issue(p: PState, now: number) {
  const L = p.level;
  const size = Math.max(9, 24 - L * 1.5);
  const lifeMs = Math.max(900, 2600 - L * 140);
  const m = size / 2 + 2;
  p.seq += 1;
  p.cur = {
    id: p.seq,
    x1: rand(Math.ceil(m), Math.floor(100 - m)),
    y1: rand(Math.ceil(m), Math.floor(100 - m)),
    x2: rand(Math.ceil(m), Math.floor(100 - m)),
    y2: rand(Math.ceil(m), Math.floor(100 - m)),
    size,
    lifeMs,
    issuedAt: now,
  };
}

const view = (p: PState) => ({
  t: p.cur ? { id: p.cur.id, x1: p.cur.x1, y1: p.cur.y1, x2: p.cur.x2, y2: p.cur.y2, size: p.cur.size, lifeMs: p.cur.lifeMs } : null,
  hits: p.hits,
  misses: p.misses,
  points: Math.max(0, p.points),
  level: p.level,
});

export const targetGame: GameModule<{}, PState> = {
  id: 'target',
  pausable: false,
  scoring: 'relative',
  create() {
    return { data: {}, steps: [{ kind: 'play', durationMs: DURATION }] };
  },
  initPlayer() {
    return { seq: 0, level: 0, cur: null, hits: 0, misses: 0, points: 0, lastMissAt: 0 };
  },
  onStepStart(round, env) {
    for (const pid of round.participants) {
      const p = round.players[pid];
      if (p && !p.cur) issue(p, env.now);
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
    if (action?.type === 'miss') {
      if (env.now - p.lastMissAt > 150) {
        p.misses += 1;
        p.points -= 10;
        p.lastMissAt = env.now;
      }
      return { ok: true, data: view(p) };
    }
    if (!cur || action?.id !== cur.id) return { ok: true, data: view(p) };
    const elapsed = env.now - cur.issuedAt;
    if (action.type === 'hit') {
      if (elapsed < MIN_HIT_MS) return { ok: false, error: '너무 빨라요' };
      if (elapsed <= cur.lifeMs + 400) {
        p.hits += 1;
        p.points += 100 + Math.round(50 * clamp(1 - elapsed / cur.lifeMs, 0, 1));
        p.level += 1;
      }
      issue(p, env.now);
      return { ok: true, data: { ...view(p), hit: elapsed <= cur.lifeMs + 400 } };
    }
    if (action.type === 'expire') {
      if (elapsed >= cur.lifeMs - 200) issue(p, env.now);
      return { ok: true, data: view(p) };
    }
    return { ok: false, error: 'bad action' };
  },
  submittedCount(round) {
    return Object.values(round.players).filter((p) => p.hits + p.misses > 0).length;
  },
  liveBoard(round, nick) {
    return Object.entries(round.players)
      .filter(([, p]) => p.hits > 0)
      .sort((a, b) => b[1].points - a[1].points)
      .slice(0, 5)
      .map(([id, p]) => ({ nickname: nick(id), value: `${p.hits}회 명중` }));
  },
  finalize(round) {
    const out: Record<string, { perf: number; metric: string }> = {};
    for (const pid of round.participants) {
      const p = round.players[pid];
      if (p) out[pid] = { perf: Math.max(0, p.points), metric: p.hits || p.misses ? `${p.hits}회 명중 · 빗나감 ${p.misses}` : '미참여' };
    }
    return out;
  },
};
