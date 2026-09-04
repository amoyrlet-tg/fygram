export type View =
  | { kind: "library" }
  | { kind: "channel"; channelId: string }
  | { kind: "playlist"; playlistId: string }
  | { kind: "artist"; artist: string };
