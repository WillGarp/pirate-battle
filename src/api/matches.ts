import axios from 'axios';
import type { GameResult } from '../types/gameResult';
import type { HistoryQuery, MatchRecord, PageResponse, RankingQuery, RegisterMatchResponse } from './matchContracts';

const client = axios.create({ baseURL: '/api', timeout: 5000 });

function parsePageResponse<T>(value: unknown): PageResponse<T> {
  if (
    typeof value !== 'object' || value === null ||
    !Array.isArray((value as PageResponse<T>).items) ||
    typeof (value as PageResponse<T>).page !== 'number' ||
    typeof (value as PageResponse<T>).totalPages !== 'number'
  ) {
    throw new Error('The records API returned an invalid page response.');
  }
  return value as PageResponse<T>;
}

export async function fetchRanking(query: RankingQuery, signal?: AbortSignal) {
  const response = await client.get<unknown>('/ranking', {
    params: { ...query, config: JSON.stringify(query.config) },
    signal,
  });
  return parsePageResponse<MatchRecord>(response.data);
}

export async function fetchMatchHistory(query: HistoryQuery, signal?: AbortSignal) {
  const response = await client.get<unknown>('/history', { params: query, signal });
  return parsePageResponse<MatchRecord>(response.data);
}

export async function registerMatch(result: GameResult) {
  const response = await client.post<unknown>('/matches', result, {
    headers: { 'Idempotency-Key': result.matchId },
  });
  const data = response.data as Partial<RegisterMatchResponse> | null;
  if (!data || typeof data !== 'object' || !data.record || typeof data.duplicate !== 'boolean') {
    throw new Error('The match API returned an invalid registration response.');
  }
  return data as RegisterMatchResponse;
}