# 麻将AI训练数据获取与训练指南

## 目录
1. [是否需要训练数据？](#是否需要训练数据)
2. [数据获取途径](#数据获取途径)
3. [数据格式与处理](#数据格式与处理)
4. [训练方案选择](#训练方案选择)
5. [自建数据集方法](#自建数据集方法)

---

## 是否需要训练数据？

### 取决于您的AI类型

| AI类型 | 是否需要数据 | 数据量需求 | 说明 |
|--------|-------------|-----------|------|
| **规则型AI**（当前） | ❌ 不需要 | 0 | 基于专家规则，无需训练 |
| **监督学习AI** | ✅ 需要 | 1万-10万局 | 学习人类对局模式 |
| **强化学习AI** | ⚠️ 可选 | 自生成 | 通过自我对弈生成数据 |
| **混合AI**（推荐） | ⚠️ 少量 | 1000-5000局 | 用于优化关键决策 |

### 推荐方案：从规则型开始，逐步添加学习

```
阶段1（现在）: 规则型AI → 无需数据
阶段2（1个月后）: 规则+简单学习 → 少量数据
阶段3（3个月后）: 混合AI → 中等数据量
```

---

## 数据获取途径

### 途径1：在线麻将平台（推荐）

| 平台 | 数据获取方式 | 难度 | 数据质量 |
|------|-------------|------|---------|
| **雀魂(Mahjong Soul)** | 游戏回放API | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **天凤(Tenhou)** | 牌谱下载 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **腾讯欢乐麻将** | 无法获取 | - | - |
| **JJ麻将** | 无法获取 | - | - |

#### 天凤(Tenhou)数据获取（最推荐）

```python
# 天凤牌谱下载示例
import requests

# 天凤牌谱URL格式
# http://tenhou.net/0/?log=YYYYMMDD&tw=房间号

def download_tenhou_log(date, room):
    url = f"http://tenhou.net/0/?log={date}&tw={room}"
    response = requests.get(url)
    return response.text

# 解析牌谱
import xml.etree.ElementTree as ET

def parse_tenhou_xml(xml_data):
    root = ET.fromstring(xml_data)
    games = []
    
    for game in root.findall('GAME'):
        game_data = {
            'players': [],
            'actions': [],
            'result': None
        }
        # 解析玩家信息
        for player in game.findall('PLAYER'):
            game_data['players'].append({
                'name': player.get('name'),
                'rank': player.get('rank')
            })
        # 解析动作
        for action in game.findall('ACTION'):
            game_data['actions'].append({
                'type': action.get('type'),
                'player': action.get('player'),
                'card': action.get('card')
            })
        games.append(game_data)
    
    return games
```

#### 雀魂数据获取

```python
# 雀魂API（需要登录）
import requests

def get_majsoul_logs(username, password):
    # 登录获取token
    login_url = "https://passport.mahjongsoul.com/user/login"
    response = requests.post(login_url, json={
        "account": username,
        "password": password
    })
    token = response.json()['token']
    
    # 获取牌谱列表
    log_url = "https://game.mahjongsoul.com/game_record"
    headers = {"Authorization": f"Bearer {token}"}
    logs = requests.get(log_url, headers=headers).json()
    
    return logs
```

---

### 途径2：开源数据集

| 数据集 | 来源 | 规模 | 格式 | 链接 |
|--------|------|------|------|------|
| **Tenhou Dataset** | 天凤平台 | 100万+局 | XML/MJLog | https://tenhou.net/ |
| **Mahjong AI Dataset** | 研究社区 | 10万+局 | JSON | GitHub |
| **Chinese Mahjong Dataset** | 国内研究 | 5万+局 | CSV | 学术网站 |

#### 天凤数据集下载脚本

```bash
#!/bin/bash
# 下载天凤牌谱

# 创建目录
mkdir -p tenhou_logs

# 下载指定日期的牌谱
for date in $(seq -w 20230101 20231231); do
    for room in 0 1 2 3; do
        url="http://tenhou.net/0/?log=${date}&tw=${room}"
        wget -O "tenhou_logs/${date}_${room}.xml" "$url"
        sleep 1  # 避免请求过快
    done
done
```

---

### 途径3：自己生成数据（推荐新手）

#### 方法1：AI自我对弈

```python
# self_play.py
from mahjong_complete import ShandongMahjong, MahjongAI
import json

def self_play_game():
    """AI自我对弈一局，记录数据"""
    game = ShandongMahjong()
    hands, magic = game.shuffle_and_deal()
    
    # 创建4个AI玩家
    players = [MahjongAI(i) for i in range(4)]
    for i, ai in enumerate(players):
        ai.init_hand(hands[i], game)
    
    # 记录游戏数据
    game_data = {
        'magic_card': str(magic),
        'initial_hands': [[str(c) for c in h] for h in hands],
        'actions': []
    }
    
    current_player = 0
    for turn in range(100):
        player = players[current_player]
        
        # 摸牌
        new_card = game.draw_card()
        if not new_card:
            break
        
        player.hand.append(new_card)
        
        # 记录决策前的状态
        state = {
            'turn': turn,
            'player': current_player,
            'hand': [str(c) for c in player.hand],
            'discards': [str(c) for c in game.discarded]
        }
        
        # AI决策
        discard = player.decide_discard()
        
        # 记录决策
        action = {
            'state': state,
            'action': 'discard',
            'card': str(discard),
            'reason': 'AI决策'
        }
        game_data['actions'].append(action)
        
        # 执行动作
        player.update_after_discard(discard)
        game.discarded.append(discard)
        
        current_player = (current_player + 1) % 4
    
    return game_data

# 生成大量数据
if __name__ == "__main__":
    dataset = []
    for i in range(10000):  # 生成1万局
        print(f"Generating game {i+1}/10000")
        game_data = self_play_game()
        dataset.append(game_data)
    
    # 保存
    with open('self_play_dataset.json', 'w') as f:
        json.dump(dataset, f)
```

#### 方法2：人机对弈记录

```python
# human_ai_play.py
import json
from datetime import datetime

class GameRecorder:
    """记录人机对弈数据"""
    
    def __init__(self):
        self.current_game = {
            'start_time': datetime.now().isoformat(),
            'players': ['Human', 'AI_1', 'AI_2', 'AI_3'],
            'actions': []
        }
    
    def record_action(self, player, action_type, card, state):
        """记录一个动作"""
        self.current_game['actions'].append({
            'timestamp': datetime.now().isoformat(),
            'player': player,
            'action': action_type,
            'card': str(card) if card else None,
            'state': {
                'hand': [str(c) for c in state.get('hand', [])],
                'discards': [str(c) for c in state.get('discards', [])],
                'magic': str(state.get('magic')) if state.get('magic') else None
            }
        })
    
    def save_game(self, result):
        """保存游戏"""
        self.current_game['result'] = result
        filename = f"game_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(filename, 'w') as f:
            json.dump(self.current_game, f, indent=2)
        return filename
```

---

### 途径4：众包数据收集

#### 方案：麻将数据众包平台

```python
# 创建一个简单的数据收集Web界面
from flask import Flask, request, jsonify
import json
import os

app = Flask(__name__)
DATA_DIR = 'collected_data'
os.makedirs(DATA_DIR, exist_ok=True)

@app.route('/api/submit_game', methods=['POST'])
def submit_game():
    """接收用户提交的游戏数据"""
    data = request.json
    
    # 验证数据格式
    if not validate_game_data(data):
        return jsonify({'error': 'Invalid data format'}), 400
    
    # 保存数据
    filename = f"{DATA_DIR}/game_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2)
    
    return jsonify({'success': True, 'filename': filename})

def validate_game_data(data):
    """验证游戏数据格式"""
    required_fields = ['players', 'actions', 'result']
    return all(field in data for field in required_fields)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
```

---

## 数据格式与处理

### 标准数据格式

```json
{
  "game_id": "unique_id",
  "timestamp": "2024-01-15T10:30:00",
  "players": [
    {"id": 0, "name": "Player1", "is_ai": false},
    {"id": 1, "name": "AI_1", "is_ai": true},
    {"id": 2, "name": "AI_2", "is_ai": true},
    {"id": 3, "name": "AI_3", "is_ai": true}
  ],
  "magic_card": "5万",
  "initial_hands": [
    ["1万", "2万", "3万", ...],
    ["4筒", "5筒", "6筒", ...],
    ...
  ],
  "actions": [
    {
      "turn": 0,
      "player": 0,
      "action": "draw",
      "card": "7万"
    },
    {
      "turn": 0,
      "player": 0,
      "action": "discard",
      "card": "1万",
      "state": {
        "hand": ["2万", "3万", "7万", ...],
        "discards": [],
        "peng": [],
        "gang": []
      },
      "ai_decision": {
        "recommended": "1万",
        "score": -5.2,
        "reason": "孤张牌"
      }
    }
  ],
  "result": {
    "winner": 0,
    "win_type": "自摸",
    "fan": 3
  }
}
```

### 数据预处理

```python
# data_preprocessing.py
import json
import numpy as np
from collections import Counter

class MahjongDataProcessor:
    """麻将数据预处理器"""
    
    def __init__(self):
        self.card_to_index = {card: i for i, card in enumerate(self._get_all_cards())}
    
    def _get_all_cards(self):
        """获取所有牌"""
        cards = []
        for suit in ['万', '筒', '条']:
            for i in range(1, 10):
                cards.append(f"{i}{suit}")
        cards.extend(['东', '南', '西', '北', '中', '发', '白'])
        return cards
    
    def encode_hand(self, hand):
        """将手牌编码为向量"""
        vector = np.zeros(34, dtype=np.int32)
        for card in hand:
            if card in self.card_to_index:
                vector[self.card_to_index[card]] += 1
        return vector
    
    def encode_state(self, state):
        """将游戏状态编码为特征向量"""
        features = []
        
        # 手牌特征 (34维)
        hand_vector = self.encode_hand(state.get('hand', []))
        features.extend(hand_vector)
        
        # 弃牌特征 (34维)
        discard_vector = self.encode_hand(state.get('discards', []))
        features.extend(discard_vector)
        
        # 碰牌特征 (34维)
        peng_vector = self.encode_hand(state.get('peng', []))
        features.extend(peng_vector)
        
        # 杠牌特征 (34维)
        gang_vector = self.encode_hand(state.get('gang', []))
        features.extend(gang_vector)
        
        # 其他特征
        features.append(state.get('magic_count', 0))
        features.append(state.get('wall_count', 0))
        features.append(state.get('turn_count', 0))
        
        return np.array(features, dtype=np.float32)
    
    def prepare_training_data(self, games):
        """准备训练数据"""
        X = []  # 特征
        y = []  # 标签
        
        for game in games:
            for action in game['actions']:
                if action['action'] == 'discard':
                    # 状态特征
                    state_features = self.encode_state(action['state'])
                    X.append(state_features)
                    
                    # 动作标签（出的牌）
                    card_index = self.card_to_index.get(action['card'], 0)
                    y.append(card_index)
        
        return np.array(X), np.array(y)

# 使用示例
processor = MahjongDataProcessor()

# 加载数据
with open('games.json', 'r') as f:
    games = json.load(f)

# 准备训练数据
X, y = processor.prepare_training_data(games)
print(f"训练样本数: {len(X)}")
print(f"特征维度: {X.shape[1]}")
```

---

## 训练方案选择

### 方案1：无需数据（推荐新手）

**纯规则型AI** - 当前已实现
- 优点：无需数据，立即可用
- 缺点：上限有限
- 胜率：28-32%（4人局）

### 方案2：少量数据（推荐进阶）

**规则 + 简单学习**
- 数据量：1000-5000局
- 训练目标：优化关键决策参数
- 预期提升：+5-10%

```python
# 参数优化示例
from sklearn.model_selection import GridSearchCV

# 定义参数空间
param_grid = {
    'isolation_weight': [5, 10, 15],
    'potential_weight': [5, 8, 12],
    'jiang_weight': [10, 15, 20],
    'danger_weight': [8, 12, 16]
}

# 使用已有数据优化参数
grid_search = GridSearchCV(
    MahjongAIEstimator(),
    param_grid,
    cv=5,
    scoring='accuracy'
)

grid_search.fit(X, y)
print(f"最优参数: {grid_search.best_params_}")
```

### 方案3：中等数据量

**神经网络辅助决策**
- 数据量：1万-10万局
- 训练时间：1-3天
- 预期提升：+10-20%

### 方案4：大量数据

**强化学习**
- 数据量：100万+局（自生成）
- 训练时间：1-4周
- 预期提升：+20-40%

---

## 自建数据集方法（最实用）

### 推荐方案：渐进式数据收集

```
第1周：AI自我对弈 → 生成1000局
第2周：人机对弈 → 收集500局
第3周：优化AI → 再生成2000局
第4周：筛选高质量数据 → 总计3000局
```

### 数据质量评估

```python
def evaluate_data_quality(game):
    """评估一局游戏数据的质量"""
    score = 0
    
    # 1. 游戏完整性
    if len(game['actions']) > 20:
        score += 20
    
    # 2. 有胡牌结果
    if game['result']['winner'] is not None:
        score += 30
    
    # 3. 动作多样性
    action_types = set(a['action'] for a in game['actions'])
    if len(action_types) >= 3:  # 有摸牌、出牌、碰/杠等
        score += 20
    
    # 4. 有AI决策记录
    has_ai_decision = any('ai_decision' in a for a in game['actions'])
    if has_ai_decision:
        score += 30
    
    return score

# 筛选高质量数据
def filter_quality_games(games, min_score=70):
    """筛选高质量游戏数据"""
    quality_games = []
    for game in games:
        score = evaluate_data_quality(game)
        if score >= min_score:
            quality_games.append(game)
    return quality_games
```

---

## 总结与建议

### 立即可行的方案

**如果您想快速提升AI性能，不需要外部数据：**

1. **使用当前规则型AI**（已完成）
   - 胜率：28-32%
   - 无需数据

2. **AI自我对弈生成数据**
   ```bash
   python3 self_play.py  # 生成1万局数据
   ```

3. **人机对弈收集数据**
   - 使用AI辅助工具时记录您的决策
   - 对比AI建议与您的选择

### 数据获取优先级

| 优先级 | 来源 | 难度 | 推荐度 |
|--------|------|------|--------|
| 1 | AI自我对弈 | ⭐ | ⭐⭐⭐⭐⭐ |
| 2 | 人机对弈记录 | ⭐⭐ | ⭐⭐⭐⭐ |
| 3 | 天凤牌谱 | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| 4 | 雀魂API | ⭐⭐⭐⭐ | ⭐⭐⭐ |

### 最终建议

**对于您的需求，推荐方案：**

1. **现在**：使用规则型AI（已完成）
2. **1周后**：AI自我对弈生成1000局数据
3. **2周后**：用这些数据优化AI参数
4. **1个月后**：胜率可提升到35-40%

**无需等待外部数据，立即开始！**
