const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_INPUT_BYTES = 5 * 1024 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取这张头像，请选择 JPG、PNG 或 WebP 图片。')); };
    image.src = url;
  });
}

export async function makeAvatarDataUrl(file) {
  if (!file) return '';
  if (!ACCEPTED_TYPES.has(file.type) || file.size > MAX_INPUT_BYTES) throw new Error('头像仅支持 5 MB 以内的 JPG、PNG 或 WebP 图片。');
  const image = await loadImage(file);
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  if (!side) throw new Error('无法读取这张头像，请重新选择图片。');
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 320;
  const context = canvas.getContext('2d');
  context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 320, 320);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  if (dataUrl.length > 500_000) throw new Error('头像文件过大，请换一张更简单的图片。');
  return dataUrl;
}

export async function makeAvatarDataUrlFromSource(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return '';
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('无法读取简历中的头像，请在结果页重新上传。');
  return makeAvatarDataUrl(await response.blob());
}
