import json
import io
import urllib.request
from pypdf import PdfReader

# Load results
with open('/tmp/pagecount_results.json') as f:
    results = json.load(f)

# Get the failed ones
failed = [r for r in results if r['err']]
print(f'Failed: {len(failed)}')
for f in failed:
    print(f'  #{f["num"]}: {f["err"]}')

# Find the file keys for these
import subprocess
result = subprocess.run(
    ['node', '-e', f'''
require('dotenv').config({{ path: "/workspace/edutunisie/.env.local" }});
const {{ PrismaClient }} = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({{ log: ['error'] }});
(async () => {{
  const files = await p.$queryRaw`SELECT r.id, r."numericId" as num, r."fileKey" as key FROM "Resource" r WHERE r."numericId" IN ({','.join(str(f['num']) for f in failed)})`;
  console.log(JSON.stringify(files));
  await p.$disconnect();
}})();
'''],
    capture_output=True, text=True
)
import re
out = result.stdout
idx = out.find('[')
if idx > 0:
    out = out[idx:]
files = json.loads(out)
print(f'Files: {len(files)}')

TOKEN = 'devmanet-bulk-2026'

for f in files:
    url = f'https://examanet.com/api/blob-teacher/{f["key"]}'
    try:
        req = urllib.request.Request(url, headers={'x-internal-token': TOKEN})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        print(f'#{f["num"]}: {len(data)} bytes, first 4: {data[:4]!r}')
        if data[:4] == b'%PDF':
            reader = PdfReader(io.BytesIO(data))
            print(f'  Pages: {len(reader.pages)}')
    except Exception as e:
        print(f'#{f["num"]}: ERROR {e}')
