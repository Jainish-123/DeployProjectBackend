const AWS = require("aws-sdk");

const secretsManager = new AWS.SecretsManager({
  region: "us-east-1",
});

async function getSecrets(secretId) {
  return new Promise((resolve, reject) => {
    secretsManager.getSecretValue({ SecretId: secretId }, (err, data) => {
      if (err) {
        console.error("Error retrieving secrets", err);
        reject(err);
      } else {
        if ("SecretString" in data) {
          resolve(JSON.parse(data.SecretString));
        } else {
          reject("No secret string found.");
        }
      }
    });
  });
}

const createDatabase = async (req, res) => {
  const secrets = await getSecrets(
    "arn:aws:secretsmanager:us-east-1:310988282998:secret:prod_aws_cred-rvwC60"
  ).catch((err) => {
    console.error("Failed to load AWS secrets", err);
    res.status(500).json({ message: "Failed to load AWS secrets", error: err });
    return;
  });

  if (!secrets) return;

  const cloudformation = new AWS.CloudFormation({
    region: "us-east-1",
    accessKeyId: secrets.AWS_ACCESS_KEY_ID,
    secretAccessKey: secrets.AWS_SECRET_ACCESS_KEY,
    sessionToken: secrets.AWS_SESSION_TOKEN,
  });

  const { dbInstanceIdentifier, dbName, dbUser, dbPassword } = req.body;

  const params = {
    StackName: "RDS-" + dbUser,
    TemplateURL:
      "https://cloud-term-assignment-bucket.s3.amazonaws.com/rds.yaml",
    Parameters: [
      {
        ParameterKey: "DatabaseInstanceIdentifier",
        ParameterValue: dbInstanceIdentifier,
      },
      { ParameterKey: "DatabaseName", ParameterValue: dbName },
      { ParameterKey: "DatabaseUser", ParameterValue: dbUser },
      { ParameterKey: "DatabasePassword", ParameterValue: dbPassword },
    ],
    Capabilities: ["CAPABILITY_IAM"],
  };

  try {
    const data = await cloudformation.createStack(params).promise();
    const stackId = data.StackId;
    checkStackStatus(cloudformation, stackId, res);
  } catch (err) {
    console.error("Error creating stack:", err);
    res.status(500).json({ message: "Error creating stack", error: err });
  }
};

async function checkStackStatus(cloudformation, stackId, res) {
  try {
    const data = await cloudformation
      .describeStacks({ StackName: stackId })
      .promise();
    const stack = data.Stacks[0];

    switch (stack.StackStatus) {
      case "CREATE_COMPLETE":
        console.log("Stack is created now. Status:", stack.StackStatus);
        const outputs = stack.Outputs;
        const dbEndpoint = outputs.find(
          (output) => output.OutputKey === "DBEndpoint"
        )?.OutputValue;
        const port = outputs.find(
          (output) => output.OutputKey === "DBPort"
        )?.OutputValue;
        res.status(200).json({
          message: "Database created successfully!",
          dbEndpoint,
          port,
        });
        break;

      case "CREATE_IN_PROGRESS":
        console.log("Stack is still being created. Status:", stack.StackStatus);
        setTimeout(checkStackStatus, 10000);
        break;

      case "ROLLBACK_IN_PROGRESS":
        console.log("Stack creation failed. Status:", stack.StackStatus);
        res.status(500).json({
          message: "Stack creation failed and is rolling back.",
          status: stack.StackStatus,
        });
        break;

      case "ROLLBACK_COMPLETE":
        console.log("Stack creation failed. Status:", stack.StackStatus);
        res.status(500).json({
          message: "Stack creation failed and has rolled back completely.",
          status: stack.StackStatus,
        });
        break;

      case "DELETE_IN_PROGRESS":
        console.log("Stack creation failed. Status:", stack.StackStatus);
        res.status(500).json({
          message:
            "Stack is being deleted. Please check the stack's status later.",
          status: stack.StackStatus,
        });
        break;

      case "DELETE_COMPLETE":
        console.log("Stack creation failed. Status:", stack.StackStatus);
        res.status(500).json({
          message: "Stack has been successfully deleted.",
          status: stack.StackStatus,
        });
        break;

      default:
        console.log("Stack creation failed. Status:", stack.StackStatus);
        res.status(500).json({
          message: `Unhandled stack status: ${stack.StackStatus}`,
        });
        break;
    }
  } catch (err) {
    console.error("Error describing stack:", err);
    res.status(500).json({ message: "Error describing stack", error: err });
  }
}

module.exports = {
  createDatabase,
};
