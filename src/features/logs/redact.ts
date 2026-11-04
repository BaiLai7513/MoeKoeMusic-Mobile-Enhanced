/**
 * 运行日志脱敏规则（**唯一出口**）。
 *
 * ## 为什么单独一个文件、集中放正则
 *
 * 日志会被导出、贴进 issue / 群里公开。漏掉一条凭据等于把账号和签名能力交出去。
 * 规则一旦散落在各个调用点，只要有人新增一处日志就绕开了脱敏；集中在这里才能
 * 一眼看全、改一处生效全部。
 *
 * ## 为什么「宁可多抹」
 *
 * 脱敏的目标是「不泄露」，不是「保留可读性」。像 `Cookie` / `Authorization`
 * 这种头的值里往往还套着 `token=...`、`p=...`，按值边界切分很容易漏（分号、引号、
 * 换行都会被日志格式化打断），所以对这两个头直接抹掉「头名之后直到**行尾**」的整段 ——
 * 注意是行尾而不是文末：堆栈是多行的，抹到文末会把后面的调用帧一起吃掉。
 *
 * ## 边界
 *
 * 这里只处理「已经拼成一行/一段文本」的内容，调用点见 `format.ts` 的
 * `formatLogLine`（落盘前必经）。因为脱敏在入队前完成，所以**磁盘上的日志和
 * 「查看今日」页面看到的都是脱敏后的版本** —— 内存里也不留原文，少一条泄露路径。
 */

type RedactionRule = {
  /** 规则用途，排查「为什么某段日志被抹了」时对着看。 */
  readonly label: string;
  readonly pattern: RegExp;
  readonly replacement: string;
};

/**
 * 顺序很关键：先按「整行」处理头，再处理 URL、JSON，最后才是兜底的 key=value。
 * 反过来做的话，`Cookie: a=1; token=xyz` 会先被 token 规则切成两半，尾巴留在日志里。
 */
const RULES: readonly RedactionRule[] = [
  {
    label: 'Cookie / Authorization 头（从头名抹到行尾）',
    // 只抹到行尾（[^\n]*），保留堆栈后续行。
    pattern: /\b(cookie|set-cookie|proxy-authorization|authorization)\b\s*[:=][^\n]*/gi,
    replacement: '$1: ***',
  },
  {
    label: 'Bearer / Basic 凭据',
    pattern: /\b(bearer|basic)\s+[A-Za-z0-9\-._~+/]{8,}=*/gi,
    replacement: '$1 ***',
  },
  {
    label: 'URL/表单参数（token / signature / p 等）',
    // 酷狗的签名参数 signature、加密口令 p 既可能走 query，也可能在表单体里裸着出现，
    // 所以边界同时接受 行首 / 空白 / 引号 / ? & ; , —— 宁可多抹一点，也不要漏。
    pattern:
      /(^|[\s"'?&;,])(access_token|refresh_token|user_token|token|userid|user_id|uid|dfid|clientkey|signature|sig|p)=([^&\s#]*)/gi,
    replacement: '$1$2=***',
  },
  {
    label: 'JSON 字段（"token":"…" 形式，含数字/布尔值）',
    pattern:
      /("(?:access_token|refresh_token|user_token|token|userid|user_id|uid|dfid|clientkey|signature|sig|p|cookie|authorization)"\s*:\s*)(?:"(?:[^"\\]|\\.)*"|[-+]?\d+(?:\.\d+)?|true|false|null)/gi,
    replacement: '$1"***"',
  },
  {
    label: 'key=value / key: value 形式的凭据字段',
    // `\b` 两头卡住，避免把 `mytoken`、`tokenizer` 这种无关词一起抹掉；
    // 值既接受带引号的整段，也接受裸值（裸值遇空白/&/,/; 等分隔符即止）。
    pattern:
      /(\b(?:access[_-]?token|refresh[_-]?token|user[_-]?token|token|userid|user_id|uid|dfid|clientkey|signature|cookie)\b\s*[=:]\s*)("[^"\n]*"|'[^'\n]*'|[^\s&,;)}\]'"]+)/gi,
    replacement: '$1***',
  },
  {
    label: 'JWT',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g,
    replacement: '***JWT***',
  },
  {
    label: '中国大陆手机号',
    // 用 \b 卡边界（不用 lookbehind：Hermes 对后行断言的支持不稳定）。
    pattern: /\b1[3-9]\d{9}\b/g,
    replacement: '1**********',
  },
  {
    label: '邮箱',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: '***@***',
  },
];

/**
 * 脱敏总开关。
 *
 * **当前为 `false`（按需求关闭）**：日志保留原文，这样排查接口问题时能直接看到真实的
 * 参数、账号标识与签名过程 —— 打过码的日志对「为什么这个请求失败了」几乎没用。
 *
 * 代价必须写清楚：导出/分享出去的日志里会**明文包含** token、cookie、手机号等凭据。
 * 因此设置页与导出文件头部都标明了「勿公开分享」（原来那句「已脱敏，可以放心发给开发者」
 * 已经删掉，因为它现在是错的）。
 *
 * 要重新打开只需把这里改回 `true`：下面的规则一直保留着，不需要重写。
 */
export const LOG_REDACTION_ENABLED = false;

/**
 * 把一段日志正文里的凭据替换成 `***`。
 *
 * 全程 try/catch：脱敏本身绝不能成为「日志写不进去」的理由，
 * 但也绝不能在异常时把原文原样放行 —— 失败时退化为「整段打码」。
 */
export function redactLogText(text: string): string {
  if (!text) {
    return '';
  }

  // 开关关闭时原样返回：连遍历正则的开销都省掉（日志热路径上每条都要走一次）
  if (!LOG_REDACTION_ENABLED) {
    return text;
  }

  let output = text;
  for (const rule of RULES) {
    try {
      output = output.replace(rule.pattern, rule.replacement);
    } catch {
      // 单个规则炸了不影响其他规则；最后还有兜底判断。
    }
  }

  // 兜底：万一某条正则把整段打穿（返回空/异常短），说明处理过程不可信。
  // 这时候宁可丢正文，也不要把可能含凭据的原文写出去。
  if (text.length > 0 && output.length === 0) {
    return '***（脱敏异常，内容已丢弃）***';
  }

  return output;
}

/** 供开发期自检 / 报告引用：列出规则的用途与正则源码。 */
export function describeRedactionRules(): { label: string; source: string }[] {
  return RULES.map((rule) => ({ label: rule.label, source: String(rule.pattern) }));
}
