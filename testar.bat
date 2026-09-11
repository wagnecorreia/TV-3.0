@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo   TV 3.0 - Teste completo local (proxy + EPG)
echo ==============================================
echo.

echo [1/4] Gerando build (--gov-only)...
node generator\build.mjs --gov-only
if errorlevel 1 (
  echo.
  echo    ERRO no build. Corrija e rode de novo.
  pause
  exit /b 1
)

echo.
echo [2/4] Liberando a porta 8090 se estiver ocupada...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
rem -- espera a porta soltar antes de subir de novo (evita EADDRINUSE) --
powershell -NoProfile -Command "Start-Sleep -Milliseconds 800"

echo.
echo [3/4] Subindo o servidor de teste (proxy + EPG)...
powershell -NoProfile -Command "Start-Process -FilePath 'node' -ArgumentList 'scripts\serve.mjs' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
rem -- da ~3s pro node subir antes de testar --
powershell -NoProfile -Command "Start-Sleep -Seconds 3"
echo.    Servidor iniciado.

rem -- aquece o cache de canais e a API EPG da Globo (primeira chamada baixa ~500KB) --
echo.    Aquecendo EPG (primeira consulta baixa a lista de canais)...
curl.exe -s --max-time 90 "http://localhost:8090/api/epg?ch=Globo%20RJ" -o NUL

rem -- confere se a pagina servida e a build NOVA (senao sobrou processo antigo) --
echo.    Conferindo a build servida...
powershell -NoProfile -Command "$c=[string]::Join([char]10,(curl.exe -s --max-time 10 'http://localhost:8090/' 2>$null)); $ok=($c -match 'EPG_BASE') -and ($c -match 'ch-num') -and ($c -match 'mousemove') -and ($c -match 'TV_Globo_Logo_2025'); if($ok){ Write-Host '   OK: pagina NOVA no ar (EPG, numeros, orelhinhas, logo Globo).' } else { Write-Host '   ATENCAO: pagina servida parece ANTIGA.'; Write-Host '   Feche os processos node e rode de novo:  powershell -c ''Get-Process node | Stop-Process -Force''' }"

echo.
echo [4/4] Abrindo a pagina no navegador padrao...
start "" "http://localhost:8090/"

echo.
echo ==============================================
echo   Pronto! Recursos para testar:
echo.
echo   Pagina .......... http://localhost:8090/
echo   EPG (Globo) ..... http://localhost:8090/api/epg?ch=Globo%%20RJ
echo   Proxy (exemplo) . http://localhost:8090/api/proxy?u=https%%3A%%2F%%2Fwww.google.com
echo   Playlist M3U .... http://localhost:8090/playlist.m3u
echo.
echo   No app: Zap = setas / click na lista. Clique no
echo   meio com o aplicativo em tela cheia recolhe as abas;
echo   as orelhinhas somem sozinhas e voltam a mexer o mouse.
echo   EPG (agora/prox.) fica na linha de programa da barra.
echo.
echo   Para PARAR o servidor: feche a janelinha "node" no
echo   prompt (ou rode o comando abaixo) e rode de novo.
echo ==============================================
if /i not "%1"=="noPause" pause
endlocal