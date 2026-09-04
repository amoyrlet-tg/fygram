import { invoke } from "@tauri-apps/api/core";
import type { CurrentUser, LoginOutcome, SessionState } from "@/shared/api/types";

export const authApi = {
  hasTelegramCredentials: () => invoke<boolean>("has_telegram_credentials"),
  getTelegramCredentials: () =>
    invoke<{ api_id: number; api_hash: string } | null>("get_telegram_credentials"),
  saveTelegramCredentials: (apiId: number, apiHash: string) =>
    invoke<void>("save_telegram_credentials", { apiId, apiHash }),
  telegramIsAuthorized: () => invoke<boolean>("telegram_is_authorized"),
  telegramSessionState: () => invoke<SessionState>("telegram_session_state"),
  getCurrentUser: () => invoke<CurrentUser>("get_current_user"),
  logout: () => invoke<void>("logout"),
  telegramRequestLoginCode: (phone: string) =>
    invoke<void>("telegram_request_login_code", { phone }),
  telegramSubmitCode: (code: string) => invoke<LoginOutcome>("telegram_submit_code", { code }),
  telegramSubmitPassword: (password: string) =>
    invoke<void>("telegram_submit_password", { password }),
};
