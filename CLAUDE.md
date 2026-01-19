# AgentDock Development Guidelines

Claude Code 向けのプロジェクト開発ガイドラインです。

## Project Overview

AgentDock は Claude Code などの AI エージェント CLI をブラウザから操作するための Web UI です。
複数セッションの同時管理、リアルタイムストリーミング、ツール実行の許可制御などを提供します。

将来的には codex-cli, gemini-cli など他の AI エージェント CLI にも対応予定です。

## Development Workflow

### Branch and PR Policy

**IMPORTANT: main ブランチへの直接 push は禁止。すべての変更は PR 経由で行う。**

1. **機能開発・バグ修正**
   - ブランチを切って開発する（例: `feat/xxx`, `fix/xxx`）
   - TDD で進める
   - PR を作成してレビュー・マージ

2. **設定変更・ドキュメント更新**
   - main への直接 push は **しない**
   - 小さな変更でも PR を作成する
   - 例外: タイポ修正など、レビュー不要な軽微な変更のみ検討

3. **Git Commit**
   - コミットメッセージは Conventional Commits 形式推奨
   - 例: `feat: add xxx`, `fix: resolve yyy`, `chore: update zzz`

## Architecture

```
packages/
├── client/     # React + Vite フロントエンド
├── server/     # Hono WebSocket サーバー
├── shared/     # 共通型定義
└── mcp-server/ # MCP サーバー（実験的）
```

詳細は [DESIGN.md](DESIGN.md) を参照。

## Development Commands

```bash
pnpm dev        # 開発サーバー起動
pnpm test       # 全テスト実行
pnpm typecheck  # 型チェック
pnpm lint       # ESLint
```

### ポート番号

開発サーバーは以下のポートを使用します。起動前に確認してください:
- **client**: http://localhost:5173
- **server**: http://localhost:3001 (WebSocket: ws://localhost:3001/ws)

ポートが既に使用されている場合はエラーになります。`lsof -i :5173` などで確認してください。

### テスト実行

```bash
# client パッケージのテスト
cd packages/client && pnpm test -- --run

# 特定ファイルのテスト
cd packages/client && pnpm test -- MessageStream.test.tsx --run

# server パッケージのテスト
cd packages/server && pnpm test -- --run
```

## Development Practices

### 1. Test-Driven Development (TDD)

新機能の実装時は、可能な限りテストを先に書くか、実装と同時に書く。

```typescript
// Good: テストで仕様を明確化
it('should persist pending question when switching away and back', () => {
  // セッション切り替え時にポップアップが保持されることを検証
});
```

### 2. Defensive Coding for External Data

DB やネットワークから取得したデータは信頼しない。Guard clause で不正データを防御する。

```typescript
// Bad: 外部データを直接使用
function QuestionMessage({ content }) {
  return content.answers.map(...);  // content が undefined だとクラッシュ
}

// Good: Guard clause で防御
function QuestionMessage({ content }) {
  if (!content || !Array.isArray(content.answers)) {
    return <FallbackUI />;  // フォールバック表示
  }
  return content.answers.map(...);
}
```

**教訓**: DB に古いフォーマットのデータが残っていて、新しいコンポーネントがクラッシュした事例あり（黒画面バグ）。

### 3. Robustness Tests

外部データを扱うコンポーネントには、不正データに対する堅牢性テストを書く。

```typescript
describe('QuestionMessage robustness', () => {
  it('should not crash with null content', () => {
    const messages = [{ type: 'question', content: null }];
    expect(() => render(<MessageStream messages={messages} />)).not.toThrow();
  });

  it('should not crash with legacy data structure', () => {
    // 古いDBデータ形式でもクラッシュしない
  });
});
```

## Code Style

- TypeScript strict mode
- React hooks with `useCallback` for memoization
- Tailwind CSS for styling
- Vitest + React Testing Library for tests

## Common Patterns

### Message Types

新しいメッセージタイプを追加する場合:

1. `packages/shared/src/index.ts` に型定義追加
2. `packages/client/src/components/MessageStream.tsx` にレンダリング追加
3. `packages/server/` で送信処理追加
4. **堅牢性テストを追加**

### WebSocket Messages

クライアント → サーバー: `ClientMessage` 型
サーバー → クライアント: `ServerMessage` 型

新しいメッセージは必ず `packages/shared/` で型定義すること。
