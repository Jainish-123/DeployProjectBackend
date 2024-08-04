const { exec } = require("child_process");
const os = require("os");
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

async function getEc2PublicDnsImdsV2() {
  try {
    const tokenResponse = await axios.put(
      "http://169.254.169.254/latest/api/token",
      null,
      {
        headers: {
          "X-aws-ec2-metadata-token-ttl-seconds": "21600",
        },
      }
    );

    const token = tokenResponse.data;

    const dnsResponse = await axios.get(
      "http://169.254.169.254/latest/meta-data/public-hostname",
      {
        headers: {
          "X-aws-ec2-metadata-token": token,
        },
      }
    );

    console.log("Public DNS:", dnsResponse.data);
    return dnsResponse.data;
  } catch (error) {
    console.error("Failed to retrieve EC2 public DNS using IMDSv2:", error);
    throw error;
  }
}

const execPromise = (cmd) => {
  return new Promise((resolve, reject) => {
    console.log(`Executing command: ${cmd}`);

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Command failed: ${cmd}`);
        reject(
          new Error(
            `Execution error: ${error.message}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`
          )
        );
      } else {
        resolve(stdout);
      }
    });
  });
};

const generateRepoName = (repoUrl) => {
  let repoPath = repoUrl.replace("https://github.com/", "");

  if (repoPath.endsWith(".git")) {
    repoPath = repoPath.replace(".git", "");
  }

  const repoName = repoPath.replace("/", "-");

  return `${repoName.toLowerCase()}`;
};

async function ensureClonedDirectoryNotExists(dir) {
  try {
    try {
      await fs.access(dir);
      console.log(`Directory ${dir} exists, deleting...`);

      if (fs.rm) {
        await fs.rm(dir, { recursive: true, force: true });
      } else {
        await fs.rmdir(dir, { recursive: true });
      }
      console.log(`Directory ${dir} deleted successfully.`);
    } catch (err) {
      if (err.code === "ENOENT") {
        console.log(`Directory ${dir} does not exist, no need to delete.`);
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error(`Error ensuring directory is not exixts: ${err.message}`);
    process.exit(1);
  }
}

const homeDir = os.homedir();
const clonedReposDir = path.join(homeDir, "cloned_repos");

if (!fs.existsSync(clonedReposDir)) {
  fs.mkdirSync(clonedReposDir, { recursive: true });
  console.log(`Directory created at: ${clonedReposDir}`);
} else {
  console.log(`Directory already exists at: ${clonedReposDir}`);
}

const deployBackend = async (req, res) => {
  const { repoUrl, baseDir, environment, runCommand } = req.body;

  if (!repoUrl || !baseDir || !environment || !runCommand) {
    return res.status(400).json({
      error:
        "Missing required parameters: repoUrl, baseDir, environment or runCommand.",
    });
  }
  const repoName = generateRepoName(repoUrl);
  const imageName = `${repoName}-${baseDir}`.toLocaleLowerCase();
  const dockerScriptPath = path.join(__dirname, "..", "create_docker_image.sh");

  const clonedDir = path.join(clonedReposDir, `${imageName}`);

  await ensureClonedDirectoryNotExists(clonedDir);

  try {
    await execPromise(`git clone ${repoUrl} ${clonedDir}`);
    const targetDir = path.join(clonedDir, baseDir);

    if (!(await fs.pathExists(targetDir))) {
      throw new Error(
        `Base directory "${baseDir}" does not exist in the cloned repository.`
      );
    }

    const publicDns = await getEc2PublicDnsImdsV2();
    const result = await execPromise(
      `bash ${dockerScriptPath} ${environment} ${targetDir} ${imageName} "${runCommand}" "${publicDns}"`
    );
    const url = `http://${publicDns}/${imageName}`;

    res
      .status(200)
      .json({ message: "Deployment successful", project: imageName, url });
  } catch (error) {
    console.error(`Deployment error: ${error.message}`);
    res.status(500).json({ error: `Deployment failed: ${error.message}` });
  }
};

module.exports = { deployBackend };
