#!/bin/bash
# 2026-09-07: Purge secrets/ + _screenshots/ + .d1-id from git history
# Run this from your local clone of the edutunisie repo
# 
# Usage: cd /path/to/edutunisie && bash scripts/purge-history.sh

set -e

echo "=== 1. Make a fresh clone to operate on ==="
cd /tmp
rm -rf edutunisie-purge
git clone --no-checkout https://gitlab.com/bmghappmixtun/edutunisie.git edutunisie-purge
cd edutunisie-purge

echo "=== 2. Add all branches ==="
for branch in $(git -C /workspace/edutunisie branch -a | grep "remotes/origin/" | grep -v HEAD | sed 's|.*origin/||'); do
  echo "  adding $branch"
  git branch "$branch" "origin/$branch" 2>/dev/null || true
done

echo "=== 3. Run filter-repo to remove sensitive paths ==="
git filter-repo --invert-paths \
  --path secrets/ \
  --path _screenshots/ \
  --path .d1-id \
  --force

echo "=== 4. Run filter-repo to scrub password strings from all commits ==="
cat > /tmp/secrets-to-scrub.txt << 'EOF'
npg_uwOy9TgqYS5D
npg_JgA1DjCtcB9G
npg_Q9zsJGqZVnW2
npg_LavIdHSeE84f
22ad2e7f-1692-486e-9131-d6c4062012e1
EOF
git filter-repo --replace-text /tmp/secrets-to-scrub.txt --force

echo "=== 5. Force-push all branches ==="
git remote add origin-clean "https://oauth2:\${GITLAB_TOKEN}@gitlab.com/bmghappmixtun/edutunisie.git" 2>/dev/null || true
git push --force --all origin-clean

echo "=== 6. Force-push all tags (if any) ==="
git push --force --tags origin-clean 2>/dev/null || true

echo "=== 7. Cleanup ==="
rm /tmp/secrets-to-scrub.txt

echo "=== Done! ==="
echo "Verify: git log --all -p -S 'npg_uwOy9TgqYS5D' | head"
echo "Should be empty."
