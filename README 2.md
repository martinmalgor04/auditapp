# Plantilla de proyecto con ECC

Plantilla reutilizable con [ECC (Everything Claude Code)](https://github.com/affaan-m/ECC) preinstalado para **Cursor** y **Claude Code**. Duplícala cada vez que empieces un proyecto nuevo.

## Qué incluye

| Componente | Ubicación | Descripción |
|------------|-----------|-------------|
| ECC (Cursor) | `.cursor/` | Hooks, reglas, skills, comandos, agentes |
| ECC (Claude Code) | `.claude/` | Perfil `core` + TypeScript a nivel proyecto |
| Instalador ECC | `_ecc/` | Copia local para actualizar o ampliar reglas |
| Onboarding | `/onboard-proyecto` | Comando guiado en español |
| Scripts | `scripts/` | Duplicar, onboard, actualizar ECC |

## Inicio rápido

### 1. Duplicar la plantilla

```bash
cd "/Users/martinmalgor/Documents/template agent developement"
./scripts/duplicate-project.sh mi-nuevo-proyecto
```

Crea `~/Documents/mi-nuevo-proyecto` (o la ruta que indiques) sin `.git` ni `node_modules`.

### 2. Onboarding

**Opción A — Terminal:**

```bash
cd ~/Documents/mi-nuevo-proyecto
./scripts/onboard-project.sh
```

**Opción B — Agente (Cursor o Claude Code):**

Abre la carpeta del proyecto y ejecuta:

```text
/onboard-proyecto
```

### 3. Empezar a codear

Tras el onboarding tendrás `PROJECT.md`, `CLAUDE.md` y ECC ajustado a tu stack. Comandos útiles:

| Comando | Para qué |
|---------|----------|
| `/onboard-proyecto` | Repasar o completar configuración inicial |
| `/project-init` | Detectar stack del repo y plan ECC (dry-run) |
| `/harness-audit` | Verificar hooks, reglas y skills |
| `/ecc-guide` | Explorar capacidades de ECC |
| `/plan` | Planificar una feature |

## Cursor vs Claude Code

Ambos leen configuración **a nivel de proyecto** (no global):

- **Cursor** usa `.cursor/rules/`, `.cursor/hooks.json`, `.cursor/skills/`, `.cursor/commands/`
- **Claude Code** usa `.claude/rules/ecc/`, `.claude/skills/ecc/`, `.claude/commands/`

No mezcles instalación global (`~/.claude/`) con esta plantilla salvo que quieras reglas compartidas entre todos tus repos.

## Actualizar ECC

```bash
./scripts/update-ecc.sh
```

Descarga la última versión de [affaan-m/ECC](https://github.com/affaan-m/ECC) y reaplica el perfil base. Revisa `git diff` antes de commitear.

## Añadir otro lenguaje

```bash
# Cursor
node _ecc/scripts/install-apply.js --target cursor python

# Claude Code (proyecto)
node _ecc/scripts/install-apply.js --target claude-project --profile core --with lang:python
```

O edita `ecc-install.json` y usa `/project-init`.

## Estructura

```text
.
├── .claude/           # ECC para Claude Code
├── .cursor/           # ECC para Cursor
├── .template/         # Metadata de plantilla
├── _ecc/              # Fuente ECC (no commitear node_modules)
├── scripts/
│   ├── duplicate-project.sh
│   ├── onboard-project.sh
│   └── update-ecc.sh
├── PROJECT.md         # Contexto del proyecto (para el agente)
├── CLAUDE.md          # Guía mínima del proyecto (se genera en onboarding)
├── ecc-install.json   # Config de instalación ECC
└── README.md
```

## Mantener la plantilla limpia

Esta carpeta tiene `is_template: true` en `.template/config.yaml`. **No desarrolles productos aquí** — duplica primero con `duplicate-project.sh`.

## Licencia

ECC es [MIT](https://github.com/affaan-m/ECC/blob/main/LICENSE). Esta plantilla es un wrapper personal; respeta la licencia de ECC al redistribuir.
