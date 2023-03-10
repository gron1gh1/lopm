import { resolve, normalize } from "path";
import * as fs from "fs-extra";
import chalk from "chalk";

import type { PackageJson } from "type-fest";
import type { LocalPackageInfo, LinkField, PackageManager } from "./type";
import { getWorkspaceRoot } from "workspace-tools";

export const currentPath = process.cwd();

export const readPackageJson = async (path: string) => {
  const data = await fs.readFile(path, "utf8");
  return JSON.parse(data) as PackageJson;
};

export const getLinkFields = async () => {
  try {
    const packageJson = await readPackageJson(resolve("package.json"));
    if (!packageJson.dependencies) {
      throw new Error(
        chalk.red("🔥 Not Found 'dependencies' field in package.json")
      );
    }

    const linkPackages = Object.entries(packageJson.dependencies)
      .filter(([_, value]) => {
        if (value!.startsWith("link")) {
          return true;
        }
        return false;
      })
      .map(([key, value]) => ({
        name: key,
        path: value!.split(":")[1],
      }));

    return linkPackages as LinkField[];
  } catch (e) {
    throw new Error(
      chalk.red("🔥 No linked 'dependencies' field found in package.json")
    );
  }
};

export const getLocalPackageInfos: (
  linkFields: LinkField[]
) => Promise<LocalPackageInfo[]> = async (linkFields) => {
  return Promise.all(
    linkFields.map(async (linkField) => {
      const packageJson = await readPackageJson(
        resolve(linkField.path, "package.json")
      );

      return {
        name: linkField.name,
        path: linkField.path,
        files: packageJson.files,
      };
    })
  );
};

export const unlinkAlreadyModules = async (
  packagesInfo: LocalPackageInfo[]
) => {
  const alreadyModules = new Set(
    packagesInfo.map((packageInfo) => packageInfo.name)
  );

  for (const module of alreadyModules) {
    await fs.rm(normalize(resolve(currentPath, "node_modules", module)), {
      recursive: true,
      force: true,
    });
  }
};

export const copyFilesToNodeModules = async (packageInfo: LocalPackageInfo) => {
  if (!packageInfo.files) {
    throw new Error(chalk.red("🔥 Not Found 'files' field in package.json"));
  }

  for (const file of packageInfo.files) {
    const targetPath = resolve(packageInfo.path, file);
    const descPath = resolve(
      currentPath,
      "node_modules",
      packageInfo.name,
      file
    );

    await fs.copy(targetPath, descPath, {
      overwrite: true,
      dereference: true,
    });
  }
};

export const getPackageManager = async (cwd: string) => {
  const workspaceRoot = getWorkspaceRoot(cwd);

  if (!workspaceRoot) {
    throw new Error(chalk.red("🔥 Not Found workspace root"));
  }

  const packageJson = await readPackageJson(
    resolve(workspaceRoot, "package.json")
  );
  if (packageJson.packageManager) {
    const packageManager = packageJson.packageManager.split("@")[0];
    switch (packageManager) {
      case "yarn":
      case "pnpm":
        return packageManager;
    }
  }

  const yarnLockPath = resolve(workspaceRoot, "yarn.lock");
  const pnpmLockPath = resolve(workspaceRoot, "pnpm-lock.yaml");

  const isYarn = await fs.pathExists(yarnLockPath);
  const isPnpm = await fs.pathExists(pnpmLockPath);

  if (isYarn) {
    return "yarn";
  } else if (isPnpm) {
    return "pnpm";
  }
  return null;
};

export const noop = () => {};
