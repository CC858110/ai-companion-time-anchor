"""Regression test for issue #6: UTF-8 BOM on the hook's stdin.

On Windows the JSON that Claude Code (or any pipe in between) feeds to the
hook may arrive with a UTF-8 BOM prefix. Decoding with plain ``utf-8`` keeps
the BOM bytes and ``json.loads`` fails before any hook logic runs. Both hook
editions must decode stdin with ``utf-8-sig``, which strips a leading BOM and
is byte-identical to ``utf-8`` when no BOM is present.

The test runs each hook as a real subprocess — once with plain UTF-8 input and
once with BOM-prefixed input — and requires a zero exit status and an updated
snapshot file for both. State is redirected to a temporary directory by
patching ``STATE_DIR`` through an injected sitecustomize-free wrapper: the
hook reads ``STATE_DIR`` at import time, so the wrapper imports the module and
overrides the constant before calling ``main()``.

Run: ``python tests/test_stdin_bom.py``  (exit 0 = pass, 1 = failure)
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

HOOKS = {
    "codex": ROOT / "hooks" / "user_prompt_submit.py",
    "claude-code": ROOT / "claude-code" / "hooks" / "user_prompt_submit.py",
}

WRAPPER = """
import importlib.util
import sys
from pathlib import Path

hook_path, state_dir = sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location("hook_under_test", hook_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.STATE_DIR = Path(state_dir)
module.main()
"""


def run_hook(hook_path: Path, state_dir: Path, raw: bytes) -> subprocess.CompletedProcess:
    import os

    env = dict(os.environ)
    env["TIME_ANCHOR_FORCE"] = "1"
    env.pop("TIME_ANCHOR_DISABLE", None)
    return subprocess.run(
        [sys.executable, "-c", WRAPPER, str(hook_path), str(state_dir)],
        input=raw,
        capture_output=True,
        timeout=30,
        env=env,
    )


def main() -> int:
    event = {
        "hook_event_name": "UserPromptSubmit",
        "session_id": "bom-regression-test",
        "prompt": "just checking in",
        "cwd": "",
    }
    plain = json.dumps(event).encode("utf-8")
    with_bom = b"\xef\xbb\xbf" + plain

    failures: list[str] = []
    for edition, hook_path in HOOKS.items():
        for label, raw in (("plain utf-8", plain), ("utf-8 with BOM", with_bom)):
            with tempfile.TemporaryDirectory() as temp:
                state_dir = Path(temp)
                result = run_hook(hook_path, state_dir, raw)
                snapshots = list(state_dir.glob("*.json"))
                if result.returncode != 0:
                    failures.append(
                        f"[{edition}] {label}: exit {result.returncode}\n"
                        f"{result.stderr.decode('utf-8', 'replace')[:500]}"
                    )
                elif not snapshots:
                    failures.append(f"[{edition}] {label}: hook ran but wrote no snapshot")

    if failures:
        print("FAIL")
        for failure in failures:
            print(failure)
        return 1
    print(f"PASS: {len(HOOKS) * 2} hook runs (plain and BOM) all exited 0 with snapshots")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
