import { backgroundMusic } from '../audio/BackgroundMusic';
import { playCastCharge, playCastRelease, type CastChargeVoice, type CastSide } from '../audio/castSfx';
import { NarrationAudio } from './NarrationAudio';
import { narrationSubtitles } from './NarrationSubtitles';
import type { NarrationClip } from './NarrationCatalog';
import skullHitUrl from '@assets/audio/combat/skull_hit.wav?url';
import dotTickUrl from '@assets/audio/combat/dot_tick_1.wav?url';
import gemExplosionUrl from '@assets/audio/gems/gem_explode.wav?url';
import gemChain1Url from '@assets/audio/gems/chains/gem_chain_1.wav?url';
import gemChain2Url from '@assets/audio/gems/chains/gem_chain_2.wav?url';
import gemChain3Url from '@assets/audio/gems/chains/gem_chain_3.wav?url';
import gemChain4Url from '@assets/audio/gems/chains/gem_chain_4.wav?url';
import gemChain5Url from '@assets/audio/gems/chains/gem_chain_5.wav?url';
import summonNecromancyUrl from '@assets/audio/skills/summon_necromancy.flac?url';
import earthSkillCastUrl from '@assets/audio/skills/skill_cast_earth.wav?url';
import waterSkillHitUrl from '@assets/audio/skills/skill_hit_water.wav?url';
import poisonSpellUrl from '@assets/audio/skills/poison_spell_short.wav?url';
import healingSpellUrl from '@assets/audio/skills/healing_spell_rise.wav?url';
import armorIronHitUrl from '@assets/audio/skills/armor_iron_hit.wav?url';
import frozenSkillUrl from '@assets/audio/skills/frozen.wav?url';
import burningTreeUrl from '@assets/audio/skills/burning_tree.wav?url';
import splashChainHitUrl from '@assets/audio/skills/splash_chain_hit.wav?url';
import redSingleHitUrl from '@assets/audio/skills/skill_hit_red_single.wav?url';
import purpleSingleHitUrl from '@assets/audio/skills/skill_hit_purple_single.wav?url';
import yellowSingleHitUrl from '@assets/audio/skills/skill_hit_yellow_single.mp3?url';
import greenSingleHitUrl from '@assets/audio/skills/skill_hit_green_single.wav?url';
import { applyPlayerPreferences, getPlayerPreferences, subscribePlayerPreferences } from '../preferences/playerPreferences';
import { normalizeStatusKey, SAMPLE_STATUS_KEYS, STATUS_CUE_SYNTHS } from './StatusSynth';
import { decodedAudio } from './audioBank';
import type { StatusCueKind } from './StatusSynth';

/**
 * 状态施加音 AI 素材自动接线（窗口 I）：扫描 game-assets/bundled/audio/status/status_*.wav，
 * 文件放入即生效（键取自文件名 status_<键>.wav 的 <键> 段，经 normalizeStatusKey 归一后
 * 直接作为状态键——目录即状态音全集事实源），无需改代码。
 * poison/burning/frozen 三个状态复用技能采样；其余未登记状态不发施加音。
 * 裁剪脚本：scripts/trim_status_sfx.mjs；生成提示词：game-assets/source/audio/status-sfx-raw/提示词/。
 */
export const STATUS_SAMPLE_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob('@assets/audio/status/status_*.wav', { query: '?url', import: 'default', eager: true }) as Record<string, string>,
  ).map(([path, url]) => [path.replace(/^.*[/\\]status_(.+)\.wav$/, '$1'), url]),
);

/**
 * 音频管理器（需求 26）。
 * Web Audio API 统一管理程序化合成音效和预解码采样资源。
 * 三条音量总线（主/音效/音乐），首次用户交互后初始化以规避自动播放策略（需求 26.5）。
 */
export type SfxName = 'swap' | 'eliminate' | 'damage' | 'skill' | 'extraTurn' | 'impact' | 'whoosh' | 'hit' | 'skillHitWater' | 'skillCastEarth' | 'skullHit' | 'gemExplosion' | 'summon' | 'poison' | 'healing' | 'armor' | 'frozen' | 'burning' | 'skillHitRedSingle' | 'skillHitPurpleSingle' | 'skillHitYellowSingle' | 'skillHitGreenSingle' | 'splashChainHit' | 'manaSurge' | 'barrierBlock' | 'troopTransform'
  // 轻量数值反馈：属性上升 / 下降（合成）、DoT 结算扣血（采样），同类短时节流，批量结算只响一声
  | 'statUp' | 'statDown' | 'dotTick';

/** 施法方：敌方蓄力音更低更暗（合成见 src/audio/castSfx.ts） */
export type { CastSide } from '../audio/castSfx';


type ColoredSingleHit = 'red' | 'purple' | 'yellow' | 'green';

const COLORED_SINGLE_HIT_URLS: Record<ColoredSingleHit, string> = {
  red: redSingleHitUrl,
  purple: purpleSingleHitUrl,
  yellow: yellowSingleHitUrl,
  green: greenSingleHitUrl,
};

const GEM_CHAIN_URLS = [gemChain1Url, gemChain2Url, gemChain3Url, gemChain4Url, gemChain5Url] as const;
export const BOARD_SFX_URLS: readonly string[] = GEM_CHAIN_URLS;
const GEM_CHAIN_PREVIEW_GAP_MS = 850;


/** 战斗音效采样全集：进战斗前由 battleAssets 全部下载并解码进 audioBank */
export const BATTLE_SFX_URLS: readonly string[] = [...new Set([
  skullHitUrl, dotTickUrl, gemExplosionUrl, ...GEM_CHAIN_URLS,
  summonNecromancyUrl, earthSkillCastUrl, waterSkillHitUrl,
  poisonSpellUrl, healingSpellUrl, armorIronHitUrl, frozenSkillUrl, burningTreeUrl, splashChainHitUrl,
  ...Object.values(COLORED_SINGLE_HIT_URLS),
  ...Object.values(STATUS_SAMPLE_URLS),
])];

export class AudioManager {
  private static finishingAudio: AudioManager | null = null;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private narrationBus: GainNode | null = null;
  private narration: NarrationAudio | null = null;
  private speaking = false;
  private disposed = false;
  /** 正在响的施法蓄力音：新蓄力或释放时先掐掉 */
  private castChargeVoice: CastChargeVoice | null = null;
  private activeGemExplosionSource: AudioBufferSourceNode | null = null;
  private chainPreviewTimers: number[] = [];
  private activeGemChainSources = new Set<AudioBufferSourceNode>();
  private activeSummonSource: AudioBufferSourceNode | null = null;
  private lastColoredSingleHitAt: Record<ColoredSingleHit, number> = {
    red: -Infinity,
    purple: -Infinity,
    yellow: -Infinity,
    green: -Infinity,
  };
  private lastStatusApplyAt: Record<string, number> = {};
  private lastAnyStatusApplyAt = -Infinity;
  private lastStatusCueAt: Partial<Record<StatusCueKind, number>> = {};
  private lastAnyStatusCueAt = -Infinity;
  private activeStatusSampleSource: AudioBufferSourceNode | null = null;
  private activeStatusSampleGain: GainNode | null = null;
  private lastSkullHitAt = -Infinity;
  private lastEarthSkillCastAt = -Infinity;
  private lastWaterSkillHitAt = -Infinity;
  private lastPoisonSpellAt = -Infinity;
  private lastHealingSpellAt = -Infinity;
  private lastArmorIronHitAt = -Infinity;
  private lastFrozenSkillAt = -Infinity;
  private lastBurningTreeAt = -Infinity;
  private lastSplashChainHitAt = -Infinity;

  private unsubscribePreferences = subscribePlayerPreferences(() => {
    this.syncPlayerPreferences();
    if (!this.narrationEnabled()) this.stopNarration();
  });

  private narrationEnabled(): boolean {
    const p = getPlayerPreferences();
    return !this.disposed && !this.muted && p.masterEnabled && p.masterVolume > 0
      && p.narrationEnabled && p.narrationVolume > 0;
  }

  masterVolume = 0.8;
  sfxVolume = getPlayerPreferences().soundEffectsVolume;
  muted = false;

  /**
   * 建立音频图（需求 26.5）。采样已由 battleAssets 在进战斗前全部解码进 audioBank，这里不再请求网络。
   * 页面尚无用户手势时 AudioContext 处于 suspended，由调用方在首次交互时 resume()。
   */
  init(): void {
    if (this.disposed || this.drainingNarration) return;
    if (AudioManager.finishingAudio && AudioManager.finishingAudio !== this) AudioManager.finishingAudio.dispose();
    applyPlayerPreferences();
    if (this.ctx) {
      this.syncPlayerPreferences();
      void this.resume();
      return;
    }
    {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxVolume;
      this.sfxBus.connect(this.master);
      this.narrationBus = this.ctx.createGain();
      this.narrationBus.connect(this.master);
      this.narration = new NarrationAudio(this.ctx, this.narrationBus,
        () => this.narrationEnabled(), (speaking) => {
          this.speaking = speaking;
          backgroundMusic.setDucking('narration', speaking);
          this.syncPlayerPreferences();
        }, clip => {
          if (clip) narrationSubtitles.show(this, clip);
          else narrationSubtitles.hide(this);
        });
      this.syncPlayerPreferences();
    }
  }

  /** AudioContext 是否已在出声（浏览器自动播放策略下，首次用户手势前为 suspended） */
  isRunning(): boolean {
    return this.ctx?.state === 'running';
  }

  playNarration(clip: NarrationClip, interrupt = false): boolean {
    return !this.drainingNarration && (this.narration?.play(clip, interrupt) ?? false);
  }

  preloadNarration(clip: NarrationClip): void { this.narration?.preload(clip); }
  isNarrationBusy(): boolean { return this.narration?.isBusy() ?? false; }
  stopNarration(): void { this.narration?.stop(); }

  /** Keep only the result voice alive across destruction of the battle view. */
  private drainingNarration = false;

  disposeAfterNarration(): void {
    this.drainingNarration = true;
    if (AudioManager.finishingAudio && AudioManager.finishingAudio !== this) AudioManager.finishingAudio.dispose();
    AudioManager.finishingAudio = this;
    for (const timer of this.chainPreviewTimers) clearTimeout(timer);
    this.chainPreviewTimers = [];
    if (this.sfxBus) this.sfxBus.gain.value = 0;
    const narration = this.narration;
    if (!narration?.isBusy()) { this.dispose(); return; }
    void narration.whenIdle().then(() => this.dispose());
  }

  dispose(): void {
    if (this.disposed) return;
    if (AudioManager.finishingAudio === this) AudioManager.finishingAudio = null;
    this.disposed = true;
    this.unsubscribePreferences();
    this.narration?.dispose();
    this.narration = null;
    for (const timer of this.chainPreviewTimers) clearTimeout(timer);
    this.chainPreviewTimers = [];
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
  }

  async resume(): Promise<void> {
    if (!this.ctx || this.ctx.state === 'running' || this.ctx.state === 'closed') return;
    await this.ctx.resume();
  }

  async suspend(): Promise<void> {
    this.stopNarration();
    if (!this.ctx || this.ctx.state !== 'running') return;
    try { await this.ctx.suspend(); } catch { /* 页面隐藏不应中断游戏生命周期 */ }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (m) this.stopNarration();
    this.syncPlayerPreferences();
  }

  /** 每次发声前读取共享偏好，保证设置页修改后无需重建 AudioManager。 */
  private syncPlayerPreferences(): boolean {
    const preferences = getPlayerPreferences();
    this.masterVolume = preferences.masterVolume;
    this.sfxVolume = preferences.soundEffectsVolume;
    if (this.sfxBus) this.sfxBus.gain.value = (preferences.soundEffectsEnabled && !this.drainingNarration ? this.sfxVolume : 0) * (this.speaking ? .55 : 1);
    if (this.narrationBus) this.narrationBus.gain.value = preferences.narrationEnabled ? preferences.narrationVolume : 0;
    const audible = preferences.masterEnabled && this.masterVolume > 0 && !this.muted;
    const enabled = !this.drainingNarration && audible && preferences.soundEffectsEnabled && this.sfxVolume > 0;
    if (this.master) this.master.gain.value = audible ? this.masterVolume : 0;
    return enabled;
  }

  /** 播放一个合成音效 */
  play(name: SfxName): void {
    if (!this.ctx || !this.sfxBus || !this.syncPlayerPreferences()) return;
    switch (name) {
      case 'swap':
        this.blip(420, 0.06, 'triangle', 0.18);
        break;
      case 'eliminate':
        this.playChain(1);
        break;
      case 'damage':
        this.blip(140, 0.18, 'sawtooth', 0.25);
        break;
      case 'skill':
        // 施法起手：短促破空 whoosh（替代原先的卡通上扫）
        this.whoosh();
        break;
      case 'whoosh':
        this.whoosh();
        break;
      case 'skullHit':
        this.skullHit();
        break;
      case 'gemExplosion':
        this.gemExplosion();
        break;
      case 'summon':
        this.summon();
        break;
      case 'skillCastEarth':
        this.earthSkillCast();
        break;
      case 'skillHitWater':
        this.waterSkillHit();
        break;
      case 'skillHitRedSingle':
        this.coloredSingleHit('red');
        break;
      case 'skillHitPurpleSingle':
        this.coloredSingleHit('purple');
        break;
      case 'skillHitYellowSingle':
        this.coloredSingleHit('yellow');
        break;
      case 'skillHitGreenSingle':
        this.coloredSingleHit('green');
        break;
      case 'hit':
        // 弹道命中：短促清脆的击打（高频噪声爆点 + 轻 body）
        this.hit();
        break;
      case 'extraTurn':
        // Extra-action feedback is part of the selected elimination/chain suite.
        this.playChain(2);
        break;
      case 'poison':
        this.poisonSpell();
        break;
      case 'healing':
        this.healingSpell();
        break;
      case 'armor':
        this.armorIronHit();
        break;
      case 'frozen':
        this.frozenSkill();
        break;
      case 'burning':
        this.burningTree();
        break;
      case 'splashChainHit':
        this.splashChainHit();
        break;
      case 'manaSurge':
        this.manaSurge();
        break;
      case 'barrierBlock':
        this.barrierBlock();
        break;
      case 'troopTransform':
        this.troopTransform();
        break;
      case 'impact':
        // 撞击：低频下扫 thud + 短噪声层，营造厚重卡肉感
        this.thud();
        break;
      case 'statUp':
      case 'statDown':
      case 'dotTick':
        this.lightCue(name);
        break;
    }
  }

  /** 轻量提示音的节流：同类 0.09s 内只响一次（一批属性/多目标 DoT 同刻结算只一声） */
  private lastLightCueAt: Partial<Record<'statUp' | 'statDown' | 'dotTick', number>> = {};

  /**
   * 轻量数值反馈音（合成，音量明显低于命中/施法音，不抢主演出）：
   *   - statUp：两声上行的清亮短音（像「叮」地涨了一格）
   *   - statDown：一声下滑的柔和短音（被削减）
   *   - dotTick：采样灼烧嘶声（CC0，非人声；持续伤害结算扣血）
   */
  private lightCue(kind: 'statUp' | 'statDown' | 'dotTick'): void {
    if (!this.ctx || !this.sfxBus) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const last = this.lastLightCueAt[kind];
    if (last !== undefined && t - last < 0.09) return;
    this.lastLightCueAt[kind] = t;
    const tone = (f0: number, f1: number, start: number, dur: number, type: OscillatorType, peak: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, start);
      osc.frequency.exponentialRampToValueAtTime(f1, start + dur);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(g);
      g.connect(this.sfxBus!);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    };
    if (kind === 'statUp') {
      tone(740, 880, t, 0.09, 'sine', 0.11);
      tone(988, 1175, t + 0.07, 0.12, 'sine', 0.09);
    } else if (kind === 'statDown') {
      tone(520, 330, t, 0.16, 'triangle', 0.1);
    } else {
      // 采样灼烧嘶声（OpenGameArt「Catching Fire」CC0），播放速率轻微随机，连续几跳不会听出是同一声
      const source = this.startSample(dotTickUrl, 0.55);
      if (source) source.playbackRate.value = 0.94 + Math.random() * 0.12;
    }
  }

  /**
   * 状态施加音（status-apply 事件专用接线点）。
   * 键解析：normalizeStatusKey 先查 status/ 目录 glob 采样（事实源，含 faerie_fire/terror），
   * poison/burning/frozen 复用技能采样；其余未登记状态没有施加音。
   * 防混响两层节流：全局 0.12s 最小间隔（AoE 批量施加多状态只响一声）+ 同键 0.18s；
   * 采样源 newest-wins——新采样起播时旧的 70ms 快速淡出后停止。
   */
  playStatusApply(statusId: string): void {
    if (!this.ctx || !this.sfxBus || !this.syncPlayerPreferences()) return;
    const normalized = normalizeStatusKey(statusId);
    const sampleUrl = STATUS_SAMPLE_URLS[normalized];
    const key = sampleUrl || SAMPLE_STATUS_KEYS.includes(normalized) ? normalized : null;
    if (!key) return;
    const now = this.ctx.currentTime;
    if (now - this.lastAnyStatusApplyAt < 0.12) return;
    this.lastAnyStatusApplyAt = now;
    if (now - (this.lastStatusApplyAt[key] ?? -Infinity) < 0.18) return;
    this.lastStatusApplyAt[key] = now;
    if (sampleUrl) {
      this.startStatusSample(this.ctx, this.sfxBus, decodedAudio(sampleUrl), now);
      return;
    }
    if (key === 'poison') this.poisonSpell();
    else if (key === 'burning') this.burningTree();
    else this.frozenSkill();
  }

  /**
   * 状态演出提示音（拦截/挣脱/驱散/死亡标记触发/恐怖换位/屏障破碎…）。
   * 与施加音分开节流：同类 0.2s 内只响一次（群体结算只一声），异类 0.06s 最小间隔防糊。
   */
  playStatusCue(kind: StatusCueKind): void {
    if (!this.ctx || !this.sfxBus || !this.syncPlayerPreferences()) return;
    const now = this.ctx.currentTime;
    if (now - this.lastAnyStatusCueAt < 0.06) return;
    if (now - (this.lastStatusCueAt[kind] ?? -Infinity) < 0.2) return;
    this.lastAnyStatusCueAt = now;
    this.lastStatusCueAt[kind] = now;
    STATUS_CUE_SYNTHS[kind](this.ctx, this.sfxBus, now);
  }

  /** 播放状态采样；同一时刻只保留一个状态采样源，新的顶掉旧的（70ms 淡出防爆音）。 */
  private startStatusSample(ctx: AudioContext, bus: AudioNode, buffer: AudioBuffer, at: number): void {
    const prevSource = this.activeStatusSampleSource;
    const prevGain = this.activeStatusSampleGain;
    this.activeStatusSampleSource = null;
    this.activeStatusSampleGain = null;
    if (prevSource && prevGain) {
      try {
        prevGain.gain.cancelScheduledValues(at);
        prevGain.gain.setValueAtTime(Math.max(prevGain.gain.value, 0.0001), at);
        prevGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
        prevSource.stop(at + 0.08);
      } catch { /* already stopped */ }
    }
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = 0.72;
    source.connect(gain);
    gain.connect(bus);
    source.start(at);
    this.activeStatusSampleSource = source;
    this.activeStatusSampleGain = gain;
    source.addEventListener('ended', () => {
      if (this.activeStatusSampleSource === source) {
        this.activeStatusSampleSource = null;
        this.activeStatusSampleGain = null;
      }
    });
  }

  /** 起播一条已解码采样（一次性） */
  private startSample(url: string, gainValue: number): AudioBufferSourceNode | null {
    if (!this.ctx || !this.sfxBus) return null;
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = decodedAudio(url);
    gain.gain.value = gainValue;
    source.connect(gain);
    gain.connect(this.sfxBus);
    source.start(this.ctx.currentTime);
    return source;
  }

  private skullHit(): void {
    if (!this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    if (now - this.lastSkullHitAt < 0.06) return;
    this.lastSkullHitAt = now;
    this.startSample(skullHitUrl, 0.82);
  }

  private gemExplosion(): void {
    if (!this.ctx || !this.sfxBus) return;
    if (this.activeGemExplosionSource) {
      try { this.activeGemExplosionSource.stop(); } catch { /* already stopped */ }
    }
    const source = this.startSample(gemExplosionUrl, 0.78);
    this.activeGemExplosionSource = source;
    source?.addEventListener('ended', () => {
      if (this.activeGemExplosionSource === source) this.activeGemExplosionSource = null;
    });
  }

  previewGemChainLevel(chain: number): void {
    this.stopGemChainPreview();
    this.playChainLevel(Math.max(1, Math.floor(chain)));
  }

  previewGemChainSet(): void {
    this.stopGemChainPreview();
    for (let i = 0; i < GEM_CHAIN_URLS.length; i += 1) {
      const timer = window.setTimeout(() => this.playChainLevel(i + 1), i * GEM_CHAIN_PREVIEW_GAP_MS);
      this.chainPreviewTimers.push(timer);
    }
  }

  private stopGemChainPreview(): void {
    for (const timer of this.chainPreviewTimers) window.clearTimeout(timer);
    this.chainPreviewTimers = [];
    for (const source of this.activeGemChainSources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this.activeGemChainSources.clear();
  }

  private summon(): void {
    if (!this.ctx || !this.sfxBus) return;
    if (this.activeSummonSource) {
      try { this.activeSummonSource.stop(); } catch { /* already stopped */ }
    }
    const source = this.startSample(summonNecromancyUrl, 0.68);
    this.activeSummonSource = source;
    source?.addEventListener('ended', () => {
      if (this.activeSummonSource === source) this.activeSummonSource = null;
    });
  }

  private earthSkillCast(): void {
    if (!this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    if (now - this.lastEarthSkillCastAt < 0.08) return;
    this.lastEarthSkillCastAt = now;
    this.startSample(earthSkillCastUrl, 0.78);
  }

  /** Play one water impact for near-simultaneous multi-target hits. */
  private waterSkillHit(): void {
    if (!this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    if (now - this.lastWaterSkillHitAt < 0.08) return;
    this.lastWaterSkillHitAt = now;
    this.startSample(waterSkillHitUrl, 0.72);
  }

  private poisonSpell(): void {
    if (!this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    if (now - this.lastPoisonSpellAt < 0.35) return;
    this.lastPoisonSpellAt = now;
    this.startSample(poisonSpellUrl, 0.7);
  }

  private healingSpell(): void {
    if (!this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    if (now - this.lastHealingSpellAt < 0.3) return;
    this.lastHealingSpellAt = now;
    this.startSample(healingSpellUrl, 0.68);
  }

  private armorIronHit(): void {
    if (!this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    if (now - this.lastArmorIronHitAt < 0.2) return;
    this.lastArmorIronHitAt = now;
    this.startSample(armorIronHitUrl, 0.72);
  }

  private coloredSingleHit(color: ColoredSingleHit): void {
    if (!this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    if (now - this.lastColoredSingleHitAt[color] < 0.12) return;
    this.lastColoredSingleHitAt[color] = now;
    this.startSample(COLORED_SINGLE_HIT_URLS[color], color === 'purple' ? 0.64 : 0.72);
  }

  private splashChainHit(): void {
    if (!this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    if (now - this.lastSplashChainHitAt < 0.12) return;
    this.lastSplashChainHitAt = now;
    this.startSample(splashChainHitUrl, 0.68);
  }

  private burningTree(): void {
    if (!this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    // Burning can be applied to a whole team in one event stream; keep one clean
    // crackle instead of stacking the same sample for every target card.
    if (now - this.lastBurningTreeAt < 0.35) return;
    this.lastBurningTreeAt = now;
    this.startSample(burningTreeUrl, 0.62);
  }

  private frozenSkill(): void {
    if (!this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    if (now - this.lastFrozenSkillAt < 0.35) return;
    this.lastFrozenSkillAt = now;
    this.startSample(frozenSkillUrl, 0.72);
  }

  /**
   * 屏障格挡（纯合成）：一记闷的低频顶撞 + 护盾「叮——」（三个非整数倍泛音的玻璃质感，快起慢收）
   * + 一丝高通噪声擦过。约 0.5s，打中了但被挡住的感觉。
   */
  private barrierBlock(): void {
    if (!this.ctx || !this.sfxBus) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.8;
    out.connect(this.sfxBus);
    const thump = ctx.createOscillator();
    thump.frequency.setValueAtTime(170, t);
    thump.frequency.exponentialRampToValueAtTime(80, t + 0.12);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0, t);
    tg.gain.linearRampToValueAtTime(0.42, t + 0.004);
    tg.gain.setTargetAtTime(0, t + 0.004, 0.06);
    thump.connect(tg).connect(out);
    thump.start(t);
    thump.stop(t + 0.4);
    for (const [freq, peak, tau] of [[1180, 0.12, 0.16], [1830, 0.07, 0.12], [2710, 0.04, 0.08]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.006);
      g.gain.setTargetAtTime(0, t + 0.006, tau);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.6);
    }
    const len = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const scrape = ctx.createBufferSource();
    scrape.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2600;
    const sg = ctx.createGain();
    sg.gain.value = 0.12;
    scrape.connect(hp).connect(sg).connect(out);
    scrape.start(t);
  }

  /**
   * 兵种转化（纯合成）：一声向上的「呼——」气流 + 三个音的快速上行琶音（三角波，带一点失谐），
   * 落在翻卡换脸那一刻。约 0.45s，轻、亮，不抢战斗音效。
   */
  private troopTransform(): void {
    if (!this.ctx || !this.sfxBus) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.7;
    out.connect(this.sfxBus);
    const len = Math.floor(ctx.sampleRate * 0.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const air = ctx.createBufferSource();
    air.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + 0.3);
    const ag = ctx.createGain();
    ag.gain.setValueAtTime(0.0001, t);
    ag.gain.exponentialRampToValueAtTime(0.16, t + 0.16);
    ag.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    air.connect(bp).connect(ag).connect(out);
    air.start(t);
    [523.3, 659.3, 784].forEach((freq, i) => {
      const at = t + 0.12 + i * 0.055;
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = freq;
        o.detune.value = detune;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.07, at + 0.01);
        g.gain.setTargetAtTime(0, at + 0.01, 0.09);
        o.connect(g).connect(out);
        o.start(at);
        o.stop(at + 0.5);
      }
    });
  }

  /** Mana Surge：破空上扫 + 高亮过音 */
  private manaSurge(): void {
    this.whoosh();
    this.blip(920, 0.14, 'sine', 0.22);
    this.blip(1380, 0.1, 'triangle', 0.14);
  }

  /** Filtered noise sweep for generic cast/projectile cues. */
  private whoosh(): void {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.26);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1);
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    // 频率上扫：从中频扫到高频，像剑气破空
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.22);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    noise.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    noise.start(t);
    noise.stop(t + 0.27);
  }

  /** 掐掉仍在响的蓄力音（30ms 淡出，避免爆音） */
  private cutCastCharge(now: number): void {
    const voice = this.castChargeVoice;
    this.castChargeVoice = null;
    if (!voice || voice.stopAt <= now) return;
    const g = voice.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 0.03);
  }

  /**
   * 统一施法蓄力音（双方所有技能；合成见 src/audio/castSfx.ts，现用「恒音聚能」，旧版保留可切换）。
   * durationSec 是按当前倍速换算后的真实秒数，释放点由 castRelease 接上；
   * 没接上（暂停/中断）时自行在末尾淡出。
   */
  castCharge(durationSec: number, side: CastSide): void {
    if (!this.ctx || !this.sfxBus || !this.syncPlayerPreferences()) return;
    this.cutCastCharge(this.ctx.currentTime);
    this.castChargeVoice = playCastCharge(this.ctx, this.sfxBus, durationSec, side);
  }

  /** 统一施法释放音（蓄力的收尾）：先掐掉蓄力，再打出冲击 + 气浪 + 下坠音 */
  castRelease(side: CastSide): void {
    if (!this.ctx || !this.sfxBus || !this.syncPlayerPreferences()) return;
    this.cutCastCharge(this.ctx.currentTime);
    playCastRelease(this.ctx, this.sfxBus, side);
  }

  /** 命中击打：高频噪声爆点 + 一层短促中频 body，干脆利落 */
  private hit(): void {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    // 高频噪声爆点
    const len = Math.floor(this.ctx.sampleRate * 0.07);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.3, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    noise.connect(hp);
    hp.connect(ng);
    ng.connect(this.sfxBus);
    noise.start(t);
    noise.stop(t + 0.08);
    // 中频 body
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(360, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.09);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  /** 撞击音：低频快速下扫 + 一层短噪声爆点 */
  private thud(): void {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    // 1) 低频 body：220→60Hz 快速下扫
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.16);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.012); // 快速起音=打击感
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.34);
    // 2) 噪声爆点：撞击的"啪"
    const len = Math.floor(this.ctx.sampleRate * 0.08);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.22, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    noise.connect(ng);
    ng.connect(this.sfxBus);
    noise.start(t);
    noise.stop(t + 0.09);
  }

  /** Final sampled elimination/chain sound set. */
  playChain(chain: number): void {
    this.playChainLevel(Math.max(1, Math.floor(chain)));
  }

  private playChainLevel(level: number): void {
    if (!this.ctx || !this.sfxBus || !this.syncPlayerPreferences()) return;
    const index = Math.min(GEM_CHAIN_URLS.length, level) - 1;
    const buffer = decodedAudio(GEM_CHAIN_URLS[index]!);

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = level > 5 ? Math.min(1.16, 1 + (level - 5) * 0.025) : 1;
    // Give the new-set 4-chain cue a small presence lift without changing the other steps.
    gain.gain.value = level === 4 ? 1.45 : 1.15;
    source.connect(gain);
    gain.connect(this.sfxBus);
    this.activeGemChainSources.add(source);
    source.addEventListener('ended', () => this.activeGemChainSources.delete(source));
    source.start(this.ctx.currentTime);
  }

  private blip(freq: number, dur: number, type: OscillatorType, gain: number): void {
    if (!this.ctx || !this.sfxBus) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start();
    osc.stop(this.ctx.currentTime + dur);
  }
}
