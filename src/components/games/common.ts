import type { Ack, MeState, PublicState } from '@/shared/types';

export interface GameProps {
  state: PublicState;
  me: MeState;
  act: (action: Record<string, unknown>) => Promise<Ack<any>>;
  setView: (view: any) => void;
}
