/**
 * 战斗音频库：进战斗前由 battleAssets 全部下载完，战斗中只读、不再走网络。
 *
 *  - 音效：预先解码成 AudioBuffer（AudioBuffer 不绑定具体 AudioContext，每场战斗的 AudioManager 共用）；
 *  - 解说：约 80 条，全解码常驻内存过大，只保留编码字节（每条约 100KB），播放时本地解码（毫秒级）。
 *
 * 取不到即抛错：说明没走预载流程或资源清单漏项，不做合成音/静音兜底。
 */
const decoded = new Map<string, AudioBuffer>();
const encoded = new Map<string, ArrayBuffer>();
let decoder: OfflineAudioContext | null = null;

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}：${url}`);
  return res.arrayBuffer();
}

/** 下载并解码一条音效；已在库中直接返回 */
export async function loadDecodedAudio(url: string): Promise<void> {
  if (decoded.has(url)) return;
  const bytes = await fetchBytes(url);
  // 离线上下文解码无需用户手势；48kHz 与主流输出设备一致
  decoder ??= new OfflineAudioContext(2, 1, 48_000);
  decoded.set(url, await decoder.decodeAudioData(bytes));
}

/** 下载一条解说的编码字节；已在库中直接返回 */
export async function loadEncodedAudio(url: string): Promise<void> {
  if (encoded.has(url)) return;
  encoded.set(url, await fetchBytes(url));
}

export function hasAudio(url: string): boolean {
  return decoded.has(url) || encoded.has(url);
}

/** 已解码音效；未预载抛错 */
export function decodedAudio(url: string): AudioBuffer {
  const buffer = decoded.get(url);
  if (!buffer) throw new Error(`音效未预载：${url}`);
  return buffer;
}

/** 解说编码字节的副本（decodeAudioData 会转移所有权，原件留在库里）；未预载抛错 */
export function encodedAudio(url: string): ArrayBuffer {
  const bytes = encoded.get(url);
  if (!bytes) throw new Error(`解说未预载：${url}`);
  return bytes.slice(0);
}

/** 单测注入 */
export function registerAudioForTest(url: string, value: AudioBuffer | ArrayBuffer): void {
  if (value instanceof ArrayBuffer) encoded.set(url, value);
  else decoded.set(url, value);
}

export function resetAudioBankForTest(): void {
  decoded.clear();
  encoded.clear();
}
