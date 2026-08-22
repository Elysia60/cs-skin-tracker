@echo off
chcp 65001 >nul
title CS2 饰品监控 & 交易辅助工具
cd /d "%~dp0"

:menu
cls
echo.
echo ============================================
echo    CS2 饰品价格监控 ^& 交易辅助工具
echo    零依赖 ^| Steam + Buff163 + 悠悠有品
echo ============================================
echo.
echo   [1] 生成模拟数据 (体验全部功能)
echo   [2] 查询实时价格
echo   [3] 深度分析单个皮肤
echo   [4] 500元资金分配方案
echo   [5] 风险评估报告
echo   [6] 持仓 ^& 盈亏统计
echo   [7] 价格历史走势
echo   [8] 价格告警管理
echo   [9] 持续监控模式
echo   [0] 完整命令帮助
echo   [Q] 退出
echo.
set /p choice="请选择 (0-9/Q): "

if "%choice%"=="1" goto demo
if "%choice%"=="2" goto check
if "%choice%"=="3" goto analyze
if "%choice%"=="4" goto plan
if "%choice%"=="5" goto risk
if "%choice%"=="6" goto stats
if "%choice%"=="7" goto history
if "%choice%"=="8" goto alerts
if "%choice%"=="9" goto monitor
if "%choice%"=="0" goto help
if /i "%choice%"=="Q" goto end
goto menu

:demo
node index.js demo
pause
goto menu

:check
node index.js check
pause
goto menu

:analyze
set /p skin="输入皮肤名 (如 AK-47 | Redline (Field-Tested)): "
node index.js analyze "%skin%"
pause
goto menu

:plan
node index.js plan
pause
goto menu

:risk
node index.js risk
pause
goto menu

:stats
node index.js positions
echo.
node index.js stats
pause
goto menu

:history
set /p skin="输入皮肤名: "
node index.js history "%skin%"
pause
goto menu

:alerts
node index.js alerts
pause
goto menu

:monitor
node index.js monitor 300
goto menu

:help
node index.js
pause
goto menu

:end
echo 再见!
exit