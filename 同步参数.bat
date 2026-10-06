@echo off
chcp 65001 >nul
title 日历排班小程序 - 参数同步工具
color 0A
echo ========================================
echo    日历排班小程序 - 参数同步工具
echo ========================================
echo.
echo [1/3] 检查 Python 环境...
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [错误] 未找到 Python！
    echo 请先安装 Python 3 并勾选 "Add Python to PATH"
    echo 下载地址：https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)
echo       Python 环境正常
echo.
echo [2/3] 进入项目目录并同步参数...
cd /d "%~dp0"
python sync-config.py
if %errorlevel% neq 0 (
    echo.
    echo [错误] 参数同步失败，请检查上方错误信息
    echo.
    pause
    exit /b 1
)
echo.
echo [3/3] 同步完成！
echo.
echo ========================================
echo   下一步操作：
echo   1. 微信开发者工具中，右键 cloudfunctions 下的
echo      login / updateShift / manageMember / importShift
echo      选择「上传并部署：云端安装依赖」
echo   2. 小程序内退出登录后重新登录
echo ========================================
echo.
pause
