// 버블팝 배틀: 모든 참가자에게 같은 비눗방울이 같은 시각에 떠오름 (공정).
// 각자 터뜨린 비눗방울은 서버가 기록하며, 떠 있는 시간 안의 터치만 인정.
import { rand } from '../util';
import type { GameModule } from './types';

const DURATION = 15_000;
const POINTS = { blue: 10, gold: 50, red: -30 } as const;
const MIN_POP_MS = 150;

type Kind = keyof typeof POINTS;
interface Bubble {
  id: number;
  kind: Kind;
  x: number;
  size: number;
  spawnAt: number; // 단계 시작 기준 ms
  riseMs: number;
}
interface Data {
  bubbles: Bubble[];
}
interface PState {
  popped: number[];
  points: number;
  counts: Record<Kind, number>;
}

export const bubbleGame: GameModule<Data, PState> = {
  id: 'bubble',
  pausable: false,
  scoring: 'relative',
  create() {
    const bubbles: Bubble[] = [];
    let t = 400;
    let id = 0;
    while (t < DURATION - 1200) {
      const r = Math.random();
      const kind: Kind = r < 0.12 ? 'gold' : r < 0.42 ? 'red' : 'blue';
      const riseMs = kind === 'gold' ? rand(1700, 2300) : rand(2800, 3800);
      bubbles.push({ id: id++, kind, x: rand(8, 92), size: kind === 'gold' ? rand(13, 16) : rand(15, 21), spawnAt: t, riseMs: Math.min(riseMs, DURATION - t) });
      // 시간이 갈수록 더 자주 떠오름
      t += Math.round(rand(220, 380) * (1 - (t / DURATION) * 0.4));
    }
    return { data: { bubbles }, steps: [{ kind: 'play', durationMs: DURATION }] };
  },
  initPlayer() {
    return { popped: [], points: 0, counts: { blue: 0, gold: 0, red: 0 } };
  },
  publicPayload(round) {
    return { bubbles: round.data.bubbles, points: POINTS };
  },
  playerView(round, pid) {
    const p = round.players[pid];
    return p ? { popped: p.popped, points: p.points, counts: p.counts } : null;
  },
  onAction(round, pid, action, env) {
    const p = round.players[pid];
    if (!p) return { ok: false, error: '이번 라운드 참가자가 아닙니다' };
    if (!env.active) return { ok: false, error: '시간 종료' };
    if (action?.type !== 'pop') return { ok: false, error: 'bad action' };
    const b = round.data.bubbles[Number(action.id)];
    if (!b) return { ok: false, error: '없는 비눗방울' };
    if (p.popped.includes(b.id)) return { ok: false, error: '이미 터뜨렸어요' };
    const t = env.now - round.stepStartedAt;
    if (t < b.spawnAt + MIN_POP_MS || t > b.spawnAt + b.riseMs + 500) return { ok: false, error: '놓쳤어요' };
    p.popped.push(b.id);
    p.points += POINTS[b.kind];
    p.counts[b.kind] += 1;
    return { ok: true, data: { popped: p.popped, points: p.points, counts: p.counts, kind: b.kind } };
  },
  submittedCount(round) {
    return Object.values(round.players).filter((p) => p.popped.length > 0).length;
  },
  liveBoard(round, nick) {
    return Object.entries(round.players)
      .filter(([, p]) => p.popped.length)
      .sort((a, b) => b[1].points - a[1].points)
      .slice(0, 5)
      .map(([id, p]) => ({ nickname: nick(id), value: `${p.points}점` }));
  },
  finalize(round) {
    const out: Record<string, { perf: number; metric: string }> = {};
    for (const pid of round.participants) {
      const p = round.players[pid];
      if (!p) continue;
      out[pid] = {
        perf: Math.max(0, p.points),
        metric: p.popped.length ? `${p.points}점 (🔵${p.counts.blue} 🟡${p.counts.gold} 🔴${p.counts.red})` : '미참여',
      };
    }
    return out;
  },
};
