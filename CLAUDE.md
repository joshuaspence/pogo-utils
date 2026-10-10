# CLAUDE.md

- **Give every subtask its own worktree.** A subagent takes `isolation: "worktree"`; a session enters one with
  `EnterWorktree`. Two agents in one checkout collide — they edit the same file at the same time, and a `git add -A`
  from either commits the other's half-finished work. Every worktree branches from `origin/master`, which is
  `worktree.baseRef`'s default and why `.claude/settings.json` does not set it: work goes through pull requests, so a
  branch wants the tip of what has already merged rather than whatever a local `master` happens to be at. Nothing to
  fast-forward, and nothing carried in from a `master` somebody forgot to pull. The cost is that a worktree cannot build
  on an unmerged branch, so stacked work waits for the branch beneath it to land.
- **Open a pull request; `master` is protected.** A ruleset requires a pull request, green `Lint` and `Test` checks, and
  one approving review before anything lands, so a direct push to `master` is rejected rather than queued. Branch, push
  the branch, open the PR with `gh pr create`. The approval comes from Claude, which reviews every pull request and
  approves the ones it would merge — nobody here can approve their own.
- **Ask whether a pull request should merge itself.** `gh pr merge --auto --squash` hands it to GitHub, which merges the
  moment the checks pass and the review approves — with nobody looking at it again. That is the user's call rather than
  a default to assume either way, so when they have not said, ask before opening it, and leave auto-merge off until they
  answer. A pull request that pushes again loses its approval, since the ruleset dismisses a review when a commit
  arrives.
