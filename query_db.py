import sqlite3
import json

conn = sqlite3.connect(r'C:\Users\watts\AppData\Roaming\com.watts.github-graph-browser\app.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
print('Tables:', [r['name'] for r in cur.fetchall()])

cur.execute("SELECT * FROM simulator_events WHERE repository_owner = 'danyalahmed1995' AND repository_name = 'Snow-Devil' AND subject_number = 9")
rows = cur.fetchall()
print(f"Found {len(rows)} rows for PR 9")
for r in rows:
    print(dict(r))

cur.execute("SELECT * FROM simulator_events WHERE repository_id LIKE '%Snow-Devil%' AND subject_number = 9")
rows = cur.fetchall()
print(f"Found {len(rows)} rows for PR 9 using LIKE")
for r in rows:
    print(dict(r))

cur.execute("SELECT * FROM analytics_records WHERE repository_id LIKE '%Snow-Devil%' AND payload_json LIKE '%\"number\":9%'")
rows = cur.fetchall()
print(f"Found {len(rows)} analytics_records for PR 9")
for r in rows:
    print(r['repository_id'], r['source_type'], r['source_id'], r['updated_at'])
