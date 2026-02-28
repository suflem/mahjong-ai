
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Bot,
  Brain,
  Clock3,
  Coins,
  Loader2,
  MessageCircle,
  RefreshCcw,
  Send,
  Settings2,
  ShieldAlert,
  Sparkles,
  Waves,
  UserRound,
  Activity
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { CardBack, MahjongCard } from './MahjongCard';
import {
  ALL_TILE_LABELS,
  labelToCard,
} from '@/lib/mahjongTiles';
import {
  requestMahjongLLM,
  type ChatMessage,
  type LLMAnalysisResult,
  type LLMConfig,
  type LLMUsageStats,
  type MahjongContext,
  type OpponentName
} from '@/lib/llmMahjong';

type Stage = '摸牌' | '打牌' | '等待';
type SuitCN = '万' | '筒' | '条';
type SetupPhase = '输入财神' | '输入手牌' | '选庄家' | '进行中';
type ClaimAction = '胡' | '碰' | '杠' | '过';

interface PlayerState {
  id: number;
  name: '我' | OpponentName;
  hand: string[];
  handCount: number;
  discards: string[];
  pengSets: string[][];
  gangSets: string[][];
  magicReveals: string[];
}

interface RealtimeGame {
  players: PlayerState[];
  wall: string[];
  magicCard: string;
  currentPlayer: number;
  stage: Stage;
  turn: number;
  logs: string[];
  tableDiscards: string[];
  finished: boolean;
  winner: number | null;
  lastAction: string;
  lastDiscard: { tile: string; by: number } | null;
  claimWindow: boolean;
  actionCount: number;
  updatedAt: number;
}

interface OpponentModel {
  name: OpponentName;
  tingProb: number;
  dangerSuit: SuitCN | '未知';
}

interface StageMetrics {
  drawProb: number;
  drawTargets: Array<{ tile: string; prob: number; remain: number }>;
  discardRisk: number;
  safeRate: number;
  recommendedDiscard: string;
  waitRisk: number;
  opponents: OpponentModel[];
  safeTiles: string[];
  hasInsights: boolean;
  phaseInsights: {
    draw: string;
    discard: string;
    wait: string;
  };
}

interface OpponentDiscardState {
  playerId: number;
  options: string[];
  selected: string;
  openedMagic: boolean;
}

interface OpponentClaimPromptState {
  tile: string;
  by: number;
  options: Array<{ playerId: number; action: '碰' | '杠' }>;
}

/** 自摸胡确认弹窗状态 */
interface SelfDrawHuPrompt {
  playerId: number;
}

/** 玩家摸牌输入状态 */
interface MyDrawPrompt {
  availableTiles: string[];
}

const STAGES: Stage[] = ['摸牌', '打牌', '等待'];
const PLAYER_NAMES: Array<'我' | OpponentName> = ['我', '下家', '对家', '上家'];

const defaultConfig: LLMConfig = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  temperature: 0.2,
  inputPricePerM: 0.4,
  outputPricePerM: 1.6
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const MAX_LOG_ENTRIES = 36;
const MAX_LLM_HISTORY_MESSAGES = 6; // 最近3轮(用户+助手)
const MAX_UI_HISTORY_MESSAGES = 24;
const TOTAL_TILE_COUNT = ALL_TILE_LABELS.length * 4;

function trimHistory(history: ChatMessage[], maxMessages: number): ChatMessage[] {
  if (history.length <= maxMessages) return history;
  return history.slice(-maxMessages);
}

function pushHistory(history: ChatMessage[], nextMessage: ChatMessage, maxMessages: number): ChatMessage[] {
  return trimHistory([...history, nextMessage], maxMessages);
}

function shuffle<T>(arr: T[]) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function suitOf(tile: string): SuitCN {
  if (tile.includes('万')) return '万';
  if (tile.includes('筒')) return '筒';
  return '条';
}

function numberOf(tile: string): number {
  return Number(tile[0]);
}

function tileSortValue(tile: string) {
  const suit = suitOf(tile);
  const suitBase = suit === '万' ? 0 : suit === '筒' ? 10 : 20;
  return suitBase + numberOf(tile);
}

function sortHand(hand: string[]) {
  return [...hand].sort((a, b) => tileSortValue(a) - tileSortValue(b));
}

function buildTilePool(magicCard: string) {
  const pool: string[] = [];
  ALL_TILE_LABELS.forEach((tile) => {
    for (let i = 0; i < 4; i += 1) pool.push(tile);
  });
  // 移除1张财神（翻出的那张）
  const magicIdx = pool.indexOf(magicCard);
  if (magicIdx >= 0) pool.splice(magicIdx, 1);
  return shuffle(pool);
}

function createGameFromInput(magicCard: string, hand: string[], starter: number): RealtimeGame {
  // 从牌池中移除玩家手牌
  const pool = buildTilePool(magicCard);
  const handCopy = [...hand];
  handCopy.forEach((tile) => {
    const idx = pool.indexOf(tile);
    if (idx >= 0) pool.splice(idx, 1);
  });
  // 对手各摸13张（从池中移除但不可见）
  for (let i = 0; i < 3; i += 1) {
    pool.splice(0, 13);
  }

  const players = PLAYER_NAMES.map((name, idx) => {
    if (idx === 0) {
      return {
        id: idx, name,
        hand: sortHand(hand),
        handCount: hand.length,
        discards: [] as string[],
        pengSets: [] as string[][],
        gangSets: [] as string[][],
        magicReveals: [] as string[]
      };
    }
    return {
      id: idx, name,
      hand: [] as string[],
      handCount: 13,
      discards: [] as string[],
      pengSets: [] as string[][],
      gangSets: [] as string[][],
      magicReveals: [] as string[]
    };
  });

  return {
    players,
    wall: pool,
    magicCard,
    currentPlayer: starter,
    stage: '摸牌',
    turn: 1,
    logs: [`开局财神: ${magicCard}`, `起手玩家: ${PLAYER_NAMES[starter]}`],
    tableDiscards: [],
    finished: false,
    winner: null,
    lastAction: '完成开局，进入互动模式。',
    lastDiscard: null,
    claimWindow: false,
    actionCount: 0,
    updatedAt: Date.now()
  };
}

function cloneGame(game: RealtimeGame): RealtimeGame {
  return {
    ...game,
    players: game.players.map((p) => ({
      ...p,
      hand: [...p.hand],
      discards: [...p.discards],
      pengSets: p.pengSets.map((set) => [...set]),
      gangSets: p.gangSets.map((set) => [...set]),
      magicReveals: [...p.magicReveals]
    })),
    wall: [...game.wall],
    logs: [...game.logs],
    tableDiscards: [...game.tableDiscards],
    lastDiscard: game.lastDiscard ? { ...game.lastDiscard } : null
  };
}

function removeOneTile(hand: string[], tile: string) {
  const idx = hand.indexOf(tile);
  if (idx < 0) return [...hand];
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}

function removeNTiles(hand: string[], tile: string, n: number) {
  let next = [...hand];
  for (let i = 0; i < n; i += 1) {
    next = removeOneTile(next, tile);
  }
  return next;
}

function tileToIndex(tile: string) {
  const suit = suitOf(tile) === '万' ? 0 : suitOf(tile) === '筒' ? 1 : 2;
  return suit * 9 + (numberOf(tile) - 1);
}

function tryMelds(counts: number[], magic: number): boolean {
  let first = -1;
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] > 0) { first = i; break; }
  }
  if (first === -1) return magic % 3 === 0;

  const c = counts[first];
  const useTripletMagic = Math.max(0, 3 - c);
  if (useTripletMagic <= magic) {
    const next = [...counts];
    next[first] = Math.max(0, next[first] - 3);
    if (tryMelds(next, magic - useTripletMagic)) return true;
  }

  const num = (first % 9) + 1;
  if (num <= 7) {
    const next = [...counts];
    let needMagic = 0;
    for (let k = 0; k < 3; k += 1) {
      const idx = first + k;
      if (Math.floor(idx / 9) !== Math.floor(first / 9)) { needMagic = 99; break; }
      if (next[idx] > 0) next[idx] -= 1;
      else needMagic += 1;
    }
    if (needMagic <= magic && tryMelds(next, magic - needMagic)) return true;
  }
  return false;
}

function canHuByFourMeldOnePair(tiles: string[], magicCard: string): boolean {
  const counts = Array(27).fill(0) as number[];
  let magic = 0;
  tiles.forEach((tile) => {
    if (tile === magicCard) magic += 1;
    else counts[tileToIndex(tile)] += 1;
  });

  const pairOptions: Array<{ idx: number; needMagic: number }> = [];
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] >= 2) pairOptions.push({ idx: i, needMagic: 0 });
    if (counts[i] >= 1) pairOptions.push({ idx: i, needMagic: 1 });
  }
  pairOptions.push({ idx: -1, needMagic: 2 });

  for (const option of pairOptions) {
    if (option.needMagic > magic) continue;
    const next = [...counts];
    const leftMagic = magic - option.needMagic;
    if (option.idx >= 0) {
      const remove = option.needMagic === 0 ? 2 : 1;
      next[option.idx] -= remove;
    }
    if (tryMelds(next, leftMagic)) return true;
  }
  return false;
}

/** 清七: 任意花色七对，财神可当一对（移除同花色限制） */
function canHuByQingQi(tiles: string[], magicCard: string): boolean {
  const counts = tiles.reduce<Record<string, number>>((acc, tile) => {
    acc[tile] = (acc[tile] ?? 0) + 1;
    return acc;
  }, {});
  const magic = counts[magicCard] ?? 0;

  let pairs = 0;
  let singles = 0;
  Object.entries(counts).forEach(([tile, n]) => {
    if (tile === magicCard) return;
    pairs += Math.floor(n / 2);
    singles += n % 2;
  });
  if (magic < singles) return false;
  const remainMagic = magic - singles;
  pairs += singles + Math.floor(remainMagic / 2);
  return pairs >= 7;
}

function canHuNow(hand: string[], magicCard: string): boolean {
  if (hand.length % 3 !== 2) return false;
  return canHuByQingQi(hand, magicCard) || canHuByFourMeldOnePair(hand, magicCard);
}

function canHuWithTile(hand: string[], tile: string, magicCard: string): boolean {
  return canHuNow([...hand, tile], magicCard);
}

function claimOptions(player: PlayerState, tile: string, magicCard: string) {
  const same = player.hand.filter((x) => x === tile).length;
  return {
    hu: canHuWithTile(player.hand, tile, magicCard),
    peng: same >= 2,
    gang: same >= 3
  };
}

function suggestClaimAction(player: PlayerState, tile: string, magicCard: string): Exclude<ClaimAction, '过'> | '过' {
  const opts = claimOptions(player, tile, magicCard);
  if (opts.hu) return '胡';

  const baseScore = handStructureScore(player.hand);
  if (opts.gang) {
    const afterGang = removeNTiles(player.hand, tile, 3);
    const gangScore = handStructureScore(afterGang) + 4;
    if (gangScore >= baseScore + 1) return '杠';
  }
  if (opts.peng) {
    const afterPeng = removeNTiles(player.hand, tile, 2);
    const pengScore = handStructureScore(afterPeng) + 3;
    if (pengScore >= baseScore + 0.5) return '碰';
  }
  return '过';
}

/** 检查暗杠机会：手牌中有4张相同 */
function findAnGangOptions(hand: string[], magicCard: string): string[] {
  const counts: Record<string, number> = {};
  hand.forEach((tile) => {
    if (tile !== magicCard) counts[tile] = (counts[tile] ?? 0) + 1;
  });
  return Object.entries(counts).filter(([, n]) => n >= 4).map(([tile]) => tile);
}

/** 检查加杠机会：已碰过的牌又摸到第4张 */
function findJiaGangOptions(hand: string[], pengSets: string[][]): string[] {
  const pengTiles = pengSets.map((set) => set[0]);
  return pengTiles.filter((tile) => hand.includes(tile));
}

function handStructureScore(hand: string[]) {
  const counts = hand.reduce<Record<string, number>>((acc, tile) => {
    acc[tile] = (acc[tile] ?? 0) + 1;
    return acc;
  }, {});
  let pairs = 0;
  let triples = 0;
  Object.values(counts).forEach((n) => {
    if (n >= 2) pairs += 1;
    if (n >= 3) triples += 1;
  });

  let seq = 0;
  const suits: SuitCN[] = ['万', '筒', '条'];
  suits.forEach((suit) => {
    const arr = Array.from({ length: 9 }, (_, i) => `${i + 1}${suit}`);
    const temp = { ...counts };
    for (let i = 0; i <= 6; i += 1) {
      while ((temp[arr[i]] ?? 0) > 0 && (temp[arr[i + 1]] ?? 0) > 0 && (temp[arr[i + 2]] ?? 0) > 0) {
        temp[arr[i]] -= 1;
        temp[arr[i + 1]] -= 1;
        temp[arr[i + 2]] -= 1;
        seq += 1;
      }
    }
  });

  const connectedSingles = hand.filter((tile) => {
    const n = numberOf(tile);
    const suit = suitOf(tile);
    const left = n > 1 ? `${n - 1}${suit}` : '';
    const right = n < 9 ? `${n + 1}${suit}` : '';
    return (counts[left] ?? 0) > 0 || (counts[right] ?? 0) > 0;
  }).length;

  return triples * 3 + seq * 2 + pairs + connectedSingles * 0.25;
}

function inferOpponents(game: RealtimeGame): OpponentModel[] {
  const isSafeDiscard = (tile: string) => {
    const n = numberOf(tile);
    return n === 1 || n === 9;
  };

  const models: OpponentModel[] = [];
  for (let i = 1; i <= 3; i += 1) {
    const p = game.players[i];
    const counts: Record<SuitCN, number> = { 万: 0, 筒: 0, 条: 0 };
    p.discards.forEach((tile) => { counts[suitOf(tile)] += 1; });
    const exposure = p.discards.length + p.pengSets.length + p.gangSets.length + p.magicReveals.length;
    if (exposure === 0) {
      models.push({ name: p.name as OpponentName, tingProb: 0, dangerSuit: '未知' });
      continue;
    }

    const sortedSuits = (Object.entries(counts) as Array<[SuitCN, number]>).sort((a, b) => a[1] - b[1]);
    const dangerSuit = sortedSuits[0][1] === sortedSuits[2][1] ? '未知' : sortedSuits[0][0];

    const recent = p.discards.slice(-5);
    const safeCount = recent.filter(isSafeDiscard).length;
    let safeStreak = 0;
    for (let idx = recent.length - 1; idx >= 0; idx -= 1) {
      if (!isSafeDiscard(recent[idx])) break;
      safeStreak += 1;
    }

    const prior = clamp((p.discards.length - 1) / 24, 0.04, 0.45);
    let odds = prior / (1 - prior);

    if (safeCount >= 4) odds *= 2.2;
    else if (safeCount === 3) odds *= 1.45;
    else if (safeCount <= 1) odds *= 0.85;

    if (safeStreak >= 3) odds *= 1.35;

    const aggression = clamp(
      0.5 + p.pengSets.length * 0.12 + p.gangSets.length * 0.2 + p.magicReveals.length * 0.06,
      0.25,
      0.98
    );
    odds *= aggression;

    if (game.wall.length < 30) odds *= 1.25;
    else if (game.wall.length < 55) odds *= 1.1;

    if (p.pengSets.length === 0 && p.gangSets.length === 0 && p.discards.length < 5) {
      odds *= 0.75;
    }

    const tingProb = clamp(odds / (1 + odds), 0.03, 0.95);
    models.push({ name: p.name as OpponentName, tingProb, dangerSuit });
  }
  return models;
}

function buildVisibleTileCounts(game: RealtimeGame) {
  const visible: Record<string, number> = {};
  ALL_TILE_LABELS.forEach((tile) => { visible[tile] = 0; });

  [...game.players[0].hand, ...game.tableDiscards, game.magicCard].forEach((tile) => {
    visible[tile] = (visible[tile] ?? 0) + 1;
  });

  game.players.forEach((player) => {
    player.pengSets.forEach((set) => {
      set.forEach((tile) => { visible[tile] = (visible[tile] ?? 0) + 1; });
    });
    player.gangSets.forEach((set) => {
      set.forEach((tile) => { visible[tile] = (visible[tile] ?? 0) + 1; });
    });
    player.magicReveals.forEach((tile) => {
      visible[tile] = (visible[tile] ?? 0) + 1;
    });
  });

  return visible;
}

function tileBySuitAndValue(suit: SuitCN, value: number) {
  return `${value}${suit}`;
}

function remainingOf(tile: string, visible: Record<string, number>) {
  return clamp(4 - (visible[tile] ?? 0), 0, 4);
}

function sujiMiddleNumber(tile: string): number | null {
  const n = numberOf(tile);
  if (n === 1 || n === 7) return 4;
  if (n === 2 || n === 8) return 5;
  if (n === 3 || n === 9) return 6;
  return null;
}

function sujiProtectedByPlayer(tile: string, player: PlayerState): boolean {
  const middle = sujiMiddleNumber(tile);
  if (middle === null) return false;
  const middleTile = tileBySuitAndValue(suitOf(tile), middle);
  return player.discards.includes(middleTile);
}

function sujiProtectionCount(tile: string, game: RealtimeGame): number {
  let protectedBy = 0;
  for (let pid = 1; pid <= 3; pid += 1) {
    if (sujiProtectedByPlayer(tile, game.players[pid])) protectedBy += 1;
  }
  return protectedBy;
}

function isNakasujiProtectedByPlayer(tile: string, player: PlayerState): boolean {
  const n = numberOf(tile);
  if (n < 4 || n > 6) return false;
  const suit = suitOf(tile);
  const leftEdge = n - 3;
  const rightEdge = n + 3;
  const leftTile = tileBySuitAndValue(suit, leftEdge);
  const rightTile = tileBySuitAndValue(suit, rightEdge);
  return player.discards.includes(leftTile) && player.discards.includes(rightTile);
}

function earlyMiddleDiscardTurn(player: PlayerState, suit: SuitCN): number | null {
  for (let i = 0; i < player.discards.length; i += 1) {
    const tile = player.discards[i];
    if (suitOf(tile) !== suit) continue;
    const n = numberOf(tile);
    if (n >= 4 && n <= 6) return i + 1; // 以该玩家自身弃牌序号计巡目
  }
  return null;
}

function earlyOutsideFactor(turn: number | null): number {
  if (turn === null || turn > 3) return 1;
  if (turn === 1) return 0.72;
  if (turn === 2) return 0.79;
  return 0.86;
}

function ryanmenPotential(tile: string, visible: Record<string, number>): number {
  const suit = suitOf(tile);
  const n = numberOf(tile);
  const pairs: Array<[number, number]> = [];
  if (n - 2 >= 1) pairs.push([n - 2, n - 1]);
  if (n + 2 <= 9) pairs.push([n + 1, n + 2]);

  return pairs.reduce((sum, [a, b]) => {
    const ra = remainingOf(tileBySuitAndValue(suit, a), visible);
    const rb = remainingOf(tileBySuitAndValue(suit, b), visible);
    return sum + ra * rb;
  }, 0);
}

type KabeClass = 'no_chance' | 'one_chance' | 'normal';
function classifyKabe(tile: string, visible: Record<string, number>): KabeClass {
  const potential = ryanmenPotential(tile, visible);
  if (potential <= 0) return 'no_chance';
  if (potential <= 4) return 'one_chance';
  return 'normal';
}

function kabeFactor(kabeClass: KabeClass): number {
  if (kabeClass === 'no_chance') return 0.5;
  if (kabeClass === 'one_chance') return 0.74;
  return 1;
}

function kabeLabel(kabeClass: KabeClass): string {
  if (kabeClass === 'no_chance') return 'No Chance';
  if (kabeClass === 'one_chance') return 'One Chance';
  return 'Normal';
}

function discardRisk(tile: string, models: OpponentModel[], game: RealtimeGame, visible: Record<string, number>) {
  if (models.length === 0) return 0.25;
  const suit = suitOf(tile);
  const n = numberOf(tile);

  const playerByName: Record<OpponentName, PlayerState> = {
    下家: game.players[1],
    对家: game.players[2],
    上家: game.players[3]
  };

  const perOpponent = models.reduce((sum, m) => {
    const p = playerByName[m.name];
    const suitWeight = m.dangerSuit === '未知' ? 0.45 : (m.dangerSuit === suit ? 0.78 : 0.34);
    let localRisk = m.tingProb * suitWeight;
    let localFactor = 1;

    // 1) 筋线: 对应中张已被该对手打出，降低两面听风险
    if (p && sujiProtectedByPlayer(tile, p)) {
      localFactor *= 0.84;
    }

    // 2) 间筋: 同对手已打出两侧端牌，降低中张风险
    if (p && isNakasujiProtectedByPlayer(tile, p)) {
      localFactor *= 0.82;
    }

    // 3) 早外: 该对手若早巡打出4/5/6，则该花色外侧牌(1/2/8/9)更安全
    if (p && (n === 1 || n === 2 || n === 8 || n === 9)) {
      const earlyTurn = earlyMiddleDiscardTurn(p, suit);
      localFactor *= earlyOutsideFactor(earlyTurn);
    }

    localRisk *= clamp(localFactor, 0.35, 1);
    return sum + localRisk;
  }, 0) / models.length;

  // 4) 壁牌/物理阻断: 全局可见牌决定的两面听上限修正
  const kabeClass = classifyKabe(tile, visible);
  const kFactor = kabeFactor(kabeClass);
  const residual = kabeClass === 'no_chance' ? 0.012 : kabeClass === 'one_chance' ? 0.018 : 0.024;
  const risk = perOpponent * kFactor + residual;
  return clamp(risk, 0.03, 0.95);
}

function chooseHeuristicDiscard(hand: string[], models: OpponentModel[], game: RealtimeGame, visible: Record<string, number>) {
  const base = handStructureScore(hand);
  const uniq = [...new Set(hand)];
  const scored = uniq.map((tile) => {
    const after = removeOneTile(hand, tile);
    const loss = Math.max(0, base - handStructureScore(after));
    const risk = discardRisk(tile, models, game, visible);
    const value = loss * 1.3 + risk * 10;
    return { tile, value };
  }).sort((a, b) => a.value - b.value);
  return scored[0]?.tile ?? hand[0] ?? '1万';
}

function buildOpponentDiscardOptions(game: RealtimeGame, _playerId: number) {
  const visible = buildVisibleTileCounts(game);
  return ALL_TILE_LABELS
    .filter((tile) => clamp(4 - (visible[tile] ?? 0), 0, 4) > 0)
    .sort((a, b) => tileSortValue(a) - tileSortValue(b));
}

function buildMetrics(game: RealtimeGame, analysis: LLMAnalysisResult | null): StageMetrics {
  const myHand = game.players[0].hand;
  const models = inferOpponents(game);
  const visible = buildVisibleTileCounts(game);
  const hasInsights = game.tableDiscards.length > 0 || game.players.some((p, idx) => (
    idx > 0 && (p.discards.length > 0 || p.pengSets.length > 0 || p.gangSets.length > 0 || p.magicReveals.length > 0)
  ));

  if (!hasInsights) {
    const preferred = analysis?.recommendedDiscard && myHand.includes(analysis.recommendedDiscard)
      ? analysis.recommendedDiscard
      : '';
    return {
      drawProb: 0,
      drawTargets: [],
      discardRisk: 0,
      safeRate: 0,
      recommendedDiscard: preferred,
      waitRisk: 0,
      opponents: models,
      safeTiles: [],
      hasInsights: false,
      phaseInsights: {
        draw: '暂无公开信息，先完成摸牌。',
        discard: preferred ? `可参考 ${preferred}，但当前信息不足。` : '暂无可靠推荐，先观察首轮弃牌。',
        wait: '尚无听牌压力信号。'
      }
    };
  }

  const unseenTotal = ALL_TILE_LABELS.reduce((sum, tile) => sum + clamp(4 - (visible[tile] ?? 0), 0, 4), 0);
  const magicRemain = clamp(4 - (visible[game.magicCard] ?? 0), 0, 4);
  const base = handStructureScore(myHand);
  const drawCandidates = ALL_TILE_LABELS.map((tile) => {
    const remain = clamp(4 - (visible[tile] ?? 0), 0, 4);
    if (remain <= 0) return null;
    const gain = handStructureScore([...myHand, tile]) - base;
    return { tile, gain, remain, weight: Math.max(0, gain) * remain };
  }).filter((x): x is { tile: string; gain: number; remain: number; weight: number } => Boolean(x))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  const drawRemain = drawCandidates.reduce((sum, c) => sum + c.remain, 0);
  const drawProb = unseenTotal > 0 ? clamp(drawRemain / unseenTotal, 0.01, 0.95) : 0.01;
  const preferred = analysis?.recommendedDiscard && myHand.includes(analysis.recommendedDiscard)
    ? analysis.recommendedDiscard
    : chooseHeuristicDiscard(myHand, models, game, visible);
  const risk = discardRisk(preferred, models, game, visible);
  const safeRate = clamp(1 - risk, 0.05, 0.97);
  const waitRisk = clamp(models.reduce((sum, m) => sum + m.tingProb, 0) / Math.max(1, models.length), 0.08, 0.9);
  const preferredSujiProtected = sujiProtectionCount(preferred, game);
  const preferredNakasujiProtected = [1, 2, 3].filter((pid) => isNakasujiProtectedByPlayer(preferred, game.players[pid])).length;
  const preferredKabeClass = classifyKabe(preferred, visible);

  const safeTiles = [...new Set(myHand)]
    .map((tile) => ({ tile, risk: discardRisk(tile, models, game, visible) }))
    .sort((a, b) => a.risk - b.risk)
    .slice(0, 4)
    .map((x) => x.tile);

  const sujiHints = [...new Set(myHand)]
    .map((tile) => ({ tile, protectedBy: sujiProtectionCount(tile, game) }))
    .filter((x) => x.protectedBy > 0)
    .sort((a, b) => b.protectedBy - a.protectedBy || tileSortValue(a.tile) - tileSortValue(b.tile))
    .slice(0, 2)
    .map((x) => x.tile);

  const kabeHints = [...new Set(myHand)]
    .map((tile) => ({ tile, kabe: classifyKabe(tile, visible) }))
    .filter((x) => x.kabe !== 'normal')
    .sort((a, b) => {
      const rank = (k: KabeClass) => (k === 'no_chance' ? 0 : 1);
      return rank(a.kabe) - rank(b.kabe) || tileSortValue(a.tile) - tileSortValue(b.tile);
    })
    .slice(0, 2)
    .map((x) => `${x.tile}(${kabeLabel(x.kabe)})`);

  const phaseInsights = {
    draw: `重点观察 ${drawCandidates.slice(0, 2).map((x) => x.tile).join(' / ') || '无高价值进张'}；财神剩余约 ${magicRemain} 张`,
    discard: `推荐舍牌 ${preferred}，预计安全率 ${pct(safeRate)}${preferredSujiProtected > 0 ? `（${preferredSujiProtected}家筋线）` : ''}${preferredNakasujiProtected > 0 ? `（${preferredNakasujiProtected}家间筋）` : ''}（${kabeLabel(preferredKabeClass)}）`,
    wait: `三家听牌压力 ${pct(waitRisk)}，优先保留安全牌${sujiHints.length > 0 ? `；筋线候选 ${sujiHints.join(' / ')}` : ''}${kabeHints.length > 0 ? `；壁牌候选 ${kabeHints.join(' / ')}` : ''}（筋线/间筋仅覆盖两面听）`
  };

  return {
    drawProb,
    drawTargets: drawCandidates.map((c) => ({
      tile: c.tile,
      prob: unseenTotal > 0 ? c.remain / unseenTotal : 0,
      remain: c.remain
    })),
    discardRisk: risk,
    safeRate,
    recommendedDiscard: preferred,
    waitRisk,
    opponents: models,
    safeTiles,
    hasInsights: true,
    phaseInsights
  };
}

function getMyPendingClaim(game: RealtimeGame): { tile: string; by: number; options: { hu: boolean; peng: boolean; gang: boolean } } | null {
  if (!game.claimWindow || !game.lastDiscard) return null;
  if (game.lastDiscard.by === 0) return null;
  if (game.stage !== '等待') return null;
  const opts = claimOptions(game.players[0], game.lastDiscard.tile, game.magicCard);
  if (!opts.hu && !opts.peng && !opts.gang) return null;
  return { tile: game.lastDiscard.tile, by: game.lastDiscard.by, options: opts };
}

function getOpponentClaimPrompt(game: RealtimeGame): OpponentClaimPromptState | null {
  if (!game.claimWindow || !game.lastDiscard || game.stage !== '等待') return null;
  const tile = game.lastDiscard.tile;
  const by = game.lastDiscard.by;
  const options: Array<{ playerId: number; action: '碰' | '杠' }> = [];
  for (let pid = 1; pid <= 3; pid += 1) {
    if (pid === by) continue;
    options.push({ playerId: pid, action: '碰' });
    options.push({ playerId: pid, action: '杠' });
  }
  if (options.length === 0) return null;
  return { tile, by, options };
}

function appendLog(game: RealtimeGame, message: string) {
  const nextCount = game.actionCount + 1;
  game.actionCount = nextCount;
  game.lastAction = message;
  game.updatedAt = Date.now();
  game.logs.unshift(`[${nextCount}] ${message}`);
  game.logs = game.logs.slice(0, MAX_LOG_ENTRIES);
}

function resolveWaitPass(game: RealtimeGame) {
  const nextPlayer = game.lastDiscard ? (game.lastDiscard.by + 1) % 4 : (game.currentPlayer + 1) % 4;
  game.claimWindow = false;
  game.lastDiscard = null;
  game.currentPlayer = nextPlayer;
  game.turn += 1;
  game.stage = '摸牌';
  appendLog(game, `无人接牌，轮到 ${game.players[nextPlayer].name}`);
  if (game.turn > 180) {
    game.finished = true;
    game.winner = null;
    appendLog(game, '达到回合上限，牌局结束。');
  }
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function formatCost(v: number) {
  return `¥${v.toFixed(4)}`;
}

function buildTileLedger(game: RealtimeGame) {
  const setTiles = game.players.reduce((sum, p) => (
    sum + p.pengSets.reduce((s, set) => s + set.length, 0) + p.gangSets.reduce((s, set) => s + set.length, 0)
  ), 0);
  const revealedMagicTiles = game.players.reduce((sum, p) => sum + p.magicReveals.length, 0);
  const opponentHidden = game.players.slice(1).reduce((sum, p) => sum + p.handCount, 0);
  const indicator = game.magicCard ? 1 : 0;
  const total = game.wall.length + game.players[0].hand.length + opponentHidden + game.tableDiscards.length + setTiles + revealedMagicTiles + indicator;
  return { total, setTiles, revealedMagicTiles, indicator };
}

/** 生成当前阶段的操作指引文本 */
function getActionGuideText(
  game: RealtimeGame,
  pendingOpponentDiscard: OpponentDiscardState | null,
  pendingOpponentClaimPrompt: OpponentClaimPromptState | null,
  myPendingClaim: ReturnType<typeof getMyPendingClaim>,
  selfDrawHuPrompt: SelfDrawHuPrompt | null,
  anGangOptions: string[],
  jiaGangOptions: string[],
  metrics: StageMetrics,
  myDrawPrompt: MyDrawPrompt | null
): string {
  if (game.finished) return '牌局已结束。';
  if (selfDrawHuPrompt) {
    return selfDrawHuPrompt.playerId === 0
      ? '你可以自摸胡牌，是否胡牌？（也可选择继续打以追求更高番型）'
      : `${game.players[selfDrawHuPrompt.playerId].name} 自摸胡牌！`;
  }
  if (myDrawPrompt) {
    return '请选择你摸到的牌';
  }
  if (pendingOpponentClaimPrompt) {
    return `请先确认是否有对手对 ${pendingOpponentClaimPrompt.tile} 进行碰/杠`;
  }
  if (game.currentPlayer === 0 && game.stage === '摸牌') {
    return '点击“摸牌”后输入本次摸到的牌（每次仅一张）';
  }
  if (pendingOpponentDiscard) {
    return `请输入你观察到的 ${game.players[pendingOpponentDiscard.playerId].name} 弃牌`;
  }
  if (myPendingClaim) {
    const suggested = suggestClaimAction(game.players[0], myPendingClaim.tile, game.magicCard);
    return `对手打出 ${myPendingClaim.tile}，你可以 ${myPendingClaim.options.hu ? '胡/' : ''}${myPendingClaim.options.peng ? '碰/' : ''}${myPendingClaim.options.gang ? '杠/' : ''}过（建议: ${suggested}）`;
  }
  if (anGangOptions.length > 0) {
    return `你有暗杠机会: ${anGangOptions.join('、')}，是否暗杠？`;
  }
  if (jiaGangOptions.length > 0) {
    return `你有加杠机会: ${jiaGangOptions.join('、')}，是否加杠？`;
  }
  if (game.currentPlayer === 0 && game.stage === '打牌') {
    return `请选择一张牌打出（推荐: ${metrics.recommendedDiscard}）`;
  }
  if (game.currentPlayer !== 0) {
    return `等待 ${game.players[game.currentPlayer].name} 操作...`;
  }
  return '等待中...';
}

export function AIAssistant() {
  // === Setup state ===
  const [setupPhase, setSetupPhase] = useState<SetupPhase>('输入财神');
  const [setupMagic, setSetupMagic] = useState('');
  const [setupHand, setSetupHand] = useState<string[]>([]);
  const [setupStarter, setSetupStarter] = useState(0);

  // === Game state ===
  const [game, setGame] = useState<RealtimeGame | null>(null);
  const [config, setConfig] = useState<LLMConfig>(defaultConfig);
  const [analysis, setAnalysis] = useState<LLMAnalysisResult | null>(null);
  const [stats, setStats] = useState<LLMUsageStats | null>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [error, setError] = useState('');
  const [isLLMRunning, setIsLLMRunning] = useState(false);
  const [llmTurnKey, setLlmTurnKey] = useState('');
  const [pendingOpponentDiscard, setPendingOpponentDiscard] = useState<OpponentDiscardState | null>(null);
  const [pendingOpponentClaimPrompt, setPendingOpponentClaimPrompt] = useState<OpponentClaimPromptState | null>(null);
  const [selectedMyDiscard, setSelectedMyDiscard] = useState('');
  const [selfDrawHuPrompt, setSelfDrawHuPrompt] = useState<SelfDrawHuPrompt | null>(null);
  const [myDrawPrompt, setMyDrawPrompt] = useState<MyDrawPrompt | null>(null);
  const [selectedDrawTile, setSelectedDrawTile] = useState('');
  const [manualOpponentId, setManualOpponentId] = useState(1);
  const [manualActionTile, setManualActionTile] = useState<string>(ALL_TILE_LABELS[0] ?? '1万');
  const [drawHint, setDrawHint] = useState('');

  const gameRef = useRef(game);
  const isAdvancingRef = useRef(false);
  useEffect(() => { gameRef.current = game; }, [game]);

  const activeGame = game ?? {
    players: PLAYER_NAMES.map((name, idx) => ({
      id: idx, name, hand: [] as string[], handCount: 0,
      discards: [] as string[], pengSets: [] as string[][],
      gangSets: [] as string[][], magicReveals: [] as string[]
    })),
    wall: [], magicCard: '', currentPlayer: 0, stage: '摸牌' as Stage,
    turn: 0, logs: [], tableDiscards: [], finished: true, winner: null,
    lastAction: '', lastDiscard: null, claimWindow: false, actionCount: 0, updatedAt: Date.now()
  };

  const currentTurnKey = `${activeGame.turn}-${activeGame.currentPlayer}-${activeGame.stage}`;
  const analysisForCurrentTurn = llmTurnKey === currentTurnKey ? analysis : null;
  const metrics = useMemo(() => buildMetrics(activeGame, analysisForCurrentTurn), [activeGame, analysisForCurrentTurn]);
  const myPendingClaim = useMemo(() => getMyPendingClaim(activeGame), [activeGame]);
  const tileLedger = useMemo(() => buildTileLedger(activeGame), [activeGame]);
  const magicVisibleRemain = useMemo(() => {
    if (!activeGame.magicCard) return 0;
    const visible = buildVisibleTileCounts(activeGame);
    return clamp(4 - (visible[activeGame.magicCard] ?? 0), 0, 4);
  }, [activeGame]);

  // 暗杠/加杠检测
  const anGangOptions = useMemo(() => {
    if (!game || game.finished || game.currentPlayer !== 0 || game.stage !== '打牌') return [];
    return findAnGangOptions(game.players[0].hand, game.magicCard);
  }, [game]);
  const jiaGangOptions = useMemo(() => {
    if (!game || game.finished || game.currentPlayer !== 0 || game.stage !== '打牌') return [];
    return findJiaGangOptions(game.players[0].hand, game.players[0].pengSets);
  }, [game]);

  const actionGuide = useMemo(() =>
    getActionGuideText(activeGame, pendingOpponentDiscard, pendingOpponentClaimPrompt, myPendingClaim, selfDrawHuPrompt, anGangOptions, jiaGangOptions, metrics, myDrawPrompt),
    [activeGame, pendingOpponentDiscard, pendingOpponentClaimPrompt, myPendingClaim, selfDrawHuPrompt, anGangOptions, jiaGangOptions, metrics, myDrawPrompt]
  );
  const decisionTips = useMemo(() => {
    const tips: string[] = [];
    if (myDrawPrompt) {
      tips.push(`摸牌决策：若摸到财神 ${activeGame.magicCard}，可记录“开财神”并继续按常规打牌。`);
    }
    if (myPendingClaim) {
      const suggested = suggestClaimAction(activeGame.players[0], myPendingClaim.tile, activeGame.magicCard);
      tips.push(`接牌决策：对手打出 ${myPendingClaim.tile}，建议 ${suggested}。`);
    }
    if (anGangOptions.length > 0) {
      tips.push(`杠牌决策：可暗杠 ${anGangOptions.join(' / ')}，优先在安全局面执行。`);
    }
    if (jiaGangOptions.length > 0) {
      tips.push(`杠牌决策：可加杠 ${jiaGangOptions.join(' / ')}，注意抬高被针对风险。`);
    }
    if (pendingOpponentDiscard?.openedMagic) {
      tips.push(`对手动作：本次已标记 ${activeGame.players[pendingOpponentDiscard.playerId].name} 先开财神。`);
    }
    if (tips.length === 0) {
      tips.push('当前无高优先级特殊动作，按“摸牌 → 打牌 → 等待”推进。');
    }
    return tips;
  }, [myDrawPrompt, myPendingClaim, anGangOptions, jiaGangOptions, pendingOpponentDiscard, activeGame]);
  useEffect(() => {
    if (!drawHint) return;
    const timer = setTimeout(() => setDrawHint(''), 1400);
    return () => clearTimeout(timer);
  }, [drawHint]);

  // === LLM helpers ===
  const buildContext = useCallback((snapshot: RealtimeGame): MahjongContext => {
    const opNames: OpponentName[] = ['下家', '对家', '上家'];
    const opponents = {} as Record<OpponentName, { discards: string[]; pengSets: string[][]; gangSets: string[][]; handCount: number; magicReveals: string[] }>;
    opNames.forEach((name, i) => {
      const p = snapshot.players[i + 1];
      opponents[name] = {
        discards: [...p.discards],
        pengSets: p.pengSets.map((s) => [...s]),
        gangSets: p.gangSets.map((s) => [...s]),
        handCount: p.handCount,
        magicReveals: [...p.magicReveals]
      };
    });
    const me = snapshot.players[0];
    return {
      hand: [...me.hand],
      magicCard: snapshot.magicCard,
      discards: { 下家: [...snapshot.players[1].discards], 对家: [...snapshot.players[2].discards], 上家: [...snapshot.players[3].discards] },
      wallCount: snapshot.wall.length,
      turn: snapshot.turn,
      stage: snapshot.stage,
      myPengSets: me.pengSets.map((s) => [...s]),
      myGangSets: me.gangSets.map((s) => [...s]),
      myMagicReveals: [...me.magicReveals],
      opponents,
      tableDiscards: [...snapshot.tableDiscards]
    };
  }, []);

  const runLLM = useCallback(async (snapshot: RealtimeGame, userMessage: string, requestHistory: ChatMessage[]) => {
    if (!config.apiKey.trim()) return null;
    setIsLLMRunning(true);
    setError('');
    try {
      const context = buildContext(snapshot);
      const llmHistory = trimHistory(requestHistory, MAX_LLM_HISTORY_MESSAGES);
      const { result, stats: usageStats } = await requestMahjongLLM(
        config,
        context,
        userMessage,
        llmHistory
      );
      setAnalysis(result);
      setStats(usageStats);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
      return null;
    } finally {
      setIsLLMRunning(false);
    }
  }, [config, buildContext]);

  const runStrategyForCurrentTurn = useCallback(async (snapshot: RealtimeGame) => {
    const turnKey = `${snapshot.turn}-${snapshot.currentPlayer}-${snapshot.stage}`;
    if (llmTurnKey === turnKey || !config.apiKey.trim()) return analysis;
    const claim = getMyPendingClaim(snapshot);
    const anGang = findAnGangOptions(snapshot.players[0].hand, snapshot.magicCard);
    const jiaGang = findJiaGangOptions(snapshot.players[0].hand, snapshot.players[0].pengSets);
    const decisionHints: string[] = [];
    if (snapshot.currentPlayer === 0 && snapshot.stage === '摸牌') {
      decisionHints.push(`若摸到财神 ${snapshot.magicCard}，请给出是否应记录开财神的建议。`);
    }
    if (claim) {
      decisionHints.push(`当前可接牌 ${claim.tile}：胡=${claim.options.hu} 碰=${claim.options.peng} 杠=${claim.options.gang}。`);
    }
    if (anGang.length > 0) {
      decisionHints.push(`当前可暗杠: ${anGang.join('、')}。`);
    }
    if (jiaGang.length > 0) {
      decisionHints.push(`当前可加杠: ${jiaGang.join('、')}。`);
    }
    const result = await runLLM(
      snapshot,
      `当前阶段=${snapshot.stage}，当前玩家=${snapshot.players[snapshot.currentPlayer].name}。请给出可执行策略，覆盖摸牌/开财神/碰杠决策。${decisionHints.join(' ')}`,
      history
    );
    if (result) setLlmTurnKey(turnKey);
    return result ?? analysis;
  }, [llmTurnKey, config.apiKey, analysis, history, runLLM]);

  // === Game actions ===
  const performDiscard = useCallback((snapshot: RealtimeGame, tile: string) => {
    const next = cloneGame(snapshot);
    const current = next.players[next.currentPlayer];
    if (next.currentPlayer === 0) {
      current.hand = sortHand(removeOneTile(current.hand, tile));
      current.handCount = current.hand.length;
    } else {
      current.handCount = Math.max(0, current.handCount - 1);
    }
    current.discards.push(tile);
    next.tableDiscards.push(tile);
    next.lastDiscard = { tile, by: next.currentPlayer };
    next.claimWindow = true;
    appendLog(next, `${current.name} 打出 ${tile}`);
    next.stage = '等待';
    return next;
  }, []);

  const applyClaimAction = useCallback((snapshot: RealtimeGame, claimerId: number, action: Exclude<ClaimAction, '过'>, tile: string) => {
    const next = cloneGame(snapshot);
    const claimer = next.players[claimerId];

    if (next.tableDiscards.length > 0) {
      next.tableDiscards = next.tableDiscards.slice(0, -1);
    }
    next.claimWindow = false;
    next.lastDiscard = null;

    if (action === '胡') {
      next.finished = true;
      next.winner = claimerId;
      appendLog(next, `${claimer.name} 接 ${tile} 胡牌，牌局结束。`);
      return next;
    }

    if (action === '碰') {
      if (claimerId === 0) {
        claimer.hand = sortHand(removeNTiles(claimer.hand, tile, 2));
        claimer.handCount = claimer.hand.length;
      } else {
        claimer.handCount = Math.max(0, claimer.handCount - 2);
      }
      claimer.pengSets.push([tile, tile, tile]);
      next.currentPlayer = claimerId;
      next.stage = '打牌';
      appendLog(next, `${claimer.name} 碰 ${tile}，进入打牌阶段。`);
      return next;
    }

    // 杠
    if (claimerId === 0) {
      claimer.hand = sortHand(removeNTiles(claimer.hand, tile, 3));
      claimer.handCount = claimer.hand.length;
    } else {
      claimer.handCount = Math.max(0, claimer.handCount - 3);
    }
    claimer.gangSets.push([tile, tile, tile, tile]);
    next.currentPlayer = claimerId;
    next.stage = '摸牌';
    appendLog(next, `${claimer.name} 杠 ${tile}，补牌后继续。`);
    return next;
  }, []);

  /** 暗杠 */
  const handleAnGang = useCallback((tile: string) => {
    if (!game || game.finished || game.currentPlayer !== 0) return;
    const next = cloneGame(game);
    const me = next.players[0];
    me.hand = sortHand(removeNTiles(me.hand, tile, 4));
    me.handCount = me.hand.length;
    me.gangSets.push([tile, tile, tile, tile]);
    appendLog(next, `我 暗杠 ${tile}，从牌墙末尾补牌。`);
    // 杠后从牌墙末尾补牌
    if (next.wall.length > 0) {
      const draw = next.wall.pop()!;
      me.hand = sortHand([...me.hand, draw]);
      me.handCount = me.hand.length;
      appendLog(next, `我 补牌 ${draw}`);
      setDrawHint(`暗杠补牌 ${draw}`);
    }
    next.stage = '打牌';
    setGame(next);
  }, [game]);

  /** 加杠 */
  const handleJiaGang = useCallback((tile: string) => {
    if (!game || game.finished || game.currentPlayer !== 0) return;
    const next = cloneGame(game);
    const me = next.players[0];
    // 从手牌移除1张，碰组升级为杠组
    me.hand = sortHand(removeOneTile(me.hand, tile));
    me.handCount = me.hand.length;
    const pengIdx = me.pengSets.findIndex((set) => set[0] === tile);
    if (pengIdx >= 0) {
      me.pengSets.splice(pengIdx, 1);
      me.gangSets.push([tile, tile, tile, tile]);
    }
    appendLog(next, `我 加杠 ${tile}，从牌墙末尾补牌。`);
    // 杠后从牌墙末尾补牌
    if (next.wall.length > 0) {
      const draw = next.wall.pop()!;
      me.hand = sortHand([...me.hand, draw]);
      me.handCount = me.hand.length;
      appendLog(next, `我 补牌 ${draw}`);
      setDrawHint(`加杠补牌 ${draw}`);
    }
    next.stage = '打牌';
    setGame(next);
  }, [game]);

  // === Auto-advance loop ===
  const advanceStep = useCallback(async () => {
    if (!game || game.finished) return;
    if (isAdvancingRef.current || isLLMRunning) return;
    if (pendingOpponentDiscard || pendingOpponentClaimPrompt || myPendingClaim || selfDrawHuPrompt || myDrawPrompt) return;

    isAdvancingRef.current = true;
    try {
      let next = cloneGame(game);

      if (next.stage === '摸牌') {
        if (next.wall.length === 0) {
          next.finished = true;
          next.winner = null;
          appendLog(next, '牌墙为空，流局。');
          setGame(next);
          return;
        }
        const current = next.players[next.currentPlayer];

        // 玩家0摸牌：让用户手动输入摸到的牌
        if (next.currentPlayer === 0) {
          const visible = buildVisibleTileCounts(next);
          const availableTiles = ALL_TILE_LABELS.filter((tile) => {
            const remain = clamp(4 - (visible[tile] ?? 0), 0, 4);
            return remain > 0;
          }).sort((a, b) => tileSortValue(a) - tileSortValue(b));
          
          appendLog(next, `等待你输入摸到的牌`);
          setGame(next);
          setMyDrawPrompt({ availableTiles });
          setSelectedDrawTile('');
          return;
        }

        // 对手摸牌：自动处理
        const draw = next.wall.shift() ?? '';
        if (draw) {
          current.handCount += 1;
          appendLog(next, `${current.name} 摸牌`);
          setDrawHint(`${current.name} 摸牌`);
          next.stage = '打牌';
          setGame(next);
          return;
        }
      }

      if (next.stage === '打牌') {
        const current = next.players[next.currentPlayer];

        if (next.currentPlayer === 0) {
          // 玩家打牌：等待用户选牌（不自动执行）
          // 触发LLM策略
          if (config.apiKey.trim()) {
            void runStrategyForCurrentTurn(next);
          }
          return; // 等待用户手动选牌
        }

        // 对手打牌：弹窗让用户输入观察到的弃牌
        const options = buildOpponentDiscardOptions(next, next.currentPlayer);
        if (options.length === 0) {
          const fallback = ALL_TILE_LABELS[Math.floor(Math.random() * ALL_TILE_LABELS.length)];
          if (!fallback) {
            resolveWaitPass(next);
            setGame(next);
            return;
          }
          next = performDiscard(next, fallback);
          setGame(next);
          return;
        }

        appendLog(next, `等待你为 ${current.name} 选择打牌`);
        setPendingOpponentDiscard({
          playerId: next.currentPlayer,
          options,
          selected: options[0],
          openedMagic: false
        });
        setGame(next);
        return;
      }

      if (next.stage === '等待') {
        if (next.claimWindow && next.lastDiscard) {
          const pending = getMyPendingClaim(next);
          if (pending) {
            // 有碰/杠/胡机会，等用户选择
            if (!next.lastAction.includes('等待你')) {
              appendLog(next, `对手打出 ${pending.tile}，等待你选择 胡/碰/杠/过`);
            }
            setGame(next);
            return;
          }
          const oppPrompt = getOpponentClaimPrompt(next);
          if (oppPrompt) {
            if (!next.lastAction.includes('等待你确认是否有对手碰/杠')) {
              appendLog(next, `对手打出 ${oppPrompt.tile}，等待你确认是否有对手碰/杠`);
            }
            setPendingOpponentClaimPrompt(oppPrompt);
            setGame(next);
            return;
          }
        }
        // 无可接牌动作，自动过
        resolveWaitPass(next);
        setGame(next);
      }
    } finally {
      isAdvancingRef.current = false;
    }
  }, [game, isLLMRunning, pendingOpponentDiscard, pendingOpponentClaimPrompt, myPendingClaim, selfDrawHuPrompt, myDrawPrompt, config.apiKey, performDiscard, runStrategyForCurrentTurn]);

  // 自动推进 useEffect
  useEffect(() => {
    if (setupPhase !== '进行中' || !game || game.finished) return;
    if (pendingOpponentDiscard || pendingOpponentClaimPrompt || myPendingClaim || selfDrawHuPrompt || myDrawPrompt) return;
    // 玩家0的摸牌/打牌都由用户触发，避免自动连环推进
    if (game.currentPlayer === 0 && (game.stage === '打牌' || game.stage === '摸牌')) return;

    const timer = setTimeout(() => {
      if (!isAdvancingRef.current && !isLLMRunning) {
        void advanceStep();
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [setupPhase, game, pendingOpponentDiscard, pendingOpponentClaimPrompt, myPendingClaim, selfDrawHuPrompt, myDrawPrompt, isLLMRunning, advanceStep]);

  // 自动触发LLM策略
  useEffect(() => {
    if (setupPhase !== '进行中' || !game) return;
    const isMyDiscard = game.currentPlayer === 0 && game.stage === '打牌' && !game.finished;
    if (!isMyDiscard || isLLMRunning || !config.apiKey.trim()) return;
    const key = `${game.turn}-${game.currentPlayer}-${game.stage}`;
    if (key === llmTurnKey) return;
    void runStrategyForCurrentTurn(game);
  }, [setupPhase, game, llmTurnKey, isLLMRunning, config.apiKey, runStrategyForCurrentTurn]);

  // === User actions ===
  const resetAll = () => {
    setSetupPhase('输入财神');
    setSetupMagic('');
    setSetupHand([]);
    setSetupStarter(0);
    setGame(null);
    setAnalysis(null);
    setStats(null);
    setHistory([]);
    setChatInput('');
    setError('');
    setLlmTurnKey('');
    setPendingOpponentDiscard(null);
    setPendingOpponentClaimPrompt(null);
    setSelectedMyDiscard('');
    setSelfDrawHuPrompt(null);
    setMyDrawPrompt(null);
    setSelectedDrawTile('');
    setManualOpponentId(1);
    setManualActionTile(ALL_TILE_LABELS[0] ?? '1万');
    setDrawHint('');
  };

  const startGame = () => {
    if (!setupMagic || setupHand.length !== 13) return;
    const newGame = createGameFromInput(setupMagic, setupHand, setupStarter);
    setGame(newGame);
    setSetupPhase('进行中');
    setAnalysis(null);
    setStats(null);
    setHistory([]);
    setError('');
    setLlmTurnKey('');
    setPendingOpponentDiscard(null);
    setPendingOpponentClaimPrompt(null);
    setSelectedMyDiscard('');
    setSelfDrawHuPrompt(null);
    setMyDrawPrompt(null);
    setSelectedDrawTile('');
    setManualOpponentId(1);
    setManualActionTile(ALL_TILE_LABELS[0] ?? '1万');
    setDrawHint('');
  };

  const confirmMyDiscard = () => {
    if (!game || game.finished || game.currentPlayer !== 0 || game.stage !== '打牌') return;
    if (!selectedMyDiscard || !game.players[0].hand.includes(selectedMyDiscard)) return;
    setGame(performDiscard(game, selectedMyDiscard));
    setSelectedMyDiscard('');
    setSelfDrawHuPrompt(null);
  };

  const handleMyClaim = (action: ClaimAction) => {
    if (!game) return;
    const pending = getMyPendingClaim(game);
    if (!pending) return;

    if (action === '过') {
      const next = cloneGame(game);
      appendLog(next, `你选择过 ${pending.tile}`);
      const oppPrompt = getOpponentClaimPrompt(next);
      if (oppPrompt) {
        setPendingOpponentClaimPrompt(oppPrompt);
        setGame(next);
        return;
      }
      resolveWaitPass(next);
      setGame(next);
      return;
    }

    setGame(applyClaimAction(game, 0, action, pending.tile));
  };

  const handleSelfDrawHuChoice = (doHu: boolean) => {
    if (!game || !selfDrawHuPrompt) return;
    setSelfDrawHuPrompt(null);
    if (doHu) {
      const next = cloneGame(game);
      next.finished = true;
      next.winner = selfDrawHuPrompt.playerId;
      appendLog(next, `${next.players[selfDrawHuPrompt.playerId].name} 自摸胡牌，牌局结束。`);
      setGame(next);
    }
    // 不胡则继续打牌阶段（game.stage 已经是 '打牌'）
  };

  const handleMyDrawConfirm = (tile: string) => {
    if (!game || !myDrawPrompt || game.currentPlayer !== 0 || game.stage !== '摸牌') return;
    const next = cloneGame(game);
    const me = next.players[0];

    // 从牌墙中移除一张（保持牌墙计数准确）
    const wallIdx = next.wall.indexOf(tile);
    if (wallIdx >= 0) {
      next.wall.splice(wallIdx, 1);
    } else if (next.wall.length > 0) {
      next.wall.pop();
    }

    me.hand = sortHand([...me.hand, tile]);
    me.handCount = me.hand.length;
    appendLog(next, tile === next.magicCard ? `我 摸牌 ${tile}（财神）` : `我 摸牌 ${tile}`);
    setDrawHint(tile === next.magicCard ? `摸到财神 ${tile}` : `摸到 ${tile}`);
    
    // 自摸胡检测
    if (canHuNow(me.hand, next.magicCard)) {
      next.stage = '打牌';
      setGame(next);
      setMyDrawPrompt(null);
      setSelectedDrawTile('');
      setSelfDrawHuPrompt({ playerId: 0 });
      return;
    }
    
    next.stage = '打牌';
    setGame(next);
    setMyDrawPrompt(null);
    setSelectedDrawTile('');
  };

  const handleMyOpenMagic = () => {
    if (!game || game.finished || game.currentPlayer !== 0 || game.stage !== '打牌') return;
    const next = cloneGame(game);
    const me = next.players[0];
    const idx = me.hand.indexOf(next.magicCard);
    if (idx < 0) return;

    me.hand = [...me.hand.slice(0, idx), ...me.hand.slice(idx + 1)];
    me.magicReveals.push(next.magicCard);
    appendLog(next, `我 开财神 ${next.magicCard}（手动）`);

    if (next.wall.length === 0) {
      next.finished = true;
      next.winner = null;
      appendLog(next, '牌墙为空，流局。');
      setGame(next);
      return;
    }

    const draw = next.wall.shift()!;
    me.hand = sortHand([...me.hand, draw]);
    me.handCount = me.hand.length;
    appendLog(next, `我 补牌 ${draw}`);
    setDrawHint(`开财神后补牌 ${draw}`);

    setGame(next);
  };

  const confirmOpponentDiscard = () => {
    if (!pendingOpponentDiscard || !game) return;
    if (game.stage !== '打牌' || game.currentPlayer !== pendingOpponentDiscard.playerId) return;
    const tile = pendingOpponentDiscard.selected || pendingOpponentDiscard.options[0];
    if (!tile) return;
    let next = cloneGame(game);
    if (pendingOpponentDiscard.openedMagic) {
      const current = next.players[pendingOpponentDiscard.playerId];
      current.magicReveals.push(next.magicCard);
      appendLog(next, `${current.name} 开财神 ${next.magicCard}（出牌阶段记录）`);
      if (next.wall.length === 0) {
        next.finished = true;
        next.winner = null;
        appendLog(next, '牌墙为空，流局。');
        setPendingOpponentDiscard(null);
        setGame(next);
        return;
      }
      next.wall.shift();
      appendLog(next, `${current.name} 开财神后补牌`);
    }
    setPendingOpponentDiscard(null);
    next = performDiscard(next, tile);
    setGame(next);
  };

  const randomOpponentDiscard = () => {
    if (!pendingOpponentDiscard) return;
    const choice = pendingOpponentDiscard.options[Math.floor(Math.random() * pendingOpponentDiscard.options.length)];
    setPendingOpponentDiscard((prev) => prev ? { ...prev, selected: choice } : prev);
  };

  const recordOpponentMeld = (action: '碰' | '杠') => {
    if (!game || game.finished) return;
    if (![1, 2, 3].includes(manualOpponentId)) return;
    const next = cloneGame(game);
    const target = next.players[manualOpponentId];
    if (!target) return;

    if (action === '碰') {
      target.pengSets.push([manualActionTile, manualActionTile, manualActionTile]);
      target.handCount = Math.max(0, target.handCount - 2);
    } else {
      target.gangSets.push([manualActionTile, manualActionTile, manualActionTile, manualActionTile]);
      target.handCount = Math.max(0, target.handCount - 3);
    }

    if (next.tableDiscards.length > 0 && next.tableDiscards[next.tableDiscards.length - 1] === manualActionTile) {
      next.tableDiscards = next.tableDiscards.slice(0, -1);
      if (next.lastDiscard?.tile === manualActionTile) {
        next.lastDiscard = null;
        next.claimWindow = false;
      }
    }

    appendLog(next, `${target.name} ${action} ${manualActionTile}（手动记录）`);
    setPendingOpponentClaimPrompt(null);
    setGame(next);
  };

  const handleOpponentClaimSelect = (selection: { playerId: number; action: '碰' | '杠' } | null) => {
    if (!game || !pendingOpponentClaimPrompt) return;
    const pending = pendingOpponentClaimPrompt;
    setPendingOpponentClaimPrompt(null);
    if (!selection) {
      const next = cloneGame(game);
      resolveWaitPass(next);
      setGame(next);
      return;
    }
    setGame(applyClaimAction(game, selection.playerId, selection.action, pending.tile));
  };

  const askCurrentStrategy = async () => {
    if (setupPhase !== '进行中' || !game) return;
    const result = await runLLM(game, `请根据当前阶段(${game.stage})提供本轮建议，并强调防止点炮。`, history);
    if (!result) return;
    setHistory((prev) => pushHistory(prev, { role: 'assistant', content: result.chatReply }, MAX_UI_HISTORY_MESSAGES));
  };

  const sendChat = async () => {
    if (setupPhase !== '进行中' || !game) return;
    const msg = chatInput.trim();
    if (!msg || isLLMRunning) return;
    const nextHistory = pushHistory(history, { role: 'user' as const, content: msg }, MAX_UI_HISTORY_MESSAGES);
    setHistory(nextHistory);
    setChatInput('');
    const result = await runLLM(game, msg, nextHistory);
    if (!result) return;
    setHistory((prev) => pushHistory(prev, { role: 'assistant', content: result.chatReply }, MAX_UI_HISTORY_MESSAGES));
  };

  // 手牌选择辅助（开局输入手牌阶段）
  const toggleHandTile = (tile: string) => {
    setSetupHand((prev) => {
      const count = prev.filter((t) => t === tile).length;
      const totalCount = prev.length;
      if (count < 4 && totalCount < 13) {
        return [...prev, tile];
      }
      // 如果已满或该牌已4张，移除最后一张该牌
      if (count > 0) {
        const idx = prev.lastIndexOf(tile);
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      }
      return prev;
    });
  };

  const me = activeGame.players[0];
  const left = activeGame.players[3];
  const top = activeGame.players[2];
  const right = activeGame.players[1];
  const canManualDiscard = setupPhase === '进行中' && !!game && game.currentPlayer === 0 && game.stage === '打牌' && !game.finished;
  const canManualDraw = setupPhase === '进行中' && !!game && game.currentPlayer === 0 && game.stage === '摸牌' && !game.finished && !myDrawPrompt;
  const canManualOpenMagic = setupPhase === '进行中' && !!game && game.currentPlayer === 0 && game.stage === '打牌' && !game.finished && game.players[0].hand.includes(game.magicCard);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {drawHint && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-800 shadow">
          {drawHint}
        </div>
      )}
      <div className="border-b-4 border-blue-900 bg-gradient-to-r from-blue-700 via-cyan-700 to-teal-700 p-4 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Brain className="h-8 w-8" />
            <div>
              <h2 className="text-xl font-bold">AI互动小游戏模式</h2>
              <p className="text-sm text-blue-100">四人三阶段: 摸牌 → 打牌 → 等待（含听牌）</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={askCurrentStrategy} disabled={setupPhase !== '进行中' || isLLMRunning} className="bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white">
              {isLLMRunning ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
              询问LLM策略
            </Button>
            <Button variant="outline" onClick={resetAll} className="bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white">
              <RefreshCcw className="mr-1 h-4 w-4" />
              重新开局
            </Button>
          </div>
        </div>
      </div>

      {setupPhase === '进行中' && game && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50 p-3">
          <Badge variant="outline">回合 {game.turn}</Badge>
          <Badge variant="outline">牌墙 {game.wall.length}</Badge>
          <Badge variant="outline">财神 {game.magicCard}</Badge>
          <Badge variant={game.finished ? 'secondary' : 'default'}>
            当前: {game.players[game.currentPlayer].name} · {game.stage}
          </Badge>
          <Badge variant="outline">动作 {game.actionCount}</Badge>
          <Badge variant="outline">牌数校验 {tileLedger.total}/{TOTAL_TILE_COUNT}</Badge>
          <Badge variant="outline">财神剩余估计 {magicVisibleRemain}（翻开1张后）</Badge>
        </div>
      )}

      {/* 操作指引条 */}
      {setupPhase === '进行中' && (
        <div className="border-b bg-amber-50 px-4 py-2">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <Activity className="h-4 w-4" />
            <span>{actionGuide}</span>
          </div>
        </div>
      )}

      <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 overflow-y-auto p-4 pb-24 xl:grid-cols-[1.9fr_1fr] xl:pb-4">
        <Card className="min-h-0 border-l-4 border-l-emerald-500">
          <CardHeader className="py-3">
            <CardTitle className="text-lg">{setupPhase === '进行中' ? '互动牌桌' : '开局准备'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {setupPhase !== '进行中' ? (
              <SetupWizard
                setupPhase={setupPhase}
                magic={setupMagic}
                hand={setupHand}
                starter={setupStarter}
                onSelectMagic={(tile) => { setSetupMagic(tile); setSetupPhase('输入手牌'); }}
                onToggleHandTile={toggleHandTile}
                onClearHand={() => setSetupHand([])}
                onToStarter={() => setSetupPhase('选庄家')}
                onStarterChange={setSetupStarter}
                onStartGame={startGame}
              />
            ) : (
              <>
                <PlayerStrip player={top} isCurrent={activeGame.currentPlayer === 2} hideHand />

                <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
                  <PlayerStrip player={left} isCurrent={activeGame.currentPlayer === 3} hideHand vertical />

                  <div className="rounded-xl border-4 border-emerald-900 bg-emerald-800 p-3 text-white">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {STAGES.map((stage) => (
                        <div
                          key={stage}
                          className={cn(
                            'rounded-full px-3 py-1 text-xs',
                            activeGame.stage === stage ? 'bg-yellow-300 text-yellow-900 animate-soft-glow' : 'bg-white/20'
                          )}
                        >
                          {stage}
                        </div>
                      ))}
                    </div>
                    <div className="rounded bg-black/20 p-2 text-sm">{activeGame.lastAction}</div>
                    <div className="mt-2 min-h-24 rounded bg-black/10 p-2">
                      <div className="mb-1 text-xs text-emerald-100">公共弃牌区</div>
                      <div className="flex flex-wrap gap-1">
                        {activeGame.tableDiscards.slice(-22).map((tile, idx) => {
                          const card = labelToCard(tile);
                          if (!card) return null;
                          return <MahjongCard key={`${tile}-${idx}`} card={card} size="sm" />;
                        })}
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                      <div className="rounded bg-black/20 p-2 text-xs">
                        <div className="font-medium text-emerald-100">摸牌分析</div>
                        <div>{metrics.phaseInsights.draw}</div>
                      </div>
                      <div className="rounded bg-black/20 p-2 text-xs">
                        <div className="font-medium text-emerald-100">打牌分析</div>
                        <div>{metrics.phaseInsights.discard}</div>
                      </div>
                      <div className="rounded bg-black/20 p-2 text-xs">
                        <div className="font-medium text-emerald-100">等待分析</div>
                        <div>{metrics.phaseInsights.wait}</div>
                      </div>
                    </div>
                  </div>

                  <PlayerStrip player={right} isCurrent={activeGame.currentPlayer === 1} hideHand vertical />
                </div>

                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="font-medium">我的手牌</div>
                    <span className="text-xs text-slate-500">点击选牌，确认打出</span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {me.hand.map((tile, idx) => {
                      const card = labelToCard(tile);
                      if (!card) return null;
                      const selected = selectedMyDiscard === tile;
                      const highlighted = metrics.recommendedDiscard === tile;
                      return (
                        <MahjongCard
                          key={`${tile}-${idx}`}
                          card={card}
                          size="sm"
                          selectable={canManualDiscard}
                          selected={selected}
                          onClick={() => { if (canManualDiscard) setSelectedMyDiscard(tile); }}
                          className={cn(highlighted && !selected && 'ring-1 ring-cyan-500')}
                        />
                      );
                    })}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {canManualDraw && (
                      <Button size="sm" variant="secondary" onClick={() => { void advanceStep(); }}>
                        摸牌
                      </Button>
                    )}
                    {canManualOpenMagic && (
                      <Button size="sm" variant="outline" onClick={handleMyOpenMagic}>
                        开财神
                      </Button>
                    )}
                    <Button size="sm" onClick={confirmMyDiscard} disabled={!canManualDiscard || !selectedMyDiscard}>
                      确认打出
                    </Button>
                    {anGangOptions.map((tile) => (
                      <Button key={`ag-${tile}`} size="sm" variant="outline" onClick={() => handleAnGang(tile)} disabled={!canManualDiscard}>
                        暗杠 {tile}
                      </Button>
                    ))}
                    {jiaGangOptions.map((tile) => (
                      <Button key={`jg-${tile}`} size="sm" variant="outline" onClick={() => handleJiaGang(tile)} disabled={!canManualDiscard}>
                        加杠 {tile}
                      </Button>
                    ))}
                  </div>

                  {/* 碰/杠/胡 选择区 */}
                  {myPendingClaim && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-amber-300 bg-amber-50 px-2 py-2">
                      <span className="text-xs text-amber-800">对手打出 {myPendingClaim.tile}：</span>
                      <Button size="sm" className="h-7" disabled={!myPendingClaim.options.hu} onClick={() => handleMyClaim('胡')}>胡</Button>
                      <Button size="sm" variant="outline" className="h-7" disabled={!myPendingClaim.options.peng} onClick={() => handleMyClaim('碰')}>碰</Button>
                      <Button size="sm" variant="outline" className="h-7" disabled={!myPendingClaim.options.gang} onClick={() => handleMyClaim('杠')}>杠</Button>
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => handleMyClaim('过')}>过</Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 右侧栏 */}
        <div className="space-y-4">
          <Card className="border-l-4 border-l-indigo-500">
            <CardHeader className="py-3">
              <CardTitle className="text-lg flex items-center gap-2"><Waves className="h-5 w-5" />阶段概率与策略</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {/* 下一步操作指引（醒目） */}
              {setupPhase === '进行中' && (
                <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3">
                  <div className="font-bold text-amber-900">{actionGuide}</div>
                </div>
              )}

              <div className="rounded bg-indigo-50 p-3">
                <div className="font-medium">摸牌阶段</div>
                <div>高价值进张概率: <strong>{pct(metrics.drawProb)}</strong></div>
                <Progress value={metrics.drawProb * 100} className="mt-2 h-2" />
                <div className="mt-1 flex flex-wrap gap-1">
                  {metrics.drawTargets.slice(0, 4).map((target) => (
                    <Badge key={target.tile} variant="outline">{target.tile} {pct(target.prob)} / 余{target.remain}</Badge>
                  ))}
                </div>
              </div>

              <div className="rounded bg-cyan-50 p-3">
                <div className="font-medium">打牌阶段</div>
                <div>推荐舍牌: <strong>{metrics.recommendedDiscard || '暂无'}</strong></div>
                <div>预计安全率: <strong>{pct(metrics.safeRate)}</strong></div>
                <Progress value={metrics.safeRate * 100} className="mt-2 h-2" />
              </div>

              <div className="rounded bg-amber-50 p-3">
                <div className="font-medium">等待阶段</div>
                <div>三家听牌压力: <strong>{pct(metrics.waitRisk)}</strong></div>
                <Progress value={metrics.waitRisk * 100} className="mt-2 h-2" />
                <div className="mt-2 space-y-1">
                  {metrics.opponents.map((op) => (
                    <div key={op.name} className="text-xs">
                      {op.name}: 听牌 {pct(op.tingProb)} · 危险花色 {op.dangerSuit}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded bg-emerald-50 p-3">
                <div className="font-medium">关键决策建议</div>
                <div className="mt-1 space-y-1">
                  {decisionTips.slice(0, 4).map((tip, idx) => (
                    <div key={`${tip}-${idx}`} className="text-xs text-slate-700">{tip}</div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="py-3">
              <CardTitle className="text-lg">当前执行策略</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!analysisForCurrentTurn && <p className="text-slate-500">进入"我的打牌阶段"后会自动尝试LLM策略推理。</p>}
              {analysisForCurrentTurn && (
                <>
                  <div className="font-semibold">{analysisForCurrentTurn.strategyName}</div>
                  <div className="rounded bg-emerald-50 p-2">{analysisForCurrentTurn.strategyExplanation}</div>
                  <div>推荐舍牌: <strong>{analysisForCurrentTurn.recommendedDiscard}</strong> · 风险: <strong>{analysisForCurrentTurn.riskLevel}</strong></div>
                  <div className="text-xs text-slate-600">{analysisForCurrentTurn.actionGuide}</div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="py-3">
              <CardTitle className="text-lg">延迟与费用</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!stats && <p className="text-slate-500">暂无请求记录</p>}
              {stats && (
                <>
                  <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-500" />延迟 {stats.latencyMs}ms</div>
                  <div className="flex items-center gap-2"><Coins className="h-4 w-4 text-slate-500" />估算成本 {formatCost(stats.estimatedCost)}</div>
                  <div className="text-xs text-slate-600">Prompt {stats.promptTokens} · Completion {stats.completionTokens}</div>
                </>
              )}
              {error && <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">{error}</div>}
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-slate-500">
            <CardHeader className="py-3">
              <CardTitle className="text-lg flex items-center gap-2"><Settings2 className="h-5 w-5" />LLM设置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="API Base URL" value={config.baseUrl} onChange={(e) => setConfig((p) => ({ ...p, baseUrl: e.target.value }))} />
              <Input placeholder="Model" value={config.model} onChange={(e) => setConfig((p) => ({ ...p, model: e.target.value }))} />
              <Input placeholder="API Key" type="password" value={config.apiKey} onChange={(e) => setConfig((p) => ({ ...p, apiKey: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" step="0.01" value={config.inputPricePerM} onChange={(e) => setConfig((p) => ({ ...p, inputPricePerM: Number(e.target.value) || 0 }))} />
                <Input type="number" step="0.01" value={config.outputPricePerM} onChange={(e) => setConfig((p) => ({ ...p, outputPricePerM: Number(e.target.value) || 0 }))} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-rose-500">
            <CardHeader className="py-3">
              <CardTitle className="text-lg flex items-center gap-2"><ShieldAlert className="h-5 w-5" />防点炮提示</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-700">
              <div>优先打与对手危险花色不同的牌，优先熟张。</div>
              <div className="rounded bg-rose-50 p-2 text-xs">
                {metrics.hasInsights
                  ? `听牌压力 ${pct(metrics.waitRisk)}，建议优先 ${metrics.safeTiles[0] ?? '安全张'}。`
                  : '当前公开信息不足，先观察首轮弃牌后再做防点炮决策。'}
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-violet-500">
            <CardHeader className="py-3">
              <CardTitle className="text-lg">对手动作录入</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="text-xs text-slate-600">可在任意时机记录对手碰/杠；开财神请在对手出牌弹窗中勾选。</div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="h-9 rounded border bg-white px-2"
                  value={manualOpponentId}
                  onChange={(e) => setManualOpponentId(Number(e.target.value))}
                >
                  <option value={1}>下家</option>
                  <option value={2}>对家</option>
                  <option value={3}>上家</option>
                </select>
                <select
                  className="h-9 rounded border bg-white px-2"
                  value={manualActionTile}
                  onChange={(e) => setManualActionTile(e.target.value)}
                >
                  {ALL_TILE_LABELS.map((tile) => (
                    <option key={`manual-${tile}`} value={tile}>{tile}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => recordOpponentMeld('碰')}>记录碰</Button>
                <Button size="sm" variant="outline" onClick={() => recordOpponentMeld('杠')}>记录杠</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="py-3">
              <CardTitle className="text-lg flex items-center gap-2"><UserRound className="h-5 w-5" />实时动作流</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-slate-700">
              {activeGame.logs.slice(0, 8).map((log, idx) => (
                <div key={`${log}-${idx}`} className="rounded bg-slate-50 px-2 py-1">{log}</div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Chat bubble */}
      <Button
        onClick={() => setBubbleOpen(true)}
        className="absolute right-5 z-20 h-14 w-14 rounded-full shadow-lg"
        style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        disabled={setupPhase !== '进行中'}
      >
        <MessageCircle className="h-6 w-6" />
      </Button>

      {/* 对手弃牌弹窗 */}
      <Dialog open={Boolean(pendingOpponentDiscard)} onOpenChange={(open) => { if (!open) setPendingOpponentDiscard(null); }}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>请输入你观察到的对手弃牌</DialogTitle>
          </DialogHeader>
          {pendingOpponentDiscard && (() => {
            const grouped = { wan: [] as string[], tong: [] as string[], tiao: [] as string[] };
            pendingOpponentDiscard.options.forEach((tile) => {
              if (tile.includes('万')) grouped.wan.push(tile);
              else if (tile.includes('筒')) grouped.tong.push(tile);
              else grouped.tiao.push(tile);
            });
            const suitSections: Array<{ key: string; label: string; tiles: string[] }> = [
              { key: 'wan', label: '万子', tiles: grouped.wan },
              { key: 'tong', label: '筒子', tiles: grouped.tong },
              { key: 'tiao', label: '条子', tiles: grouped.tiao }
            ];
            return (
              <div className="space-y-3">
                <div className="text-sm text-slate-600">
                  当前为 <strong>{game?.players[pendingOpponentDiscard.playerId].name}</strong> 的打牌阶段，请选择你在牌桌上观察到的弃牌。
                </div>
                <div className="rounded border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-800">
                  若该对手本轮先开了财神，再打出本牌，请先切换下方“已开财神”。
                </div>
                {suitSections.map((section) => (
                  <div key={section.key}>
                    <div className="mb-1 text-xs font-medium text-slate-500">{section.label}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {section.tiles.map((tile) => {
                        const card = labelToCard(tile);
                        if (!card) return null;
                        return (
                          <div
                            key={tile}
                            className={cn(
                              'rounded border p-0.5 transition',
                              pendingOpponentDiscard.selected === tile ? 'border-cyan-500 ring-1 ring-cyan-300' : 'border-transparent'
                            )}
                          >
                            <MahjongCard
                              card={card}
                              size="sm"
                              selectable
                              selected={pendingOpponentDiscard.selected === tile}
                              onClick={() => setPendingOpponentDiscard((prev) => prev ? { ...prev, selected: tile } : prev)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Button onClick={confirmOpponentDiscard}>确认</Button>
                  <Button variant="outline" onClick={randomOpponentDiscard}>随机一张</Button>
                  <Button
                    variant={pendingOpponentDiscard.openedMagic ? 'default' : 'outline'}
                    onClick={() => setPendingOpponentDiscard((prev) => prev ? { ...prev, openedMagic: !prev.openedMagic } : prev)}
                  >
                    {pendingOpponentDiscard.openedMagic ? '已开财神' : '标记开财神'}
                  </Button>
                  <span className="text-xs text-slate-500">已选: {pendingOpponentDiscard.selected}</span>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* 对手接牌确认弹窗 */}
      <Dialog open={Boolean(pendingOpponentClaimPrompt)} onOpenChange={() => {}}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>确认对手是否碰/杠</DialogTitle>
          </DialogHeader>
          {pendingOpponentClaimPrompt && (
            <div className="space-y-3">
              <div className="text-sm text-slate-600">
                {game?.players[pendingOpponentClaimPrompt.by].name} 打出 <strong>{pendingOpponentClaimPrompt.tile}</strong> 后，是否有其他对手碰/杠？
              </div>
              <div className="flex flex-wrap gap-2">
                {pendingOpponentClaimPrompt.options.map((option, idx) => (
                  <Button
                    key={`${option.playerId}-${option.action}-${idx}`}
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpponentClaimSelect(option)}
                  >
                    {game?.players[option.playerId].name} {option.action}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => handleOpponentClaimSelect(null)}>无人接牌</Button>
                <span className="text-xs text-slate-500">未确认前不会自动进入下一阶段</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 玩家摸牌输入弹窗 — 不允许手动关闭，必须选牌确认 */}
      <Dialog open={Boolean(myDrawPrompt)} onOpenChange={() => {}}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>请输入你摸到的牌</DialogTitle>
          </DialogHeader>
          {myDrawPrompt && (() => {
            const grouped = { wan: [] as string[], tong: [] as string[], tiao: [] as string[] };
            myDrawPrompt.availableTiles.forEach((tile) => {
              if (tile.includes('万')) grouped.wan.push(tile);
              else if (tile.includes('筒')) grouped.tong.push(tile);
              else grouped.tiao.push(tile);
            });
            const suitSections: Array<{ key: string; label: string; tiles: string[] }> = [
              { key: 'wan', label: '万子', tiles: grouped.wan },
              { key: 'tong', label: '筒子', tiles: grouped.tong },
              { key: 'tiao', label: '条子', tiles: grouped.tiao }
            ];
            return (
              <div className="space-y-3">
                <div className="text-sm text-slate-600">
                  轮到你摸牌，请选择你在牌桌上摸到的牌。
                </div>
                {suitSections.map((section) => (
                  <div key={section.key}>
                    <div className="mb-1 text-xs font-medium text-slate-500">{section.label}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {section.tiles.map((tile) => {
                        const card = labelToCard(tile);
                        if (!card) return null;
                        const isMagic = tile === game?.magicCard;
                        return (
                          <div
                            key={tile}
                            className={cn(
                              'relative rounded border p-0.5 transition',
                              selectedDrawTile === tile ? 'border-cyan-500 ring-1 ring-cyan-300' : 'border-transparent',
                              isMagic && 'ring-2 ring-amber-400'
                            )}
                          >
                            <MahjongCard
                              card={card}
                              size="sm"
                              selectable
                              selected={selectedDrawTile === tile}
                              onClick={() => setSelectedDrawTile(tile)}
                            />
                            {isMagic && (
                              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] text-white">
                                财
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Button onClick={() => handleMyDrawConfirm(selectedDrawTile)} disabled={!selectedDrawTile}>确认摸牌</Button>
                  <span className="text-xs text-slate-500">已选: {selectedDrawTile || '未选择'}</span>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* 自摸胡确认弹窗 */}
      <Dialog open={Boolean(selfDrawHuPrompt)} onOpenChange={(open) => { if (!open) setSelfDrawHuPrompt(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>自摸胡牌</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">你的手牌已满足胡牌条件，是否自摸胡牌？</p>
            <p className="text-xs text-slate-500">选择"继续"可以追求更高番型。</p>
            <div className="flex gap-2">
              <Button onClick={() => handleSelfDrawHuChoice(true)}>胡牌</Button>
              <Button variant="outline" onClick={() => handleSelfDrawHuChoice(false)}>继续打</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Chat 弹窗 */}
      <Dialog open={bubbleOpen} onOpenChange={setBubbleOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden p-0">
          <DialogHeader className="border-b bg-slate-50 px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4" />
              策略解释 + Chat
            </DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[calc(85vh-56px)] grid-cols-1 md:grid-cols-[1fr_1.2fr]">
            <div className="border-r bg-slate-50 p-4">
              <div className="text-xs text-slate-500">实时策略</div>
              <div className="mt-1 text-sm font-semibold">{analysisForCurrentTurn?.strategyName ?? '等待策略生成'}</div>
              <p className="mt-2 text-sm text-slate-700">{analysisForCurrentTurn?.strategyExplanation ?? '进入我的打牌阶段后会自动触发策略分析。'}</p>
              <div className="mt-3 rounded bg-white p-3 text-xs text-slate-600">
                <div>阶段: {activeGame.stage}</div>
                <div>推荐舍牌: {(analysisForCurrentTurn?.recommendedDiscard ?? metrics.recommendedDiscard) || '暂无'}</div>
                <div>点炮风险: {pct(metrics.discardRisk)}</div>
              </div>
            </div>
            <div className="flex min-h-0 flex-col">
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-2">
                  {history.length === 0 && <div className="rounded bg-slate-100 p-3 text-sm text-slate-500">示例: "现在我该保守还是进攻？"</div>}
                  {history.map((msg, idx) => (
                    <div
                      key={`${msg.role}-${idx}`}
                      className={cn(
                        'max-w-[90%] rounded px-3 py-2 text-sm',
                        msg.role === 'assistant' ? 'bg-blue-50 text-slate-800' : 'ml-auto bg-slate-900 text-white'
                      )}
                    >
                      {msg.content}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 border-t p-3">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="输入问题并发送..."
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void sendChat(); } }}
                />
                <Button size="sm" onClick={() => void sendChat()} disabled={isLLMRunning || !chatInput.trim()}>
                  {isLLMRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SetupWizard({
  setupPhase,
  magic,
  hand,
  starter,
  onSelectMagic,
  onToggleHandTile,
  onClearHand,
  onToStarter,
  onStarterChange,
  onStartGame
}: {
  setupPhase: SetupPhase;
  magic: string;
  hand: string[];
  starter: number;
  onSelectMagic: (tile: string) => void;
  onToggleHandTile: (tile: string) => void;
  onClearHand: () => void;
  onToStarter: () => void;
  onStarterChange: (starter: number) => void;
  onStartGame: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border-4 border-emerald-900 bg-emerald-800 p-4 text-white">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge className={cn('bg-white/20', setupPhase === '输入财神' && 'animate-soft-glow')}>1. 输入财神</Badge>
          <Badge className={cn('bg-white/20', setupPhase === '输入手牌' && 'animate-soft-glow')}>2. 输入手牌</Badge>
          <Badge className={cn('bg-white/20', setupPhase === '选庄家' && 'animate-soft-glow')}>3. 选庄家</Badge>
        </div>
        <div className="text-sm text-emerald-100">
          {magic ? `财神: ${magic}` : '请先选择财神'} · 手牌 {hand.length} / 13
        </div>
      </div>

      {setupPhase === '输入财神' && (
        <div className="rounded-lg border bg-white p-3">
          <div className="mb-2 text-sm font-medium">请选择本局财神（点击一张牌）</div>
          <div className="flex flex-wrap gap-1.5">
            {ALL_TILE_LABELS.map((tile) => {
              const card = labelToCard(tile);
              if (!card) return null;
              return (
                <MahjongCard
                  key={tile}
                  card={card}
                  size="sm"
                  selectable
                  onClick={() => onSelectMagic(tile)}
                />
              );
            })}
          </div>
        </div>
      )}

      {setupPhase === '输入手牌' && (
        <div className="rounded-lg border bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">选择13张手牌（每种牌可选0-4张）</div>
            <Button size="sm" variant="outline" onClick={onClearHand} disabled={hand.length === 0}>清空</Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ALL_TILE_LABELS.map((tile) => {
              const count = hand.filter((t) => t === tile).length;
              const card = labelToCard(tile);
              if (!card) return null;
              return (
                <div key={tile} className="relative">
                  <MahjongCard
                    card={card}
                    size="sm"
                    selectable
                    selected={count > 0}
                    onClick={() => onToggleHandTile(tile)}
                  />
                  {count > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
                      {count}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-xs text-slate-500">已选: {sortHand(hand).join(' ') || '暂无'}</div>
          <Button className="mt-3" onClick={onToStarter} disabled={hand.length !== 13}>下一步：选庄家</Button>
        </div>
      )}

      {setupPhase === '选庄家' && (
        <div className="rounded-lg border bg-white p-3">
          <div className="mb-2 text-sm font-medium">选择起手行动顺序（谁先摸牌）</div>
          <div className="flex flex-wrap gap-2">
            {PLAYER_NAMES.map((name, idx) => (
              <Button key={name} variant={starter === idx ? 'default' : 'outline'} onClick={() => onStarterChange(idx)}>
                {name}先手
              </Button>
            ))}
          </div>
          <div className="mt-3 rounded bg-slate-50 p-2 text-xs text-slate-600">
            财神: {magic} · 手牌: {hand.length}张 · 起手: {PLAYER_NAMES[starter]}
          </div>
          <Button className="mt-3" onClick={onStartGame}>开始互动牌局</Button>
        </div>
      )}
    </div>
  );
}

function PlayerStrip({
  player,
  isCurrent,
  hideHand,
  vertical = false
}: {
  player: PlayerState;
  isCurrent: boolean;
  hideHand: boolean;
  vertical?: boolean;
}) {
  const hiddenHandSize = hideHand ? player.handCount : player.hand.length;
  const maxShow = vertical ? 7 : hiddenHandSize;
  const hasPeng = player.pengSets.length > 0;
  const hasGang = player.gangSets.length > 0;
  const hasMagic = player.magicReveals.length > 0;
  return (
    <div className={cn('rounded-lg border bg-white p-2', isCurrent && 'border-yellow-400 ring-1 ring-yellow-300')}>
      <div className="mb-1 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1">
          <span className="font-medium">{player.name}</span>
          {hasMagic && (
            <Badge variant="outline" className="h-4 border-amber-400 bg-amber-50 px-1 text-[10px] text-amber-700">
              开财神×{player.magicReveals.length}
            </Badge>
          )}
          {hasPeng && (
            <Badge variant="outline" className="h-4 border-blue-400 bg-blue-50 px-1 text-[10px] text-blue-700">
              碰×{player.pengSets.length}
            </Badge>
          )}
          {hasGang && (
            <Badge variant="outline" className="h-4 border-purple-400 bg-purple-50 px-1 text-[10px] text-purple-700">
              杠×{player.gangSets.length}
            </Badge>
          )}
        </div>
        <span className="text-slate-500">弃牌 {player.discards.length}</span>
      </div>
      <div className={cn('flex gap-1', vertical ? 'flex-col' : 'flex-wrap')}>
        {(hideHand ? Array.from({ length: player.handCount }) : player.hand).slice(0, maxShow).map((tile, idx) => {
          if (hideHand) return <CardBack key={`${player.id}-back-${idx}`} size="sm" />;
          const card = labelToCard(tile as string);
          if (!card) return null;
          return <MahjongCard key={`${player.id}-${tile}-${idx}`} card={card} size="sm" />;
        })}
      </div>
      {(player.pengSets.length > 0 || player.gangSets.length > 0 || player.magicReveals.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {player.magicReveals.length > 0 && (
            <div className="flex items-center rounded border border-amber-300 bg-amber-50 p-1">
              <span className="mr-1 text-[10px] text-amber-700">财</span>
              {player.magicReveals.map((tile, idx) => {
                const card = labelToCard(tile);
                if (!card) return null;
                return <MahjongCard key={`${player.id}-magic-${idx}`} card={card} size="sm" />;
              })}
            </div>
          )}
          {player.pengSets.map((set, idx) => (
            <div key={`${player.id}-peng-${idx}`} className="flex rounded border bg-slate-50 p-1">
              {set.map((tile, i) => {
                const card = labelToCard(tile);
                if (!card) return null;
                return <MahjongCard key={`${tile}-${i}`} card={card} size="sm" />;
              })}
            </div>
          ))}
          {player.gangSets.map((set, idx) => (
            <div key={`${player.id}-gang-${idx}`} className="flex rounded border bg-slate-50 p-1">
              {set.map((tile, i) => {
                const card = labelToCard(tile);
                if (!card) return null;
                return <MahjongCard key={`${tile}-${i}`} card={card} size="sm" />;
              })}
            </div>
          ))}
        </div>
      )}
      {player.discards.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {player.discards.slice(-6).map((tile, idx) => {
            const card = labelToCard(tile);
            if (!card) return null;
            return <MahjongCard key={`${player.id}-d-${tile}-${idx}`} card={card} size="sm" />;
          })}
        </div>
      )}
    </div>
  );
}
