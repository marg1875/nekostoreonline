@echo off
cd /d "%~dp0"
echo Subiendo cambios de nekostoreonline...
git add -A
git commit -m "Actualizacion manual desde .bat"
git push
echo.
echo Listo. Cierra esta ventana o presiona una tecla.
pause >nul
