const core = require("@actions/core");
const exec = require("@actions/exec");

/**
 * Cleans up the Docker container.
 * @async
 * @function cleanup
 * @throws {Error} If cleanup fails.
 */
async function cleanup() {
  try {
    const containerName = core.getState("container_name");
    if (containerName) {
      await exec.exec(`docker rm --force ${containerName}`);
    }
  } catch (error) {
    core.error(`Cleanup failed with error ${error}`);
  }
}

cleanup();
