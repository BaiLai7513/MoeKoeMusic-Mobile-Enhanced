<div align="center">

<img src="assets/images/icon.png" width="200" alt="MoeKoe Music" />

# MoeKoe Music Mobile · 个人增强版

一个自用的第三方酷狗音乐安卓客户端，在官方 [MoeKoeMusic-Mobile](https://github.com/MoeKoeMusic/MoeKoeMusic-Mobile) 基础上做的个人化改造。

**仅供个人学习与技术研究使用。**

[![React Native](https://img.shields.io/badge/React%20Native-0.86-61DAFB?logo=react&logoColor=white)](https://reactnative.dev/)
[![Expo SDK](https://img.shields.io/badge/Expo-SDK%2057-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![Platform](https://img.shields.io/badge/Platform-Android%20arm64--v8a-3DDC84?logo=android&logoColor=white)](#)
[![License](https://img.shields.io/badge/License-GPL--2.0-blue.svg)](LICENSE)

</div>

---

## 这是什么

官方移动端很好用，但**播放内核**和**离线能力**上有些我想改的地方。这个版本针对以下问题做了重做：

| 问题 | 这里怎么解决 |
|---|---|
| 后台容易被杀、音频解码 CPU 偏高 | 换成 **media3 ExoPlayer** + `MediaSessionService`（实测后台播放 CPU 从 ~22% 降到 **3.4%**） |
| 切歌单不生效、播放状态对不上 | 重做队列与原生播放列表的同步（两道守卫防串曲） |
| 没网时整个 App 卡死 | 请求超时 + **多级离线缓存**（资料 / 歌单 / 音频 / 歌词 / 封面） |
| 播放状态偶尔对不上 | 重做队列与原生播放列表的同步（两道守卫防串曲） |
| 只能在线听 | 本地音乐纳入统一队列 + 播过的歌自动落盘、断网可重放 |

### 具体改动

- **播放内核重做** —— ExoPlayer + `MediaSessionService`，媒体通知 / 锁屏 / 耳机 / 车机控件完整可用
- **离线可用** —— 个人资料、歌单、首页推荐、**音频、歌词、封面** 全部本地缓存；断网时能正常浏览并重放听过的歌
- **播放缓存** —— 以**歌曲 hash** 为缓存键（酷狗直链带时间戳、每次都变，用 URL 当键会永远不命中）
- **音质可选** —— 128 / 320 / FLAC / Hi-Res 等档位，拿不到自动降级
- **本地音乐** —— 扫描手机里的音频并纳入统一播放队列
- **登录** —— 短信 / 账号密码 / 扫码；并针对频繁操作做了限流，降低账号风险

> **其他功能请自行探索。**

### 最近更新（1.0.4）

- **播放更省**：预解析按播放模式只备 1–3 首（原来一次铺 9–10 首）；单曲循环与随机模式不再做无用请求。
- **歌单不再断**：后台补齐分页时原生播放列表同步追加，「播放全部」能连续播完整个歌单。
- **日志更全**：搜索、识曲、下载、登录、播放都有记录，且只写在本地、不上传。
- **签名独立**：改用独立 release 密钥签名，详见下方「安装」。

---

## 一些值得记录的坑

> 完整的记录（「现象 → 根因 → 解法」、设计思路、改善方向）见 [开发文档.md](开发文档.md)。

---

## 构建

需要 Node.js、JDK 17+、Android SDK（NDK + CMake）。

```bash
# 1. 依赖（注意 --recursive，api/ 是子模块）
git clone --recursive https://github.com/BaiLai7513/MoeKoeMusic-Mobile-Enhanced.git
cd MoeKoeMusic-Mobile-Enhanced
npm install
cd api && npm install --omit=dev && cd ..

# 2. 生成原生工程（会调用 plugins/ 下的 config plugin 注入原生播放器）
npx expo prebuild --platform android

# 3. 构建
cd android && ./gradlew :app:assembleRelease
```

产物：`android/app/build/outputs/apk/release/app-release.apk`

> **为什么要 `--recursive`**：`api/` 是指向 [KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi) 的子模块，直链解析依赖它。

---

## 安装

从 [Releases](https://github.com/BaiLai7513/MoeKoeMusic-Mobile-Enhanced/releases) 下载 APK 安装即可（需允许「安装未知来源应用」）。

**仅支持 Android arm64-v8a。**

> ⚠️ **关于签名**
>
> 从 **1.0.4** 起使用独立的 release 密钥签名。因此：
>
> - **升级到 1.0.4 需要先卸载旧版**，再安装（会丢失登录态与已下载歌曲）；
> - 或使用 root + 核心破解类工具（如 LSPosed 的 Core Patch）绕过签名校验覆盖安装；
> - Releases 里同时提供一份沿用旧签名的兼容包 `…-legacy-sign.apk`，可直接覆盖升级，用于不方便卸载的场景。

---

## 致谢

本项目站在这些项目肩上，**核心能力几乎全部来自它们**：

| 项目 | 作者 | 本项目用到了什么 |
|---|---|---|
| [MoeKoeMusic](https://github.com/iAJue/MoeKoeMusic) | [iAJue](https://github.com/iAJue) | 项目的源头；桌面版是直链解析逻辑的参照实现 |
| [MoeKoeMusic-Mobile](https://github.com/MoeKoeMusic/MoeKoeMusic-Mobile) | MoeKoeMusic | 本仓库的上游，界面与业务层基础 |
| [KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi) | [MakcRe](https://github.com/MakcRe) | 酷狗 API 适配层（`api/` 子模块） |
| [media3 / ExoPlayer](https://github.com/androidx/media) | AndroidX | 播放内核与媒体会话 |

感谢原作者们的开源与分享。

---

## 开源协议

**[GPL-2.0](LICENSE)** —— 继承自上游项目。

你可以自由使用、修改、分发，但**衍生作品必须以相同协议开源**。

---

## 免责声明

> **请务必阅读以下内容。**

1. **本项目仅供个人学习与技术研究使用**，不得用于任何商业用途。
2. 本项目**不提供、不存储、不传播任何音乐内容**。所有音乐数据均来自第三方平台（酷狗音乐）的公开接口，**版权归各版权方所有**。
3. 本项目**与酷狗音乐及其关联公司无任何关系**，未获得其授权、认可或赞助。
4. 本项目**不含任何破解、绕过付费或侵犯版权的内容**。VIP 相关能力均基于用户**本人账号已有的合法权益**（例如官方活动赠送的每日 VIP），不做任何越权获取。
5. 使用本项目**可能违反第三方平台的服务条款**，请自行评估风险。**因使用本项目产生的一切后果（包括但不限于账号被限制、数据丢失等）由使用者自行承担**，作者不承担任何责任。
6. 请于下载后 **24 小时内删除**。如果你喜欢某首音乐，**请通过官方渠道购买或开通会员以支持创作者**。
7. 本项目按「现状」提供，**不提供任何明示或暗示的担保**。
8. 如有侵权，请联系删除。

**下载或使用本项目即表示你已阅读、理解并同意上述全部条款。**
