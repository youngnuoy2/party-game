// 폭탄 돌리기: 참가자 5명당 폭탄 1개. 폭탄을 받으면 [넘기기]로 무작위 다른 참가자에게 전달.
// 터지는 시각은 서버만 알고 있으며(12~22초), 터지면 즉시 공개 단계로 넘어감.
import { pick, rand, shuffle } from '../util';
import type { ActionEnv, GameModule, Round } from './types';

const MAX_MS = 30_000; // 화면에는 표시하지 않음 (hideTimer)
const REVEAL_MS = 5_000;
const MIN_HOLD_MS = 300; // 받자마자 튕겨 보내기 방지
const PENALTY_PER_SEC = 50;

interface Bomb {
  id: number;
  holder: string | null;
  since: number;
  from: string | null;
}
interface Data {
  bombs: Bomb[];
  fuseMs: number;
  exploded: boolean;
  victims: string[];
}
interface PState {
  holdMs: number;
  passes: number;
  exploded: boolean;
}

type R = Round<Data, PState>;

const holding = (round: R, pid: string) => round.data.bombs.filter((b) => b.holder === pid);

function settle(round: R, b: Bomb, now: number) {
  if (b.holder && round.players[b.holder]) round.players[b.holder].holdMs += now - b.since;
}

/** 폭탄을 넘길 대상: 접속 중 + 폭탄 없음 + 방금 준 사람 제외 */
function chooseTarget(round: R, env: ActionEnv, exclude: (string | null)[]) {
  const busy = new Set(round.data.bombs.map((b) => b.holder));
  const ok = (pid: string) => round.players[pid] && env.isOnline(pid) && !busy.has(pid) && !exclude.includes(pid);
  const cands = round.participants.filter(ok);
  if (cands.length) return pick(cands);
  const loose = round.participants.filter((pid) => round.players[pid] && env.isOnline(pid) && !busy.has(pid));
  return loose.length ? pick(loose) : null;
}

export const potatoGame: GameModule<Data, PState> = {
  id: 'potato',
  pausable: false,
  hideTimer: true,
  scoring: 'absolute',
  create(ctx) {
    const n = Math.max(1, Math.floor(ctx.participants.length / 5));
    return {
      data: { bombs: Array.from({ length: n }, (_, i) => ({ id: i, holder: null, since: 0, from: null })), fuseMs: rand(12_000, 22_000), exploded: false, victims: [] },
      steps: [
        { kind: 'play', durationMs: MAX_MS },
        { kind: 'reveal', durationMs: REVEAL_MS },
      ],
    };
  },
  initPlayer() {
    return { holdMs: 0, passes: 0, exploded: false };
  },
  onStepStart(round, env) {
    if (round.steps[round.stepIndex]?.kind !== 'play') return;
    const online = shuffle(round.participants.filter((pid) => env.isOnline(pid)));
    round.data.bombs.forEach((b, i) => {
      b.holder = online[i] ?? null;
      b.since = env.now;
      if (b.holder) {
        env.emitTo(b.holder, { type: 'bomb' });
        env.touch(b.holder);
      }
    });
    env.schedule(round.data.fuseMs, () => {
      const now = Date.now();
      round.data.exploded = true;
      for (const b of round.data.bombs) {
        settle(round, b, now);
        if (b.holder && round.players[b.holder]) {
          round.players[b.holder].exploded = true;
          round.data.victims.push(b.holder);
        }
      }
      env.endStepNow();
    });
  },
  publicPayload(round) {
    return {
      holders: round.data.bombs.map((b) => b.holder),
      bombCount: round.data.bombs.length,
      victims: round.data.exploded ? round.data.victims : null,
    };
  },
  playerView(round, pid) {
    const p = round.players[pid];
    if (!p) return null;
    const mine = holding(round, pid);
    const live = mine.reduce((s, b) => s + (round.data.exploded ? 0 : Date.now() - b.since), 0);
    return { holding: mine.map((b) => b.id), since: mine[0]?.since ?? null, holdMs: p.holdMs + live, passes: p.passes, exploded: p.exploded, over: round.data.exploded };
  },
  onAction(round, pid, action, env) {
    const p = round.players[pid];
    if (!p) return { ok: false, error: '이번 라운드 참가자가 아닙니다' };
    if (!env.active || round.data.exploded) return { ok: false, error: '이미 터졌어요!' };
    if (action?.type !== 'pass') return { ok: false, error: 'bad action' };
    const b = round.data.bombs.find((x) => x.id === Number(action.bomb));
    if (!b || b.holder !== pid) return { ok: false, error: '폭탄이 없어요' };
    if (env.now - b.since < MIN_HOLD_MS) return { ok: false, error: '조금만 더...' };
    const target = chooseTarget(round, env, [pid, b.from]);
    if (!target) return { ok: false, error: '넘길 사람이 없어요' };
    settle(round, b, env.now);
    b.from = pid;
    b.holder = target;
    b.since = env.now;
    p.passes += 1;
    env.emitTo(target, { type: 'bomb' });
    env.touch(target);
    env.syncPublic();
    return { ok: true, data: potatoGame.playerView(round, pid, env.now) };
  },
  submittedCount(round) {
    return Object.values(round.players).filter((p) => p.passes > 0).length;
  },
  liveBoard() {
    return [];
  },
  finalize(round) {
    // 강제 종료 등으로 터지지 않고 끝난 경우에도 들고 있던 시간은 반영
    if (!round.data.exploded) {
      const now = Date.now();
      for (const b of round.data.bombs) settle(round, b, now);
      round.data.exploded = true;
    }
    const out: Record<string, { score: number; metric: string }> = {};
    for (const pid of round.participants) {
      const p = round.players[pid];
      if (!p) continue;
      const sec = p.holdMs / 1000;
      out[pid] = p.exploded
        ? { score: 0, metric: `💥 펑! (보유 ${sec.toFixed(1)}초)` }
        : { score: Math.max(100, Math.round(1000 - sec * PENALTY_PER_SEC)), metric: `보유 ${sec.toFixed(1)}초 · ${p.passes}번 넘김` };
    }
    return out;
  },
};
