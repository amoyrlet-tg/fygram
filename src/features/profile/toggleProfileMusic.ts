import { showToast } from "@/shared/ui/Toast";
import { profileApi } from "./api";

export function toggleProfileMusic(
  trackId: string,
  t: (key: string) => string,
  toastKey: string,
): Promise<void> {
  return profileApi
    .toggleProfileMusic(trackId)
    .then((inProfile) =>
      showToast({
        key: toastKey,
        kind: "ok",
        message: inProfile ? t("Added to the profile.") : t("Taken out of the profile."),
      }),
    )
    .catch((err: unknown) =>
      showToast({
        key: toastKey,
        kind: "warn",
        message: `${t("Couldn't add to the profile:")} ${err}`,
      }),
    );
}
