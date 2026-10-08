export const NETWORK_SCENARIO_KEY = 'pirate-battle.network-scenario.v1';
export const API_MATCHES_KEY = 'pirate-battle.mock-matches.v1';
export const TIMEOUTED_MATCHES_KEY = 'pirate-battle.mock-timeouts.v1';

export const NETWORK_SCENARIOS = [
  { value: 'success', label: 'Success' },
  { value: 'empty', label: 'Empty lists' },
  { value: 'slow', label: 'Slow response' },
  { value: 'out-of-order', label: 'Out-of-order pages' },
  { value: 'ranking-error', label: 'Ranking HTTP 503' },
  { value: 'history-error', label: 'History HTTP 503' },
  { value: 'http-400', label: 'HTTP 400' },
  { value: 'connection-error', label: 'Connection failure' },
  { value: 'register-timeout-once', label: 'Register timeout once' },
] as const;

export type NetworkScenario = (typeof NETWORK_SCENARIOS)[number]['value'];

export function getNetworkScenario(): NetworkScenario {
  const value = localStorage.getItem(NETWORK_SCENARIO_KEY);
  return NETWORK_SCENARIOS.some((scenario) => scenario.value === value)
    ? value as NetworkScenario
    : 'success';
}

export function setNetworkScenario(scenario: NetworkScenario) {
  localStorage.setItem(NETWORK_SCENARIO_KEY, scenario);
}

export function resetMockApiData() {
  localStorage.removeItem(API_MATCHES_KEY);
  localStorage.removeItem(TIMEOUTED_MATCHES_KEY);
  localStorage.setItem(NETWORK_SCENARIO_KEY, 'success');
}