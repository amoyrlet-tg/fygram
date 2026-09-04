import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import "./styles/index.css";
import { authApi } from "@/features/auth/api";
import { TelegramSetup } from "@/features/auth/components/TelegramSetup";
import { TelegramLogin } from "@/features/auth/components/TelegramLogin";
import { ReloginOverlay } from "@/features/auth/components/ReloginOverlay";
import { onReloginRequested, rememberSessionInvalid } from "@/features/auth/sessionStatus";
import { WelcomeScreen } from "@/features/welcome/WelcomeScreen";
import { LanguagePicker } from "@/features/welcome/LanguagePicker";
import { useT } from "@/shared/i18n";
import { useIsDesktopHost } from "@/platforms/host";
import { ToastHost } from "@/shared/ui/Toast";
import { Library } from "./Library";

type Screen = "loading" | "language" | "setup" | "login" | "greeting" | "app";

const LIBRARY_PRELOAD_DELAY_MS = 700;

function App() {
  const t = useT();
  // on the document rather than passed around: it is a property of the page
  const isDesktop = useIsDesktopHost();
  useEffect(() => {
    document.documentElement.toggleAttribute("data-compact", !isDesktop);
  }, [isDesktop]);
  const [screen, setScreen] = useState<Screen>("loading");
  const [libraryMounted, setLibraryMounted] = useState(false);
  const [greetingClosing, setGreetingClosing] = useState(false);
  const [reloginOpen, setReloginOpen] = useState(false);

  const bootstrap = useCallback(async () => {
    try {
      const hasCreds = await authApi.hasTelegramCredentials();
      if (!hasCreds) {
        setScreen("setup");
        return;
      }
      const session = await authApi.telegramSessionState();
      rememberSessionInvalid(session.session_invalid);
      if (session.authorized) {
        setScreen("greeting");
        return;
      }
      setScreen(session.has_local_library ? "app" : "login");
    } catch {
      setScreen("setup");
    }
  }, []);

  useEffect(() => {
    invoke("stop_playback", { seq: 999999999 }).catch((err) => {
      console.warn("Заглушить призрачный бэкенд не вышло:", err);
    });

    if (!localStorage.getItem("lang")) {
      setScreen("language");
      return;
    }

    bootstrap();
  }, [bootstrap]);

  useEffect(() => onReloginRequested(() => setReloginOpen(true)), []);

  useEffect(() => {
    const unlisten = listen("logged-out", () => {
      setScreen("loading");
      setLibraryMounted(false);
      setReloginOpen(false);
      bootstrap();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [bootstrap]);

  useEffect(() => {
    if (screen === "app") {
      setLibraryMounted(true);
      return;
    }
    if (screen !== "greeting") return;
    setGreetingClosing(false);
    const id = window.setTimeout(() => setLibraryMounted(true), LIBRARY_PRELOAD_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [screen]);

  let content: ReactNode;
  if (screen === "loading") {
    content = <div className="boot-screen">{t("Loading fygram…")}</div>;
  } else if (screen === "language") {
    content = <LanguagePicker onDone={bootstrap} />;
  } else if (screen === "setup") {
    content = <TelegramSetup onDone={() => setScreen("login")} />;
  } else if (screen === "login") {
    content = (
      <TelegramLogin
        onDone={() => setScreen("greeting")}
        onChangeCredentials={() => setScreen("setup")}
      />
    );
  } else {
    content = (
      <>
        {libraryMounted && (
          <div
            style={{
              display: "contents",
              visibility: screen === "greeting" && !greetingClosing ? "hidden" : "visible",
            }}
          >
            <Library />
          </div>
        )}
        {screen === "greeting" && (
          <WelcomeScreen
            onContinue={() => setScreen("app")}
            onCloseStart={() => setGreetingClosing(true)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <ToastHost />
      {content}
      {reloginOpen && (
        <ReloginOverlay
          onDone={() => {
            rememberSessionInvalid(false);
            setReloginOpen(false);
          }}
          onChangeCredentials={() => {
            setReloginOpen(false);
            setScreen("setup");
          }}
          onDismiss={() => setReloginOpen(false)}
        />
      )}
    </>
  );
}

export default App;
