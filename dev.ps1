Write-Host "=============================" -ForegroundColor Cyan
Write-Host "  CatHeadTab Dev Server      " -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[Note] 数据库依赖：" -ForegroundColor Yellow
Write-Host "请确保本地已经运行了 PostgreSQL 并在 5432 端口监听。" -ForegroundColor Yellow
Write-Host "如果没有本地 PostgreSQL，可以使用 docker 仅启动数据库：" -ForegroundColor White
Write-Host "docker-compose up -d catheadtab-db" -ForegroundColor Gray
Write-Host ""

# Load .env file
$envFile = Join-Path $PSScriptRoot ".env"
$envVars = @{}
if (Test-Path $envFile) {
    Write-Host "=> 加载环境变量: $envFile" -ForegroundColor Magenta
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        # Skip empty lines and comments
        if ($line -and -not $line.StartsWith("#")) {
            $eqIdx = $line.IndexOf("=")
            if ($eqIdx -gt 0) {
                $key = $line.Substring(0, $eqIdx).Trim()
                $val = $line.Substring($eqIdx + 1).Trim()
                $envVars[$key] = $val
                [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
                Write-Host "   $key = $val" -ForegroundColor DarkGray
            }
        }
    }
    Write-Host ""
} else {
    Write-Host "[Warn] 未找到 .env 文件，将使用程序内置默认值。" -ForegroundColor Yellow
    Write-Host "       可复制 .env.example 为 .env 并修改配置。" -ForegroundColor Yellow
    Write-Host ""
}

# Build env setting commands for the backend subprocess
$envSetCmd = ""
foreach ($kv in $envVars.GetEnumerator()) {
    $envSetCmd += "`$env:$($kv.Key)='$($kv.Value)'; "
}

# Start Go Backend
Write-Host "=> 启动 Go 后端..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit -Command `"`$host.ui.RawUI.WindowTitle='CatHeadTab Backend'; cd backend; ${envSetCmd}go run ./cmd/server/main.go`""

# Start React Frontend
Write-Host "=> 启动 React 前端..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit -Command `"`$host.ui.RawUI.WindowTitle='CatHeadTab Frontend'; cd frontend; npm run dev`""

Write-Host ""
Write-Host "=> 前后端已经分别在两个新窗口中启动！" -ForegroundColor Cyan
Write-Host "=> Frontend URL: http://localhost:5173" -ForegroundColor White
Write-Host "=> Backend API:  http://localhost:8080" -ForegroundColor White
Write-Host "=> 若要停止，直接关闭弹出的两个 PowerShell 窗口即可。" -ForegroundColor White
