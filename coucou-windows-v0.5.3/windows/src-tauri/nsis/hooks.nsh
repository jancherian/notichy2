; Uninstall hooks for the NSIS installer.
;
; The app stages notch-hook.exe into %LOCALAPPDATA%\Notch\bin at launch.
; The inbox, logs and app files live in the same place and are removed on uninstall.

!macro NSIS_HOOK_PREUNINSTALL
  RMDir /r "$LOCALAPPDATA\Notch\bin"
  RMDir /r "$LOCALAPPDATA\Notch\inbox"
  RMDir /r "$LOCALAPPDATA\Notch\logs"
  Delete "$LOCALAPPDATA\Notch\logs\app.log"
  Delete "$LOCALAPPDATA\Notch\app.log"
  RMDir /r "$LOCALAPPDATA\Coucou"
!macroend
