'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add face_id to visitors (AWS Rekognition face ID)
    await queryInterface.addColumn('visitors', 'face_id', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    // Add visitor_photo to visits (photo URL captured at time of this visit)
    await queryInterface.addColumn('visits', 'visitor_photo', {
      type: Sequelize.STRING(500),
      allowNull: true,
    });

    await queryInterface.addIndex('visitors', ['face_id'], {
      name: 'visitors_face_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('visitors', 'visitors_face_id_idx');
    await queryInterface.removeColumn('visitors', 'face_id');
    await queryInterface.removeColumn('visits', 'visitor_photo');
  },
};
