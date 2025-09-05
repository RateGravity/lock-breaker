// Mock the modules before requiring them
const mockGetInput = jest.fn();
const mockSetOutput = jest.fn();
const mockSetFailed = jest.fn();
const mockExec = jest.fn();
const mockGetExecOutput = jest.fn();
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();

jest.mock("@actions/core", () => ({
  getInput: mockGetInput,
  setOutput: mockSetOutput,
  setFailed: mockSetFailed,
  debug: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
  startGroup: jest.fn(),
  endGroup: jest.fn(),
}));

jest.mock("@actions/exec", () => ({
  exec: mockExec,
  getExecOutput: mockGetExecOutput,
}));

jest.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

jest.mock("node:path", () => ({
  join: jest.fn((...args) => args.filter((arg) => arg).join("/")),
}));

const { run } = require("..");

describe("Lock Breaker Action", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    mockGetInput.mockReset();
    mockSetOutput.mockReset();
    mockSetFailed.mockReset();
    mockExec.mockReset();
    mockGetExecOutput.mockReset();
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("run function", () => {
    it("should handle missing packages input", async () => {
      // Setup
      mockGetInput.mockImplementation((name) => {
        if (name === "packages") return "";
        if (name === "directory") return ".";
        return "";
      });

      // Execute
      await run();

      // Verify
      expect(mockSetFailed).toHaveBeenCalledWith("No packages specified");
    });

    it("should handle missing yarn.lock file", async () => {
      // Setup
      mockGetInput.mockImplementation((name) => {
        if (name === "packages") return "lodash";
        if (name === "directory") return "./test-dir";
        return "";
      });
      mockExistsSync.mockReturnValue(false);

      // Execute
      await run();

      // Verify
      expect(mockSetFailed).toHaveBeenCalledWith(
        "yarn.lock not found at ./test-dir/yarn.lock",
      );
    });

    it("should successfully process a single package", async () => {
      // Setup
      const mockYarnLockContent = `
"lodash@^4.17.21":
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz"
  integrity sha512-v2kDEe57lec

"other-package@1.0.0":
  version "1.0.0"
  resolved "https://registry.yarnpkg.com/other-package/-/other-package-1.0.0.tgz"
  dependencies:
    lodash "^4.17.21"
`;

      mockGetInput.mockImplementation((name) => {
        if (name === "packages") return "lodash";
        if (name === "directory") return ".";
        if (name === "commit") return "false";
        return "";
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(mockYarnLockContent);
      mockWriteFileSync.mockImplementation(() => {});
      mockExec.mockResolvedValue(0);

      // Execute
      await run();

      // Verify
      expect(mockReadFileSync).toHaveBeenCalledWith("./yarn.lock", "utf8");
      expect(mockWriteFileSync).toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalledWith("yarn", ["install", "--no-immutable"], { cwd: "." });
      expect(mockSetOutput).toHaveBeenCalledWith("updated-packages", "lodash");
      expect(mockSetOutput).toHaveBeenCalledWith("commit-sha", "");
      expect(mockSetFailed).not.toHaveBeenCalled();
    });

    it("should process multiple packages", async () => {
      // Setup
      const mockYarnLockContent = `
"react@^18.0.0":
  version "18.2.0"
  resolved "https://registry.yarnpkg.com/react/-/react-18.2.0.tgz"
  
"react-dom@^18.0.0":
  version "18.2.0"
  resolved "https://registry.yarnpkg.com/react-dom/-/react-dom-18.2.0.tgz"
  dependencies:
    react "^18.0.0"
`;

      mockGetInput.mockImplementation((name) => {
        if (name === "packages") return "react react-dom";
        if (name === "directory") return ".";
        if (name === "commit") return "false";
        return "";
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(mockYarnLockContent);
      mockWriteFileSync.mockImplementation(() => {});
      mockExec.mockResolvedValue(0);

      // Execute
      await run();

      // Verify
      expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
      expect(mockExec).toHaveBeenCalledWith("yarn", ["install", "--no-immutable"], { cwd: "." });
      expect(mockSetOutput).toHaveBeenCalledWith(
        "updated-packages",
        "react react-dom",
      );
      expect(mockSetFailed).not.toHaveBeenCalled();
    });

    it("should commit changes when commit option is true", async () => {
      // Setup
      const mockYarnLockContent = `
"lodash@^4.17.21":
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz"
`;

      mockGetInput.mockImplementation((name) => {
        if (name === "packages") return "lodash";
        if (name === "directory") return ".";
        if (name === "commit") return "true";
        if (name === "skip-hooks") return "true";
        return "";
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(mockYarnLockContent);
      mockWriteFileSync.mockImplementation(() => {});
      mockExec.mockResolvedValue(0);
      mockGetExecOutput.mockResolvedValue({
        stdout: "abc123def456\n",
        stderr: "",
      });

      // Execute
      await run();

      // Verify
      expect(mockExec).toHaveBeenCalledWith("git", ["add", "yarn.lock"], { cwd: "." });
      expect(mockExec).toHaveBeenCalledWith(
        "git",
        ["commit", "-m", "Refresh lodash dependencies", "-n"],
        { cwd: "." },
      );
      expect(mockGetExecOutput).toHaveBeenCalledWith(
        "git",
        ["rev-parse", "HEAD"],
        { cwd: "." },
      );
      expect(mockSetOutput).toHaveBeenCalledWith("commit-sha", "abc123def456");
    });

    it("should use custom commit message when provided", async () => {
      // Setup
      const mockYarnLockContent = `
"lodash@^4.17.21":
  version "4.17.21"
`;

      mockGetInput.mockImplementation((name) => {
        if (name === "packages") return "lodash";
        if (name === "directory") return ".";
        if (name === "commit") return "true";
        if (name === "commit-message") return "chore: update dependencies";
        if (name === "skip-hooks") return "false";
        return "";
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(mockYarnLockContent);
      mockWriteFileSync.mockImplementation(() => {});
      mockExec.mockResolvedValue(0);
      mockGetExecOutput.mockResolvedValue({
        stdout: "abc123\n",
        stderr: "",
      });

      // Execute
      await run();

      // Verify
      expect(mockExec).toHaveBeenCalledWith(
        "git",
        ["commit", "-m", "chore: update dependencies"],
        { cwd: "." },
      );
    });

    it("should handle commit failure gracefully", async () => {
      // Setup
      const mockYarnLockContent = `
"lodash@^4.17.21":
  version "4.17.21"
`;

      mockGetInput.mockImplementation((name) => {
        if (name === "packages") return "lodash";
        if (name === "directory") return ".";
        if (name === "commit") return "true";
        return "";
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(mockYarnLockContent);
      mockWriteFileSync.mockImplementation(() => {});

      // Mock successful yarn install
      mockExec.mockImplementation((command, args) => {
        if (command === "yarn") return Promise.resolve(0);
        if (command === "git" && args[0] === "add") return Promise.resolve(0);
        if (command === "git" && args[0] === "commit") {
          throw new Error("Nothing to commit");
        }
        return Promise.resolve(0);
      });

      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

      // Execute
      await run();

      // Verify
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Failed to commit changes: Nothing to commit",
      );
      expect(mockSetOutput).toHaveBeenCalledWith("commit-sha", "");
      expect(mockSetFailed).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it("should handle packages with dependents correctly", async () => {
      // Setup - yarn.lock with dependent packages
      const mockYarnLockContent = `
"lodash@^4.17.21":
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz"

"lodash.debounce@^4.0.8":
  version "4.0.8"
  resolved "https://registry.yarnpkg.com/lodash.debounce/-/lodash.debounce-4.0.8.tgz"
  dependencies:
    lodash "^4.17.21"

"my-utils@1.0.0":
  version "1.0.0"
  resolved "https://registry.yarnpkg.com/my-utils/-/my-utils-1.0.0.tgz"
  dependencies:
    lodash "^4.17.21"
    lodash.debounce "^4.0.8"
`;

      mockGetInput.mockImplementation((name) => {
        if (name === "packages") return "lodash";
        if (name === "directory") return ".";
        if (name === "commit") return "false";
        return "";
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(mockYarnLockContent);

      let writtenContent = "";
      mockWriteFileSync.mockImplementation((_, content) => {
        writtenContent = content;
      });

      mockExec.mockResolvedValue(0);

      // Execute
      await run();

      // Verify that all lodash-related entries are removed
      expect(writtenContent).not.toContain("lodash@");
      expect(writtenContent).not.toContain("lodash.debounce@");
      expect(writtenContent).not.toContain("my-utils@");
      expect(mockSetFailed).not.toHaveBeenCalled();
    });

    it("should handle scoped packages correctly", async () => {
      // Setup
      const mockYarnLockContent = `
"@types/node@^20.0.0":
  version "20.0.0"
  resolved "https://registry.yarnpkg.com/@types/node/-/node-20.0.0.tgz"

"@types/jest@^29.0.0":
  version "29.0.0"
  resolved "https://registry.yarnpkg.com/@types/jest/-/jest-29.0.0.tgz"
  dependencies:
    "@types/node" "*"
`;

      mockGetInput.mockImplementation((name) => {
        if (name === "packages") return "@types/node";
        if (name === "directory") return ".";
        if (name === "commit") return "false";
        return "";
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(mockYarnLockContent);
      mockWriteFileSync.mockImplementation(() => {});
      mockExec.mockResolvedValue(0);

      // Execute
      await run();

      // Verify
      expect(mockWriteFileSync).toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalledWith("yarn", ["install", "--no-immutable"], { cwd: "." });
      expect(mockSetOutput).toHaveBeenCalledWith(
        "updated-packages",
        "@types/node",
      );
      expect(mockSetFailed).not.toHaveBeenCalled();
    });

    it("should handle workspace references correctly", async () => {
      // Setup - yarn.lock with workspace references
      const mockYarnLockContent = `
"my-package@workspace:packages/my-package":
  version "1.0.0"
  dependencies:
    lodash "^4.17.21"

"lodash@^4.17.21":
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz"
`;

      mockGetInput.mockImplementation((name) => {
        if (name === "packages") return "lodash";
        if (name === "directory") return ".";
        if (name === "commit") return "false";
        return "";
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(mockYarnLockContent);

      let writtenContent = "";
      mockWriteFileSync.mockImplementation((_, content) => {
        writtenContent = content;
      });

      mockExec.mockResolvedValue(0);

      // Execute
      await run();

      // Verify that lodash and its dependents are removed
      expect(writtenContent).not.toContain("lodash@");
      expect(writtenContent).not.toContain("my-package@workspace");
      expect(mockSetFailed).not.toHaveBeenCalled();
    });

    it("should handle yarn install failure", async () => {
      // Setup
      const mockYarnLockContent = `
"lodash@^4.17.21":
  version "4.17.21"
`;

      mockGetInput.mockImplementation((name) => {
        if (name === "packages") return "lodash";
        if (name === "directory") return ".";
        return "";
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(mockYarnLockContent);
      mockWriteFileSync.mockImplementation(() => {});

      const yarnError = new Error("Yarn install failed");
      mockExec.mockRejectedValue(yarnError);

      // Execute
      await run();

      // Verify
      expect(mockSetFailed).toHaveBeenCalledWith("Yarn install failed");
    });

    it("should handle custom directory correctly", async () => {
      // Setup
      const mockYarnLockContent = `
"lodash@^4.17.21":
  version "4.17.21"
`;

      mockGetInput.mockImplementation((name) => {
        if (name === "packages") return "lodash";
        if (name === "directory") return "./custom/path";
        if (name === "commit") return "false";
        return "";
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(mockYarnLockContent);
      mockWriteFileSync.mockImplementation(() => {});
      mockExec.mockResolvedValue(0);

      // Execute
      await run();

      // Verify
      expect(mockReadFileSync).toHaveBeenCalledWith(
        "./custom/path/yarn.lock",
        "utf8",
      );
      expect(mockExec).toHaveBeenCalledWith("yarn", ["install", "--no-immutable"], {
        cwd: "./custom/path",
      });
      expect(mockSetFailed).not.toHaveBeenCalled();
    });
  });
});
