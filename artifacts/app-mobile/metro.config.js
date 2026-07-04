const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// pnpm monorepo: let Metro watch and resolve from the workspace root too.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Force a SINGLE copy of react / react-dom.
//
// The web sibling app (artifacts/app) pins React 18, so react@18.3.1 exists in
// the workspace. pnpm resolved a few of this app's dependencies
// (@expo-google-fonts/inter, @supabase/supabase-js, react-native-url-polyfill)
// against that react@18 peer variant, while the renderer (react-native-web /
// react-dom) uses react@19. Two React instances break hooks with
// "Invalid hook call" / "Cannot read properties of null (reading 'useState')".
// Redirecting every react / react-dom import to this app's copy dedupes them.
const reactRoots = ["react", "react-dom"];
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isReact = reactRoots.some(
    (name) => moduleName === name || moduleName.startsWith(name + "/"),
  );
  if (isReact) {
    try {
      return {
        type: "sourceFile",
        filePath: require.resolve(moduleName, { paths: [projectRoot] }),
      };
    } catch {
      // fall through to default resolution
    }
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
