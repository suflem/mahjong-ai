import { useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Handshake,
  Hammer,
  Goal,
  Shield,
  Eye,
  Activity
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { MahjongCard } from './MahjongCard';
import { NUMBER_TILE_LABELS, labelToCard } from '@/lib/mahjongTiles';

interface TutorialStep {
  id: number;
  title: string;
  subtitle: string;
  interactive?: boolean;
  content: React.ReactNode;
}

const SUIT_SET = [
  { title: '万子', tone: 'bg-rose-50', cards: NUMBER_TILE_LABELS.wan },
  { title: '筒子', tone: 'bg-blue-50', cards: NUMBER_TILE_LABELS.tong },
  { title: '条子', tone: 'bg-emerald-50', cards: NUMBER_TILE_LABELS.tiao }
] as const;

function Tile({
  label,
  onClick,
  selected = false,
  size = 'sm'
}: {
  label: string;
  onClick?: () => void;
  selected?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const card = labelToCard(label);
  if (!card) return null;
  return (
    <MahjongCard
      card={card}
      size={size}
      selectable={Boolean(onClick)}
      selected={selected}
      onClick={onClick}
      className={cn(onClick && 'hover:-translate-y-1')}
    />
  );
}

function RuleSummary() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-50 p-4">
        <p className="text-lg font-semibold text-blue-900">本项目规则锚定</p>
        <ul className="mt-2 space-y-2 text-sm text-blue-800">
          <li className="flex items-center gap-2"><Sparkles className="h-4 w-4" />仅存在万/筒/条三类牌</li>
          <li className="flex items-center gap-2"><Sparkles className="h-4 w-4" />开财神: 财神可替任意牌</li>
          <li className="flex items-center gap-2"><Sparkles className="h-4 w-4" />支持碰/杠操作，并参与策略判断</li>
          <li className="flex items-center gap-2"><Sparkles className="h-4 w-4" />胡牌形态: 清七 或 四扑一将</li>
          <li className="flex items-center gap-2"><Sparkles className="h-4 w-4" />清七中，财神可以当作一对</li>
        </ul>
      </div>
      <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
        提示: 本教程全部案例都遵循以上规则，不再出现风牌/箭牌。
      </div>
    </div>
  );
}

function SuitRecognition() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {SUIT_SET.map((group) => (
        <div key={group.title} className={cn('rounded-lg p-3', group.tone)}>
          <p className="mb-2 font-medium text-slate-700">{group.title}</p>
          <div className="flex flex-wrap gap-1">
            {group.cards.map((label) => <Tile key={label} label={label} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function PairExercise() {
  const [selected, setSelected] = useState<number[]>([]);
  const [resultOpen, setResultOpen] = useState(false);
  const tiles = ['7筒', '7筒', '2万', '3万', '4条', '9条'];
  const isCorrect = selected.length === 2 && selected.every((idx) => tiles[idx] === '7筒');

  const toggle = (idx: number) => {
    const existed = selected.indexOf(idx);
    if (existed >= 0) {
      setSelected((prev) => [...prev.slice(0, existed), ...prev.slice(existed + 1)]);
      return;
    }
    if (selected.length < 2) {
      setSelected((prev) => [...prev, idx]);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">点出一组对子（同牌2张）：</p>
      <div className="flex flex-wrap justify-center gap-2">
        {tiles.map((label, idx) => (
          <Tile
            key={`${label}-${idx}`}
            label={label}
            selected={selected.includes(idx)}
            onClick={() => toggle(idx)}
          />
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => setResultOpen(true)} disabled={selected.length !== 2}>检查答案</Button>
        <Button variant="outline" onClick={() => { setSelected([]); setResultOpen(false); }}>
          <RotateCcw className="mr-1 h-4 w-4" />
          重置
        </Button>
      </div>
      {resultOpen && (
        <div className={cn('rounded-lg p-3 text-sm', isCorrect ? 'bg-green-50 text-green-800' : 'bg-rose-50 text-rose-700')}>
          {isCorrect ? '正确，7筒+7筒是对子。' : '未命中，对子要求完全相同的两张牌。'}
        </div>
      )}
    </div>
  );
}

function SequenceExercise() {
  const [selected, setSelected] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);
  const tiles = ['2万', '3万', '4万', '4筒', '7条', '8条'];
  const answer = ['2万', '3万', '4万'];

  const toggle = (label: string) => {
    const idx = selected.indexOf(label);
    if (idx >= 0) {
      setSelected((prev) => [...prev.slice(0, idx), ...prev.slice(idx + 1)]);
      return;
    }
    if (selected.length < 3) {
      setSelected((prev) => [...prev, label]);
    }
  };

  const isCorrect = useMemo(
    () => selected.length === 3 && selected.every((item) => answer.includes(item)),
    [selected]
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">从下列6张牌中点选一个顺子（3张连续且同花色）：</p>
      <div className="flex flex-wrap justify-center gap-2">
        {tiles.map((label, idx) => (
          <Tile key={`${label}-${idx}`} label={label} selected={selected.includes(label)} onClick={() => toggle(label)} />
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => setShowResult(true)} disabled={selected.length !== 3}>检查答案</Button>
        <Button variant="outline" onClick={() => { setSelected([]); setShowResult(false); }}>
          <RotateCcw className="mr-1 h-4 w-4" />
          重置
        </Button>
      </div>
      {showResult && (
        <div className={cn('rounded-lg p-3 text-sm', isCorrect ? 'bg-green-50 text-green-800' : 'bg-rose-50 text-rose-700')}>
          {isCorrect ? '正确，2万+3万+4万组成顺子。' : '未命中，顺子需要同花色且连续。'}
        </div>
      )}
    </div>
  );
}

function TableActionExercise() {
  const [choice, setChoice] = useState<'碰' | '杠' | '胡' | '过' | null>(null);
  const [revealed, setRevealed] = useState(false);

  const hand = ['3万', '4万', '5万', '6筒', '7筒', '8筒', '2条', '2条', '2条', '9条', '9条', '5万', '5万'];
  const discard = '5万';
  const best = '胡';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-4 border-emerald-900 bg-emerald-800 p-4 text-white">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Badge className="bg-white/20">实例牌桌</Badge>
          <span className="text-xs text-emerald-100">场景: 你已成四扑一将，别人打出关键牌</span>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <p className="mb-2 text-xs text-emerald-100">你的手牌</p>
            <div className="flex flex-wrap gap-1 rounded bg-black/15 p-2">
              {hand.map((label, idx) => <Tile key={`${label}-${idx}`} label={label} size="sm" />)}
            </div>
          </div>
          <div className="flex flex-col items-center justify-center rounded bg-black/20 px-3 py-2">
            <p className="text-xs text-emerald-100">对手打出</p>
            <Tile label={discard} size="md" />
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-slate-50 p-3">
        <p className="mb-2 text-sm text-slate-700">请选择动作：</p>
        <div className="flex flex-wrap gap-2">
          <Button variant={choice === '碰' ? 'default' : 'outline'} onClick={() => setChoice('碰')}>
            <Handshake className="mr-1 h-4 w-4" />
            碰
          </Button>
          <Button variant={choice === '杠' ? 'default' : 'outline'} onClick={() => setChoice('杠')}>
            <Hammer className="mr-1 h-4 w-4" />
            杠
          </Button>
          <Button variant={choice === '胡' ? 'default' : 'outline'} onClick={() => setChoice('胡')}>
            <Goal className="mr-1 h-4 w-4" />
            胡
          </Button>
          <Button variant={choice === '过' ? 'default' : 'outline'} onClick={() => setChoice('过')}>
            过
          </Button>
          <Button onClick={() => setRevealed(true)} disabled={!choice}>提交</Button>
        </div>
      </div>

      {revealed && choice && (
        <div className={cn('rounded-lg p-3 text-sm', choice === best ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800')}>
          {choice === best ? '正确，应直接胡牌，优先终局收益。' : `当前最优是“${best}”，不应延迟终局。`}
        </div>
      )}
    </div>
  );
}

function PengGangExercise() {
  const [choice, setChoice] = useState<'碰' | '杠' | '过' | null>(null);
  const [result, setResult] = useState(false);
  const hand = ['2万', '2万', '2万', '3万', '4万', '5万', '5条', '6条', '7条', '8筒', '8筒', '9筒', '9筒'];
  const discard = '2万';
  const best = '杠';

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-slate-50 p-3">
        <p className="text-sm text-slate-700">你手里已有三张2万，对手再打出2万：</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {hand.map((tile, idx) => <Tile key={`${tile}-${idx}`} label={tile} />)}
          <span className="mx-2 text-slate-400">|</span>
          <Tile label={discard} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant={choice === '碰' ? 'default' : 'outline'} onClick={() => setChoice('碰')}>碰</Button>
        <Button variant={choice === '杠' ? 'default' : 'outline'} onClick={() => setChoice('杠')}>杠</Button>
        <Button variant={choice === '过' ? 'default' : 'outline'} onClick={() => setChoice('过')}>过</Button>
        <Button disabled={!choice} onClick={() => setResult(true)}>提交</Button>
      </div>
      {result && choice && (
        <div className={cn('rounded-lg p-3 text-sm', choice === best ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800')}>
          {choice === best ? '正确，已有暗刻时优先杠，能补牌并提升收益。' : `本题更优动作是“${best}”。`}
        </div>
      )}
    </div>
  );
}

function SafetyDiscardExercise() {
  const [choice, setChoice] = useState<string | null>(null);
  const [result, setResult] = useState(false);
  const options = ['1万', '9万', '7条', '9条'];
  const best = '9条';

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        场景: 三家最近连续打出万子，说明万子可能更危险。当前你应优先保守，选最安全的舍牌。
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((tile) => (
          <Button key={tile} variant={choice === tile ? 'default' : 'outline'} onClick={() => setChoice(tile)}>
            {tile}
          </Button>
        ))}
        <Button disabled={!choice} onClick={() => setResult(true)}>提交</Button>
      </div>
      {result && choice && (
        <div className={cn('rounded-lg p-3 text-sm', choice === best ? 'bg-green-50 text-green-800' : 'bg-rose-50 text-rose-700')}>
          {choice === best ? '正确，9条在当前信息下更安全，优先避免点炮。' : `当前更稳是“${best}”。`}
        </div>
      )}
    </div>
  );
}

function WinPatternExercise() {
  const [selected, setSelected] = useState<'清七' | '四扑一将' | null>(null);
  const [result, setResult] = useState(false);
  const caseTiles = ['1筒', '1筒', '2筒', '2筒', '3筒', '3筒', '4筒', '4筒', '6筒', '6筒', '8筒', '8筒', '财神', '财神'];

  const isCorrect = selected === '清七';

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-cyan-50 p-3">
        <p className="text-sm font-medium text-cyan-900">案例: 判定胡牌类型</p>
        <p className="mt-1 text-xs text-cyan-700">牌型是同花色七对，且两张财神可当一对。</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {caseTiles.map((label, idx) => (
            label === '财神'
              ? <Badge key={`${label}-${idx}`} className="bg-yellow-400 text-yellow-900">财神</Badge>
              : <Tile key={`${label}-${idx}`} label={label} />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant={selected === '清七' ? 'default' : 'outline'} onClick={() => setSelected('清七')}>清七</Button>
        <Button variant={selected === '四扑一将' ? 'default' : 'outline'} onClick={() => setSelected('四扑一将')}>四扑一将</Button>
        <Button disabled={!selected} onClick={() => setResult(true)}>提交</Button>
      </div>
      {result && selected && (
        <div className={cn('rounded-lg p-3 text-sm', isCorrect ? 'bg-green-50 text-green-800' : 'bg-rose-50 text-rose-700')}>
          {isCorrect ? '正确，这是清七，且财神在清七可当一对。' : '不正确，本案例是清七。'}
        </div>
      )}
    </div>
  );
}

function StageFlowExercise() {
  const [stage, setStage] = useState<'摸牌' | '打牌' | '等待'>('摸牌');
  const [hand, setHand] = useState(['1万', '2万', '3万', '4万', '6万', '7万', '8筒', '8筒', '3条', '4条', '5条', '9条', '9条']);
  const [lastAction, setLastAction] = useState('点击“执行当前阶段”开始小回合。');
  const [discarded, setDiscarded] = useState<string | null>(null);

  const execute = () => {
    if (stage === '摸牌') {
      const draw = '5万';
      setHand((prev) => [...prev, draw]);
      setStage('打牌');
      setLastAction(`你摸到 ${draw}，进入打牌阶段。`);
      return;
    }
    if (stage === '等待') {
      setStage('摸牌');
      setDiscarded(null);
      setLastAction('三家都过，轮到下个摸牌回合。');
    }
  };

  const discard = (tile: string) => {
    if (stage !== '打牌') return;
    const idx = hand.indexOf(tile);
    if (idx < 0) return;
    setHand((prev) => [...prev.slice(0, idx), ...prev.slice(idx + 1)]);
    setStage('等待');
    setDiscarded(tile);
    setLastAction(`你打出 ${tile}，进入等待阶段。`);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border-4 border-emerald-900 bg-emerald-800 p-3 text-white">
        <div className="mb-2 flex flex-wrap gap-2 text-xs">
          {(['摸牌', '打牌', '等待'] as const).map((name) => (
            <span key={name} className={cn('rounded-full px-3 py-1', stage === name ? 'bg-yellow-300 text-yellow-900' : 'bg-white/20')}>
              {name}
            </span>
          ))}
        </div>
        <div className="rounded bg-black/20 p-2 text-sm">{lastAction}</div>
        <div className="mt-2 rounded bg-black/15 p-2 text-xs">
          弃牌区: {discarded ?? '暂无'}
        </div>
      </div>

      <div className="rounded-lg border bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">我的手牌</span>
          <span className="text-xs text-slate-500">打牌阶段可点击打出</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {hand.map((tile, idx) => (
            <Tile key={`${tile}-${idx}`} label={tile} onClick={stage === '打牌' ? () => discard(tile) : undefined} />
          ))}
        </div>
      </div>

      <Button onClick={execute} disabled={stage === '打牌'}>
        <Activity className="mr-1 h-4 w-4" />
        执行当前阶段
      </Button>
    </div>
  );
}

const tutorialSteps: TutorialStep[] = [
  {
    id: 1,
    title: '欢迎进入新手训练',
    subtitle: '先明确我们这套简化规则',
    content: <RuleSummary />
  },
  {
    id: 2,
    title: '认识三类牌',
    subtitle: '仅万/筒/条，共27种牌',
    content: <SuitRecognition />
  },
  {
    id: 3,
    title: '互动练习: 识别对子',
    subtitle: '先训练最基础配对',
    interactive: true,
    content: <PairExercise />
  },
  {
    id: 4,
    title: '互动练习: 识别顺子',
    subtitle: '训练连续结构判断',
    interactive: true,
    content: <SequenceExercise />
  },
  {
    id: 5,
    title: '互动练习: 碰与杠选择',
    subtitle: '理解动作收益和节奏',
    interactive: true,
    content: <PengGangExercise />
  },
  {
    id: 6,
    title: '互动练习: 实例牌桌动作',
    subtitle: '在牌桌中做碰/杠/胡决策',
    interactive: true,
    content: <TableActionExercise />
  },
  {
    id: 7,
    title: '互动练习: 等待阶段防守',
    subtitle: '读懂危险花色与安全牌',
    interactive: true,
    content: <SafetyDiscardExercise />
  },
  {
    id: 8,
    title: '互动练习: 判定胡牌形态',
    subtitle: '清七 or 四扑一将',
    interactive: true,
    content: <WinPatternExercise />
  },
  {
    id: 9,
    title: '三阶段小回合',
    subtitle: '完整体验摸牌→打牌→等待',
    interactive: true,
    content: <StageFlowExercise />
  },
  {
    id: 10,
    title: '你已完成新手训练',
    subtitle: '进入AI小游戏模式实战',
    content: (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <Trophy className="h-10 w-10 text-green-600" />
        </div>
        <h3 className="text-xl font-bold text-slate-800">核心规则与三阶段已掌握</h3>
        <div className="rounded-lg bg-slate-50 p-4 text-left">
          <p className="mb-2 font-medium text-slate-700">你现在可以：</p>
          <ul className="space-y-1 text-sm text-slate-600">
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" />识别三花色结构和顺子/刻子/对子</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" />理解开财神、清七与四扑一将的差异</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" />在三阶段牌桌中做互动决策</li>
          </ul>
        </div>
      </div>
    )
  }
];

export function TutorialSystem() {
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState<number[]>([]);

  const step = tutorialSteps[currentStep];
  const progress = ((currentStep + 1) / tutorialSteps.length) * 100;

  const next = () => {
    if (currentStep >= tutorialSteps.length - 1) return;
    if (!completed.includes(step.id)) {
      setCompleted((prev) => [...prev, step.id]);
    }
    setCurrentStep((prev) => prev + 1);
  };

  const prev = () => {
    if (currentStep === 0) return;
    setCurrentStep((prev) => prev - 1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="h-6 w-6" />
            <div>
              <h2 className="text-lg font-bold">新手训练</h2>
              <p className="text-sm text-blue-100">第 {currentStep + 1} / {tutorialSteps.length} 课</p>
            </div>
          </div>
          <Badge variant="secondary" className="bg-white/20 text-white">{Math.round(progress)}%</Badge>
        </div>
        <Progress value={progress} className="h-2 bg-white/20" />
      </div>

      <div className="flex gap-1 overflow-x-auto bg-slate-100 p-2">
        {tutorialSteps.map((item, index) => (
          <button
            key={item.id}
            onClick={() => setCurrentStep(index)}
            className={cn(
              'h-8 w-8 shrink-0 rounded-full text-xs font-medium transition-colors',
              index === currentStep ? 'bg-blue-600 text-white' : completed.includes(item.id) ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-600'
            )}
          >
            {completed.includes(item.id) ? <CheckCircle2 className="mx-auto h-4 w-4" /> : index + 1}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <Card className="mx-auto max-w-4xl">
          <CardHeader className="pb-3">
            <div className="mb-1 flex items-center gap-2">
              <Badge variant="outline">第 {step.id} 课</Badge>
              {step.interactive && (
                <Badge className="bg-amber-500 text-white">
                  <Play className="mr-1 h-3 w-3" />
                  互动
                </Badge>
              )}
              <Badge variant="secondary" className="gap-1">
                <Eye className="h-3 w-3" />
                实例牌桌
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Shield className="h-3 w-3" />
                防守提示
              </Badge>
            </div>
            <CardTitle className="text-2xl">{step.title}</CardTitle>
            <p className="text-slate-500">{step.subtitle}</p>
          </CardHeader>
          <CardContent>{step.content}</CardContent>
        </Card>
      </div>

      <div
        className="flex items-center justify-between border-t bg-white px-4 pt-4"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <Button variant="outline" onClick={prev} disabled={currentStep === 0}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          上一课
        </Button>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <BookOpen className="h-4 w-4" />
          {currentStep + 1} / {tutorialSteps.length}
        </div>
        <Button onClick={next} disabled={currentStep === tutorialSteps.length - 1}>
          下一课
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
