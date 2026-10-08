import { useEffect, useRef, useState } from 'react';
import { Application, Graphics } from 'pixi.js';
import { DEFAULT_GAME_CONFIG, type GameConfig } from '../../game/config/gameConfig';
import { GameSimulation } from '../../game/core/gameSimulation';
import type { GameInput, GameOverReason } from '../../game/entities/gameEntities';
import { createArenaBackground, drawBattleEntities } from '../../game/rendering/arenaRenderer';
import type { GameResult } from '../../types/gameResult';
import type { GameSnapshot } from '../../game/entities/gameEntities';

declare global {
  interface Window {
    __PIRATE_BATTLE_TEST__?: boolean;
    __PIRATE_BATTLE__?: { snapshot: () => GameSnapshot };
  }
}

type GameStatus = 'loading' | 'playing' | 'paused' | 'over' | 'error';
type Command = keyof GameInput;

interface GameScreenProps {
  config?: GameConfig;
  seed?: number;
  onComplete?: (result: GameResult) => void;
  onAbandon?: () => void;
}

const KEY_COMMANDS: Record<string, Command> = {
  w: 'up', ArrowUp: 'up', s: 'down', ArrowDown: 'down',
  a: 'left', ArrowLeft: 'left', d: 'right', ArrowRight: 'right',
  ' ': 'fireFront', j: 'firePort', k: 'fireStarboard',
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function getEndReason(reason: GameOverReason) {
  return reason === 'time' ? 'Time expired' : 'Ship destroyed';
}

export function GameScreen({ config = DEFAULT_GAME_CONFIG, seed = 1, onComplete, onAbandon }: GameScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onComplete, onAbandon });
  const [status, setStatus] = useState<GameStatus>('loading');
  const [hud, setHud] = useState({ health: config.player.maxHealth, score: 0, remaining: config.sessionDuration });
  const [endReason, setEndReason] = useState('');

  useEffect(() => {
    callbacksRef.current = { onComplete, onAbandon };
  }, [onComplete, onAbandon]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    const simulation = new GameSimulation(config, seed);
    const dynamicLayer = new Graphics();
    const testHooks = import.meta.env.DEV && window.__PIRATE_BATTLE_TEST__
      ? { snapshot: () => structuredClone(simulation.snapshot()) }
      : undefined;
    if (testHooks) window.__PIRATE_BATTLE__ = testHooks;
    const held = new Set<Command>();
    let cancelled = false;
    let initialized = false;
    let hudElapsed = 0;
    let resultSent = false;
    let discardNextFrame = false;

    const updateInput = () => {
      const input: GameInput = {
        up: held.has('up'),
        down: held.has('down'),
        left: held.has('left'),
        right: held.has('right'),
        fireFront: held.has('fireFront'),
        firePort: held.has('firePort'),
        fireStarboard: held.has('fireStarboard'),
      };
      simulation.setInput(input);
    };

    const pause = () => {
      if (simulation.gameOver || simulation.paused) return;
      simulation.setPaused(true);
      held.clear();
      updateInput();
      setStatus('paused');
    };

    const resume = () => {
      if (!simulation.paused || document.hidden) return;
      simulation.setPaused(false);
      discardNextFrame = true;
      setStatus('playing');
    };

    const togglePause = () => simulation.paused ? resume() : pause();

    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        togglePause();
        return;
      }
      const command = KEY_COMMANDS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!command || simulation.paused || simulation.gameOver) return;
      event.preventDefault();
      held.add(command);
      updateInput();
    };

    const keyUp = (event: KeyboardEvent) => {
      const command = KEY_COMMANDS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!command) return;
      held.delete(command);
      updateInput();
    };

    const visibilityChange = () => {
      if (document.hidden) pause();
    };
    const focusLost = () => pause();

    const touchInput = (event: Event) => {
      const detail = (event as CustomEvent<{ command: Command; active: boolean }>).detail;
      if (!detail || simulation.paused || simulation.gameOver) return;
      if (detail.active) held.add(detail.command);
      else held.delete(detail.command);
      updateInput();
    };

    const finish = (reason: GameOverReason) => {
      if (resultSent) return;
      resultSent = true;
      const reasonText = getEndReason(reason);
      setEndReason(reasonText);
      setStatus('over');
      callbacksRef.current.onComplete?.({
        matchId: crypto.randomUUID(),
        playerId: 'local-player',
        date: new Date().toISOString(),
        score: simulation.score,
        durationSeconds: Math.floor(simulation.elapsed),
        endReason: reasonText,
        config: structuredClone(config),
      });
    };

    const initialize = async () => {
      await app.init({
        width: config.arena.width,
        height: config.arena.height,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        antialias: true,
        backgroundColor: 0x0d5868,
      });
      initialized = true;

      if (cancelled) {
        app.destroy(true);
        return;
      }

      app.canvas.style.width = '100%';
      app.canvas.style.height = '100%';
      app.stage.addChild(createArenaBackground(config), dynamicLayer);
      container.appendChild(app.canvas);
      setStatus('playing');

      const tick = (ticker: { deltaMS: number }) => {
        if (discardNextFrame) discardNextFrame = false;
        else simulation.update(ticker.deltaMS);

        const snapshot = simulation.snapshot();
        drawBattleEntities(dynamicLayer, snapshot, config);
        hudElapsed += ticker.deltaMS;
        if (hudElapsed >= 150) {
          hudElapsed = 0;
          setHud({ health: snapshot.player.health, score: snapshot.score, remaining: snapshot.remaining });
        }
        if (snapshot.gameOver) finish(snapshot.gameOver);
      };
      app.ticker.add(tick);

      window.addEventListener('keydown', keyDown);
      window.addEventListener('keyup', keyUp);
      window.addEventListener('blur', focusLost);
      window.addEventListener('pirate-touch', touchInput);
      window.addEventListener('pirate-toggle-pause', togglePause);
      document.addEventListener('visibilitychange', visibilityChange);
      return () => app.ticker.remove(tick);
    };

    let removeTick: (() => void) | undefined;
    void initialize().then((cleanup) => { removeTick = cleanup; }).catch((error: unknown) => {
      if (!cancelled) {
        console.error('Could not initialize the PixiJS arena.', error);
        setEndReason('Arena failed to load');
        setStatus('error');
      }
    });

    return () => {
      cancelled = true;
      removeTick?.();
      held.clear();
      simulation.dispose();
      if (window.__PIRATE_BATTLE__ === testHooks) delete window.__PIRATE_BATTLE__;
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', focusLost);
      window.removeEventListener('pirate-touch', touchInput);
      window.removeEventListener('pirate-toggle-pause', togglePause);
      document.removeEventListener('visibilitychange', visibilityChange);
      if (initialized) app.destroy(true);
    };
  }, [config, seed]);

  const setTouch = (command: Command, active: boolean) => {
    window.dispatchEvent(new CustomEvent('pirate-touch', { detail: { command, active } }));
  };

  return (
    <main className="game-page">
      <header className="game-header">
        <span className="game-brand">PIRATE <strong>BATTLE</strong></span>
        <div className="game-stats" aria-label="Match status">
          <div><span>HULL</span><strong>{hud.health}%</strong></div>
          <div><span>SCORE</span><strong>{hud.score.toString().padStart(3, '0')}</strong></div>
          <div><span>TIME</span><strong>{formatTime(hud.remaining)}</strong></div>
        </div>
        <div className="game-header-actions">
          <button className="abandon-button" onClick={() => callbacksRef.current.onAbandon?.()}>LEAVE</button>
          <button className="pause-button" onClick={() => window.dispatchEvent(new Event('pirate-toggle-pause'))} disabled={status === 'over' || status === 'error'}>
            {status === 'paused' ? 'RESUME' : 'PAUSE'}
          </button>
        </div>
      </header>

      <section className="arena-section" aria-label="Naval combat arena">
        <div className="arena-frame">
          <div className="arena-canvas" ref={containerRef} />
          {(status === 'loading' || status === 'paused' || status === 'over' || status === 'error') && <div className="game-overlay">
            <div className="overlay-panel" role={status === 'paused' || status === 'over' || status === 'error' ? 'dialog' : undefined} aria-modal={status === 'paused' || status === 'over' || status === 'error' ? true : undefined}>
              <p className="eyebrow">{status === 'loading' ? 'LOADING ARENA' : status === 'paused' ? 'PAUSED' : status === 'error' ? 'LOAD ERROR' : 'VOYAGE OVER'}</p>
              <h1>{status === 'loading' ? 'Preparing the fleet…' : status === 'paused' ? 'Catch your breath.' : endReason}</h1>
              {status === 'over' && <p className="result-score">{hud.score}<span> points</span></p>}
              {status === 'paused' && <button onClick={() => window.dispatchEvent(new Event('pirate-toggle-pause'))}>RESUME VOYAGE</button>}
              {status === 'over' && <button onClick={() => window.location.reload()}>PLAY AGAIN</button>}
              {status === 'error' && <button onClick={() => window.location.reload()}>RETRY</button>}
            </div>
          </div>}
        </div>

        <footer className="game-footer">
          <p><b>W A S D / ARROWS</b> move <b>SPACE</b> bow cannon <b>J</b> port / left <b>K</b> starboard / right <b>ESC</b> pause</p>
          <div className="touch-controls" aria-label="Touch controls">
            <div className="touch-pad" aria-label="Move the ship">
              <button className="touch-up" onPointerDown={() => setTouch('up', true)} onPointerUp={() => setTouch('up', false)} onPointerLeave={() => setTouch('up', false)} aria-label="Move up">↑</button>
              <button className="touch-left" onPointerDown={() => setTouch('left', true)} onPointerUp={() => setTouch('left', false)} onPointerLeave={() => setTouch('left', false)} aria-label="Move left">←</button>
              <button className="touch-down" onPointerDown={() => setTouch('down', true)} onPointerUp={() => setTouch('down', false)} onPointerLeave={() => setTouch('down', false)} aria-label="Move down">↓</button>
              <button className="touch-right" onPointerDown={() => setTouch('right', true)} onPointerUp={() => setTouch('right', false)} onPointerLeave={() => setTouch('right', false)} aria-label="Move right">→</button>
            </div>
            <div className="touch-cluster">
              <button onPointerDown={() => setTouch('firePort', true)} onPointerUp={() => setTouch('firePort', false)} onPointerLeave={() => setTouch('firePort', false)} aria-label="Fire port broadside">J</button>
              <button onPointerDown={() => setTouch('fireFront', true)} onPointerUp={() => setTouch('fireFront', false)} onPointerLeave={() => setTouch('fireFront', false)} aria-label="Fire bow cannon">●</button>
              <button onPointerDown={() => setTouch('fireStarboard', true)} onPointerUp={() => setTouch('fireStarboard', false)} onPointerLeave={() => setTouch('fireStarboard', false)} aria-label="Fire starboard broadside">K</button>
            </div>
          </div>
        </footer>
        <p className="screen-reader-status" aria-live="polite">{status === 'playing' ? `Match in progress. ${hud.health} health, ${hud.score} points, ${Math.ceil(hud.remaining)} seconds remaining.` : status === 'paused' ? 'Match paused.' : status === 'over' ? `Match ended: ${endReason}. Score ${hud.score}.` : status === 'error' ? endReason : 'Loading the game arena.'}</p>
      </section>
    </main>
  );
}
