const express = require("express");
const { deployBackend } = require("../controllers/deployBackendController");

const router = express.Router();
router.post("/", deployBackend);

module.exports = router;
