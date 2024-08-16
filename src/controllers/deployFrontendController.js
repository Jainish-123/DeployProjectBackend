const {
  createClonedReposDirIfNotExists,
  generateRepoName,
  ensureClonedDirectoryNotExists,
  execPromise,
  getEc2PublicDnsImdsV2,
} = require("../util/util");

const deployFrontend = async (req, res) => {
  const { repoUrl, baseDir, environment } = req.body;

  if (!repoUrl || !baseDir || !environment) {
    return res.status(400).json({
      error: "Missing required parameters: repoUrl, baseDir or environment.",
    });
  }
  const repoName = generateRepoName(repoUrl);
  const imageName = `${repoName}-${baseDir}`.toLocaleLowerCase();
  const dockerScriptPath = path.join(
    __dirname,
    "..",
    "create_frontend_docker_container.sh"
  );

  const clonedReposDir = createClonedReposDirIfNotExists();

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

module.exports = { deployFrontend };
