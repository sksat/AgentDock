# Claude Code Permission Mode 調査レポート

## 調査日
2026-01-24

## 調査目的
AgentDock で「Edit automatically」を選択しても毎回 Edit の permission request が来る問題の原因を特定する。

---

## 実験 1: `--permission-mode acceptEdits` の挙動

### 環境
- Claude Code version: 2.1.4
- OS: Linux (Arch)

### 実験手順

1. テストファイルを作成
2. `--permission-mode acceptEdits` で Claude Code CLI を実行
3. Edit/Write 操作を実行し、permission prompt が表示されるか確認

### 結果

#### Read 操作
```json
{
  "permissionMode": "acceptEdits",
  // ... Read は permission なしで成功
}
```

#### Write/Edit 操作
```bash
claude -p --permission-mode acceptEdits "test-file.txt の内容を変更して"
```

**結果**: Permission prompt **なし**で成功！

#### 比較: default モード
```bash
claude -p --permission-mode default "test-file.txt の内容を変更して"
```

**結果**: タイムアウト（permission 待ち）

### 結論
Claude Code CLI 単体では `--permission-mode acceptEdits` が正しく動作し、Edit/Write 操作は自動許可される。

---

## 実験 2: Hooks で permission_mode が受け取れるか

### 設定

`.claude/settings.local.json`:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/log-permission.sh"
          }
        ]
      }
    ]
  }
}
```

### Hook が受け取った入力

```json
{
  "session_id": "9de1c681-965a-434b-b502-3d5f508b4166",
  "cwd": "/home/sksat/prog/claude-bridge/.worktree/research/permission-mode",
  "permission_mode": "acceptEdits",  // ← 受け取れている！
  "hook_event_name": "PreToolUse",
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "...",
    "old_string": "...",
    "new_string": "..."
  }
}
```

### 結論
**Hooks は `permission_mode` を受け取る**。これにより、Hook 内で permission_mode に応じた処理が可能。

---

## 実験 3: `--permission-mode acceptEdits` + `--permission-prompt-tool` の組み合わせ

### 実験手順

1. AgentDock server に debug logging を追加
2. `--permission-mode acceptEdits` + `--permission-prompt-tool` で Claude Code を起動
3. Write 操作を実行し、permission request が MCP tool に送られるか確認

### 結果

**Permission request が MCP tool に送られなかった！**

```
# サーバーログ
[ClaudeRunner] Starting with PTY: claude -p ... --permission-prompt-tool mcp__bridge__permission_prompt ... --permission-mode acceptEdits
# DEBUG ログなし（permission_request ハンドラーが呼ばれていない）
```

Write が成功し、ファイルが作成された。

### 結論

**`--permission-mode acceptEdits` + `--permission-prompt-tool` の組み合わせでは、Claude Code が Edit/Write を内部で auto-allow し、MCP tool に permission request を送信しない。**

---

## 問題の根本原因（修正）

### AgentDock のアーキテクチャ

```
Claude Code CLI
    ↓ --permission-prompt-tool mcp__bridge__permission_prompt
    ↓ --permission-mode acceptEdits
    │
    ├─ (Edit/Write) → 内部で auto-allow → MCP tool 呼び出しなし
    │
    └─ (Bash等) → MCP Server (AgentDock) → permission_request → UI
```

### 当初の理解（不正確だった）

1. ~~`--permission-prompt-tool` は permission_mode を考慮しない~~
2. ~~Claude Code は全ての permission prompt を MCP tool に委譲~~

### 実際の挙動

1. **`--permission-mode acceptEdits` が優先される**
   - Edit/Write は Claude Code 内部で auto-allow
   - MCP tool への permission request は送られない

2. **`--permission-mode default` の場合のみ MCP tool が使用される**
   - この場合は全ての permission request が MCP tool に送られる

### なぜ AgentDock で「Edit automatically」が機能しなかったのか（仮説）

可能性:
1. セッションの `permissionMode` が正しく `--permission-mode` フラグに反映されていなかった
2. 初期の Claude Code バージョンでは異なる挙動だった
3. 特定の条件下でのみ問題が発生していた

**現在の実装では正しく動作している。**

### VSCode 拡張との違い

| 項目 | VSCode 拡張 | AgentDock |
|------|-------------|-----------|
| Permission UI | ネイティブ TUI | MCP 経由 Web UI |
| `--permission-prompt-tool` | 使用しない | 使用する |
| permission_mode 処理 | Claude Code 内部 | 外部 (AgentDock server) に委譲 |

---

## 解決策の選択肢

### Option 1: AgentDock server 側で permission_mode チェック（推奨）

**修正箇所**: `packages/server/src/server.ts` の `permission_request` ハンドラー

```typescript
// Auto-allow Edit tool if session is in auto-edit mode
if (session.permissionMode === 'auto-edit' && message.toolName === 'Edit') {
  ws.send(JSON.stringify({
    type: 'permission_response',
    sessionId: message.sessionId,
    requestId: message.requestId,
    response: { behavior: 'allow', updatedInput: message.input },
  }));
  return;
}
```

**メリット**:
- 最小限の変更で済む
- 現状の MCP アーキテクチャを維持
- タイムアウト問題なし

**デメリット**:
- Claude Code の挙動変更に追従が必要

### Option 2: Hooks に移行

**変更内容**:
- `--permission-prompt-tool` をやめる
- PreToolUse / PermissionRequest hook を使用
- Hook で permission_mode に応じて allow/deny を決定

**メリット**:
- Anthropic 推奨のアプローチ
- Claude Code の permission_mode 処理と一貫性がある

**デメリット**:
- 60秒タイムアウト（設定可能だが制限あり）
- 大きなリファクタリングが必要

### Option 3: ハイブリッド

- auto-edit モードでは Hooks で自動許可
- それ以外は MCP で対話的に処理

---

## 推奨

**Option 1 を推奨**。

理由:
1. 最小限の変更で問題を解決
2. タイムアウト問題を回避
3. 将来的に Hooks への移行も可能

---

## 追加調査結果 (2026-01-24 追記)

### `acceptEdits` の範囲

Claude Code CLI の `--permission-mode acceptEdits` は **Edit と Write の両方を auto-allow** する。

これは VSCode 拡張のドキュメントで言及されている「Edit のみ」とは異なる動作である可能性がある。

| ツール | `--permission-mode acceptEdits` |
|--------|--------------------------------|
| Edit   | auto-allow |
| Write  | auto-allow |
| Bash   | permission 必要 |

### AgentDock server 側の `shouldAutoAllowByPermissionMode` について

実装した `shouldAutoAllowByPermissionMode` 関数は Edit のみを auto-allow するように設計した。
しかし、実際には Claude Code CLI 側で Edit/Write の両方が auto-allow されるため、
この関数が呼ばれる機会は少ない（Bash など他のツールの permission request のみ）。

```typescript
// この関数は Edit のみ auto-allow するが、
// Claude Code CLI が acceptEdits モードで Edit/Write を内部処理するため、
// 実際に Edit の permission request が来ることは稀
export function shouldAutoAllowByPermissionMode(
  permissionMode: string | undefined,
  toolName: string
): boolean {
  if (permissionMode === 'auto-edit' && toolName === 'Edit') {
    return true;
  }
  return false;
}
```

### 結論

1. **現在の実装は正しく動作している**
   - `--permission-mode acceptEdits` が Claude CLI に渡され、Edit/Write は自動許可される

2. **AgentDock server の `shouldAutoAllowByPermissionMode` は「安全策」として機能**
   - Claude Code CLI の挙動が変更された場合のフォールバック
   - Hooks 移行時にも使用可能

3. **PR #72 はマージ可能**

---

## 参考資料

- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)
- [Claude Code IAM Documentation](https://code.claude.com/docs/en/iam)
- [GitHub Issue #1175](https://github.com/anthropics/claude-code/issues/1175) - permission-prompt-tool の仕様
- [GitHub Issue #12070](https://github.com/anthropics/claude-code/issues/12070) - acceptEdits バグ報告
