import { Directory, Paths } from "expo-file-system";

export { MODEL_FILES } from "./inference";

export const MODEL_DIR = new Directory(Paths.document, "models");

export type ModelState =
  | "checking"
  | "not_downloaded"
  | "downloading"
  | "ready"
  | "loading"
  | "error";
