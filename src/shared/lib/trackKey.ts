const BRACKETS = /[([{][^)\]}]*[)\]}]/g;
const CREDIT_TAIL = /\s*\b(?:prod(?:uced)?|п|p|feat|ft|featuring|фит|w)\b[./].*$/i;
const HASHTAG = /#[\wЀ-ӿ]+/g;
const EXTENSION = /\.(?:mp3|m4a|flac|wav|ogg|opus|aac)$/i;

export function trackGroupKey(artist: string | null, title: string | null): string {
  const strip = (value: string | null) =>
    (value ?? "")
      .toLowerCase()
      .replace(EXTENSION, "")
      .replace(BRACKETS, " ")
      .replace(CREDIT_TAIL, " ")
      .replace(HASHTAG, " ")
      .replace(/[^\p{L}\p{N}]+/gu, "");
  return `${strip(artist)} ${strip(title)}`;
}
