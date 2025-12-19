# SearchNG - Bing & Google NG Word Blocker

検索結果から特定のワードを含むサイトや、特定の動画・ニュースなどを非表示にする拡張機能です。
パソコン版の Chromium 系ブラウザ (Google Chrome, Microsoft Edge, Vivaldi, Brave, etc...) に対応しています。

## インストール方法

### Google Chrome / Chromium

1. このリポジトリ (またはフォルダ) をローカルに配置します。
2. Chrome のオムニバーに `chrome://extensions` と入力して開きます。
3. 右上の「デベロッパーモード」をオンにします。
4. 「パッケージ化されていない拡張機能を読み込む」をクリックします。
5. `manifest.json` が含まれるフォルダ (`SearchNG`) を選択します。

### Microsoft Edge

1. このリポジトリ (またはフォルダ) をローカルに配置します。
2. Edge のアドレスバーに `edge://extensions` と入力して開きます。
3. 左メニューの「開発者モード」をオンにします。
4. 「展開して読み込み」をクリックします。
5. `manifest.json` が含まれるフォルダ (`SearchNG`) を選択します。

## 機能

- **Bing / Google 検索フィルター**: 検索結果から指定した NG ワードを含むエントリを非表示にします。
- **サイト別設定**: Bing のみ、Google のみ有効化といった設定が可能です。
- **NG ワード管理**: コンテキストメニューから選択テキストを NG ワードに追加できます。
- **正規表現対応**: 高度なフィルタリングが可能です。
