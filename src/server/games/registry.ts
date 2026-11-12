// 게임 레지스트리: 새 게임은 모듈을 만들고 여기에 한 줄 추가 + shared/gameMeta.ts 에 메타 추가
// + src/components/games/index.tsx 에 화면 컴포넌트 등록하면 끝.
import type { GameId } from '../../shared/types';
import { memoryGame } from './memory';
import { chosungGame, nonsenseGame, oxGame } from './quizGames';
import { reactionGame } from './reaction';
import { colorGame, compareGame, mathGame, orderGame, senseGame, typingGame } from './streamGames';
import { tapGame } from './tap';
import type { GameModule } from './types';

export const GAMES: Record<GameId, GameModule> = {
  tap: tapGame,
  math: mathGame,
  nonsense: nonsenseGame,
  chosung: chosungGame,
  reaction: reactionGame,
  ox: oxGame,
  color: colorGame,
  memory: memoryGame,
  compare: compareGame,
  order: orderGame,
  typing: typingGame,
  sense: senseGame,
};
