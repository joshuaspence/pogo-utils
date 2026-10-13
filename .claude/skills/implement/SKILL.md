---
name: implement
description: >-
  Implement GitHub issues against `pogo-utils`, each in a subagent with a git worktree of its own. Use when the user
  runs `/implement`, or asks to implement, fix or work on issues by number — above all several at once, which `/subtask`
  cannot do safely.
---

# Implementing issues

Give each issue the argument names (`/implement 297 298 299`) a forked subagent of its own, started with the `Agent`
tool's `subagent_type: "fork"` and `isolation: "worktree"`, all in one message so they run at once.

## Why not `/subtask`

A `/subtask` fork shares the session's working directory. When one fork enters a worktree the session moves, and every
other fork with it, so a sibling's `EnterWorktree`, `cd` or `git switch` lands the next edit in the wrong checkout — and
the stash list is shared too, so a `git stash pop` can take another fork's work. `isolation: "worktree"` gives each
agent a directory nothing else moves. No setting, flag or hook makes `/subtask` do the same: the
[sub-agents docs](https://code.claude.com/docs/en/sub-agents.md) leave `isolation` to whoever calls the `Agent` tool,
and the [`SubagentStart` hook](https://code.claude.com/docs/en/hooks.md) is observational only.

## Before spawning

Ask once, for the whole batch, whether the pull requests should merge themselves. `CLAUDE.md` wants that asked before a
pull request opens, and a fork cannot ask, so pass the answer to every agent.

## What each agent is told

- The issue number, to read with `gh issue view`.
- It already stands in its own worktree, branched from `origin/master`. It renames that branch with `git branch -m`
  rather than switching, and never calls `EnterWorktree`, leaves the worktree or touches another one.
- It stages paths by name rather than with `git add -A`, and never stashes.
- It finishes as `CLAUDE.md` says: commit, push the branch and open the pull request ready for review, with screenshots
  when it changes what a page draws and auto-merge as the user answered.

Relay each agent's report as it lands: the pull request, what was checked and what was not.
