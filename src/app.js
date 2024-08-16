const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const createDatabaseRoute = require("./routes/createDatabaseRoute");
const deployBackendRoute = require("./routes/deployBackendRoute");
const deployFrontendRoute = require("./routes/deployFrontendRoute");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("This app is running");
});

app.use("/create-database", createDatabaseRoute);
app.use("/deploy-backend", deployBackendRoute);
app.use("/deploy-frontend", deployFrontendRoute);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
