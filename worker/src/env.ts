import type { PlayerActor } from './playerActor';

export interface Env {
  /** 静态资源（客户端构建产物） */
  ASSETS: Fetcher;
  /** 每个玩家一个 Durable Object，名字 = player_id */
  PLAYERS: DurableObjectNamespace<PlayerActor>;
  /** 账号表 + 入侵真人镜像池（invasion_mirrors） */
  DB: D1Database;
  DISCORD_CLIENT_ID: string;
  /** secret：wrangler secret put DISCORD_CLIENT_SECRET */
  DISCORD_CLIENT_SECRET: string;
  /** secret：会话 cookie 的 HMAC 密钥（≥32 字节随机串） */
  SESSION_SECRET: string;
  /** '1' = 本地开发：允许免 Discord 登录与开发者命令。线上必须为空 */
  DEV_LOGIN?: string;
  /** Secret: long random bearer token for read-only admin player inspection. */
  ADMIN_READ_TOKEN?: string;
}
