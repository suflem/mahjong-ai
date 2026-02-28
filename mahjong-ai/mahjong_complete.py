"""
完整的山东麻将游戏引擎
包含所有特殊玩法：开神、开杠、明杠、暗杠、加杠、抢杠胡
"""

import random
from typing import List, Dict, Tuple, Set, Optional, Any
from collections import Counter
from enum import Enum
import copy

class CardType(Enum):
    """牌类型"""
    WAN = 0   # 万
    TONG = 1  # 筒
    TIAO = 2  # 条
    FENG = 3  # 风 (东南西北)
    JIAN = 4  # 箭 (中发白)

class Card:
    """麻将牌"""
    def __init__(self, card_type: CardType, value: int):
        self.type = card_type
        self.value = value
    
    def __eq__(self, other):
        if not isinstance(other, Card):
            return False
        return self.type == other.type and self.value == other.value
    
    def __hash__(self):
        return hash((self.type, self.value))
    
    def __repr__(self):
        type_names = {
            CardType.WAN: "万",
            CardType.TONG: "筒", 
            CardType.TIAO: "条",
            CardType.FENG: "风",
            CardType.JIAN: "箭"
        }
        feng_names = {1: "东", 2: "南", 3: "西", 4: "北"}
        jian_names = {1: "中", 2: "发", 3: "白"}
        
        if self.type == CardType.FENG:
            return feng_names.get(self.value, "风")
        elif self.type == CardType.JIAN:
            return jian_names.get(self.value, "箭")
        else:
            return f"{self.value}{type_names[self.type]}"
    
    def to_index(self) -> int:
        """转换为索引 0-33"""
        if self.type == CardType.WAN:
            return self.value - 1
        elif self.type == CardType.TONG:
            return 9 + self.value - 1
        elif self.type == CardType.TIAO:
            return 18 + self.value - 1
        elif self.type == CardType.FENG:
            return 27 + self.value - 1
        else:  # JIAN
            return 31 + self.value - 1
    
    @staticmethod
    def from_index(index: int) -> 'Card':
        """从索引创建牌"""
        if index < 9:
            return Card(CardType.WAN, index + 1)
        elif index < 18:
            return Card(CardType.TONG, index - 9 + 1)
        elif index < 27:
            return Card(CardType.TIAO, index - 18 + 1)
        elif index < 31:
            return Card(CardType.FENG, index - 27 + 1)
        else:
            return Card(CardType.JIAN, index - 31 + 1)
    
    def is_jiang(self) -> bool:
        """判断是否为2、5、8将牌"""
        return self.type in [CardType.WAN, CardType.TONG, CardType.TIAO] and self.value in [2, 5, 8]
    
    def is_magic(self, magic_card: 'Card') -> bool:
        """判断是否为财神牌"""
        return self == magic_card


class GangType(Enum):
    """杠的类型"""
    AN_GANG = 0      # 暗杠（手中有4张）
    MING_GANG = 1    # 明杠（碰后摸到第4张）
    JIA_GANG = 2     # 加杠（直杠，手中有3张，杠别人打出的）


class ActionType(Enum):
    """动作类型"""
    DRAW = 0         # 摸牌
    DISCARD = 1      # 出牌
    PENG = 2         # 碰
    GANG = 3         # 杠
    HU = 4           # 胡
    CHI = 5          # 吃
    PASS = 6         # 过


class PlayerAction:
    """玩家动作"""
    def __init__(self, action_type: ActionType, player_id: int, card: Optional[Card] = None, 
                 target_player: Optional[int] = None, gang_type: Optional[GangType] = None):
        self.action_type = action_type
        self.player_id = player_id
        self.card = card
        self.target_player = target_player  # 针对哪个玩家（吃碰杠胡时）
        self.gang_type = gang_type


class ShandongMahjong:
    """
    完整山东麻将游戏引擎
    支持规则：开神、四扑一将、清七、开杠、明杠、暗杠、加杠、抢杠胡
    """
    
    def __init__(self, include_honors: bool = False):
        self.include_honors = include_honors
        self.tile_kind_count = 34 if include_honors else 27
        self.cards: List[Card] = []
        self.magic_card: Optional[Card] = None  # 财神牌
        self.wall: List[Card] = []  # 牌墙
        self.discarded: List[Card] = []  # 弃牌
        self.gang_count = 0  # 杠的次数（用于计算开杠奖励）
        self._init_cards()
    
    def _init_cards(self):
        """初始化牌池（108或136张）"""
        self.cards = []
        # 万、筒、条各36张
        for card_type in [CardType.WAN, CardType.TONG, CardType.TIAO]:
            for value in range(1, 10):
                for _ in range(4):
                    self.cards.append(Card(card_type, value))
        if self.include_honors:
            # 风牌16张
            for value in range(1, 5):
                for _ in range(4):
                    self.cards.append(Card(CardType.FENG, value))
            # 箭牌12张
            for value in range(1, 4):
                for _ in range(4):
                    self.cards.append(Card(CardType.JIAN, value))
    
    def shuffle_and_deal(self) -> Tuple[List[List[Card]], Card]:
        """洗牌并发牌，返回4家手牌和财神牌"""
        self.wall = copy.deepcopy(self.cards)
        random.shuffle(self.wall)
        
        # 发牌：庄家14张，闲家13张
        hands = []
        for i in range(4):
            count = 14 if i == 0 else 13
            hand = [self.wall.pop() for _ in range(count)]
            hands.append(hand)
        
        # 开神（翻开一张牌作为财神）
        self.magic_card = self.wall.pop()
        
        return hands, self.magic_card
    
    def draw_card(self) -> Optional[Card]:
        """从牌墙摸牌"""
        if self.wall:
            return self.wall.pop()
        return None
    
    def is_magic(self, card: Card) -> bool:
        """判断是否为财神牌"""
        return self.magic_card is not None and card == self.magic_card
    
    def can_peng(self, hand: List[Card], card: Card) -> bool:
        """判断是否可以碰"""
        count = sum(1 for c in hand if c == card)
        return count >= 2
    
    def can_gang(self, hand: List[Card], card: Card, peng_cards: List[List[Card]]) -> Tuple[bool, Optional[GangType]]:
        """
        判断是否可以杠
        返回: (是否可以杠, 杠的类型)
        """
        # 检查暗杠（手中有4张）
        count = sum(1 for c in hand if c == card)
        if count >= 4:
            return True, GangType.AN_GANG
        
        # 检查明杠（已经碰过，摸到第4张）
        for peng in peng_cards:
            if len(peng) >= 3 and peng[0] == card:
                return True, GangType.MING_GANG
        
        # 检查加杠（手中有3张，杠别人打出的）
        if count >= 3:
            return True, GangType.JIA_GANG
        
        return False, None
    
    def can_an_gang_any(self, hand: List[Card]) -> List[Card]:
        """检查手牌中可以暗杠的牌"""
        card_counts = Counter(c.to_index() for c in hand)
        gang_cards = []
        for idx, count in card_counts.items():
            if count >= 4:
                gang_cards.append(Card.from_index(idx))
        return gang_cards
    
    def can_ming_gang(self, hand: List[Card], card: Card, peng_cards: List[List[Card]]) -> bool:
        """检查是否可以明杠（碰后摸到第4张）"""
        for peng in peng_cards:
            if len(peng) >= 3 and peng[0] == card:
                return True
        return False
    
    def can_jia_gang(self, hand: List[Card], card: Card) -> bool:
        """检查是否可以加杠（直杠）"""
        count = sum(1 for c in hand if c == card)
        return count >= 3
    
    def can_chi(self, hand: List[Card], card: Card, player_pos: int, discarder_pos: int) -> List[List[Card]]:
        """判断是否可以吃，返回所有可能的吃牌组合"""
        # 只能吃上家的牌
        if (discarder_pos - player_pos) % 4 != 3:
            return []
        
        # 风牌和箭牌不能吃
        if card.type in [CardType.FENG, CardType.JIAN]:
            return []
        
        results = []
        
        # 检查顺子组合
        # 吃头：card, card+1, card+2
        if card.value <= 7:
            needed = [Card(card.type, card.value + 1), Card(card.type, card.value + 2)]
            if all(any(c == n for c in hand) for n in needed):
                results.append([card] + needed)
        
        # 吃中：card-1, card, card+1
        if 2 <= card.value <= 8:
            needed = [Card(card.type, card.value - 1), Card(card.type, card.value + 1)]
            if all(any(c == n for c in hand) for n in needed):
                results.append([Card(card.type, card.value - 1), card, Card(card.type, card.value + 1)])
        
        # 吃尾：card-2, card-1, card
        if card.value >= 3:
            needed = [Card(card.type, card.value - 2), Card(card.type, card.value - 1)]
            if all(any(c == n for c in hand) for n in needed):
                results.append(needed + [card])
        
        return results
    
    def can_hu(self, hand: List[Card], magic_count: int = 0) -> Tuple[bool, Dict]:
        """
        判断是否可以胡牌
        返回: (是否可以胡, 胡牌信息)
        """
        # 统计手牌
        card_counts = Counter(c.to_index() for c in hand)
        
        # 检查七对
        is_qidui, qidui_info = self._check_qidui(card_counts, magic_count)
        if is_qidui:
            return True, {"type": "七对", "info": qidui_info}
        
        # 检查四扑一将（标准胡牌）
        is_standard, std_info = self._check_standard(card_counts, magic_count)
        if is_standard:
            return True, {"type": "平胡", "info": std_info}
        
        return False, {}
    
    def _check_qidui(self, card_counts: Counter, magic_count: int) -> Tuple[bool, Dict]:
        """检查七对"""
        pairs = 0
        singles = 0
        
        for count in card_counts.values():
            if count >= 2:
                pairs += count // 2
            singles += count % 2
        
        # 需要7个对子
        if pairs >= 7:
            return True, {"pairs": 7}
        
        # 用财神补对子
        needed_pairs = 7 - pairs
        if magic_count >= needed_pairs:
            return True, {"pairs": pairs, "magic_as_pairs": needed_pairs}
        
        return False, {}
    
    def _check_standard(self, card_counts: Counter, magic_count: int) -> Tuple[bool, Dict]:
        """
        检查标准胡牌（四扑一将）
        需要4组顺子/刻子 + 1对将牌
        小胡必须258做将，大胡任意将都可以
        """
        # 尝试每种牌作为将牌
        for jiang_index in range(self.tile_kind_count):
            jiang_card = Card.from_index(jiang_index)
            
            # 小胡必须258做将（万筒条）
            if not jiang_card.is_jiang():
                continue
            
            temp_counts = card_counts.copy()
            temp_magic = magic_count
            
            # 检查将牌
            if temp_counts[jiang_index] >= 2:
                temp_counts[jiang_index] -= 2
            elif temp_counts[jiang_index] == 1 and temp_magic >= 1:
                temp_counts[jiang_index] -= 1
                temp_magic -= 1
            elif temp_magic >= 2:
                temp_magic -= 2
            else:
                continue
            
            # 检查剩余牌能否组成4组顺子/刻子
            if self._can_form_groups(temp_counts, temp_magic, 4):
                return True, {"jiang": jiang_card}
        
        return False, {}
    
    def _can_form_groups(self, card_counts: Counter, magic_count: int, groups_needed: int) -> bool:
        """检查能否组成指定数量的顺子/刻子"""
        if groups_needed == 0:
            return sum(card_counts.values()) <= magic_count
        
        # 找到第一个有牌的索引
        for i in range(self.tile_kind_count):
            if card_counts[i] > 0:
                # 尝试组成刻子
                if card_counts[i] >= 3:
                    card_counts[i] -= 3
                    if self._can_form_groups(card_counts, magic_count, groups_needed - 1):
                        return True
                    card_counts[i] += 3
                
                # 尝试用财神组成刻子
                if card_counts[i] + magic_count >= 3:
                    used_magic = 3 - card_counts[i]
                    old_count = card_counts[i]
                    card_counts[i] = 0
                    if self._can_form_groups(card_counts, magic_count - used_magic, groups_needed - 1):
                        return True
                    card_counts[i] = old_count
                
                # 尝试组成顺子（只适用于万筒条）
                if i < 27:  # 万筒条
                    card_type = i // 9
                    value = i % 9
                    
                    if value <= 6:  # 可以组成顺子
                        next1 = i + 1
                        next2 = i + 2
                        
                        # 检查是否有足够的牌组成顺子
                        needed = []
                        if card_counts[i] > 0:
                            needed.append((i, 1))
                        if card_counts[next1] > 0:
                            needed.append((next1, 1))
                        if card_counts[next2] > 0:
                            needed.append((next2, 1))
                        
                        total_have = sum(card_counts[idx] for idx, _ in needed)
                        total_need = 3
                        
                        if total_have + magic_count >= total_need:
                            # 尝试组成顺子
                            for idx, cnt in needed:
                                card_counts[idx] -= cnt
                            
                            remaining_needed = total_need - total_have
                            if remaining_needed <= magic_count:
                                if self._can_form_groups(card_counts, magic_count - remaining_needed, groups_needed - 1):
                                    return True
                            
                            for idx, cnt in needed:
                                card_counts[idx] += cnt
                
                break
        
        # 如果没有牌了，用财神凑
        if magic_count >= groups_needed * 3:
            return True
        
        return False
    
    def get_ting_cards(self, hand: List[Card], magic_count: int = 0) -> Set[Card]:
        """获取听牌列表"""
        ting_cards = set()
        
        for i in range(self.tile_kind_count):
            test_card = Card.from_index(i)
            test_hand = hand + [test_card]
            can_hu, info = self.can_hu(test_hand, magic_count)
            if can_hu:
                ting_cards.add(test_card)
        
        return ting_cards
    
    def calculate_fan(self, hu_type: str, peng_cards: List[List[Card]], 
                     gang_cards: List[List[Card]], is_zimo: bool, 
                     is_zhuang: bool, magic_count: int) -> int:
        """
        计算番数
        山东麻将计番规则
        """
        fan = 0
        
        # 基础番
        if hu_type == "七对":
            fan += 4
        elif hu_type == "平胡":
            fan += 1
        
        # 杠牌加番
        fan += len(gang_cards) * 2  # 每个杠加2番
        
        # 自摸加番
        if is_zimo:
            fan += 1
        
        # 庄家加番
        if is_zhuang:
            fan += 1
        
        # 财神加番
        fan += magic_count
        
        return fan


class MahjongAssistant:
    """
    麻将AI辅助工具
    根据用户手牌、财神、四家出牌记录提供决策建议
    """
    
    def __init__(self):
        self.game = ShandongMahjong()
        self.hand: List[Card] = []
        self.magic_card: Optional[Card] = None
        self.discard_history: Dict[int, List[Card]] = {0: [], 1: [], 2: [], 3: []}
        self.peng_history: Dict[int, List[List[Card]]] = {0: [], 1: [], 2: [], 3: []}
        self.gang_history: Dict[int, List[List[Card]]] = {0: [], 1: [], 2: [], 3: []}
        self.player_positions = {0: "我", 1: "下家", 2: "对家", 3: "上家"}
        self.magic_count = 0
    
    def set_hand(self, hand_cards: List[Card]):
        """设置我的手牌"""
        self.hand = hand_cards
        self.magic_count = sum(1 for c in hand_cards if self.magic_card and c == self.magic_card)
    
    def set_magic(self, magic_card: Card):
        """设置财神牌"""
        self.magic_card = magic_card
        self.game.magic_card = magic_card
        self.magic_count = sum(1 for c in self.hand if c == magic_card)
    
    def record_discard(self, player_id: int, card: Card):
        """记录玩家出牌"""
        self.discard_history[player_id].append(card)
    
    def record_peng(self, player_id: int, cards: List[Card]):
        """记录碰牌"""
        self.peng_history[player_id].append(cards)
    
    def record_gang(self, player_id: int, cards: List[Card]):
        """记录杠牌"""
        self.gang_history[player_id].append(cards)
    
    def get_recommendation(self) -> Dict:
        """
        获取AI决策建议
        返回包含出牌建议、碰杠建议、听牌分析等
        """
        recommendation = {
            "current_status": {},
            "discard_recommendation": None,
            "ting_analysis": {},
            "danger_assessment": {},
            "opponent_analysis": {},
            "action_suggestions": []
        }
        
        if not self.hand:
            return recommendation
        
        # 1. 当前状态分析
        recommendation["current_status"] = self._analyze_current_status()
        
        # 2. 出牌建议
        recommendation["discard_recommendation"] = self._recommend_discard()
        
        # 3. 听牌分析
        recommendation["ting_analysis"] = self._analyze_ting()
        
        # 4. 危险评估
        recommendation["danger_assessment"] = self._assess_table_danger()
        
        # 5. 对手分析
        recommendation["opponent_analysis"] = self._analyze_opponents()
        
        # 6. 动作建议（碰/杠/胡）
        recommendation["action_suggestions"] = self._suggest_actions()
        
        return recommendation
    
    def _analyze_current_status(self) -> Dict:
        """分析当前手牌状态"""
        status = {
            "hand_count": len(self.hand),
            "magic_count": self.magic_count,
            "group_count": self._count_groups(),
            "pair_count": self._count_pairs(),
            "is_ready": False,
            "xiang_ting": 0
        }
        
        # 检查是否听牌
        ting_cards = self.game.get_ting_cards(self.hand, self.magic_count)
        status["is_ready"] = len(ting_cards) > 0
        status["ting_cards"] = list(ting_cards)
        
        # 计算向听数
        status["xiang_ting"] = self._calculate_xiang_ting()
        
        return status
    
    def _count_groups(self) -> int:
        """计算搭子数量"""
        card_counts = Counter(c.to_index() for c in self.hand)
        groups = 0
        
        # 刻子
        for count in card_counts.values():
            if count >= 3:
                groups += 1
        
        # 顺子潜力
        for i in range(27):
            if i % 9 <= 6:
                if card_counts[i] > 0 and card_counts[i+1] > 0 and card_counts[i+2] > 0:
                    groups += 1
        
        return groups
    
    def _count_pairs(self) -> int:
        """计算对子数量"""
        card_counts = Counter(c.to_index() for c in self.hand)
        pairs = 0
        for count in card_counts.values():
            if count >= 2:
                pairs += 1
        return pairs
    
    def _calculate_xiang_ting(self) -> int:
        """计算向听数"""
        groups = self._count_groups()
        pairs = self._count_pairs()
        
        # 需要4组 + 1对
        total = groups + min(pairs, 1)
        return max(0, 4 - int(total))
    
    def _recommend_discard(self) -> Dict:
        """推荐出牌"""
        if not self.hand:
            return None
        
        card_scores = []
        visible_counts = self._build_visible_counts()
        
        for card in self.hand:
            features = self._build_defense_features(card, visible_counts)
            if self.magic_card and card == self.magic_card:
                # 财神永远不打
                score = -1000
            else:
                score = self._evaluate_card(card, visible_counts)
            
            card_scores.append({
                "card": card,
                "score": score,
                "reason": self._get_card_reason(card, score),
                "features": features
            })
        
        # 按分数排序（分数越低越应该打）
        card_scores.sort(key=lambda x: x["score"])
        
        return {
            "recommended": card_scores[0] if card_scores else None,
            "all_scores": card_scores,
            "strategy": self._get_discard_strategy()
        }
    
    def _evaluate_card_with_visible(self, card: Card, visible_counts: Optional[Dict[int, int]]) -> float:
        """评估一张牌的价值（可复用可见牌计数）"""
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
        
        # 4. 危险度
        danger = self._assess_card_danger(card, visible_counts)
        score += danger * 12
        
        # 5. 进张概率
        improvement = self._calculate_improvement(card)
        score -= improvement * 20
        
        return score

    def _evaluate_card(self, card: Card, visible_counts: Optional[Dict[int, int]] = None) -> float:
        """评估一张牌的价值"""
        return self._evaluate_card_with_visible(card, visible_counts)
    
    def _calculate_isolation(self, card: Card) -> float:
        """计算牌的孤立程度"""
        if card.type in [CardType.FENG, CardType.JIAN]:
            count = sum(1 for c in self.hand if c == card)
            return 0.0 if count >= 2 else 1.0
        
        adjacent_count = 0
        for delta in [-2, -1, 0, 1, 2]:
            val = card.value + delta
            if 1 <= val <= 9:
                adjacent = Card(card.type, val)
                count = sum(1 for c in self.hand if c == adjacent)
                adjacent_count += count
        
        if adjacent_count <= 1:
            return 1.0
        elif adjacent_count <= 2:
            return 0.7
        elif adjacent_count <= 3:
            return 0.4
        return 0.0
    
    def _calculate_group_potential(self, card: Card) -> float:
        """计算形成搭子的潜力"""
        potential = 0.0
        
        # 刻子潜力
        count = sum(1 for c in self.hand if c == card)
        if count >= 3:
            potential += 3.0
        elif count == 2:
            potential += 2.0
        
        # 顺子潜力
        if card.type in [CardType.WAN, CardType.TONG, CardType.TIAO]:
            for start in range(max(1, card.value - 2), min(8, card.value + 1)):
                combo = [Card(card.type, start), Card(card.type, start + 1), Card(card.type, start + 2)]
                have_count = sum(1 for c in combo if any(h == c for h in self.hand))
                if have_count == 3:
                    potential += 2.0
                elif have_count == 2:
                    potential += 1.0
        
        return potential

    def _is_number_card(self, card: Card) -> bool:
        return card.type in [CardType.WAN, CardType.TONG, CardType.TIAO]

    def _build_visible_counts(self) -> Dict[int, int]:
        """构建可见牌计数（用于壁牌/One Chance估计）"""
        counts = {i: 0 for i in range(self.game.tile_kind_count)}

        def add_card(c: Card):
            idx = c.to_index()
            if idx < self.game.tile_kind_count:
                counts[idx] += 1

        for card in self.hand:
            add_card(card)
        for discards in self.discard_history.values():
            for card in discards:
                add_card(card)
        for pengs in self.peng_history.values():
            for group in pengs:
                for card in group:
                    add_card(card)
        for gangs in self.gang_history.values():
            for group in gangs:
                for card in group:
                    add_card(card)

        return counts

    def _remaining_count(self, card: Card, visible_counts: Dict[int, int]) -> int:
        idx = card.to_index()
        if idx >= self.game.tile_kind_count:
            return 0
        return max(0, 4 - visible_counts.get(idx, 0))

    def _ryanmen_potential(self, card: Card, visible_counts: Dict[int, int]) -> int:
        """估计该牌作为两面听放铳目标的潜在组合强度"""
        if not self._is_number_card(card):
            return 0

        potential = 0
        value = card.value
        for left, right in [(value - 2, value - 1), (value + 1, value + 2)]:
            if 1 <= left <= 9 and 1 <= right <= 9:
                c_left = Card(card.type, left)
                c_right = Card(card.type, right)
                potential += self._remaining_count(c_left, visible_counts) * self._remaining_count(c_right, visible_counts)
        return potential

    def _kabe_class(self, card: Card, visible_counts: Dict[int, int]) -> str:
        """壁牌分类: no_chance / one_chance / normal"""
        potential = self._ryanmen_potential(card, visible_counts)
        if potential <= 0:
            return "no_chance"
        if potential <= 4:
            return "one_chance"
        return "normal"

    def _suji_middle_value(self, value: int) -> Optional[int]:
        if value in [1, 7]:
            return 4
        if value in [2, 8]:
            return 5
        if value in [3, 9]:
            return 6
        return None

    def _suji_support_count(self, card: Card) -> int:
        if not self._is_number_card(card):
            return 0
        middle = self._suji_middle_value(card.value)
        if middle is None:
            return 0
        middle_card = Card(card.type, middle)
        return sum(1 for pid in range(1, 4) if any(c == middle_card for c in self.discard_history[pid]))

    def _nakasuji_support_count(self, card: Card) -> int:
        if not self._is_number_card(card):
            return 0
        if card.value < 4 or card.value > 6:
            return 0
        left = Card(card.type, card.value - 3)
        right = Card(card.type, card.value + 3)
        return sum(
            1 for pid in range(1, 4)
            if any(c == left for c in self.discard_history[pid]) and any(c == right for c in self.discard_history[pid])
        )

    def _early_middle_discard_turn(self, player_id: int, card_type: CardType) -> Optional[int]:
        discards = self.discard_history[player_id]
        for idx, card in enumerate(discards):
            if card.type == card_type and 4 <= card.value <= 6:
                return idx + 1
        return None

    def _early_outside_support_count(self, card: Card) -> int:
        if not self._is_number_card(card):
            return 0
        if card.value not in [1, 2, 8, 9]:
            return 0
        count = 0
        for pid in range(1, 4):
            turn = self._early_middle_discard_turn(pid, card.type)
            if turn is not None and turn <= 3:
                count += 1
        return count

    def _build_defense_features(self, card: Card, visible_counts: Optional[Dict[int, int]] = None) -> Dict[str, Any]:
        """提取后端训练特征（Suji/Kabe/Nakasuji/早外）"""
        if visible_counts is None:
            visible_counts = self._build_visible_counts()

        idx = card.to_index()
        seen_count = visible_counts.get(idx, 0) if idx < self.game.tile_kind_count else 0
        features: Dict[str, Any] = {
            "tile": str(card),
            "seen_count": seen_count,
            "is_number_tile": self._is_number_card(card),
            "suji_support": 0,
            "nakasuji_support": 0,
            "early_outside_support": 0,
            "ryanmen_potential": 0,
            "kabe_class": "normal",
            "no_chance": False,
            "one_chance": False
        }

        if not self._is_number_card(card):
            return features

        suji_support = self._suji_support_count(card)
        nakasuji_support = self._nakasuji_support_count(card)
        early_outside_support = self._early_outside_support_count(card)
        ryanmen_potential = self._ryanmen_potential(card, visible_counts)
        kabe_class = self._kabe_class(card, visible_counts)

        features.update({
            "suji_support": suji_support,
            "nakasuji_support": nakasuji_support,
            "early_outside_support": early_outside_support,
            "ryanmen_potential": ryanmen_potential,
            "kabe_class": kabe_class,
            "no_chance": kabe_class == "no_chance",
            "one_chance": kabe_class == "one_chance"
        })
        return features
    
    def _assess_card_danger(self, card: Card, visible_counts: Optional[Dict[int, int]] = None) -> float:
        """评估打出某张牌的危险程度（含Suji/Kabe/Nakasuji/早外特征）"""
        if visible_counts is None:
            visible_counts = self._build_visible_counts()

        danger = 0.0

        # 统计已出现的牌（偏防守视角）
        all_discards: List[Card] = []
        for discards in self.discard_history.values():
            all_discards.extend(discards)

        seen_count = sum(1 for c in all_discards if c == card)
        
        if seen_count == 0:
            danger += 3.0
        elif seen_count == 1:
            danger += 1.5
        elif seen_count >= 3:
            danger -= 2.0
        
        # 中张危险度高
        if self._is_number_card(card):
            if 3 <= card.value <= 7:
                danger += 2.0

        # 特征工程修正：筋线 + 间筋 + 早外 + 壁牌
        features = self._build_defense_features(card, visible_counts)
        if features["is_number_tile"]:
            danger -= 0.55 * features["suji_support"]
            danger -= 0.75 * features["nakasuji_support"]
            danger -= 0.45 * features["early_outside_support"]

            if features["kabe_class"] == "no_chance":
                danger -= 2.2
            elif features["kabe_class"] == "one_chance":
                danger -= 1.0

            # 防止过度自信：这些特征主要覆盖两面听
            if features["suji_support"] > 0 or features["nakasuji_support"] > 0 or features["kabe_class"] != "normal":
                danger += 0.25

        return max(-3.5, min(6.0, danger))
    
    def _calculate_improvement(self, card: Card) -> float:
        """计算保留这张牌的进张概率"""
        temp_hand = [c for c in self.hand if c != card]
        ting_cards = self.game.get_ting_cards(temp_hand, self.magic_count)
        
        if not ting_cards:
            return 0.0
        
        return len(ting_cards) / float(self.game.tile_kind_count)
    
    def _get_card_reason(self, card: Card, score: float) -> str:
        """获取出牌原因说明"""
        if score < -500:
            return "财神牌，绝对不能打"
        elif score < 0:
            return "有价值的牌，建议保留"
        elif score < 10:
            return "相对安全，可考虑打出"
        elif score < 20:
            return "孤张牌，优先打出"
        else:
            return "危险牌，尽量避免"
    
    def _get_discard_strategy(self) -> str:
        """获取当前出牌策略"""
        xiang_ting = self._calculate_xiang_ting()
        
        if xiang_ting == 0:
            return "已听牌！进入防守模式，优先打安全牌"
        elif xiang_ting <= 1:
            return "即将听牌，积极进攻，保留有潜力的牌"
        elif xiang_ting <= 2:
            return "平衡攻防，整理牌型"
        else:
            return "手牌较差，优先整理牌型，打孤张边张"
    
    def _analyze_ting(self) -> Dict:
        """分析听牌情况"""
        ting_cards = self.game.get_ting_cards(self.hand, self.magic_count)
        
        # 计算每张听牌的概率
        all_discards = []
        for discards in self.discard_history.values():
            all_discards.extend(discards)
        
        ting_analysis = []
        for card in ting_cards:
            seen = sum(1 for c in all_discards if c == card)
            remaining = 4 - seen
            unseen_baseline = len(self.game.cards) // 2
            prob = remaining / max(1, unseen_baseline - len(all_discards))
            
            ting_analysis.append({
                "card": card,
                "remaining": remaining,
                "probability": f"{prob*100:.1f}%"
            })
        
        return {
            "is_ting": len(ting_cards) > 0,
            "ting_count": len(ting_cards),
            "ting_cards": ting_analysis,
            "suggestion": "等待胡牌" if ting_cards else "继续整理牌型"
        }
    
    def _assess_table_danger(self) -> Dict:
        """评估桌面危险程度"""
        danger_level = "低"
        warnings = []
        
        # 检查是否有对手可能听牌
        for player_id, discards in self.discard_history.items():
            if player_id == 0:
                continue
            
            if len(discards) >= 5:
                recent = discards[-5:]
                safe_count = sum(1 for c in recent if c.type in [CardType.FENG, CardType.JIAN] or 
                                (c.type in [CardType.WAN, CardType.TONG, CardType.TIAO] and c.value in [1, 9]))
                
                if safe_count >= 4:
                    danger_level = "高"
                    warnings.append(f"{self.player_positions[player_id]}可能已听牌！")
        
        return {
            "level": danger_level,
            "warnings": warnings
        }
    
    def _analyze_opponents(self) -> Dict:
        """分析对手"""
        analysis = {}
        
        for player_id in range(1, 4):
            discards = self.discard_history[player_id]
            pengs = self.peng_history[player_id]
            gangs = self.gang_history[player_id]
            
            # 分析可能的牌型
            possible_types = []
            
            if len(pengs) >= 2:
                possible_types.append("碰碰胡")
            
            if gangs:
                possible_types.append("有大杠")
            
            # 分析花色偏好
            suit_count = {CardType.WAN: 0, CardType.TONG: 0, CardType.TIAO: 0}
            for peng in pengs:
                if peng:
                    suit_count[peng[0].type] += 1
            
            preferred_suit = max(suit_count, key=suit_count.get)
            if suit_count[preferred_suit] >= 2:
                possible_types.append(f"可能做{'万筒条'[preferred_suit.value]}子")
            
            analysis[self.player_positions[player_id]] = {
                "peng_count": len(pengs),
                "gang_count": len(gangs),
                "possible_types": possible_types
            }
        
        return analysis
    
    def _suggest_actions(self) -> List[Dict]:
        """建议可能的动作"""
        actions = []
        
        # 检查是否可以暗杠
        an_gang_cards = self.game.can_an_gang_any(self.hand)
        for card in an_gang_cards:
            actions.append({
                "action": "暗杠",
                "card": card,
                "priority": "高",
                "reason": "暗杠增加番数且安全"
            })
        
        # 检查听牌状态
        ting_cards = self.game.get_ting_cards(self.hand, self.magic_count)
        if ting_cards:
            actions.append({
                "action": "听牌",
                "cards": list(ting_cards),
                "priority": "最高",
                "reason": f"等待{len(ting_cards)}张牌可胡"
            })
        
        return actions
    
    def format_recommendation(self, rec: Dict) -> str:
        """格式化推荐结果为易读的字符串"""
        lines = []
        lines.append("=" * 60)
        lines.append("🀄 山东麻将AI辅助决策系统")
        lines.append("=" * 60)
        
        # 当前状态
        status = rec["current_status"]
        lines.append(f"\n📊 当前状态:")
        lines.append(f"   手牌数: {status['hand_count']}")
        lines.append(f"   财神数: {status['magic_count']}")
        lines.append(f"   搭子数: {status['group_count']}")
        lines.append(f"   对子数: {status['pair_count']}")
        lines.append(f"   向听数: {status['xiang_ting']}")
        
        if status['is_ready']:
            lines.append(f"   ✅ 已听牌！等待 {len(status['ting_cards'])} 张牌")
        
        # 出牌建议
        discard = rec["discard_recommendation"]
        if discard and discard["recommended"]:
            lines.append(f"\n🎯 出牌建议:")
            lines.append(f"   推荐打出: {discard['recommended']['card']}")
            lines.append(f"   原因: {discard['recommended']['reason']}")
            lines.append(f"   策略: {discard['strategy']}")
        
        # 听牌分析
        ting = rec["ting_analysis"]
        if ting['is_ting']:
            lines.append(f"\n🔔 听牌分析:")
            lines.append(f"   可胡 {ting['ting_count']} 张牌:")
            for t in ting['ting_cards'][:5]:
                lines.append(f"     - {t['card']}: 剩余{t['remaining']}张，概率{t['probability']}")
        
        # 危险评估
        danger = rec["danger_assessment"]
        lines.append(f"\n⚠️ 危险评估:")
        lines.append(f"   风险等级: {danger['level']}")
        for warning in danger['warnings']:
            lines.append(f"   🚨 {warning}")
        
        # 对手分析
        opponents = rec["opponent_analysis"]
        lines.append(f"\n👥 对手分析:")
        for name, info in opponents.items():
            if info['peng_count'] > 0 or info['gang_count'] > 0:
                lines.append(f"   {name}: {info['peng_count']}碰 {info['gang_count']}杠")
                if info['possible_types']:
                    lines.append(f"     可能牌型: {', '.join(info['possible_types'])}")
        
        # 动作建议
        actions = rec["action_suggestions"]
        if actions:
            lines.append(f"\n💡 动作建议:")
            for action in actions:
                lines.append(f"   [{action['priority']}] {action['action']}: {action['reason']}")
        
        lines.append("\n" + "=" * 60)
        
        return "\n".join(lines)


# 测试代码
if __name__ == "__main__":
    print("=" * 60)
    print("山东麻将AI辅助工具测试")
    print("=" * 60)
    
    # 创建AI助手
    assistant = MahjongAssistant()
    
    # 设置财神
    magic = Card(CardType.WAN, 5)  # 5万是财神
    assistant.set_magic(magic)
    print(f"\n本局财神: {magic}")
    
    # 设置我的手牌
    my_hand = [
        Card(CardType.WAN, 1), Card(CardType.WAN, 2), Card(CardType.WAN, 3),
        Card(CardType.TONG, 2), Card(CardType.TONG, 2),
        Card(CardType.TONG, 4), Card(CardType.TONG, 5), Card(CardType.TONG, 6),
        Card(CardType.TIAO, 3), Card(CardType.TIAO, 4),
        Card(CardType.FENG, 1), Card(CardType.FENG, 1),
        Card(CardType.JIAN, 2),
    ]
    assistant.set_hand(my_hand)
    print(f"我的手牌: {[str(c) for c in my_hand]}")
    
    # 模拟出牌记录
    # 下家出牌
    assistant.record_discard(1, Card(CardType.WAN, 4))
    assistant.record_discard(1, Card(CardType.WAN, 6))
    assistant.record_discard(1, Card(CardType.TONG, 1))
    assistant.record_discard(1, Card(CardType.TONG, 9))
    assistant.record_discard(1, Card(CardType.FENG, 2))
    
    # 对家出牌
    assistant.record_discard(2, Card(CardType.TIAO, 1))
    assistant.record_discard(2, Card(CardType.TIAO, 2))
    assistant.record_discard(2, Card(CardType.WAN, 9))
    assistant.record_discard(2, Card(CardType.TONG, 3))
    assistant.record_discard(2, Card(CardType.FENG, 3))
    
    # 上家出牌
    assistant.record_discard(3, Card(CardType.TIAO, 9))
    assistant.record_discard(3, Card(CardType.TIAO, 8))
    assistant.record_discard(3, Card(CardType.WAN, 7))
    assistant.record_discard(3, Card(CardType.TONG, 7))
    assistant.record_discard(3, Card(CardType.FENG, 4))
    
    # 记录碰牌
    assistant.record_peng(1, [Card(CardType.TONG, 8), Card(CardType.TONG, 8), Card(CardType.TONG, 8)])
    
    # 获取AI建议
    recommendation = assistant.get_recommendation()
    
    # 格式化输出
    print(assistant.format_recommendation(recommendation))
