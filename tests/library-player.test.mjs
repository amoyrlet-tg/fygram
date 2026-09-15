import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { collapseDuplicateTracks } from "../src/features/tracks/collapseDuplicateTracks.ts";
import { libraryPresentation } from "../src/app/libraryPresentation.ts";
import {
  loadSavedSession,
  loadSavedVolume,
  parseStoredSession,
} from "../src/features/player/session.ts";
import { NEXT_REPEAT_MODE } from "../src/features/player/types.ts";

const track = (id, channel, fields = {}) => ({
  id,
  channel_id: channel,
  title: "Song",
  artist: "Artist",
  file_hash: "hash",
  tg_document_id: null,
  ...fields,
});
const translate = (key) => `translated:${key}`;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else delete globalThis.localStorage;
});
function storage(values) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key) => values[key] ?? null },
  });
}

test("duplicates retain group order, first writable row and unique source order", () => {
  const tracks = [
    track("a", "unknown"),
    track("b", "other", { file_hash: "other" }),
    track("c", "writable"),
    track("d", "writable"),
  ];
  const before = structuredClone(tracks);
  const groups = collapseDuplicateTracks(tracks, [
    { id: "unknown", can_edit: null },
    { id: "writable", can_edit: true },
  ]);
  assert.deepEqual(
    groups.rows.map((row) => row.id),
    ["c", "b"],
  );
  assert.deepEqual(groups.sources, { c: ["unknown", "writable"], b: ["other"] });
  assert.equal(groups.rows[0], tracks[2]);
  assert.deepEqual(tracks, before);
});

test("empty groups, unknown rights, zero document IDs and row fallbacks", () => {
  assert.deepEqual(collapseDuplicateTracks([], []), { rows: [], sources: {} });
  const tracks = [
    track("a", "first", { file_hash: "", tg_document_id: 0 }),
    track("b", "second", { file_hash: "", tg_document_id: 0 }),
    track("c", "first", { file_hash: "" }),
    track("d", "first", { file_hash: "" }),
  ];
  const result = collapseDuplicateTracks(tracks, [{ id: "first", can_edit: false }]);
  assert.deepEqual(
    result.rows.map((row) => row.id),
    ["a", "c", "d"],
  );
  assert.deepEqual(result.sources.a, ["first", "second"]);
});

test("all library views preserve titles, download keys and search scope", () => {
  const channels = [{ id: "", title: "" }];
  const playlists = [{ id: "p", name: "Mix" }];
  const cases = [
    [{ kind: "library" }, "translated:ALL MUSIC", "Library", undefined],
    [{ kind: "channel", channelId: "" }, "", "Channel", ""],
    [{ kind: "channel", channelId: "missing" }, "translated:Channel", "Channel", "missing"],
    [{ kind: "playlist", playlistId: "p" }, "Mix", "Playlist", "p"],
    [{ kind: "playlist", playlistId: "missing" }, "translated:Playlist", "Playlist", "missing"],
    [{ kind: "artist", artist: "" }, "", "Artist", "artist:"],
    [
      { kind: "artist", artist: "__various__" },
      "translated:Various artists",
      "Artist",
      "artist:__various__",
    ],
  ];
  for (const [view, title, kind, downloadId] of cases) {
    const result = libraryPresentation(view, channels, playlists, false, translate);
    assert.equal(result.title, title);
    assert.equal(result.kindLabel, translate(kind));
    assert.equal(result.downloadId, downloadId);
    assert.deepEqual(libraryPresentation(view, channels, playlists, true, translate), {
      ...result,
      title: translate("Search results"),
      kindLabel: translate("Search"),
    });
  }
});

test("stored sessions validate unknown input and preserve false, zero and empty IDs", () => {
  for (const value of [null, undefined, false, 0, "", [], {}, { queue: [0, null] }]) {
    assert.equal(parseStoredSession(value), null);
  }
  assert.deepEqual(
    parseStoredSession({
      queue: ["", 42, "a"],
      index: 0,
      position: -1,
      shuffle: false,
      repeat: "invalid",
    }),
    {
      queue: ["", "a"],
      index: 0,
      position: 0,
      shuffle: false,
      repeat: "off",
    },
  );
  for (const repeat of ["off", "all", "one"]) {
    assert.equal(parseStoredSession({ queue: ["a"], repeat }).repeat, repeat);
  }
  for (const index of [-1, 2, NaN, Infinity, "1"]) {
    assert.equal(parseStoredSession({ queue: ["a", "b"], index }).index, 0);
  }
  for (const position of [null, "1", NaN, Infinity]) {
    assert.equal(parseStoredSession({ queue: ["a"], position }).position, 0);
  }
  assert.equal(parseStoredSession({ queue: ["a", "b"], index: 1, position: 5 }).position, 5);
  assert.equal(parseStoredSession({ queue: ["a", "b"], index: 1 }).index, 1);
  assert.equal(parseStoredSession({ queue: ["a"], shuffle: "true" }).shuffle, false);
});

test("session fallback and corrupt JSON retain their different behavior", () => {
  storage({ "player-last-track": "legacy" });
  assert.deepEqual(loadSavedSession().queue, ["legacy"]);
  storage({ "player-last-track": "legacy", "player-session": "{}" });
  assert.deepEqual(loadSavedSession().queue, ["legacy"]);
  storage({ "player-last-track": "legacy", "player-session": "{" });
  assert.equal(loadSavedSession(), null);
  storage({ "player-session": JSON.stringify({ queue: ["new"], shuffle: true, repeat: "one" }) });
  assert.equal(loadSavedSession().shuffle, true);
});

test("volume retains mute, clamping and fallback; repeat visits all modes", () => {
  for (const [saved, expected] of [
    [undefined, 0.8],
    ["", 0],
    ["0", 0],
    ["-1", 0],
    ["2", 1],
    ["NaN", 0.8],
    ["Infinity", 0.8],
  ]) {
    storage({ "player-volume": saved });
    assert.equal(loadSavedVolume(), expected);
  }
  let mode = "off";
  for (const expected of ["all", "one", "off"]) {
    mode = NEXT_REPEAT_MODE[mode];
    assert.equal(mode, expected);
  }
});
