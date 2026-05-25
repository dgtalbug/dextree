#!/usr/bin/env bash
#
# scripts/spec-to-issue/create.sh
#
# Create a GitHub tracking issue for a slice spec, with a stable marker
# linking the issue back to the spec so the script is idempotent on re-run.
#
# Usage:
#   bash scripts/spec-to-issue/create.sh                       # auto-detect from current branch
#   bash scripts/spec-to-issue/create.sh specs/024-workspace-switcher
#   bash scripts/spec-to-issue/create.sh --dry-run specs/024-workspace-switcher
#   bash scripts/spec-to-issue/create.sh --phase 2 specs/024-workspace-switcher
#   bash scripts/spec-to-issue/create.sh --no-project specs/024-workspace-switcher
#
# Convention:
# - One issue per slice spec, granular (vs the historical cluster cards).
# - The script appends `<!-- tracking-issue: #N -->` to spec.md once the
#   issue is created. On re-run, the marker is detected and the script
#   exits 0 without duplicate-creating.
# - The body template lives in scripts/spec-to-issue/template.md.
# - After creating the issue, the script also adds it to the Dextree
#   project board (number 4 under owner `dgtalbug` by default). The
#   project's auto-add workflow filters by `label:cluster`, so a `slice`-
#   labelled issue would not land there without this explicit add.
#
# Environment:
# - DEXTREE_PROJECT_NUMBER (default: 4)   GitHub project number
# - DEXTREE_PROJECT_OWNER  (default: dgtalbug)   project owner
#
# Requires:
# - gh CLI authenticated (`gh auth status`) with the `project` scope
#   (`gh auth refresh -s project` if needed)
# - The current directory is inside the dextree git repo

set -euo pipefail

DRY_RUN=false
PHASE=""
SPEC_DIR=""
ADD_TO_PROJECT=true
PROJECT_NUMBER="${DEXTREE_PROJECT_NUMBER:-4}"
PROJECT_OWNER="${DEXTREE_PROJECT_OWNER:-dgtalbug}"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --phase)
      if [ $# -lt 2 ] || [[ "$2" == --* ]]; then
        echo "Error: --phase requires a value" >&2
        exit 1
      fi
      PHASE="$2"
      shift 2
      ;;
    --no-project)
      ADD_TO_PROJECT=false
      shift
      ;;
    --help|-h)
      sed -n '1,/^set -euo/p' "$0" | head -n -1 | sed 's/^# //; s/^#//'
      exit 0
      ;;
    --*)
      echo "Error: unknown flag: $1" >&2
      exit 1
      ;;
    *)
      SPEC_DIR="$1"
      shift
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Resolve repo root + spec dir
# ---------------------------------------------------------------------------

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "Error: not inside a git repository" >&2
  exit 1
}
cd "$REPO_ROOT"

if [ -z "$SPEC_DIR" ]; then
  # Auto-detect from current branch name (matches the speckit convention NNN-<slug>)
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  if echo "$CURRENT_BRANCH" | grep -Eq '^[0-9]{3,}-'; then
    SPEC_DIR="specs/$CURRENT_BRANCH"
  else
    echo "Error: no spec dir given and current branch ($CURRENT_BRANCH) is not a speckit feature branch" >&2
    echo "Pass the spec dir explicitly: bash $0 specs/NNN-<slug>" >&2
    exit 1
  fi
fi

# Normalize: drop trailing slash, make repo-relative
SPEC_DIR=${SPEC_DIR%/}
SPEC_DIR=${SPEC_DIR#"$REPO_ROOT/"}

SPEC_FILE="$SPEC_DIR/spec.md"
if [ ! -f "$SPEC_FILE" ]; then
  echo "Error: $SPEC_FILE does not exist" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Parse slice number, slug, and title
# ---------------------------------------------------------------------------

SPEC_DIRNAME=$(basename "$SPEC_DIR")
SLICE_NUM=$(echo "$SPEC_DIRNAME" | grep -Eo '^[0-9]{3,}')
SLICE_SLUG=$(echo "$SPEC_DIRNAME" | sed -E 's/^[0-9]+-//')

if [ -z "$SLICE_NUM" ]; then
  echo "Error: could not parse slice number from $SPEC_DIRNAME" >&2
  exit 1
fi

# Title: first "# Feature Specification: <title>" line, else first H1
SLICE_TITLE=$(grep -E '^# Feature Specification:' "$SPEC_FILE" | head -1 | sed -E 's/^# Feature Specification: *//' || true)
if [ -z "$SLICE_TITLE" ]; then
  SLICE_TITLE=$(grep -E '^# [^#]' "$SPEC_FILE" | head -1 | sed -E 's/^# *//' || true)
fi
if [ -z "$SLICE_TITLE" ]; then
  # Fallback: humanize the slug
  SLICE_TITLE=$(echo "$SLICE_SLUG" | tr '-' ' ' | awk '{ for (i=1;i<=NF;i++) $i = toupper(substr($i,1,1)) tolower(substr($i,2)) }1')
fi

# Summary extraction strategy (first match wins):
#   1. `**Input**: <text>` — speckit's spec template includes this field as
#      a one-liner with the slice's prose summary. Best signal.
#   2. First prose paragraph under a `## Summary` heading, if the spec has one.
#   3. First prose line that isn't a heading, blank, bullet, table row, or
#      `**Field**: value` metadata.
#   4. Fallback humanized slug.
SUMMARY=$(grep -m1 -E '^\*\*Input\*\*: ' "$SPEC_FILE" | sed -E 's/^\*\*Input\*\*:[[:space:]]*//' || true)

if [ -z "$SUMMARY" ]; then
  SUMMARY=$(awk '
    /^## Summary[[:space:]]*$/ { in_section = 1; next }
    in_section && /^## / { exit }
    in_section && NF == 0 { if (got) exit; next }
    in_section {
      if (got) printf " "
      sub(/^[[:space:]]+/, "")
      printf "%s", $0
      got = 1
    }
    END { if (got) print "" }
  ' "$SPEC_FILE")
fi

if [ -z "$SUMMARY" ]; then
  # Plain-prose fallback: first line that looks like real text, not metadata
  SUMMARY=$(awk '
    /^#/ { next }
    /^[[:space:]]*$/ { next }
    /^[-*] / { next }
    /^\|/ { next }
    /^\*\*[A-Za-z][^*]*\*\*:/ { next }
    /^</ { next }
    { print; exit }
  ' "$SPEC_FILE")
fi

if [ -z "$SUMMARY" ]; then
  SUMMARY="(Spec summary not auto-extractable; see the spec for details.)"
fi

# ---------------------------------------------------------------------------
# Idempotency: skip if a tracking marker already exists in spec.md
# ---------------------------------------------------------------------------

EXISTING_MARKER=$(grep -Eo '<!-- tracking-issue: #[0-9]+ -->' "$SPEC_FILE" | head -1 || true)
if [ -n "$EXISTING_MARKER" ]; then
  EXISTING_NUM=$(echo "$EXISTING_MARKER" | grep -Eo '#[0-9]+' | tr -d '#')
  echo "Already linked to issue #$EXISTING_NUM (marker in $SPEC_FILE). Nothing to do." >&2
  exit 0
fi

# ---------------------------------------------------------------------------
# Render issue body from template
# ---------------------------------------------------------------------------

TEMPLATE_FILE="$REPO_ROOT/scripts/spec-to-issue/template.md"
if [ ! -f "$TEMPLATE_FILE" ]; then
  echo "Error: template not found at $TEMPLATE_FILE" >&2
  exit 1
fi

# Use awk for substitution because the summary may contain characters that
# would break sed (slashes, &, etc.) and we want exact-string replacement.
ISSUE_BODY=$(awk \
  -v num="$SLICE_NUM" \
  -v title="$SLICE_TITLE" \
  -v slug="$SLICE_SLUG" \
  -v path="$SPEC_FILE" \
  -v summary="$SUMMARY" \
  '
  {
    gsub(/\{\{SLICE_NUM\}\}/, num)
    gsub(/\{\{SLICE_TITLE\}\}/, title)
    gsub(/\{\{SLICE_SLUG\}\}/, slug)
    gsub(/\{\{SPEC_PATH\}\}/, path)
    gsub(/\{\{SUMMARY\}\}/, summary)
    print
  }
' "$TEMPLATE_FILE")

ISSUE_TITLE="Slice $SLICE_NUM — $SLICE_TITLE"

# ---------------------------------------------------------------------------
# Dry run: print and exit
# ---------------------------------------------------------------------------

if [ "$DRY_RUN" = true ]; then
  echo "=== DRY RUN — would create issue ==="
  echo "title: $ISSUE_TITLE"
  echo "label: slice${PHASE:+, phase-$PHASE}"
  if [ "$ADD_TO_PROJECT" = true ]; then
    echo "project: $PROJECT_OWNER/$PROJECT_NUMBER (would be added after creation)"
  else
    echo "project: SKIPPED (--no-project)"
  fi
  echo "body:"
  echo "$ISSUE_BODY"
  echo "==="
  echo "(no API call made, spec.md not modified)"
  exit 0
fi

# ---------------------------------------------------------------------------
# Create the issue
# ---------------------------------------------------------------------------

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh CLI is not installed. Install: https://cli.github.com" >&2
  exit 1
fi

LABEL_ARGS=(--label slice)
if [ -n "$PHASE" ]; then
  LABEL_ARGS+=(--label "phase-$PHASE")
fi

ISSUE_URL=$(gh issue create \
  --title "$ISSUE_TITLE" \
  --body "$ISSUE_BODY" \
  "${LABEL_ARGS[@]}")

# gh prints the URL on success; extract the issue number
ISSUE_NUM=$(echo "$ISSUE_URL" | grep -Eo '[0-9]+$')

if [ -z "$ISSUE_NUM" ]; then
  echo "Error: failed to parse issue number from gh output: $ISSUE_URL" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Add the issue to the Dextree project board
#
# The project's auto-add workflow (#13) filters by `label:cluster`, so a
# `slice`-labelled issue would not land there without this explicit add.
# Best-effort: warn if it fails (e.g. missing `project` scope on gh token)
# but don't abort — the issue and the marker are already in place, and
# the user can manually add the issue to the project later via the UI.
# ---------------------------------------------------------------------------

if [ "$ADD_TO_PROJECT" = true ]; then
  if ! gh project item-add "$PROJECT_NUMBER" \
        --owner "$PROJECT_OWNER" \
        --url "$ISSUE_URL" >/dev/null 2>&1; then
    echo "Warning: created issue #$ISSUE_NUM but failed to add it to project $PROJECT_OWNER/$PROJECT_NUMBER." >&2
    echo "         Add it manually via the UI, or check that 'gh auth status' shows the 'project' scope." >&2
    echo "         (Run 'gh auth refresh -s project' to grant.)" >&2
  else
    echo "Added issue #$ISSUE_NUM to project $PROJECT_OWNER/$PROJECT_NUMBER."
  fi
fi

# ---------------------------------------------------------------------------
# Append tracking marker to spec.md
# ---------------------------------------------------------------------------

{
  echo ""
  echo "<!-- tracking-issue: #$ISSUE_NUM -->"
} >> "$SPEC_FILE"

echo "Created issue #$ISSUE_NUM: $ISSUE_URL"
echo "Appended tracking marker to $SPEC_FILE"
