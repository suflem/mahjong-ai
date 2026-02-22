import { useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AIAssistant } from '@/components/AIAssistant';
import { TutorialSystem } from '@/components/TutorialSystem';
import { Badge } from '@/components/ui/badge';
import { Wand2, TrendingUp, GraduationCap, BrainCircuit } from 'lucide-react';
import { cn } from '@/lib/utils';

function App() {
  const [activeTab, setActiveTab] = useState('tutorial');

  return (
    <div className="relative h-dvh min-h-dvh overflow-hidden bg-[linear-gradient(45deg,#f0e8d8_25%,transparent_25%,transparent_75%,#f0e8d8_75%),linear-gradient(45deg,#f0e8d8_25%,transparent_25%,transparent_75%,#f0e8d8_75%),linear-gradient(180deg,#f8f1df_0%,#ebe0c7_100%)] bg-[size:18px_18px,18px_18px,100%_100%] bg-[position:0_0,9px_9px,0_0]">
      <div className="pointer-events-none absolute -left-28 top-20 h-64 w-64 rounded-sm bg-amber-300/30 blur-3xl animate-drift" />
      <div className="pointer-events-none absolute -right-28 bottom-12 h-72 w-72 rounded-sm bg-emerald-300/25 blur-3xl animate-drift-delayed" />

      <div className="relative z-10 flex h-full min-h-0 flex-col overflow-hidden">
        <header className="border-b-4 border-stone-800 bg-white/85">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-sm border-2 border-stone-800 bg-gradient-to-br from-emerald-600 via-teal-500 to-amber-400 shadow-lg shadow-emerald-900/20">
                <Wand2 className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">山东麻将LLM助手</h1>
                <p className="text-xs text-slate-500">仅万/筒/条 · 开财神 · 碰/杠 · 清七/四扑一将</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <Badge variant="secondary" className="gap-1 rounded-sm border-2 border-emerald-900 bg-emerald-600 text-white animate-soft-glow">
                <TrendingUp className="h-3 w-3" />
                LLM策略推理
              </Badge>
              <Badge variant="outline" className="hidden gap-1 rounded-sm border-2 border-slate-700 text-slate-700 sm:flex">
                <BrainCircuit className="h-3 w-3" />
                Prompt约束输出
              </Badge>
            </div>
          </div>
        </header>

        <main
          className="mx-auto flex w-full max-w-7xl flex-1 min-h-0 flex-col px-3 pt-3 sm:px-6"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="overflow-x-auto pb-1">
              <TabsList className="h-auto min-w-full justify-start rounded-sm border-2 border-stone-700 bg-white/90 p-1 shadow-sm">
                <TabsTrigger value="tutorial" className="h-10 min-w-[110px] shrink-0 gap-2 rounded-sm px-3">
                  <GraduationCap className="h-4 w-4" />
                  新手教程
                </TabsTrigger>
                <TabsTrigger value="assistant" className="h-10 min-w-[110px] shrink-0 gap-2 rounded-sm px-3">
                  <Wand2 className="h-4 w-4" />
                  AI辅助
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="tutorial" className="mt-0 min-h-0 flex-1 animate-rise">
              <PanelShell>
                <TutorialSystem />
              </PanelShell>
            </TabsContent>

            <TabsContent value="assistant" className="mt-0 min-h-0 flex-1 animate-rise">
              <PanelShell>
                <AIAssistant />
              </PanelShell>
            </TabsContent>
          </Tabs>
        </main>

        <footer
          className="border-t-4 border-stone-800 bg-white/85 px-4 pt-2 sm:px-6"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 text-xs text-slate-500 sm:text-sm">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span>山东麻将LLM助手</span>
              <span className="hidden sm:inline">·</span>
              <span>策略与原理已并入系统提示词</span>
            </div>
            <span>输出结构化校验 · 降低偏题风险</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function PanelShell({
  children,
  className,
  scrollable = false
}: {
  children: ReactNode;
  className?: string;
  scrollable?: boolean;
}) {
  return (
    <div
      className={cn(
        'pixel-panel h-full min-h-0 border-2 border-stone-800 bg-white/92 shadow-[0_14px_45px_-26px_rgba(15,23,42,0.45)]',
        scrollable ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden',
        className
      )}
    >
      {children}
    </div>
  );
}

export default App;
