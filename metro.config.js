'use strict';

/**
 * Metro 配置。
 *
 * ## 为什么这里必须存在一个 metro.config.js
 *
 * `api/` 是一个 git 子模块（KuGouMusicApi），它的 `module/*.js` 是按 **Node** 环境写的，
 * 其中 `user_grade_info.js`（听歌等级 / 时长同步要用）直接 `require('crypto')`。
 * 生成脚本 `scripts/generate-mobile-api-entry.mjs` 会把这些模块写成字面量 require，
 * 于是 Metro **打包期**就要解析 `crypto` —— 而 RN 没有 Node 内置模块，
 * 结果就是整个包编不过，而不是某个功能不可用。
 *
 * 这里用 `resolver.extraNodeModules` 把 `crypto` 指到本地垫片
 * （`metro/crypto-shim.js`，只实现 `createHash('md5')` 这一个子集，原因见该文件注释）。
 *
 * ## 为什么不给 zlib / net 也做垫片
 *
 * 只有 `user_listen_report.js`（逐首播放上报）用它们。本次只做等级同步、不做逐首流水，
 * 那个模块由生成脚本直接跳过（它不会被写进 `generated/modules.js`，Metro 就不会去解析）。
 * 给 zlib 做垫片等于把 gzip 压缩实现搬进包里，收益为零、风险很大。
 *
 * ## 注意
 *
 * `extraNodeModules` 是 Metro 在「层级 node_modules 查找失败之后」才用的**兜底**，
 * 所以它不会影响任何本来能解析的包（axios / crypto-js / qrcode 仍在 api/node_modules 里命中）。
 */

const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: path.resolve(__dirname, 'metro', 'crypto-shim.js'),
};

module.exports = config;
