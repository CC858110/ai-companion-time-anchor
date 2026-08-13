"""Minimal regression tests for the Chinese time-expression detector.

The `UserPromptSubmit` hook flags a message as containing an explicit time so it
can emit a clock-free attention cue. A bare "<中文数字>点" is ambiguous — it may
be a clock time (一点半 / 两点十五分) or a quantity / degree ("有一点难受",
"有两点问题", "一点也不慢"). The detector must only treat "点" as a clock time
when it carries a clock completion (半 / 钟 / <数字>分), or when a time-of-day
word (凌晨 / 下午 / 晚上 …) makes the context a time.

Both the Codex edition (repo root) and the Claude Code edition duplicate this
regex; this test checks both so the two copies cannot drift apart.

Run: `python tests/test_time_expression.py`  (exit 0 = pass, 1 = failure)
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

HOOKS = {
    "codex": ROOT / "hooks" / "user_prompt_submit.py",
    "claude-code": ROOT / "claude-code" / "hooks" / "user_prompt_submit.py",
}

# Should be detected as an explicit time.
POSITIVES = [
    "现在几点了",          # 现在
    "一点半睡的",          # 点 + 半
    "两点十五分开会",       # 点 + 分
    "两点钟见",            # 点 + 钟
    "凌晨两点还没睡",       # 凌晨 (time-of-day word)
    "下午三点见面",         # 下午
    "晚上八点到家",         # 晚上
    "3点半到",             # digits + 半
    "13:05 出发",          # HH:MM
    "明天再聊",            # 明天
    "等了十分钟",           # 时长（数字 + 分钟）
]

# Must NOT be detected as an explicit time (quantity / degree / counting).
NEGATIVES = [
    "我有一点难受",         # 一点 = a little
    "这个问题有两点",       # 两点 = two items
    "这次一点也不慢",       # 一点也不 = not at all
    "有一点点累",          # 一点点
    "给你三点建议",         # 三点 = three points
    "我想你了",            # no temporal content
    "我们聊聊近况吧",       # no temporal content
]


def load_regex(path: Path):
    spec = importlib.util.spec_from_file_location(f"hook_{path.parent.parent.name}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.TIME_EXPRESSION


def main() -> None:
    failures: list[str] = []
    for edition, path in HOOKS.items():
        regex = load_regex(path)
        for text in POSITIVES:
            if not regex.search(text):
                failures.append(f"[{edition}] POSITIVE not detected: {text!r}")
        for text in NEGATIVES:
            hit = regex.search(text)
            if hit:
                failures.append(f"[{edition}] NEGATIVE wrongly matched {text!r} -> {hit.group()!r}")

    if failures:
        print("FAILED:")
        for line in failures:
            print("  -", line)
        raise SystemExit(1)
    print(f"OK: {len(POSITIVES)} positives + {len(NEGATIVES)} negatives passed for {', '.join(HOOKS)}")


if __name__ == "__main__":
    main()
