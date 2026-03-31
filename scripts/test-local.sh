#!/usr/bin/env bash
# InternVL2.5-4B 로컬 멀티모달 추론 테스트
# 사용법: ./scripts/test-local.sh <이미지1> [이미지2 ...] [-p "프롬프트"]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MODEL_DIR="$PROJECT_DIR/models"

TEXT_MODEL="InternVL2_5-4B-Q4_K_M.gguf"
MMPROJ_MODEL="mmproj-InternVL2_5-4B-Q8_0.gguf"
TEXT_URL="https://huggingface.co/ggml-org/InternVL2_5-4B-GGUF/resolve/main/$TEXT_MODEL"
MMPROJ_URL="https://huggingface.co/ggml-org/InternVL2_5-4B-GGUF/resolve/main/$MMPROJ_MODEL"

# 앱(App.tsx)과 동일한 추론 파라미터
CTX_SIZE=4096
N_PREDICT=1024
TEMPERATURE=0.2
N_GPU_LAYERS=99  # 로컬 Mac Metal GPU 활용

DEFAULT_PROMPT="이 이미지에서 무엇이 보이나요?"

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
IMAGES=()
PROMPT=""

while [ $# -gt 0 ]; do
  case "$1" in
    -p)
      shift
      PROMPT="$1"
      shift
      ;;
    *)
      IMAGES+=("$1")
      shift
      ;;
  esac
done

PROMPT="${PROMPT:-$DEFAULT_PROMPT}"

if [ ${#IMAGES[@]} -eq 0 ]; then
  echo "사용법: $0 <이미지1> [이미지2 ...] [-p \"프롬프트\"]"
  echo ""
  echo "예시:"
  echo "  $0 ./photo.jpg"
  echo "  $0 ./photo.jpg -p \"이 그림에 대해 설명해봐\""
  echo "  $0 ./img1.jpg ./img2.jpg -p \"두 이미지를 비교해줘\""
  exit 1
fi

for img in "${IMAGES[@]}"; do
  if [ ! -f "$img" ]; then
    echo "ERROR: 이미지 파일을 찾을 수 없습니다: $img"
    exit 1
  fi
done

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

# ── --image 플래그 및 프롬프트 내 미디어 마커 구성 ────────────
IMAGE_ARGS=()
MEDIA_MARKERS=""
for img in "${IMAGES[@]}"; do
  IMAGE_ARGS+=(--image "$img")
  MEDIA_MARKERS+="<__media__>
"
done

# ── 추론 실행 ────────────────────────────────────────────────
echo "=== 추론 시작 ==="
echo "이미지: ${IMAGES[*]} (${#IMAGES[@]}장)"
echo "프롬프트: $PROMPT"
echo "파라미터: ctx=$CTX_SIZE, n_predict=$N_PREDICT, temp=$TEMPERATURE, ngl=$N_GPU_LAYERS"
echo "---"

llama-mtmd-cli \
  --model "$MODEL_DIR/$TEXT_MODEL" \
  --mmproj "$MODEL_DIR/$MMPROJ_MODEL" \
  "${IMAGE_ARGS[@]}" \
  --override-kv "tokenizer.ggml.eos_token_id=int:151645" \
  -c "$CTX_SIZE" \
  -ngl "$N_GPU_LAYERS" \
  --temp "$TEMPERATURE" \
  -n "$N_PREDICT" \
  -p "<|im_start|>system
You MUST reply in the same language the user writes in. If the user writes Korean (한국어), reply in Korean only. If Japanese (日本語), reply in Japanese only. If Chinese (中文), reply in Chinese only. If English, reply in English only. Never switch languages.<|im_end|>
<|im_start|>user
${MEDIA_MARKERS}${PROMPT}<|im_end|>
<|im_start|>assistant
"
