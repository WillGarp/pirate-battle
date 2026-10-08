import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMatchHistory, fetchRanking, registerMatch } from '../api/matches';
import type { HistoryQuery, RankingQuery } from '../api/matchContracts';
import type { GameConfig } from '../game/config/gameConfig';
import type { GameResult } from '../types/gameResult';
import { markMatchRegistered } from '../storage/matchOutbox';

export const matchQueryKeys = {
  ranking: ['ranking'] as const,
  history: ['match-history'] as const,
};

export function useRanking(config: GameConfig, page: number, enabled: boolean) {
  const query: RankingQuery = { page, pageSize: 5, config };
  return useQuery({
    queryKey: [...matchQueryKeys.ranking, JSON.stringify(config), page],
    queryFn: ({ signal }) => fetchRanking(query, signal),
    enabled,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[0] === matchQueryKeys.ranking[0] ? previous : undefined,
  });
}

export function useMatchHistory(playerId: string, page: number, enabled: boolean) {
  const query: HistoryQuery = { page, pageSize: 5, playerId };
  return useQuery({
    queryKey: [...matchQueryKeys.history, playerId, page],
    queryFn: ({ signal }) => fetchMatchHistory(query, signal),
    enabled,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[0] === matchQueryKeys.history[0] ? previous : undefined,
  });
}

export function useRegisterMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (result: GameResult) => registerMatch(result),
    onSuccess: async (_response, result) => {
      markMatchRegistered(result.matchId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: matchQueryKeys.ranking }),
        queryClient.invalidateQueries({ queryKey: matchQueryKeys.history }),
      ]);
    },
  });
}