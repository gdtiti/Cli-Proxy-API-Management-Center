@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: CLIProxyAPI Management Center - Development Utility Script
:: 快速开发工具脚本

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: Color codes for Windows
set "COLOR_RESET=[0m"
set "COLOR_GREEN=[92m"
set "COLOR_YELLOW=[93m"
set "COLOR_RED=[91m"
set "COLOR_BLUE=[94m"
set "COLOR_CYAN=[96m"

if "%1"=="" goto :show_help

:: Parse command
set "CMD=%1"
shift

if /i "%CMD%"=="help" goto :show_help
if /i "%CMD%"=="h" goto :show_help
if /i "%CMD%"=="-h" goto :show_help
if /i "%CMD%"=="--help" goto :show_help

if /i "%CMD%"=="install" goto :install
if /i "%CMD%"=="i" goto :install

if /i "%CMD%"=="dev" goto :dev
if /i "%CMD%"=="d" goto :dev

if /i "%CMD%"=="build" goto :build
if /i "%CMD%"=="b" goto :build

if /i "%CMD%"=="preview" goto :preview
if /i "%CMD%"=="p" goto :preview

if /i "%CMD%"=="test" goto :test
if /i "%CMD%"=="t" goto :test

if /i "%CMD%"=="lint" goto :lint
if /i "%CMD%"=="l" goto :lint

if /i "%CMD%"=="format" goto :format
if /i "%CMD%"=="fmt" goto :format

if /i "%CMD%"=="clean" goto :clean
if /i "%CMD%"=="c" goto :clean

if /i "%CMD%"=="start" goto :start_backend
if /i "%CMD%"=="stop" goto :stop_backend
if /i "%CMD%"=="restart" goto :restart_backend
if /i "%CMD%"=="status" goto :status_backend

if /i "%CMD%"=="login" goto :login_menu
if /i "%CMD%"=="login-kiro" goto :login_kiro
if /i "%CMD%"=="login-codex" goto :login_codex
if /i "%CMD%"=="login-gemini" goto :login_gemini
if /i "%CMD%"=="login-antigravity" goto :login_antigravity

if /i "%CMD%"=="quota" goto :check_quota
if /i "%CMD%"=="q" goto :check_quota

echo %COLOR_RED%Unknown command: %CMD%%COLOR_RESET%
echo.
goto :show_help

:show_help
echo %COLOR_CYAN%========================================%COLOR_RESET%
echo %COLOR_CYAN%  CLIProxyAPI Management Center%COLOR_RESET%
echo %COLOR_CYAN%  Development Utility Script%COLOR_RESET%
echo %COLOR_CYAN%========================================%COLOR_RESET%
echo.
echo %COLOR_GREEN%Usage:%COLOR_RESET% dev.bat [command] [options]
echo.
echo %COLOR_YELLOW%Development Commands:%COLOR_RESET%
echo   install, i          Install dependencies
echo   dev, d              Start development server
echo   build, b            Build for production
echo   preview, p          Preview production build
echo   test, t             Run tests
echo   lint, l             Run linter
echo   format, fmt         Format code
echo   clean, c            Clean build artifacts
echo.
echo %COLOR_YELLOW%Backend Commands:%COLOR_RESET%
echo   start               Start CLIProxyAPIPlus backend
echo   stop                Stop CLIProxyAPIPlus backend
echo   restart             Restart CLIProxyAPIPlus backend
echo   status              Check backend status
echo.
echo %COLOR_YELLOW%Authentication Commands:%COLOR_RESET%
echo   login               Show login menu
echo   login-kiro          Login to Kiro (AWS CodeWhisperer)
echo   login-codex         Login to Codex (ChatGPT)
echo   login-gemini        Login to Gemini CLI
echo   login-antigravity   Login to Antigravity
echo.
echo %COLOR_YELLOW%Quota Commands:%COLOR_RESET%
echo   quota, q            Check quota for all providers
echo.
echo %COLOR_YELLOW%Help:%COLOR_RESET%
echo   help, h, -h, --help Show this help message
echo.
goto :eof

:install
echo %COLOR_GREEN%Installing dependencies...%COLOR_RESET%
call npm install
if errorlevel 1 (
    echo %COLOR_RED%Failed to install dependencies%COLOR_RESET%
    exit /b 1
)
echo %COLOR_GREEN%Dependencies installed successfully%COLOR_RESET%
goto :eof

:dev
echo %COLOR_GREEN%Starting development server...%COLOR_RESET%
call npm run dev
goto :eof

:build
echo %COLOR_GREEN%Building for production...%COLOR_RESET%
call npm run build
if errorlevel 1 (
    echo %COLOR_RED%Build failed%COLOR_RESET%
    exit /b 1
)
echo %COLOR_GREEN%Build completed successfully%COLOR_RESET%
goto :eof

:preview
echo %COLOR_GREEN%Starting preview server...%COLOR_RESET%
call npm run preview
goto :eof

:test
echo %COLOR_GREEN%Running tests...%COLOR_RESET%
call npm run test
goto :eof

:lint
echo %COLOR_GREEN%Running linter...%COLOR_RESET%
call npm run lint
goto :eof

:format
echo %COLOR_GREEN%Formatting code...%COLOR_RESET%
call npm run format
if errorlevel 1 (
    echo %COLOR_YELLOW%No format script found, trying prettier...%COLOR_RESET%
    call npx prettier --write "src/**/*.{ts,tsx,js,jsx,json,css,scss}"
)
goto :eof

:clean
echo %COLOR_GREEN%Cleaning build artifacts...%COLOR_RESET%
if exist "dist" (
    rmdir /s /q "dist"
    echo Removed dist directory
)
if exist "node_modules\.vite" (
    rmdir /s /q "node_modules\.vite"
    echo Removed Vite cache
)
if exist ".turbo" (
    rmdir /s /q ".turbo"
    echo Removed Turbo cache
)
echo %COLOR_GREEN%Clean completed%COLOR_RESET%
goto :eof

:start_backend
echo %COLOR_GREEN%Starting CLIProxyAPIPlus backend...%COLOR_RESET%
set "BACKEND_DIR=%SCRIPT_DIR%..\CLIProxyAPIPlus"
if not exist "%BACKEND_DIR%" (
    echo %COLOR_RED%Backend directory not found: %BACKEND_DIR%%COLOR_RESET%
    exit /b 1
)

:: Check if backend is already running
tasklist /FI "IMAGENAME eq CLIProxyAPIPlus.exe" 2>NUL | find /I /N "CLIProxyAPIPlus.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo %COLOR_YELLOW%Backend is already running%COLOR_RESET%
    goto :eof
)

:: Find the executable
set "BACKEND_EXE="
if exist "%BACKEND_DIR%\CLIProxyAPIPlus.exe" (
    set "BACKEND_EXE=%BACKEND_DIR%\CLIProxyAPIPlus.exe"
) else if exist "%BACKEND_DIR%\bin\CLIProxyAPIPlus.exe" (
    set "BACKEND_EXE=%BACKEND_DIR%\bin\CLIProxyAPIPlus.exe"
) else (
    echo %COLOR_RED%CLIProxyAPIPlus.exe not found%COLOR_RESET%
    exit /b 1
)

echo Starting: %BACKEND_EXE%
start "CLIProxyAPIPlus" "%BACKEND_EXE%"
timeout /t 2 >nul
echo %COLOR_GREEN%Backend started%COLOR_RESET%
goto :eof

:stop_backend
echo %COLOR_GREEN%Stopping CLIProxyAPIPlus backend...%COLOR_RESET%
taskkill /F /IM CLIProxyAPIPlus.exe 2>nul
if errorlevel 1 (
    echo %COLOR_YELLOW%Backend is not running%COLOR_RESET%
) else (
    echo %COLOR_GREEN%Backend stopped%COLOR_RESET%
)
goto :eof

:restart_backend
echo %COLOR_GREEN%Restarting CLIProxyAPIPlus backend...%COLOR_RESET%
call :stop_backend
timeout /t 2 >nul
call :start_backend
goto :eof

:status_backend
echo %COLOR_GREEN%Checking backend status...%COLOR_RESET%
tasklist /FI "IMAGENAME eq CLIProxyAPIPlus.exe" 2>NUL | find /I /N "CLIProxyAPIPlus.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo %COLOR_GREEN%Backend is running%COLOR_RESET%
    tasklist /FI "IMAGENAME eq CLIProxyAPIPlus.exe"
) else (
    echo %COLOR_YELLOW%Backend is not running%COLOR_RESET%
)
goto :eof

:login_menu
echo %COLOR_CYAN%========================================%COLOR_RESET%
echo %COLOR_CYAN%  Authentication Login Menu%COLOR_RESET%
echo %COLOR_CYAN%========================================%COLOR_RESET%
echo.
echo %COLOR_YELLOW%Select a provider:%COLOR_RESET%
echo   1. Kiro (AWS CodeWhisperer)
echo   2. Codex (ChatGPT)
echo   3. Gemini CLI
echo   4. Antigravity
echo   0. Cancel
echo.
set /p "choice=Enter your choice (0-4): "

if "%choice%"=="1" goto :login_kiro
if "%choice%"=="2" goto :login_codex
if "%choice%"=="3" goto :login_gemini
if "%choice%"=="4" goto :login_antigravity
if "%choice%"=="0" goto :eof

echo %COLOR_RED%Invalid choice%COLOR_RESET%
goto :login_menu

:login_kiro
echo %COLOR_GREEN%Logging in to Kiro (AWS CodeWhisperer)...%COLOR_RESET%
echo.
echo %COLOR_YELLOW%Choose authentication method:%COLOR_RESET%
echo   1. AWS Builder ID (SSO)
echo   2. Google OAuth
echo   3. GitHub OAuth
echo   0. Cancel
echo.
set /p "method=Enter your choice (0-3): "

if "%method%"=="1" (
    echo %COLOR_GREEN%Starting AWS Builder ID login...%COLOR_RESET%
    call cliproxyapi kiro login --method builder-id
) else if "%method%"=="2" (
    echo %COLOR_GREEN%Starting Google OAuth login...%COLOR_RESET%
    call cliproxyapi kiro login --method google
) else if "%method%"=="3" (
    echo %COLOR_GREEN%Starting GitHub OAuth login...%COLOR_RESET%
    call cliproxyapi kiro login --method github
) else if "%method%"=="0" (
    goto :eof
) else (
    echo %COLOR_RED%Invalid choice%COLOR_RESET%
    goto :login_kiro
)
goto :eof

:login_codex
echo %COLOR_GREEN%Logging in to Codex (ChatGPT)...%COLOR_RESET%
call cliproxyapi codex login
goto :eof

:login_gemini
echo %COLOR_GREEN%Logging in to Gemini CLI...%COLOR_RESET%
echo.
set /p "project=Enter Google Cloud Project ID: "
if "%project%"=="" (
    echo %COLOR_RED%Project ID is required%COLOR_RESET%
    goto :login_gemini
)
call cliproxyapi gemini-cli login --project "%project%"
goto :eof

:login_antigravity
echo %COLOR_GREEN%Logging in to Antigravity...%COLOR_RESET%
call cliproxyapi antigravity login
goto :eof

:check_quota
echo %COLOR_GREEN%Checking quota for all providers...%COLOR_RESET%
echo.
echo %COLOR_CYAN%=== Kiro Quota ===%COLOR_RESET%
call cliproxyapi kiro quota 2>nul
if errorlevel 1 echo %COLOR_YELLOW%No Kiro accounts found or not logged in%COLOR_RESET%
echo.
echo %COLOR_CYAN%=== Codex Quota ===%COLOR_RESET%
call cliproxyapi codex quota 2>nul
if errorlevel 1 echo %COLOR_YELLOW%No Codex accounts found or not logged in%COLOR_RESET%
echo.
echo %COLOR_CYAN%=== Gemini CLI Quota ===%COLOR_RESET%
call cliproxyapi gemini-cli quota 2>nul
if errorlevel 1 echo %COLOR_YELLOW%No Gemini CLI accounts found or not logged in%COLOR_RESET%
echo.
echo %COLOR_CYAN%=== Antigravity Quota ===%COLOR_RESET%
call cliproxyapi antigravity quota 2>nul
if errorlevel 1 echo %COLOR_YELLOW%No Antigravity accounts found or not logged in%COLOR_RESET%
goto :eof

:eof
endlocal
