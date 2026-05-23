-- Default location
INSERT INTO locations (id, name, address, temi_serial)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Nanta Tech Limited HQ',
  'Main Office, Ground Floor',
  '00126040079'
) ON CONFLICT DO NOTHING;

-- Default admin user (password: Admin@123)
-- bcrypt hash of 'Admin@123'
INSERT INTO users (email, password_hash, name, role, department, location_id)
VALUES (
  'admin@vms.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN9/9yf7PxEExampleHash1',
  'System Administrator',
  'admin',
  'IT',
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (email) DO NOTHING;

-- Register Temi robot
INSERT INTO temi_robots (serial_number, name, location_id)
VALUES (
  '00126040079',
  'Temi Receptionist',
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (serial_number) DO NOTHING;
