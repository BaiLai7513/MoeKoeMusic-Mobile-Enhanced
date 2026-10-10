'use strict';

// axios 只安装在 api 子模块自己的 node_modules 下（与下面的 qrcode 同理），
// 不能写成 require('axios')，否则 Metro 在项目根解析不到会直接打包失败。
// 按路径 require 拿到的是同一个模块实例，所以设置 defaults 对 request.js 同样生效。
const axios = require('../../../api/node_modules/axios');

/**
 * 给 axios 设一个**全局默认超时**。
 *
 * 为什么必须在这里设：`api/util/request.js` 构造 requestOptions 时没有传 timeout，
 * 而 axios 默认 `timeout: 0` 表示**永不超时**。于是在没网/网络不通时，
 * 每个请求都会一直挂着，所有页面都停在加载态 —— 实测表现就是「没网彻底歇菜」。
 *
 * 放在本适配层而不是改 `api/` 子模块，是为了子模块升级时不会丢掉这个修复。
 * 15 秒：移动网络下正常请求远用不了这么久，坏网也能在可接受时间内失败。
 */
axios.defaults.timeout = 15000;

const { createRequest } = require('../../../api/util/request.js');
const { calculateMid, generateWebGLHash, getGuid } = require('../../../api/util/util.js');
// qrcode 只安装在 api/node_modules 下，且其入口的图片渲染依赖 canvas/pngjs（RN 里不可用），
// 这里直接引用纯 JS 的编码核心生成点阵，由 UI 层（QrCodeView）自行渲染。
const { create: createQrSymbol } = require('../../../api/node_modules/qrcode/lib/core/qrcode.js');

function createQrMatrix(text) {
  const { modules } = createQrSymbol(text, { errorCorrectionLevel: 'M' });
  return { size: modules.size, data: modules.data };
}

module.exports = {
  createRequest,
  calculateMid,
  generateWebGLHash,
  getGuid,
  createQrMatrix,
};
