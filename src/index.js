const core = require("@actions/core");
const exec = require("@actions/exec");
const fs = require("node:fs");
const path = require("node:path");

async function run() {
  try {
    // Get inputs from GitHub Action
    const packages = core.getInput("packages", { required: true });
    const directory = core.getInput("directory") || ".";
    const shouldCommit = core.getInput("commit") === "true";
    const commitMessage = core.getInput("commit-message");
    const skipHooks = core.getInput("skip-hooks") === "true";

    // Parse package names
    const packageNames = packages.split(" ").filter((pkg) => pkg.trim());

    if (!packageNames.length) {
      throw new Error("No packages specified");
    }

    // Construct yarn.lock path
    const yarnLockPath = path.join(directory, "yarn.lock");

    // Check if yarn.lock exists
    if (!fs.existsSync(yarnLockPath)) {
      throw new Error(`yarn.lock not found at ${yarnLockPath}`);
    }

    console.log(
      `Refreshing ${packageNames.join(", ")} dependencies in ${directory}`,
    );

    const updatedPackages = [];

    // Process each package individually
    for (const packageName of packageNames) {
      console.log(`Refreshing "${packageName}".`);
      const data = fs.readFileSync(yarnLockPath, "utf8");
      let updatedData = data;

      /**
       * Finds all packages that depend on the specified package name
       * by parsing the yarn.lock file and examining dependency sections.
       *
       * @param {string} pkgName - The name of the package to find dependents for
       * @returns {string[]} Array of package names that depend on the specified package
       *
       * Algorithm:
       * 1. Uses regex to find all package entries in yarn.lock format: "package@version:"
       * 2. For each entry, extracts the dependencies section (indented with 2 spaces)
       * 3. Within dependencies, looks for lines indented with 4 spaces containing the target package
       * 4. Handles both direct dependencies and workspace references (e.g., {package})
       */
      const getDependents = (pkgName) => {
        const dependents = [];
        // Match yarn.lock entries: "package@version:" followed by indented content
        const regex = /^([^@]+)@[^\n]*:\n((?: {2}[^\n]*\n)*)/gm;
        let match;
        match = regex.exec(data);
        while (match !== null) {
          const dependenciesSection = match[2];
          // Look for dependencies section within the package entry
          const dependenciesRegex = /dependencies:\n((?: {4}[^\n]*\n)*)/gm;
          const dependenciesMatch = dependenciesRegex.exec(dependenciesSection);
          if (dependenciesMatch) {
            const dependencies = dependenciesMatch[1]
              .split("\n")
              .filter((line) => line.trim());
            // Check if any dependency line contains our target package
            if (
              dependencies.some(
                (dep) => dep.includes(pkgName) || dep.includes(`{${pkgName}}`),
              )
            ) {
              dependents.push(match[1]);
            }
          }
          match = regex.exec(data);
        }
        return dependents;
      };

      /**
       * Recursively removes a package and all packages that depend on it from the yarn.lock file.
       * This ensures that when we reinstall, all dependent packages get fresh versions too.
       *
       * @param {string} pkgName - The name of the package to remove (along with its dependents)
       *
       * Algorithm:
       * 1. Uses regex to find and remove all yarn.lock entries for the specified package
       * 2. Finds all packages that depend on this package using getDependents()
       * 3. Recursively calls itself for each dependent to ensure complete cleanup
       *
       * The regex matches:
       * - Package name with optional quotes: ("?${pkgName}"?)
       * - Version specification: @[^\\n]*:
       * - All indented lines (package metadata): \\n(?: {2}[^\\n]*\\n)*
       */
      const removePackageAndDependents = (pkgName) => {
        // Remove all entries for this package from yarn.lock
        const regex = new RegExp(
          `^("?${pkgName}"?)@[^\\n]*:\\n(?: {2}[^\\n]*\\n)*`,
          "gm",
        );
        updatedData = updatedData.replace(regex, "");

        // Recursively remove all packages that depend on this one
        const dependents = getDependents(pkgName);
        for (const dep of dependents) {
          removePackageAndDependents(dep);
        }
      };

      // Start the recursive removal process
      removePackageAndDependents(packageName);

      // Write the updated yarn.lock back to disk
      fs.writeFileSync(yarnLockPath, updatedData);

      console.log(
        `Entries for package "${packageName}" and its dependents have been removed from yarn.lock.`,
      );

      updatedPackages.push(packageName);
    }

    // Reinstall dependencies to get fresh versions
    console.log("Running yarn install...");
    await exec.exec("yarn", ["install"], { cwd: directory });

    // Commit changes if requested
    let commitSha = "";
    if (shouldCommit) {
      try {
        // Stage all changes
        await exec.exec("git", ["add", "."], { cwd: directory });

        // Determine commit message
        const finalCommitMessage =
          commitMessage || `Refresh ${packageNames.join(", ")} dependencies`;

        // Commit with or without hooks
        const commitArgs = ["commit", "-m", finalCommitMessage];
        if (skipHooks) {
          commitArgs.push("-n");
        }

        await exec.exec("git", commitArgs, { cwd: directory });

        // Get the commit SHA
        const output = await exec.getExecOutput("git", ["rev-parse", "HEAD"], {
          cwd: directory,
        });
        commitSha = output.stdout.trim();

        console.log(`Changes committed: ${commitSha}`);
      } catch (error) {
        console.warn(`Failed to commit changes: ${error.message}`);
      }
    }

    // Set outputs
    core.setOutput("updated-packages", updatedPackages.join(" "));
    core.setOutput("commit-sha", commitSha);
  } catch (error) {
    core.setFailed(error.message);
  }
}

// Run the action if this is the main module
if (require.main === module) {
  run();
}

module.exports = { run };
