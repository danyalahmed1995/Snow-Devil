import sqlite3

conn = sqlite3.connect(r'C:\Users\watts\AppData\Roaming\com.watts.github-graph-browser\app.db')
c = conn.cursor()
c.execute("SELECT source_type, source_id, repository_id, updated_at, json_extract(payload_json, '$.status') as status, json_extract(payload_json, '$.run_started_at') as run_started_at, json_extract(payload_json, '$.created_at') as created_at FROM analytics_records WHERE source_id LIKE '%28630872847%'")
rows = c.fetchall()
for row in rows:
    print(row)

print("ALL SNOW-DEVIL RUNS:")
c.execute("SELECT source_id, repository_id FROM analytics_records WHERE source_type = 'workflow_run' AND repository_id LIKE '%snow-devil%' LIMIT 10")
for row in c.fetchall():
    print(row)

conn.close()
