@echo off
rem YombalPay - lance tout le projet en une commande sous Windows (equivalent de run.sh).
rem
rem   run.bat          installe, construit le front, lance la passerelle (:3000) + la boutique (:4000)
rem   run.bat dev      mode developpement : API en --watch (:3000) + Vite (:5173) + boutique (:4000)
rem   run.bat test     lance les tests de bout en bout (ports 3100/4100, base PostgreSQL locale yombal_pay_test)
rem   run.bat all      lance les tests puis la demo
rem   run.bat check    diagnostic de la connexion Bitnob (cles requises dans .env)
rem   run.bat rebuild  force la reconstruction du front puis lance la demo
rem
rem Ctrl+C arrete tous les processus lances.

setlocal
chcp 65001 >nul
cd /d "%~dp0"

set "MODE=%~1"
if "%MODE%"=="" set "MODE=demo"
for %%m in (demo rebuild dev test all check) do if /i "%MODE%"=="%%m" goto :mode_ok
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

:run_demo
if not exist "web\dist\index.html" call :die "Le front n'a pas pu être construit." & exit /b 1
call :free_port 3000
call :free_port 4000
call :banner
start "" /b node shop\server.js
node server\src\index.js
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
for /f "tokens=1,* delims==" %%a in ('findstr /b /c:"DEMO_MERCHANT_EMAIL=" .env 2^>nul') do set "DEMO_EMAIL=%%b"
echo.
echo [OK] YombalPay est lancé. Ctrl+C pour tout arrêter.
echo    Boutique de démo  : http://localhost:4000
echo    Espace marchand   : http://localhost:3000/app   (compte démo : %DEMO_EMAIL%)
echo    Caisse            : http://localhost:3000/app/caisse
echo    Page publique     : http://localhost:3000/@africancostume
echo    Documentation     : http://localhost:3000/docs
echo.
exit /b 0

:die
echo [ERREUR] %~1 1>&2
exit /b 1

:usage
echo Usage : run.bat [demo ^| dev ^| test ^| all ^| check ^| rebuild]
exit /b 1
