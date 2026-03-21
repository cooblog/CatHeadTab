Write-Host "=============================" -ForegroundColor Cyan
Write-Host "  CatHeadTab Dev Server      " -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[Note] 数据库依赖：" -ForegroundColor Yellow
Write-Host "请确保本地已经运行了 PostgreSQL 并在 5432 端口监听。" -ForegroundColor Yellow
Write-Host "如果没有本地 PostgreSQL，可以使用 docker 仅启动数据库：" -ForegroundColor White
Write-Host "docker-compose up -d catheadtab-db" -ForegroundColor Gray
Write-Host ""

# Start Go Backend
Write-Host "=> 启动 Go 后端..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit -Command `"`$host.ui.RawUI.WindowTitle='CatHeadTab Backend'; cd backend; go run ./cmd/server/main.go`""

# Start React Frontend
Write-Host "=> 启动 React 前端..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit -Command `"`$host.ui.RawUI.WindowTitle='CatHeadTab Frontend'; cd frontend; npm run dev`""

Write-Host ""
Write-Host "=> 前后端已经分别在两个新窗口中启动！" -ForegroundColor Cyan
Write-Host "=> Frontend URL: http://localhost:5173" -ForegroundColor White
Write-Host "=> Backend API:  http://localhost:8080" -ForegroundColor White
Write-Host "=> 若要停止，直接关闭弹出的两个 PowerShell 窗口即可。" -ForegroundColor White
