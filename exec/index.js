const core = require("@actions/core");
const { isContainerRunning, execInDocker } = require("../utils/docker");

/**
 * Runs the specified commands inside a Docker container.
 * @async
 * @function run
 * @throws {Error} If the container is not running or if the action fails.
 */
async function run() {
  try {
    const containerName = core.getInput("container_name", { required: true });
    const workdir = core.getInput("workdir", { required: true });
    const commands = core.getInput("run", { required: true });

    if (await isContainerRunning(containerName)) {
      await execInDocker(containerName, workdir, commands);
    } else {
      core.setFailed("Container is not running.");
    }
  } catch (error) {
    core.setFailed(`Action failed with error ${error}`);
  }
}

run();
