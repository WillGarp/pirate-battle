import { lazy, Suspense, useState, type FormEvent } from 'react';
import { DEFAULT_GAME_CONFIG } from './game/config/gameConfig';
import type { GameConfig } from './game/config/gameConfig';
import { loadLastResult, loadPlayerConfig, saveLastResult, savePlayerConfig } from './storage/playerData';
import { clearMatchOutbox, getMatchSubmissionStatus, loadPendingMatches, queueMatch } from './storage/matchOutbox';
import { useMatchHistory, useRanking, useRegisterMatch } from './queries/matchQueries';
import { getNetworkScenario, NETWORK_SCENARIOS, resetMockApiData, setNetworkScenario, type NetworkScenario } from './mocks/scenarioState';
import type { GameResult } from './types/gameResult';

type Screen = 'menu' | 'options' | 'game' | 'result';
type RecordsTab = 'ranking' | 'history';
const PLAYER_ID = 'local-player';
const GameScreen = lazy(() => import('./screens/Game/GameScreen').then((module) => ({ default: module.GameScreen })));

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function App() {
  const [initialData] = useState(() => ({ config: loadPlayerConfig(), result: loadLastResult() }));
  const [screen, setScreen] = useState<Screen>(initialData.result ? 'result' : 'menu');
  const [config, setConfig] = useState<GameConfig>(initialData.config);
  const [draftConfig, setDraftConfig] = useState<GameConfig>(initialData.config);
  const [sessionConfig, setSessionConfig] = useState<GameConfig>(DEFAULT_GAME_CONFIG);
  const [lastResult, setLastResult] = useState<GameResult | null>(initialData.result);
  const [formError, setFormError] = useState('');
  const [recordsTab, setRecordsTab] = useState<RecordsTab | null>(null);
  const [rankingPage, setRankingPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [pendingMatches, setPendingMatches] = useState(loadPendingMatches);
  const [networkScenario, setNetworkScenarioState] = useState<NetworkScenario>(getNetworkScenario);
  const rankingQuery = useRanking(config, rankingPage, recordsTab === 'ranking');
  const historyQuery = useMatchHistory(PLAYER_ID, historyPage, recordsTab === 'history');
  const registerMutation = useRegisterMatch();
  const activeRecordsQuery = recordsTab === 'history' ? historyQuery : rankingQuery;

  const updatePendingMatches = () => setPendingMatches(loadPendingMatches());

  const submitMatch = (result: GameResult) => {
    queueMatch(result);
    updatePendingMatches();
    registerMutation.mutate(result, { onSettled: updatePendingMatches });
  };

  const retryPendingMatches = async () => {
    for (const result of loadPendingMatches()) {
      try {
        await registerMutation.mutateAsync(result);
      } catch {
        updatePendingMatches();
        return;
      }
    }
    updatePendingMatches();
  };

  const openRecordsTab = (tab: RecordsTab) => {
    const nextTab = recordsTab === tab ? null : tab;
    setRecordsTab(nextTab);
    if (nextTab === 'ranking') {
      setRankingPage(1);
      void rankingQuery.refetch();
    } else if (nextTab === 'history') {
      setHistoryPage(1);
      void historyQuery.refetch();
    }
  };

  const chooseNetworkScenario = (scenario: NetworkScenario) => {
    setNetworkScenario(scenario);
    setNetworkScenarioState(scenario);
    void rankingQuery.refetch();
    void historyQuery.refetch();
  };

  const resetNetworkData = () => {
    resetMockApiData();
    clearMatchOutbox();
    updatePendingMatches();
    setNetworkScenarioState('success');
  };

  const startGame = () => {
    setSessionConfig(structuredClone(config));
    setScreen('game');
  };

  const completeGame = (result: GameResult) => {
    saveLastResult(result);
    setLastResult(result);
    submitMatch(result);
    setScreen('result');
  };

  const saveOptions = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draftConfig.sessionDuration < 60 || draftConfig.sessionDuration > 180) {
      setFormError('Session time must be between 60 and 180 seconds.');
      return;
    }
    if (draftConfig.enemySpawnInterval < 1 || draftConfig.enemySpawnInterval > 10) {
      setFormError('Enemy spawn time must be between 1 and 10 seconds.');
      return;
    }
    savePlayerConfig(draftConfig);
    setConfig(draftConfig);
    setFormError('');
    setScreen('menu');
  };

  if (screen === 'game') {
    return (
      <Suspense fallback={<main className="game-page"><p role="status">Loading game systems…</p></main>}>
        <GameScreen config={sessionConfig} onComplete={completeGame} onAbandon={() => setScreen('menu')} />
      </Suspense>
    );
  }

  if (screen === 'options') {
    return (
      <main className="menu-page">
        <div className="menu-shell">
          <header className="menu-header"><span className="game-brand">PIRATE <strong>BATTLE</strong></span><span className="menu-kicker">CAPTAIN'S LOG / SETTINGS</span></header>
          <section className="options-panel" aria-labelledby="options-title">
            <p className="eyebrow">PREPARE YOUR VOYAGE</p>
            <h1 id="options-title">Options</h1>
            <form onSubmit={saveOptions}>
              <label className="setting-row">
                <span><strong>Game session time</strong><small>Active combat duration, in seconds</small></span>
                <span className="number-control"><input aria-label="Game session time" type="number" min="60" max="180" step="1" required value={draftConfig.sessionDuration} onChange={(event) => setDraftConfig({ ...draftConfig, sessionDuration: Number(event.target.value) })} /><small>60–180 sec</small></span>
              </label>
              <label className="setting-row">
                <span><strong>Enemy spawn time</strong><small>Delay between enemy waves</small></span>
                <span className="number-control"><input aria-label="Enemy spawn time" type="number" min="1" max="10" step="0.5" required value={draftConfig.enemySpawnInterval} onChange={(event) => setDraftConfig({ ...draftConfig, enemySpawnInterval: Number(event.target.value) })} /><small>1–10 sec</small></span>
              </label>
              {formError && <p role="alert" className="form-error">{formError}</p>}
              <div className="form-actions">
                <button type="button" className="text-button" onClick={() => { setDraftConfig(config); setFormError(''); setScreen('menu'); }}>Cancel</button>
                <button type="submit" className="primary-button">Save options</button>
              </div>
            </form>
          </section>
        </div>
      </main>
    );
  }

  if (screen === 'result' && lastResult) {
    const submissionStatus = getMatchSubmissionStatus(lastResult.matchId);
    const submittingThisResult = registerMutation.isPending && registerMutation.variables?.matchId === lastResult.matchId;
    return (
      <main className="menu-page">
        <div className="menu-shell">
          <header className="menu-header"><span className="game-brand">PIRATE <strong>BATTLE</strong></span><span className="menu-kicker">VOYAGE COMPLETE</span></header>
          <section className="result-panel" aria-labelledby="result-title">
            <p className="eyebrow">SHIP'S LOG / {new Date(lastResult.date).toLocaleDateString()}</p>
            <h1 id="result-title">The voyage is over.</h1>
            <p className="result-total">{lastResult.score}<span> points</span></p>
            <dl className="result-details">
              <div><dt>Time at sea</dt><dd>{formatDuration(lastResult.durationSeconds)}</dd></div>
              <div><dt>Outcome</dt><dd>{lastResult.endReason}</dd></div>
              <div><dt>Record status</dt><dd>{submissionStatus === 'registered' ? 'Recorded in ranking and history' : submittingThisResult ? 'Sending record…' : submissionStatus === 'pending' ? 'Pending upload; saved on this device' : 'Saved on this device only'}</dd></div>
            </dl>
            {submissionStatus === 'pending' && <button className="text-button retry-record" onClick={() => submitMatch(lastResult)} disabled={submittingThisResult}>Retry match record</button>}
            <div className="form-actions">
              <button className="text-button" onClick={() => setScreen('menu')}>Main menu</button>
              <button className="primary-button" onClick={startGame}>Play again</button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="menu-page">
      <div className="menu-shell">
        <header className="menu-header"><span className="game-brand">PIRATE <strong>BATTLE</strong></span><span className="menu-kicker">A TOP-DOWN NAVAL SHOOTER</span></header>
        <section className="menu-hero" aria-labelledby="menu-title">
          <div className="hero-copy">
            <p className="eyebrow">UNCHARTED WATERS AHEAD</p>
            <h1 id="menu-title">Set sail.<br /><span>Survive.</span></h1>
            <p className="hero-description">Steer through hostile waters, outmaneuver the fleet, and make every cannon shot count.</p>
            <div className="menu-actions">
              <button className="primary-button" onClick={startGame}>Play <span aria-hidden="true">→</span></button>
              <button className="secondary-button" onClick={() => { setDraftConfig(config); setScreen('options'); }}>Options</button>
            </div>
            <p className="control-summary"><b>W A S D / ARROWS</b> move <span>·</span> <b>SPACE</b> bow cannon <span>·</span> <b>J</b> left broadside <span>·</span> <b>K</b> right broadside</p>
          </div>
          <div className="sea-chart" aria-hidden="true"><div className="chart-ring chart-ring-one" /><div className="chart-ring chart-ring-two" /><span className="chart-mark chart-mark-one">N</span><span className="chart-mark chart-mark-two">40° 12' N</span><div className="chart-island chart-island-one" /><div className="chart-island chart-island-two" /><div className="chart-ship">▲</div><div className="chart-route" /></div>
        </section>
        <nav className="record-tabs" role="tablist" aria-label="Match records">
          <button role="tab" aria-selected={recordsTab === 'ranking'} onClick={() => openRecordsTab('ranking')}>Ranking</button>
          <button role="tab" aria-selected={recordsTab === 'history'} onClick={() => openRecordsTab('history')}>Match History</button>
        </nav>
        {recordsTab && <section className="records-panel" role="tabpanel" aria-label={recordsTab === 'ranking' ? 'Ranking' : 'Match History'}>
          <header className="records-heading">
            <div><p className="eyebrow">{recordsTab === 'ranking' ? 'SAME GAME CONFIGURATION' : 'LOCAL PLAYER'}</p><h2>{recordsTab === 'ranking' ? 'Ranking' : 'Match History'}</h2></div>
            <button className="text-button" onClick={() => { void activeRecordsQuery.refetch(); }} disabled={activeRecordsQuery.isFetching}>Refresh</button>
          </header>
          {activeRecordsQuery.isPending && <p className="records-message" role="status">Loading records…</p>}
          {activeRecordsQuery.isError && <div className="records-error" role="alert"><p>Could not load records. The game remains available.</p><button className="text-button" onClick={() => { void activeRecordsQuery.refetch(); }}>Try again</button></div>}
          {activeRecordsQuery.data && <>
            {activeRecordsQuery.data.items.length === 0
              ? <p className="records-message">No matches on this page yet.</p>
              : <ol className="record-list">{activeRecordsQuery.data.items.map((record, index) => <li key={record.matchId}>
                {recordsTab === 'ranking' && <span className="record-place">{(activeRecordsQuery.data.page - 1) * activeRecordsQuery.data.pageSize + index + 1}</span>}
                <div className="record-player"><strong>{record.playerId}</strong><small>{new Date(record.date).toLocaleDateString()} · {formatDuration(record.durationSeconds)} · {record.endReason}</small></div>
                <strong className="record-score">{record.score} pts</strong>
              </li>)}</ol>}
            <footer className="records-pagination">
              <button className="text-button" onClick={() => recordsTab === 'ranking' ? setRankingPage((page) => Math.max(1, page - 1)) : setHistoryPage((page) => Math.max(1, page - 1))} disabled={activeRecordsQuery.data.page <= 1}>Previous</button>
              <span>Page {activeRecordsQuery.data.page} of {activeRecordsQuery.data.totalPages} · {activeRecordsQuery.data.total} records</span>
              <button className="text-button" onClick={() => recordsTab === 'ranking' ? setRankingPage((page) => Math.min(activeRecordsQuery.data!.totalPages, page + 1)) : setHistoryPage((page) => Math.min(activeRecordsQuery.data!.totalPages, page + 1))} disabled={activeRecordsQuery.data.page >= activeRecordsQuery.data.totalPages}>Next</button>
            </footer>
          </>}
          {activeRecordsQuery.isFetching && !activeRecordsQuery.isPending && <p className="records-refreshing" role="status">Updating records…</p>}
        </section>}
        <section className="captain-log" aria-label="Latest match">
          <div><p className="eyebrow">CAPTAIN'S LOG</p><h2>Latest voyage</h2></div>
          {lastResult ? <p><strong>{lastResult.score} pts</strong><span>{lastResult.endReason} · {formatDuration(lastResult.durationSeconds)}</span></p> : <p><strong>No voyages yet</strong><span>Your last match will appear here.</span></p>}
        </section>
        {pendingMatches.length > 0 && <aside className="pending-notice" role="status">
          <span>{pendingMatches.length} match record{pendingMatches.length === 1 ? '' : 's'} waiting to sync.</span>
          <button className="text-button" onClick={() => { void retryPendingMatches(); }} disabled={registerMutation.isPending}>Retry pending records</button>
        </aside>}
        <section className="network-controls" aria-label="Mock network controls">
          <label htmlFor="network-scenario">Network scenario</label>
          <select id="network-scenario" value={networkScenario} onChange={(event) => chooseNetworkScenario(event.target.value as NetworkScenario)}>
            {NETWORK_SCENARIOS.map((scenario) => <option key={scenario.value} value={scenario.value}>{scenario.label}</option>)}
          </select>
          <button className="text-button" onClick={resetNetworkData}>Reset mock data</button>
        </section>
      </div>
    </main>
  );
}

export default App;