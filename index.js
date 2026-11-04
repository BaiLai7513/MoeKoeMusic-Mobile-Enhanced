/**
 * 应用入口。
 *
 * 为什么不再直接用 `expo-router/entry`：闹钟到点、但进程已经被系统回收时，
 * 需要由原生（`VipClaimService`）把 JS 拉起来跑一个**不显示界面**的任务。
 * 那个任务必须在本入口里用 `AppRegistry.registerHeadlessTask` 注册，所以这里
 * 先跑正常的 expo-router 启动，再挂上 headless 任务。
 *
 * 两件事互不干扰：正常启动注册根组件，headless 只注册一个任务名，
 * 只有原生显式启动任务时才会被调用。
 */
import 'expo-router/entry';
import { AppRegistry } from 'react-native';

import headlessVipClaim from './src/features/account/headless-claim';

/** 任务名必须与 `native/android/player/VipClaimService.kt` 里的 TASK_NAME 一致。 */
AppRegistry.registerHeadlessTask('MoeKoeVipClaimTask', () => headlessVipClaim);
