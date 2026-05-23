/**
 * Run once to seed real employee accounts.
 * Usage: node add-employees.js
 */
require('dotenv').config({ path: __dirname + '/.env' });
const bcrypt = require('bcryptjs');
const { sequelize, User } = require('./src/models');

const LOCATION_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_PASSWORD = 'Employee@123';

const employees = [
  { name: 'Vraj Prajapati',    email: 'vraj@nanta.tech',    department: 'Engineering',  desk_location: 'Software Room',    role: 'employee' },
  { name: 'Mayank Shah',       email: 'mayank@nanta.tech',  department: 'Management',   desk_location: 'Director Office',  role: 'admin'    },
  { name: 'Admin User',        email: 'admin@vms.com',      department: 'IT',           desk_location: 'IT Room',          role: 'admin'    },
  { name: 'HR Manager',        email: 'hr@nanta.tech',      department: 'HR',           desk_location: 'HR Cabin',         role: 'employee' },
  { name: 'Sales Lead',        email: 'sales@nanta.tech',   department: 'Sales',        desk_location: 'Sales Room',       role: 'employee' },
  { name: 'Marketing Manager', email: 'marketing@nanta.tech', department: 'Marketing',  desk_location: 'Marketing Cabin',  role: 'employee' },
];

async function main() {
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  console.log(`\nSeeding ${employees.length} employees…\n`);

  for (const emp of employees) {
    const empHash = emp.email === 'admin@vms.com'
      ? await bcrypt.hash('Admin@123', 12)   // keep admin password
      : hash;

    // Upsert by email: update profile fields on conflict, keep role/location on insert.
    const existing = await User.findOne({ where: { email: emp.email } });
    let row;
    if (existing) {
      existing.name = emp.name;
      existing.department = emp.department;
      existing.desk_location = emp.desk_location;
      existing.password_hash = empHash;
      existing.is_active = true;
      await existing.save();
      row = existing;
    } else {
      row = await User.create({
        email: emp.email,
        password_hash: empHash,
        name: emp.name,
        role: emp.role,
        department: emp.department,
        desk_location: emp.desk_location,
        location_id: LOCATION_ID,
        is_active: true,
      });
    }
    console.log(`✓ ${row.name} (${row.role}) — ${row.desk_location}`);
  }

  console.log(`\n✅ Done! All employees can log in with password: ${DEFAULT_PASSWORD}`);
  console.log('   Admin (admin@vms.com) password: Admin@123\n');
  await sequelize.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
