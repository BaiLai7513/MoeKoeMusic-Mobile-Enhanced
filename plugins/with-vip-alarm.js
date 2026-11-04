/**
 * Expo config plugin —— 每日 VIP 自动领取的闹钟 / 重启恢复声明
 *
 * ## 为什么必须是 config plugin
 *
 * `npx expo prebuild` 会**清空整个 android/**，手改 `android/app/src/main/AndroidManifest.xml`
 * 在下次 prebuild 就没了。所以权限与广播接收者统一在这里注入，保证可重复、幂等。
 *
 * ## 注入内容
 *
 * | 声明 | 为什么需要 |
 * |---|---|
 * | `SCHEDULE_EXACT_ALARM` | Android 12+ 才有的「精确闹钟」权限。13+ 新装默认不授予，此时代码侧会平滑降级为 `setAndAllowWhileIdle`，**不会**静默失效（见 VipAlarmScheduler） |
 * | `RECEIVE_BOOT_COMPLETED` | 重启后闹钟会被系统清空，必须靠 BOOT_COMPLETED 恢复排期 |
 * | `VipAlarmReceiver` | AlarmManager 的到期广播。`exported=false`：PendingIntent 由本应用发出，不需要对外开放 |
 * | `VipBootReceiver` | BOOT_COMPLETED / 覆盖安装 / 精确闹钟权限变更后恢复排期 |
 *
 * 接收者名字必须与 `native/android/player/` 里的类名、包名一致
 * （`with-player.js` 负责把源码拷进 `android/app/src/main/java/...`）。
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const PACKAGE = 'com.moekoe.music.player';
const ALARM_RECEIVER = `${PACKAGE}.VipAlarmReceiver`;
const BOOT_RECEIVER = `${PACKAGE}.VipBootReceiver`;
const CLAIM_SERVICE = `${PACKAGE}.VipClaimService`;

const PERMISSIONS = [
  // Android 12+ 精确闹钟。是否真的能用由运行期 canScheduleExactAlarms() 决定，
  // 被拒时降级为 setAndAllowWhileIdle + 回前台兜底。
  'android.permission.SCHEDULE_EXACT_ALARM',
  // 重启恢复：没有它，用户重启一次手机之后「到期自动领取」就永久失效。
  'android.permission.RECEIVE_BOOT_COMPLETED',
  // 闹钟到点且进程已被回收时，用前台服务把 JS 拉起来跑一次 headless 领取。
  'android.permission.FOREGROUND_SERVICE',
];

/** 幂等地往 manifest 里加一条 uses-permission。 */
function addPermission(manifest, name) {
  manifest['uses-permission'] = manifest['uses-permission'] || [];
  const exists = manifest['uses-permission'].some(
    (entry) => entry.$ && entry.$['android:name'] === name
  );
  if (!exists) {
    manifest['uses-permission'].push({ $: { 'android:name': name } });
  }
}

/** 幂等地加/更新一个 receiver（按 android:name 匹配）。 */
function upsertReceiver(receivers, receiver) {
  const name = receiver.$['android:name'];
  const index = receivers.findIndex((entry) => entry.$ && entry.$['android:name'] === name);
  if (index >= 0) {
    receivers[index] = receiver;
    return;
  }
  receivers.push(receiver);
}

module.exports = function withVipAlarm(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    PERMISSIONS.forEach((name) => addPermission(manifest, name));

    const application = manifest.application && manifest.application[0];
    if (!application) {
      throw new Error('[with-vip-alarm] AndroidManifest 中没有 <application>');
    }

    application.receiver = application.receiver || [];

    // 到期广播：只接自己发出的 PendingIntent，不对外暴露。
    upsertReceiver(application.receiver, {
      $: {
        'android:name': ALARM_RECEIVER,
        'android:enabled': 'true',
        'android:exported': 'false',
      },
    });

    /*
     * 恢复广播。
     *
     * - BOOT_COMPLETED：重启后闹钟全丢，必须重排；
     * - MY_PACKAGE_REPLACED：覆盖安装同样会清掉闹钟；
     * - QUICKBOOT_POWERON：部分国产 ROM 的「快速开机」私有广播，顺手兼容；
     * - SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED：Android 12+ 用户授予/收回
     *   精确闹钟权限时重排一次（授权后可从 inexact 升到 exact）。
     *
     * exported=true 是必须的：这几个都是系统广播，接收者要允许系统投递；
     * 它们本身是 protected broadcast，第三方应用发不出来，所以不存在被外部刷的风险。
     */
    upsertReceiver(application.receiver, {
      $: {
        'android:name': BOOT_RECEIVER,
        'android:enabled': 'true',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
            { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
            { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
            {
              $: {
                'android:name':
                  'android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED',
              },
            },
          ],
        },
      ],
    });

    /*
     * headless 领取服务。
     *
     * 闹钟到点、但进程已经被系统回收时，用它把 JS 运行时拉起来跑一次领取
     * （`VipClaimService` + JS 侧注册的 `MoeKoeVipClaimTask`）。
     * `shortService` 是 Android 14 为「几十秒内跑完的短任务」新增的前台服务类型，
     * 不需要额外的前台服务类型权限。
     */
    application.service = application.service || [];
    upsertReceiver(application.service, {
      $: {
        'android:name': CLAIM_SERVICE,
        'android:enabled': 'true',
        'android:exported': 'false',
        'android:stopWithTask': 'false',
        'android:foregroundServiceType': 'shortService',
      },
    });

    return cfg;
  });
};
