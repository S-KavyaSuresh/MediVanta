import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const currentDirectory = __dirname;
const dataDirectory = resolve(currentDirectory, "../../../data");
const legacyDataDirectory = resolve(currentDirectory, "../../data");

async function ensureParentDirectory(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true });
}

export function getDataFilePath(fileName: string) {
  return resolve(dataDirectory, fileName);
}

export async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  const filePath = getDataFilePath(fileName);

  try {
    const contents = await readFile(filePath, "utf8");
    return JSON.parse(contents) as T;
  } catch {
    try {
      const legacyContents = await readFile(resolve(legacyDataDirectory, fileName), "utf8");
      return JSON.parse(legacyContents) as T;
    } catch {
      return fallback;
    }
  }
}

export async function writeJsonFile<T>(fileName: string, value: T) {
  const filePath = getDataFilePath(fileName);
  await ensureParentDirectory(filePath);
  const serializedValue = JSON.stringify(value, null, 2);
  await writeFile(filePath, serializedValue, "utf8");

  const legacyFilePath = resolve(legacyDataDirectory, fileName);
  await ensureParentDirectory(legacyFilePath);
  await writeFile(legacyFilePath, serializedValue, "utf8");
}
