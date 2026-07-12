#!/bin/bash
cd /home/z/my-project
exec npx vite dev --port 3000 --host 2>&1 | tee dev.log