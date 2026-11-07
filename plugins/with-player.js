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
 * 4) 还原调试签名用的 debug.keystore
 *
 * **现在只影响本地调试构建**：正式包从 1.0.4 起改用独立的 release 密钥签名，
 * 调试密钥不再决定发布包的身份，因此**不再纳入版本管理**。
 *
 * `expo prebuild` 会清空 android/ 并生成新的随机调试密钥；本地若存在
 * `native/android/keystore/debug.keystore` 就原样拷回（保持本地调试构建可覆盖安装），
 * 不存在则由 prebuild 自己生成 —— 两者都不影响正式发布包。
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
