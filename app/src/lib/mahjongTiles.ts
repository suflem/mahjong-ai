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

/** label → PNG 路径映射 */
const tilePngMap: Record<string, string> = {};

// 万子: Characters1-9
for (let i = 1; i <= 9; i++) tilePngMap[`${i}万`] = `/tiles/Characters${i}.png`;
// 筒子: Circles1-9
for (let i = 1; i <= 9; i++) tilePngMap[`${i}筒`] = `/tiles/Circles${i}.png`;
// 条子: Bamboo1-9
for (let i = 1; i <= 9; i++) tilePngMap[`${i}条`] = `/tiles/Bamboo${i}.png`;
// 风牌
tilePngMap['东'] = '/tiles/East.png';
tilePngMap['南'] = '/tiles/South.png';
tilePngMap['西'] = '/tiles/West.png';
tilePngMap['北'] = '/tiles/North.png';
// 箭牌
tilePngMap['中'] = '/tiles/Red.png';
tilePngMap['发'] = '/tiles/Green.png';
tilePngMap['白'] = '/tiles/White.png';

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

let cachedBackImage = '';
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
  return tilePngMap[label] ?? getTileBackImage();
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
