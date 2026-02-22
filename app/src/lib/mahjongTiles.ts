import type { Card } from '@/types/mahjong';
import { CardType } from '@/types/mahjong';

export const NUMBER_TILE_LABELS = {
  wan: ['1万', '2万', '3万', '4万', '5万', '6万', '7万', '8万', '9万'],
  tong: ['1筒', '2筒', '3筒', '4筒', '5筒', '6筒', '7筒', '8筒', '9筒'],
  tiao: ['1条', '2条', '3条', '4条', '5条', '6条', '7条', '8条', '9条']
} as const;

export const HONOR_TILE_LABELS = {
  feng: ['东', '南', '西', '北'],
  jian: ['中', '发', '白']
} as const;

export const ALL_TILE_LABELS: string[] = [
  ...NUMBER_TILE_LABELS.wan,
  ...NUMBER_TILE_LABELS.tong,
  ...NUMBER_TILE_LABELS.tiao
];

const numericSuitChars: Record<number, string> = {
  [CardType.WAN]: '万',
  [CardType.TONG]: '筒',
  [CardType.TIAO]: '条'
};

const fengChars = ['东', '南', '西', '北'];
const jianChars = ['中', '发', '白'];

const tileImageCache = new Map<string, string>();
let cachedBackImage = '';

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function baseTileSvg(inner: string, emphasize = false): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 112" shape-rendering="crispEdges">',
    `<rect x="0" y="0" width="80" height="112" rx="4" fill="${emphasize ? '#21150a' : '#2a2117'}"/>`,
    '<rect x="3" y="3" width="74" height="106" rx="3" fill="#f8f3e8"/>',
    '<rect x="5" y="5" width="70" height="102" rx="2" fill="#fffcf4"/>',
    '<rect x="6" y="6" width="68" height="100" rx="1" fill="none" stroke="#d2c5a9" stroke-width="1.5"/>',
    inner,
    '</svg>'
  ].join('');
}

function drawPixelCircle(cx: number, cy: number, r: number, fill: string, stroke: string): string {
  const parts: string[] = [];
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${r - 2}" fill="none" stroke="${stroke}" stroke-width="0.5" opacity="0.5"/>`);
  return parts.join('');
}

function tongCircles(value: number): string {
  const cx = 40, cy = 56;
  const r = 7;
  const positions: Array<[number, number]> = [];
  if (value === 1) { positions.push([cx, cy]); }
  else if (value === 2) { positions.push([cx - 10, cy - 16], [cx + 10, cy + 16]); }
  else if (value === 3) { positions.push([cx, cy - 20], [cx - 12, cy + 10], [cx + 12, cy + 10]); }
  else if (value === 4) { positions.push([cx - 12, cy - 16], [cx + 12, cy - 16], [cx - 12, cy + 16], [cx + 12, cy + 16]); }
  else if (value === 5) { positions.push([cx, cy], [cx - 12, cy - 18], [cx + 12, cy - 18], [cx - 12, cy + 18], [cx + 12, cy + 18]); }
  else if (value === 6) { positions.push([cx - 12, cy - 20], [cx + 12, cy - 20], [cx - 12, cy], [cx + 12, cy], [cx - 12, cy + 20], [cx + 12, cy + 20]); }
  else if (value === 7) { positions.push([cx, cy - 24], [cx - 12, cy - 8], [cx + 12, cy - 8], [cx, cy + 8], [cx - 12, cy + 24], [cx + 12, cy + 24]); }
  else if (value === 8) { positions.push([cx - 12, cy - 24], [cx + 12, cy - 24], [cx - 12, cy - 4], [cx + 12, cy - 4], [cx - 12, cy + 16], [cx + 12, cy + 16], [cx, cy + 32]); }
  else { positions.push([cx - 12, cy - 24], [cx + 12, cy - 24], [cx - 12, cy - 4], [cx, cy - 4], [cx + 12, cy - 4], [cx - 12, cy + 16], [cx, cy + 16], [cx + 12, cy + 16], [cx, cy + 32]); }
  
  const colors = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#c026d3', '#65a30d', '#0d9488'];
  return positions.map(([x, y], i) => {
    const color = colors[i % colors.length];
    return drawPixelCircle(x, y, r, color, '#1f2937');
  }).join('');
}

function tiaoBamboo(value: number): string {
  const parts: string[] = [];
  const baseX = 28;
  const bambooW = 24;
  const bambooH = 8;
  const gap = 4;
  const startY = 16;
  
  const greenShades = ['#15803d', '#16a34a', '#22c55e'];
  
  for (let i = 0; i < value; i++) {
    const y = startY + i * (bambooH + gap);
    const shade = greenShades[i % 3];
    const isLast = i === value - 1;
    
    parts.push(`<rect x="${baseX}" y="${y}" width="${bambooW}" height="${bambooH}" rx="3" fill="${shade}" stroke="#0f5d2d" stroke-width="1"/>`);
    
    if (!isLast) {
      parts.push(`<rect x="${baseX + 8}" y="${y + bambooH}" width="8" height="${gap}" fill="#0f5d2d"/>`);
      parts.push(`<rect x="${baseX + 10}" y="${y + bambooH + 1}" width="4" height="${gap - 2}" fill="#15803d"/>`);
    }
    
    parts.push(`<line x1="${baseX + 4}" y1="${y + 4}" x2="${baseX + bambooW - 4}" y2="${y + 4}" stroke="#0f5d2d" stroke-width="1" opacity="0.3"/>`);
  }
  
  if (value === 1) {
    parts.push(`<rect x="${baseX + 6}" y="${startY - 6}" width="12" height="6" rx="2" fill="#dc2626" stroke="#991b1b" stroke-width="1"/>`);
  }
  
  return parts.join('');
}

function createWanChar(value: number): string {
  const wanColors: Record<number, string> = {
    1: '#dc2626', 2: '#16a34a', 3: '#dc2626', 4: '#dc2626',
    5: '#dc2626', 6: '#16a34a', 7: '#dc2626', 8: '#16a34a', 9: '#16a34a'
  };
  const color = wanColors[value] || '#dc2626';
  
  const valueChars: Record<number, string> = {
    1: '一', 2: '二', 3: '三', 4: '四', 5: '五',
    6: '六', 7: '七', 8: '八', 9: '九'
  };
  
  return [
    `<text x="40" y="36" font-size="24" text-anchor="middle" fill="${color}" font-weight="900" font-family="Noto Sans CJK SC, SimSun, serif">${valueChars[value]}</text>`,
    `<text x="40" y="72" font-size="32" text-anchor="middle" fill="${color}" font-weight="900" font-family="Noto Sans CJK SC, SimSun, serif">万</text>`
  ].join('');
}

function createNumericSvg(suit: 'wan' | 'tong' | 'tiao', value: number): string {
  let patternSvg = '';
  if (suit === 'tong') {
    patternSvg = tongCircles(value);
  } else if (suit === 'tiao') {
    patternSvg = tiaoBamboo(value);
  } else {
    patternSvg = createWanChar(value);
  }

  return baseTileSvg(patternSvg);
}

function createHonorSvg(suit: 'feng' | 'jian', value: number): string {
  const label = suit === 'feng' ? (fengChars[value - 1] ?? '东') : (jianChars[value - 1] ?? '中');
  const colors: Record<string, { bg: string; fg: string }> = {
    '东': { bg: '#fef3c7', fg: '#dc2626' },
    '南': { bg: '#dcfce7', fg: '#16a34a' },
    '西': { bg: '#dbeafe', fg: '#2563eb' },
    '北': { bg: '#f3e8ff', fg: '#7c3aed' },
    '中': { bg: '#fee2e2', fg: '#dc2626' },
    '发': { bg: '#dcfce7', fg: '#16a34a' },
    '白': { bg: '#f8fafc', fg: '#64748b' }
  };
  const c = colors[label] || { bg: '#f8fafc', fg: '#1f2937' };
  
  return baseTileSvg([
    `<rect x="12" y="16" width="56" height="80" rx="4" fill="${c.bg}" stroke="#d1d5db" stroke-width="1"/>`,
    `<text x="40" y="68" font-size="38" text-anchor="middle" fill="${c.fg}" font-weight="900" font-family="Noto Sans CJK SC, SimSun, serif">${label}</text>`
  ].join(''));
}

function createBackSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 112" shape-rendering="crispEdges">',
    '<rect x="0" y="0" width="80" height="112" rx="4" fill="#1f2937"/>',
    '<rect x="3" y="3" width="74" height="106" rx="3" fill="#334155"/>',
    '<rect x="8" y="8" width="64" height="96" fill="#0f172a"/>',
    '<rect x="12" y="12" width="56" height="88" fill="none" stroke="#64748b" stroke-width="2"/>',
    '<rect x="20" y="20" width="40" height="72" fill="#475569"/>',
    '</svg>'
  ].join('');
}

function createTileSvgFromCard(card: Card): string {
  if (card.type === CardType.WAN) return createNumericSvg('wan', card.value);
  if (card.type === CardType.TONG) return createNumericSvg('tong', card.value);
  if (card.type === CardType.TIAO) return createNumericSvg('tiao', card.value);
  if (card.type === CardType.FENG) return createHonorSvg('feng', card.value);
  return createHonorSvg('jian', card.value);
}

export function cardToLabel(card: Card): string {
  if (card.type === CardType.FENG) return fengChars[card.value - 1] ?? '东';
  if (card.type === CardType.JIAN) return jianChars[card.value - 1] ?? '中';
  const suit = numericSuitChars[card.type] ?? '万';
  return `${card.value}${suit}`;
}

export function labelToCard(label: string): Card | null {
  if (label.includes('万')) return { type: CardType.WAN, value: Number(label.replace('万', '')) };
  if (label.includes('筒')) return { type: CardType.TONG, value: Number(label.replace('筒', '')) };
  if (label.includes('条')) return { type: CardType.TIAO, value: Number(label.replace('条', '')) };
  const fengIndex = fengChars.indexOf(label);
  if (fengIndex >= 0) return { type: CardType.FENG, value: fengIndex + 1 };
  const jianIndex = jianChars.indexOf(label);
  if (jianIndex >= 0) return { type: CardType.JIAN, value: jianIndex + 1 };
  return null;
}

export function getTileSuit(label: string): 'wan' | 'tong' | 'tiao' | 'feng' | 'jian' {
  if (label.includes('万')) return 'wan';
  if (label.includes('筒')) return 'tong';
  if (label.includes('条')) return 'tiao';
  if (fengChars.includes(label)) return 'feng';
  return 'jian';
}

export function getTileImageFromLabel(label: string): string {
  const cached = tileImageCache.get(label);
  if (cached) return cached;
  const card = labelToCard(label);
  const src = svgToDataUri(card ? createTileSvgFromCard(card) : baseTileSvg('', true));
  tileImageCache.set(label, src);
  return src;
}

export function getTileImageFromCard(card: Card): string {
  return getTileImageFromLabel(cardToLabel(card));
}

export function getTileBackImage(): string {
  if (!cachedBackImage) {
    cachedBackImage = svgToDataUri(createBackSvg());
  }
  return cachedBackImage;
}
