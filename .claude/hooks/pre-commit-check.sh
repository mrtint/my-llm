#!/bin/bash
# Claude Code PreToolUse 훅 — Bash(git commit) 실행 전 typecheck + test 자동 실행
# exit 0: 통과 (커밋 진행)
# exit 2: 차단 (커밋 중단, stderr 메시지를 Claude에게 피드백)

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# git commit 명령인지 확인
if ! echo "$COMMAND" | grep -qE '^git commit'; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

echo "🔍 커밋 전 검사 실행 중..." >&2

# typecheck
npm run typecheck 2>&1
TYPECHECK_EXIT=$?
if [ $TYPECHECK_EXIT -ne 0 ]; then
  echo "" >&2
  echo "❌ TypeScript 오류가 있습니다. 커밋이 차단됩니다." >&2
  echo "   npm run typecheck 로 오류를 확인하세요." >&2
  exit 2
fi

# jest
npm test 2>&1
TEST_EXIT=$?
if [ $TEST_EXIT -ne 0 ]; then
  echo "" >&2
  echo "❌ 테스트가 실패했습니다. 커밋이 차단됩니다." >&2
  echo "   npm test 로 실패 원인을 확인하세요." >&2
  exit 2
fi

echo "✅ 모든 검사 통과. 커밋을 진행합니다." >&2
exit 0
