# 山东麻将 AI 规则引擎与实验脚本

`mahjong-ai/` 提供 Python 侧能力：规则判定、策略实验、对局模拟、训练数据生成和参数搜索。

## 环境要求

- Python 3.10+
- 依赖：`numpy`

安装示例：

```powershell
cd "S:\山东麻将AI设计\mahjong-ai"
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

## 文件结构

- `mahjong_game.py`: 基础规则引擎（胡牌判定、吃碰杠等）
- `mahjong_complete.py`: 扩展引擎（含更多动作流程）
- `advanced_ai.py`: 高级启发式 AI 与对局模拟器
- `self_play_training.py`: 自对弈数据生成脚本
- `auto_tune_ai.py`: 黑盒参数搜索（风险参数调优）
- `strategy_guide.md`: 策略说明文档
- `data_training_guide.md`: 数据获取与训练建议

## 常用命令

### 1) 语法检查

```powershell
cd "S:\山东麻将AI设计\mahjong-ai"
python -m py_compile advanced_ai.py mahjong_game.py mahjong_complete.py self_play_training.py auto_tune_ai.py
```

### 2) 运行高级 AI 示例

```powershell
cd "S:\山东麻将AI设计\mahjong-ai"
python advanced_ai.py
```

### 3) 生成自对弈数据

```powershell
cd "S:\山东麻将AI设计\mahjong-ai"
python self_play_training.py -n 1000 -i 100
```

### 4) 参数调优（快速试跑）

```powershell
cd "S:\山东麻将AI设计\mahjong-ai"
python auto_tune_ai.py --trials 6 --games-per-trial 100 --top-k 3
```

## 当前定位

- 重点是规则可解释性与工程可复现性
- 适合课程展示、策略实验和后续模型迭代基线
- 若用于论文级评估，建议补充统一 Benchmark 与对照实验

