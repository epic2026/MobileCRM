-- Backfill tenant_id on lead_activities and lead_tasks from their parent lead.
-- Fixes records created via ARIA (before fix) and TasksPanel (always missing).

UPDATE lead_activities a
SET    tenant_id = l.tenant_id
FROM   leads l
WHERE  a.lead_id    = l.id
  AND  a.tenant_id  IS NULL
  AND  l.tenant_id  IS NOT NULL;

UPDATE lead_tasks t
SET    tenant_id = l.tenant_id
FROM   leads l
WHERE  t.lead_id    = l.id
  AND  t.tenant_id  IS NULL
  AND  l.tenant_id  IS NOT NULL;
