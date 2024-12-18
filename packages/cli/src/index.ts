import { Command } from "commander";
import simpleGit from "simple-git";
import fsExtra from "fs-extra";
import * as path from "path";
import ora from "ora";
import prompts from "prompts";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const REPO_URL = "https://github.com/irychen/solo-ui.git";
const TEMP_DIR = path.join(process.cwd(), ".solo-ui-temp");

const program = new Command();

async function checkProjectConfig() {
  const hasPackageJson = await fsExtra.pathExists("package.json");
  if (!hasPackageJson) {
    throw new Error(
      "No package.json found. Please run this command in a Node.js project."
    );
  }
}

async function checkComponentDependencies(component: string) {
  const componentPath = path.join(TEMP_DIR, "components", component);
  const typesPath = path.join(componentPath, "types.ts");

  if (await fsExtra.pathExists(typesPath)) {
    const content = await fsExtra.readFile(typesPath, "utf-8");
    // TODO: 实现依赖分析逻辑
  }
}

async function mergeStyles(componentPath: string) {
  const componentStylePath = path.join(componentPath, "styles.css");
  const globalStylePath = path.join(process.cwd(), "src/styles/globals.css");

  if (await fsExtra.pathExists(componentStylePath)) {
    const componentStyles = await fsExtra.readFile(componentStylePath, "utf-8");
    const globalStyles = await fsExtra.readFile(globalStylePath, "utf-8");

    if (!globalStyles.includes(componentStyles)) {
      await fsExtra.appendFile(globalStylePath, `\n${componentStyles}`);
    }
  }
}

async function cleanupTemp() {
  try {
    if (await fsExtra.pathExists(TEMP_DIR)) {
      await fsExtra.remove(TEMP_DIR);
    }
  } catch (error) {
    console.warn("Failed to clean up temporary directory");
  }
}

async function modifyTailwindConfig(configPath: string) {
  const config = await fsExtra.readFile(configPath, "utf-8");
  const modifiedConfig = config.replace(
    /content:\s*\[[^]*?\]/,
    'content: ["./src/**/*.{js,ts,jsx,tsx}"]'
  );
  await fsExtra.writeFile(configPath, modifiedConfig);
}

program
  .name("solo-ui")
  .description("CLI tool for managing solo-ui components")
  .version(version);

program
  .command("add <component>")
  .description("Add a component to your project")
  .action(async (component: string) => {
    const spinner = ora("Fetching component...").start();

    try {
      await checkProjectConfig();
      await fsExtra.ensureDir(TEMP_DIR);
      await fsExtra.ensureDir(path.join(process.cwd(), "src", "components"));

      const git = simpleGit();
      await git.clone(REPO_URL, TEMP_DIR, ["--depth", "1"]);

      await checkComponentDependencies(component);

      const componentPath = path.join(
        TEMP_DIR,
        "packages/components",
        component
      );
      const targetPath = path.join(process.cwd(), "src/components", component);

      if (!(await fsExtra.pathExists(componentPath))) {
        throw new Error(
          `Component ${component} not found in solo-ui components`
        );
      }

      await fsExtra.copy(componentPath, targetPath);
      await mergeStyles(componentPath);

      spinner.succeed(
        `Successfully added ${component} component to src/components/${component}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      spinner.fail(`Failed to add component: ${errorMessage}`);
    } finally {
      await cleanupTemp();
    }
  });

program
  .command("init")
  .description("Initialize solo-ui configuration and styles")
  .action(async () => {
    const spinner = ora("Initializing solo-ui...").start();
    try {
      await checkProjectConfig();

      // Ensure src directory structure
      await fsExtra.ensureDir(path.join(process.cwd(), "src", "styles"));
      await fsExtra.ensureDir(path.join(process.cwd(), "src", "components"));

      const git = simpleGit();
      await git.clone(REPO_URL, TEMP_DIR, ["--depth", "1"]);

      // Copy globals.css to src/styles
      await fsExtra.copy(
        path.join(TEMP_DIR, "packages/components/styles/globals.css"),
        path.join(process.cwd(), "src/styles/globals.css")
      );

      // Copy and modify config files
      await fsExtra.copy(
        path.join(TEMP_DIR, "tailwind.config.js"),
        path.join(process.cwd(), "tailwind.config.js")
      );

      await modifyTailwindConfig(
        path.join(process.cwd(), "tailwind.config.js")
      );

      await fsExtra.copy(
        path.join(TEMP_DIR, "postcss.config.js"),
        path.join(process.cwd(), "postcss.config.js")
      );

      // Update package.json
      const packageJson = await fsExtra.readJson("package.json");
      if (!packageJson.dependencies) packageJson.dependencies = {};
      if (!packageJson.devDependencies) packageJson.devDependencies = {};

      packageJson.devDependencies = {
        ...packageJson.devDependencies,
        tailwindcss: "^3.4.0",
        postcss: "^8.4.0",
        autoprefixer: "^10.4.0",
      };

      await fsExtra.writeJson("package.json", packageJson, { spaces: 2 });

      spinner.succeed("Successfully initialized solo-ui!");
      console.log("\nNext steps:");
      console.log(
        "1. Run 'npm install' or 'pnpm install' to install dependencies"
      );
      console.log(
        "2. Import 'src/styles/globals.css' in your main application file"
      );
      console.log(
        "3. Start using solo-ui components with 'solo-ui add <component>'"
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      spinner.fail(`Failed to initialize: ${errorMessage}`);
    } finally {
      await cleanupTemp();
    }
  });

program
  .command("list")
  .description("List available components")
  .action(async () => {
    const spinner = ora("Fetching components...").start();
    try {
      await fsExtra.ensureDir(TEMP_DIR);
      const git = simpleGit();
      await git.clone(REPO_URL, TEMP_DIR, ["--depth", "1"]);

      const componentsDir = path.join(TEMP_DIR, "packages/components");
      const items = await fsExtra.readdir(componentsDir);
      const components = items.filter((name) => {
        if (name.startsWith(".")) return false;
        if (["styles", "package.json", "node_modules"].includes(name))
          return false;
        return fsExtra.statSync(path.join(componentsDir, name)).isDirectory();
      });

      spinner.stop();

      if (components.length === 0) {
        spinner.info("No components available");
        return;
      }

      const { component } = await prompts({
        type: "select",
        name: "component",
        message: "Select a component to add",
        choices: components.map((name) => ({ title: name, value: name })),
      });

      if (component) {
        await fsExtra.ensureDir(path.join(process.cwd(), "src/components"));
        const componentPath = path.join(
          TEMP_DIR,
          "packages/components",
          component
        );
        const targetPath = path.join(
          process.cwd(),
          "src/components",
          component
        );
        await fsExtra.copy(componentPath, targetPath);
        await mergeStyles(componentPath);
        spinner.succeed(
          `Successfully added ${component} component to src/components/${component}`
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      spinner.fail(`Failed to fetch components: ${errorMessage}`);
    } finally {
      await cleanupTemp();
    }
  });

program.parse();
