"""
山东麻将游戏引擎
包含牌型定义、胡牌判断、游戏规则验证
"""

import random
from typing import List, Dict, Tuple, Set, Optional
from collections import Counter
from enum import Enum
import copy

class CardType(Enum):
    """牌类型"""
    WAN = 0  # 万
    TONG = 1  # 筒
    TIAO = 2  # 条
    FENG = 3  # 风 (东南西北)
    JIAN = 4  # 箭 (中发白)

class Card:
    """麻将牌"""
    def __init__(self, card_type: CardType, value: int):
        self.type = card_type
        self.value = value  # 1-9 for WAN/TONG/TIAO, 1-4 for FENG, 1-3 for JIAN
    
    def __eq__(self, other):
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
            return feng_names[self.value]
        elif self.type == CardType.JIAN:
            return jian_names[self.value]
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

class ShandongMahjong:
    """山东麻将游戏引擎"""
    
    def __init__(self, include_honors: bool = False):
        self.include_honors = include_honors
        self.tile_kind_count = 34 if include_honors else 27
        self.cards: List[Card] = []
        self.magic_card: Optional[Card] = None  # 财神牌
        self.wall: List[Card] = []  # 牌墙
        self.discarded: List[Card] = []  # 弃牌
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
    
    def can_gang(self, hand: List[Card], card: Card) -> bool:
        """判断是否可以杠"""
        count = sum(1 for c in hand if c == card)
        return count >= 3
    
    def can_an_gang(self, hand: List[Card], card: Card) -> bool:
        """判断是否可以暗杠"""
        count = sum(1 for c in hand if c == card)
        return count >= 4
    
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
        magic_needed = 0
        
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
        """
        获取听牌列表（哪些牌可以胡）
        使用概率论计算
        """
        ting_cards = set()
        
        # 遍历所有可能的牌
        for i in range(self.tile_kind_count):
            test_card = Card.from_index(i)
            test_hand = hand + [test_card]
            can_hu, info = self.can_hu(test_hand, magic_count)
            if can_hu:
                ting_cards.add(test_card)
        
        return ting_cards
    
    def calculate_card_probability(self, card: Card, visible_cards: List[Card], total_remaining: int) -> float:
        """
        计算某张牌出现的概率（贝叶斯推断）
        visible_cards: 所有可见的牌（包括弃牌和其他玩家的碰杠）
        """
        # 统计已见的该牌数量
        seen_count = sum(1 for c in visible_cards if c == card)
        
        # 剩余该牌数量
        remaining = 4 - seen_count
        
        if remaining <= 0:
            return 0.0
        
        # 基础概率
        base_prob = remaining / total_remaining
        
        # 贝叶斯修正：根据游戏进程调整概率
        # 如果游戏后期，概率会更高（因为牌墙减少）
        if total_remaining < 20:
            base_prob *= 1.2
        
        return min(base_prob, 1.0)


class MahjongAI:
    """
    山东麻将AI
    基于概率论、博弈论、贝叶斯理论
    """
    
    def __init__(self, player_id: int):
        self.player_id = player_id
        self.hand: List[Card] = []
        self.magic_count = 0
        self.peng_cards: List[List[Card]] = []  # 碰的牌
        self.gang_cards: List[List[Card]] = []  # 杠的牌
        self.discarded: List[Card] = []  # 自己打出的牌
        self.game: Optional[ShandongMahjong] = None
        
        # 记忆其他玩家的信息
        self.other_players_discard: Dict[int, List[Card]] = {i: [] for i in range(4) if i != player_id}
        self.other_players_peng: Dict[int, List[List[Card]]] = {i: [] for i in range(4) if i != player_id}
        self.other_players_gang: Dict[int, List[List[Card]]] = {i: [] for i in range(4) if i != player_id}
        
        # 牌墙估计
        # 默认按108张模型估计，init_hand后会按具体规则重建
        self.estimated_wall: Dict[int, int] = {i: 4 for i in range(27)}  # 每张牌剩余数量估计
    
    def init_hand(self, hand: List[Card], game: ShandongMahjong):
        """初始化手牌"""
        self.hand = hand
        self.game = game
        self.magic_count = sum(1 for c in hand if game.is_magic(c))
        self._update_estimated_wall()
    
    def _update_estimated_wall(self):
        """更新牌墙估计"""
        tile_kind_count = self.game.tile_kind_count if self.game else 27
        # 初始每张牌4张
        self.estimated_wall = {i: 4 for i in range(tile_kind_count)}
        
        # 减去自己手中的牌
        for card in self.hand:
            self.estimated_wall[card.to_index()] -= 1
        
        # 减去已知的弃牌
        for card in self.discarded:
            self.estimated_wall[card.to_index()] -= 1
    
    def decide_discard(self) -> Card:
        """
        决定打哪张牌
        核心策略：基于概率论和博弈论
        """
        if not self.hand:
            return None
        
        # 1. 检查是否听牌
        ting_cards = self.game.get_ting_cards(self.hand, self.magic_count)
        if ting_cards:
            # 已经听牌，打出安全牌
            return self._select_safe_card()
        
        # 2. 计算每张牌的价值
        card_values = {}
        for card in self.hand:
            if self.game.is_magic(card):
                # 财神永远不打
                card_values[card] = 1000
                continue
            
            value = self._evaluate_card_value(card)
            card_values[card] = value
        
        # 3. 选择价值最低的牌打出
        min_value = min(card_values.values())
        candidates = [c for c, v in card_values.items() if v == min_value]
        
        # 如果有多个，选择最安全的
        return self._select_safest_card(candidates)
    
    def _evaluate_card_value(self, card: Card) -> float:
        """
        评估一张牌的价值
        使用概率论计算
        """
        value = 0.0
        
        # 1. 孤张牌价值低
        same_type_cards = [c for c in self.hand if c.type == card.type]
        same_value_cards = [c for c in self.hand if c == card]
        
        # 检查是否是孤张
        is_isolated = True
        if card.type in [CardType.WAN, CardType.TONG, CardType.TIAO]:
            # 检查相邻的牌
            for delta in [-2, -1, 1, 2]:
                adjacent_val = card.value + delta
                if 1 <= adjacent_val <= 9:
                    adjacent = Card(card.type, adjacent_val)
                    if any(c == adjacent for c in self.hand):
                        is_isolated = False
                        break
        
        if is_isolated:
            value -= 10
        
        # 2. 形成搭子的潜力
        if card.type in [CardType.WAN, CardType.TONG, CardType.TIAO]:
            # 检查能否形成顺子
            for delta in [-2, -1, 0, 1, 2]:
                adjacent_val = card.value + delta
                if 1 <= adjacent_val <= 9:
                    adjacent = Card(card.type, adjacent_val)
                    count = sum(1 for c in self.hand if c == adjacent)
                    if count > 0:
                        value += 5 * count
        
        # 3. 刻子潜力
        count = sum(1 for c in self.hand if c == card)
        if count >= 2:
            value += 15 * count
        
        # 4. 将牌潜力（258将）
        if card.is_jiang():
            value += 8
        
        # 5. 危险度评估（博弈论）
        danger = self._assess_danger(card)
        value -= danger * 5
        
        return value
    
    def _assess_danger(self, card: Card) -> float:
        """
        评估打出某张牌的危险程度
        使用博弈论分析对手
        """
        danger = 0.0
        
        # 1. 检查是否有人可能要这张牌
        for player_id, discards in self.other_players_discard.items():
            # 如果对手一直在打某种花色的牌，可能在做清一色
            same_type_discards = [c for c in discards if c.type == card.type]
            if len(same_type_discards) > 3:
                # 对手可能在收集其他花色，这张牌相对安全
                danger -= 1
        
        # 2. 生张危险度高
        all_discards = []
        for discards in self.other_players_discard.values():
            all_discards.extend(discards)
        all_discards.extend(self.discarded)
        
        if card not in all_discards:
            danger += 3  # 生张
        
        # 3. 中张（3-7）危险度高
        if card.type in [CardType.WAN, CardType.TONG, CardType.TIAO]:
            if 3 <= card.value <= 7:
                danger += 2
        
        # 4. 字牌在后期危险
        if card.type in [CardType.FENG, CardType.JIAN]:
            # 如果字牌已经出现了很多
            seen_count = sum(1 for c in all_discards if c == card)
            if seen_count >= 2:
                danger -= 2  # 相对安全
            else:
                danger += 1
        
        return danger
    
    def _select_safe_card(self) -> Card:
        """选择最安全的牌打出（听牌后）"""
        # 优先打已经出现过的牌
        all_discards = []
        for discards in self.other_players_discard.values():
            all_discards.extend(discards)
        all_discards.extend(self.discarded)
        
        for card in self.hand:
            if self.game.is_magic(card):
                continue
            if card in all_discards:
                return card
        
        # 否则打边张
        for card in self.hand:
            if self.game.is_magic(card):
                continue
            if card.type in [CardType.WAN, CardType.TONG, CardType.TIAO]:
                if card.value in [1, 9]:
                    return card
        
        # 最后按价值选择
        return self._select_safest_card(self.hand)
    
    def _select_safest_card(self, candidates: List[Card]) -> Card:
        """从候选牌中选择最安全的"""
        if not candidates:
            return None
        
        safest = candidates[0]
        min_danger = float('inf')
        
        for card in candidates:
            if self.game.is_magic(card):
                continue
            danger = self._assess_danger(card)
            if danger < min_danger:
                min_danger = danger
                safest = card
        
        return safest
    
    def decide_peng(self, card: Card) -> bool:
        """
        决定是否碰牌
        使用博弈论分析
        """
        # 1. 如果听牌了，考虑是否破坏听牌
        current_ting = self.game.get_ting_cards(self.hand, self.magic_count)
        
        # 模拟碰牌后的手牌
        temp_hand = self.hand.copy()
        temp_hand.remove(card)
        temp_hand.remove(card)
        # 碰后需要打出一张牌
        
        future_ting = self.game.get_ting_cards(temp_hand, self.magic_count)
        
        # 如果碰后听牌数增加或不变，可以碰
        if len(future_ting) >= len(current_ting):
            return True
        
        # 2. 如果牌型很好，不碰
        if self._hand_quality() > 0.7:
            return False
        
        # 3. 如果对手可能在做大牌，碰牌可以阻止
        if self._opponent_making_big_hand():
            return True
        
        return False
    
    def decide_gang(self, card: Card, is_an_gang: bool = False) -> bool:
        """
        决定是否杠牌
        """
        # 暗杠总是好的
        if is_an_gang:
            return True
        
        # 明杠需要考虑风险
        # 如果听牌了，不杠（可能破坏听牌）
        if self.game.get_ting_cards(self.hand, self.magic_count):
            return False
        
        # 如果牌局后期，不杠（容易被抢杠）
        remaining_cards = sum(self.estimated_wall.values())
        if remaining_cards < 20:
            return False
        
        return True
    
    def decide_chi(self, card: Card, combinations: List[List[Card]]) -> Optional[List[Card]]:
        """
        决定是否吃牌，返回选择的吃牌组合
        """
        if not combinations:
            return None
        
        # 如果听牌了，不吃
        if self.game.get_ting_cards(self.hand, self.magic_count):
            return None
        
        # 选择能让自己更快听牌的组合
        best_combo = None
        best_ting_count = 0
        
        for combo in combinations:
            temp_hand = self.hand.copy()
            # 移除吃牌需要的牌
            for c in combo:
                if c != card:
                    temp_hand.remove(c)
            
            ting = self.game.get_ting_cards(temp_hand, self.magic_count)
            if len(ting) > best_ting_count:
                best_ting_count = len(ting)
                best_combo = combo
        
        # 如果吃后能增加听牌机会
        if best_ting_count > len(self.game.get_ting_cards(self.hand, self.magic_count)):
            return best_combo
        
        return None
    
    def _hand_quality(self) -> float:
        """评估手牌质量 0-1"""
        # 计算搭子数量
        groups = 0
        card_counts = Counter(c.to_index() for c in self.hand)
        
        for idx, count in card_counts.items():
            if count >= 3:
                groups += 1
            elif count == 2:
                groups += 0.5
        
        # 顺子潜力
        for i in range(27):  # 万筒条
            if i % 9 <= 6:  # 可以组成顺子
                has1 = card_counts[i] > 0
                has2 = card_counts[i+1] > 0
                has3 = card_counts[i+2] > 0
                if has1 and has2 and has3:
                    groups += 1
                elif (has1 and has2) or (has2 and has3) or (has1 and has3):
                    groups += 0.5
        
        # 最大4组顺子/刻子 + 1对将
        return min(groups / 4, 1.0)
    
    def _opponent_making_big_hand(self) -> bool:
        """判断是否有对手在做大牌"""
        for player_id, pengs in self.other_players_peng.items():
            # 如果对手有很多碰，可能在做碰碰胡
            if len(pengs) >= 2:
                return True
        
        for player_id, gangs in self.other_players_gang.items():
            # 如果对手有杠，番数很高
            if len(gangs) > 0:
                return True
        
        return False
    
    def update_after_discard(self, card: Card):
        """更新弃牌信息"""
        self.discarded.append(card)
        if card in self.hand:
            self.hand.remove(card)
        self._update_estimated_wall()
    
    def update_opponent_discard(self, player_id: int, card: Card):
        """更新对手弃牌信息"""
        self.other_players_discard[player_id].append(card)
        self.estimated_wall[card.to_index()] -= 1
    
    def update_after_peng(self, card: Card):
        """更新碰牌信息"""
        self.peng_cards.append([card, card, card])
        self.hand.remove(card)
        self.hand.remove(card)
        self._update_estimated_wall()
    
    def update_after_gang(self, card: Card, is_an_gang: bool = False):
        """更新杠牌信息"""
        if is_an_gang:
            self.gang_cards.append([card, card, card, card])
            for _ in range(4):
                if card in self.hand:
                    self.hand.remove(card)
        else:
            self.gang_cards.append([card, card, card, card])
            for _ in range(3):
                if card in self.hand:
                    self.hand.remove(card)
        self._update_estimated_wall()


class MahjongGameSimulator:
    """麻将游戏模拟器"""
    
    def __init__(self):
        self.game = ShandongMahjong()
        self.players: List[MahjongAI] = []
        self.current_player = 0
        self.winner = None
        self.win_type = None
    
    def init_game(self):
        """初始化游戏"""
        hands, magic = self.game.shuffle_and_deal()
        
        self.players = []
        for i in range(4):
            ai = MahjongAI(i)
            ai.init_hand(hands[i], self.game)
            self.players.append(ai)
    
    def simulate_round(self) -> Dict:
        """模拟一轮游戏"""
        self.init_game()
        
        max_turns = 100
        for turn in range(max_turns):
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
                    "turns": turn
                }
            
            # 决定出牌
            discard = player.decide_discard()
            player.update_after_discard(discard)
            self.game.discarded.append(discard)
            
            # 通知其他玩家
            for p in self.players:
                if p.player_id != self.current_player:
                    p.update_opponent_discard(self.current_player, discard)
            
            # 检查其他玩家是否可以碰/杠/胡
            for i, p in enumerate(self.players):
                if i == self.current_player:
                    continue
                
                # 检查胡牌
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
                        "turns": turn
                    }
            
            # 轮到下一家
            self.current_player = (self.current_player + 1) % 4
        
        return {"result": "荒庄", "turns": max_turns}
    
    def simulate_games(self, num_games: int) -> Dict:
        """模拟多局游戏"""
        results = {
            "total": num_games,
            "hu": 0,
            "huang": 0,
            "wins": [0, 0, 0, 0],
            "win_types": {"自摸": 0, "点炮": 0}
        }
        
        for _ in range(num_games):
            result = self.simulate_round()
            
            if result["result"] == "胡牌":
                results["hu"] += 1
                winner = result["winner"]
                win_type = result["win_type"]
                results["wins"][winner] += 1
                results["win_types"][win_type] += 1
            else:
                results["huang"] += 1
        
        return results


# 测试代码
if __name__ == "__main__":
    print("=" * 60)
    print("山东麻将AI系统测试")
    print("=" * 60)
    
    # 测试胡牌判断
    print("\n1. 测试胡牌判断")
    game = ShandongMahjong()
    
    # 测试七对
    hand_qidui = [
        Card(CardType.WAN, 1), Card(CardType.WAN, 1),
        Card(CardType.WAN, 3), Card(CardType.WAN, 3),
        Card(CardType.TONG, 2), Card(CardType.TONG, 2),
        Card(CardType.TONG, 5), Card(CardType.TONG, 5),
        Card(CardType.TIAO, 4), Card(CardType.TIAO, 4),
        Card(CardType.FENG, 1), Card(CardType.FENG, 1),
        Card(CardType.JIAN, 2), Card(CardType.JIAN, 2),
    ]
    can_hu, info = game.can_hu(hand_qidui)
    print(f"七对测试: {'通过' if can_hu and info.get('type') == '七对' else '失败'}")
    
    # 测试平胡（四扑一将）
    hand_pinghu = [
        Card(CardType.WAN, 1), Card(CardType.WAN, 2), Card(CardType.WAN, 3),
        Card(CardType.WAN, 4), Card(CardType.WAN, 5), Card(CardType.WAN, 6),
        Card(CardType.TONG, 2), Card(CardType.TONG, 2),  # 将牌
        Card(CardType.TONG, 3), Card(CardType.TONG, 3), Card(CardType.TONG, 3),
        Card(CardType.TIAO, 5), Card(CardType.TIAO, 6), Card(CardType.TIAO, 7),
    ]
    can_hu, info = game.can_hu(hand_pinghu)
    print(f"平胡测试: {'通过' if can_hu and info.get('type') == '平胡' else '失败'}")
    
    # 测试AI决策
    print("\n2. 测试AI决策")
    ai = MahjongAI(0)
    ai.init_hand(hand_pinghu, game)
    discard = ai.decide_discard()
    print(f"AI建议打出: {discard}")
    
    # 模拟游戏
    print("\n3. 模拟100局游戏")
    simulator = MahjongGameSimulator()
    results = simulator.simulate_games(100)
    
    print(f"总对局数: {results['total']}")
    print(f"胡牌局数: {results['hu']}")
    print(f"荒庄局数: {results['huang']}")
    print(f"各家获胜次数: {results['wins']}")
    print(f"胡牌方式: {results['win_types']}")
    print(f"AI(0号)胜率: {results['wins'][0] / results['total'] * 100:.1f}%")
