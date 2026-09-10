import { invoke } from "@tauri-apps/api/core";

export const ambientColor = (path: string) => invoke<string | null>("ambient_colour", { path });
