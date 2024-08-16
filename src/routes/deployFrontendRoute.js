const express = require("express");
const { deployFrontend } = require("../controllers/deployFrontendController");

const router = express.Router();
router.post("/", deployFrontend);

module.exports = router;
