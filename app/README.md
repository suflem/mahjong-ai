# 山东麻将 AI 助手前端

`app/` 是本项目的前端交互模块，提供新手训练、互动牌局与 LLM 策略解释界面。

## 在线版本

- Demo: `https://<your-vercel-domain>.vercel.app`
- 本项目在 Vercel 上部署时，Root Directory 需设置为 `app`

## 主要功能

1. 新手训练（10 课）
- 规则讲解 + 互动练习（对子、顺子、碰杠、胡牌形态、防守）

2. 互动牌局
- 三阶段流程：摸牌 -> 打牌 -> 等待
- 支持录入财神、手牌、庄家顺序、对手弃牌与碰杠行为

3. 策略分析面板
- 阶段概率与风险提示
- 推荐舍牌、动作建议（碰/杠/防守）
- 实时动作日志

4. LLM 对话与解释
- 对接 OpenAI 风格接口
- 使用系统提示词约束输出为结构化 JSON，减少跑题

## 技术栈

- React 19 + TypeScript
- Vite 7
- Tailwind CSS + shadcn/ui
- Lucide Icons

## 本地启动

```powershell
cd "S:\山东麻将AI设计\app"
npm install
npm run dev
```

## 构建与预览

```powershell
cd "S:\山东麻将AI设计\app"
npm run build
npm run preview
```

## Vercel 部署参数

- Framework Preset: `Vite`
- Root Directory: `app`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

## LLM 使用说明

- 在页面的 LLM 设置中填写：
- `API Key`
- `Base URL`（默认 `https://api.openai.com/v1`）
- `Model`（默认 `gpt-4.1-mini`）

项目会调用 `chat/completions` 并解析 JSON 结构结果。

## 说明

- 当前默认规则是简化山东麻将（万/筒/条 + 财神）
- 部分状态由用户手工输入，适合教学演示和策略讨论，不是全自动裁判系统
