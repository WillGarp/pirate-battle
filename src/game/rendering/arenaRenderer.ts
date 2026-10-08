import { Graphics } from 'pixi.js';
import type { GameConfig } from '../config/gameConfig';
import type { GameSnapshot, Point } from '../entities/gameEntities';

export function createArenaBackground(config: GameConfig) {
  const { width, height, islands } = config.arena;
  const background = new Graphics();
  background.rect(0, 0, width, height).fill(0x0d5868);

  for (let y = 28; y < height; y += 48) {
    background.moveTo(0, y).lineTo(width, y).stroke({ color: 0x78b3ae, alpha: 0.12, width: 1 });
    background.moveTo(0, y + 16).lineTo(width, y + 16).stroke({ color: 0x051f2b, alpha: 0.07, width: 1 });
  }

  for (const island of islands) {
    background.circle(island.x + 9, island.y + 15, island.radius + 5).fill({ color: 0x041e29, alpha: 0.35 });
    background.circle(island.x, island.y, island.radius).fill(0xb89966);
    background.circle(island.x - 5, island.y - 8, island.radius * 0.82).fill(0x486f55);
    background.circle(island.x - island.radius * 0.25, island.y - island.radius * 0.28, island.radius * 0.3)
      .fill({ color: 0x78905a, alpha: 0.75 });
  }

  return background;
}

export function drawBattleEntities(graphics: Graphics, snapshot: GameSnapshot, config: GameConfig) {
  graphics.clear();

  for (const projectile of snapshot.projectiles) {
    const color = projectile.team === 'player' ? 0xffdb79 : 0xff755f;
    graphics.circle(projectile.x, projectile.y, 5).fill(color);
    graphics.circle(projectile.x, projectile.y, 9).fill({ color, alpha: 0.14 });
  }

  for (const effect of snapshot.effects) {
    const progress = 1 - effect.lifetime / effect.maxLifetime;
    graphics.circle(effect.x, effect.y, 7 + progress * 28)
      .stroke({ color: effect.color, alpha: 1 - progress, width: 3 - progress * 2 });
  }

  for (const enemy of snapshot.enemies) {
    const maxHealth = enemy.kind === 'chaser' ? config.chaser.maxHealth : config.shooter.maxHealth;
    const color = enemy.kind === 'chaser' ? 0xe9755c : 0xd8a45d;
    drawShip(graphics, enemy, enemy.angle, enemy.health, maxHealth, color);
  }

  drawShip(graphics, snapshot.player, snapshot.player.angle, snapshot.player.health, config.player.maxHealth, 0xe9e2cd);
}

function drawShip(graphics: Graphics, point: Point, angle: number, health: number, maxHealth: number, color: number) {
  const visualAngle = angle + Math.PI / 2;
  const hullPoints = [[0, -23], [13, 10], [8, 17], [-8, 17], [-13, 10]];
  const points = hullPoints.flatMap(([localX, localY]) => [
    point.x + localX * Math.cos(visualAngle) - localY * Math.sin(visualAngle),
    point.y + localX * Math.sin(visualAngle) + localY * Math.cos(visualAngle),
  ]);

  graphics.poly(points).fill(color).stroke({ color: 0x10282d, width: 2, alpha: 0.9 });
  graphics.circle(point.x, point.y, 4).fill(0x243d3b);
  graphics.circle(point.x + Math.cos(angle) * 16, point.y + Math.sin(angle) * 16, 3).fill(0xffd16a);

  const ratio = Math.max(0, Math.min(1, health / maxHealth));
  const barY = point.y - 35;
  graphics.roundRect(point.x - 20, barY, 40, 5, 2).fill(0x10282d);
  graphics.roundRect(point.x - 19, barY + 1, 38 * ratio, 3, 1)
    .fill(ratio > 0.4 ? 0x9cce77 : 0xe9755c);
}