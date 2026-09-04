import { invoke } from "@tauri-apps/api/core";

export const readImageAsDataUrl = (path: string) =>
  invoke<string>("read_image_as_data_url", { path });
