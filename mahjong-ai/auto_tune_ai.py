"""
山东麻将AI黑盒调参器
目标：在胜率和响应速度之间寻找更优参数
"""

import argparse
import json
import random
import statistics
import time
from datetime import datetime
from typing import Dict, List

from advanced_ai import AIGameSimulator


def evaluate_risk(risk_tolerance: float, games: int) -> Dict:
    simulator = AIGameSimulator(risk_tolerance=risk_tolerance)
    started_at = time.perf_counter()
    results = simulator.simulate_games(games, verbose=False)
    elapsed = time.perf_counter() - started_at

    win_rate = results["wins"][0] / games if games > 0 else 0.0
    avg_response_ms = elapsed * 1000 / max(1, games)
    avg_turns = results.get("avg_turns", 0.0)

    # 综合评分：胜率优先，同时惩罚响应延迟
    score = win_rate * 100 - avg_response_ms * 0.02

    return {
        "risk_tolerance": risk_tolerance,
        "games": games,
        "win_rate": win_rate,
        "avg_response_ms": avg_response_ms,
        "avg_turns": avg_turns,
        "score": score,
        "raw": results,
    }


def build_candidates(min_risk: float, max_risk: float, trials: int, seed: int) -> List[float]:
    random.seed(seed)
    candidates = [0.25, 0.4, 0.55]
    while len(candidates) < trials:
        candidates.append(round(random.uniform(min_risk, max_risk), 3))
    return sorted({round(clamp(x, min_risk, max_risk), 3) for x in candidates})


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def main() -> None:
    parser = argparse.ArgumentParser(description="山东麻将AI黑盒调参器")
    parser.add_argument("--trials", type=int, default=10, help="搜索参数组数，默认10")
    parser.add_argument("--games-per-trial", type=int, default=200, help="每组参数自对弈局数，默认200")
    parser.add_argument("--min-risk", type=float, default=0.1, help="风险参数下界，默认0.1")
    parser.add_argument("--max-risk", type=float, default=0.9, help="风险参数上界，默认0.9")
    parser.add_argument("--seed", type=int, default=2026, help="随机种子，默认2026")
    parser.add_argument("--top-k", type=int, default=3, help="输出前K个参数，默认3")
    parser.add_argument("--save-json", type=str, default="", help="可选：保存完整结果到JSON")
    args = parser.parse_args()

    candidates = build_candidates(args.min_risk, args.max_risk, args.trials, args.seed)
    report: List[Dict] = []

    print("=" * 72)
    print("山东麻将AI黑盒调参开始")
    print("=" * 72)
    print(f"候选参数数量: {len(candidates)}")
    print(f"每组对局数: {args.games_per_trial}")

    for i, risk in enumerate(candidates, start=1):
        result = evaluate_risk(risk, args.games_per_trial)
        report.append(result)
        print(
            f"[{i:02d}/{len(candidates)}] risk={risk:.3f} "
            f"win={result['win_rate']*100:5.2f}% "
            f"latency={result['avg_response_ms']:6.2f}ms "
            f"score={result['score']:6.2f}"
        )

    ranked = sorted(report, key=lambda x: x["score"], reverse=True)
    top_k = ranked[: max(1, args.top_k)]

    print("\n" + "=" * 72)
    print("Top 参数推荐")
    print("=" * 72)
    for idx, item in enumerate(top_k, start=1):
        print(
            f"{idx}. risk={item['risk_tolerance']:.3f} | "
            f"win={item['win_rate']*100:5.2f}% | "
            f"latency={item['avg_response_ms']:6.2f}ms | "
            f"score={item['score']:6.2f}"
        )

    all_win_rates = [item["win_rate"] for item in report]
    print("\n统计摘要:")
    print(f"- 平均胜率: {statistics.mean(all_win_rates)*100:.2f}%")
    print(f"- 最佳胜率: {max(all_win_rates)*100:.2f}%")
    print(f"- 最低胜率: {min(all_win_rates)*100:.2f}%")

    if args.save_json:
        payload = {
            "created_at": datetime.now().isoformat(),
            "config": {
                "trials": args.trials,
                "games_per_trial": args.games_per_trial,
                "min_risk": args.min_risk,
                "max_risk": args.max_risk,
                "seed": args.seed,
            },
            "top_k": top_k,
            "all_results": ranked,
        }
        with open(args.save_json, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(f"\n完整结果已保存: {args.save_json}")

    best = top_k[0]
    print("\n建议:")
    print(f"- 下一轮训练默认使用 risk_tolerance={best['risk_tolerance']:.3f}")
    print("- 若追求更高胜率，可将 games-per-trial 提高到 500+")
    print("- 若追求更快迭代，可先用 100 局粗筛，再对 Top3 做 1000 局复验")


if __name__ == "__main__":
    main()

