# tm — Tampermonkey CLI

このリポジトリのユーザースクリプトは、専用の CLI ツール `tm` で管理できます。

`tm` は別リポジトリで管理しています。

👉 **[m-mahiro/tempermonkey-cli](https://github.com/m-mahiro/tempermonkey-cli)**

---

## できること

| コマンド | 説明 |
|---------|------|
| `tm sync` | `src/` と Tampermonkey を同期（新規インストール・上書き更新） |
| `tm watch` | ファイルの変更・追加を検知してホットリロード |
| `tm status` | `src/` と Tampermonkey の状態を比較表示 |
| `tm remove <name>` | Tampermonkey からスクリプトを削除 |

## クイックスタート

```bash
# 前提: tampermonkey-mcp のインストール
npm install -g tampermonkey-mcp@latest

# tm のインストール
npm install -g @m-mahiro/tm

# このリポジトリを clone して同期
git clone https://github.com/m-mahiro/userscripts.git
cd userscripts
tm sync
```

詳細なセットアップ手順は [m-mahiro/tempermonkey-cli](https://github.com/m-mahiro/tempermonkey-cli) を参照してください。
