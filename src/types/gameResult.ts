import type { GameConfig } from '../game/config/gameConfig';

export interface GameResult {
  matchId: string;
  playerId: string;
  date: string;
  score: number;
  durationSeconds: number;
  endReason: string;
  config: GameConfig;
}