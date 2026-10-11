# CLAUDE.md

- **Give every subtask its own worktree.** A subagent takes `isolation: "worktree"`; a session enters one with
  `EnterWorktree`. Two agents in one checkout collide — they edit the same file at the same time, and a `git add -A`
  from either commits the other's half-finished work. Every worktree branches from `origin/master`, which is
  `worktree.baseRef`'s default and why `.claude/settings.json` does not set it: work goes through pull requests, so a
  branch wants the tip of what has already merged rather than whatever a local `master` happens to be at. Nothing to
  fast-forward, and nothing carried in from a `master` somebody forgot to pull. The cost is that a worktree cannot build
  on an unmerged branch, so stacked work waits for the branch beneath it to land.
- **Open a pull request; `master` is protected.** A direct push is rejected rather than queued, so branch, push the
  branch, and open the PR with `gh pr create`. What the protection requires is deliberately not restated here —
  transcribing it is how this drifted before, down to naming a required check that had since been renamed — so read it
  from `gh api repos/{owner}/{repo}/branches/master/protection` and `gh api repos/{owner}/{repo}/rulesets`, either of
  which may be the one in force. The approval comes from Claude, which `claude-review.yaml` runs on every pull request
  that is neither a draft nor a bot's — nobody here can approve their own. So open it ready for review rather than as a
  draft: a draft gets no review, and waits on someone to mark it ready before the approval it needs can come.
- **Ask whether a pull request should merge itself.** `gh pr merge --auto --squash` hands it to GitHub, which merges the
  moment the checks pass and the review approves — with nobody looking at it again. That is the user's call rather than
  a default to assume either way, so when they have not said, ask before opening it, and leave auto-merge off until they
  answer.
