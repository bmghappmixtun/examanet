#!/bin/bash
# Wrapper to run bulk scripts with the persistent venv
cd /workspace/edutunisie/pdf-test
exec ./venv/bin/python -u bulk_remaining.py "$@"
