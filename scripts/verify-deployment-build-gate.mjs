// Verifica che il comando di build usato dal deployment mantenga il gate
// del percorso cliente del fotolibro prima del build di produzione.
// Legge soltanto .replit e package.json: non avvia servizi e non scrive dati cliente.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const replitPath = path.join(root, '.replit');
const packagePath = path.join(root, 'package.json');
const lifecycleCommand = 'npm run validate:photobook-client-lifecycle';
const releaseCommand = 'npm run build:release';
const productionBuildCommand = 'npm run build';
const checkCommand = 'npm run test:deployment-build-gate';

function fail(message) {
  throw new Error(`Deployment build gate non valido: ${message}`);
}

function readFile(filePath, label) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(`impossibile leggere ${label}: ${error.message}`);
  }
}

function readDeploymentBuild(replit) {
  let inDeploymentSection = false;
  for (const line of replit.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      inDeploymentSection = trimmed === '[deployment]';
      continue;
    }
    if (!inDeploymentSection || !/^build\s*=/.test(trimmed)) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) fail('la sezione [deployment] non contiene un build valido');

    try {
      const build = JSON.parse(trimmed.slice(separator + 1).trim());
      if (!Array.isArray(build) || build.some(part => typeof part !== 'string')) {
        fail('il build di [deployment] deve essere un array di stringhe');
      }
      return build.join(' ');
    } catch (error) {
      fail(`il build di [deployment] non è leggibile: ${error.message}`);
    }
  }

  fail('manca la voce build nella sezione [deployment]');
}

function assertBefore(command, requiredBefore, requiredAfter, description) {
  const beforeIndex = command.indexOf(requiredBefore);
  const afterIndex = command.indexOf(requiredAfter);
  if (beforeIndex === -1) {
    fail(`${description} non invoca "${requiredBefore}"`);
  }
  if (afterIndex === -1) {
    fail(`${description} non invoca "${requiredAfter}"`);
  }
  if (beforeIndex >= afterIndex) {
    fail(`${description} deve invocare "${requiredBefore}" prima di "${requiredAfter}"`);
  }
}

const replit = readFile(replitPath, '.replit');
const packageJson = readFile(packagePath, 'package.json');
let packageData;
try {
  packageData = JSON.parse(packageJson);
} catch (error) {
  fail(`package.json non è JSON valido: ${error.message}`);
}

const scripts = packageData.scripts;
if (!scripts || typeof scripts !== 'object') fail('package.json non contiene gli script npm');
if (!scripts['validate:photobook-client-lifecycle']?.includes('e2e/photobook-client-lifecycle.browser.mjs')) {
  fail(`lo script validate:photobook-client-lifecycle deve invocare e2e/photobook-client-lifecycle.browser.mjs`);
}
if (!fs.existsSync(path.join(root, 'e2e/photobook-client-lifecycle.browser.mjs'))) {
  fail('manca e2e/photobook-client-lifecycle.browser.mjs');
}
if (scripts['test:deployment-build-gate'] !== 'node scripts/verify-deployment-build-gate.mjs') {
  fail('lo script test:deployment-build-gate deve eseguire il controllo di configurazione');
}

const deploymentBuild = readDeploymentBuild(replit);
assertBefore(
  deploymentBuild,
  checkCommand,
  releaseCommand,
  'il build di deployment',
);

const releaseBuild = scripts['build:release'];
if (typeof releaseBuild !== 'string') fail('manca lo script build:release');
assertBefore(
  releaseBuild,
  lifecycleCommand,
  productionBuildCommand,
  'lo script build:release',
);

console.log('Deployment build gate OK: il controllo e il lifecycle cliente precedono il build di produzione.');