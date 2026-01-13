# Slack Integration Design Document

## Overview

AgentDock に Slack Bot 連携機能を追加し、Slack からの操作で Claude Code セッションを制御できるようにする。

## Goals

1. Slack で @bot メンションすることで AgentDock セッションを開始
2. Slack スレッド内での投稿を AgentDock への入力として認識
3. AgentDock の出力を Slack スレッドにリアルタイム表示
4. Permission Request を Slack のインタラクティブボタンで処理
5. Web UI と Slack の双方向同期

## Non-Goals

- 複数 Workspace 対応（OAuth フローの実装）
- Slack からの作業ディレクトリ指定
- 音声/ビデオ通話連携

## Architecture

```
Slack Workspace
    │ Events API (Socket Mode)
    ▼
packages/slack-bot
    ├── Bolt App (Event Handlers)
    ├── SlackSessionManager (Thread ↔ Session mapping)
    ├── MessageBridge (WebSocket to AgentDock Server)
    ├── MessageFormatter (Output formatting)
    ├── PermissionUI (Block Kit generation)
    └── ProgressIndicator (Processing feedback)
    │
    │ WebSocket
    ▼
packages/server (AgentDock Server)
    │
    ▼
Claude CLI
```

## Design Decisions

### DD-001: Socket Mode vs HTTP Mode

**Decision**: Socket Mode を使用

**Alternatives considered**:
1. HTTP Mode - Events API の Webhook を受ける
2. Socket Mode - Slack からの WebSocket 接続を受ける

**Rationale**:
- Socket Mode はファイアウォール内でも動作する
- パブリック URL 不要で開発・デプロイが簡単
- リアルタイム性が高い

### DD-002: Bot Token vs OAuth

**Decision**: Bot Token を環境変数で設定（シンプル方式）

**Alternatives considered**:
1. 環境変数で Bot Token を設定
2. OAuth フローを実装してマルチ Workspace 対応

**Rationale**:
- 機能面での差はない（必要なスコープは同じ）
- 初期実装としてシンプルな方式を選択
- 将来マルチ Workspace 対応が必要になった場合に OAuth を追加可能

### DD-003: Typing Indicator

**Decision**: メッセージ定期更新 + 絵文字リアクションのハイブリッド

**Alternatives considered**:
1. Legacy RTM API の typing indicator
2. メッセージの定期更新
3. 絵文字リアクション
4. Chat Text Streaming API（新しい API）

**Rationale**:
- 現代の Slack App では RTM API は使用不可
- メッセージ更新は確実だがレート制限に注意が必要
- 絵文字リアクションは即座にフィードバックを提供
- ハイブリッドアプローチで両方のメリットを活用

### DD-004: 作業ディレクトリ

**Decision**: サーバー設定で固定ディレクトリを指定

**Alternatives considered**:
1. チャンネルごとに設定を DB に保存
2. メンション時にパスを指定
3. 固定ディレクトリを環境変数で設定

**Rationale**:
- Slack からパスを指定するのは UX が悪い
- チャンネルごとの設定は複雑度が増す
- 固定設定が最もシンプルで、将来 Web UI から設定可能にする

### DD-005: (aside) マーカー

**Decision**: メッセージ先頭の `(aside)` をチェックして無視

**Rationale**:
- シンプルなテキストマッチで実装可能
- スレッド内での議論（人間同士）を Claude に送らないため
- 正規表現: `/^\s*\(aside\)/i`

## Message Flow

### Slack → AgentDock

1. `app_mention` イベント受信
2. SlackSessionManager でセッション検索/作成
3. MessageBridge 経由で `user_message` 送信
4. ProgressIndicator で処理中表示開始

### AgentDock → Slack

1. `text_output` イベント受信
2. MessageFormatter でフォーマット変換
3. Slack にメッセージ投稿/更新
4. 処理完了時に ProgressIndicator 停止

### Permission Request

1. `permission_request` イベント受信
2. PermissionUI で Block Kit 生成
3. Slack にボタン付きメッセージ投稿
4. `block_actions` イベントでユーザー応答受信
5. MessageBridge 経由で `permission_response` 送信
6. メッセージを更新（結果表示）

## Database Schema

### slack_thread_bindings

Slack スレッドと AgentDock セッションのマッピングを保存。

```sql
CREATE TABLE slack_thread_bindings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  slack_team_id TEXT NOT NULL,
  slack_channel_id TEXT NOT NULL,
  slack_thread_ts TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(slack_team_id, slack_channel_id, slack_thread_ts)
);
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token (xoxb-...) | Yes |
| `SLACK_APP_TOKEN` | App-Level Token for Socket Mode (xapp-...) | Yes |
| `AGENTDOCK_WS_URL` | AgentDock Server WebSocket URL | Yes |
| `SLACK_DEFAULT_WORKING_DIR` | Default working directory for sessions | Yes |

## Slack App Configuration

### Bot Token Scopes

- `app_mentions:read` - メンションの受信
- `chat:write` - メッセージの送信
- `channels:history` - チャンネル履歴の読み取り
- `reactions:write` - リアクションの追加/削除

### Event Subscriptions

- `app_mention` - Bot へのメンション
- `message.channels` - パブリックチャンネルのメッセージ
- `message.groups` - プライベートチャンネルのメッセージ

## Testing Strategy

### Unit Tests

各モジュールの単体テスト:
- MessageBridge: WebSocket 接続のモック
- SlackSessionManager: セッションマッピングロジック
- MessageFormatter: フォーマット変換
- PermissionUI: Block Kit 生成
- ProgressIndicator: 状態管理

### Integration Tests

- Bolt App イベントハンドラのテスト
- MessageBridge ↔ AgentDock Server 連携

### Manual Testing

- 実際の Slack Workspace での動作確認
- Permission Request フロー
- Web UI との同期確認

## Security Considerations

- Slack Signing Secret による署名検証（HTTP Mode の場合）
- Bot Token の環境変数管理
- 作業ディレクトリの制限

## Future Considerations

- OAuth フローによるマルチ Workspace 対応
- チャンネルごとの作業ディレクトリ設定
- Slack App Home でのセッション管理 UI
- スラッシュコマンド対応

## Setup Guide

### Step 1: Slack App を作成

1. https://api.slack.com/apps にアクセス
2. **「Create New App」** → **「From scratch」** を選択
3. 以下を入力:
   - **App Name**: `AgentDock` (または任意の名前)
   - **Workspace**: 使用する Workspace を選択
4. **「Create App」** をクリック

### Step 2: Bot Token Scopes を設定

1. 左メニュー **「OAuth & Permissions」** を選択
2. **「Scopes」** セクションの **「Bot Token Scopes」** に以下を追加:

| Scope | 説明 |
|-------|------|
| `app_mentions:read` | メンションを受信 |
| `chat:write` | メッセージを送信 |
| `channels:history` | パブリックチャンネルの履歴を読む |
| `groups:history` | プライベートチャンネルの履歴を読む |
| `reactions:write` | リアクションを追加/削除 |

### Step 3: Event Subscriptions を設定

1. 左メニュー **「Event Subscriptions」** を選択
2. **「Enable Events」** を **On** に
3. **「Subscribe to bot events」** に以下を追加:
   - `app_mention`
   - `message.channels`
   - `message.groups`

### Step 4: Interactivity を有効化

1. 左メニュー **「Interactivity & Shortcuts」** を選択
2. **「Interactivity」** を **On** に

※ Socket Mode を使用するため Request URL は不要

### Step 5: Socket Mode を有効化

1. 左メニュー **「Socket Mode」** を選択
2. **「Enable Socket Mode」** を **On** に
3. **App-Level Token** を作成:
   - **Token Name**: `socket-mode`
   - **Scopes**: `connections:write` を追加
   - **「Generate」** をクリック
4. 生成された `xapp-...` トークンをコピー → これが `SLACK_APP_TOKEN`

### Step 6: App をインストール

1. 左メニュー **「Install App」** を選択
2. **「Install to Workspace」** をクリック
3. 権限を確認して **「Allow」**
4. **Bot User OAuth Token** (`xoxb-...`) をコピー → これが `SLACK_BOT_TOKEN`

### Step 7: 環境変数を設定

```bash
cd packages/slack-bot
cp .env.example .env
```

`.env` を編集:

```bash
# Slack App から取得したトークン
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_APP_TOKEN=xapp-your-app-token-here

# AgentDock サーバーの WebSocket URL
AGENTDOCK_WS_URL=ws://localhost:3001/ws

# Claude Code が操作するデフォルトの作業ディレクトリ
SLACK_DEFAULT_WORKING_DIR=/path/to/your/project
```

### Step 8: 起動

```bash
# ターミナル1: AgentDock サーバーを起動
pnpm dev

# ターミナル2: Slack Bot を起動
cd packages/slack-bot
pnpm dev
```

### Step 9: 動作確認

1. Slack で Bot を追加したチャンネルを開く
2. `@AgentDock こんにちは` とメンション
3. Bot が応答すれば成功

## Usage

### 基本的な使い方

```
@AgentDock このリポジトリの構造を教えて
```

Bot にメンションすると、新しいスレッドが作成され、そのスレッド内で Claude Code とやり取りできます。

### スレッド内での会話

スレッド内での投稿はすべて Claude への入力として認識されます。

### (aside) マーカー

スレッド内で Claude に送りたくないメッセージ（人間同士の議論など）は、先頭に `(aside)` を付けてください:

```
(aside) ここは Claude に見せなくていい部分
```

### Permission Request

Claude がファイルの書き込みやコマンドの実行などを行う際、許可を求めるボタンが表示されます:

- **Allow**: 今回のみ許可
- **Allow for Session**: このセッション中は同じツールを自動許可
- **Deny**: 拒否

## Troubleshooting

### Bot が応答しない

1. AgentDock サーバー (`pnpm dev`) が起動しているか確認
2. Slack Bot (`cd packages/slack-bot && pnpm dev`) が起動しているか確認
3. `.env` のトークンが正しいか確認
4. Bot がチャンネルに追加されているか確認

### 「Not connected to server」エラー

AgentDock サーバーが起動していないか、`AGENTDOCK_WS_URL` が間違っています。

### Permission Request のボタンが動かない

Slack App の設定で **Interactivity** が有効になっているか確認してください。

## Changelog

### 2026-01-14

- Initial design document created
- Architecture and design decisions documented
- Setup guide added
