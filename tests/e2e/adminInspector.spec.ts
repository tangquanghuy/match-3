import { expect, test } from '@playwright/test';
import { adminPage } from '../../worker/src/adminPage';

const playerId = '7b4715d7-5d72-4950-aed5-a88f6834532b';

test('admin dashboard shows login/write overview and drills down to one player without using gameplay', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/admin-inspector-fixture', route => route.fulfill({ contentType: 'text/html', body: adminPage.replaceAll('__ADMIN_NONCE__', 'fixture') }));
  await page.route('**/api/admin/**', async route => {
    const req = route.request(); requests.push(req.url());
    expect(req.headers().authorization).toBe('Bearer ' + 'a'.repeat(64));
    const body = req.url().endsWith('/traffic') ? { inspectedAt: Date.now(), pages: { '/': { total: 24, recent: 6 }, '/game': { total: 10, recent: 3 } }, currentPlayers: 1, activePlayers24h: 1, activeMs24h: 60000, leaderboard: [{ player_id: playerId, username: '<img src=x>', total_ms: 60000, last_seen: Date.now() }] } : req.url().includes('/traffic/player/') ? { presence: { total_ms: 60000, last_seen: Date.now(), active: 1 }, hours: [{ hour_start: 3600000, active_ms: 60000 }] } : req.url().endsWith('/overview') ? {
      inspectedAt: Date.now(), accounts: { total: 30, loggedIn24h: 6 }, writes: { players: 2, count: 9, bytes: 5120 },
      leaderboard: [{ player_id: playerId, username: '<img src=x>', writes_24h: 9, payload_bytes_24h: 5120,
        mirror_writes_24h: 4, defense_writes_24h: 3, weekly_writes_24h: 1, snapshot_writes_24h: 1 }],
      recentLogins: [{ player_id: playerId, username: '<img src=x>', last_login_at: Date.now() }],
    } : req.url().includes('/writes/') ? { account: { player_id: playerId, username: '<img src=x>' },
      hours: [{ hour_start: 3600000, writes: 9, bytes: 5120, mirror: 4, defense: 3, weekly: 1, snapshot: 1 }] } : {
      account: { player_id: playerId, username: '<img src=x>', created_at: 100, last_login_at: Date.now() },
      save: null, systemMail: [], inspectedAt: Date.now(),
    };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/admin-inspector-fixture');
  await expect(page.locator('#panel')).toBeHidden();
  await page.locator('#token').fill('a'.repeat(64));
  await page.locator('#login button').click();
  await expect(page.locator('#overviewSummary .card').first()).toContainText('30');
  await expect(page.locator('#overviewSummary .card').nth(3)).toContainText('9');
  await expect(page.locator('#writeLeaders tr')).toHaveCount(1);
  await expect(page.locator('#writeLeaders img')).toHaveCount(0);
  await page.locator('#writeLeaders button').click();
  await expect(page.locator('#name')).toContainText(playerId);
  await expect(page.locator('#writeSummary .card').nth(1)).toContainText('9');
  await expect(page.locator('#writeHours tr')).toHaveCount(1);
  await expect(page.locator('#trafficSummary')).toContainText('24');
  await expect(page.locator('#playerTrafficSummary')).toContainText('60');
  expect(requests).toHaveLength(5);
  expect(requests.every(url => url.includes('/api/admin/'))).toBe(true);
});
