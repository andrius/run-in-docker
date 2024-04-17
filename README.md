# run-in-docker action

These actions starts a docker container and executes commands within it.

Essentially, they are equivalent to the `actions/run` action, but within a docker container.

The aim of these actions is to facilitate testing of software builds on legacy operating systems, such as Debian Jessie and Debian Stretch.

It were possible to utilize the GitHub workflows with container jobs, but with NodeJS 20 becoming a GitHub actions dependency, many crucial actions, ceased to function.

These actions serve as a workaround for this issue; `start` initiates a docker container and `exec` executes commands within it.

Features:

- It starts the docker container with the provided name and image;
- It stops the container towards the end of the GitHub job run;
- Once the container is up and running, it executes the commands within it;
- The host (runner) accessible within the container by the hostname `host-gateway` and `host.docker.internal`;
- It provides basic integration with GitHub actions: the environment variables are passed to the container, and the `GITHUB_OUTPUT`, `GITHUB_ENV`, and `GITHUB_STEP_SUMMARY` can be written from the container.

## Build

The build flow documented here: https://docs.github.com/en/actions/creating-actions/creating-a-javascript-action#commit-tag-and-push-your-action-to-github; basically it uses the Vercel's `ncc` tool to compile the js code into a single file.

```shell
npm run build
git add . && git commit -m "Build action"
```

## Action `start`

### Inputs

- `image` (required): Docker image to use.
- `custom_options` (optional): Custom Docker run options.
- `workdir` (optional): Working directory inside the container. Default value is `${{ github.workspace }}`.
- `container_name` (optional): Optional custom name for the container.
- `run` (optional): Optional commands to execute inside the container.

### Outputs

- `container_name`: Name of the running container. If not provided through the inputs, it will be generated.

### Full syntax

```yaml
- name: Start container and build the code
  id: build-container
  uses: andrius/run-in-docker/start@main
  with:
    image: ${{ needs.prechecks.outputs.CONTAINER_REGISTRY }}/buildpackage-generic-${{ matrix.debian_version }}:latest
    custom_options: "--add-host=mariadb:host-gateway"
    workdir: ${{ github.workspace }}
    container_name: build-container
    run: |
      ./build.sh
      DELIVERABLES=$(date +%Y%m%d%H%M%S)
      mkdir -p ${DELIVERABLES}
      find . -type f -name '*.deb' -exec mv {} /tmp/build \;
      mv /tmp/build/* ${DELIVERABLES}/
      echo "DELIVERABLES=${DELIVERABLES}" >> $GITHUB_OUTPUT

- uses: actions/upload-artifact@v4
  with:
    name: deliverables-${{ matrix.debian_version }}
    path: ./${{ steps.build-container.outputs.DELIVERABLES }}
```

## Action `exec`

### Inputs

- `workdir` (optional): Working directory inside the container. Default value is `${{ github.workspace }}`.
- `container_name` (required): Name for the running container.
- `run` (required): Commands to execute inside the container.

### Full syntax

```yaml
- uses: andrius/run-in-docker/exec@main
  with:
    workdir: ${{ github.workspace }}
    container_name: tests-container
    run: |
      if ./run-tests.sh; then
        echo "TESTS_PASSED=true" >> $GITHUB_ENV
      else
        echo "TESTS_PASSED=false" >> $GITHUB_ENV
      fi

- uses: andrius/run-in-docker/exec@main
  if: env.TESTS_PASSED == 'true'
  with:
    workdir: ${{ github.workspace }}
    container_name: build-container
    run: |
      ./build.sh
```

## Examples

### Start container and run commands

```yaml
- uses: andrius/run-in-docker/start@main
  with:
    image: ${{ needs.prechecks.outputs.CONTAINER_REGISTRY }}/buildpackage-generic-${{ matrix.debian_version }}:latest
    run: |
      ./build.sh
```

### Start container and run commands in the separate steps

```yaml
- uses: actions/checkout@v4

- uses: andrius/run-in-docker/start@main
  with:
    image: ${{ needs.prechecks.outputs.CONTAINER_REGISTRY }}/buildpackage-generic-${{ matrix.debian_version }}:latest
    container_name: debian-container

- uses: andrius/run-in-docker/exec@main
  with:
    container_name: debian-container
    run: ./run-tests.sh

- uses: andrius/run-in-docker/exec@main
  with:
    container_name: debian-container
    run: ./build.sh
```

### How to access a service that is running in another container

Action start does start a container with the `--add-host` option. This allows the container to access the host machine by the hostname `host-gateway` and `host.docker.internal`. This is useful when you have a service running on the host machine and you want to access it from the container.

The GitHub workflows could use a service containers to run, for example, a database. In this case, the database port should be exposed to a host (runner) and the container will access it by the given hostname. The following example demonstrates how to access a MariaDB service running on the host machine from the container.

```yaml
jobs:
  unit_testing:
    runs-on: ubuntu-latest
    services:
      mariadb:
        image: mariadb:10.5
        # Expose the database port to the host so host could access mariadb on 127.0.0.1
        # And the run-in-docker container could access it by the hostname `host.docker.internal`
        ports:
          - 3306:3306
    strategy:
      matrix:
        debian_version: [jessie, stretch, buster, bullseye, bookworm]
    permissions:
      id-token: write
      contents: read
      packages: read

    steps:
      - name: Login to GitHub Container Registry
        run: echo ${{ secrets.GITHUB_TOKEN }} | docker login ghcr.io -u ${{ github.actor }} --password-stdin

      # Run the container with the given image and wait for the MariaDB service to be ready
      # The container will access the MariaDB service by the hostname `host.docker.internal`
      # If container won't be able to access the service, the GitHub job will fail
      - uses: andrius/run-in-docker/start@main
        with:
          image: ${{ needs.prechecks.outputs.CONTAINER_REGISTRY }}/buildpackage-generic-${{ matrix.debian_version }}:latest
          container_name: debian-container
          # Pass the additional properties to the container;
          # most importantly, the MYSQL_PORT and also custom hostname for the mariadb service
          custom_options: >-
            --add-host=mariadb:host-gateway
            -e MYSQL_HOST=host.docker.internal
            -e MYSQL_PORT=${{ job.services.mariadb.ports[3306] }}
            -e DEBIAN_DISTRIBUTION="${{ matrix.debian_version }}"

      # Wait for the database service to be ready
      # We use 'host.docker.internal' to access the host machine but with given example in custom_options
      # we could also use the hostname `mariadb`.
      # Both the MYSQL_HOST and MYSQL_PORT are passed to the container as an environment variables
      - name: Wait database service (for debian-container)
        uses: andrius/run-in-docker/exec@main
        with:
          container_name: debian-container
          run: |
            wait_db() {
              [ "$1" = "--debug" ] && set -x || exec &>/dev/null
              command -v mysql || { sudo apt-get update -yq && sudo apt-get install -y mysql-client; }
              local CREDS="--user=root --password=root --host=${MYSQL_HOST:-host.docker.internal} --port=${MYSQL_PORT:-3306}"
              for _ in {1..45}; do mysql $CREDS --execute "SELECT 'healthy'" && return || sleep 1s; done
              return 1
            }
            wait_db --debug || exit 1

      # Along with the container, the host also has access to the MariaDB service
      # The service is running in the GitHub container and accessible by the hostname specified in the MYSQL_HOST variable
      - name: Wait database service (for host)
        run: |
          MYSQL_HOST=127.0.0.1; MYSQL_PORT=${{ job.services.mariadb.ports[3306] }}

          wait_db() {
            [ "$1" = "--debug" ] && set -x || exec &>/dev/null
            command -v mysql || { sudo apt-get update -yq && sudo apt-get install -y mysql-client; }
            local CREDS="--user=root --password=root --host=${MYSQL_HOST} --port=${MYSQL_PORT}"
            for _ in {1..45}; do mysql $CREDS --execute "SELECT 'healthy'" && return || sleep 1s; done
            return 1
          }
          wait_db --debug || exit 1
```
