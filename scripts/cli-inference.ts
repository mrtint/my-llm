#!/usr/bin/env tsx
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import {
  MODEL_FILES,
  INFERENCE_PARAMS,
  buildGemmaPrompt,
} from "../lib/inference";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_DIR = resolve(SCRIPT_DIR, "..");
const MODEL_DIR = resolve(PROJECT_DIR, "models");

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
  execSync(`curl -L --progress-bar -o "${dest}.tmp" "${url}"`, {
    stdio: "inherit",
  });
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

export function runInference(opts: {
  images: string[];
  prompt: string;
}): Promise<{ text: string; elapsed_ms: number }> {
  return new Promise((ok, fail) => {
    const promptStr = buildGemmaPrompt({
      userPrompt: opts.prompt,
      mediaCount: opts.images.length,
    });

    const imageArgs = opts.images.flatMap((img) => ["--image", img]);

    const args = [
      "--model", resolve(MODEL_DIR, MODEL_FILES.text.name),
      "--mmproj", resolve(MODEL_DIR, MODEL_FILES.mmproj.name),
      ...imageArgs,
      "-c", String(INFERENCE_PARAMS.n_ctx),
      "-ngl", String(INFERENCE_PARAMS.n_gpu_layers_device),
      "--temp", String(INFERENCE_PARAMS.temperature),
      "-n", String(INFERENCE_PARAMS.n_predict),
      "-p", promptStr,
    ];

    const start = Date.now();
    const child = spawn("llama-mtmd-cli", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    child.on("close", (code) => {
      const elapsed_ms = Date.now() - start;
      if (code !== 0) {
        fail(new Error(`llama-mtmd-cli exited ${code}\n${stderr}`));
        return;
      }
      ok({ text: stdout.trim(), elapsed_ms });
    });

    child.on("error", fail);
  });
}

function parseArgs(argv: string[]) {
  const images: string[] = [];
  let prompt = "";
  let i = 0;
  while (i < argv.length) {
    if (argv[i] === "-p" && i + 1 < argv.length) {
      prompt = argv[++i];
    } else {
      images.push(argv[i]);
    }
    i++;
  }
  return { images, prompt: prompt || "이 이미지에서 무엇이 보이나요?" };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.images.length === 0) {
    console.log("사용법: npx tsx scripts/cli-inference.ts <이미지1> [이미지2 ...] [-p \"프롬프트\"]");
    console.log();
    console.log("예시:");
    console.log("  npx tsx scripts/cli-inference.ts ./photo.jpg");
    console.log('  npx tsx scripts/cli-inference.ts ./photo.jpg -p "이 그림에 대해 설명해봐"');
    console.log('  npx tsx scripts/cli-inference.ts ./img1.jpg ./img2.jpg -p "두 이미지를 비교해줘"');
    process.exit(1);
  }

  for (const img of args.images) {
    if (!existsSync(img)) {
      console.error(`ERROR: 이미지 파일을 찾을 수 없습니다: ${img}`);
      process.exit(1);
    }
  }

  checkDependency();
  ensureModels();

  console.log("=== 추론 시작 ===");
  console.log(`이미지: ${args.images.join(", ")} (${args.images.length}장)`);
  console.log(`프롬프트: ${args.prompt}`);
  console.log(
    `파라미터: ctx=${INFERENCE_PARAMS.n_ctx}, n_predict=${INFERENCE_PARAMS.n_predict}, ` +
    `temp=${INFERENCE_PARAMS.temperature}, ngl=${INFERENCE_PARAMS.n_gpu_layers_device}`
  );
  console.log("---");

  const result = await runInference({ images: args.images, prompt: args.prompt });
  console.log(result.text);
  console.log(`\n--- 완료 (${(result.elapsed_ms / 1000).toFixed(1)}초) ---`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
