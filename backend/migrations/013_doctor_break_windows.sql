alter table doctors
  add column if not exists break_windows jsonb not null default '[]'::jsonb;

update doctors
   set break_windows = '[{"label":"Morning break","startTime":"10:30","endTime":"11:00"}]'::jsonb
 where id = 'doc-anaya-sharma'
   and break_windows = '[]'::jsonb;

update doctors
   set break_windows = '[{"label":"Meal break","startTime":"13:30","endTime":"14:00"}]'::jsonb
 where id = 'doc-rohan-mehta'
   and break_windows = '[]'::jsonb;

update doctors
   set break_windows = '[{"label":"Lunch break","startTime":"13:00","endTime":"14:00"}]'::jsonb
 where id = 'doc-meera-iqbal'
   and break_windows = '[]'::jsonb;

update doctors
   set break_windows = '[{"label":"Lunch break","startTime":"12:30","endTime":"13:30"}]'::jsonb
 where id = 'doc-vivek-menon'
   and break_windows = '[]'::jsonb;

update doctors
   set break_windows = '[{"label":"Reporting break","startTime":"12:30","endTime":"13:00"}]'::jsonb
 where id = 'doc-neha-sen'
   and break_windows = '[]'::jsonb;

update doctors
   set break_windows = '[{"label":"Break","startTime":"12:00","endTime":"13:00"}]'::jsonb
 where id = 'doc-kiran-iyer'
   and break_windows = '[]'::jsonb;

update doctors
   set break_windows = '[{"label":"Evening break","startTime":"15:30","endTime":"16:00"}]'::jsonb
 where id = 'doc-arjun-roy'
   and break_windows = '[]'::jsonb;
