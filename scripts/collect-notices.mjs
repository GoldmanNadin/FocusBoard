import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const modules = path.join(root, 'node_modules');
const direct = [
  ...Object.keys(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies ?? {}),
  ...Object.keys(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).devDependencies ?? {}),
];

function readPackage(name) {
  const pkgPath = path.join(modules, name, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  let licenseText = '';
  for (const file of readdirSync(path.join(modules, name))) {
    if (/^license/i.test(file)) {
      licenseText = readFileSync(path.join(modules, name, file), 'utf8').trim();
      break;
    }
  }
  return { name, version: pkg.version, license: pkg.license ?? 'siehe Paket', text: licenseText };
}

const entries = direct.map(readPackage);
const body = [
  '# Hinweise zu Drittsoftware',
  '',
  'Dieser Prototyp steht unter der MIT-Lizenz (siehe LICENSE).',
  'Die folgenden Pakete werden direkt verwendet. Die vollständige, festgeschriebene Liste inklusive indirekter Abhängigkeiten steht in package-lock.json.',
  '',
  'React Flow (@xyflow/react) ist MIT-lizenziert. Die sichtbare Kennzeichnung „React Flow“ in der Fläche bleibt erhalten.',
  '',
  ...entries.flatMap((entry) => [
    `## ${entry.name} ${entry.version}`,
    '',
    `Lizenz: ${typeof entry.license === 'string' ? entry.license : JSON.stringify(entry.license)}`,
    '',
    entry.text || '_Kein LICENSE-Text im Paketordner gefunden._',
    '',
  ]),
];
writeFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), body.join('\n'));
console.log(`Wrote notices for ${entries.length} packages.`);
