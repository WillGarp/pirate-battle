export interface Point {
  x: number;
  y: number;
}

export type EnemyKind = 'chaser' | 'shooter';
export type ProjectileTeam = 'player' | 'enemy';

export interface PlayerEntity extends Point {
  angle: number;
  angularVelocity: number;
  velocityX: number;
  velocityY: number;
  health: number;
  frontalCooldown: number;
  portCooldown: number;
  starboardCooldown: number;
}

export interface EnemyEntity extends Point {
  id: number;
  kind: EnemyKind;
  angle: number;
  health: number;
  fireCooldown: number;
}

export interface ProjectileEntity extends Point {
  velocityX: number;
  velocityY: number;
  damage: number;
  lifetime: number;
  team: ProjectileTeam;
}

export interface EffectEntity extends Point {
  lifetime: number;
  maxLifetime: number;
  color: number;
}

export interface GameInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  fireFront: boolean;
  firePort: boolean;
  fireStarboard: boolean;
}

export type GameOverReason = 'time' | 'player-destroyed';

export interface GameSnapshot {
  elapsed: number;
  remaining: number;
  score: number;
  paused: boolean;
  gameOver: GameOverReason | null;
  player: PlayerEntity;
  enemies: EnemyEntity[];
  projectiles: ProjectileEntity[];
  effects: EffectEntity[];
}