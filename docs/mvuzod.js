import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

// --- 工具函数 ---

// 布尔值预处理器，将"是"转换为true
const boolPreprocess = (defaultVal = false) => z.preprocess(
    v => 'string' == typeof v ? '是' === v : v,
    z.boolean()
).prefault(defaultVal);

// 数字范围限制器
const clampNum = (defaultVal, min, max) => z.coerce.number()
    .prefault(defaultVal)
    .transform(v => _.clamp(v, min, max));

// 字符串默认值工具
const str = (val = '') => z.string().prefault(val);

// 品质名称兼容：旧值“神器”允许输入，但进入变量结构后统一写为“卓越”
const normalizeQualityName = value => value === '神器' ? '卓越' : value;
const COC_SAN_COST_BY_QUALITY = Object.freeze({
    普通: 2,
    精良: 4,
    稀有: 6,
    卓越: 8,
    传说: 10,
    史诗: 12,
    神话: 15
});
const qualityStr = (val = '普通') => str(val).transform(normalizeQualityName);

// 宽容输入工具：旧档字段类型不匹配时回退到安全默认值
const isPlainObject = v => !!v && 'object' === typeof v && !Array.isArray(v);
const safeStr = (val = '') => z.preprocess(v => 'string' === typeof v ? v : val, z.string());
const safeNum = (val = 0) => z.preprocess(v => {
    if ('number' === typeof v) return Number.isFinite(v) ? v : val;
    if ('string' === typeof v) {
        const trimmed = v.trim();
        if (!trimmed) return val;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : val;
    }
    return val;
}, z.number());
const safeStrArray = (val = []) => z.preprocess(
    v => Array.isArray(v) ? v.filter(item => 'string' === typeof item) : val,
    z.array(z.string())
);

// --- D&D 5e 六维属性基础 ---
const dndStats = {
    力量: 10,
    敏捷: 10,
    体质: 10,
    智力: 10,
    感知: 10,
    魅力: 10
};

// --- DNF 装备品质枚举 ---
const qualityEnum = z.preprocess(
    normalizeQualityName,
    z.enum(['普通', '精良', '稀有', '卓越', '传说', '史诗', '神话']).prefault('普通')
);

// --- 技能阶位枚举 ---
const skillTierEnum = z.enum(['基础', '转职', '进阶', '必杀', '奥义', '觉醒一', '觉醒二', '觉醒三']);
const combatValueModeSchema = z.preprocess(
    v => (v === 'new' || v === '新版') ? 'new' : 'classic',
    z.enum(['classic', 'new']).prefault('classic')
);
const difficultyKeySchema = z.preprocess(v => {
    const labelMap = { '简单': 'easy', '普通': 'normal', '困难': 'hard', '王者': 'king', '噩梦': 'nightmare', '自定义': 'custom' };
    const key = labelMap[v] || v;
    return ['easy', 'normal', 'hard', 'king', 'nightmare', 'custom'].includes(key) ? key : 'custom';
}, z.enum(['easy', 'normal', 'hard', 'king', 'nightmare', 'custom']).prefault('custom'));

// --- 熟练度阶位枚举 ---
const profTierEnum = z.enum(['学徒', '熟手', '专家', '大师', '传奇']).prefault('学徒');

// --- 单条熟练度 Schema ---
// 战斗类按武器种类(剑术/枪术/弓术/钝器/短刃/格斗/法器等)
// 生活类按行业方向(锻造/炼金/工程/烹饪/裁缝等)
const proficiencySchema = z.object({
    阶位: profTierEnum,
    进度: z.coerce.number().prefault(0),
    升阶阈值: z.coerce.number().prefault(100),
    效果: str('')
});

// --- 单个技能 Schema ---
const skillSchema = z.object({
    名称: str(''),
    类型: z.enum(['主动', '召唤', '特殊', '职业特殊']).prefault('主动'),
    阶位: skillTierEnum.prefault('基础'),
    描述: str(''),
    召唤物名称: str('').optional(),
    特殊效果: z.record(z.string(), z.string()).prefault({ '无': '' }),
    习得等级: z.coerce.number().prefault(1),
    等级上限: z.coerce.number().prefault(15),
    SP消耗: z.coerce.number().prefault(10),
    冷却: z.coerce.number().prefault(0),
    伤害倍率: z.coerce.number().prefault(0),
    当前等级: clampNum(0, 0, 30),
    冷却计数: z.coerce.number().prefault(0),
    是否装备: boolPreprocess(false),
    组合模式启用: boolPreprocess(false)
});

// --- 装备槽技能 Schema（精简版，用于战斗） ---
const equippedSkillSchema = z.object({
    名称: str(''),
    类型: z.enum(['主动', '召唤', '特殊', '职业特殊']).prefault('主动'),
    技能等级: z.coerce.number().prefault(1),
    冷却中: boolPreprocess(false),
    伤害倍率: z.coerce.number().prefault(0),
    伤害成长值: z.coerce.number().optional(),
    伤害倍率版本: z.coerce.number().optional(),
    阶位: skillTierEnum.prefault('基础'),
    召唤物名称: str('').optional(),
    特殊效果: z.record(z.string(), z.string()).prefault({ '无': '' }),
    描述: str('')
});

// --- 召唤物 Schema（单体/集群统一） ---
const summonSchema = z.object({
    名称: str(''),
    HP: z.coerce.number().prefault(1),
    HP上限: z.coerce.number().prefault(1),
    AC: z.coerce.number().prefault(10),
    技能倍率: str(''),
    持续时间: str('永久')
});

// --- 连携奥义装备槽 Schema ---
const comboSlotSchema = z.object({
    伙伴: str(''),
    技能名: str(''),
    类型: str(''),
    效果: str(''),
    描述: str('')
}).prefault({});

// --- 完整技能树 Schema ---
const skillTreeSchema = z.object({
    技能列表: z.record(z.string(), skillSchema).prefault({}),
    总SP: z.coerce.number().prefault(0),
    已使用SP: z.coerce.number().prefault(0)
}).prefault({});

// --- 组合技能配置 Schema ---
const comboSlotArraySchema = z.tuple([str(''), str(''), str('')]).prefault(['', '', '']);
const comboGroupConfigSchema = z.object({
    alpha: comboSlotArraySchema,
    beta: comboSlotArraySchema,
    gamma: comboSlotArraySchema,
    ultimate: comboSlotArraySchema
}).prefault({});
const comboSkillStateSchema = z.object({
    当前高级组: z.enum(['alpha', 'beta', 'gamma']).prefault('alpha'),
    当前显示槽: z.enum(['advanced', 'ultimate']).prefault('advanced'),
    custom: boolPreprocess(false),
    基础技能槽: comboSlotArraySchema,
    转职技能槽: comboSlotArraySchema,
    高级技能组配置: comboGroupConfigSchema
}).prefault({});

// --- 资源技能 Schema ---
// 用于记录随短休/长休/自定义条件恢复的功能型技能资源
const resourceSkillSchema = z.object({
    品质: qualityStr('普通'),
    阶位: z.preprocess(v => typeof v === 'string' ? parseInt(v, 10) : v,
        z.coerce.number().int().min(1).max(9)).optional(), // 可选；COC 法术填写1~9阶
    类型: str(''), // 可填写主动、被动、特殊等资源技能类型
    消耗: str('无'),
    剩余次数: z.coerce.number().prefault(0),
    次数上限: z.coerce.number().prefault(0),
    恢复条件: str(''),
    标签: z.array(z.string()).prefault([]),
    效果: z.record(z.string(), z.string()).prefault({}),
    描述: str('')
}).transform(r => ({
    ...r,
    标签: _.uniq(r.标签 || [])
}));

const mythicLayerEntrySchema = z.preprocess(
    v => isPlainObject(v) ? v : {},
    z.object({
        溯源: safeStrArray([]),
        效果: safeStr('')
    })
);

const mythicLayerSchema = z.preprocess(
    v => isPlainObject(v) ? v : {},
    z.record(
        z.string().describe('道途层级项名称'),
        mythicLayerEntrySchema
    )
);

const mythicPathSchema = z.preprocess(
    v => isPlainObject(v) ? v : {},
    z.object({
        道途名称: safeStr(''),
        阶段: safeNum(0),
        当前源力: safeNum(0),
        源力上限: safeNum(0),
        要素: mythicLayerSchema,
        奇迹: mythicLayerSchema,
        权能: mythicLayerSchema,
        世界影响: z.preprocess(
            v => isPlainObject(v) ? v : {},
            z.object({
                概念标签: safeStrArray([]),
                特殊效果: safeStr('')
            })
        ),
        道途能力: safeStrArray([])
    }).transform(r => ({
        ...r,
        阶段: Math.max(0, Number.isFinite(Number(r.阶段)) ? Number(r.阶段) : 0),
        源力上限: Math.max(0, Number.isFinite(Number(r.源力上限)) ? Number(r.源力上限) : 0),
        当前源力: _.clamp(
            Number.isFinite(Number(r.当前源力)) ? Number(r.当前源力) : 0,
            0,
            Math.max(0, Number.isFinite(Number(r.源力上限)) ? Number(r.源力上限) : 0)
        ),
        道途能力: _.uniq(r.道途能力 || []),
        世界影响: {
            ...r.世界影响,
            概念标签: _.uniq(r.世界影响?.概念标签 || [])
        }
    }))
);

// --- 装备属性加成 Schema ---
// 属性加成: { "属性名": 数值 }
// 例: { "力量": 5, "暴击率": 3, "基础": 1 }
const equipBonusSchema = z.record(z.string(), z.coerce.number()).prefault({});

// --- 装备部位 ---
// 结构定义中的正式类型/部位包含“特殊”；保留旧存档中的饰品、副手、随从值以便迁移
// 防具: 护肩 | 上衣 | 腰带 | 下装 | 鞋子
// 首饰: 戒指 | 手镯 | 项链
// 「装备箱」字段为布尔值，true=未穿戴存放在装备箱中，false=已穿戴

// --- 统一装备 Schema ---
// 所有装备统一存储，通过 类型+部位 区分
const equipmentSchema = z.object({
    // 装备类型允许扩展值（例如盾牌、世界观专属装备），不在这里做固定枚举校验。
    类型: str('武器'),
    部位: str('主手'),
    装备箱: boolPreprocess(true),   // true=在装备箱中(未穿戴)，false=已穿戴
    名称: str(''),
    品质: qualityStr('普通'),              // 普通 | 精良 | 稀有 | 卓越 | 传说 | 史诗 | 神话
    标签: z.array(z.string()).prefault([]),
    等级: clampNum(1, 1, 100),
    品级: z.coerce.number().nullable().prefault(null),
    强化等级: clampNum(0, 0, 20),   // 仅武器有意义
    属性加成: equipBonusSchema,
    效果: str(''),                  // 非枚举效果文本
    描述: str(''),
    // 武器专用 (脚本自动计算，AI无需提供)
    伤害骰: str('').optional(),
    等级系数: z.coerce.number().optional(),
    固定伤害: z.coerce.number().optional(),
    // 防具/首饰专用 (脚本自动计算，AI无需提供)
    防御力: z.coerce.number().optional()
});

// --- 种族棋子枚举 ---
const raceChessEnum = z.enum([
    '神灵种', '幻想种', '精灵种', '龙精种', '巨人种', '天翼种',
    '森精种', '妖魔种', '妖精种', '机凯种', '地精种', '吸血种',
    '月咏种', '兽人种', '海栖种', '人类种'
]);

// --- 道具类型枚举 ---
const itemTypeEnum = z.enum(['消耗品', '材料', '杂物', '任务物品', '唯一物品']).prefault('消耗品');

// --- 背包物品 Schema ---
const bagItemSchema = z.object({
    品质: qualityEnum,
    数量: clampNum(1, 0, 99999),
    类型: itemTypeEnum,
    标签: z.array(z.string()).prefault([]),
    效果: str(''),
    描述: str('')
}).transform(r => _.pick({
    ...r,
    标签: _.uniq(r.标签 || [])
}, ['品质', '数量', '类型', '标签', '效果', '描述']));

const bagSchema = z.preprocess(v => {
    if (!isPlainObject(v)) return {};
    const bag = { ...v };
    if (Object.prototype.hasOwnProperty.call(bag, '金币')) {
        const legacyGold = Number(bag.金币);
        const currentUniversalCurrency = Number(bag.通用币);
        const safeLegacyGold = Number.isFinite(legacyGold) ? legacyGold : 0;
        const safeUniversalCurrency = Number.isFinite(currentUniversalCurrency) ? currentUniversalCurrency : 0;
        bag.通用币 = Object.prototype.hasOwnProperty.call(bag, '通用币')
            ? safeUniversalCurrency + safeLegacyGold
            : safeLegacyGold;
        delete bag.金币;
    }
    return bag;
}, z.object({
    通用币: z.coerce.number().prefault(0).transform(Math.floor),
    道具: z.record(
        z.string().describe('道具名'),
        bagItemSchema
    ).prefault({})
}).prefault({}).transform(r => ({
    ...r,
    道具: _.pickBy(r.道具, item => item.数量 > 0)
})));

// --- 任务 Schema ---
const questSchema = z.object({
    委托方: str(''),
    标题: str(''),
    简介: str(''),
    目标: str(''),
    奖励: str(''),
    交付: str('')
});

// --- 附近的人 NPC Schema ---
const nearbyPersonSchema = z.object({
    性别: str(''),
    种族: str(''),
    等级: clampNum(1, 1, 100),
    外貌: str(''),
    着装: str(''),
    属性: z.object(
        _.mapValues(dndStats, () => z.coerce.number().prefault(10))
    ).prefault({}),
    装备列表: z.record(z.string(), equipmentSchema).prefault({})
});

// --- 羁绊角色技能 Schema ---
const bondSkillSchema = z.object({
    品质: qualityStr(''),
    类型: str(''),
    效果: str(''),
    描述: str('')
});

// --- 三消角色附加变量：已有颜色原样保留；缺省时桥接程序按名字哈希 × 稀有度生成并写入 ---
// 稀有度可选：缺省按同伴已穿戴装备的最高品质推导；只影响颜色数量（普通/精良 1，稀有～史诗 2，神话 3）
const match3CharacterSchema = z.object({
    颜色: z.array(z.enum(['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Brown'])).min(1).max(3)
        .refine(colors => new Set(colors).size === colors.length, '三消颜色不得重复').optional(),
    稀有度: z.enum(['普通', '精良', '稀有', '卓越', '传说', '史诗', '神话']).optional()
});

// --- 剧情三消原子回写收据：HP 与本场标记同次写入，聊天 match3.storyResults 为事实镜像 ---
const match3NonnegativeInt = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const match3ChatSchema = z.object({ hostId: z.string().min(1), characterId: z.string().min(1), chatId: z.string().min(1) });
const match3SideSchema = z.enum(['player', 'enemy']);
const match3CombatantResultSchema = z.object({
    externalId: z.string().min(1), side: match3SideSchema,
    hp: match3NonnegativeInt, maxHp: z.number().int().min(1), armor: match3NonnegativeInt,
    defeated: z.boolean(), fled: z.boolean().optional(),
    statuses: z.array(z.object({ id: z.string().min(1), turns: match3NonnegativeInt }))
});
const match3BattleResultSchema = z.object({
    schemaVersion: z.literal(1), battleId: z.string().min(1), requestId: z.string().min(1),
    rulesetVersion: z.string().min(1), seed: match3NonnegativeInt, winner: match3SideSchema,
    endReason: z.enum(['surrender', 'turn-limit', 'objective']).optional(), playerTurns: match3NonnegativeInt.optional(),
    turns: match3NonnegativeInt, combatants: z.array(match3CombatantResultSchema),
    defeatedExternalIds: z.array(z.string()), fledExternalIds: z.array(z.string()).optional(),
    summonedCount: match3NonnegativeInt, actionLogDigest: z.string().min(1),
    economy: z.object({ gold: match3NonnegativeInt, souls: match3NonnegativeInt, gems: match3NonnegativeInt, maps: match3NonnegativeInt.optional() }).optional(),
    // 战斗内资源账本原样保留；缺少此项时 zod 会剥离字段，导致回写确认失败
    economyAudit: z.unknown().optional(),
    eventSummary: z.array(z.object({ type: z.string().min(1), count: match3NonnegativeInt }))
});
const match3UnitFactSchema = z.object({
    externalId: z.string().min(1), name: z.string(), side: match3SideSchema,
    initialHp: match3NonnegativeInt, initialMaxHp: z.number().int().min(1),
    finalHp: match3NonnegativeInt, finalMaxHp: z.number().int().min(1),
    initialHpPercent: z.number(), finalHpPercent: z.number(), hpLostPercentagePoints: z.number(),
    fellCount: match3NonnegativeInt, revivedCount: match3NonnegativeInt,
    finallyDefeated: z.boolean(), fled: z.boolean(), hpDamage: match3NonnegativeInt,
    hpHealing: match3NonnegativeInt, hpGrowth: match3NonnegativeInt
});
const match3ReportSchema = z.object({
    version: z.literal(1), battleId: z.string().min(1), winner: match3SideSchema, turns: match3NonnegativeInt,
    units: z.array(match3UnitFactSchema), defeatedEnemyIds: z.array(z.string()),
    fallenAllyIds: z.array(z.string()), revivedAllyIds: z.array(z.string())
});
const match3StoryWritebackSchema = z.object({
    version: z.literal(1), chat: match3ChatSchema, messageId: match3NonnegativeInt, swipeId: match3NonnegativeInt,
    saveId: z.string().min(1).optional(), battleId: z.string().min(1), requestId: z.string().min(1), resultDigest: z.string().min(1),
    actors: z.array(z.object({
        externalId: z.string().min(1), path: z.string().min(1), current: match3NonnegativeInt,
        max: z.number().int().min(1), temp: z.literal(0), nextCurrent: match3NonnegativeInt
    })).min(1).max(4),
    result: match3BattleResultSchema, report: match3ReportSchema
});

// --- 羁绊列表 Schema ---
const bondSchema = z.object({
    三消: match3CharacterSchema.optional(),
    性别: str(''),
    种族: str(''),
    等级: clampNum(1, 1, 100),
    本级经验: safeNum(0).transform(v => Math.max(0, Math.floor(v))).optional(),
    当前总经验: z.coerce.number().prefault(0),
    升级阈值: z.coerce.number().prefault(100),
    生命值上限: z.coerce.number().prefault(0).transform(v => Math.max(v, 1)),
    当前生命值: z.coerce.number().prefault(0),
    // 仅地海启用，缺字段的旧档在外层 transform 中初始化。
    理智值: z.coerce.number().optional(),
    理智值上限: z.coerce.number().transform(v => Math.floor(_.clamp(v, 0, 99))).optional(),
    属性: z.object(
        _.mapValues(dndStats, () => z.coerce.number().prefault(10))
    ).prefault({}),
    战斗属性: z.object({
        暴击率: clampNum(0, 0, 100).default(0),
        暴击伤害: z.coerce.number().default(1.5),
        暴击阈值: z.coerce.number().default(10),
        物理减伤: z.coerce.number().default(0),
        魔法减伤: z.coerce.number().default(0),
        武器面板: z.object({
            伤害骰: str(''),
            等级系数: z.coerce.number().prefault(1),
            固定伤害: z.coerce.number().prefault(0)
        }).optional()
    }).default({}),
    装备列表: z.record(z.string(), equipmentSchema).prefault({}),
    技能: z.record(z.string(), bondSkillSchema).prefault({}),
    外貌: str(''),
    着装: str(''),
    好感度: clampNum(0, -100, 100),
    同行誓约: boolPreprocess(false),
    连携奥义: z.record(z.string(), bondSkillSchema).prefault({})
});

// --- EJS简详显示配置 Schema ---
const displayPathConfigSchema = z.object({
    简要显示路径: z.array(z.string()).prefault([])
}).prefault({}).transform(r => ({
    简要显示路径: _.uniq((r.简要显示路径 || []).filter(Boolean))
}));

const playerTurnActionResourceSchema = z.object({
    主动作: z.coerce.number().prefault(1),
    附赠动作: z.coerce.number().prefault(1),
    移动: z.coerce.number().prefault(1),
    反应动作: z.coerce.number().prefault(1),
    简短交互: z.coerce.number().prefault(1),
    攻击次数: z.coerce.number().prefault(1)
}).prefault({});

// --- 主 Schema 定义 ---
export const Schema = z.object({

    // 仅程序写入：与角色 HP 原子保存，供剧情事实回传与重试防重。旧档无需此字段。
    三消战果: z.record(z.string(), match3StoryWritebackSchema).optional(),

    // 仅程序写入：用通用币购买的三消武器 ID（gw_*），与扣款同一次写入；“当前变量”条目不输出，AI 不可见。
    三消已购武器: z.array(z.string()).optional(),

    // 仅程序写入：通用币校验码（值 + 码），由“通用币校验”脚本在每次合法改动后更新；手改通用币会被改回。AI 不可见。
    通用币校验: z.object({ 值: z.number(), 码: z.string() }).optional(),

    // ===== 世界信息 =====
    世界信息: z.object({
        年历: str('阿拉德历990年3月1日'),
        时间: z.enum(['清晨', '上午', '中午', '下午', '傍晚', '入夜', '深夜', '凌晨', '黎明']).prefault('清晨'),
        世界剧情: str(''),
        // 各世界实际发生的大事件，独立于当前事件与背包航路。
        大事件: z.record(z.string(), z.boolean()).prefault({}),
        // 按篇章保存实际发生的关键差异；不取代大事件、背包道具或当前剧情。
        剧情修正: z.record(z.string(), z.object({
            人物: z.array(z.string()).prefault([]),
            物品: z.array(z.string()).prefault([]),
            事件: z.array(z.string()).prefault([])
        })).prefault({}),
        位置: z.object({
            大陆: str('阿拉德大陆'),
            区域: str('艾尔文防线'),
            场所: str(''),
            惊悚乐园: z.object({
                登录中: boolPreprocess(true),
                区域: str(''),
                场所: str('')
            }).optional()
        }).prefault({})
    }).prefault({}),

    // ===== 任务列表 =====
    任务列表: z.record(
        z.string().describe('任务名'),
        questSchema
    ).prefault({}),

    // ===== 附近的人 =====
    附近的人: z.record(
        z.string().describe('姓名'),
        nearbyPersonSchema
    ).prefault({}),

    // ===== 羁绊列表 =====
    羁绊列表: z.record(
        z.string().describe('角色名'),
        bondSchema
    ).prefault({}),

    // 仅脚本与状态栏使用；当前变量显示不输出此字段。
    队友成长: z.object({
        经验池: z.record(z.string(), safeNum(0).transform(v => Math.max(0, Math.floor(v)))).prefault({}),
        已分配总经验: z.record(z.string(), safeNum(0).transform(v => Math.max(0, Math.floor(v)))).prefault({}),
        玩家经验基准: safeNum(0).optional()
    }).prefault({}),

    // ===== 人物属性 =====
    人物: z.object({
        名称: str(''),
        种族: str('人类'),
        职业: str(''),
        背景设定: str(''),
        特质: z.record(
            z.string().describe('特质名'),
            z.object({
                标签: z.array(z.string()).prefault([]),
                描述: z.string().prefault('')
            })
        ).prefault({}),
        等级: clampNum(1, 1, 100),
        本级经验: safeNum(0).transform(v => Math.max(0, Math.floor(v))).optional(),
        当前总经验: z.coerce.number().prefault(0),
        升级阈值: z.coerce.number().prefault(100),
        RP: z.coerce.number().prefault(0),
        额外特质槽: z.coerce.number().prefault(0),
        生命值上限: z.coerce.number().prefault(0).transform(v => Math.max(v, 1)),
        当前生命值: z.coerce.number().prefault(0),
        临时生命值: z.coerce.number().prefault(0),
        SP: z.coerce.number().prefault(0),
        AC: z.coerce.number().prefault(10),
        CP: clampNum(0, 0, 100),
        // 地海 SAN 在外层 transform 中按感知与 COC 法术品质初始化/裁剪
        理智值: z.coerce.number().optional(),
        理智值上限: z.coerce.number().transform(v => Math.floor(_.clamp(v, 0, 99))).optional(),

        战斗属性: z.object({
            暴击率: clampNum(0, 0, 100).default(0),
            暴击伤害: z.coerce.number().default(1.5),
            暴击阈值: z.coerce.number().default(10),
            物理减伤: z.coerce.number().default(0),
            魔法减伤: z.coerce.number().default(0),
            // 只读：由辅助计算脚本根据等级自动维护，不应手动修改
            每回合动作资源: playerTurnActionResourceSchema,
            武器面板: z.object({
                伤害骰: str(''),
                等级系数: z.coerce.number().prefault(1),
                固定伤害: z.coerce.number().prefault(0)
            }).optional()
        }).default({}),

        属性: z.object({
            ..._.mapValues(dndStats, () => z.coerce.number().prefault(10)),
            属性点: z.coerce.number().prefault(0)
        }).prefault({}),

        技能树: skillTreeSchema,

        资源技能: z.record(
            z.string().describe('技能名称'),
            resourceSkillSchema
        ).prefault({}),

        熟练度: z.object({
            战斗: z.record(
                z.string().describe('武器种类'),
                proficiencySchema
            ).prefault({}),
            生活: z.record(
                z.string().describe('生活技能'),
                proficiencySchema
            ).prefault({})
        }).prefault({}),

        道途: mythicPathSchema,

        // ===== 召唤物 =====
        // 1个时用 summonSingleSchema，≥2个时合并为集群用 summonClusterSchema
        召唤物: z.record(z.string(), summonSchema).prefault({}),

        主动技能槽: z.record(z.string(), equippedSkillSchema).prefault({}),
        觉醒技能槽: z.record(z.string(), equippedSkillSchema).prefault({}),
        连携奥义槽: comboSlotSchema,

        状态效果: z.record(
            z.string().describe('状态名'),
            z.object({
                类型: z.enum(['BUFF', 'DEBUFF']).prefault('BUFF'),
                持续时间: str('永久'),
                属性影响: z.record(z.string(), z.coerce.number()).prefault({}),
                特殊影响: str('')
            })
        ).prefault({}),

        // ===== 背包 =====
        背包: bagSchema,

        // ===== 装备列表 (统一存储所有装备) =====
        // key: 装备唯一标识 (装备名_序号)
        // 穿脱装备只需 replace 部位字段，无需移动数据
        装备列表: z.record(
            z.string().describe('装备唯一标识'),
            equipmentSchema
        ).prefault({}),

        // ===== 声望 =====
        // key: 阵营/组织名称
        // 记录角色在各个组织或地区的声望
        声望: z.record(
            z.string().describe('阵营名称'),
            z.object({
                阵营名称: str(''),
                声望值: z.coerce.number().prefault(0),
                声望等级: str('中立'),
                描述: str('')
            })
        ).prefault({})
    }).prefault({}),

    // ===== 核心资产与领地 =====
    核心资产: z.record(
        z.string().describe('资产名称'),
        z.object({
            类型: str('房产'),
            主体规模: clampNum(1, 1, 10),
            所在地: str(''),
            状态: str('空置中'),
            建设序列: z.record(
                z.string().describe('建设方向'),
                z.object({
                    建设阶段: str('基础'),
                    核心设施: z.array(z.string()).prefault([]),
                    功能: str(''),
                    产出: str(''),
                    下次产出日期: str('')
                })
            ).prefault({}),
            驻扎人员: z.record(
                z.string().describe('角色名'),
                str('')
            ).prefault({}),
            待办事件: z.array(z.string()).prefault([])
        })
    ).prefault({}),

    // ===== 种族棋子收藏 =====
    种族棋子收藏: z.object({
        神灵种: z.boolean().optional(),
        幻想种: z.boolean().optional(),
        精灵种: z.boolean().optional(),
        龙精种: z.boolean().optional(),
        巨人种: z.boolean().optional(),
        天翼种: z.boolean().optional(),
        森精种: z.boolean().optional(),
        妖魔种: z.boolean().optional(),
        妖精种: z.boolean().optional(),
        机凯种: z.boolean().optional(),
        地精种: z.boolean().optional(),
        吸血种: z.boolean().optional(),
        月咏种: z.boolean().optional(),
        兽人种: z.boolean().optional(),
        海栖种: z.boolean().optional(),
        人类种: z.boolean().optional()
    }).prefault({}),

    // ===== 末日时钟（仅大明志异，由辅助计算脚本维护；其它世界观不生成） =====
    末日时钟: z.object({
        起始年历: safeStr(''),
        当前点数: safeNum(0),
        状态: safeStr('酝酿中'),
        功业次数: safeNum(0),
        已镇功业: safeStrArray([]),
        缴清: z.object({
            岁远: z.boolean().optional(),
            荒: z.boolean().optional(),
            卓照: z.boolean().optional(),
            潘南君: z.boolean().optional(),
            百里渊: z.boolean().optional(),
            万业尸仙: z.boolean().optional()
        }).prefault({}),
        缴清日: z.record(z.string(), z.coerce.number()).prefault({}),
        存活世数: safeNum(5)
    }).optional(),

    // ===== 传闻 =====
    传闻: z.object({
        街头巷议: z.record(
            z.string().describe('传闻标题'),
            z.object({
                说书人: str(''),
                内容: str(''),
                可信度: z.enum(['酒话', '可疑', '或许可信']).prefault('可疑')
            })
        ).prefault({}),
        情报交易: z.record(
            z.string().describe('情报名'),
            z.object({
                卖家: str(''),
                摘要: str(''),
                要价: z.coerce.number().prefault(0)
            })
        ).prefault({}),
        布告与檄文: z.record(
            z.string().describe('标题'),
            z.object({
                发布者: str(''),
                内容: str(''),
                张贴位置: str('')
            })
        ).prefault({})
    }).prefault({}),

    // ===== 战斗状态 =====
    战斗: z.object({
        是否战斗中: boolPreprocess(false),
        当前轮次: z.coerce.number().prefault(0),
    }).prefault({}),

    // ===== 当前事件 =====
    当前事件: z.record(
        z.string().describe('事件名称'),
        z.any()
    ).prefault({}),

    // ===== 系统配置 =====
    系统配置: z.object({
        技能系统模式: z.enum(['classic', 'combo']).prefault('classic'),
        三消战斗模式: boolPreprocess(false),
        屏蔽战斗上下文: boolPreprocess(false),
        战斗数值模式: combatValueModeSchema,
        难度: difficultyKeySchema,
        组合技能状态: comboSkillStateSchema,
        简详显示: displayPathConfigSchema,
        世界观: str(''),
        对白美化: z.array(z.string()).prefault([]),
        敌人倍率: z.object({
            杂兵: z.object({ 伤害倍率: z.coerce.number().prefault(1), HP倍率: z.coerce.number().prefault(1) }).prefault({}),
            精锐: z.object({ 伤害倍率: z.coerce.number().prefault(1.5), HP倍率: z.coerce.number().prefault(2) }).prefault({}),
            首领: z.object({ 伤害倍率: z.coerce.number().prefault(2), HP倍率: z.coerce.number().prefault(5) }).prefault({}),
            领主: z.object({ 伤害倍率: z.coerce.number().prefault(2.5), HP倍率: z.coerce.number().prefault(10) }).prefault({}),
            传奇: z.object({ 伤害倍率: z.coerce.number().prefault(3), HP倍率: z.coerce.number().prefault(20) }).prefault({})
        }).prefault({})
    }).prefault({})

}).transform(data => {
    // 缺少本级经验的旧档：累计经验减去到达当前等级所需的累计值；已有字段（含0）保持原值。
    if (data.人物.本级经验 === undefined) {
        let levelBase = 0;
        for (let lv = 1; lv < data.人物.等级; lv++) levelBase += Math.floor(100 * Math.pow(lv, 1.5));
        data.人物.本级经验 = Math.max(0, Math.floor(data.人物.当前总经验) - levelBase);
    }
    data.人物.当前生命值 = _.clamp(data.人物.当前生命值, 0, data.人物.生命值上限);
    if (data.系统配置.世界观 === '诡秘地海') {
        const person = data.人物;
        const depthByTier = { 学徒: 5, 熟手: 10, 专家: 20, 大师: 30, 传奇: 40 };
        const knowledge = depthByTier[person.熟练度?.生活?.神话解读?.阶位] || 0;
        const cocSpellCost = Object.values(person.资源技能 || {}).reduce((sum, skill) => {
            if (!Array.isArray(skill?.标签) || !skill.标签.includes('COC')) return sum;
            const quality = normalizeQualityName(skill.品质 || '普通');
            return sum + (COC_SAN_COST_BY_QUALITY[quality] ?? COC_SAN_COST_BY_QUALITY.普通);
        }, 0);
        const baseSan = Math.min(99, Math.max(0, Math.floor((Number(person.属性?.感知) || 0) * 5)));
        const formulaMax = Math.max(0, baseSan - knowledge - cocSpellCost);
        const existingMax = Number(person.理智值上限);
        person.理智值上限 = Number.isFinite(existingMax)
            ? Math.max(0, Math.min(99, Math.min(Math.floor(existingMax), formulaMax)))
            : formulaMax;
        const existingSan = Number(person.理智值);
        const initialSan = Number(person.属性?.感知) * 5;
        person.理智值 = Math.round(_.clamp(
            Number.isFinite(existingSan) ? existingSan : (Number.isFinite(initialSan) ? initialSan : 0),
            0,
            person.理智值上限
        ));
    }
    Object.values(data.人物.资源技能 || {}).forEach(skill => {
        if (!skill) return;
        const maxCount = Number(skill.次数上限);
        const leftCount = Number(skill.剩余次数);
        const safeMax = Number.isFinite(maxCount) ? Math.max(0, maxCount) : 0;
        skill.次数上限 = safeMax;
        skill.剩余次数 = _.clamp(Number.isFinite(leftCount) ? leftCount : 0, 0, safeMax);
    });
    Object.values(data.羁绊列表 || {}).forEach(bond => {
        if (!bond) return;
        if (bond.本级经验 === undefined) {
            let levelBase = 0;
            for (let lv = 1; lv < bond.等级; lv++) levelBase += Math.floor(100 * Math.pow(lv, 1.5));
            bond.本级经验 = Math.max(0, Math.floor(bond.当前总经验) - levelBase);
        }
        const curHp = Number(bond.当前生命值);
        const maxHp = Number(bond.生命值上限);
        bond.当前生命值 = _.clamp(Number.isFinite(curHp) ? curHp : 0, 0, Number.isFinite(maxHp) ? Math.max(maxHp, 1) : 1);
        if (data.系统配置.世界观 === '诡秘地海') {
            const baseSan = Math.min(99, Math.max(0, Math.floor((Number(bond.属性?.感知) || 0) * 5)));
            const formulaMax = baseSan;
            const maxSan = Number(bond.理智值上限);
            bond.理智值上限 = Number.isFinite(maxSan)
                ? Math.max(0, Math.min(99, Math.min(Math.floor(maxSan), formulaMax)))
                : formulaMax;
            const currentSan = Number(bond.理智值);
            const initialSan = Number(bond.属性?.感知) * 5;
            bond.理智值 = Math.round(_.clamp(
                Number.isFinite(currentSan) ? currentSan : (Number.isFinite(initialSan) ? initialSan : 0),
                0,
                bond.理智值上限
            ));
        } else {
            delete bond.理智值;
            delete bond.理智值上限;
        }
    });
    return data;
});

// 注册 Schema
$(() => {
    registerMvuSchema(Schema);
});
