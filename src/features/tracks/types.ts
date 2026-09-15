import type { Track } from "@/shared/api/types";

export type TrackMetadataEdit = Pick<Track, "title" | "artist" | "album"> & {
  coverPath: string | null;
};

export interface RepostOptions {
  caption: string;
  deleteOriginal: boolean;
}

export type TrackUpdate = TrackMetadataEdit & { repost?: RepostOptions };
export type TrackEdit = Omit<TrackUpdate, "album">;
export type TrackRepost = TrackMetadataEdit & RepostOptions;
