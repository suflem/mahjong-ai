# 麻将 LLM 助手

一个可直接在线访问的山东麻将教学与实战辅助项目。  
当前以 **Vercel 部署的 Web 界面** 为主要使用入口，仓库用于展示工程实现与可复现流程。

## 在线演示

- Demo: `https://<your-vercel-domain>.vercel.app`
- 建议把你实际线上地址替换上面占位符，作为 GitHub 首页第一入口

## 项目亮点

- 互动式新手训练：10 课逐步学习规则、牌型与决策
- 三阶段牌局流程：摸牌 -> 打牌 -> 等待
- 实时策略面板：推荐舍牌、风险等级、动作指引
- LLM 策略解释：按牌局上下文输出结构化建议（JSON）
- 麻将规则约束：万/筒/条、开财神、碰/杠、清七、四扑一将

## 技术栈

- 前端：React 19 + TypeScript + Vite + Tailwind CSS
- UI：shadcn/ui + Radix
- 算法脚本：Python（规则引擎、模拟、自对弈数据生成）
- 部署：Vercel（前端目录 `app/`）

## 仓库结构

```text
.
├── app/          # Vercel 部署的前端项目
├── mahjong-ai/   # Python 规则与实验脚本
├── docs/         # 简历/导师交付文档
└── README.md     # GitHub 首页
```

## 本地运行

```powershell
cd "S:\山东麻将AI设计\app"
npm install
npm run dev
```

生产构建：

```powershell
cd "S:\山东麻将AI设计\app"
npm run build
```

## Vercel 部署配置

当前仓库已包含：

- `app/vercel.json`
  - `buildCommand`: `npm run build`
  - `outputDirectory`: `dist`
  - `rewrites`: SPA 回退到 `index.html`

Vercel 导入仓库时，请设置：

- Framework Preset: `Vite`
- Root Directory: `app`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

## 相关文档

- 前端说明：[app/README.md](./app/README.md)
- 简历要点：[docs/RESUME_POINTS.md](./docs/RESUME_POINTS.md)
- 项目汇报：[docs/MENTOR_REPORT.md](./docs/MENTOR_REPORT.md)
- 交付清单：[docs/DELIVERY_CHECKLIST.md](./docs/DELIVERY_CHECKLIST.md)
- GitHub+Vercel打包流程：[docs/GITHUB_VERCEL_PACKAGING.md](./docs/GITHUB_VERCEL_PACKAGING.md)

