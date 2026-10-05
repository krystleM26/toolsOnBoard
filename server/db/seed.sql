-- Starting data. ON CONFLICT / NOT EXISTS make this safe to re-run.

INSERT INTO credential_types (name, description) VALUES
  ('CPR Certification', 'Current CPR card'),
  ('Driver''s License', 'Valid state driver''s license'),
  ('TB Test', 'Tuberculosis test results'),
  ('Car Insurance', 'Proof of current auto insurance')
ON CONFLICT (name) DO NOTHING;

INSERT INTO checklist_tasks (title, description, sort_order)
SELECT * FROM (VALUES
  ('Complete your profile', 'Add your phone number and start date.', 1),
  ('Upload required documents', 'CPR, driver''s license, TB test and car insurance.', 2),
  ('Sign employee handbook', 'Read and acknowledge the employee handbook.', 3),
  ('Submit tax forms', 'Fill out your W-4 and state withholding forms.', 4),
  ('Set up direct deposit', 'Provide your bank details to payroll.', 5)
) AS t(title, description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM checklist_tasks);
