// 게임 화면 레지스트리: 새 게임 추가 시 여기에 컴포넌트를 연결하세요.
import type { ComponentType } from 'react';
import type { GameId } from '@/shared/types';
import type { GameProps } from './common';
import MemoryGame from './MemoryGame';
import QuizGame from './QuizGame';
import ReactionGame from './ReactionGame';
import StreamGame from './StreamGame';
import TapGame from './TapGame';
import BombGame from './BombGame';
import BubbleGame from './BubbleGame';
import HorseGame from './HorseGame';
import PotatoGame from './PotatoGame';
import RollGame from './RollGame';
import StackGame from './StackGame';
import CupsGame from './CupsGame';
import MinorityGame from './MinorityGame';
import NunchiGame from './NunchiGame';
import RhythmGame from './RhythmGame';
import ShapeGame from './ShapeGame';
import Stop10Game from './Stop10Game';
import TargetGame from './TargetGame';

export const PLAYER_GAMES: Record<GameId, ComponentType<GameProps>> = {
  tap: TapGame,
  math: StreamGame,
  color: StreamGame,
  compare: StreamGame,
  order: StreamGame,
  typing: StreamGame,
  sense: StreamGame,
  nonsense: QuizGame,
  chosung: QuizGame,
  ox: QuizGame,
  reaction: ReactionGame,
  memory: MemoryGame,
  target: TargetGame,
  cups: CupsGame,
  stop10: Stop10Game,
  shape: ShapeGame,
  rhythm: RhythmGame,
  nunchi: NunchiGame,
  bomb: BombGame,
  minority: MinorityGame,
  stack: StackGame,
  bubble: BubbleGame,
  horse: HorseGame,
  potato: PotatoGame,
  roll: RollGame,
};
