$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /utf8output /codepage:65001 /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Core.dll "/win32icon:$PSScriptRoot\money.ico" "/out:$projectRoot\财富经一键启动.exe" "$PSScriptRoot\Launcher.cs" "$PSScriptRoot\GitUpdateBackup.cs"
if ($LASTEXITCODE -ne 0) { throw '启动器编译失败。' }
Write-Output "已生成：$projectRoot\财富经一键启动.exe"
