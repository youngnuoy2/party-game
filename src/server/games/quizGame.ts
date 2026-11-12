// "모두 같은 문제를 동시에 푸는" 퀴즈 공통 로직 (넌센스 / 초성 / OX)
// - 문제 단계(question)에는 정답 정보가 절대 공개 payload 에 포함되지 않음
// - 공개 단계(reveal)에서만 정답/해설/선택 분포를 공개
import type { GameId } from '../../shared/types';
import { normalizeAnswer } from '../../shared/hangul';
import { clamp } from '../util';
import type { CreateCtx, GameModule, Round, StepDef } from './types';

export interface QuizQ {
  id: string;
  prompt: string; // 문제 본문
  hint?: string; // 카테고리 등
  big?: string; // 크게 보여줄 텍스트 (초성 등)
  choices: string[] | null; // null 이면 직접 입력
  correctIndex: number; // 보기형일 때
  accepted: string[]; // 직접 입력 시 인정 답 (정규화 전)
  answerText: string;
  explain: string;
}

interface QuizData {
  questions: QuizQ[];
  questionMs: number;
  revealMs: number;
  maxPer: number;
}

interface Ans {
  choice: number | null;
  text: string | null;
  correct: boolean;
  points: number;
  ms: number;
}

interface PState {
  answers: Record<number, Ans>;
}

interface Opts {
  id: GameId;
  questionMs: number;
  revealMs: number;
  build(ctx: CreateCtx): QuizQ[];
}

export function makeQuizGame(o: Opts): GameModule<QuizData, PState> {
  const curQ = (round: Round<QuizData, PState>) => {
    const step = round.steps[round.stepIndex];
    return step ? { step, q: round.data.questions[step.index ?? 0], idx: step.index ?? 0 } : null;
  };

  const mod: GameModule<QuizData, PState> = {
    id: o.id,
    pausable: true,
    scoring: 'absolute',
    create(ctx) {
      const questions = o.build(ctx);
      const steps: StepDef[] = [];
      questions.forEach((_, i) => {
        steps.push({ kind: 'question', durationMs: o.questionMs, index: i });
        steps.push({ kind: 'reveal', durationMs: o.revealMs, index: i });
      });
      return {
        data: { questions, questionMs: o.questionMs, revealMs: o.revealMs, maxPer: Math.floor(1000 / questions.length) },
        steps,
      };
    },
    initPlayer() {
      return { answers: {} };
    },
    publicPayload(round) {
      const c = curQ(round);
      if (!c) return null;
      const { q, idx, step } = c;
      const base = {
        index: idx,
        total: round.data.questions.length,
        prompt: q.prompt,
        hint: q.hint,
        big: q.big,
        choices: q.choices,
        inputMode: q.choices === null,
      };
      if (step.kind !== 'reveal') return base;
      // 공개 단계: 정답 + 분포
      const dist = q.choices ? q.choices.map(() => 0) : [];
      let correctCount = 0;
      let answered = 0;
      for (const pid of round.participants) {
        const a = round.players[pid]?.answers[idx];
        if (!a) continue;
        answered++;
        if (a.correct) correctCount++;
        if (a.choice !== null && dist[a.choice] !== undefined) dist[a.choice]++;
      }
      return {
        ...base,
        reveal: {
          correctIndex: q.choices ? q.correctIndex : null,
          answerText: q.answerText,
          explain: q.explain,
          dist,
          correctCount,
          answered,
        },
      };
    },
    playerView(round, pid) {
      const p = round.players[pid];
      if (!p) return null;
      const c = curQ(round);
      const idx = c?.idx ?? 0;
      const a = p.answers[idx];
      const isReveal = c?.step.kind === 'reveal';
      const sum = Object.values(p.answers).reduce((s, x) => s + x.points, 0);
      return {
        index: idx,
        submitted: a ? { choice: a.choice, text: a.text } : null,
        // 채점 결과는 공개 단계에서만 전달
        result: isReveal ? (a ? { correct: a.correct, points: a.points } : { correct: false, points: 0, missed: true }) : null,
        sum: isReveal || round.stepIndex >= round.steps.length ? sum : null,
      };
    },
    onAction(round, pid, action, env) {
      const p = round.players[pid];
      if (!p) return { ok: false, error: '이번 라운드 참가자가 아닙니다' };
      const c = curQ(round);
      if (!c || c.step.kind !== 'question' || !env.active) return { ok: false, error: '답안 제출 시간이 아닙니다' };
      if (action?.type !== 'answer' || action.index !== c.idx) return { ok: false, error: '이미 지난 문제입니다' };
      if (p.answers[c.idx]) return { ok: false, error: '이미 제출했습니다' };
      const q = c.q;
      let correct = false;
      let choice: number | null = null;
      let text: string | null = null;
      if (q.choices) {
        choice = Number(action.choice);
        if (!Number.isInteger(choice) || choice < 0 || choice >= q.choices.length) return { ok: false, error: '잘못된 보기' };
        correct = choice === q.correctIndex;
      } else {
        text = String(action.text ?? '').slice(0, 40);
        if (!text.trim()) return { ok: false, error: '답을 입력하세요' };
        const n = normalizeAnswer(text);
        correct = q.accepted.some((x) => normalizeAnswer(x) === n);
      }
      const ms = env.now - round.stepStartedAt;
      const remainRatio = clamp((round.stepEndsAt - env.now) / o.questionMs, 0, 1);
      const max = round.data.maxPer;
      const points = correct ? Math.round(max * (0.6 + 0.4 * remainRatio)) : 0;
      p.answers[c.idx] = { choice, text, correct, points, ms };
      return { ok: true, data: mod.playerView(round, pid, env.now) };
    },
    submittedCount(round) {
      const c = curQ(round);
      if (!c) return 0;
      return Object.values(round.players).filter((p) => p.answers[c.idx]).length;
    },
    isDone(round, pid) {
      const c = curQ(round);
      return !!c && c.step.kind === 'question' && !!round.players[pid]?.answers[c.idx];
    },
    liveBoard() {
      return [];
    },
    finalize(round) {
      const out: Record<string, { score: number; metric: string }> = {};
      const n = round.data.questions.length;
      for (const pid of round.participants) {
        const p = round.players[pid];
        if (!p) continue;
        const list = Object.values(p.answers);
        const correct = list.filter((a) => a.correct).length;
        const score = Math.min(1000, list.reduce((s, a) => s + a.points, 0));
        out[pid] = { score, metric: list.length ? `${correct}/${n} 정답` : '미응답' };
      }
      return out;
    },
  };
  return mod;
}
