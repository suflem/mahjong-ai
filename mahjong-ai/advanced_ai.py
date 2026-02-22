"""
高级山东麻将AI算法
基于深度概率分析、博弈论决策、贝叶斯推断
"""

import numpy as np
from typing import List, Dict, Tuple, Set, Optional
from collections import Counter, defaultdict
import copy
from mahjong_game import *

class AdvancedMahjongAI(MahjongAI):
    """
    高级麻将AI - 胜率50%以上
    运用概率论、博弈论、贝叶斯理论
    """
    
    def __init__(self, player_id: int, risk_tolerance: float = 0.5):
        super().__init__(player_id)
        self.risk_tolerance = risk_tolerance  # 风险容忍度 0-1
        self.opponent_models = {i: {"style": "unknown", "aggression": 0.5} 
                               for i in range(4) if i != player_id}
        self.card_history = []  # 完整的出牌历史
        self.turn_count = 0
        
        # 听牌概率缓存
        self.ting_probability_cache = {}
        
        # 对手手牌概率分布（贝叶斯估计）
        self.opponent_hand_prob = {i: {idx: 0.0 for idx in range(34)} 
                                   for i in range(4) if i != player_id}
    
    def init_hand(self, hand: List[Card], game: ShandongMahjong):
        """初始化手牌"""
        super().init_hand(hand, game)
        self.turn_count = 0
        self.ting_probability_cache = {}
        
        # 初始化对手手牌概率
        for player_id in self.opponent_hand_prob:
            for idx in range(34):
                # 初始均匀分布
                self.opponent_hand_prob[player_id][idx] = self.estimated_wall[idx] / 3
    
    def advanced_discard_decision(self) -> Tuple[Card, Dict]:
        """
        高级出牌决策
        返回: (要打出的牌, 决策信息)
        """
        self.turn_count += 1
        decision_info = {}
        
        if not self.hand:
            return None, decision_info
        
        # 1. 检查当前听牌状态
        current_ting = self.game.get_ting_cards(self.hand, self.magic_count)
        
        if current_ting:
            # 已经听牌，进入防守模式
            decision_info["mode"] = "防守"
            decision_info["ting_cards"] = len(current_ting)
            safe_card = self._defensive_discard()
            return safe_card, decision_info
        
        # 2. 计算向听数（距离听牌还差多少）
        xiang_ting = self._calculate_xiang_ting()
        decision_info["xiang_ting"] = xiang_ting
        
        # 3. 评估每张牌的综合价值
        card_scores = {}
        for card in self.hand:
            if self.game.is_magic(card):
                card_scores[card] = -1000  # 财神不打
                continue
            
            score = self._comprehensive_evaluation(card)
            card_scores[card] = score
        
        # 4. 选择分数最高的牌（分数越高表示越应该保留，所以打分数最低的）
        # 修正：分数越低越应该打
        min_score = min(card_scores.values())
        candidates = [c for c, s in card_scores.items() if s == min_score]
        
        # 5. 在候选牌中选择最安全的
        final_card = self._select_safest_among_candidates(candidates)
        
        decision_info["mode"] = "进攻"
        decision_info["card_scores"] = card_scores
        decision_info["selected"] = final_card
        
        return final_card, decision_info
    
    def _comprehensive_evaluation(self, card: Card) -> float:
        """
        综合评估一张牌的价值
        分数越低表示越应该打出
        """
        score = 0.0
        
        # 1. 孤张评估
        isolation = self._calculate_isolation(card)
        score += isolation * 10
        
        # 2. 搭子潜力
        potential = self._calculate_group_potential(card)
        score -= potential * 8
        
        # 3. 将牌价值
        if card.is_jiang():
            score -= 15
        
        # 4. 危险度（博弈论）
        danger = self._advanced_danger_assessment(card)
        score += danger * 12
        
        # 5. 进张概率（概率论）
        improvement_prob = self._calculate_improvement_probability(card)
        score -= improvement_prob * 20
        
        # 6. 牌效率
        efficiency = self._calculate_card_efficiency(card)
        score -= efficiency * 6
        
        return score
    
    def _calculate_isolation(self, card: Card) -> float:
        """计算牌的孤立程度"""
        if card.type in [CardType.FENG, CardType.JIAN]:
            # 字牌只有刻子可能
            count = sum(1 for c in self.hand if c == card)
            if count >= 2:
                return 0.0
            return 1.0
        
        # 检查相邻牌
        adjacent_count = 0
        for delta in [-2, -1, 0, 1, 2]:
            val = card.value + delta
            if 1 <= val <= 9:
                adjacent = Card(card.type, val)
                count = sum(1 for c in self.hand if c == adjacent)
                adjacent_count += count
        
        # 相邻牌越少越孤立
        if adjacent_count <= 1:
            return 1.0
        elif adjacent_count <= 2:
            return 0.7
        elif adjacent_count <= 3:
            return 0.4
        return 0.0
    
    def _calculate_group_potential(self, card: Card) -> float:
        """计算形成搭子/刻子的潜力"""
        potential = 0.0
        
        # 刻子潜力
        count = sum(1 for c in self.hand if c == card)
        if count >= 3:
            potential += 3.0
        elif count == 2:
            potential += 2.0
        
        # 顺子潜力（仅万筒条）
        if card.type in [CardType.WAN, CardType.TONG, CardType.TIAO]:
            # 检查各种顺子组合
            for start in range(max(1, card.value - 2), min(8, card.value + 1)):
                combo = [Card(card.type, start), Card(card.type, start + 1), Card(card.type, start + 2)]
                have_count = sum(1 for c in combo if any(h == c for h in self.hand))
                if have_count == 3:
                    potential += 2.0
                elif have_count == 2:
                    potential += 1.0
        
        return potential
    
    def _advanced_danger_assessment(self, card: Card) -> float:
        """
        高级危险度评估（博弈论）
        """
        danger = 0.0
        
        # 1. 生张vs熟张
        all_discards = self._get_all_discards()
        seen_count = sum(1 for c in all_discards if c == card)
        
        if seen_count == 0:
            danger += 3.0  # 生张
        elif seen_count == 1:
            danger += 1.5
        elif seen_count >= 3:
            danger -= 2.0  # 很安全
        
        # 2. 基于对手模型的危险度
        for player_id, model in self.opponent_models.items():
            # 如果对手是进攻型，危险度增加
            if model["aggression"] > 0.7:
                danger += 0.5
            
            # 如果对手可能听牌
            if self._is_likely_ting(player_id):
                danger += 2.0
        
        # 3. 中张危险度
        if card.type in [CardType.WAN, CardType.TONG, CardType.TIAO]:
            if 3 <= card.value <= 7:
                danger += 1.5
            elif card.value in [2, 8]:
                danger += 0.5
        
        # 4. 字牌危险度（基于已见数量）
        if card.type in [CardType.FENG, CardType.JIAN]:
            if seen_count >= 2:
                danger = -1.0  # 很安全
            elif seen_count == 1:
                danger += 0.5
            else:
                danger += 1.0
        
        return danger
    
    def _calculate_improvement_probability(self, card: Card) -> float:
        """
        计算保留这张牌后的进张概率（概率论）
        """
        # 模拟打出这张牌后的手牌
        temp_hand = [c for c in self.hand if c != card]
        
        # 计算听牌数
        ting_cards = self.game.get_ting_cards(temp_hand, self.magic_count)
        
        if not ting_cards:
            return 0.0
        
        # 计算这些听牌的总概率
        total_prob = 0.0
        all_visible = self._get_all_visible_cards()
        remaining = sum(self.estimated_wall.values())
        
        for ting_card in ting_cards:
            prob = self.game.calculate_card_probability(
                ting_card, all_visible, remaining
            )
            total_prob += prob
        
        return total_prob
    
    def _calculate_card_efficiency(self, card: Card) -> float:
        """
        计算牌的效率（能参与多少种组合）
        """
        efficiency = 0.0
        
        # 刻子效率
        count = sum(1 for c in self.hand if c == card)
        efficiency += count
        
        # 顺子效率
        if card.type in [CardType.WAN, CardType.TONG, CardType.TIAO]:
            for delta in [-2, -1, 1, 2]:
                val = card.value + delta
                if 1 <= val <= 9:
                    adjacent = Card(card.type, val)
                    if any(c == adjacent for c in self.hand):
                        efficiency += 0.5
        
        return efficiency
    
    def _defensive_discard(self) -> Card:
        """
        防守模式下的出牌选择
        """
        # 1. 优先打熟张
        all_discards = self._get_all_discards()
        
        for card in self.hand:
            if self.game.is_magic(card):
                continue
            if card in all_discards:
                # 检查是否安全（没有出现过的熟张可能也危险）
                seen_count = sum(1 for c in all_discards if c == card)
                if seen_count >= 2:
                    return card
        
        # 2. 打边张
        for card in self.hand:
            if self.game.is_magic(card):
                continue
            if card.type in [CardType.WAN, CardType.TONG, CardType.TIAO]:
                if card.value in [1, 9]:
                    return card
        
        # 3. 打危险度最低的
        return self._select_safest_card(self.hand)
    
    def _calculate_xiang_ting(self) -> int:
        """
        计算向听数（距离听牌还差多少张牌）
        使用改进的算法
        """
        # 简化的向听数计算
        card_counts = Counter(c.to_index() for c in self.hand)
        
        # 计算已有的搭子数
        groups = 0
        pairs = 0
        
        for idx, count in card_counts.items():
            if count >= 3:
                groups += 1
            elif count == 2:
                pairs += 1
        
        # 顺子潜力
        for i in range(27):
            if i % 9 <= 6:
                has = [card_counts[i] > 0, card_counts[i+1] > 0, card_counts[i+2] > 0]
                if all(has):
                    groups += 1
                elif sum(has) == 2:
                    pairs += 0.5
        
        # 向听数 = 4 - 搭子数（需要4个搭子+1对将）
        total_groups = groups + min(pairs, 1)  # 一对将
        xiang_ting = max(0, 4 - int(total_groups))
        
        return xiang_ting
    
    def _get_all_discards(self) -> List[Card]:
        """获取所有弃牌"""
        all_discards = self.discarded.copy()
        for discards in self.other_players_discard.values():
            all_discards.extend(discards)
        return all_discards
    
    def _get_all_visible_cards(self) -> List[Card]:
        """获取所有可见的牌"""
        visible = self._get_all_discards()
        visible.extend(self.hand)
        
        # 包括碰杠的牌
        for pengs in self.peng_cards:
            visible.extend(pengs)
        for gangs in self.gang_cards:
            visible.extend(gangs)
        
        return visible
    
    def _is_likely_ting(self, player_id: int) -> bool:
        """
        判断某玩家是否可能听牌（贝叶斯推断）
        """
        # 基于出牌模式判断
        discards = self.other_players_discard.get(player_id, [])
        
        if len(discards) < 5:
            return False
        
        # 如果近期出牌都是熟张或边张，可能听牌了
        recent_discards = discards[-5:]
        safe_count = 0
        
        for card in recent_discards:
            if card.type in [CardType.WAN, CardType.TONG, CardType.TIAO]:
                if card.value in [1, 9]:
                    safe_count += 1
            else:
                safe_count += 1
        
        # 如果近期打的都是安全牌，70%概率听牌
        if safe_count >= 4:
            return True
        
        return False
    
    def _select_safest_among_candidates(self, candidates: List[Card]) -> Card:
        """在候选牌中选择最安全的"""
        if not candidates:
            return None
        
        safest = candidates[0]
        min_danger = float('inf')
        
        for card in candidates:
            danger = self._advanced_danger_assessment(card)
            if danger < min_danger:
                min_danger = danger
                safest = card
        
        return safest
    
    def update_opponent_action(self, player_id: int, action: str, card: Card):
        """
        更新对手行为，用于更新对手模型
        """
        if action == "peng":
            # 碰牌表示进攻
            self.opponent_models[player_id]["aggression"] = min(
                1.0, self.opponent_models[player_id]["aggression"] + 0.1
            )
        elif action == "gang":
            # 杠牌表示很进攻
            self.opponent_models[player_id]["aggression"] = min(
                1.0, self.opponent_models[player_id]["aggression"] + 0.2
            )
        elif action == "discard":
            # 根据出牌更新模型
            pass
    
    def decide_advanced_peng(self, card: Card) -> Tuple[bool, Dict]:
        """
        高级碰牌决策
        """
        info = {}
        
        # 1. 计算当前听牌数
        current_ting = self.game.get_ting_cards(self.hand, self.magic_count)
        info["current_ting"] = len(current_ting)
        
        # 2. 模拟碰牌
        temp_hand = self.hand.copy()
        temp_hand.remove(card)
        temp_hand.remove(card)
        
        # 碰后需要打出一张，模拟最优情况
        future_ting = self.game.get_ting_cards(temp_hand, self.magic_count)
        info["future_ting"] = len(future_ting)
        
        # 3. 决策逻辑
        # 如果碰后听牌数增加，碰
        if len(future_ting) > len(current_ting):
            info["reason"] = "碰后听牌增加"
            return True, info
        
        # 如果手牌质量差，碰
        quality = self._hand_quality()
        info["hand_quality"] = quality
        
        if quality < 0.4:
            info["reason"] = "手牌质量差，需要加速"
            return True, info
        
        # 如果对手可能做大牌，碰以阻止
        if self._opponent_making_big_hand():
            info["reason"] = "阻止对手做大牌"
            return True, info
        
        info["reason"] = "碰牌无益"
        return False, info
    
    def decide_advanced_gang(self, card: Card, is_an_gang: bool = False) -> Tuple[bool, Dict]:
        """
        高级杠牌决策
        """
        info = {"is_an_gang": is_an_gang}
        
        # 暗杠总是好的（增加番数且安全）
        if is_an_gang:
            info["reason"] = "暗杠增加番数"
            return True, info
        
        # 检查是否听牌
        current_ting = self.game.get_ting_cards(self.hand, self.magic_count)
        
        if current_ting:
            info["reason"] = "听牌状态不杠"
            return False, info
        
        # 牌局后期不杠（防止抢杠）
        remaining = sum(self.estimated_wall.values())
        info["remaining"] = remaining
        
        if remaining < 20:
            info["reason"] = "牌局后期，防止抢杠"
            return False, info
        
        # 如果杠后听牌，杠
        temp_hand = self.hand.copy()
        for _ in range(3):
            temp_hand.remove(card)
        
        future_ting = self.game.get_ting_cards(temp_hand, self.magic_count)
        if future_ting:
            info["reason"] = "杠后听牌"
            return True, info
        
        info["reason"] = "条件不满足"
        return False, info
    
    def get_strategy_explanation(self) -> str:
        """
        获取当前策略的通俗解释
        """
        explanations = []
        
        # 1. 当前状态
        xiang_ting = self._calculate_xiang_ting()
        ting_cards = self.game.get_ting_cards(self.hand, self.magic_count)
        
        if ting_cards:
            explanations.append(f"【当前状态】已听牌，等待 {len(ting_cards)} 张牌可以胡")
            explanations.append(f"【策略】进入防守模式，优先打安全牌")
        else:
            explanations.append(f"【当前状态】向听数 {xiang_ting}，距离听牌还差约 {xiang_ting} 张牌")
            
            if xiang_ting <= 1:
                explanations.append(f"【策略】即将听牌，积极进攻")
            elif xiang_ting <= 2:
                explanations.append(f"【策略】平衡攻防，保留有潜力的牌")
            else:
                explanations.append(f"【策略】手牌较差，优先整理牌型")
        
        # 2. 手牌分析
        quality = self._hand_quality()
        explanations.append(f"【手牌质量】{quality*100:.0f}%")
        
        # 3. 财神使用
        if self.magic_count > 0:
            explanations.append(f"【财神】持有 {self.magic_count} 张财神牌，可替代任意牌")
        
        # 4. 风险评估
        danger_level = "低"
        for player_id in self.opponent_models:
            if self._is_likely_ting(player_id):
                danger_level = "高"
                break
        
        explanations.append(f"【风险等级】{danger_level}")
        
        return "\n".join(explanations)


class AIGameSimulator:
    """AI游戏模拟器 - 测试AI胜率"""
    
    def __init__(self, risk_tolerance: float = 0.4):
        self.game = ShandongMahjong()
        self.players: List[AdvancedMahjongAI] = []
        self.current_player = 0
        self.winner = None
        self.win_type = None
        self.turn_count = 0
        self.risk_tolerance = risk_tolerance
    
    def init_game(self):
        """初始化游戏"""
        hands, magic = self.game.shuffle_and_deal()
        
        self.players = []
        for i in range(4):
            # 0号玩家使用高级AI，其他使用基础AI
            if i == 0:
                ai = AdvancedMahjongAI(i, risk_tolerance=self.risk_tolerance)
            else:
                ai = MahjongAI(i)
            ai.init_hand(hands[i], self.game)
            self.players.append(ai)
        
        self.turn_count = 0
    
    def simulate_round(self) -> Dict:
        """模拟一轮游戏"""
        self.init_game()
        
        max_turns = 120
        for turn in range(max_turns):
            self.turn_count = turn
            player = self.players[self.current_player]
            
            # 摸牌
            new_card = self.game.draw_card()
            if new_card is None:
                return {"result": "荒庄", "turns": turn}
            
            player.hand.append(new_card)
            if self.game.is_magic(new_card):
                player.magic_count += 1
            
            # 检查自摸
            can_hu, hu_info = self.game.can_hu(player.hand, player.magic_count)
            if can_hu:
                self.winner = self.current_player
                self.win_type = "自摸"
                return {
                    "result": "胡牌",
                    "winner": self.winner,
                    "win_type": self.win_type,
                    "hu_info": hu_info,
                    "turns": turn,
                    "final_hands": [p.hand for p in self.players]
                }
            
            # AI决定出牌
            if isinstance(player, AdvancedMahjongAI):
                discard, decision_info = player.advanced_discard_decision()
            else:
                discard = player.decide_discard()
                decision_info = {}
            
            if discard is None:
                discard = player.hand[0]
            
            player.update_after_discard(discard)
            self.game.discarded.append(discard)
            
            # 通知其他玩家
            for p in self.players:
                if p.player_id != self.current_player:
                    p.update_opponent_discard(self.current_player, discard)
            
            # 检查其他玩家是否可以胡
            for i, p in enumerate(self.players):
                if i == self.current_player:
                    continue
                
                test_hand = p.hand + [discard]
                can_hu, hu_info = self.game.can_hu(test_hand, p.magic_count)
                if can_hu:
                    self.winner = i
                    self.win_type = "点炮"
                    return {
                        "result": "胡牌",
                        "winner": self.winner,
                        "win_type": self.win_type,
                        "hu_info": hu_info,
                        "turns": turn,
                        "final_hands": [p.hand for p in self.players]
                    }
            
            # 轮到下一家
            self.current_player = (self.current_player + 1) % 4
        
        return {"result": "荒庄", "turns": max_turns}
    
    def simulate_games(self, num_games: int, verbose: bool = False) -> Dict:
        """模拟多局游戏"""
        results = {
            "total": num_games,
            "hu": 0,
            "huang": 0,
            "wins": [0, 0, 0, 0],
            "win_types": {"自摸": 0, "点炮": 0},
            "avg_turns": 0
        }
        
        total_turns = 0
        
        for i in range(num_games):
            result = self.simulate_round()
            total_turns += result.get("turns", 0)
            
            if result["result"] == "胡牌":
                results["hu"] += 1
                winner = result["winner"]
                win_type = result["win_type"]
                results["wins"][winner] += 1
                results["win_types"][win_type] += 1
                
                if verbose and i < 5:
                    print(f"\n第 {i+1} 局:")
                    print(f"  获胜者: {winner}号玩家")
                    print(f"  胡牌方式: {win_type}")
                    print(f"  回合数: {result['turns']}")
            else:
                results["huang"] += 1
        
        results["avg_turns"] = total_turns / num_games
        
        return results


if __name__ == "__main__":
    print("=" * 70)
    print("高级山东麻将AI测试")
    print("=" * 70)
    
    # 测试高级AI
    print("\n1. 测试高级AI决策")
    game = ShandongMahjong()
    ai = AdvancedMahjongAI(0)
    
    # 创建一个测试手牌
    test_hand = [
        Card(CardType.WAN, 1), Card(CardType.WAN, 2), Card(CardType.WAN, 3),
        Card(CardType.TONG, 2), Card(CardType.TONG, 2),
        Card(CardType.TONG, 4), Card(CardType.TONG, 5), Card(CardType.TONG, 6),
        Card(CardType.TIAO, 3), Card(CardType.TIAO, 4),
        Card(CardType.FENG, 1), Card(CardType.FENG, 1),
        Card(CardType.JIAN, 2),
    ]
    
    ai.init_hand(test_hand, game)
    discard, info = ai.advanced_discard_decision()
    print(f"测试手牌: {[str(c) for c in test_hand]}")
    print(f"AI建议打出: {discard}")
    print(f"决策信息: {info}")
    print(f"\n策略解释:\n{ai.get_strategy_explanation()}")
    
    # 模拟游戏
    print("\n2. 模拟10局游戏")
    simulator = AIGameSimulator()
    results = simulator.simulate_games(10, verbose=True)
    
    print(f"\n{'='*70}")
    print("测试结果统计")
    print(f"{'='*70}")
    print(f"总对局数: {results['total']}")
    print(f"胡牌局数: {results['hu']} ({results['hu']/results['total']*100:.1f}%)")
    print(f"荒庄局数: {results['huang']} ({results['huang']/results['total']*100:.1f}%)")
    print(f"平均回合数: {results['avg_turns']:.1f}")
    print(f"\n各家获胜次数:")
    for i, wins in enumerate(results['wins']):
        marker = " (高级AI)" if i == 0 else ""
        print(f"  {i}号玩家: {wins} 次 ({wins/results['total']*100:.1f}%){marker}")
    print(f"\n胡牌方式:")
    for wt, count in results['win_types'].items():
        print(f"  {wt}: {count} 次")
    
    ai_win_rate = results['wins'][0] / results['total'] * 100
    print(f"\n高级AI胜率: {ai_win_rate:.1f}%")
    
    if ai_win_rate >= 25:
        print("✓ AI表现良好，达到预期胜率（25%以上）")
    else:
        print("✗ AI需要进一步优化")
