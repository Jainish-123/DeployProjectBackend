const AWS = require("aws-sdk");
const cloudformation = new AWS.CloudFormation({ region: "us-east-1" });

const createDatabase = async (req, res) => {
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
    // Create the stack
    const data = await cloudformation.createStack(params).promise();
    const stackId = data.StackId;

    // Function to check the stack status
    const checkStackStatus = async () => {
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
            res
              .status(200)
              .json({
                message: "Database created successfully!",
                dbEndpoint,
                port,
              });
            break;

          case "CREATE_IN_PROGRESS":
            console.log(
              "Stack is still being created. Status:",
              stack.StackStatus
            );
            setTimeout(checkStackStatus, 10000); // Check again in 10 seconds
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
    };

    checkStackStatus(); // Start checking the stack status
  } catch (err) {
    console.error("Error creating stack:", err);
    res.status(500).json({ message: "Error creating stack", error: err });
  }
};

module.exports = {
  createDatabase,
};
