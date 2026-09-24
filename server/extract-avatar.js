import { deflateSync } from 'node:zlib';
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_AVATAR_SIDE = 360;
const MIN_AVATAR_SIDE = 96;
const MAX_PDF_IMAGES = 20;
const MAX_IMAGE_PIXELS = 16_000_000;

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  crcTable[index] = value >>> 0;
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff];
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function downscale(image) {
  const scale = Math.min(1, MAX_AVATAR_SIDE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const channels = image.data.length === image.width * image.height * 4 ? 4 : 3;
  if (width === image.width && height === image.height) return { ...image, channels };
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / width));
      const sourceOffset = (sourceY * image.width + sourceX) * channels;
      const targetOffset = (y * width + x) * channels;
      for (let channel = 0; channel < channels; channel += 1) data[targetOffset + channel] = image.data[sourceOffset + channel];
    }
  }
  return { width, height, data, channels };
}

function toPngDataUrl(image) {
  const scaled = downscale(image);
  const scanlines = Buffer.alloc((scaled.width * scaled.channels + 1) * scaled.height);
  for (let row = 0; row < scaled.height; row += 1) {
    const destination = row * (scaled.width * scaled.channels + 1);
    scanlines[destination] = 0;
    Buffer.from(scaled.data).copy(scanlines, destination + 1, row * scaled.width * scaled.channels, (row + 1) * scaled.width * scaled.channels);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(scaled.width, 0);
  header.writeUInt32BE(scaled.height, 4);
  header[8] = 8;
  header[9] = scaled.channels === 4 ? 6 : 2;
  return `data:image/png;base64,${Buffer.concat([PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]).toString('base64')}`;
}

function getPdfObject(page, name) {
  return new Promise(resolve => page.objs.get(name, resolve));
}

function isAvatarCandidate(image) {
  if (!image?.data || !Number.isInteger(image.width) || !Number.isInteger(image.height)) return false;
  if (image.width * image.height > MAX_IMAGE_PIXELS) return false;
  if (Math.min(image.width, image.height) < MIN_AVATAR_SIDE) return false;
  const ratio = image.width / image.height;
  return ratio >= 0.58 && ratio <= 1.42 && [3, 4].includes(image.data.length / (image.width * image.height));
}

/** Extract the most photo-like image on the first PDF page for presentation only. */
export async function extractPdfAvatar(page) {
  const operations = await page.getOperatorList();
  const imageOperations = operations.fnArray.filter(operation => operation === OPS.paintImageXObject).length;
  if (imageOperations > MAX_PDF_IMAGES) return '';
  const candidates = [];
  for (let index = 0; index < operations.fnArray.length; index += 1) {
    if (operations.fnArray[index] !== OPS.paintImageXObject) continue;
    const image = await getPdfObject(page, operations.argsArray[index][0]);
    if (isAvatarCandidate(image)) candidates.push(image);
  }
  if (!candidates.length) return '';
  candidates.sort((left, right) => Math.abs(left.width / left.height - 1) - Math.abs(right.width / right.height - 1)
    || right.width * right.height - left.width * left.height);
  return toPngDataUrl(candidates[0]);
}
