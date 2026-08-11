#!/bin/zsh

set -euo pipefail

SCRIPT_DIR=${0:A:h}
FRAMEWORK_ROOT=${SCRIPT_DIR:h}
TARGET_PATH=$FRAMEWORK_ROOT
COMMIT_MESSAGE=''
typeset -a REQUESTED_PATHS

print_usage() {
  cat <<'USAGE'
Usage:
  ./scripts/commit_and_push.sh --message "Commit message" -- <path> [<path> ...]
  ./scripts/commit_and_push.sh --repository eVe --message "Commit message" -- <path> [<path> ...]

The repository must be the framework root or a Git repository inside it.
Only the explicitly listed paths are staged. Existing staged changes are rejected.
The script never force-pushes and never creates or updates tags.
USAGE
}

fail() {
  print -u2 -- "Error: $1"
  exit 1
}

while (( $# > 0 )); do
  case "$1" in
    --repository)
      (( $# >= 2 )) || fail '--repository requires a path'
      TARGET_PATH=$2
      shift 2
      ;;
    --message)
      (( $# >= 2 )) || fail '--message requires a value'
      COMMIT_MESSAGE=$2
      shift 2
      ;;
    --help|-h)
      print_usage
      exit 0
      ;;
    --)
      shift
      REQUESTED_PATHS=("$@")
      break
      ;;
    *)
      fail "unknown option: $1"
      ;;
  esac
done

[[ -n "$COMMIT_MESSAGE" ]] || fail 'a non-empty --message is required'
(( ${#REQUESTED_PATHS[@]} > 0 )) || fail 'at least one explicit path is required after --'

if [[ "$TARGET_PATH" != /* ]]; then
  TARGET_PATH="$FRAMEWORK_ROOT/$TARGET_PATH"
fi
[[ -d "$TARGET_PATH" ]] || fail "repository directory not found: $TARGET_PATH"

TARGET_ROOT=$(git -C "$TARGET_PATH" rev-parse --show-toplevel 2>/dev/null) || fail 'target is not a Git repository'
TARGET_ROOT=${TARGET_ROOT:A}
case "$TARGET_ROOT" in
  "$FRAMEWORK_ROOT"|"$FRAMEWORK_ROOT"/*) ;;
  *) fail 'target repository must be the framework root or a repository inside it' ;;
esac

for requested_path in "${REQUESTED_PATHS[@]}"; do
  case "$requested_path" in
    ''|/*|..|../*|*/../*|*/..|:*) fail "unsafe path: $requested_path" ;;
  esac
  [[ -n "$(git -C "$TARGET_ROOT" status --porcelain=v1 --untracked-files=all -- "$requested_path")" ]] \
    || fail "path has no pending change: $requested_path"
done

[[ -z "$(git -C "$TARGET_ROOT" diff --cached --name-only)" ]] \
  || fail 'the repository already contains staged changes; review and clear them before using this script'

UNMERGED=$(git -C "$TARGET_ROOT" diff --name-only --diff-filter=U)
[[ -z "$UNMERGED" ]] || fail 'the repository contains unresolved merge conflicts'

BRANCH=$(git -C "$TARGET_ROOT" symbolic-ref --quiet --short HEAD 2>/dev/null) \
  || fail 'detached HEAD is not supported'
REMOTE_URL=$(git -C "$TARGET_ROOT" remote get-url origin 2>/dev/null) \
  || fail 'the origin remote is not configured'

print -- "Repository: $TARGET_ROOT"
print -- "Branch:     $BRANCH"
print -- "Remote:     $REMOTE_URL"
print -- "Message:    $COMMIT_MESSAGE"
print -- 'Selected changes:'
git -C "$TARGET_ROOT" status --short -- "${REQUESTED_PATHS[@]}"
git -C "$TARGET_ROOT" diff --check -- "${REQUESTED_PATHS[@]}"

CONFIRMATION="COMMIT AND PUSH $BRANCH"
print
read "answer?Type '$CONFIRMATION' to continue: "
[[ "$answer" == "$CONFIRMATION" ]] || fail 'confirmation did not match; nothing was staged'

git -C "$TARGET_ROOT" add -- "${REQUESTED_PATHS[@]}"
git -C "$TARGET_ROOT" diff --cached --quiet && fail 'no staged change remains after path validation'
git -C "$TARGET_ROOT" diff --cached --check
git -C "$TARGET_ROOT" diff --cached --stat
git -C "$TARGET_ROOT" commit -m "$COMMIT_MESSAGE"

if git -C "$TARGET_ROOT" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' >/dev/null 2>&1; then
  git -C "$TARGET_ROOT" push --porcelain
else
  git -C "$TARGET_ROOT" push --porcelain --set-upstream origin "$BRANCH"
fi

print -- "Committed and pushed $BRANCH from $TARGET_ROOT"
