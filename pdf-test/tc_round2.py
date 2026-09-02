#!/usr/bin/env python3
"""Round 2: re-process the currently broken TC.net resources with improved code."""
import importlib.util, json, os
spec = importlib.util.spec_from_file_location('tc', '/workspace/edutunisie/pdf-test/tunisiecollege_crawler.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# Load targets
with open('/tmp/tc_round2_targets.json') as f:
    targets = json.load(f)
print(f'Round 2 targets: {len(targets)}')

# Load existing progress
progress_file = '/workspace/edutunisie/pdf-test/tc_crawler_progress.json'
progress = json.load(open(progress_file))

ok_count = 0
fail_count = 0
newly_recovered = []

for i, t in enumerate(targets):
    result = m.process_resource(t)
    if result.get('status') == 'ok':
        ok_count += 1
        newly_recovered.append(result)
        print(f'  [{i+1}/{len(targets)}] NID {result["nid"]}: OK - {result["extracted_chars"]}c')
    else:
        fail_count += 1
        if i < 5 or i % 20 == 0:
            print(f'  [{i+1}/{len(targets)}] NID {t["numericId"]}: {result.get("status")}')
    
    if (i+1) % 5 == 0:
        # Save progress incrementally
        for r in newly_recovered:
            if r not in progress['ok']:
                progress['ok'].append(r)
        newly_recovered = []
        json.dump(progress, open(progress_file, 'w'), default=str)

# Final save
for r in newly_recovered:
    if r not in progress['ok']:
        progress['ok'].append(r)
json.dump(progress, open(progress_file, 'w'), default=str)

print(f'\nRound 2 done: {ok_count} newly recovered, {fail_count} still failed')
