// services/api/routes/alerts.js
const express = require('express');
const router = express.Router();

// GET /api/v1/alerts
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    data: [],
  });
});

module.exports = router;