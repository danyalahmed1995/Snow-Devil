import sqlite3
import json

conn = sqlite3.connect(r'C:\Users\watts\AppData\Roaming\com.watts.github-graph-browser\app.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute("SELECT * FROM analytics_records WHERE repository_id LIKE '%Snow-Devil%' AND source_type IN ('pull_request', 'current_pull_request')")
rows = cur.fetchall()
for r in rows:
    data = json.loads(r['payload_json'])
    number = data.get('number', -1)
    if number == 9:
        print(f"Record row_id={r['id']} source_id={r['source_id']} repo={r['repository_id']} type={r['source_type']} number={number}")
        print(" state:", data.get('state'))
        print(" draft:", data.get('draft'))
        print(" mergeStateStatus:", data.get('mergeable_state')) # Wait, mergeable_state might be REST API
