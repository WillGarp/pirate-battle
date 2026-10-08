import type { GameConfig } from '../game/config/gameConfig';
import type { GameResult } from '../types/gameResult';

export type MatchRecord = GameResult;

export interface PageResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface RegisterMatchResponse {
  record: MatchRecord;
  duplicate: boolean;
}

export interface RankingQuery {
  page: number;
  pageSize: number;
  config: GameConfig;
}

export interface HistoryQuery {
  page: number;
  pageSize: number;
  playerId: string;
}