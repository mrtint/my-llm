# Cursor ↔ Claude Code 규칙 동기화 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.cursor/rules/*.mdc`와 `CLAUDE.md`의 규칙 내용을 양방향으로 동기화하는 스크립트와 구조를 구축한다.

**Architecture:** `.cursor/rules/*.mdc`를 단일 원본으로 사용. 각 `.mdc` 파일 frontmatter에 `claude: true` 필드를 추가해 CLAUDE.md 포함 여부를 제어. `scripts/sync-rules.ts`가 세 가지 명령(`--to-claude`, `--from-claude`, `--status`)으로 양방향 동기화를 담당. CLAUDE.md 내에 HTML 마커(`<!-- rules:generated:start/end -->`)를 삽입해 자동 생성 영역을 분리하고, 마커 바깥의 Claude 전용 섹션은 수동 유지한다.

**Tech Stack:** Node.js, TypeScript, tsx (이미 devDependency), 표준 `node:fs` / `node:path` API

---

## 파일 구조

```
.cursor/rules/
  commit-conventions.mdc       수정: frontmatter에 claude: true 추가
  expo-rn-conventions.mdc      수정: frontmatter에 claude: true 추가

scripts/
  sync-rules.ts                신규: 양방향 동기화 스크립트

CLAUDE.md                      수정: 마커 삽입 + 규칙 섹션을 생성 영역으로 이동

package.json                   수정: rules:sync, rules:status 스크립트 추가
```

**동기화 방향:**

```
.cursor/rules/*.mdc  (claude: true)
        │
        │  npm run rules:sync        (--to-claude, 기본값)
        ▼
CLAUDE.md <!-- rules:generated:start --> ... <!-- rules:generated:end -->

CLAUDE.md (임의 H2 섹션)
        │
        │  npm run rules:sync -- --from-claude "섹션 제목"
        ▼
.cursor/rules/새파일.mdc
```

---

## Task 1: 기존 `.mdc` 파일에 `claude: true` 추가

**Files:**
- Modify: `.cursor/rules/commit-conventions.mdc`
- Modify: `.cursor/rules/expo-rn-conventions.mdc`

- [ ] **Step 1: `commit-conventions.mdc` frontmatter 수정**

  `.cursor/rules/commit-conventions.mdc` 상단 frontmatter를 다음으로 교체:

  ```
  ---
  description: Conventional Commits 규칙 — 커밋 메시지 작성 시 반드시 따를 것
  alwaysApply: true
  claude: true
  ---
  ```

  (기존 3줄 `---/description.../alwaysApply: true/---` → 4줄로 늘어남)

- [ ] **Step 2: `expo-rn-conventions.mdc` frontmatter 수정**

  `.cursor/rules/expo-rn-conventions.mdc` 상단 frontmatter를 다음으로 교체:

  ```
  ---
  description: Expo React Native 코드 규칙 — deprecated API 사용 금지, 최신 API 패턴 적용
  globs: "**/*.{tsx,ts}"
  alwaysApply: false
  claude: true
  ---
  ```

- [ ] **Step 3: 검증**

  실행:
  ```bash
  grep "claude:" .cursor/rules/*.mdc
  ```

  Expected:
  ```
  .cursor/rules/commit-conventions.mdc:claude: true
  .cursor/rules/expo-rn-conventions.mdc:claude: true
  ```

- [ ] **Step 4: 커밋**

  ```bash
  git add .cursor/rules/commit-conventions.mdc .cursor/rules/expo-rn-conventions.mdc
  git commit -m "chore(config): .mdc 파일에 claude 동기화 필드 추가"
  ```

---

## Task 2: `CLAUDE.md` 마커 삽입 및 구조 정리

**Files:**
- Modify: `CLAUDE.md`

규칙 섹션(커밋, Expo)을 마커 사이로 이동시키고 내용을 비운다. 스크립트가 이 영역을 채운다.
"추론 모듈 아키텍처"는 현재 Cursor rule이 아니므로 마커 바깥에 유지한다.

- [ ] **Step 1: `CLAUDE.md` 전체를 다음 내용으로 교체**

  파일 구조 (실제 내용):

  ```
  # Claude Code 프로젝트 규칙
  <빈줄>
  <!-- rules:generated:start -->
  <!-- rules:generated:end -->
  <빈줄>
  ---
  <빈줄>
  ## 추론 모듈 아키텍처
  [원본 CLAUDE.md의 "추론 모듈 아키텍처" 섹션 전체 복사]
  ```

  현재 CLAUDE.md에서 `## 커밋 메시지 규칙` 섹션과 `## Expo React Native 코드 규칙` 섹션을 **삭제**하고, H1 바로 아래에 마커 두 줄을 삽입한다. "추론 모듈 아키텍처" 섹션은 마커 아래에 유지.

- [ ] **Step 2: 검증 — 마커 존재 확인**

  실행:
  ```bash
  grep -n "rules:generated" CLAUDE.md
  ```

  Expected:
  ```
  3:<!-- rules:generated:start -->
  4:<!-- rules:generated:end -->
  ```

- [ ] **Step 3: 검증 — 추론 섹션 보존 확인**

  실행:
  ```bash
  grep -c "추론 모듈 아키텍처" CLAUDE.md
  ```

  Expected: `1`

- [ ] **Step 4: 커밋**

  ```bash
  git add CLAUDE.md
  git commit -m "chore(config): CLAUDE.md에 규칙 동기화 마커 삽입"
  ```

---

## Task 3: `scripts/sync-rules.ts` 작성

**Files:**
- Create: `scripts/sync-rules.ts`

세 가지 명령을 구현:
- `--to-claude` (기본값): `claude: true`인 `.mdc` 파일들을 CLAUDE.md 마커 사이에 주입
- `--from-claude "제목"`: CLAUDE.md H2 섹션을 새 `.mdc` 파일로 추출
- `--status`: CLAUDE.md 생성 영역이 최신 `.mdc`와 동기화됐는지 비교

- [ ] **Step 1: `scripts/sync-rules.ts` 파일 생성**

  전체 파일 내용:

  ```typescript
  #!/usr/bin/env tsx
  import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
  import { resolve, dirname, basename } from "node:path";

  const PROJECT_DIR = resolve(dirname(new URL(import.meta.url).pathname), "..");
  const CURSOR_RULES_DIR = resolve(PROJECT_DIR, ".cursor/rules");
  const CLAUDE_MD_PATH = resolve(PROJECT_DIR, "CLAUDE.md");
  const MARKER_START = "<!-- rules:generated:start -->";
  const MARKER_END = "<!-- rules:generated:end -->";

  interface RuleMetadata {
    description?: string;
    alwaysApply?: boolean;
    globs?: string;
    claude?: boolean;
  }

  function parseFrontmatter(content: string): { metadata: RuleMetadata; body: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return { metadata: {}, body: content };

    const metadata: Record<string, unknown> = {};
    for (const line of match[1].split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const raw = line.slice(colonIdx + 1).trim().replace(/^"(.*)"$/, "$1");
      if (raw === "true") metadata[key] = true;
      else if (raw === "false") metadata[key] = false;
      else if (raw !== "") metadata[key] = raw;
    }

    return { metadata: metadata as RuleMetadata, body: match[2].trimStart() };
  }

  function buildFrontmatter(metadata: RuleMetadata): string {
    const lines = ["---"];
    if (metadata.description) lines.push(`description: ${metadata.description}`);
    if (metadata.globs) lines.push(`globs: "${metadata.globs}"`);
    if (metadata.alwaysApply !== undefined) lines.push(`alwaysApply: ${metadata.alwaysApply}`);
    if (metadata.claude !== undefined) lines.push(`claude: ${metadata.claude}`);
    lines.push("---");
    return lines.join("\n") + "\n";
  }

  function toKebabCase(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .trim()
      .replace(/\s+/g, "-");
  }

  function getMdcFiles(): string[] {
    if (!existsSync(CURSOR_RULES_DIR)) return [];
    return readdirSync(CURSOR_RULES_DIR)
      .filter((f) => f.endsWith(".mdc"))
      .sort()
      .map((f) => resolve(CURSOR_RULES_DIR, f));
  }

  function buildGeneratedContent(): string {
    const files = getMdcFiles();
    const parts: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      const { metadata, body } = parseFrontmatter(content);
      if (!metadata.claude) continue;
      parts.push(body.trim());
    }

    if (parts.length === 0) return "";
    return parts.join("\n\n---\n\n");
  }

  function readClaudeMd(): string {
    if (!existsSync(CLAUDE_MD_PATH)) {
      console.error("ERROR: CLAUDE.md 파일을 찾을 수 없습니다.");
      process.exit(1);
    }
    return readFileSync(CLAUDE_MD_PATH, "utf-8");
  }

  function getMarkerPositions(claudeMd: string): { start: number; end: number } {
    const startIdx = claudeMd.indexOf(MARKER_START);
    const endIdx = claudeMd.indexOf(MARKER_END);
    if (startIdx === -1 || endIdx === -1) {
      console.error("ERROR: CLAUDE.md에서 동기화 마커를 찾을 수 없습니다.");
      console.error(`  필요한 마커: ${MARKER_START}`);
      console.error(`              ${MARKER_END}`);
      process.exit(1);
    }
    return { start: startIdx, end: endIdx };
  }

  // --to-claude: .cursor/rules/*.mdc (claude: true) → CLAUDE.md 마커 사이에 주입
  function toClaudeMd() {
    const generated = buildGeneratedContent();
    if (!generated) {
      console.error("ERROR: claude: true 인 .mdc 파일이 없습니다.");
      process.exit(1);
    }

    const claudeMd = readClaudeMd();
    const { start, end } = getMarkerPositions(claudeMd);

    const before = claudeMd.slice(0, start + MARKER_START.length);
    const after = claudeMd.slice(end);
    const newContent = `${before}\n\n${generated}\n\n${after}`;

    writeFileSync(CLAUDE_MD_PATH, newContent, "utf-8");

    const ruleCount = (generated.match(/^## /gm) ?? []).length;
    console.log(`OK  CLAUDE.md 업데이트 완료 (${ruleCount}개 규칙 주입)`);
  }

  // --from-claude "섹션 제목": CLAUDE.md H2 섹션 → .cursor/rules/<kebab>.mdc 파일 생성
  function fromClaudeMd(sectionTitle: string) {
    const claudeMd = readClaudeMd();

    let sectionStart = -1;
    let foundTitle = "";

    for (const match of claudeMd.matchAll(/^## (.+)$/gm)) {
      if (match[1].trim() === sectionTitle.trim()) {
        sectionStart = match.index!;
        foundTitle = match[1].trim();
        break;
      }
    }

    if (sectionStart === -1) {
      console.error(`ERROR: '## ${sectionTitle}' 섹션을 CLAUDE.md에서 찾을 수 없습니다.`);
      console.error("\n사용 가능한 H2 섹션:");
      for (const m of claudeMd.matchAll(/^## (.+)$/gm)) {
        console.error(`  - ${m[1]}`);
      }
      process.exit(1);
    }

    // 다음 H2 또는 파일 끝까지 추출
    const afterSection = claudeMd.slice(sectionStart + 4);
    const nextH2Offset = afterSection.search(/^## /m);
    const sectionContent = (nextH2Offset === -1
      ? claudeMd.slice(sectionStart)
      : claudeMd.slice(sectionStart, sectionStart + 4 + nextH2Offset)
    ).trim();

    const filename = `${toKebabCase(foundTitle)}.mdc`;
    const outputPath = resolve(CURSOR_RULES_DIR, filename);

    if (existsSync(outputPath)) {
      console.error(`ERROR: 파일이 이미 존재합니다: .cursor/rules/${filename}`);
      console.error("기존 파일을 직접 수정하거나 파일명을 바꾸세요.");
      process.exit(1);
    }

    const frontmatter = buildFrontmatter({
      description: foundTitle,
      alwaysApply: false,
      claude: true,
    });

    writeFileSync(outputPath, frontmatter + "\n" + sectionContent + "\n", "utf-8");

    console.log(`OK  생성됨: .cursor/rules/${filename}`);
    console.log("");
    console.log("다음 단계:");
    console.log(`  1. .cursor/rules/${filename} frontmatter 확인 (alwaysApply, globs 조정)`);
    console.log("  2. npm run rules:sync 실행하여 CLAUDE.md 갱신");
  }

  // --status: .mdc 파일들과 CLAUDE.md 생성 영역 비교
  function status() {
    const files = getMdcFiles();
    const claudeFiles: string[] = [];
    const nonClaudeFiles: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      const { metadata } = parseFrontmatter(content);
      const name = basename(file);
      if (metadata.claude) claudeFiles.push(name);
      else nonClaudeFiles.push(name);
    }

    console.log("=== .cursor/rules/ 파일 상태 ===");
    for (const f of claudeFiles) console.log(`  +  ${f}  (claude: true)`);
    for (const f of nonClaudeFiles) console.log(`  -  ${f}  (claude: false, CLAUDE.md 제외)`);

    if (claudeFiles.length === 0) {
      console.log("\nCLAUDE.md: 동기화할 규칙 없음");
      return;
    }

    const generated = buildGeneratedContent();
    const claudeMd = readClaudeMd();
    const { start, end } = getMarkerPositions(claudeMd);
    const current = claudeMd.slice(start + MARKER_START.length, end).trim();

    console.log("\n=== CLAUDE.md 동기화 상태 ===");
    if (current === generated.trim()) {
      console.log("  동기화됨 (OK)");
    } else {
      console.log("  동기화 필요 (OUTDATED)");
      console.log("  실행: npm run rules:sync");
    }
  }

  // 진입점
  const command = process.argv[2] ?? "--to-claude";
  const arg = process.argv[3];

  if (command === "--to-claude") {
    toClaudeMd();
  } else if (command === "--from-claude") {
    if (!arg) {
      console.error('사용법: npm run rules:sync -- --from-claude "섹션 제목"');
      process.exit(1);
    }
    fromClaudeMd(arg);
  } else if (command === "--status") {
    status();
  } else {
    console.log("사용법:");
    console.log("  npm run rules:sync                               # .mdc → CLAUDE.md");
    console.log("  npm run rules:status                             # 동기화 상태 확인");
    console.log('  npm run rules:sync -- --from-claude "섹션 제목"  # CLAUDE.md 섹션 → .mdc');
    process.exit(1);
  }
  ```

- [ ] **Step 2: TypeScript 타입 확인**

  실행:
  ```bash
  npx tsc --noEmit --esModuleInterop --moduleResolution bundler --target es2022 --module es2022 scripts/sync-rules.ts 2>&1 | head -20
  ```

  Expected: 에러 없음 (또는 `@types/node` 관련 경고만)

- [ ] **Step 3: `--status` 명령으로 동작 확인**

  실행:
  ```bash
  npx tsx scripts/sync-rules.ts --status
  ```

  Expected:
  ```
  === .cursor/rules/ 파일 상태 ===
    +  commit-conventions.mdc  (claude: true)
    +  expo-rn-conventions.mdc  (claude: true)

  === CLAUDE.md 동기화 상태 ===
    동기화 필요 (OUTDATED)
    실행: npm run rules:sync
  ```

- [ ] **Step 4: 커밋**

  ```bash
  git add scripts/sync-rules.ts
  git commit -m "feat(cli): Cursor ↔ Claude Code 규칙 양방향 동기화 스크립트 추가"
  ```

---

## Task 4: `package.json` npm 스크립트 추가 + 첫 동기화 실행

**Files:**
- Modify: `package.json`

- [ ] **Step 1: `package.json`의 `scripts` 섹션에 두 줄 추가**

  수정 후 `scripts` 섹션 전체:

  ```json
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "infer": "tsx scripts/cli-inference.ts",
    "analyze": "tsx scripts/analyze-images.ts",
    "rules:sync": "tsx scripts/sync-rules.ts",
    "rules:status": "tsx scripts/sync-rules.ts --status"
  }
  ```

- [ ] **Step 2: 첫 동기화 실행**

  실행:
  ```bash
  npm run rules:sync
  ```

  Expected:
  ```
  OK  CLAUDE.md 업데이트 완료 (2개 규칙 주입)
  ```

- [ ] **Step 3: CLAUDE.md 마커 영역 확인**

  실행:
  ```bash
  grep -n "rules:generated\|^## " CLAUDE.md
  ```

  Expected (줄 번호는 다를 수 있음):
  ```
  3:<!-- rules:generated:start -->
  5:## Commit Message Convention
  ...
  X:## Expo React Native Conventions
  ...
  Y:<!-- rules:generated:end -->
  Z:## 추론 모듈 아키텍처
  ```

  마커 사이에 두 규칙이 주입되고, "추론 모듈 아키텍처"는 마커 바깥에 유지되어야 함.

- [ ] **Step 4: 동기화 상태 확인**

  실행:
  ```bash
  npm run rules:status
  ```

  Expected:
  ```
  === .cursor/rules/ 파일 상태 ===
    +  commit-conventions.mdc  (claude: true)
    +  expo-rn-conventions.mdc  (claude: true)

  === CLAUDE.md 동기화 상태 ===
    동기화됨 (OK)
  ```

- [ ] **Step 5: 커밋**

  ```bash
  git add package.json CLAUDE.md
  git commit -m "chore(config): rules:sync 스크립트 등록 및 첫 CLAUDE.md 동기화 실행"
  ```

---

## Task 5: `--from-claude` 양방향 동기화 검증

"추론 모듈 아키텍처" 섹션을 Cursor rule로 추출해 양방향 흐름을 전체적으로 검증한다.

**Files:**
- Create: `.cursor/rules/inference-architecture.mdc`
- Modify: `CLAUDE.md` (마커 바깥 수동 섹션 제거 + sync 재실행)

- [ ] **Step 1: CLAUDE.md 섹션 → `.mdc` 추출**

  실행:
  ```bash
  npm run rules:sync -- --from-claude "추론 모듈 아키텍처"
  ```

  Expected:
  ```
  OK  생성됨: .cursor/rules/inference-architecture.mdc

  다음 단계:
    1. .cursor/rules/inference-architecture.mdc frontmatter 확인 (alwaysApply, globs 조정)
    2. npm run rules:sync 실행하여 CLAUDE.md 갱신
  ```

- [ ] **Step 2: 생성된 `.mdc` frontmatter에 `globs` 추가**

  `.cursor/rules/inference-architecture.mdc` 상단 frontmatter를 다음으로 교체
  (이 규칙은 `lib/inference/` 작업 시에만 Cursor에 표시되면 충분):

  ```
  ---
  description: 추론 모듈 아키텍처 — lib/inference/ 구조 및 Gemma 3 주의사항
  globs: "lib/inference/**,scripts/*.ts"
  alwaysApply: false
  claude: true
  ---
  ```

- [ ] **Step 3: CLAUDE.md에서 수동 유지하던 "추론 모듈 아키텍처" 섹션 제거**

  이제 이 섹션은 `.mdc`에서 자동 생성되므로 CLAUDE.md 마커 바깥의 중복 내용을 삭제한다.
  마커 아래 `---\n\n## 추론 모듈 아키텍처 ...` 블록 전체 삭제.

  삭제 후 CLAUDE.md 구조 (마커 이하 수동 섹션 없음):

  ```
  # Claude Code 프로젝트 규칙

  <!-- rules:generated:start -->
  <!-- rules:generated:end -->
  ```

- [ ] **Step 4: 동기화 재실행 (3개 규칙 포함)**

  실행:
  ```bash
  npm run rules:sync
  ```

  Expected:
  ```
  OK  CLAUDE.md 업데이트 완료 (3개 규칙 주입)
  ```

- [ ] **Step 5: 최종 상태 확인**

  실행:
  ```bash
  npm run rules:status
  ```

  Expected:
  ```
  === .cursor/rules/ 파일 상태 ===
    +  commit-conventions.mdc  (claude: true)
    +  expo-rn-conventions.mdc  (claude: true)
    +  inference-architecture.mdc  (claude: true)

  === CLAUDE.md 동기화 상태 ===
    동기화됨 (OK)
  ```

- [ ] **Step 6: 최종 커밋**

  ```bash
  git add .cursor/rules/inference-architecture.mdc CLAUDE.md
  git commit -m "chore(config): 추론 아키텍처 규칙 .mdc로 추출 및 CLAUDE.md 동기화 완료"
  ```

---

## 완성 후 워크플로우

```
규칙 수정     → .cursor/rules/xxx.mdc 편집
              → npm run rules:sync         → CLAUDE.md 자동 갱신

새 규칙 추가  → .cursor/rules/new.mdc 생성 (claude: true 포함)
              → npm run rules:sync         → CLAUDE.md 자동 갱신

Claude 전용   → npm run rules:sync -- --from-claude "섹션 제목"
섹션을 Cursor → .cursor/rules/섹션명.mdc 생성
에도 추가     → frontmatter 조정
              → npm run rules:sync

상태 확인     → npm run rules:status
```

---

## 자체 검토

**스펙 커버리지:**
- ✓ `.mdc` → CLAUDE.md 동기화 (`--to-claude`)
- ✓ CLAUDE.md → `.mdc` 추출 (`--from-claude`)
- ✓ 동기화 상태 확인 (`--status`)
- ✓ 기존 `.mdc` 2개 파일에 `claude` 필드 추가
- ✓ CLAUDE.md 마커 구조 구축
- ✓ npm scripts 등록
- ✓ 추론 아키텍처 섹션 추출 데모

**플레이스홀더 없음:** 모든 step에 실제 코드/명령 포함됨.

**타입 일관성:** `RuleMetadata` 인터페이스가 `parseFrontmatter` / `buildFrontmatter` 양쪽에서 동일하게 사용됨. `matchAll` 반환 타입(`IterableIterator<RegExpMatchArray>`)은 인덱스 시그니처 없이 `match.index!`로 안전하게 접근 가능.
