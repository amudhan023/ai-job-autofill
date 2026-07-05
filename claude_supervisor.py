#!/usr/bin/env python3

# =========================================================
# LEARNINGS FROM PRIOR RUNS (update this if you change the approach)
# =========================================================
# - Do NOT drive the interactive `claude` TUI via pexpect/PTY. Writing a
#   multi-line prompt in one pty write() lands as a paste-like burst, and
#   Claude Code's compose box treats bursts as literal unsent text rather
#   than a submitted message. Two real runs sat idle for the full 1800s
#   timeout with zero backlog progress before this was caught. Use headless
#   `claude -p "<prompt>"` instead: no TUI, no submit race, no pexpect
#   dependency to install.
# - Headless mode has no human to answer permission prompts. Use
#   --permission-mode + --allowedTools scoped to what the autodev workflow
#   actually runs (git/gh/npm/pytest/docker/file edits) rather than
#   --dangerously-skip-permissions — the CLI's own --help says that flag is
#   meant for network-isolated sandboxes, not a real dev machine with push
#   access.
# - TOKEN_ERROR_PATTERNS substring-matches raw stdout/stderr. The old
#   interactive-mode output included marketing banner text ("Fable 5 is
#   back... weekly usage limit") that matched "usage limit" and triggered a
#   multi-hour false-positive sleep with no real rate limit hit. Headless
#   `-p` output is plain text without that banner, but if false positives
#   resurface, tighten these patterns rather than trusting a bare substring
#   match.
# - Separately from script bugs: watch actual account usage — one run
#   surfaced "You've used 90% of your session limit" from the CLI itself.
# =========================================================

import os
import subprocess
import sys
import time
import json
from datetime import datetime, timedelta

# =========================================================
# PROJECT ROOT = where you run the script
# =========================================================

PROJECT_DIR = os.getcwd()

SUPERVISOR_DIR = os.path.join(PROJECT_DIR, ".claude-supervisor")
LOG_DIR = os.path.join(SUPERVISOR_DIR, "logs")
STATE_FILE = os.path.join(SUPERVISOR_DIR, "state.json")

# =========================================================
# BOOTSTRAP PROMPT (minimal, relies on CLAUDE.md)
# =========================================================

BOOTSTRAP_PROMPT = """
Read CLAUDE.md.

Execute the autonomous development workflow defined there.

Complete exactly ONE backlog item.

Run tests, fix failures, update backlog and state.

Then exit.
"""

# =========================================================
# CONFIG
# =========================================================

RETRY_DELAY_SECONDS = 30
SUCCESS_DELAY_SECONDS = 2
CLAUDE_TIMEOUT_SECONDS = 1800  # a full backlog task (tests, PR, CI) can take a while

# Headless (-p/--print) runs have no human to answer permission prompts, so
# tool use has to be pre-approved. Scoped to what the autodev per-task
# workflow (docs/BACKLOG.md -> .claude/skills/autodev/SKILL.md) actually
# needs, rather than a blanket --dangerously-skip-permissions bypass.
PERMISSION_MODE = "acceptEdits"
ALLOWED_TOOLS = [
    "Read", "Write", "Edit", "Glob", "Grep",
    "Bash(git *)",
    "Bash(gh *)",
    "Bash(npm *)",
    "Bash(npx *)",
    "Bash(cd *)",
    "Bash(venv/bin/python *)",
    "Bash(venv/bin/pip *)",
    "Bash(docker *)",
]

TOKEN_RESET_TIMES = [
    "02:00",
    "06:00",
    "14:00",
    "18:00",
    "23:00",
]

TOKEN_ERROR_PATTERNS = [
    "token limit",
    "usage limit",
    "rate limit",
    "quota exceeded",
    "try again later",
    "too many requests",
]

# =========================================================
# SETUP
# =========================================================

def ensure_dirs():
    os.makedirs(LOG_DIR, exist_ok=True)


def log(msg):
    line = f"[{datetime.now().isoformat()}] {msg}"
    print(line)

    with open(os.path.join(LOG_DIR, "supervisor.log"), "a") as f:
        f.write(line + "\n")


def load_state():
    if not os.path.exists(STATE_FILE):
        return {}
    with open(STATE_FILE, "r") as f:
        return json.load(f)


def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


# =========================================================
# VALIDATION
# =========================================================

def validate_project():
    required = ["CLAUDE.md"]

    for f in required:
        if not os.path.exists(os.path.join(PROJECT_DIR, f)):
            raise Exception(f"Missing required file: {f}")


# =========================================================
# TOKEN RESET LOGIC (macOS safe)
# =========================================================

def next_reset_seconds():
    now = datetime.now()
    today = now.date()

    candidates = []

    for t in TOKEN_RESET_TIMES:
        hh, mm = map(int, t.split(":"))
        target = datetime.combine(today, datetime.min.time()).replace(hour=hh, minute=mm)

        if target <= now:
            target += timedelta(days=1)

        candidates.append((target - now).total_seconds())

    return min(candidates)


def wait_for_reset():
    seconds = next_reset_seconds()

    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)

    log(f"⛔ Token limit detected. Sleeping {hours}h {minutes}m until reset window.")
    time.sleep(seconds)
    log("✅ Token reset window reached. Resuming.")


# =========================================================
# TOKEN DETECTION
# =========================================================

def is_token_limit(output: str):
    if not output:
        return False
    text = output.lower()
    return any(p in text for p in TOKEN_ERROR_PATTERNS)


# =========================================================
# RUN CLAUDE
# =========================================================

def run_claude(state):
    log("🚀 Launching Claude (headless -p session)...")

    command = [
        "claude",
        "-p", BOOTSTRAP_PROMPT.strip(),
        "--permission-mode", PERMISSION_MODE,
        "--allowedTools", *ALLOWED_TOOLS,
    ]

    try:
        result = subprocess.run(
            command,
            cwd=PROJECT_DIR,
            capture_output=True,
            text=True,
            timeout=CLAUDE_TIMEOUT_SECONDS,
        )
        output = (result.stdout or "") + (result.stderr or "")
        return result.returncode, output

    except subprocess.TimeoutExpired as e:
        log(f"⏱️ Claude session timed out after {CLAUDE_TIMEOUT_SECONDS}s.")
        output = (e.stdout or "") + (e.stderr or "")
        return 1, output

    except Exception as e:
        log(f"❌ Launch failure: {e}")
        return 1, str(e)

# =========================================================
# MAIN LOOP
# =========================================================

def main():
    ensure_dirs()
    validate_project()

    log("======================================")
    log(" Claude Supervisor Started (macOS) ")
    log(f" Project: {PROJECT_DIR}")
    log("======================================")

    state = load_state()
    state.setdefault("runs", 0)
    state.setdefault("token_hits", 0)

    try:
        while True:
            state["runs"] += 1
            save_state(state)

            exit_code, output = run_claude(state)

            run_log = os.path.join(LOG_DIR, f"run-{state['runs']}.log")

            with open(run_log, "w") as f:
                f.write(output or "")

            log(f"Claude exited with code {exit_code}")

            # -------------------------
            # TOKEN LIMIT HANDLING
            # -------------------------
            if is_token_limit(output):
                state["token_hits"] += 1
                save_state(state)

                wait_for_reset()
                continue

            # -------------------------
            # SUCCESS
            # -------------------------
            if exit_code == 0:
                log("✅ Task completed successfully.")
                time.sleep(SUCCESS_DELAY_SECONDS)
                continue

            # -------------------------
            # FAILURE
            # -------------------------
            log("⚠️ Unexpected failure.")
            log(f"Retrying in {RETRY_DELAY_SECONDS}s...")
            time.sleep(RETRY_DELAY_SECONDS)
    except KeyboardInterrupt:
        log("🛑 Supervisor stopped by user (Ctrl+C).")
        sys.exit(0)


if __name__ == "__main__":
    main()