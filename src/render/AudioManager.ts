/**
 * 音频管理器（需求 26）。
 * 用 Web Audio API 程序化合成音效，零额外资源。
 * 三条音量总线（主/音效/音乐），首次用户交互后初始化以规避自动播放策略（需求 26.5）。
 */
export type SfxName = 'swap' | 'eliminate' | 'damage' | 'skill' | 'extraTurn' | 'impact';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;

  masterVolume = 0.8;
  sfxVolume = 0.7;
  muted = false;

  /** 首次用户交互时调用（需求 26.5） */
  init(): void {
    if (this.ctx) return;
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxVolume;
      this.sfxBus.connect(this.master);
    } catch {
      // 音频不可用时降级为静音，不阻塞游戏（需求 26.5）
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.masterVolume;
  }

  /** 播放一个合成音效 */
  play(name: SfxName): void {
    if (!this.ctx || !this.sfxBus || this.muted) return;
    switch (name) {
      case 'swap':
        this.blip(420, 0.06, 'triangle', 0.18);
        break;
      case 'eliminate':
        this.blip(540, 0.1, 'square', 0.16);
        break;
      case 'damage':
        this.blip(140, 0.18, 'sawtooth', 0.25);
        break;
      case 'skill':
        this.sweep(300, 720, 0.25);
        break;
      case 'extraTurn':
        this.sweep(500, 980, 0.3);
        break;
      case 'impact':
        // 撞击：低频下扫 thud + 短噪声层，营造厚重卡肉感
        this.thud();
        break;
    }
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

  /** 连锁音效：音高随连锁递增（需求 26.2） */
  playChain(chain: number): void {
    if (!this.ctx || !this.sfxBus || this.muted) return;
    const base = 480;
    const freq = base * Math.pow(1.122, Math.max(0, chain - 1)); // 每级升约一个半音多
    this.blip(freq, 0.09, 'square', 0.16);
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

  private sweep(from: number, to: number, dur: number): void {
    if (!this.ctx || !this.sfxBus) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(from, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(to, this.ctx.currentTime + dur);
    g.gain.setValueAtTime(0.2, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start();
    osc.stop(this.ctx.currentTime + dur);
  }
}
