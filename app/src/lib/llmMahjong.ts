import { ALL_TILE_LABELS } from '@/lib/mahjongTiles';

export type OpponentName = '下家' | '对家' | '上家';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  inputPricePerM: number;
  outputPricePerM: number;
}

export interface LLMAnalysisResult {
  strategyName: string;
  strategyExplanation: string;
  recommendedDiscard: string;
  actionGuide: string;
  riskLevel: '低' | '中' | '高';
  confidence: number;
  ruleChecks: string[];
  chatReply: string;
}

export interface LLMUsageStats {
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  usageSource: 'api' | 'estimated';
}

export interface OpponentInfo {
  discards: string[];
  pengSets: string[][];
  gangSets: string[][];
  handCount: number;
  magicReveals: string[];
}

export interface MahjongContext {
  hand: string[];
  magicCard: string;
  discards: Record<OpponentName, string[]>;
  /** 扩展字段 — 完整牌局状态 */
  wallCount: number;
  turn: number;
  stage: string;
  myPengSets: string[][];
  myGangSets: string[][];
  myMagicReveals: string[];
  opponents: Record<OpponentName, OpponentInfo>;
  tableDiscards: string[];
}

interface RawChatCompletion {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

type ChatCompletionContent = string | Array<{ type?: string; text?: string }> | undefined;

const SYSTEM_PROMPT = `你是山东麻将策略引擎，只输出JSON。

## 规则
1) 牌种: 万/筒/条 1-9，每种4张，共108张。
2) 财神(百搭): 开局翻出一张，该牌的所有副本均为财神，可替代任意牌。
3) 胡牌形态(二选一):
   - 四扑一将: 4组面子(顺子或刻子)+1对将，碰/杠的面子也算在内。
   - 清七: 7对子(不限花色)，财神可充当一对。
4) 碰: 手中有2张与他人弃牌相同的牌，可碰(优先级低于胡)。
5) 杠: 明杠(手中3张+他人弃牌)、暗杠(手中4张)、加杠(已碰+摸到第4张)。杠后从牌墙末尾补牌。
6) 三阶段回合: 摸牌→打牌→等待(其他玩家决定碰/杠/胡/过)。

## 核心策略原理

### 向听数分析
- 向听数 = 距离胡牌还需要的有效换牌次数。0向听=听牌，-1=已胡。
- 每次决策应优先降低向听数；向听数相同时选择有效进张数最多的路线。

### 进攻与防守切换
- 前期(牌墙>60): 以进攻为主，优先拆孤张、边张，保留搭子和对子。
- 中期(牌墙30-60): 平衡进攻与防守，注意对手碰/杠频率判断听牌概率。
- 后期(牌墙<30): 防守优先，优先打熟张(已出现过的牌)和安全牌。

### 安全牌判定
- 熟张: 已在弃牌区出现过的牌，被碰/杠的概率低。
- 对手刚打过的牌: 短期内安全(除非其他家听该牌)。
- 对手不要的花色: 某家大量弃某花色，说明该花色对该家较安全。
- 危险牌: 对手弃牌中缺少某花色，说明可能在做该花色，打该花色危险。

### 碰/杠时机
- 碰: 能直接降低向听数时碰；纯粹凑刻子但破坏顺子搭子时不碰。
- 杠: 暗杠几乎总是有利(不暴露信息+补牌)；明杠需权衡暴露信息的代价。
- 加杠: 通常有利，但后期需警惕抢杠胡。

### 清七路线判断
- 手牌中对子≥4且搭子少时，考虑走清七路线。
- 清七路线下，保留所有对子，优先弃孤张。
- 财神在清七中可当一对，等于天然多一对。

### 舍牌优先级(进攻时)
1. 孤张(无搭子无对子的牌)
2. 边张搭子(12或89)中的一张
3. 多余的对子(已有足够对子时)
4. 拆搭子(向听数不变时)

### 舍牌优先级(防守时)
1. 对手刚打过的同一张牌
2. 弃牌区已出现3张的牌(第4张绝对安全)
3. 对手大量弃出的花色中的牌
4. 19边张(被夹在顺子中的概率低)

## 输出格式(纯JSON，禁止markdown)
{
  “strategy_name”: “短中文名(如: 进攻拆孤张/防守打熟张/清七收对子)”,
  “strategy_explanation”: “基于当前牌面的详细策略分析(含向听数判断、进攻或防守理由)”,
  “recommended_discard”: “具体牌名(必须是手牌中存在的牌)”,
  “action_guide”: “碰/杠/防守的具体执行建议”,
  “risk_level”: “低|中|高”,
  “confidence”: 0.0-1.0,
  “rule_checks”: [“向听数变化”,”安全性检查”,”路线一致性”],
  “chat_reply”: “对用户的直接回复”
}`;

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length * 1.15));
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return 'https://api.openai.com/v1';
  return trimmed;
}

function toContentText(content: ChatCompletionContent): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => part.text ?? '').join('\n').trim();
}

function extractJsonText(raw: string): string {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return raw.slice(start, end + 1);
  }
  return raw.trim();
}

function clampConfidence(v: unknown): number {
  if (typeof v !== 'number' || Number.isNaN(v)) return 0.5;
  return Math.min(1, Math.max(0, v));
}

function normalizeRisk(v: unknown): '低' | '中' | '高' {
  if (v === '低' || v === '中' || v === '高') return v;
  return '中';
}

function safeArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean).slice(0, 6);
}

function normalizeDiscard(hand: string[], suggested: unknown): string {
  const str = String(suggested ?? '').trim();
  if (hand.includes(str)) return str;
  return hand[0] ?? ALL_TILE_LABELS[0];
}

function normalizeResult(hand: string[], parsed: Record<string, unknown>): LLMAnalysisResult {
  return {
    strategyName: String(parsed.strategy_name ?? '结构优先'),
    strategyExplanation: String(parsed.strategy_explanation ?? '先稳固胡牌结构，再平衡进攻与防守。'),
    recommendedDiscard: normalizeDiscard(hand, parsed.recommended_discard),
    actionGuide: String(parsed.action_guide ?? '当前以降风险为主，谨慎选择碰/杠。'),
    riskLevel: normalizeRisk(parsed.risk_level),
    confidence: clampConfidence(parsed.confidence),
    ruleChecks: safeArray(parsed.rule_checks),
    chatReply: String(parsed.chat_reply ?? '已按当前牌面给出建议。')
  };
}

function formatSets(sets: string[][]): string {
  if (sets.length === 0) return '无';
  return sets.map((s) => `[${s.join('')}]`).join(' ');
}

function buildUserPrompt(context: MahjongContext, userMessage: string, history: ChatMessage[]): string {
  const opNames: OpponentName[] = ['下家', '对家', '上家'];
  const opLines = opNames.map((name) => {
    const op = context.opponents[name];
    return [
      `${name}: 手牌${op.handCount}张`,
      `弃牌: ${op.discards.join(' ') || '无'}`,
      `碰: ${formatSets(op.pengSets)}`,
      `杠: ${formatSets(op.gangSets)}`,
      op.magicReveals.length > 0 ? `开财神: ${op.magicReveals.join(' ')}` : ''
    ].filter(Boolean).join(' | ');
  });

  const gamePhase = context.wallCount > 60 ? '前期' : context.wallCount > 30 ? '中期' : '后期';

  return [
    `=== 牌局状态 ===`,
    `回合: ${context.turn} | 阶段: ${context.stage} | 牌墙剩余: ${context.wallCount} (${gamePhase})`,
    `财神: ${context.magicCard}`,
    ``,
    `=== 我的信息 ===`,
    `手牌(${context.hand.length}张): ${context.hand.join(' ') || '空'}`,
    `碰: ${formatSets(context.myPengSets)}`,
    `杠: ${formatSets(context.myGangSets)}`,
    context.myMagicReveals.length > 0 ? `开财神: ${context.myMagicReveals.join(' ')}` : '',
    ``,
    `=== 对手信息 ===`,
    ...opLines,
    ``,
    `=== 公共弃牌区(最近) ===`,
    context.tableDiscards.slice(-20).join(' ') || '无',
    ``,
    history.length > 0 ? `=== 最近对话 ===\n${history.slice(-4).map((m) => `${m.role}: ${m.content}`).join('\n')}` : '',
    `=== 用户请求 ===`,
    userMessage
  ].filter(Boolean).join('\n');
}

export async function requestMahjongLLM(
  config: LLMConfig,
  context: MahjongContext,
  userMessage: string,
  history: ChatMessage[]
): Promise<{ result: LLMAnalysisResult; stats: LLMUsageStats }> {
  if (!config.apiKey.trim()) {
    throw new Error('请先填写API Key');
  }
  if (context.hand.length === 0) {
    throw new Error('手牌为空');
  }
  if (!context.magicCard) {
    throw new Error('请先设置财神');
  }

  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const prompt = buildUserPrompt(context, userMessage, history);
  const startedAt = performance.now();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey.trim()}`
    },
    body: JSON.stringify({
      model: config.model.trim() || 'gpt-4.1-mini',
      temperature: config.temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]
    })
  });

  const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`接口请求失败 (${response.status}): ${detail || '无响应详情'}`);
  }

  const data = (await response.json()) as RawChatCompletion;
  const rawContent = toContentText(data.choices?.[0]?.message?.content);
  const jsonText = extractJsonText(rawContent);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    parsed = {
      strategy_name: '解析降级',
      strategy_explanation: '模型返回非标准JSON，已使用降级策略。',
      recommended_discard: context.hand[0] ?? ALL_TILE_LABELS[0],
      action_guide: '建议重新提问并保持输入格式简洁。',
      risk_level: '中',
      confidence: 0.35,
      rule_checks: ['返回格式异常'],
      chat_reply: rawContent || '模型未返回可解析内容。'
    };
  }

  const result = normalizeResult(context.hand, parsed);
  const promptTokens = data.usage?.prompt_tokens ?? estimateTokens(`${SYSTEM_PROMPT}\n${prompt}`);
  const completionTokens = data.usage?.completion_tokens ?? estimateTokens(JSON.stringify(parsed));
  const totalTokens = data.usage?.total_tokens ?? promptTokens + completionTokens;
  const estimatedCost = (promptTokens / 1_000_000) * config.inputPricePerM + (completionTokens / 1_000_000) * config.outputPricePerM;

  return {
    result,
    stats: {
      latencyMs,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost,
      usageSource: data.usage ? 'api' : 'estimated'
    }
  };
}
