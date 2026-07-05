import sqlite3
conn = sqlite3.connect(r'C:\Users\watts\AppData\Roaming\com.watts.github-graph-browser\app.db')
c = conn.cursor()
c.execute("SELECT id, subject_id, repository_id FROM simulator_events WHERE metadata_json LIKE '%28630872847%'")
rows = c.fetchall()
for row in rows:
    print("simulator_events:", row)

c.execute("SELECT source_type, source_id, repository_id FROM analytics_records WHERE payload_json LIKE '%28630872847%'")
rows = c.fetchall()
for row in rows:
    print("analytics_records:", row)

conn.close()
