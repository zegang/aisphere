; Custom NSIS script for AiSphere installer

!include x64.nsh
!include AccessControl.nsh ; For setting permissions

!macro customHeader
  ; This is called before the installer header is defined
!macroend

!macro customPage
  ; Add a custom page to the wizard
  Page custom DockerCheckPageShow DockerCheckPageLeave
!macroend

Var DockerInstalled
Var PodmanInstalled

Function DockerCheckPageShow
  !insertmacro MUI_HEADER_TEXT "Environment Check" "Checking for Docker or Podman dependencies."

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

!macro customInstall
  DetailPrint "Installing isolated Miniconda toolchain..."

  ; Check if already installed in the selected installation directory
  IfFileExists "$INSTDIR\miniconda\Scripts\conda.exe" skip_conda

  Var /GLOBAL condaUrl
  Var /GLOBAL condaInstaller

  ; Detect architecture for Windows
  ${If} ${IsNativeARM64}
    StrCpy $condaUrl "https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-arm64.exe"
  ${ElseIf} ${RunningX64}
    StrCpy $condaUrl "https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe"
  ${Else}
    DetailPrint "Unsupported architecture for isolated Conda."
    Goto skip_conda
  ${EndIf}

  StrCpy $condaInstaller "$INSTDIR\miniconda_installer.exe"

  DetailPrint "Downloading Miniconda from $condaUrl..."
  ; inetc is the standard download plugin provided by electron-builder's NSIS environment
  inetc::get "$condaUrl" "$condaInstaller" /END
  Pop $0

  ${If} $0 == "OK"
    DetailPrint "Executing silent installation to $INSTDIR\miniconda (this may take 2-5 minutes)..."
    ; /S: Silent
    ; /InstallationType=JustMe: Avoids requiring Admin for the tool itself
    ; /D: Target folder (must be the last parameter and handled specially by the installer)
    ExecWait '"$condaInstaller" /S /InstallationType=JustMe /RegisterPython=0 /AddToPath=0 /D=$INSTDIR\miniconda'
    Delete "$condaInstaller"
    DetailPrint "Conda installation successful."

    ; Set permissions for the 'envs' and 'pkgs' directories to allow non-admin users to create environments.
    ; This is crucial if installing to a system-protected directory like Program Files.
    CreateDirectory "$INSTDIR\miniconda\envs" ; Ensure directory exists before setting permissions
    CreateDirectory "$INSTDIR\miniconda\pkgs" ; Ensure directory exists before setting permissions
    ${AccessControl::GrantOnFile} "$INSTDIR\miniconda\envs" "(S-1-5-32-545)" "Full" ; Grant 'Users' group Full Control
    ${AccessControl::GrantOnFile} "$INSTDIR\miniconda\pkgs" "(S-1-5-32-545)" "Full" ; Grant 'Users' group Full Control
    DetailPrint "Set permissions for Conda environment directories."
  ${Else}
    DetailPrint "Miniconda download failed: $0"
  ${EndIf}

skip_conda:

  DetailPrint "Installing isolated Podman client..."
  IfFileExists "$INSTDIR\podman\podman.exe" skip_podman

  Var /GLOBAL podmanUrl
  ${If} ${RunningX64}
    StrCpy $podmanUrl "https://github.com/containers/podman/releases/latest/download/podman-remote-release-windows-x86_64.zip"
  ${Else}
    Goto skip_podman
  ${EndIf}

  CreateDirectory "$INSTDIR\podman"
  inetc::get "$podmanUrl" "$INSTDIR\podman.zip" /END
  Pop $0
  ${If} $0 == "OK"
    nsisunz::UnzipToLog "$INSTDIR\podman.zip" "$INSTDIR\podman"
    Delete "$INSTDIR\podman.zip"
    
    ; Create empty config dir for isolation
    CreateDirectory "$INSTDIR\podman\config"
    DetailPrint "Podman client installed."
  ${EndIf}

skip_podman:
!macroend

!macro customUnInstall
  DetailPrint "Cleaning up isolated toolchains and environments..."
  
  ; Recursively remove the directories created by the installer and the application
  RMDir /r "$INSTDIR\miniconda"
  RMDir /r "$INSTDIR\podman"
  RMDir /r "$INSTDIR\bin"
  RMDir /r "$INSTDIR\envs"
  RMDir /r "$INSTDIR\cache"
!macroend