// 山东麻将类型定义

export const CardType = {
  WAN: 0,   // 万
  TONG: 1,  // 筒
  TIAO: 2,  // 条
  FENG: 3,  // 风
  JIAN: 4,  // 箭
} as const;

export type CardType = typeof CardType[keyof typeof CardType];

export interface Card {
  type: CardType;
  value: number;
  isMagic?: boolean;
}

export interface Player {
  id: number;
  name: string;
  hand: Card[];
  pengCards: Card[][];
  gangCards: Card[][];
  discarded: Card[];
  isAI: boolean;
  isZhuang: boolean;
}

export interface GameState {
  players: Player[];
  currentPlayer: number;
  magicCard: Card | null;
  wallCount: number;
  discardedCards: Card[];
  gameStatus: 'waiting' | 'playing' | 'finished';
  winner: number | null;
  winType: string | null;
  turnCount: number;
}

export interface AIDecision {
  mode: '进攻' | '防守';
  xiangTing: number;
  tingCards: number;
  selectedCard: Card | null;
  reason: string;
  cardScores: { card: Card; score: number }[];
}

export interface StrategyTip {
  title: string;
  content: string;
  priority: 'high' | 'medium' | 'low';
}
