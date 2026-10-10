/**
 * Expo config plugin —— 注入 Gradle 属性（本机构建可靠性相关）
 *
 * 为什么需要：`npx expo prebuild` 会按模板重新生成 android/gradle.properties，
 * 手动往里加的配置会被覆盖。用 config plugin 注入才能持久、可复现。
 *
 * 注入内容：
 * - 依赖下载的 HTTP 连接/读取超时，避免网络半死时构建无限挂起
 *   （本机曾遇到 NDK 下载卡死在 0 字节、16 分钟无进展）
 * - 重试次数与退避
 * - 调大 Gradle JVM 内存：模板默认 `-Xmx2048m -XX:MaxMetaspaceSize=512m`，
 *   release 构建（R8 + lint）会把元空间撑爆，表现为
 *   `A failure occurred while executing ...AndroidLintWorkAction`
 *   （本机 15.2GB 内存，取值留有余量）
 */
const { withGradleProperties } = require('@expo/config-plugins');

const PROPERTIES = [
  { key: 'systemProp.org.gradle.internal.http.connectionTimeout', value: '120000' },
  { key: 'systemProp.org.gradle.internal.http.socketTimeout', value: '120000' },
  { key: 'systemProp.org.gradle.internal.repository.max.retries', value: '5' },
  { key: 'systemProp.org.gradle.internal.repository.initial.backoff', value: '500' },
  { key: 'org.gradle.jvmargs', value: '-Xmx3072m -XX:MaxMetaspaceSize=1536m' },
];

module.exports = function withGradleProps(config) {
  return withGradleProperties(config, (cfg) => {
    for (const { key, value } of PROPERTIES) {
      const existing = cfg.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) {
        existing.value = value;
      } else {
        cfg.modResults.push({ type: 'property', key, value });
      }
    }
    return cfg;
  });
};
