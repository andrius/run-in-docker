const core = require("@actions/core");
const exec = require("@actions/exec");
const fs = require("fs");
const os = require("os");
const path = require("path");

/**
 * Checks if a Docker container is running.
 * @param {string} containerName - The name of the Docker container.
 * @returns {boolean} - Returns true if the container is running, false otherwise.
 */
async function isContainerRunning(containerName) {
  let output = "";
  const options = {
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
    },
  };

  try {
    await exec.exec(
      `docker inspect -f '{{.State.Running}}' ${containerName}`,
      [],
      options,
    );
    return output.trim() === "true" || output.trim() === "'true'";
  } catch (error) {
    core.setFailed(`Failed to inspect container ${containerName}: ${error}`);
    return false;
  }
}

/**
 * Creates an environment file with the current process environment variables.
 * @returns {string} The path to the created environment file.
 */
async function createEnvFile() {
  const envVars = Object.entries(process.env)
    .map(
      ([key, value]) => `export ${key}="${value.replace(/"/g, '\\"')}"`, // Handle quotes in environment variables value
    )
    .join("\n");

  const envFile = path.join(os.tmpdir(), "env.sh");
  fs.writeFileSync(envFile, envVars);
  return envFile;
}

async function deleteFile(file) {
  try {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  } catch (error) {
    console.error(`Error deleting file: ${error}`);
  }
}

/**
 * Executes commands inside a Docker container.
 *
 * @param {string} containerName - The name of the Docker container.
 * @param {string} workdir - The working directory inside the container.
 * @param {string} commands - The commands to be executed inside the container.
 * @returns {Promise<void>} - A Promise that resolves when the execution is complete.
 */
async function execInDocker(containerName, workdir, commands) {
  // Generate and the env.sh file with current GitHub environment properties to the container
  const envFilePath = await createEnvFile();
  await exec.exec(`docker cp ${envFilePath} ${containerName}:/tmp/env.sh`);
  await deleteFile(envFilePath);

  // Creating a bash script with run commands
  const script = `script-${Date.now()}.sh`;
  const scriptPath = path.join(os.tmpdir(), script);
  // the script source environment variables, change to the workdir and run the commands
  const scriptContent = `#!/bin/bash\nrm -f /tmp/${script}\nsource /tmp/env.sh\ncd ${workdir}\n${commands}\n`;
  fs.writeFileSync(scriptPath, scriptContent);
  await exec.exec(`docker cp ${scriptPath} ${containerName}:/tmp/${script}`);
  console.log(`Script content:\n${scriptContent}`);
  // await exec.exec(`docker exec -i ${containerName} cat /tmp/${script}`);
  await deleteFile(scriptPath);

  // Capture stdout (the container name) and stderr (if any error occurs)
  const options = {};
  let cmdOutput = "";
  let cmdError = "";
  options.listeners = {
    stdout: (data) => {
      cmdOutput += data.toString();
    },
    stderr: (data) => {
      cmdError += data.toString();
    },
  };

  // Execute the command script in the container
  const runCommand = `docker exec -i ${containerName} bash /tmp/${script}`;
  const exitCode = await exec.exec(runCommand, [], options);
  if (exitCode === 0) {
    // core.setOutput("console_output", cmdOutput.trim());
    core.setOutput("status", "success");
  } else {
    throw new Error(cmdError);
  }
}

module.exports = {
  isContainerRunning,
  createEnvFile,
  deleteFile,
  execInDocker,
};
