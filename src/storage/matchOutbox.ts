import type { GameResult } from '../types/gameResult';

const PENDING_KEY = 'pirate-battle.pending-matches.v1';
const REGISTERED_KEY = 'pirate-battle.registered-matches.v1';

function readIds(key: string) {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

export function loadPendingMatches(): GameResult[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]');
    return Array.isArray(value) ? value as GameResult[] : [];
  } catch {
    return [];
  }
}

export function queueMatch(result: GameResult) {
  const registered = readIds(REGISTERED_KEY);
  const pending = loadPendingMatches();
  if (registered.includes(result.matchId) || pending.some((match) => match.matchId === result.matchId)) return;
  pending.push(result);
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

export function markMatchRegistered(matchId: string) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(loadPendingMatches().filter((match) => match.matchId !== matchId)));
  const registered = readIds(REGISTERED_KEY);
  if (!registered.includes(matchId)) {
    registered.push(matchId);
    localStorage.setItem(REGISTERED_KEY, JSON.stringify(registered));
  }
}

export function getMatchSubmissionStatus(matchId: string): 'pending' | 'registered' | 'local-only' {
  if (loadPendingMatches().some((match) => match.matchId === matchId)) return 'pending';
  if (readIds(REGISTERED_KEY).includes(matchId)) return 'registered';
  return 'local-only';
}

export function clearMatchOutbox() {
  localStorage.removeItem(PENDING_KEY);
  localStorage.removeItem(REGISTERED_KEY);
}