// 컵 속 공 찾기: 전원 동시 진행. 서버가 정한 섞기 순서를 모든 화면이 같은 시각에 재생.
// 단계: show(공 위치 공개) → shuffle(섞기) → question(선택) → reveal(정답 공개)
import { clamp, rand } from '../util';
import type { GameModule, Round, StepDef } from './types';

interface Problem {
  n: number;
  ball: number; // 처음 공이 든 슬롯
  swaps: [number, number][];
  swapMs: number;
  answer: number; // 섞은 뒤 공이 든 슬롯
}
interface Data {
  problems: Problem[];
  questionMs: number;
  maxPer: number;
}
interface Ans {
  choice: number;
  correct: boolean;
  points: number;
}
interface PState {
  answers: Record<number, Ans>;
}

const SHOW_MS = 1800;
const QUESTION_MS = 6000;
const REVEAL_MS = 3000;

function makeProblem(n: number, swapCount: number, swapMs: number): Problem {
  const ball = rand(0, n - 1);
  const swaps: [number, number][] = [];
  let pos = ball;
  for (let i = 0; i < swapCount; i++) {
    let a = rand(0, n - 1);
    let b = rand(0, n - 1);
    while (b === a) b = rand(0, n - 1);
    // 절반 이상은 공이 든 컵이 움직이도록 (눈으로 따라갈 재미)
    if (i % 2 === 0 && a !== pos && b !== pos) a = pos;
    if (a === b) b = (a + 1) % n;
    swaps.push([a, b]);
    if (pos === a) pos = b;
    else if (pos === b) pos = a;
  }
  return { n, ball, swaps, swapMs, answer: pos };
}

const cur = (round: Round<Data, PState>) => {
  const step = round.steps[round.stepIndex];
  return step ? { step, idx: step.index ?? 0, prob: round.data.problems[step.index ?? 0] } : null;
};

export const cupsGame: GameModule<Data, PState> = {
  id: 'cups',
  pausable: false,
  scoring: 'absolute',
  create() {
    const problems = [makeProblem(3, 6, 450), makeProblem(5, 9, 360)];
    const steps: StepDef[] = [];
    problems.forEach((p, i) => {
      steps.push({ kind: 'show', durationMs: SHOW_MS, index: i });
      steps.push({ kind: 'shuffle', durationMs: p.swaps.length * p.swapMs + 300, index: i });
      steps.push({ kind: 'question', durationMs: QUESTION_MS, index: i });
      steps.push({ kind: 'reveal', durationMs: REVEAL_MS, index: i });
    });
    return { data: { problems, questionMs: QUESTION_MS, maxPer: Math.floor(1000 / problems.length) }, steps };
  },
  initPlayer() {
    return { answers: {} };
  },
  publicPayload(round) {
    const c = cur(round);
    if (!c) return null;
    const { prob, idx, step } = c;
    const base: Record<string, unknown> = {
      index: idx,
      total: round.data.problems.length,
      n: prob.n,
      swapMs: prob.swapMs,
      // 공 위치는 show/reveal 단계에서만, 섞는 순서는 shuffle 이후에만 공개
      ball: step.kind === 'show' ? prob.ball : null,
      swaps: step.kind === 'show' ? null : prob.swaps,
    };
    if (step.kind === 'reveal') {
      const dist = Array.from({ length: prob.n }, () => 0);
      let correctCount = 0;
      for (const pid of round.participants) {
        const a = round.players[pid]?.answers[idx];
        if (!a) continue;
        dist[a.choice]++;
        if (a.correct) correctCount++;
      }
      base.reveal = { answer: prob.answer, dist, correctCount };
    }
    return base;
  },
  playerView(round, pid) {
    const p = round.players[pid];
    const c = cur(round);
    if (!p || !c) return null;
    const a = p.answers[c.idx];
    return {
      index: c.idx,
      chosen: a ? a.choice : null,
      result: c.step.kind === 'reveal' ? (a ? { correct: a.correct, points: a.points } : { correct: false, points: 0, missed: true }) : null,
    };
  },
  onAction(round, pid, action, env) {
    const p = round.players[pid];
    const c = cur(round);
    if (!p) return { ok: false, error: '이번 라운드 참가자가 아닙니다' };
    if (!c || c.step.kind !== 'question' || !env.active) return { ok: false, error: '아직 고를 수 없어요' };
    if (action?.type !== 'answer' || action.index !== c.idx) return { ok: false, error: '이미 지난 문제입니다' };
    if (p.answers[c.idx]) return { ok: false, error: '이미 골랐어요' };
    const choice = Number(action.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice >= c.prob.n) return { ok: false, error: '잘못된 선택' };
    const correct = choice === c.prob.answer;
    const remain = clamp((round.stepEndsAt - env.now) / QUESTION_MS, 0, 1);
    const points = correct ? Math.round(round.data.maxPer * (0.6 + 0.4 * remain)) : 0;
    p.answers[c.idx] = { choice, correct, points };
    return { ok: true, data: cupsGame.playerView(round, pid, env.now) };
  },
  isDone(round, pid) {
    const c = cur(round);
    return !!c && c.step.kind === 'question' && !!round.players[pid]?.answers[c.idx];
  },
  submittedCount(round) {
    const c = cur(round);
    return c ? Object.values(round.players).filter((p) => p.answers[c.idx]).length : 0;
  },
  liveBoard() {
    return [];
  },
  finalize(round) {
    const out: Record<string, { score: number; metric: string }> = {};
    const n = round.data.problems.length;
    for (const pid of round.participants) {
      const p = round.players[pid];
      if (!p) continue;
      const list = Object.values(p.answers);
      out[pid] = {
        score: Math.min(1000, list.reduce((s, a) => s + a.points, 0)),
        metric: list.length ? `${list.filter((a) => a.correct).length}/${n} 정답` : '미응답',
      };
    }
    return out;
  },
};
