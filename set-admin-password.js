require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User } = require('./src/models');

(async () => {
  try {
    const hash = await bcrypt.hash('Admin@123', 12);
    const [count] = await User.update(
      { password_hash: hash },
      { where: { email: 'admin@vms.com' } }
    );
    if (count > 0) {
      console.log('✅ Admin password set for: admin@vms.com');
      console.log('   Login: admin@vms.com  |  Password: Admin@123');
    } else {
      console.log('❌ No admin row found — run: npm run db:seed');
    }
    await sequelize.close();
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
})();
