Check the current PR status and handle merge if ready:

1. Identify the open PR for the current branch using `gh pr view`
2. Check CI status using `gh pr checks`
3. Review the PR test plan — check off all items that have been verified
4. If all CI checks pass and all test plan items are complete:
   - Update the PR body with all items checked off
   - Merge the PR using `gh pr merge --merge`
   - Switch to main and pull: `git checkout main && git pull`
5. If any items are incomplete, report what remains to be done
