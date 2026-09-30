import { MAX_PORTRAIT_LENGTH } from '../state/character';
export function loadPortraitImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    const timer = window.setTimeout(() => finish(new Error('图片加载超时，请换一个链接或上传本地图片')), 15_000);
    function finish(error?: Error): void {
      clearTimeout(timer); image.onload = null; image.onerror = null;
      if (error) { image.src = ''; reject(error); } else resolve(image);
    }
    image.onload = () => image.naturalWidth && image.naturalHeight ? finish() : finish(new Error('图片内容为空'));
    image.onerror = () => finish(new Error('图片加载失败，请检查链接是否可直接访问'));
    image.src = src;
  });
}
/** Compress before sending: the complete command remains below the existing 64 KiB API limit. */
export async function compressPortrait(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片');
  if (file.size > 10 * 1024 * 1024) throw new Error('请选择 10 MB 以内的图片');
  const url = URL.createObjectURL(file);
  try {
    const image = await loadPortraitImage(url);
    if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('图片分辨率过大，请缩小后再上传');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('图片处理失败，请重试');
    for (const longest of [960, 768, 600, 480, 360]) {
      const scale = Math.min(1, longest / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.84, 0.7, 0.55, 0.4]) {
        const data = canvas.toDataURL('image/webp', quality);
        if (data.startsWith('data:image/webp;') && data.length <= MAX_PORTRAIT_LENGTH) return data;
      }
    }
    throw new Error('图片压缩后仍过大，请选择较简单的立绘');
  } finally { URL.revokeObjectURL(url); }
}
