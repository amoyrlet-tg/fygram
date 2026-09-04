let online: boolean | null = null;

export function rememberOnline(value: boolean) {
  online = value;
}

export function isOffline(): boolean {
  return online === false;
}
