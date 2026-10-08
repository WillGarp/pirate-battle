import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		window.__PIRATE_BATTLE_TEST__ = true;
		if (sessionStorage.getItem('e2e-reset') !== 'done') {
			localStorage.clear();
			sessionStorage.setItem('e2e-reset', 'done');
		}
	});
	await page.goto('/');
	await page.getByRole('button', { name: 'Play' }).waitFor({ timeout: 10_000 }).catch(() => undefined);
});

test('options persist across refresh and apply to a new match', async ({ page }) => {
	await page.getByRole('button', { name: 'Options' }).click();
	await page.getByRole('spinbutton', { name: 'Game session time' }).fill('90');
	await page.getByRole('spinbutton', { name: 'Enemy spawn time' }).fill('2');
	await page.getByRole('button', { name: 'Save options' }).click();
	await page.reload();
	await page.getByRole('button', { name: 'Options' }).click();
	await expect(page.getByRole('spinbutton', { name: 'Game session time' })).toHaveValue('90');
	await expect(page.getByRole('spinbutton', { name: 'Enemy spawn time' })).toHaveValue('2');
	await page.getByRole('button', { name: 'Cancel' }).click();
	await page.getByRole('button', { name: 'Play' }).click();
	await page.locator('canvas').waitFor();
	const timer = await page.locator('.game-stats strong').nth(2).innerText();
	const [minutes, seconds] = timer.split(':').map(Number);
	const remaining = minutes * 60 + seconds;
	expect(remaining).toBeLessThanOrEqual(90);
	expect(remaining).toBeGreaterThanOrEqual(80);
});

test('pause freezes the timer and abandoning does not create a result', async ({ page }) => {
	test.setTimeout(60_000);
	await page.getByRole('button', { name: 'Play' }).click();
	await page.locator('canvas').waitFor();
	await page.getByRole('button', { name: 'PAUSE' }).click();
	await expect(page.locator('.screen-reader-status')).toHaveText('Match paused.');
	const frozenTime = await page.locator('.game-stats strong').nth(2).innerText();
	await page.waitForTimeout(350);
	await expect(page.locator('.game-stats strong').nth(2)).toHaveText(frozenTime);
	await page.getByRole('button', { name: 'RESUME VOYAGE' }).click();
	await expect(page.locator('.screen-reader-status')).toContainText('Match in progress.');
	await page.getByRole('button', { name: 'LEAVE' }).click();
	await expect(page.getByText('No voyages yet')).toBeVisible();
	await page.reload();
	await expect(page.getByText('No voyages yet')).toBeVisible();
});

test('keyboard movement and bow fire mutate the real simulation', async ({ page }) => {
	await page.getByRole('button', { name: 'Play' }).click();
	await page.locator('canvas').waitFor();
	const start = await page.evaluate(() => window.__PIRATE_BATTLE__!.snapshot().player.x);
	await page.keyboard.down('ArrowRight');
	await expect.poll(() => page.evaluate(() => window.__PIRATE_BATTLE__!.snapshot().player.x)).toBeGreaterThan(start + 20);
	await page.keyboard.up('ArrowRight');

	await page.keyboard.down('Space');
	await expect.poll(() => page.evaluate(() => window.__PIRATE_BATTLE__!.snapshot().projectiles.some((projectile) => projectile.team === 'player'))).toBe(true);
	await page.keyboard.up('Space');
});

test('bow fires one shot while port and starboard broadsides fire three separated shots in opposite directions', async ({ page }) => {
	await page.getByRole('button', { name: 'Play' }).click();
	await page.locator('canvas').waitFor();

	await page.keyboard.down('Space');
	await expect.poll(() => page.evaluate(() =>
		window.__PIRATE_BATTLE__!.snapshot().projectiles.filter((shot) => shot.team === 'player').length,
	)).toBe(1);
	await page.keyboard.up('Space');

	await page.keyboard.down('j');
	await expect.poll(() => page.evaluate(() =>
		window.__PIRATE_BATTLE__!.snapshot().projectiles.filter((shot) => shot.team === 'player' && shot.velocityX < 0).length,
	)).toBe(3);
	await page.keyboard.up('j');

	const portShots = await page.evaluate(() => window.__PIRATE_BATTLE__!.snapshot().projectiles
		.filter((shot) => shot.team === 'player' && shot.velocityX < 0)
		.map((shot) => ({ x: shot.x, y: shot.y })));
	expect(new Set(portShots.map((shot) => shot.y)).size).toBe(3);

	await page.keyboard.down('k');
	await expect.poll(() => page.evaluate(() =>
		window.__PIRATE_BATTLE__!.snapshot().projectiles.filter((shot) => shot.team === 'player' && shot.velocityX > 0).length,
	)).toBe(3);
	await page.keyboard.up('k');

	const starboardShots = await page.evaluate(() => window.__PIRATE_BATTLE__!.snapshot().projectiles
		.filter((shot) => shot.team === 'player' && shot.velocityX > 0)
		.map((shot) => ({ x: shot.x, y: shot.y })));
	expect(new Set(starboardShots.map((shot) => shot.y)).size).toBe(3);
});

test('ranking and history paginate and expose empty/error states', async ({ page }) => {
	await page.getByRole('tab', { name: 'Ranking' }).click();
	await expect(page.getByText('Captain Morgan')).toBeVisible();
	await expect(page.locator('.records-pagination')).toContainText('Page 1 of 2');
	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.getByText('Mary Read')).toBeVisible();

	await page.getByLabel('Network scenario').selectOption('empty');
	await expect(page.getByText('No matches on this page yet.')).toBeVisible();
	await page.getByLabel('Network scenario').selectOption('success');
	await page.getByRole('tab', { name: 'Match History' }).click();
	await expect(page.locator('.record-list')).toContainText('local-player');
	await page.getByLabel('Network scenario').selectOption('history-error');
	await expect(page.getByRole('alert')).toContainText('Could not load records');
	await page.getByLabel('Network scenario').selectOption('success');
	await expect(page.locator('.record-list')).toContainText('local-player');
});

test('post-save timeout retry recovers the existing record without duplication', async ({ page }) => {
	await page.getByLabel('Network scenario').selectOption('register-timeout-once');
	const response = await page.evaluate(async () => {
		const { DEFAULT_GAME_CONFIG } = await import('/src/game/config/gameConfig.ts');
		const match = {
			matchId: 'e2e-timeout-once',
			playerId: 'local-player',
			date: '2026-10-01T12:00:00.000Z',
			score: 88,
			durationSeconds: 74,
			endReason: 'Ship destroyed',
			config: DEFAULT_GAME_CONFIG,
		};
		const submit = () => fetch('/api/matches', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Idempotency-Key': match.matchId },
			body: JSON.stringify(match),
		});
		const first = await submit();
		const retry = await submit();
		return { firstStatus: first.status, retryStatus: retry.status, retry: await retry.json() };
	});
	expect(response.firstStatus).toBe(504);
	expect(response.retryStatus).toBe(200);
	expect(response.retry.duplicate).toBe(true);

	await page.getByLabel('Network scenario').selectOption('success');
	await page.getByRole('tab', { name: 'Ranking' }).click();
	await expect(page.getByText('88 pts')).toBeVisible();
	await expect(page.locator('.records-pagination')).toContainText('8 records');
});

test('mobile exposes all directions and shooting controls without canvas clipping', async ({ page, isMobile }) => {
	test.skip(!isMobile, 'Touch layout is covered by the mobile Chromium project.');
	await page.getByRole('button', { name: 'Play' }).click();
	await page.locator('canvas').waitFor();
	for (const name of ['Move up', 'Move down', 'Move left', 'Move right', 'Fire bow cannon']) {
		await expect(page.getByRole('button', { name })).toBeVisible();
	}
	const canvas = await page.locator('canvas').boundingBox();
	const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
	expect(canvas).not.toBeNull();
	expect(canvas!.x).toBeGreaterThanOrEqual(0);
	expect(canvas!.x + canvas!.width).toBeLessThanOrEqual(viewportWidth);
});

test('menu, stable paused arena, and result match their visual baselines', async ({ page }) => {
	await expect(page).toHaveScreenshot('menu.png', { animations: 'disabled', maxDiffPixelRatio: 0.01 });

	await page.getByRole('button', { name: 'Play' }).click();
	await page.locator('canvas').waitFor();
	await page.getByRole('button', { name: 'PAUSE' }).click();
	await expect(page).toHaveScreenshot('arena-paused.png', { animations: 'disabled', maxDiffPixelRatio: 0.01 });
	await page.getByRole('button', { name: 'LEAVE' }).click();
	await page.getByRole('heading', { name: 'Set sail. Survive.' }).waitFor();

	await page.evaluate(() => {
		localStorage.setItem('pirate-battle.last-result.v1', JSON.stringify({
			matchId: 'visual-result',
			playerId: 'local-player',
			date: '2026-10-01T12:00:00.000Z',
			score: 12,
			durationSeconds: 83,
			endReason: 'Ship destroyed',
			config: {
				sessionDuration: 120,
				enemySpawnInterval: 3,
				arena: { width: 1600, height: 900, islands: [{ x: 300, y: 250, radius: 85 }, { x: 1080, y: 610, radius: 110 }, { x: 770, y: 130, radius: 48 }] },
				player: { maxHealth: 100, speed: 180, acceleration: 520, drag: 2.8, rotationSpeed: 3, rotationResponsiveness: 9 },
				chaser: { maxHealth: 30, speed: 100, rotationSpeed: 2.5, collisionDamage: 25 },
				shooter: { maxHealth: 40, speed: 70, rotationSpeed: 1.8, attackRange: 450, attackCooldown: 2, projectileDamage: 10 },
				projectile: { speed: 500, lifetime: 1.5 },
				weapons: { frontalCooldown: 0.4, lateralCooldown: 1, frontalDamage: 20, lateralDamage: 12, lateralProjectileCount: 3, lateralSpacing: 11 },
				spawning: { safeDistance: 250, chaserChance: 0.55 },
			},
		}));
	});
	await page.reload();
	await page.getByRole('heading', { name: 'The voyage is over.' }).waitFor();
	await expect(page).toHaveScreenshot('result.png', { animations: 'disabled', maxDiffPixelRatio: 0.01 });
});
