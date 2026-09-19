# MoeKoeMusic-Mobile-Enhanced

一款基于 [MoeKoeMusic / MoeKoeMusic-Mobile](https://github.com/MoeKoeMusic/MoeKoeMusic-Mobile) 思路整理的 Android 端增强音乐客户端工程。

> 本仓库是可重建的 Android APK 工程：包含由最终 APK 反编译得到的完整 apktool 解码树、原生补丁 Java 源码、构建脚本与文档。
> 它仍是酷狗音乐的**第三方非官方客户端**，仅供学习与技术交流，请勿用于商业用途。

## 主要增强功能

- 增加小窗/自由窗口/悬浮窗下，在歌单列表、搜索、搜索结果、设置/头像页、听歌识曲页等顶部右侧提供可用的返回按钮。
- 播放歌曲功能：定时关闭、翻译，私有格式转换（对于本软件无用懒得删），下载（音质选择），下载为解密格式。
- 音质选择可用，无自动降级
- 每日 VIP 静默领取，随机延时，不自动升级 3 小时 VIP。
- 加入组队领VIP功能
- Android 原生听歌识曲、本地音乐扫描及播放
- 搜歌功能仅保留歌曲和专辑
- 白天/暗夜模式实现
- 音频焦点避让机制实现
- 通知栏媒体卡片控制音乐以及锁屏通知实现
- 仅保留音乐库歌单和专辑两个分区
- 仅保留账户密码登录和手机号登录
- 平衡预加载机制和刷新两者问题，提升使用体验
  
  
  

## 仓库结构

```text
MoeKoeMusic-Mobile-Enhanced/
├─ apk/
│  └─ MoeKoeMusic-Mobile-Enhanced.apk   # 当前发布的已签名 APK
├─ src/
│  └─ apktool/                          # 完整 apktool 解码工程（含 assets / smali / lib / res）
├─ native-patches/
│  └─ java/com/moekoe/music/            # 额外编译进 classes3.dex 的 Java 源码
├─ scripts/
│  ├─ build.sh                          # Linux/macOS/Git Bash 构建脚本
│  ├─ build.ps1                         # Windows PowerShell 构建脚本
│  └─ README.md                         # 构建说明
├─ dist/                                # 构建输出目录（默认 git 忽略）
├─ LICENSE
└─ README.md
```

## 构建

参考 [scripts/README.md](scripts/README.md)。

简要步骤：

1. 安装 JDK、Android SDK Build-Tools、[Apktool](https://apktool.org/)。
2. 准备一个用于签名的 keystore（仓库不包含私钥）。
3. 执行：

```bash
cd MoeKoeMusic-Mobile-Enhanced
APKTOOL_JAR=/path/to/apktool.jar \
APKSIGNER=/path/to/apksigner \
KEYSTORE=/path/to/your.keystore \
KS_ALIAS=your_alias \
KS_PASS=your_password \
bash scripts/build.sh
```

生成文件位于 `dist/MoeKoeMusic-Mobile-Enhanced.apk`。

## 免责声明

- 本项目与酷狗音乐官方无关，未获得酷狗官方授权。
- 项目中可能包含来自原 MoeKoeMusic 生态的代码/资源，其版权归原开发者所有。
- 请勿将本项目用于任何违反当地法律法规或侵犯第三方权益的场景。
- 如涉及侵权不妥，请联系仓库维护者删除。

## 致谢与参考

- 原 MoeKoeMusic：<https://github.com/MoeKoeMusic/MoeKoeMusic>
- Android Mobile 参考：<https://github.com/MoeKoeMusic/MoeKoeMusic-Mobile>


