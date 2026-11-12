import type { GameId } from './types';

export interface GameMeta {
  id: GameId;
  name: string;
  emoji: string;
  /** 대표 색상 (그라데이션 from/to) */
  color: [string, string];
  short: string; // 한 줄 소개
  howTo: string[]; // 참가자 안내
  scoring: string; // 점수 계산 방식 안내
  approxSeconds: number;
}

export const GAME_META: Record<GameId, GameMeta> = {
  tap: {
    id: 'tap',
    name: '연타왕',
    emoji: '👆',
    color: ['#f43f5e', '#f97316'],
    short: '10초 동안 버튼을 최대한 많이 터치!',
    howTo: ['화면 가운데 큰 버튼을 연타하세요', '여러 손가락 사용 가능!', '10초 후 자동 종료'],
    scoring: '터치 횟수 ÷ 1등 터치 횟수 × 1000점',
    approxSeconds: 10,
  },
  math: {
    id: 'math',
    name: '사칙연산 천재',
    emoji: '🧮',
    color: ['#3b82f6', '#06b6d4'],
    short: '30초 동안 계산 문제를 최대한 많이 풀기',
    howTo: ['4개 보기 중 정답을 터치', '맞히면 바로 다음 문제', '틀리면 감점 + 1초 대기'],
    scoring: '정답 100점 + 빠를수록 보너스(최대 50) − 오답 30점 → 1등 대비 환산',
    approxSeconds: 30,
  },
  nonsense: {
    id: 'nonsense',
    name: '넌센스 퀴즈',
    emoji: '🤣',
    color: ['#eab308', '#f97316'],
    short: '말장난의 세계! 4지선다 넌센스 퀴즈',
    howTo: ['문제당 10초', '정답이라고 생각하는 보기를 터치', '빨리 맞힐수록 높은 점수'],
    scoring: '문제당 최대 1000/문제수 (정답 60% + 남은 시간 비율 40%)',
    approxSeconds: 40,
  },
  chosung: {
    id: 'chosung',
    name: '초성 퀴즈',
    emoji: '🔤',
    color: ['#10b981', '#14b8a6'],
    short: '초성만 보고 단어를 맞혀라!',
    howTo: ['카테고리 힌트와 초성을 확인', '문제당 15초', '빨리 맞힐수록 높은 점수'],
    scoring: '문제당 최대 1000/문제수 (정답 60% + 남은 시간 비율 40%)',
    approxSeconds: 50,
  },
  reaction: {
    id: 'reaction',
    name: '반응속도 테스트',
    emoji: '⚡',
    color: ['#22c55e', '#84cc16'],
    short: '화면이 초록색으로 바뀌는 순간 터치!',
    howTo: ['빨간 화면에서 기다리기', '초록색이 되면 즉시 터치', '먼저 누르면 반칙! (3회 측정)'],
    scoring: '3회 평균 반응시간(반칙·미응답 1000ms) → 1등 대비 환산',
    approxSeconds: 25,
  },
  ox: {
    id: 'ox',
    name: 'OX 스피드 퀴즈',
    emoji: '🙆',
    color: ['#8b5cf6', '#ec4899'],
    short: '맞으면 O, 틀리면 X! 총 5문제',
    howTo: ['문제당 6초', 'O 또는 X 터치', '문제마다 정답과 해설 공개'],
    scoring: '문제당 200점 (정답 60% + 남은 시간 비율 40%)',
    approxSeconds: 45,
  },
  color: {
    id: 'color',
    name: '색깔 함정 게임',
    emoji: '🎨',
    color: ['#ec4899', '#8b5cf6'],
    short: '글자가 아니라 글자의 "색깔"을 고르세요!',
    howTo: ['"빨강"이 파란색으로 써 있다면 → 파랑', '20초 동안 최대한 많이', '틀리면 감점 + 0.8초 대기'],
    scoring: '정답 100점 + 속도 보너스 − 오답 30점 → 1등 대비 환산',
    approxSeconds: 20,
  },
  memory: {
    id: 'memory',
    name: '숫자 기억력 배틀',
    emoji: '🧠',
    color: ['#6366f1', '#0ea5e9'],
    short: '3초 동안 보여주는 숫자를 기억하라!',
    howTo: ['숫자가 3초간 표시됩니다', '사라지면 기억한 숫자 입력', '맞힐 때마다 한 자리씩 늘어나요'],
    scoring: '최대 기억 자릿수 우선, 동점이면 입력 속도 → 1등 대비 환산',
    approxSeconds: 60,
  },
  compare: {
    id: 'compare',
    name: '숫자 크기 비교',
    emoji: '⚖️',
    color: ['#f59e0b', '#ef4444'],
    short: '더 큰 쪽을 빠르게 터치!',
    howTo: ['두 수(식) 중 더 큰 쪽을 터치', '20초 동안 최대한 많이', '틀리면 감점 + 0.8초 대기'],
    scoring: '정답 100점 + 속도 보너스 − 오답 30점 → 1등 대비 환산',
    approxSeconds: 20,
  },
  order: {
    id: 'order',
    name: '순서 맞추기',
    emoji: '🔢',
    color: ['#14b8a6', '#3b82f6'],
    short: '작은 수부터 차례대로 터치!',
    howTo: ['4개의 수(식)가 나와요', '가장 작은 것부터 순서대로 터치', '틀리면 감점 + 0.8초 대기'],
    scoring: '정답 100점 + 속도 보너스 − 오답 30점 → 1등 대비 환산',
    approxSeconds: 25,
  },
  typing: {
    id: 'typing',
    name: '빠른 타자',
    emoji: '⌨️',
    color: ['#0ea5e9', '#a855f7'],
    short: '제시된 문장을 똑같이 빠르게 입력!',
    howTo: ['화면의 문장을 그대로 입력', '맞히면 다음 문장', '오타는 감점 (띄어쓰기 개수는 무관)'],
    scoring: '정답 100점 + 속도 보너스 − 오답 30점 → 1등 대비 환산',
    approxSeconds: 30,
  },
  sense: {
    id: 'sense',
    name: '숫자 감각',
    emoji: '🎯',
    color: ['#f97316', '#eab308'],
    short: '정확히 계산 말고, 감으로 가장 가까운 값!',
    howTo: ['계산식의 결과와 가장 가까운 보기를 터치', '어림셈으로 빠르게!', '틀리면 감점 + 0.8초 대기'],
    scoring: '정답 100점 + 속도 보너스 − 오답 30점 → 1등 대비 환산',
    approxSeconds: 20,
  },
};

export const ALL_GAME_IDS = Object.keys(GAME_META) as GameId[];

/** 순위 동점 처리 기준 (화면에 안내) */
export const TIE_RULE =
  '누적 점수가 같으면 공동 순위입니다. 표시 순서는 라운드 1위 횟수 → 최근 라운드 점수 → 닉네임 순입니다.';
