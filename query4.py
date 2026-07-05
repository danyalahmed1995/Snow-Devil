import sqlite3
import json
conn = sqlite3.connect(r'C:\Users\watts\AppData\Roaming\com.watts.github-graph-browser\app.db')
c = conn.cursor()
c.execute("SELECT source_type, source_id, repository_id, payload_json FROM analytics_records WHERE repository_id LIKE '%snow-devil%' AND source_type = 'workflow_run'")
rows = c.fetchall()
print(f"Found {len(rows)} workflow runs for snow-devil")
for row in rows[:5]:
    try:
        data = json.loads(row[3])
        print(row[0], row[1], row[2], data.get('id'), data.get('run_number'))
    except:
        print(row[0], row[1], row[2])
conn.close()
