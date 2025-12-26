# SearchNG - Bing & Google Word Filter

Google/Bing の検索結果に NG ワードを設定し、検索結果から除外するブラウザ拡張機能です。

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

### Firefox

お使いの Firefox ブラウザで[ストアページ](https://addons.mozilla.org/ja/firefox/addon/searchng/)を開き、「Firefox へ追加」ボタンを押して導入してください。

## 機能

- **Bing / Google 検索フィルター**: 検索結果から指定した NG ワードを含むエントリを非表示にします。
- **NG ワード管理**: NG ワードは、オプション画面のテキストエリアを編集するか、検索画面で選択テキストを右クリックで登録できます。
- **正規表現対応**: 高度なフィルタリングが可能です。
