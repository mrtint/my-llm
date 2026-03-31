#!/usr/bin/env bash
# scripts/ 폴더 내 모든 이미지를 InternVL2.5-4B로 개별 분석
# 사용법: ./scripts/analyze-images.sh [-p "프롬프트"] [-o 결과파일]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MODEL_DIR="$PROJECT_DIR/models"
RESULT_DIR="$SCRIPT_DIR/results"

TEXT_MODEL="InternVL2_5-4B-Q4_K_M.gguf"
MMPROJ_MODEL="mmproj-InternVL2_5-4B-Q8_0.gguf"
TEXT_URL="https://huggingface.co/ggml-org/InternVL2_5-4B-GGUF/resolve/main/$TEXT_MODEL"
MMPROJ_URL="https://huggingface.co/ggml-org/InternVL2_5-4B-GGUF/resolve/main/$MMPROJ_MODEL"

CTX_SIZE=4096
N_PREDICT=1024
TEMPERATURE=0.2
N_GPU_LAYERS=99

DEFAULT_PROMPT="이 이미지를 상세하게 분석해주세요. 장소, 피사체, 분위기, 특이사항 등을 포함해서 설명해주세요."

# ── 의존성 체크 ──────────────────────────────────────────────
if ! command -v llama-mtmd-cli &>/dev/null; then
  echo "ERROR: llama-mtmd-cli 를 찾을 수 없습니다."
  echo ""
  echo "설치 방법:"
  echo "  brew install llama.cpp"
  echo ""
  exit 1
fi

# ── 인자 파싱 ────────────────────────────────────────────────
PROMPT=""
OUTPUT_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    -p)
      shift
      PROMPT="$1"
      shift
      ;;
    -o)
      shift
      OUTPUT_FILE="$1"
      shift
      ;;
    -h|--help)
      echo "사용법: $0 [-p \"프롬프트\"] [-o 결과파일]"
      echo ""
      echo "옵션:"
      echo "  -p  분석에 사용할 프롬프트 (기본: 상세 분석)"
      echo "  -o  결과를 저장할 파일 경로 (기본: scripts/results/analysis_YYYYMMDD_HHMMSS.md)"
      echo ""
      echo "scripts/ 폴더 내 모든 이미지(jpg, jpeg, png, gif, webp)를 자동 탐색하여 분석합니다."
      exit 0
      ;;
    *)
      echo "알 수 없는 옵션: $1"
      echo "$0 -h 로 도움말을 확인하세요."
      exit 1
      ;;
  esac
done

PROMPT="${PROMPT:-$DEFAULT_PROMPT}"

# ── 이미지 탐색 ──────────────────────────────────────────────
IMAGES=()
for ext in jpg jpeg png gif webp; do
  while IFS= read -r -d '' file; do
    IMAGES+=("$file")
  done < <(find "$SCRIPT_DIR" -maxdepth 1 -iname "*.$ext" -print0 2>/dev/null)
done

IFS=$'\n' IMAGES=($(sort <<<"${IMAGES[*]}")); unset IFS

if [ ${#IMAGES[@]} -eq 0 ]; then
  echo "ERROR: $SCRIPT_DIR 에서 이미지 파일을 찾을 수 없습니다."
  exit 1
fi

echo "=== 발견된 이미지: ${#IMAGES[@]}장 ==="
for img in "${IMAGES[@]}"; do
  echo "  - $(basename "$img")"
done
echo ""

# ── 결과 파일 설정 ───────────────────────────────────────────
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
if [ -z "$OUTPUT_FILE" ]; then
  mkdir -p "$RESULT_DIR"
  OUTPUT_FILE="$RESULT_DIR/analysis_${TIMESTAMP}.md"
fi

# ── 모델 다운로드 ────────────────────────────────────────────
mkdir -p "$MODEL_DIR"

download_model() {
  local url="$1"
  local dest="$2"
  local name
  name="$(basename "$dest")"

  if [ -f "$dest" ]; then
    echo "OK  $name (캐시됨)"
    return
  fi

  echo "다운로드 중: $name ..."
  curl -L --progress-bar -o "$dest.tmp" "$url"
  mv "$dest.tmp" "$dest"
  echo "OK  $name"
}

echo "=== 모델 확인 ==="
download_model "$MMPROJ_URL" "$MODEL_DIR/$MMPROJ_MODEL"
download_model "$TEXT_URL" "$MODEL_DIR/$TEXT_MODEL"
echo ""

# ── 결과 파일 헤더 ───────────────────────────────────────────
{
  echo "# 이미지 분석 결과"
  echo ""
  echo "- **분석 일시**: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "- **모델**: InternVL2.5-4B (Q4_K_M)"
  echo "- **프롬프트**: $PROMPT"
  echo "- **이미지 수**: ${#IMAGES[@]}장"
  echo ""
} > "$OUTPUT_FILE"

# ── 개별 이미지 분석 ─────────────────────────────────────────
TOTAL=${#IMAGES[@]}
CURRENT=0

for img in "${IMAGES[@]}"; do
  CURRENT=$((CURRENT + 1))
  BASENAME="$(basename "$img")"
  FILE_SIZE="$(du -h "$img" | cut -f1 | xargs)"

  echo "=== [$CURRENT/$TOTAL] $BASENAME 분석 중 ==="
  echo "파라미터: ctx=$CTX_SIZE, n_predict=$N_PREDICT, temp=$TEMPERATURE, ngl=$N_GPU_LAYERS"
  echo "---"

  LOG_FILE="$RESULT_DIR/.llama_${CURRENT}.log"

  RESPONSE=$(llama-mtmd-cli \
    --model "$MODEL_DIR/$TEXT_MODEL" \
    --mmproj "$MODEL_DIR/$MMPROJ_MODEL" \
    --image "$img" \
    --override-kv "tokenizer.ggml.eos_token_id=int:151645" \
    -c "$CTX_SIZE" \
    -ngl "$N_GPU_LAYERS" \
    --temp "$TEMPERATURE" \
    -n "$N_PREDICT" \
    -p "<|im_start|>system
You MUST reply in the same language the user writes in. If the user writes Korean (한국어), reply in Korean only. If Japanese (日本語), reply in Japanese only. If Chinese (中文), reply in Chinese only. If English, reply in English only. Never switch languages.<|im_end|>
<|im_start|>user
<__media__>
${PROMPT}<|im_end|>
<|im_start|>assistant
" 2>"$LOG_FILE") || {
    echo "WARNING: 추론 실패 — 로그 확인: $LOG_FILE"
    RESPONSE="(추론 실패. 로그: $LOG_FILE)"
  }

  {
    echo "## $CURRENT. $BASENAME"
    echo ""
    echo "- **파일 크기**: $FILE_SIZE"
    echo ""
    echo "### 분석 결과"
    echo ""
    echo "$RESPONSE"
    echo ""
    echo "---"
    echo ""
  } >> "$OUTPUT_FILE"

  echo ""
  echo "$RESPONSE"
  echo ""
  echo "--- [$CURRENT/$TOTAL] 완료 ---"
  echo ""
done

# ── 완료 ─────────────────────────────────────────────────────
echo "========================================"
echo "전체 분석 완료! ($TOTAL장)"
echo "결과 저장: $OUTPUT_FILE"
echo "========================================"
