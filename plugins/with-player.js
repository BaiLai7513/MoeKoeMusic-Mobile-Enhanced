/**
 * Expo config plugin —— 注册原生播放器
 *
 * 背景：`npx expo prebuild` 会**清空整个 android/ 目录**，手写在
 * `android/app/src/main/java/...` 里的 Kotlin 源码会连同目录一起被删掉。
 * 因此原生源码统一放在项目根目录的 `native/android/`，由本插件在 prebuild
 * 阶段拷回 android/，并在 manifest / MainApplication 里完成注册。
 *
 * 本插件做四件事：
 * 1. 拷贝 `native/android/**` → `android/app/src/main/java/**`
 * 2. AndroidManifest 声明 MusicPlayerService（必须带
 *    `androidx.media3.session.MediaSessionService` 的 intent-filter，
 *    系统 / 车机 / Android Auto 才找得到）
 * 3. MainApplication 的 `PackageList(this).packages.apply { }` 里注册 PlayerPackage
 * 4. 还原签名用的 debug.keystore（否则 prebuild 会换成新随机密钥，老用户无法覆盖升级）
 */
const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
} = require('@expo/config-plugins');

const SERVICE_NAME = 'com.moekoe.music.player.MusicPlayerService';
const PACKAGE_CLASS = 'com.moekoe.music.player.PlayerPackage';
const NATIVE_SRC_REL = path.join('native', 'android', 'player');
const JAVA_DEST_REL = path.join(
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'moekoe',
  'music',
  'player'
);
const KEYSTORE_SRC_REL = path.join('native', 'android', 'keystore', 'debug.keystore');
const KEYSTORE_DEST_REL = path.join('android', 'app', 'debug.keystore');
const PKG_MARKER = 'with-player-package';

/** 1) 把暂存的原生源码拷回 android/ */
function withPlayerSources(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const srcDir = path.join(projectRoot, NATIVE_SRC_REL);
      const destDir = path.join(projectRoot, JAVA_DEST_REL);

      if (!fs.existsSync(srcDir)) {
        throw new Error(`[with-player] 找不到原生源码目录: ${srcDir}`);
      }

      fs.mkdirSync(destDir, { recursive: true });

      const copied = [];
      for (const name of fs.readdirSync(srcDir)) {
        if (!name.endsWith('.kt') && !name.endsWith('.java')) continue;
        fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
        copied.push(name);
      }

      if (copied.length === 0) {
        throw new Error(`[with-player] ${srcDir} 里没有 .kt/.java 文件`);
      }

      console.log(`[with-player] 已拷贝 ${copied.length} 个原生源文件: ${copied.join(', ')}`);
      return cfg;
    },
  ]);
}

/** 2) 声明 MediaSessionService */
function withPlayerService(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('[with-player] AndroidManifest 中没有 <application>');
    }

    application.service = application.service || [];
    const already = application.service.some(
      (entry) => entry.$?.['android:name'] === SERVICE_NAME
    );
    if (already) {
      return cfg;
    }

    application.service.push({
      $: {
        'android:name': SERVICE_NAME,
        'android:exported': 'true',
        'android:foregroundServiceType': 'mediaPlayback',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'androidx.media3.session.MediaSessionService' } }],
        },
      ],
    });

    return cfg;
  });
}

/** 3) 注册 PlayerPackage */
function withPlayerPackage(config) {
  return withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error(
        `[with-player] 仅支持 Kotlin 版 MainApplication，当前是 "${cfg.modResults.language}"`
      );
    }

    const contents = cfg.modResults.contents;
    if (contents.includes(PKG_MARKER)) {
      return cfg;
    }

    const anchor = 'PackageList(this).packages.apply {';
    if (!contents.includes(anchor)) {
      throw new Error(`[with-player] MainApplication 中找不到锚点: ${anchor}`);
    }

    cfg.modResults.contents = contents.replace(
      anchor,
      `${anchor}\n            // ${PKG_MARKER}\n            add(${PACKAGE_CLASS}())`
    );

    return cfg;
  });
}

/**
 * 4) 还原签名用的 debug.keystore
 *
 * **为什么必须做**：Android 不允许「签名不同」的 APK 覆盖安装
 * （`INSTALL_FAILED_UPDATE_INCOMPATIBLE`），用户只能先卸载 —— 连带丢掉登录态。
 * 而 `expo prebuild` 会把 android/ 清空并**重新生成一个全新的随机 debug 密钥**，
 * 签名一变，所有老用户就再也升级不上去了。
 *
 * 因此把该密钥纳入版本管理，prebuild 后原样拷回，保证跨版本签名恒定。
 * （这是个人项目在「不上架应用商店」前提下的务实取舍：密钥公开，
 *   但换来了可预期的覆盖升级。若日后要正经分发，应改用独立 release 密钥
 *   并接受一次「必须卸载重装」的迁移。）
 */
function withDebugKeystore(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const src = path.join(projectRoot, KEYSTORE_SRC_REL);
      const dest = path.join(projectRoot, KEYSTORE_DEST_REL);

      if (!fs.existsSync(src)) {
        console.warn(
          `[with-player] 未找到 ${src}，将沿用 prebuild 生成的随机密钥（签名会变，老用户无法覆盖安装）`
        );
        return cfg;
      }

      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      console.log('[with-player] 已还原 debug.keystore（保证 APK 签名跨版本一致）');
      return cfg;
    },
  ]);
}

module.exports = function withPlayer(config) {
  return withDebugKeystore(
    withPlayerPackage(withPlayerService(withPlayerSources(config)))
  );
};
