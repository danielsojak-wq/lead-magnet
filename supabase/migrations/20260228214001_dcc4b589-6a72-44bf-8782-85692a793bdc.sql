
UPDATE client_data_sources
SET config = '{"qualified_column": 6, "columns": {"submissionId": 0, "date": 1, "firstName": 2, "phone": 5, "qualified": 6}}'::jsonb
WHERE client_id = '3fceec2a-3110-4bb6-95f1-85c650a35878'
  AND source_type = 'leads';
