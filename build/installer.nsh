; Запускать после установки сам exe, а не ярлык из «Пуска»:
; при обновлении старый деинсталлятор успевает удалить ярлык, и Windows показывает
; «Не удаётся найти ...\Start Menu\Programs\DLauncher.lnk».
!macro customInstall
  StrCpy $launchLink "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
!macroend
