import type { GameConfig } from '../config/gameConfig';
import type {
  EffectEntity,
  EnemyEntity,
  GameInput,
  GameOverReason,
  GameSnapshot,
  PlayerEntity,
  ProjectileEntity,
} from '../entities/gameEntities';

const FIXED_STEP = 1 / 60;
const PLAYER_RADIUS = 18;
const ENEMY_RADIUS = 18;
const PROJECTILE_RADIUS = 5;

const EMPTY_INPUT: GameInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  fireFront: false,
  firePort: false,
  fireStarboard: false,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function damp(current: number, target: number, responsiveness: number, delta: number) {
  return current + (target - current) * (1 - Math.exp(-responsiveness * delta));
}

function angleDifference(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export class GameSimulation {
  readonly config: GameConfig;
  readonly player: PlayerEntity;
  readonly enemies: EnemyEntity[] = [];
  readonly projectiles: ProjectileEntity[] = [];
  readonly effects: EffectEntity[] = [];

  elapsed = 0;
  score = 0;
  paused = false;
  gameOver: GameOverReason | null = null;

  private input = { ...EMPTY_INPUT };
  private accumulator = 0;
  private spawnElapsed = 0;
  private nextEnemyId = 1;
  private spawnCount = 0;
  private randomState: number;
  private disposed = false;

  constructor(config: GameConfig, seed = 1) {
    this.config = structuredClone(config);
    this.randomState = seed >>> 0;
    this.player = {
      x: config.arena.width / 2,
      y: config.arena.height / 2,
      angle: -Math.PI / 2,
      angularVelocity: 0,
      velocityX: 0,
      velocityY: 0,
      health: config.player.maxHealth,
      frontalCooldown: 0,
      portCooldown: 0,
      starboardCooldown: 0,
    };
  }

  setInput(input: GameInput) {
    this.input = { ...input };
  }

  setPaused(paused: boolean) {
    if (this.gameOver) return;
    this.paused = paused;
    if (paused) this.input = { ...EMPTY_INPUT };
  }

  update(deltaMilliseconds: number) {
    if (this.disposed || this.paused || this.gameOver) return;

    this.accumulator += Math.max(0, deltaMilliseconds) / 1000;
    while (this.accumulator >= FIXED_STEP && !this.gameOver) {
      this.step(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
    }
  }

  snapshot(): GameSnapshot {
    return {
      elapsed: this.elapsed,
      remaining: Math.max(0, this.config.sessionDuration - this.elapsed),
      score: this.score,
      paused: this.paused,
      gameOver: this.gameOver,
      player: this.player,
      enemies: this.enemies,
      projectiles: this.projectiles,
      effects: this.effects,
    };
  }

  dispose() {
    this.disposed = true;
    this.input = { ...EMPTY_INPUT };
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.effects.length = 0;
  }

  private step(delta: number) {
    this.elapsed += delta;
    this.spawnElapsed += delta;
    this.player.frontalCooldown = Math.max(0, this.player.frontalCooldown - delta);
    this.player.portCooldown = Math.max(0, this.player.portCooldown - delta);
    this.player.starboardCooldown = Math.max(0, this.player.starboardCooldown - delta);

    while (this.spawnElapsed >= this.config.enemySpawnInterval) {
      this.spawnElapsed -= this.config.enemySpawnInterval;
      this.spawnEnemy();
    }

    this.updatePlayer(delta);
    this.updateEnemies(delta);
    this.updateProjectiles(delta);
    this.updateEffects(delta);

    if (this.player.health <= 0) this.gameOver = 'player-destroyed';
    else if (this.elapsed >= this.config.sessionDuration) this.gameOver = 'time';
  }

  private updatePlayer(delta: number) {
    const horizontal = Number(this.input.right) - Number(this.input.left);
    const vertical = Number(this.input.down) - Number(this.input.up);
    const inputLength = Math.hypot(horizontal, vertical);
    const directionX = inputLength > 0 ? horizontal / inputLength : 0;
    const directionY = inputLength > 0 ? vertical / inputLength : 0;

    if (inputLength > 0) {
      this.player.velocityX += directionX * this.config.player.acceleration * delta;
      this.player.velocityY += directionY * this.config.player.acceleration * delta;
    } else {
      const drag = Math.exp(-this.config.player.drag * delta);
      this.player.velocityX *= drag;
      this.player.velocityY *= drag;
    }

    if (inputLength > 0) {
      const targetAngle = Math.atan2(directionY, directionX);
      const targetAngularVelocity = clamp(
        angleDifference(this.player.angle, targetAngle) * this.config.player.rotationResponsiveness,
        -this.config.player.rotationSpeed,
        this.config.player.rotationSpeed,
      );
      this.player.angularVelocity = damp(
        this.player.angularVelocity,
        targetAngularVelocity,
        this.config.player.rotationResponsiveness,
        delta,
      );
    } else {
      this.player.angularVelocity = damp(this.player.angularVelocity, 0, this.config.player.rotationResponsiveness, delta);
    }
    this.player.angle += this.player.angularVelocity * delta;

    this.moveWithCollision(this.player, this.player.velocityX * delta, this.player.velocityY * delta, PLAYER_RADIUS);

    if (this.input.fireFront && this.player.frontalCooldown === 0) {
      this.fire(
        'player',
        this.player.x + Math.cos(this.player.angle) * 24,
        this.player.y + Math.sin(this.player.angle) * 24,
        this.player.angle,
        this.config.weapons.frontalDamage,
      );
      this.player.frontalCooldown = this.config.weapons.frontalCooldown;
    }

    if (this.input.firePort && this.player.portCooldown === 0) {
      this.fireBroadside(-1);
      this.player.portCooldown = this.config.weapons.lateralCooldown;
    }

    if (this.input.fireStarboard && this.player.starboardCooldown === 0) {
      this.fireBroadside(1);
      this.player.starboardCooldown = this.config.weapons.lateralCooldown;
    }
  }

  private fireBroadside(side: -1 | 1) {
    const sideAngle = this.player.angle + side * Math.PI / 2;
    const center = (this.config.weapons.lateralProjectileCount - 1) / 2;
    const forwardX = Math.cos(this.player.angle);
    const forwardY = Math.sin(this.player.angle);
    const sideX = Math.cos(sideAngle);
    const sideY = Math.sin(sideAngle);

    for (let index = 0; index < this.config.weapons.lateralProjectileCount; index += 1) {
      const offset = (index - center) * this.config.weapons.lateralSpacing;
      this.fire(
        'player',
        this.player.x + forwardX * offset + sideX * 16,
        this.player.y + forwardY * offset + sideY * 16,
        sideAngle,
        this.config.weapons.lateralDamage,
      );
    }
  }

  private updateEnemies(delta: number) {
    for (const enemy of this.enemies) {
      const deltaX = this.player.x - enemy.x;
      const deltaY = this.player.y - enemy.y;
      const distance = Math.hypot(deltaX, deltaY);
      const targetAngle = Math.atan2(deltaY, deltaX);
      const turnSpeed = enemy.kind === 'chaser' ? this.config.chaser.rotationSpeed : this.config.shooter.rotationSpeed;
      enemy.angle += clamp(angleDifference(enemy.angle, targetAngle), -turnSpeed * delta, turnSpeed * delta);
      enemy.fireCooldown = Math.max(0, enemy.fireCooldown - delta);

      const shouldApproach = enemy.kind === 'chaser' || distance > this.config.shooter.attackRange * 0.72;
      if (shouldApproach) {
        const enemySpeed = enemy.kind === 'chaser' ? this.config.chaser.speed : this.config.shooter.speed;
        this.moveWithCollision(
          enemy,
          Math.cos(enemy.angle) * enemySpeed * delta,
          Math.sin(enemy.angle) * enemySpeed * delta,
          ENEMY_RADIUS,
        );
      }

      if (enemy.kind === 'shooter' && distance <= this.config.shooter.attackRange && enemy.fireCooldown === 0) {
        this.fire(
          'enemy',
          enemy.x + Math.cos(enemy.angle) * 22,
          enemy.y + Math.sin(enemy.angle) * 22,
          enemy.angle,
          this.config.shooter.projectileDamage,
        );
        enemy.fireCooldown = this.config.shooter.attackCooldown;
      }

      if (enemy.kind === 'chaser' && distance <= PLAYER_RADIUS + ENEMY_RADIUS) {
        this.player.health = Math.max(0, this.player.health - this.config.chaser.collisionDamage);
        enemy.health = 0;
        this.explode(enemy.x, enemy.y, 0xff875d);
      }
    }

    this.removeDestroyedEnemies();
  }

  private updateProjectiles(delta: number) {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      projectile.x += projectile.velocityX * delta;
      projectile.y += projectile.velocityY * delta;
      projectile.lifetime -= delta;

      if (
        projectile.lifetime <= 0 ||
        projectile.x < 0 || projectile.x > this.config.arena.width ||
        projectile.y < 0 || projectile.y > this.config.arena.height ||
        this.collidesWithIsland(projectile.x, projectile.y, PROJECTILE_RADIUS)
      ) {
        this.projectiles.splice(index, 1);
        continue;
      }

      if (projectile.team === 'player') {
        const target = this.enemies.find((enemy) =>
          enemy.health > 0 && Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y) <= ENEMY_RADIUS,
        );
        if (target) {
          target.health = Math.max(0, target.health - projectile.damage);
          this.explode(projectile.x, projectile.y, 0xffce70);
          if (target.health === 0) this.score += 1;
          this.projectiles.splice(index, 1);
        }
      } else if (Math.hypot(this.player.x - projectile.x, this.player.y - projectile.y) <= PLAYER_RADIUS) {
        this.player.health = Math.max(0, this.player.health - projectile.damage);
        this.explode(projectile.x, projectile.y, 0xff725e);
        this.projectiles.splice(index, 1);
      }
    }

    this.removeDestroyedEnemies();
  }

  private updateEffects(delta: number) {
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      this.effects[index].lifetime -= delta;
      if (this.effects[index].lifetime <= 0) this.effects.splice(index, 1);
    }
  }

  private spawnEnemy() {
    const kind = this.spawnCount < 2
      ? (this.spawnCount === 0 ? 'chaser' : 'shooter')
      : this.random() < this.config.spawning.chaserChance ? 'chaser' : 'shooter';

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const edge = Math.floor(this.random() * 4);
      const point = edge === 0
        ? { x: 32 + this.random() * (this.config.arena.width - 64), y: 24 }
        : edge === 1
          ? { x: this.config.arena.width - 24, y: 32 + this.random() * (this.config.arena.height - 64) }
          : edge === 2
            ? { x: 32 + this.random() * (this.config.arena.width - 64), y: this.config.arena.height - 24 }
            : { x: 24, y: 32 + this.random() * (this.config.arena.height - 64) };

      if (
        Math.hypot(point.x - this.player.x, point.y - this.player.y) >= this.config.spawning.safeDistance &&
        !this.collidesWithIsland(point.x, point.y, ENEMY_RADIUS)
      ) {
        this.enemies.push({
          ...point,
          id: this.nextEnemyId++,
          kind,
          angle: Math.atan2(this.player.y - point.y, this.player.x - point.x),
          health: kind === 'chaser' ? this.config.chaser.maxHealth : this.config.shooter.maxHealth,
          fireCooldown: 0.8,
        });
        this.spawnCount += 1;
        return;
      }
    }
  }

  private fire(team: ProjectileEntity['team'], x: number, y: number, angle: number, damage: number) {
    this.projectiles.push({
      x,
      y,
      velocityX: Math.cos(angle) * this.config.projectile.speed,
      velocityY: Math.sin(angle) * this.config.projectile.speed,
      damage,
      lifetime: this.config.projectile.lifetime,
      team,
    });
  }

  private moveWithCollision(entity: { x: number; y: number }, offsetX: number, offsetY: number, radius: number) {
    const nextX = clamp(entity.x + offsetX, radius, this.config.arena.width - radius);
    if (!this.collidesWithIsland(nextX, entity.y, radius)) entity.x = nextX;
    else if ('velocityX' in entity) entity.velocityX = 0;

    const nextY = clamp(entity.y + offsetY, radius, this.config.arena.height - radius);
    if (!this.collidesWithIsland(entity.x, nextY, radius)) entity.y = nextY;
    else if ('velocityY' in entity) entity.velocityY = 0;
  }

  private collidesWithIsland(x: number, y: number, radius: number) {
    return this.config.arena.islands.some((island) =>
      Math.hypot(x - island.x, y - island.y) < island.radius + radius,
    );
  }

  private removeDestroyedEnemies() {
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      if (this.enemies[index].health <= 0) this.enemies.splice(index, 1);
    }
  }

  private explode(x: number, y: number, color: number) {
    this.effects.push({ x, y, lifetime: 0.22, maxLifetime: 0.22, color });
  }

  private random() {
    this.randomState += 0x6d2b79f5;
    let value = this.randomState;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  }
}