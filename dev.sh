#!/bin/bash

# CLIProxyAPI Management Center - Development Utility Script
# 快速开发工具脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Color codes
COLOR_RESET='\033[0m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'
COLOR_BLUE='\033[0;34m'
COLOR_CYAN='\033[0;36m'

show_help() {
    echo -e "${COLOR_CYAN}========================================${COLOR_RESET}"
    echo -e "${COLOR_CYAN}  CLIProxyAPI Management Center${COLOR_RESET}"
    echo -e "${COLOR_CYAN}  Development Utility Script${COLOR_RESET}"
    echo -e "${COLOR_CYAN}========================================${COLOR_RESET}"
    echo ""
    echo -e "${COLOR_GREEN}Usage:${COLOR_RESET} ./dev.sh [command] [options]"
    echo ""
    echo -e "${COLOR_YELLOW}Development Commands:${COLOR_RESET}"
    echo "  install, i          Install dependencies"
    echo "  dev, d              Start development server"
    echo "  build, b            Build for production"
    echo "  preview, p          Preview production build"
    echo "  test, t             Run tests"
    echo "  lint, l             Run linter"
    echo "  format, fmt         Format code"
    echo "  clean, c            Clean build artifacts"
    echo ""
    echo -e "${COLOR_YELLOW}Backend Commands:${COLOR_RESET}"
    echo "  start               Start CLIProxyAPIPlus backend"
    echo "  stop                Stop CLIProxyAPIPlus backend"
    echo "  restart             Restart CLIProxyAPIPlus backend"
    echo "  status              Check backend status"
    echo ""
    echo -e "${COLOR_YELLOW}Authentication Commands:${COLOR_RESET}"
    echo "  login               Show login menu"
    echo "  login-kiro          Login to Kiro (AWS CodeWhisperer)"
    echo "  login-codex         Login to Codex (ChatGPT)"
    echo "  login-gemini        Login to Gemini CLI"
    echo "  login-antigravity   Login to Antigravity"
    echo ""
    echo -e "${COLOR_YELLOW}Quota Commands:${COLOR_RESET}"
    echo "  quota, q            Check quota for all providers"
    echo ""
    echo -e "${COLOR_YELLOW}Help:${COLOR_RESET}"
    echo "  help, h, -h, --help Show this help message"
    echo ""
}

install_deps() {
    echo -e "${COLOR_GREEN}Installing dependencies...${COLOR_RESET}"
    npm install
    echo -e "${COLOR_GREEN}Dependencies installed successfully${COLOR_RESET}"
}

dev_server() {
    echo -e "${COLOR_GREEN}Starting development server...${COLOR_RESET}"
    npm run dev
}

build_prod() {
    echo -e "${COLOR_GREEN}Building for production...${COLOR_RESET}"
    npm run build
    echo -e "${COLOR_GREEN}Build completed successfully${COLOR_RESET}"
}

preview_build() {
    echo -e "${COLOR_GREEN}Starting preview server...${COLOR_RESET}"
    npm run preview
}

run_tests() {
    echo -e "${COLOR_GREEN}Running tests...${COLOR_RESET}"
    npm run test
}

run_lint() {
    echo -e "${COLOR_GREEN}Running linter...${COLOR_RESET}"
    npm run lint
}

format_code() {
    echo -e "${COLOR_GREEN}Formatting code...${COLOR_RESET}"
    if npm run format 2>/dev/null; then
        :
    else
        echo -e "${COLOR_YELLOW}No format script found, trying prettier...${COLOR_RESET}"
        npx prettier --write "src/**/*.{ts,tsx,js,jsx,json,css,scss}"
    fi
}

clean_build() {
    echo -e "${COLOR_GREEN}Cleaning build artifacts...${COLOR_RESET}"
    rm -rf dist
    rm -rf node_modules/.vite
    rm -rf .turbo
    echo -e "${COLOR_GREEN}Clean completed${COLOR_RESET}"
}

start_backend() {
    echo -e "${COLOR_GREEN}Starting CLIProxyAPIPlus backend...${COLOR_RESET}"
    BACKEND_DIR="$SCRIPT_DIR/../CLIProxyAPIPlus"

    if [ ! -d "$BACKEND_DIR" ]; then
        echo -e "${COLOR_RED}Backend directory not found: $BACKEND_DIR${COLOR_RESET}"
        exit 1
    fi

    # Check if backend is already running
    if pgrep -f "CLIProxyAPIPlus" > /dev/null; then
        echo -e "${COLOR_YELLOW}Backend is already running${COLOR_RESET}"
        return
    fi

    # Find the executable
    BACKEND_EXE=""
    if [ -f "$BACKEND_DIR/CLIProxyAPIPlus" ]; then
        BACKEND_EXE="$BACKEND_DIR/CLIProxyAPIPlus"
    elif [ -f "$BACKEND_DIR/bin/CLIProxyAPIPlus" ]; then
        BACKEND_EXE="$BACKEND_DIR/bin/CLIProxyAPIPlus"
    else
        echo -e "${COLOR_RED}CLIProxyAPIPlus executable not found${COLOR_RESET}"
        exit 1
    fi

    echo "Starting: $BACKEND_EXE"
    nohup "$BACKEND_EXE" > /dev/null 2>&1 &
    sleep 2
    echo -e "${COLOR_GREEN}Backend started${COLOR_RESET}"
}

stop_backend() {
    echo -e "${COLOR_GREEN}Stopping CLIProxyAPIPlus backend...${COLOR_RESET}"
    if pkill -f "CLIProxyAPIPlus"; then
        echo -e "${COLOR_GREEN}Backend stopped${COLOR_RESET}"
    else
        echo -e "${COLOR_YELLOW}Backend is not running${COLOR_RESET}"
    fi
}

restart_backend() {
    echo -e "${COLOR_GREEN}Restarting CLIProxyAPIPlus backend...${COLOR_RESET}"
    stop_backend
    sleep 2
    start_backend
}

status_backend() {
    echo -e "${COLOR_GREEN}Checking backend status...${COLOR_RESET}"
    if pgrep -f "CLIProxyAPIPlus" > /dev/null; then
        echo -e "${COLOR_GREEN}Backend is running${COLOR_RESET}"
        pgrep -af "CLIProxyAPIPlus"
    else
        echo -e "${COLOR_YELLOW}Backend is not running${COLOR_RESET}"
    fi
}

login_menu() {
    echo -e "${COLOR_CYAN}========================================${COLOR_RESET}"
    echo -e "${COLOR_CYAN}  Authentication Login Menu${COLOR_RESET}"
    echo -e "${COLOR_CYAN}========================================${COLOR_RESET}"
    echo ""
    echo -e "${COLOR_YELLOW}Select a provider:${COLOR_RESET}"
    echo "  1. Kiro (AWS CodeWhisperer)"
    echo "  2. Codex (ChatGPT)"
    echo "  3. Gemini CLI"
    echo "  4. Antigravity"
    echo "  0. Cancel"
    echo ""
    read -p "Enter your choice (0-4): " choice

    case $choice in
        1) login_kiro ;;
        2) login_codex ;;
        3) login_gemini ;;
        4) login_antigravity ;;
        0) return ;;
        *) echo -e "${COLOR_RED}Invalid choice${COLOR_RESET}"; login_menu ;;
    esac
}

login_kiro() {
    echo -e "${COLOR_GREEN}Logging in to Kiro (AWS CodeWhisperer)...${COLOR_RESET}"
    echo ""
    echo -e "${COLOR_YELLOW}Choose authentication method:${COLOR_RESET}"
    echo "  1. AWS Builder ID (SSO)"
    echo "  2. Google OAuth"
    echo "  3. GitHub OAuth"
    echo "  0. Cancel"
    echo ""
    read -p "Enter your choice (0-3): " method

    case $method in
        1)
            echo -e "${COLOR_GREEN}Starting AWS Builder ID login...${COLOR_RESET}"
            cliproxyapi kiro login --method builder-id
            ;;
        2)
            echo -e "${COLOR_GREEN}Starting Google OAuth login...${COLOR_RESET}"
            cliproxyapi kiro login --method google
            ;;
        3)
            echo -e "${COLOR_GREEN}Starting GitHub OAuth login...${COLOR_RESET}"
            cliproxyapi kiro login --method github
            ;;
        0)
            return
            ;;
        *)
            echo -e "${COLOR_RED}Invalid choice${COLOR_RESET}"
            login_kiro
            ;;
    esac
}

login_codex() {
    echo -e "${COLOR_GREEN}Logging in to Codex (ChatGPT)...${COLOR_RESET}"
    cliproxyapi codex login
}

login_gemini() {
    echo -e "${COLOR_GREEN}Logging in to Gemini CLI...${COLOR_RESET}"
    echo ""
    read -p "Enter Google Cloud Project ID: " project
    if [ -z "$project" ]; then
        echo -e "${COLOR_RED}Project ID is required${COLOR_RESET}"
        login_gemini
        return
    fi
    cliproxyapi gemini-cli login --project "$project"
}

login_antigravity() {
    echo -e "${COLOR_GREEN}Logging in to Antigravity...${COLOR_RESET}"
    cliproxyapi antigravity login
}

check_quota() {
    echo -e "${COLOR_GREEN}Checking quota for all providers...${COLOR_RESET}"
    echo ""

    echo -e "${COLOR_CYAN}=== Kiro Quota ===${COLOR_RESET}"
    if ! cliproxyapi kiro quota 2>/dev/null; then
        echo -e "${COLOR_YELLOW}No Kiro accounts found or not logged in${COLOR_RESET}"
    fi
    echo ""

    echo -e "${COLOR_CYAN}=== Codex Quota ===${COLOR_RESET}"
    if ! cliproxyapi codex quota 2>/dev/null; then
        echo -e "${COLOR_YELLOW}No Codex accounts found or not logged in${COLOR_RESET}"
    fi
    echo ""

    echo -e "${COLOR_CYAN}=== Gemini CLI Quota ===${COLOR_RESET}"
    if ! cliproxyapi gemini-cli quota 2>/dev/null; then
        echo -e "${COLOR_YELLOW}No Gemini CLI accounts found or not logged in${COLOR_RESET}"
    fi
    echo ""

    echo -e "${COLOR_CYAN}=== Antigravity Quota ===${COLOR_RESET}"
    if ! cliproxyapi antigravity quota 2>/dev/null; then
        echo -e "${COLOR_YELLOW}No Antigravity accounts found or not logged in${COLOR_RESET}"
    fi
}

# Main command dispatcher
CMD="${1:-help}"

case $CMD in
    help|h|-h|--help)
        show_help
        ;;
    install|i)
        install_deps
        ;;
    dev|d)
        dev_server
        ;;
    build|b)
        build_prod
        ;;
    preview|p)
        preview_build
        ;;
    test|t)
        run_tests
        ;;
    lint|l)
        run_lint
        ;;
    format|fmt)
        format_code
        ;;
    clean|c)
        clean_build
        ;;
    start)
        start_backend
        ;;
    stop)
        stop_backend
        ;;
    restart)
        restart_backend
        ;;
    status)
        status_backend
        ;;
    login)
        login_menu
        ;;
    login-kiro)
        login_kiro
        ;;
    login-codex)
        login_codex
        ;;
    login-gemini)
        login_gemini
        ;;
    login-antigravity)
        login_antigravity
        ;;
    quota|q)
        check_quota
        ;;
    *)
        echo -e "${COLOR_RED}Unknown command: $CMD${COLOR_RESET}"
        echo ""
        show_help
        exit 1
        ;;
esac
