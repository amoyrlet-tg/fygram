!macro NSIS_HOOK_POSTUNINSTALL
  MessageBox MB_YESNO|MB_ICONQUESTION "Also delete your fygram library, downloads and Telegram login?$\r$\nThis cannot be undone." IDNO fygram_keep_data
  RMDir /r "$APPDATA\com.amoyrlet.fygram"
  fygram_keep_data:
!macroend
