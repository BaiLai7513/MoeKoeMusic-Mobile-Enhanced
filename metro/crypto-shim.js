'use strict';

/**
 * `crypto` 的 Metro 垫片 —— 只为「RN 里没有 Node 内置模块」这件事存在。
 *
 * ## 为什么需要它
 *
 * `api/module/user_grade_info.js`（听歌等级 / 时长同步）顶部直接写了
 * `require('crypto')`，而 Metro 打包期就要解析这行字面量 require：
 * RN 运行时没有 Node 内置模块，也没有 polyfill，于是整个包编不过。
 * 该文件真正用到的只有 **`createHash('md5').update(str).digest('hex')`** ——
 * 两处 `key` / `md5` 校验摘要，纯摘要计算，不涉及密钥、随机数、签名。
 *
 * 所以这里不实现「Node crypto」，只实现那一个 API 子集；
 * 用 `crypto-js`（已在 `api/node_modules` 里，是上游 `api/util/crypto.js` 自己
 * 也在用的实现，摘要结果与 Node 完全一致）。
 *
 * ## 为什么按相对路径 require
 *
 * `crypto-js` 只装在子模块自己的 `api/node_modules` 下，项目根解析不到；
 * 与 `src/lib/kugou-api/runtime.js` 里 require axios 的写法同理，
 * 必须走相对路径，Metro 才不会在项目根的 node_modules 里空找。
 *
 * ## 故意不实现的东西
 *
 * RSA / AES / 随机数 / Buffer 流式摘要都不在这里做 —— 上游用到它们的模块
 * （`api/util/crypto.js` 等）本来就走纯 JS 的 crypto-js / node-forge，
 * 并不 require Node 的 `crypto`。**一旦有模块用到本文件没实现的方法，这里会抛错**，
 * 而不是静默算出一个错误的摘要：宁可打包/运行时报错，也不要发一个签名对不上的请求。
 */

// 注意：这里必须是相对路径（见文件头），不能写成 require('crypto-js')。
const CryptoJS = require('../api/node_modules/crypto-js');

/**
 * 允许的算法 → crypto-js 的增量哈希实现。
 *
 * 只放三个常见摘要：`md5` 是上游实际用到的，`sha1`/`sha256` 顺手补上，
 * 免得将来某个模块换了算法就直接崩。**不**支持 HMAC / 加盐 / 密码派生。
 */
const HASH_ALGORITHMS = {
  md5: CryptoJS.algo.MD5,
  sha1: CryptoJS.algo.SHA1,
  sha256: CryptoJS.algo.SHA256,
};

/** `digest()` 支持的输出编码：Node 这边上游只用 `hex`，`base64` 是低成本的顺带。 */
const DIGEST_ENCODINGS = {
  hex: CryptoJS.enc.Hex,
  base64: CryptoJS.enc.Base64,
};

/**
 * 模仿 Node 的 `Hash`：`update()` 可链式多次调用，`digest()` 结束。
 *
 * 用 crypto-js 的增量 hasher（而不是把整串攒起来再算）是为了让
 * 「多次 update + 一次 digest」的行为与 Node 一致，不受字符串长度影响。
 */
function createHash(algorithm) {
  const normalized = String(algorithm).toLowerCase();
  const hasher = HASH_ALGORITHMS[normalized];

  if (!hasher) {
    // 显式报错而不是退回 md5：算错摘要比编不过更难查（请求会被服务端拒收）。
    throw new Error(
      `[crypto-shim] 不支持的摘要算法 "${algorithm}"，当前垫片只实现 ${Object.keys(HASH_ALGORITHMS).join(' / ')}`
    );
  }

  // crypto-js 的 hasher 是一次性的：digest() 之后就不能再 update，
  // 所以这里记一个状态位，把「重复 digest」变成明确错误而不是算出一个空摘要。
  const instance = hasher.create();
  let finalized = false;

  const hash = {
    update(data) {
      if (finalized) {
        throw new Error('[crypto-shim] digest() 之后不能再 update()');
      }

      // Node 的 update 接受 string / Buffer / TypedArray；上游只传字符串，
      // 其余类型统一按字符串处理（crypto-js 会自己调用 toString）。
      instance.update(typeof data === 'string' ? data : String(data));
      return hash;
    },

    digest(encoding) {
      if (finalized) {
        throw new Error('[crypto-shim] digest() 只能调用一次');
      }
      finalized = true;

      const wordArray = instance.finalize();

      if (encoding == null) {
        // Node 无参返回 Buffer。这里没有引 buffer 包（会多一个打包依赖），
        // 直接抛错逼调用方写明编码 —— 上游两处都写的是 'hex'。
        throw new Error("[crypto-shim] digest() 必须指定编码（'hex' 或 'base64'）");
      }

      const encoder = DIGEST_ENCODINGS[String(encoding).toLowerCase()];
      if (!encoder) {
        throw new Error(`[crypto-shim] 不支持的输出编码 "${encoding}"`);
      }

      return wordArray.toString(encoder);
    },
  };

  return hash;
}

module.exports = {
  createHash,
};
