import type { NarrationClip } from './NarrationCatalog';
import './narrationSubtitles.css';

/** A document-level caption survives battle -> result view teardown with its voice. */
export class NarrationSubtitles {
  private owner: object | null = null;
  private element: HTMLDivElement | null = null;
  private readonly reparent = (): void => {
    if (this.element) (document.fullscreenElement ?? document.body).appendChild(this.element);
  };

  show(owner: object, clip: NarrationClip): void {
    if (typeof document === 'undefined') return;
    if (!clip.subtitleZh?.trim()) { this.hide(owner); return; }
    this.owner = owner;
    if (!this.element) {
      this.element = document.createElement('div');
      this.element.className = 'narration-subtitles';
      this.element.lang = 'zh-CN';
      // Readable by assistive tech without another voice talking over the narrator.
      this.element.setAttribute('role', 'status');
      this.element.setAttribute('aria-live', 'off');
      document.addEventListener('fullscreenchange', this.reparent);
    }
    this.element.dataset.clipId = clip.id;
    this.element.textContent = clip.subtitleZh;
    this.reparent();
  }

  hide(owner: object): void {
    // A disposed older AudioManager must not clear the new battle's subtitle.
    if (this.owner !== owner) return;
    this.element?.remove();
    this.element = null;
    this.owner = null;
    document.removeEventListener('fullscreenchange', this.reparent);
  }
}

export const narrationSubtitles = new NarrationSubtitles();
