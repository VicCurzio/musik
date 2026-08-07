#!/usr/bin/env node
/**
 * Cierra una versión: sube el número en package.json, convierte la sección
 * "Sin publicar" del CHANGELOG en una versión fechada y deja todo listo para
 * commitear.
 *
 *   node scripts/release.mjs patch      # 1.3.0 -> 1.3.1  (arreglos)
 *   node scripts/release.mjs minor      # 1.3.0 -> 1.4.0  (cosas nuevas)
 *   node scripts/release.mjs major      # 1.3.0 -> 2.0.0  (cambio grande)
 *   node scripts/release.mjs 2.1.0      # número exacto
 *
 * Opciones:
 *   --dry     muestra qué haría, sin escribir nada
 *   --tag     además crea el tag de git vX.Y.Z
 *
 * No tiene dependencias a propósito: cualquier repo puede copiar este archivo.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(root, 'package.json');
const changelogPath = join(root, 'CHANGELOG.md');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const shouldTag = args.includes('--tag');
const bump = args.find((a) => !a.startsWith('--')) || 'patch';

function fail(message) {
  console.error(`\nError: ${message}\n`);
  process.exit(1);
}

function nextVersion(current, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;

  const [major, minor, patch] = current.split('.').map((n) => parseInt(n, 10) || 0);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;

  fail(`no entiendo "${kind}". Usá major, minor, patch o un número tipo 2.1.0.`);
}

function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ---------------------------------------------------------------------------

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const changelog = readFileSync(changelogPath, 'utf8');

const version = nextVersion(pkg.version, bump);

const unreleasedHeading = /^##\s*\[(Sin publicar|Unreleased)\]\s*$/im;
const match = changelog.match(unreleasedHeading);
if (!match) {
  fail('no encontré la sección "## [Sin publicar]" en CHANGELOG.md.');
}

const startOfSection = changelog.indexOf(match[0]) + match[0].length;
const rest = changelog.slice(startOfSection);
const nextHeadingIndex = rest.search(/^##\s*\[/m);
const notes = (nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex)).trim();

if (!notes) {
  fail(
    'la sección "Sin publicar" está vacía.\n' +
      'Agregá al menos una línea contando qué cambió, en palabras del usuario.\n' +
      'Ejemplo:\n\n  ### Agregado\n  - Ahora se pueden ordenar las listas a mano.\n'
  );
}

// El \n final garantiza una línea en blanco entre el encabezado nuevo y las
// notas que quedaban debajo de "Sin publicar".
const updatedChangelog = changelog.replace(
  match[0],
  `${match[0]}\n\n## [${version}] - ${today()}\n`
);

if (dryRun) {
  console.log(`\nVersión: ${pkg.version} -> ${version}`);
  console.log(`Fecha:   ${today()}`);
  console.log('\nNotas que se publican:\n');
  console.log(notes.replace(/^/gm, '  '));
  console.log('\n(--dry: no se escribió nada)\n');
  process.exit(0);
}

pkg.version = version;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
writeFileSync(changelogPath, updatedChangelog);

console.log(`\nVersión ${version} lista.`);
console.log('  package.json actualizado');
console.log('  CHANGELOG.md actualizado');

if (shouldTag) {
  try {
    execSync(`git add package.json CHANGELOG.md`, { cwd: root, stdio: 'inherit' });
    execSync(`git commit -m "Release v${version}"`, { cwd: root, stdio: 'inherit' });
    execSync(`git tag v${version}`, { cwd: root, stdio: 'inherit' });
    console.log(`  commit y tag v${version} creados`);
  } catch {
    console.warn('  no se pudo commitear/taggear (¿hay cambios sin guardar?)');
  }
} else {
  console.log(`\nFalta: revisar, commitear y taggear.\n  git tag v${version}\n`);
}
