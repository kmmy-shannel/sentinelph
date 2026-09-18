const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..'); // repo root (where /shared lives)

const config = getDefaultConfig(projectRoot);

// Allow Metro to resolve Firebase CommonJS (.cjs) modules
config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = false;

// Watch the monorepo root so Metro can see ../../shared
config.watchFolders = [workspaceRoot];

// Resolve node_modules from both the app and the workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;