@echo off
rem YombalPay - lance tout le projet en une commande sous Windows (equivalent de run.sh).
rem
rem   run.bat          installe, construit le front, lance la passerelle (:3000) + la boutique (:4000)
rem                    + l'application mobile Expo (QR a scanner avec Expo Go, meme Wi-Fi)
rem   run.bat --no-mobile  meme chose sans l'application mobile
rem   run.bat dev      mode developpement : API en --watch (:3000) + Vite (:5173) + boutique (:4000)
rem   run.bat test     lance les tests de bout en bout (ports 3100/4100, base PostgreSQL locale yombal_pay_test)
rem   run.bat all      lance les tests puis la demo
rem   run.bat check    diagnostic de la connexion Bitnob (cles requises dans .env)
rem   run.bat reconcile  rapprochement comptable (registre, puis compte Bitnob)
rem   run.bat rebuild  force la reconstruction du front puis lance la demo
rem
rem Ctrl+C arrete tous les processus lances.

setlocal
chcp 65001 >nul
cd /d "%~dp0"

set "MODE=demo"
set "NO_MOBILE="
for %%a in (%*) do (
  if /i "%%~a"=="--no-mobile" (set "NO_MOBILE=1") else set "MODE=%%~a"
)
rem « run.bat mobile » : ancien nom, l'application mobile fait maintenant partie de la demo
if /i "%MODE%"=="mobile" set "MODE=demo"
for %%m in (demo rebuild dev test all check reconcile) do if /i "%MODE%"=="%%m" goto :mode_ok
goto :usage
:mode_ok

rem 1. Node 18+
where node >nul 2>&1 || call :die "Node.js n'est pas installé (version 18+ requise) : https://nodejs.org" || exit /b 1
node -e "process.exit(+process.versions.node.split('.')[0] < 18 ? 1 : 0)" || call :die "Node 18+ requis (version actuelle trop ancienne)." || exit /b 1
for /f "delims=" %%v in ('node -v') do echo [OK] Node %%v

rem 2. Dependances (seulement si absentes)
for %%d in (server web shop) do (
  if not exist "%%d\node_modules" (
    echo [..] Installation des dépendances de %%d\...
    call npm install --prefix %%d --no-audit --no-fund || call :die "Installation des dépendances de %%d impossible." || exit /b 1
  )
)
echo [OK] Dépendances installées

rem 3. Fichier .env (sans cles Bitnob : mode demo)
if not exist ".env" (
  copy /y ".env.example" ".env" >nul
  echo [OK] .env créé depuis .env.example ^(mode démo : pas de clés Bitnob^)
)

rem 3 bis. Base de donnees : Supabase si DATABASE_URL pointe vers un serveur distant, sinon PostgreSQL local
set "REMOTE_DB="
findstr /r /b /c:"DATABASE_URL=." .env >nul 2>&1 && (
  findstr /r /b /c:"DATABASE_URL=." .env | findstr /i "localhost 127.0.0.1" >nul || set "REMOTE_DB=1"
)
if defined REMOTE_DB (
  findstr /r /b /c:"DATABASE_URL=.*supabase" .env >nul && (echo [OK] Base de données : Supabase) || (echo [OK] Base de données : PostgreSQL distant)
) else if /i not "%MODE%"=="check" (
  node scripts\ensure-db.mjs || exit /b 1
  echo [OK] Base de données : PostgreSQL local
)

rem Base de test : TEST_DATABASE_URL du .env si present (ex. avec utilisateur et mot de passe Postgres sous Windows)
for /f "tokens=1,* delims==" %%a in ('findstr /r /b /c:"TEST_DATABASE_URL=." .env 2^>nul') do set "TEST_DATABASE_URL=%%b"

if /i "%MODE%"=="demo" (call :build_web & goto :run_demo)
if /i "%MODE%"=="rebuild" (call :build_web force & goto :run_demo)
if /i "%MODE%"=="dev" goto :run_dev
if /i "%MODE%"=="test" (call :build_web & goto :run_test)
if /i "%MODE%"=="all" goto :run_all
if /i "%MODE%"=="check" (node scripts\bitnob-check.mjs & exit /b)
if /i "%MODE%"=="reconcile" (node scripts\reconcile.mjs & exit /b)

:run_demo
if not exist "web\dist\index.html" call :die "Le front n'a pas pu être construit." & exit /b 1
call :configure_lan
call :free_port 3000
call :free_port 4000
if not exist ".run-logs" mkdir ".run-logs"
if defined NO_MOBILE (
  call :banner
  start "" /b node shop\server.js
  node server\src\index.js
  exit /b
)
rem Passerelle et boutique en arriere-plan, journaux dans .run-logs (l'ecran reste libre pour le QR d'Expo)
start "" /b cmd /c "node server\src\index.js > .run-logs\server.log 2>&1"
start "" /b cmd /c "node shop\server.js > .run-logs\shop.log 2>&1"
for /l %%i in (1,1,40) do (
  curl -s -o nul --max-time 1 http://localhost:3000/v1/health && goto :servers_up
  rem pause d'une seconde (timeout echoue quand l'entree est redirigee)
  ping -n 2 127.0.0.1 >nul
)
type ".run-logs\server.log"
call :die "La passerelle n'a pas démarré (journal : .run-logs\server.log)." & exit /b 1
:servers_up
echo [OK] Passerelle et boutique démarrées (journaux : .run-logs\server.log, .run-logs\shop.log)
call :banner
if not exist "mobile\node_modules" (
  echo [..] Installation des dépendances de mobile\...
  call npm install --prefix mobile --no-audit --no-fund || call :die "Installation des dépendances de mobile impossible." || exit /b 1
)
call :free_port 8081
pushd mobile
set "EXPO_NO_TELEMETRY=1"
call npx expo start --lan
popd
rem Expo ferme : on arrete aussi la passerelle et la boutique lancees en arriere-plan
call :free_port 3000
call :free_port 4000
exit /b

:run_dev
call :free_port 3000
call :free_port 4000
call :free_port 5173
call :banner
echo    Front Vite (HMR)  : http://localhost:5173
echo.
start "" /b node --watch server\src\index.js
start "" /b node shop\server.js
call npm run dev --prefix web
exit /b

:run_test
echo [..] Tests de bout en bout...
node scripts\e2e.mjs
exit /b

:run_all
call :build_web
echo [..] Tests de bout en bout...
node scripts\e2e.mjs || (call :die "Des tests ont échoué." & exit /b 1)
goto :run_demo

rem ---------------------------------------------------------------------------

:build_web
if /i "%~1"=="force" goto :do_build
if exist "web\dist\index.html" exit /b 0
:do_build
echo [..] Construction du front React...
call npm run build --prefix web
exit /b

rem Libere un port occupe par une ancienne instance
:free_port
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:":%~1 " ^| findstr LISTENING') do (
  if not "%%p"=="0" (
    echo [..] Port %~1 occupé, arrêt du processus %%p
    taskkill /f /pid %%p >nul 2>&1
  )
)
exit /b 0

:banner
set "DEMO_EMAIL="
set "DEMO_PASSWORD="
set "DEMO_KEY=sk_test_acs_demo_2026"
for /f "tokens=1,* delims==" %%a in ('findstr /b /c:"DEMO_MERCHANT_EMAIL=" .env 2^>nul') do set "DEMO_EMAIL=%%b"
for /f "tokens=1,* delims==" %%a in ('findstr /b /c:"DEMO_MERCHANT_PASSWORD=" .env 2^>nul') do set "DEMO_PASSWORD=%%b"
for /f "tokens=1,* delims==" %%a in ('findstr /b /c:"DEMO_MERCHANT_KEY=" .env 2^>nul') do set "DEMO_KEY=%%b"
if not defined LAN_IP set "LAN_IP=localhost"
set "RUN_MODE=RÉEL (Bitnob)"
curl -s --max-time 2 http://localhost:3000/v1/health 2>nul | findstr /c:"demo" >nul && set "RUN_MODE=DÉMO (paiements simulés)"
echo.
echo ----------------------------------------------------------------
echo  YombalPay est lancé · mode %RUN_MODE%
echo.
echo  Sur cet ordinateur
echo    Espace marchand : http://localhost:3000/app
echo    Boutique        : http://localhost:4000
echo    Documentation   : http://localhost:3000/docs
echo.
echo  Depuis le téléphone (même Wi-Fi)
echo    Espace marchand : http://%LAN_IP%:3000/app
echo    Page publique   : http://%LAN_IP%:3000/@africancostume
echo    Boutique        : http://%LAN_IP%:4000
echo.
echo  Compte marchand de démo
echo    E-mail          : %DEMO_EMAIL%
echo    Mot de passe    : %DEMO_PASSWORD%
echo    Clé API         : %DEMO_KEY%
echo.
echo  Journaux : .run-logs\server.log · .run-logs\shop.log
if defined NO_MOBILE (
  echo  Ctrl+C arrête tout.
) else (
  echo  Application mobile : ouvrez Expo Go sur le même Wi-Fi et scannez le QR ci-dessous.
  echo  « w » ouvre la version web de l'application.
  echo  « Serveur injoignable » ? Autorisez Node dans le pare-feu Windows ^(réseau privé^).
  echo  Ctrl+C arrête Expo, la passerelle et la boutique.
)
echo ----------------------------------------------------------------
echo.
exit /b 0

rem Adresse de l'ordinateur sur le reseau local (interface avec passerelle par defaut) : c'est par elle que le
rem telephone joint la passerelle. Si .env pointe vers localhost, les liens (paiement, recu, boutique) utilisent cette IP.
:configure_lan
set "LAN_IP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress" 2^>nul`) do set "LAN_IP=%%i"
rem Secours sans PowerShell : premiere adresse IPv4 donnee par ipconfig (« Adresse IPv4 » / « IPv4 Address »)
if not defined LAN_IP (
  for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /c:"IPv4"') do if not defined LAN_IP set "LAN_IP=%%i"
)
if defined LAN_IP set "LAN_IP=%LAN_IP: =%"
if not defined LAN_IP (
  echo [!] Aucune adresse IP locale : le test sur téléphone ne fonctionnera pas.
  set "LAN_IP=localhost"
)
set "ENV_PUBLIC_URL="
set "ENV_SHOP_URL="
for /f "tokens=1,* delims==" %%a in ('findstr /b /c:"PUBLIC_URL=" .env 2^>nul') do set "ENV_PUBLIC_URL=%%b"
for /f "tokens=1,* delims==" %%a in ('findstr /b /c:"SHOP_URL=" .env 2^>nul') do set "ENV_SHOP_URL=%%b"
set "PUBLIC_URL=http://%LAN_IP%:3000"
set "SHOP_URL=http://%LAN_IP%:4000"
if defined ENV_PUBLIC_URL echo %ENV_PUBLIC_URL% | findstr /i "localhost 127.0.0.1" >nul || set "PUBLIC_URL=%ENV_PUBLIC_URL%"
if defined ENV_SHOP_URL echo %ENV_SHOP_URL% | findstr /i "localhost 127.0.0.1" >nul || set "SHOP_URL=%ENV_SHOP_URL%"
(
  echo # Ecrit par run.bat ^(adresse de la passerelle vue par le telephone^)
  echo EXPO_PUBLIC_API_URL=http://%LAN_IP%:3000
) > "mobile\.env.local"
echo [OK] Adresse locale : %LAN_IP% ^(écrite dans mobile\.env.local^)
exit /b 0

:die
echo [ERREUR] %~1 1>&2
exit /b 1

:usage
echo Usage : run.bat [demo ^| dev ^| test ^| all ^| check ^| reconcile ^| rebuild] [--no-mobile]
exit /b 1
