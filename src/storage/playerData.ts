import { DEFAULT_GAME_CONFIG, type GameConfig } from '../game/config/gameConfig';
import type { GameResult } from '../types/gameResult';

const OPTIONS_KEY = 'pirate-battle.options.v1';
const LAST_RESULT_KEY = 'pirate-battle.last-result.v1';

export function loadPlayerConfig(): GameConfig {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return DEFAULT_GAME_CONFIG;
    const options = value as Record<string, unknown>;
    const sessionDuration = Number(options.sessionDuration);
    const enemySpawnInterval = Number(options.enemySpawnInterval);
    if (
      !Number.isFinite(sessionDuration) || sessionDuration < 60 || sessionDuration > 180 ||
      !Number.isFinite(enemySpawnInterval) || enemySpawnInterval < 1 || enemySpawnInterval > 10
    ) return DEFAULT_GAME_CONFIG;
    return { ...DEFAULT_GAME_CONFIG, sessionDuration, enemySpawnInterval };
  } catch {
    return DEFAULT_GAME_CONFIG;
  }
}

export function savePlayerConfig(config: GameConfig) {
  localStorage.setItem(OPTIONS_KEY, JSON.stringify({
    sessionDuration: config.sessionDuration,
    enemySpawnInterval: config.enemySpawnInterval,
  }));
}

export function loadLastResult(): GameResult | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LAST_RESULT_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const result = value as Partial<GameResult>;
    if (
      typeof result.matchId !== 'string' || typeof result.playerId !== 'string' ||
      typeof result.date !== 'string' || typeof result.score !== 'number' ||
      typeof result.durationSeconds !== 'number' || typeof result.endReason !== 'string' ||
      typeof result.config !== 'object' || result.config === null
    ) return null;
    return result as GameResult;
  } catch {
    return null;
  }
}

export function saveLastResult(result: GameResult) {
  localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result));
}