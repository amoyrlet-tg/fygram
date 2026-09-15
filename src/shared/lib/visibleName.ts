function drawsNothing(code: number): boolean {
  return (
    code === 0x00ad ||
    code === 0x034f ||
    code === 0x061c ||
    code === 0x115f ||
    code === 0x1160 ||
    code === 0x17b4 ||
    code === 0x17b5 ||
    (code >= 0x180b && code <= 0x180e) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x2064) ||
    (code >= 0x206a && code <= 0x206f) ||
    code === 0x2800 ||
    code === 0x3164 ||
    (code >= 0xfe00 && code <= 0xfe0f) ||
    code === 0xfeff ||
    code === 0xffa0
  );
}

export function hasInk(text: string): boolean {
  for (const character of text) {
    if (character.trim() === "") continue;
    const code = character.codePointAt(0);
    if (code !== undefined && !drawsNothing(code)) return true;
  }
  return false;
}

export interface NameOwner {
  first_name: string;
  username: string | null;
}

export function visibleName(
  user: NameOwner | null,
  invisibleLabel: string,
): { text: string; substituted: boolean } {
  if (!user) return { text: "", substituted: false };
  if (hasInk(user.first_name)) {
    return { text: user.first_name.trim(), substituted: false };
  }
  return user.username
    ? { text: `@${user.username}`, substituted: true }
    : { text: invisibleLabel, substituted: true };
}
