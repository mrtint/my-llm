#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname, basename, extname } from "node:path";
import { MODEL_FILES, INFERENCE_PARAMS } from "../lib/inference";
import { runInference } from "./cli-inference";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_DIR = resolve(SCRIPT_DIR, "..");
const MODEL_DIR = resolve(PROJECT_DIR, "models");
const RESULT_DIR = resolve(SCRIPT_DIR, "results");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

function checkDependency() {
  try {
    execSync("command -v llama-mtmd-cli", { stdio: "ignore" });
  } catch {
    console.error("ERROR: llama-mtmd-cli 를 찾을 수 없습니다.\n");
    console.error("설치 방법:\n  brew install llama.cpp\n");
    process.exit(1);
  }
}

function downloadModel(url: string, dest: string) {
  const name = basename(dest);
  if (existsSync(dest)) {
    console.log(`OK  ${name} (캐시됨)`);
    return;
  }
  console.log(`다운로드 중: ${name} ...`);
  execSync(`curl -L --progress-bar -o "${dest}.tmp" "${url}"`, { stdio: "inherit" });
  execSync(`mv "${dest}.tmp" "${dest}"`);
  console.log(`OK  ${name}`);
}

function ensureModels() {
  mkdirSync(MODEL_DIR, { recursive: true });
  console.log("=== 모델 확인 ===");
  downloadModel(MODEL_FILES.mmproj.url, resolve(MODEL_DIR, MODEL_FILES.mmproj.name));
  downloadModel(MODEL_FILES.text.url, resolve(MODEL_DIR, MODEL_FILES.text.name));
  console.log();
}

function discoverImages(): string[] {
  return readdirSync(SCRIPT_DIR)
    .filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()))
    .sort()
    .map((f) => resolve(SCRIPT_DIR, f));
}

function formatFileSize(path: string): string {
  const bytes = statSync(path).size;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function parseArgs(argv: string[]) {
  let prompt = "";
  let outputFile = "";
  let i = 0;
  while (i < argv.length) {
    if (argv[i] === "-p" && i + 1 < argv.length) {
      prompt = argv[++i];
    } else if (argv[i] === "-o" && i + 1 < argv.length) {
      outputFile = argv[++i];
    } else if (argv[i] === "-h" || argv[i] === "--help") {
      console.log("사용법: npx tsx scripts/analyze-images.ts [-p \"프롬프트\"] [-o 결과파일]");
      console.log();
      console.log("옵션:");
      console.log('  -p  분석에 사용할 프롬프트 (기본: 상세 분석)');
      console.log("  -o  결과를 저장할 파일 경로 (기본: scripts/results/analysis_YYYYMMDD_HHMMSS.md)");
      console.log();
      console.log("scripts/ 폴더 내 모든 이미지(jpg, jpeg, png, gif, webp)를 자동 탐색하여 분석합니다.");
      process.exit(0);
    } else {
      console.error(`알 수 없는 옵션: ${argv[i]}`);
      console.error("npx tsx scripts/analyze-images.ts -h 로 도움말을 확인하세요.");
      process.exit(1);
    }
    i++;
  }
  return {
    prompt: prompt || "이 이미지를 상세하게 분석해주세요. 장소, 피사체, 분위기, 특이사항 등을 포함해서 설명해주세요.",
    outputFile,
  };
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const images = discoverImages();
  if (images.length === 0) {
    console.error(`ERROR: ${SCRIPT_DIR} 에서 이미지 파일을 찾을 수 없습니다.`);
    process.exit(1);
  }

  console.log(`=== 발견된 이미지: ${images.length}장 ===`);
  for (const img of images) {
    console.log(`  - ${basename(img)}`);
  }
  console.log();

  checkDependency();
  ensureModels();

  mkdirSync(RESULT_DIR, { recursive: true });
  const outputFile = args.outputFile || resolve(RESULT_DIR, `analysis_${timestamp()}.md`);

  const lines: string[] = [
    "# 이미지 분석 결과",
    "",
    `- **분석 일시**: ${new Date().toLocaleString("ko-KR")}`,
    `- **모델**: Gemma 3 4B (Q4_K_M)`,
    `- **프롬프트**: ${args.prompt}`,
    `- **이미지 수**: ${images.length}장`,
    "",
  ];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const name = basename(img);
    const size = formatFileSize(img);

    console.log(`=== [${i + 1}/${images.length}] ${name} 분석 중 ===`);
    console.log(
      `파라미터: ctx=${INFERENCE_PARAMS.n_ctx}, n_predict=${INFERENCE_PARAMS.n_predict}, ` +
      `temp=${INFERENCE_PARAMS.temperature}, ngl=${INFERENCE_PARAMS.n_gpu_layers_device}`
    );
    console.log("---");

    let responseText: string;
    try {
      const result = await runInference({ images: [img], prompt: args.prompt });
      responseText = result.text;
      console.log();
      console.log(responseText);
      console.log(`\n--- [${i + 1}/${images.length}] 완료 (${(result.elapsed_ms / 1000).toFixed(1)}초) ---\n`);
    } catch (e: any) {
      console.error(`WARNING: 추론 실패 — ${e.message}`);
      responseText = `(추론 실패: ${e.message})`;
    }

    lines.push(
      `## ${i + 1}. ${name}`,
      "",
      `- **파일 크기**: ${size}`,
      "",
      "### 분석 결과",
      "",
      responseText,
      "",
      "---",
      "",
    );
  }

  writeFileSync(outputFile, lines.join("\n"), "utf-8");

  console.log("========================================");
  console.log(`전체 분석 완료! (${images.length}장)`);
  console.log(`결과 저장: ${outputFile}`);
  console.log("========================================");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
