# Renovate PR 管理 Skills

## 概要

Renovate が作成した依存関係更新 PR の確認、修正、マージを効率的に行うための手順。

## 1. PR の一覧と分類

### PR 一覧の取得

```bash
gh pr list --author app/renovate --json number,title,mergeStateStatus,statusCheckRollup
```

### 分類基準

| mergeStateStatus | 意味 | 対応 |
|-----------------|------|------|
| CLEAN | CI パス、マージ可能 | そのままマージ可能 |
| UNSTABLE | CI 失敗 | 修正が必要 |
| DIRTY | Conflict あり | rebase が必要 |

## 2. CI 失敗の調査

### 失敗ログの取得

```bash
# PR の CI ステータス確認
gh pr checks <PR番号>

# 失敗したワークフローのログ取得
gh run view <run_id> --log-failed
```

### よくある失敗パターン

| パッケージ種別 | 失敗パターン | 対応方法 |
|--------------|-------------|---------|
| 型定義 (@types/*) | 型エラー | 通常はコード修正不要、依存更新で解決 |
| Linter プラグイン | Lint エラー | 新ルールに合わせてコード修正 |
| テストライブラリ | テスト失敗 | テストまたは本体コードを修正 |
| ランタイムライブラリ | ビルドエラー/型エラー | API 変更に合わせてコード修正 |

## 3. 修正ワークフロー

### 基本手順

```bash
# 1. PR のブランチをチェックアウト
gh pr checkout <PR番号>

# 2. ローカルで lint/test を実行（重要！CI を待たずにエラーを発見）
pnpm run lint
pnpm run typecheck
pnpm run test

# 3. 修正をコミット（Co-Authored-By は使用中のモデルに応じて設定）
git add -A
git commit -m "fix: <修正内容>"

# 4. push して CI を確認
git push
gh pr checks <PR番号> --watch
```

### 注意点

- **必ずローカルで lint/test を実行してから push する**
- CI を何度も回すと時間がかかる
- エラーメッセージを見て、根本原因を理解してから修正する

## 4. Conflict 解決

### rebase の手順

```bash
# 1. 最新の main を fetch（重要！これをしないと古い状態に rebase してしまう）
git fetch origin main

# 2. rebase 実行
git rebase origin/main

# 3. Conflict があれば解決
# - コードの conflict: 手動で解決
# - lock ファイルの conflict: 再生成で解決（下記参照）

# 4. force push
git push --force-with-lease
```

### lock ファイルの Conflict 解決

```bash
# theirs (main側) を採用してから再生成
git checkout --theirs pnpm-lock.yaml  # または package-lock.json, yarn.lock
pnpm install  # または npm install, yarn install
git add pnpm-lock.yaml
git rebase --continue
```

### よくある失敗: main を fetch せずに rebase

```bash
# NG: ローカルの古い main に rebase してしまう
git rebase main

# OK: リモートの最新 main に rebase
git fetch origin main
git rebase origin/main
```

main を fetch せずに rebase すると、リモートとの差分が解消されず、GitHub 上で依然として Conflict と表示される。

## 5. マージ戦略

### 推奨順序

1. **patch/minor 更新を先にマージ**: 影響が小さい
2. **major 更新は個別に確認**: breaking change がある可能性
3. **マージ後は他の PR の conflict を確認**: rebase が必要になることがある

### マージコマンド

```bash
gh pr merge <PR番号> --squash --delete-branch
```

## 6. monorepo 対応

### Renovate 設定 (renovate.json)

```json
{
  "packageRules": [
    {
      "matchFileNames": ["<サブプロジェクト>/**"],
      "commitMessagePrefix": "<サブプロジェクト>: "
    }
  ]
}
```

### ブランチ命名

monorepo では Renovate のブランチ名がサブプロジェクトを示さないことがある。
PR タイトルやコミットメッセージでサブプロジェクトを識別できるように設定する。

## 7. トラブルシューティング

### CI が開始されない

- force push 直後は GitHub が認識するまで少し待つ
- `gh pr view <PR番号> --json statusCheckRollup` で確認

### 複数の PR で同じファイルを修正する必要がある

- 1つずつ順番にマージする
- マージ後に残りの PR を rebase する

## チェックリスト

- [ ] PR 一覧を確認し、CI ステータスで分類
- [ ] CI パス済みの PR をマージ（影響の小さいものから）
- [ ] CI 失敗の PR のログを確認
- [ ] **ローカルで lint/test を実行しながら修正**
- [ ] 修正をコミット、push
- [ ] CI パスを確認してマージ
- [ ] 残りの PR で conflict が発生していないか確認
- [ ] conflict がある場合は **`git fetch origin main` してから** rebase