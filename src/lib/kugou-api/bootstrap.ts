import { Buffer } from 'buffer';

import { ensureDeviceSessionValues, resetDeviceSessionValues } from './device';
import { ensureSessionHydrated } from './session';

type RuntimeProcess = {
  env?: Record<string, string | undefined>;
};

let runtimePreparationPromise: Promise<void> | null = null;

function installRuntimeGlobals(): void {
  if (!globalThis.Buffer) {
    globalThis.Buffer = Buffer;
  }

  const runtimeGlobal = globalThis as { process?: RuntimeProcess };
  if (!runtimeGlobal.process) {
    runtimeGlobal.process = {
      env: Object.create(null) as Record<string, string | undefined>,
    };
  }

  const processRef = runtimeGlobal.process;
  processRef.env ??= Object.create(null) as Record<string, string | undefined>;
  /*
   * 锁定为 lite（概念版 v2 协议）—— **不要改，也不要按设备/账号去切换**。
   *
   * 上游的听歌时长上报（`user_grade_info` / `user_listen_report`）只在 lite 平台下走
   * `userinfo.user.kugou.com/v2/get_grade_info` 记账；标准版 v4 协议只能查询、不接收增量。
   * 这一行同时也是「同一个账号在本客户端的成长值口径与概念版客户端一致」的前提：
   * 改成别的值，上报会静默变成「查得到、不记账」。
   */
  processRef.env.platform = 'lite';
}

async function prepareRuntime(): Promise<void> {
  installRuntimeGlobals();
  await ensureSessionHydrated();
  await ensureDeviceSessionValues();
}

export async function prepareKugouApiRuntime(): Promise<void> {
  if (!runtimePreparationPromise) {
    runtimePreparationPromise = prepareRuntime().catch((error) => {
      runtimePreparationPromise = null;
      throw error;
    });
  }

  await runtimePreparationPromise;
}

export function resetKugouApiRuntime(): void {
  runtimePreparationPromise = null;
  resetDeviceSessionValues();
}
