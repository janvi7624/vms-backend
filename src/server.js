require('dotenv').config();

const { httpServer } = require('./app');
const { sequelize } = require('./config/database');

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    httpServer.listen(PORT, '0.0.0.0', () => {
      const os = require('os');
      const localIp = Object.values(os.networkInterfaces()).flat()
        .find(i => i.family === 'IPv4' && !i.internal)?.address || 'localhost';
      console.log(`🚀 Temi VMS Server running on port ${PORT}`);
      console.log(`   Local:   http://localhost:${PORT}`);
      console.log(`   Network: http://${localIp}:${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Temi Serial: ${process.env.TEMI_SERIAL || 'not configured'}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
};

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await sequelize.close();
  process.exit(0);
});

start();
