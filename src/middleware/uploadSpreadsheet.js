const multer = require('multer');
const path = require('path');

// Memory storage — the file is parsed in-request (xlsx/csv) and never persisted to disk.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ['.csv', '.xlsx', '.xls'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only .csv, .xlsx or .xls files are allowed'), false);
  }
};

const uploadSpreadsheet = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

module.exports = uploadSpreadsheet;
