import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';

const font = fileURLToPath(new URL(
  '../../node_modules/@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-400-normal.woff', import.meta.url,
));

// Synthetic material only: no user's resume or personal data is stored here.
export function numberedResumePdf() {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4' });
    const chunks = [];
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    pdf.font(font).fontSize(12);
    const write = (text, x, y) => pdf.text(text, x, y, { lineBreak: false });
    write('工作经历', 40, 60);
    // Write the same visual row in reverse horizontal order, with tiny baseline
    // differences and wide gaps between the three independent fields.
    write('2023.04-至今', 380, 90.5);
    write('产品运营', 230, 90);
    write('示例公司', 40, 90.8);
    write('5. 会员体系搭建', 40, 140);
    write('维护游戏商城。', 40, 265);
    write('第六项的结尾。', 40, 285);
    // Write adjacent Chinese glyphs as separate items in reverse stream order.
    const prefixWidth = pdf.widthOfString('负责');
    write('会员体系。', 40 + prefixWidth, 165);
    write('负责', 40, 165);
    write('第五项的补充说明。', 40, 185);
    write('6. 游戏商城运营', 40, 240);
    pdf.end();
  });
}

export const expectedResponsibilities = [
  '5. 会员体系搭建', '负责会员体系', '第五项的补充说明',
  '6. 游戏商城运营', '维护游戏商城', '第六项的结尾',
].join('\n');
