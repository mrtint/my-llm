import { useState } from "react";
import * as ImagePicker from "expo-image-picker";

export function useImagePicker(onImageSelected?: () => void) {
  const [imageUris, setImageUris] = useState<string[]>([]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: false,
      allowsMultipleSelection: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      setImageUris((prev) => [
        ...prev,
        ...result.assets.map((a) => a.uri),
      ]);
      onImageSelected?.();
    }
  };

  const removeImage = (index: number) => {
    setImageUris((prev) => prev.filter((_, i) => i !== index));
  };

  return { imageUris, pickImage, removeImage };
}
