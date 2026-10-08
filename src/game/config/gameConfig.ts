export interface GameConfig {
  sessionDuration: number;
  enemySpawnInterval: number;

  arena: {
    width: number;
    height: number;
    islands: Array<{ x: number; y: number; radius: number }>;
  };

  player: {
    maxHealth: number;
    speed: number;
    acceleration: number;
    drag: number;
    rotationSpeed: number;
    rotationResponsiveness: number;
  };

  chaser: {
    maxHealth: number;
    speed: number;
    rotationSpeed: number;
    collisionDamage: number;
  };

  shooter: {
    maxHealth: number;
    speed: number;
    rotationSpeed: number;
    attackRange: number;
    attackCooldown: number;
    projectileDamage: number;
  };

  projectile: {
    speed: number;
    lifetime: number;
  };

  weapons: {
    frontalCooldown: number;
    lateralCooldown: number;
    frontalDamage: number;
    lateralDamage: number;
    lateralProjectileCount: number;
    lateralSpacing: number;
  };

  spawning: {
    safeDistance: number;
    chaserChance: number;
  };
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  sessionDuration: 120,
  enemySpawnInterval: 3,

  arena: {
    width: 1600,
    height: 900,
    islands: [
      { x: 300, y: 250, radius: 85 },
      { x: 1080, y: 610, radius: 110 },
      { x: 770, y: 130, radius: 48 },
    ],
  },

  player: {
    maxHealth: 100,
    speed: 180,
    acceleration: 520,
    drag: 2.8,
    rotationSpeed: 3,
    rotationResponsiveness: 9,
  },

  chaser: {
    maxHealth: 30,
    speed: 100,
    rotationSpeed: 2.5,
    collisionDamage: 25,
  },

  shooter: {
    maxHealth: 40,
    speed: 70,
    rotationSpeed: 1.8,
    attackRange: 450,
    attackCooldown: 2,
    projectileDamage: 10,
  },

  projectile: {
    speed: 500,
    lifetime: 1.5,
  },

  weapons: {
    frontalCooldown: 0.4,
    lateralCooldown: 1,
    frontalDamage: 20,
    lateralDamage: 12,
    lateralProjectileCount: 3,
    lateralSpacing: 11,
  },

  spawning: {
    safeDistance: 250,
    chaserChance: 0.55,
  },
};