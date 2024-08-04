const express = require("express");
const { createDatabase } = require("../controllers/createDatabaseController");
const router = express.Router();

router.post("/", createDatabase);

module.exports = router;
