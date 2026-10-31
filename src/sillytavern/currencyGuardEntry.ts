/**
 * Card script entry for the 通用币 guard. The card's 辅助计算脚本 imports it
 * (`import('<部署地址>/sillytavern-currency-guard.js')`) right after registering its own
 * VARIABLE_UPDATE_ENDED handler, so the guard's update-ended handler runs after MVU_ZOD's and theirs. Runs silently: a hand-edited balance is written back
 * without any prompt.
 */
import { createCurrencyGuard } from './currencyGuard';
import type { GuardMvuData } from './currencyGuard';
import { CURRENCY_GUARD_FLAG } from './currencySeal';

interface MvuApi {
  events: { VARIABLE_UPDATE_STARTED: string; VARIABLE_UPDATE_ENDED: string };
  getMvuData(options: { type: 'message'; message_id: number }): GuardMvuData;
  replaceMvuData(data: GuardMvuData, options: { type: 'message'; message_id: number }): Promise<void>;
  isDuringExtraAnalysis?(): boolean;
}
declare const Mvu: MvuApi;
declare function eventOn(event: string, listener: (...args: never[]) => unknown): unknown;
declare function getLastMessageId(): number;
declare function waitGlobalInitialized(name: string): Promise<void>;
declare const tavern_events: Record<string, string>;

const VERSION = 'currency-guard-v1';
const POLL_MS = 2000;

async function install(): Promise<void> {
  const top = (() => { try { return window.parent ?? window; } catch { return window; } })() as unknown as Record<string, unknown>;
  await waitGlobalInitialized('Mvu');
  // Heartbeat for the 三消 weapon shop: script frames are recreated on card switches, so a plain
  // flag would outlive the guard.
  const beat = () => { top[CURRENCY_GUARD_FLAG] = { version: VERSION, at: Date.now() }; };
  let generating = false;
  const guard = createCurrencyGuard({
    latestId: () => { try { const id = getLastMessageId(); return Number.isInteger(id) ? id : undefined; } catch { return undefined; } },
    read: id => { try { return structuredClone(Mvu.getMvuData({ type: 'message', message_id: id })); } catch { return undefined; } },
    write: (id, data) => Mvu.replaceMvuData(data, { type: 'message', message_id: id }),
    busy: () => generating || !!Mvu.isDuringExtraAnalysis?.(),
    log: message => console.info(message),
  });
  const check = (force = false) => { void guard.checkLatest(force).catch(error => console.warn('[通用币校验] 检查失败', error)); };
  eventOn(Mvu.events.VARIABLE_UPDATE_STARTED, ((variables: GuardMvuData) => guard.onUpdateStarted(variables)) as never);
  eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, ((variables: GuardMvuData) => guard.onUpdateEnded(variables)) as never);
  // The prompt reads the latest floor: put a hand-edited balance back before it is built.
  eventOn(tavern_events.GENERATION_STARTED, (async (_type: string, _options: unknown, dryRun: boolean) => {
    if (!dryRun) generating = true;
    await guard.checkLatest(true).catch(error => console.warn('[通用币校验] 检查失败', error));
  }) as never);
  for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED'])
    if (tavern_events[name]) eventOn(tavern_events[name]!, (() => { generating = false; check(); }) as never);
  if (tavern_events['CHAT_CHANGED']) eventOn(tavern_events['CHAT_CHANGED'], (() => { guard.chatChanged(); check(); }) as never);
  for (const name of ['MESSAGE_DELETED', 'MESSAGE_SWIPED'])
    if (tavern_events[name]) eventOn(tavern_events[name]!, (() => check()) as never);
  setInterval(() => { beat(); check(); }, POLL_MS);
  beat(); check();
}

void install().catch(error => console.warn('[通用币校验] 启动失败', error));
