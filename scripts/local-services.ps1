param(
  [ValidateSet('start', 'stop', 'status')][string]$Action = 'start',
  [string]$PostgresBin = 'C:\Program Files\PostgreSQL\16\bin',
  [int]$PostgresPort = 5433,
  [int]$RedisPort = 6379
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$Local = Join-Path $Root '.local'
$Data = Join-Path $Local 'postgres'
$RedisDir = Join-Path $Local 'redis\Redis-8.10.3-Windows-x64-msys2'
$PgCtl = Join-Path $PostgresBin 'pg_ctl.exe'
$RedisCli = Join-Path $RedisDir 'redis-cli.exe'

function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Executable failed (exit $LASTEXITCODE)" }
}

if ($Action -eq 'status') {
  if (Test-Path $Data) { & $PgCtl -D $Data status }
  if (Test-Path $RedisCli) { & $RedisCli -h 127.0.0.1 -p $RedisPort ping }
  exit 0
}

if ($Action -eq 'stop') {
  # Only stop this project's PostgreSQL instance and the Redis PID started here.
  if (Test-Path (Join-Path $Data 'postmaster.pid')) {
    Invoke-Checked $PgCtl @('-D', $Data, '-m', 'fast', '-w', 'stop')
  }
  $PidPath = Join-Path $Local 'redis.pid'
  if (Test-Path $PidPath) {
    $RedisProcess = Get-Process -Id (Get-Content $PidPath) -ErrorAction SilentlyContinue
    if ($RedisProcess -and $RedisProcess.Path -eq (Join-Path $RedisDir 'redis-server.exe')) {
      Invoke-Checked $RedisCli @('-h', '127.0.0.1', '-p', "$RedisPort", 'shutdown', 'nosave')
    }
    Remove-Item $PidPath
  }
  exit 0
}

if (!(Test-Path $PgCtl)) { throw "Install native PostgreSQL 16 or provide -PostgresBin. Not found: $PgCtl" }
New-Item -ItemType Directory -Force -Path $Local | Out-Null

if (!(Test-Path (Join-Path $Data 'PG_VERSION'))) {
  # Do not alter an existing system PostgreSQL server or its credentials.
  $PasswordFile = Join-Path $Local 'pg-password'
  if (!(Test-Path $PasswordFile)) {
    $Bytes = New-Object byte[] 24
    $Rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $Rng.GetBytes($Bytes)
    $Rng.Dispose()
    $Password = ([BitConverter]::ToString($Bytes)).Replace('-', '').ToLowerInvariant()
    [IO.File]::WriteAllText($PasswordFile, $Password)
    $EnvContent = "DATABASE_URL=postgresql://linkflow:$Password@127.0.0.1:$PostgresPort/linkflow?schema=public`nTEST_DATABASE_URL=postgresql://linkflow:$Password@127.0.0.1:$PostgresPort/linkflow_test?schema=public`n"
    [IO.File]::WriteAllText((Join-Path $Local 'database.env'), $EnvContent)
  }
  Invoke-Checked (Join-Path $PostgresBin 'initdb.exe') @('-D', $Data, '-U', 'linkflow', "--pwfile=$PasswordFile", '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C')
}

& $PgCtl -D $Data status *> $null
if ($LASTEXITCODE -ne 0) {
  Invoke-Checked $PgCtl @('-D', $Data, '-l', (Join-Path $Local 'postgres.log'), '-o', "-p $PostgresPort -h 127.0.0.1", '-w', 'start')
}

$OriginalPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = Get-Content (Join-Path $Local 'pg-password') -Raw
  foreach ($Database in @('linkflow', 'linkflow_test')) {
    [string]$Exists = & (Join-Path $PostgresBin 'psql.exe') -h 127.0.0.1 -p $PostgresPort -U linkflow -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$Database'"
    if ($LASTEXITCODE -ne 0) { throw 'Cannot connect to project PostgreSQL instance.' }
    if ($Exists.Trim() -ne '1') {
      Invoke-Checked (Join-Path $PostgresBin 'createdb.exe') @('-h', '127.0.0.1', '-p', "$PostgresPort", '-U', 'linkflow', $Database)
    }
  }
} finally { $env:PGPASSWORD = $OriginalPassword }

if (!(Test-Path (Join-Path $RedisDir 'redis-server.exe'))) {
  # Community native Windows build; version and SHA256 pinned to its release.
  # Alternatively set REDIS_URL to your own native/managed Redis server.
  $Archive = Join-Path $Local 'redis.zip'
  Invoke-WebRequest -Uri 'https://github.com/redis-windows/redis-windows/releases/download/8.10.3/Redis-8.10.3-Windows-x64-msys2.zip' -OutFile $Archive
  if ((Get-FileHash $Archive -Algorithm SHA256).Hash -ne 'AF16DF340525B431E9EC8DABFD625D5E7A233F82805B5418819904EA909C447F') {
    throw 'Redis download failed SHA256 verification; no executable was started.'
  }
  Expand-Archive -Path $Archive -DestinationPath (Join-Path $Local 'redis') -Force
}

$Listener = Get-NetTCPConnection -LocalPort $RedisPort -State Listen -ErrorAction SilentlyContinue
if (!$Listener) {
  $Process = Start-Process -FilePath (Join-Path $RedisDir 'redis-server.exe') -ArgumentList @('--bind', '127.0.0.1', '--port', "$RedisPort", '--appendonly', 'no') -WorkingDirectory $RedisDir -PassThru -RedirectStandardOutput (Join-Path $Local 'redis.log') -RedirectStandardError (Join-Path $Local 'redis-error.log')
  [IO.File]::WriteAllText((Join-Path $Local 'redis.pid'), "$($Process.Id)")
}

Write-Host "Project PostgreSQL: 127.0.0.1:$PostgresPort (linkflow and linkflow_test)"
Write-Host "Redis: 127.0.0.1:$RedisPort"
Write-Host 'Private database URLs: .local/database.env. Configure server/.env separately; never commit secrets.'
