# フロントエンド開発

React 19 + TypeScript + Vite 7。Node.jsは20.19以上の20系、または22.12以上を使います。

```bash
npm ci
npm run dev
```

別ターミナルでリポジトリルートの仮想環境を有効にし、`python app.py` を起動します。開発画面はlocalhost:5173、APIはlocalhost:8000へプロキシされます。Vite開発サーバーを外部ネットワークに公開しないでください。

```bash
npm run lint
npm run build
npm audit
```

ビルドは `../dist/` を置き換えます。ソース変更・依存ロック・配信するdistを同時に更新してください。通常起動はFastAPIがdistを配信するためNode.js不要です。

アプリの制限、外部送信、課金、データ管理は[ルートREADME](../README.md)を参照してください。
