# ModelLogue Security Design / セキュリティ設計

| Item / 項目 | Content / 内容 |
|------|---------|
| Document / 文書 | Security Design / セキュリティ設計 |
| Version / バージョン | 1.0 (Draft / ドラフト) |
| Created / 作成日 | 2026-04-05 |
| Reference / 参照 | OWASP Top 10 (2021) |

---

## 1. Overview / 概要

This document defines security design guidelines for ModelLogue based on OWASP Top 10 (2021).
本文書はOWASP Top 10 (2021)に基づくModelLogueのセキュリティ設計指針を定義する。

### 1.1 System Characteristics / システム特性

| Characteristic / 特性 | Current State / 現状 |
|----------------------|---------------------|
| Data Storage / データ保存 | Browser memory only (Volatile Canvas) / ブラウザメモリのみ |
| Authentication / 認証 | None / なし |
| Backend / バックエンド | None (static SPA) / なし（静的SPA） |
| External Services / 外部サービス | PlantUML Server (Docker), n8n (Docker) |
| AI Integration / AI連携 | n8n → Gemini API (API key managed by n8n) |

### 1.2 Threat Model / 脅威モデル

| Threat / 脅威 | Risk Level / リスクレベル | Mitigation / 対策 |
|--------------|-------------------------|------------------|
| XSS (Cross-Site Scripting) | Medium / 中 | React escaping, CSP, input sanitization / Reactエスケープ、CSP、入力サニタイズ |
| PlantUML Injection | Medium / 中 | Parser validation (subset only) / パーサー検証（サブセットのみ） |
| SVG Injection | Medium / 中 | SVG used for coordinate extraction only, not rendered / SVGは座標抽出のみ、描画に使わない |
| Dependency vulnerabilities / 依存関係の脆弱性 | Medium / 中 | Regular updates, audit / 定期更新、監査 |
| Prompt Injection | Medium / 中 | Sanitize user input before sending to AI / AI送信前に入力をサニタイズ |
| n8n Webhook abuse | Low / 低 | CORS, rate limiting in n8n / CORS、n8nでのレート制限 |

---

## 2. OWASP Top 10 Mapping / OWASP Top 10 マッピング

### A01:2021 – Broken Access Control / アクセス制御の不備

**Relevance / 関連性**: High for the AI relay (public beta) / AI 中継については高（公開ベータ）
**現状**: The review tool itself is public and needs no accounts. The **AI relay** is the one gated boundary (SR-136/137/138): only the authenticated operator may reach a Gemini call.

**Design Decisions / 設計決定**:

- **The gate is identity, never "n8n reachable."** The same stack serves the operator and anonymous visitors; n8n exists and its address is fixed. The *only* thing that switches AI on is *who* the requester is (SR-136 rationale). See [[modellogue-deploy-ai-gating-direction]].
- **Two layers, with the server-side one authoritative (SR-137).** The frontend gate (SR-136 — hide the chat pane, suppress relay calls) is *insurance and UX only*. The real boundary is server-side: an unauthenticated request must never reach a Gemini call even if the SPA is bypassed or a hostile client crafts requests directly.
- **Server-side enforcement = cryptographic verification of the gate's signed assertion, at the origin, in front of n8n.** In production the edge auth gate (Cloudflare Access + Tunnel, SR-138) authenticates the operator and attaches a signed assertion (a per-request JWT in `Cf-Access-Jwt-Assertion`). A small zero-dependency **auth-verify** service (`tools/authgate/`) verifies that JWT; Caddy `forward_auth`s every `/n8n/webhook/*` request through it and only proxies to n8n on a 2xx. Verification is **independent of the edge routing** — even if the tunnel/Access path config were wrong, an unauthenticated call is rejected here.

  Verification (RS256, standard Cloudflare Access recipe — no client-asserted trust):
  1. `alg` **must** be `RS256` (reject `none`/HS\* — algorithm-confusion defence).
  2. Signature verified against the team JWKS (`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`), keyed by `kid`; JWKS cached with refetch on unknown `kid` (key rotation).
  3. `iss` === the team domain; `aud` **must** contain this application's AUD tag (ties the token to *this* app — without it, any token in the team would pass); `exp` in the future (small skew).
  4. `email` claim extracted as the operator identity.

- **Fail-closed.** If the CF verification env (`CF_TEAM_DOMAIN`, `CF_ACCESS_AUD`) is unset, auth-verify **denies** by default. A local, gate-less run must opt in explicitly with `AUTHGATE_ALLOW_INSECURE=1` (dev only, logged loudly) — a misconfigured production denies rather than opens.
- **Provider-agnostic seam (SR-138 / NFR-091).** The gate provider is swappable: auth-verify reads a signed assertion and the identity header is mapped in one place (`/auth/whoami` in Caddy). Swapping Cloudflare Access for a self-hosted OIDC forward-auth changes only auth-verify's verification config, not the SPA or the seam contract.
- **n8n editor is never web-exposed.** Only `/n8n/webhook/*` (gated) and `/n8n/healthz` (liveness, open) are proxied; the editor/admin UI that holds the Gemini credential is reachable only via SSH / `docker compose exec`.

現在のスコープの整理: レビューツール自体は公開・認証不要。**AI 中継のみ**が唯一のゲート境界で、サーバ側（auth-verify による Cloudflare Access JWT の暗号検証）が正であり、フロントの抑制は保険。環境変数未設定時は**既定で拒否**（fail-closed）。

---

### A02:2021 – Cryptographic Failures / 暗号化の失敗

**Relevance / 関連性**: Low
**現状**: 低

**Design Decisions / 設計決定**:
- No sensitive data stored or transmitted by the frontend
- API keys managed exclusively by n8n (never in frontend code or environment)
- フロントエンドでの機密データの保存・送信なし
- APIキーはn8n側でのみ管理（フロントエンドのコードや環境には一切含めない）

---

### A03:2021 – Injection / インジェクション

**Relevance / 関連性**: **High**
**現状**: **高**

#### 3.1 PlantUML Parser Security / PlantUMLパーサーセキュリティ

```typescript
// BAD: Unsafe eval-based parsing
const result = eval(sourceInput); // NEVER DO THIS

// GOOD: Safe parser with validation
const parseResult = stateMachineParser.parse(sourceInput);
if (parseResult.errors.length > 0) {
  // Handle syntax errors safely
}
```

**Rules / ルール**:
1. Never use `eval()` or `Function()` constructor with user input
   - `eval()` や `Function()` コンストラクタをユーザー入力で使用しない
2. Only accept the defined PlantUML subset grammar (reject everything else)
   - 定義済みPlantUMLサブセット文法のみ受け入れる（それ以外は拒否）
3. Validate state names and labels against allowlist pattern
   - 状態名とラベルを許可パターンで検証

```typescript
// State name validation
const STATE_NAME_PATTERN = /^[a-zA-Z_\u3040-\u9FFF][a-zA-Z0-9_\u3040-\u9FFF]*$/;

function isValidStateName(name: string): boolean {
  return STATE_NAME_PATTERN.test(name) && name.length <= 100;
}
```

#### 3.2 SVG Security / SVGセキュリティ

SVG from PlantUML Server is displayed in the diagram view and also parsed for coordinate extraction. To avoid injecting untrusted markup into the live DOM, the SVG is rendered through a `Blob` URL inside an `<img>` element (browser-sandboxed) — not via `innerHTML`.
PlantUML ServerからのSVGは図ビューに表示し、座標抽出にも使用する。信頼できないマークアップをDOMに直接挿入しないため、SVGは`Blob` URL経由で `<img>` 要素として表示する（ブラウザがサンドボックス化）。`innerHTML`は使わない。

```typescript
// GOOD: Render SVG via a Blob URL inside <img> (browser-sandboxed)
const blob = new Blob([svgString], { type: 'image/svg+xml' });
const url = URL.createObjectURL(blob);
// <img src={url} />

// GOOD: Parse SVG as data for coordinate extraction
const parser = new DOMParser();
const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
// Extract positions from <rect>, <text> elements

// BAD: Inserting raw SVG directly into DOM
element.innerHTML = svgString; // NEVER DO THIS
```

#### 3.3 XSS Prevention / XSS防止

```typescript
// React automatically escapes JSX content (safe)
<div>{stateLabel}</div>

// BAD: Dangerous HTML insertion
<div dangerouslySetInnerHTML={{ __html: userInput }} />
```

**Rules / ルール**:
1. Never use `dangerouslySetInnerHTML` with user input
2. Sanitize state labels before rendering on the diagram view
3. Use React's built-in escaping for all text content

---

### A04:2021 – Insecure Design / 安全でない設計

**Relevance / 関連性**: Medium
**現状**: 中

**Secure Design Principles / セキュア設計原則**:

1. **Input Validation at Boundaries / 境界での入力検証**
   ```
   PlantUML Source → StateMachineParser (validation) → StateMachineModel
   SVG Response → SvgCoordinateExtractor (parsing, no rendering) → Coordinates
   AI Response → n8n (extraction) → Structured JSON → Display
   ```

2. **Fail Securely / 安全な失敗**
   - On parse error: Show error with line number, retain last valid model
   - On PlantUML Server failure: Show connection error, retain last known layout
   - On n8n failure: Show connection error, disable chat (diagram+table still work)
   - パースエラー時：行番号付きエラー表示、最後の有効モデルを保持
   - PlantUML Server障害時：接続エラー表示、最後のレイアウトを保持
   - n8n障害時：接続エラー表示、チャット無効化（図＋表は動作継続）

3. **Defense in Depth / 多層防御**
   ```
   Layer 1: CSP (Content Security Policy)
   Layer 2: PlantUML subset parser (rejects unsafe syntax)
   Layer 3: SVG displayed via Blob URL inside <img> (sandboxed) + coordinate extraction
   Layer 4: React built-in XSS protection
   ```

---

### A05:2021 – Security Misconfiguration / セキュリティ設定ミス

**Relevance / 関連性**: Medium
**現状**: 中

#### 5.1 Security Headers

For production deployment, configure security headers:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    }
  ]
}
```

#### 5.2 Content Security Policy (CSP)

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
connect-src 'self' http://localhost:8080 http://localhost:5678;
frame-ancestors 'none';
```

**Note / 注意**:
- `connect-src` must include PlantUML Server and n8n URLs
- `'unsafe-inline'` for styles may be needed for some libraries; consider nonce-based CSP for production
- `connect-src` にPlantUML Serverとn8nのURLを含める必要がある

#### 5.3 Environment Variables / 環境変数

```bash
# .env (connection URLs only, no secrets)
VITE_PLANTUML_SERVER_URL=http://localhost:8080
VITE_N8N_BASE_URL=http://localhost:5678

# .gitignore must include:
.env
.env.local
.env*.local
```

**Critical / 重要**: API keys are NEVER placed in `.env` files. They are managed exclusively in n8n's Credentials UI.
APIキーは`.env`ファイルに絶対に置かない。n8nのCredentials UIでのみ管理する。

---

### A06:2021 – Vulnerable and Outdated Components / 脆弱で古いコンポーネント

**Relevance / 関連性**: **High**
**現状**: **高**

#### 6.1 Dependency Management / 依存関係管理

```json
{
  "scripts": {
    "audit": "npm audit",
    "audit:fix": "npm audit fix",
    "outdated": "npm outdated"
  }
}
```

#### 6.2 CI/CD Integration / CI/CD統合

```yaml
# .github/workflows/security.yml
name: Security Audit
on:
  schedule:
    - cron: '0 0 * * 1'  # Weekly on Monday
  push:
    branches: [master]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm audit --audit-level=high
```

#### 6.3 Lock File / ロックファイル

- Always commit `package-lock.json`
- Use `npm ci` in CI/CD (not `npm install`)

#### 6.4 License Compliance / ライセンス遵守

- Only MIT, Apache-2.0, BSD, ISC, or similarly permissive licenses
- GPL/LGPL/AGPL prohibited (copyleft incompatible with MIT)
- Infrastructure services (PlantUML Server GPL, n8n fair-code) are acceptable as separate Docker services

---

### A07:2021 – Identification and Authentication Failures / 認証の失敗

**Relevance / 関連性**: N/A
**現状**: 該当なし（認証なし）

---

### A08:2021 – Software and Data Integrity Failures / ソフトウェアとデータの整合性の失敗

**Relevance / 関連性**: Low
**現状**: 低

**Design Decisions / 設計決定**:
- No persistent data storage (Volatile Canvas)
- Session data exists only in browser memory
- Export produces self-contained JSON files
- データ永続化なし（Volatile Canvas）
- セッションデータはブラウザメモリにのみ存在
- エクスポートは自己完結型JSONファイル

---

### A09:2021 – Security Logging and Monitoring Failures / ロギングと監視の失敗

**Relevance / 関連性**: Low (client-side only)
**現状**: 低

**Recommendations / 推奨事項**:
- Console logging for development (remove in production)
- Consider error tracking service for production deployment

---

### A10:2021 – Server-Side Request Forgery (SSRF)

**Relevance / 関連性**: Low
**現状**: 低

**Design Decisions / 設計決定**:
- PlantUML Server and n8n are local Docker services
- No user-controlled URLs are forwarded to backend services
- n8n webhooks accept structured JSON only (no URL parameters)
- PlantUML Serverとn8nはローカルDockerサービス
- ユーザー制御のURLをバックエンドサービスに転送しない

---

## 3. AI-Specific Security / AI固有のセキュリティ

### 3.1 Prompt Injection Prevention / プロンプトインジェクション防止

User input sent to AI via n8n must be treated as untrusted:
n8n経由でAIに送信するユーザー入力は信頼できないものとして扱う：

1. **System prompt separation**: System prompt is managed in n8n, never exposed to frontend
   - システムプロンプトはn8nで管理、フロントエンドに公開しない
2. **Input sanitization**: Remove potential prompt injection patterns before sending
   - 送信前にプロンプトインジェクションパターンを除去
3. **Output validation**: AI-suggested PlantUML source must pass through StateMachineParser before application
   - AI提案のPlantUMLソースは適用前にStateMachineParserを通す

### 3.2 AI Response Handling / AIレスポンス処理

- PlantUML code block extraction is done in n8n (not frontend)
- Suggested source is validated by parser before showing diff
- User must explicitly click "Apply" to accept changes
- PlantUMLコードブロック抽出はn8n側で実施
- 提案ソースは差分表示前にパーサーで検証
- 変更の受け入れにはユーザーの明示的な「適用」クリックが必要

---

## 4. Implementation Checklist / 実装チェックリスト

- [ ] Configure security headers for production deployment
- [ ] Configure `.gitignore` for sensitive files
- [ ] Set up `npm audit` in CI/CD
- [ ] Implement PlantUML subset parser with input validation
- [ ] SVG coordinate extraction without DOM insertion
- [ ] Sanitize state labels before diagram view rendering
- [ ] Validate AI-suggested source through parser before diff display
- [ ] Review CSP configuration (especially `connect-src` for Docker services)
- [ ] Verify no API keys in frontend code or environment files

---

## 5. References / 参考文献

- [OWASP Top 10 (2021)](https://owasp.org/Top10/)
- [React Security Best Practices](https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

---

## 6. Change History / 変更履歴

| Date / 日付 | Version | Changes / 変更内容 |
|------------|---------|-------------------|
| 2026-04-05 | 1.0 | Initial version for ModelLogue v3.0 architecture / ModelLogue v3.0アーキテクチャに基づく初版 |
