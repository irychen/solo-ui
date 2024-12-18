import { Command } from "commander";
import simpleGit from "simple-git";
import * as fs from "fs-extra";
import * as path from "path";
import ora from "ora";
import prompts from "prompts";
import { version } from "../package.json";

const REPO_URL = "https://github.com/irychen/solo-ui.git";
const TEMP_DIR = path.join(process.cwd(), ".solo-ui-temp");

const program = new Command();

async function checkProjectConfig() {
  const hasPackageJson = await fs.pathExists("package.json");
  if (!hasPackageJson) {
    throw new Error(
      "No package.json found. Please run this command in a Node.js project."
    );
  }
}

async function checkComponentDependencies(component: string) {
  const componentPath = path.join(TEMP_DIR, "components", component);
  const typesPath = path.join(componentPath, "types.ts");

  if (await fs.pathExists(typesPath)) {
    const content = await fs.readFile(typesPath, "utf-8");
    // TODO: 实现依赖分析逻辑
  }
}

async function checkVersion() {
  try {
    const packageJson = await fs.readJson(path.join(TEMP_DIR, "package.json"));
    const localPackageJson = await fs.readJson("package.json");

    if (packageJson.version !== localPackageJson.version) {
      console.warn(
        `Warning: Your local version (${localPackageJson.version}) differs from the remote version (${packageJson.version})`
      );
    }
  } catch (error) {
    console.warn("Unable to check versions");
  }
}

async function mergeStyles(componentPath: string) {
  const componentStylePath = path.join(componentPath, "styles.css");
  const globalStylePath = path.join(process.cwd(), "styles/globals.css");

  if (await fs.pathExists(componentStylePath)) {
    const componentStyles = await fs.readFile(componentStylePath, "utf-8");
    const globalStyles = await fs.readFile(globalStylePath, "utf-8");

    if (!globalStyles.includes(componentStyles)) {
      await fs.appendFile(globalStylePath, `\n${componentStyles}`);
    }
  }
}

async function cleanupTemp() {
  try {
    if (await fs.pathExists(TEMP_DIR)) {
      await fs.remove(TEMP_DIR);
    }
  } catch (error) {
    console.warn("Failed to clean up temporary directory");
  }
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
      await fs.ensureDir(TEMP_DIR);

      const git = simpleGit();
      await git.clone(REPO_URL, TEMP_DIR, ["--depth", "1"]);

      await checkVersion();
      await checkComponentDependencies(component);

      const componentPath = path.join(TEMP_DIR, "components", component);
      const targetPath = path.join(process.cwd(), "components", component);

      if (!(await fs.pathExists(componentPath))) {
        throw new Error(`Component ${component} not found`);
      }

      await fs.copy(componentPath, targetPath);
      await mergeStyles(componentPath);

      spinner.succeed(`Successfully added ${component} component`);
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
      await fs.ensureDir("styles");
      await fs.ensureDir("components");

      const git = simpleGit();
      await git.clone(REPO_URL, TEMP_DIR, ["--depth", "1"]);

      await checkVersion();

      await fs.copy(
        path.join(TEMP_DIR, "packages/components/styles/globals.css"),
        path.join(process.cwd(), "styles/globals.css")
      );

      await fs.copy(
        path.join(TEMP_DIR, "tailwind.config.js"),
        path.join(process.cwd(), "tailwind.config.js")
      );

      await fs.copy(
        path.join(TEMP_DIR, "postcss.config.js"),
        path.join(process.cwd(), "postcss.config.js")
      );

      const packageJson = await fs.readJson("package.json");
      if (!packageJson.dependencies) packageJson.dependencies = {};
      if (!packageJson.devDependencies) packageJson.devDependencies = {};

      packageJson.devDependencies = {
        ...packageJson.devDependencies,
        tailwindcss: "^3.4.0",
        postcss: "^8.4.0",
        autoprefixer: "^10.4.0",
      };

      await fs.writeJson("package.json", packageJson, { spaces: 2 });

      spinner.succeed("Successfully initialized solo-ui!");
      console.log("\nNext steps:");
      console.log(
        "1. Run 'npm install' or 'pnpm install' to install dependencies"
      );
      console.log(
        "2. Import 'styles/globals.css' in your main application file"
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
      await fs.ensureDir(TEMP_DIR);
      const git = simpleGit();
      await git.clone(REPO_URL, TEMP_DIR, ["--depth", "1"]);

      const componentsDir = path.join(TEMP_DIR, "packages/components");
      const components = await fs.readdir(componentsDir);

      spinner.stop();

      const { component } = await prompts({
        type: "select",
        name: "component",
        message: "Select a component to add",
        choices: components.map((name) => ({ title: name, value: name })),
      });

      if (component) {
        const componentPath = path.join(
          TEMP_DIR,
          "packages/components",
          component
        );
        const targetPath = path.join(process.cwd(), "components", component);
        await fs.copy(componentPath, targetPath);
        await mergeStyles(componentPath);
        spinner.succeed(`Successfully added ${component} component`);
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
