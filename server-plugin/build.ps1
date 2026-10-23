# Сборка плагина без Gradle: javac против jar сервера Paper.
# Запуск: powershell -File server-plugin\build.ps1 [-Install]
param([switch]$Install)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$server = 'D:\Daler\mc-server'
$jdk = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot\bin'
# Bukkit/Paper API в Paper 1.21.1 лежит в libraries (paper-mojangapi), туда же — Adventure и прочее
$paper = (Get-ChildItem (Join-Path $server 'libraries') -Recurse -Filter *.jar | ForEach-Object FullName) -join ';'
# API плагинов для мягких зависимостей (ранги, баланс, кланы)
foreach ($p in 'LuckPerms-*.jar', 'Vault-*.jar', 'SimpleClans-*.jar') {
  $jar = Get-ChildItem (Join-Path $server 'plugins') -Filter $p | Select-Object -First 1
  if ($jar) { $paper += ';' + $jar.FullName }
}
$out = Join-Path $root 'build'

Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $out 'classes') | Out-Null
# Список исходников через argfile: так пути с двоеточием не ломаются в PowerShell 5.1
$list = Join-Path $out 'sources.txt'
Get-ChildItem (Join-Path $root 'src\main\java') -Recurse -Filter *.java |
  ForEach-Object { '"' + ($_.FullName -replace '\\', '/') + '"' } |
  Set-Content -Encoding ascii $list
& "$jdk\javac.exe" --release 21 -proc:none -encoding UTF-8 -cp $paper -d (Join-Path $out 'classes') "@$list"
if ($LASTEXITCODE -ne 0) { throw 'javac failed' }
Copy-Item (Join-Path $root 'src\main\resources\*') (Join-Path $out 'classes') -Recurse
$jar = Join-Path $out 'DLauncherSkins.jar'
& "$jdk\jar.exe" --create --file $jar -C (Join-Path $out 'classes') .
if ($LASTEXITCODE -ne 0) { throw 'jar failed' }
Write-Output "built $jar"
if ($Install) {
  Copy-Item $jar (Join-Path $server 'plugins\DLauncherSkins.jar') -Force
  Write-Output 'installed into mc-server/plugins'
}
