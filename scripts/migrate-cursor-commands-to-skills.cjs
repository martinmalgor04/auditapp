#!/usr/bin/env node
/**
 * Migra .cursor/commands/*.md al formato Skills de Cursor (frontmatter limpio).
 * Sincroniza skills faltantes desde .cursor/.agents/skills/
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COMMANDS_DIR = path.join(ROOT, '.cursor', 'commands');
const SKILLS_DIR = path.join(ROOT, '.cursor', 'skills');
const AGENTS_SKILLS_DIR = path.join(ROOT, '.cursor', '.agents', 'skills');

function splitFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { frontmatter: {}, body: content.trim() };
  }
  const frontmatter = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    frontmatter[key] = value;
  }
  return { frontmatter, body: content.slice(match[0].length).trim() };
}

function stripLeadingFrontmatter(body) {
  const again = body.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return again ? body.slice(again[0].length).trim() : body.trim();
}

function migrateCommand(commandPath) {
  const name = path.basename(commandPath, '.md');
  if (!/^[a-z0-9-]+$/.test(name)) {
    return { name, status: 'skipped-invalid-name' };
  }

  const raw = fs.readFileSync(commandPath, 'utf8');
  const { frontmatter, body } = splitFrontmatter(raw);
  const cleanBody = stripLeadingFrontmatter(body);

  let description = frontmatter.description || '';
  if (!description) {
    const heading = cleanBody.match(/^#\s+(.+)$/m);
    description = heading
      ? heading[1].replace(/^\/+/, '').trim()
      : name.replace(/-/g, ' ');
  }

  if (description.length > 1024) {
    description = description.slice(0, 1021) + '...';
  }

  const skillDir = path.join(SKILLS_DIR, name);
  const skillFile = path.join(skillDir, 'SKILL.md');
  const skillContent = `---
name: ${name}
description: ${description}
disable-model-invocation: true
origin: ECC
---

${cleanBody}
`;

  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(skillFile, skillContent);
  return { name, status: 'migrated' };
}

function syncAgentSkills() {
  if (!fs.existsSync(AGENTS_SKILLS_DIR)) return 0;
  let synced = 0;
  for (const entry of fs.readdirSync(AGENTS_SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dest = path.join(SKILLS_DIR, entry.name);
    if (!fs.existsSync(dest)) {
      fs.cpSync(path.join(AGENTS_SKILLS_DIR, entry.name), dest, { recursive: true });
      synced += 1;
    }
  }
  return synced;
}

function main() {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  const results = [];

  if (fs.existsSync(COMMANDS_DIR)) {
    for (const file of fs.readdirSync(COMMANDS_DIR)) {
      if (!file.endsWith('.md')) continue;
      results.push(migrateCommand(path.join(COMMANDS_DIR, file)));
    }
  }

  const synced = syncAgentSkills();
  const migrated = results.filter((r) => r.status === 'migrated').length;
  console.log(`Comandos migrados a skills: ${migrated}`);
  console.log(`Skills sincronizadas desde .agents/skills: ${synced}`);
}

main();
