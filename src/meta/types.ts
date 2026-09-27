/**
 * Meta 层共享类型：统一的结果/错误码与货币词表。
 *
 * 约定（对齐 META-GAME-PLAN.md §3.2）：
 *  - meta/systems 全部是纯逻辑，禁 DOM，随机一律种子化；
 *  - 所有会改存档的操作都返回显式结果对象，失败必须带机器可读 code + 中文文案，
 *    供 UI 层做「校验规则可见」的展示（ASSETS-NEEDED.md §6.3），不许只靠 alert。
 */

/** 货币五件套（裁定③：宝石=抽卡货币，只产出于玩法，无内购；glory=荣耀，入侵 PvP 主产） */
export type CurrencyKey = 'gold' | 'souls' | 'gems' | 'goldKeys' | 'glory' | 'gloryKeys' | 'trophies';

/** 一次消耗/收益的账目（缺省币种 = 不涉及；数值恒为正，方向由操作名决定） */
export type CurrencyDelta = Partial<Record<CurrencyKey, number>>;

/** Meta 层操作失败的机器可读错误码。UI 层据此分流提示与按钮态。 */
export type MetaErrorCode =
  | 'INVALID' // 参数非法（负数、越界、非整数等）
  | 'INSUFFICIENT' // 货币不足
  | 'NOT_OWNED' // 未拥有该部队
  | 'UNKNOWN_TROOP' // troopId 不在 troops.json（悬空引用，对账脚本重点）
  | 'AT_CAP' // 已达当前稀有度等级上限（升阶可提升）
  | 'MAXED' // 升阶已达三阶
  | 'NEED_COPIES' // 同名卡不足
  | 'BAD_SLOT' // 特质槽位号非法
  | 'PREREQ_LOCKED' // 前置特质未解锁 / 职业或武器未达到解锁条件
  | 'ALREADY_UNLOCKED' // 特质已解锁
  | 'LOCKED' // 分解保护中
  | 'NO_TEAM' // 没有可用出战队伍
  | 'SOLD_OUT'; // 活动商店限量货架已售罄（素材批 2026-09-19）

/** 失败结果：code 供程序分支，message 供界面直接展示 */
export interface MetaFailure {
  ok: false;
  code: MetaErrorCode;
  message: string;
}

export function fail(code: MetaErrorCode, message: string): MetaFailure {
  return { ok: false, code, message };
}
