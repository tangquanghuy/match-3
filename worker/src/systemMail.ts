import { hydrateMailbox } from '../../src/meta/systems/mailbox';
import type { MailItem } from '../../src/meta/state/schema';
import type { D1Database } from '@cloudflare/workers-types';

export interface MailReceiver {
  receiveMail(items: MailItem[], playerId: string): Promise<string[]>;
}

export interface SystemMailRow {
  id: string;
  title: string;
  body: string;
  sent_at: number;
  currencies_json: string;
  materials_json: string;
  class_xp: number;
}

export function decodeSystemMail(row: SystemMailRow): MailItem {
  const raw = {
    id: row.id, title: row.title, body: row.body, sentAt: row.sent_at,
    readAt: null, claimedAt: null,
    currencies: JSON.parse(row.currencies_json) as unknown,
    materials: JSON.parse(row.materials_json) as unknown,
    classXp: row.class_xp,
  };
  const mail = hydrateMailbox({ weeklyDoubleVersion: 1, classTrialXpVersion: 1, items: [raw] }).items[0];
  if (!mail || mail.sentAt <= 0) throw new Error(`invalid system mail: ${row.id}`);
  return mail;
}

export async function deliverPendingSystemMail(db: D1Database, receiver: MailReceiver, playerId: string): Promise<void> {
  const { results } = await db.prepare(`
    SELECT campaign.id, campaign.title, campaign.body, campaign.sent_at,
           campaign.currencies_json, campaign.materials_json, campaign.class_xp
    FROM system_mail_recipients AS recipient
    JOIN system_mail_campaigns AS campaign ON campaign.id = recipient.campaign_id
    WHERE recipient.player_id = ? AND recipient.delivered_at IS NULL
    ORDER BY recipient.sent_at, recipient.campaign_id
    LIMIT 100
  `).bind(playerId).all<SystemMailRow>();
  if (!results.length) return;

  const accepted = await receiver.receiveMail(results.map(decodeSystemMail), playerId);
  const pendingIds = new Set(results.map(row => row.id));
  if (accepted.length !== pendingIds.size || accepted.some(id => !pendingIds.delete(id))) {
    throw new Error('system mail receiver acknowledged an unexpected batch');
  }

  await db.batch(accepted.map(id => db.prepare(`
    UPDATE system_mail_recipients SET delivered_at = ?
    WHERE campaign_id = ? AND player_id = ? AND delivered_at IS NULL
  `).bind(Date.now(), id, playerId)));
}
