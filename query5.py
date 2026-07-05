import sqlite3
import json
conn = sqlite3.connect(r'C:\Users\watts\AppData\Roaming\com.watts.github-graph-browser\app.db')
c = conn.cursor()
c.execute("SELECT source_type, source_id, repository_id FROM analytics_records WHERE source_type = 'workflow_run'")
rows = c.fetchall()
for row in rows:
    print(row)
conn.close()
