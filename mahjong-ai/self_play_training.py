"""
山东麻将AI自我对弈数据生成器
用于生成训练数据，支持本地运行
"""

import json
import random
import argparse
from datetime import datetime
from typing import List, Dict, Any
from mahjong_complete import ShandongMahjong, Card, CardType, MahjongAssistant

class SelfPlayGame:
    """AI自我对弈一局游戏"""
    
    def __init__(self, game_id: str):
        self.game_id = game_id
        self.game = ShandongMahjong()
        self.players = []
        self.actions = []
        self.start_time = datetime.now().isoformat()
        
    def initialize(self):
        """初始化游戏"""
        hands, magic = self.game.shuffle_and_deal()
        self.magic_card = magic
        self.initial_hands = [[str(c) for c in hand] for hand in hands]
        
        # 创建4个AI玩家
        for i in range(4):
            ai = MahjongAssistant()
            ai.set_magic(magic)
            ai.set_hand(hands[i])
            self.players.append({
                'id': i,
                'ai': ai,
                'hand': hands[i],
                'peng': [],
                'gang': [],
                'discarded': []
            })
    
    def play(self, max_turns: int = 100) -> Dict[str, Any]:
        """进行一局游戏"""
        self.initialize()
        
        current_player = 0
        winner = None
        win_type = None
        
        for turn in range(max_turns):
            player = self.players[current_player]
            
            # 摸牌
            new_card = self.game.draw_card()
            if not new_card:
                break
            
            player['hand'].append(new_card)
            
            # 记录摸牌前的状态
            state_before = {
                'hand': [str(c) for c in player['hand']],
                'discards': [str(c) for c in self.game.discarded],
                'peng': [[str(c) for c in p] for p in player['peng']],
                'gang': [[str(c) for c in g] for g in player['gang']],
                'wall_count': len(self.game.wall)
            }
            
            # AI决策
            recommendation = player['ai'].get_recommendation()
            discard = recommendation['discard_recommendation']['recommended']['card'] if recommendation['discard_recommendation'] else player['hand'][0]
            
            # 记录动作
            action = {
                'turn': turn,
                'player': current_player,
                'action': 'discard',
                'card': str(discard),
                'state_before': state_before,
                'ai_decision': {
                    'recommended': str(discard),
                    'reason': recommendation['discard_recommendation']['recommended']['reason'] if recommendation['discard_recommendation'] else '',
                    'xiang_ting': recommendation['current_status']['xiang_ting'] if recommendation else 0
                }
            }
            self.actions.append(action)
            
            # 执行动作
            player['hand'].remove(discard)
            player['discarded'].append(discard)
            self.game.discarded.append(discard)
            
            # 检查其他玩家是否可以胡
            for i, p in enumerate(self.players):
                if i == current_player:
                    continue
                test_hand = p['hand'] + [discard]
                can_hu, hu_info = self.game.can_hu(test_hand, 0)
                if can_hu:
                    winner = i
                    win_type = '点炮'
                    break
            
            if winner is not None:
                break
            
            # 检查自摸
            can_hu, hu_info = self.game.can_hu(player['hand'], 0)
            if can_hu:
                winner = current_player
                win_type = '自摸'
                break
            
            current_player = (current_player + 1) % 4
        
        return {
            'game_id': self.game_id,
            'timestamp': self.start_time,
            'magic_card': str(self.magic_card),
            'initial_hands': self.initial_hands,
            'actions': self.actions,
            'result': {
                'winner': winner,
                'win_type': win_type,
                'turns': len(self.actions),
                'final_hands': [[str(c) for c in p['hand']] for p in self.players]
            }
        }


class SelfPlayDatasetGenerator:
    """批量生成训练数据"""
    
    def __init__(self, output_dir: str = 'training_data'):
        self.output_dir = output_dir
        self.games = []
        
    def generate_games(self, count: int, save_interval: int = 100) -> List[Dict]:
        """生成指定数量的对局数据"""
        print(f"开始生成 {count} 局对局数据...")
        
        for i in range(count):
            game = SelfPlayGame(f"game_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{i}")
            game_data = game.play()
            self.games.append(game_data)
            
            if (i + 1) % save_interval == 0:
                print(f"已生成 {i + 1}/{count} 局")
                self.save_checkpoint(i + 1)
        
        print(f"完成！共生成 {count} 局数据")
        return self.games
    
    def save_checkpoint(self, count: int):
        """保存检查点"""
        filename = f"{self.output_dir}/checkpoint_{count}.json"
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(self.games, f, ensure_ascii=False, indent=2)
        print(f"检查点已保存: {filename}")
    
    def save_final(self, filename: str = None):
        """保存最终数据集"""
        if filename is None:
            filename = f"{self.output_dir}/dataset_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(self.games, f, ensure_ascii=False, indent=2)
        
        print(f"数据集已保存: {filename}")
        print(f"总对局数: {len(self.games)}")
        return filename
    
    def analyze_dataset(self) -> Dict:
        """分析数据集统计信息"""
        if not self.games:
            return {}
        
        total_turns = sum(g['result']['turns'] for g in self.games)
        zimo_count = sum(1 for g in self.games if g['result']['win_type'] == '自摸')
        dianpao_count = sum(1 for g in self.games if g['result']['win_type'] == '点炮')
        
        return {
            'total_games': len(self.games),
            'avg_turns': total_turns / len(self.games),
            'zimo_count': zimo_count,
            'dianpao_count': dianpao_count,
            'zimo_rate': zimo_count / len(self.games) * 100,
            'dianpao_rate': dianpao_count / len(self.games) * 100
        }


def main():
    parser = argparse.ArgumentParser(description='山东麻将AI自我对弈数据生成器')
    parser.add_argument('-n', '--num-games', type=int, default=1000,
                        help='生成的对局数量 (默认: 1000)')
    parser.add_argument('-o', '--output', type=str, default='training_data',
                        help='输出目录 (默认: training_data)')
    parser.add_argument('-i', '--interval', type=int, default=100,
                        help='保存检查点的间隔 (默认: 100)')
    parser.add_argument('--analyze', action='store_true',
                        help='分析已有数据集')
    
    args = parser.parse_args()
    
    import os
    os.makedirs(args.output, exist_ok=True)
    
    if args.analyze:
        # 分析已有数据
        print("分析已有数据集...")
        # 这里可以添加加载和分析已有数据的逻辑
        return
    
    # 生成数据
    generator = SelfPlayDatasetGenerator(args.output)
    generator.generate_games(args.num_games, args.interval)
    
    # 保存最终数据
    final_file = generator.save_final()
    
    # 输出统计信息
    stats = generator.analyze_dataset()
    print("\n数据集统计:")
    print(f"  总对局数: {stats['total_games']}")
    print(f"  平均回合数: {stats['avg_turns']:.1f}")
    print(f"  自摸次数: {stats['zimo_count']} ({stats['zimo_rate']:.1f}%)")
    print(f"  点炮次数: {stats['dianpao_count']} ({stats['dianpao_rate']:.1f}%)")


if __name__ == "__main__":
    main()
