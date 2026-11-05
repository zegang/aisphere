; Custom NSIS script for AiSphere installer

!include x64.nsh
!include LogicLib.nsh
!include nsDialogs.nsh

!macro customHeader
  ; This is called before the installer header is defined
!macroend

; Installer pages and their functions must not be compiled when electron-builder
; generates the uninstaller: makensis treats the unreferenced functions as
; warnings (6010) and electron-builder compiles with warnings-as-errors.
!ifndef BUILD_UNINSTALLER
  !macro customPageAfterChangeDir
    ; Add a custom page to the wizard
    Page custom DockerCheckPageShow DockerCheckPageLeave
  !macroend
!endif

!ifndef BUILD_UNINSTALLER
Var DockerInstalled
Var PodmanInstalled
Var condaUrl
Var condaInstaller
Var podmanUrl

Function DockerCheckPageShow
  ; The page title/description come from the surrounding MUI page setup.

  ; Try to find docker in the PATH
  nsExec::ExecToStack 'cmd /c "docker --version"'
  Pop $0 ; Return code (0 is success)
  Pop $1 ; Output string
  StrCpy $DockerInstalled "0"
  ${If} $0 == 0
    StrCpy $DockerInstalled "1"
  ${EndIf}

  ; Try to find podman in the PATH
  nsExec::ExecToStack 'cmd /c "podman --version"'
  Pop $0
  StrCpy $PodmanInstalled "0"
  ${If} $0 == 0
    StrCpy $PodmanInstalled "1"
  ${EndIf}

  ; Create a simple UI check
  nsDialogs::Create 1018
  Pop $0

  ${If} $DockerInstalled == "1"
    ${NSD_CreateLabel} 0 0 100% 12u "Docker detected! The app will use your existing installation."
  ${ElseIf} $PodmanInstalled == "1"
    ${NSD_CreateLabel} 0 0 100% 12u "Podman detected! The app will use your existing installation."
  ${Else}
    ${NSD_CreateLabel} 0 0 100% 12u "Neither Docker nor Podman were found."
    ${NSD_CreateLabel} 0 20u 100% 12u "Note: You may need to install them manually or through the app later."
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function DockerCheckPageLeave
  ; Logic to execute after the user clicks 'Next' on our custom page
FunctionEnd
!endif

!macro customInstall
  DetailPrint "Installing isolated Miniconda toolchain..."

  ; Runtimes are installed under $INSTDIR\runtimes and their installers are
  ; cached in $INSTDIR\downloads, matching the in-app runtime installer.
  CreateDirectory "$INSTDIR\downloads"
  CreateDirectory "$INSTDIR\runtimes"

  ; Check if already installed in the selected installation directory
  IfFileExists "$INSTDIR\runtimes\conda\Scripts\conda.exe" skip_conda

  ; Detect architecture for Windows
  ${If} ${IsNativeARM64}
    StrCpy $condaUrl "https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-arm64.exe"
  ${ElseIf} ${RunningX64}
    StrCpy $condaUrl "https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe"
  ${Else}
    DetailPrint "Unsupported architecture for isolated Conda."
    Goto skip_conda
  ${EndIf}

  StrCpy $condaInstaller "$INSTDIR\downloads\Miniconda3-latest-Windows-installer.exe"

  DetailPrint "Downloading Miniconda from $condaUrl..."
  ; inetc is the standard download plugin provided by electron-builder's NSIS environment
  inetc::get "$condaUrl" "$condaInstaller" /END
  Pop $0

  ${If} $0 == "OK"
    DetailPrint "Executing silent installation to $INSTDIR\runtimes\conda (this may take 2-5 minutes)..."
    ; /S: Silent
    ; /InstallationType=JustMe: Avoids requiring Admin for the tool itself
    ; /D: Target folder (must be the last parameter and handled specially by the installer)
    ExecWait '"$condaInstaller" /S /InstallationType=JustMe /RegisterPython=0 /AddToPath=0 /D=$INSTDIR\runtimes\conda'
    Delete "$condaInstaller"
    DetailPrint "Conda installation successful."

    ; Ensure the per-user environment directories exist. They are created under
    ; the install directory, which is writable by the installing user.
    CreateDirectory "$INSTDIR\runtimes\conda\envs"
    CreateDirectory "$INSTDIR\runtimes\conda\pkgs"
    DetailPrint "Created Conda environment directories."
  ${Else}
    DetailPrint "Miniconda download failed: $0"
  ${EndIf}

skip_conda:

  DetailPrint "Installing isolated Podman client..."
  IfFileExists "$INSTDIR\runtimes\podman\.installed" skip_podman

  ${If} ${RunningX64}
    StrCpy $podmanUrl "https://github.com/containers/podman/releases/latest/download/podman-remote-release-windows-x86_64.zip"
  ${Else}
    Goto skip_podman
  ${EndIf}

  CreateDirectory "$INSTDIR\runtimes\podman"
  inetc::get "$podmanUrl" "$INSTDIR\downloads\podman-remote-release-windows.zip" /END
  Pop $0
  ${If} $0 == "OK"
    nsisunz::UnzipToLog "$INSTDIR\downloads\podman-remote-release-windows.zip" "$INSTDIR\runtimes\podman"
    Delete "$INSTDIR\downloads\podman-remote-release-windows.zip"

    ; Create empty config dir for isolation
    CreateDirectory "$INSTDIR\runtimes\podman\config"
    FileOpen $9 "$INSTDIR\runtimes\podman\.installed" w
    FileClose $9
    DetailPrint "Podman client installed."
  ${EndIf}

skip_podman:
!macroend

!macro customUnInstall
  DetailPrint "Cleaning up isolated toolchains and environments..."
  
  ; Recursively remove the directories created by the installer and the application
  RMDir /r "$INSTDIR\runtimes"
  RMDir /r "$INSTDIR\downloads"
  RMDir /r "$INSTDIR\miniconda"
  RMDir /r "$INSTDIR\podman"
  RMDir /r "$INSTDIR\bin"
  RMDir /r "$INSTDIR\envs"
  RMDir /r "$INSTDIR\cache"
!macroend