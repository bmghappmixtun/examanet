#!/usr/bin/env python3
import importlib.util, json, os
spec = importlib.util.spec_from_file_location('tc', '/workspace/edutunisie/pdf-test/tunisiecollege_crawler.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# Load retry targets
with open('/tmp/tc_retry_targets.json') as f:
    targets = json.load(f)

# Load existing progress
progress_file = '/workspace/edutunisie/pdf-test/tc_crawler_progress.json'
progress = json.load(open(progress_file))

# Filter to only no_match
todo = [t for t in targets if str(t['numericId']) in progress['errors']]

print(f'Retrying {len(todo)} no_match targets')

ok_count = 0
fail_count = 0
for i, t in enumerate(todo):
    result = m.process_resource(t)
    if result.get('status') == 'ok':
        # Remove from errors, add to ok
        del progress['errors'][str(t['numericId'])]
        progress['ok'].append(result)
        ok_count += 1
        print(f'  [{i+1}/{len(todo)}] NID {result["nid"]}: OK - {result["extracted_chars"]}c')
    else:
        fail_count += 1
        print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: {result.get("status")}')
    
    if (i+1) % 10 == 0:
        with open(progress_file, 'w') as f:
            json.dump(progress, f)

with open(progress_file, 'w') as f:
    json.dump(progress, f)

print(f'\nRetry done: {ok_count} recovered, {fail_count} still failed')
