-- Dev seed: a handful of real Austin pickleball/basketball venues so the map
-- has pins from the first `supabase db reset`. Coordinates are approximate
-- park centroids (which is also the §8 fuzzing rule).

insert into venues (name, sports, location, address, court_count, source, verified) values
  ('Austin Pickle Ranch', '{pickleball}', st_point(-97.7431, 30.4021)::geography, 'Austin, TX', 32, 'admin', true),
  ('South Austin Rec Center', '{pickleball,basketball}', st_point(-97.7723, 30.2415)::geography, '1100 Cumberland Rd, Austin, TX', 6, 'admin', true),
  ('Mueller Lake Park Courts', '{pickleball,basketball}', st_point(-97.7050, 30.2996)::geography, '4550 Mueller Blvd, Austin, TX', 4, 'admin', true),
  ('Pan Am Park', '{basketball}', st_point(-97.7266, 30.2609)::geography, '2100 E 3rd St, Austin, TX', 2, 'admin', true),
  ('Lady Bird Lake Trail — Auditorium Shores', '{running}', st_point(-97.7522, 30.2620)::geography, 'Austin, TX', null, 'admin', true);
