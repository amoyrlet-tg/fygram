export const VARIOUS_ARTISTS_KEY = "__various__";

const COLLAB_SEPARATOR =
  /\s*(?:,|&|\/|\+|\bx\b|\bvs\b\.?|\bfeat\b\.?|\bft\b\.?|\bfeaturing\b|\bproduced by\b|\bprod\b\.?|\band\b)\s*/gi;

export function splitArtistNames(artist: string): string[] {
  return artist
    .split(COLLAB_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
}

const TITLE_TOKEN_SPLIT = /[^a-zа-яё0-9]+/i;

function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .split(TITLE_TOKEN_SPLIT)
    .filter((tok) => tok.length >= 3);
}

function tokenMatchesArtistKey(token: string, artistKey: string): boolean {
  if (token === artistKey) return true;
  if (token.length < 5 || artistKey.length < 5) return false;
  return token.startsWith(artistKey) || artistKey.startsWith(token);
}

export function titleMentionsArtist(title: string, artistKey: string): boolean {
  if (artistKey.length < 3) return false;
  return titleTokens(title).some((tok) => tokenMatchesArtistKey(tok, artistKey));
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

export function transliterate(s: string): string {
  let out = "";
  for (const ch of s) {
    out += CYRILLIC_TO_LATIN[ch] ?? ch;
  }
  return out;
}

export function mergeTransliteratedVariants(variantsByKey: Map<string, Map<string, number>>): {
  merged: Map<string, Map<string, number>>;
  rootOf: Map<string, string>;
} {
  const keys = Array.from(variantsByKey.keys());

  const parent = new Map<string, string>(keys.map((k) => [k, k]));
  const find = (k: string): string => {
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = k;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const key of keys) {
    const t = transliterate(key);
    if (t !== key && variantsByKey.has(t)) union(key, t);
  }

  const rootOf = new Map<string, string>();
  const merged = new Map<string, Map<string, number>>();
  for (const key of keys) {
    const root = find(key);
    rootOf.set(key, root);
    const rootVariants = merged.get(root) ?? new Map<string, number>();
    for (const [name, count] of variantsByKey.get(key)!) {
      rootVariants.set(name, (rootVariants.get(name) ?? 0) + count);
    }
    merged.set(root, rootVariants);
  }
  return { merged, rootOf };
}
