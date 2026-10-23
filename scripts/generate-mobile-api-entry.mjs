import { promises as fs } from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const apiModulesDir = path.join(rootDir, 'api', 'module');
const generatedDir = path.join(rootDir, 'src', 'lib', 'kugou-api', 'generated');
const generatedJsPath = path.join(generatedDir, 'modules.js');
const generatedDtsPath = path.join(generatedDir, 'modules.d.ts');

/**
 * Node 内置模块名集合。
 *
 * 用 `builtinModules` 而不是手写清单：手写清单会随着上游子模块升级悄悄过期
 * （比如哪天有人 require 了 'node:test'），而这里不需要维护。
 * `builtinModules` 不带 `node:` 前缀，所以统一剥掉再比。
 */
const NODE_BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, '')));

/**
 * `metro.config.js` 里**已经做了垫片**的内置模块。
 *
 * 只有 `crypto`：垫片在 `metro/crypto-shim.js`，只实现 `createHash('md5')`
 * （`user_grade_info.js` 真正用到的全部）。`zlib` / `net` / `fs` 都**没有**垫片 ——
 * 用它们的模块本次不做（逐首播放上报）。
 */
const SHIMMED_BUILTINS = new Set(['crypto']);

/**
 * 允许**留在生成列表里**的模块：它们虽然 require 了 Node 内置，
 * 但那些内置已经在 `metro.config.js` 里被垫片接管了。
 *
 * 显式白名单而不是「按内置清单自动放行」：`crypto` 有垫片不等于所有
 * require('crypto') 的模块都该编进来 —— 其中大部分模块用到的 crypto API
 * 远不止 md5，编进来就是运行时报错。这里只放真正需要的那一个。
 *
 * 新增垫片时的做法：在 `metro.config.js` 加 `extraNodeModules` 映射、
 * 把内置名加进上面的 `SHIMMED_BUILTINS`、再把模块名加进这个白名单。
 */
const SHIMMED_MODULES = new Set(['user_grade_info']);

const REQUIRE_PATTERN = /\brequire\(\s*(['"])([^'"]+)\1\s*\)/g;

/** 去掉注释，免得把注释里「不要写成 require('fs')」这种说明当成真依赖。 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * 这个模块直接 require 了哪些 Node 内置模块。
 *
 * 只看**字面量** require（Metro 打包期也只解析字面量）：动态拼接的 require
 * 本来就不是 Metro 能打包的写法，不在这里处理。
 */
function requiredNodeBuiltins(source) {
  const found = new Set();

  for (const match of stripComments(source).matchAll(REQUIRE_PATTERN)) {
    const specifier = match[2].replace(/^node:/, '');
    // 只关心裸模块名；'./x'、'../x'、'@scope/x' 都不是内置。
    if (!NODE_BUILTINS.has(specifier) || specifier.includes('/')) {
      continue;
    }
    found.add(specifier);
  }

  return [...found].sort();
}

/**
 * 决定一个模块能不能写进生成文件。
 *
 * 返回 `{ include, reason }`：`reason` 只在跳过时用于告警，
 * 让「为什么这个接口不能用」在构建日志里是可审计的，而不是靠翻 git 历史。
 */
function classifyModule(name, source) {
  const builtins = requiredNodeBuiltins(source);

  if (builtins.length === 0) {
    return { include: true, builtins };
  }

  const unshimmed = builtins.filter((builtin) => !SHIMMED_BUILTINS.has(builtin));
  if (unshimmed.length > 0) {
    return {
      include: false,
      builtins,
      reason: `require Node 内置 ${unshimmed.join(', ')}（RN 里没有、也没做垫片）`,
    };
  }

  if (!SHIMMED_MODULES.has(name)) {
    return {
      include: false,
      builtins,
      reason: `require Node 内置 ${builtins.join(', ')}（有垫片，但本模块不在 SHIMMED_MODULES 白名单里）`,
    };
  }

  return { include: true, builtins };
}

function createModulesJs(moduleNames) {
  const lines = [
    "'use strict';",
    '',
    'const generatedModuleNames = Object.freeze([',
    ...moduleNames.map((name) => `  '${name}',`),
    ']);',
    '',
    'const modules = {',
    ...moduleNames.map(
      (name) =>
        `  ${JSON.stringify(name)}: (params, useAxios) => require(${JSON.stringify(`../../../../api/module/${name}.js`)})(params, useAxios),`
    ),
    '};',
    '',
    'module.exports = { generatedModuleNames, modules };',
    '',
  ];

  return lines.join('\n');
}

function createModulesDts(moduleNames) {
  const union = moduleNames.length === 0 ? 'never' : moduleNames.map((name) => `  | '${name}'`).join('\n');
  const lines = [
    "import type { RawApiModule } from '../types';",
    '',
    'export type GeneratedModuleName =',
    `${union};`,
    '',
    'export declare const generatedModuleNames: readonly GeneratedModuleName[];',
    'export declare const modules: Record<GeneratedModuleName, RawApiModule>;',
    '',
  ];

  return lines.join('\n');
}

async function main() {
  const entries = await fs.readdir(apiModulesDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js') && !entry.name.startsWith('_'))
    .map((entry) => entry.name.replace(/\.js$/i, ''))
    .sort((left, right) => left.localeCompare(right));

  const moduleNames = [];
  const skipped = [];

  for (const name of candidates) {
    const source = await fs.readFile(path.join(apiModulesDir, `${name}.js`), 'utf8');
    const { include, reason } = classifyModule(name, source);

    if (include) {
      moduleNames.push(name);
    } else {
      skipped.push({ name, reason });
    }
  }

  // 每次跳过都单独打一行：构建日志里能直接看出少了哪些接口、为什么。
  for (const { name, reason } of skipped) {
    console.warn(`  skip api/module/${name}.js — ${reason}`);
  }
  if (skipped.length > 0) {
    console.warn(
      `跳过 ${skipped.length} / ${candidates.length} 个依赖 Node 内置模块的接口（这些接口在 App 里不可用）`
    );
  }

  await fs.mkdir(generatedDir, { recursive: true });
  await fs.writeFile(generatedJsPath, createModulesJs(moduleNames), 'utf8');
  await fs.writeFile(generatedDtsPath, createModulesDts(moduleNames), 'utf8');

  console.log(`generated ${moduleNames.length} mobile api wrappers (skipped ${skipped.length})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
