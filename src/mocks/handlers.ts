import { delay, http, HttpResponse } from 'msw';
import type { GameConfig } from '../game/config/gameConfig';
import { DEFAULT_GAME_CONFIG } from '../game/config/gameConfig';
import type { GameResult } from '../types/gameResult';
import type { MatchRecord, PageResponse } from '../api/matchContracts';
import { API_MATCHES_KEY, getNetworkScenario, TIMEOUTED_MATCHES_KEY } from './scenarioState';

const PAGE_SIZE = 5;

function fixture(matchId: string, playerId: string, date: string, score: number, durationSeconds: number): MatchRecord {
  return { matchId, playerId, date, score, durationSeconds, endReason: 'Ship destroyed', config: DEFAULT_GAME_CONFIG };
}

const FIXTURES: MatchRecord[] = [
  fixture('fixture-01', 'Captain Morgan', '2026-09-20T16:30:00.000Z', 18, 112),
  fixture('fixture-02', 'Anne Bonny', '2026-09-21T11:15:00.000Z', 15, 96),
  fixture('fixture-03', 'local-player', '2026-09-22T09:05:00.000Z', 12, 83),
  fixture('fixture-04', 'Blackbeard', '2026-09-22T18:42:00.000Z', 12, 109),
  fixture('fixture-05', 'Grace O’Malley', '2026-09-24T12:10:00.000Z', 8, 74),
  fixture('fixture-06', 'local-player', '2026-09-25T08:20:00.000Z', 5, 63),
  fixture('fixture-07', 'Mary Read', '2026-09-26T14:55:00.000Z', 3, 61),
];

function readStoredMatches(): MatchRecord[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(API_MATCHES_KEY) ?? '[]');
    return Array.isArray(value) ? value as MatchRecord[] : [];
  } catch {
    return [];
  }
}

function readTimedOutIds() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(TIMEOUTED_MATCHES_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function allMatches() {
  return [...FIXTURES, ...readStoredMatches()];
}

function pageOf<T>(items: T[], page: number, pageSize: number): PageResponse<T> {
  const size = Math.max(1, Math.min(pageSize || PAGE_SIZE, 50));
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const currentPage = Math.max(1, Math.min(page || 1, totalPages));
  const start = (currentPage - 1) * size;
  return { items: items.slice(start, start + size), page: currentPage, pageSize: size, total: items.length, totalPages };
}

async function applyLatency(page: number) {
  const scenario = getNetworkScenario();
  if (scenario === 'slow') await delay(800);
  if (scenario === 'out-of-order') await delay(page === 1 ? 900 : 100);
}

function sameConfig(left: GameConfig, right: GameConfig) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export const handlers = [
  http.get('/api/ranking', async ({ request }) => {
    const scenario = getNetworkScenario();
    if (scenario === 'connection-error') return HttpResponse.error();
    if (scenario === 'ranking-error') return HttpResponse.json({ message: 'Ranking unavailable.' }, { status: 503 });
    if (scenario === 'http-400') return HttpResponse.json({ message: 'Bad ranking request.' }, { status: 400 });

    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? 1);
    const pageSize = Number(url.searchParams.get('pageSize') ?? PAGE_SIZE);
    let config = DEFAULT_GAME_CONFIG;
    try {
      const serialized = url.searchParams.get('config');
      if (serialized) config = JSON.parse(serialized) as GameConfig;
    } catch {
      return HttpResponse.json({ message: 'Invalid game config.' }, { status: 400 });
    }

    await applyLatency(page);
    const matches = scenario === 'empty' ? [] : allMatches().filter((match) => sameConfig(match.config, config));
    matches.sort((left, right) =>
      right.score - left.score ||
      left.durationSeconds - right.durationSeconds ||
      left.date.localeCompare(right.date) ||
      left.playerId.localeCompare(right.playerId) ||
      left.matchId.localeCompare(right.matchId),
    );
    return HttpResponse.json(pageOf(matches, page, pageSize));
  }),

  http.get('/api/history', async ({ request }) => {
    const scenario = getNetworkScenario();
    if (scenario === 'connection-error') return HttpResponse.error();
    if (scenario === 'history-error') return HttpResponse.json({ message: 'Match history unavailable.' }, { status: 503 });
    if (scenario === 'http-400') return HttpResponse.json({ message: 'Bad history request.' }, { status: 400 });

    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? 1);
    const pageSize = Number(url.searchParams.get('pageSize') ?? PAGE_SIZE);
    const playerId = url.searchParams.get('playerId') ?? 'local-player';
    await applyLatency(page);
    const matches = (scenario === 'empty' ? [] : allMatches().filter((match) => match.playerId === playerId))
      .sort((left, right) => right.date.localeCompare(left.date));
    return HttpResponse.json(pageOf(matches, page, pageSize));
  }),

  http.post('/api/matches', async ({ request }) => {
    const scenario = getNetworkScenario();
    if (scenario === 'connection-error') return HttpResponse.error();

    let result: GameResult;
    try {
      result = await request.json() as GameResult;
    } catch {
      return HttpResponse.json({ message: 'Invalid match record.' }, { status: 400 });
    }
    if (!result.matchId || !result.playerId || !result.config) {
      return HttpResponse.json({ message: 'Missing required match fields.' }, { status: 400 });
    }

    const existing = allMatches().find((match) => match.matchId === result.matchId);
    if (existing) return HttpResponse.json({ record: existing, duplicate: true });

    const stored = readStoredMatches();
    stored.push(result);
    localStorage.setItem(API_MATCHES_KEY, JSON.stringify(stored));

    if (scenario === 'register-timeout-once') {
      const timeoutIds = readTimedOutIds();
      if (!timeoutIds.includes(result.matchId)) {
        timeoutIds.push(result.matchId);
        localStorage.setItem(TIMEOUTED_MATCHES_KEY, JSON.stringify(timeoutIds));
        return HttpResponse.json({ message: 'Response timed out after storing the record.' }, { status: 504 });
      }
    }

    return HttpResponse.json({ record: result, duplicate: false }, { status: 201 });
  }),
];