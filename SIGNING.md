# 签名与发布

本项目 Android APK 使用固定 keystore 签名，后续升级包必须保持同一签名，否则无法覆盖安装。

## 当前签名信息

- Alias：`moekoe`
- 证书 DN：`CN=MoeKoe, OU=Dev, O=MoeKoe, L=CN, ST=CN, C=CN`
- 证书文件：`apk/moekoe-release-cert.pem`
- APK 签名证书 SHA-256：

```text
685b52e6083c3b66edc83181ee4dc991f8c9bdbedaf1cabdae62921c64c07c9f
```

## 说明

- 私钥 keystore **不提交到公开仓库**。
- 本地构建时请自行备份 keystore，并保持密码与 alias 可用。
- `scripts/signing.properties.example` 提供了构建时的外部签名参数示例。
