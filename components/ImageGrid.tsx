import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { t } from "../lib/i18n";

interface ImageGridProps {
  imageUris: string[];
  onRemove: (index: number) => void;
  onAdd: () => void;
}

export function ImageGrid({ imageUris, onRemove, onAdd }: ImageGridProps) {
  return (
    <>
      {imageUris.length > 0 && (
        <View style={styles.imageGrid}>
          {imageUris.map((uri, index) => (
            <View key={uri + index} style={styles.imageThumbWrap}>
              <Image
                source={{ uri }}
                resizeMode="cover"
                style={styles.imageThumb}
              />
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => onRemove(index)}
              >
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      {imageUris.length > 0 && (
        <Text style={styles.imageCountText}>
          {t.imageCount(imageUris.length)}
        </Text>
      )}
      <TouchableOpacity style={styles.addImageBtn} onPress={onAdd}>
        <Text style={styles.addImageBtnText}>{t.tapToSelect}</Text>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  imageThumbWrap: {
    width: 100,
    height: 100,
    borderRadius: 10,
    overflow: "hidden",
  },
  imageThumb: {
    width: "100%",
    height: "100%",
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  imageCountText: {
    fontSize: 13,
    color: "#888",
    marginBottom: 8,
  },
  addImageBtn: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16,
    backgroundColor: "#f0f0f0",
  },
  addImageBtnText: {
    fontSize: 15,
    color: "#666",
  },
});
