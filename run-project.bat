@echo off

echo Starting Backend...
start cmd /k "cd /d D:\VARUN\Projects\product_configurator\product_configurator\backend && call myenv\Scripts\activate && python server.py"

echo Starting Frontend...
start cmd /k "cd /d D:\VARUN\Projects\product_configurator\product_configurator\frontend && npm start"

echo Both services launched.