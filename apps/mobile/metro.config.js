const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Shared packages and root dependencies must remain visible to Metro. Exclude
// agent checkouts from both the initial file map and subsequent watch events.
config.watchFolders = [workspaceRoot];
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList)
    ? defaultBlockList
    : defaultBlockList ? [defaultBlockList] : []),
  /(?:^|[/\\])\.claude(?:[/\\]|$)/,
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
