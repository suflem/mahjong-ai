# GitHub + Vercel 包装流程（实用版）

目标：把你“正在用的 Vercel 网站”包装成一个导师可看、简历可用的 GitHub 项目。

## 1. GitHub 仓库呈现规范

1. 仓库根目录放 `README.md`，第一屏必须包含：
- 项目一句话说明
- 在线 Demo 链接
- 3 个核心功能点

2. 补充文档入口：
- `app/README.md`：前端运行与部署
- `docs/MENTOR_REPORT.md`：导师汇报
- `docs/RESUME_POINTS.md`：简历文案

3. 仓库保持精简：
- 删除未使用素材与临时文件
- `.gitignore` 忽略 `node_modules/`、`dist/`、`.env*`、`.venv/`

## 2. Vercel 与 GitHub 绑定

在 Vercel 控制台导入该仓库，推荐配置：

- Root Directory: `app`
- Framework Preset: `Vite`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

如需本地配置文件校验，请参考：
- [app/vercel.json](../app/vercel.json)

## 3. Demo 链接放置位置

至少放 3 处，避免导师找不到：

1. 根 `README.md` 顶部“在线演示”
2. 仓库右侧 About 的 Website 字段
3. 项目描述第一句话（可复制到简历）

## 4. 提交前检查

```powershell
cd "S:\山东麻将AI设计\app"
npm run build

cd "S:\山东麻将AI设计\mahjong-ai"
python -m py_compile advanced_ai.py mahjong_game.py mahjong_complete.py self_play_training.py auto_tune_ai.py
```

都通过后再提交。

## 5. 推荐提交说明

```text
chore(repo): clean unused assets and docs
docs(readme): rewrite homepage for vercel demo delivery
docs(delivery): add github-vercel packaging guide
```

## 6. 导师演示建议（60-90 秒）

1. 打开 Vercel 在线站点
2. 快速展示教程页和互动实战页
3. 演示一次 LLM 推荐舍牌和风险解释
4. 回到 GitHub，说明目录结构与复现命令

