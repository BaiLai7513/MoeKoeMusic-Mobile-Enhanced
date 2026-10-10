/**
 * Expo config plugin —— 注入 AndroidX Media3 (ExoPlayer) 依赖
 *
 * 为什么需要：`expo-build-properties` 只能改 build 配置，无法添加任意 Gradle 依赖；
 * 而 ExoPlayer 必须作为 android/app/build.gradle 的 implementation 依赖存在。
 * 所以这里用 config plugin 在 prebuild 阶段改写 build.gradle，保证
 * `npx expo prebuild` 重新生成 android/ 后依赖依然在（幂等）。
 *
 * 对应改造清单 §2.2：MusicPlayerService / PlayerController 依赖 media3。
 * media3-exoplayer 自带 media3-datasource（含 DefaultHttpDataSource），
 * 不需要额外引 media3-datasource-okhttp；UI 由 RN 提供，也不需要 media3-ui。
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

/** 与 Google Maven 上的最新稳定版对齐（查询自 media3-exoplayer maven-metadata.xml） */
const MEDIA3_VERSION = '1.11.1';

const MEDIA3_DEPS = [
  `implementation "androidx.media3:media3-exoplayer:${MEDIA3_VERSION}"`,
  `implementation "androidx.media3:media3-session:${MEDIA3_VERSION}"`,
];

const MARKER = '// >>> with-media3 (auto-injected)';

module.exports = function withMedia3(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('[with-media3] 仅支持 groovy 格式的 android/app/build.gradle');
    }

    let contents = cfg.modResults.contents;

    // 幂等：重复 prebuild 不会叠加
    if (contents.includes(MARKER)) {
      return cfg;
    }

    if (!/^dependencies\s*\{/m.test(contents)) {
      throw new Error(
        '[with-media3] 在 android/app/build.gradle 中找不到 dependencies { } 块，注入失败'
      );
    }

    const injected = [
      '',
      `    ${MARKER}`,
      ...MEDIA3_DEPS.map((dep) => `    ${dep}`),
      '    // <<< with-media3',
    ].join('\n');

    cfg.modResults.contents = contents.replace(
      /^dependencies\s*\{/m,
      (matched) => `${matched}\n${injected}`
    );

    return cfg;
  });
};
