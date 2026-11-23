-- ===========================================================================
-- LabLink seed.sql (Supabase path)
-- Two campuses so tenant isolation is demonstrable. Fixed UUIDs keep the seed
-- idempotent. The running demo ships the same shape from src/lib/seed.ts,
-- which also seeds relative dates so the demo never goes stale.
--
-- Apply with:  supabase db reset   (local)  |  psql -f supabase/seed.sql
-- Demo auth users are created by the app's demo-login route, or by signing up
-- with an address on one of the domains below (the trigger maps the campus).
-- ===========================================================================

insert into campuses (id, name, timezone, allowed_email_domains, is_demo)
values
  ('11111111-1111-4111-8111-111111111111', 'NITK Surathkal', 'Asia/Kolkata',
   array['nitk.edu.in'], false),
  ('22222222-2222-4222-8222-222222222222', 'Demo Campus', 'Asia/Kolkata',
   array['demo.lablink.example'], true),
  ('33333333-3333-4333-8333-333333333333', 'Riverside Institute', 'Asia/Kolkata',
   array['riverside.edu.in'], false)
on conflict (id) do nothing;

insert into departments (id, campus_id, name) values
  ('d1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Computer Science'),
  ('d1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Electronics'),
  ('d1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Mechanical'),
  ('d2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Computer Science'),
  ('d2000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Electronics'),
  ('d2000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'Design'),
  ('d3000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'Computer Science')
on conflict (id) do nothing;

insert into labs (id, campus_id, department_id, name, location, available_from, available_to, available_days) values
  ('a1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'd1000000-0000-4000-8000-000000000001', 'Robotics Lab', 'CS Block, Room 204', '09:00', '18:00', '{1,2,3,4,5}'),
  ('a2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   'd2000000-0000-4000-8000-000000000001', 'Robotics Lab', 'CS Block, Room 204', '09:00', '18:00', '{1,2,3,4,5,6}'),
  ('a2000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   'd2000000-0000-4000-8000-000000000002', 'Electronics Lab', 'EC Block, Room 110', '10:00', '17:00', '{1,2,3,4,5}'),
  ('a2000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
   'd2000000-0000-4000-8000-000000000003', 'Fabrication Lab', 'Design Studio, Ground Floor', '09:00', '17:00', '{1,2,3,4,5}')
on conflict (id) do nothing;

insert into equipment (id, campus_id, lab_id, name, category, description, specs_json, tags, requires_certification)
values
  ('e2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   'a2000000-0000-4000-8000-000000000001', 'NVIDIA Jetson Orin Dev Kit', 'Development Kit',
   'Edge AI development kit for vision and robotics coursework.',
   '{"compute":"275 TOPS","ram":"64 GB","camera":"8 MP"}', array['ai','edge','vision'], false),
  ('e2000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   'a2000000-0000-4000-8000-000000000001', 'UR5e Robot Arm', 'Robot Arm',
   'Six-axis collaborative arm, 5 kg payload.',
   '{"payload":"5 kg","reach":"850 mm","axes":"6"}', array['robotics','arm'], true),
  ('e2000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
   'a2000000-0000-4000-8000-000000000001', 'Raspberry Pi 5 Cluster', 'Single Board Computer',
   'Four-node cluster for distributed systems labs.',
   '{"nodes":"4","ram":"8 GB per node","storage":"128 GB NVMe"}', array['cluster','linux'], false),
  ('e2000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222',
   'a2000000-0000-4000-8000-000000000002', 'Rigol DS1054Z Oscilloscope', 'Test Equipment',
   'Four-channel digital oscilloscope, 50 MHz.',
   '{"channels":"4","bandwidth":"50 MHz","sampleRate":"1 GSa/s"}', array['signals','measurement'], false),
  ('e2000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222',
   'a2000000-0000-4000-8000-000000000003', 'Prusa MK4 3D Printer', 'Fabrication',
   'FDM printer with 0.4 mm nozzle and enclosure.',
   '{"buildVolume":"250 x 210 x 220 mm","nozzle":"0.4 mm","materials":"PLA, PETG"}', array['printing','prototype'], false),
  ('e2000000-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222',
   'a2000000-0000-4000-8000-000000000002', 'Basys 3 FPGA Board', 'FPGA',
   'Artix-7 FPGA trainer board for digital design.',
   '{"logicCells":"33,280","io":"16 switches","clock":"100 MHz"}', array['digital','verilog'], false)
on conflict (id) do nothing;

insert into equipment_units (id, campus_id, equipment_id, asset_tag, status) values
  ('u2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'e2000000-0000-4000-8000-000000000001', 'JET-01', 'available'),
  ('u2000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'e2000000-0000-4000-8000-000000000001', 'JET-02', 'available'),
  ('u2000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'e2000000-0000-4000-8000-000000000001', 'JET-03', 'maintenance'),
  ('u2000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'e2000000-0000-4000-8000-000000000002', 'ARM-01', 'available'),
  ('u2000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 'e2000000-0000-4000-8000-000000000003', 'PI-01', 'available'),
  ('u2000000-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222', 'e2000000-0000-4000-8000-000000000004', 'OSC-01', 'available'),
  ('u2000000-0000-4000-8000-000000000007', '22222222-2222-4222-8222-222222222222', 'e2000000-0000-4000-8000-000000000005', 'PRN-01', 'available'),
  ('u2000000-0000-4000-8000-000000000008', '22222222-2222-4222-8222-222222222222', 'e2000000-0000-4000-8000-000000000005', 'PRN-02', 'available'),
  ('u2000000-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222', 'e2000000-0000-4000-8000-000000000006', 'FPGA-01', 'available'),
  ('u2000000-0000-4000-8000-00000000000a', '22222222-2222-4222-8222-222222222222', 'e2000000-0000-4000-8000-000000000006', 'FPGA-02', 'available')
on conflict (id) do nothing;

insert into settings (campus_id, key, value) values
  ('22222222-2222-4222-8222-222222222222', 'weekly_hours_quota', '10'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'cancel_cutoff_hours', '2'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'grace_minutes', '15'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'fairness_weights',
   '{"deadline":0.35,"priority":0.25,"recentUsage":0.20,"hoursEfficiency":0.10,"reliability":0.10}'::jsonb)
on conflict (campus_id, key) do nothing;

-- ---------------------------------------------------------------------------
-- Demo campus people, projects, approved requests and the ready-made conflict.
-- Fixed UUIDs keep this idempotent; dates are relative to now() so the demo
-- never goes stale. Run after 0004 (profiles no longer reference auth.users).
-- ---------------------------------------------------------------------------
insert into profiles (id, campus_id, name, email, role) values
  ('f2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   'Aarav Sharma', 'student@demo.lablink.example', 'student'),
  ('f2000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   'Meera Iyer', 'meera@demo.lablink.example', 'student'),
  ('f2000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
   'Kabir Rao', 'kabir@demo.lablink.example', 'student'),
  ('f2000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222',
   'Zoya Khan', 'zoya@demo.lablink.example', 'student'),
  ('f2000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222',
   'Dr. Nair', 'faculty@demo.lablink.example', 'faculty'),
  ('f2000000-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222',
   'Priya Menon', 'admin@demo.lablink.example', 'campus_admin'),
  ('f1000000-0000-4000-8000-000000000001', null,
   'Platform Admin', 'platform@lablink.example', 'super_admin'),
  ('f3000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333',
   'Riverside Student', 'student@riverside.edu.in', 'student')
on conflict (id) do nothing;

insert into projects (id, campus_id, student_id, faculty_id, title, description, deadline)
values
  ('b1000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000005',
   'Rover vision stack', 'Edge inference for the autonomous rover demo.',
   now() + interval '6 days'),
  ('b1000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   'f2000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000005',
   'Gesture control rig', 'Camera pipeline for the haptics project.',
   now() + interval '12 days'),
  ('b1000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
   'f2000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000005',
   'Multi-camera capture', 'Synchronised capture for the sports analytics study.',
   now() + interval '4 days'),
  ('b1000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222',
   'f2000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000005',
   'Line-following benchmark', 'Benchmarking the edge kit against the older board.',
   now() + interval '9 days')
on conflict (id) do nothing;

-- 14 requested hours against two available units inside a three-day window.
insert into access_requests
  (id, campus_id, project_id, equipment_id, hours_needed, window_start, window_end,
   justification, status, priority)
values
  ('c1000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   'b1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 4,
   date_trunc('day', now()) + interval '1 day 9 hours',
   date_trunc('day', now()) + interval '3 days 18 hours',
   'Training and evaluation of the vision model before the demo.', 'approved', 'high'),
  ('c1000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   'b1000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 4,
   date_trunc('day', now()) + interval '1 day 9 hours',
   date_trunc('day', now()) + interval '3 days 18 hours',
   'Camera capture for the gesture dataset.', 'approved', 'normal'),
  ('c1000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
   'b1000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', 3,
   date_trunc('day', now()) + interval '1 day 9 hours',
   date_trunc('day', now()) + interval '3 days 18 hours',
   'Synchronised capture session.', 'approved', 'normal'),
  ('c1000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222',
   'b1000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000001', 3,
   date_trunc('day', now()) + interval '1 day 9 hours',
   date_trunc('day', now()) + interval '3 days 18 hours',
   'Benchmark runs on the edge kit.', 'approved', 'low')
on conflict (id) do nothing;

insert into conflicts (id, campus_id, equipment_id, window_start, window_end, request_ids, status)
values
  ('cf000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   'e2000000-0000-4000-8000-000000000001',
   date_trunc('day', now()) + interval '1 day 9 hours',
   date_trunc('day', now()) + interval '3 days 18 hours',
   array['c1000000-0000-4000-8000-000000000001',
         'c1000000-0000-4000-8000-000000000002',
         'c1000000-0000-4000-8000-000000000003',
         'c1000000-0000-4000-8000-000000000004']::uuid[],
   'open')
on conflict (id) do nothing;
