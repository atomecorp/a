#!/bin/bash
# One-off cleanup of the remote branches of atomecorp/a and atomecorp/eVe (decided 2026-11-02).
# - Brings main up to date (fast-forward only) in a and in its eVe submodule.
# - Keeps lyrix (the lyrics/voice project): left in a, and copied with its whole history to its own
#   repository atomecorp/lyrix (private) when the GitHub CLI `gh` is installed and signed in.
# - Deletes every other branch except main. Before that, each branch is checked: a branch already in main
#   is simply deleted; an obsolete one (old src/, src-Auv3/, mtrack layout, never merged) is first kept as a
#   tag `archive/<branch>`, so its commits stay recoverable without showing as a branch.
# Run from anywhere inside the a repository:  bash scripts/git_cleanup_branches_2026-11-02.sh
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
[ -d eVe ] || { echo "ERROR: run this inside the atomecorp/a repository (eVe submodule not found)"; exit 1; }

A_MERGED=(backup/main-pre-r104-20261101-140505 claude/magical-ptolemy-x4b0re refonte-r104 Vie codex/youtube-finder-integration
          debian_server_safety_bck f2p_test iOS-App-Launcher windows_install)
A_OBSOLETE=(Mtrax2Mol test_user audio-streaming-solving iPlug-integration)
A_KEEP=lyrix
EVE_MERGED=(backup/main-pre-r104-20261101-140505 claude/magical-ptolemy-x4b0re refonte-r104 codex/youtube-finder-integration)
EVE_OBSOLETE=(MTrax2Mol)

clean_tree() {
    if [ -n "$(git -C "$1" status --porcelain --untracked-files=no)" ]; then
        echo "ERROR: uncommitted changes in $1 — commit or stash them first, nothing was changed."; exit 1
    fi
}
remote_has() { git -C "$1" ls-remote --exit-code --heads origin "$2" >/dev/null 2>&1; }

update_main() { # $1: repository path
    git -C "$1" fetch --prune origin '+refs/heads/*:refs/remotes/origin/*'
    if [ "$(git -C "$1" rev-parse --is-shallow-repository)" = true ]; then git -C "$1" fetch --unshallow origin; fi
    git -C "$1" checkout main
    git -C "$1" merge --ff-only origin/main
}

delete_branches() { # $1: repository path, $2: merged|obsolete, rest: branch names
    local repo="$1" kind="$2"; shift 2
    for branch in "$@"; do
        if ! remote_has "$repo" "$branch"; then echo "  $branch: already gone"; continue; fi
        if [ "$kind" = merged ] && ! git -C "$repo" merge-base --is-ancestor "origin/$branch" origin/main; then
            echo "  $branch: NOT contained in main any more — kept, check it by hand"; continue
        fi
        if [ "$kind" = obsolete ]; then
            git -C "$repo" tag -f "archive/$branch" "origin/$branch" >/dev/null
            git -C "$repo" push -q origin "refs/tags/archive/$branch"
        fi
        git -C "$repo" push -q origin --delete "$branch"
        git -C "$repo" branch -D "$branch" >/dev/null 2>&1 || true
        echo "  $branch: deleted${kind:+ ($kind)}"
    done
}

echo "== Checking local changes"
clean_tree "$ROOT"; clean_tree "$ROOT/eVe"

echo "== Updating main"
update_main "$ROOT"
git submodule update --init eVe
update_main "$ROOT/eVe"
if [ "$(git rev-parse HEAD:eVe)" != "$(git -C eVe rev-parse origin/main)" ]; then
    echo "WARNING: a's eVe reference ($(git rev-parse --short HEAD:eVe)) differs from eVe main ($(git -C eVe rev-parse --short origin/main))"
fi
echo "  a main:   $(git log -1 --format='%h %cs %s' origin/main)"
echo "  eVe main: $(git -C eVe log -1 --format='%h %cs %s' origin/main)"

echo "== Keeping $A_KEEP in its own repository atomecorp/$A_KEEP"
if remote_has "$ROOT" "$A_KEEP"; then
    if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
        gh repo view "atomecorp/$A_KEEP" >/dev/null 2>&1 || gh repo create "atomecorp/$A_KEEP" --private \
            --description "Lyrix, kept from atomecorp/a branch lyrix (2026-11-02)" >/dev/null
        git push -q "https://github.com/atomecorp/$A_KEEP.git" "refs/remotes/origin/$A_KEEP:refs/heads/main"
        echo "  copied to https://github.com/atomecorp/$A_KEEP (branch main); the branch stays in a too"
    else
        echo "  GitHub CLI 'gh' missing or not signed in: lyrix stays in a only (install gh, run 'gh auth login', run this again)"
    fi
else
    echo "  WARNING: branch $A_KEEP not found on atomecorp/a"
fi

echo "== Deleting branches of atomecorp/a"
delete_branches "$ROOT" merged "${A_MERGED[@]}"
delete_branches "$ROOT" obsolete "${A_OBSOLETE[@]}"
echo "== Deleting branches of atomecorp/eVe"
delete_branches "$ROOT/eVe" merged "${EVE_MERGED[@]}"
delete_branches "$ROOT/eVe" obsolete "${EVE_OBSOLETE[@]}"

git fetch -q --prune origin; git -C eVe fetch -q --prune origin
echo "== Remaining branches"
echo "  a:   $(git ls-remote --heads origin | sed 's#.*refs/heads/##' | tr '\n' ' ')"
echo "  eVe: $(git -C eVe ls-remote --heads origin | sed 's#.*refs/heads/##' | tr '\n' ' ')"
echo "Done. Obsolete branches are kept as tags archive/<name> (git tag -l 'archive/*')."
