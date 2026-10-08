-- Requires the base demo dataset from supabase/seed.sql (demo users incl. anna.pm 10000002, client 20000001). Local/demo databases only - the production DB was wiped of demo data and must not get this.
-- ===== CRM demo (prefixes: c1 clients, c2 contacts, c3 deals, c4 offers) =====
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('10000007-0000-4000-8000-000000000007','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'sara.sales@pmcms.local', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Sara Müük"}'::jsonb, now(), now(), '', '', '', '')
on conflict (id) do nothing;
update public.user_profiles set status='active', approved_at=now() where id='10000007-0000-4000-8000-000000000007';
insert into public.user_roles (user_id, role_key) values
  ('10000007-0000-4000-8000-000000000007','member'),
  ('10000007-0000-4000-8000-000000000007','sales'),
  ('10000002-0000-4000-8000-000000000002','sales')   -- anna.pm also sells
on conflict do nothing;

insert into public.clients (id, name, reg_code, phone, email, website) values
  ('c1000001-0000-4000-8000-000000000001','Nordic Timber AS','10293847','+372 600 1001','info@nordictimber.ee','https://nordictimber.ee'),
  ('c1000002-0000-4000-8000-000000000002','Tallinn Dental Group OÜ','14455667','+372 600 1002','hello@tdg.ee','https://tdg.ee'),
  ('c1000003-0000-4000-8000-000000000003','Kalev Logistics AS','10566778','+372 600 1003','sales@kalevlog.ee','https://kalevlog.ee'),
  ('c1000004-0000-4000-8000-000000000004','Saare Energy OÜ','16677889',null,'contact@saare.energy','https://saare.energy'),
  ('c1000005-0000-4000-8000-000000000005','Peipsi Foods AS','10788990','+372 600 1005',null,null)
on conflict (id) do nothing;

insert into public.client_contacts (id, client_id, name, first_name, last_name, gender, email, phone, role, description) values
  ('c2000001-0000-4000-8000-000000000001','c1000001-0000-4000-8000-000000000001','','Kristjan','Mets','male','kristjan@nordictimber.ee','+372 5100 0001','CEO','Decision maker'),
  ('c2000002-0000-4000-8000-000000000002','c1000001-0000-4000-8000-000000000001','','Liis','Kask','female','liis@nordictimber.ee','+372 5100 0002','Marketing lead',null),
  ('c2000003-0000-4000-8000-000000000003','c1000002-0000-4000-8000-000000000002','','Kadri','Lepp','female','kadri@tdg.ee','+372 5100 0003','COO','Prefers email'),
  ('c2000004-0000-4000-8000-000000000004','c1000003-0000-4000-8000-000000000003','','Andres','Saar','male','andres@kalevlog.ee','+372 5100 0004','IT manager',null),
  ('c2000005-0000-4000-8000-000000000005','c1000004-0000-4000-8000-000000000004','','Eva','Rebane','female','eva@saare.energy','+372 5100 0005','Founder',null),
  ('c2000006-0000-4000-8000-000000000006','c1000005-0000-4000-8000-000000000005','','Toomas','Kuusk','male',null,'+372 5100 0006','Procurement',null)
on conflict (id) do nothing;

insert into public.deals (id, client_id, title, stage, source, owner_id, lost_reason, created_at) values
  ('c3000001-0000-4000-8000-000000000001','c1000001-0000-4000-8000-000000000001','B2B ordering portal','negotiation','inbound','10000007-0000-4000-8000-000000000007', null, now() - interval '70 days'),
  ('c3000002-0000-4000-8000-000000000002','c1000001-0000-4000-8000-000000000001','Website refresh','offer_sent','existing_client','10000007-0000-4000-8000-000000000007', null, now() - interval '30 days'),
  ('c3000003-0000-4000-8000-000000000003','c1000002-0000-4000-8000-000000000002','Patient booking app','contacted','referral','10000002-0000-4000-8000-000000000002', null, now() - interval '20 days'),
  ('c3000004-0000-4000-8000-000000000004','c1000003-0000-4000-8000-000000000003','Fleet tracking dashboard','new','outbound','10000007-0000-4000-8000-000000000007', null, now() - interval '5 days'),
  ('c3000005-0000-4000-8000-000000000005','c1000004-0000-4000-8000-000000000004','Customer portal MVP','offer_sent','event','10000002-0000-4000-8000-000000000002', null, now() - interval '40 days'),
  ('c3000006-0000-4000-8000-000000000006','c1000005-0000-4000-8000-000000000005','ERP integration','lost','inbound','10000007-0000-4000-8000-000000000007', 'Chose a cheaper local vendor', now() - interval '90 days'),
  ('c3000007-0000-4000-8000-000000000007','c1000003-0000-4000-8000-000000000003','Warehouse scanner app','new','inbound','10000007-0000-4000-8000-000000000007', null, now() - interval '2 days'),
  ('c3000008-0000-4000-8000-000000000008','20000001-0000-4000-8000-000000000001','Loyalty app phase 2','won','existing_client','10000002-0000-4000-8000-000000000002', null, now() - interval '60 days'),
  ('c3000009-0000-4000-8000-000000000009','c1000002-0000-4000-8000-000000000002','SEO retainer','negotiation','outbound','10000007-0000-4000-8000-000000000007', null, now() - interval '50 days'),
  ('c3000010-0000-4000-8000-000000000010','c1000004-0000-4000-8000-000000000004','Data warehouse audit','contacted','other','10000007-0000-4000-8000-000000000007', null, now() - interval '10 days')
on conflict (id) do nothing;

insert into public.offers (id, deal_id, title, amount, sent_on, valid_until, status, link_url, note) values
  ('c4000001-0000-4000-8000-000000000001','c3000001-0000-4000-8000-000000000001','v1 – full scope',48000, current_date - 40, current_date - 10,'rejected','https://drive.google.com/demo-v1',null),
  ('c4000002-0000-4000-8000-000000000002','c3000001-0000-4000-8000-000000000001','v2 – phased',36000, current_date - 9, current_date + 21,'sent','https://drive.google.com/demo-v2','Phase 1 only'),
  ('c4000003-0000-4000-8000-000000000003','c3000002-0000-4000-8000-000000000002','Website refresh',14500, current_date - 3, current_date + 27,'sent',null,null),
  ('c4000004-0000-4000-8000-000000000004','c3000005-0000-4000-8000-000000000005','Portal MVP',52000, current_date - 15, current_date + 15,'sent',null,null),
  ('c4000005-0000-4000-8000-000000000005','c3000006-0000-4000-8000-000000000006','ERP integration',30000, current_date - 80, current_date - 50,'rejected',null,null),
  ('c4000006-0000-4000-8000-000000000006','c3000008-0000-4000-8000-000000000008','Phase 2',41000, current_date - 45, current_date - 15,'accepted',null,null),
  ('c4000007-0000-4000-8000-000000000007','c3000009-0000-4000-8000-000000000009','SEO 12-month',18000, null, null,'draft',null,'Waiting on scope')
on conflict (id) do nothing;
update public.deals set won_at = now() - interval '3 days' where id = 'c3000008-0000-4000-8000-000000000008';

insert into public.crm_activities (client_id, deal_id, contact_id, kind, body, occurred_at, actor_id)
select v.client_id::uuid, v.deal_id::uuid, v.contact_id::uuid, v.kind::public.activity_kind, v.body, now() - (v.days_ago || ' days')::interval, v.actor::uuid
from (values
  ('c1000001-0000-4000-8000-000000000001','c3000001-0000-4000-8000-000000000001','c2000001-0000-4000-8000-000000000001','call','Intro call — they want ordering online before spring.', 68,'10000007-0000-4000-8000-000000000007'),
  ('c1000001-0000-4000-8000-000000000001','c3000001-0000-4000-8000-000000000001','c2000001-0000-4000-8000-000000000001','meeting','Workshop at their office, mapped 14 order flows.', 55,'10000007-0000-4000-8000-000000000007'),
  ('c1000001-0000-4000-8000-000000000001','c3000001-0000-4000-8000-000000000001','c2000001-0000-4000-8000-000000000001','email','Kristjan: v1 too expensive, asked for phased option.', 12,'10000007-0000-4000-8000-000000000007'),
  ('c1000001-0000-4000-8000-000000000001','c3000002-0000-4000-8000-000000000002','c2000002-0000-4000-8000-000000000002','email','Liis sent brand guidelines.', 4,'10000007-0000-4000-8000-000000000007'),
  ('c1000002-0000-4000-8000-000000000002','c3000003-0000-4000-8000-000000000003','c2000003-0000-4000-8000-000000000003','call','Referred by Baltic Retail. Booking app for 6 clinics.', 18,'10000002-0000-4000-8000-000000000002'),
  ('c1000002-0000-4000-8000-000000000002','c3000009-0000-4000-8000-000000000009','c2000003-0000-4000-8000-000000000003','note','Budget approval expected end of month.', 7,'10000007-0000-4000-8000-000000000007'),
  ('c1000003-0000-4000-8000-000000000003','c3000004-0000-4000-8000-000000000004','c2000004-0000-4000-8000-000000000004','email','Cold email sent with fleet dashboard case study.', 5,'10000007-0000-4000-8000-000000000007'),
  ('c1000004-0000-4000-8000-000000000004','c3000005-0000-4000-8000-000000000005','c2000005-0000-4000-8000-000000000005','meeting','Met at Latitude59, demoed portal concept.', 38,'10000002-0000-4000-8000-000000000002'),
  ('c1000005-0000-4000-8000-000000000005','c3000006-0000-4000-8000-000000000006','c2000006-0000-4000-8000-000000000006','call','Toomas confirmed they went with another vendor.', 30,'10000007-0000-4000-8000-000000000007')
) as v(client_id, deal_id, contact_id, kind, body, days_ago, actor);

insert into public.crm_activities (id, client_id, deal_id, contact_id, kind, body, status, due_on, assignee_id, actor_id, created_at) values
  ('c5000001-0000-4000-8000-000000000001','c1000001-0000-4000-8000-000000000001','c3000001-0000-4000-8000-000000000001','c2000001-0000-4000-8000-000000000001','call','Call Kristjan about the phased v2 offer','planned', current_date - 2,'10000007-0000-4000-8000-000000000007','10000007-0000-4000-8000-000000000007', now() - interval '9 days'),
  ('c5000002-0000-4000-8000-000000000002','c1000001-0000-4000-8000-000000000001','c3000002-0000-4000-8000-000000000002','c2000002-0000-4000-8000-000000000002','email','Send Liis the homepage wireframes','planned', current_date,'10000007-0000-4000-8000-000000000007','10000007-0000-4000-8000-000000000007', now() - interval '3 days'),
  ('c5000003-0000-4000-8000-000000000003','c1000002-0000-4000-8000-000000000002','c3000003-0000-4000-8000-000000000003','c2000003-0000-4000-8000-000000000003','meeting','Demo booking flow to Kadri','planned', current_date + 1,'10000002-0000-4000-8000-000000000002','10000002-0000-4000-8000-000000000002', now() - interval '5 days'),
  ('c5000004-0000-4000-8000-000000000004','c1000003-0000-4000-8000-000000000003','c3000004-0000-4000-8000-000000000004','c2000004-0000-4000-8000-000000000004','call','Follow up on the cold email','planned', current_date + 5,'10000007-0000-4000-8000-000000000007','10000007-0000-4000-8000-000000000007', now() - interval '2 days'),
  ('c5000005-0000-4000-8000-000000000005','c1000004-0000-4000-8000-000000000004','c3000005-0000-4000-8000-000000000005','c2000005-0000-4000-8000-000000000005','call','Ask Eva for feedback on the portal offer','planned', current_date + 12,'10000002-0000-4000-8000-000000000002','10000002-0000-4000-8000-000000000002', now() - interval '6 days'),
  ('c5000006-0000-4000-8000-000000000006','c1000002-0000-4000-8000-000000000002','c3000009-0000-4000-8000-000000000009','c2000003-0000-4000-8000-000000000003','email','Chase SEO budget approval','planned', current_date - 6,'10000002-0000-4000-8000-000000000002','10000007-0000-4000-8000-000000000007', now() - interval '12 days'),
  ('c5000007-0000-4000-8000-000000000007','c1000005-0000-4000-8000-000000000005', null,'c2000006-0000-4000-8000-000000000006','call','Check in with Toomas — new year budget?','planned', current_date + 30,'10000007-0000-4000-8000-000000000007','10000007-0000-4000-8000-000000000007', now() - interval '1 day')
on conflict (id) do nothing;

-- a few completed steps with comments
insert into public.crm_activities (id, client_id, deal_id, contact_id, kind, body, status, occurred_at, due_on, assignee_id, actor_id, done_at, done_by, done_comment) values
  ('c5000009-0000-4000-8000-000000000009','c1000001-0000-4000-8000-000000000001','c3000001-0000-4000-8000-000000000001','c2000001-0000-4000-8000-000000000001','call','Call Kristjan after v1 rejection','done', now() - interval '20 days', current_date - 20,'10000007-0000-4000-8000-000000000007','10000007-0000-4000-8000-000000000007', now() - interval '19 days','10000007-0000-4000-8000-000000000007','He wants a phased approach, sending v2'),
  ('c5000010-0000-4000-8000-000000000010','c1000002-0000-4000-8000-000000000002','c3000003-0000-4000-8000-000000000003','c2000003-0000-4000-8000-000000000003','email','Send intro deck to Kadri','done', now() - interval '15 days', current_date - 15,'10000002-0000-4000-8000-000000000002','10000002-0000-4000-8000-000000000002', now() - interval '14 days','10000002-0000-4000-8000-000000000002','Sent, she will share with the clinic owners')
on conflict (id) do nothing;

-- one company with no deals, only a next step
insert into public.clients (id, name, reg_code, phone, email, website) values
  ('c1000006-0000-4000-8000-000000000006','Viru Hotels OÜ','12998877','+372 600 1006','info@viruhotels.ee','https://viruhotels.ee')
on conflict (id) do nothing;
insert into public.client_contacts (id, client_id, name, first_name, last_name, gender, email, phone, role) values
  ('c2000008-0000-4000-8000-000000000008','c1000006-0000-4000-8000-000000000006','','Marta','Kuusik','female','marta@viruhotels.ee','+372 5100 0008','Marketing manager')
on conflict (id) do nothing;
insert into public.crm_activities (id, client_id, contact_id, kind, body, status, due_on, assignee_id, actor_id) values
  ('c5000008-0000-4000-8000-000000000008','c1000006-0000-4000-8000-000000000006','c2000008-0000-4000-8000-000000000008','call','Intro call — booking engine needs','planned', current_date + 3,'10000007-0000-4000-8000-000000000007','10000007-0000-4000-8000-000000000007')
on conflict (id) do nothing;
