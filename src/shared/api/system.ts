import { invoke } from "@tauri-apps/api/core";

/** The "r, g, b" triple the picture at `path` reads as, or null when it has none. */
export const ambientColor = (path: string) => invoke<string | null>("ambient_colour", { path });
